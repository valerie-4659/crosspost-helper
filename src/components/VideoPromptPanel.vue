<script setup lang="ts">
import { computed, inject, onMounted, ref, watch } from "vue";
import type { AppPage } from "@/components/SidebarNavigation.vue";
import { Check, Clapperboard, Copy, FolderOpen, X } from "lucide-vue-next";
import { VIDEO_MODELS, type VideoModelValue } from "@/composables/useVideoModels";

const props = defineProps<{
  imagePaths: string[];
  disabled?: boolean;
}>();

const selectedModel    = ref<VideoModelValue>("wan_2_2_spicy");
const instructions     = ref("");
const includeCameraMoves = ref(true);
const generating       = ref(false);
const generateError    = ref("");
const generatedPrompt  = ref("");
const copied           = ref(false);

const modelCfg = computed(() => VIDEO_MODELS.find((m) => m.value === selectedModel.value) ?? VIDEO_MODELS[0]);

// ── Wavespeed submit state ─────────────────────────────────────────────────
const wavespeedAvailable  = ref(false);
const wsResolution        = ref("720p");
const wsDuration          = ref(5);
const wsEndImagePath      = ref("");
const wsGenerateAudio     = ref(true);
const wsMovementAmplitude = ref<"auto"|"small"|"medium"|"large">("auto");
const wsSubmitting        = ref(false);
const wsSubmitted         = ref(false);
const wsError             = ref("");

// Reset resolution/duration to valid defaults when model changes
watch(selectedModel, () => {
  const m = modelCfg.value;
  wsResolution.value    = m.resolutions.length ? (m.resolutions.includes("720p") ? "720p" : m.resolutions[0] as string) : "720p";
  wsDuration.value      = m.durations[Math.min(3, m.durations.length - 1)];
  wsEndImagePath.value  = "";
  wsMovementAmplitude.value = "auto";
  resetWavespeed();
});

onMounted(async () => {
  const rows = await window.desktop.db.select<Array<{ value: string }>>(
    "SELECT value FROM ai_config WHERE key = 'wavespeed_api_key'",
  );
  wavespeedAvailable.value = Boolean(rows[0]?.value);
});

