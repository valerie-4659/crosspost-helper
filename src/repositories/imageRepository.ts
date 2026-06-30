import { createId, getDatabase, nowIso } from "./database";
import type { ImageFilters, ImageInput, ImageWithPostState, IndexedImage } from "@/types/image";

type ImageRow = {
  id: string;
  source_id: string;
  source_file_id: string | null;
  local_path: string | null;
  filename: string;
  folder_path: string;
  mime_type: string;
  file_size: number | null;
  thumbnail_url: string | null;
  web_view_link: string | null;
  created_at: string | null;
  modified_at: string | null;
  indexed_at: string;
  perceptual_hash: string | null;
  width: number | null;
  height: number | null;
  rating: IndexedImage["rating"];
  is_archived: number;
};

type ImageListRow = ImageRow & {
  source_name: string;
  source_type: string;
  post_states: string | null;
};

function mapImage(row: ImageRow): IndexedImage {
  return {
    id: row.id,
    sourceId: row.source_id,
    sourceFileId: row.source_file_id,
    localPath: row.local_path,
    filename: row.filename,
    folderPath: row.folder_path,
    mimeType: row.mime_type,
    fileSize: row.file_size,
    thumbnailUrl: row.thumbnail_url,
    webViewLink: row.web_view_link,
    createdAt: row.created_at,
    modifiedAt: row.modified_at,
    indexedAt: row.indexed_at,
    perceptualHash: row.perceptual_hash,
    width: row.width,
    height: row.height,
    rating: row.rating,
    isArchived: Boolean(row.is_archived),
  };
}

function mapImageWithState(row: ImageListRow): ImageWithPostState {
  const postStates = (row.post_states ?? "")
    .split("|")
    .filter(Boolean)
    .reduce<Record<string, "planned" | "posted" | "skipped">>((states, item) => {
      const [targetId, status] = item.split(":");
      if (targetId && (status === "planned" || status === "posted" || status === "skipped")) {
        states[targetId] = status;
      }
      return states;
    }, {});

  return {
    ...mapImage(row),
    sourceName: row.source_name,
    sourceType: row.source_type,
    postStates,
  };
}

export async function countImages() {
  const db = await getDatabase();
  const rows = await db.select<Array<{ total: number }>>("SELECT COUNT(*) AS total FROM images");
  return rows[0]?.total ?? 0;
}

