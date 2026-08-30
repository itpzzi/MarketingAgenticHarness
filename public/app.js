const messagesEl = document.getElementById('messages');
const traceEl = document.getElementById('trace');
const inputEl = document.getElementById('input');
const sendBtn = document.getElementById('send');
const apiKeyEl = document.getElementById('apiKey');
const modelEl = document.getElementById('model');
const keyStatusEl = document.getElementById('keyStatus');
const llmStatusEl = document.getElementById('llmStatus');

let sessionId = null;
let isSending = false;
let hasPendingApproval = false;

// A key nunca é enviada para nada além do próprio backend desta demo, e nunca
// é persistida (apenas sessionStorage do navegador do avaliador).
apiKeyEl.value = sessionStorage.getItem('adzhub_or_key') || '';
updateKeyStatus();
refreshProviderStatus();
window.setInterval(refreshProviderStatus, 30000);
apiKeyEl.addEventListener('input', () => {
  sessionStorage.setItem('adzhub_or_key', apiKeyEl.value);
  updateKeyStatus();
});

function updateKeyStatus() {
  if (apiKeyEl.value.trim()) {
    keyStatusEl.textContent = 'OpenRouter configurado';
    keyStatusEl.classList.add('ok');
  } else {
    keyStatusEl.textContent = 'sem chave OpenRouter';
    keyStatusEl.classList.remove('ok');
  }
}

async function refreshProviderStatus() {
  try {
    const res = await fetch('/api/providers');
    const { ollama } = await res.json();
    if (ollama.available) {
      llmStatusEl.textContent = `Ollama escutando: ${ollama.models.join(', ') || 'modelos disponíveis'}`;
      llmStatusEl.className = 'provider-badge online';
      return;
    }
  } catch (error) {
    // O badge abaixo informa a indisponibilidade sem interromper a interface.
  }
  llmStatusEl.textContent = 'Ollama indisponível';
  llmStatusEl.className = 'provider-badge offline';
}

async function ensureSession() {
  if (sessionId) return sessionId;
  const res = await fetch('/api/session', { method: 'POST' });
  const json = await res.json();
  sessionId = json.sessionId;
  return sessionId;
}

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

