-- Collections: named, persistent sets of images picked from any folder.
-- Images from different folders can be grouped into one collection
-- and used as a queue source for any posting network.

CREATE TABLE IF NOT EXISTS collections (
  id          TEXT PRIMARY KEY NOT NULL,
  name        TEXT NOT NULL,
  description TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

-- Junction table: which images belong to which collection, in what order.
CREATE TABLE IF NOT EXISTS collection_images (
  collection_id TEXT    NOT NULL,
  image_id      TEXT    NOT NULL,
  position      INTEGER NOT NULL DEFAULT 0,
  added_at      TEXT    NOT NULL,
  PRIMARY KEY (collection_id, image_id),
  FOREIGN KEY (collection_id) REFERENCES collections(id)  ON DELETE CASCADE,
  FOREIGN KEY (image_id)      REFERENCES images(id)        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_collection_images_collection ON collection_images(collection_id, position);