export async function listImages(filters: Partial<ImageFilters> = {}): Promise<ImageWithPostState[]> {
  const db = await getDatabase();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.sourceId) {
    params.push(filters.sourceId);
    conditions.push(`images.source_id = $${params.length}`);
  }
  if (filters.exactFolderPath) {
    params.push(filters.exactFolderPath);
    conditions.push(`images.folder_path = $${params.length}`);
  } else if (filters.folderPath) {
    params.push(`%${filters.folderPath}%`);
    conditions.push(`images.folder_path LIKE $${params.length}`);
  }
  if (filters.rating && filters.rating !== "all") {
    params.push(filters.rating);
    conditions.push(`images.rating = $${params.length}`);
  }
  if (filters.targetId) {
    params.push(filters.targetId);
    conditions.push(`NOT EXISTS (
      SELECT 1 FROM post_records selected_target_record
      WHERE selected_target_record.image_id = images.id
      AND selected_target_record.target_id = $${params.length}
      AND selected_target_record.status = 'posted'
    )`);
  }
  if (filters.excludePostedAnywhere) {
    conditions.push(`NOT EXISTS (
      SELECT 1 FROM post_records posted_anywhere
      WHERE posted_anywhere.image_id = images.id AND posted_anywhere.status = 'posted'
    )`);
  }
  if (!filters.includeSkipped) {
    conditions.push(`NOT EXISTS (
      SELECT 1 FROM post_records skipped_records
      WHERE skipped_records.image_id = images.id AND skipped_records.status = 'skipped'
    )`);
  }
  if (!filters.includeArchived) {
    conditions.push("images.is_archived = 0");
  }
  if (!filters.includeExcludedFolders) {
    // Exclude images whose folder_path is in excluded_folders OR is a child of one.
    conditions.push(`NOT EXISTS (
      SELECT 1 FROM excluded_folders ef
      WHERE images.folder_path = ef.folder_path
         OR images.folder_path LIKE ef.folder_path || '/%'
    )`);
  }
  if (filters.hidePostedForTargetId) {
    params.push(filters.hidePostedForTargetId);
    conditions.push(`NOT EXISTS (
      SELECT 1 FROM post_records hide_posted
      WHERE hide_posted.image_id = images.id
      AND hide_posted.target_id = $${params.length}
      AND hide_posted.status = 'posted'
    )`);
  }

  let orderBy: string;
  switch (filters.sortBy) {
    case "date_asc":
      orderBy = "COALESCE(images.created_at, images.modified_at, images.indexed_at) ASC";
      break;
    case "alpha_asc":
      orderBy = "images.filename ASC";
      break;
    case "alpha_desc":
      orderBy = "images.filename DESC";
      break;
    case "pick_desc":
    case "pick_asc": {
      const order = filters.folderPickOrder ?? [];
      if (order.length) {
        // Build CASE WHEN folder_path = '...' THEN <idx> ELSE <N+1> END ASC
        // Caller passes paths already sorted in desired order (index 0 = first shown).
        const cases = order.map((p, i) => `WHEN ${JSON.stringify(p)} THEN ${i}`).join(" ");
        orderBy = `CASE images.folder_path ${cases} ELSE ${order.length + 1} END ASC, images.filename ASC`;
      } else {
        orderBy = "COALESCE(images.created_at, images.modified_at, images.indexed_at) DESC";
      }
      break;
    }
    default:
      orderBy = "COALESCE(images.created_at, images.modified_at, images.indexed_at) DESC";
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = await db.select<ImageListRow[]>(
    `SELECT images.*, image_sources.name AS source_name, image_sources.type AS source_type,
      GROUP_CONCAT(post_records.target_id || ':' || post_records.status, '|') AS post_states
     FROM images
     JOIN image_sources ON image_sources.id = images.source_id
     LEFT JOIN post_records ON post_records.image_id = images.id
     ${where}
     GROUP BY images.id
     ORDER BY ${orderBy}
     LIMIT 500`,
    params,
  );

  return rows.map(mapImageWithState);
}

export async function getImage(id: string): Promise<ImageWithPostState | null> {
  const db = await getDatabase();
  const rows = await db.select<ImageListRow[]>(
    `SELECT images.*, image_sources.name AS source_name, image_sources.type AS source_type,
      GROUP_CONCAT(post_records.target_id || ':' || post_records.status, '|') AS post_states
     FROM images
     JOIN image_sources ON image_sources.id = images.source_id
     LEFT JOIN post_records ON post_records.image_id = images.id
     WHERE images.id = $1
     GROUP BY images.id
     LIMIT 1`,
    [id],
  );

  return rows[0] ? mapImageWithState(rows[0]) : null;
}

export async function getImageByLocalPath(localPath: string): Promise<ImageWithPostState | null> {
  const db = await getDatabase();
  const rows = await db.select<ImageListRow[]>(
    `SELECT images.*, image_sources.name AS source_name, image_sources.type AS source_type,
      GROUP_CONCAT(post_records.target_id || ':' || post_records.status, '|') AS post_states
     FROM images
     JOIN image_sources ON image_sources.id = images.source_id
     LEFT JOIN post_records ON post_records.image_id = images.id
     WHERE images.local_path = $1
     GROUP BY images.id
     LIMIT 1`,
    [localPath],
  );

  return rows[0] ? mapImageWithState(rows[0]) : null;
}

