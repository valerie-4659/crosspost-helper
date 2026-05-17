import { convertFileSrc } from "@tauri-apps/api/core";
import { writeImage, writeText } from "@tauri-apps/plugin-clipboard-manager";
import { openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
import type { ImageWithPostState } from "@/types/image";

export async function revealImage(image: ImageWithPostState) {
  if (image.localPath) {
    await revealItemInDir(image.localPath);
    return;
  }
  if (image.webViewLink) {
    await openUrl(image.webViewLink);
  }
}

export async function copyImagePath(image: ImageWithPostState) {
  const value = image.localPath ?? image.webViewLink ?? image.filename;
  await writeText(value);
}

export async function copyImageToClipboard(image: ImageWithPostState) {
  if (!image.localPath) {
    await copyImagePath(image);
    return;
  }

  const response = await fetch(convertFileSrc(image.localPath));
  const bytes = new Uint8Array(await response.arrayBuffer());
  await writeImage(bytes);
}

export function setImageDragData(event: DragEvent, image: ImageWithPostState) {
  if (!event.dataTransfer) return;

  const value = image.localPath ?? image.webViewLink ?? image.filename;
  event.dataTransfer.effectAllowed = "copy";
  event.dataTransfer.setData("text/plain", value);

  if (image.localPath) {
    event.dataTransfer.setData("text/uri-list", `file://${encodeURI(image.localPath)}`);
  } else if (image.webViewLink) {
    event.dataTransfer.setData("text/uri-list", image.webViewLink);
  }
}
