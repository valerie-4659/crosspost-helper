import { ref } from "vue";
import { defineStore } from "pinia";
import { exportJson, importJson } from "@/services/importExportService";

export const useSettingsStore = defineStore("settings", () => {
  const lastMessage = ref("");

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
    exportData,
    importData,
  };
});
