<script setup lang="ts">
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
  <div class="surface flex flex-wrap items-center gap-2 rounded-lg p-3">
    <select
      v-if="showTargetFilter"
      v-model="filters.targetId"
      class="field min-w-36 flex-1"
      :class="filters.targetId ? 'border-accent text-accent' : ''"
    >
      <option value="">All targets</option>
      <option v-for="target in targets" :key="target.id" :value="target.id">{{ target.name }}</option>
    </select>

    <select
      v-model="filters.sourceId"
      class="field min-w-36 flex-1"
      :class="filters.sourceId ? 'border-accent text-accent' : ''"
    >
      <option value="">All sources</option>
      <option v-for="source in sources" :key="source.id" :value="source.id">{{ source.name }}</option>
    </select>

    <input
      v-model="filters.folderPath"
      class="field min-w-44 flex-1"
      :class="filters.folderPath ? 'border-accent' : ''"
      placeholder="Folder contains..."
    />

    <label
      class="flex shrink-0 cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition"
      :class="filters.includeSkipped ? 'border-accent bg-accent/10 text-accent' : 'border-line bg-ink text-slate-300'"
    >
      <input v-model="filters.includeSkipped" type="checkbox" class="accent-accent" />
      Include skipped
    </label>

    <label
      class="flex shrink-0 cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition"
      :class="filters.includeArchived ? 'border-accent bg-accent/10 text-accent' : 'border-line bg-ink text-slate-300'"
    >
      <input v-model="filters.includeArchived" type="checkbox" class="accent-accent" />
      Excluded
    </label>

    <label
      v-if="showTargetRules"
      class="flex shrink-0 cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition"
      :class="filters.excludePostedAnywhere ? 'border-accent bg-accent/10 text-accent' : 'border-line bg-ink text-slate-300'"
    >
      <input v-model="filters.excludePostedAnywhere" type="checkbox" class="accent-accent" />
      Posted anywhere
    </label>
  </div>
</template>
