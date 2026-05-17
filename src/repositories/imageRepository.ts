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
  if (filters.folderPath) {
    params.push(`%${filters.folderPath}%`);
    conditions.push(`images.folder_path LIKE $${params.length}`);
  }
  if (filters.rating && filters.rating !== "all") {
    params.push(filters.rating);
    conditions.push(`images.rating = $${params.length}`);
  }
  if (!filters.includeArchived) {
    conditions.push("images.is_archived = 0");
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
     ORDER BY COALESCE(images.created_at, images.modified_at, images.indexed_at) DESC
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
       thumbnail_url = $6, web_view_link = $7, created_at = $8, modified_at = $9, indexed_at = $10,
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

export async function setImageArchived(imageId: string, archived: boolean) {
  const db = await getDatabase();
  await db.execute("UPDATE images SET is_archived = $1 WHERE id = $2", [archived ? 1 : 0, imageId]);
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
