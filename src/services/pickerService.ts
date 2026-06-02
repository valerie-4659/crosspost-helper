import { countEligibleImages, pickRandomImage } from "@/repositories/imageRepository";
import { markWithSiblings } from "@/repositories/postRecordRepository";
import type { ImageFilters } from "@/types/image";

export async function pickRandomUnpostedImage(filters: ImageFilters) {
  if (!filters.targetId) {
    throw new Error("Choose a posting target before picking an image.");
  }
  return pickRandomImage(filters);
}

export { countEligibleImages };

export async function markImagePosted(imageId: string, targetId: string, postUrl?: string, caption?: string) {
  await markWithSiblings(imageId, targetId, "posted", {
    postUrl: postUrl?.trim() || null,
    caption: caption?.trim() || null,
  });
}

export async function markImageSkipped(imageId: string, targetId: string, caption?: string) {
  await markWithSiblings(imageId, targetId, "skipped", {
    caption: caption?.trim() || null,
  });
}

