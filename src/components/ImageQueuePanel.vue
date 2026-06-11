<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { Clapperboard, Check, Download, ExternalLink, Film, FolderOpen, Image, Plus, RefreshCcw, RotateCcw, Sparkles, Trash2, X, Zap } from "lucide-vue-next";
import AiPostPanel from "@/components/AiPostPanel.vue";
import { convertFileSrc } from "@/electron-shims/core";
import { VIDEO_MODELS, getVideoModelCfg } from "@/composables/useVideoModels";

const jobs = ref<WavespeedImageJobRecord[]>([]);
const loading = ref(false);

// ── Re-run state ──────────────────────────────────────────────────────────────
const rerunJob        = ref<WavespeedImageJobRecord | null>(null);
const rerunPrompt     = ref("");
const rerunModel      = ref("gpt_image_2");
const rerunAspect     = ref("auto");       // aspect ratio string, e.g. "16:9"
const rerunResolution = ref("1k");         // resolution level for aspect-mode models
const rerunUseRef     = ref(true);
const rerunQuality    = ref<"auto" | "low" | "medium" | "high">("auto");
const rerunFormat     = ref<"png" | "jpeg" | "webp">("png");
const rerunStrength   = ref(0.6);          // Z-Image Turbo only
const rerunBusy       = ref(false);
const rerunError      = ref("");
const rerunDone       = ref(false);
// AI prompt analysis state
const rerunAnalysing      = ref(false);
const rerunAnalyseError   = ref("");

// ── Topaz Upscale — config modal (Image Queue) ───────────────────────────────
// The modal only configures model + format and fires off the job.
// The blocking wait is gone — progress shows in the Topaz Jobs section below.
type TopazModel = "Standard V2" | "Wonder 2" | "Bloom Creative" | "Bloom Realism";
const TOPAZ_MODELS: TopazModel[] = ["Standard V2", "Wonder 2", "Bloom Creative", "Bloom Realism"];
const topazConfigJob    = ref<WavespeedImageJobRecord | null>(null);
const topazModel        = ref<TopazModel>("Standard V2");
const topazFormat       = ref<"jpeg" | "png">("jpeg");
const topazSubmitError  = ref("");

function openTopazFromJob(job: WavespeedImageJobRecord) {
  if (!job.result_url) return;
  topazConfigJob.value  = job;
  topazModel.value      = "Standard V2";
  topazFormat.value     = "jpeg";
  topazSubmitError.value = "";
}

function closeTopazFromJob() {
  topazConfigJob.value = null;
}

async function submitTopazFromJob() {
  if (!topazConfigJob.value?.result_url) return;
  topazSubmitError.value = "";
  try {
    await window.desktop.topaz.submitJob({
      imageUrl:     topazConfigJob.value.result_url,
      model:        topazModel.value,
      outputFormat: topazFormat.value,
    });
    // Job is now in the background queue — close the config modal immediately
    topazConfigJob.value = null;
    await loadTopazJobs();
  } catch (err) {
    topazSubmitError.value = err instanceof Error ? err.message : String(err);
  }
}

// ── Topaz Jobs section ────────────────────────────────────────────────────────
const topazJobs = ref<TopazJobRecord[]>([]);

async function loadTopazJobs() {
  topazJobs.value = await window.desktop.topaz.getJobs();
}

function handleTopazJobUpdated(data: Partial<TopazJobRecord>) {
  const idx = topazJobs.value.findIndex((j) => j.id === data.id);
  if (idx !== -1) {
    topazJobs.value[idx] = { ...topazJobs.value[idx], ...data } as TopazJobRecord;
  } else {
    // New job not yet in the list — reload
    loadTopazJobs();
  }
}

async function deleteTopazJob(localId: string) {
  await window.desktop.topaz.deleteJob(localId);
  topazJobs.value = topazJobs.value.filter((j) => j.id !== localId);
}

function revealTopazResult(filePath: string) {
  window.desktop.opener.revealItemInDir(filePath);
}

// ── Topaz result preview lightbox ────────────────────────────────────────────
const topazPreviewPath = ref<string | null>(null);

function previewTopazResult(filePath: string) {
  topazPreviewPath.value = filePath;
}
function closeTopazPreview() {
  topazPreviewPath.value = null;
}

const TOPAZ_STATUS_LABEL: Record<string, string> = {
  processing: "Upscaling…",
  completed:  "Done",
  failed:     "Failed",
};
const TOPAZ_STATUS_DOT: Record<string, string> = {
  processing: "bg-amber-400 animate-pulse",
  completed:  "bg-mint",
  failed:     "bg-rose",
};

// ── Make-Video state ─────────────────────────────────────────────────────────
const makeVideoJob          = ref<WavespeedImageJobRecord | null>(null);
const makeVideoPath         = ref("");        // local path after download
const makeVideoDownloading  = ref(false);     // download in progress
const makeVideoModel        = ref("wan_2_7");
const makeVideoRes          = ref("720p");
const makeVideoDuration     = ref(8);
const makeVideoPrompt       = ref("");
const makeVideoAnalysing    = ref(false);
const makeVideoAnalyseError = ref("");
const makeVideoBusy         = ref(false);
const makeVideoError        = ref("");
const makeVideoDone         = ref(false);

const makeVideoModelCfg = computed(() => getVideoModelCfg(makeVideoModel.value));

async function openMakeVideo(job: WavespeedImageJobRecord) {
  if (!job.result_url) return;
  makeVideoJob.value          = job;
  makeVideoPath.value         = "";
  makeVideoDownloading.value  = true;
  makeVideoModel.value        = "wan_2_7";
  makeVideoRes.value          = "720p";
  makeVideoDuration.value     = 8;
  makeVideoPrompt.value       = "";
  makeVideoAnalysing.value    = false;
  makeVideoAnalyseError.value = "";
  makeVideoBusy.value         = false;
  makeVideoError.value        = "";
  makeVideoDone.value         = false;
  try {
    const dl = await window.desktop.wavespeed.downloadImage(
      job.result_url,
      `wavespeed_img_${Date.now()}.png`,
    );
    makeVideoPath.value = dl.path;
  } catch (err) {
    makeVideoError.value = `Download failed: ${err instanceof Error ? err.message : String(err)}`;
  } finally {
    makeVideoDownloading.value = false;
  }
}

function closeMakeVideo() { makeVideoJob.value = null; }

async function makeVideoAnalyse() {
  if (!makeVideoPath.value) return;
  makeVideoAnalysing.value    = true;
  makeVideoAnalyseError.value = "";
  try {
    makeVideoPrompt.value = await window.desktop.ai.generateVideoPrompt(
      [makeVideoPath.value],
      makeVideoModel.value,
      "",
    );
  } catch (err) {
    makeVideoAnalyseError.value = err instanceof Error ? err.message : String(err);
  } finally {
    makeVideoAnalysing.value = false;
  }
}

async function submitMakeVideo() {
  if (!makeVideoPath.value || !makeVideoPrompt.value.trim()) return;
  makeVideoBusy.value  = true;
  makeVideoError.value = "";
  makeVideoDone.value  = false;
  try {
    await window.desktop.wavespeed.submit({
      imagePath:  makeVideoPath.value,
      prompt:     makeVideoPrompt.value.trim(),
      videoModel: makeVideoModel.value,
      resolution: makeVideoRes.value,
      duration:   makeVideoDuration.value,
    });
    makeVideoDone.value = true;
  } catch (err) {
    makeVideoError.value = err instanceof Error ? err.message : String(err);
  } finally {
    makeVideoBusy.value = false;
  }
}

