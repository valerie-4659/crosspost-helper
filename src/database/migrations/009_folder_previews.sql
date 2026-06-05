-- Migration 009: Folder preview images
-- Stores up to 3 user-selected preview images per folder.
-- If no entries exist for a folder, the library falls back to the auto-picked first thumbnail.

CREATE TABLE IF NOT EXISTS folder_previews (
  folder_path  TEXT    NOT NULL,
  image_id     TEXT    NOT NULL,
  position     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (folder_path, image_id)
);
