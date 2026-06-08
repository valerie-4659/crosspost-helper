<script setup lang="ts">
import { onMounted, ref } from "vue";
import { Check, Clapperboard, Copy, ExternalLink, FolderOpen, X } from "lucide-vue-next";

const props = defineProps<{
  imagePaths: string[];
  disabled?: boolean;
}>();

const VIDEO_MODELS = [
  { value: "wan_2_2_explicit", label: "WAN 2.2 Spicy", nsfw: true  },
  { value: "wan_2_5",          label: "WAN 2.5",        nsfw: false },
  { value: "wan_2_7",          label: "WAN 2.7",        nsfw: false },
  { value: "grok_imagine",     label: "GROK Imagine",   nsfw: false },
  { value: "seedance",         label: "Seedance",        nsfw: false },
];

// Models that have a direct Wavespeed endpoint
const WAVESPEED_SUPPORTED = new Set(["wan_2_2_explicit", "wan_2_5", "wan_2_7"]);

const selectedModel   = ref("wan_2_2_explicit");
const instructions    = ref("");
const generating      = ref(false);
const generateError   = ref("");
const generatedPrompt = ref("");
const copied          = ref(false);

// ── Wavespeed ──────────────────────────────────────────────────────────────
const wavespeedAvailable = ref(false);
const wsResolution = ref<"720p" | "480p">("720p");
const wsDuration   = ref<5 | 8>(8);
const wsSubmitting = ref(false);
const wsJobId      = ref<string | null>(null);
const wsStatus     = ref<string>("");
const wsVideoUrl   = ref<string | null>(null);
const wsError      = ref("");
let wsPoller: ReturnType<typeof setInterval> | null = null;

const WS_STATUS_LABELS: Record<string, string> = {
  created:    "Queued — waiting for a GPU…",
  processing: "Rendering… this usually takes 1–3 min",
  completed:  "Done! Video ready.",
  failed:     "Generation failed.",
};
const wsStatusLabel = ref("");

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

async function submitToWavespeed() {
  const imagePath = props.imagePaths[0];
  if (!imagePath || !generatedPrompt.value) return;
  wsSubmitting.value = true;
  wsError.value = "";
  wsVideoUrl.value = null;
  wsJobId.value = null;
  wsStatus.value = "";
  wsStatusLabel.value = "";
  try {
    const job = await window.desktop.wavespeed.submit({
      imagePath,
      prompt:     generatedPrompt.value,
      videoModel: selectedModel.value,
      resolution: wsResolution.value,
      duration:   wsDuration.value,
    });
    wsJobId.value = job.id;
    wsStatus.value = job.status;
    wsStatusLabel.value = WS_STATUS_LABELS[job.status] ?? job.status;
    if (job.status === "completed" && job.outputs?.length) {
      wsVideoUrl.value = job.outputs[0];
    } else if (job.status !== "failed") {
      startPolling();
    } else {
      wsError.value = job.error || "Generation failed.";
    }
  } catch (err) {
    wsError.value = err instanceof Error ? err.message : String(err);
  } finally {
    wsSubmitting.value = false;
  }
}

function startPolling() {
  stopPolling();
  wsPoller = setInterval(async () => {
    if (!wsJobId.value) { stopPolling(); return; }
    try {
      const job = await window.desktop.wavespeed.poll(wsJobId.value);
      wsStatus.value = job.status;
      wsStatusLabel.value = WS_STATUS_LABELS[job.status] ?? job.status;
      if (job.status === "completed") {
        stopPolling();
        if (job.outputs?.length) wsVideoUrl.value = job.outputs[0];
      } else if (job.status === "failed") {
        stopPolling();
        wsError.value = job.error || "Generation failed.";
      }
    } catch (err) {
      wsError.value = err instanceof Error ? err.message : String(err);
      stopPolling();
    }
  }, 4000);
}

function stopPolling() {
  if (wsPoller) { clearInterval(wsPoller); wsPoller = null; }
}

function resetWavespeed() {
  stopPolling();
  wsJobId.value = null;
  wsStatus.value = "";
  wsStatusLabel.value = "";
  wsVideoUrl.value = null;
  wsError.value = "";
  wsSubmitting.value = false;
}

function openVideoUrl() {
  if (wsVideoUrl.value) window.desktop.opener.openUrl(wsVideoUrl.value);
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
        <button class="button h-7 gap-1 px-2.5 text-xs ml-auto" @click="generatedPrompt = ''; generateError = ''; resetWavespeed()">
          <X class="h-3 w-3" />Discard
        </button>
      </div>
    </div>

    <!-- ── Send to Wavespeed ─────────────────────────────────────────────── -->
    <div
      v-if="generatedPrompt && wavespeedAvailable && WAVESPEED_SUPPORTED.has(selectedModel)"
      class="space-y-2.5 rounded-xl border border-violet-500/20 bg-panel p-4"
    >
      <p class="text-[10px] font-semibold uppercase tracking-wide text-violet-400/70">
        Send to Wavespeed
        <span class="normal-case font-normal text-slate-600"> — start a render job directly</span>
      </p>

      <!-- Resolution + Duration -->
      <div class="flex gap-2">
        <div class="flex-1 flex flex-col gap-1">
          <label class="text-[11px] text-slate-500">Resolution</label>
          <select v-model="wsResolution" class="field text-xs py-1">
            <option value="720p">720p — $0.48</option>
            <option value="480p">480p — $0.24</option>
          </select>
        </div>
        <div class="flex-1 flex flex-col gap-1">
          <label class="text-[11px] text-slate-500">Duration</label>
          <select v-model="wsDuration" class="field text-xs py-1">
            <option :value="8">8 seconds</option>
            <option :value="5">5 seconds</option>
          </select>
        </div>
      </div>

      <!-- Submit button (shown before job is sent) -->
      <button
        v-if="!wsJobId && !wsSubmitting"
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

      <!-- Job status -->
      <div v-if="wsJobId" class="space-y-2">
        <div class="flex items-center gap-2">
          <span
            class="h-2 w-2 shrink-0 rounded-full"
            :class="{
              'bg-mint': wsStatus === 'completed',
              'bg-rose': wsStatus === 'failed',
              'bg-gold animate-pulse': wsStatus === 'created' || wsStatus === 'processing',
            }"
          />
          <span class="text-xs text-slate-300">{{ wsStatusLabel }}</span>
        </div>

        <!-- Open video when done -->
        <button
          v-if="wsVideoUrl"
          class="flex w-full items-center justify-center gap-1.5 rounded-lg border border-mint/40 bg-mint/10 py-2 text-xs font-semibold text-mint transition hover:bg-mint/20"
          @click="openVideoUrl"
        >
          <ExternalLink class="h-3.5 w-3.5" />
          Open Video
        </button>

        <!-- Error -->
        <p v-if="wsError" class="text-xs text-rose">{{ wsError }}</p>

        <!-- Retry -->
        <button class="button h-7 gap-1 px-2.5 text-xs" @click="resetWavespeed">
          <X class="h-3 w-3" /> Reset
        </button>
      </div>
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
