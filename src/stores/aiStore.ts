import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { getAiConfig, saveAiConfig, listNetworkTags, addNetworkTag, removeNetworkTag } from "@/repositories/aiRepository";
import { listPersonas, createPersona, updatePersona, deletePersona as deletePersonaRepo, setActivePersona as setActivePersonaRepo } from "@/repositories/personaRepository";
import { listStorylines, createStoryline, updateStoryline, deleteStoryline as deleteStorylineRepo, addStoryEntry, listStoryEntries, deleteStoryEntry as deleteStoryEntryRepo } from "@/repositories/storylineRepository";
import type { AiConfig, GeneratedPost, NetworkTag, Persona, Storyline, StoryEntry, StoryDecision } from "@/types/aiSettings";

export const useAiStore = defineStore("ai", () => {
  const config = ref<AiConfig>({ provider: "openai", model: "gpt-4o-mini", apiKey: "" });
  const configLoaded = ref(false);

  const generating = ref(false);
  const generateError = ref("");
  const generatedPost = ref<GeneratedPost | null>(null);

  // User-editable versions of the generated fields.
  // Synced from generatedPost when a new result arrives; can be freely edited.
  const editedTitle       = ref("");
  const editedDescription = ref("");
  const editedTags        = ref(""); // space-separated tag string

  // ── Personas ─────────────────────────────────────────────────────────────────
  const personas      = ref<Persona[]>([]);
  const personasLoaded = ref(false);

  const activePersona = computed(() => personas.value.find((p) => p.isActive) ?? null);

  async function loadPersonas() {
    personas.value   = await listPersonas();
    personasLoaded.value = true;
  }

  async function savePersonaAction(data: Omit<Persona, "id" | "createdAt">, id?: string): Promise<void> {
    if (id) {
      await updatePersona(id, data);
    } else {
      await createPersona(data);
    }
    await loadPersonas();
  }

  async function deletePersonaAction(id: string): Promise<void> {
    await deletePersonaRepo(id);
    personas.value = personas.value.filter((p) => p.id !== id);
  }

  async function setActivePersonaAction(id: string | null): Promise<void> {
    await setActivePersonaRepo(id);
    personas.value = personas.value.map((p) => ({ ...p, isActive: p.id === id }));
  }

  // Per-network tags (loaded on demand, keyed by network)
  const networkTagsMap = ref<Record<string, NetworkTag[]>>({});
  const tagsLoading = ref(false);

  // ── Storylines ───────────────────────────────────────────────────────────────
  const storylines       = ref<Storyline[]>([]);
  const storylinesLoaded = ref(false);
  const storyEntriesMap  = ref<Record<string, StoryEntry[]>>({}); // storylineId → entries

  async function loadStorylines() {
    storylines.value       = await listStorylines();
    storylinesLoaded.value = true;
  }

  async function saveStorylineAction(name: string, description: string, id?: string): Promise<void> {
    if (id) {
      await updateStoryline(id, name, description);
      const idx = storylines.value.findIndex((s) => s.id === id);
      if (idx !== -1) storylines.value[idx] = { ...storylines.value[idx], name, description };
    } else {
      const sl = await createStoryline(name, description);
      storylines.value.push(sl);
    }
  }

  async function deleteStorylineAction(id: string): Promise<void> {
    await deleteStorylineRepo(id);
    storylines.value = storylines.value.filter((s) => s.id !== id);
    delete storyEntriesMap.value[id];
  }

  async function loadStoryEntries(storylineId: string): Promise<void> {
    storyEntriesMap.value[storylineId] = await listStoryEntries(storylineId);
  }

  async function recordStoryEntry(storylineId: string, postText: string, imageId?: string): Promise<void> {
    const entry = await addStoryEntry(storylineId, postText, imageId);
    if (!storyEntriesMap.value[storylineId]) storyEntriesMap.value[storylineId] = [];
    storyEntriesMap.value[storylineId].push(entry);
  }

  async function removeStoryEntry(entryId: string, storylineId: string): Promise<void> {
    await deleteStoryEntryRepo(entryId);
    if (storyEntriesMap.value[storylineId]) {
      storyEntriesMap.value[storylineId] = storyEntriesMap.value[storylineId].filter((e) => e.id !== entryId);
    }
  }

  // ── Config ──────────────────────────────────────────────────────────────────

  async function loadConfig() {
    config.value = await getAiConfig();
    configLoaded.value = true;
  }

  async function saveConfig(next: AiConfig) {
    await saveAiConfig(next);
    config.value = { ...next };
  }

  // ── Tag management ───────────────────────────────────────────────────────────

  async function loadNetworkTags(network: string) {
    tagsLoading.value = true;
    try {
      networkTagsMap.value[network] = await listNetworkTags(network);
    } finally {
      tagsLoading.value = false;
    }
  }

  async function addTag(network: string, tag: string) {
    const trimmed = tag.trim();
    if (!trimmed) return;
    const entry = await addNetworkTag(network, trimmed);
    if (!networkTagsMap.value[network]) networkTagsMap.value[network] = [];
    // Avoid duplicates in local state
    if (!networkTagsMap.value[network].some((t) => t.tag === entry.tag)) {
      networkTagsMap.value[network].push(entry);
    }
  }

  async function removeTag(network: string, tagId: string) {
    await removeNetworkTag(tagId);
    if (networkTagsMap.value[network]) {
      networkTagsMap.value[network] = networkTagsMap.value[network].filter((t) => t.id !== tagId);
    }
  }

  // ── Generate Post ────────────────────────────────────────────────────────────

  /**
   * Call the main-process AI handler to generate a post for the given network.
   * @param imagePaths   Absolute local paths (max 4)
   * @param network      Target network type string
   * @param hint         Optional user hint / context
   * @param postType     "engagement" | "qt" | "morning" | "goodnight" | "story"
   * @param perspective  "i" | "oc"
   * @param ocName       OC display name (only used when perspective === "oc")
   * @param storylineId  Optional storyline ID — previous entries are fetched for context
   * @param decisions    Optional reader-vote decisions (1–4) appended after the story text
   */
  async function generatePost(
    imagePaths: string[],
    network: string,
    hint?: string,
    postType?: string,
    perspective?: string,
    ocName?: string,
    storylineId?: string | null,
    decisions?: StoryDecision[] | null,
    qtEventName?: string,
    qtTagger?: string,
  ) {
    generating.value = true;
    generateError.value = "";
    generatedPost.value = null;
    try {
      const result = await window.desktop.ai.generatePost(
        imagePaths, network,
        hint ?? "",
        postType ?? "engagement",
        perspective ?? "",
        ocName ?? "",
        storylineId ?? null,
        decisions ?? null,
        qtEventName ?? "",
        qtTagger ?? "",
      );
      generatedPost.value = { ...result, network };
      // Sync editable fields so all consumers (AiPostPanel, PickerPage, …) start from the fresh result.
      editedTitle.value       = result.title ?? "";
      editedDescription.value = result.description ?? "";
      editedTags.value        = (result.tags ?? []).join(" ");
    } catch (err) {
      generateError.value = err instanceof Error ? err.message : String(err);
    } finally {
      generating.value = false;
    }
  }

  function clearGeneratedPost() {
    generatedPost.value = null;
    generateError.value = "";
    editedTitle.value       = "";
    editedDescription.value = "";
    editedTags.value        = "";
  }

  /** Push generated post content to the bridge for the Chrome extension. */
  async function pushPostContentToExtension(network: string) {
    if (!generatedPost.value) return;
    await window.desktop.bridge.setPostContent(network, {
      title: generatedPost.value.title,
      description: generatedPost.value.description,
      tags: generatedPost.value.tags,
    });
  }

  return {
    config,
    configLoaded,
    generating,
    generateError,
    generatedPost,
    editedTitle,
    editedDescription,
    editedTags,
    networkTagsMap,
    tagsLoading,
    personas,
    personasLoaded,
    activePersona,
    storylines,
    storylinesLoaded,
    storyEntriesMap,
    loadConfig,
    saveConfig,
    loadNetworkTags,
    addTag,
    removeTag,
    generatePost,
    clearGeneratedPost,
    pushPostContentToExtension,
    loadPersonas,
    savePersona: savePersonaAction,
    deletePersona: deletePersonaAction,
    setActivePersona: setActivePersonaAction,
    loadStorylines,
    saveStoryline: saveStorylineAction,
    deleteStoryline: deleteStorylineAction,
    loadStoryEntries,
    recordStoryEntry,
    removeStoryEntry,
  };
});
