export async function writeText(text: string) {
  return window.desktop.clipboard.writeText(text);
}

export async function writeImage(image: string | Uint8Array | ArrayBuffer | number[]) {
  if (typeof image === "string") {
    return window.desktop.clipboard.writeImageFromPath(image);
  }
  return window.desktop.clipboard.writeImage(Array.from(image instanceof ArrayBuffer ? new Uint8Array(image) : image));
}
