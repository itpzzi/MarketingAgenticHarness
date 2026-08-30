// Wrapper fino para o OpenRouter. A API key nunca é persistida no servidor:
// ela chega em cada requisição vinda do browser (sessionStorage do cliente) e
// só é usada no corpo desta chamada HTTP, sem log e sem gravação em disco.
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Fallback de dev: se o avaliador não colar uma OPENROUTER_API_KEY, o harness
// tenta um Ollama local (sem custo, sem key) em vez de cair direto em texto
// determinístico — mesmo papel de "motor cognitivo", provedor diferente.
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const LOCAL_MODELS = {
  frontier: process.env.OLLAMA_FRONTIER_MODEL || 'gemma3:4b',
  fast: process.env.OLLAMA_FAST_MODEL || 'qwen2.5:3b',
};

async function callOpenRouter({ apiKey, model, messages, temperature = 0.4, maxTokens = 900 }) {
  if (!apiKey) {
    throw new Error('missing_api_key');
  }
  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://adzhub-orchestrator-proto.railway.app',
      'X-Title': 'AdzHubOrchestrator Proto',
    },
    body: JSON.stringify({
      model: model || 'openai/gpt-4o-mini',
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`openrouter_error_${res.status}`);
    err.detail = text;
    throw err;
  }

  const json = await res.json();
  const content = json?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('openrouter_empty_response');
  }
  return content.trim();
}

async function callOllama({ model, messages, temperature = 0.4, maxTokens = 900 }) {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      options: { temperature, num_predict: maxTokens },
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`ollama_error_${res.status}`);
    err.detail = text;
    throw err;
  }

  const json = await res.json();
  const content = json?.message?.content;
  if (!content) {
    throw new Error('ollama_empty_response');
  }
  return content.trim();
}

async function getOllamaStatus() {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(1500) });
    if (!res.ok) throw new Error(`ollama_error_${res.status}`);
    const json = await res.json();
    return { available: true, endpoint: OLLAMA_URL, models: (json.models || []).map((item) => item.name) };
  } catch (error) {
    return { available: false, endpoint: OLLAMA_URL, models: [] };
  }
}

module.exports = { callOpenRouter, callOllama, getOllamaStatus, LOCAL_MODELS };
