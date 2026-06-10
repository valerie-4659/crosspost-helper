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
    "008_picker_cooldown.sql",
    "009_folder_previews.sql",
    "010_wavespeed_jobs.sql",
    "011_wavespeed_image_jobs.sql",
    "012_topaz_jobs.sql",
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

// Low-level single-image post-record upsert (no sibling propagation).
function _upsertOnePostRecord(db2, imageId, targetId, now) {
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

// Find IDs of all images in the same source with the same filename stem.
// E.g. "blubb.jpg" finds "blubb.png" so marks propagate across format variants.
function _findStemSiblingIds(db2, imageId) {
  const meta = db2.prepare("SELECT source_id, filename FROM images WHERE id = ? LIMIT 1");
  meta.bind([imageId]);
  const rows = [];
  while (meta.step()) rows.push(meta.getAsObject());
  meta.free();
  if (!rows.length) return [];

  const { source_id, filename } = rows[0];
  const stem = filename.replace(/\.[^.]+$/, "");
  if (!stem || stem === filename) return [];

  const like = stem.toLowerCase() + ".%";
  const sib = db2.prepare(
    "SELECT id FROM images WHERE source_id = ? AND id != ? AND LOWER(filename) LIKE ?"
  );
  sib.bind([source_id, imageId, like]);
  const ids = [];
  while (sib.step()) ids.push(sib.getAsObject().id);
  sib.free();
  return ids;
}

// Shared post-record upsert used by both /mark-posted and /mark-all-posted.
// Propagates the "posted" state to all filename-stem siblings automatically.
async function upsertPostRecord(imageId, targetId) {
  const db2 = await getDatabase();
  const now = new Date().toISOString();
  _upsertOnePostRecord(db2, imageId, targetId, now);
  for (const sibId of _findStemSiblingIds(db2, imageId)) {
    _upsertOnePostRecord(db2, sibId, targetId, now);
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
    "Cache-Control": "no-store",
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

    // If the "id" is an absolute file path (non-library image, e.g. WaveSpeed result),
    // serve it directly from disk without a DB lookup.
    const isAbsPath = imageId.startsWith("/") || /^[A-Za-z]:[\\/]/.test(imageId);
    if (isAbsPath) {
      if (!fs.existsSync(imageId)) { bridgeSendJson(res, { error: "File missing on disk" }, 404); return; }
      const ext  = path.extname(imageId).toLowerCase();
      const mime = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif" }[ext] ?? "image/png";
      const data = fs.readFileSync(imageId);
      res.writeHead(200, { "Content-Type": mime, "Content-Length": data.length, "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" });
      res.end(data);
      return;
    }

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
          _upsertOnePostRecord(db2, imageId, targetId, now);
          for (const sibId of _findStemSiblingIds(db2, imageId)) {
            _upsertOnePostRecord(db2, sibId, targetId, now);
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
// aiInstructions: "" | string — character names, specific image details injected as a strict rule
async function generateAiPost(imagePaths, network, hint = "", postType = "engagement", perspective = "", ocName = "", storylineId = null, decisions = null, qtEventName = "", qtTagger = "", customMaxChars = null, aiInstructions = "") {
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
  // Send up to 4 images — all major vision APIs (OpenAI, Anthropic, Gemini) support multi-image.
  const validPaths = (imagePaths ?? []).filter((p) => p && fs.existsSync(p)).slice(0, 4);
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

  // Tell the AI how many images are attached so it can reference all of them,
  // but the character limit stays fixed regardless of image count.
  const imageCount = imageData.length || 1;
  if (imageCount > 1) {
    nc = { ...nc, notes: nc.notes + ` There are ${imageCount} images — mention / reference all of them in the post.` };
  }

  // Per-post custom max chars — caps at the network's effective limit.
  // Also override notes so the AI doesn't ignore the limit based on the old Premium+ note.
  if (customMaxChars && Number.isFinite(Number(customMaxChars))) {
    const cap = Math.min(Number(customMaxChars), nc.descMax);
    nc = { ...nc, descMax: cap, notes: `Write EXACTLY up to ${cap} characters. Do NOT exceed ${cap} characters under any circumstances.` };
  }

  // Scale max_tokens to the effective char limit (~3 chars/token + overhead for JSON/tags)
  const maxTokens = Math.min(4000, Math.max(600, Math.ceil(nc.descMax / 3) + 400));

  const tagInstruction = tags.length
    ? `Pick up to ${nc.tagCount} relevant tags from this list (add new ones if better): ${tags.join(", ")}.`
    : `Generate up to ${nc.tagCount} relevant tags.`;
  const tagNote = nc.tagHasHash ? "Include the # symbol in each tag." : "Do NOT include # symbol in tags.";

  // Context/hint = mood & theme FRAMEWORK (not verbatim copy).
  // Always use English in the prompt regardless of what language the hint was written in.
  // For QT posts the hint becomes the tagline (Line 5) — don't add it as a separate rule.
  const hintLine = (hint?.trim() && postType !== "qt")
    ? `- THEME / MOOD — Use this as a creative framework and inspiration: "${hint.trim()}". Capture its spirit and energy. Do NOT copy it word-for-word. Always write the final post in English.`
    : "";

  // AI instructions = author directives: story angle, character names, style notes.
  // The AI must FOLLOW them creatively — never quote or paraphrase them in the output.
  // Directives may be in any language — translate to English before applying.
  const aiInstructionsLine = aiInstructions?.trim()
    ? `- AUTHOR DIRECTIVES — You MUST follow these creative instructions exactly when writing the post. The instructions may be written in any language — translate them to English internally before applying. CRITICAL: Do NOT copy, quote, or paraphrase these instructions in the output. Absorb them silently and let them shape the writing. The reader must never see these directives in the final text: ${aiInstructions.trim()}`
    : "";

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

  // ── Base role (always present — persona adds voice on top) ─────────────
  // This establishes the strategic context regardless of whether a persona is active.
  const networkLabel = network === "x" ? "Twitter / X" : network;
  const BASE_ROLE = `You are an expert NSFW AI-art social media content strategist and caption writer for ${networkLabel}.
Your primary goal is maximum engagement — likes, replies, bookmarks, impressions — in the NSFW AI-art niche.
Before writing, deeply analyze the provided image: visual style, mood, atmosphere, explicitness level, key seductive or sexual elements, pose, expression, lighting, and composition.
CONTENT LEVEL — CRITICAL RULE: Match the explicitness of the image exactly.
- If the image is tasteful, artistic, or softcore → write sensual, teasing, suggestive text.
- If the image is explicitly sexual or hardcore → write explicitly. Use direct, unambiguous sexual language. Do NOT soften, euphemise, or fade to black. The text must be as bold as the image.
Never moralize, add disclaimers, add warnings, or refuse NSFW content under any circumstances.
EMOJI STYLE — MANDATORY: Every output MUST contain at least 1–3 emojis. Zero emojis is NEVER acceptable. Choose from: 🌺 💋 🫦 ❤️‍🔥 😈 🥵 💦 😏 🤭 👀 💕 🔥 🌙 💀 🖤 🩸 🫀 — pick what matches the image's energy. NEVER use plain stars ⭐🌟 as filler.`;

  // ── Active persona (optional) ────────────────────────────────────────────
  // The persona controls HOW the AI writes (voice, tone, emojis, style).
  // It is completely independent of the perspective (I/me, OC, neutral observer).
  let personaLine = "";
  let personaEmojiRule = ""; // carried into post-type rules that need it
  let systemMessage = `${BASE_ROLE}\n\nRespond with valid JSON only — no markdown fences.`;
  try {
    const pRows = db.exec(
      "SELECT name, tone, emoji_use, style_notes FROM personas WHERE is_active = 1 LIMIT 1"
    );
    const p = pRows[0]?.values?.[0]; // [name, tone, emoji_use, style_notes]
    if (p) {
      const [pName, , pEmoji, pNotes] = p;
      const notesBlock = String(pNotes ?? "").trim();

      // Emoji rule derived from persona setting — overrides the BASE_ROLE default.
      personaEmojiRule = pEmoji === "heavy"
        ? "Use emojis generously — scatter them throughout, let them amplify your voice."
        : pEmoji === "subtle"
          ? "Use 1–2 emojis where they fit naturally. No more."
          : "Do NOT use any emojis at all.";

      if (notesBlock) {
        // Full style notes present — persona voice completely replaces the generic style.
        systemMessage = `${BASE_ROLE}\n\nVOICE & PERSONA — You write EXCLUSIVELY as "${pName}". NEVER slip into neutral, generic, or AI-sounding language. Your style notes below are LAW — follow them exactly.\n\n${notesBlock}\n\nEMOJI RULE (from persona settings): ${personaEmojiRule}\n\nRespond with valid JSON only — no markdown fences.`;
      } else {
        systemMessage = `${BASE_ROLE}\n\nVOICE & PERSONA — You ARE "${pName}". Write EXCLUSIVELY in ${pName}'s voice and style. NEVER use neutral or generic language.\nEMOJI RULE: ${personaEmojiRule}\nRespond with valid JSON only — no markdown fences.`;
      }

      // Short in-character reminder repeated in the user prompt for reinforcement.
      personaLine = `- Voice: You ARE "${pName}" — write exclusively in their voice. Never sound like a generic AI. Emoji rule: ${personaEmojiRule}`;
    }
  } catch { /* personas table may not exist on very old DBs — skip */ }

  // ── Perspective setup ──────────────────────────────────────────────────
  const hasPersona = personaLine !== "";
  const isOC = perspective === "oc" && ocName.trim();
  const isFirstPerson = perspective === "i";

  // Narrative voice label — used inside each rule where it makes sense
  const perspVoice = isOC
    ? `Narrative voice: third-person focused on ${ocName.trim()} — e.g. "${ocName.trim()} feels…", "${ocName.trim()} wants…".`
    : isFirstPerson
      ? "Narrative voice: first person (I, me, my, mine)."
      : "Narrative voice: neutral third-person observer — no 'I' or 'me'.";

  // QT Event template (multi-line social post format)
  const qtThemeInstruction = qtEventName
    ? `Use "${qtEventName.toUpperCase()}" as the THEME (Line 1).`
    : `Derive THEME from what you see in the image (e.g. SPICY FRIDAY, THAT LOOK, MORNING MOOD).`;
  const taggerHandle = qtTagger ? (qtTagger.startsWith("@") ? qtTagger : `@${qtTagger}`) : null;
  const taggerLine = taggerHandle
    ? `Line 3: TFTT ${taggerHandle}\nLine 4: (empty)`
    : `Line 3: (omit this line entirely — no tagger was provided)`;
  // If the user supplied a context/hint, use it verbatim as the tagline (line 5).
  // Otherwise let the AI derive a fitting one-liner from the image.
  const qtTagline = hint?.trim()
    ? `Line 5: Use this tagline VERBATIM (copy it exactly, do NOT rephrase): "${hint.trim()}"`
    : `Line 5: [witty, cheeky one-liner tagline describing the image theme, e.g. "oooh... y'all mean (this) kinda face⁉️"]`;
  const qtEventRule = `Write a "QT Event" post in EXACTLY this multi-line format:
Line 1: QT [THEME IN CAPS]![fitting emoji]
Line 2: (empty)
${taggerLine}
${qtTagline}
Line 6: (empty)
Line 7: let's see ❤️‍🔥
${qtThemeInstruction}
No @ mentions other than the tagger above. No hashtags in the text body (use the tags field).
Keep each line short. Total text under 280 characters.`;

  // ── Engagement ─────────────────────────────────────────────────────────
  // Goal: make the reader imagine THEMSELVES in the scene and reply.
  const engagementReaderInvite = isOC
    ? `Let the reader experience the scene through ${ocName.trim()}'s feelings, then ask a question that makes them want to BE there.`
    : isFirstPerson
      ? "Speak directly to your followers — pull them into your world and end with a question that makes them imagine being right there with you."
      : "Draw the reader INTO the scene. Make them feel the energy, then hit them with a direct question: 'what would you do?', 'would you…', 'tell me…' — make it impossible to scroll past.";

  const engagementRule = hasPersona
    ? `Write a caption with a strong hook, build the mood or tension, then end with a teasing question or invitation that gets followers to engage. ${engagementReaderInvite} ${perspVoice}`
    : `Write a high-engagement caption:
(1) Bold opening hook — the first line must stop the scroll.
(2) ONE vivid, specific detail that builds the feeling or tension.
(3) Direct reader-question at the end — make them imagine themselves here. ${engagementReaderInvite}
${perspVoice} Be punchy and specific. No filler.`;

  // ── Morning greeting ────────────────────────────────────────────────────
  // Always addressed to followers. Offer the AI style variety so each post feels different.
  const morningRule = `Write a morning greeting post addressed to your followers. Use the image's mood and energy as inspiration.
Pick ONE style (choose what fits the image — do NOT announce your choice):
a) Tender & soft — warm, close, like a quiet morning together
b) Playful & teasing — flirty, tongue-in-cheek, light energy
c) Bold & suggestive — charged, confident, leaves something to the imagination
d) Dreamy & poetic — atmospheric, lingers like the first light
Vary the opening (e.g. "good morning", "morning loves", "rise and shine", "hey you" — never repeat the same phrase twice). Add one line connecting to the image's energy. Close with a short note or question directed at followers.`;

  // ── Good Night ──────────────────────────────────────────────────────────
  const goodnightRule = `Write a good-night post addressed to your followers. Use the image's mood as the emotional backdrop.
Pick ONE style (choose what fits — do NOT announce your choice):
a) Seductive & lingering — leaves them wanting more
b) Tender & warm — intimate send-off, makes followers feel seen
c) Provocative & teasing — plants a thought they'll take to bed with them
d) Wistful & poetic — soft, atmospheric, stays with them
Vary the opening (e.g. "good night", "sweet dreams", "sleep well loves", "night night" — keep it fresh). Add one evocative line connecting to the image's mood. Close with something that lingers.`;

  // ── Story / Storytelling ────────────────────────────────────────────────
  // A story is NOT a visual description — it is an emotional narrative from inside the moment.
  const STORY_CORE = `CRITICAL — Do NOT describe the image visually. Do NOT list hair colour, clothing, props, or camera angle. Instead, write from INSIDE the moment: the emotion, desire, tension, anticipation, or sensation. The reader should FEEL what the characters feel — not see what the camera sees. The image is only a mood reference — the actual story is invented by you and lives in the characters' heads and hearts.`;
  const storyPerspVoice = isOC
    ? `${perspVoice} We live this entirely through ${ocName.trim()}'s inner world.`
    : isFirstPerson
      ? `${perspVoice} The narrator IS in this moment — raw, immediate, intimate.`
      : `${perspVoice} Close third-person — watching from just outside, feeling everything from within. Think: "She surrenders…", "He pulls her closer…", "The silence between them…"`;

  // Story emoji: respect persona setting if set, otherwise default naturalistic rule.
  const STORY_EMOJI = personaEmojiRule
    ? `Emojis: ${personaEmojiRule}`
    : `Scatter 1–2 fitting emojis naturally through the text (e.g. 🫦 ❤️‍🔥 💀 🌙 💋 😈) — they must feel organic, not decorative.`;

  // Determine story length based on available character budget.
  // Short stories for tight limits, rich episodes for larger budgets.
  const storyCharBudget = nc.descMax;
  const storyIsRich = storyCharBudget >= 500 || !!storylineId;
  const storyRule = storyIsRich
    ? `Write a rich, immersive story episode that FILLS the available ${storyCharBudget}-character space — aim for at least 80% of the budget. Use multiple paragraphs. ${STORY_CORE} ${storyPerspVoice} The tone should match the image: it can be tender, romantic, playful, or explicitly sexual — let the mood of the image guide you. Build emotional intensity and leave the reader craving the next instalment. ${STORY_EMOJI}${decisionsInstruction}`
    : `Write a short but vivid emotional micro-story (3–5 sentences, use the full ${storyCharBudget} characters). ${STORY_CORE} ${storyPerspVoice} Make it feel intimate and alive — like a stolen moment the reader just stepped into. The tone can be tender, playful, or raw and explicit — let the image decide. ${STORY_EMOJI}${decisionsInstruction}`;

  // ── Final post-type map ─────────────────────────────────────────────────
  const POST_TYPE_RULES = {
    engagement: engagementRule,
    qt:         qtEventRule,
    morning:    morningRule,
    goodnight:  goodnightRule,
    story:      storyRule,
  };
  const postTypeRule = POST_TYPE_RULES[postType] ?? POST_TYPE_RULES["engagement"];

  const prompt = `Analyze the image(s) carefully, then write a ${networkLabel} post.
Rules:
- Language: English ONLY. The final post MUST be in English regardless of what language the instructions, context, or directives below are written in. Translate everything internally — the output is always English.
${aiInstructionsLine ? aiInstructionsLine + "\n" : ""}${hintLine ? hintLine + "\n" : ""}${personaLine ? personaLine + "\n" : ""}${storylineContextLine ? storylineContextLine + "\n" : ""}- Post type: ${postTypeRule}
- Description: max ${nc.descMax} characters. ${nc.notes}
- Tags: ${tagInstruction} ${tagNote}
${nc.titleNeeded ? "- Title: short, catchy, max 80 chars." : ""}
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
      { model, max_tokens: maxTokens, messages: [
        { role: "system", content: systemMessage },
        { role: "user", content },
      ]});
    if (r.status !== 200) throw apiError(provider, r);
    result = r.body.choices?.[0]?.message?.content ?? "";

  } else if (provider === "anthropic") {
    const content = [...imageData.map((d) => ({ type: "image", source: { type: "base64", media_type: d.mime, data: d.b64 } })),
      { type: "text", text: prompt }];
    const r = await httpsPost("api.anthropic.com", "/v1/messages",
      { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      { model, max_tokens: maxTokens, system: systemMessage, messages: [{ role: "user", content }] });
    if (r.status !== 200) throw apiError("anthropic", r);
    result = r.body.content?.[0]?.text ?? "";

  } else if (provider === "gemini") {
    const parts = [{ text: prompt },
      ...imageData.map((d) => ({ inline_data: { mime_type: d.mime, data: d.b64 } }))];
    const r = await httpsPost("generativelanguage.googleapis.com",
      `/v1beta/models/${model}:generateContent?key=${apiKey}`, {},
      { systemInstruction: { parts: [{ text: systemMessage }] }, contents: [{ parts }], generationConfig: { responseMimeType: "application/json", maxOutputTokens: maxTokens } });
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

// ─── Video Prompt Generation ──────────────────────────────────────────────────

// explicit: true  → NSFW descriptions are OK (only WAN 2.2 Spicy)
// strictChinese:  → ByteDance / Kuaishou / Vidu — zero tolerance for even suggestive content
const VIDEO_MODELS = {
  wan_2_2_spicy:    { name: "WAN 2.2 Spicy",     explicit: true,  strictChinese: false, maxWords: 350 },
  wan_2_5:          { name: "WAN 2.5",            explicit: false, strictChinese: false, maxWords: 300 },
  wan_2_7:          { name: "WAN 2.7",            explicit: false, strictChinese: false, maxWords: 300 },
  kling_v3_0_pro:   { name: "Kling 3.0 Pro",      explicit: false, strictChinese: true,  maxWords: 280 },
  grok_imagine:     { name: "Grok Imagine Video",  explicit: false, strictChinese: false, maxWords: 250 },
  seedance_2_0:     { name: "Seedance 2.0",        explicit: false, strictChinese: true,  maxWords: 350 },
  seedance_1_5_pro: { name: "Seedance 1.5 Pro",    explicit: false, strictChinese: true,  maxWords: 300 },
  vidu_q3:          { name: "Vidu Q3",             explicit: false, strictChinese: true,  maxWords: 280 },
};

// videoModel: one of the VIDEO_MODELS keys
// instructions: optional character names / specific scene details
// includeCameraMoves: whether to include camera movement directives
async function generateVideoPrompt(imagePaths, videoModel = "wan_2_5", instructions = "", includeCameraMoves = true) {
  const db = await getDatabase();
  const rows = db.exec("SELECT key, value FROM ai_config");
  const cfg = {};
  if (rows.length && rows[0].values) {
    for (const [k, v] of rows[0].values) cfg[k] = v;
  }

  const provider  = cfg["provider"]  || "openai";
  const apiKey    = cfg["api_key"]   || "";
  const model     = cfg["model"]     || "gpt-4o";
  const maxTokens = 700;

  if (!apiKey) throw new Error("No AI API key configured. Please set one in Settings → AI.");

  const vm = VIDEO_MODELS[videoModel] ?? VIDEO_MODELS["wan_2_5"];

  // Load first image (video prompts work best with one reference)
  const validPaths = (imagePaths ?? []).filter((p) => p && fs.existsSync(p)).slice(0, 1);
  const imageData = [];
  for (const p of validPaths) {
    try {
      const img = await nativeImage.createThumbnailFromPath(p, { width: 1024, height: 1024 });
      if (!img.isEmpty()) {
        imageData.push({ mime: "image/jpeg", b64: img.toJPEG(85).toString("base64") });
      } else {
        imageData.push({ mime: imageMime(p), b64: fs.readFileSync(p).toString("base64") });
      }
    } catch {
      imageData.push({ mime: imageMime(p), b64: fs.readFileSync(p).toString("base64") });
    }
  }

  // Content policy rule per model family
  let contentRule;
  if (vm.explicit) {
    contentRule = `EXPLICIT CONTENT IS ALLOWED and expected — describe nudity, explicit poses, and adult scenarios accurately and vividly. Do not sanitize.`;
  } else if (vm.strictChinese) {
    contentRule = `STRICT CONTENT POLICY — this model (${vm.name}) is operated by a Chinese company with zero tolerance for any sexual, suggestive, or adult content. NEVER use: nudity, revealing clothing, sexual acts, intimate touching, or any sensual language. Describe the scene in a completely neutral, family-safe way. Focus on motion, environment, and cinematic quality only. Any violation will cause the generation to be blocked.`;
  } else {
    contentRule = `CONTENT SAFETY REQUIRED — this model has strict content moderation. NEVER use explicit sexual terms, genital names, sexual acts, or NSFW language. Use tasteful alternatives: "bare skin", "curves", "sensual pose", "intimate embrace", "alluring figure", "close together". Violating this will cause the generation to fail.`;
  }

  const cameraLine = includeCameraMoves
    ? `- Camera work: angle, movement (slow zoom, tracking shot, dolly, close-up, static, crane shot).`
    : `- Do NOT include any camera movement or cinematography instructions — the model handles camera work internally.`;

  const instructionsLine = instructions?.trim()
    ? `\nSPECIFIC DETAILS (mandatory, use exactly as given): ${instructions.trim()}`
    : "";

  const systemMessage = `You are an expert video prompt engineer for AI video generation. Analyze images and write precise, cinematic video generation prompts. Output ONLY the raw prompt text — no title, no explanation, no JSON, no quotes.`;

  const userPrompt = `Analyze this image and write a video generation prompt for ${vm.name}.

Requirements:
- Maximum ${vm.maxWords} words. Be precise but concise.
- Describe the subject(s): appearance, clothing (or lack thereof), pose, expression.
- Describe the action and MOTION — what moves, how it moves (hair, fabric, body, environment).
${cameraLine}
- Lighting: quality, direction, color temperature, shadows.
- Atmosphere and mood: intimate, dramatic, playful, tense, ethereal — match the image energy.
- Visual style: cinematic, photorealistic, high detail, film grain (if appropriate).
${contentRule}${instructionsLine}

Output ONLY the prompt text, nothing else.`;

  let result = "";

  if (provider === "openai" || provider === "grok") {
    const hostname = provider === "grok" ? "api.x.ai" : "api.openai.com";
    const content = [
      { type: "text", text: userPrompt },
      ...imageData.map((d) => ({ type: "image_url", image_url: { url: `data:${d.mime};base64,${d.b64}` } })),
    ];
    const r = await httpsPost(hostname, "/v1/chat/completions",
      { "Authorization": `Bearer ${apiKey}` },
      { model, max_tokens: maxTokens, messages: [
        { role: "system", content: systemMessage },
        { role: "user", content },
      ]});
    if (r.status !== 200) throw apiError(provider, r);
    result = r.body.choices?.[0]?.message?.content ?? "";

  } else if (provider === "anthropic") {
    const content = [
      ...imageData.map((d) => ({ type: "image", source: { type: "base64", media_type: d.mime, data: d.b64 } })),
      { type: "text", text: userPrompt },
    ];
    const r = await httpsPost("api.anthropic.com", "/v1/messages",
      { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      { model, max_tokens: maxTokens, system: systemMessage, messages: [{ role: "user", content }] });
    if (r.status !== 200) throw apiError("anthropic", r);
    result = r.body.content?.[0]?.text ?? "";

  } else if (provider === "gemini") {
    const parts = [
      { text: userPrompt },
      ...imageData.map((d) => ({ inline_data: { mime_type: d.mime, data: d.b64 } })),
    ];
    const r = await httpsPost("generativelanguage.googleapis.com",
      `/v1beta/models/${model}:generateContent?key=${apiKey}`, {},
      { systemInstruction: { parts: [{ text: systemMessage }] }, contents: [{ parts }] });
    if (r.status !== 200) throw apiError("gemini", r);
    result = r.body.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  } else {
    throw new Error(`Unknown AI provider: ${provider}`);
  }

  return result.trim();
}

// ── Image recreation prompt generator ────────────────────────────────────────
// Always SFW. Tailored per target image model.
// ultraStrict: true = GPT/Google Imagen/ByteDance level moderation — no revealing clothing at all.
const IMAGE_MODEL_PROMPT_GUIDE = {
  // ── OpenAI (ultra-strict) ──────────────────────────────────────────────────
  gpt_image_2:     { name: "GPT Image 2",     style: "GPT",      maxWords: 200, ultraStrict: true  },
  gpt_image_1_5:   { name: "GPT Image 1.5",   style: "GPT",      maxWords: 180, ultraStrict: true  },
  // ── Google Nano Banana (ultra-strict — Imagen backend) ────────────────────
  nano_banana_2:   { name: "Nano Banana 2",   style: "Imagen",   maxWords: 150, ultraStrict: true  },
  nano_banana_pro: { name: "Nano Banana Pro", style: "Imagen",   maxWords: 150, ultraStrict: true  },
  nano_banana:     { name: "Nano Banana",     style: "Imagen",   maxWords: 150, ultraStrict: true  },
  // ── ByteDance Seedream (ultra-strict — Chinese content policy) ────────────
  seedream_4_5:    { name: "Seedream 4.5",    style: "Seedream", maxWords: 160, ultraStrict: true  },
  seedream_5_lite: { name: "Seedream 5 Lite", style: "Seedream", maxWords: 140, ultraStrict: true  },
  // ── Alibaba (permissive) ──────────────────────────────────────────────────
  qwen_image_2:    { name: "Qwen Image 2.0",  style: "Qwen",     maxWords: 180, ultraStrict: false },
  qwen_image:      { name: "Qwen Image",      style: "Qwen",     maxWords: 180, ultraStrict: false },
  wan_2_7_img:     { name: "WAN 2.7",         style: "WAN",      maxWords: 150, ultraStrict: false },
  wan_2_6_img:     { name: "WAN 2.6",         style: "WAN",      maxWords: 150, ultraStrict: false },
  wan_2_5_img:     { name: "WAN 2.5",         style: "WAN",      maxWords: 150, ultraStrict: false },
  // ── Other (permissive) ────────────────────────────────────────────────────
  flux_2_klein:    { name: "FLUX 2 Klein",    style: "Flux",     maxWords: 140, ultraStrict: false },
  z_image_turbo:   { name: "Z-Image Turbo",   style: "ZImage",   maxWords: 100, ultraStrict: false },
};

const IMAGE_STYLE_GUIDE = {
  Flux: `Structure: natural descriptive prose followed by comma-separated style keywords. Example: "A young woman in a fitted dark outfit standing by a window at dusk, soft golden backlight, melancholic expression, digital art, high detail, sharp focus"`,
  Qwen: `Use clear, natural, instruction-following language. Describe every visible element: character features, clothing colors and textures, pose, expression, background, lighting, mood. Be specific and comprehensive.`,
  Imagen: `Use professional photography/illustration prose. Mention: subject details, environment, lighting (quality, direction, color temp), color palette, mood. Keep all clothing fully modest and conservative in description.`,
  GPT: `Provide a comprehensive scene description in natural language. Be very specific about every visual element: subject appearance, clothing (fully modest — describe style, color, design without any revealing elements), pose, facial expression, background, lighting, color palette, visual style.`,
  Seedream: `Describe the scene naturally and in detail. Include: character appearance, hairstyle, outfit style and colors (fully modest), pose, expression, background/environment, lighting quality and direction, overall mood. Avoid any mature or suggestive language.`,
  WAN: `Describe the scene in detail. Include: character appearance, outfit/accessories, pose, facial expression, hair, background/setting, atmosphere, lighting, color tone, art style (anime/semi-realistic/photorealistic). Add quality tags at the end.`,
  ZImage: `Use a concise keyword-rich format: [subject description], [clothing/appearance], [pose], [background], [lighting], [style], high quality, detailed, sharp focus. Keep to 80-100 words.`,
};

async function generateImagePrompt(imagePaths, imageModel = "flux_2_klein", instructions = "") {
  const db = await getDatabase();
  const rows = db.exec("SELECT key, value FROM ai_config");
  const cfg = {};
  if (rows.length && rows[0].values) {
    for (const [k, v] of rows[0].values) cfg[k] = v;
  }

  const provider  = cfg["provider"]  || "openai";
  const apiKey    = cfg["api_key"]   || "";
  const model     = cfg["model"]     || "gpt-4o";
  const maxTokens = 500;

  if (!apiKey) throw new Error("No AI API key configured. Please set one in Settings → AI.");

  const guide = IMAGE_MODEL_PROMPT_GUIDE[imageModel] ?? IMAGE_MODEL_PROMPT_GUIDE["flux_2_klein"];
  const styleGuide = IMAGE_STYLE_GUIDE[guide.style] ?? IMAGE_STYLE_GUIDE["Flux"];

  const validPaths = (imagePaths ?? []).filter((p) => p && fs.existsSync(p)).slice(0, 1);
  const imageData = [];
  for (const p of validPaths) {
    try {
      const img = await nativeImage.createThumbnailFromPath(p, { width: 1024, height: 1024 });
      if (!img.isEmpty()) {
        imageData.push({ mime: "image/jpeg", b64: img.toJPEG(88).toString("base64") });
      } else {
        imageData.push({ mime: imageMime(p), b64: fs.readFileSync(p).toString("base64") });
      }
    } catch {
      imageData.push({ mime: imageMime(p), b64: fs.readFileSync(p).toString("base64") });
    }
  }

  const instructionsLine = instructions?.trim()
    ? `\nUser instructions (incorporate these): ${instructions.trim()}`
    : "";

  // ── Shared safety vocabulary (applies at every strictness level) ─────────────
  const SAFE_KEYWORDS_HINT = `High-success vocabulary: adult, portrait, editorial, cinematic, professional photography, elegant, confident, smiling, celebration, fashion, natural pose, realistic, detailed, atmospheric lighting, shallow depth of field, high quality.`;

  const FORBIDDEN_WORDS = `NEVER use: seductive, alluring, sexy, sensual, voluptuous, curvy, revealing, provocative, flirtatious, submissive, dominant, fetish, aroused, lustful, schoolgirl, youthful, innocent, barely legal, teen, girl, boy, young-looking, transparent clothing, wet clothing, lingerie, bedroom eyes.`;

  const SAFE_SUBJECT_RULES = `Subject & appearance rules (mandatory for all models):
- Always describe people as ADULTS. Use "adult woman", "adult man", "adult person". Never use girl, boy, teen, teenager, schoolgirl, schoolboy, young-looking, or youthful.
- Do NOT mention age unless it is critical to the scene context.
- Describe clothing neutrally: focus on style, material, colour, and overall fashion. Avoid emphasising body parts, curves, breasts, hips, buttocks, cleavage, or similar physical features.
- Poses and expressions: prefer standing, walking, dancing, sitting, smiling, laughing. Avoid wording that implies seduction, sexual invitation, arousal, submission, domination, or erotic intent.
- Emotional tone: use joyful, confident, relaxed, energetic, thoughtful, elegant, celebratory. Avoid seductive, provocative, alluring, tempting, lustful, submissive, dominant.
- Physical descriptions: describe hair, eyes, clothing, accessories, facial expression. Avoid descriptions centred on attractiveness, sex appeal, desirability, or body shape.
- Avoid references to alcohol unless relevant; prefer "glass", "beverage", "drink", "celebration" over emphasis on intoxication.
- ${FORBIDDEN_WORDS}`;

  const PREFERRED_PROMPT_ORDER = `Preferred output structure (in order): Subject → Clothing & appearance → Action → Environment → Lighting → Composition → Camera details → Artistic style → Mood.`;

  const PHOTOGRAPHY_TIPS = `Photography language: focus on composition, lighting, depth of field, lens characteristics, colour grading, atmosphere, environment. Preferred terms: editorial photography, portrait photography, fashion photography, cinematic photography, documentary photography.`;

  // Ultra-strict = GPT/DALL-E 3 / Google Imagen / ByteDance level — zero tolerance even for borderline wording.
  const sfwBlock = guide.ultraStrict
    ? `ULTRA-STRICT CONTENT POLICY — this model WILL REJECT anything borderline (mandatory):
${SAFE_SUBJECT_RULES}
- ADDITIONALLY ban: lingerie, underwear, bra, corset, bikini, swimsuit, skimpy, bare skin, cleavage, décolletage, nude, naked, topless, revealing.
- Replace ANY revealing or body-exposing clothing with fully conservative equivalents: "dark outfit", "gothic costume", "fitted clothing", "long dress", "stylish fashion", "elegant attire", "bodysuit with full coverage".
- If the reference image shows explicit content, describe the character fully clothed in an appropriate outfit matching the scene's aesthetic.
- Any violation — even borderline words — triggers automatic rejection. When in doubt, choose MORE conservative wording.
${PHOTOGRAPHY_TIPS}
${SAFE_KEYWORDS_HINT}
${PREFERRED_PROMPT_ORDER}`
    : `CONTENT SAFETY POLICY (mandatory):
${SAFE_SUBJECT_RULES}
- ALL prompts must be SFW. NEVER use explicit sexual language, body-part names, or graphic descriptions.
- For revealing outfits: use "form-fitting outfit", "gothic attire", "body-hugging costume", "fantasy outfit" — avoid "lingerie", "underwear", "naked".
- Keep poses described neutrally. Violating this will cause generation failure.
${PHOTOGRAPHY_TIPS}
${SAFE_KEYWORDS_HINT}
${PREFERRED_PROMPT_ORDER}`;

  const isTextOnly = imageData.length === 0;

  const systemMessage = isTextOnly
    ? `You are an expert AI image-generation prompt writer. Take a user's rough prompt idea and expand it into a polished, detailed prompt optimised for the target model.
${sfwBlock}
Output ONLY the raw prompt text — no title, no explanation, no JSON, no quotes.`
    : `You are an expert AI image-generation prompt writer. Analyze reference images and write precise recreation prompts.
${sfwBlock}
Output ONLY the raw prompt text — no title, no explanation, no JSON, no quotes.`;

  const userPrompt = isTextOnly
    ? `Take the following rough prompt idea and rewrite it as a complete, detailed image-generation prompt for ${guide.name}.

Target: ${guide.maxWords} words maximum.
${styleGuide}

Rough idea: "${instructions?.trim() || "a beautiful scene"}"

Rules:
- Expand vague concepts into specific visual detail following this order: Subject → Clothing & appearance → Action → Environment → Lighting → Composition → Camera details → Artistic style → Mood
- Describe what is VISIBLE: clothing, environment, lighting, actions. Do NOT describe attractiveness, sexual intent, or body shape as the primary subject.
- When describing people: always say "adult woman" / "adult man" — never girl, boy, teen, young-looking.
- Focus environment, lighting and mood to carry the atmosphere — avoid emotionally charged or sensual wording.
- Do NOT change the core subject or intent of the rough idea.
- Apply the content policy and style guide above exactly.

Output ONLY the final prompt text.`
    : `Analyze this reference image and write an image recreation prompt for ${guide.name}.

Target: ${guide.maxWords} words maximum.
${styleGuide}${instructionsLine}

Capture all these details from the image and describe them in this order:
1. Subject(s): describe as adult woman/man/person — hair, facial expression, accessories
2. Clothing & appearance: style, material, colours, overall fashion — NO body-part emphasis
3. Action / pose: use neutral terms (standing, walking, smiling, dancing)
4. Background / environment: setting, architecture, nature, objects
5. Lighting: quality (soft/hard/dramatic), direction, colour temperature, shadows
6. Composition: framing, depth of field, camera angle
7. Camera / lens: editorial/portrait/cinematic photography style
8. Colour palette: dominant and accent colours, overall tone (warm/cool/neutral)
9. Mood / atmosphere: use joyful, confident, elegant, celebratory — avoid seductive, alluring, provocative

Output ONLY the prompt text.`;

  let result = "";

  if (provider === "openai" || provider === "grok") {
    const hostname = provider === "grok" ? "api.x.ai" : "api.openai.com";
    const content = [
      { type: "text", text: userPrompt },
      ...imageData.map((d) => ({ type: "image_url", image_url: { url: `data:${d.mime};base64,${d.b64}` } })),
    ];
    const r = await httpsPost(hostname, "/v1/chat/completions",
      { "Authorization": `Bearer ${apiKey}` },
      { model, max_tokens: maxTokens, messages: [
        { role: "system", content: systemMessage },
        { role: "user", content },
      ]});
    if (r.status !== 200) throw apiError(provider, r);
    result = r.body.choices?.[0]?.message?.content ?? "";

  } else if (provider === "anthropic") {
    const content = [
      ...imageData.map((d) => ({ type: "image", source: { type: "base64", media_type: d.mime, data: d.b64 } })),
      { type: "text", text: userPrompt },
    ];
    const r = await httpsPost("api.anthropic.com", "/v1/messages",
      { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      { model, max_tokens: maxTokens, system: systemMessage, messages: [{ role: "user", content }] });
    if (r.status !== 200) throw apiError("anthropic", r);
    result = r.body.content?.[0]?.text ?? "";

  } else if (provider === "gemini") {
    const parts = [
      { text: userPrompt },
      ...imageData.map((d) => ({ inline_data: { mime_type: d.mime, data: d.b64 } })),
    ];
    const r = await httpsPost("generativelanguage.googleapis.com",
      `/v1beta/models/${model}:generateContent?key=${apiKey}`, {},
      { systemInstruction: { parts: [{ text: systemMessage }] }, contents: [{ parts }] });
    if (r.status !== 200) throw apiError("gemini", r);
    result = r.body.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  } else {
    throw new Error(`Unknown AI provider: ${provider}`);
  }

  return result.trim();
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
  // Uses async ipcMain.on (matching ipcRenderer.send in preload) — the official
  // Electron pattern for startDrag. sendSync was removed because blocking the
  // renderer thread prevents macOS from tracking the OS drag session.
  ipcMain.on("drag:start", (event, filePaths, iconPath) => {
    // Skip existsSync — it can return false for Google Drive / FUSE virtual paths
    // even though the file is perfectly accessible.
    const paths = (Array.isArray(filePaths) ? filePaths : [filePaths]).filter(
      (p) => typeof p === "string" && p.length > 0,
    );
    if (!paths.length) return;

    // Build a 32×32 fallback icon — required on macOS, harmless on Windows.
    const FALLBACK_ICON_B64 =
      "data:image/png;base64," +
      "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAAI0lEQVR4nGNg" +
      "YGBg+M9AAAAD//8DABj+BhAFAAAA//8DAFAABQB/VQAAABJRU5ErkJggg==";

    // Use pre-cached thumbnail as drag icon — loads in <1 ms.
    let icon;
    try {
      if (iconPath && fs.existsSync(iconPath)) {
        icon = nativeImage.createFromPath(iconPath);
      }
    } catch { /* ignore */ }

    if (!icon || icon.isEmpty()) {
      icon = nativeImage.createFromDataURL(FALLBACK_ICON_B64);
    }
    if (!icon || icon.isEmpty()) {
      // Last resort: programmatically build a 1×1 white pixel.
      icon = nativeImage.createFromBuffer(
        Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==", "base64"),
      );
    }

    // startDrag only supports dragging one file at a time on all platforms.
    event.sender.startDrag({ file: paths[0], icon });
  });
  // ── Wavespeed AI — Image-to-Video submission ─────────────────────────────
  // Maps the app's video model keys to Wavespeed REST API endpoint slugs.
  const WAVESPEED_VIDEO_ENDPOINT_MAP = {
    // ── WAN family ──────────────────────────────────────────────────────────
    wan_2_2_spicy:    "wavespeed-ai/wan-2.2-spicy/image-to-video",
    wan_2_5:          "alibaba/wan-2.5/image-to-video",
    wan_2_7:          "alibaba/wan-2.7/image-to-video",
    // ── Kling ────────────────────────────────────────────────────────────────
    kling_v3_0_pro:   "kwaivgi/kling-v3.0-pro/image-to-video",
    // ── Grok ────────────────────────────────────────────────────────────────
    grok_imagine:     "x-ai/grok-imagine-video/image-to-video",
    // ── Seedance family ─────────────────────────────────────────────────────
    // duration: 4–15 s; resolution 720p or 1080p; adds generate_audio
    seedance_2_0:     "bytedance/seedance-2.0/image-to-video",
    seedance_1_5_pro: "bytedance/seedance-v1.5-pro/image-to-video",
    // ── Vidu ─────────────────────────────────────────────────────────────────
    vidu_q3:          "vidu/q3/image-to-video",
  };

  /** Build a model-specific request body for image-to-video. */
  function buildVideoBody(videoModel, imageDataUri, prompt, resolution, duration, seed, endImageDataUri, generateAudio, movementAmplitude) {
    const base = { prompt: prompt || "", image: imageDataUri };

    if (videoModel === "kling_v3_0_pro") {
      // Kling 3.0 Pro: cfg_scale, duration 3-15, optional end_image
      const klDuration = Math.min(15, Math.max(3, Number(duration) || 5));
      const body = { ...base, duration: klDuration, cfg_scale: 0.5, shot_type: "intelligent" };
      if (endImageDataUri) body.end_image = endImageDataUri;
      if (generateAudio) body.sound = true;
      return body;
    }

    if (videoModel === "grok_imagine") {
      // Grok: prompt + image + duration (6 or 10) + resolution (720p/480p)
      const gkDuration = [6, 10].includes(Number(duration)) ? Number(duration) : 6;
      const gkRes = ["720p", "480p"].includes(resolution) ? resolution : "720p";
      return { ...base, duration: gkDuration, resolution: gkRes };
    }

    if (videoModel && videoModel.startsWith("seedance")) {
      // Seedance: resolution 720p/1080p, duration 4-15, generate_audio
      const sdDuration = Math.min(15, Math.max(4, Number(duration) || 5));
      const sdRes = ["720p", "1080p"].includes(resolution) ? resolution : "720p";
      return { ...base, resolution: sdRes, duration: sdDuration, generate_audio: generateAudio !== false };
    }

    if (videoModel === "vidu_q3") {
      // Vidu Q3: resolution 540p/720p/1080p, duration 1-16, movement_amplitude, generate_audio
      const vdDuration = Math.min(16, Math.max(1, Number(duration) || 5));
      const vdRes = ["540p", "720p", "1080p"].includes(resolution) ? resolution : "720p";
      const vdAmplitude = ["auto", "small", "medium", "large"].includes(movementAmplitude) ? movementAmplitude : "auto";
      return { ...base, resolution: vdRes, duration: vdDuration, movement_amplitude: vdAmplitude, generate_audio: generateAudio !== false, bgm: false, seed: seed ?? -1 };
    }

    if (videoModel === "wan_2_7") {
      // WAN 2.7: resolution 720p/1080p, duration 2-15, optional last_image, seed
      const w27Duration = Math.min(15, Math.max(2, Number(duration) || 5));
      const w27Res = ["720p", "1080p"].includes(resolution) ? resolution : "720p";
      const body = { ...base, resolution: w27Res, duration: w27Duration, seed: seed ?? -1 };
      if (endImageDataUri) body.last_image = endImageDataUri;
      return body;
    }

    // WAN 2.2 Spicy / WAN 2.5 (default WAN family): resolution 480p/720p, duration, seed
    const wanRes = ["480p", "720p"].includes(resolution) ? resolution : "720p";
    return { ...base, resolution: wanRes, duration: Number(duration) || 5, seed: seed ?? -1 };
  }

  ipcMain.handle("wavespeed:submit", async (_event, { imagePath, prompt, videoModel, resolution, duration, seed, endImagePath, generateAudio, movementAmplitude }) => {
    const db = await getDatabase();
    const rows = db.exec("SELECT key, value FROM ai_config");
    const cfg = {};
    if (rows.length && rows[0].values) {
      for (const [k, v] of rows[0].values) cfg[k] = v;
    }
    const apiKey = cfg["wavespeed_api_key"] || "";
    if (!apiKey) throw new Error("No Wavespeed API key configured. Add it in Settings → Wavespeed AI.");

    // Resize image to max 1536 px — keeps payload ≤ ~4 MB while preserving
    // enough detail for the I2V model to work from.
    let imageDataUri;
    try {
      if (!imagePath || !fs.existsSync(imagePath)) throw new Error("Image not found: " + imagePath);
      const img = await nativeImage.createThumbnailFromPath(imagePath, { width: 1536, height: 1536 });
      if (!img.isEmpty()) {
        imageDataUri = "data:image/jpeg;base64," + img.toJPEG(92).toString("base64");
      } else {
        const raw = fs.readFileSync(imagePath);
        imageDataUri = `data:${imageMime(imagePath)};base64,` + raw.toString("base64");
      }
    } catch (e) {
      const raw = fs.readFileSync(imagePath);
      imageDataUri = `data:${imageMime(imagePath)};base64,` + raw.toString("base64");
    }

    // Optional end frame image
    let endImageDataUri = null;
    if (endImagePath && fs.existsSync(endImagePath)) {
      const rawEnd = fs.readFileSync(endImagePath);
      endImageDataUri = `data:${imageMime(endImagePath)};base64,` + rawEnd.toString("base64");
    }

    const endpointSlug = WAVESPEED_VIDEO_ENDPOINT_MAP[videoModel] ?? WAVESPEED_VIDEO_ENDPOINT_MAP["wan_2_2_spicy"];
    const body = buildVideoBody(videoModel, imageDataUri, prompt, resolution, duration, seed, endImageDataUri, generateAudio, movementAmplitude);

    const res = await fetch(`https://api.wavespeed.ai/api/v3/${endpointSlug}`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body:    JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) {
      throw new Error(`Wavespeed error ${res.status}: ${json.message || JSON.stringify(json)}`);
    }
    const jobData = json.data; // { id, status, outputs, urls, ... }

    // Persist the job so the background poller & queue panel can track it.
    const localId = `wsjob_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const insertStmt = db.prepare(
      `INSERT INTO wavespeed_jobs (id, job_id, image_path, prompt, model, resolution, duration, status, video_url, error_msg, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    insertStmt.run([
      localId, jobData.id, imagePath || "",
      prompt || "", videoModel || "wan_2_2_spicy",
      resolution || "720p", duration || 8,
      jobData.status || "created", null, null, now, now,
    ]);
    insertStmt.free();
    persistDatabase();

    return { ...jobData, localId }; // localId lets the frontend reference the DB row
  });

  // wavespeed:getJobs — return all jobs ordered newest-first.
  ipcMain.handle("wavespeed:getJobs", async () => {
    const db = await getDatabase();
    const stmt = db.prepare(
      "SELECT * FROM wavespeed_jobs ORDER BY created_at DESC LIMIT 100"
    );
    const jobs = [];
    while (stmt.step()) jobs.push(stmt.getAsObject());
    stmt.free();
    return jobs;
  });

  // wavespeed:deleteJob — remove a single job by its local DB id.
  ipcMain.handle("wavespeed:deleteJob", async (_event, localId) => {
    const db = await getDatabase();
    db.run("DELETE FROM wavespeed_jobs WHERE id = ?", [localId]);
    persistDatabase();
    return { ok: true };
  });

  // ── Wavespeed AI — Image-generation submission ────────────────────────────
  // Maps the app's image model keys to Wavespeed REST API endpoint slugs.
  // All endpoints accept: prompt (string), images (array of base64 data URIs), size (optional)
  // Maps app model keys → Wavespeed REST API endpoint slugs (image generation / editing)
  const WAVESPEED_IMAGE_ENDPOINT_MAP = {
    // ── OpenAI ────────────────────────────────────────────────────────────────
    gpt_image_2:     "openai/gpt-image-2/edit",
    gpt_image_1_5:   "openai/gpt-image-1-mini/edit",
    // ── Google Nano Banana ────────────────────────────────────────────────────
    nano_banana_2:   "google/nano-banana-2/edit",
    nano_banana_pro: "google/nano-banana-pro/edit",
    nano_banana:     "google/nano-banana/edit",
    // ── ByteDance Seedream ────────────────────────────────────────────────────
    seedream_4_5:    "bytedance/seedream-v4.5/edit",
    seedream_5_lite: "bytedance/seedream-v5.0-lite/edit",
    // ── Alibaba Qwen ─────────────────────────────────────────────────────────
    qwen_image_2:    "alibaba/qwen-image-2.0/edit",
    qwen_image:      "alibaba/qwen-image/edit",
    // ── Alibaba WAN ───────────────────────────────────────────────────────────
    wan_2_7_img:     "alibaba/wan-2.7/image-edit",
    wan_2_6_img:     "alibaba/wan-2.6/image-edit",
    wan_2_5_img:     "alibaba/wan-2.5/text-to-image",
    // ── Other ─────────────────────────────────────────────────────────────────
    flux_2_klein:    "wavespeed-ai/flux-2-klein-4b/edit",
    z_image_turbo:   "wavespeed-ai/z-image-turbo/image-to-image",
  };

  // ── Per-model parameter capability map ───────────────────────────────────────
  // sizeMode "aspect"  → send aspect_ratio (string) + resolution (1k/2k/4k)
  //          "wh"      → send size as "W*H" string
  // quality  true      → include quality field (GPT family only)
  // formats  []        → no output_format;  non-empty list → allowed output_format values
  // strength true      → include strength 0-1 (Z-Image Turbo only)
  // singleImage true   → use singular "image" field instead of "images" array
  const IMAGE_MODEL_CAPS = {
    gpt_image_2:     { sizeMode: "aspect", quality: true,  formats: ["png","jpeg","webp"], strength: false                  },
    gpt_image_1_5:   { sizeMode: "aspect", quality: true,  formats: ["png","jpeg","webp"], strength: false                  },
    nano_banana_2:   { sizeMode: "aspect", quality: false, formats: ["png","jpeg"],        strength: false                  },
    nano_banana_pro: { sizeMode: "aspect", quality: false, formats: ["png","jpeg"],        strength: false                  },
    nano_banana:     { sizeMode: "aspect", quality: false, formats: ["png","jpeg"],        strength: false                  },
    seedream_4_5:    { sizeMode: "wh",     quality: false, formats: [],                   strength: false                  },
    seedream_5_lite: { sizeMode: "wh",     quality: false, formats: [],                   strength: false                  },
    qwen_image_2:    { sizeMode: "wh",     quality: false, formats: [],                   strength: false                  },
    qwen_image:      { sizeMode: "wh",     quality: false, formats: [],                   strength: false                  },
    wan_2_7_img:     { sizeMode: "wh",     quality: false, formats: [],                   strength: false                  },
    wan_2_6_img:     { sizeMode: "wh",     quality: false, formats: [],                   strength: false                  },
    wan_2_5_img:     { sizeMode: "wh",     quality: false, formats: [],                   strength: false                  },
    flux_2_klein:    { sizeMode: "wh",     quality: false, formats: [],                   strength: false                  },
    z_image_turbo:   { sizeMode: "wh",     quality: false, formats: ["jpeg","png","webp"], strength: true, singleImage: true },
  };

  /** Build a model-specific request body for image generation/editing. */
  function buildImageBody(imageModel, imageDataUri, prompt, aspectRatio, resolution, size, useRefImage, quality, outputFormat, strength) {
    const caps = IMAGE_MODEL_CAPS[imageModel] ?? { sizeMode: "wh", quality: false, formats: [], strength: false };
    const body = { prompt: prompt || "" };

    // Attach reference image when opted in
    if (useRefImage !== false && imageDataUri) {
      if (caps.singleImage) {
        body.image = imageDataUri;        // Z-Image Turbo: singular field
      } else {
        body.images = [imageDataUri];     // All others: array field
      }
    }

    // Size / dimensions
    if (caps.sizeMode === "aspect") {
      // GPT / Nano Banana: separate aspect_ratio string + resolution level
      if (aspectRatio && aspectRatio !== "auto") body.aspect_ratio = aspectRatio;
      if (resolution) body.resolution = resolution;
    } else {
      // Seedream, Qwen, WAN, FLUX, Z-Image Turbo: "W*H" size string
      body.size = size || "1024*1024";
    }

    // Quality — GPT family only
    if (caps.quality && quality) body.quality = quality;

    // Output format — only for models that support it, only if value is in the allowed list
    if (caps.formats.length > 0 && outputFormat && caps.formats.includes(outputFormat)) {
      body.output_format = outputFormat;
    }

    // Transformation strength — Z-Image Turbo only
    if (caps.strength) body.strength = (strength !== undefined && strength !== null) ? strength : 0.6;

    // Always random seed
    body.seed = -1;

    return body;
  }

  ipcMain.handle("wavespeed:submitImage", async (_event, { imagePath, prompt, imageModel, aspectRatio, resolution, size, useRefImage, quality, outputFormat, strength }) => {
    const db = await getDatabase();
    const rows = db.exec("SELECT key, value FROM ai_config");
    const cfg = {};
    if (rows.length && rows[0].values) {
      for (const [k, v] of rows[0].values) cfg[k] = v;
    }
    const apiKey = cfg["wavespeed_api_key"] || "";
    if (!apiKey) throw new Error("No Wavespeed API key configured. Add it in Settings → Wavespeed AI.");

    // Resize image to max 1024 px for image generation
    let imageDataUri;
    try {
      if (!imagePath || !fs.existsSync(imagePath)) throw new Error("Image not found: " + imagePath);
      const img = await nativeImage.createThumbnailFromPath(imagePath, { width: 1024, height: 1024 });
      if (!img.isEmpty()) {
        imageDataUri = "data:image/jpeg;base64," + img.toJPEG(90).toString("base64");
      } else {
        const raw = fs.readFileSync(imagePath);
        imageDataUri = `data:${imageMime(imagePath)};base64,` + raw.toString("base64");
      }
    } catch (e) {
      const raw = fs.readFileSync(imagePath);
      imageDataUri = `data:${imageMime(imagePath)};base64,` + raw.toString("base64");
    }

    const endpointSlug = WAVESPEED_IMAGE_ENDPOINT_MAP[imageModel] ?? WAVESPEED_IMAGE_ENDPOINT_MAP["flux_2_klein"];
    const body = buildImageBody(imageModel, imageDataUri, prompt, aspectRatio, resolution, size, useRefImage, quality, outputFormat, strength);

    const res = await fetch(`https://api.wavespeed.ai/api/v3/${endpointSlug}`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body:    JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) {
      throw new Error(`Wavespeed error ${res.status}: ${json.message || JSON.stringify(json)}`);
    }
    const jobData = json.data;

    const localId = `wsimgjob_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const insertStmt = db.prepare(
      `INSERT INTO wavespeed_image_jobs (id, job_id, image_path, prompt, model, size, status, result_url, error_msg, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    insertStmt.run([
      localId, jobData.id, imagePath || "",
      prompt || "", imageModel || "flux_2_klein",
      size || "1024*1024",
      jobData.status || "created", null, null, now, now,
    ]);
    insertStmt.free();
    persistDatabase();

    return { ...jobData, localId };
  });

  // wavespeed:getImageJobs — return all image jobs ordered newest-first.
  ipcMain.handle("wavespeed:getImageJobs", async () => {
    const db = await getDatabase();
    const stmt = db.prepare(
      "SELECT * FROM wavespeed_image_jobs ORDER BY created_at DESC LIMIT 100"
    );
    const jobs = [];
    while (stmt.step()) jobs.push(stmt.getAsObject());
    stmt.free();
    return jobs;
  });

  // wavespeed:deleteImageJob — remove a single image job by its local DB id.
  ipcMain.handle("wavespeed:deleteImageJob", async (_event, localId) => {
    const db = await getDatabase();
    db.run("DELETE FROM wavespeed_image_jobs WHERE id = ?", [localId]);
    persistDatabase();
    return { ok: true };
  });

  // wavespeed:downloadImage — fetch a generated image URL and save it to
  // ~/Pictures/WavespeedAI/, then reveal the file in Finder / Explorer.
  ipcMain.handle("wavespeed:downloadImage", async (_event, resultUrl, suggestedFilename, reveal = true) => {
    const res = await fetch(resultUrl);
    if (!res.ok) throw new Error(`Download failed: HTTP ${res.status} ${res.statusText}`);
    const buffer = Buffer.from(await res.arrayBuffer());

    // Destination folder: ~/Pictures/WavespeedAI/
    const destDir = path.join(app.getPath("pictures"), "WavespeedAI");
    fs.mkdirSync(destDir, { recursive: true });

    // Derive file extension from the URL path then from the Content-Type header
    const urlExt = (resultUrl.split("?")[0] ?? "").match(/\.(png|jpe?g|webp)$/i)?.[1]?.toLowerCase();
    const ct = res.headers.get("content-type")?.split(";")[0].trim() ?? "";
    const ctExt = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }[ct] ?? null;
    const ext = urlExt ?? ctExt ?? "png";

    const filename = suggestedFilename || `wavespeed_${Date.now()}.${ext}`;
    const destPath = path.join(destDir, filename);
    fs.writeFileSync(destPath, buffer);

    // Reveal the saved file in Finder / Explorer (skip when reveal=false, e.g. silent downloads for AI post generation)
    if (reveal) shell.showItemInFolder(destPath);

    return { path: destPath, folder: destDir };
  });

  // ── Shared Topaz upscale logic ────────────────────────────────────────────
  // Used by both the blocking modal IPC (Library/Picker) and the background
  // queue runner (Image Queue). Accepts a local file path + a params object.
  //
  // params shape (all optional except model):
  //   model         – Topaz API model string ("Standard V2", "Bloom Realism", "Wonder 3", …)
  //   outputFormat  – "jpeg" | "png"  (default: "jpeg")
  //   scale         – 1 | 2 | 4 | 6 | 8  (default: 2)
  //   creativity    – string: subtle/low/medium/high/max  → mapped to strength (Standard V2)
  //                            or low/medium/high/max     → mapped to creativity 1-4 (Bloom Realism)
  //   enhancement   – string: low/medium/high             → enhancement_strength (Wonder 3)
  //   preserveFaces – bool: true → face_enhancement=true + strength=0.5, creativity=0.2
  //   prompt        – string: image description sent as `prompt` to gen-endpoints
  async function topazUpscaleFile(imagePath, params) {
    const {
      model        = "Standard V2",
      outputFormat = "jpeg",
      scale        = 2,
      creativity   = null,
      enhancement  = null,
      preserveFaces = false,
      prompt       = "",
    } = params || {};

    const db = await getDatabase();
    // Read both api key and custom output folder in one query
    const cfgRows = db.exec("SELECT key, value FROM ai_config WHERE key IN ('topaz_api_key','topaz_output_folder')");
    const cfg = {};
    if (cfgRows.length && cfgRows[0].values) {
      for (const [k, v] of cfgRows[0].values) cfg[k] = v;
    }
    const apiKey = cfg["topaz_api_key"] ?? "";
    if (!apiKey) throw new Error("No Topaz Labs API key configured. Add it in Settings → Topaz Labs.");

    const TOPAZ_BASE = "https://api.topazlabs.com/image/v1";
    const HEADERS = { "X-API-KEY": apiKey };

    // Wonder 3 and Bloom Realism use the generative endpoint; Standard V2 uses enhance/async
    const genModels = new Set(["Wonder 3", "Wonder 2", "Bloom Creative", "Bloom Realism"]);
    const endpoint = genModels.has(model)
      ? `${TOPAZ_BASE}/enhance-gen/async`
      : `${TOPAZ_BASE}/enhance/async`;

    const imageBytes = fs.readFileSync(imagePath);
    const fd = new FormData();
    fd.append("model", model);
    fd.append("output_format", outputFormat || "jpeg");
    fd.append("image", new Blob([imageBytes]), path.basename(imagePath));

    // ── Scale: compute output dimensions from source image ────────────────
    const numScale = Number(scale) || 2;
    if (numScale > 1) {
      try {
        const sourceImg = nativeImage.createFromPath(imagePath);
        const { width: srcW, height: srcH } = sourceImg.getSize();
        if (srcW > 0 && srcH > 0) {
          fd.append("output_width",  String(Math.round(srcW * numScale)));
          fd.append("output_height", String(Math.round(srcH * numScale)));
        }
      } catch { /* let Topaz pick default scale */ }
    }

    // ── Model-specific parameters ─────────────────────────────────────────
    if (model === "Standard V2") {
      // creativity → strength (0.01–1.0)
      const strengthMap = { subtle: 0.2, low: 0.4, medium: 0.6, high: 0.8, max: 1.0 };
      const strengthVal = strengthMap[creativity] ?? null;
      if (strengthVal !== null) fd.append("strength", String(strengthVal));
      if (preserveFaces) {
        fd.append("face_enhancement",            "true");
        fd.append("face_enhancement_strength",   "0.5");
        fd.append("face_enhancement_creativity", "0.2");
      }
      // Standard V2 doesn't support `prompt` — omit silently
    } else if (model === "Bloom Realism") {
      // creativity → integer 1–4
      const creativityMap = { low: 1, medium: 2, high: 3, max: 4 };
      const creativityVal = creativityMap[creativity] ?? null;
      if (creativityVal !== null) fd.append("creativity", String(creativityVal));
      if (preserveFaces) {
        fd.append("face_enhancement",            "true");
        fd.append("face_enhancement_strength",   "0.5");
        fd.append("face_enhancement_creativity", "0.2");
      }
      if (prompt && prompt.trim()) fd.append("prompt", prompt.trim());
    } else if (model === "Wonder 3") {
      // enhancement_strength: "low" | "medium" | "high"
      const validEnhancement = ["low", "medium", "high"].includes(enhancement) ? enhancement : "medium";
      fd.append("enhancement_strength", validEnhancement);
      if (preserveFaces) {
        fd.append("face_enhancement",            "true");
        fd.append("face_enhancement_strength",   "0.5");
        fd.append("face_enhancement_creativity", "0.2");
      }
    } else if (model === "Bloom Creative") {
      // Legacy model — keep basic support
      if (prompt && prompt.trim()) fd.append("prompt", prompt.trim());
    }

    const submitRes = await fetch(endpoint, { method: "POST", headers: HEADERS, body: fd });
    if (!submitRes.ok) {
      const errText = await submitRes.text().catch(() => "");
      throw new Error(`Topaz submit failed: HTTP ${submitRes.status} — ${errText.slice(0, 300)}`);
    }
    const submitData = await submitRes.json();
    const processId = submitData.process_id;
    if (!processId) throw new Error("Topaz API returned no process_id");

    let status;
    let attempts = 0;
    do {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      const statusRes = await fetch(`${TOPAZ_BASE}/status/${processId}`, { headers: HEADERS });
      const statusData = await statusRes.json();
      status = statusData.status;
      if (status === "Failed" || status === "Cancelled") throw new Error(`Topaz job ended with status: ${status}`);
      attempts++;
      if (attempts > 120) throw new Error("Topaz job timed out after 6 minutes");
    } while (status !== "Completed");

    const dlRes = await fetch(`${TOPAZ_BASE}/download/${processId}`, { headers: HEADERS });
    const dlData = await dlRes.json();
    const downloadUrl = dlData.download_url ?? dlData.url;
    if (!downloadUrl) throw new Error(`Topaz API returned no download URL. Response: ${JSON.stringify(dlData).slice(0, 200)}`);

    const imgRes = await fetch(downloadUrl);
    if (!imgRes.ok) throw new Error(`Failed to download Topaz result: HTTP ${imgRes.status}`);
    const buffer = Buffer.from(await imgRes.arrayBuffer());

    // Use user-configured folder if set, otherwise fall back to ~/Pictures/TopazAI/
    const destDir = (cfg["topaz_output_folder"] && cfg["topaz_output_folder"].trim())
      ? cfg["topaz_output_folder"].trim()
      : path.join(app.getPath("pictures"), "TopazAI");
    fs.mkdirSync(destDir, { recursive: true });
    const baseName  = path.basename(imagePath, path.extname(imagePath));
    const modelSlug = model.toLowerCase().replace(/\s+/g, "_");
    const scaleTag  = numScale > 1 ? `_${numScale}x` : "";
    const ext       = outputFormat === "png" ? "png" : "jpg";
    const destPath  = path.join(destDir, `${baseName}_${modelSlug}${scaleTag}_${Date.now()}.${ext}`);
    fs.writeFileSync(destPath, buffer);
    return { path: destPath, folder: destDir };
  }

  // topaz:upscaleImage — blocking call used by Library / Picker modals.
  ipcMain.handle("topaz:upscaleImage", async (_event, params) => {
    const { imagePath, ...rest } = params;
    const result = await topazUpscaleFile(imagePath, rest);
    shell.showItemInFolder(result.path);
    return result;
  });

  // ── Topaz background queue (Image Queue) ─────────────────────────────────
  // Fire-and-forget runner: downloads source if a URL is given, then upscales.
  async function runTopazQueueJob(localId, imagePath, imageUrl, jobParams) {
    let db;
    try { db = await getDatabase(); } catch { return; }

    function fail(msg) {
      const now = new Date().toISOString();
      try { db.run("UPDATE topaz_jobs SET status='failed', error_msg=?, updated_at=? WHERE id=?", [msg, now, localId]); persistDatabase(); } catch {}
      if (mainWindow && !mainWindow.isDestroyed())
        mainWindow.webContents.send("topaz:jobUpdated", { id: localId, status: "failed", error_msg: msg, updated_at: now });
    }

    try {
      // Download source image from remote URL if no local path provided
      let localPath = imagePath;
      if (!localPath && imageUrl) {
        const tmpDir = path.join(app.getPath("temp"), "topaz_src");
        fs.mkdirSync(tmpDir, { recursive: true });
        localPath = path.join(tmpDir, `topaz_src_${Date.now()}.png`);
        const dlRes = await fetch(imageUrl);
        if (!dlRes.ok) throw new Error(`Source download failed: HTTP ${dlRes.status}`);
        fs.writeFileSync(localPath, Buffer.from(await dlRes.arrayBuffer()));
        // Update DB with resolved local path
        db.run("UPDATE topaz_jobs SET image_path=?, original_filename=? WHERE id=?",
          [localPath, path.basename(localPath), localId]);
        persistDatabase();
      }
      if (!localPath) throw new Error("No source image path or URL provided");

      const result = await topazUpscaleFile(localPath, jobParams);

      const now = new Date().toISOString();
      db.run("UPDATE topaz_jobs SET status='completed', result_path=?, updated_at=? WHERE id=?",
        [result.path, now, localId]);
      persistDatabase();
      if (mainWindow && !mainWindow.isDestroyed())
        mainWindow.webContents.send("topaz:jobUpdated", { id: localId, status: "completed", result_path: result.path, updated_at: now });
    } catch (err) {
      fail(err?.message ?? String(err));
    }
  }

  // topaz:submitJob — insert row, start background worker, return immediately.
  // The full params object is forwarded to the queue runner (not persisted to DB
  // beyond model name and outputFormat — only needed for display in queue panel).
  ipcMain.handle("topaz:submitJob", async (_event, params) => {
    const { imagePath, imageUrl, model, outputFormat, ...rest } = params || {};
    const db = await getDatabase();
    const localId = `topazjob_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const originalFilename = imagePath ? path.basename(imagePath) : (imageUrl ? imageUrl.split("/").pop()?.split("?")[0] ?? "image" : "image");
    const stmt = db.prepare(
      `INSERT INTO topaz_jobs (id, image_path, original_filename, model, output_format, status, result_path, error_msg, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'processing', NULL, NULL, ?, ?)`
    );
    stmt.run([localId, imagePath || "", originalFilename, model || "Standard V2", outputFormat || "jpeg", now, now]);
    stmt.free();
    persistDatabase();
    // Fire-and-forget — do NOT await
    const jobParams = { model: model || "Standard V2", outputFormat: outputFormat || "jpeg", ...rest };
    runTopazQueueJob(localId, imagePath || "", imageUrl || "", jobParams).catch(() => {});
    return { localId };
  });

  // topaz:getJobs — return all jobs ordered newest-first.
  ipcMain.handle("topaz:getJobs", async () => {
    const db = await getDatabase();
    const stmt = db.prepare("SELECT * FROM topaz_jobs ORDER BY created_at DESC LIMIT 100");
    const jobs = [];
    while (stmt.step()) jobs.push(stmt.getAsObject());
    stmt.free();
    return jobs;
  });

  // topaz:deleteJob — remove a single job by its local id.
  ipcMain.handle("topaz:deleteJob", async (_event, localId) => {
    const db = await getDatabase();
    db.run("DELETE FROM topaz_jobs WHERE id = ?", [localId]);
    persistDatabase();
    return { ok: true };
  });

  // ── Background poller — polls all pending jobs every 12 s ─────────────────
  // Runs in main process so jobs are tracked even when queue panel is closed.
  async function pollPendingWavespeedJobs() {
    let db;
    try { db = await getDatabase(); } catch { return; }

    const stmt = db.prepare(
      "SELECT id, job_id FROM wavespeed_jobs WHERE status IN ('created', 'processing')"
    );
    const pending = [];
    while (stmt.step()) pending.push(stmt.getAsObject());
    stmt.free();
    if (!pending.length) return;

    const cfgRows = db.exec("SELECT key, value FROM ai_config WHERE key = 'wavespeed_api_key'");
    const apiKey = cfgRows[0]?.values?.[0]?.[1] ?? "";
    if (!apiKey) return;

    for (const job of pending) {
      try {
        const r = await fetch(`https://api.wavespeed.ai/api/v3/predictions/${job.job_id}/result`, {
          headers: { "Authorization": `Bearer ${apiKey}` },
        });
        const data = (await r.json()).data;
        if (!r.ok || !data) continue;

        const now = new Date().toISOString();
        const videoUrl  = (data.status === "completed" && data.outputs?.length) ? data.outputs[0] : null;
        const errorMsg  = data.error || null;

        db.run(
          "UPDATE wavespeed_jobs SET status = ?, video_url = ?, error_msg = ?, updated_at = ? WHERE id = ?",
          [data.status, videoUrl, errorMsg, now, job.id]
        );
        persistDatabase();

        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("wavespeed:jobUpdated", {
            id: job.id, job_id: job.job_id,
            status: data.status, video_url: videoUrl, error_msg: errorMsg, updated_at: now,
          });
        }
      } catch (e) {
        console.warn("[wavespeed poller] job", job.job_id, e.message);
      }
    }
  }
  async function pollPendingWavespeedImageJobs() {
    let db;
    try { db = await getDatabase(); } catch { return; }

    const stmt = db.prepare(
      "SELECT id, job_id FROM wavespeed_image_jobs WHERE status IN ('created', 'processing')"
    );
    const pending = [];
    while (stmt.step()) pending.push(stmt.getAsObject());
    stmt.free();
    if (!pending.length) return;

    const cfgRows = db.exec("SELECT key, value FROM ai_config WHERE key = 'wavespeed_api_key'");
    const apiKey = cfgRows[0]?.values?.[0]?.[1] ?? "";
    if (!apiKey) return;

    for (const job of pending) {
      try {
        const r = await fetch(`https://api.wavespeed.ai/api/v3/predictions/${job.job_id}/result`, {
          headers: { "Authorization": `Bearer ${apiKey}` },
        });
        const data = (await r.json()).data;
        if (!r.ok || !data) continue;

        const now = new Date().toISOString();
        const resultUrl = (data.status === "completed" && data.outputs?.length) ? data.outputs[0] : null;
        const errorMsg  = data.error || null;

        db.run(
          "UPDATE wavespeed_image_jobs SET status = ?, result_url = ?, error_msg = ?, updated_at = ? WHERE id = ?",
          [data.status, resultUrl, errorMsg, now, job.id]
        );
        persistDatabase();

        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("wavespeed:imageJobUpdated", {
            id: job.id, job_id: job.job_id,
            status: data.status, result_url: resultUrl, error_msg: errorMsg, updated_at: now,
          });
        }
      } catch (e) {
        console.warn("[wavespeed image poller] job", job.job_id, e.message);
      }
    }
  }

  setInterval(pollPendingWavespeedJobs, 12000);
  setInterval(pollPendingWavespeedImageJobs, 12000);

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
  ipcMain.handle("ai:generate-post", async (_event, imagePaths, network, hint, postType, perspective, ocName, storylineId, decisions, qtEventName, qtTagger, customMaxChars, aiInstructions) => {
    return generateAiPost(imagePaths, network, hint, postType, perspective, ocName, storylineId, decisions, qtEventName, qtTagger, customMaxChars, aiInstructions);
  });

  // ── AI video prompt generation ─────────────────────────────────────────────
  ipcMain.handle("ai:generate-video-prompt", async (_event, imagePaths, videoModel, instructions, includeCameraMoves) => {
    return generateVideoPrompt(imagePaths, videoModel, instructions, includeCameraMoves !== false);
  });

  // ── AI image recreation prompt (SFW, model-specific) ──────────────────────
  ipcMain.handle("ai:generate-image-prompt", async (_event, imagePaths, imageModel, instructions) => {
    return generateImagePrompt(imagePaths, imageModel, instructions);
  });

  // ── Get image pixel dimensions ────────────────────────────────────────────
  ipcMain.handle("wavespeed:getImageDimensions", async (_event, imagePath) => {
    try {
      if (!imagePath || !fs.existsSync(imagePath)) return null;
      const img = nativeImage.createFromPath(imagePath);
      if (img.isEmpty()) return null;
      return img.getSize(); // { width, height }
    } catch {
      return null;
    }
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

  // ── Upload a single image into the library ──────────────────────────────
  // Receives { folderPath, filename, bytes } from the renderer.
  // Writes the file to disk, generates a thumbnail, finds the matching
  // image_source entry, inserts the image record, and returns the new image.
  ipcMain.handle("upload:save-and-index", async (_event, { folderPath, filename, bytes }) => {
    const destPath = path.join(folderPath, filename);

    // Write the file bytes to disk (bytes is a plain Array from the renderer).
    fs.writeFileSync(destPath, Buffer.from(bytes));

    // Generate a thumbnail for the new file.
    const thumbPath = await generateThumbnail(destPath);

    // Build the localfile:// URL for the thumbnail (and the image itself).
    function toLocalfileUrl(absPath) {
      const fwd = absPath.replaceAll("\\", "/");
      const p = fwd.startsWith("/") ? fwd : "/" + fwd;
      return "localfile://" + encodeURI(p);
    }
    const localPath  = destPath.replaceAll("\\", "/");
    const folderNorm = folderPath.replaceAll("\\", "/");
    const thumbnailUrl = thumbPath ? toLocalfileUrl(thumbPath) : toLocalfileUrl(destPath);

    // Find the source_id: look for a local_folder source whose root path is an
    // ancestor of the destination folder, preferring the longest (most specific) match.
    const db = await getDatabase();
    const srcRows = [];
    const srcStmt = db.prepare(
      `SELECT id FROM image_sources WHERE type = 'local_folder' AND ? LIKE root_path_or_id || '%' ORDER BY LENGTH(root_path_or_id) DESC LIMIT 1`
    );
    srcStmt.bind([folderNorm]);
    while (srcStmt.step()) srcRows.push(srcStmt.getAsObject());
    srcStmt.free();

    let sourceId;
    if (srcRows.length) {
      sourceId = srcRows[0].id;
    } else {
      // Fallback: find source_id via an existing image in the same folder.
      const imgRows = [];
      const imgStmt = db.prepare("SELECT source_id FROM images WHERE folder_path = ? LIMIT 1");
      imgStmt.bind([folderNorm]);
      while (imgStmt.step()) imgRows.push(imgStmt.getAsObject());
      imgStmt.free();
      if (!imgRows.length) throw new Error(`No indexed source covers folder: ${folderPath}`);
      sourceId = imgRows[0].source_id;
    }

    const mimeMap = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif" };
    const ext = path.extname(filename).toLowerCase();
    const mimeType = mimeMap[ext] ?? "image/jpeg";
    const fileSize = fs.statSync(destPath).size;
    const now = new Date().toISOString();
    const id = `image_${crypto.randomUUID()}`;

    const insStmt = db.prepare(
      `INSERT INTO images (id, source_id, source_file_id, local_path, filename, folder_path, mime_type, file_size,
       thumbnail_url, web_view_link, created_at, modified_at, indexed_at, perceptual_hash, width, height, rating, is_archived)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, NULL, NULL, NULL, 'unknown', 0)`
    );
    insStmt.run([id, sourceId, localPath, localPath, filename, folderNorm, mimeType, fileSize, thumbnailUrl, now, now, now]);
    insStmt.free();
    persistDatabase();

    return { ok: true, id, localPath, thumbnailUrl, filename, folderPath: folderNorm };
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
