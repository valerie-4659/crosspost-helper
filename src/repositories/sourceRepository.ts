import { createId, getDatabase, nowIso } from "./database";
import type { ImageSource, ImageSourceInput, ImageSourceType } from "@/types/imageSource";

type SourceRow = {
  id: string;
  type: ImageSourceType;
  name: string;
  root_path_or_id: string;
  enabled: number;
  created_at: string;
  updated_at: string;
};

function mapSource(row: SourceRow): ImageSource {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    rootPathOrId: row.root_path_or_id,
    enabled: Boolean(row.enabled),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listSources(): Promise<ImageSource[]> {
  const db = await getDatabase();
  const rows = await db.select<SourceRow[]>("SELECT * FROM image_sources ORDER BY created_at DESC");
  return rows.map(mapSource);
}

export async function createSource(input: ImageSourceInput): Promise<ImageSource> {
  const db = await getDatabase();
  const timestamp = nowIso();
  const source: ImageSource = {
    id: createId("source"),
    type: input.type,
    name: input.name,
    rootPathOrId: input.rootPathOrId,
    enabled: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await db.execute(
    `INSERT INTO image_sources (id, type, name, root_path_or_id, enabled, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [source.id, source.type, source.name, source.rootPathOrId, 1, source.createdAt, source.updatedAt],
  );

  return source;
}

export async function updateSourceEnabled(id: string, enabled: boolean) {
  const db = await getDatabase();
  await db.execute("UPDATE image_sources SET enabled = $1, updated_at = $2 WHERE id = $3", [
    enabled ? 1 : 0,
    nowIso(),
    id,
  ]);
}

export async function deleteSource(id: string) {
  const db = await getDatabase();
  await db.execute("DELETE FROM image_sources WHERE id = $1", [id]);
}
