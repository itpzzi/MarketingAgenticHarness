// Implementação dos "fluxos" (topologias de execução) que o BFA roteia.
// Cada fluxo é um async generator: quando precisa de aprovação humana
// (Sessão & Permissões / deny-first), ele faz `yield` e o orquestrador
// pausa a execução até o gestor decidir na UI — sem perder o estado.
const { callTool } = require('./tools');
const { callOpenRouter, callOllama, LOCAL_MODELS } = require('./llm');
const { store } = require('./data');

function trace(ctx, paradigm, label, detail) {
  ctx.trace.push({ paradigm, label, detail, at: new Date().toISOString() });
}
function block(ctx, b) {
  ctx.blocks.push(b);
}

// Chamada de LLM "best effort" com dois provedores: OpenRouter quando há
// apiKey (como o avaliador usaria) e Ollama local como fallback de dev/teste
// (sem key, sem custo) — só cai em texto determinístico se os dois falharem.
// `tier` espelha o Reasoning Sandwich: 'frontier' (modelo de fronteira
// escolhido na UI / gemma3:4b local) ou 'fast' (modelo pequeno / qwen2.5:3b).
async function safeLlm(ctx, { apiKey, model, tier = 'frontier', system, user, maxTokens }) {
  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: user },
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
  } catch (e) {
    return { text: null, offline: true, error: e.message };
  }
}

// --- Grafo de Estados determinístico: cruzamento UTM (ad x leads) ---
function crossAdsAndLeads() {
  const ads = callTool('list_ads').ads;
  const rows = ads.map((ad) => {
    const leads = callTool('get_leads', { utm_content: ad.utm_content }).leads;
    const vendas = leads.filter((l) => l.status === 'venda');
    const receita = vendas.reduce((s, l) => s + l.value_brl, 0);
    const cpl = leads.length ? +(ad.spend / leads.length).toFixed(2) : null;
    const cac = vendas.length ? +(ad.spend / vendas.length).toFixed(2) : null;
    return {
      ad_id: ad.ad_id,
      ad_name: ad.ad_name,
      campaign_name: ad.campaign_name,
      status: ad.status,
      spend: ad.spend,
      leads: leads.length,
      vendas: vendas.length,
      receita,
      cpl,
      cac,
    };
  });
  return rows.sort((a, b) => (b.cpl ?? 0) - (a.cpl ?? 0));
}