export async function upsertImage(input: ImageInput): Promise<{ imageId: string; created: boolean }> {
  const db = await getDatabase();
  const timestamp = nowIso();
  const existing = input.sourceFileId
    ? await db.select<Array<{ id: string }>>(
        "SELECT id FROM images WHERE source_id = $1 AND source_file_id = $2 LIMIT 1",
        [input.sourceId, input.sourceFileId],
      )
    : [];

  if (existing[0]) {
    await db.execute(
      `UPDATE images SET local_path = $1, filename = $2, folder_path = $3, mime_type = $4, file_size = $5,
       thumbnail_url = COALESCE($6, thumbnail_url), web_view_link = $7, created_at = $8, modified_at = $9, indexed_at = $10,
       perceptual_hash = COALESCE($11, perceptual_hash), width = COALESCE($12, width),
       height = COALESCE($13, height), rating = COALESCE($14, rating)
       WHERE id = $15`,
      [
        input.localPath ?? null,
        input.filename,
        input.folderPath,
        input.mimeType,
        input.fileSize ?? null,
        input.thumbnailUrl ?? null,
        input.webViewLink ?? null,
        input.createdAt ?? null,
        input.modifiedAt ?? null,
        timestamp,
        input.perceptualHash ?? null,
        input.width ?? null,
        input.height ?? null,
        input.rating ?? "unknown",
        existing[0].id,
      ],
    );
    return { imageId: existing[0].id, created: false };
  }

  const id = createId("image");
  await db.execute(
    `INSERT INTO images (
      id, source_id, source_file_id, local_path, filename, folder_path, mime_type, file_size,
      thumbnail_url, web_view_link, created_at, modified_at, indexed_at, perceptual_hash, width, height, rating, is_archived
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, 0)`,
    [
      id,
      input.sourceId,
      input.sourceFileId ?? null,
      input.localPath ?? null,
      input.filename,
      input.folderPath,
      input.mimeType,
      input.fileSize ?? null,
      input.thumbnailUrl ?? null,
      input.webViewLink ?? null,
      input.createdAt ?? null,
      input.modifiedAt ?? null,
      timestamp,
      input.perceptualHash ?? null,
      input.width ?? null,
      input.height ?? null,
      input.rating ?? "unknown",
    ],
  );
  return { imageId: id, created: true };
}

/**
 * Count the total number of images eligible for random picking with the given filters.
 * Used to calculate the 40% cooldown threshold after a skip.
 */
export async function countEligibleImages(filters: ImageFilters): Promise<number> {
  const db = await getDatabase();
  const params: unknown[] = [];
  const conditions = ["images.is_archived = 0"];

  if (filters.sourceId) {
    params.push(filters.sourceId);
    conditions.push(`images.source_id = $${params.length}`);
  }
  if (filters.rating && filters.rating !== "all") {
    params.push(filters.rating);
    conditions.push(`images.rating = $${params.length}`);
  }
  if (filters.targetId) {
    params.push(filters.targetId);
    conditions.push(`NOT EXISTS (
      SELECT 1 FROM post_records pr
      WHERE pr.image_id = images.id AND pr.target_id = $${params.length} AND pr.status = 'posted'
    )`);
  }
  if (filters.excludePostedAnywhere) {
    conditions.push(`NOT EXISTS (
      SELECT 1 FROM post_records pa
      WHERE pa.image_id = images.id AND pa.status = 'posted'
    )`);
  }
  if (!filters.includeSkipped) {
    conditions.push(`NOT EXISTS (
      SELECT 1 FROM post_records sr
      WHERE sr.image_id = images.id AND sr.status = 'skipped'
    )`);
  }
  conditions.push(`NOT EXISTS (
    SELECT 1 FROM excluded_folders ef
    WHERE images.folder_path = ef.folder_path
       OR images.folder_path LIKE ef.folder_path || '/%'
  )`);

  const rows = await db.select<Array<{ count: number }>>(
    `SELECT COUNT(*) as count FROM images
     JOIN image_sources ON image_sources.id = images.source_id
     WHERE ${conditions.join(" AND ")}`,
    params,
  );
  return rows[0]?.count ?? 0;
}

