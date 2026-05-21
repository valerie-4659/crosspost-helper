<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { Check, Clipboard, Copy, FolderOpen, Layers, Send, SkipForward, Shuffle, X } from "lucide-vue-next";
import FilterBar from "@/components/FilterBar.vue";
import ImagePreview from "@/components/ImagePreview.vue";
import { useImageStore } from "@/stores/imageStore";
import { usePickerStore } from "@/stores/pickerStore";
import { useSourceStore } from "@/stores/sourceStore";
import { useTargetStore } from "@/stores/targetStore";
import type { PostingTargetType } from "@/types/postingTarget";

const picker = usePickerStore();
const sources = useSourceStore();
const targets = useTargetStore();
const imageStore = useImageStore();

const activeTargetName = computed(() => targets.activeTarget?.name ?? "target");

const EXTENSION_TYPES = new Set<PostingTargetType>(["x", "bluesky", "deviantart", "civitai"]);
const PLATFORM_LIMITS: Record<string, number> = { civitai: 20, x: 4, bluesky: 4, deviantart: 1 };

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
                :src="`localfile://${slot.localPath}`"
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
          <span class="text-xs text-slate-500">Queue for Extension:</span>
          <button
            v-for="target in extensionTargets"
            :key="target.id"
            class="button h-8 px-3 text-sm"
            :disabled="picker.multiPickSlots.every(s => !s)"
            @click="picker.queueMultiPickForExtension(target.type)"
          ><Send class="h-3.5 w-3.5" />{{ target.name }}</button>
        </template>
      </div>
    </template>

    <!-- ══ SINGLE-PICK MODE (original) ═════════════════════════════════ -->
    <div v-else class="flex min-h-0 flex-1 gap-4">
      <ImagePreview :image="picker.currentImage" />

      <aside class="surface flex w-96 shrink-0 flex-col gap-4 rounded-lg p-4">
        <div>
          <h2 class="text-base font-semibold text-white">Use image</h2>
          <p class="mt-1 text-sm text-slate-400">Drag from Finder, copy the image, or reveal the file. Then mark the network.</p>
        </div>

        <div v-if="picker.currentImage" class="flex flex-wrap gap-2">
          <button
            v-for="target in targets.targets"
            :key="target.id"
            class="rounded-md border px-2 py-1 text-xs transition"
            :class="{
              'border-mint/50 bg-mint/10 text-mint': picker.currentImage.postStates[target.id] === 'posted',
              'border-gold/50 bg-gold/10 text-gold': picker.currentImage.postStates[target.id] === 'planned',
              'border-rose/50 bg-rose/10 text-rose': picker.currentImage.postStates[target.id] === 'skipped',
              'border-line bg-panelSoft text-slate-400 hover:border-accent hover:text-accent': !picker.currentImage.postStates[target.id],
            }"
            :disabled="picker.currentImage.postStates[target.id] === 'posted'"
            @click="picker.markTargetPosted(target.id)"
          >
            {{ picker.currentImage.postStates[target.id] === "posted" ? `${target.name}: posted` : `Mark ${target.name}` }}
          </button>
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

        <!-- Queue current image for Chrome Extension -->
        <div v-if="extensionTargets.length" class="border-t border-line pt-3">
          <p class="mb-2 text-xs text-slate-500">Queue for Chrome Extension</p>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="target in extensionTargets"
              :key="target.id"
              class="button shrink-0 text-sm"
              :disabled="!picker.currentImage"
              @click="queueCurrentForExtension(target.type)"
            >
              <Send class="h-3.5 w-3.5" />{{ target.name }}
            </button>
          </div>
          <p v-if="queueMsg" class="mt-2 text-xs text-mint">{{ queueMsg }}</p>
          <p v-if="queueErr" class="mt-2 text-xs text-rose">{{ queueErr }}</p>
        </div>

        <div v-if="picker.error" class="rounded-md border border-gold/40 bg-gold/10 p-3 text-sm text-gold">
          {{ picker.error }}
        </div>
      </aside>
    </div><!-- end single-mode flex row -->
    </div><!-- end outer container -->
</template>
