-- Migration 006: Writing Personas
-- A persona defines how the AI should "sound" when writing posts:
-- tone, emoji usage, vocabulary / style notes.
-- Only one persona can be active at a time (is_active = 1).

CREATE TABLE IF NOT EXISTS personas (
  id          TEXT PRIMARY KEY NOT NULL,
  name        TEXT NOT NULL,
  tone        TEXT NOT NULL DEFAULT '',       -- e.g. "Flirty, teasing, confident"
  emoji_use   TEXT NOT NULL DEFAULT 'subtle', -- "none" | "subtle" | "heavy"
  style_notes TEXT NOT NULL DEFAULT '',       -- vocabulary, sample phrases, etc.
  is_active   INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);
