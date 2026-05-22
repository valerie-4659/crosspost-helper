import { createId, getDatabase, nowIso } from "./database";
import type { PostQueue, QueueSlot, SlotImageData } from "@/types/queue";

// ── Row types ──────────────────────────────────────────────────────────────────
type QueueRow = {
  id: string; name: string; target_id: string;
  target_name: string; target_type: string;
  slot_count: number; pending_count: number;
  created_at: string; updated_at: string;
};
type SlotRow = {
  id: string; queue_id: string; position: number;
  image_ids: string; ai_title: string | null;
  ai_description: string | null; ai_tags: string | null;
  posted: number; created_at: string; updated_at: string;
};

// ── Mappers ────────────────────────────────────────────────────────────────────
function mapQueue(r: QueueRow): PostQueue {
  return {
    id: r.id, name: r.name, targetId: r.target_id,
    targetName: r.target_name, targetType: r.target_type,
    slotCount: r.slot_count, pendingCount: r.pending_count,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}
function mapSlot(r: SlotRow): QueueSlot {
  return {
    id: r.id, queueId: r.queue_id, position: r.position,
    imageIds: JSON.parse(r.image_ids || "[]"),
    aiTitle: r.ai_title, aiDescription: r.ai_description,
    aiTags: r.ai_tags ? JSON.parse(r.ai_tags) : null,
    posted: !!r.posted,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

// ── Queue CRUD ─────────────────────────────────────────────────────────────────
export async function listQueues(): Promise<PostQueue[]> {
  const db = await getDatabase();
  const rows = await db.select<QueueRow[]>(`
    SELECT pq.*, pt.name AS target_name, pt.type AS target_type,
      COUNT(qs.id) AS slot_count,
      SUM(CASE WHEN qs.posted = 0 THEN 1 ELSE 0 END) AS pending_count
    FROM post_queues pq
    JOIN posting_targets pt ON pt.id = pq.target_id
    LEFT JOIN queue_slots qs ON qs.queue_id = pq.id
    GROUP BY pq.id
    ORDER BY pq.created_at ASC
  `);
  return rows.map(mapQueue);
}

export async function createQueue(name: string, targetId: string): Promise<PostQueue> {
  const db = await getDatabase();
  const id = createId("pq");
  const now = nowIso();
  await db.execute(
    `INSERT INTO post_queues (id, name, target_id, created_at, updated_at) VALUES ($1,$2,$3,$4,$5)`,
    [id, name, targetId, now, now],
  );
  const rows = await db.select<QueueRow[]>(`
    SELECT pq.*, pt.name AS target_name, pt.type AS target_type,
      0 AS slot_count, 0 AS pending_count
    FROM post_queues pq JOIN posting_targets pt ON pt.id = pq.target_id WHERE pq.id = $1
  `, [id]);
  return mapQueue(rows[0]);
}

export async function deleteQueue(id: string): Promise<void> {
  const db = await getDatabase();
  await db.execute(`DELETE FROM post_queues WHERE id = $1`, [id]);
}

// ── Slot CRUD ──────────────────────────────────────────────────────────────────
export async function listSlots(queueId: string): Promise<QueueSlot[]> {
  const db = await getDatabase();
  const rows = await db.select<SlotRow[]>(
    `SELECT * FROM queue_slots WHERE queue_id = $1 ORDER BY position ASC`,
    [queueId],
  );
  return rows.map(mapSlot);
}

export async function createSlot(queueId: string, position: number): Promise<QueueSlot> {
  const db = await getDatabase();
  const id = createId("qs");
  const now = nowIso();
  await db.execute(
    `INSERT INTO queue_slots (id, queue_id, position, image_ids, posted, created_at, updated_at)
     VALUES ($1,$2,$3,'[]',0,$4,$5)`,
    [id, queueId, position, now, now],
  );
  const rows = await db.select<SlotRow[]>(`SELECT * FROM queue_slots WHERE id = $1`, [id]);
  return mapSlot(rows[0]);
}

export async function updateSlotImages(slotId: string, imageIds: string[]): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    `UPDATE queue_slots SET image_ids = $1, updated_at = $2 WHERE id = $3`,
    [JSON.stringify(imageIds), nowIso(), slotId],
  );
}

/**
 * Assign imageIds to a slot and remove those same IDs from every other slot
 * in the same queue — an image can only live in one slot at a time.
 * Returns a map of slotId → new imageIds for every slot that was modified.
 */
export async function setSlotImagesExclusive(
  slotId: string,
  imageIds: string[],
): Promise<Record<string, string[]>> {
  const db = await getDatabase();
  const now = nowIso();
  const changed: Record<string, string[]> = {};

  // Resolve queue for this slot
  const meta = await db.select<{ queue_id: string }[]>(
    `SELECT queue_id FROM queue_slots WHERE id = $1`, [slotId],
  );
  if (!meta.length) return changed;
  const queueId = meta[0].queue_id;

  // Remove incoming imageIds from all OTHER slots in the same queue
  const imageIdSet = new Set(imageIds);
  const others = await db.select<{ id: string; image_ids: string }[]>(
    `SELECT id, image_ids FROM queue_slots WHERE queue_id = $1 AND id != $2`,
    [queueId, slotId],
  );
  for (const other of others) {
    const existing: string[] = JSON.parse(other.image_ids || "[]");
    const filtered = existing.filter((id) => !imageIdSet.has(id));
    if (filtered.length !== existing.length) {
      await db.execute(
        `UPDATE queue_slots SET image_ids = $1, updated_at = $2 WHERE id = $3`,
        [JSON.stringify(filtered), now, other.id],
      );
      changed[other.id] = filtered;
    }
  }

  // Assign to target slot
  await db.execute(
    `UPDATE queue_slots SET image_ids = $1, updated_at = $2 WHERE id = $3`,
    [JSON.stringify(imageIds), now, slotId],
  );
  changed[slotId] = imageIds;
  return changed;
}

export async function updateSlotAi(
  slotId: string,
  title: string, description: string, tags: string[],
): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    `UPDATE queue_slots SET ai_title=$1, ai_description=$2, ai_tags=$3, updated_at=$4 WHERE id=$5`,
    [title, description, JSON.stringify(tags), nowIso(), slotId],
  );
}

