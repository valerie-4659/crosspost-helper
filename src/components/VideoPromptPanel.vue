<script setup lang="ts">
import { computed, inject, onMounted, onUnmounted, ref, watch } from "vue";
import type { AppPage } from "@/components/SidebarNavigation.vue";
import { Check, Clapperboard, Copy, Download, ExternalLink, FolderOpen, Send, X } from "lucide-vue-next";
import { VIDEO_MODELS, type VideoModelValue } from "@/composables/useVideoModels";
import { usePickerStore } from "@/stores/pickerStore";
import { getImageByLocalPath } from "@/repositories/imageRepository";

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

// ── Live job tracking ──────────────────────────────────────────────────────
/** Local DB id of the most recently submitted job (null if none / reset). */
const wsTrackedLocalId  = ref<string | null>(null);
const wsTrackedStatus   = ref<"created" | "processing" | "completed" | "failed" | "">("");
const wsTrackedVideoUrl = ref<string | null>(null);
const wsTrackedJobError = ref<string | null>(null);
const wsCopiedUrl        = ref(false);
const wsDownloading      = ref(false);
const wsDownloadError    = ref("");
const wsDownloadedPath   = ref<string | null>(null);

// Reset resolution/duration to valid defaults when model changes
watch(selectedModel, () => {
  const m = modelCfg.value;
  wsResolution.value    = m.resolutions.length ? (m.resolutions.includes("720p") ? "720p" : m.resolutions[0] as string) : "720p";
  wsDuration.value      = m.durations[Math.min(3, m.durations.length - 1)];
  wsEndImagePath.value  = "";
  wsMovementAmplitude.value = "auto";
  resetWavespeed();
});

// Restore a running/pending wavespeed job for the current image so navigating
// away and back still shows the live status.
async function restoreRunningJob() {
  const imagePath = props.imagePaths[0];
  if (!imagePath) return;
  const running = await window.desktop.db.select<WavespeedJobRecord[]>(
    "SELECT * FROM wavespeed_jobs WHERE image_path = ? AND status IN ('created', 'processing') ORDER BY created_at DESC LIMIT 1",
    [imagePath],
  );
  if (running[0]) {
    const job = running[0];
    wsSubmitted.value       = true;
    wsTrackedLocalId.value  = job.id;
    wsTrackedStatus.value   = job.status as typeof wsTrackedStatus.value;
    wsTrackedVideoUrl.value = job.video_url ?? null;
    wsTrackedJobError.value = job.error_msg ?? null;
  }
}

onMounted(async () => {
  const rows = await window.desktop.db.select<Array<{ value: string }>>(
    "SELECT value FROM ai_config WHERE key = 'wavespeed_api_key'",
  );
  wavespeedAvailable.value = Boolean(rows[0]?.value);

  await restoreRunningJob();

  // Subscribe to background-poller updates and apply them to the tracked job.
  window.desktop.wavespeed.onJobUpdated((data) => {
    if (!wsTrackedLocalId.value || data.id !== wsTrackedLocalId.value) return;
    if (data.status)                   wsTrackedStatus.value   = data.status as typeof wsTrackedStatus.value;
    if (data.video_url !== undefined)   wsTrackedVideoUrl.value = data.video_url ?? null;
    if (data.error_msg !== undefined)   wsTrackedJobError.value = data.error_msg ?? null;
  });
});

onUnmounted(() => {
  window.desktop.wavespeed.offJobUpdated();
});

// When image changes: reset state, then check if there's already a running job for the new image.
watch(() => props.imagePaths, async () => {
  generatedPrompt.value = "";
  generateError.value   = "";
  instructions.value    = "";
  resetWavespeed();
  await restoreRunningJob();
}, { deep: true });

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
const setGenerationQueueTab = inject<(tab: "queue" | "images" | "videos") => void>("setGenerationQueueTab");

// ── Add to Queue ──────────────────────────────────────────────────────────────
const wsQueued   = ref(false);
const wsQueueErr = ref("");

