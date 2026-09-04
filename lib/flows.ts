// Implementação dos "fluxos" (topologias de execução) que o BFA roteia.
// Cada fluxo é um async generator: quando precisa de aprovação humana
// (Sessão & Permissões / deny-first), ele faz `yield` e o orquestrador
// pausa a execução até o gestor decidir na UI — sem perder o estado.
// As etapas deterministas (Grafo de Estados) rodam via LangGraph em lib/graphs.
import { callTool } from './tools';
import { readResource } from './resources';
import { callOpenRouter, callOllama, LOCAL_MODELS } from './llm';
import { store } from './data';
import { PROMPTS } from './prompts';
import { runCrossUtmGraph } from './graphs/crossUtmGraph';
import { runDiagnosticoGraph } from './graphs/diagnosticoGraph';
import { runPautaGraph } from './graphs/pautaGraph';
import { runCreativeGraph } from './graphs/creativeGraph';
import { runBudgetGraph } from './graphs/budgetGraph';
import type { AdRow, FlowCtx, FlowGenerator, FlowInput, TraceEvent, ActivityType, SafeLlmArgs, LlmResult } from './types';

function trace(ctx: FlowCtx, paradigm: string, label: string, detail?: string | null, activityTypeOverride?: ActivityType): void {
  const activityType: ActivityType = activityTypeOverride || (paradigm.includes('Sessão')
    ? 'tool'
    : paradigm.includes('Grafo') || paradigm.includes('Supercérebro') || paradigm.includes('App') || paradigm.includes('Dados') || paradigm.includes('Contexto') || paradigm.includes('criativos')
      ? 'resource'
      : 'reasoning');
  const event: TraceEvent = { paradigm, label, detail: detail ?? null, activityType, at: new Date().toISOString() };
  ctx.trace.push(event);
  ctx.onTrace?.(event);
}
function block(ctx: FlowCtx, b: any): void {
  ctx.blocks.push(b);
}

// Risca um passo do plano (todo list) exposto ao gestor no início do turno.
// Como `ctx.plan` e o bloco `{type:'plan'}` apontam para os mesmos objetos,
// marcar `status: 'done'` aqui já atualiza o registro final da conversa.
function planStep(ctx: FlowCtx, id: string): void {
  const step = ctx.plan?.find((s) => s.id === id);
  if (!step || step.status === 'done') return;
  step.status = 'done';
  const event: TraceEvent = {
    paradigm: step.paradigm,
    label: `✔ ${step.label}`,
    detail: 'passo do plano concluído',
    activityType: 'plan',
    plan: ctx.plan,
    at: new Date().toISOString(),
  };
  ctx.trace.push(event);
  ctx.onTrace?.(event);
}

// Chamada de LLM "best effort" com dois provedores: OpenRouter quando há
// apiKey (como o avaliador usaria) e Ollama local como fallback de dev/teste
// (sem key, sem custo) — só cai em texto determinístico se os dois falharem.
// `tier` espelha o Reasoning Sandwich: 'frontier' (modelo de fronteira
// escolhido na UI / gemma3:4b local) ou 'fast' (modelo pequeno / qwen2.5:3b).
async function safeLlm(ctx: FlowCtx, { apiKey, model, tier = 'frontier', system, user, maxTokens }: SafeLlmArgs): Promise<LlmResult> {
  // Memória de curto/longo prazo desta sessão (lib/memory.ts) injetada em toda
  // chamada de LLM, para o modelo não "se perder" entre turnos de um pedido composto.
  const systemWithMemory = ctx.memory ? `${system}\n\n${ctx.memory}` : system;
  const messages = [
    { role: 'system' as const, content: systemWithMemory },
    { role: 'user' as const, content: user },
  ];

  if (apiKey) {
    try {
      const text = await callOpenRouter({
        apiKey,
        model: tier === 'fast' ? 'meta-llama/llama-3.1-8b-instruct' : model,
        maxTokens,
        messages,
      });
      return { text, offline: false, provider: `openrouter:${tier === 'fast' ? 'llama-3.1-8b-instruct' : model}` };
    } catch (e) {
      // segue para o fallback local em vez de desistir (ex.: key inválida/sem crédito)
    }
  }

  try {
    const localModel = LOCAL_MODELS[tier];
    const text = await callOllama({ model: localModel, messages, maxTokens });
    return { text, offline: false, provider: `ollama:${localModel}` };
  } catch (e: any) {
    return { text: null, offline: true, error: e.message };
  }
}

