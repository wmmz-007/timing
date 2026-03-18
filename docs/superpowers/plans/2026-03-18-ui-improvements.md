# UI Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add back buttons to all event pages, change distance name input to number + "km" suffix with auto-append on save, allow adding distances in settings, and show athlete count in the settings header.

**Architecture:** Five sequential tasks touching UI components and page files. Tasks 1–2 change the DistanceList and EventSetupForm. Tasks 3–4 update the settings page (km handling, athlete count, add-distance feature). Task 5 adds back buttons to all event pages. Each task is independently committable.

**Tech Stack:** Next.js 15, TypeScript, React, lucide-react, Vitest + @testing-library/react, Tailwind v4

---

## File Structure

| Action | File | What changes |
|---|---|---|
| Edit + Test | `components/DistanceList.tsx` | `type="number"`, placeholder, km label |
| Edit + Test | `components/EventSetupForm.tsx` | Append " km" to distance names on submit |
| Edit + Test | `app/event/[id]/settings/page.tsx` | Strip km on load, fix dirty-check, athlete count, add distance feature, back button |
| Edit + Test | `app/event/[id]/page.tsx` | Back button |
| Edit | `app/event/[id]/capture/page.tsx` | Back button |
| Edit | `app/event/[id]/results/page.tsx` | Back button |
| Edit | `app/event/[id]/export/page.tsx` | Back button |
| Create | `__tests__/distance-list.test.tsx` | 3 new tests |
| Update | `__tests__/event-setup-form.test.tsx` | 1 test updated (km suffix assertion) |
| Update | `__tests__/settings-page.test.tsx` | 5 new tests (km strip, athlete count, add distance x2, back button) |
| Create | `__tests__/event-hub.test.tsx` | 1 test (back button link) |

---

### Task 1: DistanceList — Number Input + km Label (TDD)

**Files:**
- Create: `__tests__/distance-list.test.tsx`
- Modify: `components/DistanceList.tsx`

---

- [ ] **Step 1: Read the current component**

Read `components/DistanceList.tsx` in full. Note:
- Line 36–43: the name `<input type="text" placeholder="e.g. 10K" ...>`
- Line 35: the flex row `<div className="flex gap-2 items-center">`

---

- [ ] **Step 2: Write failing tests**

Create `__tests__/distance-list.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'
import DistanceList, { type DistanceRow } from '@/components/DistanceList'

const rows: DistanceRow[] = [
  { key: 'k1', name: '10', time: '07:00' },
]

describe('DistanceList', () => {
  it('name input is type="number"', () => {
    render(<DistanceList rows={rows} date="2026-01-01" onChange={vi.fn()} />)
    expect(screen.getByPlaceholderText('e.g. 10')).toHaveAttribute('type', 'number')
  })

  it('renders "km" label after name input', () => {
    render(<DistanceList rows={rows} date="2026-01-01" onChange={vi.fn()} />)
    expect(screen.getByText('km')).toBeInTheDocument()
  })

  it('name input placeholder is "e.g. 10"', () => {
    render(<DistanceList rows={rows} date="2026-01-01" onChange={vi.fn()} />)
    expect(screen.getByPlaceholderText('e.g. 10')).toBeInTheDocument()
  })
})
```

---

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd /Users/wichita.pum/Desktop/entrepreneur/Timing
npx vitest run __tests__/distance-list.test.tsx --reporter=verbose
```

Expected: 3 FAILs

---

- [ ] **Step 4: Implement the changes**

In `components/DistanceList.tsx`, replace the name input block:

```tsx
// BEFORE (lines 36-43):
<input
  type="text"
  value={row.name}
  onChange={(e) => update(row.key, 'name', e.target.value)}
  placeholder="e.g. 10K"
  className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black"
  required
/>

// AFTER:
<input
  type="number"
  value={row.name}
  onChange={(e) => update(row.key, 'name', e.target.value)}
  placeholder="e.g. 10"
  min="0.01"
  step="any"
  className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black"
  required
