<script setup lang="ts">
import { CheckSquare, Square } from 'lucide-vue-next';
import type { Block } from '../lib/types';

defineProps<{ block: Block }>();
</script>

<template>
  <div class="mb-2 rounded-lg border border-border bg-[#10171f] p-3">
    <div class="mb-2 text-[11px] uppercase tracking-wide text-muted">{{ block.title || 'Plano de execução' }}</div>
    <div class="flex flex-col gap-1.5">
      <div v-for="step in block.steps" :key="step.id" class="flex items-start gap-2">
        <component
          :is="step.status === 'done' ? CheckSquare : Square"
          class="mt-0.5 h-3.5 w-3.5 shrink-0"
          :class="step.status === 'done' ? 'text-accent2' : 'text-muted'"
        />
        <div class="min-w-0">
          <div class="text-xs" :class="step.status === 'done' ? 'text-muted line-through' : 'text-slate-100'">{{ step.label }}</div>
          <div class="mt-0.5 text-[10px] uppercase tracking-wide text-accent">{{ step.paradigm }}</div>
        </div>
      </div>
    </div>
  </div>
</template>
