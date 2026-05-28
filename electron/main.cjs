const { app, BrowserWindow, clipboard, dialog, ipcMain, nativeImage, net, protocol, shell } = require("electron");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
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
  const migrationsDir = path.join(__dirname, "..", "src", "database", "migrations");
  return [
    "001_initial.sql",
    "002_collections.sql",
    "003_ai_config.sql",
    "004_post_queues.sql",
    "005_x_tags_v2.sql",
    "006_personas.sql",
    "007_storylines.sql",
  ].map((f) => fs.readFileSync(path.join(migrationsDir, f), "utf8")).join("\n");
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

      // One-time normalisation: convert Windows backslash paths that were
      // written by pre-v0.2.5 builds.  Forward slashes work on every platform
      // (Node fs APIs accept them on Windows) and the LibraryPage folder-tree
      // logic relies on "/" splits, so every path in the DB must be "/"-only.
      //
      // Step 1: Some intermediate builds already inserted forward-slash rows
      // while the old backslash rows were still present, creating duplicates.
      // Delete the stale backslash row when a forward-slash sibling exists so
      // that Step 2's UPDATE cannot hit a UNIQUE constraint violation.
      database.run(`
        DELETE FROM images
        WHERE instr(COALESCE(source_file_id, ''), '\\') > 0
          AND EXISTS (
            SELECT 1 FROM images AS dup
            WHERE dup.source_id      = images.source_id
              AND dup.source_file_id = REPLACE(images.source_file_id, '\\', '/')
          )
      `);
      // Step 2: Normalise all remaining backslash paths in-place.
      database.run(`
        UPDATE images SET
          local_path     = REPLACE(local_path,     '\\', '/'),
          folder_path    = REPLACE(folder_path,    '\\', '/'),
          source_file_id = REPLACE(source_file_id, '\\', '/'),
          thumbnail_url  = REPLACE(thumbnail_url,  '\\', '/')
        WHERE instr(COALESCE(folder_path,    ''), '\\') > 0
           OR instr(COALESCE(local_path,     ''), '\\') > 0
           OR instr(COALESCE(source_file_id, ''), '\\') > 0
      `);
      // Step 3: Upgrade old 2-slash thumbnail URLs to 3-slash format.
      // "localfile://C:/..."  →  "localfile:///C:/..."
      // (The 2-slash form loses the Windows drive letter in Chromium's URL parser.)
      // Safe for macOS: "localfile:///Users/..." already has 3 slashes → skipped.
      database.run(`
        UPDATE images
        SET thumbnail_url = REPLACE(thumbnail_url, 'localfile://', 'localfile:///')
        WHERE thumbnail_url LIKE 'localfile://%'
          AND thumbnail_url NOT LIKE 'localfile:///%'
      `);

      // Step 4: Recreate posting_targets without the restrictive CHECK constraint
      // so that new types (instagram, facebook, tumblr) can be inserted.
      // Only runs once — guarded by checking for 'tumblr' in the CREATE TABLE SQL.
      const tblSql = database.exec("SELECT sql FROM sqlite_master WHERE type='table' AND name='posting_targets'");
      const existingCreate = tblSql[0]?.values?.[0]?.[0] ?? "";
      if (existingCreate && !existingCreate.includes("tumblr")) {
        database.run(`
          PRAGMA foreign_keys = OFF;
          CREATE TABLE posting_targets_new (
            id TEXT PRIMARY KEY NOT NULL,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            enabled INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );
          INSERT INTO posting_targets_new SELECT * FROM posting_targets;
          DROP TABLE posting_targets;
          ALTER TABLE posting_targets_new RENAME TO posting_targets;
          PRAGMA foreign_keys = ON;
        `);
      }

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

async function walkImages(rootPath, onProgress) {
  // ── Phase 1: file-system walk in a Worker Thread ────────────────────────
  // The worker uses fs.promises (fully async) so the main-process event loop
  // is never blocked, keeping the UI responsive even for huge folder trees.
  // nativeImage (thumbnail) requires the main thread, so the worker only
  // collects lightweight file metadata and streams it back here.
  const { Worker } = require("node:worker_threads");
  const workerPath = path.join(__dirname, "scanWorker.cjs");

  const fileQueue = await new Promise((resolve, reject) => {
    const worker = new Worker(workerPath, {
      workerData: { rootPath, supportedExtensions: [...supportedExtensions] },
    });
    const files = [];
    let found = 0;

    worker.on("message", (msg) => {
      if (msg.type === "file") {
        files.push(msg.data);
        found += 1;
        // Phase-1 progress: total is unknown yet (null) — show "found N files"
        if (onProgress) onProgress({ scanned: found, total: null, currentFile: msg.data.filename });
      } else if (msg.type === "done") {
        resolve(files);
      } else if (msg.type === "error") {
        reject(new Error(msg.message));
      }
    });
    worker.on("error", reject);
    worker.on("exit", (code) => {
      if (code !== 0) reject(new Error(`Scan worker exited with code ${code}`));
    });
  });

  // ── Phase 2: thumbnail generation in main thread ────────────────────────
  // nativeImage.createThumbnailFromPath is async so it yields the event loop
  // between each file — the UI stays responsive throughout.
  const total = fileQueue.length;
  const results = [];
  for (const file of fileQueue) {
    const thumbPath = await generateThumbnail(file.localPath);

    // Normalise path separators to forward slashes so that paths stored in
    // the database are always /-separated regardless of the host OS.
    // LibraryPage.vue computes rootDir / childFolders by splitting on "/"
    // and would fail completely for Windows backslash paths, showing
    // "No images scanned yet" even after a successful scan.
    // Node.js fs APIs accept forward slashes on Windows, so this is safe.
    const localPath = file.localPath.replaceAll("\\", "/");
    const folderPath = file.folderPath.replaceAll("\\", "/");
    // thumbnailUrl: always use the 3-slash localfile:/// format.
    // localfile://C:/... gets parsed by Chromium as host="C", losing the drive
    // letter.  localfile:///C:/... → host="", pathname="/C:/..." → preserved.
    const thumbnailUrl = thumbPath
      ? (() => {
          const fwd = thumbPath.replaceAll("\\", "/");
          const p = fwd.startsWith("/") ? fwd : "/" + fwd;
          return "localfile://" + encodeURI(p);
        })()
      : null;

    results.push({
      localPath,
      sourceFileId: localPath,
      filename: file.filename,
      folderPath,
      mimeType: file.mimeType,
      fileSize: file.fileSize,
      createdAt: file.createdAt,
      modifiedAt: file.modifiedAt,
      perceptualHash: null,
      width: null,
      height: null,
      thumbnailUrl,
    });
    // Phase-2 progress: total is now known — show "processing N / total"
    if (onProgress) onProgress({ scanned: results.length, total, currentFile: file.filename });
  }
  return results;
}

