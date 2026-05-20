<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { Archive, Check, ChevronRight, Download, Eye, EyeOff, Folder, FolderX, RefreshCcw, RotateCcw, Send, Trash2, X } from "lucide-vue-next";
import FilterBar from "@/components/FilterBar.vue";
import ImageGrid from "@/components/ImageGrid.vue";
import ImageLightbox from "@/components/ImageLightbox.vue";
import { copyImagePath, copyImageToClipboard, exportImagesToFolder, revealImage } from "@/services/imageActionService";
import { useImageStore } from "@/stores/imageStore";
import { useSourceStore } from "@/stores/sourceStore";
import { useTargetStore } from "@/stores/targetStore";
import type { ImageWithPostState } from "@/types/image";
import type { PostingTargetType } from "@/types/postingTarget";

// Platform types that have a Chrome Extension adapter.
const EXTENSION_TYPES = new Set<PostingTargetType>(["x", "bluesky", "deviantart", "civitai"]);
const PLATFORM_LIMITS: Record<string, number> = { civitai: 20, x: 4, bluesky: 4, deviantart: 1 };

// Network stat badge styling per platform type.
const TARGET_BADGE_STYLE: Record<PostingTargetType | "default", { bg: string; text: string; label: string }> = {
  x:          { bg: "bg-slate-700",      text: "text-slate-200",  label: "𝕏"  },
  bluesky:    { bg: "bg-sky-900/70",     text: "text-sky-300",    label: "Bsky" },
  deviantart: { bg: "bg-green-900/70",   text: "text-green-300",  label: "DA"  },
  civitai:    { bg: "bg-teal-900/70",    text: "text-teal-300",   label: "Civ" },
  socialdiff: { bg: "bg-violet-900/70",  text: "text-violet-300", label: "SD"  },
  custom:     { bg: "bg-slate-700/60",   text: "text-slate-300",  label: "?"   },
  default:    { bg: "bg-slate-700/60",   text: "text-slate-300",  label: "?"   },
};

function targetBadge(targetId: string) {
  const t = targetStore.targets.find((t) => t.id === targetId);
  return TARGET_BADGE_STYLE[t?.type ?? "default"] ?? TARGET_BADGE_STYLE.default;
}

const imageStore = useImageStore();
const sourceStore = useSourceStore();
const targetStore = useTargetStore();
const previewImage = ref<ImageWithPostState | null>(null);
const selectedTargetIds = ref<string[]>([]);

// ── Double opt-in delete ────────────────────────────────────────────────────
const confirmingDeleteSelected = ref(false);
const confirmingDeleteFolder = ref<string | null>(null);

function requestDeleteSelected() { confirmingDeleteSelected.value = true; }
function cancelDeleteSelected()  { confirmingDeleteSelected.value = false; }
async function confirmDeleteSelected() {
  confirmingDeleteSelected.value = false;
  await imageStore.deleteSelected();
}

function requestDeleteFolder(path: string) { confirmingDeleteFolder.value = path; }
function cancelDeleteFolder()  { confirmingDeleteFolder.value = null; }
async function confirmDeleteFolder() {
  if (!confirmingDeleteFolder.value) return;
  await imageStore.deleteFolder(confirmingDeleteFolder.value);
  confirmingDeleteFolder.value = null;
}

async function deleteSingleFromLightbox(imageId: string) {
  await imageStore.deleteSingleImage(imageId);
  // If the deleted image was showing in the lightbox, close it.
  if (previewImage.value?.id === imageId) previewImage.value = null;
}

// Reload images whenever a filter or showExcludedFolders changes.
onMounted(() => imageStore.load());
watch(() => imageStore.filters, () => imageStore.load(), { deep: true });
watch(() => imageStore.showExcludedFolders, () => imageStore.load());

const activeTargetName = computed(
  () => targetStore.targets.find((target) => target.id === imageStore.filters.targetId)?.name ?? "",
);
const selectedCount = computed(() => imageStore.selectedImageIds.size);

// Enabled targets that have a Chrome Extension adapter.
const extensionTargets = computed(() =>
  targetStore.enabledTargets.filter((t) => EXTENSION_TYPES.has(t.type)),
);

