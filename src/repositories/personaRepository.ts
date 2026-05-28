import { createId, getDatabase } from "./database";
import type { EmojiUse, Persona } from "@/types/aiSettings";

type Row = {
  id: string;
  name: string;
  tone: string;
  emoji_use: string;
  style_notes: string;
  is_active: number;
  created_at: string;
};

function toPersona(r: Row): Persona {
  return {
    id:         r.id,
    name:       r.name,
    tone:       r.tone,
    emojiUse:   (r.emoji_use as EmojiUse) ?? "subtle",
    styleNotes: r.style_notes,
    isActive:   Boolean(r.is_active),
    createdAt:  r.created_at,
  };
}

export async function listPersonas(): Promise<Persona[]> {
  const db = await getDatabase();
  const rows = await db.select<Row[]>(
    "SELECT id, name, tone, emoji_use, style_notes, is_active, created_at FROM personas ORDER BY created_at ASC",
  );
  return rows.map(toPersona);
}

export async function createPersona(data: Omit<Persona, "id" | "createdAt">): Promise<Persona> {
  const db = await getDatabase();
  const id  = createId("persona");
  const now = new Date().toISOString();
  if (data.isActive) {
    await db.execute("UPDATE personas SET is_active = 0");
  }
  await db.execute(
    "INSERT INTO personas (id, name, tone, emoji_use, style_notes, is_active, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)",
    [id, data.name, data.tone, data.emojiUse, data.styleNotes, data.isActive ? 1 : 0, now],
  );
  return { id, ...data, createdAt: now };
}

export async function updatePersona(id: string, data: Partial<Omit<Persona, "id" | "createdAt">>): Promise<void> {
  const db = await getDatabase();
  if (data.isActive) {
    await db.execute("UPDATE personas SET is_active = 0");
  }
  const fields: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  if (data.name       !== undefined) { fields.push(`name = $${i++}`);        params.push(data.name); }
  if (data.tone       !== undefined) { fields.push(`tone = $${i++}`);        params.push(data.tone); }
  if (data.emojiUse   !== undefined) { fields.push(`emoji_use = $${i++}`);   params.push(data.emojiUse); }
  if (data.styleNotes !== undefined) { fields.push(`style_notes = $${i++}`); params.push(data.styleNotes); }
  if (data.isActive   !== undefined) { fields.push(`is_active = $${i++}`);   params.push(data.isActive ? 1 : 0); }
  if (!fields.length) return;
  params.push(id);
  await db.execute(`UPDATE personas SET ${fields.join(", ")} WHERE id = $${i}`, params);
}

export async function deletePersona(id: string): Promise<void> {
  const db = await getDatabase();
  await db.execute("DELETE FROM personas WHERE id = $1", [id]);
}

export async function setActivePersona(id: string | null): Promise<void> {
  const db = await getDatabase();
  await db.execute("UPDATE personas SET is_active = 0");
  if (id) {
    await db.execute("UPDATE personas SET is_active = 1 WHERE id = $1", [id]);
  }
}
