import { ref } from "vue";
import { defineStore } from "pinia";

const LS_KEY = "crosspost_folder_history";
const MAX_ENTRIES = 200;

/**
 * Tracks which folders the user has visited (Library navigation) or picked images
 * from (Picker). Persisted in localStorage.
 *
 * Shape stored: { [folderPath: string]: timestampMs }
 */
export const useFolderHistoryStore = defineStore("folderHistory", () => {
  const history = ref<Record<string, number>>(load());

  function load(): Record<string, number> {
    try { return JSON.parse(localStorage.getItem(LS_KEY) ?? "{}"); }
    catch { return {}; }
  }

  function persist() {
    localStorage.setItem(LS_KEY, JSON.stringify(history.value));
  }

  /** Record a folder visit (Library navigation or Picker pick). */
  function recordVisit(folderPath: string) {
    if (!folderPath) return;
    const updated = { ...history.value, [folderPath]: Date.now() };
    // Keep only MAX_ENTRIES most recent entries.
    const trimmed = Object.entries(updated)
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_ENTRIES);
    history.value = Object.fromEntries(trimmed);
    persist();
  }

  /**
   * Returns folder paths sorted by last-visit timestamp.
   * @param direction "desc" = most-recent first (default), "asc" = oldest first
   */
  function getOrderedPaths(direction: "desc" | "asc" = "desc"): string[] {
    return Object.entries(history.value)
      .sort((a, b) => direction === "desc" ? b[1] - a[1] : a[1] - b[1])
      .map(([path]) => path);
  }

  /** ISO timestamp string for a path, or undefined if not visited. */
  function lastVisitedAt(folderPath: string): string | undefined {
    const ts = history.value[folderPath];
    return ts ? new Date(ts).toLocaleString() : undefined;
  }

  return { history, recordVisit, getOrderedPaths, lastVisitedAt };
});
