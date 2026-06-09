<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { Check, Clapperboard, Copy, ExternalLink, Film, FolderOpen, RefreshCcw, RotateCcw, Sparkles, Trash2, X } from "lucide-vue-next";

const jobs = ref<WavespeedJobRecord[]>([]);
const loading = ref(false);

// ── Drop zone state ───────────────────────────────────────────────────────
const dropOver = ref(false);

function onDragOver(e: DragEvent) {
  const hasFile = e.dataTransfer?.types.includes("Files") ?? false;
  if (!hasFile) return;
  e.preventDefault();
  dropOver.value = true;
}

function onDragLeave() { dropOver.value = false; }

async function onDrop(e: DragEvent) {
  dropOver.value = false;
  e.preventDefault();
  const file = e.dataTransfer?.files?.[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) return;
  // Open re-run modal with this local file path as source image
  openNewVideoFromPath((file as unknown as { path: string }).path ?? file.name);
}

function openNewVideoFromPath(imagePath: string) {
  // Create a synthetic minimal job stub so openRerun can work
  const stub = {
    id:         "",
    job_id:     "",
    image_path: imagePath,
    prompt:     "",
    model:      "wan_2_7",
    resolution: "720p",
    duration:   8,
    status:     "created",
    video_url:  null,
    error_msg:  null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } satisfies WavespeedJobRecord;
  openRerun(stub);
}

// ── Re-run state ──────────────────────────────────────────────────────────
const rerunJob      = ref<WavespeedJobRecord | null>(null);
const rerunPrompt   = ref("");
const rerunModel    = ref("");
const rerunRes      = ref("720p");
const rerunDuration = ref(8);
const rerunBusy     = ref(false);
const rerunError    = ref("");
const rerunDone     = ref(false);
// AI prompt analysis
const rerunAnalysing      = ref(false);
const rerunAnalyseError   = ref("");

const VIDEO_MODELS_SIMPLE = [
  { value: "wan_2_2_explicit", label: "WAN 2.2 Spicy",   durationOptions: [5,8],    resolutionOptions: ["480p","720p"] },
  { value: "wan_2_5",          label: "WAN 2.5",          durationOptions: [5,8],    resolutionOptions: ["480p","720p"] },
  { value: "wan_2_6_spicy",    label: "WAN 2.6 Spicy",    durationOptions: [5,8],    resolutionOptions: ["480p","720p"] },
  { value: "wan_2_7",          label: "WAN 2.7",          durationOptions: [5,8],    resolutionOptions: ["480p","720p"] },
  { value: "wan_2_7_spicy",    label: "WAN 2.7 Spicy",    durationOptions: [5,8],    resolutionOptions: ["480p","720p"] },
  { value: "kling_v2_5",       label: "Kling V2.5 Turbo", durationOptions: [5,10],   resolutionOptions: [] },
  { value: "kling_v3_0_pro",   label: "Kling V3.0 Pro",   durationOptions: [5,10],   resolutionOptions: [] },
  { value: "grok_imagine",     label: "Grok Imagine",     durationOptions: [5],      resolutionOptions: [] },
  { value: "seedance_2_0",     label: "Seedance 2.0",     durationOptions: [5,8,10,15], resolutionOptions: ["720p","1080p"] },
  { value: "seedance_1_5_pro", label: "Seedance 1.5 Pro", durationOptions: [5,8,10], resolutionOptions: ["720p","1080p"] },
];

function currentRerunModelCfg() {
  return VIDEO_MODELS_SIMPLE.find((m) => m.value === rerunModel.value) ?? VIDEO_MODELS_SIMPLE[0];
}

const rerunModelCfg = computed(() => currentRerunModelCfg());

function openRerun(job: WavespeedJobRecord) {
  rerunJob.value          = job;
  rerunPrompt.value       = job.prompt;
  rerunModel.value        = job.model in Object.fromEntries(VIDEO_MODELS_SIMPLE.map((m) => [m.value, true]))
    ? job.model : "wan_2_7";
  rerunRes.value          = job.resolution || "720p";
  rerunDuration.value     = Number(job.duration) || 8;
  rerunBusy.value         = false;
  rerunError.value        = "";
  rerunDone.value         = false;
  rerunAnalysing.value    = false;
  rerunAnalyseError.value = "";
}

function closeRerun() {
  rerunJob.value = null;
}

async function rerunAnalyse() {
  if (!rerunJob.value?.image_path) return;
  rerunAnalysing.value    = true;
  rerunAnalyseError.value = "";
  try {
    rerunPrompt.value = await window.desktop.ai.generateVideoPrompt(
      [rerunJob.value.image_path],
      rerunModel.value,
      "",
    );
  } catch (err) {
    rerunAnalyseError.value = err instanceof Error ? err.message : String(err);
  } finally {
    rerunAnalysing.value = false;
  }
}

