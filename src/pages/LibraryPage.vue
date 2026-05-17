<script setup lang="ts">
import { onMounted } from "vue";
import { RefreshCcw } from "lucide-vue-next";
import { openPath, openUrl } from "@tauri-apps/plugin-opener";
import FilterBar from "@/components/FilterBar.vue";
import ImageGrid from "@/components/ImageGrid.vue";
import { useImageStore } from "@/stores/imageStore";
import { useSourceStore } from "@/stores/sourceStore";
import { useTargetStore } from "@/stores/targetStore";
import type { ImageWithPostState } from "@/types/image";

const imageStore = useImageStore();
const sourceStore = useSourceStore();
const targetStore = useTargetStore();

onMounted(() => {
  void imageStore.load();
});

async function openImage(image: ImageWithPostState) {
  if (image.webViewLink) {
    await openUrl(image.webViewLink);
  } else if (image.localPath) {
    await openPath(image.localPath);
  }
}
</script>

<template>
  <div class="flex h-full flex-col gap-4 p-5">
    <header class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-semibold text-white">Image Library</h1>
        <p class="mt-1 text-sm text-slate-400">Review indexed images, posting states, and archive decisions.</p>
      </div>
      <button class="button" @click="imageStore.load">
        <RefreshCcw class="h-4 w-4" />
        Refresh
      </button>
    </header>

    <FilterBar v-model:filters="imageStore.filters" :sources="sourceStore.sources" />

    <div class="min-h-0 flex-1 overflow-y-auto pr-1">
      <ImageGrid
        :images="imageStore.images"
        :targets="targetStore.targets"
        @archive="imageStore.archive"
        @open="openImage"
      />
    </div>
  </div>
</template>
