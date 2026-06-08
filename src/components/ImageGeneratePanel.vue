<script setup lang="ts">
import { inject, onMounted, ref } from "vue";
import type { AppPage } from "@/components/SidebarNavigation.vue";
import { Check, Copy, FolderOpen, Image, X } from "lucide-vue-next";

const props = defineProps<{
  imagePaths: string[];
  disabled?: boolean;
}>();

const IMAGE_MODELS = [
  { value: "flux_2_klein",    label: "Flux 2 Klein",   size: "1024*1024" },
  { value: "flux_2_turbo",    label: "Flux 2 Turbo",   size: "1024*1024" },
  { value: "flux_2_dev",      label: "Flux 2 Dev",     size: "1024*1024" },
  { value: "qwen_image_edit", label: "Qwen Image",     size: "1024*1024" },
  { value: "nano_banana",     label: "Nano Banana",    size: "1024*1024" },
  { value: "gpt_image_2",     label: "GPT Image 2",    size: "1024*1024" },
  { value: "wan_2_7_img",     label: "WAN 2.7 Edit",   size: "1024*1024" },
  { value: "z_image_turbo",   label: "Z Image Turbo",  size: "1024*1024" },
];

const SIZE_OPTIONS = ["512*512", "768*768", "1024*1024", "1024*1536", "1536*1024"];

const selectedModel = ref("flux_2_klein");
const selectedSize  = ref("1024*1024");
const instructions  = ref("");
const generating    = ref(false);
const generateError = ref("");
const generatedPrompt = ref("");
const copied        = ref(false);

// Wavespeed submit state
const wavespeedAvailable = ref(false);
const wsSubmitting = ref(false);
const wsSubmitted  = ref(false);
const wsError      = ref("");

const setPage = inject<(page: AppPage) => void>("setPage");

onMounted(async () => {
  const rows = await window.desktop.db.select<Array<{ value: string }>>(
    "SELECT value FROM ai_config WHERE key = 'wavespeed_api_key'",
  );
  wavespeedAvailable.value = Boolean(rows[0]?.value);
});

