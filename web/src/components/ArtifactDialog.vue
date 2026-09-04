<script setup lang="ts">
import { X, Download } from 'lucide-vue-next';
import BlockRenderer from './BlockRenderer.vue';
import type { Artifact } from '../lib/types';
import { downloadArtifact } from '../lib/artifacts';

const props = defineProps<{ artifact: Artifact | null }>();
const emit = defineEmits<{ close: [] }>();

const LABELS: Record<string, string> = { text: 'Relatório', table: 'Tabela', chart: 'Gráfico', code: 'Código' };
</script>

<template>
  <div v-if="artifact" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" @click.self="emit('close')">
    <div class="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl border border-border bg-panel">
      <div class="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <div class="text-[11px] uppercase tracking-wide text-muted">{{ LABELS[artifact.block.type] }}</div>
          <div class="text-sm font-semibold">{{ artifact.block.title }}</div>
        </div>
        <div class="flex items-center gap-2">
          <button type="button" class="rounded-md border border-border p-1.5 text-muted hover:text-slate-100" @click="downloadArtifact(artifact.block, artifact.index)">
            <Download class="h-4 w-4" />
          </button>
          <button type="button" class="rounded-md border border-border p-1.5 text-muted hover:text-slate-100" @click="emit('close')">
            <X class="h-4 w-4" />
          </button>
        </div>
      </div>
      <div class="overflow-auto p-4">
        <BlockRenderer :block="artifact.block" />
      </div>
    </div>
  </div>
</template>