// ─── scan_and_index ──────────────────────────────────────────────────────────
// Walks the folder (via Worker Thread), generates thumbnails, then upserts all
// images into the database inside a single SQLite TRANSACTION so that only one
// persistDatabase() call is needed. This avoids 2 × N IPC round-trips and
// N synchronous disk-writes that previously caused the UI to freeze after the
// progress bar reached 100 %.
async function scanAndIndex(sourceId, rootPath, onProgress) {
  const files = await walkImages(rootPath, onProgress);

  // Signal the start of the (hidden) indexing phase so the UI doesn't look
  // frozen while the batch DB write is happening.
  if (onProgress && files.length > 0) {
    onProgress({ scanned: files.length, total: files.length, currentFile: "Indexing database…" });
  }

  const db = await getDatabase();
  const now = new Date().toISOString();
  let indexed = 0;
  let duplicates = 0;
  let removed = 0;
  const errors = [];

  // ── Build a Set of all file paths found on disk this scan ────────────────
  const diskPaths = new Set(files.map((f) => f.localPath));

  db.run("BEGIN TRANSACTION");
  try {
    // ── Upsert all files found on disk ───────────────────────────────────────
    for (const file of files) {
      // Check if this file was already indexed.
      const chkStmt = db.prepare(
        "SELECT id FROM images WHERE source_id = ? AND source_file_id = ? LIMIT 1"
      );
      chkStmt.bind([sourceId, file.localPath]);
      const existing = [];
      while (chkStmt.step()) existing.push(chkStmt.getAsObject());
      chkStmt.free();

      if (existing[0]) {
        const updStmt = db.prepare(
          `UPDATE images SET local_path = ?, filename = ?, folder_path = ?, mime_type = ?,
           file_size = ?, thumbnail_url = COALESCE(?, thumbnail_url), web_view_link = ?,
           created_at = ?, modified_at = ?, indexed_at = ?,
           perceptual_hash = COALESCE(?, perceptual_hash),
           width = COALESCE(?, width), height = COALESCE(?, height),
           rating = COALESCE(?, rating) WHERE id = ?`
        );
        updStmt.run([
          file.localPath, file.filename, file.folderPath, file.mimeType,
          file.fileSize ?? null, file.thumbnailUrl ?? null, null,
          file.createdAt ?? null, file.modifiedAt ?? null, now,
          null, null, null, "unknown", existing[0].id,
        ]);
        updStmt.free();
        duplicates += 1;
      } else {
        const id = `image_${crypto.randomUUID()}`;
        const insStmt = db.prepare(
          `INSERT INTO images (id, source_id, source_file_id, local_path, filename,
           folder_path, mime_type, file_size, thumbnail_url, web_view_link,
           created_at, modified_at, indexed_at, perceptual_hash, width, height, rating, is_archived)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`
        );
        insStmt.run([
          id, sourceId, file.localPath, file.localPath, file.filename,
          file.folderPath, file.mimeType, file.fileSize ?? null,
          file.thumbnailUrl ?? null, null,
          file.createdAt ?? null, file.modifiedAt ?? null, now,
          null, null, null, "unknown",
        ]);
        insStmt.free();
        indexed += 1;
      }
    }

    // ── Remove stale DB records (files deleted/moved from disk) ──────────────
    // Load all source_file_id values from DB for this source, then delete any
    // that were not found on disk during this scan.
    const allStmt = db.prepare(
      "SELECT id, source_file_id FROM images WHERE source_id = ?"
    );
    allStmt.bind([sourceId]);
    const dbRows = [];
    while (allStmt.step()) dbRows.push(allStmt.getAsObject());
    allStmt.free();

    for (const row of dbRows) {
      if (!diskPaths.has(row.source_file_id)) {
        const delStmt = db.prepare("DELETE FROM images WHERE id = ?");
        delStmt.run([row.id]);
        delStmt.free();
        removed += 1;
      }
    }

    db.run("COMMIT");
  } catch (e) {
    try { db.run("ROLLBACK"); } catch (_) { /* ignore */ }
    errors.push(e instanceof Error ? e.message : String(e));
  }

  // Single write to disk for the entire batch — previously done N times.
  persistDatabase();
  return { sourceId, scanned: files.length, indexed, duplicates, removed, errors };
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

// ─── Chrome Extension Bridge ─────────────────────────────────────────────────
const BRIDGE_PORT = 27842;
let bridgeServer = null;

// Shared post-record upsert used by both /mark-posted and /mark-all-posted.
async function upsertPostRecord(imageId, targetId) {
  const db2 = await getDatabase();
  const now = new Date().toISOString();
  const chk = db2.prepare("SELECT id FROM post_records WHERE image_id = ? AND target_id = ? LIMIT 1");
  chk.bind([imageId, targetId]);
  const existing = [];
  while (chk.step()) existing.push(chk.getAsObject());
  chk.free();
  if (existing.length) {
    const upd = db2.prepare("UPDATE post_records SET status = 'posted', posted_at = ?, updated_at = ? WHERE id = ?");
    upd.run([now, now, existing[0].id]);
    upd.free();
  } else {
    const ins = db2.prepare("INSERT INTO post_records (id, image_id, target_id, status, posted_at, created_at, updated_at) VALUES (?, ?, ?, 'posted', ?, ?, ?)");
    ins.run([`pr_${crypto.randomUUID()}`, imageId, targetId, now, now, now]);
    ins.free();
  }
  persistDatabase();
}

// Per-platform image limits for multi-image posting.
const PLATFORM_LIMITS = { civitai: 20, x: 4, bluesky: 4, deviantart: 1, instagram: 10, facebook: 1, tumblr: 1 };

// In-memory selection queue: { [target]: string[] } — set by the Electron app,
// consumed by the Chrome extension.  Lives only in RAM (no DB persistence).
const selectionQueue = new Map(); // target → string[] of imageIds

// In-memory post-content store: { [target]: { title?, description, tags[] } }
// Set by the app's AI generator; consumed by the Chrome extension's text-fill logic.
const postContentStore = new Map();

function bridgeSendJson(res, data, status = 200) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(body);
}

