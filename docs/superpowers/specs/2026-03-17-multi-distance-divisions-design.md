# Multi-Distance + Divisions Design Spec
**Date:** 2026-03-17
**Status:** Approved

---

## Overview

Extend the timing app to support multi-distance events where each distance has its own start time, athletes are mapped to distances and age divisions via CSV import, and results show both overall and division placements with configurable prize rules.

---

## Problem Statement

The current data model has a single `start_time` per event, which makes net time calculation incorrect when multiple distances run on the same day with different gun times. Additionally, there is no concept of divisions (age groups) or overall/division prize eligibility rules.

---

## Data Model

### Changes to `events` table

```sql
ALTER TABLE events ADD COLUMN overall_lockout boolean NOT NULL DEFAULT false;
ALTER TABLE events DROP COLUMN start_time;
-- start_time moves to event_distances; see migration for data migration order
```

---

### New table: `event_distances`

```sql
CREATE TABLE event_distances (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id       uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name           text NOT NULL,
  start_time     timestamptz NOT NULL,
  overall_top_n  int NOT NULL DEFAULT 3,
  default_top_n  int NOT NULL DEFAULT 3
);
CREATE INDEX ON event_distances(event_id);
```

**`overall_top_n` is applied per `(distance, gender)` group.** A value of 3 means: top 3 Male and top 3 Female are ranked as overall within that distance — as two separate gender groups. There is no cross-gender or cross-distance overall ranking.

---

### New table: `athletes`

```sql
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
```

**`ON DELETE RESTRICT`:** The database rejects deleting an `event_distances` row if any athlete references it. The application deletes athletes first, then the distance.

---

### New table: `subgroup_prize_overrides`

```sql
CREATE TABLE subgroup_prize_overrides (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  distance_id  uuid NOT NULL REFERENCES event_distances(id) ON DELETE CASCADE,
  gender       text NOT NULL,
  age_group    text NOT NULL,
  top_n        int NOT NULL,
  UNIQUE (distance_id, gender, age_group)
);
```

Clearing a subgroup override input **deletes** the corresponding row; `event_distances.default_top_n` then applies.

---

## Migration (`002_multi_distance.sql`)

A single file. **Not idempotent — run exactly once.** The RPC is included at the end of this same file (no separate migration file).

```sql
BEGIN;

-- 1. Create event_distances
CREATE TABLE event_distances (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id       uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name           text NOT NULL,
  start_time     timestamptz NOT NULL,
  overall_top_n  int NOT NULL DEFAULT 3,
  default_top_n  int NOT NULL DEFAULT 3
);
CREATE INDEX ON event_distances(event_id);

-- 2. Migrate existing event start_times into distance rows named 'ทั้งหมด'
INSERT INTO event_distances (event_id, name, start_time, overall_top_n, default_top_n)
SELECT id, 'ทั้งหมด', start_time, 3, 3 FROM events;

-- 3. Create athletes
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
  top_n        int NOT NULL,
  UNIQUE (distance_id, gender, age_group)
);

-- 5. Add overall_lockout; drop start_time (data migrated in step 2)
ALTER TABLE events ADD COLUMN overall_lockout boolean NOT NULL DEFAULT false;
ALTER TABLE events DROP COLUMN start_time;

-- 6. RPC for atomic event + distances creation
CREATE OR REPLACE FUNCTION create_event_with_distances(
  p_name     text,
  p_timezone text,
  p_distances jsonb  -- [{name, start_time, overall_top_n, default_top_n}]
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
```

---

## Offline Caching Strategy

`lib/storage.ts` gains:

```
timing:distances:{eventId}   → EventDistance[]
timing:athletes:{eventId}    → Athlete[]
```

**Read path:**
- Capture page: fetch from Supabase on mount → write cache; if offline, read from cache.
- Results page: same.
- Settings page: fetch from Supabase on mount → write cache; if offline, read from cache and show offline banner. Re-import is blocked while offline (requires network to write to Supabase). Editing distance names/times is also blocked while offline.

**Cold cache (first offline visit):** Capture works — bibs recorded normally. Net time not computed (distances empty). No error shown.

**Cache invalidation:**
- After CSV import: write updated athletes to `timing:athletes:{eventId}`.
- After distance edit: write updated distances to `timing:distances:{eventId}`.
- Capture and results pages listen to `visibilitychange` — on regaining focus they re-read both caches.

**Stale `timing:event:{eventId}` cache:** Existing cached `Event` objects may have a `start_time` field from before the migration. On first online load after deploy, `getEvent(id)` fetches the updated event from Supabase and overwrites the cache. Any code that previously read `event.start_time` must be updated to not access that field (it no longer exists on the type).

---

## Components Affected

