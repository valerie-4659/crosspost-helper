<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { Ban, Check, ChevronDown, ChevronLeft, ChevronRight, Clapperboard, Clipboard, Copy, FolderOpen, Image, Images, Layers, Maximize2, Send, SkipForward, Shuffle, Sparkles, X, Zap } from "lucide-vue-next";
import AiPostPanel from "@/components/AiPostPanel.vue";
import VideoPromptPanel from "@/components/VideoPromptPanel.vue";
import ImageGeneratePanel from "@/components/ImageGeneratePanel.vue";
import { convertFileSrc } from "@/electron-shims/core";
import FilterBar from "@/components/FilterBar.vue";
import ImagePreview from "@/components/ImagePreview.vue";
import PlatformIcon from "@/components/PlatformIcon.vue";
import { useAiStore } from "@/stores/aiStore";
import { useFolderHistoryStore } from "@/stores/folderHistoryStore";
import { useImageStore } from "@/stores/imageStore";
import { usePickerStore } from "@/stores/pickerStore";
import { useSourceStore } from "@/stores/sourceStore";
import { useTargetStore } from "@/stores/targetStore";
import { useQueueStore } from "@/stores/queueStore";
import { createSlot, listSlots } from "@/repositories/queueRepository";
import { listImages } from "@/repositories/imageRepository";
import { markImagePosted } from "@/services/pickerService";
import type { PostingTargetType } from "@/types/postingTarget";
import type { QueueSlot } from "@/types/queue";
import type { ImageWithPostState } from "@/types/image";

const picker = usePickerStore();
const sources = useSourceStore();
const targets = useTargetStore();
const imageStore = useImageStore();
const ai = useAiStore();

const activeTargetName = computed(() => targets.activeTarget?.name ?? "target");

const EXTENSION_TYPES = new Set<PostingTargetType>(["x", "bluesky", "deviantart", "civitai", "instagram", "facebook", "tumblr"]);
const PLATFORM_LIMITS: Record<string, number> = { civitai: 20, x: 4, bluesky: 4, deviantart: 1, instagram: 10, facebook: 10, tumblr: 10 };


const extensionTargets = computed(() =>
  targets.enabledTargets.filter((t) => EXTENSION_TYPES.has(t.type)),
);

// ── Send to Extension (queue + optional AI text in one step) ─────────────
const queueMsg = ref("");
const queueErr = ref("");

type SendMode = "full" | "no_tags" | "images_only";
const LS_SEND_MODE = "crosspost_send_mode";
const sendMode         = ref<SendMode>((localStorage.getItem(LS_SEND_MODE) as SendMode) ?? "full");
const sendDropdownOpen = ref(false);
const sendDone         = ref(false);

const SEND_MODES: { value: SendMode; label: string; sub: string }[] = [
  { value: "full",        label: "Images, text and tags", sub: "Injects everything into the composer" },
  { value: "no_tags",     label: "Images and text",       sub: "Injects image + description, no hashtags" },
  { value: "images_only", label: "Images only",           sub: "Injects images only — text copied to clipboard" },
];
const sendModeLabel = computed(() => SEND_MODES.find((m) => m.value === sendMode.value)?.label ?? "Send");

function setSendMode(m: SendMode) {
  sendMode.value = m;
  localStorage.setItem(LS_SEND_MODE, m);
  sendDropdownOpen.value = false;
}

const copyablePickerText = computed(() => {
  if (!ai.generatedPost) return "";
  const parts: string[] = [];
  if (ai.editedTitle)       parts.push(ai.editedTitle);
  if (ai.editedDescription) parts.push(ai.editedDescription);
  if (ai.editedTags)        parts.push(ai.editedTags);
  return parts.join("\n\n");
});

async function sendToExtension() {
  if (!activeImage.value || !targets.activeTarget) return;
  const targetType = targets.activeTarget.type;
  queueMsg.value = "";
  queueErr.value = "";
  sendDropdownOpen.value = false;
  try {
    await window.desktop.bridge.setQueue(targetType, activeImageIds.value);

    if (sendMode.value === "full" && ai.generatedPost) {
      await window.desktop.bridge.setPostContent(targetType, {
        title:       ai.editedTitle,
        description: ai.editedDescription,
        tags:        ai.editedTags.split(/\s+/).filter(Boolean),
      });
    } else if (sendMode.value === "no_tags" && ai.generatedPost) {
      await window.desktop.bridge.setPostContent(targetType, {
        title:       ai.editedTitle,
        description: ai.editedDescription,
        tags:        [],
      });
    } else if (sendMode.value === "images_only") {
      await window.desktop.bridge.clearPostContent(targetType);
      if (copyablePickerText.value) {
        await navigator.clipboard.writeText(copyablePickerText.value).catch(() => {});
      }
    }

    sendDone.value = true;
    setTimeout(() => (sendDone.value = false), 2500);
    queueMsg.value = `✓ Queued for ${targetType}. Open the Chrome Extension to inject.`;
  } catch (err) {
    queueErr.value = err instanceof Error ? err.message : String(err);
  }
}

// ── Assign to Queue Slot ──────────────────────────────────────────────────
const queueStore = useQueueStore();
const showAssignPanel = ref(false);
const assignQueueId = ref("");
const assignSlots = ref<QueueSlot[]>([]);
const assignSlotId = ref("");
const addingSlot = ref(false);

// Inline "create new queue" form
const showNewQueueForm = ref(false);
const newQueueName = ref("");
const newQueueTargetId = ref("");

watch(assignQueueId, async (id) => {
  assignSlotId.value = "";
  assignSlots.value = id ? await listSlots(id) : [];
  if (assignSlots.value.length) assignSlotId.value = assignSlots.value[0].id;
});

async function openPickerAssignPanel() {
  if (!queueStore.queues.length) await queueStore.load();
  assignQueueId.value = queueStore.queues[0]?.id ?? "";
  showNewQueueForm.value = false;
  showAssignPanel.value = true;
}

async function confirmPickerAssign() {
  const imageId = picker.currentImage?.id;
  if (!imageId || !assignSlotId.value) return;
  await queueStore.setSlotImages(assignSlotId.value, [imageId]);
  const slotPos = (assignSlots.value.find((s) => s.id === assignSlotId.value)?.position ?? 0) + 1;
  const qName = queueStore.queues.find((q) => q.id === assignQueueId.value)?.name ?? "";
  queueMsg.value = `✓ Assigned to "${qName}" · Slot ${slotPos}.`;
  showAssignPanel.value = false;
  showNewQueueForm.value = false;
}

// Create a new queue inline (no initial slots — we add slots on demand)
async function createQueueInline() {
  if (!newQueueName.value.trim() || !newQueueTargetId.value) return;
  await queueStore.addQueue(newQueueName.value.trim(), newQueueTargetId.value, 0);
  const created = queueStore.queues[queueStore.queues.length - 1];
  newQueueName.value = "";
  showNewQueueForm.value = false;
  assignQueueId.value = created.id;
}

