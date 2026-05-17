import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { writeImage, writeText } from "@tauri-apps/plugin-clipboard-manager";
import { open } from "@tauri-apps/plugin-dialog";
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

  setImagesDragData(event, [image]);
}

export function setImagesDragData(event: DragEvent, images: ImageWithPostState[]) {
  if (!event.dataTransfer) return;

  const values = images.map((image) => image.localPath ?? image.webViewLink ?? image.filename);
  event.dataTransfer.effectAllowed = "copy";
  event.dataTransfer.setData("text/plain", values.join("\n"));

  const uriList = images
    .map((image) => {
      if (image.localPath) return `file://${encodeURI(image.localPath)}`;
      return image.webViewLink;
    })
    .filter(Boolean)
    .join("\n");

  if (uriList) {
    event.dataTransfer.setData("text/uri-list", uriList);
  }
}

export async function exportImagesToFolder(images: ImageWithPostState[]) {
  const localPaths = images
    .map((image) => image.localPath)
    .filter((path): path is string => Boolean(path));
  if (localPaths.length === 0) {
    throw new Error("No local files selected.");
  }

  const selected = await open({ directory: true, multiple: false, title: "Choose export folder" });
  const destination = Array.isArray(selected) ? selected[0] : selected;
  if (!destination) {
    return 0;
  }

  return invoke<number>("copy_images_to_folder", { paths: localPaths, destination });
}
