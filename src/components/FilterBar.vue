<script setup lang="ts">
import type { ImageFilters, ImageRating } from "@/types/image";
import type { ImageSource } from "@/types/imageSource";
import type { PostingTarget } from "@/types/postingTarget";

const filters = defineModel<Partial<ImageFilters>>("filters", { required: true });

defineProps<{
  sources: ImageSource[];
  targets?: PostingTarget[];
  showTargetRules?: boolean;
  showTargetFilter?: boolean;
}>();

const ratings: Array<ImageRating | "all"> = ["all", "sfw", "suggestive", "nsfw", "unknown"];
</script>

<template>
  <div class="surface grid grid-cols-2 gap-3 rounded-lg p-3 lg:grid-cols-6">
    <select v-if="showTargetFilter" v-model="filters.targetId" class="field">
      <option value="">All targets</option>
      <option v-for="target in targets" :key="target.id" :value="target.id">Available for {{ target.name }}</option>
    </select>

    <select v-model="filters.sourceId" class="field">
      <option value="">All sources</option>
      <option v-for="source in sources" :key="source.id" :value="source.id">{{ source.name }}</option>
    </select>

    <input v-model="filters.folderPath" class="field" placeholder="Folder contains..." />

    <select v-model="filters.rating" class="field">
      <option v-for="rating in ratings" :key="rating" :value="rating">{{ rating }}</option>
    </select>

    <label class="flex items-center gap-2 rounded-md border border-line bg-ink px-3 text-sm text-slate-300">
      <input v-model="filters.includeSkipped" type="checkbox" class="accent-accent" />
      Include skipped
    </label>

    <label class="flex items-center gap-2 rounded-md border border-line bg-ink px-3 text-sm text-slate-300">
      <input v-model="filters.includeArchived" type="checkbox" class="accent-accent" />
      Archived
    </label>

    <label v-if="showTargetRules" class="flex items-center gap-2 rounded-md border border-line bg-ink px-3 text-sm text-slate-300">
      <input v-model="filters.excludePostedAnywhere" type="checkbox" class="accent-accent" />
      Posted anywhere
    </label>
  </div>
</template>
