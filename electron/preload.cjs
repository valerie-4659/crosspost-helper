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
    // Synchronous: converts an absolute local path to localfile:// so img src
    // can be set inline without an async round-trip through IPC.
    // encodeURI handles spaces and special chars; % is encoded as %25 so the
    // localfile:// handler in main.cjs correctly resolves it back to a file:// URL.
    convertFileSrcSync: (filePath) => "localfile://" + encodeURI(filePath),
    // Native OS drag — sends real files to external apps (browsers, native apps).
    // iconPath is optional: path to a small thumbnail to use as the drag cursor icon.
    startDrag: (filePaths, iconPath) => ipcRenderer.send("drag:start", filePaths, iconPath),
  },
});