async function handleBridge(req, res) {
  if (req.method === "OPTIONS") {
    res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" });
    res.end();
    return;
  }
  const url = new URL(req.url, `http://127.0.0.1:${BRIDGE_PORT}`);
  const db = await getDatabase();

  if (req.method === "GET" && url.pathname === "/status") {
    // Include per-target queue counts so the popup can show live queue state.
    const queues = {};
    for (const [t, ids] of selectionQueue) queues[t] = ids.length;
    bridgeSendJson(res, { running: true, version: app.getVersion(), queues });
    return;
  }

  // ── GET /queue?target=civitai ─────────────────────────────────────────────
  // Returns the images the user selected in the Electron app for this target.
  // Each entry: { id, filename, mimeType, targetId }
  if (req.method === "GET" && url.pathname === "/queue") {
    const targetType = url.searchParams.get("target");
    if (!targetType) { bridgeSendJson(res, { error: "target parameter required" }, 400); return; }
    const ids = selectionQueue.get(targetType) ?? [];
    if (!ids.length) { bridgeSendJson(res, { images: [], targetId: null }); return; }

    // Resolve targetId from DB
    const tStmt = db.prepare("SELECT id FROM posting_targets WHERE type = ? AND enabled = 1 LIMIT 1");
    tStmt.bind([targetType]);
    const targets = [];
    while (tStmt.step()) targets.push(tStmt.getAsObject());
    tStmt.free();
    const targetId = targets[0]?.id ?? null;

    // Fetch image metadata for each queued id
    const placeholders = ids.map(() => "?").join(",");
    const iStmt = db.prepare(`SELECT id, local_path, filename, mime_type FROM images WHERE id IN (${placeholders})`);
    iStmt.bind(ids);
    const imgs = [];
    while (iStmt.step()) imgs.push(iStmt.getAsObject());
    iStmt.free();

    // Preserve the user's selection order
    const byId = Object.fromEntries(imgs.map((i) => [i.id, i]));
    const ordered = ids.map((id) => byId[id]).filter(Boolean);
    bridgeSendJson(res, {
      images: ordered.map((i) => ({ id: i.id, filename: i.filename, mimeType: i.mime_type, targetId })),
      targetId,
      limit: PLATFORM_LIMITS[targetType] ?? 1,
    });
    return;
  }

  // ── POST /set-queue ───────────────────────────────────────────────────────
  // Called by the Electron app (via IPC) to push a selection to a target queue.
  // Body: { target: string, imageIds: string[] }
  if (req.method === "POST" && url.pathname === "/set-queue") {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      try {
        const { target, imageIds } = JSON.parse(body);
        if (!target || !Array.isArray(imageIds)) { bridgeSendJson(res, { error: "target and imageIds required" }, 400); return; }
        const limit = PLATFORM_LIMITS[target] ?? 20;
        selectionQueue.set(target, imageIds.slice(0, limit));
        bridgeSendJson(res, { ok: true, count: selectionQueue.get(target).length });
      } catch (err) { bridgeSendJson(res, { error: err.message }, 400); }
    });
    return;
  }

  // ── POST /clear-queue ─────────────────────────────────────────────────────
  // Called by the extension after a successful post to clear the queue.
  // Body: { target: string }
  if (req.method === "POST" && url.pathname === "/clear-queue") {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      try {
        const { target } = JSON.parse(body);
        if (!target) { bridgeSendJson(res, { error: "target required" }, 400); return; }
        selectionQueue.delete(target);
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("bridge:queue-cleared", { target });
        bridgeSendJson(res, { ok: true });
      } catch (err) { bridgeSendJson(res, { error: err.message }, 400); }
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/next-image") {
    const targetType = url.searchParams.get("target");
    if (!targetType) { bridgeSendJson(res, { error: "target parameter required" }, 400); return; }
    const tStmt = db.prepare("SELECT id FROM posting_targets WHERE type = ? AND enabled = 1 LIMIT 1");
    tStmt.bind([targetType]);
    const targets = [];
    while (tStmt.step()) targets.push(tStmt.getAsObject());
    tStmt.free();
    if (!targets.length) { bridgeSendJson(res, { error: `No enabled target of type '${targetType}'` }, 404); return; }
    const targetId = targets[0].id;
    const iStmt = db.prepare(
      `SELECT images.id, images.local_path, images.filename, images.mime_type FROM images
       JOIN image_sources ON image_sources.id = images.source_id AND image_sources.enabled = 1
       WHERE images.is_archived = 0
       AND NOT EXISTS (
         SELECT 1 FROM post_records
         WHERE post_records.image_id = images.id AND post_records.target_id = ? AND post_records.status = 'posted'
       )
       ORDER BY RANDOM() LIMIT 1`
    );
    iStmt.bind([targetId]);
    const imgs = [];
    while (iStmt.step()) imgs.push(iStmt.getAsObject());
    iStmt.free();
    if (!imgs.length) { bridgeSendJson(res, { error: "No unposted images found" }, 404); return; }
    const img = imgs[0];
    bridgeSendJson(res, { id: img.id, filename: img.filename, localPath: img.local_path, mimeType: img.mime_type, targetId });
    return;
  }

  if (req.method === "GET" && url.pathname === "/image-paths") {
    const ids = url.searchParams.get("ids");
    if (!ids) { bridgeSendJson(res, { error: "ids required" }, 400); return; }
    const paths = {};
    for (const id of ids.split(",").filter(Boolean)) {
      const stmt = db.prepare("SELECT local_path FROM images WHERE id = ? LIMIT 1");
      stmt.bind([id]);
      while (stmt.step()) {
        const row = stmt.getAsObject();
        if (row.local_path) paths[id] = row.local_path;
      }
      stmt.free();
    }
    bridgeSendJson(res, { paths });
    return;
  }

  if (req.method === "GET" && url.pathname === "/image-file") {
    const imageId = url.searchParams.get("id");
    if (!imageId) { bridgeSendJson(res, { error: "id required" }, 400); return; }
    const stmt = db.prepare("SELECT local_path, mime_type FROM images WHERE id = ? LIMIT 1");
    stmt.bind([imageId]);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    if (!rows.length || !rows[0].local_path) { bridgeSendJson(res, { error: "Not found" }, 404); return; }
    const { local_path, mime_type } = rows[0];
    if (!fs.existsSync(local_path)) { bridgeSendJson(res, { error: "File missing on disk" }, 404); return; }
    const data = fs.readFileSync(local_path);
    res.writeHead(200, { "Content-Type": mime_type || "application/octet-stream", "Content-Length": data.length, "Access-Control-Allow-Origin": "*" });
    res.end(data);
    return;
  }

  if (req.method === "POST" && url.pathname === "/mark-posted") {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", async () => {
      try {
        const { imageId, targetId } = JSON.parse(body);
        if (!imageId || !targetId) { bridgeSendJson(res, { error: "imageId and targetId required" }, 400); return; }
        await upsertPostRecord(imageId, targetId);
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("bridge:image-posted", { imageId, targetId });
        bridgeSendJson(res, { ok: true });
      } catch (err) { bridgeSendJson(res, { error: err.message }, 400); }
    });
    return;
  }

  // ── POST /mark-all-posted ─────────────────────────────────────────────────
  // Marks an entire batch of images as posted in one round-trip.
  // Body: { imageIds: string[], targetId: string }
  if (req.method === "POST" && url.pathname === "/mark-all-posted") {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", async () => {
      try {
        const { imageIds, targetId } = JSON.parse(body);
        if (!Array.isArray(imageIds) || !targetId) { bridgeSendJson(res, { error: "imageIds[] and targetId required" }, 400); return; }
        const db2 = await getDatabase();
        db2.run("BEGIN");
        const now = new Date().toISOString();
        for (const imageId of imageIds) {
          const chk = db2.prepare("SELECT id FROM post_records WHERE image_id = ? AND target_id = ? LIMIT 1");
          chk.bind([imageId, targetId]);
          const existing = [];
          while (chk.step()) existing.push(chk.getAsObject());
          chk.free();
          if (existing.length) {
            const upd = db2.prepare("UPDATE post_records SET status = 'posted', posted_at = ?, updated_at = ? WHERE id = ?");
            upd.run([now, now, existing[0].id]);
            upd.free();
          } else {
            const ins = db2.prepare("INSERT INTO post_records (id, image_id, target_id, status, posted_at, created_at, updated_at) VALUES (?, ?, ?, 'posted', ?, ?, ?)");
            ins.run([`pr_${crypto.randomUUID()}`, imageId, targetId, now, now, now]);
            ins.free();
          }
        }
        db2.run("COMMIT");
        persistDatabase();
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("bridge:images-posted", { imageIds, targetId });
        bridgeSendJson(res, { ok: true, count: imageIds.length });
      } catch (err) { bridgeSendJson(res, { error: err.message }, 400); }
    });
    return;
  }

  // ── GET /post-content?target=x ───────────────────────────────────────────
  // Returns the AI-generated post content for a platform (title, description, tags).
  if (req.method === "GET" && url.pathname === "/post-content") {
    const targetType = url.searchParams.get("target");
    if (!targetType) { bridgeSendJson(res, { error: "target required" }, 400); return; }
    const content = postContentStore.get(targetType);
    if (!content) { bridgeSendJson(res, { ok: false, content: null }); return; }
    bridgeSendJson(res, { ok: true, content });
    return;
  }

  bridgeSendJson(res, { error: "Not found" }, 404);
}

