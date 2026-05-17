import { findDuplicateCandidates } from "@/repositories/imageRepository";
import type { DuplicateWarning, ImageInput } from "@/types/image";

export async function getDuplicateWarnings(input: ImageInput): Promise<DuplicateWarning[]> {
  const candidates = await findDuplicateCandidates(input);
  return candidates.map((candidate) => ({
    imageId: candidate.id,
    filename: candidate.filename,
    folderPath: candidate.folderPath,
    reason: candidate.perceptualHash && candidate.perceptualHash === input.perceptualHash
      ? "perceptual_hash"
      : candidate.sourceFileId && candidate.sourceFileId === input.sourceFileId
        ? "source_file_id"
        : "fallback",
  }));
}

