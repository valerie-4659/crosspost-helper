<script setup lang="ts">
import { computed, inject, onMounted, onUnmounted, ref, watch } from "vue";
import type { AppPage } from "@/components/SidebarNavigation.vue";
import { Check, Copy, FolderOpen, Image, X } from "lucide-vue-next";

const props = defineProps<{ imagePaths: string[]; disabled?: boolean }>();

// ── Models ────────────────────────────────────────────────────────────────────
// Order matches Wavespeed image generator dropdown (Jun 2026)
const IMAGE_MODELS = [
  { value: "gpt_image_2",     label: "GPT Image 2",     badge: "NEW" },
  { value: "nano_banana_2",   label: "Nano Banana 2",   badge: "HOT" },
  { value: "nano_banana_pro", label: "Nano Banana Pro", badge: "HOT" },
  { value: "nano_banana",     label: "Nano Banana"              },
  { value: "seedream_5_lite", label: "Seedream 5 Lite"          },
  { value: "seedream_4_5",    label: "Seedream 4.5",    badge: "HOT" },
  { value: "gpt_image_1_5",   label: "GPT Image 1.5"            },
  { value: "qwen_image_2",    label: "Qwen Image 2.0"           },
  { value: "qwen_image",      label: "Qwen Image"               },
  { value: "wan_2_7_img",     label: "WAN 2.7",         badge: "HOT" },
  { value: "wan_2_6_img",     label: "WAN 2.6"                  },
  { value: "wan_2_5_img",     label: "WAN 2.5"                  },
  { value: "flux_2_klein",    label: "FLUX 2 Klein"             },
  { value: "z_image_turbo",   label: "Z-Image Turbo"            },
];

// ── Aspect ratios ─────────────────────────────────────────────────────────────
// Base pixel sizes at 1K. Multiply W and H by resolutionScale for 2K/4K.
const ASPECT_RATIOS = [
  { value: "auto",  label: "Auto",     ratio: 1,       w: 1024, h: 1024 },
  { value: "1:1",   label: "1:1",      ratio: 1,       w: 1024, h: 1024 },
  { value: "16:9",  label: "16:9",     ratio: 16/9,    w: 1824, h: 1024 },
  { value: "9:16",  label: "9:16",     ratio: 9/16,    w: 1024, h: 1824 },
  { value: "4:3",   label: "4:3",      ratio: 4/3,     w: 1360, h: 1024 },
  { value: "3:4",   label: "3:4",      ratio: 3/4,     w: 1024, h: 1360 },
  { value: "3:2",   label: "3:2",      ratio: 3/2,     w: 1536, h: 1024 },
  { value: "2:3",   label: "2:3",      ratio: 2/3,     w: 1024, h: 1536 },
  { value: "4:5",   label: "4:5",      ratio: 4/5,     w: 816,  h: 1024 },
  { value: "5:4",   label: "5:4",      ratio: 5/4,     w: 1280, h: 1024 },
  { value: "21:9",  label: "21:9",     ratio: 21/9,    w: 2392, h: 1024 },
  { value: "9:21",  label: "9:21",     ratio: 9/21,    w: 1024, h: 2392 },
  { value: "2:1",   label: "2:1",      ratio: 2,       w: 2048, h: 1024 },
  { value: "1:2",   label: "1:2",      ratio: 0.5,     w: 1024, h: 2048 },
];

const RESOLUTIONS = [
  { value: "1k", label: "1K", scale: 1 },
  { value: "2k", label: "2K", scale: 2 },
  { value: "4k", label: "4K", scale: 4 },
];

const QUALITIES  = ["auto", "low", "medium", "high"] as const;
const FORMATS    = ["png", "jpeg", "webp"]            as const;

