<script setup lang="ts">
import { computed } from "vue";
import { Check, Clipboard, Copy, FolderOpen, SkipForward, Shuffle } from "lucide-vue-next";
import FilterBar from "@/components/FilterBar.vue";
import ImagePreview from "@/components/ImagePreview.vue";
import { usePickerStore } from "@/stores/pickerStore";
import { useSourceStore } from "@/stores/sourceStore";
import { useTargetStore } from "@/stores/targetStore";

const picker = usePickerStore();
const sources = useSourceStore();
const targets = useTargetStore();

const activeTargetName = computed(() => targets.activeTarget?.name ?? "target");
</script>

<template>
  <div class="flex h-full flex-col gap-4 p-5">
    <header class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-semibold text-white">Posting Picker</h1>
        <p class="mt-1 text-sm text-slate-400">Use this when you want a random suggestion for the selected target.</p>
      </div>
      <div class="flex items-center gap-3">
        <select v-model="targets.activeTargetId" class="field min-w-44">
          <option v-for="target in targets.enabledTargets" :key="target.id" :value="target.id">{{ target.name }}</option>
        </select>
        <button class="button-primary rounded-md" :disabled="picker.loading || !picker.canPick" @click="picker.pickRandom">
          <Shuffle class="h-4 w-4" />
          Pick random
        </button>
      </div>
    </header>

    <FilterBar v-model:filters="picker.filters" :sources="sources.sources" show-target-rules />

    <div class="flex min-h-0 flex-1 gap-4">
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

        <div v-if="picker.error" class="rounded-md border border-gold/40 bg-gold/10 p-3 text-sm text-gold">
          {{ picker.error }}
        </div>
      </aside>
    </div>
  </div>
</template>
