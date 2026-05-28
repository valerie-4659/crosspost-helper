-- Storylines: named narrative series that share context across story posts
CREATE TABLE IF NOT EXISTS storylines (
  id          TEXT PRIMARY KEY NOT NULL,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL
);

-- Story entries: individual story-post fragments belonging to a storyline
-- Used to build narrative context for subsequent AI generations.
CREATE TABLE IF NOT EXISTS story_entries (
  id           TEXT PRIMARY KEY NOT NULL,
  storyline_id TEXT NOT NULL,
  image_id     TEXT,
  post_text    TEXT NOT NULL DEFAULT '',
  entry_order  INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL,
  FOREIGN KEY (storyline_id) REFERENCES storylines(id) ON DELETE CASCADE
);
