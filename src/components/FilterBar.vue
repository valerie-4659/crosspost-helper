<script setup lang="ts">
import { ChevronDown } from "lucide-vue-next";
import type { ImageFilters } from "@/types/image";
import type { ImageSource } from "@/types/imageSource";
import type { PostingTarget } from "@/types/postingTarget";

const filters = defineModel<Partial<ImageFilters>>("filters", { required: true });

defineProps<{
  sources: ImageSource[];
  targets?: PostingTarget[];
  showTargetRules?: boolean;
  showTargetFilter?: boolean;
}>();
</script>

<template>
  <div class="flex flex-wrap items-center gap-2">

    <!-- Target select -->
    <div v-if="showTargetFilter" class="relative min-w-36 flex-1">
      <select
        :value="filters.targetId ?? ''"
        class="w-full appearance-none rounded-lg border bg-panel py-1.5 pl-3 pr-8 text-xs transition focus:outline-none focus:ring-1 focus:ring-accent/40 cursor-pointer"
        :class="filters.targetId ? 'border-accent text-accent bg-accent/10' : 'border-line text-slate-300 hover:border-slate-500'"
        @change="filters.targetId = ($event.target as HTMLSelectElement).value || undefined"
      >
        <option value="">All targets</option>
        <option v-for="target in targets" :key="target.id" :value="target.id">{{ target.name }}</option>
      </select>
      <ChevronDown class="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3" :class="filters.targetId ? 'text-accent' : 'text-slate-500'" />
    </div>

    <!-- Source select -->
    <div class="relative min-w-36 flex-1">
      <select
        :value="filters.sourceId ?? ''"
        class="w-full appearance-none rounded-lg border bg-panel py-1.5 pl-3 pr-8 text-xs transition focus:outline-none focus:ring-1 focus:ring-accent/40 cursor-pointer"
        :class="filters.sourceId ? 'border-accent text-accent bg-accent/10' : 'border-line text-slate-300 hover:border-slate-500'"
        @change="filters.sourceId = ($event.target as HTMLSelectElement).value || undefined"
      >
        <option value="">All sources</option>
        <option v-for="source in sources" :key="source.id" :value="source.id">{{ source.name }}</option>
      </select>
      <ChevronDown class="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3" :class="filters.sourceId ? 'text-accent' : 'text-slate-500'" />
    </div>

    <!-- Folder search -->
    <input
      v-model="filters.folderPath"
      class="min-w-44 flex-1 rounded-lg border bg-panel px-3 py-1.5 text-xs text-slate-300 placeholder:text-slate-600 transition focus:outline-none focus:ring-1 focus:ring-accent/40"
      :class="filters.folderPath ? 'border-accent' : 'border-line hover:border-slate-500'"
      placeholder="Folder contains…"
    />

    <!-- Toggle pills -->
    <button
      class="shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium transition"
      :class="filters.includeSkipped ? 'border-accent bg-accent/10 text-accent' : 'border-line text-slate-400 hover:border-slate-500 hover:text-slate-200'"
      @click="filters.includeSkipped = !filters.includeSkipped"
    >Incl. skipped</button>

    <button
      class="shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium transition"
      :class="filters.includeArchived ? 'border-amber-500/60 bg-amber-500/10 text-amber-400' : 'border-line text-slate-400 hover:border-slate-500 hover:text-slate-200'"
      @click="filters.includeArchived = !filters.includeArchived"
    >Incl. excluded</button>

    <button
      v-if="showTargetRules"
      class="shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium transition"
      :class="filters.excludePostedAnywhere ? 'border-accent bg-accent/10 text-accent' : 'border-line text-slate-400 hover:border-slate-500 hover:text-slate-200'"
      @click="filters.excludePostedAnywhere = !filters.excludePostedAnywhere"
    >Posted anywhere</button>

  </div>
</template>