// ── Model capability map (mirrors IMAGE_MODEL_CAPS in main.cjs) ───────────────
// sizeMode "aspect" → send aspect_ratio + resolution  (GPT / Nano Banana)
//          "wh"     → send size "W*H"                 (Seedream, Qwen, WAN, FLUX, Z-Image)
// quality  true     → show & send quality dropdown    (GPT family only)
// formats  []       → hide format selector;  list     → allowed output_format values
// strength true     → show strength slider            (Z-Image Turbo only)
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

// ── State ─────────────────────────────────────────────────────────────────────
const selectedModel      = ref("gpt_image_2");
const selectedAspect     = ref("auto");
const selectedResolution = ref("1k");
const selectedQuality    = ref<typeof QUALITIES[number]>("medium");
const selectedFormat     = ref<typeof FORMATS[number]>("png");
const zStrength          = ref(0.6);
const useRefImage        = ref(true);
const instructions       = ref("");
const generating         = ref(false);
const generateError      = ref("");
const generatedPrompt    = ref("");
const copied             = ref(false);

const wavespeedAvailable = ref(false);
const wsSubmitting       = ref(false);
const wsSubmitted        = ref(false);
const wsError            = ref("");

// ── Live job tracking ──────────────────────────────────────────────────────
const wsTrackedLocalId   = ref<string | null>(null);
const wsTrackedStatus    = ref<"created" | "processing" | "completed" | "failed" | "">("");
const wsTrackedResultUrl = ref<string | null>(null);
const wsTrackedJobError  = ref<string | null>(null);
const wsCopiedUrl        = ref(false);
const wsDownloading      = ref(false);
const wsDownloadedPath   = ref<string | null>(null);

// ── Path helpers (no Node.js available in renderer) ───────────────────────
function pathDirname(p: string)       { return p.replace(/[\\/][^\\/]+$/, ""); }
function pathBasenameNoExt(p: string) { return p.replace(/.*[\\/]/, "").replace(/\.[^.]+$/, ""); }
function sanitizeForFilename(s: string){ return s.replace(/[^a-z0-9_-]/gi, "_").toLowerCase(); }
function dateStamp(): string {
  const d = new Date(), z = (n: number) => String(n).padStart(2, "0");
  return `${z(d.getDate())}${z(d.getMonth() + 1)}${d.getFullYear()}${z(d.getHours())}${z(d.getMinutes())}`;
}

const setPage = inject<(page: AppPage) => void>("setPage");
const setGenerationQueueTab = inject<(tab: "images" | "videos") => void>("setGenerationQueueTab");

// Capabilities of the currently selected model
const modelCaps = computed(() =>
  IMAGE_MODEL_CAPS[selectedModel.value] ?? { sizeMode: "wh", quality: false, formats: [], strength: false }
);

// Reset format to "png" if the current selection is unsupported by the new model
watch(selectedModel, () => {
  const fmts = modelCaps.value.formats;
  if (fmts.length > 0 && !fmts.includes(selectedFormat.value)) {
    selectedFormat.value = fmts[0] as typeof FORMATS[number];
  }
  generatedPrompt.value = "";
  resetWavespeed();
});

// Compute the `size` string to send to the API: "WxH" scaled by resolution
function computeSize(): string {
  const ar = ASPECT_RATIOS.find(a => a.value === selectedAspect.value) ?? ASPECT_RATIOS[1];
  const scale = RESOLUTIONS.find(r => r.value === selectedResolution.value)?.scale ?? 1;
  return `${ar.w * scale}*${ar.h * scale}`;
}

// Auto-detect closest aspect ratio from image dimensions
function closestAspect(w: number, h: number): string {
  const ratio = w / h;
  let best = "1:1";
  let bestDiff = Infinity;
  for (const ar of ASPECT_RATIOS) {
    if (ar.value === "auto") continue;
    const diff = Math.abs(ar.ratio - ratio);
    if (diff < bestDiff) { bestDiff = diff; best = ar.value; }
  }
  return best;
}

async function detectAspectFromImage() {
  const p = props.imagePaths[0];
  if (!p) return;
  try {
    const dims = await window.desktop.wavespeed.getImageDimensions(p);
    if (dims && dims.width && dims.height) {
      selectedAspect.value = closestAspect(dims.width, dims.height);
    }
  } catch { /* ignore */ }
}

