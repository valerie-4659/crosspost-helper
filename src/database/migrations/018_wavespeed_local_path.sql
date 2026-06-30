-- Track where completed Wavespeed videos have been saved locally.
ALTER TABLE wavespeed_jobs ADD COLUMN local_path TEXT;