// Cruza o cruzamento de CPL/CAC com a recomendação do App de Análise de
// Criativos para decidir qual anúncio o harness propõe pausar.
function pickAdToPause(rows: AdRow[]): AdRow {
  const ranking = readResource('creative_ranking').ranking;
  const flagged = ranking.find((r: any) => r.recomendacao === 'pausar');
  if (flagged) {
    const row = rows.find((r) => r.ad_id === flagged.ad_id);
    if (row) return { ...row, motivo: flagged.motivo };
  }
  const active = rows.filter((r) => r.status === 'active');
  const worst = (active.length ? active : rows).slice().sort((a, b) => (b.cac ?? 0) - (a.cac ?? 0))[0];
  return { ...worst, motivo: 'maior CAC entre os criativos ativos' };
}

// --- RLM simulado com recursão real: chunk + sumarização recursiva ---
// size maior => menos chunks => menos subchamadas sequenciais. Importante em
// modo local (Ollama/CPU): cada subchamada custa ~15-40s, então poucos chunks
// mantêm a demo responsiva sem perder o padrão de recursão real do RLM.
function chunkText(text: string, size = 2200): string[] {
  const paragraphs = text.split(/\n(?=== )/g).filter(Boolean);
  const chunks: string[] = [];
  let buf = '';
  for (const p of paragraphs) {
    if ((buf + p).length > size && buf) {
      chunks.push(buf);
      buf = p;
    } else {
      buf += (buf ? '\n' : '') + p;
    }
  }
  if (buf) chunks.push(buf);
  return chunks;
}

async function rlmSummarizeManual(ctx: FlowCtx, { apiKey, model }: { apiKey?: string; model?: string }): Promise<string[]> {
  const chunks = chunkText(store.manualMarca);
  trace(ctx, 'RLM (contexto denso, recursivo)', `Disparando ${chunks.length} subchamadas de sumarização em paralelo (blocos independentes)`, 'nenhum bloco depende do resultado de outro');
  // Blocos são independentes entre si: nenhuma subchamada precisa esperar o
  // resultado da anterior, então rodam em paralelo em vez de sequencialmente.
  const results = await Promise.all(
    chunks.map((chunk, index) =>
      safeLlm(ctx, {
        apiKey,
        model,
        tier: 'fast', // modelo pequeno para o trabalho intermediário (Reasoning Sandwich)
        system: PROMPTS.brandChunkSummary.system,
        user: chunk,
        maxTokens: 220,
      }).then(({ text, offline, provider }) => {
        trace(ctx, 'RLM (contexto denso, recursivo)', `Subchamada de sumarização — bloco ${index + 1}/${chunks.length}`, offline ? 'offline: usando resumo determinístico do bloco' : provider);
        return offline ? `[bloco ${index + 1} — resumo indisponível offline] ${chunk.slice(0, 160)}...` : (text as string);
      })
    )
  );
  return results;
}

async function rlmGenerateCopies(ctx: FlowCtx, { apiKey, model, adContext }: { apiKey?: string; model?: string; adContext: Record<string, unknown> }): Promise<string> {
  const partials = await rlmSummarizeManual(ctx, { apiKey, model });
  const mapa = readResource('solution_map').mapa;
  const { text, offline, provider } = await safeLlm(ctx, {
    apiKey,
    model,
    system: PROMPTS.copyGeneration.system,
    user: `Regras de marca (resumo recursivo do manual):\n${partials.join('\n')}\n\nMapa de solução: promessa="${mapa.promessa}"; tom="${mapa.tom_de_voz}"; proibido=${JSON.stringify(mapa.nao_pode_falar)}.\n\nContexto do criativo a substituir: ${JSON.stringify(adContext)}.\nGere as 3 variações de copy agora.`,
    maxTokens: 500,
  });
  trace(ctx, 'RLM (contexto denso, recursivo)', 'Síntese final das variações de copy', offline ? 'offline: sem OpenRouter/Ollama disponível' : provider);
  return offline
    ? '### Variação 1\n*(offline — cole uma OPENROUTER_API_KEY ou rode o Ollama local para gerar copies reais)*\n\n### Variação 2\n*(offline)*\n\n### Variação 3\n*(offline)*'
    : (text as string);
}

