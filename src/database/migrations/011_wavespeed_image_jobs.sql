-- Wavespeed image-generation job queue
-- Stores jobs submitted to image edit / image-to-image endpoints.
-- result_url holds the generated image URL once completed.
CREATE TABLE IF NOT EXISTS wavespeed_image_jobs (
  id         TEXT PRIMARY KEY NOT NULL,
  job_id     TEXT NOT NULL,
  image_path TEXT NOT NULL DEFAULT '',
  prompt     TEXT NOT NULL DEFAULT '',
  model      TEXT NOT NULL DEFAULT 'flux_2_klein',
  size       TEXT NOT NULL DEFAULT '1024*1024',
  status     TEXT NOT NULL DEFAULT 'created',
  result_url TEXT,
  error_msg  TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
