-- Wavespeed video-generation job queue
-- Persists submitted jobs so status can be tracked across modal/app restarts.
CREATE TABLE IF NOT EXISTS wavespeed_jobs (
  id         TEXT PRIMARY KEY NOT NULL,
  job_id     TEXT NOT NULL,
  image_path TEXT NOT NULL,
  prompt     TEXT NOT NULL DEFAULT '',
  model      TEXT NOT NULL DEFAULT 'wan_2_2_explicit',
  resolution TEXT NOT NULL DEFAULT '720p',
  duration   INTEGER NOT NULL DEFAULT 8,
  status     TEXT NOT NULL DEFAULT 'created',
  video_url  TEXT,
  error_msg  TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
