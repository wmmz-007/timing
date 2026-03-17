# Event Management Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add event list, edit, and delete to the home page via a state machine, with a new `EventEditForm` component and supporting DB/storage functions.

**Architecture:** Home page gains a `mode: 'list' | 'create' | 'edit'` state machine — all event management happens on one page. A new `EventEditForm` component handles pre-filled edit with distance reconciliation. Five new DB functions and one storage function are added. A migration adds `created_at` to the `events` table for ordering.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind v4, Supabase, Vitest + @testing-library/react

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `supabase/migrations/003_add_created_at.sql` | Create | Add `created_at` column to `events` table |
| `lib/db.ts` | Modify | Add `getEvents`, `updateEventName`, `deleteEvent`, `getEventStats`, `deleteDistance` |
| `lib/storage.ts` | Modify | Add `clearEventCache` |
| `components/DistanceList.tsx` | Modify | Add `distanceId?: string` to `DistanceRow` interface |
| `components/EventEditForm.tsx` | Create | Pre-filled edit form with distance reconciliation |
| `app/page.tsx` | Modify | State machine: list / create / edit modes |
| `__tests__/db.test.ts` | Modify | Tests for 5 new DB functions |
| `__tests__/storage.test.ts` | Modify | Test for `clearEventCache` |
| `__tests__/event-edit-form.test.tsx` | Create | Component tests for `EventEditForm` |

---

## Task 1: Migration + DB Functions

**Files:**
- Create: `supabase/migrations/003_add_created_at.sql`
- Modify: `lib/db.ts`
- Modify: `__tests__/db.test.ts`

### Background

The `events` table currently has columns: `id, name, timezone, overall_lockout`. It has no timestamp for ordering. The `Event` TypeScript interface does **not** need a `created_at` field — the column is used only for DB-side ordering; no frontend code reads it. `getEvents()` casts to `Event[]` and the extra field is ignored at the type level. The `athletes.distance_id` FK is `ON DELETE RESTRICT` — this means `DELETE FROM events` cascades to `event_distances` but fails on `athletes`. So `deleteEvent` must delete athletes first.

- [ ] **Step 1: Write failing tests for the 5 new DB functions**

Add these `describe` blocks to `__tests__/db.test.ts`. Add the new imports at the top:

```ts
import {
  // ... existing imports ...
  getEvents, updateEventName, deleteEvent, getEventStats, deleteDistance,
} from '@/lib/db'
```

Tests to append to the file:

