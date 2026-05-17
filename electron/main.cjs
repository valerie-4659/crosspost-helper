const { app, BrowserWindow, clipboard, dialog, ipcMain, nativeImage, net, protocol, shell } = require("electron");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const initSqlJs = require("sql.js");

// Allow the renderer to load local image files via localfile:// without
// triggering Electron's file:// security restrictions.
protocol.registerSchemesAsPrivileged([
  { scheme: "localfile", privileges: { secure: true, supportFetchAPI: true } },
]);

let mainWindow;
let sqlPromise;
let database;
let databasePath;
let databaseInitPromise;

const supportedExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

function appDataPath() {
  const dir = path.join(app.getPath("userData"), "data");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function thumbnailDir() {
  const dir = path.join(app.getPath("userData"), "thumbnails");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Generate a 400px-wide JPEG thumbnail and cache it by source-path hash.
// Uses Electron's built-in nativeImage — no extra dependencies.
// Returns the absolute thumbnail path, or null if generation fails.
async function generateThumbnail(localPath) {
  const hash = crypto.createHash("md5").update(localPath).digest("hex");
  const thumbPath = path.join(thumbnailDir(), `${hash}.jpg`);
  if (fs.existsSync(thumbPath)) return thumbPath;
  try {
    const img = await nativeImage.createThumbnailFromPath(localPath, { width: 400, height: 400 });
    if (img.isEmpty()) return null;
    fs.writeFileSync(thumbPath, img.toJPEG(85));
    return thumbPath;
  } catch {
    return null;
  }
}

function migrationSql() {
  return fs.readFileSync(path.join(__dirname, "..", "src", "database", "migrations", "001_initial.sql"), "utf8");
}

async function getSql() {
  if (!sqlPromise) {
    sqlPromise = initSqlJs({
      locateFile(file) {
        if (app.isPackaged) return path.join(process.resourcesPath, file);
        return path.join(__dirname, "..", "node_modules", "sql.js", "dist", file);
      },
    });
  }
  return sqlPromise;
}

async function getDatabase() {
  if (!databaseInitPromise) {
    databaseInitPromise = (async () => {
      const SQL = await getSql();
      databasePath = path.join(appDataPath(), "crossposthelper.db");
      if (fs.existsSync(databasePath)) {
        database = new SQL.Database(fs.readFileSync(databasePath));
      } else {
        database = new SQL.Database();
      }
      database.run(migrationSql());
      persistDatabase();
      return database;
    })();
  }
  return databaseInitPromise;
}

function persistDatabase() {
  if (!database || !databasePath) return;
  fs.writeFileSync(databasePath, Buffer.from(database.export()));
}

function normalizeParams(params) {
  return Array.isArray(params) ? params : [];
}

async function dbSelect(_event, sql, params = []) {
  const db = await getDatabase();
  const stmt = db.prepare(sql);
  stmt.bind(normalizeParams(params));
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  const snippet = sql.replace(/\s+/g, " ").slice(0, 80);
  console.log(`[DB SELECT] rows=${rows.length} sql="${snippet}"`);
  return rows;
}

async function dbExecute(_event, sql, params = []) {
  const db = await getDatabase();
  const stmt = db.prepare(sql);
  stmt.run(normalizeParams(params));
  stmt.free();
  persistDatabase();
  const snippet = sql.replace(/\s+/g, " ").slice(0, 80);
  console.log(`[DB EXECUTE] modified=${db.getRowsModified()} sql="${snippet}"`);
  return { rowsAffected: db.getRowsModified(), lastInsertId: 0 };
}

async function walkImages(rootPath) {
  const results = [];
  async function recurse(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const current = path.join(dir, entry.name);
      if (entry.isDirectory()) { await recurse(current); continue; }
      if (!entry.isFile() || !supportedExtensions.has(path.extname(entry.name).toLowerCase())) continue;
      const stat = fs.statSync(current);
      const thumbPath = await generateThumbnail(current);
      results.push({
        localPath: current,
        sourceFileId: current,
        filename: entry.name,
        folderPath: path.dirname(current),
        mimeType: mimeTypeFor(current),
        fileSize: stat.size,
        createdAt: stat.birthtime.toISOString(),
        modifiedAt: stat.mtime.toISOString(),
        perceptualHash: null,
        width: null,
        height: null,
        thumbnailUrl: thumbPath ? "localfile://" + encodeURI(thumbPath) : null,
      });
    }
  }
  await recurse(rootPath);
  return results;
}

function mimeTypeFor(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";
  if (extension === ".gif") return "image/gif";
  return "application/octet-stream";
}

function copyImagesToFolder(paths, destination) {
  if (!fs.existsSync(destination) || !fs.statSync(destination).isDirectory()) {
    throw new Error("Destination folder does not exist");
  }
  let copied = 0;
  for (const source of paths) {
    if (!source || !fs.existsSync(source) || !fs.statSync(source).isFile()) continue;
    const parsed = path.parse(source);
    let target = path.join(destination, parsed.base);
    let index = 1;
    while (fs.existsSync(target)) {
      target = path.join(destination, `${parsed.name}-${index}${parsed.ext}`);
      index += 1;
    }
    fs.copyFileSync(source, target);
    copied += 1;
  }
  return copied;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1060,
    minHeight: 720,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  // Forward renderer console messages to the terminal for debugging
  mainWindow.webContents.on("console-message", (_e, level, message, line, sourceId) => {
    const tag = ["LOG", "WARN", "ERROR", "DEBUG"][level] ?? "LOG";
    // Print all renderer messages so we can trace DB calls and Vue errors
    const fn = level >= 2 ? console.error : console.log;
    fn(`[Renderer ${tag}] ${message} (${sourceId}:${line})`);
  });
}

app.whenReady().then(() => {
  ipcMain.handle("db:select", dbSelect);
  ipcMain.handle("db:execute", dbExecute);
  ipcMain.handle("dialog:open", async (_event, options) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: options?.title,
      properties: [options?.directory ? "openDirectory" : "openFile", options?.multiple ? "multiSelections" : undefined].filter(Boolean),
    });
    if (result.canceled) return null;
    return options?.multiple ? result.filePaths : result.filePaths[0] ?? null;
  });
  ipcMain.handle("opener:open-url", (_event, url) => shell.openExternal(String(url)));
  ipcMain.handle("opener:open-path", (_event, filePath) => shell.openPath(filePath));
  ipcMain.handle("opener:reveal", (_event, filePath) => shell.showItemInFolder(filePath));
  ipcMain.handle("clipboard:write-text", (_event, text) => clipboard.writeText(String(text)));
  ipcMain.handle("clipboard:write-image", (_event, bytes) => clipboard.writeImage(nativeImage.createFromBuffer(Buffer.from(bytes))));
  ipcMain.handle("clipboard:write-image-from-path", (_event, filePath) => clipboard.writeImage(nativeImage.createFromPath(filePath)));
  ipcMain.handle("core:convert-file-src", (_event, filePath) => pathToFileURL(filePath).toString());

  // Native OS file drag — attaches real files to the active drag so external
  // apps (Finder, Discord, browsers) receive them on drop.
  ipcMain.on("drag:start", (event, filePaths, iconPath) => {
    // Skip existsSync — it can return false for Google Drive / FUSE virtual paths
    // even though the file is perfectly accessible.
    const paths = (Array.isArray(filePaths) ? filePaths : [filePaths]).filter(
      (p) => typeof p === "string" && p.length > 0,
    );
    if (!paths.length) return;

    // Use pre-cached thumbnail as drag icon — loads in <1 ms.
    let icon;
    if (iconPath && fs.existsSync(iconPath)) {
      icon = nativeImage.createFromPath(iconPath);
    }
    if (!icon || icon.isEmpty()) {
      // Fallback: a valid 32×32 grey square — guaranteed non-empty on macOS.
      icon = nativeImage.createFromDataURL(
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAS0lEQVR42mNk" +
        "YGD4z8BAAIwGIJMBAAAA//8DAFoABf9XlQAAAABJRU5ErkJggg==",
      );
    }
    // Use singular 'file' for maximum macOS compatibility.
    event.sender.startDrag({ file: paths[0], icon });
  });
  ipcMain.handle("core:invoke", (_event, command, args = {}) => {
    if (command === "scan_local_folder") return walkImages(args.rootPath);
    if (command === "copy_images_to_folder") return copyImagesToFolder(args.paths ?? [], args.destination);
    if (command === "debug_image_count") return getDatabase().then((db) => {
      const r = db.exec("SELECT COUNT(*) FROM images");
      return r[0]?.values?.[0]?.[0] ?? 0;
    });
    throw new Error(`Unknown command: ${command}`);
  });

  // Serve local files via the localfile:// protocol so the renderer can
  // display images from arbitrary disk locations safely.
  protocol.handle("localfile", (request) => {
    const fileUrl = "file://" + request.url.slice("localfile://".length);
    return net.fetch(fileUrl);
  });

  createWindow();


});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
