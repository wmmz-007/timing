# Event Management Design Spec
**Date:** 2026-03-17
**Status:** Approved

---

## Overview

Replace the current single-button home page with a full event management screen: list existing events, create new ones, edit (name + date + distances), and delete with confirmation. All actions happen on the home page via a state machine — no new routes required.

---

## Problem Statement

The current home page only has "+ สร้างงานใหม่". Once an event is created, there is no way to return to it from the home page, rename it, change its distances, or delete it.

---

## Migration (`003_add_created_at.sql`)

The `events` table has no timestamp for ordering. Add one:

```sql
ALTER TABLE events ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
```

Single file, run once. Existing rows get `now()` as their `created_at` — acceptable since ordering only matters going forward.

---

## Home Page State Machine

`app/page.tsx` gains two new pieces of state:

```ts
type Mode = 'list' | 'create' | 'edit'
const [mode, setMode] = useState<Mode>('list')
const [editingEvent, setEditingEvent] = useState<Event | null>(null)
```

### Mode: `list`

- On mount: fetch all events from Supabase via `getEvents()` → display as list.
- Each item: event name (tappable → navigates to `/event/[id]`) + ✏️ edit button + 🗑️ delete button.
- Empty state: "ยังไม่มีงาน" with prompt to create.
- "+ สร้างงานใหม่" button below the list.
- Loading state while fetching.
- Network error: show "โหลดไม่ได้ กรุณาลองใหม่" with retry button.

### Mode: `create`

- "‹ ยกเลิก" button returns to `list`.
- Renders existing `EventSetupForm` — **no changes to `EventSetupForm`** (the new optional `distanceId` field on `DistanceRow` is ignored here; create rows never have a `distanceId`).
- On created: navigate to `/event/[id]` (same as current behaviour).

### Mode: `edit`

- "‹ ยกเลิก" button returns to `list`.
- Renders new `EventEditForm` with `editingEvent` prop.
- On save: return to `list` and refresh event list.

### Delete flow (triggered from `list` mode)

1. Fetch stats: `getEventStats(id)` → `{ recordCount, athleteCount }`.
2. Show inline confirmation below the list item:
   > "ลบงาน '[ชื่องาน]'? จะลบ X บิบ และ Y นักกีฬา ไม่สามารถกู้คืนได้"
3. Two buttons: "ยืนยันลบ" (destructive) and "ยกเลิก".
4. On confirm: `deleteEvent(id)` → remove from local list state → clear LocalStorage caches for that event.

**LocalStorage cleanup on delete:**
Remove all keys for the deleted event:
- `timing:event:{id}`
- `timing:pending:{id}`
- `timing:distances:{id}`
- `timing:athletes:{id}`

Add `clearEventCache(eventId)` to `lib/storage.ts`.

---

## New Component: `EventEditForm`

**File:** `components/EventEditForm.tsx`

**Props:**
```ts
interface Props {
  event: Event
  onSaved: () => void
  onCancel: () => void
}
```

**Behaviour:**
- On mount: fetch `getDistancesForEvent(event.id)` → populate `DistanceRow[]`.
  - Each row carries `distanceId: string` (the existing DB id) so save logic can distinguish existing vs new rows.
- Fields: event name input + date picker + `DistanceList`.
- Date is derived from the earliest distance `start_time` on first load: `[...distances].sort(asc)[0].start_time.slice(0, 10)`. If no distances, default to today.
- Minimum 1 distance enforced (same constraint as create form — `DistanceList` already prevents removing the last row).
- On save:
  1. `updateEventName(event.id, name)` if name changed.
  2. Reconcile distances:
     - Rows with `distanceId` → `updateDistance(distanceId, { name, start_time })` using existing function.
     - New rows (no `distanceId`) → `addDistance(event.id, name, start_time)` — positional args matching existing signature.
     - Deleted rows (present in original fetch, absent in current rows):
       - Call new `deleteDistance(distanceId)` (plain DELETE, no athlete cleanup).
       - If DB throws (RESTRICT — athletes exist): surface error inline "ลบระยะ [name] ไม่ได้ เนื่องจากมีนักกีฬา กรุณาจัดการใน Settings".
       - Other distances are still saved; only the failed deletion is reported.
  3. Update LocalStorage cache: `saveEvent` with updated name; `saveDistances` with refreshed list.
  4. Call `onSaved()`.

