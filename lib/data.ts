// Carrega os mocks em memória. Um único cliente (Housewhey) por simplicidade do MVP.
import fs from 'fs';
import path from 'path';

// Independente de rodar via tsx (lib/data.ts) ou a partir do build compilado
// (dist/lib/data.js), o processo sempre é iniciado a partir da raiz do repo.
const DATA_DIR = path.join(process.cwd(), 'data');

function loadJson<T>(file: string): T {
  const raw = fs.readFileSync(path.join(DATA_DIR, file), 'utf-8');
  return JSON.parse(raw) as T;
}

export interface MetaAd {
  ad_id: string;
  ad_name: string;
  utm_content: string;
  status: string;
  spend: number;
  clicks: number;
  impressions: number;
  campaign_id?: string;
  campaign_name?: string;
  budget_diario?: number;
}

export interface MetaAdSet {
  ads: MetaAd[];
}

export interface MetaCampaign {
  campaign_id: string;
  campaign_name: string;
  budget_diario: number;
  adsets: MetaAdSet[];
}

export interface CrmLead {
  lead_id: string;
  utm_content: string;
  utm_source: string;
  origem_declarada: string;
  status: string;
  value_brl: number;
  created_at: string;
}

export const store = {
  metaAds: loadJson<{ campaigns: MetaCampaign[] }>('api_meta_ads.json'),
  crmLeads: loadJson<{ leads: CrmLead[] }>('api_crm_leads.json'),
  graph: loadJson<{ nodes: any[]; edges: any[] }>('supercerebro_graph.json'),
  timeline: loadJson<{ events: any[] }>('supercerebro_timeline.json'),
  criativos: loadJson<{ ranking: any[] }>('app_analise_criativos.json'),
  mapaSolucao: loadJson<any>('app_mapa_solucao.json'),
  conversas: loadJson<{ items: any[] }>('conversas.json'),
  manualMarca: fs.readFileSync(path.join(DATA_DIR, 'manual_marca.txt'), 'utf-8'),
};

export function listAllAds(): MetaAd[] {
  const ads: MetaAd[] = [];
  for (const camp of store.metaAds.campaigns) {
    for (const adset of camp.adsets) {
      for (const ad of adset.ads) {
        ads.push({ ...ad, campaign_id: camp.campaign_id, campaign_name: camp.campaign_name, budget_diario: camp.budget_diario });
      }
    }
  }
  return ads;
}

export function findAdById(adId: string): MetaAd | undefined {
  return listAllAds().find((a) => a.ad_id === adId);
}

export function setAdStatus(adId: string, status: string): MetaAd | null {
  for (const camp of store.metaAds.campaigns) {
    for (const adset of camp.adsets) {
      for (const ad of adset.ads) {
        if (ad.ad_id === adId) {
          ad.status = status;
          return ad;
        }
      }
    }
  }
  return null;
}

export function listCampaigns(): MetaCampaign[] {
  return store.metaAds.campaigns;
}

export { DATA_DIR };