```ts
describe('getEvents', () => {
  it('returns all events ordered by created_at desc', async () => {
    const mockEvents = [
      { id: 'e1', name: 'Event 1', timezone: 'Asia/Bangkok', overall_lockout: false, created_at: '2026-03-17T10:00:00Z' },
      { id: 'e2', name: 'Event 2', timezone: 'Asia/Bangkok', overall_lockout: false, created_at: '2026-03-16T10:00:00Z' },
    ]
    const chain = mockChain({ data: mockEvents, error: null })
    vi.mocked(supabase.from).mockReturnValue(chain as unknown as ReturnType<typeof supabase.from>)
    const result = await getEvents()
    expect(result).toEqual(mockEvents)
    expect(chain.order).toHaveBeenCalledWith('created_at', { ascending: false })
  })

  it('returns empty array when no events', async () => {
    const chain = mockChain({ data: [], error: null })
    vi.mocked(supabase.from).mockReturnValue(chain as unknown as ReturnType<typeof supabase.from>)
    const result = await getEvents()
    expect(result).toEqual([])
  })
})

describe('updateEventName', () => {
  it('updates the event name', async () => {
    const chain = mockChain({ error: null })
    vi.mocked(supabase.from).mockReturnValue(chain as unknown as ReturnType<typeof supabase.from>)
    await updateEventName('evt-1', 'New Name')
    expect(vi.mocked(supabase.from)).toHaveBeenCalledWith('events')
    expect(chain.update).toHaveBeenCalledWith({ name: 'New Name' })
    expect(chain.eq).toHaveBeenCalledWith('id', 'evt-1')
  })

  it('throws on error', async () => {
    const chain = mockChain({ error: { message: 'db error' } })
    vi.mocked(supabase.from).mockReturnValue(chain as unknown as ReturnType<typeof supabase.from>)
    await expect(updateEventName('evt-1', 'x')).rejects.toMatchObject({ message: 'db error' })
  })
})

describe('deleteEvent', () => {
  it('deletes athletes first then event', async () => {
    const athleteChain = mockChain({ error: null })
    const eventChain = mockChain({ error: null })
    vi.mocked(supabase.from)
      .mockReturnValueOnce(athleteChain as unknown as ReturnType<typeof supabase.from>)
      .mockReturnValueOnce(eventChain as unknown as ReturnType<typeof supabase.from>)
    await deleteEvent('evt-1')
    expect(vi.mocked(supabase.from)).toHaveBeenNthCalledWith(1, 'athletes')
    expect(vi.mocked(supabase.from)).toHaveBeenNthCalledWith(2, 'events')
    expect(athleteChain.eq).toHaveBeenCalledWith('event_id', 'evt-1')
    expect(eventChain.eq).toHaveBeenCalledWith('id', 'evt-1')
  })

  it('throws if athlete delete fails', async () => {
    const athleteChain = mockChain({ error: { message: 'fail' } })
    vi.mocked(supabase.from).mockReturnValue(athleteChain as unknown as ReturnType<typeof supabase.from>)
    await expect(deleteEvent('evt-1')).rejects.toMatchObject({ message: 'fail' })
  })
})

describe('getEventStats', () => {
  it('returns record and athlete counts', async () => {
    const recordChain = mockChain({ count: 10, error: null })
    const athleteChain = mockChain({ count: 5, error: null })
    vi.mocked(supabase.from)
      .mockReturnValueOnce(recordChain as unknown as ReturnType<typeof supabase.from>)
      .mockReturnValueOnce(athleteChain as unknown as ReturnType<typeof supabase.from>)
    const result = await getEventStats('evt-1')
    expect(result).toEqual({ recordCount: 10, athleteCount: 5 })
  })

  it('returns zero counts when null', async () => {
    const recordChain = mockChain({ count: null, error: null })
    const athleteChain = mockChain({ count: null, error: null })
    vi.mocked(supabase.from)
      .mockReturnValueOnce(recordChain as unknown as ReturnType<typeof supabase.from>)
      .mockReturnValueOnce(athleteChain as unknown as ReturnType<typeof supabase.from>)
    const result = await getEventStats('evt-1')
    expect(result).toEqual({ recordCount: 0, athleteCount: 0 })
  })
})

describe('deleteDistance', () => {
  it('deletes distance by id', async () => {
    const chain = mockChain({ error: null })
    vi.mocked(supabase.from).mockReturnValue(chain as unknown as ReturnType<typeof supabase.from>)
    await deleteDistance('dist-1')
    expect(vi.mocked(supabase.from)).toHaveBeenCalledWith('event_distances')
    expect(chain.eq).toHaveBeenCalledWith('id', 'dist-1')
  })

  it('throws when athletes exist (RESTRICT)', async () => {
    const chain = mockChain({ error: { message: 'violates foreign key constraint', code: '23503' } })
    vi.mocked(supabase.from).mockReturnValue(chain as unknown as ReturnType<typeof supabase.from>)
    await expect(deleteDistance('dist-1')).rejects.toMatchObject({ code: '23503' })
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd /Users/wichita.pum/Desktop/entrepreneur/Timing
npx vitest run __tests__/db.test.ts 2>&1 | tail -20
```

Expected: FAIL (functions not defined yet)

- [ ] **Step 3: Create migration file**

Create `supabase/migrations/003_add_created_at.sql`:

