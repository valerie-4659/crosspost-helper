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
      bridge: {
        /** Push selected image IDs to the bridge queue for a target platform. */
        setQueue(target: string, imageIds: string[]): Promise<{ ok: boolean; count: number }>;
        /** Clear the queue for a target platform. */
        clearQueue(target: string): Promise<{ ok: boolean }>;
        /** Read back the current queue for a target platform. */
        getQueue(target: string): Promise<{ imageIds: string[]; limit: number }>;
        /** Store AI-generated post content for the Chrome extension to fill. */
        setPostContent(target: string, content: { title?: string; description: string; tags: string[] }): Promise<{ ok: boolean }>;
        /** Clear the AI post content for a target platform. */
        clearPostContent(target: string): Promise<{ ok: boolean }>;
      };
      ai: {
        /** Ask main process to generate a post for the given network via the configured AI provider. */
        generatePost(
          imagePaths: string[],
          network: string,
          hint?: string,
          postType?: string,
          perspective?: string,
          ocName?: string,
          storylineId?: string | null,
          decisions?: Array<{ emoji: string; label: string }> | null,
          qtEventName?: string,
        ): Promise<{ title: string; description: string; tags: string[] }>;
      };
      scan: {
        /**
         * Subscribe to per-file progress events emitted during a folder scan.
         * `total` is null during the walk phase (total unknown) and a number
         * during the thumbnail phase (total files found by the worker).
         */
        onProgress(cb: (data: { scanned: number; total: number | null; currentFile: string }) => void): void;
        /** Remove all scan:progress listeners. */
        offProgress(): void;
      };
    };
  }
}
