// BFA (Back-end for Agents): mantém sessões em memória (event-sourcing "de
// mentirinha" — o suficiente para demonstrar o conceito num MVP de 1 processo)
// e conduz o async generator do fluxo escolhido pelo roteador, pausando em
// pontos de aprovação humana (Sessão & Permissões / deny-first).
import { routeIntent } from './router';
import { FLOWS } from './flows';
import { buildPlan } from './planner';
import * as memory from './memory';
import type { ApprovalRequest, Block, FlowCtx, FlowGenerator, TraceEvent } from './types';

interface Session {
  generator: FlowGenerator | null;
  ctx: FlowCtx | null;
  pendingApproval: ApprovalRequest | null;
  flowName: string | null;
  lastUserMessage: string | null;
  sessionId?: string;
}

const sessions = new Map<string, Session>();

const FLOW_LABELS: Record<string, string> = {
  full_pipeline: 'análise de desempenho, revisão de campanha e criação de alternativas',
  pause_only: 'revisão de pausa de campanha',
  cross_utm: 'cruzamento de desempenho e leads',
  diagnostico: 'diagnóstico da conta',
  pauta_reuniao: 'preparação da pauta de reunião',
  creative_flow: 'análise e renovação de criativos',
  budget_query: 'identificação de orçamento líder',
  general: 'atendimento geral',
};

function getOrCreateSession(sessionId: string): Session {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, { generator: null, ctx: null, pendingApproval: null, flowName: null, lastUserMessage: null });
  }
  return sessions.get(sessionId) as Session;
}

interface SerializedResult {
  flow: string | null;
  trace: TraceEvent[];
  blocks: Block[];
  message: string | null;
  pendingApproval: ApprovalRequest | null;
}

function serialize(session: Session, finalMessage: string | null): SerializedResult {
  return {
    flow: session.flowName,
    trace: session.ctx ? session.ctx.trace : [],
    blocks: session.ctx ? session.ctx.blocks : [],
    message: finalMessage ?? null,
    pendingApproval: session.pendingApproval,
  };
}

async function drive(session: Session, resumeValue: 'approve' | 'reject' | undefined): Promise<SerializedResult> {
  const { value, done } = await (session.generator as FlowGenerator).next(resumeValue as any);
  if (done) {
    session.pendingApproval = null;
    const finalMessage = value as string;
    memory.addTurn(session.sessionId as string, 'assistant', finalMessage);
    memory.extractFacts(session.sessionId as string, {
      userMessage: session.lastUserMessage,
      flowName: session.flowName,
      blocks: session.ctx ? session.ctx.blocks : [],
      finalMessage,
    });
    return serialize(session, finalMessage);
  }
  if (value && (value as ApprovalRequest).type === 'approval') {
    session.pendingApproval = value as ApprovalRequest;
    return serialize(session, null);
  }
  // fallback defensivo: tipo de yield desconhecido, encerra com erro amigável
  session.pendingApproval = null;
  return serialize(session, 'Ocorreu um passo inesperado no fluxo do harness.');
}

interface HandleChatArgs {
  message: string;
  apiKey?: string;
  model?: string;
  onTrace?: (event: TraceEvent) => void;
}

async function handleChat(sessionId: string, { message, apiKey, model, onTrace }: HandleChatArgs): Promise<SerializedResult & { error?: string }> {
  const session = getOrCreateSession(sessionId);
  if (session.pendingApproval) {
    return { ...serialize(session, null), error: 'pending_approval_must_be_resolved_first' };
  }
  session.sessionId = sessionId;
  session.lastUserMessage = message;
  memory.addTurn(sessionId, 'user', message);

  const flowName = routeIntent(message);
  const ctx: FlowCtx = { trace: [], blocks: [], onTrace, memory: memory.buildMemoryBlock(sessionId) };
  const routingEvent: TraceEvent = {
    paradigm: 'Coordenação A2A',
    label: 'Pedido encaminhado para especialistas',
    detail: `Roteamento horizontal para ${FLOW_LABELS[flowName]}.`,
    activityType: 'routing',
    at: new Date().toISOString(),
  };
  ctx.trace.push(routingEvent);
  ctx.onTrace?.(routingEvent);

  // Planejamento explícito (todo list): o modelo "pensa em voz alta" antes de
  // agir, expondo os passos e a instância de subagente/paradigma responsável
  // por cada um. Os mesmos objetos são referenciados pelo bloco abaixo, então
  // marcá-los como concluídos durante o fluxo atualiza o registro final.
  const plan = buildPlan(flowName);
  ctx.plan = plan;
  const planEvent: TraceEvent = {
    paradigm: 'Planejamento (ReAct)',
    label: 'Plano de execução exposto ao gestor',
    detail: plan.map((s) => `${s.label} → ${s.paradigm}`).join(' · '),
    activityType: 'plan',
    plan,
    at: new Date().toISOString(),
  };
  ctx.trace.push(planEvent);
  ctx.onTrace?.(planEvent);
  ctx.blocks.push({ type: 'plan', title: 'Plano de execução (todo list)', steps: plan });

  session.ctx = ctx;
  session.flowName = flowName;
  const flowFn = FLOWS[flowName];
  session.generator = flowFn(ctx, { message, apiKey, model });
  try {
    return await drive(session, undefined);
  } finally {
    ctx.onTrace = null;
  }
}

async function handleApprove(
  sessionId: string,
  decision: 'approve' | 'reject',
  onTrace?: (event: TraceEvent) => void
): Promise<SerializedResult | { error: string }> {
  const session = sessions.get(sessionId);
  if (!session || !session.pendingApproval) {
    return { error: 'no_pending_approval' };
  }
  (session.ctx as FlowCtx).onTrace = onTrace;
  try {
    return await drive(session, decision);
  } finally {
    (session.ctx as FlowCtx).onTrace = null;
  }
}

export { handleChat, handleApprove };
