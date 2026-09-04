<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  apiKey: string;
  model: string;
  ollamaStatus: { checking: boolean; available: boolean; models: string[] };
}>();
const emit = defineEmits<{ 'update:apiKey': [value: string]; 'update:model': [value: string] }>();

const keyConfigured = computed(() => Boolean(props.apiKey.trim()));

const providerLabel = computed(() => {
  if (props.ollamaStatus.checking) return 'Verificando Ollama...';
  if (props.ollamaStatus.available) return `Ollama escutando: ${props.ollamaStatus.models.join(', ') || 'modelos disponíveis'}`;
  return 'Ollama indisponível';
});

const providerClass = computed(() => {
  if (props.ollamaStatus.checking) return 'border-warn text-warn animate-pulse2';
  if (props.ollamaStatus.available) return 'border-[#287f42] text-[#7ee2a0] bg-[#0d2a15]';
  return 'border-[#6f2b2b] text-[#ffb3ae] bg-[#2a0d0d]';
});
</script>

<template>
  <header class="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-panel px-4 py-2.5">
    <div class="flex items-center gap-2.5">
      <span class="h-2.5 w-2.5 rounded-full bg-accent shadow-[0_0_8px_theme(colors.accent)]"></span>
      <div>
        <div class="text-sm font-semibold">AdzHubOrchestrator</div>
        <div class="text-[11px] text-muted">harness híbrido · protótipo ilustrativo</div>
      </div>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <select
        :value="model"
        class="rounded-md border border-border bg-[#0b0f14] px-2 py-1.5 text-xs text-slate-100"
        @change="emit('update:model', ($event.target as HTMLSelectElement).value)"
      >
        <option value="openai/gpt-4o-mini">openai/gpt-4o-mini (fronteira)</option>
        <option value="anthropic/claude-3.5-sonnet">anthropic/claude-3.5-sonnet (fronteira)</option>
        <option value="meta-llama/llama-3.1-8b-instruct">meta-llama/llama-3.1-8b-instruct (rápido/barato)</option>
      </select>
      <input
        :value="apiKey"
        type="password"
        placeholder="cole sua OPENROUTER_API_KEY (fica só no seu navegador)"
        class="w-[280px] rounded-md border border-border bg-[#0b0f14] px-2 py-1.5 text-xs text-slate-100 placeholder:text-muted"
        @input="emit('update:apiKey', ($event.target as HTMLInputElement).value)"
      />
      <span class="text-[11px]" :class="keyConfigured ? 'text-accent2' : 'text-warn'">{{ keyConfigured ? 'OpenRouter configurado' : 'sem chave OpenRouter' }}</span>
      <span class="provider-badge inline-flex max-w-[280px] items-center gap-1.5 truncate rounded-full border px-2 py-1 text-[11px]" :class="providerClass">{{ providerLabel }}</span>
    </div>
  </header>
</template>