// Add a slot to the currently selected queue on the fly
async function addSlotInline() {
  if (!assignQueueId.value) return;
  addingSlot.value = true;
  try {
    const newSlot = await createSlot(assignQueueId.value, assignSlots.value.length);
    assignSlots.value = [...assignSlots.value, newSlot];
    assignSlotId.value = newSlot.id;
  } finally {
    addingSlot.value = false;
  }
}

// ── Multi-pick: send all slots to Extension + optional AI text ───────────
async function sendMultiPickToExtension(targetType: string) {
  const ids = picker.multiPickSlots.filter(Boolean).map((s) => s!.id);
  if (!ids.length) return;
  await window.desktop.bridge.setQueue(targetType, ids);
  if (ai.generatedPost) {
    await window.desktop.bridge.setPostContent(targetType, {
      title:       ai.editedTitle,
      description: ai.editedDescription,
      tags:        ai.editedTags.split(/\s+/).filter(Boolean),
    });
  }
  const extra = ai.generatedPost ? " + AI text" : "";
  picker.multiPickMessage = `✓ ${ids.length} image(s) queued${extra} for ${targetType}. Open the Chrome Extension.`;
}

// ── Multi-pick mode ───────────────────────────────────────────────────────
/** Show/hide the folder-selection panel. */
const showFolderPanel = ref(false);

const maxForActiveTarget = computed(() => {
  const type = targets.activeTarget?.type ?? "";
  return PLATFORM_LIMITS[type] ?? 10;
});

function activateMultiPick() {
  picker.setMultiPickMode(true);
  showFolderPanel.value = false;
}

function deactivateMultiPick() {
  picker.setMultiPickMode(false);
  showFolderPanel.value = false;
}

// ── Folder pick history ────────────────────────────────────────────────────
const folderHistory = useFolderHistoryStore();
watch(() => picker.currentImage, (img) => {
  if (img?.folderPath) folderHistory.recordVisit(img.folderPath);
  // Clear any alternative selection when a new random image is picked
  alternativeImages.value = [];
});

// ── Alternative images from folder (multi-select) ─────────────────────────
const alternativeImages    = ref<ImageWithPostState[]>([]);
const showFolderBrowser    = ref(false);
const folderImages         = ref<ImageWithPostState[]>([]);
const folderBrowserLoading = ref(false);
const lightboxImage        = ref<ImageWithPostState | null>(null);

const lightboxIndex   = computed(() => folderImages.value.findIndex((i) => i.id === lightboxImage.value?.id));
const lightboxHasPrev = computed(() => lightboxIndex.value > 0);
const lightboxHasNext = computed(() => lightboxIndex.value >= 0 && lightboxIndex.value < folderImages.value.length - 1);
function lightboxPrev() { if (lightboxHasPrev.value) lightboxImage.value = folderImages.value[lightboxIndex.value - 1]; }
function lightboxNext() { if (lightboxHasNext.value) lightboxImage.value = folderImages.value[lightboxIndex.value + 1]; }
function openLightbox(img: ImageWithPostState, e: Event) { e.stopPropagation(); lightboxImage.value = img; }

/** First selected alternative (or random pick) — drives preview and single-image actions (AI, Video, Recreate, Topaz). */
const activeImage = computed(() => alternativeImages.value[0] ?? picker.currentImage);
/** All IDs to queue/send: selected alternatives if any, else just the random pick. */
const activeImageIds = computed<string[]>(() =>
  alternativeImages.value.length
    ? alternativeImages.value.map((i) => i.id)
    : picker.currentImage ? [picker.currentImage.id] : []
);
const hasAlternatives = computed(() => alternativeImages.value.length > 0);

function isAltSelected(id: string) { return alternativeImages.value.some((i) => i.id === id); }

function toggleAlternative(img: ImageWithPostState) {
  const idx = alternativeImages.value.findIndex((i) => i.id === img.id);
  if (idx >= 0) {
    alternativeImages.value = alternativeImages.value.filter((_, i) => i !== idx);
  } else if (alternativeImages.value.length < maxForActiveTarget.value) {
    alternativeImages.value = [...alternativeImages.value, img];
  }
}

function clearAlternatives() {
  alternativeImages.value = [];
}

async function openFolderBrowser() {
  const img = picker.currentImage;
  if (!img) return;
  showFolderBrowser.value = true;
  folderBrowserLoading.value = true;
  try {
    folderImages.value = await listImages({
      exactFolderPath: img.folderPath,
      includeArchived: false,
      includeSkipped: true,
      sortBy: "alpha_asc",
    });
  } finally {
    folderBrowserLoading.value = false;
  }
}

/** Mark all selected alternatives (or the random pick if none selected). */
async function markWithAlternative() {
  if (!targets.activeTargetId) return;
  if (alternativeImages.value.length) {
    for (const img of alternativeImages.value) {
      await markImagePosted(img.id, targets.activeTargetId);
    }
    picker.message = "Marked as posted.";
    alternativeImages.value = [];
    await picker.pickRandom();
  } else {
    await picker.markPosted();
  }
}

// ── AI panel ──────────────────────────────────────────────────────────────────
// Picker-specific panel-state persistence (separate from Lib mode).
const LS_PICKER_PANELS = "crosspost_picker_panels";
const LS_PICKER_TOPAZ  = "crosspost_picker_topaz";
function _loadPickerPanels() {
  try { return JSON.parse(localStorage.getItem(LS_PICKER_PANELS) ?? "null") ?? {}; } catch { return {}; }
}
function _loadPickerTopaz() {
  try { return JSON.parse(localStorage.getItem(LS_PICKER_TOPAZ) ?? "null") ?? {}; } catch { return {}; }
}
const _savedPickerPanels = _loadPickerPanels();
const _savedPickerTopaz  = _loadPickerTopaz();

const showAiPanel    = ref<boolean>(_savedPickerPanels.showAiPanel    ?? false);
const showVideoPanel = ref<boolean>(_savedPickerPanels.showVideoPanel ?? false);
const showImagePanel = ref<boolean>(_savedPickerPanels.showImagePanel ?? false);
const showTopazPanel = ref<boolean>(_savedPickerPanels.showTopazPanel ?? false);

watch([showAiPanel, showVideoPanel, showImagePanel, showTopazPanel], () => {
  localStorage.setItem(LS_PICKER_PANELS, JSON.stringify({
    showAiPanel:    showAiPanel.value,
    showVideoPanel: showVideoPanel.value,
    showImagePanel: showImagePanel.value,
    showTopazPanel: showTopazPanel.value,
  }));
});

