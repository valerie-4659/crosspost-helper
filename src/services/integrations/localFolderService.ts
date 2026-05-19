import { invoke } from "@tauri-apps/api/core";
import type { ScanResult } from "@/types/scan";

/**
 * Walk `rootPath`, generate thumbnails, and upsert all images into the
 * database — entirely inside the main process in a single SQL transaction.
 * Returns the final ScanResult directly so the renderer never has to do
 * N × 2 IPC round-trips (one SELECT + one INSERT per image).
 */
export async function scanLocalFolder(sourceId: string, rootPath: string): Promise<ScanResult> {
  return invoke<ScanResult>("scan_and_index", { sourceId, rootPath });
}

