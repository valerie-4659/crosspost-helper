<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { Ban, Check, ChevronDown, ChevronLeft, Clapperboard, Clipboard, Copy, FolderOpen, Layers, Send, SkipForward, Shuffle, Sparkles, X } from "lucide-vue-next";
import AiPostPanel from "@/components/AiPostPanel.vue";
import VideoPromptPanel from "@/components/VideoPromptPanel.vue";
import VideoQueuePanel from "@/components/VideoQueuePanel.vue";
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
import type { PostingTargetType } from "@/types/postingTarget";
import type { QueueSlot } from "@/types/queue";

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
  if (!picker.currentImage || !targets.activeTarget) return;
  const targetType = targets.activeTarget.type;
  queueMsg.value = "";
  queueErr.value = "";
  sendDropdownOpen.value = false;
  try {
    await window.desktop.bridge.setQueue(targetType, [picker.currentImage.id]);

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
});

// ── AI panel ──────────────────────────────────────────────────────────────────
const showAiPanel    = ref(false);
const showVideoPanel = ref(false);
const showVideoQueue = ref(false);

/** Collect current image paths for AI analysis. */
function currentImagePaths(): string[] {
  if (picker.multiPickMode) {
    return picker.multiPickSlots.filter(Boolean).map((s) => s!.localPath).filter(Boolean) as string[];
  }
  return picker.currentImage?.localPath ? [picker.currentImage.localPath] : [];
}