function addUserMessage(text) {
  const msg = el('div', 'msg user');
  msg.appendChild(el('div', 'bubble', escapeHtml(text)));
  messagesEl.appendChild(msg);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Markdown mínimo: bold, listas e quebras de linha — suficiente para as respostas do LLM.
function simpleMarkdown(text) {
  if (!text) return '';
  let html = escapeHtml(text);
  html = html.replace(/^### (.*)$/gm, '<b>$1</b>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  html = html.replace(/^- (.*)$/gm, '• $1');
  html = html.replace(/\n/g, '<br/>');
  return html;
}

function renderBlock(block) {
  const wrap = el('div', 'block');
  if (block.type === 'text') {
    if (block.title) wrap.appendChild(el('div', 'block-title', block.title));
    wrap.appendChild(el('div', '', simpleMarkdown(block.content)));
  } else if (block.type === 'table') {
    if (block.title) wrap.appendChild(el('div', 'block-title', block.title));
    wrap.appendChild(renderTable(block.columns, block.rows));
  } else if (block.type === 'chart') {
    if (block.title) wrap.appendChild(el('div', 'block-title', block.title));
    wrap.appendChild(renderChart(block.points));
  } else if (block.type === 'code') {
    if (block.title) wrap.appendChild(el('div', 'block-title', block.title));
    const pre = el('pre', 'code-block', escapeHtml(block.content));
    wrap.appendChild(pre);
  } else if (block.type === 'approval_result') {
    wrap.classList.add('approval-result', block.decision === 'approved' ? 'approved' : 'rejected');
    wrap.innerHTML = block.decision === 'approved'
      ? `✅ Aprovado: <b>${escapeHtml(block.ad_name)}</b> foi pausado (Sessão &amp; Permissões / deny-first).`
      : `🚫 Rejeitado: <b>${escapeHtml(block.ad_name)}</b> permanece ativo.`;
  } else {
    wrap.textContent = JSON.stringify(block);
  }
  return wrap;
}

function renderTable(columns, rows) {
  const table = el('table', 'data-table');
  const thead = el('thead');
  const headRow = el('tr');
  columns.forEach((c) => headRow.appendChild(el('th', '', c)));
  thead.appendChild(headRow);
  table.appendChild(thead);
  const tbody = el('tbody');
  (rows || []).forEach((r) => {
    const tr = el('tr');
    columns.forEach((c) => {
      const v = r[c];
      tr.appendChild(el('td', '', v === null || v === undefined ? '—' : String(v)));
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  return table;
}

function renderChart(points) {
  const width = 640;
  const height = 150;
  const padding = 30;
  const max = Math.max(1, ...points.map((p) => p.value || 0));
  const barWidth = (width - padding * 2) / points.length;
  let bars = '';
  points.forEach((p, i) => {
    const h = ((p.value || 0) / max) * (height - padding * 2);
    const x = padding + i * barWidth + 4;
    const y = height - padding - h;
    const color = p.value > max * 0.7 ? '#f85149' : '#6ea8fe';
    bars += `<rect x="${x}" y="${y}" width="${barWidth - 8}" height="${h}" fill="${color}" rx="3"></rect>`;
    bars += `<text x="${x + (barWidth - 8) / 2}" y="${height - padding + 14}" font-size="9" fill="#8b949e" text-anchor="middle">${escapeHtml(p.label.slice(0, 10))}</text>`;
    bars += `<text x="${x + (barWidth - 8) / 2}" y="${y - 4}" font-size="10" fill="#e6edf3" text-anchor="middle">${p.value}</text>`;
  });
  const svg = el('div');
  svg.innerHTML = `<svg class="chart-svg" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">${bars}</svg>`;
  return svg;
}

function renderApprovalCard(approval) {
  const card = el('div', 'block approval-card');
  card.appendChild(el('div', 'title', '⚠️ Aprovação necessária (Human-in-the-Loop)'));
  card.appendChild(el('div', '', escapeHtml(approval.description)));
  const actions = el('div', 'approval-actions');
  const approveBtn = el('button', 'btn-approve', 'Autorizar');
  const rejectBtn = el('button', 'btn-reject', 'Rejeitar');
  approveBtn.onclick = () => resolveApproval('approve', card, actions);
  rejectBtn.onclick = () => resolveApproval('reject', card, actions);
  actions.appendChild(approveBtn);
  actions.appendChild(rejectBtn);
  card.appendChild(actions);
  return card;
}

async function resolveApproval(decision, card, actions) {
  actions.querySelectorAll('button').forEach((b) => (b.disabled = true));
  const res = await fetch('/api/approve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, decision }),
  });
  const json = await res.json();
  card.remove();
  applyResult(json);
}

function addAssistantMessage(text, blocks, pendingApproval) {
  const msg = el('div', 'msg assistant');
  const bubble = el('div', 'bubble', simpleMarkdown(text));
  msg.appendChild(bubble);
  if (blocks && blocks.length) {
    const blocksWrap = el('div', 'blocks');
    blocks.forEach((b) => blocksWrap.appendChild(renderBlock(b)));
    msg.appendChild(blocksWrap);
  }
  if (pendingApproval) {
    const blocksWrap = el('div', 'blocks');
    blocksWrap.appendChild(renderApprovalCard(pendingApproval));
    msg.appendChild(blocksWrap);
  }
  messagesEl.appendChild(msg);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function renderTrace(trace) {
  traceEl.innerHTML = '';
  if (!trace || !trace.length) {
    traceEl.appendChild(el('div', 'trace-empty', 'Nenhum passo ainda.'));
    return;
  }
  trace.forEach((t) => {
    const item = el('div', 'trace-item');
    item.appendChild(el('div', 'paradigm', t.paradigm));
    item.appendChild(el('div', 'label', t.label));
    if (t.detail) item.appendChild(el('div', 'detail', t.detail));
    traceEl.appendChild(item);
  });
}

function applyResult(json) {
  if (json.error && json.error !== 'pending_approval_must_be_resolved_first') {
    addAssistantMessage(`Erro: ${json.error}`, [], null);
    return;
  }
  renderTrace(json.trace);
  addAssistantMessage(json.message, json.blocks, json.pendingApproval);
  hasPendingApproval = Boolean(json.pendingApproval);
  setComposerEnabled(!hasPendingApproval);
}

function setComposerEnabled(enabled) {
  inputEl.disabled = !enabled || isSending;
  sendBtn.disabled = !enabled || isSending;
  inputEl.placeholder = enabled
    ? 'Peça algo ao gestor... (Enter para enviar, Shift+Enter para nova linha)'
    : 'Resolva a aprovação pendente acima antes de continuar...';
}

async function send() {
  const text = inputEl.value.trim();
  if (!text || isSending) return;
  await ensureSession();
  addUserMessage(text);
  inputEl.value = '';
  isSending = true;
  setComposerEnabled(false);
  sendBtn.textContent = 'Enviando...';
  sendBtn.classList.add('is-sending');
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, message: text, apiKey: apiKeyEl.value.trim(), model: modelEl.value }),
    });
    const json = await res.json();
    applyResult(json);
  } catch (e) {
    addAssistantMessage(`Erro de rede: ${e.message}`, [], null);
    hasPendingApproval = false;
  } finally {
    isSending = false;
    sendBtn.textContent = 'Enviar';
    sendBtn.classList.remove('is-sending');
    setComposerEnabled(!hasPendingApproval);
  }
}

sendBtn.addEventListener('click', send);
document.querySelectorAll('.suggestion').forEach((suggestion) => {
  suggestion.addEventListener('click', () => {
    if (isSending || hasPendingApproval) return;
    inputEl.value = suggestion.dataset.prompt;
    send();
  });
});
inputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    send();
  }
});