// Cruza o cruzamento de CPL/CAC com a recomendação do App de Análise de
// Criativos para decidir qual anúncio o harness propõe pausar.
function pickAdToPause(rows) {
  const ranking = callTool('run_app_analise_criativos').ranking;
  const flagged = ranking.find((r) => r.recomendacao === 'pausar');
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
function chunkText(text, size = 2200) {
  const paragraphs = text.split(/\n(?=== )/g).filter(Boolean);
  const chunks = [];
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

async function rlmSummarizeManual(ctx, { apiKey, model }) {
  const chunks = chunkText(store.manualMarca);
  const partials = [];
  for (let i = 0; i < chunks.length; i++) {
    const { text, offline, provider } = await safeLlm(ctx, {
      apiKey,
      model,
      tier: 'fast', // modelo pequeno para o trabalho intermediário (Reasoning Sandwich)
      system: 'Resuma o trecho de manual de marca abaixo em até 3 bullets objetivos, mantendo regras de "não pode falar" se houver.',
      user: chunks[i],
      maxTokens: 220,
    });
    trace(ctx, 'RLM (contexto denso, recursivo)', `Subchamada de sumarização — bloco ${i + 1}/${chunks.length}`, offline ? 'offline: usando resumo determinístico do bloco' : provider);
    partials.push(offline ? `[bloco ${i + 1} — resumo indisponível offline] ${chunks[i].slice(0, 160)}...` : text);
  }
  return partials;
}

async function rlmGenerateCopies(ctx, { apiKey, model, adContext }) {
  const partials = await rlmSummarizeManual(ctx, { apiKey, model });
  const mapa = callTool('get_mapa_solucao').mapa;
  const { text, offline, provider } = await safeLlm(ctx, {
    apiKey,
    model,
    system:
      'Você é um redator publicitário sênior. Gere exatamente 3 variações curtas de copy (headline + 1 linha de corpo + CTA) respeitando rigorosamente as regras de marca fornecidas. Responda em markdown com "### Variação N".',
    user: `Regras de marca (resumo recursivo do manual):\n${partials.join('\n')}\n\nMapa de solução: promessa="${mapa.promessa}"; tom="${mapa.tom_de_voz}"; proibido=${JSON.stringify(mapa.nao_pode_falar)}.\n\nContexto do criativo a substituir: ${JSON.stringify(adContext)}.\nGere as 3 variações de copy agora.`,
    maxTokens: 500,
  });
  trace(ctx, 'RLM (contexto denso, recursivo)', 'Síntese final das variações de copy', offline ? 'offline: sem OpenRouter/Ollama disponível' : provider);
  return offline
    ? '### Variação 1\n*(offline — cole uma OPENROUTER_API_KEY ou rode o Ollama local para gerar copies reais)*\n\n### Variação 2\n*(offline)*\n\n### Variação 3\n*(offline)*'
    : text;
}

// ============ FLOWS ============

async function* fullPipelineFlow(ctx, { message, apiKey, model }) {
  trace(ctx, 'ReAct (planejamento)', 'Planner Agent interpreta o pedido composto', 'Claude/GPT de fronteira (Reasoning Sandwich)');
  const plan = await safeLlm(ctx, {
    apiKey,
    model,
    system: 'Você é o Planner Agent de um harness de marketing. Dado o pedido do gestor, escreva um plano de 3-5 bullets curtos (sem markdown de título) descrevendo as etapas que serão executadas.',
    user: message,
    maxTokens: 220,
  });
  block(ctx, { type: 'text', title: 'Plano (todo.md / PLAN.md simulado)', content: plan.text || '- Cruzar spend x leads por utm_content\n- Calcular CPL/CAC por anúncio\n- Identificar criativos acima do teto e propor pausa\n- Gerar variações de copy com base no manual de marca' });

  trace(ctx, 'Grafo de Estados (determinístico)', 'Cruzamento UTM: Meta Ads × CRM', 'rotina fixa, sem decisão probabilística');
  const rows = crossAdsAndLeads();
  block(ctx, { type: 'table', title: 'CPL/CAC real por anúncio (Meta Ads × CRM via utm_content)', columns: ['ad_name', 'campaign_name', 'spend', 'leads', 'vendas', 'cpl', 'cac', 'status'], rows });
  block(ctx, { type: 'chart', title: 'Custo por Lead (CPL) por anúncio', points: rows.map((r) => ({ label: r.ad_name, value: r.cpl ?? 0 })) });

  trace(ctx, 'CodeAct (sandbox simulado)', 'Executor Agent roda script de cruzamento', 'container Docker virtualizado (simulado no protótipo, sem shell real)');
  block(ctx, {
    type: 'code',
    title: 'Script executado pelo Executor Agent (sandbox simulado)',
    language: 'python',
    content:
      "leads = crm.get_leads()\nads = meta.list_ads()\ndf = pd.merge(ads, leads, left_on='utm_content', right_on='utm_content')\ncpl = df.groupby('ad_id').spend.first() / df.groupby('ad_id').lead_id.count()\n# resultado gravado em parquet temporário -> memory pointer para a UI",
  });

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
    block(ctx, { type: 'approval_result', decision: 'rejected', ad_name: worst.ad_name });
    return `Ok, mantive o criativo **${worst.ad_name}** ativo — nenhuma alteração foi feita nas campanhas. Segue abaixo o cruzamento de CPL/CAC para você decidir com mais calma.`;
  }

  const paused = callTool('pause_ad', { ad_id: worst.ad_id });
  trace(ctx, 'Sessão & Permissões (deny-first)', 'Aprovação concedida — pause_ad executado', `ad_id=${worst.ad_id}`);
  block(ctx, { type: 'approval_result', decision: 'approved', ad_name: worst.ad_name, result: paused });

  const copies = await rlmGenerateCopies(ctx, { apiKey, model, adContext: { pausado: worst.ad_name, campanha: worst.campaign_name } });
  block(ctx, { type: 'text', title: `Variações de copy para substituir "${worst.ad_name}"`, content: copies });

  return `Pronto: cruzei Meta Ads × CRM por \`utm_content\`, pausei **${worst.ad_name}** (CPL R$ ${worst.cpl}) após sua aprovação, e gerei 3 variações de copy com base no manual de marca (via RLM). Veja as tabelas, o gráfico e as variações abaixo.`;
}

async function* pauseOnlyFlow(ctx, { message, apiKey, model }) {
  const rows = crossAdsAndLeads();
  const mentioned = rows.find((r) => message.toLowerCase().includes(r.ad_name.toLowerCase()) || message.toLowerCase().includes(r.ad_id));
  const target = mentioned || pickAdToPause(rows);

  trace(ctx, 'Sessão & Permissões (deny-first)', `Comando de alta criticidade detectado: pause_ad(${target.ad_id})`, 'aguardando aprovação humana explícita');
  const decision = yield {
    type: 'approval',
    tool: 'pause_ad',
    args: { ad_id: target.ad_id },
    description: `Pausar o criativo "${target.ad_name}"?`,
  };

  if (decision !== 'approve') {
    block(ctx, { type: 'approval_result', decision: 'rejected', ad_name: target.ad_name });
    return `Não pausei **${target.ad_name}** — aprovação negada.`;
  }
  const paused = callTool('pause_ad', { ad_id: target.ad_id });
  block(ctx, { type: 'approval_result', decision: 'approved', ad_name: target.ad_name, result: paused });
  return `Pausei **${target.ad_name}** após sua aprovação.`;
}

async function* crossUtmFlow(ctx, { message, apiKey, model }) {
  trace(ctx, 'Grafo de Estados (determinístico)', 'Cruzamento UTM: Meta Ads × CRM', 'rotina fixa via microsserviço, sem LLM no meio');
  const rows = crossAdsAndLeads();
  block(ctx, { type: 'table', title: 'CPL/CAC real por anúncio', columns: ['ad_name', 'campaign_name', 'spend', 'leads', 'vendas', 'cpl', 'cac', 'status'], rows });
  block(ctx, { type: 'chart', title: 'Custo por Lead (CPL) por anúncio', points: rows.map((r) => ({ label: r.ad_name, value: r.cpl ?? 0 })) });

  trace(ctx, 'CodeAct (sandbox simulado)', 'Executor roda cruzamento pandas', 'sandbox Docker simulado');
  block(ctx, {
    type: 'code',
    title: 'Script do Executor Agent (sandbox simulado)',
    language: 'python',
    content: "df = pd.merge(meta.list_ads(), crm.get_leads(), on='utm_content')\ncpl = df.groupby('ad_id').spend.first() / df.groupby('ad_id').lead_id.count()",
  });

  const worst = rows[0];
  const { text, offline, provider } = await safeLlm(ctx, {
    apiKey,
    model,
    system: 'Você é um analista de mídia paga. Com base na tabela de CPL/CAC fornecida (JSON), escreva 3-4 frases apontando o anúncio mais caro e uma recomendação objetiva.',
    user: JSON.stringify(rows),
    maxTokens: 260,
  });
  trace(ctx, 'ReAct (síntese final)', 'Reasoning Sandwich compõe a resposta final', offline ? 'offline' : provider);
  return text || `O anúncio mais caro é **${worst.ad_name}** com CPL de R$ ${worst.cpl}, bem acima dos demais. Recomendo revisar ou pausar esse criativo (cole sua OPENROUTER_API_KEY ou rode o Ollama local para uma análise textual completa).`;
}

async function* diagnosticoFlow(ctx, { message, apiKey, model }) {
  trace(ctx, 'ReAct (loop observação → ação)', 'Chamando list_ads + get_leads', 'levantando indicadores por anúncio');
  const rows = crossAdsAndLeads();

  trace(ctx, 'ReAct (loop observação → ação)', 'Chamando search_conversations', 'buscando menções a CPA/performance');
  const conv = callTool('search_conversations', { query: 'cpa' }).items;

  trace(ctx, 'ReAct (loop observação → ação)', 'Chamando get_timeline', 'buscando eventos recentes relevantes');
  const timeline = callTool('get_timeline', { since: '2026-08-10T00:00:00-03:00' }).events;

  const leadsAll = store.crmLeads.leads;
  const inconsistentes = leadsAll.filter((l) => l.utm_source === 'meta' && /org[aâ]nico|indica[cç][aã]o|google/i.test(l.origem_declarada));

  block(ctx, { type: 'table', title: 'CPL/CAC por anúncio', columns: ['ad_name', 'campaign_name', 'spend', 'leads', 'vendas', 'cpl', 'cac', 'status'], rows });
  block(ctx, { type: 'table', title: 'Leads com origem declarada inconsistente com o UTM', columns: ['lead_id', 'utm_content', 'utm_source', 'origem_declarada', 'status'], rows: inconsistentes });

  const summary = {
    pior_cpl: rows[0],
    leads_origem_inconsistente: inconsistentes.length,
    mencoes_cpa: conv.map((c) => c.mensagem),
    eventos_recentes: timeline.map((e) => e.title),
  };

  const { text, offline, provider } = await safeLlm(ctx, {
    apiKey,
    model,
    system: 'Você é um diagnosticador de conta de marketing. A partir do resumo estruturado (JSON) de anomalias já detectadas por ferramentas, escreva um diagnóstico objetivo: causa provável + próximos passos, em bullets.',
    user: JSON.stringify(summary),
    maxTokens: 400,
  });
  trace(ctx, 'ReAct (síntese final)', 'Diagnóstico final composto pelo Reasoning Sandwich', offline ? 'offline' : provider);
  return (
    text ||
    `Diagnóstico (modo offline, sem LLM):\n- Criativo mais caro: ${rows[0].ad_name} (CPL R$ ${rows[0].cpl}).\n- ${inconsistentes.length} leads com origem declarada inconsistente com o UTM real (possível atribuição incorreta pelo time de atendimento).\n- Há menção não resolvida de CPA alto na linha Whey nas conversas recentes.\nCole uma OPENROUTER_API_KEY ou rode o Ollama local para um diagnóstico narrativo completo.`
  );
}

async function* pautaFlow(ctx, { message, apiKey, model }) {
  trace(ctx, 'Supercérebro (memória temporal)', 'get_timeline + search_conversations', 'reconstruindo contexto recente da conta');
  const timeline = callTool('get_timeline', { since: '2026-08-14T00:00:00-03:00' }).events;
  const conv = store.conversas.items;
  const ranking = callTool('run_app_analise_criativos').ranking;

  block(ctx, { type: 'text', title: 'Eventos recentes (linha do tempo)', content: timeline.map((e) => `- **${e.title}** — ${e.summary}`).join('\n') });
  block(ctx, { type: 'text', title: 'Últimas conversas (reunião/WhatsApp)', content: conv.map((c) => `- [${c.canal}] ${c.de}: ${c.mensagem}`).join('\n') });

  const { text, offline, provider } = await safeLlm(ctx, {
    apiKey,
    model,
    system: 'Você organiza a pauta da próxima call com o cliente de marketing. A partir dos eventos e mensagens (JSON), monte uma pauta objetiva com 4-6 itens.',
    user: JSON.stringify({ timeline, conv, ranking }),
    maxTokens: 350,
  });
  trace(ctx, 'ReAct (síntese final)', 'Pauta composta pelo Reasoning Sandwich', offline ? 'offline' : provider);
  return (
    text ||
    `Pauta sugerida (offline):\n1. Aprovação pendente da peça "Combo Casal Depoimento v2" (6 dias parada).\n2. CPA da linha Whey — retomar ponto da call anterior.\n3. Performance geral Namorados/Omega3/Whey.\n4. Criativo saturado (Omega3_Depoimento_v2) — decidir pausa/refresh.`
  );
}

async function* creativeFlow(ctx, { message, apiKey, model }) {
  trace(ctx, 'App de metodologia', 'run_app_analise_criativos', 'ranking + recomendação (seguir/pausar/variar)');
  const ranking = callTool('run_app_analise_criativos').ranking;
  block(ctx, { type: 'table', title: 'Ranking de criativos (App de Análise de Criativos)', columns: ['ad_name', 'nota_hook', 'nota_cta', 'palco', 'recomendacao'], rows: ranking });

  const toReplace = ranking.find((r) => r.recomendacao === 'pausar') || ranking[ranking.length - 1];
  const copies = await rlmGenerateCopies(ctx, { apiKey, model, adContext: { ad: toReplace.ad_name, motivo: toReplace.motivo } });
  block(ctx, { type: 'text', title: `Variações de copy para "${toReplace.ad_name}"`, content: copies });

  return `O App de Análise de Criativos recomenda **${toReplace.recomendacao}** para **${toReplace.ad_name}** (${toReplace.motivo}). Gerei 3 variações de copy com base no manual de marca via RLM — veja abaixo.`;
}

async function* generalFlow(ctx, { message, apiKey, model }) {
  trace(ctx, 'ReAct (resposta direta)', 'Sem padrão de rotina detectado, respondendo via loop conversacional simples', '');
  const { text, offline, provider } = await safeLlm(ctx, {
    apiKey,
    model,
    system:
      'Você é o AdzHubOrchestrator, um assistente de marketing da AdzHub. Responda de forma direta e curta. Se o pedido envolver dados de campanhas/leads/criativos, sugira ao usuário reformular pedindo explicitamente "cruzar CPL", "pausar", "diagnóstico", "pauta de reunião" ou "copy/criativos" para acionar as ferramentas especializadas.',
    user: message,
    maxTokens: 300,
  });
  if (!offline) trace(ctx, 'ReAct (resposta direta)', 'Resposta gerada', provider);
  return text || 'Modo offline: cole sua OPENROUTER_API_KEY (ou rode o Ollama local com qwen2.5:3b/gemma3:4b) para conversar livremente. Enquanto isso, tente pedidos como "cruzar CPL", "diagnóstico da conta", "pauta da reunião" ou "pausar o criativo X" para ver as ferramentas mockadas em ação.';
}

const FLOWS = {
  full_pipeline: fullPipelineFlow,
  pause_only: pauseOnlyFlow,
  cross_utm: crossUtmFlow,
  diagnostico: diagnosticoFlow,
  pauta_reuniao: pautaFlow,
  creative_flow: creativeFlow,
  general: generalFlow,
};

module.exports = { FLOWS };
