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
    // Native OS drag — sends real files to external apps (browsers, native apps).
    // iconPath is optional: path to a small thumbnail to use as the drag cursor icon.
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
    generatePost: (imagePaths, network, hint, postType, perspective, ocName, storylineId, decisions, qtEventName, qtTagger, customMaxChars) =>
      ipcRenderer.invoke("ai:generate-post", imagePaths, network, hint, postType, perspective, ocName, storylineId, decisions, qtEventName, qtTagger, customMaxChars),
  },
  scan: {
    onProgress: (cb) => ipcRenderer.on("scan:progress", (_e, data) => cb(data)),
    offProgress: () => ipcRenderer.removeAllListeners("scan:progress"),
  },
});
