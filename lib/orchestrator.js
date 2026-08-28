// BFA (Back-end for Agents): mantém sessões em memória (event-sourcing "de
// mentirinha" — o suficiente para demonstrar o conceito num MVP de 1 processo)
// e conduz o async generator do fluxo escolhido pelo roteador, pausando em
// pontos de aprovação humana (Sessão & Permissões / deny-first).
const { routeIntent } = require('./router');
const { FLOWS } = require('./flows');

const sessions = new Map();

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

async function handleChat(sessionId, { message, apiKey, model }) {
  const session = getOrCreateSession(sessionId);
  if (session.pendingApproval) {
    return { ...serialize(session, null), error: 'pending_approval_must_be_resolved_first' };
  }
  const flowName = routeIntent(message);
  const ctx = { trace: [], blocks: [] };
  session.ctx = ctx;
  session.flowName = flowName;
  const flowFn = FLOWS[flowName];
  session.generator = flowFn(ctx, { message, apiKey, model });
  return drive(session, undefined);
}

async function handleApprove(sessionId, decision) {
  const session = sessions.get(sessionId);
  if (!session || !session.pendingApproval) {
    return { error: 'no_pending_approval' };
  }
  return drive(session, decision);
}

module.exports = { handleChat, handleApprove };
