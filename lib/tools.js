// "Gateway MCP": cada função aqui é uma tool exposta ao harness, com contrato
// estável (args mínimos, retorno JSON, erro padronizado). Tools que mutam
// estado real (pause_ad) são marcadas como mutable=true e nunca são chamadas
// direto pelo orquestrador sem passar pelo portão de Sessão&Permissões.
const { store, listAllAds, findAdById, setAdStatus } = require('./data');

function ok(data) {
  return { ok: true, ...data };
}
function fail(error) {
  return { ok: false, error };
}

const tools = {
  // --- Supercérebro: grafo ---
  search_client_context({ query = '' }) {
    const q = query.toLowerCase();
    const nodes = store.graph.nodes.filter(
      (n) => !q || n.label.toLowerCase().includes(q) || n.type.includes(q)
    );
    const nodeIds = new Set(nodes.map((n) => n.id));
    const edges = store.graph.edges.filter((e) => nodeIds.has(e.from) || nodeIds.has(e.to));
    return ok({ nodes: nodes.length ? nodes : store.graph.nodes.slice(0, 8), edges });
  },

  // --- Supercérebro: linha do tempo ---
  get_timeline({ since, until } = {}) {
    let events = store.timeline.events;
    if (since) events = events.filter((e) => e.occurred_at >= since);
    if (until) events = events.filter((e) => e.occurred_at <= until);
    return ok({ events });
  },

  // --- API Meta Ads ---
  list_ads({ status } = {}) {
    let ads = listAllAds();
    if (status) ads = ads.filter((a) => a.status === status);
    return ok({ ads });
  },

  get_ad_insights({ ad_id }) {
    const ad = findAdById(ad_id);
    if (!ad) return fail(`ad_not_found:${ad_id}`);
    const cpc = ad.clicks ? +(ad.spend / ad.clicks).toFixed(2) : null;
    const ctr = ad.impressions ? +((ad.clicks / ad.impressions) * 100).toFixed(2) : null;
    return ok({ ad: { ...ad, cpc, ctr } });
  },

  // --- API CRM ---
  get_leads({ utm_content, since, until } = {}) {
    let leads = store.crmLeads.leads;
    if (utm_content) leads = leads.filter((l) => l.utm_content === utm_content);
    if (since) leads = leads.filter((l) => l.created_at >= since);
    if (until) leads = leads.filter((l) => l.created_at <= until);
    return ok({ leads });
  },

  // --- App de metodologia: análise de criativos ---
  run_app_analise_criativos() {
    return ok({ ranking: store.criativos.ranking });
  },

  // --- App de metodologia: mapa de solução ---
  get_mapa_solucao() {
    return ok({ mapa: store.mapaSolucao });
  },

  // --- Memória de canal (reunião/WhatsApp) ---
  search_conversations({ query = '' }) {
    const q = query.toLowerCase();
    const items = store.conversas.items.filter((i) => !q || i.mensagem.toLowerCase().includes(q));
    return ok({ items: items.length ? items : store.conversas.items });
  },

  // --- Ferramenta MUTÁVEL: sempre passa pelo portão deny-first no orchestrator ---
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
