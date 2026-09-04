// Resources são fontes somente leitura de contexto. Diferente de tools, não
// executam efeitos colaterais e podem ser usadas livremente pelos fluxos/grafos.
import { store, listAllAds, findAdById } from './data';

type ResourceResult<T = Record<string, unknown>> = { ok: true } & T | { ok: false; error: string };

function ok<T extends Record<string, unknown>>(data: T): { ok: true } & T {
  return { ok: true, ...data };
}

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

const resources = {
  client_context({ query = '' }: { query?: string }) {
    const normalizedQuery = query.toLowerCase();
    const nodes = store.graph.nodes.filter(
      (node: any) => !normalizedQuery || node.label.toLowerCase().includes(normalizedQuery) || node.type.includes(normalizedQuery)
    );
    const nodeIds = new Set(nodes.map((node: any) => node.id));
    const edges = store.graph.edges.filter((edge: any) => nodeIds.has(edge.from) || nodeIds.has(edge.to));
    return ok({ nodes: nodes.length ? nodes : store.graph.nodes.slice(0, 8), edges });
  },

  timeline({ since, until }: { since?: string; until?: string } = {}) {
    let events = store.timeline.events;
    if (since) events = events.filter((event: any) => event.occurred_at >= since);
    if (until) events = events.filter((event: any) => event.occurred_at <= until);
    return ok({ events });
  },

  ads({ status }: { status?: string } = {}) {
    const ads = status ? listAllAds().filter((ad) => ad.status === status) : listAllAds();
    return ok({ ads });
  },

  ad_insights({ ad_id }: { ad_id: string }) {
    const ad = findAdById(ad_id);
    if (!ad) return fail(`ad_not_found:${ad_id}`);
    const cpc = ad.clicks ? +(ad.spend / ad.clicks).toFixed(2) : null;
    const ctr = ad.impressions ? +((ad.clicks / ad.impressions) * 100).toFixed(2) : null;
    return ok({ ad: { ...ad, cpc, ctr } });
  },

  leads({ utm_content, since, until }: { utm_content?: string; since?: string; until?: string } = {}) {
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

  conversations({ query = '' }: { query?: string }) {
    const normalizedQuery = query.toLowerCase();
    const items = store.conversas.items.filter(
      (item: any) => !normalizedQuery || item.mensagem.toLowerCase().includes(normalizedQuery)
    );
    return ok({ items: items.length ? items : store.conversas.items });
  },
};

type ResourceName = keyof typeof resources;

function readResource(name: string, args: Record<string, any> = {}): ResourceResult<any> {
  const resource = (resources as Record<string, (args: any) => ResourceResult<any>>)[name];
  if (!resource) return fail(`unknown_resource:${name}`);
  try {
    return resource(args);
  } catch (error: any) {
    return fail(`resource_exception:${error.message}`);
  }
}

export { readResource, resources };
export type { ResourceName };
