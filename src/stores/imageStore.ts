import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { listImages, setImageArchived } from "@/repositories/imageRepository";
import { upsertPostRecord } from "@/repositories/postRecordRepository";
import type { ImageFilters, ImageWithPostState } from "@/types/image";

export const useImageStore = defineStore("images", () => {
  const images = ref<ImageWithPostState[]>([]);
  const loading = ref(false);
  const message = ref("");
  const error = ref("");
  const selectedImageIds = ref<string[]>([]);
  const filters = ref<Partial<ImageFilters>>({
    includeSkipped: false,
    includeArchived: false,
    excludePostedAnywhere: false,
    rating: "all",
  });
  const selectedImages = computed(() =>
    images.value.filter((image) => selectedImageIds.value.includes(image.id)),
  );

  async function load() {
    loading.value = true;
    error.value = "";
    try {
      images.value = await listImages(filters.value);
      selectedImageIds.value = selectedImageIds.value.filter((id) =>
        images.value.some((image) => image.id === id),
      );
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : String(caught);
    } finally {
      loading.value = false;
    }
  }

  async function archive(imageId: string, archived: boolean) {
    await setImageArchived(imageId, archived);
    await load();
  }

  function toggleSelected(imageId: string) {
    selectedImageIds.value = selectedImageIds.value.includes(imageId)
      ? selectedImageIds.value.filter((id) => id !== imageId)
      : [...selectedImageIds.value, imageId];
  }

  function clearSelection() {
    selectedImageIds.value = [];
  }

  function selectVisible() {
    selectedImageIds.value = images.value.map((image) => image.id);
  }

  async function markPosted(imageId: string, targetId: string) {
    error.value = "";
    await upsertPostRecord({ imageId, targetId, status: "posted" });
    message.value = "Marked as posted.";
    await load();
  }

  async function markSkipped(imageId: string, targetId: string) {
    error.value = "";
    await upsertPostRecord({ imageId, targetId, status: "skipped" });
    message.value = "Marked as skipped.";
    await load();
  }

  async function markSelectedPosted(targetIds: string[]) {
    if (selectedImageIds.value.length === 0 || targetIds.length === 0) return;
    error.value = "";
    for (const imageId of selectedImageIds.value) {
      for (const targetId of targetIds) {
        await upsertPostRecord({ imageId, targetId, status: "posted" });
      }
    }
    message.value = `Marked ${selectedImageIds.value.length} image(s) for ${targetIds.length} target(s).`;
    clearSelection();
    await load();
  }

  async function excludeSelected() {
    if (selectedImageIds.value.length === 0) return;
    for (const imageId of selectedImageIds.value) {
      await setImageArchived(imageId, true);
    }
    message.value = `Excluded ${selectedImageIds.value.length} image(s).`;
    clearSelection();
    await load();
  }

  async function restoreSelected() {
    if (selectedImageIds.value.length === 0) return;
    for (const imageId of selectedImageIds.value) {
      await setImageArchived(imageId, false);
    }
    message.value = `Restored ${selectedImageIds.value.length} image(s).`;
    clearSelection();
    await load();
  }

  return {
    images,
    loading,
    filters,
    message,
    error,
    selectedImageIds,
    selectedImages,
    load,
    archive,
    toggleSelected,
    clearSelection,
    selectVisible,
    markPosted,
    markSkipped,
    markSelectedPosted,
    excludeSelected,
    restoreSelected,
  };
});
