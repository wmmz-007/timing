# Spec: Athlete Import Fix + Template Download

**Date:** 2026-03-18
**Status:** Approved

---

## Overview

Two changes to `components/AthleteImport.tsx`:

1. **Bug fix** — When the event has no distances, the upload button is currently enabled. The user can select a file, map columns, and click Confirm Import — but the import silently skips every row (because `distNameById` is empty and no athlete can be matched to a distance). The fix adds an explicit warning and blocks both the file-select and Confirm Import buttons.
2. **Template download** — New "Download Template" button that generates and downloads a CSV pre-filled with the event's actual distance names.

---

## 1. Bug Fix — No Distances Guard

Add:

```ts
const noDistances = distances.length === 0
```

**Warning message:** If `noDistances`, show **"Add distances before importing athletes"** using the same amber style as the existing `hasPlaceholder` warning.

**File-select button:** Add `noDistances` to the disabled condition:
```ts
disabled={disabled || hasPlaceholder || noDistances}
```

**Confirm Import button:** Add `noDistances` to `canImport`:
```ts
const canImport = !!colMap.bib_number && !!colMap.distance && !hasPlaceholder && !noDistances
```

This ensures that even if the user somehow has a file loaded (from a prior session state), they cannot confirm import when no distances exist.

**Out of scope:** The scenario where a user loads a file and then distances are deleted in another tab is not handled beyond the `canImport` guard above. This is acceptable — the guard will block the import on the next render when `distances` becomes empty.

The existing `hasPlaceholder` check (`name === 'ทั้งหมด'`) remains unchanged.

---

## 2. Template Download Button

### Behaviour

- Button label: **"Download Template"** with a `Download` icon (lucide-react)
- Always visible (not gated by distances being set up)
- On click: generate CSV in-browser and trigger download as `athlete-template.csv`
- No server call required

### CSV Content

**If `distances.length > 0`:**

```
bib_number,name,distance,gender,age_group
1,Example Athlete,10K,,
1,Example Athlete,21K,,
```

One example row per distance. Fields: `bib_number=1`, `name=Example Athlete`, `distance=<exact distance name>`, `gender` and `age_group` are empty.

Distance names must be quoted to handle commas or double-quotes:

```ts
function escapeCsv(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}
```

**If `distances.length === 0`:**

```
bib_number,name,distance,gender,age_group
```

Header row only.

### Implementation

```ts
function downloadTemplate() {
  const header = 'bib_number,name,distance,gender,age_group'
  const rows = distances.map((d) => `1,Example Athlete,${escapeCsv(d.name)},,`)
  const csv = [header, ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'athlete-template.csv'
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 100)
}
```

`URL.revokeObjectURL` is deferred via `setTimeout` to ensure the download is initiated before the object URL is freed.

### Button Placement

Both buttons on the same row using `flex gap-2`:

```
[ Download Template ]  [ Select CSV File ]
```

---

## Files Changed

| Action | File |
|---|---|
| Edit | `components/AthleteImport.tsx` |

---

## Tests

### `__tests__/athlete-import.test.tsx` (create)

Mock `@/lib/db` → `{ upsertAthletes, getAthletesForEvent }`.
Mock `@/lib/storage` → `{ saveAthletes }`.

**jsdom mocking for download tests:**

Before the download tests, spy on `URL.createObjectURL`, `URL.revokeObjectURL`, and `document.createElement` to intercept the anchor `.click()` call:

```ts
let mockClick: ReturnType<typeof vi.fn>
beforeEach(() => {
  mockClick = vi.fn()
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  vi.spyOn(document, 'createElement').mockImplementation((tag) => {
    if (tag === 'a') {
      const el = { href: '', download: '', click: mockClick } as unknown as HTMLAnchorElement
      return el
    }
    return document.createElement(tag)
  })
})
afterEach(() => vi.restoreAllMocks())
```

Assert: `URL.createObjectURL` was called, anchor `.download === 'athlete-template.csv'`, anchor `.click` was called.

For CSV content: capture the `Blob` passed to `createObjectURL` and read its text to assert it contains the expected rows.

**Test cases:**

1. Shows "Add distances before importing athletes" when `distances` is empty
2. Upload button is disabled when `distances` is empty
3. Upload button is enabled when distances are provided
4. "Download Template" button is always rendered
5. Clicking "Download Template" with distances: `URL.createObjectURL` called, anchor download triggered, CSV contains distance names
6. Clicking "Download Template" with no distances: CSV contains only header row
