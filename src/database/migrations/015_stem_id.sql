-- Migration 015: Stable image identity via stem_id
-- stem_id = full path without file extension (e.g. /folder/my_art for both .png and .jpg).
-- Used as the upsert key so that format conversions (PNG→JPG) and minor path
-- changes do not create orphaned post_records.

ALTER TABLE images ADD COLUMN stem_id TEXT;

CREATE INDEX IF NOT EXISTS idx_images_stem ON images(source_id, stem_id) WHERE stem_id IS NOT NULL;
