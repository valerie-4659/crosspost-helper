<script setup lang="ts">
import { computed } from "vue";
import { convertFileSrc } from "@tauri-apps/api/core";
import { X } from "lucide-vue-next";
import type { ImageWithPostState } from "@/types/image";

const props = defineProps<{
  image: ImageWithPostState | null;
}>();

const emit = defineEmits<{
  close: [];
}>();

// Always use the original full-resolution file in the lightbox — never the thumbnail.
const imageUrl = computed(() => {
  if (!props.image) return "";
  if (props.image.localPath) return convertFileSrc(props.image.localPath);
  return props.image.thumbnailUrl ?? "";
});
</script>

<template>
  <div
    v-if="image"
    class="fixed inset-0 z-50 flex flex-col bg-black/90"
    @click.self="emit('close')"
    @keydown.esc="emit('close')"
  >
    <header class="flex items-center justify-between border-b border-line bg-ink/90 px-5 py-3">
      <div class="min-w-0">
        <h2 class="truncate text-base font-semibold text-white">{{ image.filename }}</h2>
        <p class="truncate text-xs text-slate-400">{{ image.folderPath }}</p>
      </div>
      <button class="button h-9 w-9 p-0" title="Close preview" @click="emit('close')">
        <X class="h-4 w-4" />
      </button>
    </header>
    <div class="flex min-h-0 flex-1 items-center justify-center p-5">
      <img v-if="imageUrl" :src="imageUrl" :alt="image.filename" class="max-h-full max-w-full object-contain" />
    </div>
  </div>
</template>
