import { createId, getDatabase, nowIso } from "./database";
import { findStemSiblingIds } from "./imageRepository";
import type { PostRecord, PostRecordInput, PostRecordStatus, PostHistoryEntry, PostHistoryFilters } from "@/types/postRecord";

type PostRecordRow = {
  id: string;
  image_id: string;
  target_id: string;
  status: PostRecordStatus;
  posted_at: string | null;
  post_url: string | null;
  caption: string | null;
  created_at: string;
  updated_at: string;
};

function mapPostRecord(row: PostRecordRow): PostRecord {
  return {
    id: row.id,
    imageId: row.image_id,
    targetId: row.target_id,
    status: row.status,
    postedAt: row.posted_at,
    postUrl: row.post_url,
    caption: row.caption,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listPostRecordsForImage(imageId: string): Promise<PostRecord[]> {
  const db = await getDatabase();
  const rows = await db.select<PostRecordRow[]>("SELECT * FROM post_records WHERE image_id = $1", [imageId]);
  return rows.map(mapPostRecord);
}

export async function upsertPostRecord(input: PostRecordInput): Promise<PostRecord> {
  const db = await getDatabase();
  const timestamp = nowIso();
  const existing = await db.select<Array<{ id: string; created_at: string }>>(
    "SELECT id, created_at FROM post_records WHERE image_id = $1 AND target_id = $2 LIMIT 1",
    [input.imageId, input.targetId],
  );
  const id = existing[0]?.id ?? createId("post");
  const createdAt = existing[0]?.created_at ?? timestamp;
  const postedAt = input.status === "posted" ? (input.postedAt ?? timestamp) : (input.postedAt ?? null);

  if (existing.length > 0) {
    await db.execute(
      `UPDATE post_records
       SET status = $1, posted_at = $2, post_url = $3, caption = $4, updated_at = $5
       WHERE id = $6`,
      [input.status, postedAt, input.postUrl ?? null, input.caption ?? null, timestamp, id],
    );
  } else {
    await db.execute(
      `INSERT INTO post_records (id, image_id, target_id, status, posted_at, post_url, caption, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [id, input.imageId, input.targetId, input.status, postedAt, input.postUrl ?? null, input.caption ?? null, createdAt, timestamp],
    );
  }

  return {
    id,
    imageId: input.imageId,
    targetId: input.targetId,
    status: input.status,
    postedAt,
    postUrl: input.postUrl ?? null,
    caption: input.caption ?? null,
    createdAt,
    updatedAt: timestamp,
  };
}

/**
 * Mark an image AND all its filename-stem siblings with the given status.
 *
 * A "stem sibling" is any image in the same source whose filename stem
 * (name without extension) is identical.  This ensures that posting
 * "blubb.jpg" also marks "blubb.png" so that deleting one variant does
 * not silently lose the posted state for the remaining variants.
 */
export async function markWithSiblings(
  imageId: string,
  targetId: string,
  status: PostRecordStatus,
  extras?: { postUrl?: string | null; caption?: string | null },
): Promise<void> {
  await upsertPostRecord({ imageId, targetId, status, ...extras });
  const siblings = await findStemSiblingIds(imageId);
  for (const sibId of siblings) {
    await upsertPostRecord({ imageId: sibId, targetId, status, ...extras });
  }
}

// ── Post History ──────────────────────────────────────────────────────────────

type PostHistoryRow = {
  id: string;
  image_id: string;
  target_id: string;
  status: PostRecordStatus;
  posted_at: string | null;
  filename: string;
  local_path: string | null;
  thumbnail_url: string | null;
  target_name: string;
  target_type: string;
};

function mapHistoryEntry(row: PostHistoryRow): PostHistoryEntry {
  return {
    id: row.id,
    imageId: row.image_id,
    targetId: row.target_id,
    status: row.status,
    postedAt: row.posted_at,
    filename: row.filename,
    localPath: row.local_path,
    thumbnailUrl: row.thumbnail_url,
    targetName: row.target_name,
    targetType: row.target_type,
  };
}

export async function getPostHistory(filters: PostHistoryFilters = {}): Promise<PostHistoryEntry[]> {
  const db = await getDatabase();
  const params: unknown[] = ["posted"];
  const conditions = ["pr.status = $1"];

  if (filters.targetType) {
    params.push(filters.targetType);
    conditions.push(`pt.type = $${params.length}`);
  }
  if (filters.targetId) {
    params.push(filters.targetId);
    conditions.push(`pr.target_id = $${params.length}`);
  }
  if (filters.dateFrom) {
    params.push(filters.dateFrom);
    conditions.push(`pr.posted_at >= $${params.length}`);
  }
  if (filters.dateTo) {
    params.push(filters.dateTo);
    conditions.push(`pr.posted_at <= $${params.length}`);
  }

  const where = conditions.join(" AND ");
  const rows = await db.select<PostHistoryRow[]>(
    `SELECT pr.id, pr.image_id, pr.target_id, pr.status, pr.posted_at,
            images.filename, images.local_path, images.thumbnail_url,
            pt.name AS target_name, pt.type AS target_type
     FROM post_records pr
     JOIN images ON images.id = pr.image_id
     JOIN posting_targets pt ON pt.id = pr.target_id
     WHERE ${where}
     ORDER BY pr.posted_at DESC
     LIMIT 500`,
    params,
  );

  return rows.map(mapHistoryEntry);
}
