<script setup lang="ts">
import ImageCard from "./ImageCard.vue";
import type { ImageWithPostState } from "@/types/image";
import type { PostingTarget } from "@/types/postingTarget";

defineProps<{
  images: ImageWithPostState[];
  targets: PostingTarget[];
  activeTargetId?: string;
  selectedImageIds: string[];
  selectedImages: ImageWithPostState[];
}>();

const emit = defineEmits<{
  toggleSelected: [imageId: string];
  preview: [image: ImageWithPostState];
  archive: [imageId: string, archived: boolean];
  reveal: [image: ImageWithPostState];
  copyPath: [image: ImageWithPostState];
  copyImage: [image: ImageWithPostState];
  markPosted: [imageId: string, targetId: string];
  markSkipped: [imageId: string, targetId: string];
}>();
</script>

<template>
  <div v-if="images.length" class="grid grid-cols-2 gap-4 xl:grid-cols-3 2xl:grid-cols-4">
    <ImageCard
      v-for="image in images"
      :key="image.id"
      :image="image"
      :targets="targets"
      :active-target-id="activeTargetId"
      :selected="selectedImageIds.includes(image.id)"
      :drag-images="selectedImages"
      @toggle-selected="emit('toggleSelected', $event)"
      @preview="emit('preview', $event)"
      @archive="(imageId, archived) => emit('archive', imageId, archived)"
      @reveal="emit('reveal', $event)"
      @copy-path="emit('copyPath', $event)"
      @copy-image="emit('copyImage', $event)"
      @mark-posted="(imageId, targetId) => emit('markPosted', imageId, targetId)"
      @mark-skipped="(imageId, targetId) => emit('markSkipped', imageId, targetId)"
    />
  </div>
  <div v-else class="surface flex h-72 items-center justify-center rounded-lg text-sm text-slate-400">
    No images match the current view.
  </div>
</template>
