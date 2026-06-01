-- Migration 008: Persistent picker cooldown
-- Tracks a monotonically-increasing pick counter and per-image cooldown thresholds.
-- When an image is skipped, cooldown_until is set to (total_picks + 40% of pool size).
-- The image is excluded from random picks until total_picks reaches cooldown_until.

CREATE TABLE IF NOT EXISTS picker_state (
  key   TEXT PRIMARY KEY NOT NULL,
  value INTEGER NOT NULL DEFAULT 0
);

-- Seed the pick counter (INSERT OR IGNORE so it's safe to re-run)
INSERT OR IGNORE INTO picker_state (key, value) VALUES ('total_picks', 0);

CREATE TABLE IF NOT EXISTS picker_cooldowns (
  image_id        TEXT PRIMARY KEY NOT NULL,
  cooldown_until  INTEGER NOT NULL,
  skipped_at      TEXT NOT NULL
);
