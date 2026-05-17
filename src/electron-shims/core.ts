export async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  return window.desktop.core.invoke(command, args) as Promise<T>;
}

export function convertFileSrc(filePath: string) {
  return window.desktop.core.convertFileSrcSync?.(filePath) ?? `file://${encodeURI(filePath)}`;
}