/>
<span className="text-sm text-gray-500 shrink-0">km</span>
```

The `<span>` goes immediately after the `</input>`, inside the same `<div className="flex gap-2 items-center">`.

---

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run __tests__/distance-list.test.tsx --reporter=verbose
```

Expected: 3 PASSes

---

- [ ] **Step 6: Run full suite**

```bash
npx vitest run --reporter=verbose
```

Expected: all tests pass (existing event-setup-form tests may now need the placeholder "e.g. 10" — if any fail because they target "e.g. 10K", update them to use "e.g. 10")

---

- [ ] **Step 7: Commit**

```bash
git add components/DistanceList.tsx __tests__/distance-list.test.tsx
git commit -m "feat: change distance name input to number type with km label"
```

---

### Task 2: EventSetupForm — km Suffix on Save (TDD)

**Files:**
- Modify: `__tests__/event-setup-form.test.tsx`
- Modify: `components/EventSetupForm.tsx`

---

- [ ] **Step 1: Read the current test and component**

Read `__tests__/event-setup-form.test.tsx` in full. Find the test that calls `createEventWithDistances` and check how distances are asserted. Also read `components/EventSetupForm.tsx` lines 31–38 (the submit handler's `distancePayload` construction).

---

- [ ] **Step 2: Add/update the km suffix test**

In `__tests__/event-setup-form.test.tsx`, add a new test (or update the existing one that checks `createEventWithDistances` is called) to verify that the distance name has `" km"` appended:

```tsx
it('appends " km" to distance name when calling createEventWithDistances', async () => {
  render(<EventSetupForm onCreated={vi.fn()} />)

  // Fill required fields
  fireEvent.change(screen.getByLabelText(/event name/i), { target: { value: 'Test Event' } })
  fireEvent.change(screen.getByLabelText(/date/i), { target: { value: '2026-01-01' } })
  fireEvent.change(screen.getByLabelText(/event password/i), { target: { value: 'testpass' } })

  // Fill in distance name — uses placeholder "e.g. 10" (type="number" after Task 1)
  fireEvent.change(screen.getByPlaceholderText('e.g. 10'), { target: { value: '10' } })

  fireEvent.click(screen.getByRole('button', { name: /create event/i }))

  await waitFor(() => {
    expect(mockCreateEvent).toHaveBeenCalledWith(
      'Test Event',
      'Asia/Bangkok',
      'testpass',
      expect.arrayContaining([
        expect.objectContaining({ name: '10 km' }),
      ])
    )
  })
})
```

Make sure `waitFor` is imported from `@testing-library/react` if not already. Make sure `mockCreateEvent` refers to the mocked `createEventWithDistances` (check the existing mock setup at the top of the file).

---

- [ ] **Step 3: Run the new test to verify it fails**

```bash
npx vitest run __tests__/event-setup-form.test.tsx --reporter=verbose
```

Expected: the new km test FAILS (name is `"10"` not `"10 km"` currently)

---

- [ ] **Step 4: Implement the km append**

In `components/EventSetupForm.tsx`, find the `distancePayload` construction (inside `handleSubmit`, around line 33):

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

---

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run __tests__/event-setup-form.test.tsx --reporter=verbose
```

Expected: all tests pass

---

- [ ] **Step 6: Run full suite**

```bash
npx vitest run --reporter=verbose
```

Expected: all tests pass

---

- [ ] **Step 7: Commit**

```bash
git add components/EventSetupForm.tsx __tests__/event-setup-form.test.tsx
git commit -m "feat: append km suffix to distance names when creating event"
```

---

### Task 3: Settings Page — km Strip + Dirty-Check Fix + Athlete Count (TDD)

**Files:**
- Modify: `__tests__/settings-page.test.tsx`
- Modify: `app/event/[id]/settings/page.tsx`

---

- [ ] **Step 1: Read the current settings page and test**

Read `app/event/[id]/settings/page.tsx` in full. Key sections:
- Lines 52–61: `useEffect` that maps `distances` → `distRows` (sets `name: d.name`)
- Lines 63–87: `handleDistanceChange` with dirty-check at line 74
- Lines 78–81: `updateDistance` call with `name: row.name`
- Line 189: Athletes accordion header `<span className="font-medium">Athletes</span>`

Read `__tests__/settings-page.test.tsx` in full. Note the existing mock for `@/components/DistanceList`.

---

- [ ] **Step 2: Update the DistanceList mock to expose row names**

In `__tests__/settings-page.test.tsx`, update the `vi.mock('@/components/DistanceList', ...)` call to render a `data-row-name` attribute so tests can inspect what rows were passed:

```tsx
// Find the existing mock and replace it with:
vi.mock('@/components/DistanceList', () => ({
  default: vi.fn((props: { rows: Array<{ name: string }> }) => (
    <div
      data-testid="mock-distance-list"
      data-row-name={props.rows[0]?.name ?? ''}
    />
  )),
  rowToStartTime: vi.fn((date: string, time: string) => `${date}T${time}:00Z`),
}))
```

Also update the mock fixture for `getDistancesForEvent` to return a distance with name `'10 km'` (so the strip test is meaningful):

```ts
// In the mock setup, ensure the distance fixture uses "10 km":
// Find where getDistancesForEvent mock is defined and set:
getDistancesForEvent: vi.fn().mockResolvedValue([
  { id: 'dist-1', event_id: 'evt-1', name: '10 km', start_time: '2026-01-01T07:00:00Z', overall_top_n: 3, default_top_n: 3 }
]),
```

---

- [ ] **Step 3: Write failing tests**

Add two new tests inside the existing `describe` block in `__tests__/settings-page.test.tsx`:

```tsx
it('strips " km" suffix when displaying loaded distance names', async () => {
  await renderPage()
  const distList = await screen.findByTestId('mock-distance-list')
  expect(distList).toHaveAttribute('data-row-name', '10')
})

it('shows athlete count in Athletes section header', async () => {
  await renderPage()
  expect(await screen.findByText(/athletes \(3\)/i)).toBeInTheDocument()
})
```

The athlete count test uses `(3)` because the existing mock returns 3 athletes — confirm this matches your `getAthletesForEvent` mock return value. Adjust the number if needed.

---

- [ ] **Step 4: Run tests to verify they fail**

```bash
npx vitest run __tests__/settings-page.test.tsx --reporter=verbose
```

Expected: the two new tests FAIL (km not stripped, count not shown)

---

- [ ] **Step 5: Implement the three settings page changes**

**5a. Strip " km" on load** — in the `useEffect` that sets `distRows` (around line 53–61):

```ts
// BEFORE:
setDistRows(distances.map((d) => ({
  key: d.id,
  name: d.name,
  time: new Date(d.start_time).toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit', timeZone: event?.timezone ?? 'Asia/Bangkok',
  }),
})))

