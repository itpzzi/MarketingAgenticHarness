<script setup lang="ts">
import type { Block } from '../lib/types';
import { simpleMarkdown } from '../lib/markdown';

defineProps<{ block: Block }>();
</script>

<template>
  <div class="rounded-lg border border-border bg-[#0f151c] p-3">
    <div v-if="block.type === 'text'">
      <div v-if="block.title" class="mb-2 text-[11px] uppercase tracking-wide text-muted">{{ block.title }}</div>
      <div class="text-sm leading-relaxed" v-html="simpleMarkdown(block.content)"></div>
    </div>

    <div v-else-if="block.type === 'table'">
      <div v-if="block.title" class="mb-2 text-[11px] uppercase tracking-wide text-muted">{{ block.title }}</div>
      <div class="overflow-auto">
        <table class="w-full border-collapse text-xs">
          <thead>
            <tr>
              <th v-for="c in block.columns" :key="c" class="border-b border-border px-2 py-1 text-left text-muted">{{ c }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, i) in block.rows" :key="i" class="odd:bg-white/[0.02]">
              <td v-for="c in block.columns" :key="c" class="border-b border-border/60 px-2 py-1">
                {{ row[c] === null || row[c] === undefined ? '—' : row[c] }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-else-if="block.type === 'chart'">
      <div v-if="block.title" class="mb-2 text-[11px] uppercase tracking-wide text-muted">{{ block.title }}</div>
      <svg viewBox="0 0 640 150" class="w-full">
        <template v-for="(p, i) in block.points" :key="i">
          <rect
            :x="30 + i * ((640 - 60) / (block.points?.length || 1)) + 4"
            :y="150 - 30 - ((p.value || 0) / Math.max(1, ...(block.points || []).map((x) => x.value || 0))) * (150 - 60)"
            :width="(640 - 60) / (block.points?.length || 1) - 8"
            :height="((p.value || 0) / Math.max(1, ...(block.points || []).map((x) => x.value || 0))) * (150 - 60)"
            :fill="p.value > Math.max(1, ...(block.points || []).map((x) => x.value || 0)) * 0.7 ? '#f85149' : '#6ea8fe'"
            rx="3"
          />
          <text
            :x="30 + i * ((640 - 60) / (block.points?.length || 1)) + 4 + ((640 - 60) / (block.points?.length || 1) - 8) / 2"
            :y="150 - 30 + 14"
            font-size="9"
            fill="#8b949e"
            text-anchor="middle"
          >{{ p.label.slice(0, 10) }}</text>
          <text
            :x="30 + i * ((640 - 60) / (block.points?.length || 1)) + 4 + ((640 - 60) / (block.points?.length || 1) - 8) / 2"
            :y="150 - 30 - ((p.value || 0) / Math.max(1, ...(block.points || []).map((x) => x.value || 0))) * (150 - 60) - 4"
            font-size="10"
            fill="#e6edf3"
            text-anchor="middle"
          >{{ p.value }}</text>
        </template>
      </svg>
    </div>

    <div v-else-if="block.type === 'code'">
      <div v-if="block.title" class="mb-2 text-[11px] uppercase tracking-wide text-muted">{{ block.title }}</div>
      <pre class="overflow-auto rounded-md bg-black/40 p-3 text-xs leading-relaxed">{{ block.content }}</pre>
    </div>

    <div v-else class="text-xs text-muted">{{ JSON.stringify(block) }}</div>
  </div>
</template>
