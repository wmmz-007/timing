# Multi-Distance + Divisions Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the timing app to support multi-distance events with per-distance start times, CSV athlete import, and division/overall prize rankings.

**Architecture:** Add three new Supabase tables (`event_distances`, `athletes`, `subgroup_prize_overrides`) via a single migration file that also includes an atomic Postgres RPC for event creation. A new `lib/ranking.ts` pure-function module computes all ranks and is shared by the results and export pages. `Event.start_time` is made optional immediately (to avoid a hard breaking change) and removed in the final cleanup task after all consumers are updated.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind v4, Supabase (Postgres + RPC), Vitest + @testing-library/react, papaparse (CSV parsing)

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `supabase/migrations/002_multi_distance.sql` | Create | DB schema + RPC |
| `types/index.ts` | Modify | Add new types; make `Event.start_time` optional; add `overall_lockout` |
| `lib/storage.ts` | Modify | Add `saveDistances`, `getDistances`, `saveAthletes`, `getAthletes`; strip stale `start_time` on `getEventById` |
| `lib/db.ts` | Modify | Add `createEventWithDistances` RPC call + CRUD for distances, athletes, overrides |
| `lib/time.ts` | Modify | Add `getDistanceStartTime` |
| `lib/ranking.ts` | Create | `computeRanks` pure function |
| `lib/export.ts` | Modify | New signature + columns |
| `components/DistanceList.tsx` | Create | Reusable distance row editor |
| `components/EventSetupForm.tsx` | Modify | Replace time picker with `DistanceList`; call `createEventWithDistances` |
| `components/AthleteImport.tsx` | Create | CSV file picker + column mapping + import |
| `components/PrizeConfig.tsx` | Create | Lock-out toggle + per-distance top N + subgroup overrides |
| `components/ResultsTable.tsx` | Modify | Add filter bar + Overall + Division columns; remove `event.start_time` |
| `components/CaptureScreen.tsx` | Modify | Remove `event.start_time` display; add distances display |
| `app/event/[id]/page.tsx` | Modify | Add Settings link |
| `app/event/[id]/settings/page.tsx` | Create | Settings page with 3 sections |
| `app/event/[id]/capture/page.tsx` | Modify | Load athletes + distances; `visibilitychange` refresh |
| `app/event/[id]/results/page.tsx` | Modify | Fetch athletes + distances + overrides; call `computeRanks` |
| `app/event/[id]/export/page.tsx` | Modify | Fetch athletes + distances + overrides; call `computeRanks`; remove `start_time` usage |
| `__tests__/time.test.ts` | Modify | Add `getDistanceStartTime` tests |
| `__tests__/ranking.test.ts` | Create | `computeRanks` tests |
| `__tests__/storage.test.ts` | Modify | Add new cache function tests; fix stale `start_time` test |
| `__tests__/db.test.ts` | Modify | Replace `createEvent` test with `createEventWithDistances` test |
| `__tests__/export.test.ts` | Modify | Update for new `generateCsv` signature |

---

## Task 1: Types + Migration SQL

**Files:**
- Modify: `types/index.ts`
- Create: `supabase/migrations/002_multi_distance.sql`

- [ ] **Step 1: Write failing test for new types**

```ts
// __tests__/types.test.ts
import { describe, it, expectTypeOf } from 'vitest'
import type { Event, EventDistance, Athlete, SubgroupPrizeOverride } from '@/types'

describe('EventDistance type', () => {
  it('has required fields', () => {
    expectTypeOf<EventDistance>().toHaveProperty('id')
    expectTypeOf<EventDistance>().toHaveProperty('event_id')
    expectTypeOf<EventDistance>().toHaveProperty('name')
    expectTypeOf<EventDistance>().toHaveProperty('start_time')
    expectTypeOf<EventDistance>().toHaveProperty('overall_top_n')
    expectTypeOf<EventDistance>().toHaveProperty('default_top_n')
  })
})

describe('Athlete type', () => {
  it('has required fields', () => {
    expectTypeOf<Athlete>().toHaveProperty('id')
    expectTypeOf<Athlete>().toHaveProperty('event_id')
    expectTypeOf<Athlete>().toHaveProperty('bib_number')
    expectTypeOf<Athlete>().toHaveProperty('distance_id')
    expectTypeOf<Athlete>().toHaveProperty('gender')
    expectTypeOf<Athlete>().toHaveProperty('age_group')
  })
})

describe('Event.start_time', () => {
  it('is optional', () => {
    expectTypeOf<Event['start_time']>().toEqualTypeOf<string | undefined>()
  })
  it('has overall_lockout', () => {
    expectTypeOf<Event>().toHaveProperty('overall_lockout')
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd /Users/wichita.pum/Desktop/entrepreneur/Timing
npx vitest run __tests__/types.test.ts
```

