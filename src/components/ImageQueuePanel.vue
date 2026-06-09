<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { Check, ExternalLink, FolderOpen, Image, RefreshCcw, RotateCcw, Sparkles, Trash2, X } from "lucide-vue-next";

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
const IMAGE_MODEL_CAPS: Record<string, { sizeMode: "aspect" | "wh"; quality: boolean; formats: string[]; strength: boolean }> = {
  gpt_image_2:     { sizeMode: "aspect", quality: true,  formats: ["png","jpeg","webp"], strength: false },
  gpt_image_1_5:   { sizeMode: "aspect", quality: true,  formats: ["png","jpeg","webp"], strength: false },
  nano_banana_2:   { sizeMode: "aspect", quality: false, formats: ["png","jpeg"],        strength: false },
  nano_banana_pro: { sizeMode: "aspect", quality: false, formats: ["png","jpeg"],        strength: false },
  nano_banana:     { sizeMode: "aspect", quality: false, formats: ["png","jpeg"],        strength: false },
  seedream_4_5:    { sizeMode: "wh",     quality: false, formats: [],                   strength: false },
  seedream_5_lite: { sizeMode: "wh",     quality: false, formats: [],                   strength: false },
  qwen_image_2:    { sizeMode: "wh",     quality: false, formats: [],                   strength: false },
  qwen_image:      { sizeMode: "wh",     quality: false, formats: [],                   strength: false },
  wan_2_7_img:     { sizeMode: "wh",     quality: false, formats: [],                   strength: false },
  wan_2_6_img:     { sizeMode: "wh",     quality: false, formats: [],                   strength: false },
  wan_2_5_img:     { sizeMode: "wh",     quality: false, formats: [],                   strength: false },
  flux_2_klein:    { sizeMode: "wh",     quality: false, formats: [],                   strength: false },
  z_image_turbo:   { sizeMode: "wh",     quality: false, formats: ["jpeg","png","webp"], strength: true  },
};

const rerunModelCaps = computed(() =>
  IMAGE_MODEL_CAPS[rerunModel.value] ?? { sizeMode: "wh", quality: false, formats: [], strength: false }
);

// Clamp format if the new model doesn't support the current selection
watch(rerunModel, () => {
  const fmts = rerunModelCaps.value.formats;
  if (fmts.length > 0 && !fmts.includes(rerunFormat.value)) {
    rerunFormat.value = fmts[0] as "png" | "jpeg" | "webp";
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
  rerunUseRef.value     = !!job.image_path;
  rerunQuality.value    = "auto";
  rerunFormat.value     = "png";
  rerunStrength.value   = 0.6;
  rerunBusy.value       = false;
  rerunError.value      = "";
  rerunDone.value       = false;
  rerunAnalysing.value  = false;
  rerunAnalyseError.value = "";
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
    const result = await window.desktop.wavespeed.submitImage({
      imagePath:    rerunJob.value?.image_path ?? "",
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

onMounted(async () => {
  await load();
  window.desktop.wavespeed.onImageJobUpdated(handleJobUpdated);
});

onUnmounted(() => {
  window.desktop.wavespeed.offImageJobUpdated();
});
</script>

<template>
  <div class="flex flex-col gap-3">
    <!-- Header -->
    <div class="flex items-center gap-2">
      <p class="text-[10px] font-semibold uppercase tracking-wide text-slate-500 flex-1">
        Image Generation Jobs
      </p>
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
            <label class="flex cursor-pointer items-center gap-2 rounded-lg border border-line bg-panel px-3 py-2 hover:border-slate-500 transition">
              <input v-model="rerunUseRef" type="checkbox" class="h-3.5 w-3.5 accent-sky-400" aria-label="Use reference image" />
              <span class="text-xs text-slate-300">Use reference image</span>
              <span class="ml-auto text-[10px] text-slate-600">{{ rerunUseRef ? 'img2img' : 'txt2img' }}</span>
            </label>

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
                :placeholder="rerunJob?.image_path ? 'Edit the prompt or click "Analyse image" to regenerate for the selected model…' : 'Enter a prompt…'"
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
                :disabled="rerunBusy || !rerunPrompt.trim()"
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
</template>
