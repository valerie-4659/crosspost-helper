export async function openUrl(url: string | URL) {
  return window.desktop.opener.openUrl(String(url));
}

export async function openPath(filePath: string) {
  return window.desktop.opener.openPath(filePath);
}

export async function revealItemInDir(filePath: string | string[]) {
  const firstPath = Array.isArray(filePath) ? filePath[0] : filePath;
  return window.desktop.opener.revealItemInDir(firstPath);
}