```sql
-- Run once: adds created_at to events for ordering on home page
ALTER TABLE events ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
```

- [ ] **Step 4: Add 5 functions to `lib/db.ts`**

Append after the `updateEventLockout` function (after line 36), before the `// ---- Distances ----` comment:

```ts
export async function getEvents(): Promise<Event[]> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Event[]
}

export async function updateEventName(id: string, name: string): Promise<void> {
  const { error } = await supabase
    .from('events')
    .update({ name })
    .eq('id', id)
  if (error) throw error
}

export async function deleteEvent(id: string): Promise<void> {
  // Must delete athletes first — athletes.distance_id → event_distances is ON DELETE RESTRICT
  const { error: err1 } = await supabase.from('athletes').delete().eq('event_id', id)
  if (err1) throw err1
  const { error: err2 } = await supabase.from('events').delete().eq('id', id)
  if (err2) throw err2
}

export async function getEventStats(id: string): Promise<{ recordCount: number; athleteCount: number }> {
  const [recordRes, athleteRes] = await Promise.all([
    supabase.from('finish_records').select('*', { count: 'exact', head: true }).eq('event_id', id),
    supabase.from('athletes').select('*', { count: 'exact', head: true }).eq('event_id', id),
  ])
  if (recordRes.error) throw recordRes.error
  if (athleteRes.error) throw athleteRes.error
  return { recordCount: recordRes.count ?? 0, athleteCount: athleteRes.count ?? 0 }
}
```

Append after `deleteDistanceAndAthletes` (after line 84):

```ts
export async function deleteDistance(id: string): Promise<void> {
  // Plain delete — throws if athletes reference this distance (ON DELETE RESTRICT)
  const { error } = await supabase.from('event_distances').delete().eq('id', id)
  if (error) throw error
}
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
npx vitest run __tests__/db.test.ts 2>&1 | tail -20
```

Expected: all DB tests pass

- [ ] **Step 6: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep -v '__tests__/db.test.ts'
```

Expected: zero errors (the pre-existing db.test.ts error is acceptable)

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/003_add_created_at.sql lib/db.ts __tests__/db.test.ts
git commit -m "feat: add getEvents, updateEventName, deleteEvent, getEventStats, deleteDistance; add created_at migration"
```

---

## Task 2: Storage `clearEventCache` + DistanceRow `distanceId?`

**Files:**
- Modify: `lib/storage.ts`
- Modify: `components/DistanceList.tsx`
- Modify: `__tests__/storage.test.ts`

### Background

`clearEventCache` removes all 4 LocalStorage keys for an event. The key names are defined by the private helper functions already in `lib/storage.ts`: `pendingKey`, `eventKey`, `distancesKey`, `athletesKey`.

`DistanceRow` gains an optional `distanceId?` so `EventEditForm` can tag rows loaded from DB. The `DistanceList` component ignores this field (spread-preserves it through `update()`).

- [ ] **Step 1: Write failing test for `clearEventCache`**

Add to `__tests__/storage.test.ts` (append after existing tests):

```ts
import {
  // ...existing imports...
  clearEventCache,
} from '@/lib/storage'

describe('clearEventCache', () => {
  it('removes all 4 LocalStorage keys for an event', () => {
    localStorage.setItem('timing:event:e1', '{"id":"e1"}')
    localStorage.setItem('timing:pending:e1', '[]')
    localStorage.setItem('timing:distances:e1', '[]')
    localStorage.setItem('timing:athletes:e1', '[]')
    // Keys for a different event — must NOT be removed
    localStorage.setItem('timing:event:e2', '{"id":"e2"}')

    clearEventCache('e1')

    expect(localStorage.getItem('timing:event:e1')).toBeNull()
    expect(localStorage.getItem('timing:pending:e1')).toBeNull()
    expect(localStorage.getItem('timing:distances:e1')).toBeNull()
    expect(localStorage.getItem('timing:athletes:e1')).toBeNull()
    // Other event untouched
    expect(localStorage.getItem('timing:event:e2')).not.toBeNull()
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npx vitest run __tests__/storage.test.ts 2>&1 | tail -10
```

