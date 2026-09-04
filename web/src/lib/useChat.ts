import { reactive, ref } from 'vue';
import { ensureSession, fetchProviderStatus, streamApprove, streamChat } from './api';
import type { Artifact, Block, ChatEntry, ChatResult } from './types';

let entrySequence = 0;
let artifactSequence = 0;

function nextId(prefix: string): string {
  entrySequence += 1;
  return `${prefix}-${entrySequence}`;
}

export function useChat() {
  const messages = reactive<ChatEntry[]>([
    {
      id: nextId('welcome'),
      role: 'assistant',
      text: 'Olá! Sou o **AdzHubOrchestrator**, protótipo do harness híbrido para o desafio AdzHub (cliente mock: **Housewhey**).\n\nEscolha uma sugestão ou faça um pedido.',
    },
  ]);
  const artifacts = reactive<Artifact[]>([]);
  const sessionId = ref<string | null>(null);
  const isSending = ref(false);
  const hasPendingApproval = ref(false);
  const apiKey = ref(sessionStorage.getItem('adzhub_or_key') || '');
  const model = ref('openai/gpt-4o-mini');
  const ollamaStatus = reactive<{ checking: boolean; available: boolean; models: string[] }>({
    checking: true,
    available: false,
    models: [],
  });

  function persistApiKey(): void {
    sessionStorage.setItem('adzhub_or_key', apiKey.value);
  }

  async function refreshProviderStatus(): Promise<void> {
    const status = await fetchProviderStatus();
    ollamaStatus.checking = false;
    ollamaStatus.available = status.available;
    ollamaStatus.models = status.models;
  }

  function collectArtifacts(blocks: Block[]): Artifact[] {
    const collected = (blocks || []).filter((b) => ['text', 'table', 'chart', 'code'].includes(b.type));
    const labels: Record<string, string> = { text: 'Relatório', table: 'Tabela', chart: 'Gráfico', code: 'Código' };
    return collected.map((block, index) => {
      artifactSequence += 1;
      const artifact: Artifact = {
        block,
        id: `artifact-${artifactSequence}`,
        index,
        label: block.title || 'Artefato gerado',
        kind: labels[block.type],
      };
      artifacts.unshift(artifact);
      return artifact;
    });
  }

  function applyResult(entry: ChatEntry, json: ChatResult): void {
    if (json.error && json.error !== 'pending_approval_must_be_resolved_first') {
      entry.text = `Erro: ${json.error}`;
      return;
    }
    entry.text = json.message ?? undefined;
    entry.planBlock = (json.blocks || []).find((b) => b.type === 'plan') || null;
    entry.resultBlocks = (json.blocks || []).filter((b) => b.type === 'approval_result');
    entry.blocks = collectArtifacts(json.blocks || []);
    entry.pendingApproval = json.pendingApproval;
    hasPendingApproval.value = Boolean(json.pendingApproval);
  }

  async function send(text: string): Promise<void> {
    if (!text.trim() || isSending.value) return;
    if (!sessionId.value) sessionId.value = await ensureSession();

    messages.push({ id: nextId('user'), role: 'user', text });
    const entry: ChatEntry = { id: nextId('assistant'), role: 'assistant', activity: { status: 'working', steps: [] } };
    messages.push(entry);

    isSending.value = true;
    hasPendingApproval.value = false;
    try {
      await streamChat(
        { sessionId: sessionId.value as string, message: text, apiKey: apiKey.value.trim(), model: model.value },
        {
          trace: (trace) => entry.activity!.steps.push(trace),
          result: (json) => {
            entry.activity!.status = json.pendingApproval ? 'pending' : 'complete';
            applyResult(entry, json);
          },
          error: () => {
            throw new Error('O servidor não conseguiu concluir a resposta.');
          },
        }
      );
    } catch (e: any) {
      entry.activity!.status = 'complete';
      entry.text = `Erro de rede: ${e.message}`;
      hasPendingApproval.value = false;
    } finally {
      isSending.value = false;
    }
  }

  async function resolveApproval(entry: ChatEntry, decision: 'approve' | 'reject'): Promise<void> {
    entry.resolved = true;
    const followUp: ChatEntry = { id: nextId('assistant'), role: 'assistant', activity: { status: 'working', steps: [] } };
    followUp.activity!.status = decision === 'approve' ? 'working' : 'working';
    messages.push(followUp);
    try {
      await streamApprove(
        { sessionId: sessionId.value as string, decision },
        {
          trace: (trace) => followUp.activity!.steps.push(trace),
          result: (json) => {
            followUp.activity!.status = json.pendingApproval ? 'pending' : 'complete';
            applyResult(followUp, json);
          },
          error: () => {
            throw new Error('O servidor não conseguiu concluir a decisão.');
          },
        }
      );
    } catch (e: any) {
      followUp.activity!.status = 'complete';
      followUp.text = `Erro: ${e.message}`;
    }
  }

  return {
    messages,
    artifacts,
    isSending,
    hasPendingApproval,
    apiKey,
    model,
    ollamaStatus,
    persistApiKey,
    refreshProviderStatus,
    send,
    resolveApproval,
  };
}
