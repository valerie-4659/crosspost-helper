import { createId, getDatabase } from "./database";
import type { Storyline, StoryEntry } from "@/types/aiSettings";

type SLRow = { id: string; name: string; description: string; created_at: string };
type SERow = { id: string; storyline_id: string; image_id: string | null; post_text: string; entry_order: number; created_at: string };

// ── Storylines ────────────────────────────────────────────────────────────────

export async function listStorylines(): Promise<Storyline[]> {
  const db = await getDatabase();
  const rows = await db.select<SLRow[]>(
    "SELECT id, name, description, created_at FROM storylines ORDER BY created_at ASC",
  );
  return rows.map((r) => ({ id: r.id, name: r.name, description: r.description, createdAt: r.created_at }));
}

export async function createStoryline(name: string, description: string): Promise<Storyline> {
  const db = await getDatabase();
  const id  = createId("sl");
  const now = new Date().toISOString();
  await db.execute(
    "INSERT INTO storylines (id, name, description, created_at) VALUES ($1,$2,$3,$4)",
    [id, name, description, now],
  );
  return { id, name, description, createdAt: now };
}

export async function updateStoryline(id: string, name: string, description: string): Promise<void> {
  const db = await getDatabase();
  await db.execute("UPDATE storylines SET name=$1, description=$2 WHERE id=$3", [name, description, id]);
}

export async function deleteStoryline(id: string): Promise<void> {
  const db = await getDatabase();
  await db.execute("DELETE FROM storylines WHERE id=$1", [id]);
}

// ── Story Entries ─────────────────────────────────────────────────────────────

export async function listStoryEntries(storylineId: string): Promise<StoryEntry[]> {
  const db = await getDatabase();
  const rows = await db.select<SERow[]>(
    "SELECT id, storyline_id, image_id, post_text, entry_order, created_at FROM story_entries WHERE storyline_id=$1 ORDER BY entry_order ASC",
    [storylineId],
  );
  return rows.map((r) => ({
    id:          r.id,
    storylineId: r.storyline_id,
    imageId:     r.image_id,
    postText:    r.post_text,
    entryOrder:  r.entry_order,
    createdAt:   r.created_at,
  }));
}

export async function addStoryEntry(storylineId: string, postText: string, imageId?: string): Promise<StoryEntry> {
  const db  = await getDatabase();
  const id  = createId("se");
  const now = new Date().toISOString();
  const orderRows = await db.select<Array<{ maxOrd: number | null }>>(
    "SELECT MAX(entry_order) AS maxOrd FROM story_entries WHERE storyline_id=$1",
    [storylineId],
  );
  const nextOrder = (orderRows[0]?.maxOrd ?? -1) + 1;
  await db.execute(
    "INSERT INTO story_entries (id, storyline_id, image_id, post_text, entry_order, created_at) VALUES ($1,$2,$3,$4,$5,$6)",
    [id, storylineId, imageId ?? null, postText, nextOrder, now],
  );
  return { id, storylineId, imageId: imageId ?? null, postText, entryOrder: nextOrder, createdAt: now };
}

export async function deleteStoryEntry(id: string): Promise<void> {
  const db = await getDatabase();
  await db.execute("DELETE FROM story_entries WHERE id=$1", [id]);
}