export async function pickRandomImage(filters: ImageFilters): Promise<ImageWithPostState | null> {
  const db = await getDatabase();
  const params: unknown[] = [];
  const conditions = ["images.is_archived = 0"];

  if (filters.sourceId) {
    params.push(filters.sourceId);
    conditions.push(`images.source_id = $${params.length}`);
  }
  if (filters.folderPath) {
    params.push(`%${filters.folderPath}%`);
    conditions.push(`images.folder_path LIKE $${params.length}`);
  }
  if (filters.rating && filters.rating !== "all") {
    params.push(filters.rating);
    conditions.push(`images.rating = $${params.length}`);
  }
  if (filters.dateFrom) {
    params.push(filters.dateFrom);
    conditions.push(`COALESCE(images.created_at, images.modified_at, images.indexed_at) >= $${params.length}`);
  }
  if (filters.dateTo) {
    params.push(filters.dateTo);
    conditions.push(`COALESCE(images.created_at, images.modified_at, images.indexed_at) <= $${params.length}`);
  }
  if (filters.targetId) {
    params.push(filters.targetId);
    conditions.push(`NOT EXISTS (
      SELECT 1 FROM post_records selected_target_record
      WHERE selected_target_record.image_id = images.id
      AND selected_target_record.target_id = $${params.length}
      AND selected_target_record.status = 'posted'
    )`);
  }
  if (filters.excludePostedAnywhere) {
    conditions.push(`NOT EXISTS (
      SELECT 1 FROM post_records posted_anywhere
      WHERE posted_anywhere.image_id = images.id AND posted_anywhere.status = 'posted'
    )`);
  }
  if (!filters.includeSkipped) {
    conditions.push(`NOT EXISTS (
      SELECT 1 FROM post_records skipped_records
      WHERE skipped_records.image_id = images.id AND skipped_records.status = 'skipped'
    )`);
  }
  // Picker always skips excluded folders — there is no opt-in override here.
  conditions.push(`NOT EXISTS (
    SELECT 1 FROM excluded_folders ef
    WHERE images.folder_path = ef.folder_path
       OR images.folder_path LIKE ef.folder_path || '/%'
  )`);

  // Persistent cooldown: exclude images whose cooldown_until threshold hasn't been reached.
  conditions.push(`NOT EXISTS (
    SELECT 1 FROM picker_cooldowns pc
    WHERE pc.image_id = images.id
      AND (SELECT COALESCE(value, 0) FROM picker_state WHERE key = 'total_picks') < pc.cooldown_until
  )`);

  const rows = await db.select<ImageListRow[]>(
    `SELECT images.*, image_sources.name AS source_name, image_sources.type AS source_type,
      GROUP_CONCAT(post_records.target_id || ':' || post_records.status, '|') AS post_states
     FROM images
     JOIN image_sources ON image_sources.id = images.source_id
     LEFT JOIN post_records ON post_records.image_id = images.id
     WHERE ${conditions.join(" AND ")}
     GROUP BY images.id
     ORDER BY RANDOM()
     LIMIT 1`,
    params,
  );

  return rows[0] ? mapImageWithState(rows[0]) : null;
}

// ── Fair shuffle (per-network round-based) ──────────────────────────────────

async function queryFairRandom(
  filters: ImageFilters,
  targetId: string,
  round: number,
): Promise<ImageWithPostState | null> {
  const db = await getDatabase();
  const params: unknown[] = [];
  const conditions = ["images.is_archived = 0"];

  if (filters.sourceId) {
    params.push(filters.sourceId);
    conditions.push(`images.source_id = $${params.length}`);
  }
  if (filters.folderPath) {
    params.push(`%${filters.folderPath}%`);
    conditions.push(`images.folder_path LIKE $${params.length}`);
  }
  if (filters.exactFolderPath) {
    params.push(filters.exactFolderPath);
    conditions.push(`images.folder_path = $${params.length}`);
  }
  if (filters.rating && filters.rating !== "all") {
    params.push(filters.rating);
    conditions.push(`images.rating = $${params.length}`);
  }
  if (filters.dateFrom) {
    params.push(filters.dateFrom);
    conditions.push(`COALESCE(images.created_at, images.modified_at, images.indexed_at) >= $${params.length}`);
  }
  if (filters.dateTo) {
    params.push(filters.dateTo);
    conditions.push(`COALESCE(images.created_at, images.modified_at, images.indexed_at) <= $${params.length}`);
  }
  if (filters.excludePostedAnywhere) {
    conditions.push(`NOT EXISTS (
      SELECT 1 FROM post_records pa
      WHERE pa.image_id = images.id AND pa.status = 'posted'
    )`);
  }

  // Permanently exclude images already posted to this target
  params.push(targetId);
  conditions.push(`NOT EXISTS (
    SELECT 1 FROM post_records pr
    WHERE pr.image_id = images.id AND pr.target_id = $${params.length} AND pr.status = 'posted'
  )`);

  // Excluded folders
  conditions.push(`NOT EXISTS (
    SELECT 1 FROM excluded_folders ef
    WHERE images.folder_path = ef.folder_path
       OR images.folder_path LIKE ef.folder_path || '/%'
  )`);

  // Fair shuffle: exclude images already shown in this round for this target
  params.push(targetId);
  const tParam = params.length;
  params.push(round);
  const rParam = params.length;
  conditions.push(`NOT EXISTS (
    SELECT 1 FROM pick_history ph
    WHERE ph.image_id = images.id
      AND ph.target_id = $${tParam}
      AND ph.round = $${rParam}
  )`);

  const rows = await db.select<ImageListRow[]>(
    `SELECT images.*, image_sources.name AS source_name, image_sources.type AS source_type,
      GROUP_CONCAT(post_records.target_id || ':' || post_records.status, '|') AS post_states
     FROM images
     JOIN image_sources ON image_sources.id = images.source_id
     LEFT JOIN post_records ON post_records.image_id = images.id
     WHERE ${conditions.join(" AND ")}
     GROUP BY images.id
     ORDER BY RANDOM()
     LIMIT 1`,
    params,
  );

  return rows[0] ? mapImageWithState(rows[0]) : null;
}