onMounted(async () => {
  if (!imageStore.folders.length) await imageStore.loadFolders();
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

    <FilterBar v-model:filters="picker.filters" :sources="sources.sources" show-target-rules />

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
      <div v-if="showAiPanel" class="shrink-0 rounded-xl border border-accent/30 bg-panel p-4">
        <div class="mb-2 flex items-center justify-between">
          <p class="text-sm font-semibold text-white">AI Post Generator</p>
          <button class="button h-6 w-6 p-0 text-xs" @click="showAiPanel = false; ai.clearGeneratedPost()"><X class="h-3 w-3" /></button>
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
      <ImagePreview :image="picker.currentImage" />

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

        <!-- Global exclude -->
        <button
          class="button h-7 w-full gap-1.5 px-2 text-xs border-amber-800/50 bg-amber-900/20 text-amber-400 hover:border-amber-600 hover:bg-amber-900/40"
          :disabled="!picker.currentImage"
          title="Permanently exclude from ALL networks"
          @click="picker.excludeGlobally"
        >
          <Ban class="h-3.5 w-3.5" />Exclude globally
        </button>

        <!-- Cooldown indicator -->
        <p v-if="picker.cooldownCount > 0" class="text-[11px] text-slate-500">
          {{ picker.cooldownCount }} image{{ picker.cooldownCount === 1 ? '' : 's' }} on cooldown
        </p>

        <button class="button-primary h-8 rounded-md text-sm" :disabled="!picker.currentImage || !targets.activeTargetId" @click="picker.markPosted">
          <Check class="h-4 w-4" />Mark {{ activeTargetName }}
        </button>

        <!-- Send to Extension — split-button with send-mode dropdown -->
        <div class="border-t border-line pt-3">
          <div class="relative">
            <div class="flex">
              <!-- Main action -->
              <button
                class="button flex flex-1 items-center justify-center gap-2 rounded-r-none py-2 text-sm font-medium"
                :class="sendDone && sendMode === 'images_only' ? 'border-mint/60 bg-mint/10 text-mint' : (ai.generatedPost ? 'border-accent/50 bg-accent/5' : '')"
                :disabled="!picker.currentImage || !targets.activeTarget || !EXTENSION_TYPES.has(targets.activeTarget.type)"
                @click="sendToExtension"
              >
                <Check v-if="sendDone" class="h-4 w-4" />
                <Send v-else class="h-4 w-4" />
                {{ sendDone && sendMode === 'images_only' ? 'Text copied!' : sendDone ? 'Queued!' : sendModeLabel }}
              </button>
              <!-- Dropdown toggle -->
              <button
                class="button flex items-center rounded-l-none border-l border-white/20 px-2.5 py-2"
                :disabled="!picker.currentImage || !targets.activeTarget || !EXTENSION_TYPES.has(targets.activeTarget.type)"
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
          <button v-else class="mt-2 button w-full gap-1 text-xs" :disabled="!picker.currentImage" @click="openPickerAssignPanel">
            → Add to Queue Slot
          </button>
        </div>

        <!-- ── AI Post Generator ─────────────────────────────────────── -->
        <div class="border-t border-line pt-3">
          <button
            class="button w-full gap-2"
            :class="showAiPanel ? 'border-accent bg-accent/10 text-accent' : ''"
            :disabled="!picker.currentImage"
            title="Generate AI post text for the selected network"
            @click="showAiPanel = !showAiPanel; if (showAiPanel) showVideoPanel = false"
          >
            <Sparkles class="h-4 w-4" />
            AI Post Generator
          </button>

          <div v-if="showAiPanel" class="mt-3">
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
              :network-name="activeTargetName"
              :disabled="!picker.currentImage"
              @mark="picker.markPosted"
            />
            <!-- Bottom send shortcut — avoids scrolling up after generating -->
            <button
              v-if="ai.generatedPost"
              class="mt-2 button w-full gap-1.5 text-xs"
              :class="sendDone ? 'border-mint/60 bg-mint/10 text-mint' : (EXTENSION_TYPES.has(targets.activeTarget?.type as any) ? 'border-accent/40' : '')"
              :disabled="!picker.currentImage || !targets.activeTarget || !EXTENSION_TYPES.has(targets.activeTarget.type)"
              @click="sendToExtension"
            >
              <Check v-if="sendDone" class="h-3 w-3" />
              <Send v-else class="h-3 w-3" />
              {{ sendDone ? 'Queued!' : 'Send to Plugin' }}
            </button>
          </div>
        </div>

        <!-- ── Video Prompt Generator ────────────────────────────────── -->
        <div class="border-t border-line pt-3 space-y-2">
          <button
            class="button w-full gap-2"
            :class="showVideoPanel ? 'border-violet-400/60 bg-violet-400/10 text-violet-300' : ''"
            :disabled="!picker.currentImage"
            title="Generate a video prompt from the current image"
            @click="showVideoPanel = !showVideoPanel; if (showVideoPanel) showAiPanel = false"
          >
            <Clapperboard class="h-4 w-4" />
            Video Prompt
          </button>

          <button
            class="button w-full gap-2"
            :class="showVideoQueue ? 'border-violet-400/60 bg-violet-400/10 text-violet-300' : ''"
            title="View Wavespeed video generation jobs"
            @click="showVideoQueue = true"
          >
            <Clapperboard class="h-4 w-4" />
            Video Queue
          </button>

          <div v-if="showVideoPanel" class="mt-1">
            <VideoPromptPanel
              :image-paths="currentImagePaths()"
              :disabled="!picker.currentImage"
              @open-queue="showVideoPanel = false; showVideoQueue = true"
            />
          </div>
        </div>

        <div v-if="picker.error" class="rounded-md border border-gold/40 bg-gold/10 p-3 text-sm text-gold">
          {{ picker.error }}
        </div>
      </aside>
    </div><!-- end single-mode flex row -->
    </div><!-- end outer container -->

  <!-- ── Video Queue Modal ─────────────────────────────────────────────────── -->
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
        v-if="showVideoQueue"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
        @click.self="showVideoQueue = false"
      >
        <div class="relative mx-4 flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-line bg-panelSoft shadow-2xl">
          <div class="flex shrink-0 items-center justify-between border-b border-line px-5 py-3">
            <div class="flex items-center gap-2">
              <Clapperboard class="h-4 w-4 text-violet-300" />
              <p class="text-sm font-semibold text-white">Video Queue</p>
            </div>
            <button
              class="button h-7 w-7 p-0 hover:border-rose/60 hover:text-rose"
              @click="showVideoQueue = false"
            ><X class="h-3.5 w-3.5" /></button>
          </div>
          <div class="overflow-y-auto px-5 py-4">
            <VideoQueuePanel />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
