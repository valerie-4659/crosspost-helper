export async function open(options?: { directory?: boolean; multiple?: boolean; title?: string }) {
  return window.desktop.dialog.open(options);
}
