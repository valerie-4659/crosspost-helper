-- Migration 017: Job queue extra fields
-- ai_instructions: the instructions typed by the user before AI prompt generation
-- local_path: absolute path of the downloaded result file (set after download)

ALTER TABLE job_queue ADD COLUMN ai_instructions TEXT NOT NULL DEFAULT '';
ALTER TABLE job_queue ADD COLUMN local_path TEXT;