// AFTER:
setDistRows(distances.map((d) => ({
  key: d.id,
  name: d.name.endsWith(' km') ? d.name.slice(0, -3) : d.name,
  time: new Date(d.start_time).toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit', timeZone: event?.timezone ?? 'Asia/Bangkok',
  }),
})))
```

**5b. Fix dirty-check + append on save** — in `handleDistanceChange` (around line 74–81):

```ts
// BEFORE:
if (existing.name !== row.name || !existing.start_time.startsWith(
  new Date(`${date}T${row.time}:00+07:00`).toISOString().slice(0, 16)
)) {
  await updateDistance(row.key, {
    name: row.name,
    start_time: rowToStartTime(date, row.time),
  })
}

// AFTER:
const newName = `${row.name.trim()} km`
if (existing.name !== newName || !existing.start_time.startsWith(
  new Date(`${date}T${row.time}:00+07:00`).toISOString().slice(0, 16)
)) {
  await updateDistance(row.key, {
    name: newName,
    start_time: rowToStartTime(date, row.time),
  })
}
```

**5c. Athlete count in header** — find the Athletes accordion button (around line 186–191):

```tsx
// BEFORE:
<span className="font-medium">Athletes</span>

// AFTER:
<span className="font-medium">Athletes ({athletes.length})</span>
```

---

- [ ] **Step 6: Run tests to verify they pass**

```bash
npx vitest run __tests__/settings-page.test.tsx --reporter=verbose
```

Expected: all tests pass

---

- [ ] **Step 7: Run full suite**

```bash
npx vitest run --reporter=verbose
```

Expected: all tests pass

---

- [ ] **Step 8: Commit**

```bash
git add app/event/[id]/settings/page.tsx __tests__/settings-page.test.tsx
git commit -m "feat: strip km on load, fix dirty-check, show athlete count in settings"
```

---

### Task 4: Settings Page — Add Distance Feature (TDD)

**Files:**
- Modify: `__tests__/settings-page.test.tsx`
- Modify: `app/event/[id]/settings/page.tsx`

---

- [ ] **Step 1: Read the current state**

Read `app/event/[id]/settings/page.tsx`. Note:
- The imports at top (lucide-react icons, DistanceList, etc.)
- The state declarations block (lines 14–22)
- Where the distances section JSX ends (the `distances.map(...)` block inside `openSection === 1`)
- Current lucide-react import: `import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react'`