// ============ FLOWS ============

async function* fullPipelineFlow(ctx: FlowCtx, { message, apiKey, model }: FlowInput): FlowGenerator {
  trace(ctx, 'ReAct (planejamento)', 'Planner Agent interpreta o pedido composto', 'Claude/GPT de fronteira (Reasoning Sandwich)');
  const plan = await safeLlm(ctx, {
    apiKey,
    model,
    system: PROMPTS.pipelinePlan.system,
    user: message,
    maxTokens: 220,
  });
  trace(ctx, 'Plano de execução', 'Plano preparado para esta solicitação', plan.text || 'Cruzar dados, calcular indicadores, revisar o criativo e preparar alternativas.');
  planStep(ctx, 'plan');

  trace(ctx, 'Grafo de Estados (LangGraph)', 'Executando grafo de cruzamento (Meta Ads × CRM → ROI)', 'nós determinísticos, sem LLM');
  const { rows } = await runCrossUtmGraph();
  block(ctx, { type: 'table', key: 'cpl_cac_table', title: 'CPL/CAC real por anúncio (Meta Ads × CRM via utm_content)', columns: ['ad_name', 'campaign_name', 'spend', 'leads', 'vendas', 'cpl', 'cac', 'status'], rows });
  block(ctx, { type: 'chart', key: 'cpl_chart', title: 'Custo por Lead (CPL) por anúncio', points: rows.map((r) => ({ label: r.ad_name, value: r.cpl ?? 0 })) });
  planStep(ctx, 'cross');

  trace(ctx, 'Cálculo verificado', 'Calculando CPL e CAC por anúncio', 'Os indicadores foram calculados a partir dos dados consultados.');
  block(ctx, {
    type: 'code',
    key: 'sandbox_script',
    title: 'Script executado pelo Executor Agent (sandbox simulado)',
    language: 'python',
    content:
      "leads = crm.get_leads()\nads = meta.list_ads()\ndf = pd.merge(ads, leads, left_on='utm_content', right_on='utm_content')\ncpl = df.groupby('ad_id').spend.first() / df.groupby('ad_id').lead_id.count()\n# resultado gravado em parquet temporário -> memory pointer para a UI",
  });
  planStep(ctx, 'anomaly');

  const worst = pickAdToPause(rows);
  trace(ctx, 'Sessão & Permissões (deny-first)', `Detectado criativo saturado/ineficaz: ${worst.ad_name} (CAC R$ ${worst.cac}, ${worst.motivo})`, 'ferramenta mutável pause_ad interceptada, aguardando aprovação humana');

  const decision = yield {
    type: 'approval',
    tool: 'pause_ad',
    args: { ad_id: worst.ad_id },
    description: `Pausar o criativo "${worst.ad_name}"? ${worst.motivo}`,
  };

  if (decision !== 'approve') {
    trace(ctx, 'Sessão & Permissões (deny-first)', 'Gestor rejeitou a pausa', 'pipeline segue sem mutação de campanha');
    planStep(ctx, 'approval');
    block(ctx, { type: 'approval_result', decision: 'rejected', ad_name: worst.ad_name });
    return `Ok, mantive o criativo **${worst.ad_name}** ativo — nenhuma alteração foi feita nas campanhas. Segue abaixo o cruzamento de CPL/CAC para você decidir com mais calma.`;
  }

  const paused = callTool('pause_ad', { ad_id: worst.ad_id });
  trace(ctx, 'Sessão & Permissões (deny-first)', 'Aprovação concedida — pause_ad executado', `ad_id=${worst.ad_id}`);
  planStep(ctx, 'approval');
  block(ctx, { type: 'approval_result', decision: 'approved', ad_name: worst.ad_name, result: paused });

  const { rows: updatedRows } = await runCrossUtmGraph();
  block(ctx, { type: 'table', key: 'cpl_cac_table', title: 'CPL/CAC real por anúncio (Meta Ads × CRM via utm_content)', columns: ['ad_name', 'campaign_name', 'spend', 'leads', 'vendas', 'cpl', 'cac', 'status'], rows: updatedRows });

  const copies = await rlmGenerateCopies(ctx, { apiKey, model, adContext: { pausado: worst.ad_name, campanha: worst.campaign_name } });
  planStep(ctx, 'copy');
  block(ctx, { type: 'text', title: `Variações de copy para substituir "${worst.ad_name}"`, content: copies });

  return `Pronto: cruzei Meta Ads × CRM por \`utm_content\`, pausei **${worst.ad_name}** (CPL R$ ${worst.cpl}) após sua aprovação e gerei 3 variações de copy. Os resultados estão disponíveis nos artefatos desta resposta.`;
}