onMounted(async () => {
  const rows = await window.desktop.db.select<Array<{ value: string }>>(
    "SELECT value FROM ai_config WHERE key = 'wavespeed_api_key'",
  );
  wavespeedAvailable.value = Boolean(rows[0]?.value);
  await detectAspectFromImage();

  window.desktop.wavespeed.onImageJobUpdated((data) => {
    if (!wsTrackedLocalId.value || data.id !== wsTrackedLocalId.value) return;
    if (data.status)                    wsTrackedStatus.value    = data.status as typeof wsTrackedStatus.value;
    if (data.result_url !== undefined)  wsTrackedResultUrl.value = data.result_url ?? null;
    if (data.error_msg !== undefined)   wsTrackedJobError.value  = data.error_msg ?? null;
  });
});

onUnmounted(() => {
  window.desktop.wavespeed.offImageJobUpdated();
});

watch(() => props.imagePaths[0], () => {
  generatedPrompt.value = "";
  generateError.value   = "";
  instructions.value    = "";
  detectAspectFromImage();
  resetWavespeed();
});

// ── Prompt generation ─────────────────────────────────────────────────────────
async function generate() {
  if (!props.imagePaths.length) return;
  generating.value     = true;
  generateError.value  = "";
  generatedPrompt.value = "";
  resetWavespeed();
  try {
    generatedPrompt.value = await window.desktop.ai.generateImagePrompt(
      props.imagePaths,
      selectedModel.value,
      instructions.value.trim(),
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
  if (p) window.desktop?.opener?.revealItemInDir?.(p);
}

// ── Wavespeed submission ──────────────────────────────────────────────────────
async function submitToWavespeed() {
  const imagePath = props.imagePaths[0];
  if (!imagePath && !generatedPrompt.value) return;
  wsSubmitting.value = true;
  wsSubmitted.value  = false;
  wsError.value      = "";
  try {
    const result = await window.desktop.wavespeed.submitImage({
      imagePath:    useRefImage.value ? (imagePath ?? "") : "",
      prompt:       generatedPrompt.value,
      imageModel:   selectedModel.value,
      aspectRatio:  selectedAspect.value,
      resolution:   selectedResolution.value,
      size:         computeSize(),
      useRefImage:  useRefImage.value,
      quality:      selectedQuality.value,
      outputFormat: selectedFormat.value,
      strength:     zStrength.value,
    });
    wsSubmitted.value        = true;
    wsTrackedLocalId.value   = result.localId ?? null;
    wsTrackedStatus.value    = (result.status as typeof wsTrackedStatus.value) || "created";
    wsTrackedResultUrl.value = result.outputs?.[0] ?? null;
    wsTrackedJobError.value  = result.error ?? null;
  } catch (err) {
    wsError.value = err instanceof Error ? err.message : String(err);
  } finally {
    wsSubmitting.value = false;
  }
}

function resetWavespeed() {
  wsSubmitted.value        = false;
  wsError.value            = "";
  wsSubmitting.value       = false;
  wsTrackedLocalId.value   = null;
  wsTrackedStatus.value    = "";
  wsTrackedResultUrl.value = null;
  wsTrackedJobError.value  = null;
  wsCopiedUrl.value        = false;
  wsDownloading.value      = false;
  wsDownloadedPath.value   = null;
}

async function downloadToSourceFolder() {
  const sourcePath = props.imagePaths[0];
  if (!wsTrackedResultUrl.value || !sourcePath) return;
  wsDownloading.value = true;
  wsTrackedJobError.value = null;
  try {
    const destDir  = pathDirname(sourcePath);
    const baseName = pathBasenameNoExt(sourcePath);
    const model    = sanitizeForFilename(selectedModel.value);
    const ext      = selectedFormat.value || "png";
    const filename = `${baseName}_rec_${model}_${dateStamp()}.${ext}`;
    const result   = await window.desktop.wavespeed.downloadImage(wsTrackedResultUrl.value, filename, true, destDir);
    wsDownloadedPath.value = result.path;
  } catch (err) {
    wsTrackedJobError.value = err instanceof Error ? err.message : String(err);
  } finally {
    wsDownloading.value = false;
  }
}

function revealDownloadedPath() {
  if (wsDownloadedPath.value) window.desktop.opener.revealItemInDir(wsDownloadedPath.value);
}

async function copyResultUrl() {
  if (!wsTrackedResultUrl.value) return;
  await navigator.clipboard.writeText(wsTrackedResultUrl.value).catch(() => {});
  wsCopiedUrl.value = true;
  setTimeout(() => (wsCopiedUrl.value = false), 2000);
}
</script>

<template>
  <div class="space-y-3">

    <!-- Model selector (compact select) -->
    <div>
      <p class="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">Image Model</p>
      <select v-model="selectedModel" class="field w-full text-xs py-1.5">
        <option v-for="m in IMAGE_MODELS" :key="m.value" :value="m.value">
          {{ m.label }}{{ m.badge ? ` [${m.badge}]` : '' }}
        </option>
      </select>
    </div>

    <!-- Reference image checkbox -->
    <label class="flex cursor-pointer items-center gap-2 rounded-lg border border-line bg-panel px-3 py-2 hover:border-slate-500 transition">
      <input v-model="useRefImage" type="checkbox" class="h-3.5 w-3.5 accent-sky-400" />
      <span class="text-xs text-slate-300">Use reference image</span>
      <span class="ml-auto text-[10px] text-slate-600">{{ useRefImage ? 'img2img' : 'txt2img (prompt only)' }}</span>
    </label>

    <!-- Aspect ratio grid -->
    <div>
      <p class="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">Aspect Ratio</p>
      <div class="grid grid-cols-7 gap-1">
        <button
          v-for="ar in ASPECT_RATIOS" :key="ar.value"
          class="rounded border px-1.5 py-1 text-[10px] font-medium transition text-center"
          :class="selectedAspect === ar.value
            ? 'border-sky-400/60 bg-sky-400/15 text-sky-300'
            : 'border-line bg-panel text-slate-500 hover:border-slate-500 hover:text-slate-300'"
          @click="selectedAspect = ar.value"
        >{{ ar.label }}</button>
      </div>
    </div>

    <!-- Resolution · Quality · Format row -->
    <div class="flex flex-wrap gap-2">
      <!-- Resolution — always shown -->
      <div class="min-w-[120px] flex-1">
        <p class="mb-1 text-[10px] uppercase tracking-wide text-slate-500">Resolution</p>
        <div class="flex gap-1">
          <button
            v-for="r in RESOLUTIONS" :key="r.value"
            class="flex-1 rounded border py-1 text-[10px] font-medium transition"
            :class="selectedResolution === r.value
              ? 'border-sky-400/60 bg-sky-400/15 text-sky-300'
              : 'border-line bg-panel text-slate-500 hover:text-slate-300'"
            @click="selectedResolution = r.value"
          >{{ r.label }}</button>
        </div>
      </div>
      <!-- Quality — GPT family only -->
      <div v-if="modelCaps.quality" class="min-w-[90px] flex-1">
        <p class="mb-1 text-[10px] uppercase tracking-wide text-slate-500">Quality</p>
        <select v-model="selectedQuality" class="w-full rounded border border-line bg-panel px-1.5 py-1 text-[10px] text-slate-300 focus:outline-none">
          <option v-for="q in QUALITIES" :key="q" :value="q" class="capitalize">{{ q }}</option>
        </select>
      </div>
      <!-- Format — models with output_format support (GPT, Nano Banana, Z-Image Turbo) -->
      <div v-if="modelCaps.formats.length > 0" class="min-w-[90px] flex-1">
        <p class="mb-1 text-[10px] uppercase tracking-wide text-slate-500">Format</p>
        <select v-model="selectedFormat" class="w-full rounded border border-line bg-panel px-1.5 py-1 text-[10px] text-slate-300 focus:outline-none uppercase">
          <option v-for="f in modelCaps.formats" :key="f" :value="f" class="uppercase">{{ f.toUpperCase() }}</option>
        </select>
      </div>
    </div>

    <!-- Strength slider — Z-Image Turbo only -->
    <div v-if="modelCaps.strength" class="space-y-1">
      <p class="text-[10px] uppercase tracking-wide text-slate-500">
        Strength <span class="normal-case text-slate-600">({{ zStrength.toFixed(2) }} — higher = more creative)</span>
      </p>
      <input
        v-model.number="zStrength" type="range" min="0" max="1" step="0.05"
        class="w-full accent-sky-400"
        aria-label="Transformation strength"
      />
    </div>

    <!-- Size preview chip -->
    <p class="text-[10px] text-slate-600">
      <template v-if="modelCaps.sizeMode === 'aspect'">
        Output: <span class="font-mono text-slate-500">{{ selectedAspect }} · {{ selectedResolution.toUpperCase() }}</span>
        <template v-if="modelCaps.quality"> · {{ selectedQuality }}</template>
        <template v-if="modelCaps.formats.length > 0"> · {{ selectedFormat.toUpperCase() }}</template>
      </template>
      <template v-else>
        Output: <span class="font-mono text-slate-500">{{ computeSize() }}</span> px
        <template v-if="modelCaps.formats.length > 0"> · {{ selectedFormat.toUpperCase() }}</template>
        <template v-if="modelCaps.strength"> · strength {{ zStrength.toFixed(2) }}</template>
      </template>
    </p>

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
        {{ generating ? 'Analysing image…' : 'Analyse & Generate Prompt' }}
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

    <!-- Prompt — always visible; AI generation optional -->
    <div class="space-y-2 rounded-xl border border-sky-500/20 bg-panel p-4">
      <p class="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        Recreation prompt <span class="normal-case font-normal text-slate-600">— edit or type manually, AI analysis optional</span>
      </p>
      <textarea
        v-model="generatedPrompt"
        rows="6"
        class="w-full resize-y rounded-md border border-line bg-panelSoft px-2.5 py-2 text-xs leading-relaxed text-slate-200 placeholder:text-slate-600 focus:border-sky-400/60 focus:outline-none transition"
        placeholder="Type your recreation prompt here, or click Analyse above to generate one with AI…"
      />
      <div v-if="generatedPrompt" class="flex items-center gap-2 border-t border-line pt-2.5">
        <button
          class="button h-7 flex-1 gap-1.5 px-2.5 text-xs"
          :class="copied ? 'border-mint/60 bg-mint/10 text-mint' : ''"
          @click="copyPrompt"
        >
          <Check v-if="copied" class="h-3 w-3" /><Copy v-else class="h-3 w-3" />
          {{ copied ? 'Copied!' : 'Copy' }}
        </button>
        <button class="button h-7 gap-1 px-2.5 text-xs ml-auto" @click="generatedPrompt = ''; generateError = ''; resetWavespeed()">
          <X class="h-3 w-3" />Clear
        </button>
      </div>
    </div>

    <!-- ── Send to Wavespeed ── -->
    <div v-if="wavespeedAvailable" class="space-y-2.5 rounded-xl border border-sky-500/20 bg-panel p-4">
      <p class="text-[10px] font-semibold uppercase tracking-wide text-sky-400/70">
        Recreate via Wavespeed
        <span v-if="modelCaps.sizeMode === 'aspect'" class="normal-case font-normal text-slate-600"> — {{ selectedAspect }} · {{ selectedResolution.toUpperCase() }}</span>
        <span v-else class="normal-case font-normal text-slate-600"> — {{ computeSize() }}</span>
      </p>
      <button
        v-if="!wsSubmitted && !wsSubmitting"
        class="w-full rounded-lg bg-sky-600 hover:bg-sky-500 active:bg-sky-700 py-2 text-xs font-semibold text-white transition flex items-center justify-center gap-2"
        @click="submitToWavespeed"
      >
        <Image class="h-3.5 w-3.5" />Submit Recreation Job
      </button>
      <button v-else-if="wsSubmitting" class="w-full rounded-lg bg-sky-600/50 py-2 text-xs font-semibold text-white/60 flex items-center justify-center gap-2" disabled>
        <Image class="h-3.5 w-3.5 animate-pulse" />Uploading &amp; submitting…
      </button>
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
              'text-gold':       wsTrackedStatus === 'created',
              'text-violet-300': wsTrackedStatus === 'processing',
              'text-mint':       wsTrackedStatus === 'completed',
              'text-rose':       wsTrackedStatus === 'failed',
              'text-slate-400':  !wsTrackedStatus,
            }"
          >
            {{
              wsTrackedStatus === 'created'    ? 'Queued — waiting to generate…' :
              wsTrackedStatus === 'processing' ? 'Generating…' :
              wsTrackedStatus === 'completed'  ? 'Done! Image is ready.' :
              wsTrackedStatus === 'failed'     ? 'Job failed' :
              'Job submitted'
            }}
          </span>
        </div>

        <!-- Failed error detail -->
        <p v-if="wsTrackedStatus === 'failed' && wsTrackedJobError" class="text-[11px] text-rose px-1">
          {{ wsTrackedJobError }}
        </p>

        <!-- Result URL actions when completed -->
        <div v-if="wsTrackedResultUrl" class="flex gap-1.5">
          <!-- Save to source folder -->
          <button
            v-if="!wsDownloadedPath"
            class="button h-7 flex-1 gap-1.5 px-2 text-xs border-mint/40 bg-mint/10 text-mint hover:bg-mint/20 disabled:opacity-50"
            :disabled="wsDownloading"
            @click="downloadToSourceFolder"
          >
            <FolderOpen class="h-3 w-3" :class="wsDownloading ? 'animate-pulse' : ''" />
            {{ wsDownloading ? 'Saving…' : 'Save to source folder' }}
          </button>
          <!-- After save: reveal -->
          <button
            v-else
            class="button h-7 flex-1 gap-1.5 px-2 text-xs border-mint/40 bg-mint/10 text-mint hover:bg-mint/20"
            @click="revealDownloadedPath"
          >
            <FolderOpen class="h-3 w-3" /> Reveal in Finder
          </button>
          <button
            class="button h-7 gap-1.5 px-2.5 text-xs"
            :class="wsCopiedUrl ? 'border-mint/60 bg-mint/10 text-mint' : ''"
            @click="copyResultUrl"
          >
            <Check v-if="wsCopiedUrl" class="h-3 w-3" />
            <Copy v-else class="h-3 w-3" />
            {{ wsCopiedUrl ? 'Copied!' : 'Copy URL' }}
          </button>
        </div>

        <!-- Bottom actions -->
        <div class="flex gap-2">
          <button
            class="button h-7 flex-1 gap-1.5 px-2 text-xs border-sky-500/40 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20"
            @click="setGenerationQueueTab?.('images'); setPage?.('generation-queue')"
          >
            <Image class="h-3 w-3" /> Image Queue
          </button>
          <button class="button h-7 gap-1 px-2.5 text-xs" @click="resetWavespeed">
            <X class="h-3 w-3" />New
          </button>
        </div>
      </div>
      <p v-if="wsError" class="text-xs text-rose">{{ wsError }}</p>
    </div>

    <p v-if="!wavespeedAvailable" class="text-center text-[11px] text-slate-600">
      Add a Wavespeed API key in <strong class="text-slate-500">Settings → Wavespeed AI</strong> to recreate directly.
    </p>
  </div>
</template>
