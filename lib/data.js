// Carrega os mocks em memória. Um único cliente (Housewhey) por simplicidade do MVP.
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

function loadJson(file) {
  const raw = fs.readFileSync(path.join(DATA_DIR, file), 'utf-8');
  return JSON.parse(raw);
}

// Cópia mutável em memória (para simular pause_ad sem tocar nos arquivos em disco).
const store = {
  metaAds: loadJson('api_meta_ads.json'),
  crmLeads: loadJson('api_crm_leads.json'),
  graph: loadJson('supercerebro_graph.json'),
  timeline: loadJson('supercerebro_timeline.json'),
  criativos: loadJson('app_analise_criativos.json'),
  mapaSolucao: loadJson('app_mapa_solucao.json'),
  conversas: loadJson('conversas.json'),
  manualMarca: fs.readFileSync(path.join(DATA_DIR, 'manual_marca.txt'), 'utf-8'),
};

function listAllAds() {
  const ads = [];
  for (const camp of store.metaAds.campaigns) {
    for (const adset of camp.adsets) {
      for (const ad of adset.ads) {
        ads.push({ ...ad, campaign_id: camp.campaign_id, campaign_name: camp.campaign_name, budget_diario: camp.budget_diario });
      }
    }
  }
  return ads;
}

function findAdById(adId) {
  return listAllAds().find((a) => a.ad_id === adId);
}

function setAdStatus(adId, status) {
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

module.exports = { store, listAllAds, findAdById, setAdStatus, DATA_DIR };