| Component / File | Change |
|---|---|
| `supabase/migrations/002_multi_distance.sql` | Full migration + RPC (single file) |
| `types/index.ts` | Add `EventDistance`, `Athlete`, `SubgroupPrizeOverride`; update `Event`: remove `start_time`, add `overall_lockout` |
| `lib/db.ts` | Replace `createEvent` with `create_event_with_distances` RPC call; add CRUD for distances, athletes, overrides |
| `lib/storage.ts` | Add `saveDistances`, `getDistances`, `saveAthletes`, `getAthletes`; update `saveEvent`/`getEventById` to strip any legacy `start_time` field on read |
| `lib/time.ts` | Add `getDistanceStartTime(bib, athletes, distances): string \| null` |
| `lib/ranking.ts` | **New**: `computeRanks(records, athletes, distances, overrides, overallLockout): RankMap` |
| `lib/export.ts` | Remove `event.start_time` usage; new signature: `generateCsv(records, event, athletes, distances, rankMap)` |
| `components/EventSetupForm.tsx` | Remove standalone time picker; add `DistanceList` section (each row has name + time); call RPC on submit |
| `components/DistanceList.tsx` | **New**: edit/add/remove distance rows (name + start_time per row) |
| `components/AthleteImport.tsx` | **New**: CSV import UI |
| `components/PrizeConfig.tsx` | **New**: lockout toggle + per-distance top N + subgroup overrides |
| `components/ResultsTable.tsx` | Remove `event.start_time` usage; accept `athletes`, `distances`, `rankMap` props; add filter bar + Overall + Division columns |
| `app/event/[id]/page.tsx` | Add "ตั้งค่า" settings link |
| `app/event/[id]/settings/page.tsx` | **New page**: fetch distances + athletes on mount; 3 sections |
| `app/event/[id]/results/page.tsx` | Fetch athletes, distances, overrides; call `computeRanks`; `visibilitychange` refresh; pass all to `ResultsTable` |
| `app/event/[id]/capture/page.tsx` | Fetch/cache athletes + distances; `visibilitychange` refresh; pass to net time helper |
| `app/event/[id]/export/page.tsx` | Remove `event.start_time` usage; fetch athletes + distances; call `computeRanks`; pass `rankMap` to `generateCsv` |

---

## Feature: Event Setup Form (Creation)

`EventSetupForm` changes:
- The existing `date` picker is kept (sets the calendar date for distance start times).
- The existing standalone `time` picker is **removed** — times now come from the `DistanceList` rows.
- A "ระยะและเวลาปล่อยตัว" section is added using `DistanceList`.
  - Each row: distance name input + start time input (pre-filled with date from the date picker).
  - "+ เพิ่มระยะ" adds a row; × removes; minimum 1.
- On submit: calls `create_event_with_distances` RPC — atomic; no partial state.

---

## Feature: Settings Page `/event/[id]/settings`

Fetches distances and athletes from Supabase on mount; reads from LocalStorage if offline.

If offline: show banner "ไม่มีการเชื่อมต่อ — แก้ไขได้เมื่อออนไลน์". Distance edits and CSV import are disabled while offline.

### Section 1 — ระยะและเวลา

`DistanceList` component. PATCH per row on change. Delete with athletes: confirmation dialog → app deletes athletes (by distance_id) first, then distance.

If any distance name equals `'ทั้งหมด'`: banner "กรุณาตั้งชื่อระยะก่อน import นักกีฬา". CSV import (Section 2) is blocked until renamed.

### Section 2 — นักกีฬา (CSV Import)

1. File picker: `.csv` only
2. Parse headers client-side; show first 5 rows preview
3. Column-mapping dropdowns: `bib_number` (**required**), `distance` (**required**), `name` (optional), `gender` (optional), `age_group` (optional)
4. If `bib_number` or `distance` unmappable: confirm disabled + error
5. Empty or header-only file: "ไฟล์ไม่มีข้อมูล" — blocked
6. Unmatched distance values: rows highlighted, skipped on import
7. Duplicate bib in CSV: last row wins
8. On confirm: DELETE all athletes for event → batch INSERT → update LocalStorage caches
9. Summary: "นำเข้า N คน, ข้าม M แถว"

### Section 3 — รางวัล

- Toggle: `overall_lockout`
- Per distance: `overall_top_n` (applied per gender group) and `default_top_n`
- "ดูทั้งหมด" expander: distinct `(gender, age_group)` combinations from athletes
  - No athletes imported yet: "กรุณา import นักกีฬาก่อน"
- Clearing override deletes the `subgroup_prize_overrides` row

---

## Feature: Net Time Calculation (`lib/time.ts`)

```ts
function getDistanceStartTime(
  bib: string,
  athletes: Athlete[],
  distances: EventDistance[]
): string | null
```

**Return value:**
- Bib found in athletes → return `athletes[bib].distance.start_time`
- Bib not found, distances non-empty → return `distances.sort by getTime() ASC [0].start_time` (earliest distance as best-effort fallback)
- Bib not found, distances empty → return `null`

The fallback logic lives **inside** `getDistanceStartTime`. Callers do not implement their own fallback. When the return value is `null`, net time is not displayed — no error shown.

---

## Feature: Ranking (`lib/ranking.ts`)

