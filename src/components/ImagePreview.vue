<script setup lang="ts">
import { computed } from "vue";
import { convertFileSrc } from "@tauri-apps/api/core";
import { ImageOff } from "lucide-vue-next";
import type { ImageWithPostState } from "@/types/image";

const props = defineProps<{
  image: ImageWithPostState | null;
}>();

const imageUrl = computed(() => {
  if (!props.image) return "";
  if (props.image.thumbnailUrl) return props.image.thumbnailUrl;
  if (props.image.localPath) return convertFileSrc(props.image.localPath);
  return "";
});
</script>

<template>
  <section class="surface flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg">
    <div class="flex min-h-0 flex-1 items-center justify-center bg-black/40">
      <img
        v-if="image && imageUrl"
        :src="imageUrl"
        :alt="image.filename"
        class="max-h-full max-w-full object-contain"
      />
      <div v-else class="flex flex-col items-center gap-3 text-slate-500">
        <ImageOff class="h-12 w-12" />
        <p class="text-sm">Pick an image to preview it here.</p>
      </div>
    </div>
    <div v-if="image" class="border-t border-line p-4">
      <div class="flex items-start justify-between gap-4">
        <div class="min-w-0">
          <h2 class="truncate text-lg font-semibold text-white">{{ image.filename }}</h2>
          <p class="mt-1 truncate text-sm text-slate-400">{{ image.folderPath }}</p>
        </div>
        <div class="shrink-0 text-right text-xs text-slate-500">
          <div>{{ image.sourceName }}</div>
          <div>{{ image.createdAt || image.modifiedAt || image.indexedAt }}</div>
        </div>
      </div>
    </div>
  </section>
</template>