async function* pauseOnlyFlow(ctx: FlowCtx, { message, apiKey, model }: FlowInput): FlowGenerator {
  const { rows } = await runCrossUtmGraph();
  const mentioned = rows.find((r) => message.toLowerCase().includes(r.ad_name.toLowerCase()) || message.toLowerCase().includes(r.ad_id));
  const target = mentioned || pickAdToPause(rows);

  planStep(ctx, 'target');
  trace(ctx, 'Sessão & Permissões (deny-first)', `Comando de alta criticidade detectado: pause_ad(${target.ad_id})`, 'aguardando aprovação humana explícita');
  const decision = yield {
    type: 'approval',
    tool: 'pause_ad',
    args: { ad_id: target.ad_id },
    description: `Pausar o criativo "${target.ad_name}"?`,
  };

  planStep(ctx, 'approval');
  if (decision !== 'approve') {
    block(ctx, { type: 'approval_result', decision: 'rejected', ad_name: target.ad_name });
    return `Não pausei **${target.ad_name}** — aprovação negada.`;
  }
  const paused = callTool('pause_ad', { ad_id: target.ad_id });
  block(ctx, { type: 'approval_result', decision: 'approved', ad_name: target.ad_name, result: paused });

  // Reemite o mesmo artefato versionado (mesma `key`) já com o status atualizado,
  // em vez de deixar a UI com uma tabela desatualizada até o próximo cruzamento.
  const { rows: refreshedRows } = await runCrossUtmGraph();
  block(ctx, { type: 'table', key: 'cpl_cac_table', title: 'CPL/CAC real por anúncio', columns: ['ad_name', 'campaign_name', 'spend', 'leads', 'vendas', 'cpl', 'cac', 'status'], rows: refreshedRows });

  return `Pausei **${target.ad_name}** após sua aprovação.`;
}

async function* crossUtmFlow(ctx: FlowCtx, { message, apiKey, model }: FlowInput): FlowGenerator {
  trace(ctx, 'Grafo de Estados (LangGraph)', 'Executando grafo de cruzamento (Meta Ads × CRM → ROI)', 'nós determinísticos, sem LLM');
  const { rows, roi } = await runCrossUtmGraph();
  block(ctx, { type: 'table', key: 'cpl_cac_table', title: 'CPL/CAC real por anúncio', columns: ['ad_name', 'campaign_name', 'spend', 'leads', 'vendas', 'cpl', 'cac', 'status'], rows });
  block(ctx, { type: 'chart', key: 'cpl_chart', title: 'Custo por Lead (CPL) por anúncio', points: rows.map((r) => ({ label: r.ad_name, value: r.cpl ?? 0 })) });

  trace(ctx, 'Cálculo verificado', 'Calculando CPL e CAC por anúncio', 'Os indicadores foram calculados a partir dos dados consultados.');
  block(ctx, {
    type: 'code',
    key: 'sandbox_script',
    title: 'Script do Executor Agent (sandbox simulado)',
    language: 'python',
    content: "df = pd.merge(meta.list_ads(), crm.get_leads(), on='utm_content')\ncpl = df.groupby('ad_id').spend.first() / df.groupby('ad_id').lead_id.count()",
  });
  planStep(ctx, 'cross');

  block(ctx, { type: 'table', key: 'roi_table', title: 'ROI estimado por anúncio (receita/spend)', columns: ['ad_name', 'roi'], rows: roi as any });
  planStep(ctx, 'roi');

  const worst = rows[0];
  const { text, offline, provider } = await safeLlm(ctx, {
    apiKey,
    model,
    system: PROMPTS.mediaAnalysis.system,
    user: JSON.stringify(rows),
    maxTokens: 260,
  });
  trace(ctx, 'ReAct (síntese final)', 'Reasoning Sandwich compõe a resposta final', offline ? 'offline' : provider);
  planStep(ctx, 'synth');
  return text || `O anúncio mais caro é **${worst.ad_name}** com CPL de R$ ${worst.cpl}, bem acima dos demais. Recomendo revisar ou pausar esse criativo (cole sua OPENROUTER_API_KEY ou rode o Ollama local para uma análise textual completa).`;
}