Read `__tests__/settings-page.test.tsx` to see the existing mock for `@/lib/db`.

---

- [ ] **Step 2: Update db mock to include `addDistance`**

In `__tests__/settings-page.test.tsx`, find the `vi.mock('@/lib/db', ...)` call and add `addDistance`:

```ts
// Add to the existing mock:
addDistance: vi.fn().mockResolvedValue({
  id: 'dist-2', event_id: 'evt-1', name: '21 km',
  start_time: '2026-01-01T08:00:00Z', overall_top_n: 3, default_top_n: 3
}),
```

---

- [ ] **Step 3: Write failing tests**

Add these tests to `__tests__/settings-page.test.tsx`:

```tsx
it('"Add Distance" button opens the inline add form', async () => {
  await renderPage()
  // Open distances section first
  fireEvent.click(await screen.findByText('Distances & Start Times'))
  fireEvent.click(screen.getByRole('button', { name: /add distance/i }))
  expect(screen.getByPlaceholderText('e.g. 10')).toBeInTheDocument()
})

it('submitting add-distance form calls addDistance with "{n} km"', async () => {
  await renderPage()
  fireEvent.click(await screen.findByText('Distances & Start Times'))
  fireEvent.click(screen.getByRole('button', { name: /add distance/i }))
  fireEvent.change(screen.getByPlaceholderText('e.g. 10'), { target: { value: '21' } })
  fireEvent.click(screen.getByRole('button', { name: /^add$/i }))
  await waitFor(() => {
    expect(vi.mocked(db.addDistance)).toHaveBeenCalledWith('evt-1', '21 km', expect.any(String))
  })
})

it('empty distance name shows "Enter a valid distance" error', async () => {
  await renderPage()
  fireEvent.click(await screen.findByText('Distances & Start Times'))
  fireEvent.click(screen.getByRole('button', { name: /add distance/i }))
  fireEvent.click(screen.getByRole('button', { name: /^add$/i }))
  expect(screen.getByText('Enter a valid distance')).toBeInTheDocument()
  expect(vi.mocked(db.addDistance)).not.toHaveBeenCalled()
})
```

Make sure `db` is imported in the test file as `import * as db from '@/lib/db'` if needed for `vi.mocked(db.addDistance)`. Also add `waitFor` to the `@testing-library/react` import if not already present.

---

- [ ] **Step 4: Run tests to verify they fail**

```bash
npx vitest run __tests__/settings-page.test.tsx --reporter=verbose
```

Expected: 3 new tests FAIL ("Add Distance" button not found)

---

- [ ] **Step 5: Implement the add distance feature**

**5a. Add `Plus` to the lucide-react import** in `app/event/[id]/settings/page.tsx`:

```ts
// BEFORE:
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react'
// AFTER:
import { ChevronDown, ChevronUp, Trash2, Plus } from 'lucide-react'
```

