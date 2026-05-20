import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { copyImagePath, copyImageToClipboard, revealImage } from "@/services/imageActionService";
import { markImagePosted, markImageSkipped, pickRandomUnpostedImage } from "@/services/pickerService";
import { useTargetStore } from "./targetStore";
import type { ImageFilters, ImageWithPostState } from "@/types/image";

export const usePickerStore = defineStore("picker", () => {
  const targetStore = useTargetStore();
  const currentImage = ref<ImageWithPostState | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const message = ref("");
  const filters = ref<ImageFilters>({
    targetId: "",
    includeSkipped: false,
    includeArchived: false,
    excludePostedAnywhere: false,
    includeExcludedFolders: false,
    rating: "all",
  });

  const canPick = computed(() => Boolean(targetStore.activeTargetId));

  async function pickRandom() {
    loading.value = true;
    error.value = null;
    try {
      filters.value.targetId = targetStore.activeTargetId;
      currentImage.value = await pickRandomUnpostedImage(filters.value);
      if (!currentImage.value) {
        error.value = "No unposted image matched the current filters.";
      }
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : String(caught);
    } finally {
      loading.value = false;
    }
  }

  async function markPosted() {
    if (!currentImage.value || !targetStore.activeTargetId) return;
    await markTargetPosted(targetStore.activeTargetId);
  }

  async function markTargetPosted(targetId: string) {
    if (!currentImage.value) return;
    await markImagePosted(currentImage.value.id, targetId);
    message.value = "Marked as posted.";
    await pickRandom();
  }

  async function markSkipped() {
    if (!currentImage.value || !targetStore.activeTargetId) return;
    await markImageSkipped(currentImage.value.id, targetStore.activeTargetId);
    await pickRandom();
  }

  async function openCurrentImage() {
    const image = currentImage.value;
    if (!image) return;
    await revealImage(image);
  }

  async function copyPath() {
    if (currentImage.value) {
      await copyImagePath(currentImage.value);
    }
  }

  async function copyImage() {
    if (currentImage.value) {
      await copyImageToClipboard(currentImage.value);
    }
  }

  return {
    currentImage,
    filters,
    loading,
    error,
    message,
    canPick,
    pickRandom,
    markPosted,
    markTargetPosted,
    markSkipped,
    openCurrentImage,
    copyPath,
    copyImage,
  };
});
