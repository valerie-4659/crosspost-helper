<script setup lang="ts">
import ImageCard from "./ImageCard.vue";
import type { ImageWithPostState } from "@/types/image";
import type { PostingTarget } from "@/types/postingTarget";

defineProps<{
  images: ImageWithPostState[];
  targets: PostingTarget[];
}>();

const emit = defineEmits<{
  archive: [imageId: string, archived: boolean];
  open: [image: ImageWithPostState];
}>();
</script>

<template>
  <div v-if="images.length" class="grid grid-cols-2 gap-4 xl:grid-cols-3 2xl:grid-cols-4">
    <ImageCard
      v-for="image in images"
      :key="image.id"
      :image="image"
      :targets="targets"
      @archive="(imageId, archived) => emit('archive', imageId, archived)"
      @open="emit('open', $event)"
    />
  </div>
  <div v-else class="surface flex h-72 items-center justify-center rounded-lg text-sm text-slate-400">
    No images match the current view.
  </div>
</template>
