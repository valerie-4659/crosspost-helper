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
  const rethumbingSourceId = ref<string | null>(null);
  const lastScanResults = ref<Record<string, ScanResult>>({});
  const scanProgress = ref<{ scanned: number; total: number | null; currentFile: string } | null>(null);
  const error = ref<string | null>(null);

  async function load() {
    loading.value = true;
    error.value = null;
    try {
      sources.value = await listSources();
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : String(caught);
    } finally {
      loading.value = false;
    }
  }

  async function addSource(input: ImageSourceInput) {
    error.value = null;
    const source = await createSource(input);
    if (source.type === "local_folder") {
      window.desktop?.watcher?.start(source.id, source.rootPathOrId);
    }
    sources.value = await listSources();
  }

  async function addLocalFolder() {
    error.value = null;
    try {
      const selected = await open({ directory: true, multiple: false, title: "Choose image folder" });
      const path = Array.isArray(selected) ? selected[0] : selected;
      if (!path) {
        return;
      }
      const name = path.split(/[\\/]/).filter(Boolean).at(-1) ?? "Local folder";
      await addSource({ type: "local_folder", name, rootPathOrId: path });
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : String(caught);
    }
  }

  async function removeSource(id: string) {
    error.value = null;
    window.desktop?.watcher?.stop(id);
    await deleteSource(id);
    sources.value = await listSources();
  }

  async function setEnabled(id: string, enabled: boolean) {
    error.value = null;
    await updateSourceEnabled(id, enabled);
    sources.value = await listSources();
  }

  async function rethumbSource(source: ImageSource) {
    error.value = null;
    rethumbingSourceId.value = source.id;
    scanProgress.value = null;
    window.desktop?.scan?.onProgress((data) => { scanProgress.value = data; });
    try {
      await window.desktop.core.invoke("rethumbnail_source", { sourceId: source.id });
    } finally {
      rethumbingSourceId.value = null;
      scanProgress.value = null;
      window.desktop?.scan?.offProgress();
    }
  }

  async function scanSource(source: ImageSource) {
    error.value = null;
    scanningSourceId.value = source.id;
    scanProgress.value = null;

    window.desktop?.scan?.onProgress((data) => {
      scanProgress.value = data;
    });

    try {
      const result = await scanImageSource(source);
      lastScanResults.value[source.id] = result;
      return result;
    } finally {
      scanningSourceId.value = null;
      scanProgress.value = null;
      window.desktop?.scan?.offProgress();
    }
  }

  return {
    sources,
    loading,
    scanningSourceId,
    rethumbingSourceId,
    lastScanResults,
    scanProgress,
    error,
    load,
    addSource,
    addLocalFolder,
    removeSource,
    setEnabled,
    rethumbSource,
    scanSource,
  };
});
