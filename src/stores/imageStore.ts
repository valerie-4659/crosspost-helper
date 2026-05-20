import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { deleteAllImages, deleteImages, deleteImagesInFolder, listDistinctFolders, listImages, setImageArchived } from "@/repositories/imageRepository";
import { upsertPostRecord } from "@/repositories/postRecordRepository";
import type { FolderEntry } from "@/repositories/imageRepository";
import type { ImageFilters, ImageWithPostState } from "@/types/image";

export const useImageStore = defineStore("images", () => {
  const images = ref<ImageWithPostState[]>([]);
  const folders = ref<FolderEntry[]>([]);
  const loading = ref(false);
  const message = ref("");
  const error = ref("");
  // Use Set for O(1) lookups — Vue 3 tracks Set mutations per-key, so only the
  // one card whose selection state changed will re-render (instead of all N cards).
  const selectedImageIds = ref(new Set<string>());
  const filters = ref<Partial<ImageFilters>>({
    includeSkipped: false,
    includeArchived: false,
    excludePostedAnywhere: false,
    rating: "all",
  });
  const selectedImages = computed(() =>
    images.value.filter((image) => selectedImageIds.value.has(image.id)),
  );

  async function loadFolders() {
    try {
      folders.value = await listDistinctFolders(filters.value.sourceId);
    } catch {
      // non-critical — sidebar just stays empty
    }
  }

  async function load() {
    loading.value = true;
    error.value = "";
    try {
      images.value = await listImages(filters.value);
      selectedImageIds.value = new Set([...selectedImageIds.value].filter((id) =>
        images.value.some((image) => image.id === id),
      ));
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : String(caught);
    } finally {
      loading.value = false;
    }
  }

  async function archive(imageId: string, archived: boolean) {
    await setImageArchived(imageId, archived);
    if (archived && !filters.value.includeArchived) {
      // Remove from visible list immediately — no full reload needed.
      images.value = images.value.filter((img) => img.id !== imageId);
    } else {
      const idx = images.value.findIndex((img) => img.id === imageId);
      if (idx !== -1) images.value[idx] = { ...images.value[idx], isArchived: archived };
    }
  }

  function toggleSelected(imageId: string) {
    if (selectedImageIds.value.has(imageId)) {
      selectedImageIds.value.delete(imageId);
    } else {
      selectedImageIds.value.add(imageId);
    }
  }

  function clearSelection() {
    selectedImageIds.value.clear();
  }

  function selectVisible() {
    selectedImageIds.value = new Set(images.value.map((image) => image.id));
  }

  async function markPosted(imageId: string, targetId: string) {
    error.value = "";
    await upsertPostRecord({ imageId, targetId, status: "posted" });
    // Update in-place — avoids a full IPC reload for every single click.
    const idx = images.value.findIndex((img) => img.id === imageId);
    if (idx !== -1) {
      images.value[idx] = {
        ...images.value[idx],
        postStates: { ...images.value[idx].postStates, [targetId]: "posted" },
      };
    }
    message.value = "Marked as posted.";
  }

  async function markSkipped(imageId: string, targetId: string) {
    error.value = "";
    await upsertPostRecord({ imageId, targetId, status: "skipped" });
    // Update in-place and remove if filter hides skipped images.
    const idx = images.value.findIndex((img) => img.id === imageId);
    if (idx !== -1) {
      if (!filters.value.includeSkipped) {
        images.value = images.value.filter((img) => img.id !== imageId);
      } else {
        images.value[idx] = {
          ...images.value[idx],
          postStates: { ...images.value[idx].postStates, [targetId]: "skipped" },
        };
      }
    }
    message.value = "Marked as skipped.";
  }

  async function markSelectedPosted(targetIds: string[]) {
    if (selectedImageIds.value.size === 0 || targetIds.length === 0) return;
    error.value = "";
    for (const imageId of selectedImageIds.value) {
      for (const targetId of targetIds) {
        await upsertPostRecord({ imageId, targetId, status: "posted" });
      }
    }
    message.value = `Marked ${selectedImageIds.value.size} image(s) for ${targetIds.length} target(s).`;
    clearSelection();
    await load();
  }

  async function excludeSelected() {
    if (selectedImageIds.value.size === 0) return;
    for (const imageId of selectedImageIds.value) {
      await setImageArchived(imageId, true);
    }
    message.value = `Excluded ${selectedImageIds.value.size} image(s).`;
    clearSelection();
    await load();
  }

  async function restoreSelected() {
    if (selectedImageIds.value.size === 0) return;
    for (const imageId of selectedImageIds.value) {
      await setImageArchived(imageId, false);
    }
    message.value = `Restored ${selectedImageIds.value.size} image(s).`;
    clearSelection();
    await load();
  }

  /** Permanently remove selected images from the DB index (not from disk). */
  async function deleteSelected() {
    if (selectedImageIds.value.size === 0) return;
    const ids = [...selectedImageIds.value];
    await deleteImages(ids);
    images.value = images.value.filter((img) => !selectedImageIds.value.has(img.id));
    message.value = `Removed ${ids.length} image(s) from the library index.`;
    clearSelection();
    await loadFolders();
  }

  /** Permanently remove a single image from the DB index. */
  async function deleteSingleImage(imageId: string) {
    await deleteImages([imageId]);
    images.value = images.value.filter((img) => img.id !== imageId);
    selectedImageIds.value.delete(imageId);
    message.value = "Image removed from the library index.";
    await loadFolders();
  }

  /** Remove all images in a folder (and subfolders) from the DB index. */
  async function deleteFolder(folderPath: string) {
    await deleteImagesInFolder(folderPath);
    message.value = `Folder "${folderPath.split("/").pop()}" removed from the library index.`;
    await load();
    await loadFolders();
  }

  /** Hard reset: wipe ALL image + post_record data from the DB. */
  async function hardReset() {
    await deleteAllImages();
    images.value = [];
    folders.value = [];
    clearSelection();
    message.value = "Hard reset complete — all image data has been removed from the index.";
  }

  return {
    images,
    folders,
    loading,
    filters,
    message,
    error,
    selectedImageIds,
    selectedImages,
    load,
    loadFolders,
    archive,
    toggleSelected,
    clearSelection,
    selectVisible,
    markPosted,
    markSkipped,
    markSelectedPosted,
    excludeSelected,
    restoreSelected,
    deleteSelected,
    deleteSingleImage,
    deleteFolder,
    hardReset,
  };
});
