export {};

declare global {
  interface Window {
    desktop: {
      db: {
        select<T = unknown[]>(sql: string, params?: unknown[]): Promise<T>;
        execute(sql: string, params?: unknown[]): Promise<{ rowsAffected: number; lastInsertId: number }>;
      };
      dialog: {
        open(options?: { directory?: boolean; multiple?: boolean; title?: string }): Promise<string | string[] | null>;
      };
      opener: {
        openUrl(url: string): Promise<void>;
        openPath(filePath: string): Promise<void>;
        revealItemInDir(filePath: string): Promise<void>;
      };
      clipboard: {
        writeText(text: string): Promise<void>;
        writeImage(bytes: number[]): Promise<void>;
        writeImageFromPath(filePath: string): Promise<void>;
      };
      core: {
        invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
        convertFileSrc(filePath: string): Promise<string>;
        convertFileSrcSync?: (filePath: string) => string;
        /** Trigger a native OS file drag so external apps receive real files. */
        startDrag?: (filePaths: string[], iconPath?: string) => void;
      };
      extension: {
        /** Reveal the Chrome extension folder in Finder / Explorer. */
        openChrome(): Promise<void>;
        /** Package the Firefox extension as a .zip and prompt a save dialog. */
        downloadFirefox(): Promise<{ ok: boolean; filePath?: string; error?: string }>;
      };
    };
  }
}
