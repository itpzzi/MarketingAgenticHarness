const messagesEl = document.getElementById('messages');
const artifactsEl = document.getElementById('artifacts');
const artifactsStatusEl = document.getElementById('artifactsStatus');
const artifactsPanelEl = document.querySelector('.artifacts-panel');
const toggleArtifactsBtn = document.getElementById('toggleArtifacts');
const artifactDialog = document.getElementById('artifactDialog');
const artifactDialogTitleEl = document.getElementById('artifactDialogTitle');
const artifactDialogKindEl = document.getElementById('artifactDialogKind');
const artifactDialogContentEl = document.getElementById('artifactDialogContent');
const downloadActiveArtifactBtn = document.getElementById('downloadActiveArtifact');
const closeArtifactBtn = document.getElementById('closeArtifact');
const inputEl = document.getElementById('input');
const sendBtn = document.getElementById('send');
const apiKeyEl = document.getElementById('apiKey');
const modelEl = document.getElementById('model');
const keyStatusEl = document.getElementById('keyStatus');
const llmStatusEl = document.getElementById('llmStatus');

let sessionId = null;
let isSending = false;
let hasPendingApproval = false;
let artifactSequence = 0;
let activeArtifact = null;

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

function addActivityMessage() {
  const msg = el('div', 'msg assistant activity-message');
  const details = el('details', 'agent-activity');
  details.open = true;
  const summary = el('summary', '', 'Atividade do agente');
  const status = el('span', 'activity-status working', 'Preparando tarefas...');
  summary.appendChild(status);
  const list = el('div', 'activity-list');
  details.appendChild(summary);
  details.appendChild(list);
  msg.appendChild(details);
  messagesEl.appendChild(msg);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return { msg, details, list, status };
}

