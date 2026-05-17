import { ref } from "vue";
import { defineStore } from "pinia";
import { exportJson, importJson } from "@/services/importExportService";

export type ThemeMode = "light" | "dark";

export const useSettingsStore = defineStore("settings", () => {
  const lastMessage = ref("");
  const themeMode = ref<ThemeMode>((localStorage.getItem("themeMode") as ThemeMode | null) ?? "dark");

  function applyTheme(mode = themeMode.value) {
    document.documentElement.classList.toggle("theme-light", mode === "light");
    document.documentElement.classList.toggle("theme-dark", mode === "dark");
    localStorage.setItem("themeMode", mode);
  }

  function setThemeMode(mode: ThemeMode) {
    themeMode.value = mode;
    applyTheme(mode);
  }

  async function exportData() {
    const json = await exportJson();
    await navigator.clipboard.writeText(json);
    lastMessage.value = "Export JSON copied to clipboard.";
  }

  async function importData(json: string) {
    const result = await importJson(json);
    lastMessage.value = `Import complete. Processed ${result.imported} records.`;
  }

  return {
    lastMessage,
    themeMode,
    applyTheme,
    setThemeMode,
    exportData,
    importData,
  };
});
