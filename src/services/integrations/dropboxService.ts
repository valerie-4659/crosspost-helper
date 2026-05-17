import type { ImageInput } from "@/types/image";
import type { ImageSource } from "@/types/imageSource";

export async function scanDropboxSource(_source: ImageSource): Promise<ImageInput[]> {
  throw new Error("Dropbox integration is scaffolded for the next MVP milestone.");
}

