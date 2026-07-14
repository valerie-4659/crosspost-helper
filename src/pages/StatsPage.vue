<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { ArrowDownUp, ArrowLeft, ChevronLeft, ChevronRight, RefreshCcw, X } from "lucide-vue-next";
import { convertFileSrc } from "@/electron-shims/core";
import {
  countCheckpointImages,
  listCheckpointImages,
  listCheckpointStats,
} from "@/repositories/imageRepository";
import type { CheckpointStat } from "@/repositories/imageRepository";
import type { ImageWithPostState } from "@/types/image";

const stats   = ref<CheckpointStat[]>([]);
const loading = ref(false);
const error   = ref("");
const sortBy  = ref<"count" | "name">("count");

const sorted = computed(() => {
  const list = [...stats.value];
  if (sortBy.value === "name") list.sort((a, b) => a.checkpoint.localeCompare(b.checkpoint));
  return list;
});

/** Always the 10 most-used checkpoints, regardless of the table sort order. */
const topTen = computed(() =>
  [...stats.value].sort((a, b) => b.count - a.count).slice(0, 10),
);

const total = computed(() => stats.value.reduce((s, r) => s + r.count, 0));

const maxCount = computed(() => Math.max(...stats.value.map((r) => r.count), 1));

function pct(count: number) {
  return Math.round((count / maxCount.value) * 100);
}

function toggleSort() {
  sortBy.value = sortBy.value === "count" ? "name" : "count";
}

