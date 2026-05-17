import { invoke } from "@tauri-apps/api/core";
import type { LocalImageFile } from "@/types/scan";

export async function scanLocalFolder(rootPath: string): Promise<LocalImageFile[]> {
  return invoke<LocalImageFile[]>("scan_local_folder", { rootPath });
}