/**
 * Pick a random image using per-network round-based fair shuffle.
 * Each eligible image appears exactly once per round before any image repeats.
 * When all eligible images have been shown, a new round starts automatically.
 * Skipped images are recorded as shown this round (Option A) via recordImageShown().
 * Posted images are permanently excluded.
 */
export async function pickFairRandomImage(filters: ImageFilters): Promise<ImageWithPostState | null> {
  const db = await getDatabase();
  const targetId = filters.targetId!;

  const roundRows = await db.select<Array<{ round: number }>>(
    "SELECT round FROM pick_rounds WHERE target_id = $1",
    [targetId],
  );
  let currentRound = roundRows[0]?.round ?? 1;

  let image = await queryFairRandom(filters, targetId, currentRound);

  if (!image) {
    // All eligible images shown this round — start a new round
    currentRound += 1;
    await db.execute(
      "INSERT OR REPLACE INTO pick_rounds (target_id, round) VALUES ($1, $2)",
      [targetId, currentRound],
    );
    image = await queryFairRandom(filters, targetId, currentRound);
  }

  return image;
}

/** Return the current round number for a target (1 if never picked). */
export async function getCurrentRound(targetId: string): Promise<number> {
  const db = await getDatabase();
  const rows = await db.select<Array<{ round: number }>>(
    "SELECT round FROM pick_rounds WHERE target_id = $1",
    [targetId],
  );
  return rows[0]?.round ?? 1;
}

/**
 * Record that an image was shown (picked or skipped) in the current round for a target.
 * Call this after every pick and every skip so the image won't reappear this round.
 */
export async function recordImageShown(imageId: string, targetId: string): Promise<void> {
  const db = await getDatabase();
  const roundRows = await db.select<Array<{ round: number }>>(
    "SELECT round FROM pick_rounds WHERE target_id = $1",
    [targetId],
  );
  const currentRound = roundRows[0]?.round ?? 1;
  await db.execute(
    `INSERT OR REPLACE INTO pick_history (image_id, target_id, round, picked_at)
     VALUES ($1, $2, $3, $4)`,
    [imageId, targetId, currentRound, nowIso()],
  );
}

// ── Picker state helpers ────────────────────────────────────────────────────

/** Increment the persistent pick counter by 1. Called after every successful pick. */
export async function incrementPickCount(): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    "UPDATE picker_state SET value = value + 1 WHERE key = 'total_picks'",
    [],
  );
}

/**
 * Put an image on persistent cooldown.
 * @param imageId   The image to cool down
 * @param stepsAhead  How many picks must happen before re-eligibility (ceil(poolSize * 0.4))
 */
export async function setImageCooldown(imageId: string, stepsAhead: number): Promise<void> {
  const db = await getDatabase();
  const now = nowIso();
  await db.execute(
    `INSERT OR REPLACE INTO picker_cooldowns (image_id, cooldown_until, skipped_at)
     VALUES ($1,
       (SELECT COALESCE(value, 0) FROM picker_state WHERE key = 'total_picks') + $2,
       $3)`,
    [imageId, stepsAhead, now],
  );
}

/** How many images are currently on active cooldown (threshold not yet reached). */
export async function getActiveCooldownCount(): Promise<number> {
  const db = await getDatabase();
  const rows = await db.select<Array<{ count: number }>>(
    `SELECT COUNT(*) as count FROM picker_cooldowns
     WHERE (SELECT COALESCE(value, 0) FROM picker_state WHERE key = 'total_picks') < cooldown_until`,
    [],
  );
  return rows[0]?.count ?? 0;
}

