<script setup lang="ts">
import { computed, ref } from "vue";
import { Check, Copy, Send, Sparkles, X } from "lucide-vue-next";
import { useAiStore } from "@/stores/aiStore";

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
const copied      = ref(false);
const queueError  = ref("");

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
  );
  if (ai.generatedPost) emit("generated");
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
        <p class="mb-1 text-[10px] font-medium uppercase tracking-wide text-slate-500">Description</p>
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

        <!-- Queue for Extension (Library mode) -->
        <button
          v-if="imageIds?.length"
          class="button-primary h-7 flex-1 gap-1.5 px-3 text-xs"
          @click="queueForExtension"
        >
          <Send class="h-3 w-3" />
          Queue for {{ networkName || network }}
        </button>

        <!-- Discard -->
        <button class="button h-7 gap-1 px-2.5 text-xs" @click="ai.clearGeneratedPost(); queueError = ''">
          <X class="h-3 w-3" />Discard
        </button>
      </div>
    </div>
  </div>
</template>
