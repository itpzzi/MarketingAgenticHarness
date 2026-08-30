// Resources são fontes somente leitura de contexto. Diferente de tools, não
// executam efeitos colaterais e podem ser usadas livremente pelos fluxos.
const { store, listAllAds, findAdById } = require('./data');

function ok(data) {
  return { ok: true, ...data };
}

function fail(error) {
  return { ok: false, error };
}

const resources = {
  client_context({ query = '' }) {
    const normalizedQuery = query.toLowerCase();
    const nodes = store.graph.nodes.filter(
      (node) => !normalizedQuery || node.label.toLowerCase().includes(normalizedQuery) || node.type.includes(normalizedQuery)
    );
    const nodeIds = new Set(nodes.map((node) => node.id));
    const edges = store.graph.edges.filter((edge) => nodeIds.has(edge.from) || nodeIds.has(edge.to));
    return ok({ nodes: nodes.length ? nodes : store.graph.nodes.slice(0, 8), edges });
  },

  timeline({ since, until } = {}) {
    let events = store.timeline.events;
    if (since) events = events.filter((event) => event.occurred_at >= since);
    if (until) events = events.filter((event) => event.occurred_at <= until);
    return ok({ events });
  },

  ads({ status } = {}) {
    const ads = status ? listAllAds().filter((ad) => ad.status === status) : listAllAds();
    return ok({ ads });
  },

  ad_insights({ ad_id }) {
    const ad = findAdById(ad_id);
    if (!ad) return fail(`ad_not_found:${ad_id}`);
    const cpc = ad.clicks ? +(ad.spend / ad.clicks).toFixed(2) : null;
    const ctr = ad.impressions ? +((ad.clicks / ad.impressions) * 100).toFixed(2) : null;
    return ok({ ad: { ...ad, cpc, ctr } });
  },

  leads({ utm_content, since, until } = {}) {
    let leads = store.crmLeads.leads;
    if (utm_content) leads = leads.filter((lead) => lead.utm_content === utm_content);
    if (since) leads = leads.filter((lead) => lead.created_at >= since);
    if (until) leads = leads.filter((lead) => lead.created_at <= until);
    return ok({ leads });
  },

  creative_ranking() {
    return ok({ ranking: store.criativos.ranking });
  },

  solution_map() {
    return ok({ mapa: store.mapaSolucao });
  },

  conversations({ query = '' }) {
    const normalizedQuery = query.toLowerCase();
    const items = store.conversas.items.filter(
      (item) => !normalizedQuery || item.mensagem.toLowerCase().includes(normalizedQuery)
    );
    return ok({ items: items.length ? items : store.conversas.items });
  },
};

function readResource(name, args = {}) {
  const resource = resources[name];
  if (!resource) return fail(`unknown_resource:${name}`);
  try {
    return resource(args);
  } catch (error) {
    return fail(`resource_exception:${error.message}`);
  }
}

module.exports = { readResource, resources };