import { upsertImage } from "@/repositories/imageRepository";
import { scanDropboxSource } from "@/services/integrations/dropboxService";
import { scanGoogleDriveSource } from "@/services/integrations/googleDriveService";
import { scanLocalFolder } from "@/services/integrations/localFolderService";
import type { ImageInput } from "@/types/image";
import type { ImageSource } from "@/types/imageSource";
import type { ScanResult } from "@/types/scan";

export async function scanImageSource(source: ImageSource): Promise<ScanResult> {
  // local_folder: walk + thumbnails + DB upserts all happen inside the main
  // process in one SQL transaction. The renderer never touches the DB per-file,
  // so no N × 2 IPC round-trips and no N disk-writes after the progress bar
  // reaches 100 %.
  if (source.type === "local_folder") {
    try {
      return await scanLocalFolder(source.id, source.rootPathOrId);
    } catch (error) {
      return {
        sourceId: source.id,
        scanned: 0,
        indexed: 0,
        duplicates: 0,
        removed: 0,
        errors: [error instanceof Error ? error.message : String(error)],
      };
    }
  }

  // Cloud sources: keep the existing per-file upsert pattern (low volume).
  const result: ScanResult = {
    sourceId: source.id,
    scanned: 0,
    indexed: 0,
    duplicates: 0,
    removed: 0,
    errors: [],
  };

  try {
    let files: ImageInput[];
    if (source.type === "google_drive") {
      files = await scanGoogleDriveSource(source);
    } else {
      files = await scanDropboxSource(source);
    }
    result.scanned = files.length;
    for (const file of files) {
      const upsert = await upsertImage(file);
      if (upsert.created) {
        result.indexed += 1;
      } else {
        result.duplicates += 1;
      }
    }
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : String(error));
  }

  return result;
}