Expected: FAIL (types don't exist yet)

- [ ] **Step 3: Update `types/index.ts`**

```ts
export interface Event {
  id: string
  name: string
  start_time?: string   // deprecated — use event_distances.start_time; removed in cleanup task
  timezone: string
  overall_lockout: boolean
}

export interface EventDistance {
  id: string
  event_id: string
  name: string
  start_time: string    // ISO 8601 timestamptz
  overall_top_n: number
  default_top_n: number
}

export interface Athlete {
  id: string
  event_id: string
  bib_number: string
  name: string
  distance_id: string
  gender: string
  age_group: string
}

export interface SubgroupPrizeOverride {
  id: string
  distance_id: string
  gender: string
  age_group: string
  top_n: number
}

export interface FinishRecord {
  id: string
  event_id: string
  bib_number: string
  finish_time: string
  created_at: string
}

export interface PendingRecord {
  local_id: string
  event_id: string
  bib_number: string
  finish_time: string
  synced: boolean
}

export interface SyncConflict {
  bib_number: string
  kept_finish_time: string
  discarded_finish_time: string
  resolved_at: string
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
npx vitest run __tests__/types.test.ts
```

Expected: PASS

- [ ] **Step 5: Write migration SQL**

Create `supabase/migrations/002_multi_distance.sql`:

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
  top_n        int NOT NULL,
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
```

**Note:** Run this in Supabase SQL Editor (Dashboard → SQL Editor → New query → paste → Run). This is a one-time, non-idempotent migration.

- [ ] **Step 6: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: no new type errors (start_time is now optional so existing code still compiles)

- [ ] **Step 7: Commit**

```bash
git add types/index.ts supabase/migrations/002_multi_distance.sql __tests__/types.test.ts
git commit -m "feat: add EventDistance, Athlete, SubgroupPrizeOverride types + migration SQL"
```

---

## Task 2: Storage Layer Additions

**Files:**
- Modify: `lib/storage.ts`
- Modify: `__tests__/storage.test.ts`

- [ ] **Step 1: Write failing tests for new storage functions**

Add to `__tests__/storage.test.ts`:

```ts
import {
  getPendingRecords, addPendingRecord, markSynced, removeSynced,
  getEventById, saveEvent,
  saveDistances, getDistances, saveAthletes, getAthletes,
} from '@/lib/storage'
import type { EventDistance, Athlete } from '@/types'

// ... existing tests stay unchanged ...

describe('distances cache', () => {
  it('returns empty array when nothing stored', () => {
    expect(getDistances('evt-1')).toEqual([])
  })

  it('saves and retrieves distances', () => {
    const distances: EventDistance[] = [{
      id: 'd1', event_id: 'evt-1', name: '10K',
      start_time: '2026-03-17T07:00:00+07:00', overall_top_n: 3, default_top_n: 3,
    }]
    saveDistances('evt-1', distances)
    expect(getDistances('evt-1')).toEqual(distances)
  })
})

describe('athletes cache', () => {
  it('returns empty array when nothing stored', () => {
    expect(getAthletes('evt-1')).toEqual([])
  })

  it('saves and retrieves athletes', () => {
    const athletes: Athlete[] = [{
      id: 'a1', event_id: 'evt-1', bib_number: '235', name: 'สมชาย',
      distance_id: 'd1', gender: 'Male', age_group: '30-39',
    }]
    saveAthletes('evt-1', athletes)
    expect(getAthletes('evt-1')).toEqual(athletes)
  })
})

describe('getEventById strips stale start_time', () => {
  it('removes start_time field if present in cached data', () => {
    // Simulate old cached event with start_time
    localStorage.setItem('timing:event:evt-1', JSON.stringify({
      id: 'evt-1', name: 'Test', start_time: '2026-03-16T07:00:00+07:00',
      timezone: 'Asia/Bangkok', overall_lockout: false,
    }))
    const event = getEventById('evt-1')
    expect(event).not.toBeNull()
    expect((event as Record<string, unknown>)['start_time']).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npx vitest run __tests__/storage.test.ts
```

Expected: FAIL (new functions not implemented)

- [ ] **Step 3: Update `lib/storage.ts`**

Add after existing functions:

```ts
// ---- Distances cache ----
function distancesKey(eventId: string): string {
  return `timing:distances:${eventId}`
}

export function saveDistances(eventId: string, distances: EventDistance[]): void {
  localStorage.setItem(distancesKey(eventId), JSON.stringify(distances))
}

export function getDistances(eventId: string): EventDistance[] {
  const raw = localStorage.getItem(distancesKey(eventId))
  if (!raw) return []
  try { return JSON.parse(raw) as EventDistance[] } catch { return [] }
}

// ---- Athletes cache ----
function athletesKey(eventId: string): string {
  return `timing:athletes:${eventId}`
}

export function saveAthletes(eventId: string, athletes: Athlete[]): void {
  localStorage.setItem(athletesKey(eventId), JSON.stringify(athletes))
}

export function getAthletes(eventId: string): Athlete[] {
  const raw = localStorage.getItem(athletesKey(eventId))
  if (!raw) return []
  try { return JSON.parse(raw) as Athlete[] } catch { return [] }
}
```

Also update `getEventById` to strip stale `start_time`:

```ts
export function getEventById(eventId: string): Event | null {
  const raw = localStorage.getItem(eventKey(eventId))
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    delete parsed['start_time']   // strip legacy field
    return parsed as unknown as Event
  } catch {
    return null
  }
}
```

Add imports at top of `lib/storage.ts`:
```ts
import type { Event, PendingRecord, EventDistance, Athlete } from '@/types'
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npx vitest run __tests__/storage.test.ts
```

Expected: all PASS (including existing tests)

- [ ] **Step 5: Verify TS compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 6: Commit**

```bash
git add lib/storage.ts __tests__/storage.test.ts
git commit -m "feat: add distances/athletes LocalStorage cache; strip stale start_time on read"
```

---

## Task 3: DB Layer Additions

**Files:**
- Modify: `lib/db.ts`
- Modify: `__tests__/db.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `__tests__/db.test.ts`:

```ts
import {
  createEvent, getEvent, createFinishRecord, getFinishRecords,
  createEventWithDistances, getDistancesForEvent,
  getAthletesForEvent, upsertAthletes, getSubgroupOverrides, upsertSubgroupOverride, deleteSubgroupOverride,
  updateDistance, deleteDistanceAndAthletes,
} from '@/lib/db'

describe('createEventWithDistances', () => {
  it('calls rpc with correct params', async () => {
    const mockEvent = { id: 'evt-1', name: 'Test', timezone: 'Asia/Bangkok', overall_lockout: false }
    const rpcChain = {
      data: mockEvent,
      error: null,
      then: vi.fn((cb: (v: unknown) => unknown) => Promise.resolve(cb({ data: mockEvent, error: null }))),
    }
    const mockRpc = vi.fn(() => rpcChain)
    vi.mocked(supabase as unknown as { rpc: typeof mockRpc }).rpc = mockRpc
    const result = await createEventWithDistances('Test', 'Asia/Bangkok', [
      { name: '10K', start_time: '2026-03-17T07:00:00+07:00' },
    ])
    expect(mockRpc).toHaveBeenCalledWith('create_event_with_distances', expect.objectContaining({
      p_name: 'Test',
      p_timezone: 'Asia/Bangkok',
    }))
    expect(result.name).toBe('Test')
  })
})

describe('getDistancesForEvent', () => {
  it('queries event_distances by event_id', async () => {
    const mockData = [{ id: 'd1', event_id: 'evt-1', name: '10K', start_time: '', overall_top_n: 3, default_top_n: 3 }]
    const chain = mockChain({ data: mockData, error: null })
    vi.mocked(supabase.from).mockReturnValue(chain as unknown as ReturnType<typeof supabase.from>)
    const result = await getDistancesForEvent('evt-1')
    expect(supabase.from).toHaveBeenCalledWith('event_distances')
    expect(result).toEqual(mockData)
  })
})

describe('getAthletesForEvent', () => {
  it('queries athletes by event_id', async () => {
    const mockData = [{ id: 'a1', event_id: 'evt-1', bib_number: '235', name: '', distance_id: 'd1', gender: 'Male', age_group: '30-39' }]
    const chain = mockChain({ data: mockData, error: null })
    vi.mocked(supabase.from).mockReturnValue(chain as unknown as ReturnType<typeof supabase.from>)
    const result = await getAthletesForEvent('evt-1')
    expect(supabase.from).toHaveBeenCalledWith('athletes')
    expect(result).toEqual(mockData)
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npx vitest run __tests__/db.test.ts
```

- [ ] **Step 3: Update `lib/db.ts`**

Replace the entire file:

```ts
import { supabase } from './supabase'
import type { Event, FinishRecord, EventDistance, Athlete, SubgroupPrizeOverride } from '@/types'

// ---- Events ----

export async function createEventWithDistances(
  name: string,
  timezone: string,
  distances: { name: string; start_time: string; overall_top_n?: number; default_top_n?: number }[]
): Promise<Event> {
  const { data, error } = await supabase.rpc('create_event_with_distances', {
    p_name: name,
    p_timezone: timezone,
    p_distances: JSON.stringify(distances),
  })
  if (error) throw error
  return data as Event
}

export async function getEvent(id: string): Promise<Event | null> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data as Event | null
}

export async function updateEventLockout(id: string, overallLockout: boolean): Promise<void> {
  const { error } = await supabase
    .from('events')
    .update({ overall_lockout: overallLockout })
    .eq('id', id)
  if (error) throw error
}

// ---- Distances ----

export async function getDistancesForEvent(eventId: string): Promise<EventDistance[]> {
  const { data, error } = await supabase
    .from('event_distances')
    .select('*')
    .eq('event_id', eventId)
    .order('start_time', { ascending: true })
  if (error) throw error
  return (data ?? []) as EventDistance[]
}

export async function updateDistance(
  id: string,
  patch: Partial<Pick<EventDistance, 'name' | 'start_time' | 'overall_top_n' | 'default_top_n'>>
): Promise<void> {
  const { error } = await supabase.from('event_distances').update(patch).eq('id', id)
  if (error) throw error
}

export async function addDistance(
  eventId: string,
  name: string,
  startTime: string
): Promise<EventDistance> {
  const { data, error } = await supabase
    .from('event_distances')
    .insert({ event_id: eventId, name, start_time: startTime })
    .select()
    .single()
  if (error) throw error
  return data as EventDistance
}

export async function deleteDistanceAndAthletes(distanceId: string): Promise<void> {
  // Delete athletes first (FK is RESTRICT, not CASCADE)
  const { error: err1 } = await supabase
    .from('athletes')
    .delete()
    .eq('distance_id', distanceId)
  if (err1) throw err1
  const { error: err2 } = await supabase
    .from('event_distances')
    .delete()
    .eq('id', distanceId)
  if (err2) throw err2
}

// ---- Athletes ----

export async function getAthletesForEvent(eventId: string): Promise<Athlete[]> {
  const { data, error } = await supabase
    .from('athletes')
    .select('*')
    .eq('event_id', eventId)
  if (error) throw error
  return (data ?? []) as Athlete[]
}

export async function upsertAthletes(eventId: string, athletes: Omit<Athlete, 'id'>[]): Promise<void> {
  // Delete all existing athletes for event, then insert new batch
  const { error: delErr } = await supabase.from('athletes').delete().eq('event_id', eventId)
  if (delErr) throw delErr
  if (athletes.length === 0) return
  const { error: insErr } = await supabase.from('athletes').insert(athletes)
  if (insErr) throw insErr
}

// ---- Subgroup prize overrides ----

export async function getSubgroupOverrides(eventId: string): Promise<SubgroupPrizeOverride[]> {
  const { data, error } = await supabase
    .from('subgroup_prize_overrides')
    .select('*, event_distances!inner(event_id)')
    .eq('event_distances.event_id', eventId)
  if (error) throw error
  return (data ?? []) as SubgroupPrizeOverride[]
}

export async function upsertSubgroupOverride(
  distanceId: string,
  gender: string,
  ageGroup: string,
  topN: number
): Promise<void> {
  const { error } = await supabase
    .from('subgroup_prize_overrides')
    .upsert({ distance_id: distanceId, gender, age_group: ageGroup, top_n: topN })
  if (error) throw error
}

export async function deleteSubgroupOverride(
  distanceId: string,
  gender: string,
  ageGroup: string
): Promise<void> {
  const { error } = await supabase
    .from('subgroup_prize_overrides')
    .delete()
    .eq('distance_id', distanceId)
    .eq('gender', gender)
    .eq('age_group', ageGroup)
  if (error) throw error
}

// ---- Finish records (unchanged) ----

export async function createFinishRecord(
  input: Omit<FinishRecord, 'id' | 'created_at'>
): Promise<FinishRecord> {
  const { data, error } = await supabase
    .from('finish_records')
    .insert(input)
    .select()
    .single()
  if (error) throw error
  return data as FinishRecord
}

export async function getFinishRecords(eventId: string): Promise<FinishRecord[]> {
  const { data, error } = await supabase
    .from('finish_records')
    .select('*')
    .eq('event_id', eventId)
    .order('finish_time', { ascending: true })
  if (error) throw error
  return (data ?? []) as FinishRecord[]
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npx vitest run __tests__/db.test.ts
```

- [ ] **Step 5: Verify TS compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 6: Commit**

```bash
git add lib/db.ts __tests__/db.test.ts
git commit -m "feat: add createEventWithDistances RPC + CRUD for distances/athletes/overrides"
```

---

## Task 4: `lib/time.ts` + `lib/ranking.ts`

**Files:**
- Modify: `lib/time.ts`
- Create: `lib/ranking.ts`
- Modify: `__tests__/time.test.ts`
- Create: `__tests__/ranking.test.ts`

- [ ] **Step 1: Write failing tests for `getDistanceStartTime`**

Add to `__tests__/time.test.ts`:

```ts
import { calcNetTime, formatTime, formatNetTime, getDistanceStartTime } from '@/lib/time'
import type { Athlete, EventDistance } from '@/types'

const d10k: EventDistance = {
  id: 'd1', event_id: 'e1', name: '10K',
  start_time: '2026-03-17T07:30:00+07:00', overall_top_n: 3, default_top_n: 3,
}
const d5k: EventDistance = {
  id: 'd2', event_id: 'e1', name: '5K',
  start_time: '2026-03-17T07:00:00+07:00', overall_top_n: 3, default_top_n: 3,
}
const athlete: Athlete = {
  id: 'a1', event_id: 'e1', bib_number: '235', name: 'Test',
  distance_id: 'd1', gender: 'Male', age_group: '30-39',
}

describe('getDistanceStartTime', () => {
  it('returns start_time for registered bib', () => {
    expect(getDistanceStartTime('235', [athlete], [d10k, d5k]))
      .toBe('2026-03-17T07:30:00+07:00')
  })

  it('returns earliest distance start_time for unregistered bib', () => {
    // 5K starts earlier (07:00) than 10K (07:30)
    expect(getDistanceStartTime('999', [], [d10k, d5k]))
      .toBe('2026-03-17T07:00:00+07:00')
  })

  it('returns null when bib unknown and distances empty', () => {
    expect(getDistanceStartTime('999', [], [])).toBeNull()
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npx vitest run __tests__/time.test.ts
```

- [ ] **Step 3: Update `lib/time.ts`**

Add to end of file:

```ts
import type { Athlete, EventDistance } from '@/types'

export function getDistanceStartTime(
  bib: string,
  athletes: Athlete[],
  distances: EventDistance[]
): string | null {
  const athlete = athletes.find((a) => a.bib_number === bib)
  if (athlete) {
    const dist = distances.find((d) => d.id === athlete.distance_id)
    if (dist) return dist.start_time
  }
  // Fallback: earliest distance by start_time
  if (distances.length === 0) return null
  return [...distances].sort(
    (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
  )[0].start_time
}
```

- [ ] **Step 4: Run time tests — expect PASS**

```bash
npx vitest run __tests__/time.test.ts
```

- [ ] **Step 5: Write failing tests for `computeRanks`**

Create `__tests__/ranking.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computeRanks } from '@/lib/ranking'
import type { FinishRecord, Athlete, EventDistance, SubgroupPrizeOverride } from '@/types'

const dist: EventDistance = {
  id: 'd1', event_id: 'e1', name: '10K',
  start_time: '2026-03-17T07:00:00+07:00', overall_top_n: 3, default_top_n: 3,
}

function makeRecord(bib: string, finishOffsetMs: number): FinishRecord {
  const finish = new Date(new Date(dist.start_time).getTime() + finishOffsetMs).toISOString()
  return { id: bib, event_id: 'e1', bib_number: bib, finish_time: finish, created_at: finish }
}

function makeAthlete(bib: string, gender: string, ageGroup: string): Athlete {
  return { id: bib, event_id: 'e1', bib_number: bib, name: '', distance_id: 'd1', gender, age_group: ageGroup }
}

describe('computeRanks — overall', () => {
  const records = [
    makeRecord('001', 40 * 60000),  // 40 min
    makeRecord('002', 42 * 60000),  // 42 min
    makeRecord('003', 45 * 60000),  // 45 min
    makeRecord('004', 50 * 60000),  // 50 min
    makeRecord('005', 35 * 60000),  // 35 min — fastest Female
  ]
  const athletes = [
    makeAthlete('001', 'Male', '30-39'),
    makeAthlete('002', 'Male', '30-39'),
    makeAthlete('003', 'Male', '40-49'),
    makeAthlete('004', 'Male', '40-49'),
    makeAthlete('005', 'Female', '30-39'),
  ]

  it('assigns overallRank 1-3 to top 3 males', () => {
    const map = computeRanks(records, athletes, [dist], [], false)
    expect(map.get('001')?.overallRank).toBe(1)
    expect(map.get('002')?.overallRank).toBe(2)
    expect(map.get('003')?.overallRank).toBe(3)
    expect(map.get('004')?.overallRank).toBeNull()
  })

  it('ranks females separately from males', () => {
    const map = computeRanks(records, athletes, [dist], [], false)
    expect(map.get('005')?.overallRank).toBe(1)
  })

  it('assigns divisionRank 1-3 per subgroup', () => {
    const map = computeRanks(records, athletes, [dist], [], false)
    expect(map.get('001')?.divisionRank).toBe(1)
    expect(map.get('002')?.divisionRank).toBe(2)
    expect(map.get('003')?.divisionRank).toBe(1)
    expect(map.get('004')?.divisionRank).toBe(2)
  })
})

describe('computeRanks — overall_lockout', () => {
  const records = [
    makeRecord('001', 40 * 60000),
    makeRecord('002', 42 * 60000),
    makeRecord('003', 45 * 60000),
    makeRecord('004', 50 * 60000),
  ]
  const athletes = [
    makeAthlete('001', 'Male', '30-39'),
    makeAthlete('002', 'Male', '30-39'),
    makeAthlete('003', 'Male', '30-39'),
    makeAthlete('004', 'Male', '30-39'),
  ]

  it('with lockout: overall winners excluded from division pool', () => {
    const map = computeRanks(records, athletes, [dist], [], true)
    // 001 wins overall rank 1 → excluded from division
    expect(map.get('001')?.overallRank).toBe(1)
    expect(map.get('001')?.divisionRank).toBeNull()
    // 002 wins overall rank 2 → excluded from division
    expect(map.get('002')?.overallRank).toBe(2)
    expect(map.get('002')?.divisionRank).toBeNull()
    // 004 gets division rank 2 (003 is rank 1 in division)
    expect(map.get('003')?.divisionRank).toBe(1)
    expect(map.get('004')?.divisionRank).toBe(2)
  })
})

describe('computeRanks — subgroup override', () => {
  const records = [makeRecord('001', 40 * 60000), makeRecord('002', 42 * 60000)]
  const athletes = [makeAthlete('001', 'Male', '30-39'), makeAthlete('002', 'Male', '30-39')]
  const override: SubgroupPrizeOverride = { id: 'o1', distance_id: 'd1', gender: 'Male', age_group: '30-39', top_n: 1 }

  it('uses override top_n instead of distance default', () => {
    const map = computeRanks(records, athletes, [dist], [override], false)
    expect(map.get('001')?.divisionRank).toBe(1)
    expect(map.get('002')?.divisionRank).toBeNull()  // top_n=1, so only rank 1
  })
})

describe('computeRanks — tie-breaking', () => {
  it('same net time: earlier created_at wins', () => {
    const sameTime = new Date(new Date(dist.start_time).getTime() + 40 * 60000).toISOString()
    const records: FinishRecord[] = [
      { id: 'r1', event_id: 'e1', bib_number: '001', finish_time: sameTime, created_at: '2026-03-17T07:41:00Z' },
      { id: 'r2', event_id: 'e1', bib_number: '002', finish_time: sameTime, created_at: '2026-03-17T07:40:00Z' },
    ]
    const athletes = [makeAthlete('001', 'Male', '30-39'), makeAthlete('002', 'Male', '30-39')]
    const map = computeRanks(records, athletes, [dist], [], false)
    // 002 created earlier → rank 1
    expect(map.get('002')?.overallRank).toBe(1)
    expect(map.get('001')?.overallRank).toBe(1)  // tie → same rank
  })
})

describe('computeRanks — unregistered bib', () => {
  it('skips bibs not in athletes, no entry in map', () => {
    const records = [makeRecord('999', 40 * 60000)]
    const map = computeRanks(records, [], [dist], [], false)
    expect(map.has('999')).toBe(false)
  })
})
```

- [ ] **Step 6: Run ranking tests — expect FAIL**

```bash
npx vitest run __tests__/ranking.test.ts
```

- [ ] **Step 7: Create `lib/ranking.ts`**

```ts
import type { FinishRecord, Athlete, EventDistance, SubgroupPrizeOverride } from '@/types'
import { calcNetTime } from './time'

export type RankEntry = { overallRank: number | null; divisionRank: number | null }
export type RankMap = Map<string, RankEntry>

export function computeRanks(
  records: FinishRecord[],
  athletes: Athlete[],
  distances: EventDistance[],
  overrides: SubgroupPrizeOverride[],
  overallLockout: boolean
): RankMap {
  const map = new Map<string, RankEntry>()
  const athleteByBib = new Map(athletes.map((a) => [a.bib_number, a]))
  const distanceById = new Map(distances.map((d) => [d.id, d]))

  // Resolve net time for each record that has a registered athlete
  type Enriched = {
    record: FinishRecord
    athlete: Athlete
    distance: EventDistance
    netMs: number
  }

  const enriched: Enriched[] = []
  for (const record of records) {
    const athlete = athleteByBib.get(record.bib_number)
    if (!athlete) continue
    const distance = distanceById.get(athlete.distance_id)
    if (!distance) continue
    enriched.push({
      record,
      athlete,
      distance,
      netMs: calcNetTime(distance.start_time, record.finish_time),
    })
  }

  // Sort comparator: net time ASC, then created_at ASC as tiebreaker
  function compare(a: Enriched, b: Enriched): number {
    if (a.netMs !== b.netMs) return a.netMs - b.netMs
    return new Date(a.record.created_at).getTime() - new Date(b.record.created_at).getTime()
  }

  // Standard competition ranking (ties share rank, next rank skips)
  function assignRanks(sorted: Enriched[], topN: number): Map<string, number> {
    const result = new Map<string, number>()
    let rank = 1
    for (let i = 0; i < sorted.length; i++) {
      if (rank > topN) break
      const bib = sorted[i].record.bib_number
      // Check for tie with previous
      if (i > 0 && compare(sorted[i], sorted[i - 1]) === 0) {
        result.set(bib, result.get(sorted[i - 1].record.bib_number)!)
      } else {
        result.set(bib, rank)
      }
      rank = i + 2  // next rank = position + 1 (1-indexed)
    }
    return result
  }

  // Initialize all registered bibs with null ranks
  for (const e of enriched) {
    map.set(e.record.bib_number, { overallRank: null, divisionRank: null })
  }

  // Step 1: overall ranks per (distance.id, gender)
  const overallWinners = new Set<string>()
  const groupKeys = [...new Set(enriched.map((e) => `${e.distance.id}::${e.athlete.gender}`))]
  for (const key of groupKeys) {
    const [distId, gender] = key.split('::')
    const group = enriched.filter((e) => e.distance.id === distId && e.athlete.gender === gender)
    group.sort(compare)
    const dist = distanceById.get(distId)!
    const ranked = assignRanks(group, dist.overall_top_n)
    for (const [bib, r] of ranked) {
      map.get(bib)!.overallRank = r
      overallWinners.add(bib)
    }
  }

  // Step 2: division ranks per (distance.id, gender, age_group)
  const divGroupKeys = [...new Set(
    enriched.map((e) => `${e.distance.id}::${e.athlete.gender}::${e.athlete.age_group}`)
  )]
  for (const key of divGroupKeys) {
    const [distId, gender, ageGroup] = key.split('::')
    let pool = enriched.filter(
      (e) => e.distance.id === distId && e.athlete.gender === gender && e.athlete.age_group === ageGroup
    )
    if (overallLockout) {
      pool = pool.filter((e) => !overallWinners.has(e.record.bib_number))
    }
    pool.sort(compare)

    const dist = distanceById.get(distId)!
    const override = overrides.find(
      (o) => o.distance_id === distId && o.gender === gender && o.age_group === ageGroup
    )
    const topN = override ? override.top_n : dist.default_top_n
    const ranked = assignRanks(pool, topN)
    for (const [bib, r] of ranked) {
      map.get(bib)!.divisionRank = r
    }
  }

  return map
}
```

- [ ] **Step 8: Run ranking tests — expect PASS**

```bash
npx vitest run __tests__/ranking.test.ts
```

- [ ] **Step 9: Run all tests to check nothing broke**

```bash
npx vitest run
```

Expected: all previous tests still pass

- [ ] **Step 10: Commit**

```bash
git add lib/time.ts lib/ranking.ts __tests__/time.test.ts __tests__/ranking.test.ts
git commit -m "feat: add getDistanceStartTime helper + computeRanks ranking engine"
```

---

## Task 5: Update `lib/export.ts` + export test

**Files:**
- Modify: `lib/export.ts`
- Modify: `__tests__/export.test.ts`

- [ ] **Step 1: Update `__tests__/export.test.ts`**

Replace the entire file:

```ts
import { describe, it, expect } from 'vitest'
import { generateCsv } from '@/lib/export'
import type { FinishRecord, Event, Athlete, EventDistance, SubgroupPrizeOverride } from '@/types'
import { computeRanks } from '@/lib/ranking'

const event: Event = {
  id: 'evt-1',
  name: 'Test Race',
  timezone: 'Asia/Bangkok',
  overall_lockout: false,
}

const dist: EventDistance = {
  id: 'd1', event_id: 'evt-1', name: '10K',
  start_time: '2026-03-16T07:00:00+07:00', overall_top_n: 3, default_top_n: 3,
}

const athletes: Athlete[] = [
  { id: 'a1', event_id: 'evt-1', bib_number: '235', name: 'สมชาย', distance_id: 'd1', gender: 'Male', age_group: '30-39' },
  { id: 'a2', event_id: 'evt-1', bib_number: '099', name: 'สมหญิง', distance_id: 'd1', gender: 'Female', age_group: '20-29' },
]

const records: FinishRecord[] = [
  { id: 'r1', event_id: 'evt-1', bib_number: '235', finish_time: '2026-03-16T07:42:15+07:00', created_at: '2026-03-16T07:42:15Z' },
  { id: 'r2', event_id: 'evt-1', bib_number: '099', finish_time: '2026-03-16T07:40:55+07:00', created_at: '2026-03-16T07:40:55Z' },
]

const overrides: SubgroupPrizeOverride[] = []

describe('generateCsv', () => {
  it('generates header row', () => {
    const rankMap = computeRanks(records, athletes, [dist], overrides, false)
    const csv = generateCsv(records, event, athletes, [dist], rankMap)
    expect(csv.split('\n')[0]).toBe('bib,name,distance,gender,age_group,finish_time,net_time,overall_rank,division_rank')
  })

  it('preserves leading zeros in bib_number', () => {
    const rankMap = computeRanks(records, athletes, [dist], overrides, false)
    expect(generateCsv(records, event, athletes, [dist], rankMap)).toContain('099,')
  })

  it('exports finish_time as HH:MM:SS local time', () => {
    const rankMap = computeRanks(records, athletes, [dist], overrides, false)
    expect(generateCsv(records, event, athletes, [dist], rankMap)).toContain('235,สมชาย,10K,Male,30-39,07:42:15,')
  })

  it('computes net_time correctly', () => {
    const rankMap = computeRanks(records, athletes, [dist], overrides, false)
    expect(generateCsv(records, event, athletes, [dist], rankMap)).toContain(',00:42:15,')
  })

  it('sorts by net_time ascending', () => {
    const rankMap = computeRanks(records, athletes, [dist], overrides, false)
    const lines = generateCsv(records, event, athletes, [dist], rankMap).split('\n').slice(1).filter(Boolean)
    expect(lines[0]).toContain('099')
    expect(lines[1]).toContain('235')
  })

  it('blank fields for bib not in athletes', () => {
    const unknownRecord: FinishRecord = {
      id: 'r3', event_id: 'evt-1', bib_number: '999', finish_time: '2026-03-16T08:00:00+07:00', created_at: '2026-03-16T08:00:00Z'
    }
    const rankMap = computeRanks([...records, unknownRecord], athletes, [dist], overrides, false)
    const csv = generateCsv([...records, unknownRecord], event, athletes, [dist], rankMap)
    const unknownLine = csv.split('\n').find((l) => l.startsWith('999,'))!
    expect(unknownLine).toContain('999,,,,,')
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npx vitest run __tests__/export.test.ts
```

- [ ] **Step 3: Update `lib/export.ts`**

```ts
import type { FinishRecord, Event, Athlete, EventDistance } from '@/types'
import type { RankMap } from './ranking'
import { getDistanceStartTime, formatTime, formatNetTime, calcNetTime } from './time'

export function generateCsv(
  records: FinishRecord[],
  event: Event,
  athletes: Athlete[],
  distances: EventDistance[],
  rankMap: RankMap
): string {
  const athleteByBib = new Map(athletes.map((a) => [a.bib_number, a]))
  const distanceById = new Map(distances.map((d) => [d.id, d]))

  const sorted = [...records].sort((a, b) => {
    const startA = getDistanceStartTime(a.bib_number, athletes, distances) ?? distances[0]?.start_time ?? ''
    const startB = getDistanceStartTime(b.bib_number, athletes, distances) ?? distances[0]?.start_time ?? ''
    return calcNetTime(startA, a.finish_time) - calcNetTime(startB, b.finish_time)
  })

  const header = 'bib,name,distance,gender,age_group,finish_time,net_time,overall_rank,division_rank'

  const rows = sorted.map((r) => {
    const athlete = athleteByBib.get(r.bib_number)
    const dist = athlete ? distanceById.get(athlete.distance_id) : undefined
    const startTime = getDistanceStartTime(r.bib_number, athletes, distances)
    const finishFormatted = formatTime(r.finish_time, event.timezone)
    const netTime = startTime ? formatNetTime(calcNetTime(startTime, r.finish_time)) : ''
    const ranks = rankMap.get(r.bib_number)
    return [
      r.bib_number,
      athlete?.name ?? '',
      dist?.name ?? '',
      athlete?.gender ?? '',
      athlete?.age_group ?? '',
      finishFormatted,
      netTime,
      ranks?.overallRank ?? '',
      ranks?.divisionRank ?? '',
    ].join(',')
  })

  return [header, ...rows].join('\n')
}

export function downloadCsv(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
```

- [ ] **Step 4: Run export tests — expect PASS**

```bash
npx vitest run __tests__/export.test.ts
```

- [ ] **Step 5: Run all tests**

```bash
npx vitest run
```

Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add lib/export.ts __tests__/export.test.ts
git commit -m "feat: update generateCsv with new columns + ranking data"
```

---

## Task 6: `DistanceList` Component + `EventSetupForm` Update

**Files:**
- Create: `components/DistanceList.tsx`
- Modify: `components/EventSetupForm.tsx`

> No vitest for these UI components; they'll be verified by TypeScript and manual browser test.

- [ ] **Step 1: Create `components/DistanceList.tsx`**

```tsx
'use client'
import { Plus, X } from 'lucide-react'

export interface DistanceRow {
  key: string      // client-side stable ID (crypto.randomUUID())
  name: string
  time: string     // HH:MM
}

interface Props {
  rows: DistanceRow[]
  date: string     // YYYY-MM-DD, used to build ISO start_time on submit
  onChange: (rows: DistanceRow[]) => void
}

export default function DistanceList({ rows, date, onChange }: Props) {
  function update(key: string, field: keyof DistanceRow, value: string) {
    onChange(rows.map((r) => r.key === key ? { ...r, [field]: value } : r))
  }

  function addRow() {
    onChange([...rows, { key: crypto.randomUUID(), name: '', time: '07:00' }])
  }

  function removeRow(key: string) {
    if (rows.length <= 1) return
    onChange(rows.filter((r) => r.key !== key))
  }

  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.key} className="flex gap-2 items-center">
          <input
            type="text"
            value={row.name}
            onChange={(e) => update(row.key, 'name', e.target.value)}
            placeholder="เช่น 10K"
            className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black"
            required
          />
          <input
            type="time"
            value={row.time}
            onChange={(e) => update(row.key, 'time', e.target.value)}
            className="w-28 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black"
            required
          />
          <button
            type="button"
            onClick={() => removeRow(row.key)}
            disabled={rows.length <= 1}
            className="p-1.5 text-gray-400 hover:text-gray-700 disabled:opacity-30"
            aria-label="remove distance"
          >
            <X size={16} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addRow}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mt-1"
      >
        <Plus size={14} /> เพิ่มระยะ
      </button>
    </div>
  )
}

/** Convert a DistanceRow + date string → ISO 8601 start_time (Asia/Bangkok = UTC+7) */
export function rowToStartTime(date: string, time: string): string {
  return new Date(`${date}T${time}:00+07:00`).toISOString()
}
```

- [ ] **Step 2: Update `components/EventSetupForm.tsx`**

Replace the entire file:

```tsx
'use client'
import { useState } from 'react'
import type { Event } from '@/types'
import DistanceList, { type DistanceRow, rowToStartTime } from './DistanceList'

interface Props {
  onCreated: (event: Event) => void
}

export default function EventSetupForm({ onCreated }: Props) {
  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const [distances, setDistances] = useState<DistanceRow[]>([
    { key: crypto.randomUUID(), name: '', time: '07:00' },
  ])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name || !date) return
    setLoading(true)
    setError(null)

    try {
      const { createEventWithDistances } = await import('@/lib/db')
      const { saveEvent } = await import('@/lib/storage')

      const distancePayload = distances.map((row) => ({
        name: row.name,
        start_time: rowToStartTime(date, row.time),
      }))

      const event = await createEventWithDistances(name, 'Asia/Bangkok', distancePayload)
      saveEvent(event)
      onCreated(event)
    } catch (err) {
      setError('ไม่สามารถสร้างงานได้ กรุณาลองใหม่')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">ชื่องาน</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="เช่น งานวิ่ง XYZ 2026"
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-black"
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">วันที่</label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-black"
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">ระยะและเวลาปล่อยตัว</label>
        <DistanceList rows={distances} date={date} onChange={setDistances} />
      </div>
      {error && <p className="text-red-500 text-sm">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full bg-black text-white rounded-xl py-4 text-base font-medium disabled:opacity-50"
      >
        {loading ? 'กำลังสร้าง...' : 'สร้างงาน'}
      </button>
    </form>
  )
}
```

- [ ] **Step 3: Verify TS compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors

- [ ] **Step 4: Run all tests**

```bash
npx vitest run
```

- [ ] **Step 5: Commit**

```bash
git add components/DistanceList.tsx components/EventSetupForm.tsx
git commit -m "feat: add DistanceList component; update EventSetupForm to use per-distance start times"
```

---

## Task 7: Event Hub + Settings Page (Section 1 — Distances)

**Files:**
- Modify: `app/event/[id]/page.tsx`
- Create: `app/event/[id]/settings/page.tsx`

- [ ] **Step 1: Add Settings link to `app/event/[id]/page.tsx`**

Add after the Export link block:

```tsx
import { Mic, BarChart2, Download, Settings } from 'lucide-react'

// Add after the Export <Link>:
<Link
  href={`/event/${id}/settings`}
  className="flex items-center justify-between w-full bg-gray-50 text-gray-900 rounded-2xl px-6 py-5 border border-gray-100"
>
  <div>
    <p className="text-base font-medium">ตั้งค่า</p>
    <p className="text-xs text-gray-400 mt-0.5">Settings</p>
  </div>
  <Settings size={22} strokeWidth={1.75} className="text-gray-500" />
</Link>
```

- [ ] **Step 2: Create `app/event/[id]/settings/page.tsx` — skeleton + Section 1**

```tsx
'use client'
import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react'
import type { Event, EventDistance, Athlete, SubgroupPrizeOverride } from '@/types'
import DistanceList, { type DistanceRow, rowToStartTime } from '@/components/DistanceList'

export default function SettingsPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [event, setEvent] = useState<Event | null>(null)
  const [distances, setDistances] = useState<EventDistance[]>([])
  const [athletes, setAthletes] = useState<Athlete[]>([])
  const [overrides, setOverrides] = useState<SubgroupPrizeOverride[]>([])
  const [offline, setOffline] = useState(false)
  const [openSection, setOpenSection] = useState<1 | 2 | 3>(1)

  useEffect(() => {
    async function load() {
      if (!navigator.onLine) { setOffline(true); return }
      const { getEvent, getDistancesForEvent, getAthletesForEvent, getSubgroupOverrides } = await import('@/lib/db')
      const { saveEvent, saveDistances, saveAthletes } = await import('@/lib/storage')
      const [ev, dists, aths, ovrs] = await Promise.all([
        getEvent(id),
        getDistancesForEvent(id),
        getAthletesForEvent(id),
        getSubgroupOverrides(id),
      ])
      if (!ev) { router.push('/'); return }
      saveEvent(ev)
      saveDistances(id, dists)
      saveAthletes(id, aths)
      setEvent(ev)
      setDistances(dists)
      setAthletes(aths)
      setOverrides(ovrs)
    }
    load()
  }, [id, router])

  // ---- Section 1: Distances ----

  const [distRows, setDistRows] = useState<DistanceRow[]>([])
  useEffect(() => {
    setDistRows(distances.map((d) => ({
      key: d.id,
      name: d.name,
      time: new Date(d.start_time).toLocaleTimeString('en-GB', {
        hour: '2-digit', minute: '2-digit', timeZone: event?.timezone ?? 'Asia/Bangkok',
      }),
    })))
  }, [distances, event])

  async function handleDistanceChange(rows: DistanceRow[]) {
    if (offline || !event) return
    setDistRows(rows)
    const { updateDistance } = await import('@/lib/db')
    const { saveDistances } = await import('@/lib/storage')
    const date = distances[0]
      ? new Date(distances[0].start_time).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10)
    for (const row of rows) {
      const existing = distances.find((d) => d.id === row.key)
      if (!existing) continue
      if (existing.name !== row.name || !existing.start_time.startsWith(
        new Date(`${date}T${row.time}:00+07:00`).toISOString().slice(0, 16)
      )) {
        await updateDistance(row.key, {
          name: row.name,
          start_time: rowToStartTime(date, row.time),
        })
      }
    }
    const { getDistancesForEvent } = await import('@/lib/db')
    const updated = await getDistancesForEvent(id)
    setDistances(updated)
    saveDistances(id, updated)
  }

  async function handleDeleteDistance(distId: string) {
    const count = athletes.filter((a) => a.distance_id === distId).length
    const msg = count > 0
      ? `ระยะนี้มีนักกีฬา ${count} คน — ลบแล้วนักกีฬาเหล่านี้จะถูกลบด้วย ยืนยันไหม?`
      : 'ลบระยะนี้?'
    if (!confirm(msg)) return
    const { deleteDistanceAndAthletes, getDistancesForEvent, getAthletesForEvent } = await import('@/lib/db')
    const { saveDistances, saveAthletes } = await import('@/lib/storage')
    await deleteDistanceAndAthletes(distId)
    const [dists, aths] = await Promise.all([getDistancesForEvent(id), getAthletesForEvent(id)])
    setDistances(dists); setAthletes(aths)
    saveDistances(id, dists); saveAthletes(id, aths)
  }

  if (!event) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400">กำลังโหลด...</p>
      </div>
    )
  }

  return (
    <main className="px-6 pt-8 pb-6 max-w-sm mx-auto">
      <h1 className="text-2xl font-semibold tracking-tight mb-1">ตั้งค่า</h1>
      <p className="text-sm text-gray-400 mb-6">{event.name}</p>

      {offline && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 mb-4 text-sm text-yellow-800">
          ไม่มีการเชื่อมต่อ — แก้ไขได้เมื่อออนไลน์
        </div>
      )}

      {/* Section 1: Distances */}
      <div className="border border-gray-100 rounded-2xl mb-3 overflow-hidden">
        <button
          className="w-full flex items-center justify-between px-5 py-4 text-left"
          onClick={() => setOpenSection(openSection === 1 ? 0 as 1 : 1)}
        >
          <span className="font-medium">ระยะและเวลาปล่อยตัว</span>
          {openSection === 1 ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>

        {openSection === 1 && (
          <div className="px-5 pb-5 space-y-3">
            {distances.some((d) => d.name === 'ทั้งหมด') && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-800">
                กรุณาตั้งชื่อระยะก่อน import นักกีฬา
              </div>
            )}
            {distances.map((dist) => (
              <div key={dist.id} className="flex items-center gap-2">
                <div className="flex-1">
                  <DistanceList
                    rows={distRows.filter((r) => r.key === dist.id)}
                    date={new Date(dist.start_time).toISOString().slice(0, 10)}
                    onChange={(rows) => handleDistanceChange(
                      distRows.map((r) => r.key === dist.id ? rows[0] : r)
                    )}
                  />
                </div>
                {distances.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleDeleteDistance(dist.id)}
                    className="p-1.5 text-gray-400 hover:text-red-500"
                    aria-label="delete distance"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sections 2 & 3 placeholder — implemented in next tasks */}
      <div className="border border-gray-100 rounded-2xl mb-3 px-5 py-4 text-sm text-gray-400">
        นักกีฬา (CSV Import) — coming soon
      </div>
      <div className="border border-gray-100 rounded-2xl mb-3 px-5 py-4 text-sm text-gray-400">
        รางวัล — coming soon
      </div>
    </main>
  )
}
```

- [ ] **Step 3: Verify TS compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 4: Commit**

```bash
git add app/event/\[id\]/page.tsx app/event/\[id\]/settings/page.tsx
git commit -m "feat: add Settings link to event hub; add Settings page Section 1 (Distances)"
```

---

## Task 8: `AthleteImport` Component + Settings Section 2

**Files:**
- Create: `components/AthleteImport.tsx`
- Modify: `app/event/[id]/settings/page.tsx`

> Note: Install papaparse for CSV parsing before implementing.

- [ ] **Step 1: Install papaparse**

```bash
cd /Users/wichita.pum/Desktop/entrepreneur/Timing
npm install papaparse @types/papaparse
```

- [ ] **Step 2: Create `components/AthleteImport.tsx`**

```tsx
'use client'
import { useState, useRef } from 'react'
import Papa from 'papaparse'
import { Upload, X } from 'lucide-react'
import type { Athlete, EventDistance } from '@/types'

interface ColumnMap {
  bib_number: string
  distance: string
  name: string
  gender: string
  age_group: string
}

interface Props {
  eventId: string
  distances: EventDistance[]
  disabled?: boolean
  onImported: (athletes: Athlete[]) => void
}

export default function AthleteImport({ eventId, distances, disabled, onImported }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [headers, setHeaders] = useState<string[]>([])
  const [preview, setPreview] = useState<Record<string, string>[]>([])
  const [allRows, setAllRows] = useState<Record<string, string>[]>([])
  const [colMap, setColMap] = useState<ColumnMap>({ bib_number: '', distance: '', name: '', gender: '', age_group: '' })
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const hasPlaceholder = distances.some((d) => d.name === 'ทั้งหมด')
  const distNameById = new Map(distances.map((d) => [d.name.toLowerCase(), d.id]))

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null); setSummary(null)
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        if (!result.data.length) { setError('ไฟล์ไม่มีข้อมูล'); return }
        const cols = result.meta.fields ?? []
        setHeaders(cols)
        setAllRows(result.data)
        setPreview(result.data.slice(0, 5))
        // Auto-map columns by common Thai/English names
        const guess = (keywords: string[]) =>
          cols.find((c) => keywords.some((k) => c.toLowerCase().includes(k))) ?? ''
        setColMap({
          bib_number: guess(['bib', 'เลข', 'หมายเลข']),
          distance: guess(['distance', 'category', 'ระยะ', 'ประเภท']),
          name: guess(['name', 'ชื่อ']),
          gender: guess(['gender', 'group', 'เพศ']),
          age_group: guess(['age', 'subgroup', 'อายุ', 'รุ่น']),
        })
      },
      error: () => setError('ไม่สามารถอ่านไฟล์ได้'),
    })
    e.target.value = ''
  }

  function unmatchedDistances(): string[] {
    if (!colMap.distance) return []
    const seen = new Set(allRows.map((r) => (r[colMap.distance] ?? '').toLowerCase()))
    return [...seen].filter((v) => v && !distNameById.has(v))
  }

  async function handleImport() {
    if (!colMap.bib_number || !colMap.distance) return
    setLoading(true)
    try {
      const { upsertAthletes, getAthletesForEvent } = await import('@/lib/db')
      const { saveAthletes } = await import('@/lib/storage')
      const athletes: Omit<Athlete, 'id'>[] = []
      let skipped = 0
      for (const row of allRows) {
        const bib = row[colMap.bib_number]?.trim()
        const distName = row[colMap.distance]?.trim().toLowerCase()
        if (!bib || !distName) { skipped++; continue }
        const distId = distNameById.get(distName)
        if (!distId) { skipped++; continue }
        athletes.push({
          event_id: eventId,
          bib_number: bib,
          name: colMap.name ? (row[colMap.name]?.trim() ?? '') : '',
          distance_id: distId,
          gender: colMap.gender ? (row[colMap.gender]?.trim() ?? '') : '',
          age_group: colMap.age_group ? (row[colMap.age_group]?.trim() ?? '') : '',
        })
      }
      // Deduplicate: last row wins
      const dedupMap = new Map<string, Omit<Athlete, 'id'>>()
      for (const a of athletes) dedupMap.set(a.bib_number, a)
      const unique = [...dedupMap.values()]
      await upsertAthletes(eventId, unique)
      const updated = await getAthletesForEvent(eventId)
      saveAthletes(eventId, updated)
      onImported(updated)
      setSummary(`นำเข้า ${unique.length} คน, ข้าม ${allRows.length - unique.length + skipped - (athletes.length - unique.length)} แถว`)
      setHeaders([]); setPreview([]); setAllRows([])
    } catch (err) {
      setError('นำเข้าไม่สำเร็จ กรุณาลองใหม่')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const canImport = !!colMap.bib_number && !!colMap.distance && !hasPlaceholder

  return (
    <div className="space-y-4">
      {hasPlaceholder && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          กรุณาตั้งชื่อระยะก่อน import นักกีฬา
        </p>
      )}

      <input ref={inputRef} type="file" accept=".csv" onChange={handleFile} className="hidden" />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || hasPlaceholder}
        className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 disabled:opacity-40"
      >
        <Upload size={15} /> เลือกไฟล์ CSV
      </button>

      {error && <p className="text-red-500 text-sm">{error}</p>}
      {summary && <p className="text-green-700 text-sm">{summary}</p>}

      {headers.length > 0 && (
        <div className="space-y-3">
          {/* Column mapping */}
          {(['bib_number', 'distance', 'name', 'gender', 'age_group'] as (keyof ColumnMap)[]).map((field) => (
            <div key={field} className="flex items-center gap-3">
              <span className="w-24 text-xs text-gray-500 shrink-0">
                {field === 'bib_number' ? 'บิบ *' : field === 'distance' ? 'ระยะ *' : field === 'name' ? 'ชื่อ' : field === 'gender' ? 'เพศ' : 'รุ่นอายุ'}
              </span>
              <select
                value={colMap[field]}
                onChange={(e) => setColMap((prev) => ({ ...prev, [field]: e.target.value }))}
                className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-black"
              >
                <option value="">— ไม่ใช้ —</option>
                {headers.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
          ))}

          {/* Unmatched distances warning */}
          {unmatchedDistances().length > 0 && (
            <p className="text-xs text-amber-700">
              ระยะที่ไม่ตรง: {unmatchedDistances().join(', ')} — แถวเหล่านี้จะถูกข้าม
            </p>
          )}

          {/* Preview table */}
          <div className="overflow-x-auto">
            <table className="text-xs w-full border-collapse">
              <thead>
                <tr>{headers.map((h) => <th key={h} className="px-2 py-1 text-left text-gray-400 border-b border-gray-100">{h}</th>)}</tr>
              </thead>
              <tbody>
                {preview.map((row, i) => (
                  <tr key={i} className={unmatchedDistances().includes((row[colMap.distance] ?? '').toLowerCase()) ? 'bg-amber-50' : ''}>
                    {headers.map((h) => <td key={h} className="px-2 py-1 border-b border-gray-50">{row[h]}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            type="button"
            onClick={handleImport}
            disabled={!canImport || loading}
            className="w-full bg-black text-white rounded-xl py-3 text-sm font-medium disabled:opacity-40"
          >
            {loading ? 'กำลังนำเข้า...' : 'ยืนยันนำเข้า'}
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Add Section 2 to Settings page**

In `app/event/[id]/settings/page.tsx`, replace the placeholder Section 2 `<div>`:

```tsx
import AthleteImport from '@/components/AthleteImport'

{/* Section 2: Athletes */}
<div className="border border-gray-100 rounded-2xl mb-3 overflow-hidden">
  <button
    className="w-full flex items-center justify-between px-5 py-4 text-left"
    onClick={() => setOpenSection(2)}
  >
    <span className="font-medium">นักกีฬา</span>
    {openSection === 2 ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
  </button>
  {openSection === 2 && (
    <div className="px-5 pb-5">
      <AthleteImport
        eventId={id}
        distances={distances}
        disabled={offline}
        onImported={setAthletes}
      />
    </div>
  )}
</div>
```

- [ ] **Step 4: Verify TS compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 5: Commit**

```bash
git add components/AthleteImport.tsx app/event/\[id\]/settings/page.tsx package.json package-lock.json
git commit -m "feat: add AthleteImport component + Settings Section 2 (CSV import)"
```

---

## Task 9: `PrizeConfig` Component + Settings Section 3

**Files:**
- Create: `components/PrizeConfig.tsx`
- Modify: `app/event/[id]/settings/page.tsx`

- [ ] **Step 1: Create `components/PrizeConfig.tsx`**

```tsx
'use client'
import { useState, useEffect } from 'react'
import type { Event, EventDistance, Athlete, SubgroupPrizeOverride } from '@/types'

interface Props {
  event: Event
  distances: EventDistance[]
  athletes: Athlete[]
  overrides: SubgroupPrizeOverride[]
  disabled?: boolean
  onUpdated: (overrides: SubgroupPrizeOverride[]) => void
  onEventUpdated: (event: Event) => void
}

export default function PrizeConfig({ event, distances, athletes, overrides, disabled, onUpdated, onEventUpdated }: Props) {
  const [lockout, setLockout] = useState(event.overall_lockout)
  const [expanded, setExpanded] = useState(false)

  // Distinct (gender, age_group) combinations from athletes per distance
  function subgroupsForDistance(distId: string): { gender: string; age_group: string }[] {
    const seen = new Set<string>()
    const result: { gender: string; age_group: string }[] = []
    for (const a of athletes.filter((a) => a.distance_id === distId)) {
      const key = `${a.gender}::${a.age_group}`
      if (!seen.has(key)) { seen.add(key); result.push({ gender: a.gender, age_group: a.age_group }) }
    }
    return result.sort((a, b) => a.gender.localeCompare(b.gender) || a.age_group.localeCompare(b.age_group))
  }

  async function handleLockoutChange(value: boolean) {
    if (disabled) return
    setLockout(value)
    const { updateEventLockout, getEvent } = await import('@/lib/db')
    const { saveEvent } = await import('@/lib/storage')
    await updateEventLockout(event.id, value)
    const updated = await getEvent(event.id)
    if (updated) { saveEvent(updated); onEventUpdated(updated) }
  }

  async function handleDistanceTopN(distId: string, field: 'overall_top_n' | 'default_top_n', value: number) {
    if (disabled) return
    const { updateDistance, getDistancesForEvent } = await import('@/lib/db')
    await updateDistance(distId, { [field]: value })
  }

  async function handleOverrideChange(distId: string, gender: string, ageGroup: string, value: string) {
    if (disabled) return
    const { upsertSubgroupOverride, deleteSubgroupOverride, getSubgroupOverrides } = await import('@/lib/db')
    if (value === '') {
      await deleteSubgroupOverride(distId, gender, ageGroup)
    } else {
      const n = parseInt(value, 10)
      if (isNaN(n) || n < 1) return
      await upsertSubgroupOverride(distId, gender, ageGroup, n)
    }
    const updated = await getSubgroupOverrides(event.id)
    onUpdated(updated)
  }

  function getOverride(distId: string, gender: string, ageGroup: string): number | undefined {
    return overrides.find((o) => o.distance_id === distId && o.gender === gender && o.age_group === ageGroup)?.top_n
  }

  return (
    <div className="space-y-5">
      {/* Overall lockout toggle */}
      <div className="flex items-center justify-between">
        <label className="text-sm text-gray-700">ได้ overall แล้วออกจาก division</label>
        <button
          type="button"
          onClick={() => handleLockoutChange(!lockout)}
          disabled={disabled}
          className={`w-11 h-6 rounded-full transition-colors ${lockout ? 'bg-black' : 'bg-gray-200'} disabled:opacity-40`}
        >
          <span className={`block w-4 h-4 bg-white rounded-full mx-1 transition-transform ${lockout ? 'translate-x-5' : ''}`} />
        </button>
      </div>

      {/* Per-distance top N */}
      {distances.map((dist) => (
        <div key={dist.id} className="space-y-2">
          <p className="text-sm font-medium">{dist.name}</p>
          <div className="flex gap-4 items-center">
            <div className="flex-1">
              <label className="text-xs text-gray-500">Overall top N (ต่อเพศ)</label>
              <input
                type="number" min={1}
                defaultValue={dist.overall_top_n}
                onBlur={(e) => handleDistanceTopN(dist.id, 'overall_top_n', parseInt(e.target.value, 10))}
                disabled={disabled}
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-gray-500">Division default top N</label>
              <input
                type="number" min={1}
                defaultValue={dist.default_top_n}
                onBlur={(e) => handleDistanceTopN(dist.id, 'default_top_n', parseInt(e.target.value, 10))}
                disabled={disabled}
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
              />
            </div>
          </div>
        </div>
      ))}

      {/* Subgroup overrides */}
      <div>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="text-sm text-gray-500 underline"
        >
          {expanded ? 'ซ่อน' : 'ดูทั้งหมด'} subgroup
        </button>

        {expanded && (
          <div className="mt-3 space-y-2">
            {distances.flatMap((dist) =>
              subgroupsForDistance(dist.id).map(({ gender, age_group }) => (
                <div key={`${dist.id}::${gender}::${age_group}`} className="flex items-center gap-3">
                  <span className="text-xs text-gray-600 flex-1">
                    {dist.name} / {gender} / {age_group}
                  </span>
                  <input
                    type="number" min={1} placeholder={String(dist.default_top_n)}
                    defaultValue={getOverride(dist.id, gender, age_group) ?? ''}
                    onBlur={(e) => handleOverrideChange(dist.id, gender, age_group, e.target.value)}
                    disabled={disabled}
                    className="w-16 border border-gray-200 rounded-lg px-2 py-1 text-sm text-center"
                  />
                </div>
              ))
            )}
            {athletes.length === 0 && (
              <p className="text-xs text-gray-400">กรุณา import นักกีฬาก่อน</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add Section 3 to Settings page**

In `app/event/[id]/settings/page.tsx`, replace the placeholder Section 3 `<div>`:

```tsx
import PrizeConfig from '@/components/PrizeConfig'

{/* Section 3: Prizes */}
<div className="border border-gray-100 rounded-2xl mb-3 overflow-hidden">
  <button
    className="w-full flex items-center justify-between px-5 py-4 text-left"
    onClick={() => setOpenSection(3)}
  >
    <span className="font-medium">รางวัล</span>
    {openSection === 3 ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
  </button>
  {openSection === 3 && event && (
    <div className="px-5 pb-5">
      <PrizeConfig
        event={event}
        distances={distances}
        athletes={athletes}
        overrides={overrides}
        disabled={offline}
        onUpdated={setOverrides}
        onEventUpdated={setEvent}
      />
    </div>
  )}
</div>
```

- [ ] **Step 3: Verify TS compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 4: Commit**

```bash
git add components/PrizeConfig.tsx app/event/\[id\]/settings/page.tsx
git commit -m "feat: add PrizeConfig component + Settings Section 3 (prizes)"
```

---

## Task 10: Capture Page — Load Athletes + Distances

**Files:**
- Modify: `app/event/[id]/capture/page.tsx`
- Modify: `components/CaptureScreen.tsx`

- [ ] **Step 1: Update `app/event/[id]/capture/page.tsx`**

Replace the entire file:

```tsx
'use client'
import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import CaptureScreen from '@/components/CaptureScreen'
import type { Event, EventDistance, Athlete } from '@/types'

export default function CapturePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [event, setEvent] = useState<Event | null>(null)
  const [distances, setDistances] = useState<EventDistance[]>([])
  const [athletes, setAthletes] = useState<Athlete[]>([])

  async function loadData() {
    const { getEventById, getDistances, getAthletes, saveEvent, saveDistances, saveAthletes } = await import('@/lib/storage')
    const { getEvent, getDistancesForEvent, getAthletesForEvent } = await import('@/lib/db')

    // Load event
    const local = getEventById(id)
    if (local) setEvent(local)
    else {
      const remote = await getEvent(id)
      if (remote) { saveEvent(remote); setEvent(remote) }
      else { router.push('/'); return }
    }

    // Load distances — prefer Supabase if online, else LocalStorage
    if (navigator.onLine) {
      const dists = await getDistancesForEvent(id)
      saveDistances(id, dists)
      setDistances(dists)
      const aths = await getAthletesForEvent(id)
      saveAthletes(id, aths)
      setAthletes(aths)
    } else {
      setDistances(getDistances(id))
      setAthletes(getAthletes(id))
    }
  }

  useEffect(() => {
    loadData()
    // Refresh caches when user switches back to this tab
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        import('@/lib/storage').then(({ getDistances, getAthletes }) => {
          setDistances(getDistances(id))
          setAthletes(getAthletes(id))
        })
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [id, router])

  if (!event) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400">กำลังโหลด...</p>
      </div>
    )
  }

  return <CaptureScreen event={event} distances={distances} athletes={athletes} />
}
```

- [ ] **Step 2: Update `components/CaptureScreen.tsx` to accept + use distances/athletes**

In `CaptureScreen.tsx`:

1. Update `Props` interface:

```ts
interface Props {
  event: Event
  distances: EventDistance[]
  athletes: Athlete[]
}
```

2. Update function signature:
```ts
export default function CaptureScreen({ event, distances, athletes }: Props) {
```

3. Add import at top:
```ts
import type { Event, PendingRecord, EventDistance, Athlete } from '@/types'
import { getDistanceStartTime } from '@/lib/time'
```

4. Replace the start_time display section (lines 201–206):

```tsx
<div className="w-full text-center">
  {distances.length > 1 ? (
    <div className="space-y-0.5">
      {distances.map((d) => (
        <p key={d.id} className="text-sm font-mono">
          <span className="text-gray-400">{d.name}</span>{' '}
          <span className="font-semibold">{formatTime(d.start_time, event.timezone)}</span>
        </p>
      ))}
    </div>
  ) : distances.length === 1 ? (
    <>
      <p className="text-xs text-gray-400 uppercase tracking-wider font-medium">ปล่อยตัว</p>
      <p className="text-2xl font-mono font-semibold mt-0.5">
        {formatTime(distances[0].start_time, event.timezone)}
      </p>
    </>
  ) : null}
</div>
```

- [ ] **Step 3: Verify TS compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 4: Run all tests**

```bash
npx vitest run
```

- [ ] **Step 5: Commit**

```bash
git add app/event/\[id\]/capture/page.tsx components/CaptureScreen.tsx
git commit -m "feat: capture page loads athletes + distances; display per-distance start times"
```

---

## Task 11: ResultsTable + Results Page Update

**Files:**
- Modify: `components/ResultsTable.tsx`
- Modify: `app/event/[id]/results/page.tsx`

- [ ] **Step 1: Update `components/ResultsTable.tsx`**

Replace the entire file:

```tsx
import { useState } from 'react'
import type { FinishRecord, Event, Athlete, EventDistance } from '@/types'
import type { RankMap } from '@/lib/ranking'
import { getDistanceStartTime, formatNetTime, calcNetTime, formatTime } from '@/lib/time'

interface Props {
  records: FinishRecord[]
  event: Event
  athletes: Athlete[]
  distances: EventDistance[]
  rankMap: RankMap
}

export default function ResultsTable({ records, event, athletes, distances, rankMap }: Props) {
  const [filterDistance, setFilterDistance] = useState('all')
  const [filterGender, setFilterGender] = useState('all')

  const athleteByBib = new Map(athletes.map((a) => [a.bib_number, a]))
  const distanceById = new Map(distances.map((d) => [d.id, d]))

  const distanceNames = [...new Set(distances.map((d) => d.name))]
  const genders = [...new Set(athletes.map((a) => a.gender).filter(Boolean))]

  const sorted = [...records].sort((a, b) => {
    const startA = getDistanceStartTime(a.bib_number, athletes, distances) ?? ''
    const startB = getDistanceStartTime(b.bib_number, athletes, distances) ?? ''
    if (!startA || !startB) return 0
    return calcNetTime(startA, a.finish_time) - calcNetTime(startB, b.finish_time)
  })

  const filtered = sorted.filter((r) => {
    const athlete = athleteByBib.get(r.bib_number)
    if (filterDistance !== 'all') {
      const dist = athlete ? distanceById.get(athlete.distance_id) : undefined
      if (dist?.name !== filterDistance) return false
    }
    if (filterGender !== 'all') {
      if (athlete?.gender !== filterGender) return false
    }
    return true
  })

  if (records.length === 0) {
    return <p className="text-gray-400 text-center text-sm py-8">ยังไม่มีผล</p>
  }

  return (
    <div className="w-full">
      {/* Filter bar */}
      {(distanceNames.length > 1 || genders.length > 0) && (
        <div className="flex gap-2 mb-3 flex-wrap">
          {distanceNames.length > 1 && (
            <select
              value={filterDistance}
              onChange={(e) => setFilterDistance(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none"
            >
              <option value="all">ทุกระยะ</option>
              {distanceNames.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          )}
          {genders.length > 0 && (
            <select
              value={filterGender}
              onChange={(e) => setFilterGender(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none"
            >
              <option value="all">ทุกเพศ</option>
              {genders.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          )}
        </div>
      )}

      {/* Table header */}
      <div className="grid grid-cols-[2rem_3rem_1fr_4rem_3rem_3rem] text-xs text-gray-400 font-medium uppercase tracking-wider pb-2 border-b border-gray-100 gap-1">
        <span>#</span>
        <span>บิบ</span>
        <span>ชื่อ</span>
        <span className="text-right">เวลาสุทธิ</span>
        <span className="text-center">OA</span>
        <span className="text-center">DIV</span>
      </div>

      {filtered.map((r, i) => {
        const athlete = athleteByBib.get(r.bib_number)
        const dist = athlete ? distanceById.get(athlete.distance_id) : undefined
        const startTime = getDistanceStartTime(r.bib_number, athletes, distances)
        const netMs = startTime ? calcNetTime(startTime, r.finish_time) : null
        const ranks = rankMap.get(r.bib_number)

        return (
          <div key={r.id} className="grid grid-cols-[2rem_3rem_1fr_4rem_3rem_3rem] py-3 border-b border-gray-50 text-sm gap-1 items-center">
            <span className="text-gray-400 font-medium text-xs">{i + 1}</span>
            <span className="font-mono font-semibold text-xs">{r.bib_number}</span>
            <div className="min-w-0">
              <p className="truncate text-xs">{athlete?.name || '—'}</p>
              {dist && <p className="text-xs text-gray-400">{dist.name}{athlete?.age_group ? ` · ${athlete.age_group}` : ''}</p>}
            </div>
            <span className="font-mono text-right text-xs">
              {netMs !== null ? formatNetTime(netMs) : '—'}
            </span>
            <span className="text-center text-xs text-gray-500">
              {ranks?.overallRank ?? '—'}
            </span>
            <span className="text-center text-xs text-gray-500">
              {ranks?.divisionRank ?? '—'}
            </span>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Update `app/event/[id]/results/page.tsx`**

Replace the entire file:

```tsx
'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import ResultsTable from '@/components/ResultsTable'
import ConflictsPanel from '@/components/ConflictsPanel'
import type { Event, FinishRecord, SyncConflict, EventDistance, Athlete, SubgroupPrizeOverride } from '@/types'
import type { RankMap } from '@/lib/ranking'
import { supabase } from '@/lib/supabase'
import { getEvent, getDistancesForEvent, getAthletesForEvent, getSubgroupOverrides, getFinishRecords } from '@/lib/db'
import { getEventById, saveEvent, getDistances, saveDistances, getAthletes, saveAthletes } from '@/lib/storage'
import { computeRanks } from '@/lib/ranking'

export default function ResultsPage() {
  const { id } = useParams<{ id: string }>()
  const [event, setEvent] = useState<Event | null>(null)
  const [records, setRecords] = useState<FinishRecord[]>([])
  const [distances, setDistances] = useState<EventDistance[]>([])
  const [athletes, setAthletes] = useState<Athlete[]>([])
  const [overrides, setOverrides] = useState<SubgroupPrizeOverride[]>([])
  const [rankMap, setRankMap] = useState<RankMap>(new Map())
  const [conflicts, setConflicts] = useState<SyncConflict[]>([])

  async function loadData() {
    // Event
    const local = getEventById(id)
    const ev = local ?? await getEvent(id)
    if (!ev) return
    if (!local) saveEvent(ev)
    setEvent(ev)

    // Distances + athletes (online preferred)
    let dists: EventDistance[]
    let aths: Athlete[]
    if (navigator.onLine) {
      ;[dists, aths] = await Promise.all([getDistancesForEvent(id), getAthletesForEvent(id)])
      saveDistances(id, dists); saveAthletes(id, aths)
    } else {
      dists = getDistances(id); aths = getAthletes(id)
    }
    setDistances(dists); setAthletes(aths)

    // Overrides
    let ovrs: SubgroupPrizeOverride[] = []
    if (navigator.onLine) { ovrs = await getSubgroupOverrides(id) }
    setOverrides(ovrs)

    // Records
    const recs = await getFinishRecords(id)
    setRecords(recs)

    // Sync pending
    const { syncPendingRecords } = await import('@/lib/sync')
    await syncPendingRecords(id, (conflict) => setConflicts((prev) => [...prev, conflict]))
  }

  useEffect(() => {
    loadData()
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        setDistances(getDistances(id)); setAthletes(getAthletes(id))
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [id])

  // Recompute ranks when inputs change
  useEffect(() => {
    if (!event) return
    setRankMap(computeRanks(records, athletes, distances, overrides, event.overall_lockout))
  }, [records, athletes, distances, overrides, event])

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`results-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'finish_records', filter: `event_id=eq.${id}` }, () => {
        getFinishRecords(id).then(setRecords)
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [id])

  if (!event) {
    return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-400">กำลังโหลด...</p></div>
  }

  return (
    <main className="px-6 pt-8 pb-6 max-w-sm mx-auto">
      <h1 className="text-2xl font-semibold tracking-tight mb-1">ผลการแข่งขัน</h1>
      <p className="text-sm text-gray-400 mb-6">{event.name}</p>
      <ConflictsPanel conflicts={conflicts} timezone={event.timezone} />
      <div className="mt-4">
        <ResultsTable
          records={records}
          event={event}
          athletes={athletes}
          distances={distances}
          rankMap={rankMap}
        />
      </div>
    </main>
  )
}
```

- [ ] **Step 3: Verify TS compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 4: Commit**

```bash
git add components/ResultsTable.tsx app/event/\[id\]/results/page.tsx
git commit -m "feat: update ResultsTable with filter bar + Overall/Division columns; wire results page"
```

---

## Task 12: Export Page Update + Final Cleanup

**Files:**
- Modify: `app/event/[id]/export/page.tsx`
- Modify: `types/index.ts` (remove `start_time?`)

- [ ] **Step 1: Update `app/event/[id]/export/page.tsx`**

Replace the entire file:

```tsx
'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import type { Event, FinishRecord, EventDistance, Athlete, SubgroupPrizeOverride } from '@/types'
import { getEvent, getDistancesForEvent, getAthletesForEvent, getSubgroupOverrides, getFinishRecords } from '@/lib/db'
import { getEventById, saveEvent, getDistances, saveDistances, getAthletes, saveAthletes } from '@/lib/storage'
import { generateCsv, downloadCsv } from '@/lib/export'
import { computeRanks } from '@/lib/ranking'
import { Download } from 'lucide-react'

export default function ExportPage() {
  const { id } = useParams<{ id: string }>()
  const [event, setEvent] = useState<Event | null>(null)
  const [records, setRecords] = useState<FinishRecord[]>([])
  const [distances, setDistances] = useState<EventDistance[]>([])
  const [athletes, setAthletes] = useState<Athlete[]>([])
  const [overrides, setOverrides] = useState<SubgroupPrizeOverride[]>([])

  useEffect(() => {
    async function load() {
      const local = getEventById(id)
      const ev = local ?? await getEvent(id)
      if (!ev) return
      if (!local) saveEvent(ev)
      setEvent(ev)

      let dists: EventDistance[]
      let aths: Athlete[]
      if (navigator.onLine) {
        ;[dists, aths] = await Promise.all([getDistancesForEvent(id), getAthletesForEvent(id)])
        saveDistances(id, dists); saveAthletes(id, aths)
      } else {
        dists = getDistances(id); aths = getAthletes(id)
      }
      setDistances(dists); setAthletes(aths)

      if (navigator.onLine) {
        setOverrides(await getSubgroupOverrides(id))
      }

      setRecords(await getFinishRecords(id))
    }
    load()
  }, [id])

  function handleDownload() {
    if (!event) return
    const rankMap = computeRanks(records, athletes, distances, overrides, event.overall_lockout)
    const csv = generateCsv(records, event, athletes, distances, rankMap)
    // Filename: use earliest distance start_time date
    const sorted = [...distances].sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
    const date = sorted[0]?.start_time.slice(0, 10) ?? new Date().toISOString().slice(0, 10)
    downloadCsv(csv, `timing-${date}.csv`)
  }

  if (!event) {
    return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-400">กำลังโหลด...</p></div>
  }

  return (
    <main className="px-6 pt-8 pb-6 max-w-sm mx-auto">
      <h1 className="text-2xl font-semibold tracking-tight mb-1">ส่งออก CSV</h1>
      <p className="text-sm text-gray-400 mb-6">{event.name}</p>

      <div className="bg-gray-50 rounded-2xl p-4 mb-6 text-sm space-y-1">
        <p className="text-gray-500">จำนวนบันทึก: <span className="font-semibold text-gray-900">{records.length} คน</span></p>
        <p className="text-gray-500">จำนวนนักกีฬา: <span className="font-semibold text-gray-900">{athletes.length} คน</span></p>
        {distances.map((d) => (
          <p key={d.id} className="text-gray-500">
            {d.name}: <span className="font-mono font-semibold text-gray-900">
              {new Intl.DateTimeFormat('en-GB', { timeZone: event.timezone, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(d.start_time))}
            </span>
          </p>
        ))}
      </div>

      <button
        onClick={handleDownload}
        disabled={records.length === 0}
        className="w-full bg-black text-white rounded-xl py-4 text-base font-medium disabled:opacity-40 flex items-center justify-center gap-2"
      >
        <Download size={18} /> ดาวน์โหลด CSV
      </button>

      <p className="mt-4 text-xs text-gray-400 text-center">
        คอลัมน์: bib, name, distance, gender, age_group, finish_time, net_time, overall_rank, division_rank
      </p>
    </main>
  )
}
```

- [ ] **Step 2: Remove `start_time?` from `Event` type**

Update `types/index.ts` — remove the `start_time?` line from `Event`:

```ts
export interface Event {
  id: string
  name: string
  // start_time removed — use event_distances.start_time
  timezone: string
  overall_lockout: boolean
}
```

- [ ] **Step 3: Verify TS compiles cleanly**

```bash
npx tsc --noEmit 2>&1
```

Expected: zero errors. If any remain, they are references to `event.start_time` that were missed — fix each one.

- [ ] **Step 4: Run all tests**

```bash
npx vitest run
```

Expected: all PASS. If `__tests__/storage.test.ts` or `__tests__/db.test.ts` fail due to `start_time` in fixtures, remove `start_time` from those fixtures.

- [ ] **Step 5: Build check**

```bash
npm run build 2>&1 | tail -20
```

Expected: Build succeeded

- [ ] **Step 6: Commit**

```bash
git add app/event/\[id\]/export/page.tsx types/index.ts
git commit -m "feat: update export page with distances/athletes/rankings; remove Event.start_time"
```

---

## Done

All tasks complete. Run the final test + build check:

```bash
npx vitest run && npm run build
```

Then use `superpowers:finishing-a-development-branch` to complete the branch.