Expected: FAIL (`clearEventCache` not defined)

- [ ] **Step 3: Add `clearEventCache` to `lib/storage.ts`**

Append at the end of `lib/storage.ts`:

```ts
export function clearEventCache(eventId: string): void {
  localStorage.removeItem(pendingKey(eventId))
  localStorage.removeItem(eventKey(eventId))
  localStorage.removeItem(distancesKey(eventId))
  localStorage.removeItem(athletesKey(eventId))
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
npx vitest run __tests__/storage.test.ts 2>&1 | tail -10
```

Expected: all storage tests pass

- [ ] **Step 5: Add `distanceId?` to `DistanceRow` in `components/DistanceList.tsx`**

Change the `DistanceRow` interface (lines 4-8):

```ts
export interface DistanceRow {
  key: string        // client-side stable ID (crypto.randomUUID())
  distanceId?: string  // present for rows loaded from DB; absent for new rows added in UI
  name: string
  time: string       // HH:MM
}
```

No other changes to `DistanceList.tsx`. The `update()` function already uses `{ ...r, [field]: value }` which preserves `distanceId`.

- [ ] **Step 6: Verify existing tests still pass**

```bash
npx vitest run __tests__/storage.test.ts __tests__/capture-screen.test.tsx 2>&1 | tail -10
```

Expected: all pass (the `distanceId` change is non-breaking — field is optional)

- [ ] **Step 7: Commit**

```bash
git add lib/storage.ts __tests__/storage.test.ts components/DistanceList.tsx
git commit -m "feat: add clearEventCache; add distanceId field to DistanceRow"
```

---

## Task 3: EventEditForm Component

**Files:**
- Create: `components/EventEditForm.tsx`
- Create: `__tests__/event-edit-form.test.tsx`

### Background

`EventEditForm` pre-fills from the event's existing distances. It uses `Intl.DateTimeFormat` to convert UTC `start_time` values to Bangkok local date/time for the pickers. On save it reconciles: update existing rows (have `distanceId`), insert new rows (no `distanceId`), delete removed rows (plain `deleteDistance` — throws if athletes exist, shown as inline error).

Key conversion helpers (inline in the component):

```ts
// Convert ISO timestamptz → Bangkok local date (YYYY-MM-DD) and time (HH:MM)
function isoToLocalParts(iso: string): { date: string; time: string } {
  const d = new Date(iso)
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d)
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d)
  return { date, time }
}
```

`en-CA` produces `YYYY-MM-DD`; `en-GB` with hour+minute produces `HH:MM`.

- [ ] **Step 1: Write failing tests**

