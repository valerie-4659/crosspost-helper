<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { Archive, Check, Download, RefreshCcw, RotateCcw, X } from "lucide-vue-next";
import FilterBar from "@/components/FilterBar.vue";
import ImageGrid from "@/components/ImageGrid.vue";
import ImageLightbox from "@/components/ImageLightbox.vue";
import { copyImagePath, copyImageToClipboard, exportImagesToFolder, revealImage } from "@/services/imageActionService";
import { useImageStore } from "@/stores/imageStore";
import { useSourceStore } from "@/stores/sourceStore";
import { useTargetStore } from "@/stores/targetStore";
import type { ImageWithPostState } from "@/types/image";

const imageStore = useImageStore();
const sourceStore = useSourceStore();
const targetStore = useTargetStore();
const previewImage = ref<ImageWithPostState | null>(null);
const selectedTargetIds = ref<string[]>([]);

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
const selectedCount = computed(() => imageStore.selectedImageIds.length);

async function runAction(action: () => Promise<void>, success: string) {
  imageStore.error = "";
  try {
    await action();
    imageStore.message = success;
  } catch (caught) {
    imageStore.error = caught instanceof Error ? caught.message : String(caught);
  }
}

async function exportSelected() {
  imageStore.error = "";
  try {
    const copied = await exportImagesToFolder(imageStore.selectedImages);
    if (copied > 0) {
      imageStore.message = `Exported ${copied} image(s).`;
    }
  } catch (caught) {
    imageStore.error = caught instanceof Error ? caught.message : String(caught);
  }
}

async function markSelected() {
  await imageStore.markSelectedPosted(selectedTargetIds.value);
  selectedTargetIds.value = [];
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

    <section class="surface rounded-lg p-3">
      <div class="flex flex-wrap items-center gap-2">
        <span class="mr-2 text-sm font-medium text-white">{{ selectedCount }} selected</span>
        <button class="button" @click="imageStore.selectVisible">Select visible</button>
        <button class="button" :disabled="selectedCount === 0" @click="imageStore.clearSelection">
          <X class="h-4 w-4" />
          Clear
        </button>
        <button class="button" :disabled="selectedCount === 0" @click="imageStore.excludeSelected">
          <Archive class="h-4 w-4" />
          Exclude
        </button>
        <button class="button" :disabled="selectedCount === 0" @click="imageStore.restoreSelected">
          <RotateCcw class="h-4 w-4" />
          Restore
        </button>
        <button class="button" :disabled="selectedCount === 0" @click="exportSelected">
          <Download class="h-4 w-4" />
          Download
        </button>
      </div>

      <div class="mt-3 flex flex-wrap items-center gap-2">
        <span class="mr-2 text-sm text-slate-400">Mark selected as posted on</span>
        <label
          v-for="target in targetStore.enabledTargets"
          :key="target.id"
          class="flex items-center gap-2 rounded-md border border-line bg-ink px-3 py-2 text-sm text-slate-300"
        >
          <input v-model="selectedTargetIds" type="checkbox" class="accent-accent" :value="target.id" />
          {{ target.name }}
        </label>
        <button class="button-primary rounded-md" :disabled="selectedCount === 0 || selectedTargetIds.length === 0" @click="markSelected">
          <Check class="h-4 w-4" />
          Marked
        </button>
      </div>
    </section>

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
        :selected-image-ids="imageStore.selectedImageIds"
        :selected-images="imageStore.selectedImages"
        @toggle-selected="imageStore.toggleSelected"
        @preview="previewImage = $event"
        @archive="imageStore.archive"
        @reveal="(image: ImageWithPostState) => runAction(() => revealImage(image), 'Opened in Finder.')"
        @copy-path="(image: ImageWithPostState) => runAction(() => copyImagePath(image), 'Path copied.')"
        @copy-image="(image: ImageWithPostState) => runAction(() => copyImageToClipboard(image), 'Image copied.')"
        @mark-posted="imageStore.markPosted"
        @mark-skipped="imageStore.markSkipped"
      />
    </div>

    <ImageLightbox :image="previewImage" @close="previewImage = null" />
  </div>
</template>
