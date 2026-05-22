<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { Check, Clipboard, Copy, FolderOpen, Layers, SkipForward, Shuffle, Sparkles, X } from "lucide-vue-next";
import { convertFileSrc } from "@/electron-shims/core";
import FilterBar from "@/components/FilterBar.vue";
import ImagePreview from "@/components/ImagePreview.vue";
import PlatformIcon from "@/components/PlatformIcon.vue";
import { useAiStore } from "@/stores/aiStore";
import { useImageStore } from "@/stores/imageStore";
import { usePickerStore } from "@/stores/pickerStore";
import { useSourceStore } from "@/stores/sourceStore";
import { useTargetStore } from "@/stores/targetStore";
import { useQueueStore } from "@/stores/queueStore";
import { listSlots } from "@/repositories/queueRepository";
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

async function sendToExtension() {
  if (!picker.currentImage || !targets.activeTarget) return;
  const targetType = targets.activeTarget.type;
  queueMsg.value = "";
  queueErr.value = "";
  try {
    // Always push the image queue.
    await window.desktop.bridge.setQueue(targetType, [picker.currentImage.id]);
    // Also push AI post content if it was generated.
    if (ai.generatedPost) {
      await window.desktop.bridge.setPostContent(targetType, {
        title:       ai.generatedPost.title       ?? "",
        description: ai.generatedPost.description ?? "",
        tags:        [...(ai.generatedPost.tags   ?? [])],
      });
    }
    const extra = ai.generatedPost ? " + AI text" : "";
    queueMsg.value = `✓ Queued for ${targetType}${extra}. Open the Chrome Extension to inject.`;
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

watch(assignQueueId, async (id) => {
  assignSlotId.value = "";
  assignSlots.value = id ? await listSlots(id) : [];
  if (assignSlots.value.length) assignSlotId.value = assignSlots.value[0].id;
});

async function openPickerAssignPanel() {
  if (!queueStore.queues.length) await queueStore.load();
  assignQueueId.value = queueStore.queues[0]?.id ?? "";
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
}

// ── Multi-pick: send all slots to Extension + optional AI text ───────────
async function sendMultiPickToExtension(targetType: string) {
  const ids = picker.multiPickSlots.filter(Boolean).map((s) => s!.id);
  if (!ids.length) return;
  await window.desktop.bridge.setQueue(targetType, ids);
  if (ai.generatedPost) {
    await window.desktop.bridge.setPostContent(targetType, {
      title:       ai.generatedPost.title       ?? "",
      description: ai.generatedPost.description ?? "",
      tags:        [...(ai.generatedPost.tags   ?? [])],
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

// ── AI panel ──────────────────────────────────────────────────────────────────
const showAiPanel = ref(false);

/** Collect current image paths for AI analysis. */
function currentImagePaths(): string[] {
  if (picker.multiPickMode) {
    return picker.multiPickSlots.filter(Boolean).map((s) => s!.localPath).filter(Boolean) as string[];
  }
  return picker.currentImage?.localPath ? [picker.currentImage.localPath] : [];
}

async function generateAiPost() {
  const paths = currentImagePaths();
  if (!paths.length) return;
  const network = targets.activeTarget?.type ?? "x";
  // Always send only the first image — multiple base64 images cause payload errors.
  await ai.generatePost([paths[0]], network);
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
        <button
          v-if="!picker.multiPickMode"
          class="button-primary rounded-md"
          :disabled="picker.loading || !picker.canPick"
          @click="picker.pickRandom"
        >
          <Shuffle class="h-4 w-4" />Pick random
        </button>
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
      <div v-if="showAiPanel" class="shrink-0 space-y-2 rounded-xl border border-accent/30 bg-panel p-4">
        <div class="flex items-center justify-between">
          <p class="text-sm font-semibold text-white">AI Post Generator</p>
          <button class="button h-6 w-6 p-0 text-xs" @click="showAiPanel = false; ai.clearGeneratedPost()"><X class="h-3 w-3" /></button>
        </div>
        <button
          class="button-primary w-full rounded-md"
          :disabled="ai.generating"
          @click="generateAiPost"
        >
          <Sparkles class="h-4 w-4" />
          {{ ai.generating ? 'Generating…' : `Generate for ${activeTargetName || 'selected network'}` }}
        </button>
        <div v-if="ai.generateError" class="rounded-md border border-rose/40 bg-rose/10 p-2 text-xs text-rose">{{ ai.generateError }}</div>
        <div v-if="ai.generatedPost" class="space-y-2 rounded-xl border border-line bg-panelSoft p-3 text-xs">
          <div v-if="ai.generatedPost.title"><p class="mb-1 font-semibold text-slate-400">Title</p><p class="text-white">{{ ai.generatedPost.title }}</p></div>
          <div><p class="mb-1 font-semibold text-slate-400">Description</p><p class="whitespace-pre-wrap text-white">{{ ai.generatedPost.description }}</p></div>
          <div v-if="ai.generatedPost.tags?.length"><p class="mb-1 font-semibold text-slate-400">Tags</p><p class="text-slate-300">{{ ai.generatedPost.tags.join(' ') }}</p></div>
          <!-- Hint: "Send + AI" button above includes AI text automatically. -->
          <div class="flex items-center justify-between pt-1">
            <p class="text-[10px] text-slate-500">↑ Use "Send + AI" to queue with text.</p>
            <button class="button h-6 px-2 text-xs" @click="ai.clearGeneratedPost"><X class="h-3 w-3" />Discard</button>
          </div>
        </div>
      </div>
    </template>

    <!-- ══ SINGLE-PICK MODE (original) ═════════════════════════════════ -->
    <div v-else class="flex min-h-0 flex-1 gap-4">
      <ImagePreview :image="picker.currentImage" />

      <aside class="surface flex w-96 shrink-0 flex-col gap-4 overflow-y-auto rounded-lg p-4">
        <div>
          <h2 class="text-base font-semibold text-white">Use image</h2>
          <p class="mt-1 text-sm text-slate-400">Drag from Finder, copy the image, or reveal the file. Then mark the network.</p>
        </div>

        <div class="grid grid-cols-2 gap-2">
          <button class="button" :disabled="!picker.currentImage" @click="picker.openCurrentImage">
            <FolderOpen class="h-4 w-4" />
            Reveal
          </button>
          <button class="button" :disabled="!picker.currentImage" @click="picker.copyImage">
            <Clipboard class="h-4 w-4" />
            Image
          </button>
          <button class="button" :disabled="!picker.currentImage" @click="picker.copyPath">
            <Copy class="h-4 w-4" />
            Path
          </button>
          <button class="button" :disabled="!picker.currentImage || !targets.activeTargetId" @click="picker.markSkipped">
            <SkipForward class="h-4 w-4" />
            Skip {{ activeTargetName }}
          </button>
        </div>

        <button class="button-primary rounded-md" :disabled="!picker.currentImage || !targets.activeTargetId" @click="picker.markPosted">
          <Check class="h-4 w-4" />
          Mark {{ activeTargetName }}
        </button>

        <!-- Send to Extension — queues image + AI text (if generated) in one step -->
        <div class="border-t border-line pt-3">
          <button
            class="button w-full gap-2"
            :class="ai.generatedPost ? 'border-accent/50 bg-accent/5' : ''"
            :disabled="!picker.currentImage || !targets.activeTarget || !EXTENSION_TYPES.has(targets.activeTarget.type)"
            :title="targets.activeTarget && EXTENSION_TYPES.has(targets.activeTarget.type) ? `Queue image${ai.generatedPost ? ' + AI text' : ''} for ${activeTargetName}` : `${activeTargetName} has no extension adapter`"
            @click="sendToExtension"
          >
            <PlatformIcon v-if="targets.activeTarget" :type="targets.activeTarget.type" :size="14" />
            Send to Extension{{ ai.generatedPost ? ' + AI' : '' }}
          </button>
          <p v-if="queueMsg" class="mt-1 text-xs text-mint">{{ queueMsg }}</p>
          <p v-if="queueErr" class="mt-1 text-xs text-rose">{{ queueErr }}</p>

          <!-- Assign to Queue Slot -->
          <div v-if="showAssignPanel" class="mt-2 rounded-lg border border-line bg-panelSoft p-2 space-y-1.5">
            <p class="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Assign to Queue Slot</p>
            <select v-model="assignQueueId" aria-label="Queue" class="input h-7 w-full text-xs">
              <option v-if="!queueStore.queues.length" value="" disabled>No queues — create one first</option>
              <option v-for="q in queueStore.queues" :key="q.id" :value="q.id">{{ q.name }} ({{ q.targetName }})</option>
            </select>
            <select v-model="assignSlotId" aria-label="Slot" class="input h-7 w-full text-xs" :disabled="!assignSlots.length">
              <option v-if="!assignSlots.length" value="" disabled>No slots</option>
              <option v-for="s in assignSlots" :key="s.id" :value="s.id">Slot {{ s.position + 1 }}{{ s.posted ? ' ✓' : '' }}</option>
            </select>
            <div class="flex gap-1.5">
              <button class="button h-7 flex-1 text-xs" @click="showAssignPanel = false">Cancel</button>
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
            @click="showAiPanel = !showAiPanel"
          >
            <Sparkles class="h-4 w-4" />
            AI Post Generator
          </button>

          <div v-if="showAiPanel" class="mt-3 space-y-3">
            <button
              class="button-primary w-full rounded-md"
              :disabled="ai.generating || !picker.currentImage"
              @click="generateAiPost"
            >
              <Sparkles class="h-4 w-4" />
              {{ ai.generating ? 'Generating…' : `Generate for ${activeTargetName || 'selected network'}` }}
            </button>

            <div v-if="ai.generateError" class="rounded-md border border-rose/40 bg-rose/10 p-2 text-xs text-rose">
              {{ ai.generateError }}
            </div>

            <div v-if="ai.generatedPost" class="space-y-2 rounded-xl border border-line bg-panelSoft p-3 text-xs">
              <div v-if="ai.generatedPost.title">
                <p class="mb-1 font-semibold text-slate-400">Title</p>
                <p class="text-white">{{ ai.generatedPost.title }}</p>
              </div>
              <div>
                <p class="mb-1 font-semibold text-slate-400">Description</p>
                <p class="whitespace-pre-wrap text-white">{{ ai.generatedPost.description }}</p>
              </div>
              <div v-if="ai.generatedPost.tags?.length">
                <p class="mb-1 font-semibold text-slate-400">Tags</p>
                <p class="text-slate-300">{{ ai.generatedPost.tags.join(' ') }}</p>
              </div>
              <!-- Hint: the "Send to Extension" button above now includes the AI text automatically. -->
              <p class="pt-1 text-[10px] text-slate-500">↑ Click "Send to Extension + AI" to queue image and text together.</p>
              <div class="flex justify-end pt-0.5">
                <button class="button h-6 px-2 text-xs" title="Discard result" @click="ai.clearGeneratedPost">
                  <X class="h-3 w-3" />Discard
                </button>
              </div>
            </div>
          </div>
        </div>

        <div v-if="picker.error" class="rounded-md border border-gold/40 bg-gold/10 p-3 text-sm text-gold">
          {{ picker.error }}
        </div>
      </aside>
    </div><!-- end single-mode flex row -->
    </div><!-- end outer container -->
</template>
