# Chip comparison minimal CSV export — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second downloadable CSV containing only `bib`, `finish_time_local` (HH:MM:SS in event timezone), and `finish_time_utc` (ISO 8601 UTC), sorted for chip-time verification per [spec](../specs/2026-03-21-chip-comparison-minimal-export-design.md).

**Architecture:** Add a pure function `generateChipComparisonCsv(records, event)` in `lib/export.ts` that sorts `FinishRecord[]` by UTC instant then maps each row to three columns using existing `formatTime` for local and `Date#toISOString()` for UTC. Reuse `downloadCsv` for the blob/download. Wire a second button on the existing export page that calls the new generator with the same `records` / `event` already loaded.

**Tech Stack:** Next.js App Router (client page), TypeScript, Vitest, existing `@/lib/time` (`formatTime`), existing `@/lib/export` (`downloadCsv`).

---

## File map

| File | Role |
|------|------|
| `lib/export.ts` | Add `generateChipComparisonCsv`; keep `generateCsv` / `downloadCsv` unchanged. |
| `__tests__/export.test.ts` **or** `__tests__/chip-comparison-export.test.ts` | New tests for header, sort order, local/UTC columns. Prefer **new file** if `export.test.ts` is already long — either is fine. |
| `app/event/[id]/export/page.tsx` | Second download button + handler; optional short helper text listing minimal columns. |
| `docs/superpowers/specs/2026-03-21-chip-comparison-minimal-export-design.md` | Spec reference (no code change unless spec errata). |

---

### Task 1: `generateChipComparisonCsv` + unit tests (TDD)

**Files:**
- Modify: `lib/export.ts`
- Create or modify: `__tests__/chip-comparison-export.test.ts` (recommended) **or** extend `__tests__/export.test.ts`

- [ ] **Step 1: Write the failing test**

Add tests that import the new function (tests will fail until export exists):

```ts
import { describe, it, expect } from 'vitest'
import { generateChipComparisonCsv } from '@/lib/export'
import type { FinishRecord, Event } from '@/types'

const event: Event = {
  id: 'evt-1',
  name: 'Test',
  timezone: 'Asia/Bangkok',
  overall_lockout: false,
  created_at: '2026-03-17T00:00:00Z',
  password: '',
}

// Two records: 099 finishes before 235 in local data; assert sort by UTC
const records: FinishRecord[] = [
  { id: 'r2', event_id: 'evt-1', bib_number: '235', finish_time: '2026-03-16T07:42:15+07:00', created_at: '2026-03-16T00:42:15Z' },
  { id: 'r1', event_id: 'evt-1', bib_number: '099', finish_time: '2026-03-16T07:40:55+07:00', created_at: '2026-03-16T00:40:55Z' },
]

it('header is bib,finish_time_local,finish_time_utc', () => {
  const csv = generateChipComparisonCsv(records, event)
  expect(csv.split('\n')[0]).toBe('bib,finish_time_local,finish_time_utc')
})

it('sorts by finish UTC ascending; tie-break by bib', () => {
  const csv = generateChipComparisonCsv(records, event)
  const lines = csv.split('\n').filter(Boolean)
  expect(lines[1]).toMatch(/^099,/)
  expect(lines[2]).toMatch(/^235,/)
})

it('finish_time_local matches formatTime (HH:MM:SS only)', () => {
  const csv = generateChipComparisonCsv(records, event)
  expect(csv).toContain('07:40:55')
  expect(csv).toContain('07:42:15')
})

it('finish_time_utc is ISO Z for each row', () => {
  const csv = generateChipComparisonCsv(records, event)
  expect(csv).toMatch(/2026-03-16T00:40:55\.\d{3}Z/)
  expect(csv).toMatch(/2026-03-16T00:42:15\.\d{3}Z/)
})
```

Adjust regex if your runtime omits milliseconds — use `expect(line).toContain('T')` and `Z` if needed.

- [ ] **Step 2: Run test — expect FAIL**

Run: `npm test -- __tests__/chip-comparison-export.test.ts`  
Expected: FAIL — `generateChipComparisonCsv` is not exported or not defined.

- [ ] **Step 3: Minimal implementation**

In `lib/export.ts`:

1. `formatTime` is **already** imported from `./time` — reuse it; no new import line needed.
2. Export:

```ts
export function generateChipComparisonCsv(records: FinishRecord[], event: Event): string {
  const header = 'bib,finish_time_local,finish_time_utc'
  const sorted = [...records].sort((a, b) => {
    const ta = new Date(a.finish_time).getTime()
    const tb = new Date(b.finish_time).getTime()
    if (ta !== tb) return ta - tb
    return a.bib_number.localeCompare(b.bib_number, undefined, { numeric: true })
  })
  const rows = sorted.map((r) => {
    const local = formatTime(r.finish_time, event.timezone)
    const utc = new Date(r.finish_time).toISOString()
    return [r.bib_number, local, utc].join(',')
  })
  return [header, ...rows].join('\n')
}
```

3. Empty records: return `header` only (same pattern as `generateCsv` empty test).

- [ ] **Step 4: Run tests — expect PASS**

Run: `npm test -- __tests__/chip-comparison-export.test.ts`  
Expected: PASS.

Run full export-related suite: `npm test -- __tests__/export.test.ts __tests__/chip-comparison-export.test.ts`  
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/export.ts __tests__/chip-comparison-export.test.ts
git commit -m "feat: generate chip comparison CSV (bib, local HH:MM:SS, UTC ISO)"
```

---

### Task 2: Export UI — second download

**Files:**
- Modify: `app/event/[id]/export/page.tsx`

- [ ] **Step 1: Import `generateChipComparisonCsv`** (same file as `generateCsv`).

- [ ] **Step 2: Add `handleDownloadChipComparison`** next to `handleDownload`:

```ts
function handleDownloadChipComparison() {
  if (!event) return
  const csv = generateChipComparisonCsv(records, event)
  const sorted = [...distances].sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
  const date = sorted[0]?.start_time.slice(0, 10) ?? new Date().toISOString().slice(0, 10)
  downloadCsv(csv, `timing-chip-compare-${date}.csv`)
}
```

- [ ] **Step 3: Add UI** — secondary button below full CSV (or outline style): label e.g. **Download chip compare (bib + times)**; `disabled={records.length === 0}`; `onClick={handleDownloadChipComparison}`.

- [ ] **Step 4: Update helper text** — e.g. second line: `Chip compare: bib, finish_time_local, finish_time_utc`.

- [ ] **Step 5: Manual smoke** — open `/event/[id]/export`, download both files; open chip CSV in editor and confirm three columns.

- [ ] **Step 6: Commit**

```bash
git add app/event/[id]/export/page.tsx
git commit -m "feat: chip comparison CSV download on export page"
```

---

### Task 3: Verification

- [ ] Run: `npm test` (full suite)  
  Expected: all tests pass.

- [ ] Run: `npm run build`  
  Expected: TypeScript + Next build succeed.

---

## References

- Spec: `docs/superpowers/specs/2026-03-21-chip-comparison-minimal-export-design.md`
- Skills: @superpowers:test-driven-development @superpowers:verification-before-completion

---

## Plan review

After saving this file, run one internal review pass: confirm every task names exact paths, empty-records behavior is tested, and UTC column uses `toISOString()` for stored ISO `finish_time`.

---

## Execution handoff

**Plan complete and saved to `docs/superpowers/plans/2026-03-21-chip-comparison-minimal-export.md`. Two execution options:**

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks.  
2. **Inline execution** — run tasks in this session with checkpoints.

**Which approach do you want?**
