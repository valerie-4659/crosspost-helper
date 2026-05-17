<script setup lang="ts">
import { computed } from "vue";
import { Clipboard, Copy, ExternalLink, SkipForward, Shuffle, Upload } from "lucide-vue-next";
import FilterBar from "@/components/FilterBar.vue";
import ImagePreview from "@/components/ImagePreview.vue";
import StatusBadge from "@/components/StatusBadge.vue";
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
        <p class="mt-1 text-sm text-slate-400">Randomly pick an image that has not been posted to the selected target.</p>
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
          <h2 class="text-base font-semibold text-white">Manual posting</h2>
          <p class="mt-1 text-sm text-slate-400">Post to {{ activeTargetName }}, paste the URL here, then mark it as posted.</p>
        </div>

        <div v-if="picker.currentImage" class="flex flex-wrap gap-2">
          <StatusBadge
            v-for="target in targets.targets"
            :key="target.id"
            :label="target.name"
            :status="picker.currentImage.postStates[target.id]"
          />
        </div>

        <input v-model="picker.postUrl" class="field" placeholder="Post URL after publishing" />
        <textarea v-model="picker.caption" class="field min-h-28 resize-none" placeholder="Caption placeholder" />

        <div class="grid grid-cols-2 gap-2">
          <button class="button" :disabled="!picker.currentImage" @click="picker.openCurrentImage">
            <ExternalLink class="h-4 w-4" />
            Open
          </button>
          <button class="button" :disabled="!picker.currentImage" @click="picker.copyFilename">
            <Copy class="h-4 w-4" />
            Filename
          </button>
          <button class="button" :disabled="!picker.currentImage" @click="picker.copyCaptionPlaceholder">
            <Clipboard class="h-4 w-4" />
            Caption
          </button>
          <button class="button" :disabled="!picker.currentImage" @click="picker.markSkipped">
            <SkipForward class="h-4 w-4" />
            Skip
          </button>
        </div>

        <button class="button-primary rounded-md" :disabled="!picker.currentImage || !targets.activeTargetId" @click="picker.markPosted">
          <Upload class="h-4 w-4" />
          Mark posted to {{ activeTargetName }}
        </button>

        <div v-if="picker.error" class="rounded-md border border-gold/40 bg-gold/10 p-3 text-sm text-gold">
          {{ picker.error }}
        </div>
      </aside>
    </div>
  </div>
</template>
