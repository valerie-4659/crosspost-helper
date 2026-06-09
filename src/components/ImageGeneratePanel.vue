<script setup lang="ts">
import { inject, onMounted, ref, watch } from "vue";
import type { AppPage } from "@/components/SidebarNavigation.vue";
import { Check, Copy, FolderOpen, Image, X } from "lucide-vue-next";

const props = defineProps<{ imagePaths: string[]; disabled?: boolean }>();

// ── Models ────────────────────────────────────────────────────────────────────
const IMAGE_MODELS = [
  { value: "flux_2_klein",    label: "Flux 2 Klein"  },
  { value: "flux_2_turbo",    label: "Flux 2 Turbo"  },
  { value: "flux_2_dev",      label: "Flux 2 Dev"    },
  { value: "qwen_image_edit", label: "Qwen Image"    },
  { value: "nano_banana",     label: "Nano Banana"   },
  { value: "gpt_image_2",     label: "GPT Image 2"   },
  { value: "wan_2_7_img",     label: "WAN 2.7 Edit"  },
  { value: "z_image_turbo",   label: "Z Image Turbo" },
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

// ── State ─────────────────────────────────────────────────────────────────────
const selectedModel      = ref("flux_2_klein");
const selectedAspect     = ref("auto");
const selectedResolution = ref("1k");
const selectedQuality    = ref<typeof QUALITIES[number]>("medium");
const selectedFormat     = ref<typeof FORMATS[number]>("png");
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

const setPage = inject<(page: AppPage) => void>("setPage");

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
});

watch(() => props.imagePaths[0], detectAspectFromImage);

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
  if (!generatedPrompt.value) return;
  wsSubmitting.value = true;
  wsSubmitted.value  = false;
  wsError.value      = "";
  try {
    await window.desktop.wavespeed.submitImage({
      imagePath:    imagePath ?? "",
      prompt:       generatedPrompt.value,
      imageModel:   selectedModel.value,
      size:         computeSize(),
      useRefImage:  useRefImage.value,
      quality:      selectedQuality.value,
      outputFormat: selectedFormat.value,
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
          v-for="m in IMAGE_MODELS" :key="m.value"
          class="rounded-lg border px-2.5 py-1 text-[11px] font-medium transition"
          :class="selectedModel === m.value
            ? 'border-sky-400/60 bg-sky-400/15 text-sky-300'
            : 'border-line bg-panel text-slate-400 hover:border-slate-500 hover:text-slate-200'"
          @click="selectedModel = m.value; generatedPrompt = ''; resetWavespeed()"
        >{{ m.label }}</button>
      </div>
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
    <div class="grid grid-cols-3 gap-2">
      <div>
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
      <div>
        <p class="mb-1 text-[10px] uppercase tracking-wide text-slate-500">Quality</p>
        <select v-model="selectedQuality" class="w-full rounded border border-line bg-panel px-1.5 py-1 text-[10px] text-slate-300 focus:outline-none">
          <option v-for="q in QUALITIES" :key="q" :value="q" class="capitalize">{{ q }}</option>
        </select>
      </div>
      <div>
        <p class="mb-1 text-[10px] uppercase tracking-wide text-slate-500">Format</p>
        <select v-model="selectedFormat" class="w-full rounded border border-line bg-panel px-1.5 py-1 text-[10px] text-slate-300 focus:outline-none uppercase">
          <option v-for="f in FORMATS" :key="f" :value="f" class="uppercase">{{ f.toUpperCase() }}</option>
        </select>
      </div>
    </div>

    <!-- Size preview chip -->
    <p class="text-[10px] text-slate-600">
      Output: <span class="font-mono text-slate-500">{{ computeSize() }}</span> px · {{ selectedFormat.toUpperCase() }} · {{ selectedQuality }}
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

    <!-- Prompt result -->
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

    <!-- ── Send to Wavespeed ── -->
    <div v-if="generatedPrompt && wavespeedAvailable" class="space-y-2.5 rounded-xl border border-sky-500/20 bg-panel p-4">
      <p class="text-[10px] font-semibold uppercase tracking-wide text-sky-400/70">
        Recreate via Wavespeed
        <span class="normal-case font-normal text-slate-600"> — {{ computeSize() }} · {{ selectedFormat.toUpperCase() }}</span>
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
      <div v-if="wsSubmitted" class="space-y-2">
        <div class="flex items-center gap-2 rounded-lg border border-mint/30 bg-mint/10 px-3 py-2">
          <span class="h-2 w-2 rounded-full bg-mint" />
          <span class="text-xs text-mint font-medium">Job queued — generating in background</span>
        </div>
        <div class="flex gap-2">
          <button class="button h-7 flex-1 gap-1.5 px-2 text-xs border-sky-500/40 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20" @click="setPage?.('image-queue')">
            <Image class="h-3 w-3" /> Open Image Queue
          </button>
          <button class="button h-7 gap-1 px-2.5 text-xs" @click="resetWavespeed">
            <X class="h-3 w-3" />New
          </button>
        </div>
      </div>
      <p v-if="wsError" class="text-xs text-rose">{{ wsError }}</p>
    </div>

    <p v-else-if="generatedPrompt && !wavespeedAvailable" class="text-center text-[11px] text-slate-600">
      Add a Wavespeed API key in <strong class="text-slate-500">Settings → Wavespeed AI</strong> to recreate directly.
    </p>
  </div>
</template>
