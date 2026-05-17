import { upsertImage } from "@/repositories/imageRepository";
import { scanDropboxSource } from "@/services/integrations/dropboxService";
import { scanGoogleDriveSource } from "@/services/integrations/googleDriveService";
import { scanLocalFolder } from "@/services/integrations/localFolderService";
import type { ImageInput } from "@/types/image";
import type { ImageSource } from "@/types/imageSource";
import type { ScanResult } from "@/types/scan";

function localFileToImageInput(source: ImageSource, file: Awaited<ReturnType<typeof scanLocalFolder>>[number]): ImageInput {
  return {
    sourceId: source.id,
    sourceFileId: file.sourceFileId,
    localPath: file.localPath,
    filename: file.filename,
    folderPath: file.folderPath,
    mimeType: file.mimeType,
    fileSize: file.fileSize,
    createdAt: file.createdAt,
    modifiedAt: file.modifiedAt,
    perceptualHash: file.perceptualHash,
    width: file.width,
    height: file.height,
    rating: "unknown",
  };
}

async function scanSourceFiles(source: ImageSource): Promise<ImageInput[]> {
  if (source.type === "local_folder") {
    const files = await scanLocalFolder(source.rootPathOrId);
    return files.map((file) => localFileToImageInput(source, file));
  }
  if (source.type === "google_drive") {
    return scanGoogleDriveSource(source);
  }
  return scanDropboxSource(source);
}

export async function scanImageSource(source: ImageSource): Promise<ScanResult> {
  const result: ScanResult = {
    sourceId: source.id,
    scanned: 0,
    indexed: 0,
    duplicates: 0,
    errors: [],
  };

  try {
    const files = await scanSourceFiles(source);
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
