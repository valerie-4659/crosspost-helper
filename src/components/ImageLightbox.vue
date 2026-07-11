<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { convertFileSrc } from "@/electron-shims/core";
import { Archive, Check, CheckCheck, ChevronLeft, ChevronRight, Clipboard, ClipboardCheck, FileText, Loader2, RotateCcw, Trash2, X, Zap } from "lucide-vue-next";
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

// ── Media type ────────────────────────────────────────────────────────────────
const isVideo = computed(() => props.image?.mimeType?.startsWith("video/") ?? false);

// ── Image URL ─────────────────────────────────────────────────────────────────
const imageUrl = computed(() => {
  if (!props.image || isVideo.value) return "";
  if (props.image.localPath) return convertFileSrc(props.image.localPath);
  return props.image.thumbnailUrl ?? "";
});

// Video uses file:// directly — supports range requests (seeking) out of the box.
const videoUrl = computed(() => {
  if (!isVideo.value || !props.image?.localPath) return "";
  const fwd = props.image.localPath.replaceAll("\\", "/");
  const p = fwd.startsWith("/") ? fwd : "/" + fwd;
  return "file://" + encodeURI(p);
});

// ── Selection ─────────────────────────────────────────────────────────────────
const isSelected = computed(() =>
  props.image ? (props.selectedImageIds?.has(props.image.id) ?? false) : false,
);

// ── Copy to clipboard ─────────────────────────────────────────────────────────
const copied = ref(false);

async function copyImageToClipboard() {
  const lp = props.image?.localPath;
  if (!lp || !window.desktop?.clipboard) return;
  await window.desktop.clipboard.writeImageFromPath(lp);
  copied.value = true;
  setTimeout(() => { copied.value = false; }, 1500);
}

// ── Delete double opt-in ──────────────────────────────────────────────────────
const confirmingDelete = ref(false);

function requestDelete() { confirmingDelete.value = true; }
function cancelDelete()  { confirmingDelete.value = false; }
function confirmDelete() {
  if (props.image) emit("delete", props.image.id);
  confirmingDelete.value = false;
}

// ── Drag out ──────────────────────────────────────────────────────────────────
function handleDragStart(event: DragEvent) {
  const localPath = props.image?.localPath;
  if (!localPath || !window.desktop?.core?.startDrag) return;
  event.preventDefault();
  let iconPath: string | undefined;
  if (props.image?.thumbnailUrl?.startsWith("localfile://")) {
    let p = decodeURIComponent(props.image.thumbnailUrl.slice("localfile://".length));
    if (/^\/[A-Za-z]:/.test(p)) p = p.slice(1);
    iconPath = p;
  }
  window.desktop.core.startDrag([localPath], iconPath);
}

// ── Image metadata ────────────────────────────────────────────────────────────
const showMeta     = ref(false);
const metaLoading  = ref(false);
const metaData     = ref<ImageMetadata | null | "none">(null);
const copiedKey    = ref<string | null>(null);

async function loadMeta() {
  const lp = props.image?.localPath;
  if (!lp || !window.desktop?.image) return;
  metaLoading.value = true;
  metaData.value = null;
  try {
    const result = await window.desktop.image.readMetadata(lp);
    metaData.value = result ?? "none";
  } finally {
    metaLoading.value = false;
  }
}

function toggleMeta() {
  showMeta.value = !showMeta.value;
  if (showMeta.value && metaData.value === null) loadMeta();
}

// Reload metadata when the image changes while the panel is open.
watch(() => props.image?.id, () => {
  if (showMeta.value) {
    metaData.value = null;
    loadMeta();
  }
});

async function copyText(text: string, key: string) {
  await navigator.clipboard.writeText(text);
  copiedKey.value = key;
  setTimeout(() => { copiedKey.value = null; }, 1500);
}

