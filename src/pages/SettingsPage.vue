<script setup lang="ts">
import { onMounted, ref } from "vue";
import { BookOpen, Check, ChevronDown, ChevronRight, Download, Eye, EyeOff, FolderOpen, Pencil, Plus, Tag, Trash2, Upload, UserCircle2 } from "lucide-vue-next";
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

// ── Wavespeed Settings ────────────────────────────────────────────────────
const wavespeedApiKey  = ref("");
const showWsKey        = ref(false);
const wsSaved          = ref(false);

// ── Topaz Labs Settings ───────────────────────────────────────────────────
const topazApiKey      = ref("");
const showTopazKey     = ref(false);
const topazOutputFolder = ref("");
const topazSaved       = ref(false);

async function loadTopazSettings() {
  const rows = await window.desktop.db.select<Array<{ key: string; value: string }>>(
    "SELECT key, value FROM ai_config WHERE key IN ('topaz_api_key','topaz_output_folder')",
  );
  for (const r of rows) {
    if (r.key === "topaz_api_key") topazApiKey.value = r.value;
    if (r.key === "topaz_output_folder") topazOutputFolder.value = r.value;
  }
}

function openTopazDashboard() {
  window.desktop.opener.openUrl("https://account.topazlabs.com/manage-api");
}

async function pickTopazOutputFolder() {
  const folder = await window.desktop.dialog.open({ title: "Select Topaz output folder", directory: true });
  if (folder && typeof folder === "string") topazOutputFolder.value = folder;
}

async function saveTopazSettings() {
  await window.desktop.db.execute(
    "INSERT INTO ai_config (key, value) VALUES ('topaz_api_key', ?) ON CONFLICT(key) DO UPDATE SET value = ?",
    [topazApiKey.value, topazApiKey.value],
  );
  await window.desktop.db.execute(
    "INSERT INTO ai_config (key, value) VALUES ('topaz_output_folder', ?) ON CONFLICT(key) DO UPDATE SET value = ?",
    [topazOutputFolder.value, topazOutputFolder.value],
  );
  topazSaved.value = true;
  setTimeout(() => (topazSaved.value = false), 2500);
}

async function loadWavespeedKey() {
  const rows = await window.desktop.db.select<Array<{ value: string }>>(
    "SELECT value FROM ai_config WHERE key = 'wavespeed_api_key'",
  );
  wavespeedApiKey.value = rows[0]?.value ?? "";
}

function openWavespeedDashboard() {
  window.desktop.opener.openUrl("https://wavespeed.ai/settings/api-keys");
}

async function saveWavespeedSettings() {
  await window.desktop.db.execute(
    "INSERT INTO ai_config (key, value) VALUES ('wavespeed_api_key', ?) ON CONFLICT(key) DO UPDATE SET value = ?",
    [wavespeedApiKey.value, wavespeedApiKey.value],
  );
  wsSaved.value = true;
  setTimeout(() => (wsSaved.value = false), 2500);
}

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

// ── Persona management ───────────────────────────────────────────────────────
const showPersonaForm = ref(false);
const editingPersonaId = ref<string | null>(null);
const personaForm = ref({ name: "", styleNotes: "" });
const personaSaved = ref(false);

function openNewPersona() {
  editingPersonaId.value = null;
  personaForm.value = { name: "", styleNotes: "" };
  showPersonaForm.value = true;
}

function openEditPersona(p: import("@/types/aiSettings").Persona) {
  editingPersonaId.value = p.id;
  personaForm.value = { name: p.name, styleNotes: p.styleNotes };
  showPersonaForm.value = true;
}

function cancelPersonaForm() {
  showPersonaForm.value = false;
  editingPersonaId.value = null;
}

async function savePersonaForm() {
  if (!personaForm.value.name.trim()) return;
  await ai.savePersona(
    { ...personaForm.value, tone: "", emojiUse: "subtle", isActive: editingPersonaId.value
        ? (ai.personas.find((p) => p.id === editingPersonaId.value)?.isActive ?? false)
        : false },
    editingPersonaId.value ?? undefined,
  );
  personaSaved.value = true;
  setTimeout(() => (personaSaved.value = false), 2000);
  showPersonaForm.value = false;
  editingPersonaId.value = null;
}