async function generate() {
  if (!props.imagePaths.length) return;
  generating.value    = true;
  generateError.value = "";
  generatedPrompt.value = "";
  resetWavespeed();
  try {
    // Re-use the video prompt generator — it analyses the image and produces a detailed description
    // We explicitly instruct it for image recreation (no video motion, focus on composition/style)
    const extra = `Image recreation prompt for ${IMAGE_MODELS.find(m => m.value === selectedModel.value)?.label ?? selectedModel.value} model. Focus on composition, lighting, style, colors, and subject detail. No video motion. ${instructions.value.trim()}`;
    generatedPrompt.value = await window.desktop.ai.generateVideoPrompt(
      props.imagePaths,
      "wan_2_5", // neutral safe model — gives descriptive prompt without NSFW bias
      extra,
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
  const p = props.imagePaths[0];
  if (p && window.desktop?.opener?.revealItemInDir) {
    window.desktop.opener.revealItemInDir(p);
  }
}

async function submitToWavespeed() {
  const imagePath = props.imagePaths[0];
  if (!imagePath || !generatedPrompt.value) return;
  wsSubmitting.value = true;
  wsSubmitted.value  = false;
  wsError.value      = "";
  try {
    await window.desktop.wavespeed.submitImage({
      imagePath,
      prompt:     generatedPrompt.value,
      imageModel: selectedModel.value,
      size:       selectedSize.value,
    });
    wsSubmitted.value = true;
  } catch (err) {
    wsError.value = err instanceof Error ? err.message : String(err);
  } finally {
    wsSubmitting.value = false;
  }
}

function resetWavespeed() {
  wsSubmitted.value  = false;
  wsError.value      = "";
  wsSubmitting.value = false;
}
</script>

<template>
  <div class="space-y-3">
    <!-- Model selector -->
    <div>
      <p class="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">Image Model</p>
      <div class="flex flex-wrap gap-1.5">
        <button
          v-for="m in IMAGE_MODELS"
          :key="m.value"
          class="rounded-lg border px-2.5 py-1 text-[11px] font-medium transition"
          :class="selectedModel === m.value
            ? 'border-sky-400/60 bg-sky-400/15 text-sky-300'
            : 'border-line bg-panel text-slate-400 hover:border-slate-500 hover:text-slate-200'"
          @click="selectedModel = m.value"
        >{{ m.label }}</button>
      </div>
    </div>

    <!-- Output size -->
    <div class="flex gap-2 items-center">
      <label class="text-[11px] text-slate-500 shrink-0">Output size</label>
      <select v-model="selectedSize" class="field text-xs py-1 flex-1">
        <option v-for="s in SIZE_OPTIONS" :key="s" :value="s">{{ s }}</option>
      </select>
    </div>

    <!-- Instructions -->
    <div>
      <p class="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">
        Instructions <span class="normal-case text-slate-600">(optional)</span>
      </p>
      <textarea
        v-model="instructions"
        rows="2"
        class="w-full resize-none rounded-lg border border-line bg-panelSoft px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:border-sky-400/60 focus:outline-none transition"
        placeholder="e.g. Make the lighting more dramatic. Keep the character style."
      />
    </div>

    <!-- Generate + Reveal -->
    <div class="flex gap-2">
      <button
        class="button-primary flex-1 rounded-lg py-2"
        :disabled="generating || disabled || !imagePaths.length"
        @click="generate"
      >
        <Image class="h-4 w-4" :class="generating ? 'animate-pulse' : ''" />
        {{ generating ? 'Analysing…' : 'Analyse & Generate Prompt' }}
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

    <div v-if="generateError" class="rounded-lg border border-rose/40 bg-rose/10 px-3 py-2 text-xs text-rose">
      {{ generateError }}
    </div>

    <!-- Result -->
    <div v-if="generatedPrompt" class="space-y-2 rounded-xl border border-sky-500/20 bg-panel p-4">
      <p class="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        Recreation prompt <span class="normal-case font-normal text-slate-600">— edit before sending</span>
      </p>
      <textarea
        v-model="generatedPrompt"
        rows="7"
        class="w-full resize-y rounded-md border border-line bg-panelSoft px-2.5 py-2 text-xs leading-relaxed text-slate-200 focus:border-sky-400/60 focus:outline-none transition"
      />
      <div class="flex items-center gap-2 border-t border-line pt-2.5">
        <button
          class="button h-7 flex-1 gap-1.5 px-2.5 text-xs"
          :class="copied ? 'border-mint/60 bg-mint/10 text-mint' : ''"
          @click="copyPrompt"
        >
          <Check v-if="copied" class="h-3 w-3" /><Copy v-else class="h-3 w-3" />
          {{ copied ? 'Copied!' : 'Copy' }}
        </button>
        <button class="button h-7 gap-1 px-2.5 text-xs ml-auto" @click="generatedPrompt = ''; generateError = ''; resetWavespeed()">
          <X class="h-3 w-3" />Discard
        </button>
      </div>
    </div>

    <!-- ── Send to Wavespeed ─────────────────────────────────────────────── -->
    <div
      v-if="generatedPrompt && wavespeedAvailable"
      class="space-y-2.5 rounded-xl border border-sky-500/20 bg-panel p-4"
    >
      <p class="text-[10px] font-semibold uppercase tracking-wide text-sky-400/70">
        Recreate via Wavespeed
        <span class="normal-case font-normal text-slate-600"> — start an image generation job</span>
      </p>
      <button
        v-if="!wsSubmitted && !wsSubmitting"
        class="w-full rounded-lg bg-sky-600 hover:bg-sky-500 active:bg-sky-700 py-2 text-xs font-semibold text-white transition flex items-center justify-center gap-2"
        :disabled="!props.imagePaths[0]"
        @click="submitToWavespeed"
      >
        <Image class="h-3.5 w-3.5" />Submit Recreation Job
      </button>
      <button
        v-else-if="wsSubmitting"
        class="w-full rounded-lg bg-sky-600/50 py-2 text-xs font-semibold text-white/60 flex items-center justify-center gap-2"
        disabled
      >
        <Image class="h-3.5 w-3.5 animate-pulse" />Uploading &amp; submitting…
      </button>
      <div v-if="wsSubmitted" class="space-y-2">
        <div class="flex items-center gap-2 rounded-lg border border-mint/30 bg-mint/10 px-3 py-2">
          <span class="h-2 w-2 rounded-full bg-mint" />
          <span class="text-xs text-mint font-medium">Job queued — generating in background</span>
        </div>
        <div class="flex gap-2">
          <button
            class="button h-7 flex-1 gap-1.5 px-2 text-xs border-sky-500/40 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20"
            @click="setPage?.('image-queue')"
          >
            <Image class="h-3 w-3" /> Open Image Queue
          </button>
          <button class="button h-7 gap-1 px-2.5 text-xs" @click="resetWavespeed">
            <X class="h-3 w-3" />New
          </button>
        </div>
      </div>
      <p v-if="wsError" class="text-xs text-rose">{{ wsError }}</p>
    </div>

    <p
      v-else-if="generatedPrompt && !wavespeedAvailable"
      class="text-center text-[11px] text-slate-600"
    >
      Add a Wavespeed API key in <strong class="text-slate-500">Settings → Wavespeed AI</strong> to recreate directly.
    </p>
  </div>
</template>