Create `__tests__/event-edit-form.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import type { Event, EventDistance } from '@/types'

vi.mock('@/lib/db', () => ({
  getDistancesForEvent: vi.fn(),
  updateEventName: vi.fn(),
  updateDistance: vi.fn(),
  addDistance: vi.fn(),
  deleteDistance: vi.fn(),
}))

vi.mock('@/lib/storage', () => ({
  saveEvent: vi.fn(),
  saveDistances: vi.fn(),
}))

import {
  getDistancesForEvent,
  updateEventName,
  updateDistance,
  addDistance,
  deleteDistance,
} from '@/lib/db'
import EventEditForm from '@/components/EventEditForm'

const mockEvent: Event = {
  id: 'evt-1',
  name: 'Test Event',
  timezone: 'Asia/Bangkok',
  overall_lockout: false,
}

// 2026-03-17T00:00:00Z = 07:00 Bangkok time
const mockDistances: EventDistance[] = [
  {
    id: 'dist-1',
    event_id: 'evt-1',
    name: '10K',
    start_time: '2026-03-17T00:00:00.000Z',
    overall_top_n: 3,
    default_top_n: 3,
  },
]

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getDistancesForEvent).mockResolvedValue(mockDistances)
  vi.mocked(updateEventName).mockResolvedValue(undefined)
  vi.mocked(updateDistance).mockResolvedValue(undefined)
  vi.mocked(addDistance).mockResolvedValue(mockDistances[0])
  vi.mocked(deleteDistance).mockResolvedValue(undefined)
})

describe('EventEditForm', () => {
  it('shows loading then pre-filled form with event name', async () => {
    render(<EventEditForm event={mockEvent} onSaved={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByText('กำลังโหลด...')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByDisplayValue('Test Event')).toBeInTheDocument())
    // Distance name should also be pre-filled
    expect(screen.getByDisplayValue('10K')).toBeInTheDocument()
  })

  it('calls onCancel when cancel button clicked', async () => {
    const onCancel = vi.fn()
    render(<EventEditForm event={mockEvent} onSaved={vi.fn()} onCancel={onCancel} />)
    await waitFor(() => screen.getByText('‹ ยกเลิก'))
    fireEvent.click(screen.getByText('‹ ยกเลิก'))
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('skips updateEventName when name unchanged', async () => {
    const onSaved = vi.fn()
    render(<EventEditForm event={mockEvent} onSaved={onSaved} onCancel={vi.fn()} />)
    await waitFor(() => screen.getByDisplayValue('Test Event'))
    fireEvent.click(screen.getByRole('button', { name: /บันทึก/i }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(updateEventName).not.toHaveBeenCalled()
  })

  it('calls updateEventName when name changed', async () => {
    const onSaved = vi.fn()
    render(<EventEditForm event={mockEvent} onSaved={onSaved} onCancel={vi.fn()} />)
    await waitFor(() => screen.getByDisplayValue('Test Event'))
    fireEvent.change(screen.getByDisplayValue('Test Event'), { target: { value: 'New Name' } })
    fireEvent.click(screen.getByRole('button', { name: /บันทึก/i }))
    await waitFor(() => expect(updateEventName).toHaveBeenCalledWith('evt-1', 'New Name'))
    expect(onSaved).toHaveBeenCalled()
  })

  it('calls updateDistance for existing distance row', async () => {
    const onSaved = vi.fn()
    render(<EventEditForm event={mockEvent} onSaved={onSaved} onCancel={vi.fn()} />)
    await waitFor(() => screen.getByDisplayValue('10K'))
    fireEvent.click(screen.getByRole('button', { name: /บันทึก/i }))
    await waitFor(() => expect(updateDistance).toHaveBeenCalledWith('dist-1', expect.objectContaining({ name: '10K' })))
    expect(onSaved).toHaveBeenCalled()
  })

  it('calls onCancel when no distances returned (stale event)', async () => {
    vi.mocked(getDistancesForEvent).mockResolvedValue([])
    const onCancel = vi.fn()
    render(<EventEditForm event={mockEvent} onSaved={vi.fn()} onCancel={onCancel} />)
    await waitFor(() => expect(onCancel).toHaveBeenCalledOnce())
  })

  it('shows inline error when deleteDistance throws (RESTRICT)', async () => {
    vi.mocked(deleteDistance).mockRejectedValue({ code: '23503', message: 'FK violation' })
    // Provide distances with an extra one that will be deleted
    vi.mocked(getDistancesForEvent).mockResolvedValue([
      ...mockDistances,
      { id: 'dist-2', event_id: 'evt-1', name: '5K', start_time: '2026-03-17T01:00:00.000Z', overall_top_n: 3, default_top_n: 3 },
    ])
    render(<EventEditForm event={mockEvent} onSaved={vi.fn()} onCancel={vi.fn()} />)
    await waitFor(() => screen.getAllByRole('button', { name: /remove distance/i }))
    // Remove the second distance row (5K)
    const removeBtns = screen.getAllByRole('button', { name: /remove distance/i })
    fireEvent.click(removeBtns[1])
    fireEvent.click(screen.getByRole('button', { name: /บันทึก/i }))
    await waitFor(() => expect(screen.getByText(/ลบระยะ.*ไม่ได้/)).toBeInTheDocument())
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npx vitest run __tests__/event-edit-form.test.tsx 2>&1 | tail -20
```

