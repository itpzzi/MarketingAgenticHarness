// "Gateway MCP": cada função aqui é uma tool exposta ao harness, com contrato
// estável (args mínimos, retorno JSON, erro padronizado). Tools que mutam
// estado real (pause_ad/resume_ad) são marcadas como mutable=true e nunca são
// chamadas direto pelo orquestrador sem passar pelo portão de Sessão&Permissões.
// As demais são deterministas (paradigma "Grafo de Estados"): mesma entrada,
// mesma saída, sem chamada de LLM — usadas como nós de LangGraph em lib/graphs.
import { setAdStatus, listAllAds, store } from './data';
import type { AdRow } from './types';

function ok<T extends Record<string, unknown>>(data: T): { ok: true } & T {
  return { ok: true, ...data };
}
function fail(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

// --- Tool determinística (Grafo): cruza Meta Ads x CRM por utm_content ---
function computeCplCac(): AdRow[] {
  const ads = listAllAds();
  const rows: AdRow[] = ads.map((ad) => {
    const leads = store.crmLeads.leads.filter((l) => l.utm_content === ad.utm_content);
    const vendas = leads.filter((l) => l.status === 'venda');
    const receita = vendas.reduce((s, l) => s + l.value_brl, 0);
    const cpl = leads.length ? +(ad.spend / leads.length).toFixed(2) : null;
    const cac = vendas.length ? +(ad.spend / vendas.length).toFixed(2) : null;
    return {
      ad_id: ad.ad_id,
      ad_name: ad.ad_name,
      campaign_name: ad.campaign_name || '',
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

// --- Tool determinística (Grafo): identifica leads com origem inconsistente ---
function detectInconsistentLeads() {
  return store.crmLeads.leads.filter(
    (l) => l.utm_source === 'meta' && /org[aâ]nico|indica[cç][aã]o|google/i.test(l.origem_declarada)
  );
}

// --- Tool determinística (Grafo): flags de anomalia de CAC (acima de 2x a mediana) ---
function detectCpaAnomalies(rows: AdRow[]) {
  const values = rows.map((r) => r.cac).filter((v): v is number => v != null).sort((a, b) => a - b);
  if (!values.length) return [];
  const median = values[Math.floor(values.length / 2)];
  const threshold = median * 2;
  return rows.filter((r) => (r.cac ?? 0) > threshold).map((r) => ({ ...r, threshold, median }));
}

// --- Tool determinística (Grafo): ROI por anúncio (receita / spend) ---
function computeRoi(rows: AdRow[]) {
  return rows.map((r) => ({ ad_id: r.ad_id, ad_name: r.ad_name, roi: r.spend ? +((r.receita / r.spend) * 100).toFixed(1) : null }));
}

// --- Tool determinística (Grafo): campanha com maior orçamento diário ---
function findBudgetLeader() {
  const campaigns = store.metaAds.campaigns;
  return campaigns.slice().sort((a, b) => b.budget_diario - a.budget_diario)[0] || null;
}

// --- Tool determinística (Grafo): ranking de criativos por score composto ---
function rankCreativesByScore() {
  return store.criativos.ranking
    .map((r: any) => ({ ...r, score: +(((r.nota_hook ?? 0) + (r.nota_cta ?? 0)) / 2).toFixed(1) }))
    .sort((a: any, b: any) => a.score - b.score);
}

const tools = {
  // Ferramenta mutável: sempre passa pelo portão deny-first no orchestrator.
  pause_ad({ ad_id }: { ad_id: string }) {
    const updated = setAdStatus(ad_id, 'paused');
    if (!updated) return fail(`ad_not_found:${ad_id}`);
    return ok({ ad: updated });
  },
  // Ferramenta mutável (inversa de pause_ad): também passa pelo portão deny-first.
  resume_ad({ ad_id }: { ad_id: string }) {
    const updated = setAdStatus(ad_id, 'active');
    if (!updated) return fail(`ad_not_found:${ad_id}`);
    return ok({ ad: updated });
  },
};

const MUTABLE_TOOLS = new Set(['pause_ad', 'resume_ad']);

function callTool(name: string, args: Record<string, any> = {}): { ok: boolean; [key: string]: unknown } {
  const fn = (tools as Record<string, (args: any) => any>)[name];
  if (!fn) return fail(`unknown_tool:${name}`);
  try {
    return fn(args);
  } catch (e: any) {
    return fail(`tool_exception:${e.message}`);
  }
}

export {
  callTool,
  MUTABLE_TOOLS,
  tools,
  computeCplCac,
  detectInconsistentLeads,
  detectCpaAnomalies,
  computeRoi,
  findBudgetLeader,
  rankCreativesByScore,
};
