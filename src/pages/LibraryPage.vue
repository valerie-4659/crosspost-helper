<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { Archive, Check, ChevronDown, ChevronLeft, ChevronRight, Clapperboard, Download, Eye, EyeOff, Folder, FolderOpen, FolderX, Image, RefreshCcw, RotateCcw, Send, Sparkles, Trash2, Upload, X, Zap } from "lucide-vue-next";
import AiPostPanel from "@/components/AiPostPanel.vue";
import VideoPromptPanel from "@/components/VideoPromptPanel.vue";
import ImageGeneratePanel from "@/components/ImageGeneratePanel.vue";
import FilterBar from "@/components/FilterBar.vue";
import ImageGrid from "@/components/ImageGrid.vue";
import ImageLightbox from "@/components/ImageLightbox.vue";
import PlatformIcon from "@/components/PlatformIcon.vue";
import { copyImagePath, copyImageToClipboard, exportImagesToFolder, revealImage } from "@/services/imageActionService";
import { useAiStore } from "@/stores/aiStore";
import { useFolderHistoryStore } from "@/stores/folderHistoryStore";
import { useImageStore } from "@/stores/imageStore";
import { useSourceStore } from "@/stores/sourceStore";
import { useTargetStore } from "@/stores/targetStore";
import { useQueueStore } from "@/stores/queueStore";
import { listSlots, getSlotImageData } from "@/repositories/queueRepository";
import type { ImageWithPostState } from "@/types/image";
import type { PostingTargetType } from "@/types/postingTarget";
import type { QueueSlot } from "@/types/queue";

// All platform types — queue buttons show for all of them.
const EXTENSION_TYPES = new Set<PostingTargetType>(["x", "bluesky", "deviantart", "civitai", "instagram", "facebook", "tumblr"]);
const PLATFORM_LIMITS: Record<string, number> = { civitai: 20, x: 4, bluesky: 4, deviantart: 1, instagram: 10, facebook: 10, tumblr: 10 };

const ai = useAiStore();

// ── Lib-mode panel-state persistence (separate from Picker mode) ──────────
const LS_LIB_PANELS = "crosspost_lib_panels";
const LS_LIB_TOPAZ  = "crosspost_lib_topaz";
function _loadLibPanels() {
  try { return JSON.parse(localStorage.getItem(LS_LIB_PANELS) ?? "null") ?? {}; } catch { return {}; }
}
function _loadLibTopazSettings() {
  try { return JSON.parse(localStorage.getItem(LS_LIB_TOPAZ) ?? "null") ?? {}; } catch { return {}; }
}
const _savedLibPanels = _loadLibPanels();
const _savedLibTopaz  = _loadLibTopazSettings();

const showAiPanel    = ref<boolean>(_savedLibPanels.showAiPanel    ?? false);
const showVideoPanel = ref<boolean>(_savedLibPanels.showVideoPanel ?? false);

/** When set, the video modal analyses only this single image path (card button click). */
const videoPromptSinglePath = ref<string | null>(null);

function openVideoPromptForImage(localPath: string) {
  videoPromptSinglePath.value = localPath;
  showVideoPanel.value = true;
}

function closeVideoPanel() {
  showVideoPanel.value = false;
  videoPromptSinglePath.value = null;
}

const showImagePanel = ref<boolean>(_savedLibPanels.showImagePanel ?? false);
/** When set, the image recreate modal analyses only this single image path. */
const imageRecreateSinglePath = ref<string | null>(null);

function openImageRecreateForImage(localPath: string) {
  imageRecreateSinglePath.value = localPath;
  showImagePanel.value = true;
}

function closeImagePanel() {
  showImagePanel.value = false;
  imageRecreateSinglePath.value = null;
}

// Persist lib panel open/close state across navigation.
watch([showAiPanel, showVideoPanel, showImagePanel], () => {
  localStorage.setItem(LS_LIB_PANELS, JSON.stringify({
    showAiPanel:    showAiPanel.value,
    showVideoPanel: showVideoPanel.value,
    showImagePanel: showImagePanel.value,
  }));
});

// ── Topaz Upscale Modal (fire-and-forget) ────────────────────────────────────
type TopazUIModel = "standard" | "realism" | "wonder3";

const showTopazModal        = ref(false);
const topazImagePath        = ref<string | null>(null);
const topazUIModel          = ref<TopazUIModel>((_savedLibTopaz.topazUIModel        as TopazUIModel) ?? "standard");
const topazStdCreativity    = ref<"subtle"|"low"|"medium"|"high"|"max">(_savedLibTopaz.topazStdCreativity ?? "medium");
const topazRlmCreativity    = ref<"low"|"medium"|"high"|"max">(_savedLibTopaz.topazRlmCreativity           ?? "medium");
const topazW3Enhancement    = ref<"low"|"medium"|"high">(_savedLibTopaz.topazW3Enhancement                 ?? "medium");
const topazScale            = ref<1|2|4|6|8>(_savedLibTopaz.topazScale              ?? 2);
const topazOutputs          = ref<1|2|4>(_savedLibTopaz.topazOutputs                ?? 1);
const topazPreserveFaces    = ref<boolean>(_savedLibTopaz.topazPreserveFaces         ?? false);
const topazPrompt           = ref("");
const topazFormat           = ref<"jpeg"|"png">(_savedLibTopaz.topazFormat           ?? "jpeg");
const topazSubmitError      = ref("");
const topazGeneratingPrompt = ref(false);

/** Jobs submitted in the current modal session, tracked live via topaz:jobUpdated. */
interface TopazTrackedJob { localId: string; status: "processing"|"completed"|"failed"; result_path: string|null; error_msg: string|null; saving?: boolean; saved_path?: string|null; }
const topazTrackedJobs = ref<TopazTrackedJob[]>([]);

// ── Path helpers (no Node.js in renderer) ────────────────────────────────
function pathDirname(p: string)       { return p.replace(/[\\/][^\\/]+$/, ""); }
function pathBasenameNoExt(p: string) { return p.replace(/.*[\\/]/, "").replace(/\.[^.]+$/, ""); }
function sanitizeForFilename(s: string){ return s.replace(/[^a-z0-9_-]/gi, "_").toLowerCase(); }
function dateStamp(): string {
  const d = new Date(), z = (n: number) => String(n).padStart(2, "0");
  return `${z(d.getDate())}${z(d.getMonth() + 1)}${d.getFullYear()}${z(d.getHours())}${z(d.getMinutes())}`;
}

async function copyTopazResultToSource(job: TopazTrackedJob, idx: number) {
  const sourcePath = topazImagePath.value;
  if (!job.result_path || !sourcePath) return;
  job.saving = true;
  try {
    const destDir  = pathDirname(sourcePath);
    const baseName = pathBasenameNoExt(sourcePath);
    const model    = sanitizeForFilename(topazUIModel.value);
    const ext      = topazFormat.value;
    const filename = `${baseName}_rec_${model}_${dateStamp()}.${ext}`;
    const destPath = `${destDir}/${filename}`;
    const result   = await window.desktop.files.copyFile(job.result_path, destPath);
    job.saved_path = result.path;
  } catch (e: unknown) {
    job.error_msg = e instanceof Error ? e.message : String(e);
  } finally {
    job.saving = false;
  }
}

function revealJobPath(p: string) {
  window.desktop.opener.revealItemInDir(p);
}

// Persist Topaz settings whenever they change (prompt is image-specific — not saved).
watch(
  [topazUIModel, topazStdCreativity, topazRlmCreativity, topazW3Enhancement, topazScale, topazOutputs, topazPreserveFaces, topazFormat],
  () => {
    localStorage.setItem(LS_LIB_TOPAZ, JSON.stringify({
      topazUIModel:       topazUIModel.value,
      topazStdCreativity: topazStdCreativity.value,
      topazRlmCreativity: topazRlmCreativity.value,
      topazW3Enhancement: topazW3Enhancement.value,
      topazScale:         topazScale.value,
      topazOutputs:       topazOutputs.value,
      topazPreserveFaces: topazPreserveFaces.value,
      topazFormat:        topazFormat.value,
    }));
  },
);

const TOPAZ_API_MODEL = computed(() => ({
  standard: "Standard V2", realism: "Bloom Realism", wonder3: "Wonder 3",
}[topazUIModel.value] as string));

function openTopazForImage(localPath: string) {
  topazImagePath.value = localPath;
  // Only clear transient state — persisted settings are restored from localStorage.
  topazPrompt.value           = "";
  topazSubmitError.value      = "";
  topazGeneratingPrompt.value = false;
  topazTrackedJobs.value      = [];
  showTopazModal.value        = true;
}

function closeTopazModal() {
  showTopazModal.value   = false;
  topazImagePath.value   = null;
  topazTrackedJobs.value = [];
}

async function generateTopazPrompt() {
  if (!topazImagePath.value) return;
  topazGeneratingPrompt.value = true;
  try {
    const result = await window.desktop.ai.generatePost(
      [topazImagePath.value],
      "civitai",
      undefined,
      "engagement",
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      "Describe this image in 1–2 neutral sentences. Focus on: subject, style, colors, composition. No hashtags, no social media language — just a concise image description suitable for an AI enhancement tool.",
    );
    topazPrompt.value = result.description;
  } catch { /* silently ignore */ }
  finally { topazGeneratingPrompt.value = false; }
}