/**
 * Pick up to `count` random images for multi-pick mode.
 *
 * @param filters   Standard image filters (target, rating, skipped, etc.)
 * @param count     How many images to return (≥ 1)
 * @param excludeIds  Image IDs already in the pick — won't be returned again
 * @param folderPaths If non-empty, only images inside these folders (or their
 *                    subfolders) are considered.  An empty array means "all folders".
 */
export async function pickRandomImages(
  filters: ImageFilters,
  count: number,
  excludeIds: string[],
  folderPaths: string[],
): Promise<ImageWithPostState[]> {
  if (count <= 0) return [];
  const db = await getDatabase();
  const params: unknown[] = [];
  const conditions = ["images.is_archived = 0"];

  // ── Folder restriction ─────────────────────────────────────────────────
  if (folderPaths.length > 0) {
    const folderClauses = folderPaths.map((fp) => {
      params.push(fp, fp);
      return `(images.folder_path = $${params.length - 1} OR images.folder_path LIKE $${params.length} || '/%')`;
    });
    conditions.push(`(${folderClauses.join(" OR ")})`);
  }

  // ── Exclude already-picked images ──────────────────────────────────────
  if (excludeIds.length > 0) {
    const placeholders = excludeIds.map((_, i) => `$${params.length + i + 1}`).join(",");
    conditions.push(`images.id NOT IN (${placeholders})`);
    params.push(...excludeIds);
  }

  // ── Standard filters (same logic as pickRandomImage) ─────────────────
  if (filters.sourceId) {
    params.push(filters.sourceId);
    conditions.push(`images.source_id = $${params.length}`);
  }
  if (filters.rating && filters.rating !== "all") {
    params.push(filters.rating);
    conditions.push(`images.rating = $${params.length}`);
  }
  if (filters.targetId) {
    params.push(filters.targetId);
    conditions.push(`NOT EXISTS (
      SELECT 1 FROM post_records pr2
      WHERE pr2.image_id = images.id AND pr2.target_id = $${params.length} AND pr2.status = 'posted'
    )`);
  }
  if (filters.excludePostedAnywhere) {
    conditions.push(`NOT EXISTS (
      SELECT 1 FROM post_records pr3
      WHERE pr3.image_id = images.id AND pr3.status = 'posted'
    )`);
  }
  conditions.push(`NOT EXISTS (
    SELECT 1 FROM excluded_folders ef
    WHERE images.folder_path = ef.folder_path OR images.folder_path LIKE ef.folder_path || '/%'
  )`);

  // Fair shuffle: exclude images already shown in the current round for this target.
  if (filters.targetId) {
    const roundRows = await db.select<Array<{ round: number }>>(
      "SELECT round FROM pick_rounds WHERE target_id = $1",
      [filters.targetId],
    );
    const round = roundRows[0]?.round ?? 1;
    params.push(filters.targetId);
    const tParam = params.length;
    params.push(round);
    const rParam = params.length;
    conditions.push(`NOT EXISTS (
      SELECT 1 FROM pick_history ph
      WHERE ph.image_id = images.id
        AND ph.target_id = $${tParam}
        AND ph.round = $${rParam}
    )`);
  }

  params.push(count);
  const rows = await db.select<ImageListRow[]>(
    `SELECT images.*, image_sources.name AS source_name, image_sources.type AS source_type,
      GROUP_CONCAT(post_records.target_id || ':' || post_records.status, '|') AS post_states
     FROM images
     JOIN image_sources ON image_sources.id = images.source_id
     LEFT JOIN post_records ON post_records.image_id = images.id
     WHERE ${conditions.join(" AND ")}
     GROUP BY images.id
     ORDER BY RANDOM()
     LIMIT $${params.length}`,
    params,
  );
  return rows.map(mapImageWithState);
}

export async function setImageArchived(imageId: string, archived: boolean) {
  const db = await getDatabase();
  await db.execute("UPDATE images SET is_archived = $1 WHERE id = $2", [archived ? 1 : 0, imageId]);
}

/** Remove specific images from the index (post_records cascade-delete automatically). */
export async function deleteImages(imageIds: string[]) {
  if (!imageIds.length) return;
  const db = await getDatabase();
  const placeholders = imageIds.map((_, i) => `$${i + 1}`).join(",");
  await db.execute(`DELETE FROM images WHERE id IN (${placeholders})`, imageIds);
}

/**
 * Remove all images whose folder_path exactly matches OR is a subfolder of the given path.
 * e.g. deleteImagesInFolder("G:/art") also removes "G:/art/renders".
 */
