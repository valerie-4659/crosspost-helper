<script setup lang="ts">
import { computed, inject, onMounted, ref } from "vue";
import { BookOpen, Check, ChevronDown, Copy, Plus, Send, Sparkles, Trash2, X } from "lucide-vue-next";
import { useAiStore } from "@/stores/aiStore";
import type { StoryDecision } from "@/types/aiSettings";

const setPage = inject<(page: string) => void>("setPage");

const props = withDefaults(defineProps<{
  imagePaths: string[];
  network: string;
  networkName?: string;
  disabled?: boolean;
  /**
   * Library mode: selected image IDs to queue.
   * When provided, a "Queue for Extension" button replaces the plain "Push" button —
   * it calls setQueue + setPostContent in one step.
   */
  imageIds?: string[];
  /** Platform queue limit (x=4, bluesky=4, deviantart=1 …). Defaults to 1. */
  queueLimit?: number;
  /**
   * Queue-panel / generated-image mode.
   * When true and no imageIds are given, shows a "Send to Plugin" button.
   * If imagePath is also set, queues the image + copies text to clipboard.
   * Otherwise falls back to setPostContent only (legacy text-only mode).
   */
  allowTextSend?: boolean;
  /**
   * Absolute local path of the image to send when in allowTextSend mode.
   * When provided the button queues this file via bridge.setQueue (using the
   * path as the image ID — the bridge HTTP server serves it directly) and
   * copies the post text to the clipboard, mirroring the Library "images_only" flow.
   */
  imagePath?: string;
}>(), {
  networkName: "",
  disabled: false,
  imageIds: undefined,
  queueLimit: 1,
  allowTextSend: false,
});

const emit = defineEmits<{
  (e: "generated"): void;
  /** Fired after images + AI content were pushed to the bridge. */
  (e: "queued", count: number): void;
  /** Fired when user clicks "Mark on…" — parent should mark selection/collection as posted. */
  (e: "mark"): void;
}>();

const ai = useAiStore();

// ── Controls ──────────────────────────────────────────────────────────────────
const hint           = ref("");
const aiInstructions = ref("");
const postType    = ref<"engagement" | "qt" | "morning" | "goodnight" | "story">("engagement");
/** "" = no perspective instruction, "i" = first-person, "oc" = OC name */
const perspective = ref<"" | "i" | "oc">("");

// ── OC Names multi-select (localStorage-backed) ────────────────────────────
const LS_OC_NAMES = "crosspost_oc_names";
const savedOcNames    = ref<string[]>(JSON.parse(localStorage.getItem(LS_OC_NAMES) ?? "[]"));
const selectedOcNames = ref<string[]>([]);
const ocInput         = ref("");
const ocDropdownOpen  = ref(false);
const ocInputEl       = ref<HTMLInputElement | null>(null);

const filteredOcSuggestions = computed(() => {
  const q = ocInput.value.trim().toLowerCase();
  return savedOcNames.value.filter(
    (n) => !selectedOcNames.value.includes(n) && (q === "" || n.toLowerCase().includes(q)),
  );
});

function addOcName(name: string) {
  const trimmed = name.trim();
  if (!trimmed || selectedOcNames.value.includes(trimmed)) return;
  selectedOcNames.value.push(trimmed);
  if (!savedOcNames.value.includes(trimmed)) {
    savedOcNames.value.push(trimmed);
    localStorage.setItem(LS_OC_NAMES, JSON.stringify(savedOcNames.value));
  }
  ocInput.value = "";
  ocDropdownOpen.value = false;
}

function removeOcName(name: string) {
  selectedOcNames.value = selectedOcNames.value.filter((n) => n !== name);
}

function onOcKeydown(e: KeyboardEvent) {
  if (e.key === "Enter" || e.key === ",") {
    e.preventDefault();
    if (ocInput.value.trim()) addOcName(ocInput.value);
  } else if (e.key === "Backspace" && !ocInput.value && selectedOcNames.value.length) {
    selectedOcNames.value.pop();
  } else if (e.key === "Escape") {
    ocDropdownOpen.value = false;
  }
}

function onOcBlur() {
  setTimeout(() => { ocDropdownOpen.value = false; }, 150);
}
const qtEventName    = ref("");
const qtTagger       = ref("");
const customMaxChars = ref<number>(180);

