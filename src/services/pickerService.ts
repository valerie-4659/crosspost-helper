import { pickRandomImage } from "@/repositories/imageRepository";
import { upsertPostRecord } from "@/repositories/postRecordRepository";
import type { ImageFilters } from "@/types/image";

export async function pickRandomUnpostedImage(filters: ImageFilters) {
  if (!filters.targetId) {
    throw new Error("Choose a posting target before picking an image.");
  }
  return pickRandomImage(filters);
}

export async function markImagePosted(imageId: string, targetId: string, postUrl?: string, caption?: string) {
  return upsertPostRecord({
    imageId,
    targetId,
    status: "posted",
    postUrl: postUrl?.trim() || null,
    caption: caption?.trim() || null,
  });
}

export async function markImageSkipped(imageId: string, targetId: string, caption?: string) {
  return upsertPostRecord({
    imageId,
    targetId,
    status: "skipped",
    caption: caption?.trim() || null,
  });
}