async function queueForExtension(targetType: string) {
  const ids = [...imageStore.selectedImageIds];
  if (!ids.length) return;
  const limit = PLATFORM_LIMITS[targetType] ?? 1;
  const capped = ids.slice(0, limit);
  try {
    await window.desktop.bridge.setQueue(targetType, capped);
    const extra = ids.length > limit ? ` (capped at ${limit})` : "";
    imageStore.message = `✓ ${capped.length} image(s) queued for ${targetType}${extra}. Open the Chrome Extension to inject.`;
  } catch (err) {
    imageStore.error = err instanceof Error ? err.message : String(err);
  }
}

// ── Folder navigation ──────────────────────────────────────────────────────────

/** Segment-aware common ancestor of all scanned folders (the navigation root). */
const rootDir = computed(() => {
  const paths = imageStore.folders.map((f) => f.folderPath);
  if (!paths.length) return "";
  const segs = paths.map((p) => p.split("/"));
  const minLen = Math.min(...segs.map((s) => s.length));
  const common: string[] = [];
  for (let i = 0; i < minLen; i++) {
    if (segs.every((s) => s[i] === segs[0][i])) common.push(segs[0][i]);
    else break;
  }
  return common.join("/");
});

/** The folder path the user has navigated into (empty string = rootDir). */
const currentDir = ref("");

/** The last folder the user navigated out of — highlighted in the parent view. */
const lastVisitedDir = ref("");

// DOM refs for folder cards — keyed by folder path so we can scroll to the highlighted one.
const folderCardRefs = new Map<string, HTMLElement>();
function setFolderCardRef(el: unknown, path: string) {
  if (el instanceof HTMLElement) folderCardRefs.set(path, el);
  else folderCardRefs.delete(path);
}

// After navigating back, scroll the highlighted card into view.
watch(lastVisitedDir, async (path) => {
  if (!path) return;
  await nextTick();
  const target = childFolders.value.find((f) => f.isLastVisited);
  if (target) folderCardRefs.get(target.path)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
});

/** Resolved directory we're currently browsing. */
const browsePath = computed(() => currentDir.value || rootDir.value);