const ALL_CHAR_PRESETS = [
  { label: "180",                value: 180 },
  { label: "280",                value: 280 },
  { label: "360",                value: 360 },
  { label: "500",                value: 500 },
  { label: "540",                value: 540 },
  { label: "720",                value: 720 },
  { label: "1 000",              value: 1000 },
  { label: "2 500",              value: 2500 },
  { label: "5 000",              value: 5000 },
  { label: "10 000",             value: 10000 },
  { label: "25 000 (Max)",       value: 25000 },
];

const showCustomMaxChars = computed(() => props.network === "x");

// Only show presets up to the effective character limit for this account tier
const effectiveMaxChars = computed(() =>
  ai.config.xPremiumPlus ? 25000 : 280,
);
const CHAR_PRESETS = computed(() =>
  ALL_CHAR_PRESETS.filter((p) => p.value <= effectiveMaxChars.value),
);
const copied      = ref(false);
const queueError  = ref("");

type SendMode = "full" | "no_tags" | "images_only";
const LS_SEND_MODE = "crosspost_send_mode";
const sendMode    = ref<SendMode>((localStorage.getItem(LS_SEND_MODE) as SendMode) ?? "full");
const sendDropdownOpen = ref(false);

const SEND_MODES: { value: SendMode; label: string; sub: string }[] = [
  { value: "full",        label: "Images, text and tags", sub: "Injects everything into the composer" },
  { value: "no_tags",     label: "Images and text",       sub: "Injects image + description, no hashtags" },
  { value: "images_only", label: "Images only",           sub: "Injects images only — text copied to clipboard" },
];

function setSendMode(m: SendMode) {
  sendMode.value = m;
  localStorage.setItem(LS_SEND_MODE, m);
  sendDropdownOpen.value = false;
}

const sendModeLabel = computed(() => SEND_MODES.find((m) => m.value === sendMode.value)?.label ?? "Send");

// ── Story mode ────────────────────────────────────────────────────────────────
const selectedStorylineId = ref<string | null>(null);
const decisions           = ref<StoryDecision[]>([]);
const useDecisions        = ref(false);

function addDecision() {
  if (decisions.value.length < 4) decisions.value.push({ emoji: "🔥", label: "" });
}
function removeDecision(i: number) {
  decisions.value.splice(i, 1);
}

// Char limit hint: 280 normal, 25000 for X Premium+
const charLimit = computed(() =>
  props.network === "x" && ai.config.xPremiumPlus ? 25000 : props.network === "x" ? 280 : null,
);
const descCharCount = computed(() => ai.editedDescription.length);

// Editable result fields live in the store so PickerPage can also read the
// user-edited values when calling sendToExtension / sendMultiPickToExtension.
// ai.editedTitle / ai.editedDescription / ai.editedTags are synced from
// generatedPost automatically inside generatePost() and cleared by clearGeneratedPost().

const POST_TYPES = [
  { value: "engagement", label: "💬 Engagement" },
  { value: "qt",         label: "🎉 QT Event" },
  { value: "morning",    label: "☀️ Good Morning" },
  { value: "goodnight",  label: "🌙 Good Night" },
  { value: "story",      label: "📖 Story" },
] as const;

const PERSPECTIVES = [
  { value: "",   label: "—" },
  { value: "i",  label: "I / Me" },
  { value: "oc", label: "OC(s)" },
] as const;

const activeDecisions = computed(() =>
  useDecisions.value ? decisions.value.filter((d) => d.label.trim()) : [],
);

async function generate() {
  if (!props.imagePaths.length) return;
  queueError.value = "";
  await ai.generatePost(
    props.imagePaths,
    props.network,
    hint.value.trim() || undefined,
    postType.value,
    perspective.value || undefined,
    perspective.value === "oc" ? selectedOcNames.value.join(", ") : "",
    postType.value === "story" ? selectedStorylineId.value : undefined,
    postType.value === "story" && activeDecisions.value.length > 0 ? activeDecisions.value : undefined,
    postType.value === "qt" ? qtEventName.value.trim() || undefined : undefined,
    postType.value === "qt" ? qtTagger.value.trim() || undefined : undefined,
    customMaxChars.value,
    aiInstructions.value.trim() || undefined,
  );
  if (ai.generatedPost) {
    // Append decisions block to description if decisions are configured
    if (postType.value === "story" && activeDecisions.value.length > 0) {
      const block = "\n\n🗳️ What happens next? Vote in the comments! ⬇️\n" +
        activeDecisions.value.map((d) => `${d.emoji} ${d.label}`).join("\n");
      ai.editedDescription += block;
    }
    emit("generated");
  }
}

