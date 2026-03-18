# Spec: UI Improvements — Back Button, Distance km Suffix, Athlete Count

**Date:** 2026-03-18
**Status:** Draft

---

## Overview

Four UI improvements across existing pages and components:

1. **Back button** — top-right on all event pages
2. **Distance km suffix** — name input accepts numbers only, stored as `"{n} km"`
3. **Add distance in settings** — allow adding new distances after event creation
4. **Athlete count** — show total athlete count in the Athletes section header

Time input (`type="time"`) already supports 24h, scroll, and typing — no change needed.

---

## 1. Back Button

Add a back button to the top-right corner of every event page header.

### `app/event/[id]/page.tsx` (server component)

This page uses a centered full-screen layout (`min-h-screen flex flex-col items-center justify-center`). Add the back button as a `<Link>` in absolute position relative to `<main>`, and add `relative` to `<main>`:

```tsx
import Link from 'next/link'
import { ChevronLeft, ... } from 'lucide-react'

<main className="relative min-h-screen flex flex-col items-center justify-center px-6">
  <Link href="/events" className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-700">
    <ChevronLeft size={20} />
  </Link>
  ...
</main>
```

### Client component pages (settings, capture, results, export)

These already have `useParams` for `id`. Add a `<Link>` at the top of the page's `<main>` or outermost wrapper:

```tsx
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

// Inside the returned JSX, before other content:
<Link href={`/event/${id}`} className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-700">
  <ChevronLeft size={20} />
</Link>
```

The outermost wrapper of each client page must have `relative` positioning. Check each page:
- `settings/page.tsx`: `<main className="px-6 pt-8 pb-6 max-w-sm mx-auto">` → add `relative`
- `capture/page.tsx`, `results/page.tsx`, `export/page.tsx`: read and add `relative` to outermost `<main>` if not present

---

## 2. Distance Name: Number Input + km Suffix

### `components/DistanceList.tsx`

Change the name input:

```tsx
// BEFORE:
<input type="text" value={row.name} placeholder="e.g. 10K" ... />

// AFTER:
<input
  type="number"
  value={row.name}
  placeholder="e.g. 10"
  min="0.01"
  step="any"
  ...
/>
<span className="text-sm text-gray-500 shrink-0">km</span>
```

The `"km"` span is placed immediately after the name input in the same flex row. `row.name` remains a string (the number as typed, e.g. `"10"`).

### `components/EventSetupForm.tsx`

Append `" km"` when building the submit payload:

```ts
// BEFORE:
const distancePayload = distances.map((row) => ({
  name: row.name,
  start_time: rowToStartTime(date, row.time),
}))

// AFTER:
const distancePayload = distances.map((row) => ({
  name: `${row.name.trim()} km`,
  start_time: rowToStartTime(date, row.time),
}))
```

### `app/event/[id]/settings/page.tsx` — strip on load

When mapping loaded distances to `distRows`, strip the `" km"` suffix:

```ts
// In the useEffect that calls setDistRows(distances.map(...)):
name: d.name.endsWith(' km') ? d.name.slice(0, -3) : d.name,
```

### `app/event/[id]/settings/page.tsx` — dirty-check and append on save

In `handleDistanceChange`, the current dirty-check compares `existing.name !== row.name`. After stripping, `row.name` is `"10"` but `existing.name` is `"10 km"` — they will never match, causing every keystroke to trigger a DB update. Fix by comparing the km-appended value:

```ts
// BEFORE:
if (existing.name !== row.name || ...) {
  await updateDistance(row.key, {
    name: row.name,
    start_time: rowToStartTime(date, row.time),
  })
}

// AFTER:
const newName = `${row.name.trim()} km`
if (existing.name !== newName || ...) {
  await updateDistance(row.key, {
    name: newName,
    start_time: rowToStartTime(date, row.time),
  })
}
```

---

## 3. Add Distance in Settings

Uses existing `addDistance(eventId, name, startTime)` from `lib/db.ts` — no new DB function needed.

### `app/event/[id]/settings/page.tsx` — state

```ts
const [addingDist, setAddingDist] = useState(false)
const [newDistName, setNewDistName] = useState('')
const [newDistTime, setNewDistTime] = useState('07:00')
const [addDistError, setAddDistError] = useState<string | null>(null)
```

### `app/event/[id]/settings/page.tsx` — handler

