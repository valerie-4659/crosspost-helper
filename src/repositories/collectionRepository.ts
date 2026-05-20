import { createId, getDatabase, nowIso } from "./database";
import type { Collection, CollectionImage, CollectionInput } from "@/types/collection";

// ── Row types ──────────────────────────────────────────────────────────────

type CollectionRow = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  image_count: number;
};

type CollectionImageRow = {
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
  rating: string | null;
  is_archived: number;
  source_name: string;
  source_type: string;
  post_states: string | null;
  position: number;
  added_at: string;
};

// ── Mappers ───────────────────────────────────────────────────────────────

function mapCollection(row: CollectionRow): Collection {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    imageCount: row.image_count,
  };
}

function mapCollectionImage(row: CollectionImageRow): CollectionImage {
  const postStates = (row.post_states ?? "")
    .split("|")
    .filter(Boolean)
    .reduce<Record<string, "planned" | "posted" | "skipped">>((acc, item) => {
      const [targetId, status] = item.split(":");
      if (targetId && (status === "planned" || status === "posted" || status === "skipped")) {
        acc[targetId] = status;
      }
      return acc;
    }, {});

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
    rating: row.rating as CollectionImage["rating"],
    isArchived: Boolean(row.is_archived),
    sourceName: row.source_name,
    sourceType: row.source_type,
    postStates,
    position: row.position,
    addedAt: row.added_at,
  };
}

// ── Public API ─────────────────────────────────────────────────────────────

export async function listCollections(): Promise<Collection[]> {
  const db = await getDatabase();
  const rows = await db.select<CollectionRow[]>(
    `SELECT c.*, COUNT(ci.image_id) AS image_count
     FROM collections c
     LEFT JOIN collection_images ci ON ci.collection_id = c.id
     GROUP BY c.id
     ORDER BY c.updated_at DESC`,
  );
  return rows.map(mapCollection);
}

export async function getCollection(id: string): Promise<Collection | null> {
  const db = await getDatabase();
  const rows = await db.select<CollectionRow[]>(
    `SELECT c.*, COUNT(ci.image_id) AS image_count
     FROM collections c
     LEFT JOIN collection_images ci ON ci.collection_id = c.id
     WHERE c.id = $1
     GROUP BY c.id`,
    [id],
  );
  return rows[0] ? mapCollection(rows[0]) : null;
}

export async function createCollection(input: CollectionInput): Promise<Collection> {
  const db = await getDatabase();
  const id = createId("col");
  const now = nowIso();
  await db.execute(
    `INSERT INTO collections (id, name, description, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, input.name.trim(), input.description?.trim() ?? null, now, now],
  );
  return { id, name: input.name.trim(), description: input.description?.trim() ?? null, createdAt: now, updatedAt: now, imageCount: 0 };
}

export async function updateCollection(id: string, input: Partial<CollectionInput>): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    `UPDATE collections SET name = COALESCE($1, name), description = COALESCE($2, description), updated_at = $3 WHERE id = $4`,
    [input.name?.trim() ?? null, input.description?.trim() ?? null, nowIso(), id],
  );
}

export async function deleteCollection(id: string): Promise<void> {
  const db = await getDatabase();
  await db.execute("DELETE FROM collections WHERE id = $1", [id]);
}

/** Add images to a collection; images already in the collection are ignored. */
export async function addImagesToCollection(collectionId: string, imageIds: string[]): Promise<void> {
  if (!imageIds.length) return;
  const db = await getDatabase();
  const now = nowIso();
  // Get the current max position so new images are appended at the end.
  const rows = await db.select<Array<{ max_pos: number | null }>>(
    "SELECT MAX(position) AS max_pos FROM collection_images WHERE collection_id = $1",
    [collectionId],
  );
  let pos = (rows[0]?.max_pos ?? -1) + 1;
  for (const imageId of imageIds) {
    await db.execute(
      `INSERT OR IGNORE INTO collection_images (collection_id, image_id, position, added_at)
       VALUES ($1, $2, $3, $4)`,
      [collectionId, imageId, pos++, now],
    );
  }
  await db.execute("UPDATE collections SET updated_at = $1 WHERE id = $2", [now, collectionId]);
}

/** Remove a single image from a collection. */
export async function removeImageFromCollection(collectionId: string, imageId: string): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    "DELETE FROM collection_images WHERE collection_id = $1 AND image_id = $2",
    [collectionId, imageId],
  );
  await db.execute("UPDATE collections SET updated_at = $1 WHERE id = $2", [nowIso(), collectionId]);
}

/** Load all images in a collection, ordered by position. */
export async function listCollectionImages(collectionId: string): Promise<CollectionImage[]> {
  const db = await getDatabase();
  const rows = await db.select<CollectionImageRow[]>(
    `SELECT images.*,
            image_sources.name AS source_name,
            image_sources.type AS source_type,
            GROUP_CONCAT(post_records.target_id || ':' || post_records.status, '|') AS post_states,
            ci.position,
            ci.added_at
     FROM collection_images ci
     JOIN images ON images.id = ci.image_id
     JOIN image_sources ON image_sources.id = images.source_id
     LEFT JOIN post_records ON post_records.image_id = images.id
     WHERE ci.collection_id = $1
     GROUP BY images.id
     ORDER BY ci.position ASC`,
    [collectionId],
  );
  return rows.map(mapCollectionImage);
}
