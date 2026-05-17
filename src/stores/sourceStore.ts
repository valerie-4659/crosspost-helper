import { ref } from "vue";
import { defineStore } from "pinia";
import { open } from "@tauri-apps/plugin-dialog";
import { createSource, deleteSource, listSources, updateSourceEnabled } from "@/repositories/sourceRepository";
import { scanImageSource } from "@/services/sourceScannerService";
import type { ImageSource, ImageSourceInput } from "@/types/imageSource";
import type { ScanResult } from "@/types/scan";

export const useSourceStore = defineStore("sources", () => {
  const sources = ref<ImageSource[]>([]);
  const loading = ref(false);
  const scanningSourceId = ref<string | null>(null);
  const lastScanResults = ref<Record<string, ScanResult>>({});

  async function load() {
    loading.value = true;
    try {
      sources.value = await listSources();
    } finally {
      loading.value = false;
    }
  }

  async function addSource(input: ImageSourceInput) {
    await createSource(input);
    sources.value = await listSources();
  }

  async function addLocalFolder() {
    const selected = await open({ directory: true, multiple: false, title: "Choose image folder" });
    if (typeof selected !== "string") {
      return;
    }
    const name = selected.split(/[\\/]/).filter(Boolean).at(-1) ?? "Local folder";
    await addSource({ type: "local_folder", name, rootPathOrId: selected });
  }

  async function removeSource(id: string) {
    await deleteSource(id);
    sources.value = await listSources();
  }

  async function setEnabled(id: string, enabled: boolean) {
    await updateSourceEnabled(id, enabled);
    sources.value = await listSources();
  }

  async function scanSource(source: ImageSource) {
    scanningSourceId.value = source.id;
    try {
      const result = await scanImageSource(source);
      lastScanResults.value[source.id] = result;
      return result;
    } finally {
      scanningSourceId.value = null;
    }
  }

  return {
    sources,
    loading,
    scanningSourceId,
    lastScanResults,
    load,
    addSource,
    addLocalFolder,
    removeSource,
    setEnabled,
    scanSource,
  };
});