async function load() {
  loading.value = true;
  error.value = "";
  try {
    stats.value = await listCheckpointStats();
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}

onMounted(load);

// ── Checkpoint image library (detail view) ──────────────────────────────────
const PAGE_SIZE = 60;

const selectedCheckpoint = ref<string | null>(null);
const detailImages   = ref<ImageWithPostState[]>([]);
const detailTotal    = ref(0);
const detailPage     = ref(0); // 0-based
const detailLoading  = ref(false);
const detailError    = ref("");

const pageCount = computed(() => Math.max(1, Math.ceil(detailTotal.value / PAGE_SIZE)));
const rangeFrom = computed(() => (detailTotal.value === 0 ? 0 : detailPage.value * PAGE_SIZE + 1));
const rangeTo   = computed(() => Math.min(detailTotal.value, (detailPage.value + 1) * PAGE_SIZE));

async function openCheckpoint(checkpoint: string) {
  selectedCheckpoint.value = checkpoint;
  detailPage.value = 0;
  detailError.value = "";
  detailImages.value = [];
  try {
    detailTotal.value = await countCheckpointImages(checkpoint);
  } catch (e) {
    detailError.value = e instanceof Error ? e.message : String(e);
    detailTotal.value = 0;
  }
  await loadDetailPage();
}

async function loadDetailPage() {
  if (!selectedCheckpoint.value) return;
  detailLoading.value = true;
  detailError.value = "";
  try {
    detailImages.value = await listCheckpointImages(
      selectedCheckpoint.value,
      PAGE_SIZE,
      detailPage.value * PAGE_SIZE,
    );
  } catch (e) {
    detailError.value = e instanceof Error ? e.message : String(e);
  } finally {
    detailLoading.value = false;
  }
}

function goToPage(page: number) {
  const clamped = Math.min(Math.max(0, page), pageCount.value - 1);
  if (clamped === detailPage.value) return;
  detailPage.value = clamped;
  lightboxIndex.value = null;
  loadDetailPage();
}

function backToList() {
  selectedCheckpoint.value = null;
  detailImages.value = [];
  lightboxIndex.value = null;
}

// ── Thumbnail / lightbox helpers ─────────────────────────────────────────────
function isVideo(img: ImageWithPostState) {
  return img.mimeType?.startsWith("video/") ?? false;
}

function thumbUrl(img: ImageWithPostState) {
  if (isVideo(img)) return "";
  if (img.thumbnailUrl) return img.thumbnailUrl;
  if (img.localPath) return convertFileSrc(img.localPath);
  return "";
}

function mediaUrl(img: ImageWithPostState) {
  return img.localPath ? convertFileSrc(img.localPath) : img.thumbnailUrl ?? "";
}

/** Index into detailImages of the image shown in the lightbox, or null when closed. */
const lightboxIndex = ref<number | null>(null);
const lightboxImage = computed(() =>
  lightboxIndex.value === null ? null : detailImages.value[lightboxIndex.value] ?? null,
);

function openLightbox(idx: number) { lightboxIndex.value = idx; }
function closeLightbox() { lightboxIndex.value = null; }
function lightboxPrev() {
  if (lightboxIndex.value !== null && lightboxIndex.value > 0) lightboxIndex.value--;
}
function lightboxNext() {
  if (lightboxIndex.value !== null && lightboxIndex.value < detailImages.value.length - 1) lightboxIndex.value++;
}
</script>

<template>
  <div class="flex h-full flex-col overflow-hidden">
    <!-- ══════════════ Detail view: images for one checkpoint ══════════════ -->
    <template v-if="selectedCheckpoint !== null">
      <!-- Header -->
      <div class="flex shrink-0 items-center justify-between border-b border-line px-6 py-4">
        <div class="flex min-w-0 items-center gap-3">
          <button class="button flex items-center gap-1.5 text-xs" @click="backToList">
            <ArrowLeft class="h-3.5 w-3.5" />
            Back
          </button>
          <div class="min-w-0">
            <h1 class="truncate font-mono text-lg font-semibold text-white">{{ selectedCheckpoint }}</h1>
            <p class="mt-0.5 text-xs text-slate-400">
              {{ detailTotal.toLocaleString() }} image{{ detailTotal === 1 ? "" : "s" }}
            </p>
          </div>
        </div>
      </div>

      <!-- Detail error -->
      <div v-if="detailError" class="mx-6 mt-4 rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
        {{ detailError }}
      </div>

      <!-- Loading -->
      <div v-if="detailLoading && !detailImages.length" class="flex flex-1 items-center justify-center text-sm text-slate-400">
        Loading…
      </div>

      <!-- Empty -->
      <div v-else-if="!detailLoading && detailImages.length === 0" class="flex flex-1 items-center justify-center text-sm text-slate-400">
        No images found for this checkpoint.
      </div>

      <!-- Image grid -->
      <div v-else class="flex-1 overflow-y-auto px-6 py-4">
        <div class="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
          <button
            v-for="(img, idx) in detailImages"
            :key="img.id"
            class="group relative aspect-square overflow-hidden rounded-md border border-line bg-panel transition hover:border-accent/60 focus:border-accent focus:outline-none"
            :title="img.filename"
            @click="openLightbox(idx)"
          >
            <video
              v-if="isVideo(img)"
              :src="mediaUrl(img)"
              class="h-full w-full object-cover"
              muted
              preload="metadata"
            />
            <img
              v-else
              :src="thumbUrl(img)"
              loading="lazy"
              class="h-full w-full object-cover transition group-hover:scale-105"
              alt=""
            />
            <span class="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/80 to-transparent px-1.5 pb-1 pt-4 text-left text-[10px] text-slate-200 opacity-0 transition group-hover:opacity-100">
              {{ img.filename }}
            </span>
          </button>
        </div>
      </div>

      <!-- Pagination -->
      <div v-if="detailTotal > 0" class="flex shrink-0 items-center justify-between border-t border-line px-6 py-3">
        <span class="text-xs text-slate-400">
          Showing {{ rangeFrom.toLocaleString() }}–{{ rangeTo.toLocaleString() }} of {{ detailTotal.toLocaleString() }}
        </span>
        <div class="flex items-center gap-2">
          <button
            class="button h-8 w-8 p-0"
            :disabled="detailPage === 0 || detailLoading"
            title="Previous page"
            @click="goToPage(detailPage - 1)"
          >
            <ChevronLeft class="h-4 w-4" />
          </button>
          <span class="text-xs tabular-nums text-slate-300">
            Page {{ detailPage + 1 }} / {{ pageCount }}
          </span>
          <button
            class="button h-8 w-8 p-0"
            :disabled="detailPage >= pageCount - 1 || detailLoading"
            title="Next page"
            @click="goToPage(detailPage + 1)"
          >
            <ChevronRight class="h-4 w-4" />
          </button>
        </div>
      </div>
    </template>

    <!-- ══════════════════════════ List view ══════════════════════════ -->
    <template v-else>
      <!-- Header -->
      <div class="flex shrink-0 items-center justify-between border-b border-line px-6 py-4">
        <div>
          <h1 class="text-lg font-semibold text-white">Checkpoint Stats</h1>
          <p v-if="!loading && total > 0" class="mt-0.5 text-xs text-slate-400">
            {{ total.toLocaleString() }} images across {{ stats.length }} checkpoints
          </p>
        </div>
        <div class="flex items-center gap-2">
          <button class="button flex items-center gap-1.5 text-xs" @click="toggleSort">
            <ArrowDownUp class="h-3.5 w-3.5" />
            Sort: {{ sortBy === "count" ? "Count" : "Name" }}
          </button>
          <button class="button flex items-center gap-1.5 text-xs" :disabled="loading" @click="load">
            <RefreshCcw class="h-3.5 w-3.5" :class="loading ? 'animate-spin' : ''" />
            Refresh
          </button>
        </div>
      </div>

      <!-- Error -->
      <div v-if="error" class="mx-6 mt-4 rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
        {{ error }}
      </div>

      <!-- Loading -->
      <div v-if="loading && !stats.length" class="flex flex-1 items-center justify-center text-sm text-slate-400">
        Loading…
      </div>

      <!-- Empty -->
      <div v-else-if="!loading && stats.length === 0" class="flex flex-1 items-center justify-center text-sm text-slate-400">
        No images found in the library.
      </div>

      <!-- Content -->
      <div v-else class="flex-1 overflow-y-auto px-6 py-4">
        <!-- ── Top 10 ─────────────────────────────────────────────── -->
        <section class="mb-8">
          <h2 class="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Top 10 most used</h2>
          <div class="grid gap-2 sm:grid-cols-2">
            <button
              v-for="(row, i) in topTen"
              :key="row.checkpoint"
              class="group flex items-center gap-3 rounded-lg border border-line bg-panel px-3 py-2 text-left transition hover:border-accent/60 hover:bg-panelSoft"
              @click="openCheckpoint(row.checkpoint)"
            >
              <span
                class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold"
                :class="[
                  i === 0 ? 'bg-amber-400/20 text-amber-300'
                  : i === 1 ? 'bg-slate-300/20 text-slate-200'
                  : i === 2 ? 'bg-orange-500/20 text-orange-300'
                  : 'bg-panelSoft text-slate-400',
                ]"
              >
                {{ i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1 }}
              </span>
              <div class="min-w-0 flex-1">
                <div class="truncate font-mono text-xs text-slate-200 group-hover:text-white">{{ row.checkpoint }}</div>
                <div class="mt-1 h-1.5 overflow-hidden rounded-full bg-ink">
                  <div class="h-full rounded-full bg-accent" :style="{ width: pct(row.count) + '%' }" />
                </div>
              </div>
              <span class="shrink-0 tabular-nums text-sm font-medium text-slate-300">{{ row.count.toLocaleString() }}</span>
            </button>
          </div>
        </section>

        <!-- ── Full table ─────────────────────────────────────────── -->
        <h2 class="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">All checkpoints</h2>
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-line text-xs uppercase tracking-wide text-slate-500">
              <th class="pb-2 pr-4 text-left font-medium">Checkpoint</th>
              <th class="pb-2 pr-6 text-right font-medium">Images</th>
              <th class="pb-2 text-left font-medium">Distribution</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-line">
            <tr
              v-for="row in sorted"
              :key="row.checkpoint"
              class="group cursor-pointer transition hover:bg-panelSoft/60"
              :title="`View images for ${row.checkpoint}`"
              @click="openCheckpoint(row.checkpoint)"
            >
              <td class="py-2.5 pr-4 font-mono text-xs text-slate-200 group-hover:text-accent">{{ row.checkpoint }}</td>
              <td class="py-2.5 pr-6 text-right tabular-nums text-slate-300">{{ row.count.toLocaleString() }}</td>
              <td class="py-2.5">
                <div class="flex items-center gap-2">
                  <div class="h-2 flex-1 overflow-hidden rounded-full bg-panel">
                    <div
                      class="h-full rounded-full bg-accent transition-all"
                      :style="{ width: pct(row.count) + '%' }"
                    />
                  </div>
                  <span class="w-8 text-right text-xs text-slate-500">{{ pct(row.count) }}%</span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <!-- ══════════════════════════ Lightbox ══════════════════════════ -->
    <div
      v-if="lightboxImage"
      class="fixed inset-0 z-50 flex flex-col bg-black/90"
      @click.self="closeLightbox"
    >
      <div class="flex shrink-0 items-center justify-between px-6 py-3 text-slate-200">
        <div class="min-w-0">
          <div class="truncate font-mono text-sm">{{ lightboxImage.filename }}</div>
          <div class="truncate text-xs text-slate-500">{{ lightboxImage.folderPath }}</div>
        </div>
        <button class="button h-8 w-8 p-0" title="Close" @click="closeLightbox">
          <X class="h-4 w-4" />
        </button>
      </div>
      <div class="relative flex flex-1 items-center justify-center overflow-hidden px-4 pb-4">
        <button
          v-if="lightboxIndex !== null && lightboxIndex > 0"
          class="button absolute left-4 top-1/2 h-10 w-10 -translate-y-1/2 p-0"
          title="Previous"
          @click.stop="lightboxPrev"
        >
          <ChevronLeft class="h-5 w-5" />
        </button>
        <video
          v-if="isVideo(lightboxImage)"
          :src="mediaUrl(lightboxImage)"
          class="max-h-full max-w-full rounded-md object-contain"
          controls
          autoplay
        />
        <img
          v-else
          :src="mediaUrl(lightboxImage)"
          class="max-h-full max-w-full rounded-md object-contain"
          alt=""
        />
        <button
          v-if="lightboxIndex !== null && lightboxIndex < detailImages.length - 1"
          class="button absolute right-4 top-1/2 h-10 w-10 -translate-y-1/2 p-0"
          title="Next"
          @click.stop="lightboxNext"
        >
          <ChevronRight class="h-5 w-5" />
        </button>
      </div>
    </div>
  </div>
</template>