/** Immediate subdirectories of browsePath, with accumulated image counts and excluded state. */
const childFolders = computed(() => {
  const base = browsePath.value;
  if (!base) return [];
  const children = new Map<string, { count: number; isExcluded: boolean; postStats: Map<string, number> }>();
  for (const f of imageStore.folders) {
    if (f.folderPath === base || !f.folderPath.startsWith(base + "/")) continue;
    // Skip excluded folders unless showExcludedFolders is on.
    if (f.isExcluded && !imageStore.showExcludedFolders) continue;
    const remaining = f.folderPath.slice(base.length + 1);
    const nextSeg = remaining.split("/")[0];
    const childPath = base + "/" + nextSeg;
    const existing = children.get(childPath);
    // Merge post stats for this leaf folder into the child accumulator.
    const leafStats = imageStore.folderPostStats.get(f.folderPath) ?? new Map<string, number>();
    const mergedStats = new Map<string, number>(existing?.postStats ?? []);
    for (const [targetId, cnt] of leafStats) {
      mergedStats.set(targetId, (mergedStats.get(targetId) ?? 0) + cnt);
    }
    children.set(childPath, {
      count: (existing?.count ?? 0) + f.count,
      // A child folder card is excluded if ALL its sub-entries are excluded.
      isExcluded: existing ? (existing.isExcluded && f.isExcluded) : f.isExcluded,
      postStats: mergedStats,
    });
  }
  return [...children.entries()]
    .map(([path, { count, isExcluded, postStats }]) => ({
      path,
      name: path.split("/").pop()!,
      count,
      isExcluded,
      postStats,
      isLastVisited: lastVisitedDir.value !== "" && lastVisitedDir.value.startsWith(path),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
});

/** True when we're in a leaf folder (no subfolders). */
const isLeafDir = computed(() => childFolders.value.length === 0 && browsePath.value !== "");

/** True when the current folder itself has direct images (mixed: subfolder + images). */
const hasDirImages = computed(() =>
  browsePath.value !== "" && imageStore.folders.some((f) => f.folderPath === browsePath.value),
);

/** Breadcrumb trail from rootDir to the current directory. */
const breadcrumbs = computed(() => {
  const root = rootDir.value;
  const current = browsePath.value;
  if (!root) return [];
  const crumbs = [{ name: root.split("/").pop() || root, path: root }];
  if (current === root) return crumbs;
  const relative = current.slice(root.length + 1);
  let path = root;
  for (const seg of relative.split("/")) {
    path = path + "/" + seg;
    crumbs.push({ name: seg, path });
  }
  return crumbs;
});

function navigateTo(path: string) {
  const prev = currentDir.value || rootDir.value;
  // Going back (new path is a parent of where we were) → remember the folder we just left.
  if (prev.startsWith(path + "/")) {
    lastVisitedDir.value = prev;
  } else {
    // Going deeper → clear the highlight so it doesn't linger.
    lastVisitedDir.value = "";
  }
  currentDir.value = path;
}

// Keep exactFolderPath in sync whenever the effective browse path changes.
// immediate:true ensures the filter is set on first render even when folders are
// already loaded (pre-loaded in App.vue) and browsePath never "changes" again.
watch(
  browsePath,
  (path) => {
    if (!path) {
      imageStore.filters.exactFolderPath = undefined;
      return;
    }
    const hasDirect = imageStore.folders.some((f) => f.folderPath === path);
    const hasChildren = imageStore.folders.some(
      (f) => f.folderPath !== path && f.folderPath.startsWith(path + "/"),
    );
    imageStore.filters.exactFolderPath = hasDirect || !hasChildren ? path : undefined;
    imageStore.filters.folderPath = undefined;
  },
  { immediate: true },
);

// Reset navigation whenever the folder list changes (e.g. after a new scan).
watch(
  () => imageStore.folders.length,
  () => {
    currentDir.value = "";
    lastVisitedDir.value = "";
  },
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

function lightboxNavigate(image: ImageWithPostState) {
  previewImage.value = image;
}
</script>

<template>
  <div class="flex h-full flex-col overflow-hidden">

    <!-- ── Header ──────────────────────────────────────────────────── -->
    <header class="flex shrink-0 items-center justify-between px-5 pt-5">
      <div>
        <h1 class="text-2xl font-semibold text-white">Image Library</h1>
        <p class="mt-1 text-sm text-slate-400">
          Pick manually, drag or copy the image, then mark the network you posted to.
        </p>
      </div>
      <div class="flex items-center gap-2">
        <button
          class="button gap-1.5"
          :class="imageStore.showExcludedFolders ? 'border-amber-500/60 bg-amber-500/10 text-amber-400' : ''"
          :title="imageStore.showExcludedFolders ? 'Hide excluded folders' : 'Show excluded folders'"
          @click="imageStore.showExcludedFolders = !imageStore.showExcludedFolders"
        >
          <Eye v-if="imageStore.showExcludedFolders" class="h-4 w-4" />
          <EyeOff v-else class="h-4 w-4" />
          {{ imageStore.showExcludedFolders ? "Excluded visible" : "Show excluded" }}
        </button>
        <button class="button" @click="imageStore.load">
          <RefreshCcw class="h-4 w-4" />
          Refresh
        </button>
      </div>
    </header>

    <!-- ── Breadcrumb navigation ────────────────────────────────────── -->
    <nav v-if="breadcrumbs.length" class="flex shrink-0 items-center gap-1 px-5 pt-3 text-sm">
      <template v-for="(crumb, i) in breadcrumbs" :key="crumb.path">
        <button
          class="max-w-48 truncate transition"
          :class="i === breadcrumbs.length - 1 ? 'font-medium text-white' : 'text-slate-400 hover:text-white'"
          :title="crumb.path"
          @click="navigateTo(crumb.path)"
        >
          {{ crumb.name }}
        </button>
        <ChevronRight v-if="i < breadcrumbs.length - 1" class="h-3.5 w-3.5 shrink-0 text-slate-600" />
      </template>
    </nav>

    <!-- ── Sticky action toolbar (only when viewing images) ──────── -->
    <section
      v-if="isLeafDir || hasDirImages"
      class="shrink-0 border-b border-line bg-panel px-4 py-2"
    >
      <!-- Row 1: selection actions -->
      <div class="flex flex-wrap items-center gap-1.5">
        <span class="mr-1 text-xs font-medium text-white">{{ selectedCount }} selected</span>
        <button class="button h-7 px-2 text-xs" @click="imageStore.selectVisible">Select visible</button>
        <button class="button h-7 px-2 text-xs" :disabled="selectedCount === 0" @click="imageStore.clearSelection">
          <X class="h-3 w-3" />Clear
        </button>
        <button class="button h-7 px-2 text-xs" :disabled="selectedCount === 0" @click="imageStore.excludeSelected">
          <Archive class="h-3 w-3" />Exclude
        </button>
        <button class="button h-7 px-2 text-xs" :disabled="selectedCount === 0" @click="imageStore.restoreSelected">
          <RotateCcw class="h-3 w-3" />Restore
        </button>
        <button class="button h-7 px-2 text-xs" :disabled="selectedCount === 0" @click="exportSelected">
          <Download class="h-3 w-3" />Download
        </button>
        <template v-if="!confirmingDeleteSelected">
          <button
            class="button h-7 px-2 text-xs hover:border-rose/60 hover:text-rose"
            :disabled="selectedCount === 0"
            @click="requestDeleteSelected"
          ><Trash2 class="h-3 w-3" />Delete</button>
        </template>
        <template v-else>
          <span class="text-xs text-rose">Remove {{ selectedCount }} image(s)?</span>
          <button class="button h-7 border-rose/60 bg-rose/10 px-2 text-xs text-rose hover:bg-rose/20" @click="confirmDeleteSelected">Confirm</button>
          <button class="button h-7 px-2 text-xs" @click="cancelDeleteSelected">Cancel</button>
        </template>
      </div>

      <!-- Row 2: mark as posted -->
      <div class="mt-1.5 flex flex-wrap items-center gap-1.5">
        <span class="mr-1 shrink-0 text-xs text-slate-400">Mark as posted on</span>
        <label
          v-for="target in targetStore.enabledTargets"
          :key="target.id"
          class="flex shrink-0 cursor-pointer items-center gap-1.5 rounded border px-2 py-1 text-xs transition"
          :class="selectedTargetIds.includes(target.id) ? 'border-accent bg-accent/10 text-accent' : 'border-line bg-ink text-slate-300'"
        >
          <input v-model="selectedTargetIds" type="checkbox" class="h-3 w-3 accent-accent" :value="target.id" />
          {{ target.name }}
        </label>
        <button
          class="button-primary h-7 shrink-0 whitespace-nowrap px-3 text-xs"
          :disabled="selectedCount === 0 || selectedTargetIds.length === 0"
          @click="markSelected"
        ><Check class="h-3 w-3" />Mark as posted</button>
      </div>

      <!-- Row 3: queue for Chrome Extension -->
      <div v-if="extensionTargets.length" class="mt-1.5 flex flex-wrap items-center gap-1.5 border-t border-line pt-1.5">
        <span class="mr-1 shrink-0 text-xs text-slate-400">Queue for Extension</span>
        <button
          v-for="target in extensionTargets"
          :key="target.id"
          class="button h-7 shrink-0 whitespace-nowrap px-2 text-xs"
          :disabled="selectedCount === 0"
          :title="`Queue up to ${PLATFORM_LIMITS[target.type] ?? 1} images for ${target.name}`"
          @click="queueForExtension(target.type)"
        >
          <Send class="h-3 w-3" />
          {{ target.name }}
          <span class="ml-0.5 text-[10px] text-slate-500">(max {{ PLATFORM_LIMITS[target.type] ?? 1 }})</span>
        </button>
      </div>
    </section>

    <!-- Message / error banners (sticky, below toolbar) -->
    <div v-if="imageStore.message" class="shrink-0 border-b border-mint/30 bg-mint/10 px-4 py-1.5 text-xs text-mint">
      {{ imageStore.message }}
    </div>
    <div v-if="imageStore.error" class="shrink-0 border-b border-rose/40 bg-rose/10 px-4 py-1.5 text-xs text-rose">
      {{ imageStore.error }}
    </div>

    <!-- ── Scrollable body ──────────────────────────────────────────── -->
    <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5 pt-3">

      <!-- Filter bar (always visible for source / target filtering) -->
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

      <!-- ── FOLDER BROWSER ─────────────────────────────────────────── -->
      <div
        v-if="childFolders.length"
        class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
      >
        <div
          v-for="folder in childFolders"
          :key="folder.path"
          :ref="(el) => setFolderCardRef(el, folder.path)"
          class="group relative flex flex-col items-center gap-3 rounded-xl border p-6 text-center transition"
          :class="folder.isExcluded
            ? 'border-amber-500/30 bg-amber-500/5 opacity-60 hover:opacity-90'
            : folder.isLastVisited
              ? 'border-accent/60 bg-accent/10 hover:border-accent hover:bg-accent/15'
              : 'border-line bg-panel hover:border-accent hover:bg-panelSoft'"
        >
          <!-- Excluded badge -->
          <span
            v-if="folder.isExcluded"
            class="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-xs text-amber-400"
          >
            <FolderX class="h-3 w-3" />Done
          </span>

          <button class="flex w-full flex-col items-center gap-3" :title="folder.path" @click="navigateTo(folder.path)">
            <Folder
              class="h-12 w-12 transition"
              :class="folder.isExcluded ? 'text-amber-500/50' : 'text-slate-500 group-hover:text-accent'"
            />
            <div class="w-full">
              <p class="truncate font-medium" :class="folder.isExcluded ? 'text-slate-400' : 'text-white'">{{ folder.name }}</p>
              <p class="mt-0.5 text-xs text-slate-500">{{ folder.count }} images</p>
              <!-- Network post stats chips -->
              <div v-if="folder.postStats.size > 0" class="mt-1.5 flex flex-wrap justify-center gap-1">
                <span
                  v-for="[targetId, cnt] in folder.postStats"
                  :key="targetId"
                  class="rounded px-1.5 py-0.5 text-[10px] font-semibold leading-none"
                  :class="[targetBadge(targetId).bg, targetBadge(targetId).text]"
                  :title="targetStore.targets.find(t => t.id === targetId)?.name + ': ' + cnt + ' posted'"
                >{{ targetBadge(targetId).label }} {{ cnt }}</span>
              </div>
            </div>
          </button>

          <!-- Bottom action row: exclude/include + delete -->
          <div class="flex shrink-0 items-center gap-1">
            <!-- Exclude / Re-include toggle -->
            <button
              v-if="!folder.isExcluded"
              class="button h-7 gap-1 px-2 text-xs opacity-0 transition group-hover:opacity-100 hover:border-amber-500/60 hover:text-amber-400"
              title="Mark folder as done — excluded from Picker"
              @click.stop="imageStore.excludeFolderFromLibrary(folder.path)"
            >
              <EyeOff class="h-3.5 w-3.5" />Exclude
            </button>
            <button
              v-else
              class="button h-7 gap-1 border-amber-500/40 bg-amber-500/10 px-2 text-xs text-amber-400 hover:bg-amber-500/20"
              title="Re-include folder in Picker"
              @click.stop="imageStore.includeFolderInLibrary(folder.path)"
            >
              <Eye class="h-3.5 w-3.5" />Re-include
            </button>

            <!-- Delete (two-step) -->
            <template v-if="confirmingDeleteFolder !== folder.path">
              <button
                class="button h-7 w-7 p-0 opacity-0 transition group-hover:opacity-100 hover:border-rose/60 hover:text-rose"
                title="Remove folder from library index"
                @click.stop="requestDeleteFolder(folder.path)"
              >
                <Trash2 class="h-3.5 w-3.5" />
              </button>
            </template>
            <template v-else>
              <span class="text-xs text-rose">Remove?</span>
              <button class="button h-7 border-rose/60 bg-rose/10 px-2 text-xs text-rose hover:bg-rose/20" @click.stop="confirmDeleteFolder">Yes</button>
              <button class="button h-7 px-2 text-xs" @click.stop="cancelDeleteFolder">No</button>
            </template>
          </div>
        </div>
      </div>

      <!-- Divider when folder has both subfolders and direct images -->
      <div v-if="childFolders.length && hasDirImages" class="flex items-center gap-3">
        <div class="h-px flex-1 bg-line" />
        <span class="text-xs text-slate-500">Images in this folder</span>
        <div class="h-px flex-1 bg-line" />
      </div>

      <!-- ── IMAGE VIEW (leaf folder OR mixed folder with direct images) -->
      <template v-if="isLeafDir || hasDirImages">
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
      </template>

      <!-- ── EMPTY STATE ─────────────────────────────────────────────── -->
      <div v-if="!childFolders.length && !isLeafDir && !hasDirImages" class="flex flex-1 flex-col items-center justify-center gap-3 text-center text-slate-500">
        <Folder class="h-16 w-16 opacity-30" />
        <p class="text-lg font-medium">No images scanned yet</p>
        <p class="text-sm">Go to <strong class="text-slate-400">Scan</strong> and add a source folder.</p>
      </div>

    </div><!-- end scrollable body -->

    <ImageLightbox
      :image="previewImage"
      :images="imageStore.images"
      :selected-image-ids="imageStore.selectedImageIds"
      @close="previewImage = null"
      @navigate="lightboxNavigate"
      @toggle-selected="imageStore.toggleSelected"
      @delete="deleteSingleFromLightbox"
    />
  </div>
</template>
