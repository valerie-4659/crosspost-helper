import type { ImageInput } from "@/types/image";
import type { ImageSource } from "@/types/imageSource";

export async function scanGoogleDriveSource(_source: ImageSource): Promise<ImageInput[]> {
  throw new Error("Google Drive integration is scaffolded for the next MVP milestone.");
}

