/**
 * scanWorker.cjs — runs in a Node.js Worker Thread.
 *
 * Walks the given root directory asynchronously (fs.promises) so the main
 * process event loop is never blocked, even for very large folder trees.
 *
 * nativeImage (thumbnail generation) requires the main thread and is
 * intentionally NOT done here — this worker only collects file metadata.
 *
 * Messages posted to the parent:
 *   { type: 'file', data: FileMetadata }   — one per matching file found
 *   { type: 'done', total: number }         — walk complete
 *   { type: 'error', message: string }      — unrecoverable walk error
 */
"use strict";

const { workerData, parentPort } = require("node:worker_threads");
const fsPromises = require("node:fs/promises");
const path = require("node:path");

const { rootPath, supportedExtensions } = workerData;
const extSet = new Set(supportedExtensions);

function mimeTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "application/octet-stream";
}

let total = 0;

async function recurse(dir) {
  let entries;
  try {
    entries = await fsPromises.readdir(dir, { withFileTypes: true });
  } catch {
    // Unreadable directory (permissions, broken symlink, etc.) — skip silently.
    return;
  }

  for (const entry of entries) {
    const current = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      await recurse(current);
      continue;
    }

    if (!entry.isFile()) continue;
    if (!extSet.has(path.extname(entry.name).toLowerCase())) continue;

    let stat;
    try {
      stat = await fsPromises.stat(current);
    } catch {
      continue; // file disappeared between readdir and stat
    }

    total += 1;
    parentPort.postMessage({
      type: "file",
      data: {
        localPath: current,
        filename: entry.name,
        folderPath: path.dirname(current),
        mimeType: mimeTypeFor(current),
        fileSize: stat.size,
        createdAt: stat.birthtime.toISOString(),
        modifiedAt: stat.mtime.toISOString(),
      },
    });
  }
}

recurse(rootPath)
  .then(() => parentPort.postMessage({ type: "done", total }))
  .catch((err) => parentPort.postMessage({ type: "error", message: err.message }));