// ── Storyline management ─────────────────────────────────────────────────────
const showStorylineForm  = ref(false);
const editingStorylineId = ref<string | null>(null);
const storylineForm      = ref({ name: "", description: "" });
const storyLineSaved     = ref(false);
const expandedStorylines = ref<Set<string>>(new Set());

function openNewStoryline() {
  editingStorylineId.value = null;
  storylineForm.value = { name: "", description: "" };
  showStorylineForm.value = true;
}
function openEditStoryline(sl: import("@/types/aiSettings").Storyline) {
  editingStorylineId.value = sl.id;
  storylineForm.value = { name: sl.name, description: sl.description };
  showStorylineForm.value = true;
}
function cancelStorylineForm() {
  showStorylineForm.value = false;
  editingStorylineId.value = null;
}
async function saveStorylineForm() {
  if (!storylineForm.value.name.trim()) return;
  await ai.saveStoryline(storylineForm.value.name.trim(), storylineForm.value.description.trim(), editingStorylineId.value ?? undefined);
  storyLineSaved.value = true;
  setTimeout(() => (storyLineSaved.value = false), 2000);
  showStorylineForm.value = false;
  editingStorylineId.value = null;
}
async function toggleExpandStoryline(id: string) {
  if (expandedStorylines.value.has(id)) {
    expandedStorylines.value.delete(id);
  } else {
    expandedStorylines.value.add(id);
    if (!ai.storyEntriesMap[id]) await ai.loadStoryEntries(id);
  }
}

