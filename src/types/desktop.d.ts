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
    local_path: string | null;
    created_at: string;
    updated_at: string;
  }

  /**
   * Parameters for a Topaz upscale job.
   * The UI uses human-friendly model names ("standard" / "realism" / "wonder3")
   * which the backend maps to the actual Topaz API model strings.
   */
  interface TopazSubmitParams {
    /** API model name (e.g. "Standard V2", "Bloom Realism", "Wonder 3"). */
    model: string;
    /** Output image format. */
    outputFormat?: "jpeg" | "png";
    /** Upscale factor: 1 = no change, 2 = 2×, 4 = 4×, 6 = 6×, 8 = 8× */
    scale?: 1 | 2 | 4 | 6 | 8;
    /**
     * Creativity level for Standard V2 ("subtle"|"low"|"medium"|"high"|"max")
     * or Bloom Realism ("low"|"medium"|"high"|"max").
     */
    creativity?: string;
    /** Enhancement level for Wonder 3 ("low"|"medium"|"high"). */
    enhancement?: string;
    /** Enable face enhancement (Standard V2 / Bloom Realism). */
    preserveFaces?: boolean;
    /** Optional image description to guide the generative model. */
    prompt?: string;
    /** Number of output variations to generate (1 / 2 / 4). Submits N separate jobs. */
    outputs?: 1 | 2 | 4;
  }

  /** A row from the topaz_jobs SQLite table. */
  interface TopazJobRecord {
    id: string;
    image_path: string;
    original_filename: string;
    model: string;
    output_format: string;
    status: "processing" | "completed" | "failed";
    result_path: string | null;
    error_msg: string | null;
    created_at: string;
    updated_at: string;
  }

  /** A row from the job_queue SQLite table. */
  interface JobQueueRecord {
    id: number;
    type: "video" | "image";
    position: number;
    status: "pending" | "running" | "completed" | "failed";
    params: string;
    wavespeed_local_id: string | null;
    result_url: string | null;
    error_msg: string | null;
    image_path: string;
    prompt: string;
    model: string;
    ai_instructions: string;
    local_path: string | null;
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
        open(options?: {
          directory?: boolean;
          multiple?: boolean;
          title?: string;
          /** Electron dialog properties (e.g. "openFile", "openDirectory"). */
          properties?: string[];
          /** File type filters for the dialog. */
          filters?: Array<{ name: string; extensions: string[] }>;
        }): Promise<string | null>;
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
        /** Subscribe to queue-cleared events (fired when extension calls /clear-queue). */
        onQueueCleared(cb: (data: { target: string }) => void): void;
        /** Remove all queue-cleared listeners. */
        offQueueCleared(): void;
        /** Subscribe to images-posted events (fired when extension calls /mark-all-posted). */
        onImagesPosted(cb: (data: { imageIds: string[]; targetId: string }) => void): void;
        /** Remove all images-posted listeners. */
        offImagesPosted(): void;
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
          hintMode?: string,
        ): Promise<{ title: string; description: string; tags: string[] }>;
        /** Generate a video generation prompt for the given model from one or more image paths. Returns plain text. */
        generateVideoPrompt(
          imagePaths: string[],
          videoModel: string,
          instructions?: string,
          includeCameraMoves?: boolean,
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
          /** Optional end-frame image path (WAN 2.7, Kling 3.0). */
          endImagePath?: string;
          /** Whether to generate native audio (Seedance, Vidu Q3, Kling 3.0). */
          generateAudio?: boolean;
          /** Camera movement intensity for Vidu Q3. */
          movementAmplitude?: "auto" | "small" | "medium" | "large";
        }): Promise<WavespeedJob>;
        getJobs(): Promise<WavespeedJobRecord[]>;
        deleteJob(localId: string): Promise<{ ok: boolean }>;
        onJobUpdated(cb: (data: Partial<WavespeedJobRecord>) => void): void;
        offJobUpdated(): void;

        submitImage(params: {
          imagePath: string;
          prompt: string;
          imageModel?: string;
          /** Aspect ratio string for GPT/Nano Banana models, e.g. "16:9" */
          aspectRatio?: string;
          /** Resolution level for GPT/Nano Banana models: "1k" | "2k" | "4k" */
          resolution?: string;
          /** WxH size string for non-aspect models, e.g. "1024*1824" */
          size?: string;
          useRefImage?: boolean;
          quality?: "low" | "medium" | "high" | "auto";
          outputFormat?: "png" | "jpeg" | "webp";
          /** Transformation strength 0-1 for Z-Image Turbo */
          strength?: number;
        }): Promise<WavespeedJob>;
        getImageJobs(): Promise<WavespeedImageJobRecord[]>;
        deleteImageJob(localId: string): Promise<{ ok: boolean }>;
        onImageJobUpdated(cb: (data: Partial<WavespeedImageJobRecord>) => void): void;
        offImageJobUpdated(): void;
        getImageDimensions(imagePath: string): Promise<{ width: number; height: number } | null>;
        /** Download a generated image URL. Pass destDir to override ~/Pictures/WavespeedAI/.
         *  Set reveal=false to skip the Finder/Explorer reveal. */
        downloadImage(resultUrl: string, suggestedFilename?: string, reveal?: boolean, destDir?: string): Promise<{ path: string; folder: string }>;
        /** Download a completed video job to the source image's folder, auto-index, and reveal. */
        downloadVideo(localJobId: string): Promise<{ path: string }>;
      };
      jobqueue: {
        list(): Promise<JobQueueRecord[]>;
        add(params: {
          type: "video" | "image";
          params: Record<string, unknown>;
          image_path: string;
          prompt: string;
          model: string;
          ai_instructions?: string;
        }): Promise<{ ok: boolean; id: number }>;
        delete(id: number): Promise<{ ok: boolean }>;
        reorder(items: Array<{ id: number; position: number }>): Promise<{ ok: boolean }>;
        edit(params: { id: number; prompt: string; params: Record<string, unknown>; ai_instructions?: string }): Promise<{ ok: boolean }>;
        prioritize(id: number): Promise<{ ok: boolean }>;
        download(id: number): Promise<{ path: string; folder: string }>;
        requeue(id: number): Promise<{ ok: boolean }>;
        onUpdated(cb: (data: Partial<JobQueueRecord> & { action?: string }) => void): void;
        offUpdated(): void;
      };
      topaz: {
        /**
         * Blocking upscale — used by Library / Picker modals.
         * Uploads, polls, downloads, reveals in Finder, then resolves.
         */
        upscaleImage(params: TopazSubmitParams & { imagePath: string }): Promise<{ path: string; folder: string }>;
        /**
         * Fire-and-forget queue job.
         * Pass imagePath (local file) OR imageUrl (remote URL — backend downloads it).
         * Returns {localId} immediately; updates arrive via onJobUpdated.
         */
        submitJob(params: TopazSubmitParams & { imagePath?: string; imageUrl?: string }): Promise<{ localId: string }>;
        /** Return all Topaz queue jobs ordered newest-first. */
        getJobs(): Promise<TopazJobRecord[]>;
        /** Delete a Topaz queue job by its local DB id. */
        deleteJob(localId: string): Promise<{ ok: boolean }>;
        /** Subscribe to background job-update events. */
        onJobUpdated(cb: (data: Partial<TopazJobRecord>) => void): void;
        /** Remove all Topaz job-update listeners. */
        offJobUpdated(): void;
      };
      civitai: {
        /** Upload images and create a CivitAI post via the MCP API (no browser extension needed).
         *  imagePaths: absolute local file paths.
         *  publish=true publishes immediately (default true).
         *  Returns { ok, postUrl, postId } or throws a user-readable error. */
        post(params: {
          imagePaths: string[];
          title?: string;
          description?: string;
          tags?: string[];
          publish?: boolean;
        }): Promise<{ ok: boolean; postUrl: string; postId: number | null }>;
      };
      bluesky: {
        /** Upload images and create a Bluesky post via the AT Protocol (no browser extension needed).
         *  imagePaths: absolute local file paths (max 4, auto-compressed to ≤975 KB).
         *  text: post body (≤300 graphemes); tags: hashtag strings with or without leading #.
         *  Returns { ok, postUrl } or throws a user-readable error. */
        post(params: {
          imagePaths: string[];
          text: string;
          tags?: string[];
        }): Promise<{ ok: boolean; postUrl: string }>;
      };
      files: {
        /** Copy a local file to destPath (creates parent dirs). Reveals result in Finder/Explorer. */
        copyFile(srcPath: string, destPath: string): Promise<{ path: string }>;
      };
      scan: {
        onProgress(cb: (data: { scanned: number; total: number | null; currentFile: string }) => void): void;
        offProgress(): void;
      };
      library: {
        /** Fires after a file is auto-indexed following a download (Wavespeed, Topaz). */
        onFileIndexed(cb: (data: { localPath: string; mimeType: string }) => void): void;
        offFileIndexed(): void;
      };
    };
  }
}
