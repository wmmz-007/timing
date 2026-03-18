# Athlete Import Fix + Template Download Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the silent-skip bug when importing athletes with no distances configured, and add a "Download Template" CSV button.

**Architecture:** Both changes are isolated to one component (`components/AthleteImport.tsx`). The bug fix adds a `noDistances` guard that blocks the file-select and Confirm Import buttons when the distances array is empty. The template download adds an in-browser CSV generator with a `Download` button placed alongside the existing file-select button.

**Tech Stack:** Next.js 15, TypeScript, React, lucide-react (icons), Vitest + @testing-library/react

---

## File Structure

| Action | File | Responsibility |
|---|---|---|
| Modify | `components/AthleteImport.tsx` | Add `noDistances` guard, `escapeCsv`, `downloadTemplate`, Download button |
| Create | `__tests__/athlete-import.test.tsx` | 6 tests covering bug fix + template download |

---

### Task 1: Bug Fix — No Distances Guard (TDD)

**Files:**
- Create: `__tests__/athlete-import.test.tsx`
- Modify: `components/AthleteImport.tsx`

---

- [ ] **Step 1: Read the existing component**

Read `components/AthleteImport.tsx` in full before making any changes. Key lines to understand:
- Line 32: `hasPlaceholder` — existing disabled condition
- Line 111: `canImport` — controls Confirm Import button
- Line 126: file-select button `disabled` prop
- Lines 116–120: existing amber warning for `hasPlaceholder`

Also read `types/index.ts` to confirm the `EventDistance` interface fields (needed for test fixtures).

---

- [ ] **Step 2: Write the failing tests (tests 1–3)**

Create `__tests__/athlete-import.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'
import AthleteImport from '@/components/AthleteImport'
import type { EventDistance } from '@/types'

vi.mock('@/lib/db', () => ({
  upsertAthletes: vi.fn().mockResolvedValue(undefined),
  getAthletesForEvent: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/lib/storage', () => ({
  saveAthletes: vi.fn(),
}))

const mockDistances: EventDistance[] = [
  { id: 'd1', event_id: 'e1', name: '10K', start_time: '2026-01-01T07:00:00Z', overall_top_n: 3, default_top_n: 3 },
  { id: 'd2', event_id: 'e1', name: '21K', start_time: '2026-01-01T08:00:00Z', overall_top_n: 3, default_top_n: 3 },
]

describe('AthleteImport', () => {
  it('shows warning when distances is empty', () => {
    render(<AthleteImport eventId="e1" distances={[]} onImported={vi.fn()} />)
    expect(screen.getByText('Add distances before importing athletes')).toBeInTheDocument()
  })

  it('upload button is disabled when distances is empty', () => {
    render(<AthleteImport eventId="e1" distances={[]} onImported={vi.fn()} />)
    expect(screen.getByRole('button', { name: /select csv file/i })).toBeDisabled()
  })

  it('upload button is enabled when distances are provided', () => {
    render(<AthleteImport eventId="e1" distances={mockDistances} onImported={vi.fn()} />)
    expect(screen.getByRole('button', { name: /select csv file/i })).not.toBeDisabled()
  })
})
```

---

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd /Users/wichita.pum/Desktop/entrepreneur/Timing
npx vitest run __tests__/athlete-import.test.tsx --reporter=verbose
```

Expected: 3 FAILs — tests 1 and 2 fail because the warning and disabled state don't exist yet. Test 3 may pass already (button currently enabled). That's fine — it confirms the baseline.

---

- [ ] **Step 4: Implement the bug fix**

Edit `components/AthleteImport.tsx`:

**4a. Add `noDistances` constant** — after the existing `hasPlaceholder` and `distNameById` lines (currently lines 32–33):

```ts
const noDistances = distances.length === 0
```

**4b. Update `canImport`** — currently line 111:

```ts
// BEFORE:
const canImport = !!colMap.bib_number && !!colMap.distance && !hasPlaceholder
// AFTER:
const canImport = !!colMap.bib_number && !!colMap.distance && !hasPlaceholder && !noDistances
```

**4c. Add `noDistances` warning in JSX** — inside the `<div className="space-y-4">` return block, add this block right after the existing `hasPlaceholder` warning (which ends around line 120):

```tsx
{noDistances && (
  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
    Add distances before importing athletes
  </p>
)}
```

**4d. Update file-select button `disabled` prop** — currently `disabled={disabled || hasPlaceholder}`:

```tsx
// BEFORE:
disabled={disabled || hasPlaceholder}
// AFTER:
disabled={disabled || hasPlaceholder || noDistances}
```

---

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run __tests__/athlete-import.test.tsx --reporter=verbose
```