onMounted(async () => {
  await ai.loadConfig();
  await ai.loadNetworkTags(TAG_NETWORKS[0]);
  await ai.loadPersonas();
  await ai.loadStorylines();
  await loadWavespeedKey();
  await loadTopazSettings();
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
      <!-- X Premium+ toggle -->
      <div class="mt-3 flex items-center gap-3 rounded-lg border border-line bg-ink px-3 py-2.5">
        <div class="flex-1">
          <p class="text-sm font-medium text-white">X (Twitter) Premium+</p>
          <p class="mt-0.5 text-xs text-slate-500">Raises the character limit from 280 → 25 000. AI writes longer, richer posts and story episodes.</p>
        </div>
        <button
          class="relative h-5 w-9 shrink-0 overflow-hidden rounded-full transition-colors duration-200"
          :class="ai.config.xPremiumPlus ? 'bg-accent' : 'bg-slate-700'"
          @click="ai.config.xPremiumPlus = !ai.config.xPremiumPlus"
        >
          <span
            class="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200"
            :class="ai.config.xPremiumPlus ? 'translate-x-[18px]' : 'translate-x-0.5'"
          />
        </button>
      </div>
      <button class="button-primary mt-3 h-8 px-4 text-sm" @click="saveAiSettings">
        {{ aiSaved ? '✓ Saved' : 'Save AI Settings' }}
      </button>
    </section>

    <!-- ── Wavespeed AI ─────────────────────────────────────────────────── -->
    <section class="surface rounded-lg p-4">
      <h2 class="text-base font-semibold text-white">Wavespeed AI — Video Generation</h2>
      <p class="mt-1 text-sm text-slate-400">
        API key enables the "Send to Wavespeed" button in the Video Prompt panel.
        Get your key at <button class="text-accent underline" @click="openWavespeedDashboard">wavespeed.ai/settings/api-keys</button>.
      </p>
      <div class="mt-4 flex flex-col gap-1">
        <label class="text-xs text-slate-400">API Key</label>
        <div class="flex gap-2">
          <input
            v-model="wavespeedApiKey"
            :type="showWsKey ? 'text' : 'password'"
            class="field flex-1 font-mono text-xs"
            placeholder="ws-…"
          />
          <button class="button px-2" :title="showWsKey ? 'Hide' : 'Show'" @click="showWsKey = !showWsKey">
            <EyeOff v-if="showWsKey" class="h-4 w-4" />
            <Eye v-else class="h-4 w-4" />
          </button>
        </div>
      </div>
      <div class="mt-3 rounded-lg border border-line bg-ink px-3 py-2.5 text-xs text-slate-400 space-y-0.5">
        <p><span class="text-white font-medium">Default settings per job:</span> WAN 2.2 Spicy · 720p · 8 seconds · ~$0.48</p>
        <p>Resolution and duration can be adjusted in the Video Prompt panel before submitting.</p>
      </div>
      <button class="button-primary mt-3 h-8 px-4 text-sm" @click="saveWavespeedSettings">
        {{ wsSaved ? '✓ Saved' : 'Save Wavespeed Settings' }}
      </button>
    </section>

    <!-- ── Topaz Labs ─────────────────────────────────────────────────────── -->
    <section class="surface rounded-lg p-4">
      <h2 class="text-base font-semibold text-white">Topaz Labs — Image Upscaling</h2>
      <p class="mt-1 text-sm text-slate-400">
        API key enables the "Upscale with Topaz" button in the Library and Picker.
        Get your key at <button class="text-accent underline" @click="openTopazDashboard">account.topazlabs.com/manage-api</button>.
      </p>
      <div class="mt-4 flex flex-col gap-1">
        <label class="text-xs text-slate-400">API Key</label>
        <div class="flex gap-2">
          <input
            v-model="topazApiKey"
            :type="showTopazKey ? 'text' : 'password'"
            class="field flex-1 font-mono text-xs"
            placeholder="Your Topaz Labs API key"
          />
          <button class="button px-2" :title="showTopazKey ? 'Hide' : 'Show'" @click="showTopazKey = !showTopazKey">
            <EyeOff v-if="showTopazKey" class="h-4 w-4" />
            <Eye v-else class="h-4 w-4" />
          </button>
        </div>
      </div>
      <!-- Output folder -->
      <div class="mt-3 flex flex-col gap-1">
        <label class="text-xs text-slate-400">Output folder</label>
        <div class="flex gap-2">
          <input
            v-model="topazOutputFolder"
            class="field flex-1 font-mono text-xs"
            placeholder="~/Pictures/TopazAI/ (default)"
            aria-label="Topaz output folder path"
          />
          <button class="button px-2 text-xs" title="Browse…" @click="pickTopazOutputFolder">
            <FolderOpen class="h-4 w-4" />
          </button>
        </div>
        <p class="text-[11px] text-slate-500">
          Leave empty to use the default <span class="text-slate-300">~/Pictures/TopazAI/</span> folder.
        </p>
      </div>
      <div class="mt-3 rounded-lg border border-line bg-ink px-3 py-2.5 text-xs text-slate-400">
        <span class="text-white font-medium">Available models:</span> Standard V2 · Wonder 2 · Bloom Creative · Bloom Realism
      </div>
      <button class="button-primary mt-3 h-8 px-4 text-sm" @click="saveTopazSettings">
        {{ topazSaved ? '✓ Saved' : 'Save Topaz Settings' }}
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

    <!-- ── Writing Personas ─────────────────────────────────────────────── -->
    <section class="surface rounded-lg p-4">
      <div class="flex items-center justify-between">
        <h2 class="flex items-center gap-2 text-base font-semibold text-white">
          <UserCircle2 class="h-4 w-4 text-accent" /> Writing Personas
        </h2>
        <button class="button h-7 gap-1.5 px-2.5 text-xs" @click="openNewPersona">
          <Plus class="h-3.5 w-3.5" /> New Persona
        </button>
      </div>
      <p class="mt-1 text-sm text-slate-400">Define how the AI should write. The active persona shapes tone, style and emoji usage.</p>

      <!-- Persona list -->
      <div class="mt-3 flex flex-col gap-2">
        <div
          v-for="persona in ai.personas"
          :key="persona.id"
          class="flex items-start gap-3 rounded-lg border px-3 py-2.5 transition"
          :class="persona.isActive ? 'border-accent/50 bg-accent/8' : 'border-line bg-ink'"
        >
          <!-- Active indicator -->
          <button
            class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition"
            :class="persona.isActive ? 'border-accent bg-accent text-ink' : 'border-line bg-transparent text-transparent hover:border-accent/50'"
            :title="persona.isActive ? 'Active persona' : 'Set as active'"
            @click="ai.setActivePersona(persona.isActive ? null : persona.id)"
          >
            <Check class="h-3 w-3" />
          </button>

          <!-- Info -->
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <span class="text-sm font-medium text-white">{{ persona.name }}</span>
              <span v-if="persona.isActive" class="rounded border border-accent/40 bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium text-accent">active</span>
            </div>
            <div class="mt-1 flex flex-wrap gap-1">
              <span v-if="persona.styleNotes" class="max-w-xs truncate rounded bg-panel px-1.5 py-0.5 text-[10px] text-slate-500">{{ persona.styleNotes }}</span>
            </div>
          </div>

          <!-- Actions -->
          <div class="flex shrink-0 gap-1">
            <button class="button h-6 w-6 p-0" title="Edit" @click="openEditPersona(persona)">
              <Pencil class="h-3 w-3" />
            </button>
            <button class="button h-6 w-6 p-0 text-rose hover:border-rose/60 hover:bg-rose/10" title="Delete" @click="ai.deletePersona(persona.id)">
              <Trash2 class="h-3 w-3" />
            </button>
          </div>
        </div>
        <p v-if="!ai.personas.length" class="text-xs text-slate-600">No personas yet. Create one to give the AI a consistent voice.</p>
      </div>

      <!-- Add / Edit form -->
      <div v-if="showPersonaForm" class="mt-4 rounded-lg border border-accent/30 bg-panelSoft p-3 flex flex-col gap-3">
        <p class="text-xs font-semibold text-white">{{ editingPersonaId ? 'Edit Persona' : 'New Persona' }}</p>
        <div class="flex flex-col gap-3">
          <div class="flex flex-col gap-1">
            <label class="text-[11px] uppercase tracking-wide text-slate-500">Name</label>
            <input v-model="personaForm.name" aria-label="Persona name" class="field text-sm" placeholder="e.g. Valerie, Hot Mess, Neutral" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-[11px] uppercase tracking-wide text-slate-500">Behavior Rules</label>
            <textarea
              v-model="personaForm.styleNotes"
              rows="10"
              class="field resize-y text-sm leading-relaxed"
              placeholder="Describe everything: tone, vocabulary, example phrases, dos &amp; don'ts — e.g. 'Flirty and teasing. Uses ❤️‍🔥 and 💋 often. Calls followers sweet slaves. Never says boring. Always ends with a question.'"
            />
          </div>
        </div>
        <div class="flex justify-end gap-2">
          <button class="button h-7 px-3 text-xs" @click="cancelPersonaForm">Cancel</button>
          <button class="button-primary h-7 px-3 text-xs" :disabled="!personaForm.name.trim()" @click="savePersonaForm">
            {{ personaSaved ? '✓ Saved' : (editingPersonaId ? 'Update' : 'Create') }}
          </button>
        </div>
      </div>
    </section>

    <!-- ── Storylines ──────────────────────────────────────────────────────── -->
    <section class="surface rounded-lg p-4">
      <div class="flex items-center justify-between">
        <h2 class="flex items-center gap-2 text-base font-semibold text-white">
          <BookOpen class="h-4 w-4 text-accent" /> Story Narratives
        </h2>
        <button class="button h-7 gap-1.5 px-2.5 text-xs" @click="openNewStoryline">
          <Plus class="h-3.5 w-3.5" /> New Storyline
        </button>
      </div>
      <p class="mt-1 text-sm text-slate-400">Persistent story series. Previous episodes feed into the AI as narrative context.</p>

      <!-- Storyline list -->
      <div class="mt-3 flex flex-col gap-2">
        <div
          v-for="sl in ai.storylines"
          :key="sl.id"
          class="rounded-lg border border-line bg-ink"
        >
          <!-- Header row -->
          <div class="flex items-center gap-2 px-3 py-2">
            <button class="shrink-0 text-slate-500 hover:text-slate-200 transition" @click="toggleExpandStoryline(sl.id)">
              <ChevronDown v-if="expandedStorylines.has(sl.id)" class="h-4 w-4" />
              <ChevronRight v-else class="h-4 w-4" />
            </button>
            <div class="flex-1 min-w-0">
              <span class="text-sm font-medium text-white">{{ sl.name }}</span>
              <span v-if="ai.storyEntriesMap[sl.id]" class="ml-2 text-[11px] text-slate-500">
                {{ ai.storyEntriesMap[sl.id].length }} episode{{ ai.storyEntriesMap[sl.id].length !== 1 ? 's' : '' }}
              </span>
              <p v-if="sl.description" class="mt-0.5 truncate text-xs text-slate-500">{{ sl.description }}</p>
            </div>
            <div class="flex shrink-0 gap-1">
              <button class="button h-6 w-6 p-0" title="Edit" @click="openEditStoryline(sl)"><Pencil class="h-3 w-3" /></button>
              <button class="button h-6 w-6 p-0 text-rose hover:border-rose/60 hover:bg-rose/10" title="Delete" @click="ai.deleteStoryline(sl.id)"><Trash2 class="h-3 w-3" /></button>
            </div>
          </div>
          <!-- Episodes list -->
          <div v-if="expandedStorylines.has(sl.id)" class="border-t border-line px-3 pb-2 pt-2 space-y-1">
            <p v-if="!ai.storyEntriesMap[sl.id]?.length" class="text-xs text-slate-600 italic">No episodes yet.</p>
            <div
              v-for="entry in ai.storyEntriesMap[sl.id]"
              :key="entry.id"
              class="flex gap-2 rounded bg-panelSoft px-2 py-1.5 text-xs"
            >
              <span class="shrink-0 text-slate-600 tabular-nums">Ep.{{ entry.entryOrder + 1 }}</span>
              <span class="flex-1 line-clamp-2 text-slate-400">{{ entry.postText }}</span>
              <button class="shrink-0 text-slate-600 hover:text-rose transition" @click="ai.removeStoryEntry(entry.id, sl.id)"><Trash2 class="h-3 w-3" /></button>
            </div>
          </div>
        </div>
        <p v-if="!ai.storylines.length" class="text-xs text-slate-600">No storylines yet. Create one and use it in Story posts to link episodes together.</p>
      </div>

      <!-- Add / Edit form -->
      <div v-if="showStorylineForm" class="mt-4 rounded-lg border border-accent/30 bg-panelSoft p-3 flex flex-col gap-3">
        <p class="text-xs font-semibold text-white">{{ editingStorylineId ? 'Edit Storyline' : 'New Storyline' }}</p>
        <div class="flex flex-col gap-1">
          <label class="text-[11px] uppercase tracking-wide text-slate-500">Name</label>
          <input v-model="storylineForm.name" class="field text-sm" placeholder="e.g. Valerie's Awakening" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-[11px] uppercase tracking-wide text-slate-500">Description <span class="normal-case text-slate-600">(optional — for your reference)</span></label>
          <textarea v-model="storylineForm.description" rows="2" class="field resize-none text-xs" placeholder="Short synopsis or notes…" />
        </div>
        <div class="flex justify-end gap-2">
          <button class="button h-7 px-3 text-xs" @click="cancelStorylineForm">Cancel</button>
          <button class="button-primary h-7 px-3 text-xs" :disabled="!storylineForm.name.trim()" @click="saveStorylineForm">
            {{ storyLineSaved ? '✓ Saved' : (editingStorylineId ? 'Update' : 'Create') }}
          </button>
        </div>
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
