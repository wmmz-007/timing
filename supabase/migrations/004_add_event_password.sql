-- Add password column to events
ALTER TABLE events ADD COLUMN password TEXT NOT NULL DEFAULT '';

-- Redefine RPC to accept p_password (replaces the version from migration 002)
CREATE OR REPLACE FUNCTION create_event_with_distances(
  p_name      text,
  p_timezone  text,
  p_password  text,
  p_distances jsonb
) RETURNS events AS $$
DECLARE
  v_event events;
BEGIN
  INSERT INTO events (name, timezone, overall_lockout, password)
  VALUES (p_name, p_timezone, false, p_password)
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