export async function deleteImagesInFolder(folderPath: string) {
  const db = await getDatabase();
  await db.execute(
    "DELETE FROM images WHERE folder_path = $1 OR folder_path LIKE $2",
    [folderPath, folderPath + "/%"],
  );
}

/** Hard-reset: wipe all image and post_record data (sources/targets are kept). */
export async function deleteAllImages() {
  const db = await getDatabase();
  // post_records FK cascades on image delete but we flush it explicitly for speed.
  await db.execute("DELETE FROM post_records");
  await db.execute("DELETE FROM images");
}

export async function findDuplicateCandidates(input: ImageInput) {
  const db = await getDatabase();
  const candidates: ImageRow[] = [];
  if (input.perceptualHash) {
    candidates.push(
      ...(await db.select<ImageRow[]>("SELECT * FROM images WHERE perceptual_hash = $1 LIMIT 20", [input.perceptualHash])),
    );
  }
  if (input.sourceFileId) {
    candidates.push(
      ...(await db.select<ImageRow[]>("SELECT * FROM images WHERE source_file_id = $1 LIMIT 20", [input.sourceFileId])),
    );
  }
  if (input.fileSize && input.createdAt) {
    candidates.push(
      ...(await db.select<ImageRow[]>(
        "SELECT * FROM images WHERE filename = $1 AND file_size = $2 AND created_at = $3 LIMIT 20",
        [input.filename, input.fileSize, input.createdAt],
      )),
    );
  }

  return [...new Map(candidates.map((candidate) => [candidate.id, mapImage(candidate)])).values()];
}

export interface FolderEntry {
  folderPath: string;
  count: number;
  isExcluded: boolean;
}

/**
 * Returns all distinct folder paths and their image counts, sorted alphabetically.
 * Each entry includes isExcluded = true when the folder (or a parent) is in excluded_folders.
 */
export async function listDistinctFolders(sourceId?: string): Promise<FolderEntry[]> {
  const db = await getDatabase();
  const params: unknown[] = [];
  const conditions = ["images.is_archived = 0"];
  if (sourceId) {
    params.push(sourceId);
    conditions.push(`images.source_id = $${params.length}`);
  }
  const rows = await db.select<Array<{ folder_path: string; count: number; is_excluded: number }>>(
    `SELECT images.folder_path,
            COUNT(*) AS count,
            CASE WHEN EXISTS (
              SELECT 1 FROM excluded_folders ef
              WHERE images.folder_path = ef.folder_path
                 OR images.folder_path LIKE ef.folder_path || '/%'
            ) THEN 1 ELSE 0 END AS is_excluded
     FROM images
     WHERE ${conditions.join(" AND ")}
     GROUP BY images.folder_path
     ORDER BY images.folder_path`,
    params,
  );
  return rows.map((r) => ({ folderPath: r.folder_path, count: r.count, isExcluded: Boolean(r.is_excluded) }));
}

/**
 * Returns up to 3 thumbnail URLs per folder path for folder card previews.
 * Folders with custom folder_previews entries use those (ordered by position).
 * Folders without custom entries fall back to a single auto-picked thumbnail.
 */
export async function listFolderThumbnails(): Promise<Map<string, string[]>> {
  const db = await getDatabase();

  // Custom previews (user-selected, up to 3 per folder)
  const customRows = await db.select<Array<{ folder_path: string; thumbnail_url: string }>>(
    `SELECT fp.folder_path, i.thumbnail_url
     FROM folder_previews fp
     JOIN images i ON i.id = fp.image_id AND i.thumbnail_url IS NOT NULL
     ORDER BY fp.folder_path, fp.position`,
  );
  const result = new Map<string, string[]>();
  for (const row of customRows) {
    if (!result.has(row.folder_path)) result.set(row.folder_path, []);
    result.get(row.folder_path)!.push(row.thumbnail_url);
  }

  // Auto-fallback for folders without custom previews
  const autoRows = await db.select<Array<{ folder_path: string; thumbnail_url: string }>>(
    `SELECT folder_path, MIN(thumbnail_url) AS thumbnail_url
     FROM images
     WHERE thumbnail_url IS NOT NULL AND is_archived = 0
     GROUP BY folder_path`,
  );
  for (const row of autoRows) {
    if (!result.has(row.folder_path)) result.set(row.folder_path, [row.thumbnail_url]);
  }

  return result;
}