export async function reorderSlots(orderedIds: string[]): Promise<void> {
  const db = await getDatabase();
  for (let i = 0; i < orderedIds.length; i++) {
    await db.execute(`UPDATE queue_slots SET position=$1, updated_at=$2 WHERE id=$3`,
      [i, nowIso(), orderedIds[i]]);
  }
}

export async function deleteSlot(id: string): Promise<void> {
  const db = await getDatabase();
  await db.execute(`DELETE FROM queue_slots WHERE id = $1`, [id]);
}

export async function markSlotPosted(id: string): Promise<void> {
  const db = await getDatabase();
  await db.execute(`UPDATE queue_slots SET posted=1, updated_at=$1 WHERE id=$2`, [nowIso(), id]);
}

// ── Image data for slots ───────────────────────────────────────────────────────
export async function getSlotImageData(imageIds: string[]): Promise<SlotImageData[]> {
  if (!imageIds.length) return [];
  const db = await getDatabase();
  const placeholders = imageIds.map((_, i) => `$${i + 1}`).join(", ");
  type Row = { id: string; filename: string; thumbnail_url: string | null; local_path: string | null };
  const rows = await db.select<Row[]>(
    `SELECT id, filename, thumbnail_url, local_path FROM images WHERE id IN (${placeholders})`,
    imageIds,
  );
  return rows.map((r) => ({
    id: r.id, filename: r.filename, thumbnailUrl: r.thumbnail_url, localPath: r.local_path,
  }));
}