---

## `DistanceRow` type change (`components/DistanceList.tsx`)

Add optional `distanceId?`:

```ts
export interface DistanceRow {
  key: string
  distanceId?: string   // present for rows loaded from DB; absent for new rows added in UI
  name: string
  time: string
}
```

`EventSetupForm` is unchanged — it creates rows without `distanceId` (field is optional, no breakage).

---

## DB Functions (additions to `lib/db.ts`)

| Function | Description |
|---|---|
| `getEvents(): Promise<Event[]>` | `SELECT * FROM events ORDER BY created_at DESC` |
| `updateEventName(id: string, name: string): Promise<void>` | `UPDATE events SET name = $name WHERE id = $id` |
| `deleteEvent(id: string): Promise<void>` | Delete athletes first (`DELETE FROM athletes WHERE event_id = id`), then delete event (`DELETE FROM events WHERE id = id` — CASCADE removes event_distances) |
| `getEventStats(id: string): Promise<{ recordCount: number; athleteCount: number }>` | Two COUNT queries on `finish_records` and `athletes` filtered by `event_id` |
| `deleteDistance(id: string): Promise<void>` | Plain `DELETE FROM event_distances WHERE id = id` — throws if athletes exist (DB RESTRICT) |

**Note on `deleteEvent` cascade:**
`athletes.distance_id` → `event_distances` is `ON DELETE RESTRICT`. So `DELETE FROM events` alone would cascade to `event_distances` but fail on the RESTRICT. Therefore `deleteEvent` must first bulk-delete all athletes for the event, then delete the event (cascade handles event_distances).

`updateDistance` and `addDistance` already exist — reused as-is.

---

## Storage Function Addition (`lib/storage.ts`)

```ts
export function clearEventCache(eventId: string): void {
  localStorage.removeItem(`timing:event:${eventId}`)
  localStorage.removeItem(`timing:pending:${eventId}`)
  localStorage.removeItem(`timing:distances:${eventId}`)
  localStorage.removeItem(`timing:athletes:${eventId}`)
}
```

---

## Files Affected

| File | Change |
|---|---|
| `supabase/migrations/003_add_created_at.sql` | Add `created_at` column to `events` |
| `app/page.tsx` | Add state machine; render list / EventSetupForm / EventEditForm |
| `components/EventEditForm.tsx` | **New**: pre-filled edit form with distance reconciliation |
| `components/DistanceList.tsx` | Add optional `distanceId?` to `DistanceRow` interface |
| `lib/db.ts` | Add `getEvents`, `updateEventName`, `deleteEvent`, `getEventStats`, `deleteDistance` |
| `lib/storage.ts` | Add `clearEventCache` |

---

## Edge Cases

| Case | Behaviour |
|---|---|
| Delete event with athletes | `deleteEvent` deletes athletes first (bulk by event_id), then event; cascade removes distances |
| Edit: delete distance that has athletes | `deleteDistance` throws RESTRICT; error shown inline; other saves proceed |
| Edit: remove last distance | Blocked by `DistanceList` (min 1 row enforced) |
| No events in DB | Empty state "ยังไม่มีงาน" with create prompt |
| Network error loading list | "โหลดไม่ได้ กรุณาลองใหม่" with retry |
| Stale edit (event deleted by another device) | `getDistancesForEvent` returns empty → show "ไม่พบงานนี้แล้ว" and return to list |
| Edit: name unchanged, distances changed | `updateEventName` skipped; only distance reconciliation runs |
| Edit: no distances loaded (new event with 0 distances) | Date defaults to today; DistanceList starts with one empty row |
| Delete with LocalStorage cache | `clearEventCache` removes all 4 keys after successful delete |

---

## Out of Scope

- Timezone selection (hardcoded `Asia/Bangkok`)
- Duplicate/clone event
- Reordering events
- Prize config / divisions in the creation form (managed in Settings after creation)