async function* diagnosticoFlow(ctx: FlowCtx, { message, apiKey, model }: FlowInput): FlowGenerator {
  trace(ctx, 'Grafo de Estados (LangGraph, paralelo)', 'Executando grafo de diagnóstico (fan-out: métricas + conversas + linha do tempo)', 'três nós rodam no mesmo superstep, sem depender um do outro');
  const { rows, conversations: conv, timeline, inconsistentLeads, anomalies } = (await runDiagnosticoGraph()) as any;
  planStep(ctx, 'data');
  planStep(ctx, 'anomaly');

  block(ctx, { type: 'table', key: 'cpl_cac_table', title: 'CPL/CAC por anúncio', columns: ['ad_name', 'campaign_name', 'spend', 'leads', 'vendas', 'cpl', 'cac', 'status'], rows });
  block(ctx, { type: 'table', key: 'inconsistent_leads_table', title: 'Leads com origem declarada inconsistente com o UTM', columns: ['lead_id', 'utm_content', 'utm_source', 'origem_declarada', 'status'], rows: inconsistentLeads });
  if (anomalies?.length) {
    block(ctx, { type: 'table', key: 'cac_anomalies_table', title: 'Anúncios com CAC anômalo (> 2x a mediana)', columns: ['ad_name', 'cac', 'median', 'threshold'], rows: anomalies });
  }

  const summary = {
    pior_cpl: rows[0],
    leads_origem_inconsistente: inconsistentLeads.length,
    anomalias_cac: anomalies.length,
    mencoes_cpa: (conv as any[]).map((c) => c.mensagem),
    eventos_recentes: (timeline as any[]).map((e) => e.title),
  };

  const { text, offline, provider } = await safeLlm(ctx, {
    apiKey,
    model,
    system: PROMPTS.accountDiagnosis.system,
    user: JSON.stringify(summary),
    maxTokens: 400,
  });
  trace(ctx, 'ReAct (síntese final)', 'Diagnóstico final composto pelo Reasoning Sandwich', offline ? 'offline' : provider);
  planStep(ctx, 'synth');
  return (
    text ||
    `Diagnóstico (modo offline, sem LLM):\n- Criativo mais caro: ${rows[0].ad_name} (CPL R$ ${rows[0].cpl}).\n- ${inconsistentLeads.length} leads com origem declarada inconsistente com o UTM real (possível atribuição incorreta pelo time de atendimento).\n- ${anomalies.length} anúncio(s) com CAC acima de 2x a mediana da conta.\nCole uma OPENROUTER_API_KEY ou rode o Ollama local para um diagnóstico narrativo completo.`
  );
}

async function* pautaFlow(ctx: FlowCtx, { message, apiKey, model }: FlowInput): FlowGenerator {
  trace(ctx, 'Grafo de Estados (LangGraph, paralelo)', 'Executando grafo de pauta (fan-out: linha do tempo + conversas + ranking)', 'três nós rodam no mesmo superstep, sem depender um do outro');
  const { timeline, conversations: conv, ranking } = await runPautaGraph();
  planStep(ctx, 'data');

  block(ctx, { type: 'text', key: 'meeting_timeline', title: 'Eventos recentes (linha do tempo)', content: timeline.map((e: any) => `- **${e.title}** — ${e.summary}`).join('\n') });
  block(ctx, { type: 'text', key: 'meeting_conversations', title: 'Últimas conversas (reunião/WhatsApp)', content: conv.map((c: any) => `- [${c.canal}] ${c.de}: ${c.mensagem}`).join('\n') });

  const { text, offline, provider } = await safeLlm(ctx, {
    apiKey,
    model,
    system: PROMPTS.meetingAgenda.system,
    user: JSON.stringify({ timeline, conv, ranking }),
    maxTokens: 350,
  });
  trace(ctx, 'ReAct (síntese final)', 'Pauta composta pelo Reasoning Sandwich', offline ? 'offline' : provider);
  planStep(ctx, 'synth');
  return (
    text ||
    `Pauta sugerida (offline):\n1. Aprovação pendente da peça "Combo Casal Depoimento v2" (6 dias parada).\n2. CPA da linha Whey — retomar ponto da call anterior.\n3. Performance geral Namorados/Omega3/Whey.\n4. Criativo saturado (Omega3_Depoimento_v2) — decidir pausa/refresh.`
  );
}

