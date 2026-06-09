<script setup lang="ts">
import { computed } from "vue";
import { convertFileSrc } from "@/electron-shims/core";
import { ImageOff } from "lucide-vue-next";
import type { ImageWithPostState } from "@/types/image";

const props = defineProps<{
  image: ImageWithPostState | null;
}>();

const imageUrl = computed(() => {
  if (!props.image) return "";
  // Prefer the full local file so the picker shows the real image at full
  // resolution — the thumbnail (400 px JPEG) is only a fallback for cases
  // where the local file is no longer accessible.
  if (props.image.localPath) return convertFileSrc(props.image.localPath);
  if (props.image.thumbnailUrl) return props.image.thumbnailUrl;
  return "";
});

function handleDragStart(event: DragEvent) {
  const localPath = props.image?.localPath;
  if (!localPath || !window.desktop?.core?.startDrag) return;

  // Cancel HTML5 drag to avoid the dual-drag freeze on macOS.
  event.preventDefault();

  const iconPath = props.image?.thumbnailUrl?.startsWith("localfile://")
    ? decodeURIComponent(props.image.thumbnailUrl.slice("localfile://".length))
    : undefined;

  window.desktop.core.startDrag([localPath], iconPath);
}
</script>

<template>
  <section class="surface flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg">
    <div class="flex min-h-0 flex-1 items-center justify-center bg-black/40">
      <img
        v-if="image && imageUrl"
        :src="imageUrl"
        :alt="image.filename"
        class="max-h-full max-w-full cursor-grab object-contain"
        draggable="true"
        @dragstart="handleDragStart"
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