**5b. Add 4 state variables** — after the existing state declarations (after `pwError` state):

```ts
const [addingDist, setAddingDist] = useState(false)
const [newDistName, setNewDistName] = useState('')
const [newDistTime, setNewDistTime] = useState('07:00')
const [addDistError, setAddDistError] = useState<string | null>(null)
```

**5c. Add `handleAddDistance` function** — after the `handleSavePassword` function:

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

**5d. Add UI below the `distances.map(...)` block** — inside the `openSection === 1` block, right after the closing `)}` of the `distances.map(...)` section, before the closing `</div>` of `{openSection === 1 && ...}`:

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

- [ ] **Step 6: Run tests to verify they pass**

```bash
npx vitest run __tests__/settings-page.test.tsx --reporter=verbose
```

Expected: all tests pass

---

- [ ] **Step 7: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors

---

- [ ] **Step 8: Run full suite**

```bash
npx vitest run --reporter=verbose
```

Expected: all tests pass

---

- [ ] **Step 9: Commit**

```bash
git add app/event/[id]/settings/page.tsx __tests__/settings-page.test.tsx
git commit -m "feat: add new distance inline form in settings page"
```

---

### Task 5: Back Buttons (All Event Pages)

**Files:**
- Create: `__tests__/event-hub.test.tsx`
- Modify: `__tests__/settings-page.test.tsx`
- Modify: `app/event/[id]/page.tsx`
- Modify: `app/event/[id]/settings/page.tsx`
- Modify: `app/event/[id]/capture/page.tsx`
- Modify: `app/event/[id]/results/page.tsx`
- Modify: `app/event/[id]/export/page.tsx`

---

- [ ] **Step 1: Read all pages**

Read these files in full to understand each page's current `return` / JSX structure:
- `app/event/[id]/page.tsx` — server component, centered flex layout
- `app/event/[id]/settings/page.tsx` — already read, `<main className="px-6 pt-8 pb-6 max-w-sm mx-auto">`
- `app/event/[id]/capture/page.tsx` — returns `<CaptureScreen .../>` directly
- `app/event/[id]/results/page.tsx` — `<main className="px-6 pt-8 pb-6 max-w-sm mx-auto">`
- `app/event/[id]/export/page.tsx` — `<main className="px-6 pt-8 pb-6 max-w-sm mx-auto">`

---

- [ ] **Step 2: Write failing tests**

**Create `__tests__/event-hub.test.tsx`:**

The event hub is a Next.js 15 async server component. Render it by awaiting the function.

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import EventHubPage from '@/app/event/[id]/page'

describe('EventHubPage', () => {
  it('renders back link to /events', async () => {
    const jsx = await EventHubPage({ params: Promise.resolve({ id: 'e1' }) })
    render(jsx)
    const links = screen.getAllByRole('link')
    const backLink = links.find(l => l.getAttribute('href') === '/events')
    expect(backLink).toBeTruthy()
  })
})
```

**Add one test to `__tests__/settings-page.test.tsx`:**

```tsx
it('renders back link to /event/evt-1', async () => {
  await renderPage()
  await screen.findByText(/settings/i)
  const links = screen.getAllByRole('link')
  const backLink = links.find(l => l.getAttribute('href') === '/event/evt-1')
  expect(backLink).toBeTruthy()
})
```

(Assumes the `renderPage()` renders with event id `'evt-1'` — confirm from the existing test setup.)

---

- [ ] **Step 3: Run tests to verify they fail**

```bash
npx vitest run __tests__/event-hub.test.tsx __tests__/settings-page.test.tsx --reporter=verbose
```

Expected: 2 new tests FAIL (back links not present yet)

---

- [ ] **Step 4: Implement back buttons**

**4a. `app/event/[id]/page.tsx`** (server component) — add `relative` to `<main>` and a `<Link>` back button. `ChevronLeft` needs to be imported from `lucide-react` (already uses lucide icons):

```tsx
// Add to existing import:
import { Mic, BarChart2, Download, Settings, ChevronLeft } from 'lucide-react'

