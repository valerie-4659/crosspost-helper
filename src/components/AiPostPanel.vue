<script setup lang="ts">
import { computed, inject, onMounted, ref } from "vue";
import { BookOpen, Check, Copy, Plus, Send, Sparkles, Trash2, X } from "lucide-vue-next";
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
}>(), {
  networkName: "",
  disabled: false,
  imageIds: undefined,
  queueLimit: 1,
});

const emit = defineEmits<{
  (e: "generated"): void;
  /** Fired after images + AI content were pushed to the bridge. */
  (e: "queued", count: number): void;
}>();

const ai = useAiStore();

// ── Controls ──────────────────────────────────────────────────────────────────
const hint        = ref("");
const postType    = ref<"engagement" | "qt" | "morning" | "goodnight" | "story">("engagement");
/** "" = no perspective instruction, "i" = first-person, "oc" = OC name */
const perspective = ref<"" | "i" | "oc">("");
const ocName      = ref("");
const qtEventName    = ref("");
const qtTagger       = ref("");
const customMaxChars = ref<number | null>(null);

const ALL_CHAR_PRESETS = [
  { label: "180 (1 image)",      value: 180 },
  { label: "280",                value: 280 },
  { label: "360 (2 images)",     value: 360 },
  { label: "500",                value: 500 },
  { label: "540 (3 images)",     value: 540 },
  { label: "720 (4 images)",     value: 720 },
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
  { value: "oc", label: "OC name" },
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
    perspective.value === "oc" ? ocName.value.trim() : "",
    postType.value === "story" ? selectedStorylineId.value : undefined,
    postType.value === "story" && activeDecisions.value.length > 0 ? activeDecisions.value : undefined,
    postType.value === "qt" ? qtEventName.value.trim() || undefined : undefined,
    postType.value === "qt" ? qtTagger.value.trim() || undefined : undefined,
    showCustomMaxChars.value ? customMaxChars.value : null,
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

/** Queue images + push AI text to the bridge in a single action (Library mode). */
async function queueForExtension() {
  if (!ai.generatedPost || !props.imageIds?.length) return;
  queueError.value = "";
  try {
    const ids = props.imageIds.slice(0, props.queueLimit ?? 1);
    await window.desktop.bridge.setQueue(props.network, ids);
    await window.desktop.bridge.setPostContent(props.network, {
      title:       ai.editedTitle,
      description: ai.editedDescription,
      tags:        ai.editedTags.split(/\s+/).filter(Boolean),
    });
    // Record story entry in active storyline
    if (postType.value === "story" && selectedStorylineId.value) {
      await ai.recordStoryEntry(selectedStorylineId.value, ai.editedDescription, ids[0]);
    }
    emit("queued", ids.length);
  } catch (err) {
    queueError.value = err instanceof Error ? err.message : String(err);
  }
}

const copiedImagesOnly = ref(false);

/** Queue IMAGES ONLY — clears post content from bridge, copies text+tags to clipboard. */
async function queueImagesOnly() {
  if (!props.imageIds?.length) return;
  queueError.value = "";
  try {
    const ids = props.imageIds.slice(0, props.queueLimit ?? 1);
    await window.desktop.bridge.setQueue(props.network, ids);
    // Explicitly clear any stale post content so the extension won't inject text.
    await window.desktop.bridge.clearPostContent(props.network);
    // Copy text + tags to clipboard so the user can paste manually.
    if (copyableText.value) {
      await navigator.clipboard.writeText(copyableText.value).catch(() => {});
    }
    copiedImagesOnly.value = true;
    setTimeout(() => (copiedImagesOnly.value = false), 2500);
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
  <div class="space-y-4">
    <!-- Post type selector -->
    <div>
      <p class="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">Post type</p>
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
      <p class="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">Event Name <span class="normal-case text-slate-600">(optional)</span></p>
      <input
        v-model="qtEventName"
        class="w-full rounded-lg border border-line bg-panelSoft px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:border-accent/60 focus:outline-none focus:ring-1 focus:ring-accent/30 transition"
        placeholder="e.g. Foxy Friday, Spicy Thursday…"
      />
      <p class="mt-1 text-[11px] text-slate-600">Used as the theme in line 1 of the QT post. If empty, AI derives it from the image.</p>
      <!-- QT Tagger handle -->
      <p class="mt-2.5 mb-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">Tagged by <span class="normal-case text-slate-600">(optional)</span></p>
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
          :value="customMaxChars ?? ''"
          class="w-full appearance-none rounded-lg border border-line bg-panelSoft px-2.5 py-1.5 pr-7 text-xs text-slate-200 focus:border-accent/60 focus:outline-none focus:ring-1 focus:ring-accent/30 transition"
          @change="customMaxChars = ($event.target as HTMLSelectElement).value ? Number(($event.target as HTMLSelectElement).value) : null"
        >
          <option value="">— auto</option>
          <option v-for="p in CHAR_PRESETS" :key="p.value" :value="p.value">{{ p.label }}</option>
        </select>
        <svg class="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
      </div>
    </div>

    <!-- Perspective (optional) -->
    <div>
      <p class="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">Perspective <span class="normal-case text-slate-600">(optional)</span></p>
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
        <input
          v-if="perspective === 'oc'"
          v-model="ocName"
          class="input ml-1 h-7 min-w-0 flex-1 text-xs"
          placeholder="e.g. Valerie"
        />
      </div>
    </div>

    <!-- Hint textarea -->
    <div>
      <p class="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">Context <span class="normal-case text-slate-600">(optional)</span></p>
      <textarea
        v-model="hint"
        rows="2"
        class="w-full resize-none rounded-lg border border-line bg-panelSoft px-3 py-2.5 text-xs text-slate-200 placeholder:text-slate-600 focus:border-accent/60 focus:outline-none focus:ring-1 focus:ring-accent/30 transition"
        placeholder="e.g. this is a post for #FoxyFriday"
      />
    </div>

    <!-- ── Story mode extras ────────────────────────────────────────────────── -->
    <template v-if="postType === 'story'">
      <!-- Storyline selector -->
      <div>
        <p class="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">
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
        <div class="flex items-center justify-between mb-1.5">
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
      {{ ai.generating ? 'Generating…' : `Generate for ${networkName || network}` }}
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
      <div class="flex items-center gap-2 border-t border-line pt-3">
        <!-- Copy -->
        <button
          class="button h-7 gap-1.5 px-2.5 text-xs"
          :class="copied ? 'border-mint/60 bg-mint/10 text-mint' : ''"
          @click="copyText"
        >
          <Check v-if="copied" class="h-3 w-3" /><Copy v-else class="h-3 w-3" />
          {{ copied ? 'Copied!' : 'Copy' }}
        </button>

        <!-- Queue images only + copy text (Library mode) -->
        <button
          v-if="imageIds?.length"
          class="button h-7 gap-1.5 px-2.5 text-xs"
          :class="copiedImagesOnly ? 'border-mint/60 bg-mint/10 text-mint' : ''"
          :title="'Queue images only — text & tags copied to clipboard'"
          @click="queueImagesOnly"
        >
          <Check v-if="copiedImagesOnly" class="h-3 w-3" />
          <Copy v-else class="h-3 w-3" />
          {{ copiedImagesOnly ? 'Text copied!' : 'Images only' }}
        </button>

        <!-- Queue images + text for Extension (Library mode) -->
        <button
          v-if="imageIds?.length"
          class="button-primary h-7 flex-1 gap-1.5 px-3 text-xs"
          @click="queueForExtension"
        >
          <Send class="h-3 w-3" />
          Queue + text
        </button>

        <!-- Discard -->
        <button class="button h-7 gap-1 px-2.5 text-xs" @click="ai.clearGeneratedPost(); queueError = ''">
          <X class="h-3 w-3" />Discard
        </button>
      </div>
    </div>
  </div>
</template>
