<script setup lang="ts">
import { onMounted, ref } from "vue";
import { Download, Eye, EyeOff, Plus, Tag, Trash2, Upload } from "lucide-vue-next";
import { useAiStore } from "@/stores/aiStore";
import { useImageStore } from "@/stores/imageStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useTargetStore } from "@/stores/targetStore";
import { AI_PROVIDER_MODELS, NETWORK_POST_CONFIGS } from "@/types/aiSettings";
import type { AiProvider } from "@/types/aiSettings";

const settings = useSettingsStore();
const targets = useTargetStore();
const imageStore = useImageStore();
const ai = useAiStore();
const customTargetName = ref("");
const importPayload = ref("");

// ── Hard reset ───────────────────────────────────────────────────────────────
const resetConfirmText = ref("");
const resetDone = ref(false);

async function doHardReset() {
  if (resetConfirmText.value.trim().toUpperCase() !== "DELETE") return;
  await imageStore.hardReset();
  resetConfirmText.value = "";
  resetDone.value = true;
  setTimeout(() => (resetDone.value = false), 4000);
}

async function addTarget() {
  if (!customTargetName.value.trim()) return;
  await targets.addCustomTarget(customTargetName.value.trim());
  customTargetName.value = "";
}

// ── AI Settings ─────────────────────────────────────────────────────────────
const AI_PROVIDERS: Array<{ value: AiProvider; label: string }> = [
  { value: "openai",    label: "OpenAI (GPT-4o etc.)" },
  { value: "anthropic", label: "Anthropic (Claude)" },
  { value: "grok",      label: "xAI / Grok" },
  { value: "gemini",    label: "Google Gemini" },
];
const showApiKey = ref(false);
const aiSaved = ref(false);

async function saveAiSettings() {
  await ai.saveConfig({ ...ai.config });
  aiSaved.value = true;
  setTimeout(() => (aiSaved.value = false), 2500);
}

function onProviderChange() {
  const models = AI_PROVIDER_MODELS[ai.config.provider];
  if (models && !models.includes(ai.config.model)) {
    ai.config.model = models[0];
  }
}

// ── Tag management ───────────────────────────────────────────────────────────
const TAG_NETWORKS = Object.keys(NETWORK_POST_CONFIGS).filter((n) => n !== "custom" && n !== "socialdiff");
const activeTagNetwork = ref(TAG_NETWORKS[0]);
const newTagInput = ref("");

async function switchTagNetwork(network: string) {
  activeTagNetwork.value = network;
  if (!ai.networkTagsMap[network]) await ai.loadNetworkTags(network);
}

async function addTag() {
  const tag = newTagInput.value.trim();
  if (!tag) return;
  await ai.addTag(activeTagNetwork.value, tag);
  newTagInput.value = "";
}

onMounted(async () => {
  await ai.loadConfig();
  await ai.loadNetworkTags(TAG_NETWORKS[0]);
});
</script>

