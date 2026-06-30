-- Migration 014: Fair shuffle per-network round tracking
-- Each image appears once per round per target before repeating.
-- When skipped, the image is recorded as shown this round (Option A).
-- Posted images are permanently excluded via post_records.

CREATE TABLE IF NOT EXISTS pick_rounds (
  target_id   TEXT PRIMARY KEY,
  round       INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS pick_history (
  image_id    TEXT NOT NULL,
  target_id   TEXT NOT NULL,
  round       INTEGER NOT NULL DEFAULT 1,
  picked_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (image_id, target_id)
);