const sendDone         = ref(false);
const sendTextOnlyDone = ref(false);

/** Send image to extension queue + copy text to clipboard.
 *  Used in queue-panel mode (allowTextSend=true).
 *  If imagePath prop is set: queues the file path in the bridge + copies text to clipboard.
 *  Fallback (no imagePath): sends only post content to the extension (legacy). */
async function sendTextOnly() {
  if (!ai.generatedPost) return;
  queueError.value = "";
  try {
    if (props.imagePath) {
      // Queue the image via its local path (bridge /image-file serves it directly)
      // and copy the post text to clipboard — mirrors Library "images_only" mode.
      await window.desktop.bridge.setQueue(props.network, [props.imagePath]);
      await window.desktop.bridge.clearPostContent(props.network);
      if (copyableText.value) {
        await navigator.clipboard.writeText(copyableText.value).catch(() => {});
      }
    } else {
      // Legacy: no local file available — push only the text content.
      await window.desktop.bridge.setPostContent(props.network, {
        title:       ai.editedTitle,
        description: ai.editedDescription,
        tags:        ai.editedTags.split(/\s+/).filter(Boolean),
      });
    }
    sendTextOnlyDone.value = true;
    setTimeout(() => (sendTextOnlyDone.value = false), 2500);
  } catch (err) {
    queueError.value = err instanceof Error ? err.message : String(err);
  }
}

/** Send to extension using the currently selected sendMode. */
async function sendToExtension() {
  if (!props.imageIds?.length) return;
  queueError.value = "";
  sendDropdownOpen.value = false;
  try {
    const ids = props.imageIds.slice(0, props.queueLimit ?? 1);
    await window.desktop.bridge.setQueue(props.network, ids);

    if (sendMode.value === "full") {
      await window.desktop.bridge.setPostContent(props.network, {
        title:       ai.editedTitle,
        description: ai.editedDescription,
        tags:        ai.editedTags.split(/\s+/).filter(Boolean),
      });
    } else if (sendMode.value === "no_tags") {
      await window.desktop.bridge.setPostContent(props.network, {
        title:       ai.editedTitle,
        description: ai.editedDescription,
        tags:        [],
      });
    } else {
      // images_only: clear stale content, copy text+tags to clipboard
      await window.desktop.bridge.clearPostContent(props.network);
      if (copyableText.value) {
        await navigator.clipboard.writeText(copyableText.value).catch(() => {});
      }
    }

    // Record story entry in active storyline
    if (postType.value === "story" && selectedStorylineId.value) {
      await ai.recordStoryEntry(selectedStorylineId.value, ai.editedDescription, ids[0]);
    }

    sendDone.value = true;
    setTimeout(() => (sendDone.value = false), 2500);
    emit("queued", ids.length);
  } catch (err) {
    queueError.value = err instanceof Error ? err.message : String(err);
  }
}

/** Full text ready to copy: uses the user's (possibly edited) values from the store */
const copyableText = computed(() => {
  if (!ai.generatedPost) return "";
  const parts: string[] = [];
  if (ai.editedTitle)       parts.push(ai.editedTitle);
  if (ai.editedDescription) parts.push(ai.editedDescription);
  if (ai.editedTags)        parts.push(ai.editedTags);
  return parts.join("\n\n");
});

async function copyText() {
  if (!copyableText.value) return;
  await navigator.clipboard.writeText(copyableText.value).catch(() => {});
  copied.value = true;
  setTimeout(() => (copied.value = false), 2000);
}

onMounted(async () => {
  if (!ai.personasLoaded)    await ai.loadPersonas();
  if (!ai.storylinesLoaded)  await ai.loadStorylines();
  if (!ai.configLoaded)      await ai.loadConfig();
});
</script>