// ── Keyboard ──────────────────────────────────────────────────────────────────
function onKey(e: KeyboardEvent) {
  if (e.key === "Escape") {
    if (confirmingDelete.value) { cancelDelete(); return; }
    if (showMeta.value) { showMeta.value = false; return; }
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

        <!-- Copy to clipboard -->
        <button
          v-if="image.localPath && !isVideo"
          class="button h-8 w-8 p-0 transition"
          :class="copied ? 'border-green-500/50 text-green-400' : ''"
          title="Copy image to clipboard"
          @click="copyImageToClipboard"
        >
          <ClipboardCheck v-if="copied" class="h-4 w-4" />
          <Clipboard v-else class="h-4 w-4" />
        </button>

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

        <!-- Metadata info toggle -->
        <button
          v-if="image.localPath?.toLowerCase().endsWith('.png')"
          class="button h-8 w-8 p-0 transition"
          :class="showMeta ? 'border-accent bg-accent/20 text-accent' : ''"
          title="Show embedded metadata (prompts)"
          @click="toggleMeta"
        >
          <FileText class="h-4 w-4" />
        </button>

        <!-- Close -->
        <button class="button h-8 w-8 p-0" title="Close (Esc)" @click="emit('close')">
          <X class="h-4 w-4" />
        </button>
      </div>
    </header>

    <!-- Image area + optional metadata sidebar -->
    <div class="flex min-h-0 flex-1 overflow-hidden">
      <!-- Image area with side navigation -->
      <div class="relative flex min-h-0 flex-1 items-center justify-center" @click.self="emit('close')">
        <!-- Left arrow overlay -->
        <button
          v-if="hasPrev"
          class="absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-lg border border-line bg-ink/70 p-2 text-white opacity-60 transition hover:opacity-100"
          title="Previous (←)"
          @click="prev"
        >
          <ChevronLeft class="h-6 w-6" />
        </button>

        <!-- Video player -->
        <video
          v-if="isVideo && videoUrl"
          :src="videoUrl"
          controls
          loop
          preload="metadata"
          class="max-h-full max-w-full object-contain p-4"
          @click.stop
        />

        <!-- Image -->
        <img
          v-else-if="imageUrl"
          :src="imageUrl"
          :alt="image.filename"
          draggable="true"
          class="max-h-full max-w-full cursor-grab object-contain p-5 active:cursor-grabbing"
          @click.self="emit('close')"
          @dragstart="handleDragStart"
        />

        <!-- Right arrow overlay (shift left when panel open) -->
        <button
          v-if="hasNext"
          class="absolute top-1/2 z-10 -translate-y-1/2 rounded-lg border border-line bg-ink/70 p-2 text-white opacity-60 transition hover:opacity-100"
          :class="showMeta ? 'right-3' : 'right-3'"
          title="Next (→)"
          @click="next"
        >
          <ChevronRight class="h-6 w-6" />
        </button>
      </div>

      <!-- Metadata sidebar -->
      <aside
        v-if="showMeta"
        class="flex w-80 shrink-0 flex-col overflow-hidden border-l border-line bg-ink/95"
      >
        <!-- Loading -->
        <div v-if="metaLoading" class="flex flex-1 items-center justify-center gap-2 text-sm text-slate-400">
          <Loader2 class="h-4 w-4 animate-spin" /> Loading…
        </div>

        <!-- No metadata -->
        <div v-else-if="metaData === 'none'" class="flex flex-1 items-center justify-center text-sm text-slate-500">
          No embedded metadata found.
        </div>

        <!-- Metadata content -->
        <div v-else-if="metaData" class="flex flex-col gap-0 overflow-y-auto p-4 text-xs">
          <!-- Source badge -->
          <div class="mb-3 flex items-center justify-between">
            <span
              class="rounded px-2 py-0.5 font-medium uppercase tracking-wide"
              :class="metaData.source === 'comfyui' ? 'bg-purple-500/20 text-purple-300' : metaData.source === 'a1111' ? 'bg-blue-500/20 text-blue-300' : 'bg-panel text-slate-400'"
            >
              {{ metaData.source === "comfyui" ? "ComfyUI" : metaData.source === "a1111" ? "A1111" : "Unknown" }}
            </span>
          </div>

          <!-- Positive prompt -->
          <div v-if="metaData.positivePrompt" class="mb-3">
            <div class="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wide text-slate-500">
              <span>Positive Prompt</span>
              <button
                class="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-panel hover:text-white transition"
                :class="copiedKey === 'positive' ? 'text-green-400' : 'text-slate-500'"
                @click="copyText(metaData.positivePrompt!, 'positive')"
              >
                <Clipboard class="h-3 w-3" />
                {{ copiedKey === "positive" ? "Copied" : "Copy" }}
              </button>
            </div>
            <pre class="whitespace-pre-wrap break-words rounded border border-line bg-panel px-2.5 py-2 font-sans leading-relaxed text-slate-200">{{ metaData.positivePrompt }}</pre>
          </div>

          <!-- Negative prompt -->
          <div v-if="metaData.negativePrompt" class="mb-3">
            <div class="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wide text-slate-500">
              <span>Negative Prompt</span>
              <button
                class="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-panel hover:text-white transition"
                :class="copiedKey === 'negative' ? 'text-green-400' : 'text-slate-500'"
                @click="copyText(metaData.negativePrompt!, 'negative')"
              >
                <Clipboard class="h-3 w-3" />
                {{ copiedKey === "negative" ? "Copied" : "Copy" }}
              </button>
            </div>
            <pre class="whitespace-pre-wrap break-words rounded border border-line bg-panel px-2.5 py-2 font-sans leading-relaxed text-slate-400">{{ metaData.negativePrompt }}</pre>
          </div>

          <!-- Settings -->
          <div v-if="Object.keys(metaData.settings).length > 0" class="mb-3">
            <div class="mb-1 text-[10px] uppercase tracking-wide text-slate-500">Settings</div>
            <div class="rounded border border-line bg-panel px-2.5 py-2">
              <div
                v-for="[key, val] in Object.entries(metaData.settings)"
                :key="key"
                class="flex gap-2 py-0.5"
              >
                <span class="w-24 shrink-0 text-slate-500">{{ key }}</span>
                <span class="min-w-0 break-all text-slate-200">{{ val }}</span>
              </div>
            </div>
          </div>

          <!-- Unknown raw chunks -->
          <template v-if="metaData.source === 'unknown' && Object.keys(metaData.rawChunks).length > 0">
            <div
              v-for="[key, val] in Object.entries(metaData.rawChunks)"
              :key="key"
              class="mb-3"
            >
              <div class="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wide text-slate-500">
                <span>{{ key }}</span>
                <button
                  class="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-panel hover:text-white transition"
                  :class="copiedKey === key ? 'text-green-400' : 'text-slate-500'"
                  @click="copyText(val, key)"
                >
                  <Clipboard class="h-3 w-3" />
                  {{ copiedKey === key ? "Copied" : "Copy" }}
                </button>
              </div>
              <pre class="whitespace-pre-wrap break-words rounded border border-line bg-panel px-2.5 py-2 font-sans leading-relaxed text-slate-300">{{ val }}</pre>
            </div>
          </template>
        </div>
      </aside>
    </div>
  </div>
</template>