const IMAGE_MODELS = [
  { value: "gpt_image_2",     label: "GPT Image 2"     },
  { value: "nano_banana_2",   label: "Nano Banana 2"   },
  { value: "nano_banana_pro", label: "Nano Banana Pro" },
  { value: "nano_banana",     label: "Nano Banana"     },
  { value: "seedream_5_lite", label: "Seedream 5 Lite" },
  { value: "seedream_4_5",    label: "Seedream 4.5"    },
  { value: "gpt_image_1_5",   label: "GPT Image 1.5"   },
  { value: "qwen_image_2",    label: "Qwen Image 2.0"  },
  { value: "qwen_image",      label: "Qwen Image"      },
  { value: "wan_2_7_img",     label: "WAN 2.7"         },
  { value: "wan_2_6_img",     label: "WAN 2.6"         },
  { value: "wan_2_5_img",     label: "WAN 2.5"         },
  { value: "flux_2_klein",    label: "FLUX 2 Klein"    },
  { value: "z_image_turbo",   label: "Z-Image Turbo"   },
];

// Aspect ratios — value is the API aspect-ratio string (matches ImageGeneratePanel)
const ASPECT_RATIOS = [
  { value: "auto",  label: "Auto", w: 1024, h: 1024 },
  { value: "1:1",   label: "1:1",  w: 1024, h: 1024 },
  { value: "16:9",  label: "16:9", w: 1824, h: 1024 },
  { value: "9:16",  label: "9:16", w: 1024, h: 1824 },
  { value: "4:3",   label: "4:3",  w: 1360, h: 1024 },
  { value: "3:4",   label: "3:4",  w: 1024, h: 1360 },
  { value: "3:2",   label: "3:2",  w: 1536, h: 1024 },
  { value: "2:3",   label: "2:3",  w: 1024, h: 1536 },
  { value: "5:4",   label: "5:4",  w: 1280, h: 1024 },
  { value: "4:5",   label: "4:5",  w:  816, h: 1024 },
];

const RESOLUTIONS = [
  { value: "1k", label: "1K", scale: 1 },
  { value: "2k", label: "2K", scale: 2 },
  { value: "4k", label: "4K", scale: 4 },
];

// Model capability map — mirrors IMAGE_MODEL_CAPS in main.cjs
// requiresImage: endpoint always needs a reference image (no txt2img mode)
// txtOnly:       endpoint is text-to-image only (no image input accepted)
const IMAGE_MODEL_CAPS: Record<string, {
  sizeMode: "aspect" | "wh";
  quality: boolean;
  formats: string[];
  strength: boolean;
  requiresImage?: boolean;
  txtOnly?: boolean;
}> = {
  gpt_image_2:     { sizeMode: "aspect", quality: true,  formats: ["png","jpeg","webp"], strength: false, requiresImage: true  },
  gpt_image_1_5:   { sizeMode: "aspect", quality: true,  formats: ["png","jpeg","webp"], strength: false, requiresImage: true  },
  nano_banana_2:   { sizeMode: "aspect", quality: false, formats: ["png","jpeg"],        strength: false, requiresImage: true  },
  nano_banana_pro: { sizeMode: "aspect", quality: false, formats: ["png","jpeg"],        strength: false, requiresImage: true  },
  nano_banana:     { sizeMode: "aspect", quality: false, formats: ["png","jpeg"],        strength: false, requiresImage: true  },
  seedream_4_5:    { sizeMode: "wh",     quality: false, formats: [],                   strength: false                       },
  seedream_5_lite: { sizeMode: "wh",     quality: false, formats: [],                   strength: false                       },
  qwen_image_2:    { sizeMode: "wh",     quality: false, formats: [],                   strength: false                       },
  qwen_image:      { sizeMode: "wh",     quality: false, formats: [],                   strength: false                       },
  wan_2_7_img:     { sizeMode: "wh",     quality: false, formats: [],                   strength: false, requiresImage: true  },
  wan_2_6_img:     { sizeMode: "wh",     quality: false, formats: [],                   strength: false, requiresImage: true  },
  wan_2_5_img:     { sizeMode: "wh",     quality: false, formats: [],                   strength: false, txtOnly: true        },
  flux_2_klein:    { sizeMode: "wh",     quality: false, formats: [],                   strength: false, requiresImage: true  },
  z_image_turbo:   { sizeMode: "wh",     quality: false, formats: ["jpeg","png","webp"], strength: true,  requiresImage: true  },
};

const rerunModelCaps = computed(() =>
  IMAGE_MODEL_CAPS[rerunModel.value] ?? { sizeMode: "wh", quality: false, formats: [], strength: false }
);

// Clamp format + enforce image requirements on model change
watch(rerunModel, () => {
  const caps = rerunModelCaps.value;
  const fmts = caps.formats;
  if (fmts.length > 0 && !fmts.includes(rerunFormat.value)) {
    rerunFormat.value = fmts[0] as "png" | "jpeg" | "webp";
  }
  // Models that always require a reference image: force toggle on
  if (caps.requiresImage && rerunJob.value?.image_path) {
    rerunUseRef.value = true;
  }
  // Text-to-image only models: force toggle off
  if (caps.txtOnly) {
    rerunUseRef.value = false;
  }
});

/** Compute a WxH size string for wh-mode models based on aspect + resolution. */
function computeRerunSize(): string {
  const ar = ASPECT_RATIOS.find((a) => a.value === rerunAspect.value) ?? ASPECT_RATIOS[1];
  const scale = RESOLUTIONS.find((r) => r.value === rerunResolution.value)?.scale ?? 1;
  return `${ar.w * scale}*${ar.h * scale}`;
}

function openRerun(job: WavespeedImageJobRecord) {
  rerunJob.value        = job;
  rerunPrompt.value     = job.prompt;
  rerunModel.value      = IMAGE_MODELS.find((m) => m.value === job.model) ? job.model : "gpt_image_2";
  rerunAspect.value     = "auto";
  rerunResolution.value = "1k";
  rerunQuality.value    = "auto";
  rerunFormat.value     = "png";
  rerunStrength.value   = 0.6;
  rerunBusy.value       = false;
  rerunError.value      = "";
  rerunDone.value       = false;
  rerunAnalysing.value  = false;
  rerunAnalyseError.value = "";
  // Enforce image requirements
  const caps = IMAGE_MODEL_CAPS[rerunModel.value] ?? {};
  if (caps.requiresImage) {
    rerunUseRef.value = !!job.image_path; // can only enable if image is available
  } else if (caps.txtOnly) {
    rerunUseRef.value = false;
  } else {
    rerunUseRef.value = !!job.image_path;
  }
}

/** Re-analyse the source image with the currently selected model and replace the prompt. */
async function rerunAnalyse() {
  const imagePath = rerunJob.value?.image_path;
  if (!imagePath) return;
  rerunAnalysing.value    = true;
  rerunAnalyseError.value = "";
  try {
    rerunPrompt.value = await window.desktop.ai.generateImagePrompt(
      [imagePath],
      rerunModel.value,
      "",
    );
  } catch (err) {
    rerunAnalyseError.value = err instanceof Error ? err.message : String(err);
  } finally {
    rerunAnalysing.value = false;
  }
}

function closeRerun() {
  rerunJob.value = null;
}

