<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { ArrowDownUp, RefreshCcw } from "lucide-vue-next";
import { listCheckpointStats } from "@/repositories/imageRepository";
import type { CheckpointStat } from "@/repositories/imageRepository";

const stats   = ref<CheckpointStat[]>([]);
const loading = ref(false);
const error   = ref("");
const sortBy  = ref<"count" | "name">("count");

const sorted = computed(() => {
  const list = [...stats.value];
  if (sortBy.value === "name") list.sort((a, b) => a.checkpoint.localeCompare(b.checkpoint));
  return list;
});

const total = computed(() => stats.value.reduce((s, r) => s + r.count, 0));

const maxCount = computed(() => Math.max(...stats.value.map((r) => r.count), 1));

function pct(count: number) {
  return Math.round((count / maxCount.value) * 100);
}

function toggleSort() {
  sortBy.value = sortBy.value === "count" ? "name" : "count";
}

async function load() {
  loading.value = true;
  error.value = "";
  try {
    stats.value = await listCheckpointStats();
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="flex h-full flex-col overflow-hidden">
    <!-- Header -->
    <div class="flex shrink-0 items-center justify-between border-b border-line px-6 py-4">
      <div>
        <h1 class="text-lg font-semibold text-white">Checkpoint Stats</h1>
        <p v-if="!loading && total > 0" class="mt-0.5 text-xs text-slate-400">
          {{ total.toLocaleString() }} images across {{ stats.length }} checkpoints
        </p>
      </div>
      <div class="flex items-center gap-2">
        <button class="button flex items-center gap-1.5 text-xs" @click="toggleSort">
          <ArrowDownUp class="h-3.5 w-3.5" />
          Sort: {{ sortBy === "count" ? "Count" : "Name" }}
        </button>
        <button class="button flex items-center gap-1.5 text-xs" :disabled="loading" @click="load">
          <RefreshCcw class="h-3.5 w-3.5" :class="loading ? 'animate-spin' : ''" />
          Refresh
        </button>
      </div>
    </div>

    <!-- Error -->
    <div v-if="error" class="mx-6 mt-4 rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
      {{ error }}
    </div>

    <!-- Loading -->
    <div v-if="loading && !stats.length" class="flex flex-1 items-center justify-center text-sm text-slate-400">
      Loading…
    </div>

    <!-- Empty -->
    <div v-else-if="!loading && stats.length === 0" class="flex flex-1 items-center justify-center text-sm text-slate-400">
      No images found in the library.
    </div>

    <!-- Table -->
    <div v-else class="flex-1 overflow-y-auto px-6 py-4">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-line text-xs uppercase tracking-wide text-slate-500">
            <th class="pb-2 pr-4 text-left font-medium">Checkpoint</th>
            <th class="pb-2 pr-6 text-right font-medium">Images</th>
            <th class="pb-2 text-left font-medium">Distribution</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-line">
          <tr
            v-for="row in sorted"
            :key="row.checkpoint"
            class="group"
          >
            <td class="py-2.5 pr-4 font-mono text-xs text-slate-200">{{ row.checkpoint }}</td>
            <td class="py-2.5 pr-6 text-right tabular-nums text-slate-300">{{ row.count.toLocaleString() }}</td>
            <td class="py-2.5">
              <div class="flex items-center gap-2">
                <div class="h-2 flex-1 overflow-hidden rounded-full bg-panel">
                  <div
                    class="h-full rounded-full bg-accent transition-all"
                    :style="{ width: pct(row.count) + '%' }"
                  />
                </div>
                <span class="w-8 text-right text-xs text-slate-500">{{ pct(row.count) }}%</span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
