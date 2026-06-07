<script setup lang="ts">
import { ref } from "vue";
import { Check, Clapperboard, Copy, FolderOpen, Sparkles, X } from "lucide-vue-next";

const props = defineProps<{
  imagePaths: string[];
  disabled?: boolean;
}>();

const VIDEO_MODELS = [
  { value: "wan_2_2_explicit", label: "WAN 2.2 Explicit", nsfw: true  },
  { value: "wan_2_5",          label: "WAN 2.5",          nsfw: false },
  { value: "wan_2_7",          label: "WAN 2.7",          nsfw: false },
  { value: "grok_imagine",     label: "GROK Imagine",     nsfw: false },
  { value: "seedance",         label: "Seedance",         nsfw: false },
];

const selectedModel  = ref("wan_2_5");
const instructions   = ref("");
const generating     = ref(false);
const generateError  = ref("");
const generatedPrompt = ref("");
const copied         = ref(false);

async function generate() {
  if (!props.imagePaths.length) return;
  generating.value = true;
  generateError.value = "";
  generatedPrompt.value = "";
  try {
    generatedPrompt.value = await window.desktop.ai.generateVideoPrompt(
      props.imagePaths,
      selectedModel.value,
      instructions.value.trim() || undefined,
    );
  } catch (err) {
    generateError.value = err instanceof Error ? err.message : String(err);
  } finally {
    generating.value = false;
  }
}

async function copyPrompt() {
  if (!generatedPrompt.value) return;
  await navigator.clipboard.writeText(generatedPrompt.value).catch(() => {});
  copied.value = true;
  setTimeout(() => (copied.value = false), 2000);
}

function revealSourceImage() {
  const path = props.imagePaths[0];
  if (path && window.desktop?.opener?.revealItemInDir) {
    window.desktop.opener.revealItemInDir(path);
  }
}
</script>

<template>
  <div class="space-y-3">
    <!-- Model selector -->
    <div>
      <p class="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">Target model</p>
      <div class="flex flex-wrap gap-1.5">
        <button
          v-for="m in VIDEO_MODELS"
          :key="m.value"
          class="rounded-lg border px-2.5 py-1 text-[11px] font-medium transition"
          :class="[
            selectedModel === m.value
              ? m.nsfw
                ? 'border-rose/50 bg-rose/15 text-rose'
                : 'border-accent bg-accent/15 text-accent'
              : 'border-line bg-panel text-slate-400 hover:border-slate-500 hover:text-slate-200',
          ]"
          @click="selectedModel = m.value"
        >
          {{ m.label }}
          <span v-if="m.nsfw" class="ml-1 text-[10px] opacity-70">🔞</span>
        </button>
      </div>
      <!-- NSFW warning -->
      <p v-if="VIDEO_MODELS.find(m => m.value === selectedModel)?.nsfw" class="mt-1 text-[11px] text-rose/70">
        Explicit content allowed — prompt will include uncensored descriptions.
      </p>
      <p v-else class="mt-1 text-[11px] text-slate-600">
        Content-safe — explicit terms replaced with tasteful alternatives.
      </p>
    </div>

    <!-- Instructions (optional) -->
    <div>
      <p class="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">Instructions <span class="normal-case text-slate-600">(optional — character names, scene details)</span></p>
      <textarea
        v-model="instructions"
        rows="2"
        class="w-full resize-none rounded-lg border border-line bg-panelSoft px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:border-accent/60 focus:outline-none focus:ring-1 focus:ring-accent/30 transition"
        placeholder="e.g. The woman is Valerie. Setting is a moonlit rooftop."
      />
    </div>

    <!-- Generate + Reveal row -->
    <div class="flex gap-2">
      <button
        class="button-primary flex-1 rounded-lg py-2"
        :disabled="generating || disabled || !imagePaths.length"
        @click="generate"
      >
        <Clapperboard class="h-4 w-4" :class="generating ? 'animate-pulse' : ''" />
        {{ generating ? 'Generating…' : 'Generate Video Prompt' }}
      </button>
      <button
        v-if="imagePaths.length"
        class="button h-10 w-10 shrink-0 p-0"
        title="Reveal source image in Finder / Explorer"
        @click="revealSourceImage"
      >
        <FolderOpen class="h-4 w-4" />
      </button>
    </div>

    <!-- Error -->
    <div v-if="generateError" class="rounded-lg border border-rose/40 bg-rose/10 px-3 py-2 text-xs text-rose">
      {{ generateError }}
    </div>

    <!-- Result -->
    <div v-if="generatedPrompt" class="space-y-2 rounded-xl border border-accent/20 bg-panel p-4">
      <p class="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        Generated prompt <span class="normal-case font-normal text-slate-600">— edit before copying</span>
      </p>
      <textarea
        v-model="generatedPrompt"
        rows="8"
        class="w-full resize-y rounded-md border border-line bg-panelSoft px-2.5 py-2 text-xs leading-relaxed text-slate-200 focus:border-accent/60 focus:outline-none focus:ring-1 focus:ring-accent/30 transition"
      />
      <div class="flex items-center gap-2 border-t border-line pt-2.5">
        <button
          class="button h-7 flex-1 gap-1.5 px-2.5 text-xs"
          :class="copied ? 'border-mint/60 bg-mint/10 text-mint' : ''"
          @click="copyPrompt"
        >
          <Check v-if="copied" class="h-3 w-3" /><Copy v-else class="h-3 w-3" />
          {{ copied ? 'Copied!' : 'Copy prompt' }}
        </button>
        <button class="button h-7 gap-1 px-2.5 text-xs ml-auto" @click="generatedPrompt = ''; generateError = ''">
          <X class="h-3 w-3" />Discard
        </button>
      </div>
    </div>
  </div>
</template>
