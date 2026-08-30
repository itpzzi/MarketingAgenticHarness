// BFA (Back-end for Agents): mantém sessões em memória (event-sourcing "de
// mentirinha" — o suficiente para demonstrar o conceito num MVP de 1 processo)
// e conduz o async generator do fluxo escolhido pelo roteador, pausando em
// pontos de aprovação humana (Sessão & Permissões / deny-first).
const { routeIntent } = require('./router');
const { FLOWS } = require('./flows');

const sessions = new Map();

const FLOW_LABELS = {
  full_pipeline: 'análise de desempenho, revisão de campanha e criação de alternativas',
  pause_only: 'revisão de pausa de campanha',
  cross_utm: 'cruzamento de desempenho e leads',
  diagnostico: 'diagnóstico da conta',
  pauta_reuniao: 'preparação da pauta de reunião',
  creative_flow: 'análise e renovação de criativos',
  general: 'atendimento geral',
};

function getOrCreateSession(sessionId) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, { generator: null, ctx: null, pendingApproval: null, flowName: null });
  }
  return sessions.get(sessionId);
}

function serialize(session, finalMessage) {
  return {
    flow: session.flowName,
    trace: session.ctx ? session.ctx.trace : [],
    blocks: session.ctx ? session.ctx.blocks : [],
    message: finalMessage ?? null,
    pendingApproval: session.pendingApproval,
  };
}

async function drive(session, resumeValue) {
  const { value, done } = await session.generator.next(resumeValue);
  if (done) {
    session.pendingApproval = null;
    return serialize(session, value);
  }
  if (value && value.type === 'approval') {
    session.pendingApproval = value;
    return serialize(session, null);
  }
  // fallback defensivo: tipo de yield desconhecido, encerra com erro amigável
  session.pendingApproval = null;
  return serialize(session, 'Ocorreu um passo inesperado no fluxo do harness.');
}

async function handleChat(sessionId, { message, apiKey, model, onTrace }) {
  const session = getOrCreateSession(sessionId);
  if (session.pendingApproval) {
    return { ...serialize(session, null), error: 'pending_approval_must_be_resolved_first' };
  }
  const flowName = routeIntent(message);
  const ctx = { trace: [], blocks: [], onTrace };
  const routingEvent = {
    paradigm: 'Coordenação A2A',
    label: 'Pedido encaminhado para especialistas',
    detail: `Roteamento horizontal para ${FLOW_LABELS[flowName]}.`,
    activityType: 'routing',
    at: new Date().toISOString(),
  };
  ctx.trace.push(routingEvent);
  ctx.onTrace?.(routingEvent);
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

async function handleApprove(sessionId, decision, onTrace) {
  const session = sessions.get(sessionId);
  if (!session || !session.pendingApproval) {
    return { error: 'no_pending_approval' };
  }
  session.ctx.onTrace = onTrace;
  try {
    return await drive(session, decision);
  } finally {
    session.ctx.onTrace = null;
  }
}

module.exports = { handleChat, handleApprove };
