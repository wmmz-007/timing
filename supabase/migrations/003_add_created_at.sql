-- Run once: adds created_at to events for ordering on home page
ALTER TABLE events ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
