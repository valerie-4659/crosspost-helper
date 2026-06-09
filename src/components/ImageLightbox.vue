<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { convertFileSrc } from "@/electron-shims/core";
import { Archive, Check, ChevronLeft, ChevronRight, RotateCcw, Trash2, X, Zap } from "lucide-vue-next";
import type { ImageWithPostState } from "@/types/image";

const props = defineProps<{
  image: ImageWithPostState | null;
  /** All images in the current folder — enables prev/next navigation. */
  images?: ImageWithPostState[];
  selectedImageIds?: Set<string>;
}>();

const emit = defineEmits<{
  close: [];
  /** Navigate to a different image (replaces the current lightbox image). */
  navigate: [image: ImageWithPostState];
  toggleSelected: [imageId: string];
  /** Confirmed hard delete of this image from the DB. */
  delete: [imageId: string];
  /** Globally exclude (or restore) this image from all networks + Picker. */
  archive: [imageId: string, archived: boolean];
  /** Upscale with Topaz Labs — passes the local file path. */
  upscaleImage: [localPath: string];
}>();

// ── Navigation ────────────────────────────────────────────────────────────────
const currentIndex = computed(() => {
  if (!props.image || !props.images?.length) return -1;
  return props.images.findIndex((img) => img.id === props.image!.id);
});
const hasPrev = computed(() => currentIndex.value > 0);
const hasNext = computed(() => currentIndex.value >= 0 && currentIndex.value < (props.images?.length ?? 0) - 1);

function prev() { if (hasPrev.value) emit("navigate", props.images![currentIndex.value - 1]); }
function next() { if (hasNext.value) emit("navigate", props.images![currentIndex.value + 1]); }

// ── Image URL ─────────────────────────────────────────────────────────────────
const imageUrl = computed(() => {
  if (!props.image) return "";
  if (props.image.localPath) return convertFileSrc(props.image.localPath);
  return props.image.thumbnailUrl ?? "";
});

// ── Selection ─────────────────────────────────────────────────────────────────
const isSelected = computed(() =>
  props.image ? (props.selectedImageIds?.has(props.image.id) ?? false) : false,
);

// ── Delete double opt-in ──────────────────────────────────────────────────────
const confirmingDelete = ref(false);

function requestDelete() { confirmingDelete.value = true; }
function cancelDelete()  { confirmingDelete.value = false; }
function confirmDelete() {
  if (props.image) emit("delete", props.image.id);
  confirmingDelete.value = false;
}

// ── Keyboard ──────────────────────────────────────────────────────────────────
function onKey(e: KeyboardEvent) {
  if (e.key === "Escape") {
    if (confirmingDelete.value) { cancelDelete(); return; }
    emit("close");
  }
  if (e.key === "ArrowLeft")  prev();
  if (e.key === "ArrowRight") next();
}
onMounted(() => window.addEventListener("keydown", onKey));
onUnmounted(() => window.removeEventListener("keydown", onKey));
</script>

<template>
  <div
    v-if="image"
    class="fixed inset-0 z-50 flex flex-col bg-black/90 outline-none"
    tabindex="-1"
    @click.self="emit('close')"
  >
    <!-- Header -->
    <header class="flex shrink-0 items-center gap-3 border-b border-line bg-ink/95 px-4 py-2.5">
      <!-- Prev / position / next -->
      <div class="flex shrink-0 items-center gap-1">
        <button class="button h-8 w-8 p-0" :disabled="!hasPrev" title="Previous (←)" @click="prev">
          <ChevronLeft class="h-4 w-4" />
        </button>
        <span v-if="images?.length" class="min-w-[3.5rem] text-center text-xs text-slate-400">
          {{ currentIndex + 1 }} / {{ images.length }}
        </span>
        <button class="button h-8 w-8 p-0" :disabled="!hasNext" title="Next (→)" @click="next">
          <ChevronRight class="h-4 w-4" />
        </button>
      </div>

      <!-- Filename + path -->
      <div class="min-w-0 flex-1">
        <h2 class="truncate text-sm font-semibold text-white">{{ image.filename }}</h2>
        <p class="truncate text-xs text-slate-500">{{ image.folderPath }}</p>
      </div>

      <!-- Actions -->
      <div class="flex shrink-0 items-center gap-2">
        <!-- Select toggle -->
        <button
          class="button h-8 gap-1.5 px-2 text-xs"
          :class="isSelected ? 'border-accent bg-accent/20 text-accent' : ''"
          :title="isSelected ? 'Deselect' : 'Select'"
          @click="emit('toggleSelected', image.id)"
        >
          <Check class="h-3.5 w-3.5" />
          {{ isSelected ? "Selected" : "Select" }}
        </button>

        <!-- Global exclude / restore -->
        <button
          class="button h-8 w-8 p-0 transition"
          :class="image.isArchived ? 'border-amber-500/50 bg-amber-500/10 text-amber-400' : 'hover:border-amber-500/50 hover:text-amber-400'"
          :title="image.isArchived ? 'Restore (globally)' : 'Exclude globally (all networks + Picker)'"
          @click="emit('archive', image.id, !image.isArchived)"
        >
          <RotateCcw v-if="image.isArchived" class="h-4 w-4" />
          <Archive v-else class="h-4 w-4" />
        </button>

        <!-- Delete (two-step) -->
        <template v-if="!confirmingDelete">
          <button class="button h-8 w-8 p-0 hover:border-rose/60 hover:text-rose" title="Remove from library index" @click="requestDelete">
            <Trash2 class="h-4 w-4" />
          </button>
        </template>
        <template v-else>
          <span class="text-xs text-rose">Remove from index?</span>
          <button class="button h-8 border-rose/60 bg-rose/10 px-2 text-xs text-rose hover:bg-rose/20" @click="confirmDelete">Confirm</button>
          <button class="button h-8 px-2 text-xs" @click="cancelDelete">Cancel</button>
        </template>

        <!-- Upscale with Topaz -->
        <button
          v-if="image.localPath"
          class="button h-8 gap-1.5 px-2 text-xs hover:border-amber-500/50 hover:text-amber-400 transition"
          title="Upscale with Topaz Labs"
          @click="emit('upscaleImage', image.localPath!)"
        >
          <Zap class="h-3.5 w-3.5" />
          Upscale
        </button>

        <!-- Close -->
        <button class="button h-8 w-8 p-0" title="Close (Esc)" @click="emit('close')">
          <X class="h-4 w-4" />
        </button>
      </div>
    </header>

    <!-- Image area with side navigation -->
    <div class="relative flex min-h-0 flex-1 items-center justify-center">
      <!-- Left arrow overlay -->
      <button
        v-if="hasPrev"
        class="absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-lg border border-line bg-ink/70 p-2 text-white opacity-60 transition hover:opacity-100"
        title="Previous (←)"
        @click="prev"
      >
        <ChevronLeft class="h-6 w-6" />
      </button>

      <img
        v-if="imageUrl"
        :src="imageUrl"
        :alt="image.filename"
        class="max-h-full max-w-full object-contain p-5"
        @click.self="emit('close')"
      />

      <!-- Right arrow overlay -->
      <button
        v-if="hasNext"
        class="absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-lg border border-line bg-ink/70 p-2 text-white opacity-60 transition hover:opacity-100"
        title="Next (→)"
        @click="next"
      >
        <ChevronRight class="h-6 w-6" />
      </button>
    </div>
  </div>
</template>
