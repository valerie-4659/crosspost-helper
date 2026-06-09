export {};

declare global {
  /** Shape returned by the Wavespeed REST API. */
  interface WavespeedJob {
    id: string;
    model: string;
    status: "created" | "processing" | "completed" | "failed";
    outputs: string[];
    error?: string;
    urls?: { get: string };
    timings?: { inference: number };
    created_at?: string;
    /** Local DB row id — added by the IPC handler after persisting. */
    localId?: string;
  }

  /** A row from the wavespeed_jobs SQLite table. */
  interface WavespeedJobRecord {
    id: string;
    job_id: string;
    image_path: string;
    prompt: string;
    model: string;
    resolution: string;
    duration: number;
    status: "created" | "processing" | "completed" | "failed";
    video_url: string | null;
    error_msg: string | null;
    created_at: string;
    updated_at: string;
  }

  /** A row from the wavespeed_image_jobs SQLite table. */
  interface WavespeedImageJobRecord {
    id: string;
    job_id: string;
    image_path: string;
    prompt: string;
    model: string;
    size: string;
    status: "created" | "processing" | "completed" | "failed";
    result_url: string | null;
    error_msg: string | null;
    created_at: string;
    updated_at: string;
  }

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
      upload: {
        /** Save a raw image file to a library folder and index it in the DB. */
        saveAndIndex(
          folderPath: string,
          filename: string,
          bytes: Uint8Array,
        ): Promise<{ ok: boolean; id: string; localPath: string; thumbnailUrl: string; filename: string; folderPath: string }>;
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
        /** Subscribe to queue-cleared events (fired when extension clicks "Mark as Posted"). */
        onQueueCleared(cb: (data: { target: string }) => void): void;
        /** Remove all queue-cleared listeners. */
        offQueueCleared(): void;
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
          qtTagger?: string,
          customMaxChars?: number | null,
          aiInstructions?: string,
        ): Promise<{ title: string; description: string; tags: string[] }>;
        /** Generate a video generation prompt for the given model from one or more image paths. Returns plain text. */
        generateVideoPrompt(
          imagePaths: string[],
          videoModel: string,
          instructions?: string,
        ): Promise<string>;
        /** Generate a SFW image recreation prompt for the given image model. Returns plain text. */
        generateImagePrompt(
          imagePaths: string[],
          imageModel: string,
          instructions?: string,
        ): Promise<string>;
      };
      wavespeed: {
        submit(params: {
          imagePath: string;
          prompt: string;
          videoModel?: string;
          resolution?: string;
          duration?: number;
          seed?: number;
        }): Promise<WavespeedJob>;
        getJobs(): Promise<WavespeedJobRecord[]>;
        deleteJob(localId: string): Promise<{ ok: boolean }>;
        onJobUpdated(cb: (data: Partial<WavespeedJobRecord>) => void): void;
        offJobUpdated(): void;

        submitImage(params: {
          imagePath: string;
          prompt: string;
          imageModel?: string;
          size?: string;
          useRefImage?: boolean;
          quality?: "low" | "medium" | "high" | "auto";
          outputFormat?: "png" | "jpeg" | "webp";
        }): Promise<WavespeedJob>;
        getImageJobs(): Promise<WavespeedImageJobRecord[]>;
        deleteImageJob(localId: string): Promise<{ ok: boolean }>;
        onImageJobUpdated(cb: (data: Partial<WavespeedImageJobRecord>) => void): void;
        offImageJobUpdated(): void;
        getImageDimensions(imagePath: string): Promise<{ width: number; height: number } | null>;
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