// Change <main> opening tag:
// BEFORE:
<main className="min-h-screen flex flex-col items-center justify-center px-6">
// AFTER:
<main className="relative min-h-screen flex flex-col items-center justify-center px-6">

// Add immediately inside <main>, before the inner <div>:
<Link href="/events" aria-label="back" className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-700">
  <ChevronLeft size={20} />
</Link>
```

**4b. `app/event/[id]/settings/page.tsx`** — add `Link` and `ChevronLeft`. `Link` is not currently imported. `ChevronLeft` needs adding to lucide import:

```tsx
// Add to imports:
import Link from 'next/link'
import { ChevronDown, ChevronUp, Trash2, Plus, ChevronLeft } from 'lucide-react'

// Change <main> opening tag (in the non-loading return):
// BEFORE:
<main className="px-6 pt-8 pb-6 max-w-sm mx-auto">
// AFTER:
<main className="relative px-6 pt-8 pb-6 max-w-sm mx-auto">

// Add immediately inside <main>, before the <h1>:
<Link href={`/event/${id}`} aria-label="back" className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-700">
  <ChevronLeft size={20} />
</Link>
```

**4c. `app/event/[id]/capture/page.tsx`** — this page returns `<CaptureScreen .../>` directly. Wrap it in a relative container. Add `Link` and `ChevronLeft` imports:

```tsx
// Add to imports:
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

// Change the non-loading return (currently just `return <CaptureScreen ...>`):
// BEFORE:
return <CaptureScreen event={event} distances={distances} athletes={athletes} />

// AFTER:
return (
  <div className="relative min-h-screen">
    <Link href={`/event/${id}`} aria-label="back" className="absolute top-4 right-4 z-10 p-2 text-gray-400 hover:text-gray-700">
      <ChevronLeft size={20} />
    </Link>
    <CaptureScreen event={event} distances={distances} athletes={athletes} />
  </div>
)
```

**4d. `app/event/[id]/results/page.tsx`** — add `Link` and `ChevronLeft`. Check current imports (no lucide icons, no Link):

```tsx
// Add to imports:
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

// Change <main> opening tag:
// BEFORE:
<main className="px-6 pt-8 pb-6 max-w-sm mx-auto">
// AFTER:
<main className="relative px-6 pt-8 pb-6 max-w-sm mx-auto">

// Add immediately inside <main>, before <h1>:
<Link href={`/event/${id}`} aria-label="back" className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-700">
  <ChevronLeft size={20} />
</Link>
```

**4e. `app/event/[id]/export/page.tsx`** — already imports `Download` from lucide-react and `Link` may not be imported. Add:

```tsx
// Update lucide import:
import { Download, ChevronLeft } from 'lucide-react'
// Add:
import Link from 'next/link'

// Change <main> opening tag:
// BEFORE:
<main className="px-6 pt-8 pb-6 max-w-sm mx-auto">
// AFTER:
<main className="relative px-6 pt-8 pb-6 max-w-sm mx-auto">

// Add immediately inside <main>, before <h1>:
<Link href={`/event/${id}`} aria-label="back" className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-700">
  <ChevronLeft size={20} />
</Link>
```

---

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run __tests__/event-hub.test.tsx __tests__/settings-page.test.tsx --reporter=verbose
```

Expected: all pass

---

- [ ] **Step 6: Run full suite + TypeScript check**

```bash
npx vitest run --reporter=verbose
npx tsc --noEmit
```

Expected: all tests pass, no TS errors

---

- [ ] **Step 7: Commit**

```bash
git add \
  app/event/[id]/page.tsx \
  app/event/[id]/settings/page.tsx \
  app/event/[id]/capture/page.tsx \
  app/event/[id]/results/page.tsx \
  app/event/[id]/export/page.tsx \
  __tests__/event-hub.test.tsx \
  __tests__/settings-page.test.tsx
git commit -m "feat: add back button to all event pages"
```