<template>
  <div class="flex h-full flex-col gap-4 overflow-y-auto p-5">
    <header>
      <h1 class="text-2xl font-semibold text-white">Settings</h1>
      <p class="mt-1 text-sm text-slate-400">Manage posting targets, AI settings, tag lists, and backups.</p>
    </header>

    <!-- ── AI Settings ───────────────────────────────────────────────────── -->
    <section class="surface rounded-lg p-4">
      <h2 class="text-base font-semibold text-white">AI Post Generation</h2>
      <p class="mt-1 text-sm text-slate-400">API key is stored locally in your app-data folder.</p>
      <div class="mt-4 grid gap-3 sm:grid-cols-2">
        <div class="flex flex-col gap-1">
          <label class="text-xs text-slate-400">Provider</label>
          <select v-model="ai.config.provider" class="field" @change="onProviderChange">
            <option v-for="p in AI_PROVIDERS" :key="p.value" :value="p.value">{{ p.label }}</option>
          </select>
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-xs text-slate-400">Model</label>
          <select v-model="ai.config.model" class="field">
            <option v-for="m in AI_PROVIDER_MODELS[ai.config.provider]" :key="m" :value="m">{{ m }}</option>
          </select>
        </div>
        <div class="col-span-full flex flex-col gap-1">
          <label class="text-xs text-slate-400">API Key</label>
          <div class="flex gap-2">
            <input
              v-model="ai.config.apiKey"
              :type="showApiKey ? 'text' : 'password'"
              class="field flex-1 font-mono text-xs"
              placeholder="sk-… or API key"
            />
            <button class="button px-2" :title="showApiKey ? 'Hide' : 'Show'" @click="showApiKey = !showApiKey">
              <EyeOff v-if="showApiKey" class="h-4 w-4" />
              <Eye v-else class="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
      <button class="button-primary mt-3 h-8 px-4 text-sm" @click="saveAiSettings">
        {{ aiSaved ? '✓ Saved' : 'Save AI Settings' }}
      </button>
    </section>

    <!-- ── Network Tag Lists ─────────────────────────────────────────────── -->
    <section class="surface rounded-lg p-4">
      <h2 class="flex items-center gap-2 text-base font-semibold text-white">
        <Tag class="h-4 w-4 text-accent" /> Network Tag Lists
      </h2>
      <p class="mt-1 text-sm text-slate-400">AI picks from these tags. Add your own or remove defaults.</p>

      <!-- Network tabs -->
      <div class="mt-3 flex flex-wrap gap-1">
        <button
          v-for="net in TAG_NETWORKS"
          :key="net"
          class="rounded border px-2.5 py-0.5 text-xs font-medium transition"
          :class="activeTagNetwork === net
            ? 'border-accent bg-accent/15 text-accent'
            : 'border-line bg-ink text-slate-400 hover:border-accent hover:text-white'"
          @click="switchTagNetwork(net)"
        >{{ net }}</button>
      </div>

      <!-- Tag pills for active network -->
      <div v-if="ai.networkTagsMap[activeTagNetwork]" class="mt-3 flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
        <span
          v-for="t in ai.networkTagsMap[activeTagNetwork]"
          :key="t.id"
          class="flex items-center gap-1 rounded border px-2 py-0.5 text-xs"
          :class="t.isDefault ? 'border-line bg-ink text-slate-300' : 'border-accent/40 bg-accent/10 text-accent'"
        >
          {{ t.tag }}
          <button class="ml-0.5 text-slate-500 hover:text-rose" @click="ai.removeTag(activeTagNetwork, t.id)">
            <Trash2 class="h-3 w-3" />
          </button>
        </span>
        <span v-if="!ai.networkTagsMap[activeTagNetwork].length" class="text-xs text-slate-600">No tags yet.</span>
      </div>
      <div v-else class="mt-3 text-xs text-slate-600">Loading…</div>

      <!-- Add tag -->
      <div class="mt-3 flex gap-2">
        <input
          v-model="newTagInput"
          class="field flex-1 text-sm"
          :placeholder="`Add tag for ${activeTagNetwork}…`"
          @keydown.enter="addTag"
        />
        <button class="button" @click="addTag"><Plus class="h-4 w-4" />Add</button>
      </div>
    </section>

    <section class="surface rounded-lg p-4">
      <h2 class="text-base font-semibold text-white">Posting targets</h2>
      <div class="mt-4 grid gap-2">
        <label v-for="target in targets.targets" :key="target.id" class="flex items-center justify-between rounded-md border border-line bg-ink px-3 py-2">
          <span class="text-sm text-slate-200">{{ target.name }}</span>
          <input :checked="target.enabled" type="checkbox" class="accent-accent" @change="targets.setEnabled(target.id, ($event.target as HTMLInputElement).checked)" />
        </label>
      </div>
      <div class="mt-4 flex gap-2">
        <input v-model="customTargetName" class="field flex-1" placeholder="Custom target name" />
        <button class="button" @click="addTarget">
          <Plus class="h-4 w-4" />
          Add
        </button>
      </div>
    </section>

    <section class="surface rounded-lg p-4">
      <h2 class="text-base font-semibold text-white">Import / export</h2>
      <p class="mt-1 text-sm text-slate-400">Export includes sources, targets, image metadata, hashes, and post records.</p>
      <div class="mt-4 flex gap-2">
        <button class="button-primary rounded-md" @click="settings.exportData">
          <Download class="h-4 w-4" />
          Copy export JSON
        </button>
        <button class="button" :disabled="!importPayload.trim()" @click="settings.importData(importPayload)">
          <Upload class="h-4 w-4" />
          Import JSON
        </button>
      </div>
      <textarea v-model="importPayload" class="field mt-4 h-56 w-full resize-none" placeholder="Paste export JSON to merge safely" />
      <p v-if="settings.lastMessage" class="mt-3 text-sm text-mint">{{ settings.lastMessage }}</p>
    </section>

    <!-- ── Hard Reset ─────────────────────────────────────────────── -->
    <section class="surface rounded-lg border border-rose/20 p-4">
      <h2 class="text-base font-semibold text-rose">Hard Reset</h2>
      <p class="mt-1 text-sm text-slate-400">
        Removes <strong class="text-slate-300">all image records and post history</strong> from the local database.
        Source folders and posting targets are kept. <strong class="text-slate-300">This cannot be undone.</strong>
      </p>
      <div v-if="!resetDone" class="mt-4 flex items-center gap-3">
        <input
          v-model="resetConfirmText"
          class="field w-48"
          placeholder='Type "DELETE" to confirm'
          @keydown.enter="doHardReset"
        />
        <button
          class="button border-rose/60 bg-rose/10 px-4 text-rose hover:bg-rose/20"
          :disabled="resetConfirmText.trim().toUpperCase() !== 'DELETE'"
          @click="doHardReset"
        >
          Hard Reset
        </button>
      </div>
      <p v-else class="mt-4 text-sm text-mint">✓ All image data has been removed from the index.</p>
    </section>
  </div>
</template>