// ─── AI Post Generation ───────────────────────────────────────────────────────

const https = require("node:https");

const NETWORK_POST_CONFIGS = {
  x:          { descMax: 180,  tagCount: 5,  titleNeeded: false, tagHasHash: true,  notes: "Punchy, engagement-first. Max 180 chars for text (leaves room for hashtags in the 280 limit)." },
  bluesky:    { descMax: 250,  tagCount: 5,  titleNeeded: false, tagHasHash: true,  notes: "Friendly, concise. Use # in tags." },
  deviantart: { descMax: 1000, tagCount: 20, titleNeeded: true,  tagHasHash: false, notes: "Artistic. Tags WITHOUT # — DA has a separate tag field. Max 20 tags." },
  civitai:    { descMax: 2000, tagCount: 30, titleNeeded: true,  tagHasHash: false, notes: "Detailed AI art description. Include style, technique, mood. Tags WITHOUT #." },
  instagram:  { descMax: 400,  tagCount: 30, titleNeeded: false, tagHasHash: true,  notes: "Engaging caption. Up to 30 hashtags WITH # symbol." },
  tumblr:     { descMax: 500,  tagCount: 20, titleNeeded: true,  tagHasHash: false, notes: "Creative. Tags WITHOUT # — Tumblr uses a separate tag input." },
  facebook:   { descMax: 500,  tagCount: 10, titleNeeded: false, tagHasHash: true,  notes: "Conversational, engaging. A few hashtags WITH # symbol." },
};