function addActivityStep(activity, trace) {
  const item = el('div', `activity-step ${trace.activityType || 'reasoning'}`);
  const icons = { routing: '↗', resource: '⌁', tool: '!', reasoning: '·' };
  item.appendChild(el('span', 'activity-icon', icons[trace.activityType] || icons.reasoning));
  const content = el('div', 'activity-content');
  content.appendChild(el('div', 'activity-label', trace.label));
  if (trace.detail) content.appendChild(el('div', 'activity-detail', trace.detail));
  item.appendChild(content);
  activity.list.appendChild(item);
  activity.status.textContent = 'Executando...';
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function completeActivity(activity, pendingApproval) {
  activity.status.textContent = pendingApproval ? 'Aguardando sua decisão' : 'Concluído';
  activity.status.className = pendingApproval ? 'activity-status pending' : 'activity-status complete';
  activity.details.open = Boolean(pendingApproval);
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

function artifactFile(block, index) {
  const title = block.title || `artefato-${index + 1}`;
  const safeTitle = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  if (block.type === 'table') {
    const rows = [block.columns, ...(block.rows || []).map((row) => block.columns.map((column) => row[column] ?? ''))];
    const content = rows.map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n');
    return { name: `${safeTitle}.csv`, content, type: 'text/csv;charset=utf-8' };
  }
  return { name: `${safeTitle}.md`, content: `# ${title}\n\n${block.content || ''}`, type: 'text/markdown;charset=utf-8' };
}

function downloadArtifact(block, index) {
  const file = artifactFile(block, index);
  const url = URL.createObjectURL(new Blob([file.content], { type: file.type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  link.click();
  URL.revokeObjectURL(url);
}

function addArtifacts(blocks) {
  const artifacts = (blocks || []).filter((block) => ['text', 'table', 'chart', 'code'].includes(block.type));
  if (!artifacts.length) return [];
  artifactsEl.querySelector('.artifacts-empty')?.remove();
  return artifacts.map((artifact, index) => {
    const artifactId = `artifact-${artifactSequence++}`;
    const details = el('details', 'artifact-card');
    details.id = artifactId;
    const summary = el('summary');
    const title = el('span', 'artifact-title', escapeHtml(artifact.title || 'Artefato gerado'));
    const labels = { text: 'Relatório', table: 'Tabela', chart: 'Gráfico', code: 'Código' };
    const kind = el('span', 'artifact-kind', labels[artifact.type]);
    const download = el('button', 'artifact-download', 'Baixar');
    download.type = 'button';
    download.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      downloadArtifact(artifact, index);
    });
    summary.addEventListener('click', (event) => {
      if (event.target !== download) {
        event.preventDefault();
        openArtifact(artifact, index);
      }
    });
    summary.append(title, kind, download);
    details.appendChild(summary);
    details.appendChild(renderBlock(artifact));
    artifactsEl.prepend(details);
    return { artifact, artifactId, index, label: artifact.title || 'Artefato gerado', kind: labels[artifact.type] };
  });
}

function updateArtifactStatus() {
  const total = artifactsEl.querySelectorAll('.artifact-card').length;
  artifactsStatusEl.textContent = total ? `${total} ${total === 1 ? 'artefato gerado' : 'artefatos gerados'}` : 'Nenhum artefato nesta conversa';
}

function openArtifact(artifact, index) {
  activeArtifact = { artifact, index };
  const labels = { text: 'Relatório', table: 'Tabela', chart: 'Gráfico', code: 'Código' };
  artifactDialogTitleEl.textContent = artifact.title || 'Artefato gerado';
  artifactDialogKindEl.textContent = labels[artifact.type];
  artifactDialogContentEl.replaceChildren(renderBlock(artifact));
  artifactDialog.showModal();
}

function addArtifactChips(artifacts) {
  if (!artifacts.length) return null;
  const chips = el('div', 'artifact-chips');
  artifacts.forEach(({ artifact, index, label, kind }) => {
    const chip = el('button', 'artifact-chip', `${kind}: ${escapeHtml(label)}`);
    chip.type = 'button';
    chip.addEventListener('click', () => openArtifact(artifact, index));
    chips.appendChild(chip);
  });
  return chips;
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
  const activity = addActivityMessage();
  activity.status.textContent = decision === 'approve' ? 'Aplicando decisão...' : 'Registrando decisão...';
  try {
    const res = await fetch('/api/approve/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, decision }),
    });
    if (!res.ok || !res.body) throw new Error('Não foi possível registrar a decisão.');
    const liveTrace = [];
    await readStream(res.body, {
      trace: (trace) => {
        addActivityStep(activity, trace);
        liveTrace.push(trace);
      },
      result: (json) => {
        completeActivity(activity, json.pendingApproval);
        card.remove();
        applyResult(json);
      },
      error: () => { throw new Error('O servidor não conseguiu concluir a decisão.'); },
    });
  } catch (error) {
    completeActivity(activity, false);
    addAssistantMessage(`Erro: ${error.message}`, [], null);
    actions.querySelectorAll('button').forEach((button) => (button.disabled = false));
  }
}

function addAssistantMessage(text, blocks, pendingApproval) {
  const msg = el('div', 'msg assistant');
  if (text) msg.appendChild(el('div', 'bubble', simpleMarkdown(text)));
  const artifacts = addArtifacts(blocks);
  const chips = addArtifactChips(artifacts);
  if (chips) msg.appendChild(chips);
  if (pendingApproval) {
    const blocksWrap = el('div', 'blocks');
    blocksWrap.appendChild(renderApprovalCard(pendingApproval));
    msg.appendChild(blocksWrap);
  }
  updateArtifactStatus();
  messagesEl.appendChild(msg);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function applyResult(json) {
  if (json.error && json.error !== 'pending_approval_must_be_resolved_first') {
    addAssistantMessage(`Erro: ${json.error}`, [], null);
    return;
  }
  addAssistantMessage(json.message, json.blocks, json.pendingApproval);
  hasPendingApproval = Boolean(json.pendingApproval);
  setComposerEnabled(!hasPendingApproval);
}

function setComposerEnabled(enabled) {
  inputEl.disabled = !enabled || isSending;
  sendBtn.disabled = !enabled || isSending;
  inputEl.placeholder = hasPendingApproval
    ? 'Resolva a aprovação pendente acima antes de continuar...'
    : enabled
      ? 'Peça algo ao gestor... (Enter para enviar, Shift+Enter para nova linha)'
      : 'O agente está trabalhando na sua solicitação...';
}

async function send() {
  const text = inputEl.value.trim();
  if (!text || isSending) return;
  await ensureSession();
  addUserMessage(text);
  const activity = addActivityMessage();
  inputEl.value = '';
  isSending = true;
  setComposerEnabled(false);
  sendBtn.textContent = 'Enviando...';
  sendBtn.classList.add('is-sending');
  try {
    const res = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, message: text, apiKey: apiKeyEl.value.trim(), model: modelEl.value }),
    });
    if (!res.ok || !res.body) throw new Error('Não foi possível iniciar a resposta.');
    const liveTrace = [];
    await readStream(res.body, {
      trace: (trace) => {
        addActivityStep(activity, trace);
        liveTrace.push(trace);
      },
      result: (json) => {
        completeActivity(activity, json.pendingApproval);
        applyResult(json);
      },
      error: () => { throw new Error('O servidor não conseguiu concluir a resposta.'); },
    });
  } catch (e) {
    completeActivity(activity, false);
    addAssistantMessage(`Erro de rede: ${e.message}`, [], null);
    hasPendingApproval = false;
  } finally {
    isSending = false;
    sendBtn.textContent = 'Enviar';
    sendBtn.classList.remove('is-sending');
    setComposerEnabled(!hasPendingApproval);
  }
}

async function readStream(stream, handlers) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const events = buffer.split('\n\n');
    buffer = events.pop();
    events.forEach((event) => {
      const type = event.match(/^event: (.+)$/m)?.[1];
      const data = event.match(/^data: (.+)$/m)?.[1];
      if (type && data && handlers[type]) handlers[type](JSON.parse(data));
    });
    if (done) break;
  }
}

sendBtn.addEventListener('click', send);
toggleArtifactsBtn.addEventListener('click', () => {
  const isCollapsed = artifactsPanelEl.classList.toggle('is-collapsed');
  toggleArtifactsBtn.innerHTML = isCollapsed ? '&rsaquo;' : '&lsaquo;';
  toggleArtifactsBtn.setAttribute('aria-label', isCollapsed ? 'Expandir artefatos' : 'Recolher artefatos');
});
closeArtifactBtn.addEventListener('click', () => artifactDialog.close());
downloadActiveArtifactBtn.addEventListener('click', () => {
  if (activeArtifact) downloadArtifact(activeArtifact.artifact, activeArtifact.index);
});
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
