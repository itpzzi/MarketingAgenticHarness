<script setup lang="ts">
import { TriangleAlert } from 'lucide-vue-next';
import type { ApprovalRequest } from '../lib/types';

defineProps<{ approval: ApprovalRequest; disabled: boolean }>();
const emit = defineEmits<{ decide: [decision: 'approve' | 'reject'] }>();
</script>

<template>
  <div class="max-w-3xl rounded-lg border border-warn bg-[#1a1508] p-3">
    <div class="mb-2 flex items-center gap-2 font-semibold text-warn">
      <TriangleAlert class="h-4 w-4" />
      Aprovação necessária (Human-in-the-Loop)
    </div>
    <div class="text-sm">{{ approval.description }}</div>
    <div class="mt-3 flex gap-2">
      <button
        type="button"
        :disabled="disabled"
        class="rounded-md bg-accent2 px-3 py-1.5 text-xs font-semibold text-black disabled:opacity-40"
        @click="emit('decide', 'approve')"
      >
        Autorizar
      </button>
      <button
        type="button"
        :disabled="disabled"
        class="rounded-md bg-danger px-3 py-1.5 text-xs font-semibold text-black disabled:opacity-40"
        @click="emit('decide', 'reject')"
      >
        Rejeitar
      </button>
    </div>
  </div>
</template>
