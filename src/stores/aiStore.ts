import { ref } from "vue";
import { defineStore } from "pinia";
import { getAiConfig, saveAiConfig, listNetworkTags, addNetworkTag, removeNetworkTag } from "@/repositories/aiRepository";
import type { AiConfig, GeneratedPost, NetworkTag } from "@/types/aiSettings";

export const useAiStore = defineStore("ai", () => {
  const config = ref<AiConfig>({ provider: "openai", model: "gpt-4o-mini", apiKey: "" });
  const configLoaded = ref(false);

  const generating = ref(false);
  const generateError = ref("");
  const generatedPost = ref<GeneratedPost | null>(null);

  // Per-network tags (loaded on demand, keyed by network)
  const networkTagsMap = ref<Record<string, NetworkTag[]>>({});
  const tagsLoading = ref(false);

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
   * @param imagePaths  Absolute local paths (max 4)
   * @param network     Target network type string
   */
  async function generatePost(imagePaths: string[], network: string) {
    generating.value = true;
    generateError.value = "";
    generatedPost.value = null;
    try {
      const result = await window.desktop.ai.generatePost(imagePaths, network);
      generatedPost.value = { ...result, network };
    } catch (err) {
      generateError.value = err instanceof Error ? err.message : String(err);
    } finally {
      generating.value = false;
    }
  }

  function clearGeneratedPost() {
    generatedPost.value = null;
    generateError.value = "";
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
    networkTagsMap,
    tagsLoading,
    loadConfig,
    saveConfig,
    loadNetworkTags,
    addTag,
    removeTag,
    generatePost,
    clearGeneratedPost,
    pushPostContentToExtension,
  };
});
