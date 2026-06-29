CREATE TABLE IF NOT EXISTS job_queue (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  type           TEXT    NOT NULL CHECK(type IN ('video', 'image')),
  position       INTEGER NOT NULL DEFAULT 0,
  status         TEXT    NOT NULL DEFAULT 'pending',
  params         TEXT    NOT NULL DEFAULT '{}',
  wavespeed_local_id TEXT,
  result_url     TEXT,
  error_msg      TEXT,
  image_path     TEXT    NOT NULL DEFAULT '',
  prompt         TEXT    NOT NULL DEFAULT '',
  model          TEXT    NOT NULL DEFAULT '',
  created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP
);
