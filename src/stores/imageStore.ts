import { ref } from "vue";
import { defineStore } from "pinia";
import { listImages, setImageArchived } from "@/repositories/imageRepository";
import { upsertPostRecord } from "@/repositories/postRecordRepository";
import type { ImageFilters, ImageWithPostState } from "@/types/image";

export const useImageStore = defineStore("images", () => {
  const images = ref<ImageWithPostState[]>([]);
  const loading = ref(false);
  const message = ref("");
  const error = ref("");
  const filters = ref<Partial<ImageFilters>>({
    includeSkipped: false,
    includeArchived: false,
    excludePostedAnywhere: false,
    rating: "all",
  });

  async function load() {
    loading.value = true;
    error.value = "";
    try {
      images.value = await listImages(filters.value);
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

  return {
    images,
    loading,
    filters,
    message,
    error,
    load,
    archive,
    markPosted,
    markSkipped,
  };
});
