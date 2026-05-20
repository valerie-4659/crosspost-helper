CREATE TABLE IF NOT EXISTS image_sources (
  id TEXT PRIMARY KEY NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('google_drive', 'dropbox', 'local_folder')),
  name TEXT NOT NULL,
  root_path_or_id TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS posting_targets (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('x', 'bluesky', 'deviantart', 'civitai', 'socialdiff', 'custom')),
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS images (
  id TEXT PRIMARY KEY NOT NULL,
  source_id TEXT NOT NULL,
  source_file_id TEXT,
  local_path TEXT,
  filename TEXT NOT NULL,
  folder_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size INTEGER,
  thumbnail_url TEXT,
  web_view_link TEXT,
  created_at TEXT,
  modified_at TEXT,
  indexed_at TEXT NOT NULL,
  perceptual_hash TEXT,
  width INTEGER,
  height INTEGER,
  rating TEXT CHECK (rating IN ('sfw', 'suggestive', 'nsfw', 'unknown')),
  is_archived INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (source_id) REFERENCES image_sources(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS post_records (
  id TEXT PRIMARY KEY NOT NULL,
  image_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('planned', 'posted', 'skipped')),
  posted_at TEXT,
  post_url TEXT,
  caption TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE,
  FOREIGN KEY (target_id) REFERENCES posting_targets(id) ON DELETE CASCADE
);

-- Folders marked as "done" are hidden from the Picker's random pick and from
-- the Library browser by default.  The folder_path is the canonical "/" path
-- as stored in images.folder_path.  Excluding a parent path also excludes all
-- child paths (handled in application code via a LIKE prefix check).
CREATE TABLE IF NOT EXISTS excluded_folders (
  folder_path TEXT PRIMARY KEY NOT NULL,
  excluded_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_images_source_file ON images(source_id, source_file_id) WHERE source_file_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_images_hash ON images(perceptual_hash) WHERE perceptual_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_images_folder ON images(folder_path);
CREATE INDEX IF NOT EXISTS idx_post_records_image_target ON post_records(image_id, target_id);
CREATE INDEX IF NOT EXISTS idx_post_records_target_status ON post_records(target_id, status);
