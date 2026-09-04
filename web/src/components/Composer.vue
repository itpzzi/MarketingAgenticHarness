<script setup lang="ts">
import { ref } from 'vue';
import { SendHorizonal } from 'lucide-vue-next';

const props = defineProps<{ disabled: boolean; sending: boolean; pending: boolean }>();
const emit = defineEmits<{ send: [text: string] }>();

const text = ref('');

function submit() {
  if (!text.value.trim() || props.disabled) return;
  emit('send', text.value);
  text.value = '';
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    submit();
  }
}

defineExpose({ setText: (t: string) => (text.value = t), submit });
</script>

<template>
  <div class="flex items-end gap-2 border-t border-border p-3">
    <textarea
      v-model="text"
      rows="2"
      :disabled="disabled"
      :placeholder="pending ? 'Resolva a aprovação pendente acima antes de continuar...' : sending ? 'O agente está trabalhando na sua solicitação...' : 'Peça algo ao gestor... (Enter para enviar, Shift+Enter para nova linha)'"
      class="flex-1 resize-none rounded-lg border border-border bg-[#0b0f14] px-3 py-2 text-sm text-slate-100 placeholder:text-muted focus:border-accent focus:outline-none disabled:opacity-50"
      @keydown="onKeydown"
    ></textarea>
    <button
      type="button"
      :disabled="disabled"
      class="flex h-10 items-center gap-1.5 rounded-lg bg-accent px-4 text-sm font-semibold text-[#04101f] disabled:opacity-40"
      @click="submit"
    >
      <SendHorizonal class="h-4 w-4" />
      {{ sending ? 'Enviando...' : 'Enviar' }}
    </button>
  </div>
</template>