Expected: 3 PASSes

---

- [ ] **Step 6: Run full test suite to check for regressions**

```bash
npx vitest run --reporter=verbose
```

Expected: All existing tests still pass.

---

- [ ] **Step 7: Commit**

```bash
git add components/AthleteImport.tsx __tests__/athlete-import.test.tsx
git commit -m "fix: disable athlete import and show warning when no distances configured"
```

---

### Task 2: Template Download Button (TDD)

**Files:**
- Modify: `__tests__/athlete-import.test.tsx` (add tests 4–6)
- Modify: `components/AthleteImport.tsx` (add `escapeCsv`, `downloadTemplate`, Download button)

---

- [ ] **Step 1: Add failing tests (tests 4–6)**

Append to `__tests__/athlete-import.test.tsx` — add a new `describe('Download Template', ...)` block inside the existing `describe('AthleteImport', ...)`:

```tsx
describe('Download Template', () => {
  let mockAnchor: { href: string; download: string; click: ReturnType<typeof vi.fn> }
  let capturedBlob: Blob | undefined

  beforeEach(() => {
    mockAnchor = { href: '', download: '', click: vi.fn() }
    capturedBlob = undefined
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      capturedBlob = blob as Blob
      return 'blob:mock'
    })
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const origCreateElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'a') return mockAnchor as unknown as HTMLAnchorElement
      return origCreateElement(tag)
    })
  })

  afterEach(() => vi.restoreAllMocks())

  it('"Download Template" button is always rendered', () => {
    render(<AthleteImport eventId="e1" distances={[]} onImported={vi.fn()} />)
    expect(screen.getByRole('button', { name: /download template/i })).toBeInTheDocument()
  })

  it('clicking "Download Template" with distances generates CSV containing distance names', async () => {
    render(<AthleteImport eventId="e1" distances={mockDistances} onImported={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /download template/i }))
    expect(URL.createObjectURL).toHaveBeenCalled()
    expect(mockAnchor.click).toHaveBeenCalled()
    expect(mockAnchor.download).toBe('athlete-template.csv')
    expect(mockAnchor.href).toBe('blob:mock')
    const text = await capturedBlob!.text()
    expect(text).toMatch(/^bib_number,name,distance,gender,age_group/)
    expect(text).toContain('10K')
    expect(text).toContain('21K')
  })

  it('clicking "Download Template" with no distances generates header-only CSV', async () => {
    render(<AthleteImport eventId="e1" distances={[]} onImported={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /download template/i }))
    const text = await capturedBlob!.text()
    expect(text).toBe('bib_number,name,distance,gender,age_group')
  })
})
```

Also add `fireEvent` to the existing import at the top of the file:
```tsx
import { render, screen, fireEvent } from '@testing-library/react'
```

And add `beforeEach`, `afterEach` to the vitest import:
```tsx
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
```

---

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run __tests__/athlete-import.test.tsx --reporter=verbose
```

Expected: tests 1–3 still PASS, tests 4–6 FAIL (button not found yet)

---

- [ ] **Step 3: Implement the template download feature**

Edit `components/AthleteImport.tsx`:

**3a. Add `Download` to the lucide-react import** — currently `import { Upload } from 'lucide-react'`:

```ts
import { Upload, Download } from 'lucide-react'
```

**3b. Add `escapeCsv` helper function** — add before the `export default function` line:

```ts
function escapeCsv(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}
```

**3c. Add `downloadTemplate` function** — add inside the component body, after the `handleImport` function:

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

**3d. Replace the standalone file-select button with a flex row containing both buttons** — find the existing `<button ... >` / `<Upload ...> Select CSV File` block and wrap it:

```tsx
{/* Button row */}
<div className="flex gap-2">
  <button
    type="button"
    onClick={downloadTemplate}
    className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700"
  >
    <Download size={15} /> Download Template
  </button>
  <button
    type="button"
    onClick={() => inputRef.current?.click()}
    disabled={disabled || hasPlaceholder || noDistances}
    className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 disabled:opacity-40"
  >
    <Upload size={15} /> Select CSV File
  </button>
</div>
```

The `<input ref={inputRef} ... />` hidden input stays in place (it does not change).

---

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run __tests__/athlete-import.test.tsx --reporter=verbose
```

Expected: all 6 PASSes

---

- [ ] **Step 5: Run full test suite**

```bash
npx vitest run --reporter=verbose
```

Expected: all tests pass

---

- [ ] **Step 6: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors

---

- [ ] **Step 7: Commit**

```bash
git add components/AthleteImport.tsx __tests__/athlete-import.test.tsx
git commit -m "feat: add Download Template button to athlete import"
```