<template>
  <div class="space-y-3">
    <!-- Post type selector -->
    <div>
      <p class="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">Post type</p>
      <div class="flex flex-wrap gap-1.5">
        <button
          v-for="pt in POST_TYPES"
          :key="pt.value"
          class="rounded-lg border px-2.5 py-1 text-[11px] font-medium transition"
          :class="postType === pt.value
            ? 'border-accent bg-accent/15 text-accent'
            : 'border-line bg-panel text-slate-400 hover:border-slate-500 hover:text-slate-200'"
          @click="postType = pt.value"
        >{{ pt.label }}</button>
      </div>
    </div>

    <!-- QT Event name (only for QT Event post type) -->
    <div v-if="postType === 'qt'">
      <p class="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">Event Name <span class="normal-case text-slate-600">(optional)</span></p>
      <input
        v-model="qtEventName"
        class="w-full rounded-lg border border-line bg-panelSoft px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:border-accent/60 focus:outline-none focus:ring-1 focus:ring-accent/30 transition"
        placeholder="e.g. Foxy Friday, Spicy Thursday…"
      />
      <p class="mt-1 text-[11px] text-slate-600">Used as the theme in line 1 of the QT post. If empty, AI derives it from the image.</p>
      <!-- QT Tagger handle -->
      <p class="mt-2 mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">Tagged by <span class="normal-case text-slate-600">(optional)</span></p>
      <input
        v-model="qtTagger"
        class="w-full rounded-lg border border-line bg-panelSoft px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:border-accent/60 focus:outline-none focus:ring-1 focus:ring-accent/30 transition"
        placeholder="e.g. @SomeUser"
      />
      <p class="mt-1 text-[11px] text-slate-600">Generates <span class="font-mono text-slate-400">TFTT @handle</span> as line 3 of the post.</p>
    </div>

    <!-- Max post length (all X posts) -->
    <div v-if="showCustomMaxChars" class="flex items-center gap-3">
      <p class="shrink-0 text-[11px] font-medium uppercase tracking-wide text-slate-500">Max length</p>
      <div class="relative flex-1">
        <select
          :value="customMaxChars"
          class="w-full appearance-none rounded-lg border border-line bg-panelSoft px-2.5 py-1.5 pr-7 text-xs text-slate-200 focus:border-accent/60 focus:outline-none focus:ring-1 focus:ring-accent/30 transition"
          @change="customMaxChars = Number(($event.target as HTMLSelectElement).value)"
        >
          <option v-for="p in CHAR_PRESETS" :key="p.value" :value="p.value">{{ p.label }}</option>
        </select>
        <svg class="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
      </div>
    </div>

    <!-- Perspective (optional) -->
    <div>
      <p class="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">Perspective <span class="normal-case text-slate-600">(optional)</span></p>
      <div class="flex items-center gap-1.5">
        <button
          v-for="pv in PERSPECTIVES"
          :key="pv.value"
          class="rounded-lg border px-2.5 py-1 text-[11px] font-medium transition"
          :class="perspective === pv.value
            ? 'border-accent bg-accent/15 text-accent'
            : 'border-line bg-panel text-slate-400 hover:border-slate-500 hover:text-slate-200'"
          @click="perspective = pv.value"
        >{{ pv.label }}</button>
        <!-- OC multi-name chip input -->
        <div v-if="perspective === 'oc'" class="relative ml-1 min-w-0 flex-1">
          <div
            class="flex flex-wrap items-center gap-1 rounded-lg border border-line bg-panelSoft px-2 py-1 min-h-[28px] cursor-text transition focus-within:border-accent/60 focus-within:ring-1 focus-within:ring-accent/30"
            @click="ocInputEl?.focus()"
          >
            <span
              v-for="name in selectedOcNames"
              :key="name"
              class="flex items-center gap-0.5 rounded bg-accent/20 px-1.5 py-0.5 text-[10px] text-accent"
            >
              {{ name }}
              <button type="button" class="hover:text-red-400 transition-colors" @click.stop="removeOcName(name)">
                <X class="h-2.5 w-2.5" />
              </button>
            </span>
            <input
              ref="ocInputEl"
              v-model="ocInput"
              class="min-w-[80px] flex-1 bg-transparent text-xs text-slate-200 placeholder:text-slate-600 outline-none"
              placeholder="Name + Enter…"
              @keydown="onOcKeydown"
              @focus="ocDropdownOpen = true"
              @blur="onOcBlur"
            />
          </div>
          <!-- Autocomplete dropdown -->
          <ul
            v-if="ocDropdownOpen && filteredOcSuggestions.length"
            class="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-line bg-panel shadow-lg"
          >
            <li
              v-for="name in filteredOcSuggestions"
              :key="name"
              class="cursor-pointer px-3 py-1.5 text-xs text-slate-300 hover:bg-accent/10 hover:text-accent transition-colors"
              @mousedown.prevent="addOcName(name)"
            >
              {{ name }}
            </li>
          </ul>
        </div>
      </div>
    </div>

    <!-- Hint / Context textarea -->
    <div>
      <p class="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">Context <span class="normal-case text-slate-600">(optional — sets the mood/theme, not copied verbatim)</span></p>
      <textarea
        v-model="hint"
        rows="2"
        class="w-full resize-none rounded-lg border border-line bg-panelSoft px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:border-accent/60 focus:outline-none focus:ring-1 focus:ring-accent/30 transition"
        placeholder="e.g. Foxy Friday, romantic beach scene, spicy office encounter…"
      />
    </div>

    <!-- AI Instructions (directives to the AI — not reflected verbatim in output) -->
    <div>
      <p class="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">AI Instructions <span class="normal-case text-slate-600">(directives — followed silently, never copied to output)</span></p>
      <textarea
        v-model="aiInstructions"
        rows="2"
        class="w-full resize-none rounded-lg border border-line bg-panelSoft px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:border-accent/60 focus:outline-none focus:ring-1 focus:ring-accent/30 transition"
        placeholder="e.g. Her name is Valerie. Write a spicy story. Keep it under 240 chars."
      />
    </div>

    <!-- ── Story mode extras ────────────────────────────────────────────────── -->
    <template v-if="postType === 'story'">
      <!-- Storyline selector -->
      <div>
        <p class="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">
          <BookOpen class="inline h-3 w-3 mr-0.5 -mt-0.5" /> Storyline <span class="normal-case text-slate-600">(optional)</span>
        </p>
        <div class="flex items-center gap-2">
          <select
            v-model="selectedStorylineId"
            class="flex-1 rounded-lg border border-line bg-panelSoft px-2.5 py-1.5 text-xs text-slate-200 appearance-none focus:border-accent/60 focus:outline-none focus:ring-1 focus:ring-accent/30 transition"
          >
            <option :value="null">— No storyline</option>
            <option v-for="sl in ai.storylines" :key="sl.id" :value="sl.id">{{ sl.name }}</option>
          </select>
          <button class="button h-7 px-2.5 text-xs shrink-0" @click="setPage?.('settings')">Manage</button>
        </div>
        <p v-if="selectedStorylineId" class="mt-1 text-[11px] text-slate-500">
          📖 Previous entries will be used as narrative context for this episode.
        </p>
      </div>

      <!-- Decisions (reader vote) -->
      <div>
        <div class="flex items-center justify-between mb-1">
          <p class="text-[11px] font-medium uppercase tracking-wide text-slate-500">Reader Decisions <span class="normal-case text-slate-600">(optional)</span></p>
          <button
            class="rounded text-[10px] font-medium px-2 py-0.5 transition"
            :class="useDecisions ? 'bg-accent/15 text-accent border border-accent/30' : 'bg-panel text-slate-500 border border-line hover:text-slate-300'"
            @click="useDecisions = !useDecisions"
          >{{ useDecisions ? '✓ On' : 'Off' }}</button>
        </div>
        <template v-if="useDecisions">
          <div v-for="(d, i) in decisions" :key="i" class="mb-1.5 flex items-center gap-1.5">
            <input
              v-model="d.emoji"
              class="w-10 rounded border border-line bg-panelSoft px-1.5 py-1 text-center text-sm focus:border-accent/60 focus:outline-none transition"
              maxlength="4"
              placeholder="🔥"
            />
            <input
              v-model="d.label"
              class="flex-1 rounded border border-line bg-panelSoft px-2 py-1 text-xs text-slate-200 placeholder:text-slate-600 focus:border-accent/60 focus:outline-none transition"
              placeholder="e.g. She accepts the offer"
            />
            <button class="button h-6 w-6 p-0 text-rose hover:border-rose/60 hover:bg-rose/10 shrink-0" @click="removeDecision(i)">
              <Trash2 class="h-3 w-3" />
            </button>
          </div>
          <button
            v-if="decisions.length < 4"
            class="mt-0.5 flex items-center gap-1 text-[11px] text-accent/70 hover:text-accent transition"
            @click="addDecision"
          >
            <Plus class="h-3 w-3" /> Add option
          </button>
          <p v-if="decisions.length === 0" class="text-xs text-slate-600 italic">Click "Add option" to define 1–4 reader-vote choices.</p>
        </template>
      </div>
    </template>

    <!-- Active persona badge -->
    <div v-if="ai.activePersona" class="flex items-center gap-1.5 rounded-lg border border-accent/25 bg-accent/8 px-2.5 py-1.5 text-xs">
      <span class="text-accent">👤</span>
      <span class="text-slate-300">Voice: <strong class="text-white">{{ ai.activePersona.name }}</strong></span>
      <span class="ml-1 text-slate-500">·</span>
      <span class="text-slate-500">{{ ai.activePersona.tone }}</span>
    </div>
    <div v-else class="rounded-lg border border-line bg-ink px-2.5 py-1.5 text-xs text-slate-600">
      👤 No persona active — <button class="text-accent/70 hover:text-accent underline bg-transparent border-none p-0 cursor-pointer" @click="setPage?.('settings')">set one in Settings</button>
    </div>

    <!-- Generate button -->
    <button
      class="button-primary w-full rounded-lg py-2"
      :disabled="ai.generating || disabled || !imagePaths.length"
      @click="generate"
    >
      <Sparkles class="h-4 w-4" :class="ai.generating ? 'animate-pulse' : ''" />
      {{ ai.generating ? 'Generating…' : 'Generate' }}
    </button>

    <!-- Generate error -->
    <div v-if="ai.generateError" class="rounded-lg border border-rose/40 bg-rose/10 px-3 py-2 text-xs text-rose">
      {{ ai.generateError }}
    </div>

    <!-- Result (editable) -->
    <div v-if="ai.generatedPost" class="space-y-3 rounded-xl border border-accent/20 bg-panel p-4 text-xs">
      <p class="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Result <span class="normal-case font-normal text-slate-600">— edit before sending</span></p>

      <div v-if="ai.generatedPost.title !== undefined">
        <p class="mb-1 text-[10px] font-medium uppercase tracking-wide text-slate-500">Title</p>
        <input
          v-model="ai.editedTitle"
          class="w-full rounded-md border border-line bg-panelSoft px-2.5 py-1.5 text-xs text-white placeholder:text-slate-600 focus:border-accent/60 focus:outline-none focus:ring-1 focus:ring-accent/30 transition"
        />
      </div>
      <div>
        <div class="mb-1 flex items-center justify-between">
          <p class="text-[10px] font-medium uppercase tracking-wide text-slate-500">Description</p>
          <span
            v-if="charLimit"
            class="text-[10px] tabular-nums"
            :class="descCharCount > charLimit ? 'text-rose font-semibold' : descCharCount > charLimit * 0.9 ? 'text-amber-400' : 'text-slate-600'"
          >{{ descCharCount }} / {{ charLimit.toLocaleString() }}</span>
        </div>
        <textarea
          v-model="ai.editedDescription"
          rows="5"
          class="w-full resize-y rounded-md border border-line bg-panelSoft px-2.5 py-1.5 text-xs leading-relaxed text-slate-200 placeholder:text-slate-600 focus:border-accent/60 focus:outline-none focus:ring-1 focus:ring-accent/30 transition"
        />
      </div>
      <div v-if="ai.editedTags">
        <p class="mb-1 text-[10px] font-medium uppercase tracking-wide text-slate-500">Tags</p>
        <textarea
          v-model="ai.editedTags"
          rows="2"
          class="w-full resize-none rounded-md border border-line bg-panelSoft px-2.5 py-1.5 text-xs text-slate-400 placeholder:text-slate-600 focus:border-accent/60 focus:outline-none focus:ring-1 focus:ring-accent/30 transition"
        />
      </div>

      <!-- Queue error -->
      <div v-if="queueError" class="rounded-lg border border-rose/40 bg-rose/10 px-3 py-2 text-xs text-rose">
        {{ queueError }}
      </div>

      <!-- Action row -->
      <div class="flex flex-col gap-2 border-t border-line pt-3">

        <!-- Send to Plugin (Queue-panel mode — no image IDs) -->
        <button
          v-if="allowTextSend && !imageIds?.length"
          class="button-primary w-full py-2 text-sm font-medium"
          :class="sendTextOnlyDone ? 'border-mint/60 bg-mint/10 text-mint' : ''"
          @click="sendTextOnly"
        >
          <Check v-if="sendTextOnlyDone" class="h-4 w-4" />
          <Send v-else class="h-4 w-4" />
          {{ sendTextOnlyDone ? (imagePath ? 'Image queued, text copied!' : 'Sent!') : (imagePath ? 'Send to Plugin' : 'Send text to Plugin') }}
        </button>

        <!-- Send to Extension split-button (Library mode only) -->
        <div v-if="imageIds?.length" class="relative">
          <!-- Split button row -->
          <div class="flex">
            <!-- Main action -->
            <button
              class="button-primary flex flex-1 items-center justify-center gap-2 rounded-r-none py-2 text-sm font-medium"
              :class="sendDone && sendMode === 'images_only' ? 'border-mint/60 bg-mint/10 text-mint' : ''"
              @click="sendToExtension"
            >
              <Check v-if="sendDone" class="h-4 w-4" />
              <Send v-else class="h-4 w-4" />
              {{ sendDone && sendMode === 'images_only' ? 'Text copied!' : sendDone ? 'Queued!' : sendModeLabel }}
            </button>
            <!-- Dropdown toggle -->
            <button
              class="button-primary flex items-center rounded-l-none border-l border-white/20 px-2.5 py-2"
              :class="sendDropdownOpen ? 'bg-accent/80' : ''"
              @click.stop="sendDropdownOpen = !sendDropdownOpen"
            >
              <ChevronDown class="h-3.5 w-3.5" :class="sendDropdownOpen ? 'rotate-180' : ''" style="transition: transform 0.15s" />
            </button>
          </div>

          <!-- Dropdown menu -->
          <div
            v-if="sendDropdownOpen"
            class="absolute bottom-full left-0 right-0 z-50 mb-1 overflow-hidden rounded-lg border border-line bg-panel shadow-xl"
            @click.stop
          >
            <button
              v-for="m in SEND_MODES"
              :key="m.value"
              class="flex w-full flex-col px-3 py-2.5 text-left transition hover:bg-panelSoft"
              :class="sendMode === m.value ? 'bg-accent/10 text-accent' : 'text-slate-200'"
              @click="setSendMode(m.value)"
            >
              <span class="flex items-center gap-2 text-xs font-medium">
                <Check v-if="sendMode === m.value" class="h-3 w-3 shrink-0" />
                <span v-else class="h-3 w-3 shrink-0" />
                {{ m.label }}
              </span>
              <span class="ml-5 text-[11px] text-slate-500">{{ m.sub }}</span>
            </button>
          </div>
        </div>

        <!-- Secondary row: Copy + Discard -->
        <div class="flex items-center gap-2">
          <button
            class="button h-7 gap-1.5 px-2.5 text-xs"
            :class="copied ? 'border-mint/60 bg-mint/10 text-mint' : ''"
            @click="copyText"
          >
            <Check v-if="copied" class="h-3 w-3" /><Copy v-else class="h-3 w-3" />
            {{ copied ? 'Copied!' : 'Copy text' }}
          </button>
          <button class="button h-7 gap-1 px-2.5 text-xs ml-auto" @click="ai.clearGeneratedPost(); queueError = ''">
            <X class="h-3 w-3" />Discard
          </button>
        </div>

        <!-- Bottom convenience row (saves scrolling back to top) -->
        <div v-if="imageIds?.length || networkName" class="flex items-center gap-2 border-t border-line pt-2.5">
          <button
            v-if="imageIds?.length"
            class="button h-7 flex-1 gap-1.5 px-2.5 text-xs"
            :class="sendDone ? 'border-mint/60 bg-mint/10 text-mint' : ''"
            title="Send images + content to the Chrome extension"
            @click="sendToExtension"
          >
            <Check v-if="sendDone" class="h-3 w-3" />
            <Send v-else class="h-3 w-3" />
            {{ sendDone ? 'Queued!' : 'Send to Plugin' }}
          </button>
          <button
            class="button h-7 flex-1 gap-1.5 px-2.5 text-xs"
            :title="`Mark as posted on ${networkName || network}`"
            @click="emit('mark')"
          >
            <Check class="h-3 w-3" />
            Mark on {{ networkName || network }}
          </button>
        </div>

      </div>
    </div>
  </div>
</template>