```ts
async function handleAddDistance() {
  const name = newDistName.trim()
  if (!name || Number(name) <= 0) { setAddDistError('Enter a valid distance'); return }
  const date = distances[0]
    ? new Date(distances[0].start_time).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10)
  try {
    const { addDistance, getDistancesForEvent } = await import('@/lib/db')
    const { saveDistances } = await import('@/lib/storage')
    await addDistance(id, `${name} km`, rowToStartTime(date, newDistTime))
    const updated = await getDistancesForEvent(id)
    setDistances(updated)
    saveDistances(id, updated)
    setAddingDist(false)
    setNewDistName('')
    setNewDistTime('07:00')
    setAddDistError(null)
  } catch {
    setAddDistError('Failed to add. Try again.')
  }
}
```

**Note:** `rowToStartTime` is already imported in the settings page (from `@/components/DistanceList`).

**Known limitation:** The date is derived from `distances[0].start_time`. If `distances` is empty, falls back to today. This is consistent with existing patterns in the file.

### `app/event/[id]/settings/page.tsx` — UI

Add below the existing `distances.map(...)` section, inside the `openSection === 1` block. Add `Plus` to the lucide-react import:

```tsx
{addingDist ? (
  <div className="space-y-2 pt-2">
    <div className="flex gap-2 items-center">
      <input
        type="number"
        value={newDistName}
        onChange={e => { setNewDistName(e.target.value); setAddDistError(null) }}
        placeholder="e.g. 10"
        min="0.01"
        step="any"
        autoFocus
        className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black"
      />
      <span className="text-sm text-gray-500 shrink-0">km</span>
      <input
        type="time"
        value={newDistTime}
        onChange={e => setNewDistTime(e.target.value)}
        className="w-28 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black"
      />
    </div>
    {addDistError && <p className="text-red-500 text-sm">{addDistError}</p>}
    <div className="flex gap-2">
      <button
        type="button"
        onClick={handleAddDistance}
        className="flex-1 bg-black text-white rounded-xl py-2.5 text-sm font-medium"
      >
        Add
      </button>
      <button
        type="button"
        onClick={() => { setAddingDist(false); setAddDistError(null) }}
        className="flex-1 border border-gray-200 rounded-xl py-2.5 text-sm"
      >
        Cancel
      </button>
    </div>
  </div>
) : (
  <button
    type="button"
    onClick={() => setAddingDist(true)}
    className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mt-1"
  >
    <Plus size={14} /> Add Distance
  </button>
)}
```

---

## 4. Athlete Count in Header

In `app/event/[id]/settings/page.tsx`, update the Athletes accordion button text:

```tsx
// BEFORE:
<span className="font-medium">Athletes</span>

// AFTER:
<span className="font-medium">Athletes ({athletes.length})</span>
```

---

## Files Changed

| Action | File |
|---|---|
| Edit | `components/DistanceList.tsx` |
| Edit | `components/EventSetupForm.tsx` |
| Edit | `app/event/[id]/page.tsx` |
| Edit | `app/event/[id]/settings/page.tsx` |
| Edit | `app/event/[id]/capture/page.tsx` |
| Edit | `app/event/[id]/results/page.tsx` |
| Edit | `app/event/[id]/export/page.tsx` |

---

## Tests

### `__tests__/distance-list.test.tsx` (create)

1. Name input is `type="number"`
2. "km" label is rendered after the name input
3. Name input placeholder is `"e.g. 10"`

### `__tests__/event-setup-form.test.tsx` (update)

4. `createEventWithDistances` is called with distance name `"10 km"` (not `"10"`)

### `__tests__/settings-page.test.tsx` (update)

5. Distance name input displays `"10"` (not `"10 km"`) when loaded distance is `"10 km"`
6. Athletes accordion header shows `"Athletes (3)"` when 3 athletes are loaded
7. "Add Distance" button opens the inline form
8. Submitting valid add-distance form calls `addDistance` with name `"10 km"`
9. Empty/invalid distance name shows `"Enter a valid distance"` error

### Back button smoke tests

10. `app/event/[id]/page.tsx` — renders a `<Link>` with `href="/events"` (render with params, check link exists)
11. `app/event/[id]/settings/page.tsx` — renders a `<Link>` with `href="/event/e1"` (already has a settings test file)