async function submitRerun() {
  if (!rerunJob.value?.image_path || !rerunPrompt.value.trim()) return;
  rerunBusy.value  = true;
  rerunError.value = "";
  rerunDone.value  = false;
  try {
    const result = await window.desktop.wavespeed.submit({
      imagePath:  rerunJob.value.image_path,
      prompt:     rerunPrompt.value.trim(),
      videoModel: rerunModel.value,
      resolution: rerunRes.value as "480p" | "720p",
      duration:   rerunDuration.value as 5 | 8,
    });
    // Add the new job to the top of the list
    const newJob: WavespeedJobRecord = {
      id:         result.localId ?? `wsjob_${Date.now()}`,
      job_id:     result.id,
      image_path: rerunJob.value.image_path,
      prompt:     rerunPrompt.value.trim(),
      model:      rerunModel.value,
      resolution: rerunRes.value,
      duration:   rerunDuration.value,
      status:     result.status ?? "created",
      video_url:  null,
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
  processing: "Rendering…",
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
    jobs.value = await window.desktop.wavespeed.getJobs();
  } finally {
    loading.value = false;
  }
}

function handleJobUpdated(data: Partial<WavespeedJobRecord>) {
  const idx = jobs.value.findIndex((j) => j.id === data.id);
  if (idx !== -1) {
    jobs.value[idx] = { ...jobs.value[idx], ...data };
  }
}

async function deleteJob(localId: string) {
  await window.desktop.wavespeed.deleteJob(localId);
  jobs.value = jobs.value.filter((j) => j.id !== localId);
}

function openVideo(url: string) {
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

// ── AI Post Generation ────────────────────────────────────────────────────
const POST_NETWORKS = [
  { id: "x",          label: "X / Twitter" },
  { id: "bluesky",    label: "Bluesky"     },
  { id: "civitai",    label: "CivitAI"     },
  { id: "deviantart", label: "DeviantArt"  },
  { id: "instagram",  label: "Instagram"   },
  { id: "facebook",   label: "Facebook"    },
  { id: "tumblr",     label: "Tumblr"      },
];

const showPostModal  = ref(false);
const postImagePath  = ref<string | null>(null);
const postNetwork    = ref("x");
const postHint       = ref("");
const postGenerating = ref(false);
const postResult     = ref<{ title?: string; description: string; tags: string[] } | null>(null);
const postError      = ref("");
const postCopied     = ref(false);

function openPostForJob(job: WavespeedJobRecord) {
  if (!job.image_path) return;
  showPostModal.value  = true;
  postImagePath.value  = job.image_path;
  postResult.value     = null;
  postError.value      = "";
  postHint.value       = "";
  postCopied.value     = false;
}

function closePostModal() {
  showPostModal.value = false;
  postResult.value    = null;
}

async function runGeneratePost() {
  if (!postImagePath.value || postGenerating.value) return;
  postGenerating.value = true;
  postResult.value     = null;
  postError.value      = "";
  try {
    const result = await window.desktop.ai.generatePost(
      [postImagePath.value],
      postNetwork.value,
      postHint.value.trim() || undefined,
    );
    postResult.value = result;
  } catch (err) {
    postError.value = err instanceof Error ? err.message : String(err);
  } finally {
    postGenerating.value = false;
  }
}

async function copyPostResult() {
  if (!postResult.value) return;
  const parts: string[] = [];
  if (postResult.value.title)        parts.push(postResult.value.title);
  if (postResult.value.description)  parts.push(postResult.value.description);
  if (postResult.value.tags?.length) parts.push(postResult.value.tags.join(" "));
  await navigator.clipboard.writeText(parts.join("\n\n")).catch(() => {});
  postCopied.value = true;
  setTimeout(() => { postCopied.value = false; }, 2000);
}

onMounted(async () => {
  await load();
  window.desktop.wavespeed.onJobUpdated(handleJobUpdated);
});

onUnmounted(() => {
  window.desktop.wavespeed.offJobUpdated();
});
</script>

<template>
  <div
    class="flex flex-col gap-3 rounded-xl transition-colors"
    :class="dropOver ? 'ring-2 ring-violet-500/60 bg-violet-500/5' : ''"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <!-- Header -->
    <div class="flex items-center gap-2">
      <p class="text-[10px] font-semibold uppercase tracking-wide text-slate-500 flex-1">
        Video Generation Jobs
      </p>
      <button class="button h-6 w-6 p-0" title="Refresh" @click="load">
        <RefreshCcw class="h-3 w-3" :class="loading ? 'animate-spin' : ''" />
      </button>
    </div>

    <!-- Drop hint (shown when hovering with a file) -->
    <div
      v-if="dropOver"
      class="flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-violet-500/60 py-4 text-xs font-medium text-violet-300"
    >
      <Film class="h-4 w-4" />
      Drop image to start a new video job
    </div>

    <!-- Empty state -->
    <p v-if="!loading && !jobs.length && !dropOver" class="text-center text-xs text-slate-600 py-4">
      No jobs yet — generate a prompt and click "Submit to Wavespeed".<br>
      <span class="text-slate-700">Or drop an image here to start a video job.</span>
    </p>

    <!-- Job list -->
    <div class="flex flex-col gap-2">
      <div
        v-for="job in jobs"
        :key="job.id"
        class="flex items-start gap-3 rounded-lg border border-line bg-panelSoft p-2.5"
      >
        <!-- Thumbnail -->
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
          <!-- Model + settings -->
          <p class="text-[10px] text-slate-500 truncate">
            {{ job.model }} · {{ job.resolution }} · {{ job.duration }}s
          </p>
          <!-- Prompt snippet -->
          <p class="text-[11px] text-slate-400 line-clamp-2 leading-snug">{{ job.prompt }}</p>
          <!-- Error -->
          <p v-if="job.error_msg" class="text-[11px] text-rose">{{ job.error_msg }}</p>
        </div>

        <!-- Actions -->
        <div class="flex shrink-0 flex-col gap-1">
          <button
            v-if="job.video_url"
            class="button h-6 gap-1 px-2 text-[10px] border-mint/40 bg-mint/10 text-mint hover:bg-mint/20"
            title="Open video"
            @click="openVideo(job.video_url!)"
          >
            <ExternalLink class="h-3 w-3" />Video
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
          <!-- Generate AI Post (uses reference image) -->
          <button
            v-if="job.image_path"
            class="button h-6 w-6 p-0 border-accent/40 text-accent hover:bg-accent/20"
            title="Generate AI post text (uses reference image)"
            @click="openPostForJob(job)"
          >
            <Sparkles class="h-3 w-3" />
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

    <!-- ── Re-run inline panel ──────────────────────────────────────────── -->
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
                <Clapperboard class="h-4 w-4 text-violet-300" />
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
                  <p class="mt-0.5">Original model: {{ rerunJob.model }}</p>
                </div>
              </div>

              <!-- Model selector -->
              <div>
                <p class="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">Model</p>
                <div class="flex flex-wrap gap-1.5">
                  <button
                    v-for="m in VIDEO_MODELS_SIMPLE"
                    :key="m.value"
                    class="rounded-lg border px-2.5 py-1 text-[11px] font-medium transition"
                    :class="rerunModel === m.value
                      ? 'border-accent bg-accent/15 text-accent'
                      : 'border-line bg-panel text-slate-400 hover:border-slate-500 hover:text-slate-200'"
                    @click="rerunModel = m.value"
                  >{{ m.label }}</button>
                </div>
              </div>

              <!-- Duration + Resolution -->
              <div class="flex gap-2">
                <div v-if="rerunModelCfg.resolutionOptions.length" class="flex-1 flex flex-col gap-1">
                  <label class="text-[11px] text-slate-500">Resolution</label>
                  <select v-model="rerunRes" class="field text-xs py-1">
                    <option v-for="r in rerunModelCfg.resolutionOptions" :key="r" :value="r">{{ r }}</option>
                  </select>
                </div>
                <div class="flex-1 flex flex-col gap-1">
                  <label class="text-[11px] text-slate-500">Duration</label>
                  <select v-model="rerunDuration" class="field text-xs py-1">
                    <option v-for="d in rerunModelCfg.durationOptions" :key="d" :value="d">{{ d }} seconds</option>
                  </select>
                </div>
              </div>

              <!-- Prompt + AI Analyse -->
              <div class="space-y-2">
                <div class="flex items-center justify-between">
                  <p class="text-[11px] font-medium uppercase tracking-wide text-slate-500">Prompt</p>
                  <button
                    v-if="rerunJob?.image_path"
                    class="flex items-center gap-1 rounded-md border border-violet-500/40 bg-violet-500/10 px-2 py-0.5 text-[10px] font-medium text-violet-300 transition hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                    :disabled="rerunAnalysing || rerunBusy"
                    :title="`AI-analyse the image for ${rerunModel}`"
                    @click="rerunAnalyse"
                  >
                    <Sparkles class="h-3 w-3" :class="rerunAnalysing ? 'animate-pulse' : ''" />
                    {{ rerunAnalysing ? 'Analysing…' : 'AI Analyse' }}
                  </button>
                </div>
                <p v-if="rerunAnalyseError" class="text-[11px] text-rose">{{ rerunAnalyseError }}</p>
                <textarea
                  v-model="rerunPrompt"
                  rows="6"
                  class="w-full resize-y rounded-lg border border-line bg-panel px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:border-accent/60 focus:outline-none focus:ring-1 focus:ring-accent/30 transition"
                  :placeholder="rerunJob?.image_path ? 'Edit the prompt or click AI Analyse to regenerate…' : 'Enter a prompt…'"
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
                <button
                  class="button flex-1 gap-1.5 py-2 text-xs"
                  @click="closeRerun"
                >Cancel</button>
                <button
                  class="flex-1 rounded-lg bg-violet-600 hover:bg-violet-500 active:bg-violet-700 py-2 text-xs font-semibold text-white transition flex items-center justify-center gap-2 disabled:opacity-50"
                  :disabled="rerunBusy || !rerunPrompt.trim()"
                  @click="submitRerun"
                >
                  <Clapperboard class="h-3.5 w-3.5" :class="rerunBusy ? 'animate-pulse' : ''" />
                  {{ rerunBusy ? 'Submitting…' : 'Submit Re-run' }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>

  <!-- ── AI Post Generation Modal ──────────────────────────────────────────── -->
  <Teleport to="body">
    <Transition enter-active-class="transition-opacity duration-150" enter-from-class="opacity-0" leave-active-class="transition-opacity duration-100" leave-to-class="opacity-0">
      <div
        v-if="showPostModal"
        class="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4"
        @click.self="closePostModal"
      >
        <div class="surface w-full max-w-md rounded-xl border border-line shadow-2xl">
          <!-- Header -->
          <div class="flex items-center justify-between border-b border-line px-4 py-3">
            <div class="flex items-center gap-2">
              <Sparkles class="h-4 w-4 text-accent" />
              <h3 class="text-sm font-semibold text-white">AI Post Generator</h3>
              <span class="rounded bg-violet-500/20 px-1.5 py-0.5 text-[10px] text-violet-300">uses reference image</span>
            </div>
            <button class="button h-7 w-7 p-0" @click="closePostModal"><X class="h-4 w-4" /></button>
          </div>

          <!-- Body -->
          <div class="flex flex-col gap-3 p-4">
            <!-- Network selector -->
            <div>
              <p class="mb-1.5 text-xs font-medium text-slate-400">Platform</p>
              <div class="flex flex-wrap gap-1.5">
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
            </div>

            <!-- Hint -->
            <div>
              <label class="text-xs font-medium text-slate-400">Hint <span class="text-slate-600">(optional)</span></label>
              <input
                v-model="postHint"
                class="field mt-1 w-full text-sm"
                placeholder="e.g. focus on the mood, add a call to action…"
              />
            </div>

            <!-- Error -->
            <div v-if="postError" class="rounded-md border border-rose/40 bg-rose/10 px-3 py-2 text-xs text-rose">{{ postError }}</div>

            <!-- Result -->
            <div v-if="postResult" class="rounded-lg border border-line bg-ink/40 p-3 space-y-2 max-h-60 overflow-y-auto">
              <div v-if="postResult.title">
                <p class="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Title</p>
                <p class="mt-0.5 text-xs text-white">{{ postResult.title }}</p>
              </div>
              <div v-if="postResult.description">
                <p class="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Description</p>
                <p class="mt-0.5 text-xs text-slate-300 whitespace-pre-wrap">{{ postResult.description }}</p>
              </div>
              <div v-if="postResult.tags?.length">
                <p class="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Tags</p>
                <p class="mt-0.5 text-xs text-accent">{{ postResult.tags.join(' ') }}</p>
              </div>
            </div>
          </div>

          <!-- Footer -->
          <div class="flex items-center justify-end gap-2 border-t border-line px-4 py-3">
            <button class="button h-8 px-3 text-sm" @click="closePostModal">Close</button>
            <button
              v-if="postResult"
              class="flex h-8 items-center gap-1.5 rounded-md border border-line px-3 text-sm transition hover:border-slate-400"
              @click="copyPostResult"
            >
              <Check v-if="postCopied" class="h-3.5 w-3.5 text-mint" />
              <Copy v-else class="h-3.5 w-3.5" />
              {{ postCopied ? 'Copied!' : 'Copy all' }}
            </button>
            <button
              class="flex h-8 items-center gap-1.5 rounded-md border border-accent/60 bg-accent/15 px-3 text-sm text-accent transition hover:bg-accent/25 disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="postGenerating || !postImagePath"
              @click="runGeneratePost"
            >
              <Sparkles class="h-3.5 w-3.5" :class="postGenerating ? 'animate-pulse' : ''" />
              {{ postGenerating ? 'Generating…' : postResult ? 'Regenerate' : 'Generate' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
