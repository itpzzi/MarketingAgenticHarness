<script setup lang="ts">
import { ArrowUpRight, Database, ListChecks, Sparkles, Wrench } from 'lucide-vue-next';
import type { ActivityState } from '../lib/types';

defineProps<{ activity: ActivityState }>();

const ICONS = { routing: ArrowUpRight, resource: Database, tool: Wrench, reasoning: Sparkles, plan: ListChecks } as const;

const STATUS_LABEL: Record<ActivityState['status'], string> = {
  working: 'Executando...',
  complete: 'Concluído',
  pending: 'Aguardando sua decisão',
};

const STATUS_CLASS: Record<ActivityState['status'], string> = {
  working: 'text-sky-300',
  complete: 'text-accent2',
  pending: 'text-warn',
};

const ICON_CLASS: Record<string, string> = {
  routing: 'text-sky-300',
  resource: 'text-teal-300',
  tool: 'text-warn',
  reasoning: 'text-sky-300',
  plan: 'text-accent2',
};
</script>

<template>
  <details class="max-w-3xl rounded-xl border border-[#2d4358] bg-[#131c26]" open>
    <summary class="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-medium">
      <span>Atividade do agente</span>
      <span class="text-[11px] font-medium" :class="STATUS_CLASS[activity.status]">
        {{ STATUS_LABEL[activity.status] }}
        <span v-if="activity.status === 'working'" class="ml-1 inline-block h-[5px] w-[5px] animate-pulse2 rounded-full bg-current"></span>
      </span>
    </summary>
    <div class="border-t border-[#2d4358] px-4 py-2">
      <div
        v-for="(step, i) in activity.steps"
        :key="i"
        class="flex gap-2 border-b border-[#1d2a36] py-2 last:border-b-0 animate-enter"
      >
        <component :is="ICONS[step.activityType] || ICONS.reasoning" class="mt-0.5 h-4 w-4 shrink-0" :class="ICON_CLASS[step.activityType] || ICON_CLASS.reasoning" />
        <div class="min-w-0">
          <div class="text-xs">{{ step.label }}</div>
          <div v-if="step.detail" class="mt-0.5 text-[11px] leading-snug text-muted">{{ step.detail }}</div>
        </div>
      </div>
    </div>
  </details>
</template>