function httpsPost(hostname, path_, headers, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(body);
    const req = https.request({ hostname, path: path_, method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(bodyStr), ...headers } },
      (res) => {
        let data = "";
        res.on("data", (c) => { data += c; });
        res.on("end", () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
          catch { resolve({ status: res.statusCode, body: data }); }
        });
      });
    req.on("error", reject);
    req.write(bodyStr);
    req.end();
  });
}

function imageMime(p) {
  const ext = path.extname(p).toLowerCase();
  return { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
           ".webp": "image/webp", ".gif": "image/gif" }[ext] ?? "image/jpeg";
}

// postType: "engagement" | "qt" | "morning" | "goodnight" | "story"
// perspective: "" | "i" | "oc"  — empty string = no perspective instruction
// ocName: e.g. "Valerie"
// storylineId: null | string — if set, fetches previous story_entries for context
// decisions: null | [{emoji, label}] — 1-4 reader-vote options appended after story text
async function generateAiPost(imagePaths, network, hint = "", postType = "engagement", perspective = "", ocName = "", storylineId = null, decisions = null, qtEventName = "", qtTagger = "", customMaxChars = null) {
  const db = await getDatabase();
  // Read AI config from DB
  const rows = db.exec("SELECT key, value FROM ai_config");
  const cfg = {};
  for (const row of (rows[0]?.values ?? [])) cfg[row[0]] = row[1];
  const provider = cfg["provider"] || "openai";
  const apiKey   = cfg["api_key"]  || "";

  // Valid current models per provider — retired/invalid names fall back to the default.
  const VALID_MODELS = {
    openai:    ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-4.1"],
    grok:      ["grok-latest", "grok-4.3", "grok-4.20"],   // all support image input
    anthropic: ["claude-haiku-4-5", "claude-sonnet-4-6", "claude-opus-4-7"],
    gemini:    ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-pro"],
  };
  const DEFAULT_MODELS = { openai: "gpt-4o-mini", grok: "grok-latest", anthropic: "claude-haiku-4-5", gemini: "gemini-2.0-flash" };
  const storedModel = cfg["model"] || "";
  const validList   = VALID_MODELS[provider] ?? [];
  const model       = validList.includes(storedModel) ? storedModel : (DEFAULT_MODELS[provider] ?? validList[0] ?? storedModel);
  if (!apiKey) throw new Error("No AI API key configured. Go to Settings → AI to add one.");

  // Read network tags from DB
  const tagRows = db.exec(`SELECT tag FROM network_tags WHERE network = '${network.replace(/'/g, "''")}'`);
  const tags = (tagRows[0]?.values ?? []).map((r) => r[0]);

  // Downscale images to max 1024px and encode as JPEG before sending to the AI.
  // Sending full-resolution files as base64 easily exceeds API payload limits (→ 400/502).
  const validPaths = (imagePaths ?? []).filter((p) => p && fs.existsSync(p)).slice(0, 1);
  const imageData = [];
  for (const p of validPaths) {
    try {
      const img = await nativeImage.createThumbnailFromPath(p, { width: 1024, height: 1024 });
      if (!img.isEmpty()) {
        imageData.push({ mime: "image/jpeg", b64: img.toJPEG(85).toString("base64") });
      } else {
        // Fallback: read raw file (small images like icons)
        imageData.push({ mime: imageMime(p), b64: fs.readFileSync(p).toString("base64") });
      }
    } catch {
      imageData.push({ mime: imageMime(p), b64: fs.readFileSync(p).toString("base64") });
    }
  }

  let nc = NETWORK_POST_CONFIGS[network] ?? NETWORK_POST_CONFIGS["x"];

  // X Premium+: expand character limit from 280 → 25 000
  const xPremiumPlus = cfg["x_premium_plus"] === "1";
  if (network === "x" && xPremiumPlus) {
    nc = {
      ...nc,
      descMax: 25000,
      notes: "X Premium+ enabled — you have up to 25 000 characters. Write a longer, richer post. Use paragraphs and line breaks for atmosphere.",
    };
  }

  // Per-post custom max chars (Premium+ only — caps at the network's effective limit)
  if (customMaxChars && Number.isFinite(Number(customMaxChars))) {
    nc = { ...nc, descMax: Math.min(Number(customMaxChars), nc.descMax) };
  }

  // Scale max_tokens to the effective char limit (~3 chars/token + overhead for JSON/tags)
  const maxTokens = Math.min(4000, Math.max(600, Math.ceil(nc.descMax / 3) + 400));

  const tagInstruction = tags.length
    ? `Pick up to ${nc.tagCount} relevant tags from this list (add new ones if better): ${tags.join(", ")}.`
    : `Generate up to ${nc.tagCount} relevant tags.`;
  const tagNote = nc.tagHasHash ? "Include the # symbol in each tag." : "Do NOT include # symbol in tags.";

  const hintLine = hint?.trim() ? `- Additional context / user instructions: ${hint.trim()}` : "";

  // ── Storyline context (optional) ──────────────────────────────────────────
  let storylineContextLine = "";
  if (storylineId) {
    try {
      const slId = String(storylineId).replace(/'/g, "''");
      const seRows = db.exec(
        `SELECT post_text, entry_order FROM story_entries WHERE storyline_id = '${slId}' ORDER BY entry_order ASC`
      );
      const texts = (seRows[0]?.values ?? []).map((r) => r[0]).filter(Boolean);
      if (texts.length > 0) {
        storylineContextLine = `- Story continuity — IMPORTANT: Continue this narrative coherently. Previous episodes:\n${
          texts.map((t, i) => `  [Episode ${i + 1}]: ${t}`).join("\n")
        }`;
      }
    } catch { /* storylines table may not exist on old DBs — skip */ }
  }

  // ── Reader-vote decisions (optional) ─────────────────────────────────────
  let decisionsInstruction = "";
  if (Array.isArray(decisions) && decisions.length > 0) {
    const opts = decisions.map((d) => `${d.emoji} ${d.label}`).join(" / ");
    decisionsInstruction = ` End the story at a dramatic cliffhanger or decision point leading into these reader choices: ${opts}. Do NOT include the voting options in your description — they will be appended automatically.`;
  }

  // ── Active persona (optional) ────────────────────────────────────────────
  let personaLine = "";
  try {
    const pRows = db.exec(
      "SELECT name, tone, emoji_use, style_notes FROM personas WHERE is_active = 1 LIMIT 1"
    );
    const p = pRows[0]?.values?.[0]; // [name, tone, emoji_use, style_notes]
    if (p) {
      const [pName, , pEmoji, pNotes] = p;
      const emojiNote = pEmoji === "heavy"
        ? "Use emojis generously and often throughout the text."
        : pEmoji === "subtle"
          ? "Use 1–2 emojis where they fit naturally; don't force them."
          : "Do NOT use any emojis.";
      personaLine = `- Persona / voice: Write as "${pName}". Emoji use: ${emojiNote}.`;
      if (String(pNotes).trim()) personaLine += `\n- Behavior rules for this persona: ${String(pNotes).trim()}`;
    }
  } catch { /* personas table may not exist on very old DBs — skip */ }

  // ── Post-type instruction ───────────────────────────────────────────────
  const perspectiveNote = perspective === "oc" && ocName.trim()
    ? `Write from the perspective of "${ocName.trim()}" (third person, e.g. "${ocName.trim()} loves…").`
    : perspective === "i"
      ? "Write in first person (I, me, my)."
      : "Describe the image objectively as a neutral observer. Do NOT use first-person voice (no 'I', 'me', 'my').";

  const perspSuffix = ` ${perspectiveNote}`;

  // QT Event template (multi-line social post format)
  const qtThemeInstruction = qtEventName
    ? `Use "${qtEventName.toUpperCase()}" as the THEME (Line 1).`
    : `Derive THEME from what you see in the image (e.g. SPICY FRIDAY, THAT LOOK, MORNING MOOD).`;
  const taggerHandle = qtTagger ? (qtTagger.startsWith("@") ? qtTagger : `@${qtTagger}`) : null;
  const taggerLine = taggerHandle
    ? `Line 3: TFTT ${taggerHandle}\nLine 4: (empty)`
    : `Line 3: (omit this line entirely — no tagger was provided)`;
  const qtEventRule = `Write a "QT Event" post in EXACTLY this multi-line format:
Line 1: QT [THEME IN CAPS]![fitting emoji]
Line 2: (empty)
${taggerLine}
Line 5: [witty, cheeky one-liner tagline describing the image theme, e.g. "oooh... y'all mean (this) kinda face⁉️"]
Line 6: (empty)
Line 7: let's see ❤️‍🔥
${qtThemeInstruction}
No @ mentions other than the tagger above. No hashtags in the text body (use the tags field).
Keep each line short. Total text under 260 characters.`;

  // Story rule: extended for Premium+ or if a storyline is active
  const storyIsRich = (xPremiumPlus && network === "x") || !!storylineId;
  const storyRule = storyIsRich
    ? `Write a rich, immersive story episode (8–15 sentences, multiple paragraphs). Build vivid atmosphere, strong characterisation and emotional tension. Leave the reader eager for the next instalment.${perspSuffix}${decisionsInstruction}`
    : `Write a short creative micro-story (2–4 sentences) inspired by or about the subject in the image. Make it vivid and atmospheric.${perspSuffix}${decisionsInstruction}`;

  const POST_TYPE_RULES = {
    engagement: `Write an engaging caption that invites interaction. Ask a question or use a call-to-action.${perspSuffix}`,
    qt:         qtEventRule,
    morning:    `Start with a warm "Good morning ☀️" greeting, then add a brief description of what's in the image.${perspSuffix}`,
    goodnight:  `Start with a warm "Good night 🌙" or "Sweet dreams ✨" farewell, then add a brief, evocative description of the image.${perspSuffix}`,
    story:      storyRule,
  };
  const postTypeRule = POST_TYPE_RULES[postType] ?? POST_TYPE_RULES["engagement"];

  const prompt = `You are a social media content creator. Analyze the image(s) and write a post for ${network}.
Rules:
- Write in English.
${personaLine ? personaLine + "\n" : ""}${storylineContextLine ? storylineContextLine + "\n" : ""}- Post style: ${postTypeRule}
- Description: max ${nc.descMax} characters. ${nc.notes}
- Tags: ${tagInstruction} ${tagNote}
${nc.titleNeeded ? "- Title: short, catchy, max 80 chars." : ""}${hintLine ? "\n" + hintLine : ""}
Respond with ONLY valid JSON, no markdown fences:
{${nc.titleNeeded ? '"title":"...","' : ""}"description":"...","tags":["tag1","tag2"]}`;

  let result;
  function apiError(provider, r) {
    const msg = r.body?.error?.message
      || (typeof r.body === "string" ? r.body.slice(0, 200) : null)
      || JSON.stringify(r.body)?.slice(0, 200)
      || `HTTP ${r.status}`;
    return new Error(`${provider} API error ${r.status}: ${msg}`);
  }

  if (provider === "openai" || provider === "grok") {
    const hostname = provider === "grok" ? "api.x.ai" : "api.openai.com";
    const content = [{ type: "text", text: prompt },
      ...imageData.map((d) => ({ type: "image_url", image_url: { url: `data:${d.mime};base64,${d.b64}` } }))];
    const r = await httpsPost(hostname, "/v1/chat/completions",
      { "Authorization": `Bearer ${apiKey}` },
      { model, max_tokens: maxTokens, messages: [{ role: "user", content }] });
    if (r.status !== 200) throw apiError(provider, r);
    result = r.body.choices?.[0]?.message?.content ?? "";

  } else if (provider === "anthropic") {
    const content = [...imageData.map((d) => ({ type: "image", source: { type: "base64", media_type: d.mime, data: d.b64 } })),
      { type: "text", text: prompt }];
    const r = await httpsPost("api.anthropic.com", "/v1/messages",
      { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      { model, max_tokens: maxTokens, messages: [{ role: "user", content }] });
    if (r.status !== 200) throw apiError("anthropic", r);
    result = r.body.content?.[0]?.text ?? "";

  } else if (provider === "gemini") {
    const parts = [{ text: prompt },
      ...imageData.map((d) => ({ inline_data: { mime_type: d.mime, data: d.b64 } }))];
    const r = await httpsPost("generativelanguage.googleapis.com",
      `/v1beta/models/${model}:generateContent?key=${apiKey}`, {},
      { contents: [{ parts }], generationConfig: { responseMimeType: "application/json", maxOutputTokens: maxTokens } });
    if (r.status !== 200) throw apiError("gemini", r);
    result = r.body.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  } else {
    throw new Error(`Unknown AI provider: ${provider}`);
  }

  // Parse JSON response (strip markdown fences if present)
  const jsonStr = result.replace(/^```json?\s*/i, "").replace(/\s*```$/, "").trim();
  const parsed = JSON.parse(jsonStr);
  return { title: parsed.title ?? "", description: parsed.description ?? "", tags: parsed.tags ?? [] };
}

// ─────────────────────────────────────────────────────────────────────────────

function startBridgeServer() {
  bridgeServer = http.createServer(handleBridge);
  bridgeServer.listen(BRIDGE_PORT, "127.0.0.1", () => {
    console.log(`[Bridge] Listening on http://127.0.0.1:${BRIDGE_PORT}`);
  });
  bridgeServer.on("error", (err) => {
    if (err.code === "EADDRINUSE") console.warn(`[Bridge] Port ${BRIDGE_PORT} already in use — bridge disabled.`);
    else console.error(`[Bridge] ${err.message}`);
  });
}
// ─────────────────────────────────────────────────────────────────────────────

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

  // Bridge queue IPC — called from the renderer to push a selection to the
  // in-memory queue that the Chrome extension reads via /queue.
  ipcMain.handle("bridge:set-queue", (_event, target, imageIds) => {
    const limit = PLATFORM_LIMITS[target] ?? 20;
    const capped = (imageIds ?? []).slice(0, limit);
    selectionQueue.set(target, capped);
    return { ok: true, count: capped.length };
  });
  ipcMain.handle("bridge:clear-queue", (_event, target) => {
    selectionQueue.delete(target);
    return { ok: true };
  });
  ipcMain.handle("bridge:get-queue", (_event, target) => {
    return { imageIds: selectionQueue.get(target) ?? [], limit: PLATFORM_LIMITS[target] ?? 1 };
  });
  ipcMain.handle("bridge:set-post-content", (_event, target, content) => {
    postContentStore.set(target, content);
    return { ok: true };
  });
  ipcMain.handle("bridge:clear-post-content", (_event, target) => {
    postContentStore.delete(target);
    return { ok: true };
  });

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
    const onProgress = (mainWindow && !mainWindow.isDestroyed())
      ? (data) => mainWindow.webContents.send("scan:progress", data)
      : null;
    if (command === "scan_local_folder") {
      return walkImages(args.rootPath, onProgress);
    }
    // scan_and_index: walk + thumbnail generation + batch DB upsert in a single
    // SQLite transaction. Avoids N × 2 IPC round-trips and N disk writes.
    if (command === "scan_and_index") {
      return scanAndIndex(args.sourceId, args.rootPath, onProgress);
    }
    if (command === "copy_images_to_folder") return copyImagesToFolder(args.paths ?? [], args.destination);
    if (command === "debug_image_count") return getDatabase().then((db) => {
      const r = db.exec("SELECT COUNT(*) FROM images");
      return r[0]?.values?.[0]?.[0] ?? 0;
    });
    if (command === "debug_queue_slots") return getDatabase().then((db) => {
      // Returns raw slot rows for a queue so the frontend can diagnose missing images.
      const queueId = args.queueId;
      if (!queueId) throw new Error("queueId required");
      const stmt = db.prepare("SELECT id, image_ids, ai_title, posted FROM queue_slots WHERE queue_id = ? ORDER BY position");
      stmt.bind([queueId]);
      const rows = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      stmt.free();
      // For each slot, count how many stored image IDs actually exist in the images table
      for (const row of rows) {
        const ids = JSON.parse(row.image_ids || "[]");
        if (ids.length) {
          const placeholders = ids.map(() => "?").join(",");
          const chk = db.prepare(`SELECT id FROM images WHERE id IN (${placeholders})`);
          chk.bind(ids);
          const found = [];
          while (chk.step()) found.push(chk.getAsObject().id);
          chk.free();
          row._stored_ids = ids;
          row._found_ids = found;
          row._missing_ids = ids.filter((id) => !found.includes(id));
        } else {
          row._stored_ids = [];
          row._found_ids = [];
          row._missing_ids = [];
        }
      }
      console.log("[debug_queue_slots]", JSON.stringify(rows, null, 2));
      return rows;
    });
    throw new Error(`Unknown command: ${command}`);
  });

  // Browser Extension helpers
  // extensionDir() resolves the chrome-extension folder whether we are in dev
  // (next to package.json) or in the packaged app (inside extraResources).
  function extensionDir() {
    if (app.isPackaged) return path.join(process.resourcesPath, "chrome-extension");
    return path.join(__dirname, "..", "chrome-extension");
  }

  // ── AI post generation ─────────────────────────────────────────────────────
  ipcMain.handle("ai:generate-post", async (_event, imagePaths, network, hint, postType, perspective, ocName, storylineId, decisions, qtEventName, qtTagger, customMaxChars) => {
    return generateAiPost(imagePaths, network, hint, postType, perspective, ocName, storylineId, decisions, qtEventName, qtTagger, customMaxChars);
  });

  ipcMain.handle("extension:open-chrome", () => {
    shell.showItemInFolder(path.join(extensionDir(), "manifest.json"));
  });

  ipcMain.handle("extension:download-firefox", async (_event) => {
    const srcDir = extensionDir();
    const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
      title: "Save Firefox Extension",
      defaultPath: path.join(app.getPath("downloads"), "crossposthelper-firefox.zip"),
      filters: [{ name: "ZIP Archive", extensions: ["zip"] }],
    });
    if (canceled || !filePath) return { ok: false };

    // Build zip using the OS zip tool (cross-platform via PowerShell on Windows)
    const { execFileSync } = require("node:child_process");
    try {
      if (process.platform === "win32") {
        // Replace manifest.json with manifest.firefox.json inside the zip
        const tmpDir = path.join(app.getPath("temp"), `cph-ff-${Date.now()}`);
        fs.mkdirSync(tmpDir, { recursive: true });
        // Copy all files
        const { execSync } = require("node:child_process");
        execSync(`xcopy /E /I /Q "${srcDir}" "${tmpDir}"`, { stdio: "ignore" });
        fs.copyFileSync(path.join(srcDir, "manifest.firefox.json"), path.join(tmpDir, "manifest.json"));
        execSync(
          `powershell -NoProfile -Command "Compress-Archive -Path '${tmpDir}\\*' -DestinationPath '${filePath}' -Force"`,
          { stdio: "ignore" }
        );
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } else {
        const tmpDir = path.join(app.getPath("temp"), `cph-ff-${Date.now()}`);
        fs.cpSync(srcDir, tmpDir, { recursive: true });
        fs.copyFileSync(path.join(srcDir, "manifest.firefox.json"), path.join(tmpDir, "manifest.json"));
        execFileSync("zip", ["-r", filePath, "."], { cwd: tmpDir, stdio: "ignore" });
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
      return { ok: true, filePath };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // Serve local files via the localfile:// protocol so the renderer can
  // display images from arbitrary disk locations safely.
  //
  // All URLs are emitted as "localfile:///path" (3 slashes) so that Chromium's
  // URL parser does not swallow the Windows drive letter:
  //   localfile://C:/...  →  host="C", path="/..." → "C:" LOST ❌
  //   localfile:///C:/... →  host="",  path="/C:/..." → "C:" kept ✓
  //
  // We use fs.promises.readFile (not net.fetch("file://...")) because
  // Chromium's file fetcher does not support virtual drives (Google Drive,
  // OneDrive, Dropbox) on Windows; Node's fs goes through the Win32 API.
  protocol.handle("localfile", async (request) => {
    // After stripping "localfile://", the path always starts with "/" because
    // we use 3-slash URLs.  For Windows drive paths ("/C:/...") strip the
    // leading "/" so Node gets a valid "C:/..." absolute path.
    const withSlash = decodeURIComponent(request.url.slice("localfile://".length));
    const isWinDrive = /^\/[A-Za-z]:\//.test(withSlash);
    const filePath = isWinDrive ? withSlash.slice(1) : withSlash;
    const ext = path.extname(filePath).toLowerCase();
    const mime = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
                   ".png": "image/png",  ".webp": "image/webp",
                   ".gif": "image/gif" }[ext] ?? "application/octet-stream";
    try {
      const data = await fs.promises.readFile(filePath);
      return new Response(data, { status: 200, headers: { "Content-Type": mime } });
    } catch {
      return new Response(null, { status: 404 });
    }
  });

  startBridgeServer();
  createWindow();
});

app.on("window-all-closed", () => {
  if (bridgeServer) bridgeServer.close();
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
