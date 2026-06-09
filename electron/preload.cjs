const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  db: {
    select: (sql, params) => ipcRenderer.invoke("db:select", sql, params),
    execute: (sql, params) => ipcRenderer.invoke("db:execute", sql, params),
  },
  dialog: {
    open: (options) => ipcRenderer.invoke("dialog:open", options),
  },
  opener: {
    openUrl: (url) => ipcRenderer.invoke("opener:open-url", url),
    openPath: (filePath) => ipcRenderer.invoke("opener:open-path", filePath),
    revealItemInDir: (filePath) => ipcRenderer.invoke("opener:reveal", filePath),
  },
  clipboard: {
    writeText: (text) => ipcRenderer.invoke("clipboard:write-text", text),
    writeImage: (bytes) => ipcRenderer.invoke("clipboard:write-image", bytes),
    writeImageFromPath: (filePath) => ipcRenderer.invoke("clipboard:write-image-from-path", filePath),
  },
  core: {
    invoke: (command, args) => ipcRenderer.invoke("core:invoke", command, args),
    convertFileSrc: (filePath) => ipcRenderer.invoke("core:convert-file-src", filePath),
    // Synchronous: converts an absolute local path to a localfile:// URL.
    // IMPORTANT: must use 3 slashes (localfile:///path) so that Chromium's URL
    // parser does NOT treat the drive letter as a hostname.
    //   localfile://C:/...  → host="C", path="/..." → drive letter LOST ❌
    //   localfile:///C:/... → host="",  path="/C:/..." → drive letter OK  ✓
    // For macOS/Linux the path already starts with "/" so we get 3 slashes too.
    convertFileSrcSync: (filePath) => {
      const fwd = filePath.replaceAll("\\", "/");
      const p = fwd.startsWith("/") ? fwd : "/" + fwd;
      return "localfile://" + encodeURI(p);
    },
    // Native OS drag — sends real files to external apps (browsers, Finder, etc).
    // Must use async send (NOT sendSync): sendSync blocks the renderer thread which
    // prevents macOS from tracking the OS drag session. The main process calls
    // webContents.startDrag() within microseconds — well before the user can release
    // the mouse — so timing is not an issue. Matches the official Electron docs pattern.
    startDrag: (filePaths, iconPath) => ipcRenderer.send("drag:start", filePaths, iconPath),
  },
  upload: {
    // Save an image file to a local folder and index it in the library.
    // bytes is a Uint8Array (transferred as plain Array over IPC).
    saveAndIndex: (folderPath, filename, bytes) =>
      ipcRenderer.invoke("upload:save-and-index", { folderPath, filename, bytes: Array.from(bytes) }),
  },
  extension: {
    openChrome: () => ipcRenderer.invoke("extension:open-chrome"),
    downloadFirefox: () => ipcRenderer.invoke("extension:download-firefox"),
  },
  bridge: {
    // Push selected image IDs to the in-memory queue for the Chrome extension.
    setQueue: (target, imageIds) => ipcRenderer.invoke("bridge:set-queue", target, imageIds),
    clearQueue: (target) => ipcRenderer.invoke("bridge:clear-queue", target),
    getQueue: (target) => ipcRenderer.invoke("bridge:get-queue", target),
    // Push AI-generated post content so the extension can fill text fields.
    setPostContent: (target, content) => ipcRenderer.invoke("bridge:set-post-content", target, content),
    clearPostContent: (target) => ipcRenderer.invoke("bridge:clear-post-content", target),
    // Fired by the bridge HTTP server when the Chrome extension calls /clear-queue
    // (i.e. after the user clicks "Mark as Posted" in the extension popup).
    onQueueCleared: (cb) => ipcRenderer.on("bridge:queue-cleared", (_e, data) => cb(data)),
    offQueueCleared: () => ipcRenderer.removeAllListeners("bridge:queue-cleared"),
  },
  ai: {
    // Generate a post for the given network. imagePaths = absolute local paths.
    // Returns { title?, description, tags[] } or throws on error.
    generatePost: (imagePaths, network, hint, postType, perspective, ocName, storylineId, decisions, qtEventName, qtTagger, customMaxChars, aiInstructions) =>
      ipcRenderer.invoke("ai:generate-post", imagePaths, network, hint, postType, perspective, ocName, storylineId, decisions, qtEventName, qtTagger, customMaxChars, aiInstructions),
    // Generate a video prompt for the given video model. Returns plain text string.
    generateVideoPrompt: (imagePaths, videoModel, instructions) =>
      ipcRenderer.invoke("ai:generate-video-prompt", imagePaths, videoModel, instructions),
    // Generate an image recreation prompt (always SFW, model-specific). Returns plain text string.
    generateImagePrompt: (imagePaths, imageModel, instructions) =>
      ipcRenderer.invoke("ai:generate-image-prompt", imagePaths, imageModel, instructions),
  },
  wavespeed: {
    /** Submit an image-to-video job. Returns the initial job object + localId. */
    submit: (params) => ipcRenderer.invoke("wavespeed:submit", params),
    /** Return all video jobs from the DB, newest first. */
    getJobs: () => ipcRenderer.invoke("wavespeed:getJobs"),
    /** Delete a video job by its local DB id. */
    deleteJob: (localId) => ipcRenderer.invoke("wavespeed:deleteJob", localId),
    /** Subscribe to background-poller video job-update events. */
    onJobUpdated: (cb) => ipcRenderer.on("wavespeed:jobUpdated", (_e, data) => cb(data)),
    /** Remove all video job-update listeners. */
    offJobUpdated: () => ipcRenderer.removeAllListeners("wavespeed:jobUpdated"),

    /** Submit an image-recreation job. Returns the initial job object + localId. */
    submitImage: (params) => ipcRenderer.invoke("wavespeed:submitImage", params),
    /** Return all image jobs from the DB, newest first. */
    getImageJobs: () => ipcRenderer.invoke("wavespeed:getImageJobs"),
    /** Delete an image job by its local DB id. */
    deleteImageJob: (localId) => ipcRenderer.invoke("wavespeed:deleteImageJob", localId),
    /** Subscribe to background-poller image job-update events. */
    onImageJobUpdated: (cb) => ipcRenderer.on("wavespeed:imageJobUpdated", (_e, data) => cb(data)),
    /** Remove all image job-update listeners. */
    offImageJobUpdated: () => ipcRenderer.removeAllListeners("wavespeed:imageJobUpdated"),
    /** Get pixel dimensions {width, height} of a local image. */
    getImageDimensions: (imagePath) => ipcRenderer.invoke("wavespeed:getImageDimensions", imagePath),
    /** Download a generated image URL to ~/Pictures/WavespeedAI/ and reveal it. */
    downloadImage: (resultUrl, suggestedFilename) => ipcRenderer.invoke("wavespeed:downloadImage", resultUrl, suggestedFilename),
  },
  scan: {
    onProgress: (cb) => ipcRenderer.on("scan:progress", (_e, data) => cb(data)),
    offProgress: () => ipcRenderer.removeAllListeners("scan:progress"),
  },
});