async function addToQueue() {
  const imagePath = props.imagePaths[0];
  if (!imagePath) return;
  wsSubmitting.value = true;
  wsQueued.value     = false;
  wsQueueErr.value   = "";
  wsError.value      = "";
  try {
    await window.desktop.jobqueue.add({
      type:            "video",
      image_path:      imagePath,
      prompt:          generatedPrompt.value,
      model:           selectedModel.value,
      ai_instructions: instructions.value,
      params: {
        imagePath,
        prompt:            generatedPrompt.value,
        videoModel:        selectedModel.value,
        resolution:        wsResolution.value,
        duration:          wsDuration.value,
        endImagePath:      wsEndImagePath.value || undefined,
        generateAudio:     wsGenerateAudio.value,
        movementAmplitude: wsMovementAmplitude.value,
      },
    });
    wsQueued.value = true;
  } catch (err) {
    wsQueueErr.value = err instanceof Error ? err.message : String(err);
  } finally {
    wsSubmitting.value = false;
  }
}

async function submitToWavespeed() {
  const imagePath = props.imagePaths[0];
  if (!imagePath) return;
  wsSubmitting.value = true;
  wsSubmitted.value  = false;
  wsError.value      = "";
  try {
    const result = await window.desktop.wavespeed.submit({
      imagePath,
      prompt:             generatedPrompt.value,
      videoModel:         selectedModel.value,
      resolution:         wsResolution.value,
      duration:           wsDuration.value,
      endImagePath:       wsEndImagePath.value || undefined,
      generateAudio:      wsGenerateAudio.value,
      movementAmplitude:  wsMovementAmplitude.value,
    });
    wsSubmitted.value       = true;
    wsTrackedLocalId.value  = result.localId ?? null;
    wsTrackedStatus.value   = (result.status as typeof wsTrackedStatus.value) || "created";
    wsTrackedVideoUrl.value = result.outputs?.[0] ?? null;
    wsTrackedJobError.value = result.error ?? null;
  } catch (err) {
    wsError.value = err instanceof Error ? err.message : String(err);
  } finally {
    wsSubmitting.value = false;
  }
}

function resetWavespeed() {
  wsSubmitted.value       = false;
  wsError.value           = "";
  wsSubmitting.value      = false;
  wsTrackedLocalId.value  = null;
  wsTrackedStatus.value   = "";
  wsTrackedVideoUrl.value = null;
  wsTrackedJobError.value = null;
  wsCopiedUrl.value       = false;
  wsDownloading.value     = false;
  wsDownloadError.value   = "";
  wsDownloadedPath.value  = null;
  wsQueued.value          = false;
  wsQueueErr.value        = "";
}

async function downloadVideo() {
  if (!wsTrackedLocalId.value) return;
  wsDownloading.value    = true;
  wsDownloadError.value  = "";
  wsDownloadedPath.value = null;
  try {
    const result = await window.desktop.wavespeed.downloadVideo(wsTrackedLocalId.value);
    wsDownloadedPath.value = result.path;
  } catch (err) {
    wsDownloadError.value = err instanceof Error ? err.message : String(err);
  } finally {
    wsDownloading.value = false;
  }
}

async function copyVideoUrl() {
  if (!wsTrackedVideoUrl.value) return;
  await navigator.clipboard.writeText(wsTrackedVideoUrl.value).catch(() => {});
  wsCopiedUrl.value = true;
  setTimeout(() => (wsCopiedUrl.value = false), 2000);
}

function openTrackedVideoUrl() {
  if (wsTrackedVideoUrl.value) window.desktop.opener.openUrl(wsTrackedVideoUrl.value);
}

function revealDownloadedVideo() {
  if (wsDownloadedPath.value) window.desktop.opener.revealItemInDir(wsDownloadedPath.value);
}

