<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import TopBar from './components/TopBar.vue';
import ChatMessage from './components/ChatMessage.vue';
import Composer from './components/Composer.vue';
import ArtifactsPanel from './components/ArtifactsPanel.vue';
import ArtifactDialog from './components/ArtifactDialog.vue';
import { useChat } from './lib/useChat';
import type { Artifact, ChatEntry } from './lib/types';

const {
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
} = useChat();

const messagesEl = ref<HTMLElement | null>(null);
const activeArtifact = ref<Artifact | null>(null);
let pollHandle: number | undefined;

const SUGGESTIONS = [
  { label: 'Cruzar gastos e pausar criativo', prompt: 'Cruze os gastos de Meta Ads com os leads do CRM e pause o criativo ineficaz, sugerindo variações de copy' },
  { label: 'Diagnosticar anomalias', prompt: 'Faça um diagnóstico da conta, tem alguma anomalia?' },
  { label: 'Montar pauta de reunião', prompt: 'Monte a pauta da próxima reunião com o cliente' },
  { label: 'Campanha com maior orçamento', prompt: 'Qual campanha possui o maior orçamento diário?' },
];

function scrollToBottom() {
  nextTick(() => {
    if (messagesEl.value) messagesEl.value.scrollTop = messagesEl.value.scrollHeight;
  });
}

watch(() => messages.length, scrollToBottom);

function onApiKeyInput(value: string) {
  apiKey.value = value;
  persistApiKey();
}

async function handleSend(text: string) {
  await send(text);
}

async function handleDecide(entry: ChatEntry, decision: 'approve' | 'reject') {
  await resolveApproval(entry, decision);
}

function openArtifact(artifact: Artifact) {
  activeArtifact.value = artifact;
}

onMounted(() => {
  refreshProviderStatus();
  pollHandle = window.setInterval(refreshProviderStatus, 30000);
});
onUnmounted(() => {
  if (pollHandle) window.clearInterval(pollHandle);
});
</script>

<template>
  <div class="flex h-screen flex-col">
    <TopBar :api-key="apiKey" :model="model" :ollama-status="ollamaStatus" @update:api-key="onApiKeyInput" @update:model="(v) => (model = v)" />

    <div class="flex min-h-0 flex-1">
      <section class="flex min-w-0 flex-1 flex-col">
        <div ref="messagesEl" class="flex-1 space-y-3 overflow-y-auto p-4">
          <ChatMessage
            v-for="entry in messages"
            :key="entry.id"
            :entry="entry"
            @open-artifact="openArtifact"
            @decide="handleDecide"
          />
        </div>

        <div class="flex flex-wrap gap-2 px-4 pb-2">
          <button
            v-for="s in SUGGESTIONS"
            :key="s.label"
            type="button"
            :disabled="isSending || hasPendingApproval"
            class="rounded-full border border-border bg-panel px-3 py-1.5 text-xs text-slate-200 hover:border-accent disabled:opacity-40"
            @click="handleSend(s.prompt)"
          >
            {{ s.label }}
          </button>
        </div>

        <Composer :disabled="isSending || hasPendingApproval" :sending="isSending" :pending="hasPendingApproval" @send="handleSend" />
      </section>

      <ArtifactsPanel :artifacts="artifacts" @open="openArtifact" />
    </div>

    <ArtifactDialog :artifact="activeArtifact" @close="activeArtifact = null" />
  </div>
</template>
