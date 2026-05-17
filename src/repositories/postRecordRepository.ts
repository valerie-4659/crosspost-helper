import { createId, getDatabase, nowIso } from "./database";
import type { PostRecord, PostRecordInput, PostRecordStatus } from "@/types/postRecord";

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