/** Return the image IDs currently set as folder previews for a given folder, ordered by position. */
export async function listFolderPreviewImageIds(folderPath: string): Promise<string[]> {
  const db = await getDatabase();
  const rows = await db.select<Array<{ image_id: string }>>(
    "SELECT image_id FROM folder_previews WHERE folder_path = $1 ORDER BY position",
    [folderPath],
  );
  return rows.map((r) => r.image_id);
}

/** Add an image as a folder preview (max 3). No-op if already set or folder is at limit. */
export async function addFolderPreview(folderPath: string, imageId: string): Promise<void> {
  const db = await getDatabase();
  const countRows = await db.select<Array<{ cnt: number }>>(
    "SELECT COUNT(*) AS cnt FROM folder_previews WHERE folder_path = $1",
    [folderPath],
  );
  if ((countRows[0]?.cnt ?? 0) >= 3) return;
  const posRows = await db.select<Array<{ maxpos: number | null }>>(
    "SELECT MAX(position) AS maxpos FROM folder_previews WHERE folder_path = $1",
    [folderPath],
  );
  const nextPos = (posRows[0]?.maxpos ?? -1) + 1;
  await db.execute(
    "INSERT OR IGNORE INTO folder_previews (folder_path, image_id, position) VALUES ($1, $2, $3)",
    [folderPath, imageId, nextPos],
  );
}

/** Remove an image from the folder_previews for a given folder. */
export async function removeFolderPreview(folderPath: string, imageId: string): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    "DELETE FROM folder_previews WHERE folder_path = $1 AND image_id = $2",
    [folderPath, imageId],
  );
}

/** Returns posted-image counts grouped by (folder_path, target_id). */
export async function listFolderPostStats(): Promise<Array<{ folderPath: string; targetId: string; postedCount: number }>> {
  const db = await getDatabase();
  const rows = await db.select<Array<{ folder_path: string; target_id: string; posted_count: number }>>(
    `SELECT i.folder_path, pr.target_id, COUNT(DISTINCT pr.image_id) AS posted_count
     FROM post_records pr
     JOIN images i ON i.id = pr.image_id
     WHERE pr.status = 'posted'
     GROUP BY i.folder_path, pr.target_id`,
  );
  return rows.map((r) => ({ folderPath: r.folder_path, targetId: r.target_id, postedCount: r.posted_count }));
}

/** Mark a folder (and all its subfolders) as excluded from the Picker and Library default view. */
export async function excludeFolder(folderPath: string) {
  const db = await getDatabase();
  await db.execute(
    "INSERT OR REPLACE INTO excluded_folders (folder_path, excluded_at) VALUES ($1, $2)",
    [folderPath, new Date().toISOString()],
  );
}

/** Remove a folder from the excluded list. */
export async function includeFolder(folderPath: string) {
  const db = await getDatabase();
  await db.execute("DELETE FROM excluded_folders WHERE folder_path = $1", [folderPath]);
}

/** Returns the set of all currently excluded folder paths. */
export async function listExcludedFolderPaths(): Promise<Set<string>> {
  const db = await getDatabase();
  const rows = await db.select<Array<{ folder_path: string }>>("SELECT folder_path FROM excluded_folders");
  return new Set(rows.map((r) => r.folder_path));
}

/**
 * Returns the IDs of all other images in the same source that share the same
 * filename stem (i.e. the filename without its extension).
 *
 * Example: "blubb.jpg" → finds "blubb.png", "blubb.webp", … in the same source.
 * This allows mark-as-posted/skipped to propagate across format variants so that
 * deleting one variant doesn't silently lose the posted state for the others.
 */
export async function findStemSiblingIds(imageId: string): Promise<string[]> {
  const db = await getDatabase();
  const meta = await db.select<Array<{ source_id: string; stem_id: string | null }>>(
    "SELECT source_id, stem_id FROM images WHERE id = $1 LIMIT 1",
    [imageId],
  );
  if (!meta.length || !meta[0].stem_id) return [];

  const { source_id, stem_id } = meta[0];
  const rows = await db.select<Array<{ id: string }>>(
    "SELECT id FROM images WHERE source_id = $1 AND stem_id = $2 AND id != $3",
    [source_id, stem_id, imageId],
  );
  return rows.map((r) => r.id);
}
