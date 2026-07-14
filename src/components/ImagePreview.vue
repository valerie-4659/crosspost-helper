<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { convertFileSrc } from "@/electron-shims/core";
import { ImageOff, Maximize2, ZoomIn, ZoomOut } from "lucide-vue-next";
import type { ImageWithPostState } from "@/types/image";

const props = defineProps<{
  image: ImageWithPostState | null;
}>();

const isVideo = computed(() => props.image?.mimeType?.startsWith("video/") ?? false);

const mediaUrl = computed(() => {
  if (!props.image) return "";
  // Prefer the full local file so the picker shows the real image at full
  // resolution — the thumbnail (400 px JPEG) is only a fallback for cases
  // where the local file is no longer accessible.
  if (props.image.localPath) return convertFileSrc(props.image.localPath);
  if (props.image.thumbnailUrl) return props.image.thumbnailUrl;
  return "";
});

function handleDragStart(event: DragEvent) {
  const localPath = props.image?.localPath;
  if (!localPath || !window.desktop?.core?.startDrag) return;

  // Cancel HTML5 drag to avoid the dual-drag freeze on macOS.
  event.preventDefault();

  let iconPath: string | undefined;
  if (props.image?.thumbnailUrl?.startsWith("localfile://")) {
    let p = decodeURIComponent(props.image.thumbnailUrl.slice("localfile://".length));
    if (/^\/[A-Za-z]:/.test(p)) p = p.slice(1);
    iconPath = p;
  }

  window.desktop.core.startDrag([localPath], iconPath);
}

// ── Zoom / pan — lets you inspect an image close-up for artifacts ──────────
const ZOOM_MIN = 1;
const ZOOM_MAX = 8;
const zoom = ref(1);
const pan = ref({ x: 0, y: 0 });
const viewport = ref<HTMLElement | null>(null);
const panning = ref(false);
let panStart = { x: 0, y: 0, panX: 0, panY: 0 };

const zoomed = computed(() => zoom.value > 1);
const zoomPct = computed(() => Math.round(zoom.value * 100));

function resetZoom() {
  zoom.value = 1;
  pan.value = { x: 0, y: 0 };
}

// Reset zoom whenever the previewed image changes.
watch(() => props.image?.id, resetZoom);

function clampPan() {
  // Keep panning loosely bounded so the image can't be dragged fully off-screen.
  const el = viewport.value;
  if (!el) return;
  const maxX = (el.clientWidth * (zoom.value - 1)) / 2;
  const maxY = (el.clientHeight * (zoom.value - 1)) / 2;
  pan.value = {
    x: Math.min(maxX, Math.max(-maxX, pan.value.x)),
    y: Math.min(maxY, Math.max(-maxY, pan.value.y)),
  };
}

function zoomAt(clientX: number, clientY: number, nextZoom: number) {
  const el = viewport.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const cx = clientX - rect.left - rect.width / 2;
  const cy = clientY - rect.top - rect.height / 2;
  const ratio = nextZoom / zoom.value;
  pan.value = {
    x: cx - (cx - pan.value.x) * ratio,
    y: cy - (cy - pan.value.y) * ratio,
  };
  zoom.value = nextZoom;
  clampPan();
}

function handleWheel(event: WheelEvent) {
  if (!mediaUrl.value || isVideo.value) return;
  event.preventDefault();
  const factor = Math.exp(-event.deltaY * 0.0015);
  const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom.value * factor));
  zoomAt(event.clientX, event.clientY, next);
}

function stepZoom(delta: number) {
  const el = viewport.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom.value + delta));
  zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, next);
}

function handleDoubleClick(event: MouseEvent) {
  if (!mediaUrl.value || isVideo.value) return;
  if (zoomed.value) resetZoom();
  else zoomAt(event.clientX, event.clientY, 3);
}

function startPan(event: MouseEvent) {
  if (!zoomed.value) return;
  panning.value = true;
  panStart = { x: event.clientX, y: event.clientY, panX: pan.value.x, panY: pan.value.y };
  event.preventDefault();
}

function movePan(event: MouseEvent) {
  if (!panning.value) return;
  pan.value = {
    x: panStart.panX + (event.clientX - panStart.x),
    y: panStart.panY + (event.clientY - panStart.y),
  };
  clampPan();
}

function endPan() {
  panning.value = false;
}
</script>

<template>
  <section class="surface flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg">
    <div
      ref="viewport"
      class="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-black/40"
      @wheel="handleWheel"
      @mousedown="startPan"
      @mousemove="movePan"
      @mouseup="endPan"
      @mouseleave="endPan"
    >
      <video
        v-if="image && mediaUrl && isVideo"
        :src="mediaUrl"
        class="max-h-full max-w-full"
        controls
        loop
      />
      <img
        v-else-if="image && mediaUrl"
        :src="mediaUrl"
        :alt="image.filename"
        class="max-h-full max-w-full select-none object-contain"
        :class="zoomed ? (panning ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-zoom-in'"
        :style="{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transition: panning ? 'none' : 'transform 0.08s ease-out' }"
        :draggable="!zoomed"
        @dragstart="handleDragStart"
        @dblclick="handleDoubleClick"
      />
      <div v-else class="flex flex-col items-center gap-3 text-slate-500">
        <ImageOff class="h-12 w-12" />
        <p class="text-sm">Pick an image or video to preview it here.</p>
      </div>

      <!-- Zoom controls -->
      <div
        v-if="image && mediaUrl && !isVideo"
        class="absolute bottom-3 right-3 flex items-center gap-1 rounded-lg border border-line bg-ink/80 p-1 backdrop-blur"
      >
        <button class="button h-7 w-7 p-0" title="Zoom out" @click="stepZoom(-0.5)"><ZoomOut class="h-3.5 w-3.5" /></button>
        <span class="w-11 text-center text-xs text-slate-300">{{ zoomPct }}%</span>
        <button class="button h-7 w-7 p-0" title="Zoom in" @click="stepZoom(0.5)"><ZoomIn class="h-3.5 w-3.5" /></button>
        <button v-if="zoomed" class="button h-7 w-7 p-0" title="Reset zoom" @click="resetZoom"><Maximize2 class="h-3.5 w-3.5" /></button>
      </div>
    </div>
    <div v-if="image" class="border-t border-line p-4">
      <div class="flex items-start justify-between gap-4">
        <div class="min-w-0">
          <h2 class="truncate text-lg font-semibold text-white">{{ image.filename }}</h2>
          <p class="mt-1 truncate text-sm text-slate-400">{{ image.folderPath }}</p>
        </div>
        <div class="shrink-0 text-right text-xs text-slate-500">
          <div>{{ image.sourceName }}</div>
          <div>{{ image.createdAt || image.modifiedAt || image.indexedAt }}</div>
        </div>
      </div>
    </div>
  </section>
</template>