async function generate() {
  if (!props.imagePaths.length) return;
  generating.value = true;
  generateError.value = "";
  generatedPrompt.value = "";
  resetWavespeed();
  try {
    generatedPrompt.value = await window.desktop.ai.generateVideoPrompt(
      props.imagePaths,
      selectedModel.value,
      instructions.value.trim() || undefined,
      includeCameraMoves.value,
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

async function pickEndImage() {
  const result = await window.desktop.dialog.open({
    filters: [{ name: "Images", extensions: ["jpg", "jpeg", "png", "webp"] }],
  });
  if (result) wsEndImagePath.value = result;
}

const setPage = inject<(page: AppPage) => void>("setPage");

async function submitToWavespeed() {
  const imagePath = props.imagePaths[0];
  if (!imagePath || !generatedPrompt.value) return;
  wsSubmitting.value = true;
  wsSubmitted.value  = false;
  wsError.value      = "";
  try {
    await window.desktop.wavespeed.submit({
      imagePath,
      prompt:             generatedPrompt.value,
      videoModel:         selectedModel.value,
      resolution:         wsResolution.value,
      duration:           wsDuration.value,
      endImagePath:       wsEndImagePath.value || undefined,
      generateAudio:      wsGenerateAudio.value,
      movementAmplitude:  wsMovementAmplitude.value,
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
          @click="selectedModel = m.value as VideoModelValue"
        >
          {{ m.label }}
          <span v-if="m.nsfw" class="ml-1 text-[10px] opacity-70">🔞</span>
        </button>
      </div>
      <!-- Content policy note -->
      <p v-if="modelCfg.nsfw" class="mt-1 text-[11px] text-rose/70">
        Explicit content allowed — prompt will include uncensored descriptions.
      </p>
      <p v-else-if="modelCfg.strictChinese" class="mt-1 text-[11px] text-amber-500/70">
        Chinese-operated model — prompts are strictly family-safe, no suggestive language.
      </p>
      <p v-else class="mt-1 text-[11px] text-slate-600">
        Content-safe — explicit terms replaced with tasteful alternatives.
      </p>
    </div>

    <!-- Instructions (optional) -->
    <div>
      <p class="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">
        Instructions <span class="normal-case text-slate-600">(optional — character names, scene details)</span>
      </p>
      <textarea
        v-model="instructions"
        rows="2"
        class="w-full resize-none rounded-lg border border-line bg-panelSoft px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:border-accent/60 focus:outline-none focus:ring-1 focus:ring-accent/30 transition"
        placeholder="e.g. The woman is Valerie. Setting is a moonlit rooftop."
      />
    </div>

    <!-- Camera moves checkbox -->
    <label class="flex cursor-pointer items-center gap-2 select-none">
      <input type="checkbox" v-model="includeCameraMoves" aria-label="Include camera moves in prompt" class="h-3.5 w-3.5 accent-accent" />
      <span class="text-xs text-slate-300">Include camera moves in prompt</span>
      <span class="text-[10px] text-slate-600">(zoom, tracking, dolly, etc.)</span>
    </label>

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
        <button class="button h-7 gap-1 px-2.5 text-xs ml-auto" @click="generatedPrompt = ''; generateError = ''; resetWavespeed()">
          <X class="h-3 w-3" />Discard
        </button>
      </div>
    </div>

    <!-- ── Send to Wavespeed ─────────────────────────────────────────────── -->
    <div
      v-if="generatedPrompt && wavespeedAvailable"
      class="space-y-2.5 rounded-xl border border-violet-500/20 bg-panel p-4"
    >
      <p class="text-[10px] font-semibold uppercase tracking-wide text-violet-400/70">
        Send to Wavespeed
        <span class="normal-case font-normal text-slate-600"> — start a render job directly</span>
      </p>

      <!-- Resolution + Duration -->
      <div class="flex gap-2">
        <div v-if="modelCfg.resolutions.length" class="flex-1 flex flex-col gap-1">
          <label class="text-[11px] text-slate-500">Resolution</label>
          <select v-model="wsResolution" class="field text-xs py-1">
            <option v-for="r in modelCfg.resolutions" :key="r" :value="r">{{ r }}</option>
          </select>
        </div>
        <div class="flex-1 flex flex-col gap-1">
          <label class="text-[11px] text-slate-500">Duration</label>
          <select v-model="wsDuration" class="field text-xs py-1">
            <option v-for="d in modelCfg.durations" :key="d" :value="d">{{ d }}s</option>
          </select>
        </div>
      </div>

      <!-- End image (WAN 2.7, Kling 3.0) -->
      <div v-if="modelCfg.hasEndImage" class="flex flex-col gap-1">
        <label class="text-[11px] text-slate-500">End frame image <span class="text-slate-600">(optional)</span></label>
        <div class="flex gap-1.5 items-center">
          <input
            type="text"
            :value="wsEndImagePath"
            readonly
            placeholder="No end frame selected"
            class="flex-1 rounded-md border border-line bg-panelSoft px-2.5 py-1 text-xs text-slate-400 placeholder:text-slate-600 cursor-default"
          />
          <button class="button h-7 w-7 shrink-0 p-0" title="Pick end frame image" @click="pickEndImage">
            <FolderOpen class="h-3.5 w-3.5" />
          </button>
          <button v-if="wsEndImagePath" class="button h-7 w-7 shrink-0 p-0 text-slate-500" @click="wsEndImagePath = ''">
            <X class="h-3 w-3" />
          </button>
        </div>
      </div>

      <!-- Audio toggle (Seedance, Vidu Q3, Kling) -->
      <label v-if="modelCfg.hasAudio" class="flex cursor-pointer items-center gap-2 select-none">
        <input type="checkbox" v-model="wsGenerateAudio" aria-label="Generate native audio" class="h-3.5 w-3.5 accent-accent" />
        <span class="text-xs text-slate-300">Generate native audio</span>
      </label>

      <!-- Movement amplitude (Vidu Q3) -->
      <div v-if="modelCfg.hasMovement" class="flex flex-col gap-1">
        <label class="text-[11px] text-slate-500">Movement amplitude</label>
        <select v-model="wsMovementAmplitude" class="field text-xs py-1">
          <option value="auto">Auto</option>
          <option value="small">Small</option>
          <option value="medium">Medium</option>
          <option value="large">Large</option>
        </select>
      </div>

      <!-- Submit / submitting / submitted states -->
      <button
        v-if="!wsSubmitted && !wsSubmitting"
        class="w-full rounded-lg bg-violet-600 hover:bg-violet-500 active:bg-violet-700 py-2 text-xs font-semibold text-white transition flex items-center justify-center gap-2"
        :disabled="!props.imagePaths[0]"
        @click="submitToWavespeed"
      >
        <Clapperboard class="h-3.5 w-3.5" />
        Submit to Wavespeed
      </button>
      <button
        v-else-if="wsSubmitting"
        class="w-full rounded-lg bg-violet-600/50 py-2 text-xs font-semibold text-white/60 flex items-center justify-center gap-2"
        disabled
      >
        <Clapperboard class="h-3.5 w-3.5 animate-pulse" />
        Uploading &amp; submitting…
      </button>

      <!-- Success: job queued -->
      <div v-if="wsSubmitted" class="space-y-2">
        <div class="flex items-center gap-2 rounded-lg border border-mint/30 bg-mint/10 px-3 py-2">
          <span class="h-2 w-2 rounded-full bg-mint" />
          <span class="text-xs text-mint font-medium">Job queued — rendering in background</span>
        </div>
        <div class="flex gap-2">
          <button
            class="button h-7 flex-1 gap-1.5 px-2 text-xs border-violet-500/40 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20"
            @click="setPage?.('video-queue')"
          >
            <Clapperboard class="h-3 w-3" /> Open Video Queue
          </button>
          <button class="button h-7 gap-1 px-2.5 text-xs" @click="resetWavespeed">
            <X class="h-3 w-3" />New
          </button>
        </div>
      </div>

      <!-- Error -->
      <p v-if="wsError" class="text-xs text-rose">{{ wsError }}</p>
    </div>

    <!-- Wavespeed not configured hint -->
    <p
      v-else-if="generatedPrompt && !wavespeedAvailable"
      class="text-center text-[11px] text-slate-600"
    >
      Add a Wavespeed API key in <strong class="text-slate-500">Settings → Wavespeed AI</strong> to send directly.
    </p>
  </div>
</template>
