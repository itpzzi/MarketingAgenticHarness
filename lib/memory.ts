// Memória de curto e longo prazo do chat, isolada por sessão (independente do
// Supercérebro/Mem0+Graphiti, que guarda contexto e semântica *da marca*).
// Esta memória guarda o *fio da conversa*.
//
// - Curto prazo: janela rolante das últimas mensagens (contexto imediato).
// - Longo prazo: até 20 fatos/resumos persistentes por sessão (estilo
//   "memória" do ChatGPT), alimentados por sumarização incremental — quando a
//   janela de curto prazo transborda, o turno mais antigo é condensado e
//   promovido ao longo prazo em vez de simplesmente descartado.
const SHORT_TERM_MAX_TURNS = 12;
const LONG_TERM_MAX_ITEMS = 20;

interface Turn {
  role: 'user' | 'assistant';
  content: string;
  at: string;
}

interface LongTermItem {
  text: string;
  at: string;
}

interface SessionMemory {
  shortTerm: Turn[];
  longTerm: LongTermItem[];
}

const memories = new Map<string, SessionMemory>();

function getMemory(sessionId: string): SessionMemory {
  if (!memories.has(sessionId)) {
    memories.set(sessionId, { shortTerm: [], longTerm: [] });
  }
  return memories.get(sessionId) as SessionMemory;
}

function condense(turn: Turn): string {
  const text = turn.content.replace(/\s+/g, ' ').trim();
  return `[turno anterior · ${turn.role === 'user' ? 'gestor' : 'agente'}] ${text.slice(0, 220)}`;
}

// FIFO com deduplicação simples: nunca guarda mais que 20 fatos por sessão.
function remember(sessionId: string, fact: string | null | undefined): void {
  if (!fact) return;
  const mem = getMemory(sessionId);
  if (mem.longTerm.some((item) => item.text === fact)) return;
  mem.longTerm.push({ text: fact, at: new Date().toISOString() });
  if (mem.longTerm.length > LONG_TERM_MAX_ITEMS) mem.longTerm.shift();
}

function addTurn(sessionId: string, role: 'user' | 'assistant', content: string | null | undefined): void {
  if (!content) return;
  const mem = getMemory(sessionId);
  mem.shortTerm.push({ role, content: String(content), at: new Date().toISOString() });
  while (mem.shortTerm.length > SHORT_TERM_MAX_TURNS) {
    const dropped = mem.shortTerm.shift();
    if (dropped) remember(sessionId, condense(dropped));
  }
}

interface ExtractFactsArgs {
  userMessage?: string | null;
  flowName?: string | null;
  blocks?: { type: string; decision?: string; ad_name?: string }[];
  finalMessage?: string | null;
}

// Heurística leve (sem custo extra de LLM) para promover fatos duráveis do
// turno recém-concluído: decisões de aprovação e pedidos que ficaram ambíguos.
function extractFacts(sessionId: string, { userMessage, flowName, blocks = [], finalMessage }: ExtractFactsArgs): void {
  const approvalBlock = blocks.find((b) => b.type === 'approval_result');
  if (approvalBlock) {
    remember(
      sessionId,
      approvalBlock.decision === 'approved'
        ? `Criativo "${approvalBlock.ad_name}" foi pausado após aprovação do gestor.`
        : `Gestor rejeitou a pausa do criativo "${approvalBlock.ad_name}"; ele segue ativo.`
    );
  }
  if (flowName === 'general' && /detalhe|específic|especific|esclare|reformul/i.test(finalMessage || '')) {
    remember(sessionId, `Pedido "${(userMessage || '').slice(0, 140)}" ficou ambíguo; o agente pediu esclarecimento ao gestor.`);
  }
}

function shortTermContext(sessionId: string): string {
  const mem = getMemory(sessionId);
  return mem.shortTerm.map((t) => `${t.role === 'user' ? 'Gestor' : 'Agente'}: ${t.content}`).join('\n');
}

function longTermContext(sessionId: string): string {
  const mem = getMemory(sessionId);
  return mem.longTerm.map((item) => `- ${item.text}`).join('\n');
}

// String pronta para injetar no system prompt de qualquer chamada de LLM do
// harness, unindo os dois níveis de memória desta sessão.
function buildMemoryBlock(sessionId: string): string {
  const shortTerm = shortTermContext(sessionId);
  const longTerm = longTermContext(sessionId);
  if (!shortTerm && !longTerm) return '';
  return [
    longTerm ? `Memória de longo prazo desta conta (fatos persistentes, até ${LONG_TERM_MAX_ITEMS} itens):\n${longTerm}` : '',
    shortTerm ? `Histórico recente da conversa (curto prazo, últimos turnos):\n${shortTerm}` : '',
    'Use essa memória para manter coerência entre turnos e não repetir perguntas já respondidas.',
  ].filter(Boolean).join('\n\n');
}

function resetSession(sessionId: string): void {
  memories.delete(sessionId);
}

export {
  addTurn,
  remember,
  extractFacts,
  shortTermContext,
  longTermContext,
  buildMemoryBlock,
  resetSession,
  SHORT_TERM_MAX_TURNS,
  LONG_TERM_MAX_ITEMS,
};