// ── "Post this video" ─────────────────────────────────────────────────────────
const picker = usePickerStore();
const wsPostError  = ref("");
const wsPostSending = ref(false);

async function postDownloaded() {
  const path = wsDownloadedPath.value;
  if (!path) return;
  wsPostSending.value = true;
  wsPostError.value   = "";
  try {
    const image = await getImageByLocalPath(path);
    if (!image) {
      wsPostError.value = "File not found in library — wait a moment and try again.";
      return;
    }
    picker.selectImage(image);
    setPage?.("picker");
  } catch (err) {
    wsPostError.value = err instanceof Error ? err.message : String(err);
  } finally {
    wsPostSending.value = false;
  }
}
</script>

<template>
  <div class="space-y-3">
    <!-- Model selector (compact select) -->
    <div>
      <p class="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">Target model</p>
      <select v-model="selectedModel" class="field w-full text-xs py-1.5">
        <option v-for="m in VIDEO_MODELS" :key="m.value" :value="m.value">
          {{ m.label }}{{ m.nsfw ? ' 🔞' : '' }}
        </option>
      </select>
      <!-- Content policy note -->
      <p v-if="modelCfg.nsfw" class="mt-1 text-[11px] text-rose/70">
        Explicit content allowed — prompt will include uncensored descriptions.
      </p>
      <p v-else-if="modelCfg.strictChinese" class="mt-1 text-[11px] text-amber-500/70">
        Chinese-operated model — prompts are strictly family-safe, no suggestive language.
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

    <!-- Generate error -->
    <div v-if="generateError" class="rounded-lg border border-rose/40 bg-rose/10 px-3 py-2 text-xs text-rose">
      {{ generateError }}
    </div>

    <!-- Prompt textarea — always editable; AI generation populates it, manual input also works -->
    <div class="space-y-2 rounded-xl border border-accent/20 bg-panel p-4">
      <p class="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        Prompt <span class="normal-case font-normal text-slate-600">— edit or type manually, AI generation optional</span>
      </p>
      <textarea
        v-model="generatedPrompt"
        rows="6"
        class="w-full resize-y rounded-md border border-line bg-panelSoft px-2.5 py-2 text-xs leading-relaxed text-slate-200 placeholder:text-slate-600 focus:border-accent/60 focus:outline-none focus:ring-1 focus:ring-accent/30 transition"
        placeholder="Type your video prompt here, or click Generate above to create one with AI…"
      />
      <div v-if="generatedPrompt" class="flex items-center gap-2 border-t border-line pt-2.5">
        <button
          class="button h-7 flex-1 gap-1.5 px-2.5 text-xs"
          :class="copied ? 'border-mint/60 bg-mint/10 text-mint' : ''"
          @click="copyPrompt"
        >
          <Check v-if="copied" class="h-3 w-3" /><Copy v-else class="h-3 w-3" />
          {{ copied ? 'Copied!' : 'Copy prompt' }}
        </button>
        <button class="button h-7 gap-1 px-2.5 text-xs ml-auto" @click="generatedPrompt = ''; generateError = ''; resetWavespeed()">
          <X class="h-3 w-3" />Clear
        </button>
      </div>
    </div>

    <!-- ── Send to Wavespeed ─────────────────────────────────────────────── -->
    <div
      v-if="wavespeedAvailable"
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

      <!-- Submit buttons: Add to Queue (primary) + direct submit (secondary) -->
      <div v-if="!wsSubmitted && !wsQueued && !wsSubmitting" class="flex gap-2">
        <button
          class="flex-1 rounded-lg bg-violet-600 hover:bg-violet-500 active:bg-violet-700 py-2 text-xs font-semibold text-white transition flex items-center justify-center gap-2"
          :disabled="!props.imagePaths[0]"
          @click="addToQueue"
        >
          <Clapperboard class="h-3.5 w-3.5" />
          Add to Queue
        </button>
        <button
          class="rounded-lg border border-violet-500/40 bg-violet-500/10 px-3 py-2 text-xs text-violet-300 hover:bg-violet-500/20 transition flex items-center gap-1.5"
          :disabled="!props.imagePaths[0]"
          title="Submit directly (bypasses queue)"
          @click="submitToWavespeed"
        >
          <Clapperboard class="h-3 w-3" />
          Direct
        </button>
      </div>
      <button
        v-else-if="wsSubmitting"
        class="w-full rounded-lg bg-violet-600/50 py-2 text-xs font-semibold text-white/60 flex items-center justify-center gap-2"
        disabled
      >
        <Clapperboard class="h-3.5 w-3.5 animate-pulse" />
        Adding to queue…
      </button>

      <!-- Queued confirmation -->
      <div v-if="wsQueued" class="space-y-2">
        <div class="flex items-center gap-2 rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-2">
          <Check class="h-4 w-4 shrink-0 text-violet-400" />
          <span class="flex-1 text-xs text-violet-300">Added to queue!</span>
        </div>
        <div class="flex gap-2">
          <button
            class="button h-7 flex-1 gap-1.5 px-2 text-xs border-violet-500/40 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20"
            @click="setGenerationQueueTab?.('queue'); setPage?.('generation-queue')"
          >
            <Clapperboard class="h-3 w-3" /> View Queue
          </button>
          <button class="button h-7 gap-1 px-2.5 text-xs" @click="resetWavespeed">
            <X class="h-3 w-3" />New
          </button>
        </div>
      </div>
      <p v-if="wsQueueErr" class="text-xs text-rose">{{ wsQueueErr }}</p>

      <!-- Success: live job status -->
      <div v-if="wsSubmitted" class="space-y-2">

        <!-- Status pill -->
        <div
          class="flex items-center gap-2 rounded-lg border px-3 py-2"
          :class="{
            'border-gold/30 bg-gold/10':          wsTrackedStatus === 'created',
            'border-violet-500/30 bg-violet-500/10': wsTrackedStatus === 'processing',
            'border-mint/30 bg-mint/10':          wsTrackedStatus === 'completed',
            'border-rose/30 bg-rose/10':          wsTrackedStatus === 'failed',
            'border-line bg-panel':               !wsTrackedStatus,
          }"
        >
          <span
            class="h-2 w-2 shrink-0 rounded-full"
            :class="{
              'bg-gold animate-pulse':       wsTrackedStatus === 'created',
              'bg-violet-400 animate-pulse': wsTrackedStatus === 'processing',
              'bg-mint':                     wsTrackedStatus === 'completed',
              'bg-rose':                     wsTrackedStatus === 'failed',
            }"
          />
          <span
            class="flex-1 text-xs font-medium"
            :class="{
              'text-gold':      wsTrackedStatus === 'created',
              'text-violet-300': wsTrackedStatus === 'processing',
              'text-mint':      wsTrackedStatus === 'completed',
              'text-rose':      wsTrackedStatus === 'failed',
              'text-slate-400': !wsTrackedStatus,
            }"
          >
            {{
              wsTrackedStatus === 'created'    ? 'Queued — waiting to render…' :
              wsTrackedStatus === 'processing' ? 'Rendering…' :
              wsTrackedStatus === 'completed'  ? 'Done! Video is ready.' :
              wsTrackedStatus === 'failed'     ? 'Job failed' :
              'Job submitted'
            }}
          </span>
        </div>

        <!-- Failed error detail -->
        <p v-if="wsTrackedStatus === 'failed' && wsTrackedJobError" class="text-[11px] text-rose px-1">
          {{ wsTrackedJobError }}
        </p>

        <!-- Video preview when completed -->
        <div v-if="wsTrackedVideoUrl" class="rounded-lg overflow-hidden bg-black/40">
          <video
            :src="wsTrackedVideoUrl"
            controls
            muted
            loop
            preload="metadata"
            class="w-full rounded-lg"
            style="max-height: 260px; object-fit: contain"
          />
        </div>

        <!-- Download + URL actions -->
        <div v-if="wsTrackedVideoUrl" class="flex flex-wrap gap-1.5">
          <button
            class="button h-7 flex-1 gap-1.5 px-2 text-xs border-mint/40 bg-mint/10 text-mint hover:bg-mint/20 disabled:opacity-50"
            :disabled="wsDownloading || !!wsDownloadedPath"
            @click="downloadVideo"
          >
            <Check v-if="wsDownloadedPath" class="h-3 w-3" />
            <Clapperboard v-else-if="wsDownloading" class="h-3 w-3 animate-pulse" />
            <Download v-else class="h-3 w-3" />
            {{ wsDownloadedPath ? 'Downloaded!' : wsDownloading ? 'Downloading…' : 'Download to folder' }}
          </button>
          <button class="button h-7 gap-1.5 px-2 text-xs" @click="openTrackedVideoUrl">
            <ExternalLink class="h-3 w-3" />
          </button>
          <button
            class="button h-7 gap-1.5 px-2 text-xs"
            :class="wsCopiedUrl ? 'border-mint/60 bg-mint/10 text-mint' : ''"
            @click="copyVideoUrl"
          >
            <Check v-if="wsCopiedUrl" class="h-3 w-3" />
            <Copy v-else class="h-3 w-3" />
            {{ wsCopiedUrl ? 'Copied!' : 'URL' }}
          </button>
        </div>
        <p v-if="wsDownloadError" class="text-[11px] text-rose px-0.5">{{ wsDownloadError }}</p>
        <button
          v-if="wsDownloadedPath"
          class="button h-7 w-full gap-1.5 px-2 text-xs text-slate-400 hover:text-white truncate"
          title="Reveal in Finder / Explorer"
          @click="revealDownloadedVideo"
        >
          <FolderOpen class="h-3 w-3 shrink-0" />
          <span class="truncate">{{ wsDownloadedPath }}</span>
        </button>

        <!-- Post this video -->
        <div v-if="wsDownloadedPath" class="space-y-1">
          <button
            class="w-full rounded-lg border border-accent/40 bg-accent/10 py-2 text-xs font-semibold text-accent hover:bg-accent/20 transition flex items-center justify-center gap-2 disabled:opacity-50"
            :disabled="wsPostSending"
            @click="postDownloaded"
          >
            <Send class="h-3.5 w-3.5" :class="wsPostSending ? 'animate-pulse' : ''" />
            {{ wsPostSending ? 'Opening Picker…' : 'Post this video' }}
          </button>
          <p v-if="wsPostError" class="text-[11px] text-rose px-0.5">{{ wsPostError }}</p>
        </div>

        <!-- Bottom actions -->
        <div class="flex gap-2">
          <button
            class="button h-7 flex-1 gap-1.5 px-2 text-xs border-violet-500/40 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20"
            @click="setGenerationQueueTab?.('videos'); setPage?.('generation-queue')"
          >
            <Clapperboard class="h-3 w-3" /> Results
          </button>
          <button
            v-if="!wsQueued"
            class="button h-7 gap-1.5 px-2 text-xs border-violet-500/40 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20 disabled:opacity-50"
            :disabled="wsSubmitting"
            title="Add this job again to the queue"
            @click="addToQueue"
          >
            <Check v-if="wsQueued" class="h-3 w-3" />
            <Clapperboard v-else class="h-3 w-3" />
            + Queue
          </button>
          <button
            v-else
            class="button h-7 gap-1.5 px-2 text-xs border-mint/40 bg-mint/10 text-mint"
            disabled
          >
            <Check class="h-3 w-3" /> Queued!
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
      v-if="!wavespeedAvailable"
      class="text-center text-[11px] text-slate-600"
    >
      Add a Wavespeed API key in <strong class="text-slate-500">Settings → Wavespeed AI</strong> to send directly.
    </p>
  </div>
</template>
