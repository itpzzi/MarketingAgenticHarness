<script setup lang="ts">
import { CircleCheck, CircleX, FileCode2, FileText, Table2, BarChart3 } from 'lucide-vue-next';
import { computed } from 'vue';
import ActivityFeed from './ActivityFeed.vue';
import PlanChecklist from './PlanChecklist.vue';
import ApprovalCard from './ApprovalCard.vue';
import type { Artifact, ChatEntry } from '../lib/types';
import { simpleMarkdown } from '../lib/markdown';

const props = defineProps<{ entry: ChatEntry }>();
const emit = defineEmits<{ 'open-artifact': [artifact: Artifact]; decide: [entry: ChatEntry, decision: 'approve' | 'reject'] }>();

const KIND_ICON: Record<string, any> = { text: FileText, table: Table2, chart: BarChart3, code: FileCode2 };
const artifactList = computed<Artifact[]>(() => props.entry.blocks || []);
</script>

<template>
  <div v-if="entry.role === 'user'" class="flex justify-end">
    <div class="max-w-2xl rounded-2xl rounded-tr-sm bg-accent/90 px-4 py-2.5 text-sm text-[#04101f]">{{ entry.text }}</div>
  </div>

  <div v-else class="flex flex-col gap-2">
    <ActivityFeed v-if="entry.activity" :activity="entry.activity" />

    <PlanChecklist v-if="entry.planBlock" :block="entry.planBlock" />

    <div v-if="entry.text" class="max-w-2xl rounded-2xl rounded-tl-sm bg-panel px-4 py-2.5 text-sm leading-relaxed" v-html="simpleMarkdown(entry.text)"></div>

    <div v-for="(rb, i) in entry.resultBlocks" :key="i" class="max-w-2xl rounded-lg border px-3 py-2 text-xs" :class="rb.decision === 'approved' ? 'border-accent2/50 bg-accent2/10 text-accent2' : 'border-danger/50 bg-danger/10 text-danger'">
      <span v-if="rb.decision === 'approved'" class="inline-flex items-center gap-1.5"><CircleCheck class="h-3.5 w-3.5" /> Aprovado: <b>{{ rb.ad_name }}</b> foi pausado (Sessão &amp; Permissões / deny-first).</span>
      <span v-else class="inline-flex items-center gap-1.5"><CircleX class="h-3.5 w-3.5" /> Rejeitado: <b>{{ rb.ad_name }}</b> permanece ativo.</span>
    </div>

    <div v-if="artifactList.length" class="flex flex-wrap gap-2">
      <button
        v-for="artifact in artifactList"
        :key="artifact.id"
        type="button"
        class="inline-flex items-center gap-1.5 rounded-full border border-border bg-panel px-3 py-1 text-[11px] text-slate-200 hover:border-accent"
        @click="emit('open-artifact', artifact)"
      >
        <component :is="KIND_ICON[artifact.block.type]" class="h-3.5 w-3.5 text-accent" />
        {{ artifact.kind }}: {{ artifact.label }}
      </button>
    </div>

    <ApprovalCard
      v-if="entry.pendingApproval && !entry.resolved"
      :approval="entry.pendingApproval"
      :disabled="Boolean(entry.resolved)"
      @decide="(decision) => emit('decide', entry, decision)"
    />
  </div>
</template>
