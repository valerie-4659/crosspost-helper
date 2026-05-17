<script setup lang="ts">
import { computed, onMounted, watch } from "vue";
import { RefreshCcw } from "lucide-vue-next";
import FilterBar from "@/components/FilterBar.vue";
import ImageGrid from "@/components/ImageGrid.vue";
import { copyImagePath, copyImageToClipboard, revealImage } from "@/services/imageActionService";
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

watch(
  () => ({ ...imageStore.filters }),
  () => {
    void imageStore.load();
  },
  { deep: true },
);

const activeTargetName = computed(
  () => targetStore.targets.find((target) => target.id === imageStore.filters.targetId)?.name ?? "",
);

async function runAction(action: () => Promise<void>, success: string) {
  imageStore.error = "";
  try {
    await action();
    imageStore.message = success;
  } catch (caught) {
    imageStore.error = caught instanceof Error ? caught.message : String(caught);
  }
}
</script>

<template>
  <div class="flex h-full flex-col gap-4 p-5">
    <header class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-semibold text-white">Image Library</h1>
        <p class="mt-1 text-sm text-slate-400">
          Pick manually, drag or copy the image, then mark the network you posted to.
        </p>
      </div>
      <button class="button" @click="imageStore.load">
        <RefreshCcw class="h-4 w-4" />
        Refresh
      </button>
    </header>

    <FilterBar
      v-model:filters="imageStore.filters"
      :sources="sourceStore.sources"
      :targets="targetStore.enabledTargets"
      show-target-filter
      show-target-rules
    />

    <div v-if="activeTargetName" class="rounded-md border border-accent/30 bg-accent/10 px-3 py-2 text-sm text-accent">
      Showing images not yet posted on {{ activeTargetName }}.
    </div>

    <div v-if="imageStore.message" class="rounded-md border border-mint/30 bg-mint/10 px-3 py-2 text-sm text-mint">
      {{ imageStore.message }}
    </div>

    <div v-if="imageStore.error" class="rounded-md border border-rose/40 bg-rose/10 px-3 py-2 text-sm text-rose">
      {{ imageStore.error }}
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto pr-1">
      <ImageGrid
        :images="imageStore.images"
        :targets="targetStore.targets"
        :active-target-id="imageStore.filters.targetId"
        @archive="imageStore.archive"
        @reveal="(image: ImageWithPostState) => runAction(() => revealImage(image), 'Opened in Finder.')"
        @copy-path="(image: ImageWithPostState) => runAction(() => copyImagePath(image), 'Path copied.')"
        @copy-image="(image: ImageWithPostState) => runAction(() => copyImageToClipboard(image), 'Image copied.')"
        @mark-posted="imageStore.markPosted"
        @mark-skipped="imageStore.markSkipped"
      />
    </div>
  </div>
</template>
