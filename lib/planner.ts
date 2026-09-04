// Planner: antes de agir, o harness decompõe o pedido num plano explícito
// (todo list, ao estilo Copilot) e aloca cada passo a uma instância de
// subagente/paradigma (ReAct, Grafo de Estados, CodeSandbox, RLM ou
// Sessão & Permissões). O plano é exposto ao gestor (trace + bloco na UI) e
// cada passo é riscado (`status: 'done'`) conforme o fluxo avança.
import type { PlanStep, Paradigm } from './types';

type StepTemplate = Omit<PlanStep, 'status'>;

const STEP_TEMPLATES: Record<string, StepTemplate[]> = {
  full_pipeline: [
    { id: 'plan', label: 'Planejar o pedido composto (cruzar + pausar + gerar copy)', paradigm: 'ReAct' },
    { id: 'cross', label: 'Cruzar Meta Ads × CRM (CPL/CAC) via grafo de estados', paradigm: 'Grafo de Estados' },
    { id: 'anomaly', label: 'Detectar anomalias de CAC e ROI por anúncio', paradigm: 'Grafo de Estados' },
    { id: 'approval', label: 'Confirmar pausa do criativo ineficaz com o gestor', paradigm: 'Sessão & Permissões' },
    { id: 'copy', label: 'Gerar variações de copy a partir do manual de marca', paradigm: 'RLM' },
  ],
  cross_utm: [
    { id: 'cross', label: 'Cruzar Meta Ads × CRM (CPL/CAC) via script no sandbox', paradigm: 'CodeSandbox' },
    { id: 'roi', label: 'Calcular ROI por anúncio (grafo de estados)', paradigm: 'Grafo de Estados' },
    { id: 'synth', label: 'Sintetizar recomendação final', paradigm: 'ReAct' },
  ],
  pause_only: [
    { id: 'target', label: 'Identificar o criativo alvo da pausa', paradigm: 'Grafo de Estados' },
    { id: 'approval', label: 'Confirmar pausa com o gestor', paradigm: 'Sessão & Permissões' },
  ],
  diagnostico: [
    { id: 'data', label: 'Consultar desempenho, conversas e linha do tempo em paralelo', paradigm: 'Grafo de Estados' },
    { id: 'anomaly', label: 'Detectar leads inconsistentes e anomalias de CAC', paradigm: 'Grafo de Estados' },
    { id: 'synth', label: 'Compor diagnóstico final', paradigm: 'ReAct' },
  ],
  pauta_reuniao: [
    { id: 'data', label: 'Reunir linha do tempo, conversas e ranking de criativos em paralelo', paradigm: 'Grafo de Estados' },
    { id: 'synth', label: 'Montar pauta objetiva da reunião', paradigm: 'ReAct' },
  ],
  creative_flow: [
    { id: 'ranking', label: 'Consultar e pontuar ranking de criativos', paradigm: 'Grafo de Estados' },
    { id: 'copy', label: 'Gerar copy via manual de marca (RLM)', paradigm: 'RLM' },
  ],
  budget_query: [
    { id: 'budget', label: 'Identificar campanha com maior orçamento diário', paradigm: 'Grafo de Estados' },
    { id: 'synth', label: 'Responder com a campanha líder de orçamento', paradigm: 'ReAct' },
  ],
  general: [
    { id: 'intent', label: 'Interpretar intenção usando a memória da conversa', paradigm: 'ReAct' },
  ],
};

function buildPlan(flowName: string): PlanStep[] {
  const template = STEP_TEMPLATES[flowName] || STEP_TEMPLATES.general;
  return template.map((step) => ({ ...step, status: 'pending' as const }));
}

export { buildPlan };
