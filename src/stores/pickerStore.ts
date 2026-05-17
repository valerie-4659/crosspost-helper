import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { openPath, openUrl } from "@tauri-apps/plugin-opener";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { markImagePosted, markImageSkipped, pickRandomUnpostedImage } from "@/services/pickerService";
import { useTargetStore } from "./targetStore";
import type { ImageFilters, ImageWithPostState } from "@/types/image";

export const usePickerStore = defineStore("picker", () => {
  const targetStore = useTargetStore();
  const currentImage = ref<ImageWithPostState | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const postUrl = ref("");
  const caption = ref("");
  const filters = ref<ImageFilters>({
    targetId: "",
    includeSkipped: false,
    includeArchived: false,
    excludePostedAnywhere: false,
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
      postUrl.value = "";
      caption.value = "";
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : String(caught);
    } finally {
      loading.value = false;
    }
  }

  async function markPosted() {
    if (!currentImage.value || !targetStore.activeTargetId) return;
    await markImagePosted(currentImage.value.id, targetStore.activeTargetId, postUrl.value, caption.value);
    await pickRandom();
  }

  async function markSkipped() {
    if (!currentImage.value || !targetStore.activeTargetId) return;
    await markImageSkipped(currentImage.value.id, targetStore.activeTargetId, caption.value);
    await pickRandom();
  }

  async function openCurrentImage() {
    const image = currentImage.value;
    if (!image) return;
    if (image.webViewLink) {
      await openUrl(image.webViewLink);
    } else if (image.localPath) {
      await openPath(image.localPath);
    }
  }

  async function copyFilename() {
    if (currentImage.value) {
      await writeText(currentImage.value.filename);
    }
  }

  async function copyCaptionPlaceholder() {
    const text = caption.value || `${currentImage.value?.filename ?? "Image"}\n\nPosted manually.`;
    await writeText(text);
  }

  return {
    currentImage,
    filters,
    loading,
    error,
    postUrl,
    caption,
    canPick,
    pickRandom,
    markPosted,
    markSkipped,
    openCurrentImage,
    copyFilename,
    copyCaptionPlaceholder,
  };
});
