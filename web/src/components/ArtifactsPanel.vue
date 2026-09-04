<script setup lang="ts">
import { ChevronLeft, ChevronRight, Download, FileCode2, FileText, Table2, BarChart3 } from 'lucide-vue-next';
import { ref } from 'vue';
import type { Artifact } from '../lib/types';
import { downloadArtifact } from '../lib/artifacts';

defineProps<{ artifacts: Artifact[] }>();
const emit = defineEmits<{ open: [artifact: Artifact] }>();

const collapsed = ref(false);
const KIND_ICON: Record<string, any> = { text: FileText, table: Table2, chart: BarChart3, code: FileCode2 };
</script>

<template>
  <aside
    class="flex flex-col border-l border-border bg-panel transition-all duration-200"
    :class="collapsed ? 'w-12 min-w-12 overflow-hidden p-3' : 'w-[350px] min-w-[350px] overflow-y-auto p-3'"
  >
    <div class="mb-3 flex items-center justify-between gap-2">
      <div v-if="!collapsed">
        <div class="text-xs font-semibold uppercase tracking-wide text-slate-200">Artefatos</div>
        <div class="text-[11px] text-muted">{{ artifacts.length ? `${artifacts.length} ${artifacts.length === 1 ? 'artefato gerado' : 'artefatos gerados'}` : 'Nenhum artefato nesta conversa' }}</div>
      </div>
      <button
        type="button"
        class="rounded-md border border-border p-1 text-muted hover:text-slate-100"
        :aria-label="collapsed ? 'Expandir artefatos' : 'Recolher artefatos'"
        @click="collapsed = !collapsed"
      >
        <component :is="collapsed ? ChevronRight : ChevronLeft" class="h-4 w-4" />
      </button>
    </div>

    <div v-if="!collapsed" class="flex flex-col gap-2">
      <div v-if="!artifacts.length" class="text-xs text-muted">Tabelas, gráficos e relatórios aparecerão aqui.</div>
      <details v-for="artifact in artifacts" :key="artifact.id" class="rounded-lg border border-border bg-[#0f151c]">
        <summary class="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs" @click.prevent="emit('open', artifact)">
          <component :is="KIND_ICON[artifact.block.type]" class="h-3.5 w-3.5 text-accent" />
          <span class="flex-1 truncate">{{ artifact.label }}</span>
          <span class="text-[10px] uppercase text-muted">{{ artifact.kind }}</span>
          <button type="button" class="rounded border border-border p-1 text-muted hover:text-slate-100" @click.stop="downloadArtifact(artifact.block, artifact.index)">
            <Download class="h-3 w-3" />
          </button>
        </summary>
      </details>
    </div>
  </aside>
</template>
