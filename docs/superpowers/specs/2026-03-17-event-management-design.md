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

### Mode: `create`

- "‹ ยกเลิก" button returns to `list`.
- Renders existing `EventSetupForm` (unchanged).
- On created: navigate to `/event/[id]` (same as current behaviour).

### Mode: `edit`

- "‹ ยกเลิก" button returns to `list`.
- Renders new `EventEditForm` with `editingEvent` prop.
- On save: return to `list` and refresh event list.

### Delete flow (triggered from `list` mode)

1. Fetch stats: `getEventStats(id)` → `{ recordCount, athleteCount }`.
2. Show inline confirmation (not a modal — just a confirmation state in the list item or a small dialog section):
   > "ลบงาน '[ชื่องาน]'? จะลบ X บิบ และ Y นักกีฬา ไม่สามารถกู้คืนได้"
3. Two buttons: "ยืนยันลบ" (destructive) and "ยกเลิก".
4. On confirm: `deleteEvent(id)` → remove from local list state.

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
  - Each row carries `distanceId?: string` (the existing DB id) so save logic can distinguish existing vs new rows.
- Fields: event name input + date picker + `DistanceList`.
- Date is derived from the earliest distance `start_time` on first load: `distances.sort ASC [0].start_time.slice(0, 10)`.
- On save:
  1. `updateEventName(event.id, name)` if name changed.
  2. Reconcile distances:
     - Rows with `distanceId` → `updateDistance(distanceId, { name, start_time })`.
     - New rows (no `distanceId`) → `addDistance(event.id, { name, start_time })`.
     - Deleted rows (present in original fetch, absent in current rows):
       - Attempt `deleteDistance(distanceId)`.
       - If the DB rejects (athletes exist, `RESTRICT`): surface error "ลบระยะไม่ได้ เนื่องจากมีนักกีฬา กรุณาจัดการใน Settings".
  3. Update LocalStorage cache: `saveEvent` with updated name; `saveDistances` with new list.
  4. Call `onSaved()`.

**`DistanceRow` type change** (in `components/DistanceList.tsx`):
```ts
export interface DistanceRow {
  key: string
  distanceId?: string   // present for rows loaded from DB; absent for new rows
  name: string
  time: string
}
```

---

## DB Functions (additions to `lib/db.ts`)

| Function | Query |
|---|---|
| `getEvents(): Promise<Event[]>` | `SELECT * FROM events ORDER BY created_at DESC` |
| `updateEventName(id: string, name: string): Promise<void>` | `UPDATE events SET name = $name WHERE id = $id` |
| `deleteEvent(id: string): Promise<void>` | `DELETE FROM events WHERE id = $id` (cascade handles children) |
| `getEventStats(id: string): Promise<{ recordCount: number; athleteCount: number }>` | Two COUNT queries: `finish_records` and `athletes` filtered by `event_id` |

`updateDistance` and `addDistance` already exist in `lib/db.ts` from the multi-distance feature — reused as-is.

---

## Files Affected

| File | Change |
|---|---|
| `app/page.tsx` | Add state machine; render list / EventSetupForm / EventEditForm |
| `components/EventEditForm.tsx` | **New**: pre-filled edit form with distance reconciliation |
| `components/DistanceList.tsx` | Add optional `distanceId?` to `DistanceRow` interface |
| `lib/db.ts` | Add `getEvents`, `updateEventName`, `deleteEvent`, `getEventStats` |

---

## Edge Cases

| Case | Behaviour |
|---|---|
| Delete event with athletes | `getEventStats` shows count in warning; DB cascade deletes all on confirm |
| Edit: delete distance that has athletes | Error shown inline: "ลบระยะไม่ได้ เนื่องจากมีนักกีฬา" — other changes still save |
| No events in DB | Empty state "ยังไม่มีงาน" with create button |
| Network error on load | Show "โหลดไม่ได้ กรุณาลองใหม่" with retry |
| Edit: name unchanged, only distances changed | `updateEventName` skipped; only distance reconciliation runs |
| Supabase `events` table has no `created_at` column | Order by `id` (uuid v4 is not time-ordered) — use `id` as tiebreaker or add `created_at` if missing |

---

## Out of Scope

- Timezone selection (hardcoded `Asia/Bangkok`)
- Duplicate/clone event
- Reordering events
- Prize config / divisions in the creation form (managed in Settings after creation)
