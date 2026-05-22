-- Post Queues: named job queues tied to a posting target network
CREATE TABLE IF NOT EXISTS post_queues (
  id         TEXT PRIMARY KEY NOT NULL,
  name       TEXT NOT NULL,
  target_id  TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (target_id) REFERENCES posting_targets(id) ON DELETE CASCADE
);

-- Queue Slots: ordered slots within a queue, each holding images + optional AI post
CREATE TABLE IF NOT EXISTS queue_slots (
  id             TEXT PRIMARY KEY NOT NULL,
  queue_id       TEXT NOT NULL,
  position       INTEGER NOT NULL,
  image_ids      TEXT NOT NULL DEFAULT '[]',  -- JSON array of image IDs
  ai_title       TEXT,
  ai_description TEXT,
  ai_tags        TEXT,                        -- JSON array of tag strings
  posted         INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  FOREIGN KEY (queue_id) REFERENCES post_queues(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_queue_slots_queue ON queue_slots(queue_id, position);