// ── Topaz Upscale Panel (inline, like Video/Recreate) ─────────────────────
type TopazUIModel = "standard" | "realism" | "wonder3";
const topazUIModel          = ref<TopazUIModel>((_savedPickerTopaz.topazUIModel        as TopazUIModel) ?? "standard");
const topazStdCreativity    = ref<"subtle"|"low"|"medium"|"high"|"max">(_savedPickerTopaz.topazStdCreativity ?? "medium");
const topazRlmCreativity    = ref<"low"|"medium"|"high"|"max">(_savedPickerTopaz.topazRlmCreativity           ?? "medium");
const topazW3Enhancement    = ref<"low"|"medium"|"high">(_savedPickerTopaz.topazW3Enhancement                 ?? "medium");
const topazScale            = ref<1|2|4|6|8>(_savedPickerTopaz.topazScale              ?? 2);
const topazOutputs          = ref<1|2|4>(_savedPickerTopaz.topazOutputs                ?? 1);
const topazPreserveFaces    = ref<boolean>(_savedPickerTopaz.topazPreserveFaces         ?? false);
const topazPrompt           = ref("");
const topazFormat           = ref<"jpeg"|"png">(_savedPickerTopaz.topazFormat           ?? "jpeg");
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
  const sourcePath = activeImage.value?.localPath;
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
    localStorage.setItem(LS_PICKER_TOPAZ, JSON.stringify({
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

// Reset Topaz transient state when the active image changes.
// Persisted settings (model, scale, format, …) are intentionally kept.
watch(() => activeImage.value?.id, (newId, oldId) => {
  if (!oldId || newId === oldId) return;
  topazPrompt.value           = "";
  topazSubmitError.value      = "";
  topazGeneratingPrompt.value = false;
  topazTrackedJobs.value      = [];
});

function toggleTopazPanel() {
  showTopazPanel.value = !showTopazPanel.value;
  if (showTopazPanel.value) {
    // Close other panels — content is preserved (v-show keeps them mounted).
    showAiPanel.value    = false;
    showVideoPanel.value = false;
    showImagePanel.value = false;
  }
}

async function generateTopazPrompt() {
  const localPath = activeImage.value?.localPath;
  if (!localPath) return;
  topazGeneratingPrompt.value = true;
  try {
    const result = await window.desktop.ai.generatePost(
      [localPath],
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
  const localPath = activeImage.value?.localPath;
  if (!localPath) return;
  topazSubmitError.value = "";
  topazTrackedJobs.value = [];
  const numOutputs = topazUIModel.value === "wonder3" ? 1 : topazOutputs.value;
  try {
    for (let i = 0; i < numOutputs; i++) {
      const result = await window.desktop.topaz.submitJob({
        imagePath:     localPath,
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
  } catch (e: unknown) {
    topazSubmitError.value = e instanceof Error ? e.message : String(e);
  }
}

/** Collect current image paths for AI analysis. */
function currentImagePaths(): string[] {
  if (picker.multiPickMode) {
    return picker.multiPickSlots.filter(Boolean).map((s) => s!.localPath).filter(Boolean) as string[];
  }
  return activeImage.value?.localPath ? [activeImage.value.localPath] : [];
}


onMounted(async () => {
  if (!imageStore.folders.length) await imageStore.loadFolders();

  window.desktop.topaz.onJobUpdated((data) => {
    const job = topazTrackedJobs.value.find((j) => j.localId === data.id);
    if (!job) return;
    if (data.status)                   job.status      = data.status as TopazTrackedJob["status"];
    if (data.result_path !== undefined) job.result_path = data.result_path ?? null;
    if (data.error_msg !== undefined)   job.error_msg   = data.error_msg ?? null;
  });
});

onUnmounted(() => {
  window.desktop.topaz.offJobUpdated();
});
</script>

<template>
  <div class="flex h-full flex-col gap-4 p-5">
    <header class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-semibold text-white">Posting Picker</h1>
        <p class="mt-1 text-sm text-slate-400">
          {{ picker.multiPickMode ? 'Multi-pick: select folders, set count, fill random slots.' : 'Random suggestion for the selected target.' }}
        </p>
      </div>
      <div class="flex items-center gap-3">
        <select v-model="targets.activeTargetId" class="field min-w-44">
          <option v-for="target in targets.enabledTargets" :key="target.id" :value="target.id">{{ target.name }}</option>
        </select>
        <!-- Mode toggle -->
        <button
          class="button gap-1.5"
          :class="picker.multiPickMode ? 'border-accent bg-accent/15 text-accent' : ''"
          title="Toggle multi-pick mode"
          @click="picker.multiPickMode ? deactivateMultiPick() : activateMultiPick()"
        >
          <Layers class="h-4 w-4" />
          Multi-Pick
        </button>
        <template v-if="!picker.multiPickMode">
          <button
            class="button rounded-md"
            :disabled="!picker.canGoBack"
            :title="picker.canGoBack ? `Go back (${picker.history.length} in history)` : 'No history yet'"
            @click="picker.goBack"
          >
            <ChevronLeft class="h-4 w-4" />Back
          </button>
          <button
            class="button-primary rounded-md"
            :disabled="picker.loading || !picker.canPick"
            @click="picker.pickRandom"
          >
            <Shuffle class="h-4 w-4" />Pick random
          </button>
        </template>
      </div>
    </header>

    <FilterBar
      v-model:filters="picker.filters"
      :sources="sources.sources"
      show-target-rules
      :show-include-skipped="picker.multiPickMode"
    />

    <!-- ══ MULTI-PICK MODE ══════════════════════════════════════════════ -->
    <template v-if="picker.multiPickMode">

      <!-- Config bar -->
      <div class="flex shrink-0 flex-wrap items-center gap-3 rounded-xl border border-line bg-panel px-4 py-3">
        <!-- Count selector -->
        <div class="flex items-center gap-2">
          <span class="text-xs text-slate-400">Images per post</span>
          <div class="flex items-center gap-1">
            <button
              v-for="n in maxForActiveTarget"
              :key="n"
              class="h-7 w-7 rounded border text-xs font-semibold transition"
              :class="picker.multiPickCount === n
                ? 'border-accent bg-accent/20 text-accent'
                : 'border-line bg-ink text-slate-400 hover:border-accent hover:text-white'"
              @click="picker.setMultiPickCount(n)"
            >{{ n }}</button>
          </div>
        </div>

        <!-- Folder selector toggle -->
        <button
          class="button h-7 px-2 text-xs"
          :class="picker.multiPickFolderPaths.length ? 'border-accent bg-accent/10 text-accent' : ''"
          @click="showFolderPanel = !showFolderPanel"
        >
          <FolderOpen class="h-3 w-3" />
          {{ picker.multiPickFolderPaths.length ? `${picker.multiPickFolderPaths.length} folder(s)` : 'All folders' }}
        </button>

        <!-- Spacer + Pick button -->
        <button
          class="button-primary ml-auto h-8 px-4 text-sm"
          :disabled="picker.loading"
          @click="picker.fillMultiPickSlots"
        >
          <Shuffle class="h-4 w-4" />Pick random
        </button>
      </div>

      <!-- Folder panel (collapsible) -->
      <div v-if="showFolderPanel" class="shrink-0 max-h-48 overflow-y-auto rounded-xl border border-line bg-panel px-4 py-3">
        <p class="mb-2 text-xs text-slate-400">Select source folders (empty = all):</p>
        <div class="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-4">
          <label
            v-for="folder in imageStore.folders"
            :key="folder.folderPath"
            class="flex cursor-pointer items-center gap-1.5 rounded px-2 py-1 text-xs transition hover:bg-panelSoft"
            :class="picker.multiPickFolderPaths.includes(folder.folderPath) ? 'text-accent' : 'text-slate-300'"
          >
            <input
              type="checkbox"
              class="h-3 w-3 accent-accent"
              :checked="picker.multiPickFolderPaths.includes(folder.folderPath)"
              @change="picker.toggleMultiPickFolder(folder.folderPath)"
            />
            <span class="truncate" :title="folder.folderPath">{{ folder.folderPath.split('/').pop() }}</span>
            <span class="shrink-0 text-slate-600">({{ folder.count }})</span>
          </label>
        </div>
      </div>

      <!-- Error / message -->
      <p v-if="picker.multiPickError" class="shrink-0 rounded border border-rose/40 bg-rose/10 px-3 py-1.5 text-xs text-rose">{{ picker.multiPickError }}</p>
      <p v-if="picker.multiPickMessage" class="shrink-0 rounded border border-mint/30 bg-mint/10 px-3 py-1.5 text-xs text-mint">{{ picker.multiPickMessage }}</p>

      <!-- Slots grid -->
      <div class="min-h-0 flex-1 overflow-y-auto">
        <div class="grid gap-3" style="grid-template-columns: repeat(auto-fill, minmax(220px, 1fr))">
          <div
            v-for="(slot, idx) in picker.multiPickSlots"
            :key="idx"
            class="group relative flex min-h-48 flex-col items-center justify-center overflow-hidden rounded-xl border transition"
            :class="slot ? 'border-line bg-panel' : 'border-dashed border-slate-700 bg-panel/50'"
          >
            <!-- Filled slot -->
            <template v-if="slot">
              <img
                :src="slot.localPath ? convertFileSrc(slot.localPath) : (slot.thumbnailUrl ?? '')"
                :alt="slot.filename"
                class="w-full object-contain"
                loading="lazy"
              />
              <div class="absolute bottom-0 left-0 right-0 bg-black/60 px-2 py-1">
                <p class="truncate text-xs text-slate-300">{{ slot.filename }}</p>
              </div>
              <!-- Remove button -->
              <button
                class="absolute right-1.5 top-1.5 hidden h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white hover:bg-rose/80 group-hover:flex"
                title="Remove and pick another"
                @click="picker.removeMultiPickSlot(slot.id)"
              ><X class="h-4 w-4" /></button>
            </template>
            <!-- Empty slot -->
            <template v-else>
              <Shuffle class="h-8 w-8 text-slate-700" />
              <p class="mt-2 text-xs text-slate-600">Slot {{ idx + 1 }}</p>
            </template>
          </div>
        </div>
      </div>

      <!-- Multi-pick action row -->
      <div class="shrink-0 flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <button
          class="button-primary h-8 px-4 text-sm"
          :disabled="picker.multiPickSlots.every(s => !s) || !targets.activeTargetId"
          @click="picker.markMultiPickPosted"
        >
          <Check class="h-4 w-4" />Mark {{ activeTargetName }} as posted
        </button>
        <template v-if="extensionTargets.length">
          <button
            v-for="target in extensionTargets"
            :key="target.id"
            class="button h-8 gap-1.5 px-3 text-xs"
            :class="ai.generatedPost ? 'border-accent/50 bg-accent/5' : ''"
            :disabled="picker.multiPickSlots.every(s => !s)"
            :title="`Queue${ai.generatedPost ? ' + AI text' : ''} for ${target.name}`"
            @click="sendMultiPickToExtension(target.type)"
          >
            <PlatformIcon :type="target.type" :size="13" />
            Send{{ ai.generatedPost ? ' + AI' : '' }}
          </button>
        </template>

        <!-- AI toggle -->
        <button
          class="button ml-auto h-8 gap-1.5 px-3 text-xs"
          :class="showAiPanel ? 'border-accent bg-accent/10 text-accent' : ''"
          :disabled="picker.multiPickSlots.every(s => !s)"
          title="Generate AI post text"
          @click="showAiPanel = !showAiPanel"
        >
          <Sparkles class="h-3.5 w-3.5" />AI Post
        </button>
      </div>

      <!-- AI panel (multi-pick) -->
      <div v-show="showAiPanel" class="shrink-0 rounded-xl border border-accent/30 bg-panel p-4">
        <div class="mb-2 flex items-center justify-between">
          <p class="text-sm font-semibold text-white">AI Post Generator</p>
          <button class="button h-6 w-6 p-0 text-xs" @click="showAiPanel = false"><X class="h-3 w-3" /></button>
        </div>
        <AiPostPanel
          :image-paths="currentImagePaths()"
          :network="targets.activeTarget?.type ?? 'x'"
          :network-name="activeTargetName"
          :disabled="picker.multiPickSlots.every(s => !s)"
          @mark="picker.markMultiPickPosted"
        />
        <p class="mt-2 text-[10px] text-slate-500">↑ Use "Send + AI" to queue with text.</p>
      </div>
    </template>

    <!-- ══ SINGLE-PICK MODE (original) ═════════════════════════════════ -->
    <div v-else class="flex min-h-0 flex-1 gap-4">
      <ImagePreview :image="activeImage" />

      <aside class="surface flex w-96 shrink-0 flex-col gap-2 overflow-y-auto rounded-lg p-3">
        <p class="text-xs font-semibold text-white">Use image</p>

        <div class="grid grid-cols-2 gap-1.5">
          <button class="button h-7 gap-1.5 px-2 text-xs" :disabled="!picker.currentImage" @click="picker.openCurrentImage">
            <FolderOpen class="h-3.5 w-3.5" />Reveal
          </button>
          <button class="button h-7 gap-1.5 px-2 text-xs" :disabled="!picker.currentImage" @click="picker.copyImage">
            <Clipboard class="h-3.5 w-3.5" />Image
          </button>
          <button class="button h-7 gap-1.5 px-2 text-xs" :disabled="!picker.currentImage" @click="picker.copyPath">
            <Copy class="h-3.5 w-3.5" />Path
          </button>
          <button
            class="button h-7 gap-1.5 px-2 text-xs"
            :disabled="!picker.currentImage || !targets.activeTargetId"
            title="Skip for this session"
            @click="picker.markSkipped"
          >
            <SkipForward class="h-3.5 w-3.5" />Skip {{ activeTargetName }}
          </button>
        </div>

        <!-- Pick alternative from same folder -->
        <button
          class="button h-7 w-full gap-1.5 px-2 text-xs"
          :class="hasAlternatives ? 'border-sky-500/60 bg-sky-500/10 text-sky-300' : ''"
          :disabled="!picker.currentImage"
          title="Browse siblings in the same folder and pick alternatives"
          @click="openFolderBrowser"
        >
          <Images class="h-3.5 w-3.5" />
          {{ hasAlternatives ? `${alternativeImages.length} alternative${alternativeImages.length > 1 ? 's' : ''} selected` : 'Pick alternative from folder' }}
        </button>

        <!-- Selected alternatives list -->
        <div v-if="hasAlternatives" class="rounded-md border border-sky-500/40 bg-sky-500/10 px-2 py-1.5 space-y-1">
          <div class="flex items-center justify-between">
            <span class="text-[11px] font-semibold text-sky-400">{{ alternativeImages.length }} / {{ maxForActiveTarget }} selected</span>
            <button class="text-[11px] text-slate-500 transition hover:text-rose-400" @click="clearAlternatives">Clear all</button>
          </div>
          <div v-for="alt in alternativeImages" :key="alt.id" class="flex items-center gap-1">
            <span class="flex-1 truncate text-[11px] text-sky-300" :title="alt.filename">↳ {{ alt.filename }}</span>
            <button
              class="shrink-0 text-slate-500 transition hover:text-rose-400"
              title="Remove"
              @click="alternativeImages = alternativeImages.filter(i => i.id !== alt.id)"
            ><X class="h-3.5 w-3.5" /></button>
          </div>
        </div>

        <!-- Global exclude -->
        <button
          class="button h-7 w-full gap-1.5 px-2 text-xs border-amber-800/50 bg-amber-900/20 text-amber-400 hover:border-amber-600 hover:bg-amber-900/40"
          :disabled="!picker.currentImage"
          title="Permanently exclude from ALL networks"
          @click="picker.excludeGlobally"
        >
          <Ban class="h-3.5 w-3.5" />Exclude globally
        </button>

        <!-- Round indicator -->
        <p v-if="picker.currentRound > 1" class="text-[11px] text-slate-500">
          Round {{ picker.currentRound }}
        </p>

        <button
          class="button-primary h-8 rounded-md text-sm"
          :disabled="!activeImage || !targets.activeTargetId"
          :title="hasAlternatives ? 'Marks only the selected alternative images as posted' : ''"
          @click="markWithAlternative"
        >
          <Check class="h-4 w-4" />
          Mark {{ alternativeImages.length > 1 ? alternativeImages.length + ' alternatives' : alternativeImages.length === 1 ? 'alternative' : activeTargetName }}
        </button>

        <!-- Send to Extension — split-button with send-mode dropdown -->
        <div class="border-t border-line pt-3">
          <div class="relative">
            <div class="flex">
              <!-- Main action -->
              <button
                class="button flex flex-1 items-center justify-center gap-2 rounded-r-none py-2 text-sm font-medium"
                :class="sendDone && sendMode === 'images_only' ? 'border-mint/60 bg-mint/10 text-mint' : (ai.generatedPost ? 'border-accent/50 bg-accent/5' : '')"
                :disabled="!activeImage || !targets.activeTarget || !EXTENSION_TYPES.has(targets.activeTarget.type)"
                @click="sendToExtension"
              >
                <Check v-if="sendDone" class="h-4 w-4" />
                <Send v-else class="h-4 w-4" />
                {{ sendDone && sendMode === 'images_only' ? 'Text copied!' : sendDone ? 'Queued!' : sendModeLabel }}
              </button>
              <!-- Dropdown toggle -->
              <button
                class="button flex items-center rounded-l-none border-l border-white/20 px-2.5 py-2"
                :disabled="!activeImage || !targets.activeTarget || !EXTENSION_TYPES.has(targets.activeTarget.type)"
                :class="sendDropdownOpen ? 'bg-accent/10' : ''"
                @click.stop="sendDropdownOpen = !sendDropdownOpen"
              >
                <ChevronDown class="h-3.5 w-3.5" :class="sendDropdownOpen ? 'rotate-180' : ''" style="transition: transform 0.15s" />
              </button>
            </div>

            <!-- Dropdown menu -->
            <div
              v-if="sendDropdownOpen"
              class="absolute bottom-full left-0 right-0 z-50 mb-1 overflow-hidden rounded-lg border border-line bg-panel shadow-xl"
              @click.stop
            >
              <button
                v-for="m in SEND_MODES"
                :key="m.value"
                class="flex w-full flex-col px-3 py-2.5 text-left transition hover:bg-panelSoft"
                :class="sendMode === m.value ? 'bg-accent/10 text-accent' : 'text-slate-200'"
                @click="setSendMode(m.value)"
              >
                <span class="flex items-center gap-2 text-xs font-medium">
                  <Check v-if="sendMode === m.value" class="h-3 w-3 shrink-0" />
                  <span v-else class="h-3 w-3 shrink-0" />
                  {{ m.label }}
                </span>
                <span class="ml-5 text-[11px] text-slate-500">{{ m.sub }}</span>
              </button>
            </div>
          </div>
          <p v-if="queueMsg" class="mt-1 text-xs text-mint">{{ queueMsg }}</p>
          <p v-if="queueErr" class="mt-1 text-xs text-rose">{{ queueErr }}</p>

          <!-- Assign to Queue Slot -->
          <div v-if="showAssignPanel" class="mt-2 rounded-lg border border-line bg-panelSoft p-2 space-y-1.5">
            <p class="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Assign to Queue Slot</p>

            <!-- Queue row: dropdown + "New Queue" toggle -->
            <div class="flex gap-1">
              <select v-model="assignQueueId" aria-label="Queue" class="input h-7 min-w-0 flex-1 text-xs">
                <option v-if="!queueStore.queues.length" value="" disabled>No queues yet</option>
                <option v-for="q in queueStore.queues" :key="q.id" :value="q.id">{{ q.name }} ({{ q.targetName }})</option>
              </select>
              <button
                class="button h-7 w-7 shrink-0 p-0 text-xs"
                :class="showNewQueueForm ? 'border-accent text-accent' : ''"
                title="Create a new queue"
                @click="showNewQueueForm = !showNewQueueForm; newQueueTargetId = targets.enabledTargets[0]?.id ?? ''"
              >＋</button>
            </div>

            <!-- Inline "new queue" form -->
            <div v-if="showNewQueueForm" class="rounded border border-line bg-panel p-1.5 space-y-1">
              <input
                v-model="newQueueName"
                class="input h-6 w-full text-xs"
                placeholder="Queue name"
                @keydown.enter.prevent="createQueueInline"
              />
              <select v-model="newQueueTargetId" class="input h-6 w-full text-xs">
                <option v-for="t in targets.enabledTargets" :key="t.id" :value="t.id">{{ t.name }}</option>
              </select>
              <div class="flex gap-1">
                <button class="button h-6 flex-1 text-xs" @click="showNewQueueForm = false">✕</button>
                <button class="button-primary h-6 flex-1 text-xs" :disabled="!newQueueName.trim() || !newQueueTargetId" @click="createQueueInline">Create</button>
              </div>
            </div>

            <!-- Slot row: dropdown + "Add Slot" button -->
            <div class="flex gap-1">
              <select v-model="assignSlotId" aria-label="Slot" class="input h-7 min-w-0 flex-1 text-xs" :disabled="!assignSlots.length && !assignQueueId">
                <option v-if="!assignSlots.length" value="" disabled>No slots</option>
                <option v-for="s in assignSlots" :key="s.id" :value="s.id">Slot {{ s.position + 1 }}{{ s.posted ? ' ✓' : '' }}</option>
              </select>
              <button
                class="button h-7 w-7 shrink-0 p-0 text-xs"
                :disabled="!assignQueueId || addingSlot"
                title="Add a new slot to this queue"
                @click="addSlotInline"
              >{{ addingSlot ? '…' : '＋' }}</button>
            </div>

            <div class="flex gap-1.5">
              <button class="button h-7 flex-1 text-xs" @click="showAssignPanel = false; showNewQueueForm = false">Cancel</button>
              <button class="button-primary h-7 flex-1 text-xs" :disabled="!assignSlotId || !picker.currentImage" @click="confirmPickerAssign">
                Assign →
              </button>
            </div>
          </div>
          <button v-else class="mt-2 button w-full gap-1 text-xs" :disabled="!activeImage" @click="openPickerAssignPanel">
            → Add to Queue Slot
          </button>
        </div>

        <!-- ── AI Post Generator ─────────────────────────────────────── -->
        <div class="border-t border-line pt-3">
          <button
            class="button w-full gap-2"
            :class="showAiPanel ? 'border-accent bg-accent/10 text-accent' : ''"
            :disabled="!activeImage"
            title="Generate AI post text for the selected network"
            @click="showAiPanel = !showAiPanel; if (showAiPanel) { showVideoPanel = false; showImagePanel = false; }"
          >
            <Sparkles class="h-4 w-4" />
            AI Post Generator
          </button>

          <div v-show="showAiPanel" class="mt-3">
            <!-- Platform switcher for AI panel -->
            <div class="mb-2 flex items-center gap-2">
              <p class="text-[11px] font-medium uppercase tracking-wide text-slate-500 shrink-0">Platform</p>
              <div class="relative flex-1">
                <select
                  v-model="targets.activeTargetId"
                  class="w-full appearance-none rounded-lg border border-line bg-panelSoft pl-2.5 pr-7 text-xs text-slate-200 py-1 focus:border-accent/60 focus:outline-none cursor-pointer hover:border-slate-500 transition"
                  title="Switch platform for AI post"
                >
                  <option v-for="t in targets.enabledTargets" :key="t.id" :value="t.id">{{ t.name }}</option>
                </select>
                <ChevronDown class="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-500" />
              </div>
            </div>
            <AiPostPanel
              :image-paths="currentImagePaths()"
              :network="targets.activeTarget?.type ?? 'x'"
              :disabled="!activeImage"
            />
            <!-- Send to Plugin first, then Mark — prevents accidental Mark clicks -->
            <template v-if="ai.generatedPost">
              <button
                class="mt-2 button w-full gap-1.5 text-xs"
                :class="sendDone ? 'border-mint/60 bg-mint/10 text-mint' : (EXTENSION_TYPES.has(targets.activeTarget?.type as any) ? 'border-accent/40' : '')"
                :disabled="!activeImage || !targets.activeTarget || !EXTENSION_TYPES.has(targets.activeTarget.type)"
                @click="sendToExtension"
              >
                <Check v-if="sendDone" class="h-3 w-3" />
                <Send v-else class="h-3 w-3" />
                {{ sendDone ? 'Queued!' : 'Send to Plugin' }}
              </button>
              <button
                class="mt-1 button w-full gap-1.5 text-xs"
                :disabled="!activeImage || !targets.activeTargetId"
                :title="`Mark as posted on ${activeTargetName}`"
                @click="markWithAlternative"
              >
                <Check class="h-3 w-3" />
                Mark on {{ activeTargetName }}
              </button>
            </template>
          </div>
        </div>

        <!-- ── Video Prompt Generator ────────────────────────────────── -->
        <div class="border-t border-line pt-3">
          <button
            class="button w-full gap-2"
            :class="showVideoPanel ? 'border-violet-400/60 bg-violet-400/10 text-violet-300' : ''"
            :disabled="!activeImage"
            title="Generate a video prompt from the current image"
            @click="showVideoPanel = !showVideoPanel; if (showVideoPanel) { showAiPanel = false; showImagePanel = false; }"
          >
            <Clapperboard class="h-4 w-4" />
            Video Prompt
          </button>

          <div v-show="showVideoPanel" class="mt-3">
            <VideoPromptPanel
              :image-paths="currentImagePaths()"
              :disabled="!activeImage"
            />
          </div>
        </div>

        <!-- ── Recreate Image ─────────────────────────────────────── -->
        <div class="border-t border-line pt-3">
          <button
            class="button w-full gap-2"
            :class="showImagePanel ? 'border-sky-400/60 bg-sky-400/10 text-sky-300' : ''"
            :disabled="!activeImage"
            title="Recreate this image with AI via Wavespeed"
            @click="showImagePanel = !showImagePanel; if (showImagePanel) { showAiPanel = false; showVideoPanel = false; }"
          >
            <Image class="h-4 w-4" />
            Recreate Image
          </button>

          <div v-show="showImagePanel" class="mt-3">
            <ImageGeneratePanel
              :image-paths="currentImagePaths()"
              :disabled="!activeImage"
            />
          </div>
        </div>

        <!-- ── Upscale with Topaz ──────────────────────────────────── -->
        <div class="border-t border-line pt-3">
          <button
            class="button w-full gap-2"
            :class="showTopazPanel ? 'border-amber-500/60 bg-amber-500/10 text-amber-300' : ''"
            :disabled="!activeImage || !activeImage.localPath"
            title="Upscale this image with Topaz Labs AI"
            @click="toggleTopazPanel"
          >
            <Zap class="h-4 w-4" />
            Upscale with Topaz
          </button>

          <!-- Inline Topaz panel -->
          <div v-show="showTopazPanel" class="mt-3 space-y-3">

            <!-- 1. Model -->
            <div class="flex flex-col gap-1.5">
              <label class="text-[11px] font-medium uppercase tracking-wide text-slate-500">Model</label>
              <div class="grid grid-cols-3 gap-1.5">
                <button
                  v-for="m in ([{v:'standard',l:'Standard'},{v:'realism',l:'Realism'},{v:'wonder3',l:'Wonder 3'}] as const)"
                  :key="m.v"
                  class="rounded-lg border py-1.5 text-xs font-medium transition"
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

            <!-- 2. Creativity / Enhancement -->
            <div class="flex flex-col gap-1.5">
              <label class="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                {{ topazUIModel === 'wonder3' ? 'Enhancement' : 'Creativity' }}
              </label>
              <div v-if="topazUIModel === 'standard'" class="flex flex-wrap gap-1.5">
                <button
                  v-for="c in ([{v:'subtle',l:'Subtle'},{v:'low',l:'Low'},{v:'medium',l:'Medium'},{v:'high',l:'High'},{v:'max',l:'Max'}] as const)"
                  :key="c.v"
                  class="rounded-md border px-2.5 py-1 text-xs transition"
                  :class="topazStdCreativity === c.v ? 'border-amber-500/60 bg-amber-500/15 text-amber-300' : 'border-line text-slate-400 hover:border-slate-500'"
                  @click="topazStdCreativity = c.v"
                >{{ c.l }}</button>
              </div>
              <div v-else-if="topazUIModel === 'realism'" class="flex flex-wrap gap-1.5">
                <button
                  v-for="c in ([{v:'low',l:'Low'},{v:'medium',l:'Medium'},{v:'high',l:'High'},{v:'max',l:'Max'}] as const)"
                  :key="c.v"
                  class="rounded-md border px-2.5 py-1 text-xs transition"
                  :class="topazRlmCreativity === c.v ? 'border-amber-500/60 bg-amber-500/15 text-amber-300' : 'border-line text-slate-400 hover:border-slate-500'"
                  @click="topazRlmCreativity = c.v"
                >{{ c.l }}</button>
              </div>
              <div v-else class="flex gap-1.5">
                <button
                  v-for="e in ([{v:'low',l:'Low'},{v:'medium',l:'Medium'},{v:'high',l:'High'}] as const)"
                  :key="e.v"
                  class="rounded-md border px-2.5 py-1 text-xs transition"
                  :class="topazW3Enhancement === e.v ? 'border-amber-500/60 bg-amber-500/15 text-amber-300' : 'border-line text-slate-400 hover:border-slate-500'"
                  @click="topazW3Enhancement = e.v"
                >{{ e.l }}</button>
              </div>
            </div>

            <!-- 3. Scale -->
            <div class="flex flex-col gap-1.5">
              <label class="text-[11px] font-medium uppercase tracking-wide text-slate-500">Scale</label>
              <div class="flex gap-1.5">
                <button
                  v-for="s in ([1,2,4,6,8] as const)"
                  :key="s"
                  class="flex-1 rounded-md border py-1 text-xs font-semibold transition"
                  :class="topazScale === s ? 'border-amber-500/60 bg-amber-500/15 text-amber-300' : 'border-line text-slate-400 hover:border-slate-500'"
                  @click="topazScale = s"
                >{{ s }}×</button>
              </div>
              <p class="text-[11px] text-slate-500">Output = source × scale. Max scale depends on your account plan.</p>
            </div>

            <!-- 4. Outputs (Standard / Realism only) -->
            <div v-if="topazUIModel !== 'wonder3'" class="flex flex-col gap-1.5">
              <label class="text-[11px] font-medium uppercase tracking-wide text-slate-500">Outputs</label>
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

            <!-- 5. Preserve Faces + Prompt (Standard / Realism) -->
            <template v-if="topazUIModel !== 'wonder3'">
              <label class="flex cursor-pointer items-center gap-2 select-none">
                <input v-model="topazPreserveFaces" type="checkbox" class="h-3.5 w-3.5 accent-amber-400" aria-label="Preserve Faces" />
                <span class="text-xs text-slate-300">Preserve Faces <span class="text-slate-500">(face recovery model)</span></span>
              </label>

              <div class="flex flex-col gap-1.5">
                <div class="flex items-center justify-between">
                  <label class="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                    Image Description <span class="normal-case font-normal text-slate-600">(optional)</span>
                  </label>
                  <button
                    class="flex h-6 items-center gap-1 rounded-md border border-line px-2 text-[11px] text-slate-400 transition hover:border-accent/50 hover:text-accent disabled:opacity-50"
                    :disabled="!activeImage?.localPath || topazGeneratingPrompt"
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

            <!-- 6. Output format -->
            <div class="flex flex-col gap-1.5">
              <label class="text-[11px] font-medium uppercase tracking-wide text-slate-500">Output format</label>
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

            <!-- Error -->
            <div v-if="topazSubmitError" class="rounded-md border border-rose/40 bg-rose/10 px-3 py-2 text-xs text-rose">
              {{ topazSubmitError }}
            </div>

            <!-- Submit / job status -->
            <template v-if="topazTrackedJobs.length === 0">
              <button
                class="w-full flex items-center justify-center gap-1.5 rounded-lg border border-amber-500/60 bg-amber-500/15 py-2 text-xs font-semibold text-amber-300 transition hover:bg-amber-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                :disabled="!activeImage?.localPath"
                @click="submitTopazUpscale"
              >
                <Zap class="h-3.5 w-3.5" />
                Queue {{ topazOutputs > 1 && topazUIModel !== 'wonder3' ? topazOutputs + '× ' : '' }}Upscale Job{{ topazOutputs > 1 && topazUIModel !== 'wonder3' ? 's' : '' }}
              </button>
            </template>

            <!-- Live job status (after submit) -->
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
                  <button
                    v-if="!job.saved_path"
                    class="button h-7 w-full gap-1.5 px-2.5 text-xs border-mint/40 bg-mint/10 text-mint hover:bg-mint/20 disabled:opacity-50"
                    :disabled="job.saving"
                    @click="copyTopazResultToSource(job, idx)"
                  >
                    <FolderOpen class="h-3 w-3" :class="job.saving ? 'animate-pulse' : ''" />
                    {{ job.saving ? 'Saving…' : 'Save to source folder' }}
                  </button>
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
              <button class="button h-7 w-full text-xs" @click="topazTrackedJobs = []; topazSubmitError = ''">
                New Job
              </button>
            </div>

          </div><!-- end inline Topaz panel -->
        </div>

        <div v-if="picker.error" class="rounded-md border border-gold/40 bg-gold/10 p-3 text-sm text-gold">
          {{ picker.error }}
        </div>
      </aside>
    </div><!-- end single-mode flex row -->
    </div><!-- end outer container -->

  <!-- ── Folder Browser Modal (pick alternative) ───────────────────────────── -->
  <Teleport to="body">
    <Transition enter-active-class="transition-opacity duration-150" enter-from-class="opacity-0" leave-active-class="transition-opacity duration-100" leave-to-class="opacity-0">
      <div v-if="showFolderBrowser" class="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" @click.self="lightboxImage ? lightboxImage = null : showFolderBrowser = false">
        <div class="surface flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-line shadow-2xl">

          <!-- ── Header ── -->
          <div class="flex shrink-0 items-center justify-between border-b border-line px-4 py-3">
            <div class="flex items-center gap-2">
              <!-- Back to grid when in lightbox view -->
              <button v-if="lightboxImage" class="button h-7 gap-1 px-2 text-xs" @click="lightboxImage = null">
                <ChevronLeft class="h-3.5 w-3.5" />Grid
              </button>
              <template v-else>
                <Images class="h-4 w-4 text-sky-400" />
                <h3 class="text-sm font-semibold text-white">Pick alternative from folder</h3>
                <span class="text-xs text-slate-500 truncate max-w-[30ch]" :title="picker.currentImage?.folderPath">
                  {{ picker.currentImage?.folderPath?.split('/').pop() }}
                </span>
                <span v-if="hasAlternatives" class="rounded bg-sky-500/80 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  {{ alternativeImages.length }} / {{ maxForActiveTarget }}
                </span>
              </template>
              <!-- Lightbox title -->
              <template v-if="lightboxImage">
                <span class="truncate text-sm font-semibold text-white">{{ lightboxImage.filename }}</span>
                <span class="text-xs text-slate-500">{{ lightboxIndex + 1 }} / {{ folderImages.length }}</span>
              </template>
            </div>
            <button class="button h-7 w-7 p-0" @click="lightboxImage ? lightboxImage = null : showFolderBrowser = false">
              <X v-if="!lightboxImage" class="h-4 w-4" />
              <ChevronLeft v-else class="h-4 w-4" />
            </button>
          </div>

          <!-- ── Lightbox view ── -->
          <template v-if="lightboxImage">
            <div class="relative flex min-h-0 flex-1 items-center justify-center bg-black/60">
              <!-- Prev arrow -->
              <button
                v-if="lightboxHasPrev"
                class="absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-lg border border-line bg-ink/80 p-2 text-white opacity-60 transition hover:opacity-100"
                @click="lightboxPrev"
              ><ChevronLeft class="h-6 w-6" /></button>

              <img
                :src="lightboxImage.localPath ? convertFileSrc(lightboxImage.localPath) : (lightboxImage.thumbnailUrl ?? '')"
                :alt="lightboxImage.filename"
                class="max-h-full max-w-full object-contain p-4"
                style="max-height: calc(92vh - 8rem)"
              />

              <!-- Next arrow -->
              <button
                v-if="lightboxHasNext"
                class="absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-lg border border-line bg-ink/80 p-2 text-white opacity-60 transition hover:opacity-100"
                @click="lightboxNext"
              ><ChevronRight class="h-6 w-6" /></button>
            </div>

            <!-- Lightbox footer -->
            <div class="flex shrink-0 items-center justify-between border-t border-line px-4 py-3">
              <div class="flex items-center gap-2">
                <span v-if="picker.currentImage?.id === lightboxImage.id" class="rounded bg-accent/80 px-2 py-0.5 text-xs font-semibold text-white">Random pick</span>
                <span v-if="isAltSelected(lightboxImage.id)" class="rounded bg-sky-500/90 px-2 py-0.5 text-xs font-semibold text-white">Selected</span>
                <span v-if="!isAltSelected(lightboxImage.id) && alternativeImages.length >= maxForActiveTarget" class="text-xs text-amber-400">
                  Max {{ maxForActiveTarget }} reached
                </span>
              </div>
              <div class="flex gap-2">
                <button class="button h-8 px-3 text-sm" @click="lightboxImage = null">Back to grid</button>
                <button
                  class="flex h-8 items-center gap-1.5 rounded-md border px-4 text-sm font-medium transition"
                  :class="isAltSelected(lightboxImage.id)
                    ? 'border-rose-500/60 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20'
                    : alternativeImages.length >= maxForActiveTarget
                    ? 'cursor-not-allowed border-line text-slate-500 opacity-50'
                    : 'border-sky-600/50 bg-sky-600/10 text-sky-300 hover:bg-sky-600/25'"
                  :disabled="!isAltSelected(lightboxImage.id) && alternativeImages.length >= maxForActiveTarget"
                  @click="toggleAlternative(lightboxImage)"
                >
                  <X v-if="isAltSelected(lightboxImage.id)" class="h-4 w-4" />
                  <Check v-else class="h-4 w-4" />
                  {{ isAltSelected(lightboxImage.id) ? 'Deselect' : 'Pick this image' }}
                </button>
              </div>
            </div>
          </template>

          <!-- ── Grid view ── -->
          <template v-else>
            <div class="min-h-0 flex-1 overflow-y-auto p-3">
              <div v-if="folderBrowserLoading" class="flex items-center justify-center py-16 text-slate-500 text-sm">
                Loading…
              </div>
              <div v-else-if="!folderImages.length" class="flex items-center justify-center py-16 text-slate-500 text-sm">
                No images found in this folder.
              </div>
              <div v-else class="grid gap-2" style="grid-template-columns: repeat(auto-fill, minmax(160px, 1fr))">
                <button
                  v-for="img in folderImages"
                  :key="img.id"
                  class="group relative flex flex-col overflow-hidden rounded-lg border transition focus:outline-none"
                  :class="[
                    isAltSelected(img.id)
                      ? 'border-sky-500 ring-2 ring-sky-500/50'
                      : picker.currentImage?.id === img.id
                      ? 'border-accent/60 ring-1 ring-accent/30'
                      : 'border-line hover:border-slate-500',
                    !isAltSelected(img.id) && alternativeImages.length >= maxForActiveTarget ? 'opacity-50' : '',
                  ]"
                  :title="img.filename"
                  @click="toggleAlternative(img)"
                >
                  <!-- Thumbnail — full image, no crop -->
                  <div class="flex h-44 w-full items-center justify-center overflow-hidden bg-black/60">
                    <img
                      v-if="img.localPath || img.thumbnailUrl"
                      :src="img.localPath ? convertFileSrc(img.localPath) : (img.thumbnailUrl ?? '')"
                      :alt="img.filename"
                      class="max-h-full max-w-full object-contain transition group-hover:brightness-110"
                      loading="lazy"
                    />
                    <Image v-else class="h-8 w-8 text-slate-700" />
                  </div>
                  <!-- Label -->
                  <div class="px-1.5 py-1">
                    <p class="truncate text-[10px] text-slate-400 group-hover:text-slate-200">{{ img.filename }}</p>
                  </div>
                  <!-- Left badge: Random pick label -->
                  <div class="absolute left-1 top-1">
                    <span v-if="picker.currentImage?.id === img.id" class="rounded bg-accent/80 px-1 py-0.5 text-[9px] font-semibold text-white">Random pick</span>
                  </div>
                  <!-- Right: checkmark when selected, zoom button on hover (not selected) -->
                  <div class="absolute right-1 top-1 flex flex-col items-end gap-1">
                    <div v-if="isAltSelected(img.id)" class="flex h-5 w-5 items-center justify-center rounded-full bg-sky-500 text-white">
                      <Check class="h-3 w-3" />
                    </div>
                    <button
                      class="hidden h-6 w-6 items-center justify-center rounded-md bg-black/70 text-white transition hover:bg-white/20 group-hover:flex"
                      title="View full image"
                      @click="openLightbox(img, $event)"
                    >
                      <Maximize2 class="h-3.5 w-3.5" />
                    </button>
                  </div>
                </button>
              </div>
            </div>

            <!-- Grid footer -->
            <div class="flex shrink-0 items-center justify-between border-t border-line px-4 py-3">
              <div class="flex items-center gap-3">
                <p class="text-xs text-slate-500">{{ folderImages.length }} image{{ folderImages.length === 1 ? '' : 's' }} in folder</p>
                <p v-if="hasAlternatives" class="text-xs text-sky-400">{{ alternativeImages.length }} / {{ maxForActiveTarget }} selected</p>
              </div>
              <div class="flex gap-2">
                <button v-if="hasAlternatives" class="button h-8 px-3 text-sm text-slate-400" @click="clearAlternatives">Clear</button>
                <button class="button h-8 px-3 text-sm" @click="showFolderBrowser = false">
                  {{ hasAlternatives ? 'Cancel' : 'Close' }}
                </button>
                <button
                  v-if="hasAlternatives"
                  class="flex h-8 items-center gap-1.5 rounded-md border border-sky-500/60 bg-sky-500/15 px-4 text-sm font-medium text-sky-300 transition hover:bg-sky-500/25"
                  @click="showFolderBrowser = false"
                >
                  <Check class="h-4 w-4" />
                  Use {{ alternativeImages.length }} image{{ alternativeImages.length > 1 ? 's' : '' }}
                </button>
              </div>
            </div>
          </template>

        </div>
      </div>
    </Transition>
  </Teleport>


</template>