async function submitRerun() {
  if (!rerunPrompt.value.trim()) return;
  rerunBusy.value  = true;
  rerunError.value = "";
  rerunDone.value  = false;
  const sizeStr = computeRerunSize();
  try {
    // Only pass imagePath when the user opted in — the backend includes it in
    // the request body whenever the path is set, so passing "" = txt2img mode.
    const result = await window.desktop.wavespeed.submitImage({
      imagePath:    rerunUseRef.value ? (rerunJob.value?.image_path ?? "") : "",
      prompt:       rerunPrompt.value.trim(),
      imageModel:   rerunModel.value,
      aspectRatio:  rerunAspect.value,
      resolution:   rerunResolution.value,
      size:         sizeStr,
      useRefImage:  rerunUseRef.value,
      quality:      rerunQuality.value,
      outputFormat: rerunFormat.value,
      strength:     rerunStrength.value,
    });
    const newJob: WavespeedImageJobRecord = {
      id:         result.localId ?? `wsimg_${Date.now()}`,
      job_id:     result.id,
      image_path: rerunJob.value?.image_path ?? "",
      prompt:     rerunPrompt.value.trim(),
      model:      rerunModel.value,
      size:       sizeStr,
      status:     (result.status as WavespeedImageJobRecord["status"]) ?? "created",
      result_url: null,
      error_msg:  null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    jobs.value = [newJob, ...jobs.value];
    rerunDone.value = true;
  } catch (err) {
    rerunError.value = err instanceof Error ? err.message : String(err);
  } finally {
    rerunBusy.value = false;
  }
}

const STATUS_LABEL: Record<string, string> = {
  created:    "Queued",
  processing: "Generating…",
  completed:  "Done",
  failed:     "Failed",
};

const STATUS_DOT: Record<string, string> = {
  created:    "bg-gold animate-pulse",
  processing: "bg-violet-400 animate-pulse",
  completed:  "bg-mint",
  failed:     "bg-rose",
};

async function load() {
  loading.value = true;
  try {
    jobs.value = await window.desktop.wavespeed.getImageJobs();
  } finally {
    loading.value = false;
  }
}

function handleJobUpdated(data: Partial<WavespeedImageJobRecord>) {
  const idx = jobs.value.findIndex((j) => j.id === data.id);
  if (idx !== -1) {
    jobs.value[idx] = { ...jobs.value[idx], ...data };
  }
}

async function deleteJob(localId: string) {
  await window.desktop.wavespeed.deleteImageJob(localId);
  jobs.value = jobs.value.filter((j) => j.id !== localId);
}

function openImage(url: string) {
  window.desktop.opener.openUrl(url);
}

function revealImage(path: string) {
  window.desktop.opener.revealItemInDir(path);
}

function downloadResult(url: string) {
  window.desktop.wavespeed.downloadImage(url);
}

function thumbSrc(imagePath: string): string {
  return window.desktop.core.convertFileSrcSync?.(imagePath) ?? imagePath;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── New Job (txt2img) state ──────────────────────────────────────────────────
const showNewJob        = ref(false);
const newJobRoughPrompt = ref("");
const newJobPrompt      = ref("");
const newJobModel       = ref("gpt_image_2");
const newJobAspect      = ref("auto");
const newJobResolution  = ref("1k");
const newJobQuality     = ref<"auto" | "low" | "medium" | "high">("auto");
const newJobFormat      = ref<"png" | "jpeg" | "webp">("png");
const newJobStrength    = ref(0.6);
const newJobEnhancing   = ref(false);
const newJobEnhanceErr  = ref("");
const newJobBusy        = ref(false);
const newJobError       = ref("");
const newJobDone        = ref(false);

const newJobModelCaps = computed(() =>
  IMAGE_MODEL_CAPS[newJobModel.value] ?? { sizeMode: "wh", quality: false, formats: [], strength: false }
);

watch(newJobModel, () => {
  const fmts = newJobModelCaps.value.formats;
  if (fmts.length > 0 && !fmts.includes(newJobFormat.value)) {
    newJobFormat.value = fmts[0] as "png" | "jpeg" | "webp";
  }
});

function computeNewJobSize(): string {
  const ar = ASPECT_RATIOS.find((a) => a.value === newJobAspect.value) ?? ASPECT_RATIOS[1];
  const scale = RESOLUTIONS.find((r) => r.value === newJobResolution.value)?.scale ?? 1;
  return `${ar.w * scale}*${ar.h * scale}`;
}

function closeNewJob() {
  if (newJobBusy.value) return;
  showNewJob.value = false;
}

function openNewJob() {
  newJobRoughPrompt.value = "";
  newJobPrompt.value      = "";
  newJobModel.value       = "gpt_image_2";
  newJobAspect.value      = "auto";
  newJobResolution.value  = "1k";
  newJobQuality.value     = "auto";
  newJobFormat.value      = "png";
  newJobStrength.value    = 0.6;
  newJobEnhancing.value   = false;
  newJobEnhanceErr.value  = "";
  newJobBusy.value        = false;
  newJobError.value       = "";
  newJobDone.value        = false;
  showNewJob.value        = true;
}

async function newJobEnhance() {
  const rough = newJobRoughPrompt.value.trim();
  if (!rough || newJobEnhancing.value) return;
  newJobEnhancing.value  = true;
  newJobEnhanceErr.value = "";
  try {
    // Pass empty image array + rough prompt as instructions — triggers txt2img expansion path
    newJobPrompt.value = await window.desktop.ai.generateImagePrompt(
      [],
      newJobModel.value,
      rough,
    );
  } catch (err) {
    newJobEnhanceErr.value = err instanceof Error ? err.message : String(err);
  } finally {
    newJobEnhancing.value = false;
  }
}

async function submitNewJob() {
  const prompt = newJobPrompt.value.trim() || newJobRoughPrompt.value.trim();
  if (!prompt || newJobBusy.value) return;
  newJobBusy.value  = true;
  newJobError.value = "";
  newJobDone.value  = false;
  const sizeStr = computeNewJobSize();
  try {
    await window.desktop.wavespeed.submitImage({
      imagePath:    "",
      prompt,
      imageModel:   newJobModel.value,
      aspectRatio:  newJobAspect.value,
      resolution:   newJobResolution.value,
      size:         sizeStr,
      useRefImage:  false,
      quality:      newJobQuality.value,
      outputFormat: newJobFormat.value,
      strength:     newJobStrength.value,
    });
    newJobDone.value = true;
    await load();
  } catch (err) {
    newJobError.value = err instanceof Error ? err.message : String(err);
  } finally {
    newJobBusy.value = false;
  }
}

// ── AI Post Generation ────────────────────────────────────────────────────────
const POST_NETWORKS = [
  { id: "x",          label: "X / Twitter" },
  { id: "bluesky",    label: "Bluesky"     },
  { id: "civitai",    label: "CivitAI"     },
  { id: "deviantart", label: "DeviantArt"  },
  { id: "instagram",  label: "Instagram"   },
  { id: "facebook",   label: "Facebook"    },
  { id: "tumblr",     label: "Tumblr"      },
];

const showPostModal   = ref(false);
const postImagePath   = ref<string | null>(null);
const postDownloading = ref(false);
const postDownloadErr = ref("");
const postNetwork     = ref("x");

async function openPostForImageJob(job: WavespeedImageJobRecord) {
  if (!job.result_url) return;
  showPostModal.value   = true;
  postDownloadErr.value = "";
  // Prefer already-local source image; fall back to a silent download of the result
  if (job.image_path) {
    postImagePath.value   = job.image_path;
    postDownloading.value = false;
  } else {
    postImagePath.value   = null;
    postDownloading.value = true;
    try {
      const dl = await window.desktop.wavespeed.downloadImage(
        job.result_url,
        `post_${Date.now()}.png`,
        false,   // reveal = false — no Finder popup
      );
      postImagePath.value = dl.path;
    } catch (err) {
      postDownloadErr.value = `Download failed: ${err instanceof Error ? err.message : String(err)}`;
    } finally {
      postDownloading.value = false;
    }
  }
}

function openPostForTopazJob(filePath: string) {
  showPostModal.value   = true;
  postImagePath.value   = filePath;
  postDownloading.value = false;
  postDownloadErr.value = "";
}

function closePostModal() {
  showPostModal.value = false;
}

onMounted(async () => {
  await load();
  await loadTopazJobs();
  window.desktop.wavespeed.onImageJobUpdated(handleJobUpdated);
  window.desktop.topaz.onJobUpdated(handleTopazJobUpdated);
});

onUnmounted(() => {
  window.desktop.wavespeed.offImageJobUpdated();
  window.desktop.topaz.offJobUpdated();
});
</script>

<template>
  <div class="flex flex-col gap-3">
    <!-- Header -->
    <div class="flex items-center gap-2">
      <p class="text-[10px] font-semibold uppercase tracking-wide text-slate-500 flex-1">
        Image Generation Jobs
      </p>
      <!-- New txt2img job -->
      <button
        class="flex items-center gap-1 rounded-md border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-[10px] font-medium text-sky-300 transition hover:bg-sky-500/20"
        title="Create a new text-to-image job"
        @click="openNewJob"
      >
        <Plus class="h-3 w-3" />New Job
      </button>
      <button class="button h-6 w-6 p-0" title="Refresh" @click="load">
        <RefreshCcw class="h-3 w-3" :class="loading ? 'animate-spin' : ''" />
      </button>
    </div>

    <!-- Empty state -->
    <p v-if="!loading && !jobs.length" class="text-center text-xs text-slate-600 py-6">
      No jobs yet — use "Recreate Image" on any image card.
    </p>

    <!-- Job list -->
    <div class="flex flex-col gap-2">
      <div
        v-for="job in jobs"
        :key="job.id"
        class="flex items-start gap-3 rounded-lg border border-line bg-panelSoft p-2.5"
      >
        <!-- Thumbnail (source image) -->
        <img
          v-if="job.image_path"
          :src="thumbSrc(job.image_path)"
          class="h-12 w-12 shrink-0 rounded object-cover border border-line"
          draggable="false"
        />

        <!-- Info -->
        <div class="min-w-0 flex-1 space-y-1">
          <!-- Status row -->
          <div class="flex items-center gap-1.5">
            <span class="h-2 w-2 shrink-0 rounded-full" :class="STATUS_DOT[job.status] ?? 'bg-slate-500'" />
            <span class="text-xs font-medium text-slate-200">{{ STATUS_LABEL[job.status] ?? job.status }}</span>
            <span class="ml-auto text-[10px] text-slate-600 shrink-0">{{ relativeTime(job.created_at) }}</span>
          </div>
          <!-- Model + size -->
          <p class="text-[10px] text-slate-500 truncate">
            {{ job.model }} · {{ job.size }}
          </p>
          <!-- Prompt snippet -->
          <p class="text-[11px] text-slate-400 line-clamp-2 leading-snug">{{ job.prompt }}</p>
          <!-- Error -->
          <p v-if="job.error_msg" class="text-[11px] text-rose">{{ job.error_msg }}</p>
        </div>

        <!-- Actions -->
        <div class="flex shrink-0 flex-col gap-1">
          <button
            v-if="job.result_url"
            class="button h-6 gap-1 px-2 text-[10px] border-mint/40 bg-mint/10 text-mint hover:bg-mint/20"
            title="Open generated image"
            @click="openImage(job.result_url!)"
          >
            <ExternalLink class="h-3 w-3" />Image
          </button>
          <!-- Download result -->
          <button
            v-if="job.result_url"
            class="button h-6 w-6 p-0"
            title="Download generated image to ~/Pictures/WavespeedAI/"
            @click="downloadResult(job.result_url!)"
          >
            <Download class="h-3 w-3" />
          </button>
          <!-- Upscale with Topaz -->
          <button
            v-if="job.result_url"
            class="button h-6 w-6 p-0 border-amber-500/40 text-amber-300 hover:bg-amber-500/20"
            title="Upscale with Topaz Labs"
            @click="openTopazFromJob(job)"
          >
            <Zap class="h-3 w-3" />
          </button>
          <!-- Generate AI Post -->
          <button
            v-if="job.result_url"
            class="button h-6 w-6 p-0 border-accent/40 text-accent hover:bg-accent/20"
            title="Generate AI post text"
            @click="openPostForImageJob(job)"
          >
            <Sparkles class="h-3 w-3" />
          </button>
          <!-- Make Video from result -->
          <button
            v-if="job.result_url"
            class="button h-6 w-6 p-0 border-violet-500/40 text-violet-300 hover:bg-violet-500/20"
            title="Generate video from this image"
            @click="openMakeVideo(job)"
          >
            <Film class="h-3 w-3" />
          </button>
          <!-- Re-run -->
          <button
            class="button h-6 w-6 p-0"
            title="Edit prompt &amp; re-submit"
            @click="openRerun(job)"
          >
            <RotateCcw class="h-3 w-3" />
          </button>
          <button
            v-if="job.image_path"
            class="button h-6 w-6 p-0"
            title="Reveal source image in Finder"
            @click="revealImage(job.image_path)"
          >
            <FolderOpen class="h-3 w-3" />
          </button>
          <button
            class="button h-6 w-6 p-0 hover:border-rose/60 hover:text-rose"
            title="Remove from list"
            @click="deleteJob(job.id)"
          >
            <Trash2 class="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- ── Re-run modal ──────────────────────────────────────────────────────── -->
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="opacity-0 scale-95"
      enter-to-class="opacity-100 scale-100"
      leave-active-class="transition duration-100 ease-in"
      leave-from-class="opacity-100 scale-100"
      leave-to-class="opacity-0 scale-95"
    >
      <div
        v-if="rerunJob"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
        @click.self="closeRerun"
      >
        <div class="relative mx-4 flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-line bg-panelSoft shadow-2xl">
          <!-- header -->
          <div class="flex shrink-0 items-center justify-between border-b border-line px-5 py-3">
            <div class="flex items-center gap-2">
              <Image class="h-4 w-4 text-sky-300" />
              <p class="text-sm font-semibold text-white">Edit &amp; Re-run</p>
            </div>
            <button class="button h-7 w-7 p-0 hover:border-rose/60 hover:text-rose" @click="closeRerun">
              <X class="h-3.5 w-3.5" />
            </button>
          </div>

          <!-- body -->
          <div class="overflow-y-auto px-5 py-4 space-y-4">
            <!-- Source image thumb -->
            <div class="flex gap-3 items-start">
              <img
                v-if="rerunJob.image_path"
                :src="thumbSrc(rerunJob.image_path)"
                class="h-16 w-16 shrink-0 rounded-lg border border-line object-cover"
                draggable="false"
              />
              <div class="min-w-0 flex-1 text-xs text-slate-500">
                <p class="truncate text-slate-300">{{ rerunJob.image_path }}</p>
                <p class="mt-0.5">Original model: {{ rerunJob.model }} · {{ rerunJob.size }}</p>
              </div>
            </div>

            <!-- Reference image toggle -->
            <!-- requiresImage: always on, txtOnly: always off, otherwise user can toggle -->
            <div class="flex items-center gap-2 rounded-lg border px-3 py-2 transition"
              :class="rerunModelCaps.requiresImage || rerunModelCaps.txtOnly
                ? 'border-line bg-panel/50 cursor-default opacity-70'
                : 'border-line bg-panel hover:border-slate-500 cursor-pointer'"
            >
              <input
                v-model="rerunUseRef"
                type="checkbox"
                class="h-3.5 w-3.5 accent-sky-400"
                aria-label="Use reference image"
                :disabled="!!(rerunModelCaps.requiresImage || rerunModelCaps.txtOnly)"
              />
              <span class="text-xs text-slate-300">
                <template v-if="rerunModelCaps.requiresImage">Always uses reference image</template>
                <template v-else-if="rerunModelCaps.txtOnly">Text-to-image only (no reference)</template>
                <template v-else>Use reference image</template>
              </span>
              <span class="ml-auto text-[10px] text-slate-600">{{ rerunUseRef ? 'img2img' : 'txt2img' }}</span>
            </div>
            <p v-if="rerunModelCaps.requiresImage && !rerunJob.image_path" class="text-[11px] text-amber-400">
              ⚠ This model requires a reference image — provide one or choose another model.
            </p>

            <!-- Model selector -->
            <div>
              <p class="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">Model</p>
              <div class="flex flex-wrap gap-1.5">
                <button
                  v-for="m in IMAGE_MODELS"
                  :key="m.value"
                  class="rounded-lg border px-2.5 py-1 text-[11px] font-medium transition"
                  :class="rerunModel === m.value
                    ? 'border-sky-400/60 bg-sky-400/15 text-sky-300'
                    : 'border-line bg-panel text-slate-400 hover:border-slate-500 hover:text-slate-200'"
                  @click="rerunModel = m.value"
                >{{ m.label }}</button>
              </div>
            </div>

            <!-- Aspect ratio -->
            <div>
              <p class="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">Aspect Ratio</p>
              <div class="grid grid-cols-5 gap-1">
                <button
                  v-for="ar in ASPECT_RATIOS"
                  :key="ar.value"
                  class="rounded border py-1 text-[11px] font-medium transition"
                  :class="rerunAspect === ar.value
                    ? 'border-sky-400/60 bg-sky-400/15 text-sky-300'
                    : 'border-line bg-panel text-slate-400 hover:border-slate-500 hover:text-slate-200'"
                  @click="rerunAspect = ar.value"
                >{{ ar.label }}</button>
              </div>
            </div>

            <!-- Resolution -->
            <div>
              <p class="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">Resolution</p>
              <div class="flex gap-1.5">
                <button
                  v-for="r in RESOLUTIONS" :key="r.value"
                  class="flex-1 rounded border py-1 text-[11px] font-medium transition"
                  :class="rerunResolution === r.value
                    ? 'border-sky-400/60 bg-sky-400/15 text-sky-300'
                    : 'border-line bg-panel text-slate-400 hover:border-slate-500 hover:text-slate-200'"
                  @click="rerunResolution = r.value"
                >{{ r.label }}</button>
              </div>
            </div>

            <!-- Quality + Format (model-dependent) -->
            <div v-if="rerunModelCaps.quality || rerunModelCaps.formats.length > 0" class="flex gap-3">
              <div v-if="rerunModelCaps.quality" class="flex-1 flex flex-col gap-1">
                <label class="text-[11px] text-slate-500">Quality</label>
                <select v-model="rerunQuality" class="field text-xs py-1">
                  <option value="auto">Auto</option>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
              <div v-if="rerunModelCaps.formats.length > 0" class="flex-1 flex flex-col gap-1">
                <label class="text-[11px] text-slate-500">Format</label>
                <select v-model="rerunFormat" class="field text-xs py-1">
                  <option v-for="f in rerunModelCaps.formats" :key="f" :value="f">{{ f.toUpperCase() }}</option>
                </select>
              </div>
            </div>

            <!-- Strength slider — Z-Image Turbo only -->
            <div v-if="rerunModelCaps.strength" class="space-y-1">
              <label class="text-[11px] text-slate-500">
                Strength <span class="font-normal text-slate-600">({{ rerunStrength.toFixed(2) }})</span>
              </label>
              <input
                v-model.number="rerunStrength" type="range" min="0" max="1" step="0.05"
                class="w-full accent-sky-400"
                aria-label="Transformation strength"
              />
            </div>

            <!-- Prompt + AI analyse -->
            <div class="space-y-2">
              <div class="flex items-center justify-between">
                <p class="text-[11px] font-medium uppercase tracking-wide text-slate-500">Prompt</p>
                <!-- Analyse button — only available when a source image exists -->
                <button
                  v-if="rerunJob?.image_path"
                  class="flex items-center gap-1 rounded-md border border-violet-500/40 bg-violet-500/10 px-2 py-0.5 text-[10px] font-medium text-violet-300 transition hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                  :disabled="rerunAnalysing || rerunBusy"
                  :title="`Re-analyse image for ${rerunModel}`"
                  @click="rerunAnalyse"
                >
                  <Sparkles class="h-3 w-3" :class="rerunAnalysing ? 'animate-pulse' : ''" />
                  {{ rerunAnalysing ? 'Analysing…' : 'Analyse image' }}
                </button>
              </div>
              <!-- AI error -->
              <p v-if="rerunAnalyseError" class="text-[11px] text-rose">{{ rerunAnalyseError }}</p>
              <textarea
                v-model="rerunPrompt"
                rows="6"
                class="w-full resize-y rounded-lg border border-line bg-panel px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:border-sky-400/60 focus:outline-none focus:ring-1 focus:ring-sky-400/30 transition"
                :placeholder="rerunJob?.image_path ? 'Edit the prompt or click Analyse image to regenerate for the selected model…' : 'Enter a prompt…'"
              />
            </div>

            <!-- Error -->
            <p v-if="rerunError" class="text-xs text-rose">{{ rerunError }}</p>

            <!-- Success -->
            <div v-if="rerunDone" class="flex items-center gap-2 rounded-lg border border-mint/30 bg-mint/10 px-3 py-2">
              <Check class="h-4 w-4 text-mint" />
              <span class="text-xs text-mint font-medium">Job queued successfully!</span>
            </div>

            <!-- Actions -->
            <div class="flex gap-2 pt-1">
              <button class="button flex-1 gap-1.5 py-2 text-xs" @click="closeRerun">Cancel</button>
              <button
                class="flex-1 rounded-lg bg-sky-600 hover:bg-sky-500 active:bg-sky-700 py-2 text-xs font-semibold text-white transition flex items-center justify-center gap-2 disabled:opacity-50"
                :disabled="rerunBusy || !rerunPrompt.trim() || (rerunModelCaps.requiresImage && !rerunJob?.image_path)"
                @click="submitRerun"
              >
                <Image class="h-3.5 w-3.5" :class="rerunBusy ? 'animate-pulse' : ''" />
                {{ rerunBusy ? 'Submitting…' : 'Submit Re-run' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- ── Make Video modal ─────────────────────────────────────────────────── -->
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="opacity-0 scale-95"
      enter-to-class="opacity-100 scale-100"
      leave-active-class="transition duration-100 ease-in"
      leave-from-class="opacity-100 scale-100"
      leave-to-class="opacity-0 scale-95"
    >
      <div
        v-if="makeVideoJob"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
        @click.self="closeMakeVideo"
      >
        <div class="relative mx-4 flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-line bg-panelSoft shadow-2xl">
          <!-- header -->
          <div class="flex shrink-0 items-center justify-between border-b border-line px-5 py-3">
            <div class="flex items-center gap-2">
              <Clapperboard class="h-4 w-4 text-violet-300" />
              <p class="text-sm font-semibold text-white">Generate Video from Image</p>
            </div>
            <button class="button h-7 w-7 p-0 hover:border-rose/60 hover:text-rose" @click="closeMakeVideo">
              <X class="h-3.5 w-3.5" />
            </button>
          </div>

          <!-- body -->
          <div class="overflow-y-auto px-5 py-4 space-y-4">
            <!-- Source image preview -->
            <div class="flex gap-3 items-start">
              <div class="relative h-16 w-16 shrink-0">
                <img
                  v-if="makeVideoPath"
                  :src="thumbSrc(makeVideoPath)"
                  class="h-full w-full rounded-lg border border-line object-cover"
                  draggable="false"
                />
                <!-- Download spinner placeholder -->
                <div
                  v-else
                  class="h-full w-full rounded-lg border border-line bg-panel flex items-center justify-center"
                >
                  <Download class="h-5 w-5 text-slate-600 animate-pulse" />
                </div>
              </div>
              <div class="min-w-0 flex-1 text-xs text-slate-500">
                <p v-if="makeVideoDownloading" class="text-slate-400">Downloading result image…</p>
                <p v-else-if="makeVideoPath" class="truncate text-slate-300">{{ makeVideoPath }}</p>
                <p v-else class="text-rose">Download failed — see error below</p>
              </div>
            </div>

            <!-- Model selector -->
            <div>
              <p class="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">Model</p>
              <div class="flex flex-wrap gap-1.5">
                <button
                  v-for="m in VIDEO_MODELS"
                  :key="m.value"
                  class="rounded-lg border px-2.5 py-1 text-[11px] font-medium transition"
                  :class="makeVideoModel === m.value
                    ? 'border-violet-400/60 bg-violet-400/15 text-violet-300'
                    : 'border-line bg-panel text-slate-400 hover:border-slate-500 hover:text-slate-200'"
                  @click="makeVideoModel = m.value"
                >{{ m.label }}</button>
              </div>
            </div>

            <!-- Duration + Resolution -->
            <div class="flex gap-2">
              <div v-if="makeVideoModelCfg.resolutions.length" class="flex-1 flex flex-col gap-1">
                <label class="text-[11px] text-slate-500">Resolution</label>
                <select v-model="makeVideoRes" class="field text-xs py-1">
                  <option v-for="r in makeVideoModelCfg.resolutions" :key="r" :value="r">{{ r }}</option>
                </select>
              </div>
              <div class="flex-1 flex flex-col gap-1">
                <label class="text-[11px] text-slate-500">Duration</label>
                <select v-model="makeVideoDuration" class="field text-xs py-1">
                  <option v-for="d in makeVideoModelCfg.durations" :key="d" :value="d">{{ d }}s</option>
                </select>
              </div>
            </div>

            <!-- Prompt + AI Analyse -->
            <div class="space-y-2">
              <div class="flex items-center justify-between">
                <p class="text-[11px] font-medium uppercase tracking-wide text-slate-500">Prompt</p>
                <button
                  class="flex items-center gap-1 rounded-md border border-violet-500/40 bg-violet-500/10 px-2 py-0.5 text-[10px] font-medium text-violet-300 transition hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                  :disabled="makeVideoAnalysing || makeVideoBusy || makeVideoDownloading || !makeVideoPath"
                  title="AI-analyse the image and generate a video prompt"
                  @click="makeVideoAnalyse"
                >
                  <Sparkles class="h-3 w-3" :class="makeVideoAnalysing ? 'animate-pulse' : ''" />
                  {{ makeVideoAnalysing ? 'Analysing…' : 'AI Analyse' }}
                </button>
              </div>
              <p v-if="makeVideoAnalyseError" class="text-[11px] text-rose">{{ makeVideoAnalyseError }}</p>
              <textarea
                v-model="makeVideoPrompt"
                rows="5"
                class="w-full resize-y rounded-lg border border-line bg-panel px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:border-violet-400/60 focus:outline-none focus:ring-1 focus:ring-violet-400/30 transition"
                placeholder="Click 'AI Analyse' to auto-generate a video prompt, or type one…"
              />
            </div>

            <!-- Error -->
            <p v-if="makeVideoError" class="text-xs text-rose">{{ makeVideoError }}</p>

            <!-- Success -->
            <div v-if="makeVideoDone" class="flex items-center gap-2 rounded-lg border border-mint/30 bg-mint/10 px-3 py-2">
              <Check class="h-4 w-4 text-mint" />
              <span class="text-xs text-mint font-medium">Video job queued! Check the Video Queue.</span>
            </div>

            <!-- Actions -->
            <div class="flex gap-2 pt-1">
              <button class="button flex-1 gap-1.5 py-2 text-xs" @click="closeMakeVideo">Cancel</button>
              <button
                class="flex-1 rounded-lg bg-violet-600 hover:bg-violet-500 active:bg-violet-700 py-2 text-xs font-semibold text-white transition flex items-center justify-center gap-2 disabled:opacity-50"
                :disabled="makeVideoBusy || makeVideoDownloading || !makeVideoPath || !makeVideoPrompt.trim()"
                @click="submitMakeVideo"
              >
                <Clapperboard class="h-3.5 w-3.5" :class="makeVideoBusy ? 'animate-pulse' : ''" />
                {{ makeVideoBusy ? 'Submitting…' : 'Generate Video' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- ── New Job Modal (txt2img) ──────────────────────────────────────────── -->
  <Teleport to="body">
    <Transition enter-active-class="transition-opacity duration-150" enter-from-class="opacity-0" leave-active-class="transition-opacity duration-100" leave-to-class="opacity-0">
      <div v-if="showNewJob" class="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" @click.self="closeNewJob">
        <div class="surface flex w-full max-w-lg flex-col rounded-xl border border-line shadow-2xl" style="max-height: 92vh">
          <!-- header -->
          <div class="flex shrink-0 items-center justify-between border-b border-line px-5 py-3">
            <div class="flex items-center gap-2">
              <Image class="h-4 w-4 text-sky-400" />
              <h3 class="text-sm font-semibold text-white">New Image Job</h3>
            </div>
            <button class="button h-7 w-7 p-0" :disabled="newJobBusy" @click="showNewJob = false">
              <X class="h-4 w-4" />
            </button>
          </div>

          <!-- body -->
          <div class="overflow-y-auto px-5 py-4 space-y-4">

            <!-- Model -->
            <div class="space-y-1">
              <p class="text-[11px] font-medium uppercase tracking-wide text-slate-500">Model</p>
              <select v-model="newJobModel" class="field w-full text-xs" :disabled="newJobBusy">
                <option v-for="m in IMAGE_MODELS" :key="m.value" :value="m.value">{{ m.label }}</option>
              </select>
            </div>

            <!-- Size / aspect -->
            <div class="space-y-1">
              <div class="flex items-center justify-between">
                <p class="text-[11px] font-medium uppercase tracking-wide text-slate-500">Size</p>
                <span class="text-[10px] text-slate-500">
                  <template v-if="newJobModelCaps.sizeMode === 'aspect'">
                    {{ newJobAspect }} · {{ newJobResolution.toUpperCase() }}
                  </template>
                  <template v-else>
                    {{ (() => { const ar = ASPECT_RATIOS.find(a => a.value === newJobAspect) ?? ASPECT_RATIOS[1]; const sc = RESOLUTIONS.find(r => r.value === newJobResolution)?.scale ?? 1; return `${ar.w * sc}×${ar.h * sc} px`; })() }}
                  </template>
                </span>
              </div>
              <div class="grid grid-cols-5 gap-1">
                <button
                  v-for="ar in ASPECT_RATIOS"
                  :key="ar.value"
                  class="rounded-md border py-1 text-[10px] transition"
                  :class="newJobAspect === ar.value ? 'border-sky-500/60 bg-sky-500/15 text-sky-300' : 'border-line text-slate-500 hover:border-slate-500'"
                  :disabled="newJobBusy"
                  @click="newJobAspect = ar.value"
                >{{ ar.label }}</button>
              </div>
              <!-- Resolution row (aspect-mode models) -->
              <div v-if="newJobModelCaps.sizeMode === 'aspect'" class="flex gap-2">
                <button
                  v-for="res in RESOLUTIONS"
                  :key="res.value"
                  class="flex-1 rounded-md border py-1 text-[10px] transition"
                  :class="newJobResolution === res.value ? 'border-sky-500/60 bg-sky-500/15 text-sky-300' : 'border-line text-slate-500 hover:border-slate-500'"
                  :disabled="newJobBusy"
                  @click="newJobResolution = res.value"
                >{{ res.label }}</button>
              </div>
            </div>

            <!-- Quality (GPT-family only) -->
            <div v-if="newJobModelCaps.quality" class="space-y-1">
              <p class="text-[11px] font-medium uppercase tracking-wide text-slate-500">Quality</p>
              <div class="flex gap-2">
                <button
                  v-for="q in ['auto','low','medium','high']"
                  :key="q"
                  class="flex-1 rounded-md border py-1 text-[10px] capitalize transition"
                  :class="newJobQuality === q ? 'border-sky-500/60 bg-sky-500/15 text-sky-300' : 'border-line text-slate-500 hover:border-slate-500'"
                  :disabled="newJobBusy"
                  @click="newJobQuality = q as 'auto'|'low'|'medium'|'high'"
                >{{ q }}</button>
              </div>
            </div>

            <!-- Output format (when model supports it) -->
            <div v-if="newJobModelCaps.formats.length > 0" class="space-y-1">
              <p class="text-[11px] font-medium uppercase tracking-wide text-slate-500">Format</p>
              <div class="flex gap-2">
                <button
                  v-for="fmt in newJobModelCaps.formats"
                  :key="fmt"
                  class="flex-1 rounded-md border py-1 text-[10px] uppercase transition"
                  :class="newJobFormat === fmt ? 'border-sky-500/60 bg-sky-500/15 text-sky-300' : 'border-line text-slate-500 hover:border-slate-500'"
                  :disabled="newJobBusy"
                  @click="newJobFormat = fmt as 'png'|'jpeg'|'webp'"
                >{{ fmt }}</button>
              </div>
            </div>

            <!-- Strength (Z-Image Turbo only) -->
            <div v-if="newJobModelCaps.strength" class="space-y-1">
              <div class="flex items-center justify-between">
                <p class="text-[11px] font-medium uppercase tracking-wide text-slate-500">Strength</p>
                <span class="text-[10px] text-slate-400">{{ newJobStrength.toFixed(2) }}</span>
              </div>
              <input type="range" min="0" max="1" step="0.05" v-model.number="newJobStrength" class="w-full" :disabled="newJobBusy" />
            </div>

            <!-- Prompt -->
            <div class="space-y-2">
              <div class="flex items-center justify-between">
                <p class="text-[11px] font-medium uppercase tracking-wide text-slate-500">Prompt</p>
                <button
                  class="flex items-center gap-1 rounded-md border border-violet-500/40 bg-violet-500/10 px-2 py-0.5 text-[10px] font-medium text-violet-300 transition hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                  :disabled="newJobEnhancing || newJobBusy || !newJobRoughPrompt.trim()"
                  title="Let AI expand and polish your rough prompt for the selected model"
                  @click="newJobEnhance"
                >
                  <Sparkles class="h-3 w-3" :class="newJobEnhancing ? 'animate-pulse' : ''" />
                  {{ newJobEnhancing ? 'Enhancing…' : 'AI Enhance' }}
                </button>
              </div>
              <p v-if="newJobEnhanceErr" class="text-[11px] text-rose">{{ newJobEnhanceErr }}</p>
              <!-- Rough idea input -->
              <textarea
                v-model="newJobRoughPrompt"
                rows="2"
                class="w-full resize-none rounded-lg border border-line bg-panel px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:border-violet-400/60 focus:outline-none focus:ring-1 focus:ring-violet-400/30 transition"
                placeholder="Enter your rough idea… (e.g. 'a dragon in a misty forest at dusk')"
                :disabled="newJobBusy"
              />
              <!-- Enhanced / final prompt -->
              <textarea
                v-model="newJobPrompt"
                rows="5"
                class="w-full resize-y rounded-lg border border-line bg-panel px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:border-sky-400/60 focus:outline-none focus:ring-1 focus:ring-sky-400/30 transition"
                placeholder="Enhanced prompt will appear here — or type your full prompt directly…"
                :disabled="newJobBusy"
              />
              <p class="text-[10px] text-slate-600">
                Type a rough idea above and click <strong class="text-violet-400">AI Enhance</strong> to expand it for the selected model, then review or edit before submitting.
              </p>
            </div>

            <div v-if="newJobDone" class="rounded-md border border-mint/40 bg-mint/10 px-3 py-2 text-xs text-mint">
              ✓ Job queued — generating in the background.
            </div>
            <div v-if="newJobError" class="rounded-md border border-rose/40 bg-rose/10 px-3 py-2 text-xs text-rose">
              {{ newJobError }}
            </div>
          </div>

          <!-- footer -->
          <div class="flex shrink-0 items-center justify-end gap-2 border-t border-line px-5 py-3">
            <button class="button h-8 px-3 text-sm" :disabled="newJobBusy" @click="showNewJob = false">
              {{ newJobDone ? 'Close' : 'Cancel' }}
            </button>
            <button
              class="flex h-8 items-center gap-1.5 rounded-md border border-sky-500/60 bg-sky-500/15 px-3 text-sm text-sky-300 transition hover:bg-sky-500/25 disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="newJobBusy || !(newJobPrompt.trim() || newJobRoughPrompt.trim())"
              @click="submitNewJob"
            >
              <Image class="h-3.5 w-3.5" :class="newJobBusy ? 'animate-pulse' : ''" />
              {{ newJobBusy ? 'Submitting…' : newJobDone ? 'Submit another' : 'Generate Image' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- ── Topaz Config Modal (fire-and-forget) ──────────────────────────────── -->
  <Teleport to="body">
    <Transition enter-active-class="transition-opacity duration-150" enter-from-class="opacity-0" leave-active-class="transition-opacity duration-100" leave-to-class="opacity-0">
      <div v-if="topazConfigJob" class="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" @click.self="closeTopazFromJob">
        <div class="surface w-full max-w-sm rounded-xl border border-line shadow-2xl">
          <!-- Header -->
          <div class="flex items-center justify-between border-b border-line px-4 py-3">
            <div class="flex items-center gap-2">
              <Zap class="h-4 w-4 text-amber-400" />
              <h3 class="text-sm font-semibold text-white">Upscale with Topaz Labs</h3>
            </div>
            <button class="button h-7 w-7 p-0" @click="closeTopazFromJob"><X class="h-4 w-4" /></button>
          </div>
          <!-- Body -->
          <div class="flex flex-col gap-3 p-4">
            <p class="text-xs text-slate-400">
              The job will run in the background — you can close this dialog and continue working.
            </p>
            <!-- Model selector -->
            <div class="flex flex-col gap-1">
              <label class="text-xs text-slate-400">Model</label>
              <select v-model="topazModel" class="field text-sm">
                <option v-for="m in TOPAZ_MODELS" :key="m" :value="m">{{ m }}</option>
              </select>
              <p class="text-[11px] text-slate-500">
                <template v-if="topazModel === 'Standard V2'">Precision upscaling — best for clean enlargement.</template>
                <template v-else-if="topazModel === 'Wonder 2'">Generative upscaling — adds creative detail.</template>
                <template v-else-if="topazModel === 'Bloom Creative'">Creative AI upscaling — highly enhanced output.</template>
                <template v-else>Realism-focused AI upscaling — natural-looking results.</template>
              </p>
            </div>
            <!-- Output format -->
            <div class="flex flex-col gap-1">
              <label class="text-xs text-slate-400">Output format</label>
              <div class="flex gap-2">
                <label
                  v-for="fmt in (['jpeg', 'png'] as const)"
                  :key="fmt"
                  class="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md border py-1.5 text-xs transition"
                  :class="topazFormat === fmt ? 'border-amber-500/60 bg-amber-500/10 text-amber-300' : 'border-line text-slate-400 hover:border-slate-500'"
                >
                  <input v-model="topazFormat" type="radio" :value="fmt" class="sr-only" aria-label="Output format" />
                  {{ fmt.toUpperCase() }}
                </label>
              </div>
            </div>
            <div v-if="topazSubmitError" class="rounded-md border border-rose/40 bg-rose/10 px-3 py-2 text-xs text-rose">
              {{ topazSubmitError }}
            </div>
          </div>
          <!-- Footer -->
          <div class="flex items-center justify-end gap-2 border-t border-line px-4 py-3">
            <button class="button h-8 px-3 text-sm" @click="closeTopazFromJob">Cancel</button>
            <button
              class="flex h-8 items-center gap-1.5 rounded-md border border-amber-500/60 bg-amber-500/15 px-3 text-sm text-amber-300 transition hover:bg-amber-500/25"
              @click="submitTopazFromJob"
            >
              <Zap class="h-3.5 w-3.5" />
              Queue Upscale Job
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- ── Topaz Jobs section ─────────────────────────────────────────────────── -->
  <div v-if="topazJobs.length > 0" class="mt-6 flex flex-col gap-3">
    <!-- Section header -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <Zap class="h-4 w-4 text-amber-400" />
        <h2 class="text-sm font-semibold text-white">Topaz Upscale Jobs</h2>
        <span class="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-300">{{ topazJobs.length }}</span>
      </div>
      <button class="button h-7 gap-1.5 px-2 text-xs" title="Refresh Topaz jobs" @click="loadTopazJobs">
        <RefreshCcw class="h-3 w-3" />
        Refresh
      </button>
    </div>

    <!-- Job rows -->
    <div class="flex flex-col gap-2">
      <div
        v-for="tj in topazJobs"
        :key="tj.id"
        class="rounded-lg border border-line bg-ink/40 p-3"
      >
        <div class="flex items-start gap-3">
          <!-- Thumbnail (only when done) -->
          <button
            v-if="tj.result_path && tj.status === 'completed'"
            class="group relative h-16 w-16 shrink-0 overflow-hidden rounded-md border border-line transition hover:border-mint/50"
            title="Click to preview"
            @click="previewTopazResult(tj.result_path)"
          >
            <img
              :src="convertFileSrc(tj.result_path)"
              class="h-full w-full object-cover"
              alt="Upscaled result"
            />
            <div class="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition group-hover:opacity-100">
              <Image class="h-4 w-4 text-white" />
            </div>
          </button>
          <!-- Placeholder while processing -->
          <div
            v-else-if="tj.status === 'processing'"
            class="flex h-16 w-16 shrink-0 items-center justify-center rounded-md border border-dashed border-amber-500/30 bg-amber-500/5"
          >
            <Zap class="h-5 w-5 animate-pulse text-amber-400" />
          </div>

          <!-- Status + filename -->
          <div class="flex min-w-0 flex-1 flex-col gap-1">
            <div class="flex items-center gap-2">
              <span class="inline-block h-2 w-2 shrink-0 rounded-full" :class="TOPAZ_STATUS_DOT[tj.status] ?? 'bg-slate-500'" />
              <span class="text-xs font-medium text-white">{{ TOPAZ_STATUS_LABEL[tj.status] ?? tj.status }}</span>
              <span class="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-300">{{ tj.model }}</span>
            </div>
            <p class="truncate text-[11px] text-slate-500" :title="tj.original_filename">{{ tj.original_filename }}</p>
            <p v-if="tj.result_path" class="truncate text-[11px] text-mint" :title="tj.result_path">
              ✓ {{ tj.result_path.split('/').pop() }}
            </p>
            <p v-if="tj.error_msg" class="text-[11px] text-rose">{{ tj.error_msg }}</p>

            <!-- Action row for completed jobs -->
            <div v-if="tj.result_path && tj.status === 'completed'" class="mt-1 flex flex-wrap items-center gap-1.5">
              <button
                class="flex h-6 items-center gap-1 rounded border border-mint/40 bg-mint/10 px-2 text-[11px] text-mint transition hover:bg-mint/20"
                title="Preview result image"
                @click="previewTopazResult(tj.result_path)"
              >
                <Image class="h-3 w-3" />
                Preview
              </button>
              <button
                class="flex h-6 items-center gap-1 rounded border border-line px-2 text-[11px] text-slate-300 transition hover:border-slate-400"
                title="Reveal in Finder / Explorer"
                @click="revealTopazResult(tj.result_path)"
              >
                <FolderOpen class="h-3 w-3" />
                Reveal
              </button>
              <button
                class="flex h-6 items-center gap-1 rounded border border-accent/40 bg-accent/10 px-2 text-[11px] text-accent transition hover:bg-accent/20"
                title="Generate AI post text"
                @click="openPostForTopazJob(tj.result_path)"
              >
                <Sparkles class="h-3 w-3" />
                Post
              </button>
            </div>
          </div>

          <!-- Delete button -->
          <button
            class="button h-7 w-7 shrink-0 p-0 hover:border-rose/50 hover:text-rose"
            title="Remove from list"
            @click="deleteTopazJob(tj.id)"
          >
            <Trash2 class="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- ── Topaz result preview lightbox ─────────────────────────────────────── -->
  <Teleport to="body">
    <Transition enter-active-class="transition-opacity duration-150" enter-from-class="opacity-0" leave-active-class="transition-opacity duration-100" leave-to-class="opacity-0">
      <div
        v-if="topazPreviewPath"
        class="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 p-4"
        @click.self="closeTopazPreview"
      >
        <div class="relative flex max-h-full max-w-full flex-col items-center">
          <!-- Close + Reveal toolbar -->
          <div class="mb-2 flex items-center gap-2 self-end">
            <button
              class="flex h-8 items-center gap-1.5 rounded border border-line bg-ink px-3 text-xs text-slate-300 transition hover:border-slate-400"
              @click="revealTopazResult(topazPreviewPath)"
            >
              <FolderOpen class="h-3.5 w-3.5" />
              Reveal in Finder
            </button>
            <button class="button h-8 w-8 p-0" @click="closeTopazPreview">
              <X class="h-4 w-4" />
            </button>
          </div>
          <!-- Full image -->
          <img
            :src="convertFileSrc(topazPreviewPath)"
            class="max-h-[80vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
            :alt="topazPreviewPath.split('/').pop()"
          />
          <p class="mt-2 text-[11px] text-slate-500">{{ topazPreviewPath.split('/').pop() }}</p>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- ── AI Post Generation Modal ──────────────────────────────────────────── -->
  <Teleport to="body">
    <Transition enter-active-class="transition-opacity duration-150" enter-from-class="opacity-0" leave-active-class="transition-opacity duration-100" leave-to-class="opacity-0">
      <div
        v-if="showPostModal"
        class="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4"
        @click.self="closePostModal"
      >
        <div class="surface w-full max-w-lg rounded-xl border border-line shadow-2xl">
          <!-- Header -->
          <div class="flex items-center justify-between border-b border-line px-4 py-3">
            <div class="flex items-center gap-2">
              <Sparkles class="h-4 w-4 text-accent" />
              <h3 class="text-sm font-semibold text-white">AI Post Generator</h3>
            </div>
            <button class="button h-7 w-7 p-0" @click="closePostModal"><X class="h-4 w-4" /></button>
          </div>

          <!-- Downloading spinner -->
          <div v-if="postDownloading" class="flex items-center gap-3 p-4 text-slate-400">
            <RefreshCcw class="h-4 w-4 animate-spin shrink-0" />
            <p class="text-sm">Preparing image…</p>
          </div>
          <div v-else-if="postDownloadErr" class="p-4 text-xs text-rose">{{ postDownloadErr }}</div>

          <template v-else>
            <!-- Network selector -->
            <div class="flex flex-wrap gap-1.5 border-b border-line px-4 py-3">
              <button
                v-for="net in POST_NETWORKS"
                :key="net.id"
                class="rounded-md border px-2.5 py-1 text-xs transition"
                :class="postNetwork === net.id
                  ? 'border-accent bg-accent/15 text-accent'
                  : 'border-line text-slate-400 hover:border-slate-500 hover:text-slate-200'"
                @click="postNetwork = net.id"
              >{{ net.label }}</button>
            </div>
            <!-- AiPostPanel -->
            <div class="max-h-[70vh] overflow-y-auto p-4">
              <AiPostPanel
                :image-paths="postImagePath ? [postImagePath] : []"
                :image-path="postImagePath ?? undefined"
                :network="postNetwork"
                :network-name="POST_NETWORKS.find(n => n.id === postNetwork)?.label ?? postNetwork"
                :allow-text-send="true"
              />
            </div>
          </template>
        </div>
      </div>
    </Transition>
  </Teleport>

</template>
