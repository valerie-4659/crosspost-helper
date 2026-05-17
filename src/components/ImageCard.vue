<script setup lang="ts">
import { computed } from "vue";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Archive, ExternalLink, RotateCcw } from "lucide-vue-next";
import StatusBadge from "./StatusBadge.vue";
import type { ImageWithPostState } from "@/types/image";
import type { PostingTarget } from "@/types/postingTarget";

const props = defineProps<{
  image: ImageWithPostState;
  targets: PostingTarget[];
}>();

const emit = defineEmits<{
  archive: [imageId: string, archived: boolean];
  open: [image: ImageWithPostState];
}>();

const imageUrl = computed(() => {
  if (props.image.thumbnailUrl) return props.image.thumbnailUrl;
  if (props.image.localPath) return convertFileSrc(props.image.localPath);
  return "";
});
</script>

<template>
  <article class="surface overflow-hidden rounded-lg">
    <div class="aspect-[4/3] bg-black/40">
      <img v-if="imageUrl" :src="imageUrl" :alt="image.filename" class="h-full w-full object-cover" />
    </div>
    <div class="space-y-3 p-3">
      <div>
        <h3 class="truncate text-sm font-semibold text-white">{{ image.filename }}</h3>
        <p class="mt-1 truncate text-xs text-slate-500">{{ image.folderPath }}</p>
      </div>
      <div class="flex flex-wrap gap-1.5">
        <StatusBadge
          v-for="target in targets"
          :key="target.id"
          :label="target.name"
          :status="image.postStates[target.id]"
        />
      </div>
      <div class="flex items-center gap-2">
        <button class="button h-8 w-8 p-0" title="Open in source" @click="emit('open', image)">
          <ExternalLink class="h-4 w-4" />
        </button>
        <button class="button h-8 w-8 p-0" :title="image.isArchived ? 'Restore' : 'Archive'" @click="emit('archive', image.id, !image.isArchived)">
          <RotateCcw v-if="image.isArchived" class="h-4 w-4" />
          <Archive v-else class="h-4 w-4" />
        </button>
      </div>
    </div>
  </article>
</template>
