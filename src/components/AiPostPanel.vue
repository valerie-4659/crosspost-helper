<script setup lang="ts">
import { computed, ref } from "vue";
import { Check, Copy, Sparkles, X } from "lucide-vue-next";
import { useAiStore } from "@/stores/aiStore";

const props = withDefaults(defineProps<{
  imagePaths: string[];
  network: string;
  networkName?: string;
  disabled?: boolean;
  /** Show a "Push to Extension" button (Library mode). */
  showPushButton?: boolean;
}>(), {
  networkName: "",
  disabled: false,
  showPushButton: false,
});

const emit = defineEmits<{
  (e: "generated"): void;
  (e: "push", network: string): void;
}>();

const ai = useAiStore();

// ── Controls ──────────────────────────────────────────────────────────────────
const hint       = ref("");
const postType   = ref<"engagement" | "qt" | "morning" | "goodnight" | "story">("engagement");
const perspective = ref<"i" | "oc">("i");
const ocName     = ref("");
const copied     = ref(false);

const POST_TYPES = [
  { value: "engagement", label: "💬 Engagement" },
  { value: "qt",         label: "🔁 Quote Tweet" },
  { value: "morning",    label: "☀️ Good Morning" },
  { value: "goodnight",  label: "🌙 Good Night" },
  { value: "story",      label: "📖 Story" },
] as const;

async function generate() {
  if (!props.imagePaths.length) return;
  await ai.generatePost(
    props.imagePaths,
    props.network,
    hint.value.trim() || undefined,
    postType.value,
    perspective.value,
    perspective.value === "oc" ? ocName.value.trim() : "",
  );
  if (ai.generatedPost) emit("generated");
}

/** Full text ready to copy: title + description + tags */
const copyableText = computed(() => {
  if (!ai.generatedPost) return "";
  const parts: string[] = [];
  if (ai.generatedPost.title) parts.push(ai.generatedPost.title);
  if (ai.generatedPost.description) parts.push(ai.generatedPost.description);
  if (ai.generatedPost.tags?.length) parts.push(ai.generatedPost.tags.join(" "));
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
  <div class="space-y-2.5">
    <!-- Post type selector -->
    <div class="flex flex-wrap gap-1">
      <button
        v-for="pt in POST_TYPES"
        :key="pt.value"
        class="rounded-md border px-2 py-0.5 text-[11px] transition"
        :class="postType === pt.value
          ? 'border-accent bg-accent/15 text-accent'
          : 'border-line text-slate-400 hover:border-slate-500 hover:text-slate-300'"
        @click="postType = pt.value"
      >{{ pt.label }}</button>
    </div>

    <!-- Perspective -->
    <div class="flex items-center gap-2">
      <span class="text-[11px] text-slate-500">Perspective:</span>
      <button
        class="rounded-md border px-2 py-0.5 text-[11px] transition"
        :class="perspective === 'i' ? 'border-accent bg-accent/15 text-accent' : 'border-line text-slate-400 hover:border-slate-500'"
        @click="perspective = 'i'"
      >I / Me</button>
      <button
        class="rounded-md border px-2 py-0.5 text-[11px] transition"
        :class="perspective === 'oc' ? 'border-accent bg-accent/15 text-accent' : 'border-line text-slate-400 hover:border-slate-500'"
        @click="perspective = 'oc'"
      >OC name</button>
      <input
        v-if="perspective === 'oc'"
        v-model="ocName"
        class="input h-6 min-w-0 flex-1 text-xs"
        placeholder="e.g. Valerie"
      />
    </div>

    <!-- Hint -->
    <textarea
      v-model="hint"
      rows="2"
      class="input w-full resize-none text-xs"
      placeholder="Optional context… e.g. this is a post for #FoxyFriday"
    />

    <!-- Generate button -->
    <button
      class="button-primary w-full rounded-md"
      :disabled="ai.generating || disabled || !imagePaths.length"
      @click="generate"
    >
      <Sparkles class="h-4 w-4" :class="ai.generating ? 'animate-pulse' : ''" />
      {{ ai.generating ? 'Generating…' : `Generate for ${networkName || network}` }}
    </button>

    <!-- Error -->
    <div v-if="ai.generateError" class="rounded-md border border-rose/40 bg-rose/10 p-2 text-xs text-rose">
      {{ ai.generateError }}
    </div>

    <!-- Result -->
    <div v-if="ai.generatedPost" class="space-y-2 rounded-xl border border-line bg-panelSoft p-3 text-xs">
      <div v-if="ai.generatedPost.title">
        <p class="mb-0.5 font-semibold text-slate-400">Title</p>
        <p class="text-white">{{ ai.generatedPost.title }}</p>
      </div>
      <div>
        <p class="mb-0.5 font-semibold text-slate-400">Description</p>
        <p class="whitespace-pre-wrap text-white">{{ ai.generatedPost.description }}</p>
      </div>
      <div v-if="ai.generatedPost.tags?.length">
        <p class="mb-0.5 font-semibold text-slate-400">Tags</p>
        <p class="text-slate-300">{{ ai.generatedPost.tags.join(' ') }}</p>
      </div>
      <div class="flex items-center gap-2 pt-1">
        <button class="button h-6 gap-1 px-2 text-xs" :class="copied ? 'border-mint text-mint' : ''" @click="copyText">
          <Check v-if="copied" class="h-3 w-3" /><Copy v-else class="h-3 w-3" />
          {{ copied ? 'Copied!' : 'Copy' }}
        </button>
        <button
          v-if="showPushButton && ai.generatedPost"
          class="button-primary h-6 flex-1 px-2 text-xs"
          @click="emit('push', ai.generatedPost!.network)"
        ><Check class="h-3 w-3" />Push to Extension</button>
        <button class="button h-6 px-2 text-xs ml-auto" @click="ai.clearGeneratedPost()">
          <X class="h-3 w-3" />Discard
        </button>
      </div>
    </div>
  </div>
</template>
