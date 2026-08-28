// Roteador semântico (heurístico) do BFA: decide qual topologia de execução
// o pedido do gestor deve percorrer. Cada flow abaixo corresponde a um dos
// baselines discutidos no paper (ReAct, Grafo, CodeAct/Sandbox, RLM,
// Sessão&Permissões), combinados de forma híbrida por pedido.
function has(msg, words) {
  const m = msg.toLowerCase();
  return words.some((w) => m.includes(w));
}

function routeIntent(message) {
  const wantsCross = has(message, ['cruzar', 'cpl', 'custo por lead', 'custo real', 'gasto', 'roi', 'cac']);
  const wantsPause = has(message, ['pausar', 'pause', 'pausa']);
  const wantsCopy = has(message, ['copy', 'variações', 'variaç', 'manual de marca', 'tom de voz', 'criativo', 'briefing', 'brief']);
  const wantsDiag = has(message, ['diagnóstico', 'diagnostico', 'anomalia', 'cpa', 'o que está errado', 'investigar']);
  const wantsPauta = has(message, ['pauta', 'reunião', 'reuniao', 'call com o cliente']);

  if (wantsCross && wantsPause) return 'full_pipeline';
  if (wantsCross) return 'cross_utm';
  if (wantsPause) return 'pause_only';
  if (wantsDiag) return 'diagnostico';
  if (wantsPauta) return 'pauta_reuniao';
  if (wantsCopy) return 'creative_flow';
  return 'general';
}

module.exports = { routeIntent };
