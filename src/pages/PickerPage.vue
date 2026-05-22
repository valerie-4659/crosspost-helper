<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
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
import type { PostingTargetType } from "@/types/postingTarget";

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

// ── Single-mode queue ─────────────────────────────────────────────────────
const queueMsg = ref("");
const queueErr = ref("");

async function queueCurrentForExtension(targetType: string) {
  if (!picker.currentImage) return;
  queueMsg.value = "";
  queueErr.value = "";
  try {
    await window.desktop.bridge.setQueue(targetType, [picker.currentImage.id]);
    queueMsg.value = `✓ Queued for ${targetType}. Open the Chrome Extension to inject.`;
  } catch (err) {
    queueErr.value = err instanceof Error ? err.message : String(err);
  }
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

async function applyAiPost() {
  const network = targets.activeTarget?.type ?? "x";
  await ai.pushPostContentToExtension(network);
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
          <span class="text-xs text-slate-500">Queue:</span>
          <button
            v-for="target in extensionTargets"
            :key="target.id"
            class="button flex h-8 w-8 items-center justify-center p-0"
            :disabled="picker.multiPickSlots.every(s => !s)"
            :title="`Queue for ${target.name}`"
            @click="picker.queueMultiPickForExtension(target.type)"
          ><PlatformIcon :type="target.type" :size="15" /></button>
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
          <div class="flex gap-2 pt-1">
            <button class="button-primary h-7 flex-1 px-2 text-xs" :disabled="!extensionTargets.length" @click="applyAiPost"><Check class="h-3 w-3" />Push to Extension</button>
            <button class="button h-7 px-2 text-xs" @click="ai.clearGeneratedPost"><X class="h-3 w-3" /></button>
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

        <!-- Queue current image for active target -->
        <div class="border-t border-line pt-3">
          <button
            class="button w-full gap-2"
            :disabled="!picker.currentImage || !targets.activeTarget || !EXTENSION_TYPES.has(targets.activeTarget.type)"
            :title="targets.activeTarget && EXTENSION_TYPES.has(targets.activeTarget.type) ? `Queue for ${activeTargetName}` : `${activeTargetName} has no extension adapter`"
            @click="targets.activeTarget && queueCurrentForExtension(targets.activeTarget.type)"
          >
            <PlatformIcon v-if="targets.activeTarget" :type="targets.activeTarget.type" :size="14" />
            Queue for Extension
          </button>
          <p v-if="queueMsg" class="mt-1 text-xs text-mint">{{ queueMsg }}</p>
          <p v-if="queueErr" class="mt-1 text-xs text-rose">{{ queueErr }}</p>
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
              <div class="flex gap-2 pt-1">
                <button
                  class="button-primary h-7 flex-1 px-2 text-xs"
                  :disabled="!extensionTargets.length"
                  :title="extensionTargets.length ? 'Push to Chrome Extension bridge' : 'No extension targets configured'"
                  @click="applyAiPost"
                >
                  <Check class="h-3 w-3" />Push to Extension
                </button>
                <button class="button h-7 px-2 text-xs" title="Discard result" @click="ai.clearGeneratedPost">
                  <X class="h-3 w-3" />
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
