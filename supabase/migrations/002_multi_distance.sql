BEGIN;

-- 1. Create event_distances
CREATE TABLE event_distances (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id       uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name           text NOT NULL,
  start_time     timestamptz NOT NULL,
  overall_top_n  int NOT NULL DEFAULT 3 CHECK (overall_top_n > 0),
  default_top_n  int NOT NULL DEFAULT 3 CHECK (default_top_n > 0)
);
CREATE INDEX ON event_distances(event_id);

-- 2. Migrate existing event start_times → distance row named 'ทั้งหมด'
INSERT INTO event_distances (event_id, name, start_time, overall_top_n, default_top_n)
SELECT id, 'ทั้งหมด', start_time, 3, 3 FROM events;

-- 3. Create athletes (ON DELETE RESTRICT so app must delete athletes before distance)
CREATE TABLE athletes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  bib_number    text NOT NULL,
  name          text NOT NULL DEFAULT '',
  distance_id   uuid NOT NULL REFERENCES event_distances(id) ON DELETE RESTRICT,
  gender        text NOT NULL DEFAULT '',
  age_group     text NOT NULL DEFAULT '',
  UNIQUE (event_id, bib_number)
);
CREATE INDEX ON athletes(event_id);
CREATE INDEX ON athletes(distance_id);

-- 4. Create subgroup_prize_overrides
CREATE TABLE subgroup_prize_overrides (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  distance_id  uuid NOT NULL REFERENCES event_distances(id) ON DELETE CASCADE,
  gender       text NOT NULL,
  age_group    text NOT NULL,
  top_n        int NOT NULL CHECK (top_n > 0),
  UNIQUE (distance_id, gender, age_group)
);

-- 5. Add overall_lockout to events; drop start_time (data migrated above)
ALTER TABLE events ADD COLUMN overall_lockout boolean NOT NULL DEFAULT false;
ALTER TABLE events DROP COLUMN start_time;

-- 6. RPC for atomic event + distances creation
CREATE OR REPLACE FUNCTION create_event_with_distances(
  p_name     text,
  p_timezone text,
  p_distances jsonb
) RETURNS events AS $$
DECLARE
  v_event events;
BEGIN
  INSERT INTO events (name, timezone, overall_lockout)
  VALUES (p_name, p_timezone, false)
  RETURNING * INTO v_event;

  INSERT INTO event_distances (event_id, name, start_time, overall_top_n, default_top_n)
  SELECT
    v_event.id,
    d->>'name',
    (d->>'start_time')::timestamptz,
    COALESCE((d->>'overall_top_n')::int, 3),
    COALESCE((d->>'default_top_n')::int, 3)
  FROM jsonb_array_elements(p_distances) d;

  RETURN v_event;
END;
$$ LANGUAGE plpgsql;

COMMIT;