async function submitTopazUpscale() {
  if (!topazImagePath.value) return;
  topazSubmitError.value = "";
  topazTrackedJobs.value = [];
  const numOutputs = topazUIModel.value === "wonder3" ? 1 : topazOutputs.value;
  try {
    for (let i = 0; i < numOutputs; i++) {
      const result = await window.desktop.topaz.submitJob({
        imagePath:     topazImagePath.value,
        model:         TOPAZ_API_MODEL.value,
        outputFormat:  topazFormat.value,
        scale:         topazScale.value,
        creativity:    topazUIModel.value === "standard" ? topazStdCreativity.value
                       : topazUIModel.value === "realism" ? topazRlmCreativity.value
                       : undefined,
        enhancement:   topazUIModel.value === "wonder3" ? topazW3Enhancement.value : undefined,
        preserveFaces: topazUIModel.value !== "wonder3" ? topazPreserveFaces.value : false,
        prompt:        topazUIModel.value !== "wonder3" ? topazPrompt.value : undefined,
      });
      topazTrackedJobs.value.push({ localId: result.localId, status: "processing", result_path: null, error_msg: null });
    }
    // Modal stays open — live status is shown inside it.
  } catch (e: unknown) {
    topazSubmitError.value = e instanceof Error ? e.message : String(e);
  }
}

const showCollection = ref(false);

// Network stat badge styling per platform type.
const TARGET_BADGE_STYLE: Record<PostingTargetType | "default", { bg: string; text: string; label: string }> = {
  x:          { bg: "bg-slate-700",      text: "text-slate-200",  label: "𝕏"    },
  bluesky:    { bg: "bg-sky-900/70",     text: "text-sky-300",    label: "Bsky"  },
  deviantart: { bg: "bg-green-900/70",   text: "text-green-300",  label: "DA"    },
  civitai:    { bg: "bg-teal-900/70",    text: "text-teal-300",   label: "Civ"   },
  instagram:  { bg: "bg-pink-900/70",    text: "text-pink-300",   label: "IG"    },
  facebook:   { bg: "bg-blue-900/70",    text: "text-blue-300",   label: "FB"    },
  tumblr:     { bg: "bg-indigo-900/70",  text: "text-indigo-300", label: "Tmblr" },
  socialdiff: { bg: "bg-violet-900/70",  text: "text-violet-300", label: "SD"    },
  custom:     { bg: "bg-slate-700/60",   text: "text-slate-300",  label: "?"     },
  default:    { bg: "bg-slate-700/60",   text: "text-slate-300",  label: "?"     },
};

function targetBadge(targetId: string) {
  const t = targetStore.targets.find((t) => t.id === targetId);
  return TARGET_BADGE_STYLE[t?.type ?? "default"] ?? TARGET_BADGE_STYLE.default;
}


const imageStore = useImageStore();
const sourceStore = useSourceStore();
const targetStore = useTargetStore();
const previewImage = ref<ImageWithPostState | null>(null);

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

const folderHistory = useFolderHistoryStore();

// ── Library state persistence ─────────────────────────────────────────────
const LS_LIB = "crosspost_lib_state";
function _loadLibState() {
  try { return JSON.parse(localStorage.getItem(LS_LIB) ?? "null") ?? {}; }
  catch { return {}; }
}
const _saved = _loadLibState();
function saveLibState() {
  localStorage.setItem(LS_LIB, JSON.stringify({
    sortMode:           sortMode.value,
    sortAsc:            sortAsc.value,
    currentDir:         currentDir.value,
    hidePostedTargetId: imageStore.filters.hidePostedForTargetId ?? "",
    collectionIds:      [...collectionImages.keys()],
  }));
}

// ── Sort controls ──────────────────────────────────────────────────────────
type SortMode = "date" | "alpha" | "pick";
const sortMode = ref<SortMode>(_saved.sortMode ?? "date");
const sortAsc  = ref<boolean>(_saved.sortAsc ?? false);

function applySort() {
  const dir = sortAsc.value ? "asc" : "desc";
  imageStore.filters.sortBy = `${sortMode.value}_${dir}` as typeof imageStore.filters.sortBy;
  imageStore.filters.folderPickOrder =
    sortMode.value === "pick" ? folderHistory.getOrderedPaths(dir) : undefined;
}
// Re-apply whenever sort mode, direction, or the history itself changes.
watch([sortMode, sortAsc], applySort, { immediate: true });
watch(() => folderHistory.history, () => {
  if (sortMode.value === "pick") applySort();
}, { deep: true });

// Reload images whenever a filter or showExcludedFolders changes.
onMounted(() => {
  window.desktop.topaz.onJobUpdated((data) => {
    const job = topazTrackedJobs.value.find((j) => j.localId === data.id);
    if (!job) return;
    if (data.status)                    job.status      = data.status as TopazTrackedJob["status"];
    if (data.result_path !== undefined)  job.result_path = data.result_path ?? null;
    if (data.error_msg !== undefined)    job.error_msg   = data.error_msg ?? null;
  });

  // Restore hide-posted filter before the first load — always use current active target.
  if (_saved.hidePostedTargetId && targetStore.activeTargetId) {
    imageStore.filters.hidePostedForTargetId = targetStore.activeTargetId;
  }
  // Pre-seed selected IDs so imageStore.load() retains them (it filters to valid IDs only)
  if (_saved.collectionIds?.length) {
    for (const id of _saved.collectionIds as string[]) {
      imageStore.selectedImageIds.add(id);
    }
  }
  imageStore.load();

  // Clear collection+selection when the extension popup clicks "Mark as Posted"
  // (which triggers POST /clear-queue → bridge:queue-cleared IPC event).
  window.desktop.bridge.onQueueCleared(() => clearCollection());

  // Reload images when the extension marks them as posted so post-state badges
  // update immediately without a manual Refresh.
  window.desktop.bridge.onImagesPosted(() => imageStore.load());

  // Reload library when a file is auto-indexed after a download (Wavespeed, Topaz).
  window.desktop.library.onFileIndexed(() => imageStore.load());
});

onUnmounted(() => {
  window.desktop.bridge.offQueueCleared();
  window.desktop.bridge.offImagesPosted();
  window.desktop.topaz.offJobUpdated();
  window.desktop.library.offFileIndexed();
  if (_msgTimer) clearTimeout(_msgTimer);
  if (_errTimer) clearTimeout(_errTimer);
});
watch(() => imageStore.filters, () => imageStore.load(), { deep: true });
watch(() => imageStore.showExcludedFolders, () => imageStore.load());

// Auto-dismiss banners after 5 s so they don't linger forever.
let _msgTimer: ReturnType<typeof setTimeout> | null = null;
let _errTimer: ReturnType<typeof setTimeout> | null = null;
watch(() => imageStore.message, (msg) => {
  if (_msgTimer) clearTimeout(_msgTimer);
  if (msg) _msgTimer = setTimeout(() => { imageStore.message = ""; }, 5000);
});
watch(() => imageStore.error, (err) => {
  if (_errTimer) clearTimeout(_errTimer);
  if (err) _errTimer = setTimeout(() => { imageStore.error = ""; }, 5000);
});

// ── Network hide-posted toggle ─────────────────────────────────────────────
// Persist state on every relevant change
watch([sortMode, sortAsc], saveLibState);
watch(() => imageStore.filters.hidePostedForTargetId, saveLibState);

function toggleHidePosted() {
  if (imageStore.filters.hidePostedForTargetId) {
    // Already active → turn off
    imageStore.filters.hidePostedForTargetId = undefined;
  } else if (targetStore.activeTargetId) {
    // Turn on for the currently active platform
    imageStore.filters.hidePostedForTargetId = targetStore.activeTargetId;
  }
}

// When the active platform changes while hiding is on → follow the new platform.
watch(() => targetStore.activeTargetId, (newId) => {
  if (imageStore.filters.hidePostedForTargetId && newId) {
    imageStore.filters.hidePostedForTargetId = newId;
  }
});

// Active network for toolbar actions (mark / queue / AI) — shared with picker store.
const libActiveTarget = computed(() => targetStore.enabledTargets.find((t) => t.id === targetStore.activeTargetId) ?? null);
const libActiveTargetName = computed(() => libActiveTarget.value?.name ?? "");
const libActiveTargetType = computed(() => libActiveTarget.value?.type ?? "");

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

function onAiQueued(count: number) {
  imageStore.message = `Queued ${count} image(s) for ${libActiveTargetName.value}.`;
}