async function* creativeFlow(ctx: FlowCtx, { message, apiKey, model }: FlowInput): FlowGenerator {
  trace(ctx, 'Grafo de Estados (LangGraph)', 'Executando grafo de ranking de criativos', 'nó determinístico de pontuação, sem LLM');
  const { ranking } = await runCreativeGraph();
  planStep(ctx, 'ranking');
  block(ctx, { type: 'table', key: 'creative_ranking_table', title: 'Ranking de criativos (App de Análise de Criativos)', columns: ['ad_name', 'nota_hook', 'nota_cta', 'score', 'palco', 'recomendacao'], rows: ranking });

  const toReplace = ranking.find((r: any) => r.recomendacao === 'pausar') || ranking[ranking.length - 1];
  const copies = await rlmGenerateCopies(ctx, { apiKey, model, adContext: { ad: toReplace.ad_name, motivo: toReplace.motivo } });
  planStep(ctx, 'copy');
  block(ctx, { type: 'text', key: 'copy_variations', title: `Variações de copy para "${toReplace.ad_name}"`, content: copies });

  return `O App de Análise de Criativos recomenda **${toReplace.recomendacao}** para **${toReplace.ad_name}** (${toReplace.motivo}). Gerei 3 variações de copy com base no manual de marca via RLM — veja abaixo.`;
}

async function* budgetQueryFlow(ctx: FlowCtx, { message, apiKey, model }: FlowInput): FlowGenerator {
  trace(ctx, 'Grafo de Estados (LangGraph)', 'Executando grafo de identificação de orçamento líder', 'nó determinístico, sem LLM');
  const { leader } = await runBudgetGraph();
  planStep(ctx, 'budget');
  if (!leader) return 'Não encontrei campanhas cadastradas para comparar orçamento.';
  block(ctx, { type: 'table', key: 'budget_leader_table', title: 'Orçamento diário por campanha', columns: ['campaign_name', 'budget_diario'], rows: [{ campaign_name: leader.campaign_name, budget_diario: leader.budget_diario }] });

  const { text, offline, provider } = await safeLlm(ctx, {
    apiKey,
    model,
    system: PROMPTS.budgetAnalysis.system,
    user: JSON.stringify({ campanha_lider: leader.campaign_name, orcamento_diario: leader.budget_diario }),
    maxTokens: 150,
  });
  trace(ctx, 'ReAct (síntese final)', 'Resposta composta pelo Reasoning Sandwich', offline ? 'offline' : provider);
  planStep(ctx, 'synth');
  return text || `A campanha com maior orçamento diário é **${leader.campaign_name}**, com R$ ${leader.budget_diario}/dia.`;
}

async function* generalFlow(ctx: FlowCtx, { message, apiKey, model }: FlowInput): FlowGenerator {
  trace(ctx, 'ReAct (resposta direta)', 'Sem padrão de rotina detectado, respondendo via loop conversacional simples', '');
  const { text, offline, provider } = await safeLlm(ctx, {
    apiKey,
    model,
    system: PROMPTS.directResponse.system,
    user: message,
    maxTokens: 300,
  });
  planStep(ctx, 'intent');
  if (!offline) trace(ctx, 'ReAct (resposta direta)', 'Resposta gerada', provider);
  return text || 'Modo offline: cole sua OPENROUTER_API_KEY (ou rode o Ollama local com qwen2.5:3b/gemma3:4b) para conversar livremente. Enquanto isso, tente pedidos como "cruzar CPL", "diagnóstico da conta", "pauta da reunião" ou "pausar o criativo X" para ver as ferramentas mockadas em ação.';
}

const FLOWS: Record<string, (ctx: FlowCtx, input: FlowInput) => FlowGenerator> = {
  full_pipeline: fullPipelineFlow,
  pause_only: pauseOnlyFlow,
  cross_utm: crossUtmFlow,
  diagnostico: diagnosticoFlow,
  pauta_reuniao: pautaFlow,
  creative_flow: creativeFlow,
  budget_query: budgetQueryFlow,
  general: generalFlow,
};

export { FLOWS };
