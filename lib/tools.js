// "Gateway MCP": cada função aqui é uma tool exposta ao harness, com contrato
// estável (args mínimos, retorno JSON, erro padronizado). Tools que mutam
// estado real (pause_ad) são marcadas como mutable=true e nunca são chamadas
// direto pelo orquestrador sem passar pelo portão de Sessão&Permissões.
const { setAdStatus } = require('./data');

function ok(data) {
  return { ok: true, ...data };
}
function fail(error) {
  return { ok: false, error };
}

const tools = {
  // Ferramenta mutável: sempre passa pelo portão deny-first no orchestrator.
  pause_ad({ ad_id }) {
    const updated = setAdStatus(ad_id, 'paused');
    if (!updated) return fail(`ad_not_found:${ad_id}`);
    return ok({ ad: updated });
  },
};

const MUTABLE_TOOLS = new Set(['pause_ad']);

function callTool(name, args = {}) {
  const fn = tools[name];
  if (!fn) return fail(`unknown_tool:${name}`);
  try {
    return fn(args);
  } catch (e) {
    return fail(`tool_exception:${e.message}`);
  }
}

module.exports = { callTool, MUTABLE_TOOLS, tools };