async function onAiMark() {
  if (collectionArray.value.length) {
    await markCollection();
  } else {
    await markSelected();
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
// Save currentDir whenever it changes
watch(currentDir, saveLibState);

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
  const entries = [...children.entries()]
    .map(([path, { count, isExcluded, postStats }]) => {
      // Collect thumbnails from matching sub-folders (custom previews already merged in store).
      const thumbnails: string[] = [];
      for (const [fp, urls] of imageStore.folderThumbnails) {
        if (fp === path || fp.startsWith(path + "/")) {
          for (const u of urls) {
            if (!thumbnails.includes(u)) thumbnails.push(u);
            if (thumbnails.length >= 3) break;
          }
          if (thumbnails.length >= 3) break;
        }
      }
      return {
        path,
        name: path.split("/").pop()!,
        count,
        isExcluded,
        postStats,
        thumbnails,
        isLastVisited: lastVisitedDir.value !== "" && lastVisitedDir.value.startsWith(path),
      };
    });

  // Sort folder cards according to the active sort mode.
  const hist = folderHistory.history;
  entries.sort((a, b) => {
    if (sortMode.value === "alpha") {
      const cmp = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
      return sortAsc.value ? cmp : -cmp;
    }
    if (sortMode.value === "pick") {
      const aTime = hist[a.path] ?? 0;
      const bTime = hist[b.path] ?? 0;
      // Unvisited folders always go to the bottom.
      if (!aTime && !bTime) return a.name.localeCompare(b.name);
      if (!aTime) return 1;
      if (!bTime) return -1;
      return sortAsc.value ? aTime - bTime : bTime - aTime;
    }
    // "date" mode: sort folders alphabetically (we don't have per-folder dates cheaply).
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
  });
  return entries;
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

/**
 * Sibling folders of the current browsePath — all direct children of the parent
 * directory, sorted alphabetically. Used for the prev/next folder buttons.
 * Empty when we're at the root level (no parent to enumerate).
 */
const siblingFolders = computed<string[]>(() => {
  const current = browsePath.value;
  const root    = rootDir.value;
  if (!current || current === root) return [];

  // Parent is everything up to the last slash segment.
  const parent = current.slice(0, current.lastIndexOf("/"));
  if (!parent) return [];

  const seen = new Set<string>();
  for (const f of imageStore.folders) {
    if (!f.folderPath.startsWith(parent + "/")) continue;
    if (f.isExcluded && !imageStore.showExcludedFolders) continue;
    const remainder = f.folderPath.slice(parent.length + 1);
    const segment   = remainder.split("/")[0];
    seen.add(parent + "/" + segment);
  }
  return [...seen].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
});

const prevFolder = computed<string | null>(() => {
  const idx = siblingFolders.value.indexOf(browsePath.value);
  return idx > 0 ? siblingFolders.value[idx - 1] : null;
});

const nextFolder = computed<string | null>(() => {
  const idx = siblingFolders.value.indexOf(browsePath.value);
  return idx !== -1 && idx < siblingFolders.value.length - 1 ? siblingFolders.value[idx + 1] : null;
});

/** Flat sorted list of all folders for the quick-jump dropdown. */
const sortedFolders = computed(() =>
  imageStore.folders
    .filter((f) => !f.isExcluded || imageStore.showExcludedFolders)
    .map((f) => ({
      path:  f.folderPath,
      label: f.folderPath.slice(rootDir.value.length + 1) || f.folderPath.split("/").pop() || f.folderPath,
    }))
    .sort((a, b) => a.label.localeCompare(b.label))
);

function navigateTo(path: string) {
  const prev = currentDir.value || rootDir.value;
  // Record every folder navigation in the pick history.
  if (path) folderHistory.recordVisit(path);
  // Going back (new path is a parent of where we were) → remember the folder we just left.
  if (prev.startsWith(path + "/")) {
    lastVisitedDir.value = prev;
  } else {
    // Going deeper → clear the highlight so it doesn't linger.
    lastVisitedDir.value = "";
  }
  currentDir.value = path;
  // Load folder preview IDs for the new folder so pin buttons reflect current state.
  if (path) imageStore.loadFolderPreviewIds(path);
}

async function onToggleFolderPreview(imageId: string) {
  if (!browsePath.value) return;
  await imageStore.toggleFolderPreview(browsePath.value, imageId);
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
// On every (re-)mount, restore the saved directory if it still exists.
// immediate:true ensures this fires on remount even when folders are already cached
// (folders.length doesn't change → plain watch would never trigger again).
let _firstFolderLoad = true;
watch(
  () => imageStore.folders.length,
  () => {
    if (_firstFolderLoad && imageStore.folders.length > 0) {
      _firstFolderLoad = false;
      const savedDir: string = _saved.currentDir ?? "";
      if (savedDir) {
        const exists = imageStore.folders.some(
          (f) => f.folderPath === savedDir || f.folderPath.startsWith(savedDir + "/"),
        );
        if (exists) {
          currentDir.value = savedDir;
          return;
        }
      }
      currentDir.value = "";
      lastVisitedDir.value = "";
    }
  },
  { immediate: true },
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
  if (!targetStore.activeTargetId) return;
  await imageStore.markSelectedPosted([targetStore.activeTargetId]);
}

async function queueActiveForExtension() {
  if (libActiveTargetType.value) await queueForExtension(libActiveTargetType.value);
}

function lightboxNavigate(image: ImageWithPostState) {
  previewImage.value = image;
}

// ── Cross-folder Collection ─────────────────────────────────────────────────
/** Persists across folder navigation. Key = image.id. */
const collectionImages = reactive(new Map<string, ImageWithPostState>());
const collectionArray = computed(() => [...collectionImages.values()]);
const collectionCount = computed(() => collectionImages.size);

// Restore collection (and sync selection) once images are available.
// immediate:true ensures this fires on remount when images are already cached
// (imageStore.images reference doesn't change → plain watch would never trigger).
let _collectionRestored = false;
watch(
  () => imageStore.images,
  (imgs) => {
    if (_collectionRestored || !imgs.length || !(_saved.collectionIds as string[] | undefined)?.length) return;
    _collectionRestored = true;
    const savedIds = new Set<string>(_saved.collectionIds as string[]);
    for (const img of imgs) {
      if (savedIds.has(img.id)) {
        collectionImages.set(img.id, img);
        if (!imageStore.selectedImageIds.has(img.id)) {
          imageStore.selectedImageIds.add(img.id);
        }
      }
    }
  },
  { immediate: true },
);

// Persist collection changes
watch(() => collectionImages.size, (size) => {
  saveLibState();
  // When the collection becomes empty, close the sidebar so it never auto-reopens
  // the next time the user clicks an image (showCollection stays false until the user
  // explicitly opens the tray again via the Collection button).
  if (size === 0) showCollection.value = false;
});

/** Toggle a single image in/out of the collection and keep store selection in sync. */
function toggleCollection(imageId: string) {
  imageStore.toggleSelected(imageId);
  const img = imageStore.images.find((i) => i.id === imageId);
  if (!img) return;
  if (collectionImages.has(imageId)) collectionImages.delete(imageId);
  else collectionImages.set(imageId, img);
}

/** Add all currently-visible images to the collection (also selects them). */
function addVisibleToCollection() {
  imageStore.selectVisible();
  for (const img of imageStore.images) collectionImages.set(img.id, img);
}

/** Remove a single image from the collection (also deselects if visible). */
function removeFromCollection(imageId: string) {
  collectionImages.delete(imageId);
  if (imageStore.selectedImageIds.has(imageId)) imageStore.toggleSelected(imageId);
}

/** Clear the entire collection + selection. */
function clearCollection() {
  collectionImages.clear();
  imageStore.clearSelection();
}

/** Mark every collected image as posted on the active network. */
async function markCollection() {
  if (!targetStore.activeTargetId) return;
  for (const img of collectionArray.value) {
    await imageStore.markPosted(img.id, targetStore.activeTargetId);
  }
  imageStore.message = `Marked ${collectionCount.value} image(s) as posted on ${libActiveTargetName.value}.`;
  clearCollection();
}

/** Push all collection images (up to the platform limit) to the bridge queue. */
async function sendCollectionToPlugin() {
  if (!libActiveTargetType.value || !collectionCount.value) return;
  const limit = PLATFORM_LIMITS[libActiveTargetType.value] ?? 1;
  const ids = collectionArray.value.map((i) => i.id).slice(0, limit);
  try {
    await window.desktop.bridge.setQueue(libActiveTargetType.value, ids);
    imageStore.message = `✓ ${ids.length} image(s) queued for ${libActiveTargetName.value} — click Inject in the extension`;
  } catch (err) {
    imageStore.error = err instanceof Error ? err.message : String(err);
  }
}

// ── Fill Queue Slots from collection ────────────────────────────────────────
const queueStore = useQueueStore();
const showQueueFill = ref(false);
const queueFillId = ref("");
const queueFillSlots = ref<QueueSlot[]>([]);
const queueFillImages = ref<Record<string, import("@/types/queue").SlotImageData[]>>({});

watch(queueFillId, async (id) => {
  queueFillSlots.value = id ? await listSlots(id) : [];
  queueFillImages.value = {};
  for (const slot of queueFillSlots.value) {
    queueFillImages.value[slot.id] = slot.imageIds.length
      ? await getSlotImageData(slot.imageIds)
      : [];
  }
});

async function openQueueFill() {
  if (!queueStore.queues.length) await queueStore.load();
  queueFillId.value = queueStore.queues[0]?.id ?? "";
  showQueueFill.value = true;
}

// ── Image Upload ─────────────────────────────────────────────────────────────
/** Hidden file input ref — triggered programmatically by the Upload button. */
const uploadInputRef = ref<HTMLInputElement | null>(null);
/** Whether the drag-over overlay is visible. */
const isDragging = ref(false);
/** State for the rename modal: the pending file awaiting confirmation. */
const uploadPending = ref<{ blob: Blob; name: string; ext: string; previewUrl: string } | null>(null);
/** Editable filename stem (without extension) inside the modal. */
const uploadFilename = ref("");

function triggerUploadInput() {
  uploadInputRef.value?.click();
}

/** Open the rename modal for a given File/Blob. */
function openUploadModal(blob: Blob, suggestedName: string) {
  const lastDot = suggestedName.lastIndexOf(".");
  const stem = lastDot > 0 ? suggestedName.slice(0, lastDot) : suggestedName;
  const ext  = lastDot > 0 ? suggestedName.slice(lastDot) : ".jpg";
  const previewUrl = URL.createObjectURL(blob);
  uploadPending.value = { blob, name: suggestedName, ext, previewUrl };
  uploadFilename.value = stem;
}

function cancelUpload() {
  if (uploadPending.value) URL.revokeObjectURL(uploadPending.value.previewUrl);
  uploadPending.value = null;
  uploadFilename.value = "";
}

async function confirmUpload() {
  if (!uploadPending.value) return;
  const { blob, ext, previewUrl } = uploadPending.value;
  const finalName = (uploadFilename.value.trim() || "image") + ext;
  const targetFolder = browsePath.value;
  if (!targetFolder) { imageStore.error = "Navigate into a folder before uploading."; cancelUpload(); return; }

  try {
    const arrayBuf = await blob.arrayBuffer();
    const bytes = new Uint8Array(arrayBuf);
    await window.desktop.upload.saveAndIndex(targetFolder, finalName, bytes);
    imageStore.message = `✓ "${finalName}" added to library.`;
    await imageStore.load();
  } catch (err) {
    imageStore.error = err instanceof Error ? err.message : String(err);
  } finally {
    URL.revokeObjectURL(previewUrl);
    uploadPending.value = null;
    uploadFilename.value = "";
  }
}

function handleFileInputChange(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  openUploadModal(file, file.name);
  // Reset so the same file can be selected again later.
  (event.target as HTMLInputElement).value = "";
}

// ── Drag & Drop ───────────────────────────────────────────────────────────────
function onDragOver(event: DragEvent) {
  if (!event.dataTransfer?.types.includes("Files")) return;
  event.preventDefault();
  isDragging.value = true;
}
function onDragLeave() { isDragging.value = false; }
function onDrop(event: DragEvent) {
  event.preventDefault();
  isDragging.value = false;
  const file = event.dataTransfer?.files[0];
  if (!file || !file.type.startsWith("image/")) { imageStore.error = "Only image files can be uploaded."; return; }
  openUploadModal(file, file.name);
}

// ── Clipboard paste ───────────────────────────────────────────────────────────
function onPaste(event: ClipboardEvent) {
  // Only intercept when we're viewing a folder (not on the root overview).
  if (!isLeafDir.value && !hasDirImages.value) return;
  const item = [...(event.clipboardData?.items ?? [])].find((i) => i.type.startsWith("image/"));
  if (!item) return;
  const blob = item.getAsFile();
  if (!blob) return;
  const ext = item.type === "image/png" ? ".png" : item.type === "image/webp" ? ".webp" : ".jpg";
  openUploadModal(blob, `pasted-image${ext}`);
}

onMounted(() => {
  window.addEventListener("paste", onPaste as EventListener);
});
onUnmounted(() => {
  window.removeEventListener("paste", onPaste as EventListener);
});

async function fillSlot(slotId: string) {
  if (!collectionArray.value.length) return;
  const ids = collectionArray.value.map((i) => i.id);

  // setSlotImages already calls setSlotImagesExclusive — deduplication is handled there.
  // It returns the changed-slots map via the store, so we sync the fill-panel's local state too.
  await queueStore.setSlotImages(slotId, ids);

  // Reflect all changes (target + any slots that lost images) in the fill panel immediately.
  const imageIdSet = new Set(ids);
  for (const slot of queueFillSlots.value) {
    if (slot.id === slotId) {
      queueFillImages.value[slotId] = await getSlotImageData(ids);
      queueFillSlots.value[queueFillSlots.value.indexOf(slot)] = { ...slot, imageIds: ids };
    } else {
      // Remove the assigned IDs from every other slot's local state
      const remaining = slot.imageIds.filter((id) => !imageIdSet.has(id));
      if (remaining.length !== slot.imageIds.length) {
        queueFillImages.value[slot.id] = remaining.length ? await getSlotImageData(remaining) : [];
        queueFillSlots.value[queueFillSlots.value.indexOf(slot)] = { ...slot, imageIds: remaining };
      }
    }
  }

  const idx = queueFillSlots.value.findIndex((s) => s.id === slotId);
  const slotPos = (queueFillSlots.value[idx]?.position ?? 0) + 1;
  imageStore.message = `✓ ${ids.length} image(s) → Slot ${slotPos}`;
}
</script>

<template>
  <div class="relative flex h-full flex-col overflow-hidden">

    <!-- Hidden file input for upload button -->
    <input
      ref="uploadInputRef"
      type="file"
      accept="image/*"
      class="hidden"
      @change="handleFileInputChange"
    />

  <!-- ── Header ──────────────────────────────────────────────────── -->
    <header class="flex shrink-0 items-center justify-between px-5 py-4">
      <h1 class="text-2xl font-semibold text-white">Image Library</h1>
      <div class="flex items-center gap-2">
        <!-- Collection toggle -->
        <button
          v-if="collectionCount > 0"
          class="button relative gap-1.5"
          :class="showCollection ? 'border-accent bg-accent/10 text-accent' : ''"
          title="Toggle collection tray"
          @click="showCollection = !showCollection"
        >
          <Archive class="h-4 w-4" />
          Collection
          <span class="flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-ink">{{ collectionCount }}</span>
        </button>
        <!-- Sort controls: pill buttons + direction toggle -->
        <div class="flex items-center rounded-lg border border-line overflow-hidden">
          <button
            v-for="sm in ([{v:'date',l:'📅 Date'},{v:'alpha',l:'🔤 Name'},{v:'pick',l:'🕐 Pick'}] as const)"
            :key="sm.v"
            class="h-8 px-2.5 text-xs font-medium transition border-r border-line last:border-r-0"
            :class="sortMode === sm.v ? 'bg-accent/15 text-accent' : 'bg-panel text-slate-400 hover:bg-panelSoft hover:text-white'"
            :title="`Sort by ${sm.l}`"
            @click="sortMode = sm.v"
          >{{ sm.l }}</button>
          <button
            class="h-8 border-l border-line bg-panel px-2 text-sm font-bold text-slate-400 transition hover:bg-panelSoft hover:text-white"
            :title="sortAsc ? 'Ascending — click for descending' : 'Descending — click for ascending'"
            @click="sortAsc = !sortAsc"
          >{{ sortAsc ? '↑' : '↓' }}</button>
        </div>

        <!-- Hide posted for active platform toggle (no separate dropdown — follows active target) -->
        <button
          class="button h-8 gap-1.5 px-2.5 text-xs"
          :class="imageStore.filters.hidePostedForTargetId ? 'border-rose/50 bg-rose/10 text-rose' : ''"
          :title="imageStore.filters.hidePostedForTargetId ? `Showing: hide posted on ${libActiveTargetName} — click to show all` : `Hide images already posted on ${libActiveTargetName || 'active platform'}`"
          :disabled="!targetStore.activeTargetId"
          @click="toggleHidePosted"
        >
          <EyeOff v-if="imageStore.filters.hidePostedForTargetId" class="h-3.5 w-3.5" />
          <Eye v-else class="h-3.5 w-3.5" />
          {{ imageStore.filters.hidePostedForTargetId ? 'Hiding posted' : 'Hide posted' }}
        </button>

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

    <!-- ── Breadcrumb + folder jump dropdown ─────────────────────────── -->
    <div v-if="breadcrumbs.length" class="flex shrink-0 items-center gap-2 px-5 pt-3">
      <!-- Quick-jump folder dropdown -->
      <div v-if="sortedFolders.length" class="relative shrink-0">
        <select
          :value="browsePath"
          class="h-6 max-w-[11rem] appearance-none rounded-md border border-line bg-panelSoft pl-2 pr-6 text-xs text-slate-300 focus:border-accent/60 focus:outline-none cursor-pointer hover:border-slate-500 transition"
          title="Jump to folder"
          @change="navigateTo(($event.target as HTMLSelectElement).value)"
        >
          <option v-for="f in sortedFolders" :key="f.path" :value="f.path">{{ f.label }}</option>
        </select>
        <ChevronDown class="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-500" />
      </div>
      <!-- Breadcrumb trail -->
      <nav class="flex min-w-0 items-center gap-1 text-sm overflow-hidden">
        <template v-for="(crumb, i) in breadcrumbs" :key="crumb.path">
          <button
            class="max-w-36 truncate transition shrink-0"
            :class="i === breadcrumbs.length - 1 ? 'font-medium text-white' : 'text-slate-400 hover:text-white'"
            :title="crumb.path"
            @click="navigateTo(crumb.path)"
          >
            {{ crumb.name }}
          </button>
          <ChevronRight v-if="i < breadcrumbs.length - 1" class="h-3.5 w-3.5 shrink-0 text-slate-600" />
        </template>
      </nav>

      <!-- Prev / Next sibling folder buttons -->
      <div v-if="siblingFolders.length > 1" class="ml-auto flex shrink-0 items-center gap-1">
        <button
          class="button h-6 w-6 p-0"
          :disabled="!prevFolder"
          :title="prevFolder ? '← ' + prevFolder.split('/').pop() : 'No previous folder'"
          @click="prevFolder && navigateTo(prevFolder)"
        >
          <ChevronLeft class="h-3.5 w-3.5" />
        </button>
        <span class="text-[11px] text-slate-500 tabular-nums">
          {{ siblingFolders.indexOf(browsePath) + 1 }} / {{ siblingFolders.length }}
        </span>
        <button
          class="button h-6 w-6 p-0"
          :disabled="!nextFolder"
          :title="nextFolder ? '→ ' + nextFolder.split('/').pop() : 'No next folder'"
          @click="nextFolder && navigateTo(nextFolder)"
        >
          <ChevronRight class="h-3.5 w-3.5" />
        </button>
      </div>
    </div>

    <!-- ── Sticky action toolbar (only when viewing images) ──────── -->
    <section
      v-if="isLeafDir || hasDirImages"
      class="shrink-0 border-b border-line bg-panel px-4 py-2"
    >
      <!-- Row 1: network selector + selection actions -->
      <div class="flex flex-wrap items-center gap-1.5">
        <div class="relative">
          <select v-model="targetStore.activeTargetId" class="h-7 appearance-none rounded-lg border border-line bg-panelSoft pl-2.5 pr-7 text-xs text-slate-200 transition focus:border-accent/60 focus:outline-none cursor-pointer hover:border-slate-500" title="Active network for all actions">
            <option v-for="t in targetStore.enabledTargets" :key="t.id" :value="t.id">{{ t.name }}</option>
          </select>
          <ChevronDown class="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-500" />
        </div>
        <span class="mx-1 text-xs text-slate-500">|</span>
        <span class="mr-1 text-xs font-medium text-white">{{ selectedCount }} / {{ imageStore.images.length }} selected</span>
        <button class="button h-7 gap-1 px-2 text-xs" title="Select all visible images" @click="addVisibleToCollection">
          Select all
        </button>
        <button class="button h-7 px-2 text-xs" :disabled="selectedCount === 0" title="Deselect all" @click="clearCollection">
          <X class="h-3 w-3" />Deselect
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
          <button class="button h-7 px-2 text-xs hover:border-rose/60 hover:text-rose" :disabled="selectedCount === 0" @click="requestDeleteSelected">
            <Trash2 class="h-3 w-3" />Delete
          </button>
        </template>
        <template v-else>
          <span class="text-xs text-rose">Remove {{ selectedCount }} image(s)?</span>
          <button class="button h-7 border-rose/60 bg-rose/10 px-2 text-xs text-rose hover:bg-rose/20" @click="confirmDeleteSelected">Confirm</button>
          <button class="button h-7 px-2 text-xs" @click="cancelDeleteSelected">Cancel</button>
        </template>
      </div>

      <!-- Row 2: mark + queue + AI for active network -->
      <div class="mt-1.5 flex flex-wrap items-center gap-1.5 border-t border-line pt-1.5">
        <button
          class="button-primary h-7 shrink-0 px-3 text-xs"
          :disabled="selectedCount === 0 || !targetStore.activeTargetId"
          :title="`Mark selected as posted on ${libActiveTargetName}`"
          @click="markSelected"
        ><Check class="h-3 w-3" />Mark {{ libActiveTargetName }}</button>

        <button
          class="button h-7 shrink-0 gap-1.5 px-3 text-xs"
          :disabled="selectedCount === 0 || !libActiveTargetType || !EXTENSION_TYPES.has(libActiveTargetType as any)"
          :title="EXTENSION_TYPES.has(libActiveTargetType as any) ? `Queue for ${libActiveTargetName} (max ${PLATFORM_LIMITS[libActiveTargetType] ?? 1})` : `${libActiveTargetName} has no extension adapter`"
          @click="queueActiveForExtension"
        >
          <PlatformIcon v-if="libActiveTargetType" :type="libActiveTargetType" :size="13" />
          Queue
        </button>

        <button
          class="button h-7 gap-1.5 px-2 text-xs"
          :class="showAiPanel ? 'border-accent bg-accent/10 text-accent' : ''"
          :disabled="selectedCount === 0 || !targetStore.activeTargetId"
          title="Generate AI post text for selected images"
          @click="showAiPanel = true"
        >
          <Sparkles class="h-3.5 w-3.5" />AI Post
        </button>

        <button
          class="button h-7 gap-1.5 px-2 text-xs"
          :class="showVideoPanel ? 'border-violet-400/60 bg-violet-400/10 text-violet-300' : ''"
          :disabled="selectedCount === 0"
          title="Generate a video prompt from the selected image"
          @click="showVideoPanel = true"
        >
          <Clapperboard class="h-3.5 w-3.5" />Video Prompt
        </button>

        <!-- Upload button — always available when inside a folder -->
        <button
          class="button h-7 gap-1.5 px-2 text-xs ml-auto"
          title="Upload image into this folder (or Drag & Drop / paste from clipboard)"
          @click="triggerUploadInput"
        >
          <Upload class="h-3.5 w-3.5" />Upload
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
    <!-- Drag & Drop zone: wraps the whole scrollable area so any image can be dropped anywhere -->
    <div
      class="relative flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5 pt-3"
      @dragover="onDragOver"
      @dragleave="onDragLeave"
      @drop="onDrop"
    >
      <!-- Drag overlay -->
      <Transition
        enter-active-class="transition-opacity duration-100"
        enter-from-class="opacity-0"
        enter-to-class="opacity-100"
        leave-active-class="transition-opacity duration-100"
        leave-from-class="opacity-100"
        leave-to-class="opacity-0"
      >
        <div
          v-if="isDragging"
          class="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-accent bg-accent/10 backdrop-blur-sm"
        >
          <Upload class="h-12 w-12 text-accent" />
          <p class="text-base font-semibold text-accent">Drop image here</p>
          <p class="text-xs text-accent/70">Will be added to: {{ browsePath.split('/').pop() }}</p>
        </div>
      </Transition>

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
          class="group relative flex flex-col overflow-hidden rounded-xl border transition"
          :class="folder.isExcluded
            ? 'border-amber-500/30 bg-amber-500/5 opacity-60 hover:opacity-90'
            : folder.isLastVisited
              ? 'border-accent/60 bg-accent/10 hover:border-accent hover:bg-accent/15'
              : 'border-line bg-panel hover:border-accent hover:bg-panelSoft'"
        >
          <!-- Excluded badge -->
          <span
            v-if="folder.isExcluded"
            class="absolute right-2 top-2 z-10 flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-xs text-amber-400"
          >
            <FolderX class="h-3 w-3" />Done
          </span>

          <button class="flex w-full flex-col text-left" :title="folder.path" @click="navigateTo(folder.path)">
            <!-- Thumbnail / mosaic area -->
            <div class="relative aspect-[4/3] w-full overflow-hidden bg-panelSoft">
              <!-- 1 preview -->
              <img
                v-if="folder.thumbnails.length === 1"
                :src="folder.thumbnails[0]"
                class="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                loading="lazy"
              />
              <!-- 2 previews: side by side -->
              <div v-else-if="folder.thumbnails.length === 2" class="flex h-full gap-px">
                <img :src="folder.thumbnails[0]" alt="" class="h-full w-1/2 object-cover" loading="lazy" />
                <img :src="folder.thumbnails[1]" alt="" class="h-full w-1/2 object-cover" loading="lazy" />
              </div>
              <!-- 3 previews: left full-height + right split -->
              <div v-else-if="folder.thumbnails.length >= 3" class="flex h-full gap-px">
                <img :src="folder.thumbnails[0]" alt="" class="h-full w-1/2 object-cover" loading="lazy" />
                <div class="flex h-full w-1/2 flex-col gap-px">
                  <img :src="folder.thumbnails[1]" alt="" class="h-1/2 w-full object-cover" loading="lazy" />
                  <img :src="folder.thumbnails[2]" alt="" class="h-1/2 w-full object-cover" loading="lazy" />
                </div>
              </div>
              <!-- No thumbnail fallback -->
              <div v-else class="flex h-full items-center justify-center">
                <Folder
                  class="h-12 w-12 transition"
                  :class="folder.isExcluded ? 'text-amber-500/50' : 'text-slate-500 group-hover:text-accent'"
                />
              </div>
            </div>
            <!-- Text info -->
            <div class="w-full px-3 py-2">
              <p class="truncate text-sm font-medium" :class="folder.isExcluded ? 'text-slate-400' : 'text-white'">{{ folder.name }}</p>
              <p class="mt-0.5 text-xs text-slate-500">{{ folder.count }} images</p>
              <!-- Network post stats chips -->
              <div v-if="folder.postStats.size > 0" class="mt-1.5 flex flex-wrap gap-1">
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
          <div class="flex shrink-0 items-center gap-1 border-t border-line px-2 py-1.5">
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
          :folder-preview-ids="imageStore.folderPreviewImageIds"
          @toggle-selected="toggleCollection"
          @preview="previewImage = $event"
          @archive="imageStore.archive"
          @reveal="(image: ImageWithPostState) => runAction(() => revealImage(image), 'Opened in Finder.')"
          @copy-path="(image: ImageWithPostState) => runAction(() => copyImagePath(image), 'Path copied.')"
          @copy-image="(image: ImageWithPostState) => runAction(() => copyImageToClipboard(image), 'Image copied.')"
          @mark-posted="imageStore.markPosted"
          @mark-skipped="imageStore.markSkipped"
          @toggle-folder-preview="onToggleFolderPreview"
          @video-prompt="openVideoPromptForImage"
          @recreate-image="openImageRecreateForImage"
          @upscale-image="openTopazForImage"
        />
      </template>

      <!-- ── EMPTY STATE ─────────────────────────────────────────────── -->
      <div v-if="!childFolders.length && !isLeafDir && !hasDirImages" class="flex flex-1 flex-col items-center justify-center gap-3 text-center text-slate-500">
        <Folder class="h-16 w-16 opacity-30" />
        <p class="text-lg font-medium">No images scanned yet</p>
        <p class="text-sm">Go to <strong class="text-slate-400">Scan</strong> and add a source folder.</p>
      </div>

    </div><!-- end drag/drop + scrollable body -->

    <ImageLightbox
      :image="previewImage"
      :images="imageStore.images"
      :selected-image-ids="imageStore.selectedImageIds"
      @close="previewImage = null"
      @navigate="lightboxNavigate"
      @toggle-selected="toggleCollection"
      @delete="deleteSingleFromLightbox"
      @archive="imageStore.archive"
      @upscale-image="openTopazForImage"
    />

  <!-- ── Collection overlay tray (slides in over content) ─────────── -->
  <Transition
    enter-active-class="transition-transform duration-200 ease-out"
    enter-from-class="translate-x-full"
    enter-to-class="translate-x-0"
    leave-active-class="transition-transform duration-150 ease-in"
    leave-from-class="translate-x-0"
    leave-to-class="translate-x-full"
  >
    <aside
      v-if="collectionCount > 0 && showCollection"
      class="absolute bottom-0 right-0 top-0 z-20 flex w-72 flex-col overflow-hidden border-l border-line bg-panel shadow-2xl"
    >
      <!-- ── Header ─────────────────────────────────────────────────── -->
      <div class="flex shrink-0 items-center justify-between border-b border-line px-3 py-2">
        <span class="text-sm font-semibold text-white">
          Collection
          <span class="ml-1.5 rounded bg-accent/20 px-1.5 py-0.5 text-xs text-accent">{{ collectionCount }}</span>
        </span>
        <div class="flex items-center gap-1">
          <div class="relative">
            <select v-model="targetStore.activeTargetId" class="h-6 appearance-none rounded border border-line bg-panelSoft pl-2 pr-6 text-xs text-slate-200 focus:border-accent/60 focus:outline-none cursor-pointer" title="Active network">
              <option v-for="t in targetStore.enabledTargets" :key="t.id" :value="t.id">{{ t.name }}</option>
            </select>
            <ChevronDown class="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-500" />
          </div>
          <button class="button h-6 w-6 p-0" title="Close tray" @click="showCollection = false">
            <X class="h-3 w-3" />
          </button>
        </div>
      </div>

      <!-- ── Collected image list ───────────────────────────────────── -->
      <div class="flex-1 overflow-y-auto">
        <div
          v-for="img in collectionArray"
          :key="img.id"
          class="group flex items-center gap-2 border-b border-line px-2 py-1.5 hover:bg-panelSoft"
        >
          <img v-if="img.thumbnailUrl" :src="img.thumbnailUrl" :alt="img.filename" class="h-10 w-10 shrink-0 rounded object-cover" loading="lazy" />
          <div v-else class="h-10 w-10 shrink-0 rounded bg-panelSoft" />
          <div class="min-w-0 flex-1">
            <p class="truncate text-xs text-white">{{ img.filename }}</p>
            <p class="truncate text-[10px] text-slate-500">{{ img.folderPath.split('/').pop() }}</p>
          </div>
          <button
            class="h-6 w-6 shrink-0 rounded p-0 opacity-0 transition hover:bg-rose/20 hover:text-rose group-hover:opacity-100"
            title="Remove from collection"
            @click="removeFromCollection(img.id)"
          ><X class="h-3 w-3" /></button>
        </div>
      </div>

      <!-- ── Actions (bottom) ─────────────────────────────────────── -->
      <div class="flex shrink-0 flex-col gap-2 border-t border-line p-3">
        <button
          class="button h-7 w-full text-xs"
          :disabled="!targetStore.activeTargetId"
          @click="markCollection"
        ><Check class="h-3 w-3" />Mark as Posted</button>

        <!-- ── Fill Queue Slot panel ──────────────────────────────────── -->
        <div v-if="showQueueFill" class="rounded-lg border border-line bg-panelSoft overflow-hidden">
          <!-- Panel header: queue selector + close -->
          <div class="flex items-center gap-1.5 border-b border-line px-2 py-1.5">
            <span class="text-[10px] font-semibold uppercase tracking-wide text-slate-400 shrink-0">Queue</span>
            <select v-model="queueFillId" aria-label="Select queue" class="input h-6 flex-1 text-xs min-w-0">
              <option v-if="!queueStore.queues.length" value="" disabled>No queues</option>
              <option v-for="q in queueStore.queues" :key="q.id" :value="q.id">{{ q.name }}</option>
            </select>
            <button class="button h-6 w-6 shrink-0 p-0" @click="showQueueFill = false"><X class="h-3 w-3" /></button>
          </div>

          <!-- Slot cards -->
          <div class="flex flex-col divide-y divide-line/60 max-h-56 overflow-y-auto">
            <div v-if="!queueFillSlots.length" class="px-3 py-4 text-xs text-slate-500 text-center">
              No slots — add slots in Job Queue.
            </div>
            <div
              v-for="slot in queueFillSlots" :key="slot.id"
              class="flex flex-col gap-1 px-2 py-1.5"
              :class="slot.posted ? 'opacity-40' : ''"
            >
              <!-- Slot row: label + status + fill button -->
              <div class="flex items-center gap-1.5">
                <span class="text-xs font-medium text-slate-300">Slot {{ slot.position + 1 }}</span>
                <span
                  class="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                  :class="slot.posted
                    ? 'bg-mint/15 text-mint'
                    : queueFillImages[slot.id]?.length
                      ? 'bg-accent/15 text-accent'
                      : 'bg-slate-700/60 text-slate-500'"
                >
                  {{ slot.posted ? '✓ posted' : queueFillImages[slot.id]?.length ? `${queueFillImages[slot.id].length} img` : 'empty' }}
                </span>
                <button
                  class="button-primary ml-auto h-6 px-2 text-[11px]"
                  :disabled="!collectionCount || slot.posted"
                  @click="fillSlot(slot.id)"
                >Fill {{ collectionCount }} →</button>
              </div>
              <!-- Thumbnail strip -->
              <div v-if="queueFillImages[slot.id]?.length" class="flex gap-1">
                <img
                  v-for="img in queueFillImages[slot.id].slice(0, 5)"
                  :key="img.id"
                  :src="img.thumbnailUrl ?? ''"
                  :alt="img.filename"
                  class="h-9 w-9 rounded object-cover border border-line"
                />
                <div
                  v-if="queueFillImages[slot.id].length > 5"
                  class="flex h-9 w-9 items-center justify-center rounded border border-line text-[10px] text-slate-400"
                >+{{ queueFillImages[slot.id].length - 5 }}</div>
              </div>
            </div>
          </div>
        </div>
        <button v-else class="button h-7 w-full gap-1 text-xs" @click="openQueueFill">
          → Fill Queue Slot
        </button>

        <!-- Send to Chrome Extension queue -->
        <button
          v-if="EXTENSION_TYPES.has(libActiveTargetType as PostingTargetType)"
          class="button h-7 w-full gap-1 text-xs"
          :disabled="!collectionCount || !targetStore.activeTargetId"
          :title="`Queue ${collectionCount} image(s) for the Chrome extension (${libActiveTargetName})`"
          @click="sendCollectionToPlugin"
        >
          <Send class="h-3 w-3" />Send to Plugin
        </button>

        <!-- AI Post for collection -->
        <button
          class="button h-7 w-full gap-1 text-xs"
          :disabled="!collectionCount || !targetStore.activeTargetId"
          title="Generate AI post text for all collection images"
          @click="showAiPanel = true"
        >
          <Sparkles class="h-3 w-3" />AI Post
        </button>

        <button class="button h-6 w-full text-xs hover:border-rose/60 hover:text-rose" @click="clearCollection">
          <X class="h-3 w-3" />Clear collection
        </button>
      </div>

    </aside>
  </Transition>

  </div><!-- end outer -->

  <!-- ── AI Post Modal ──────────────────────────────────────────────────────── -->
  <Teleport to="body">
    <Transition
        enter-active-class="transition duration-150 ease-out"
        enter-from-class="opacity-0 scale-95"
        enter-to-class="opacity-100 scale-100"
        leave-active-class="transition duration-100 ease-in"
        leave-from-class="opacity-100 scale-100"
        leave-to-class="opacity-0 scale-95"
      >
      <div
        v-if="showAiPanel"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      >
        <div class="relative mx-4 flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-line bg-panelSoft shadow-2xl">
          <!-- Header -->
          <div class="flex shrink-0 items-center justify-between border-b border-line px-5 py-3">
            <div class="flex items-center gap-2">
              <Sparkles class="h-4 w-4 text-accent" />
              <p class="text-sm font-semibold text-white">AI Post</p>
              <!-- Platform switcher — change target without closing the modal -->
              <div class="relative">
                <select
                  v-model="targetStore.activeTargetId"
                  class="h-6 appearance-none rounded-md border border-accent/30 bg-accent/10 pl-2 pr-6 text-[11px] font-medium text-accent focus:border-accent/60 focus:outline-none cursor-pointer"
                  title="Switch target platform"
                >
                  <option v-for="t in targetStore.enabledTargets" :key="t.id" :value="t.id">{{ t.name }}</option>
                </select>
                <ChevronDown class="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-accent/70" />
              </div>
            </div>
            <button
              class="button h-7 w-7 p-0 hover:border-rose/60 hover:text-rose"
              title="Close"
              @click="showAiPanel = false; ai.clearGeneratedPost()"
            ><X class="h-3.5 w-3.5" /></button>
          </div>

          <!-- Scrollable body -->
          <div class="overflow-y-auto px-5 py-4">
            <AiPostPanel
              :image-paths="(collectionArray.length ? collectionArray : imageStore.selectedImages).map(i => i.localPath).filter((p): p is string => !!p)"
              :image-ids="(collectionArray.length ? collectionArray : imageStore.selectedImages).map(i => i.id)"
              :network="libActiveTargetType ?? ''"
              :network-name="libActiveTargetName"
              :queue-limit="PLATFORM_LIMITS[libActiveTargetType ?? ''] ?? 1"
              :disabled="selectedCount === 0 && collectionArray.length === 0"
              @queued="onAiQueued"
              @mark="onAiMark"
            />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- ── Video Prompt Modal ────────────────────────────────────────────────── -->
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="opacity-0 scale-95"
      enter-to-class="opacity-100 scale-100"
      leave-active-class="transition duration-100 ease-in"
      leave-from-class="opacity-100 scale-100"
      leave-to-class="opacity-0 scale-95"
    >
      <div
        v-if="showVideoPanel"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      >
        <div class="relative mx-4 flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-line bg-panelSoft shadow-2xl">
          <!-- Header -->
          <div class="flex shrink-0 items-center justify-between border-b border-line px-5 py-3">
            <div class="flex items-center gap-2">
              <Clapperboard class="h-4 w-4 text-violet-300" />
              <p class="text-sm font-semibold text-white">Video Prompt</p>
            </div>
            <button
              class="button h-7 w-7 p-0 hover:border-rose/60 hover:text-rose"
              title="Close"
              @click="closeVideoPanel"
            ><X class="h-3.5 w-3.5" /></button>
          </div>
          <!-- Scrollable body -->
          <div class="overflow-y-auto px-5 py-4">
            <VideoPromptPanel
              :image-paths="videoPromptSinglePath
                ? [videoPromptSinglePath]
                : (collectionArray.length ? collectionArray : imageStore.selectedImages).map(i => i.localPath).filter((p): p is string => !!p).slice(0, 1)"
              :disabled="!videoPromptSinglePath && selectedCount === 0 && collectionArray.length === 0"

            />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- ── Image Recreate Modal ──────────────────────────────────────────────── -->
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="opacity-0 scale-95"
      enter-to-class="opacity-100 scale-100"
      leave-active-class="transition duration-100 ease-in"
      leave-from-class="opacity-100 scale-100"
      leave-to-class="opacity-0 scale-95"
    >
      <div
        v-if="showImagePanel"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      >
        <div class="relative mx-4 flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-line bg-panelSoft shadow-2xl">
          <!-- Header -->
          <div class="flex shrink-0 items-center justify-between border-b border-line px-5 py-3">
            <div class="flex items-center gap-2">
              <Image class="h-4 w-4 text-sky-300" />
              <p class="text-sm font-semibold text-white">Recreate Image</p>
            </div>
            <button
              class="button h-7 w-7 p-0 hover:border-rose/60 hover:text-rose"
              title="Close"
              @click="closeImagePanel"
            ><X class="h-3.5 w-3.5" /></button>
          </div>
          <!-- Scrollable body -->
          <div class="overflow-y-auto px-5 py-4">
            <ImageGeneratePanel
              :image-paths="imageRecreateSinglePath ? [imageRecreateSinglePath] : []"
              :disabled="!imageRecreateSinglePath"
            />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- ── Upload / Rename Modal ─────────────────────────────────────────────── -->
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="opacity-0 scale-95"
      enter-to-class="opacity-100 scale-100"
      leave-active-class="transition duration-100 ease-in"
      leave-from-class="opacity-100 scale-100"
      leave-to-class="opacity-0 scale-95"
    >
      <div
        v-if="uploadPending"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
        @keydown.esc="cancelUpload"
      >
        <div class="relative mx-4 flex w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-line bg-panelSoft shadow-2xl">
          <!-- Header -->
          <div class="flex shrink-0 items-center justify-between border-b border-line px-5 py-3.5">
            <div class="flex items-center gap-2">
              <Upload class="h-4 w-4 text-accent" />
              <p class="text-sm font-semibold text-white">Save image to library</p>
            </div>
            <button class="button h-7 w-7 p-0 hover:border-rose/60 hover:text-rose" title="Cancel" @click="cancelUpload">
              <X class="h-3.5 w-3.5" />
            </button>
          </div>

          <!-- Preview + rename -->
          <div class="flex flex-col gap-4 px-5 py-4">
            <!-- Image preview -->
            <div class="flex justify-center overflow-hidden rounded-lg border border-line bg-black/20">
              <img
                :src="uploadPending.previewUrl"
                alt="Upload preview"
                class="max-h-52 w-full object-contain"
              />
            </div>

            <!-- Filename input -->
            <div class="flex flex-col gap-1.5">
              <label class="text-xs font-medium text-slate-400">Filename</label>
              <div class="flex items-center overflow-hidden rounded-lg border border-line bg-panel focus-within:border-accent/60">
                <input
                  v-model="uploadFilename"
                  type="text"
                  class="flex-1 bg-transparent px-3 py-2 text-sm text-white outline-none placeholder:text-slate-600"
                  placeholder="Enter filename"
                  @keydown.enter="confirmUpload"
                />
                <span class="shrink-0 border-l border-line px-3 py-2 text-xs text-slate-500">{{ uploadPending.ext }}</span>
              </div>
              <p class="text-[11px] text-slate-500">Target: {{ browsePath.split('/').pop() }}</p>
            </div>
          </div>

          <!-- Footer actions -->
          <div class="flex shrink-0 items-center justify-end gap-2 border-t border-line px-5 py-3">
            <button class="button h-8 px-4 text-sm" @click="cancelUpload">Cancel</button>
            <button class="button-primary h-8 px-4 text-sm" :disabled="!uploadFilename.trim()" @click="confirmUpload">
              <Upload class="h-3.5 w-3.5" />Save
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- ── Topaz Upscale Modal ──────────────────────────────────────────────── -->
  <Teleport to="body">
    <Transition enter-active-class="transition-opacity duration-150" enter-from-class="opacity-0" leave-active-class="transition-opacity duration-100" leave-to-class="opacity-0">
      <div v-if="showTopazModal" class="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" @click.self="closeTopazModal">
        <div class="surface flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-line shadow-2xl">
          <!-- Header -->
          <div class="flex shrink-0 items-center justify-between border-b border-line px-4 py-3">
            <div class="flex items-center gap-2">
              <Zap class="h-4 w-4 text-amber-400" />
              <h3 class="text-sm font-semibold text-white">Upscale with Topaz Labs</h3>
            </div>
            <button class="button h-7 w-7 p-0" @click="closeTopazModal"><X class="h-4 w-4" /></button>
          </div>

          <!-- Scrollable body -->
          <div class="flex flex-col gap-4 overflow-y-auto p-4">
            <p class="truncate text-xs text-slate-400">
              <span class="text-slate-500">Image:</span> {{ topazImagePath?.split('/').pop() }}
            </p>

            <!-- ── 1. Model ────────────────────────────────────────────── -->
            <div class="flex flex-col gap-1.5">
              <label class="text-xs font-medium text-slate-400">Model</label>
              <div class="grid grid-cols-3 gap-2">
                <button
                  v-for="m in ([{v:'standard',l:'Standard'},{v:'realism',l:'Realism'},{v:'wonder3',l:'Wonder 3'}] as const)"
                  :key="m.v"
                  class="rounded-lg border py-2 text-xs font-medium transition"
                  :class="topazUIModel === m.v ? 'border-amber-500/60 bg-amber-500/15 text-amber-300' : 'border-line text-slate-400 hover:border-slate-500 hover:text-white'"
                  @click="topazUIModel = m.v"
                >{{ m.l }}</button>
              </div>
              <p class="text-[11px] text-slate-500">
                <template v-if="topazUIModel === 'standard'">Precision upscaling with adjustable strength. Best for clean photo enlargement.</template>
                <template v-else-if="topazUIModel === 'realism'">AI-enhanced upscaling that restores natural texture and realism in GenAI images.</template>
                <template v-else>Generative upscaling with multi-level enhancement. Great for heavily degraded images.</template>
              </p>
            </div>

            <!-- ── 2. Creativity / Enhancement ────────────────────────── -->
            <div class="flex flex-col gap-1.5">
              <label class="text-xs font-medium text-slate-400">
                {{ topazUIModel === 'wonder3' ? 'Enhancement Level' : 'Creativity' }}
              </label>
              <!-- Standard: subtle / low / medium / high / max -->
              <div v-if="topazUIModel === 'standard'" class="flex flex-wrap gap-1.5">
                <button
                  v-for="c in ([{v:'subtle',l:'Subtle'},{v:'low',l:'Low'},{v:'medium',l:'Medium'},{v:'high',l:'High'},{v:'max',l:'Max'}] as const)"
                  :key="c.v"
                  class="rounded-md border px-3 py-1 text-xs transition"
                  :class="topazStdCreativity === c.v ? 'border-amber-500/60 bg-amber-500/15 text-amber-300' : 'border-line text-slate-400 hover:border-slate-500'"
                  @click="topazStdCreativity = c.v"
                >{{ c.l }}</button>
              </div>
              <!-- Realism: low / medium / high / max -->
              <div v-else-if="topazUIModel === 'realism'" class="flex flex-wrap gap-1.5">
                <button
                  v-for="c in ([{v:'low',l:'Low'},{v:'medium',l:'Medium'},{v:'high',l:'High'},{v:'max',l:'Max'}] as const)"
                  :key="c.v"
                  class="rounded-md border px-3 py-1 text-xs transition"
                  :class="topazRlmCreativity === c.v ? 'border-amber-500/60 bg-amber-500/15 text-amber-300' : 'border-line text-slate-400 hover:border-slate-500'"
                  @click="topazRlmCreativity = c.v"
                >{{ c.l }}</button>
              </div>
              <!-- Wonder 3: low / medium / high -->
              <div v-else class="flex gap-1.5">
                <button
                  v-for="e in ([{v:'low',l:'Low'},{v:'medium',l:'Medium'},{v:'high',l:'High'}] as const)"
                  :key="e.v"
                  class="rounded-md border px-3 py-1 text-xs transition"
                  :class="topazW3Enhancement === e.v ? 'border-amber-500/60 bg-amber-500/15 text-amber-300' : 'border-line text-slate-400 hover:border-slate-500'"
                  @click="topazW3Enhancement = e.v"
                >{{ e.l }}</button>
              </div>
            </div>

            <!-- ── 3. Scale ────────────────────────────────────────────── -->
            <div class="flex flex-col gap-1.5">
              <label class="text-xs font-medium text-slate-400">Scale</label>
              <div class="flex gap-1.5">
                <button
                  v-for="s in ([1,2,4,6,8] as const)"
                  :key="s"
                  class="w-12 rounded-md border py-1 text-xs font-semibold transition"
                  :class="topazScale === s ? 'border-amber-500/60 bg-amber-500/15 text-amber-300' : 'border-line text-slate-400 hover:border-slate-500'"
                  @click="topazScale = s"
                >{{ s }}×</button>
              </div>
              <p class="text-[11px] text-slate-500">Output dimensions = source × scale. Max scale depends on your account plan.</p>
            </div>

            <!-- ── 4. Outputs (Standard / Realism only) ───────────────── -->
            <div v-if="topazUIModel !== 'wonder3'" class="flex flex-col gap-1.5">
              <label class="text-xs font-medium text-slate-400">Outputs</label>
              <div class="flex gap-1.5">
                <button
                  v-for="n in ([1,2,4] as const)"
                  :key="n"
                  class="w-12 rounded-md border py-1 text-xs font-semibold transition"
                  :class="topazOutputs === n ? 'border-amber-500/60 bg-amber-500/15 text-amber-300' : 'border-line text-slate-400 hover:border-slate-500'"
                  @click="topazOutputs = n"
                >{{ n }}</button>
              </div>
              <p class="text-[11px] text-slate-500">Submits {{ topazOutputs }} variation{{ topazOutputs > 1 ? 's' : '' }} as separate queue job{{ topazOutputs > 1 ? 's' : '' }}.</p>
            </div>

            <!-- ── 5. Preserve Faces + Prompt (Standard / Realism) ────── -->
            <template v-if="topazUIModel !== 'wonder3'">
              <!-- Preserve Faces toggle -->
              <label class="flex cursor-pointer items-center gap-2.5">
                <input v-model="topazPreserveFaces" type="checkbox" class="h-3.5 w-3.5 accent-amber-400" aria-label="Preserve Faces" />
                <span class="text-xs text-slate-300">Preserve Faces <span class="text-slate-500">(face recovery model)</span></span>
              </label>

              <!-- Image description / prompt -->
              <div class="flex flex-col gap-1.5">
                <div class="flex items-center justify-between">
                  <label class="text-xs font-medium text-slate-400">Image Description <span class="font-normal text-slate-600">(optional)</span></label>
                  <button
                    class="flex h-6 items-center gap-1 rounded-md border border-line px-2 text-[11px] text-slate-400 transition hover:border-accent/50 hover:text-accent disabled:opacity-50"
                    :disabled="!topazImagePath || topazGeneratingPrompt"
                    @click="generateTopazPrompt"
                  >
                    <Sparkles class="h-3 w-3" />
                    {{ topazGeneratingPrompt ? 'Generating…' : 'AI Generate' }}
                  </button>
                </div>
                <textarea
                  v-model="topazPrompt"
                  rows="2"
                  class="field resize-none text-xs"
                  placeholder="Describe the image to guide the AI model…"
                />
                <p class="text-[11px] text-slate-500">Helps generative models produce more targeted results.</p>
              </div>
            </template>

            <!-- ── 6. Output format ────────────────────────────────────── -->
            <div class="flex flex-col gap-1.5">
              <label class="text-xs font-medium text-slate-400">Output format</label>
              <div class="flex gap-2">
                <label
                  v-for="fmt in (['jpeg', 'png'] as const)"
                  :key="fmt"
                  class="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md border py-1.5 text-xs transition"
                  :class="topazFormat === fmt ? 'border-amber-500/60 bg-amber-500/10 text-amber-300' : 'border-line text-slate-400 hover:border-slate-500'"
                >
                  <input v-model="topazFormat" type="radio" :value="fmt" class="sr-only" :aria-label="`Output format ${fmt}`" />
                  {{ fmt.toUpperCase() }}
                </label>
              </div>
            </div>

            <div v-if="topazSubmitError" class="rounded-md border border-rose/40 bg-rose/10 px-3 py-2 text-xs text-rose">
              {{ topazSubmitError }}
            </div>

            <!-- ── Live job status (after submit) ──────────────────────── -->
            <div v-if="topazTrackedJobs.length > 0" class="space-y-2 border-t border-line pt-3">
              <p class="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {{ topazTrackedJobs.length === 1 ? 'Job status' : topazTrackedJobs.length + ' jobs' }}
              </p>
              <div v-for="(job, idx) in topazTrackedJobs" :key="job.localId" class="space-y-1.5">
                <div
                  class="flex items-center gap-2 rounded-lg border px-3 py-2"
                  :class="{
                    'border-amber-500/30 bg-amber-500/10': job.status === 'processing',
                    'border-mint/30 bg-mint/10':           job.status === 'completed',
                    'border-rose/30 bg-rose/10':           job.status === 'failed',
                  }"
                >
                  <span
                    class="h-2 w-2 shrink-0 rounded-full"
                    :class="{
                      'bg-amber-400 animate-pulse': job.status === 'processing',
                      'bg-mint':                    job.status === 'completed',
                      'bg-rose':                    job.status === 'failed',
                    }"
                  />
                  <span
                    class="flex-1 text-xs font-medium"
                    :class="{
                      'text-amber-300': job.status === 'processing',
                      'text-mint':      job.status === 'completed',
                      'text-rose':      job.status === 'failed',
                    }"
                  >
                    <template v-if="topazTrackedJobs.length > 1">#{{ idx + 1 }} — </template>
                    {{ job.status === 'processing' ? 'Upscaling…' : job.status === 'completed' ? 'Done!' : 'Failed' }}
                  </span>
                </div>
                <template v-if="job.status === 'completed' && job.result_path">
                  <!-- Save to source folder -->
                  <button
                    v-if="!job.saved_path"
                    class="button h-7 w-full gap-1.5 px-2.5 text-xs border-mint/40 bg-mint/10 text-mint hover:bg-mint/20 disabled:opacity-50"
                    :disabled="job.saving"
                    @click="copyTopazResultToSource(job, idx)"
                  >
                    <FolderOpen class="h-3 w-3" :class="job.saving ? 'animate-pulse' : ''" />
                    {{ job.saving ? 'Saving…' : 'Save to source folder' }}
                  </button>
                  <!-- After save: reveal -->
                  <button
                    v-else
                    class="button h-7 w-full gap-1.5 px-2.5 text-xs border-mint/40 bg-mint/10 text-mint hover:bg-mint/20"
                    @click="revealJobPath(job.saved_path!)"
                  >
                    <FolderOpen class="h-3 w-3" /> Reveal in Finder
                  </button>
                </template>
                <p v-if="job.status === 'failed' && job.error_msg" class="text-[11px] text-rose px-1">{{ job.error_msg }}</p>
              </div>
            </div>
          </div>

          <!-- Footer -->
          <div class="flex shrink-0 items-center justify-end gap-2 border-t border-line px-4 py-3">
            <template v-if="topazTrackedJobs.length > 0">
              <button class="button h-8 px-3 text-sm" @click="topazTrackedJobs = []; topazSubmitError = ''">
                New Job
              </button>
              <button class="button h-8 px-3 text-sm" @click="closeTopazModal">Close</button>
            </template>
            <template v-else>
              <button class="button h-8 px-3 text-sm" @click="closeTopazModal">Cancel</button>
              <button
                class="flex h-8 items-center gap-1.5 rounded-md border border-amber-500/60 bg-amber-500/15 px-3 text-sm text-amber-300 transition hover:bg-amber-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                :disabled="!topazImagePath"
                @click="submitTopazUpscale"
              >
                <Zap class="h-3.5 w-3.5" />
                Queue {{ topazOutputs > 1 ? topazOutputs + '×' : '' }} Upscale Job{{ topazOutputs > 1 ? 's' : '' }}
              </button>
            </template>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

</template>