Expected: FAIL (component doesn't exist)

- [ ] **Step 3: Create `components/EventEditForm.tsx`**

```tsx
'use client'
import { useState, useEffect } from 'react'
import type { Event, EventDistance } from '@/types'
import DistanceList, { type DistanceRow, rowToStartTime } from './DistanceList'

interface Props {
  event: Event
  onSaved: () => void
  onCancel: () => void
}

function isoToLocalParts(iso: string): { date: string; time: string } {
  const d = new Date(iso)
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d)
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d)
  return { date, time }
}

export default function EventEditForm({ event, onSaved, onCancel }: Props) {
  const [name, setName] = useState(event.name)
  const [date, setDate] = useState('')
  const [distances, setDistances] = useState<DistanceRow[]>([])
  const [originalDistances, setOriginalDistances] = useState<Map<string, string>>(new Map()) // distanceId → name
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleteErrors, setDeleteErrors] = useState<string[]>([])

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { getDistancesForEvent } = await import('@/lib/db')
      const dists = await getDistancesForEvent(event.id)
      if (cancelled) return

      // Derive form date from earliest distance (Bangkok local date)
      const sorted = [...dists].sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
      const derivedDate = sorted[0]
        ? isoToLocalParts(sorted[0].start_time).date
        : new Date().toISOString().slice(0, 10)

      // Map to DistanceRow with distanceId + Bangkok local time
      const rows: DistanceRow[] = dists.map((d) => ({
        key: d.id,
        distanceId: d.id,
        name: d.name,
        time: isoToLocalParts(d.start_time).time,
      }))

      // Stale edit guard: if no distances, event was deleted on another device
      if (dists.length === 0) {
        onCancel()
        return
      }

      setDate(derivedDate)
      setDistances(rows)
      setOriginalDistances(new Map(dists.map((d) => [d.id, d.name])))
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [event.id])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setDeleteErrors([])

    try {
      const { updateEventName, updateDistance, addDistance, deleteDistance, getDistancesForEvent } = await import('@/lib/db')
      const { saveEvent, saveDistances } = await import('@/lib/storage')

      // 1. Update name if changed
      if (name !== event.name) {
        await updateEventName(event.id, name)
      }

      // 2. Determine deleted rows (had distanceId, now absent)
      const currentIds = new Set(distances.filter((r) => r.distanceId).map((r) => r.distanceId as string))
      const deletedIds = [...originalDistances.keys()].filter((id) => !currentIds.has(id))

      const errs: string[] = []
      for (const distId of deletedIds) {
        try {
          await deleteDistance(distId)
        } catch {
          const distName = originalDistances.get(distId) ?? distId
          errs.push(`ลบระยะ "${distName}" ไม่ได้ เนื่องจากมีนักกีฬา กรุณาจัดการใน Settings`)
        }
      }

      // 3. Update existing + insert new rows
      for (const row of distances) {
        const startTime = rowToStartTime(date, row.time)
        if (row.distanceId) {
          await updateDistance(row.distanceId, { name: row.name, start_time: startTime })
        } else {
          await addDistance(event.id, row.name, startTime)
        }
      }

      // 4. Update caches
      saveEvent({ ...event, name })
      const refreshed = await getDistancesForEvent(event.id)
      saveDistances(event.id, refreshed)

      if (errs.length > 0) {
        setDeleteErrors(errs)
        return // stay on form to show errors; other changes already saved
      }

      onSaved()
    } catch {
      setError('บันทึกไม่ได้ กรุณาลองใหม่')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button type="button" onClick={onCancel} className="text-sm text-gray-400">
          ‹ ยกเลิก
        </button>
        <h2 className="text-lg font-semibold">แก้ไขงาน</h2>
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm text-center py-8">กำลังโหลด...</p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ชื่องาน</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
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

          {deleteErrors.length > 0 && (
            <div className="rounded-xl bg-orange-50 border border-orange-100 px-4 py-3 space-y-1">
              {deleteErrors.map((msg, i) => (
                <p key={i} className="text-sm text-orange-700">{msg}</p>
              ))}
              <p className="text-xs text-orange-500 mt-1">การเปลี่ยนแปลงอื่นๆ ถูกบันทึกแล้ว</p>
            </div>
          )}

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-black text-white rounded-xl py-4 text-base font-medium disabled:opacity-50"
          >
            {saving ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </form>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npx vitest run __tests__/event-edit-form.test.tsx 2>&1 | tail -20
```

Expected: all 6 tests pass

- [ ] **Step 5: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep -v '__tests__/db.test.ts'
```

Expected: zero errors

- [ ] **Step 6: Commit**

```bash
git add components/EventEditForm.tsx __tests__/event-edit-form.test.tsx
git commit -m "feat: add EventEditForm component with distance reconciliation"
```

---

## Task 4: Home Page State Machine

**Files:**
- Modify: `app/page.tsx`

### Background

The home page replaces its single-button layout with a state machine. `mode: 'list' | 'create' | 'edit'` controls which view renders. The list view shows all events from Supabase with ✏️ and 🗑️ buttons. Delete shows a confirmation panel inline with record/athlete counts. No new route required.

- [ ] **Step 1: Replace `app/page.tsx`**

```tsx
'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Timer, Pencil, Trash2 } from 'lucide-react'
import EventSetupForm from '@/components/EventSetupForm'
import EventEditForm from '@/components/EventEditForm'
import type { Event } from '@/types'

type Mode = 'list' | 'create' | 'edit'

export default function HomePage() {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('list')
  const [events, setEvents] = useState<Event[]>([])
  const [editingEvent, setEditingEvent] = useState<Event | null>(null)
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deleteStats, setDeleteStats] = useState<{ recordCount: number; athleteCount: number } | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)

  async function loadEvents() {
    setListLoading(true)
    setListError(false)
    try {
      const { getEvents } = await import('@/lib/db')
      setEvents(await getEvents())
    } catch {
      setListError(true)
    } finally {
      setListLoading(false)
    }
  }

  useEffect(() => { loadEvents() }, [])

  function handleCreated(event: Event) {
    router.push(`/event/${event.id}`)
  }

  function handleEditClick(event: Event) {
    setEditingEvent(event)
    setMode('edit')
  }

  function handleSaved() {
    setMode('list')
    setEditingEvent(null)
    loadEvents()
  }

  async function handleDeleteClick(event: Event) {
    setConfirmDeleteId(event.id)
    setDeleteStats(null)
    setStatsLoading(true)
    try {
      const { getEventStats } = await import('@/lib/db')
      setDeleteStats(await getEventStats(event.id))
    } finally {
      setStatsLoading(false)
    }
  }

  function handleDeleteCancel() {
    setConfirmDeleteId(null)
    setDeleteStats(null)
  }

  async function handleDeleteConfirm() {
    if (!confirmDeleteId) return
    const idToDelete = confirmDeleteId
    setConfirmDeleteId(null)
    setDeleteStats(null)
    const { deleteEvent } = await import('@/lib/db')
    const { clearEventCache } = await import('@/lib/storage')
    await deleteEvent(idToDelete)
    clearEventCache(idToDelete)
    setEvents((prev) => prev.filter((e) => e.id !== idToDelete))
  }

  if (mode === 'create') {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-sm">
          <button onClick={() => setMode('list')} className="mb-4 text-sm text-gray-400">
            ‹ ยกเลิก
          </button>
          <EventSetupForm onCreated={handleCreated} />
        </div>
      </main>
    )
  }

  if (mode === 'edit' && editingEvent) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-sm">
          <EventEditForm
            event={editingEvent}
            onSaved={handleSaved}
            onCancel={() => { setMode('list'); setEditingEvent(null) }}
          />
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-10 text-center">
          <Timer className="mx-auto text-gray-900" size={48} strokeWidth={1.5} />
          <h1 className="mt-4 text-3xl font-semibold tracking-tight">Timing</h1>
          <p className="mt-2 text-gray-500 text-sm">บันทึกเวลานักวิ่ง</p>
        </div>

        {listLoading ? (
          <p className="text-gray-400 text-sm text-center py-4">กำลังโหลด...</p>
        ) : listError ? (
          <div className="text-center py-4">
            <p className="text-gray-400 text-sm">โหลดไม่ได้ กรุณาลองใหม่</p>
            <button onClick={loadEvents} className="mt-2 text-sm text-black underline">
              ลองใหม่
            </button>
          </div>
        ) : events.length === 0 ? (
          <p className="text-gray-400 text-sm text-center mb-4">ยังไม่มีงาน</p>
        ) : (
          <div className="space-y-2 mb-4">
            {events.map((ev) => (
              <div key={ev.id}>
                <div className="flex items-center gap-1 bg-gray-50 rounded-2xl px-4 py-3.5 border border-gray-100">
                  <button
                    onClick={() => router.push(`/event/${ev.id}`)}
                    className="flex-1 text-left text-base font-medium truncate"
                  >
                    {ev.name}
                  </button>
                  <button
                    onClick={() => handleEditClick(ev)}
                    className="p-1.5 text-gray-400 hover:text-gray-700"
                    aria-label="แก้ไข"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => handleDeleteClick(ev)}
                    className="p-1.5 text-gray-400 hover:text-red-500"
                    aria-label="ลบ"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                {confirmDeleteId === ev.id && (
                  <div className="mt-1 rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm">
                    {statsLoading || !deleteStats ? (
                      <p className="text-gray-400 text-sm">กำลังโหลด...</p>
                    ) : (
                      <>
                        <p className="font-medium text-red-700">ลบงาน &quot;{ev.name}&quot;?</p>
                        <p className="text-red-600 mt-0.5 text-xs">
                          จะลบ {deleteStats.recordCount} บิบ และ {deleteStats.athleteCount} นักกีฬา — ไม่สามารถกู้คืนได้
                        </p>
                        <div className="flex gap-2 mt-2">
                          <button
                            onClick={handleDeleteConfirm}
                            className="bg-red-600 text-white rounded-lg px-3 py-1.5 text-sm font-medium"
                          >
                            ยืนยันลบ
                          </button>
                          <button
                            onClick={handleDeleteCancel}
                            className="text-gray-600 px-3 py-1.5 text-sm"
                          >
                            ยกเลิก
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <button
          onClick={() => setMode('create')}
          className="w-full bg-black text-white rounded-xl py-4 text-base font-medium"
        >
          + สร้างงานใหม่
        </button>
      </div>
    </main>
  )
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep -v '__tests__/db.test.ts'
```

Expected: zero errors

- [ ] **Step 3: Run all tests**

```bash
npx vitest run 2>&1 | tail -20
```

Expected: all tests pass

- [ ] **Step 4: Build check**

```bash
npm run build 2>&1 | tail -20
```

Expected: Build succeeded

- [ ] **Step 5: Commit**

```bash
git add "app/page.tsx"
git commit -m "feat: home page event list with edit/delete; state machine for create/edit modes"
```

---

## Done

All tasks complete. Run final check:

```bash
npx vitest run && npm run build
```

Then use `superpowers:finishing-a-development-branch` to complete the branch.
