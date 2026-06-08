<script setup lang="ts">
import ImageCard from "./ImageCard.vue";
import type { ImageWithPostState } from "@/types/image";
import type { PostingTarget } from "@/types/postingTarget";

defineProps<{
  images: ImageWithPostState[];
  targets: PostingTarget[];
  activeTargetId?: string;
  selectedImageIds: Set<string>;
  selectedImages: ImageWithPostState[];
  /** When provided, shows folder-preview pin button on each card. */
  folderPreviewIds?: Set<string>;
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
  toggleFolderPreview: [imageId: string];
  videoPrompt: [localPath: string];
  recreateImage: [localPath: string];
}>();
</script>

<template>
  <div v-if="images.length" class="grid grid-cols-3 gap-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
    <ImageCard
      v-for="image in images"
      :key="image.id"
      :image="image"
      :targets="targets"
      :active-target-id="activeTargetId"
      :selected="selectedImageIds.has(image.id)"
      :drag-images="selectedImages"
      :is-folder-preview="folderPreviewIds !== undefined ? folderPreviewIds.has(image.id) : undefined"
      @toggle-selected="emit('toggleSelected', $event)"
      @preview="emit('preview', $event)"
      @archive="(imageId, archived) => emit('archive', imageId, archived)"
      @reveal="emit('reveal', $event)"
      @copy-path="emit('copyPath', $event)"
      @copy-image="emit('copyImage', $event)"
      @mark-posted="(imageId, targetId) => emit('markPosted', imageId, targetId)"
      @mark-skipped="(imageId, targetId) => emit('markSkipped', imageId, targetId)"
      @toggle-folder-preview="emit('toggleFolderPreview', $event)"
      @video-prompt="emit('videoPrompt', $event)"
      @recreate-image="emit('recreateImage', $event)"
    />
  </div>
  <div v-else class="surface flex h-72 items-center justify-center rounded-lg text-sm text-slate-400">
    No images match the current view.
  </div>
</template>
