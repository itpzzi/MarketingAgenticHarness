export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

// Markdown mínimo: bold, listas e quebras de linha — suficiente para as respostas do LLM.
export function simpleMarkdown(text?: string | null): string {
  if (!text) return '';
  let html = escapeHtml(text);
  html = html.replace(/^### (.*)$/gm, '<b>$1</b>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  html = html.replace(/^- (.*)$/gm, '• $1');
  html = html.replace(/\n/g, '<br/>');
  return html;
}