```ts
type RankEntry = { overallRank: number | null; divisionRank: number | null }
type RankMap = Map<string, RankEntry>   // key = bib_number

function computeRanks(
  records: FinishRecord[],               // synced Supabase records only
  athletes: Athlete[],
  distances: EventDistance[],
  overrides: SubgroupPrizeOverride[],    // for per-subgroup top_n resolution
  overallLockout: boolean
): RankMap
```

**Input note:** `computeRanks` receives `FinishRecord[]` from Supabase — pending (unsynced) records are not included in ranking. Results and export pages rank synced data only.

**Join logic:**
1. `athleteByBib = new Map(athletes.map(a => [a.bib_number, a]))`
2. `distanceById = new Map(distances.map(d => [d.id, d]))`
3. For each `FinishRecord`: look up athlete and distance; skip if not found.
4. `netMs = new Date(record.finish_time).getTime() - new Date(distance.start_time).getTime()`

**Overall rank (per `(distance.id, gender)` group):**
- Sort by `netMs ASC`; secondary: `new Date(record.created_at).getTime() ASC`
- Assign `overallRank` 1…`overall_top_n` using standard competition ranking (ties share rank, next skips)
- `overall_top_n` is applied independently within each gender group

**Division rank:**
- If `overallLockout`: remove athletes with non-null `overallRank` from each `(distance.id, gender, age_group)` pool
- Sort remaining by `netMs ASC`; same secondary sort
- Resolve `top_n`: `subgroup_prize_overrides` row if exists, else `distance.default_top_n`
- Assign `divisionRank` with same ranking rules

**Callers:** Results page and export page both call `computeRanks` themselves and pass the resulting `rankMap` downstream. `generateCsv` receives a pre-computed `rankMap` — it does not call `computeRanks` internally.

---

## Feature: Results Screen

`app/event/[id]/results/page.tsx`:
- Fetches `athletes` + `distances` from Supabase on mount (LocalStorage fallback)
- Fetches `overrides` (subgroup_prize_overrides) from Supabase on mount
- Calls `computeRanks(records, athletes, distances, overrides, event.overall_lockout)`
- Passes `athletes`, `distances`, `rankMap` as props to `ResultsTable`
- `visibilitychange` → re-read athletes + distances from LocalStorage

`ResultsTable`:
- Filter bar: distance (all | names) + gender (all | distinct values from athletes)
- Columns: bib, name, distance, finish_time, net_time, **Overall**, **Division**
- Ranks computed on full unfiltered dataset; filter hides rows only
- Overall is always scoped to a single `(distance, gender)` group

---

## Feature: CSV Export

`app/event/[id]/export/page.tsx`: fetch athletes + distances + overrides → call `computeRanks` → pass `rankMap` to `generateCsv`.

**CSV filename:** `export/page.tsx` currently builds the filename from `event.start_time`. After that field is removed, use the earliest distance `start_time` instead: `distances.sort by getTime() ASC [0].start_time.slice(0, 10)` (ISO date prefix). If distances is empty, fall back to today's date.

```ts
function generateCsv(
  records: FinishRecord[],
  event: Event,
  athletes: Athlete[],
  distances: EventDistance[],
  rankMap: RankMap
): string
```

Columns: `bib, name, distance, gender, age_group, finish_time, net_time, overall_rank, division_rank`

Athletes not in `athletes` table: blank name/distance/gender/age_group, blank ranks.

---

## Edge Cases

| Case | Behaviour |
|---|---|
| Bib captured but not in athletes | Finish time recorded; net time uses earliest distance `start_time` (by `getTime()`); ranks blank |
| CSV import unmatched distance name | Row highlighted in preview, skipped, counted in summary |
| CSV empty or header-only | "ไฟล์ไม่มีข้อมูล" — blocked |
| Required column unmappable | Confirm button disabled |
| Distance named `'ทั้งหมด'` (migrated) | CSV import blocked; banner prompts rename |
| Duplicate bib in CSV | Last row wins |
| Distance deleted that has athletes | App deletes athletes first (DB enforces RESTRICT); dialog required |
| `overall_lockout = true` | Division pool excludes overall ranked athletes; next eligible moves up |
| Subgroup fewer than top_n | All finishers ranked; no padding |
| Equal net time | Same rank; secondary key = `created_at ASC`; next rank skips |
| `event_distances` insert fails on creation | RPC rolls back atomically |
| Filter in Results | Ranks on full dataset; filter hides rows only |
| Capture open while Settings imports | `visibilitychange` on refocus refreshes caches |
| Cold cache offline | Capture works; net time not shown; no error |
| PrizeConfig before athletes imported | Subgroup expander shows empty state |
| Settings opened offline | Offline banner; edits + import disabled |
| Pending records at rank time | Not included in `computeRanks`; only synced `FinishRecord[]` ranked |
| Stale `timing:event:{eventId}` cache | `saveEvent`/`getEventById` strips `start_time` field on read to prevent stale access |
