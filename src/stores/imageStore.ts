import { ref } from "vue";
import { defineStore } from "pinia";
import { listImages, setImageArchived } from "@/repositories/imageRepository";
import type { ImageFilters, ImageWithPostState } from "@/types/image";

export const useImageStore = defineStore("images", () => {
  const images = ref<ImageWithPostState[]>([]);
  const loading = ref(false);
  const filters = ref<Partial<ImageFilters>>({
    includeSkipped: false,
    includeArchived: false,
    excludePostedAnywhere: false,
    rating: "all",
  });

  async function load() {
    loading.value = true;
    try {
      images.value = await listImages(filters.value);
    } finally {
      loading.value = false;
    }
  }

  async function archive(imageId: string, archived: boolean) {
    await setImageArchived(imageId, archived);
    await load();
  }

  return {
    images,
    loading,
    filters,
    load,
    archive,
  };
});

