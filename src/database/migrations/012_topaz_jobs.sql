-- Topaz Labs background upscale job queue
-- Jobs are submitted fire-and-forget; status is updated by the main-process worker.
CREATE TABLE IF NOT EXISTS topaz_jobs (
  id                TEXT PRIMARY KEY NOT NULL,
  image_path        TEXT NOT NULL DEFAULT '',
  original_filename TEXT NOT NULL DEFAULT '',
  model             TEXT NOT NULL DEFAULT 'Standard V2',
  output_format     TEXT NOT NULL DEFAULT 'jpeg',
  status            TEXT NOT NULL DEFAULT 'processing',
  result_path       TEXT,
  error_msg         TEXT,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);
