import { getDatabase, nowIso } from "@/repositories/database";

export interface AppExport {
  exportedAt: string;
  version: 1;
  imageSources: unknown[];
  postingTargets: unknown[];
  images: unknown[];
  postRecords: unknown[];
}

export async function exportJson(): Promise<string> {
  const db = await getDatabase();
  const payload: AppExport = {
    exportedAt: nowIso(),
    version: 1,
    imageSources: await db.select("SELECT * FROM image_sources"),
    postingTargets: await db.select("SELECT * FROM posting_targets"),
    images: await db.select("SELECT * FROM images"),
    postRecords: await db.select("SELECT * FROM post_records"),
  };

  return JSON.stringify(payload, null, 2);
}

export async function importJson(json: string): Promise<{ imported: number }> {
  const db = await getDatabase();
  const payload = JSON.parse(json) as AppExport;
  let imported = 0;

  for (const source of payload.imageSources as Array<Record<string, unknown>>) {
    await db.execute(
      `INSERT OR IGNORE INTO image_sources (id, type, name, root_path_or_id, enabled, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [source.id, source.type, source.name, source.root_path_or_id, source.enabled, source.created_at, source.updated_at],
    );
    imported += 1;
  }
  for (const target of payload.postingTargets as Array<Record<string, unknown>>) {
    await db.execute(
      `INSERT OR IGNORE INTO posting_targets (id, name, type, enabled, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [target.id, target.name, target.type, target.enabled, target.created_at, target.updated_at],
    );
    imported += 1;
  }
  for (const image of payload.images as Array<Record<string, unknown>>) {
    await db.execute(
      `INSERT OR IGNORE INTO images (
        id, source_id, source_file_id, local_path, filename, folder_path, mime_type, file_size,
        thumbnail_url, web_view_link, created_at, modified_at, indexed_at, perceptual_hash, width, height, rating, is_archived
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
      [
        image.id,
        image.source_id,
        image.source_file_id,
        image.local_path,
        image.filename,
        image.folder_path,
        image.mime_type,
        image.file_size,
        image.thumbnail_url,
        image.web_view_link,
        image.created_at,
        image.modified_at,
        image.indexed_at,
        image.perceptual_hash,
        image.width,
        image.height,
        image.rating,
        image.is_archived,
      ],
    );
    imported += 1;
  }
  for (const record of payload.postRecords as Array<Record<string, unknown>>) {
    await db.execute(
      `INSERT OR IGNORE INTO post_records (id, image_id, target_id, status, posted_at, post_url, caption, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        record.id,
        record.image_id,
        record.target_id,
        record.status,
        record.posted_at,
        record.post_url,
        record.caption,
        record.created_at,
        record.updated_at,
      ],
    );
    imported += 1;
  }

  return { imported };
}
