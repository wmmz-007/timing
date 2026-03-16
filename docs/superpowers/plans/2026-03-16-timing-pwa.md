# Timing PWA Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a PWA that lets staff record runner bib numbers + finish timestamps via voice (Web Speech API), syncs to Supabase, and exports CSV for offline prize calculation.

**Architecture:** Next.js App Router PWA with Tailwind CSS. Pure client-side logic in `lib/` (speech parsing, time, export, storage, sync). Supabase for realtime shared state. Offline-first via Local Storage with conflict-aware sync.

**Tech Stack:** Next.js 14, TypeScript, Tailwind CSS, Supabase JS v2, Vitest, date-fns

---

## File Map

```
app/
  layout.tsx                    # Root layout: PWA meta, viewport, font
  page.tsx                      # Home: list events + create button
  event/[id]/
    page.tsx                    # Event hub: links to capture / results / export
    capture/page.tsx            # Race Capture screen
    results/page.tsx            # Live Results screen (realtime)
    export/page.tsx             # Export CSV screen

components/
  EventSetupForm.tsx            # Create event form (name, start_time, timezone)
  CaptureScreen.tsx             # Orchestrates capture flow
  MicButton.tsx                 # Large hold-to-speak button (Web Speech API)
  ConfirmCapture.tsx            # Confirm/discard dialog after speech
  ManualBibInput.tsx            # Numeric keypad fallback
  FinishLog.tsx                 # Recent entries list (bottom of capture screen)
  ResultsTable.tsx              # Sorted results table with net_time
  ConflictsPanel.tsx            # Sync conflict display on results screen
  InstallPrompt.tsx             # "Add to Home Screen" banner

lib/
  supabase.ts                   # Supabase client (singleton)
  db.ts                         # DB read/write: events + finish_records
  storage.ts                    # Local Storage read/write (offline buffer)
  sync.ts                       # Sync local → Supabase; conflict resolution
  speech.ts                     # Web Speech API wrapper + Thai digit parser
  export.ts                     # CSV generation
  time.ts                       # net_time calculation, time formatting

types/
  index.ts                      # Event, FinishRecord, PendingRecord TS types

public/
  manifest.json                 # PWA manifest
  icons/                        # icon-192.png, icon-512.png

supabase/
  migrations/
    001_initial.sql             # CREATE TABLE events + finish_records

__tests__/
  speech.test.ts
  time.test.ts
  export.test.ts
  storage.test.ts
  sync.test.ts
  db.test.ts
```

---

## Chunk 1: Project Scaffold + Types + DB Schema

### Task 1: Initialise Next.js project

**Files:**
- Create: `package.json`, `tsconfig.json`, `tailwind.config.ts`, `next.config.ts`, `postcss.config.mjs`

- [ ] **Step 1: Scaffold Next.js project**

```bash
cd /Users/wichita.pum/Desktop/entrepreneur/Timing
npx create-next-app@latest . \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir=false \
  --import-alias="@/*" \
  --no-turbopack
```

Accept all defaults when prompted.

- [ ] **Step 2: Install dependencies**

```bash
npm install @supabase/supabase-js date-fns
npm install -D vitest @vitest/ui jsdom @testing-library/react @testing-library/jest-dom @vitejs/plugin-react
```

- [ ] **Step 3: Configure Vitest**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
})
```

Create `vitest.setup.ts`:

```ts
import '@testing-library/jest-dom'
```

- [ ] **Step 4: Add test script to package.json**

In `package.json`, add to `"scripts"`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: Verify scaffold builds**

```bash
npx next build
```

Expected: Build completes without errors. (Do NOT use `npm run dev` here — the dev server is interactive and will block the terminal.)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js project with Tailwind and Vitest"
```

---

### Task 2: TypeScript types

**Files:**
- Create: `types/index.ts`

- [ ] **Step 1: Write types**

Create `types/index.ts`:

```ts
export interface Event {
  id: string
  name: string
  start_time: string    // ISO 8601 timestamptz, e.g. "2026-03-16T07:00:00+07:00"
  timezone: string      // IANA timezone, e.g. "Asia/Bangkok"
}

export interface FinishRecord {
  id: string
  event_id: string
  bib_number: string    // string to preserve leading zeros
  finish_time: string   // ISO 8601 timestamptz
  created_at: string
}

// A record not yet synced to Supabase, kept in Local Storage
export interface PendingRecord {
  local_id: string      // uuid generated client-side
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

- [ ] **Step 2: Commit**

```bash
git add types/index.ts
git commit -m "feat: add TypeScript types for Event, FinishRecord, PendingRecord"
```

---

### Task 3: Supabase DB schema

**Files:**
- Create: `supabase/migrations/001_initial.sql`

- [ ] **Step 1: Write migration**

Create `supabase/migrations/001_initial.sql`:

```sql
create table if not exists events (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  start_time  timestamptz not null,
  timezone    text not null default 'Asia/Bangkok'
);

create table if not exists finish_records (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references events(id) on delete cascade,
  bib_number  text not null,
  finish_time timestamptz not null,
  created_at  timestamptz not null default now(),
  unique(event_id, bib_number)
);

create index if not exists finish_records_event_id_idx on finish_records(event_id);
create index if not exists finish_records_finish_time_idx on finish_records(finish_time);
```

- [ ] **Step 2: Create Supabase project**

1. Go to https://supabase.com, create a free project
2. Name it "timing-pwa", region: Southeast Asia (Singapore)
3. Wait for project to be ready (~2 min)
4. Go to SQL Editor, paste and run the migration SQL
5. Verify tables exist: in Table Editor you should see `events` and `finish_records`. If either is missing, re-run the SQL and look for any error message in the SQL Editor output panel.

- [ ] **Step 3: Get credentials**

In Supabase dashboard → Settings → API:
- Copy `Project URL` → will be `NEXT_PUBLIC_SUPABASE_URL`
- Copy `anon public` key → will be `NEXT_PUBLIC_SUPABASE_ANON_KEY`

- [ ] **Step 4: Create .env.local**

Create `.env.local` (never commit this file):

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

- [ ] **Step 4b: Verify credentials are real**

```bash
grep "your-project" .env.local && echo "ERROR: replace placeholder values" || echo "OK"
```

Expected: `OK` — if you see `ERROR`, edit `.env.local` and replace both placeholder values with the real ones from the Supabase dashboard before proceeding.

- [ ] **Step 5: Add .env.local to .gitignore**

Verify `.gitignore` includes `.env.local` (Next.js adds this by default).

- [ ] **Step 6: Commit**

```bash
git add supabase/
git commit -m "feat: add Supabase DB migration (events + finish_records)"
```

---

### Task 4: Supabase client

**Files:**
- Create: `lib/supabase.ts`

- [ ] **Step 1: Write client**

Create `lib/supabase.ts`:

```ts
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(url, key)
```

- [ ] **Step 2: Commit**

```bash
git add lib/supabase.ts
git commit -m "feat: add Supabase client singleton"
```

---

## Chunk 2: Core Utilities (speech, time, export)

### Task 5: Speech parsing

**Files:**
- Create: `lib/speech.ts`
- Create: `__tests__/speech.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/speech.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseTranscriptToBib } from '@/lib/speech'

describe('parseTranscriptToBib', () => {
  it('parses Arabic digit string directly', () => {
    expect(parseTranscriptToBib('235')).toBe('235')
  })

  it('parses Thai word-per-digit', () => {
    expect(parseTranscriptToBib('สองสามห้า')).toBe('235')
  })

  it('parses Thai digits with spaces', () => {
    expect(parseTranscriptToBib('สอง สาม ห้า')).toBe('235')
  })

  it('strips prefix "บิบ" before parsing', () => {
    expect(parseTranscriptToBib('บิบ 235')).toBe('235')
  })

  it('strips prefix "หมายเลข" before parsing', () => {
    expect(parseTranscriptToBib('หมายเลข สองสามห้า')).toBe('235')
  })

  it('preserves leading zeros', () => {
    expect(parseTranscriptToBib('ศูนย์เก้าเก้า')).toBe('099')
  })

  it('returns null when no digits found', () => {
    expect(parseTranscriptToBib('สวัสดี')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(parseTranscriptToBib('')).toBeNull()
  })

  it('handles all 10 Thai digit words', () => {
    expect(parseTranscriptToBib('ศูนย์หนึ่งสองสามสี่ห้าหกเจ็ดแปดเก้า')).toBe('0123456789')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- speech
```

Expected: FAIL — "Cannot find module '@/lib/speech'"

- [ ] **Step 3: Implement speech.ts**

Create `lib/speech.ts`:

```ts
const THAI_DIGITS: Record<string, string> = {
  'ศูนย์': '0',
  'หนึ่ง': '1',
  'สอง':  '2',
  'สาม':  '3',
  'สี่':   '4',
  'ห้า':   '5',
  'หก':   '6',
  'เจ็ด':  '7',
  'แปด':  '8',
  'เก้า':  '9',
}

const PREFIX_WORDS = ['บิบ', 'หมายเลข']

export function parseTranscriptToBib(transcript: string): string | null {
  let text = transcript.trim()

  // Strip common prefix words
  for (const prefix of PREFIX_WORDS) {
    if (text.startsWith(prefix)) {
      text = text.slice(prefix.length).trim()
      break
    }
  }

  // Try Arabic digits first
  const arabicMatch = text.replace(/\s/g, '').match(/^\d+$/)
  if (arabicMatch) return arabicMatch[0]

  // Try Thai word-per-digit
  let result = ''
  let remaining = text.replace(/\s/g, '')

  while (remaining.length > 0) {
    let matched = false
    for (const [word, digit] of Object.entries(THAI_DIGITS)) {
      if (remaining.startsWith(word)) {
        result += digit
        remaining = remaining.slice(word.length)
        matched = true
        break
      }
    }
    if (!matched) break
  }

  if (result.length > 0) return result

  return null
}

// Web Speech API recognition session type
export interface SpeechResult {
  transcript: string
  bib: string | null
  capturedAt: string   // ISO 8601 timestamp captured when result arrives
}

export function startSpeechRecognition(
  lang: string,
  onResult: (result: SpeechResult) => void,
  onError: (error: string) => void
): () => void {
  const SpeechRecognition =
    (window as typeof window & { SpeechRecognition?: typeof window.SpeechRecognition; webkitSpeechRecognition?: typeof window.SpeechRecognition })
      .SpeechRecognition ||
    (window as typeof window & { webkitSpeechRecognition?: typeof window.SpeechRecognition }).webkitSpeechRecognition

  if (!SpeechRecognition) {
    onError('Web Speech API is not supported in this browser')
    return () => {}
  }

  const recognition = new SpeechRecognition()
  recognition.lang = lang
  recognition.interimResults = false
  recognition.maxAlternatives = 1

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript
    const capturedAt = new Date().toISOString()
    const bib = parseTranscriptToBib(transcript)
    onResult({ transcript, bib, capturedAt })
  }

  recognition.onerror = (event) => {
    onError(event.error)
  }

  recognition.start()

  return () => recognition.stop()
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- speech
```

Expected: 9/9 PASS

- [ ] **Step 5: Commit**

```bash
git add lib/speech.ts __tests__/speech.test.ts
git commit -m "feat: add speech parsing with Thai digit lookup table"
```

---

### Task 6: Time utilities

**Files:**
- Create: `lib/time.ts`
- Create: `__tests__/time.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/time.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { calcNetTime, formatTime, formatNetTime } from '@/lib/time'

describe('calcNetTime', () => {
  it('returns net time in milliseconds', () => {
    const start = '2026-03-16T07:00:00+07:00'
    const finish = '2026-03-16T07:42:15+07:00'
    expect(calcNetTime(start, finish)).toBe(42 * 60 * 1000 + 15 * 1000)
  })

  it('handles sub-second precision', () => {
    const start  = '2026-03-16T07:00:00.000+07:00'
    const finish = '2026-03-16T07:42:15.320+07:00'
    expect(calcNetTime(start, finish)).toBe(42 * 60 * 1000 + 15 * 1000 + 320)
  })
})

describe('formatTime', () => {
  it('formats ISO timestamp to HH:MM:SS local time', () => {
    // Asia/Bangkok is UTC+7
    expect(formatTime('2026-03-16T07:42:15+07:00', 'Asia/Bangkok')).toBe('07:42:15')
  })
})

describe('formatNetTime', () => {
  it('formats milliseconds to HH:MM:SS', () => {
    const ms = 42 * 60 * 1000 + 15 * 1000
    expect(formatNetTime(ms)).toBe('00:42:15')
  })

  it('handles hours', () => {
    const ms = 1 * 3600 * 1000 + 5 * 60 * 1000 + 30 * 1000
    expect(formatNetTime(ms)).toBe('01:05:30')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- time
```

Expected: FAIL

- [ ] **Step 3: Implement time.ts**

Create `lib/time.ts`:

```ts
export function calcNetTime(startIso: string, finishIso: string): number {
  return new Date(finishIso).getTime() - new Date(startIso).getTime()
}

export function formatTime(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(iso))
}

export function formatNetTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':')
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- time
```

Expected: 5/5 PASS

- [ ] **Step 5: Commit**

```bash
git add lib/time.ts __tests__/time.test.ts
git commit -m "feat: add time utilities (calcNetTime, formatTime, formatNetTime)"
```

---

### Task 7: CSV export

**Files:**
- Create: `lib/export.ts`
- Create: `__tests__/export.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/export.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { generateCsv } from '@/lib/export'
import type { FinishRecord, Event } from '@/types'

const event: Event = {
  id: 'evt-1',
  name: 'Test Race',
  start_time: '2026-03-16T07:00:00+07:00',
  timezone: 'Asia/Bangkok',
}

const records: FinishRecord[] = [
  { id: 'r1', event_id: 'evt-1', bib_number: '235', finish_time: '2026-03-16T07:42:15+07:00', created_at: '' },
  { id: 'r2', event_id: 'evt-1', bib_number: '099', finish_time: '2026-03-16T07:40:55+07:00', created_at: '' },
]

describe('generateCsv', () => {
  it('generates header row', () => {
    const csv = generateCsv(records, event)
    expect(csv.split('\n')[0]).toBe('bib,finish_time,net_time')
  })

  it('preserves leading zeros in bib_number', () => {
    const csv = generateCsv(records, event)
    expect(csv).toContain('099,')
  })

  it('exports finish_time as HH:MM:SS local time', () => {
    const csv = generateCsv(records, event)
    expect(csv).toContain('235,07:42:15,')
  })

  it('computes net_time correctly', () => {
    const csv = generateCsv(records, event)
    expect(csv).toContain('235,07:42:15,00:42:15')
  })

  it('sorts records by net_time ascending', () => {
    const csv = generateCsv(records, event)
    const lines = csv.split('\n').slice(1).filter(Boolean)
    expect(lines[0]).toContain('099')   // 40:55 < 42:15
    expect(lines[1]).toContain('235')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- export
```

Expected: FAIL

- [ ] **Step 3: Implement export.ts**

Create `lib/export.ts`:

```ts
import type { FinishRecord, Event } from '@/types'
import { calcNetTime, formatTime, formatNetTime } from './time'

export function generateCsv(records: FinishRecord[], event: Event): string {
  const sorted = [...records].sort((a, b) => {
    return calcNetTime(event.start_time, a.finish_time) -
           calcNetTime(event.start_time, b.finish_time)
  })

  const header = 'bib,finish_time,net_time'
  const rows = sorted.map((r) => {
    const finishFormatted = formatTime(r.finish_time, event.timezone)
    const netMs = calcNetTime(event.start_time, r.finish_time)
    const netFormatted = formatNetTime(netMs)
    return `${r.bib_number},${finishFormatted},${netFormatted}`
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

- [ ] **Step 4: Run tests**

```bash
npm test -- export
```

Expected: 5/5 PASS

- [ ] **Step 5: Commit**

```bash
git add lib/export.ts __tests__/export.test.ts
git commit -m "feat: add CSV export (generateCsv, downloadCsv)"
```

---

## Chunk 3: Storage & Sync

### Task 8: Local Storage layer

**Files:**
- Create: `lib/storage.ts`
- Create: `__tests__/storage.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/storage.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import {
  getPendingRecords,
  addPendingRecord,
  markSynced,
  removeSynced,
  getEventById,
  saveEvent,
} from '@/lib/storage'

beforeEach(() => {
  localStorage.clear()
})

describe('pending records', () => {
  it('returns empty array when nothing stored', () => {
    expect(getPendingRecords('evt-1')).toEqual([])
  })

  it('adds a pending record', () => {
    addPendingRecord({
      local_id: 'loc-1',
      event_id: 'evt-1',
      bib_number: '235',
      finish_time: '2026-03-16T07:42:15+07:00',
      synced: false,
    })
    const records = getPendingRecords('evt-1')
    expect(records).toHaveLength(1)
    expect(records[0].bib_number).toBe('235')
  })

  it('marks a record as synced', () => {
    addPendingRecord({
      local_id: 'loc-1',
      event_id: 'evt-1',
      bib_number: '235',
      finish_time: '2026-03-16T07:42:15+07:00',
      synced: false,
    })
    markSynced('evt-1', 'loc-1')
    const records = getPendingRecords('evt-1')
    expect(records[0].synced).toBe(true)
  })

  it('removes synced records', () => {
    addPendingRecord({ local_id: 'loc-1', event_id: 'evt-1', bib_number: '235', finish_time: '', synced: true })
    addPendingRecord({ local_id: 'loc-2', event_id: 'evt-1', bib_number: '180', finish_time: '', synced: false })
    removeSynced('evt-1')
    const records = getPendingRecords('evt-1')
    expect(records).toHaveLength(1)
    expect(records[0].local_id).toBe('loc-2')
  })

  it('allows caller to detect duplicate bib before adding', () => {
    // The duplicate check lives in the UI layer (CaptureScreen), not storage.
    // This test verifies that getPendingRecords returns data the caller can use to detect a duplicate.
    addPendingRecord({ local_id: 'loc-1', event_id: 'evt-1', bib_number: '235', finish_time: '', synced: false })
    const existing = getPendingRecords('evt-1').find((r) => r.bib_number === '235')
    expect(existing).toBeDefined()
    expect(existing?.bib_number).toBe('235')
  })
})

describe('event storage', () => {
  it('returns null when event not found', () => {
    expect(getEventById('missing')).toBeNull()
  })

  it('saves and retrieves an event', () => {
    const event = { id: 'evt-1', name: 'Test', start_time: '2026-03-16T07:00:00+07:00', timezone: 'Asia/Bangkok' }
    saveEvent(event)
    expect(getEventById('evt-1')).toEqual(event)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- storage
```

Expected: FAIL

- [ ] **Step 3: Implement storage.ts**

Create `lib/storage.ts`:

```ts
import type { Event, PendingRecord } from '@/types'

function pendingKey(eventId: string): string {
  return `timing:pending:${eventId}`
}

function eventKey(eventId: string): string {
  return `timing:event:${eventId}`
}

export function getPendingRecords(eventId: string): PendingRecord[] {
  const raw = localStorage.getItem(pendingKey(eventId))
  if (!raw) return []
  return JSON.parse(raw) as PendingRecord[]
}

function setPendingRecords(eventId: string, records: PendingRecord[]): void {
  localStorage.setItem(pendingKey(eventId), JSON.stringify(records))
}

export function addPendingRecord(record: PendingRecord): void {
  const records = getPendingRecords(record.event_id)
  records.push(record)
  setPendingRecords(record.event_id, records)
}

export function markSynced(eventId: string, localId: string): void {
  const records = getPendingRecords(eventId)
  const updated = records.map((r) =>
    r.local_id === localId ? { ...r, synced: true } : r
  )
  setPendingRecords(eventId, updated)
}

export function removeSynced(eventId: string): void {
  const records = getPendingRecords(eventId).filter((r) => !r.synced)
  setPendingRecords(eventId, records)
}

export function saveEvent(event: Event): void {
  localStorage.setItem(eventKey(event.id), JSON.stringify(event))
}

export function getEventById(eventId: string): Event | null {
  const raw = localStorage.getItem(eventKey(eventId))
  if (!raw) return null
  return JSON.parse(raw) as Event
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- storage
```

Expected: 7/7 PASS

- [ ] **Step 5: Commit**

```bash
git add lib/storage.ts __tests__/storage.test.ts
git commit -m "feat: add Local Storage layer for offline-first records"
```

---

### Task 9: Sync & conflict resolution

**Files:**
- Create: `lib/sync.ts`
- Create: `__tests__/sync.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/sync.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolveConflict, syncPendingRecords } from '@/lib/sync'
import type { PendingRecord, FinishRecord, SyncConflict } from '@/types'

// Mock dependencies for syncPendingRecords integration test
vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn() },
}))
vi.mock('@/lib/storage', () => ({
  getPendingRecords: vi.fn(),
  markSynced: vi.fn(),
  removeSynced: vi.fn(),
}))

import { supabase } from '@/lib/supabase'
import { getPendingRecords, markSynced, removeSynced } from '@/lib/storage'

describe('resolveConflict', () => {
  it('keeps the record with the earliest finish_time (local wins)', () => {
    const local: PendingRecord = {
      local_id: 'loc-1', event_id: 'evt-1', bib_number: '235',
      finish_time: '2026-03-16T07:40:00+07:00', synced: false,
    }
    const existing: FinishRecord = {
      id: 'db-1', event_id: 'evt-1', bib_number: '235',
      finish_time: '2026-03-16T07:42:00+07:00', created_at: '',
    }
    const result = resolveConflict(local, existing)
    expect(result.winner).toBe('local')
    expect(result.conflict.kept_finish_time).toBe(local.finish_time)
    expect(result.conflict.discarded_finish_time).toBe(existing.finish_time)
  })

  it('keeps existing when existing is earlier', () => {
    const local: PendingRecord = {
      local_id: 'loc-1', event_id: 'evt-1', bib_number: '235',
      finish_time: '2026-03-16T07:45:00+07:00', synced: false,
    }
    const existing: FinishRecord = {
      id: 'db-1', event_id: 'evt-1', bib_number: '235',
      finish_time: '2026-03-16T07:42:00+07:00', created_at: '',
    }
    const result = resolveConflict(local, existing)
    expect(result.winner).toBe('existing')
  })

  it('local wins on tie (equal timestamps)', () => {
    const time = '2026-03-16T07:42:00+07:00'
    const local: PendingRecord = {
      local_id: 'loc-1', event_id: 'evt-1', bib_number: '235',
      finish_time: time, synced: false,
    }
    const existing: FinishRecord = {
      id: 'db-1', event_id: 'evt-1', bib_number: '235',
      finish_time: time, created_at: '',
    }
    const result = resolveConflict(local, existing)
    expect(result.winner).toBe('local')
  })
})

describe('syncPendingRecords', () => {
  beforeEach(() => vi.clearAllMocks())

  it('does nothing when no pending records', async () => {
    vi.mocked(getPendingRecords).mockReturnValue([])
    await syncPendingRecords('evt-1', vi.fn())
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('inserts a new record when no conflict exists', async () => {
    const pending: PendingRecord = {
      local_id: 'loc-1', event_id: 'evt-1', bib_number: '235',
      finish_time: '2026-03-16T07:42:00+07:00', synced: false,
    }
    vi.mocked(getPendingRecords).mockReturnValue([pending])

    const maybeSingleMock = vi.fn().mockResolvedValue({ data: null, error: null })
    const insertMock = vi.fn().mockResolvedValue({ data: null, error: null })
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: maybeSingleMock,
      insert: insertMock,
    } as ReturnType<typeof supabase.from>)

    const onConflict = vi.fn()
    await syncPendingRecords('evt-1', onConflict)

    expect(onConflict).not.toHaveBeenCalled()
    expect(markSynced).toHaveBeenCalledWith('evt-1', 'loc-1')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- sync
```

Expected: FAIL

- [ ] **Step 3: Implement sync.ts**

Create `lib/sync.ts`:

```ts
import type { PendingRecord, FinishRecord, SyncConflict } from '@/types'
import { supabase } from './supabase'
import { getPendingRecords, markSynced, removeSynced } from './storage'

export interface ConflictResolution {
  winner: 'local' | 'existing'
  conflict: SyncConflict
}

export function resolveConflict(
  local: PendingRecord,
  existing: FinishRecord
): ConflictResolution {
  const localTime = new Date(local.finish_time).getTime()
  const existingTime = new Date(existing.finish_time).getTime()

  const winner = localTime <= existingTime ? 'local' : 'existing'
  const kept = winner === 'local' ? local.finish_time : existing.finish_time
  const discarded = winner === 'local' ? existing.finish_time : local.finish_time

  return {
    winner,
    conflict: {
      bib_number: local.bib_number,
      kept_finish_time: kept,
      discarded_finish_time: discarded,
      resolved_at: new Date().toISOString(),
    },
  }
}

export async function syncPendingRecords(
  eventId: string,
  onConflict: (conflict: SyncConflict) => void
): Promise<void> {
  const pending = getPendingRecords(eventId).filter((r) => !r.synced)
  if (pending.length === 0) return

  for (const record of pending) {
    // Check if bib already exists in Supabase
    const { data: existing } = await supabase
      .from('finish_records')
      .select('*')
      .eq('event_id', eventId)
      .eq('bib_number', record.bib_number)
      .maybeSingle()

    if (existing) {
      const resolution = resolveConflict(record, existing as FinishRecord)
      onConflict(resolution.conflict)

      if (resolution.winner === 'local') {
        // Update the existing record with the earlier time
        await supabase
          .from('finish_records')
          .update({ finish_time: record.finish_time })
          .eq('id', existing.id)
      }
      // If existing wins, do nothing — local record is discarded
      markSynced(eventId, record.local_id)
    } else {
      const { error } = await supabase.from('finish_records').insert({
        event_id: record.event_id,
        bib_number: record.bib_number,
        finish_time: record.finish_time,
      })
      if (!error) {
        markSynced(eventId, record.local_id)
      }
    }
  }

  removeSynced(eventId)
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- sync
```

Expected: 5/5 PASS

- [ ] **Step 5: Commit**

```bash
git add lib/sync.ts __tests__/sync.test.ts
git commit -m "feat: add sync layer with offline conflict resolution"
```

---

## Chunk 4: DB Layer

### Task 10: Database read/write functions

**Files:**
- Create: `lib/db.ts`
- Create: `__tests__/db.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/db.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Supabase client
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

import { supabase } from '@/lib/supabase'
import { createEvent, getEvent, createFinishRecord, getFinishRecords } from '@/lib/db'

const mockChain = (returnValue: unknown) => {
  const chain: Record<string, unknown> = {}
  const methods = ['select', 'insert', 'update', 'eq', 'order', 'single', 'maybeSingle']
  methods.forEach((m) => { chain[m] = vi.fn(() => chain) })
  chain['then'] = vi.fn((cb: (v: unknown) => unknown) => Promise.resolve(cb(returnValue)))
  return chain
}

beforeEach(() => vi.clearAllMocks())

describe('createEvent', () => {
  it('inserts event and returns data', async () => {
    const mockEvent = { id: 'evt-1', name: 'Test', start_time: '2026-03-16T07:00:00+07:00', timezone: 'Asia/Bangkok' }
    const chain = mockChain({ data: mockEvent, error: null })
    vi.mocked(supabase.from).mockReturnValue(chain as ReturnType<typeof supabase.from>)
    const result = await createEvent({ name: 'Test', start_time: '2026-03-16T07:00:00+07:00', timezone: 'Asia/Bangkok' })
    expect(result).toEqual(mockEvent)
  })
})

describe('getEvent', () => {
  it('returns event by id', async () => {
    const mockEvent = { id: 'evt-1', name: 'Test', start_time: '2026-03-16T07:00:00+07:00', timezone: 'Asia/Bangkok' }
    const chain = mockChain({ data: mockEvent, error: null })
    vi.mocked(supabase.from).mockReturnValue(chain as ReturnType<typeof supabase.from>)
    const result = await getEvent('evt-1')
    expect(result).toEqual(mockEvent)
  })

  it('returns null when not found', async () => {
    const chain = mockChain({ data: null, error: null })
    vi.mocked(supabase.from).mockReturnValue(chain as ReturnType<typeof supabase.from>)
    const result = await getEvent('missing')
    expect(result).toBeNull()
  })
})

describe('createFinishRecord', () => {
  it('inserts record and returns data', async () => {
    const mockRecord = { id: 'r1', event_id: 'evt-1', bib_number: '235', finish_time: '2026-03-16T07:42:00+07:00', created_at: '' }
    const chain = mockChain({ data: mockRecord, error: null })
    vi.mocked(supabase.from).mockReturnValue(chain as ReturnType<typeof supabase.from>)
    const result = await createFinishRecord({ event_id: 'evt-1', bib_number: '235', finish_time: '2026-03-16T07:42:00+07:00' })
    expect(result).toEqual(mockRecord)
  })
})

describe('getFinishRecords', () => {
  it('queries by event_id ordered by finish_time', async () => {
    const mockRecords = [{ id: 'r1', event_id: 'evt-1', bib_number: '235', finish_time: '', created_at: '' }]
    const chain = mockChain({ data: mockRecords, error: null })
    vi.mocked(supabase.from).mockReturnValue(chain as ReturnType<typeof supabase.from>)
    const result = await getFinishRecords('evt-1')
    expect(result).toEqual(mockRecords)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- db
```

Expected: FAIL

- [ ] **Step 3: Implement db.ts**

Create `lib/db.ts`:

```ts
import { supabase } from './supabase'
import type { Event, FinishRecord } from '@/types'

export async function createEvent(
  input: Omit<Event, 'id'>
): Promise<Event> {
  const { data, error } = await supabase
    .from('events')
    .insert(input)
    .select()
    .single()
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

- [ ] **Step 4: Run tests**

```bash
npm test -- db
```

Expected: 5/5 PASS

- [ ] **Step 5: Run all tests to ensure nothing broken**

```bash
npm test
```

Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add lib/db.ts __tests__/db.test.ts
git commit -m "feat: add DB layer (createEvent, getEvent, createFinishRecord, getFinishRecords)"
```

---

## Chunk 5: UI Screens

### Task 11: PWA layout + global styles

**Files:**
- Modify: `app/layout.tsx`
- Create: `public/manifest.json`

- [ ] **Step 1: Create PWA manifest**

Create `public/manifest.json`:

```json
{
  "name": "Timing",
  "short_name": "Timing",
  "description": "Race timing for running events",
  "start_url": "/",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#ffffff",
  "theme_color": "#000000",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

- [ ] **Step 2: Create placeholder icons**

```bash
mkdir -p public/icons
```

Then manually place two PNG files in `public/icons/`:
- `icon-192.png` — any 192×192 PNG image
- `icon-512.png` — any 512×512 PNG image

The quickest way: go to https://favicon.io/favicon-generator/, create a simple icon (e.g. letter "T"), download the package, and copy `android-chrome-192x192.png` → `icon-192.png` and `android-chrome-512x512.png` → `icon-512.png`.

Verify the files exist and are valid:
```bash
file public/icons/icon-192.png public/icons/icon-512.png
```

Expected: both lines should say `PNG image data` — not `empty` or `ASCII text`.

- [ ] **Step 3: Update app/layout.tsx**

Replace contents of `app/layout.tsx`:

```tsx
import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Timing',
  description: 'Race timing for running events',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Timing',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#000000',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
      </head>
      <body className={`${inter.className} bg-white text-gray-900 antialiased`}>
        {children}
      </body>
    </html>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add app/layout.tsx public/
git commit -m "feat: add PWA manifest and root layout with Apple web app meta tags"
```

---

### Task 12: Home page + Event Setup

**Files:**
- Modify: `app/page.tsx`
- Create: `components/EventSetupForm.tsx`

- [ ] **Step 1: Create EventSetupForm component**

Create `components/EventSetupForm.tsx`:

```tsx
'use client'
import { useState } from 'react'
import type { Event } from '@/types'

interface Props {
  onCreated: (event: Event) => void
}

export default function EventSetupForm({ onCreated }: Props) {
  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('07:00')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name || !date || !time) return
    setLoading(true)
    setError(null)

    try {
      const { createEvent } = await import('@/lib/db')
      const { saveEvent } = await import('@/lib/storage')

      // Combine date + time in Asia/Bangkok (UTC+7)
      const startTime = new Date(`${date}T${time}:00+07:00`).toISOString()

      const event = await createEvent({
        name,
        start_time: startTime,
        timezone: 'Asia/Bangkok',
      })

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
        <label className="block text-sm font-medium text-gray-700 mb-1">เวลาปล่อยตัว</label>
        <input
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-black"
          required
        />
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

- [ ] **Step 2: Update app/page.tsx**

Replace `app/page.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import EventSetupForm from '@/components/EventSetupForm'
import type { Event } from '@/types'

export default function HomePage() {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)

  function handleCreated(event: Event) {
    router.push(`/event/${event.id}`)
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-10 text-center">
          <span className="text-5xl">🏃</span>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight">Timing</h1>
          <p className="mt-2 text-gray-500 text-sm">บันทึกเวลานักวิ่ง</p>
        </div>

        {!showForm ? (
          <button
            onClick={() => setShowForm(true)}
            className="w-full bg-black text-white rounded-xl py-4 text-base font-medium"
          >
            + สร้างงานใหม่
          </button>
        ) : (
          <div>
            <button
              onClick={() => setShowForm(false)}
              className="mb-4 text-sm text-gray-400"
            >
              ← ยกเลิก
            </button>
            <EventSetupForm onCreated={handleCreated} />
          </div>
        )}
      </div>
    </main>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx components/EventSetupForm.tsx
git commit -m "feat: add home page and event setup form"
```

---

### Task 13: Event hub page

**Files:**
- Create: `app/event/[id]/page.tsx`

- [ ] **Step 1: Create event hub**

Create `app/event/[id]/page.tsx`:

```tsx
import Link from 'next/link'

interface Props {
  params: Promise<{ id: string }>
}

export default async function EventHubPage({ params }: Props) {
  const { id } = await params

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-4">
        <div className="mb-8 text-center">
          <span className="text-4xl">🏃</span>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">ควบคุมงาน</h1>
        </div>

        <Link
          href={`/event/${id}/capture`}
          className="flex items-center justify-between w-full bg-black text-white rounded-2xl px-6 py-5"
        >
          <div>
            <p className="text-base font-medium">บันทึกเวลา</p>
            <p className="text-xs text-gray-400 mt-0.5">Race Capture</p>
          </div>
          <span className="text-2xl">🎤</span>
        </Link>

        <Link
          href={`/event/${id}/results`}
          className="flex items-center justify-between w-full bg-gray-50 text-gray-900 rounded-2xl px-6 py-5 border border-gray-100"
        >
          <div>
            <p className="text-base font-medium">ผลการแข่งขัน</p>
            <p className="text-xs text-gray-400 mt-0.5">Live Results</p>
          </div>
          <span className="text-2xl">📊</span>
        </Link>

        <Link
          href={`/event/${id}/export`}
          className="flex items-center justify-between w-full bg-gray-50 text-gray-900 rounded-2xl px-6 py-5 border border-gray-100"
        >
          <div>
            <p className="text-base font-medium">ส่งออก CSV</p>
            <p className="text-xs text-gray-400 mt-0.5">Export</p>
          </div>
          <span className="text-2xl">⬇️</span>
        </Link>
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/event/
git commit -m "feat: add event hub page with links to capture/results/export"
```

---

### Task 14: Race Capture screen

**Files:**
- Create: `components/MicButton.tsx`
- Create: `components/ConfirmCapture.tsx`
- Create: `components/ManualBibInput.tsx`
- Create: `components/FinishLog.tsx`
- Create: `components/CaptureScreen.tsx`
- Create: `app/event/[id]/capture/page.tsx`

- [ ] **Step 1: MicButton component**

Create `components/MicButton.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { startSpeechRecognition, type SpeechResult } from '@/lib/speech'

interface Props {
  onResult: (result: SpeechResult) => void
  onError: (msg: string) => void
  disabled?: boolean
}

export default function MicButton({ onResult, onError, disabled }: Props) {
  const [listening, setListening] = useState(false)

  function handlePress() {
    if (disabled || listening) return
    setListening(true)
    const stop = startSpeechRecognition(
      'th-TH',
      (result) => {
        setListening(false)
        onResult(result)
      },
      (err) => {
        setListening(false)
        onError(err)
      }
    )
    // Auto-stop after 4 seconds as safety measure
    setTimeout(() => { stop(); setListening(false) }, 4000)
  }

  return (
    <button
      onPointerDown={handlePress}
      disabled={disabled}
      className={`
        w-48 h-48 rounded-full flex flex-col items-center justify-center
        text-white font-medium text-sm select-none
        transition-all duration-150
        ${listening
          ? 'bg-red-500 scale-95 shadow-inner'
          : 'bg-black shadow-lg active:scale-95'
        }
        disabled:opacity-40
      `}
    >
      <span className="text-4xl mb-2">{listening ? '🔴' : '🎤'}</span>
      <span>{listening ? 'กำลังฟัง...' : 'กดพูดเลขบิบ'}</span>
    </button>
  )
}
```

- [ ] **Step 2: ConfirmCapture component**

Create `components/ConfirmCapture.tsx`:

```tsx
import { formatTime } from '@/lib/time'

interface Props {
  transcript: string
  bib: string | null
  capturedAt: string
  timezone: string
  onConfirm: () => void
  onDiscard: () => void
}

export default function ConfirmCapture({ transcript, bib, capturedAt, timezone, onConfirm, onDiscard }: Props) {
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-2xl p-5 w-full">
      <p className="text-xs text-gray-400 mb-3">ได้ยิน: "{transcript}"</p>

      {bib ? (
        <div className="flex items-baseline gap-3 mb-5">
          <span className="text-4xl font-bold tracking-tight">{bib}</span>
          <span className="text-gray-400 text-lg">→</span>
          <span className="text-2xl font-mono text-gray-700">
            {formatTime(capturedAt, timezone)}
          </span>
        </div>
      ) : (
        <p className="text-red-500 mb-5 text-sm">ไม่พบเลขบิบ — กรอกเองด้านล่าง</p>
      )}

      <div className="flex gap-3">
        {bib && (
          <button
            onClick={onConfirm}
            className="flex-1 bg-black text-white rounded-xl py-3.5 font-medium"
          >
            ✓ บันทึก
          </button>
        )}
        <button
          onClick={onDiscard}
          className="flex-1 bg-gray-200 text-gray-700 rounded-xl py-3.5 font-medium"
        >
          ✗ ยกเลิก
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: ManualBibInput component**

Create `components/ManualBibInput.tsx`:

```tsx
'use client'
import { useState } from 'react'

interface Props {
  onSubmit: (bib: string, capturedAt: string) => void
}

export default function ManualBibInput({ onSubmit }: Props) {
  const [bib, setBib] = useState('')
  const [open, setOpen] = useState(false)

  function handleKey(digit: string) {
    setBib((prev) => prev + digit)
  }

  function handleBackspace() {
    setBib((prev) => prev.slice(0, -1))
  }

  function handleSubmit() {
    if (!bib) return
    onSubmit(bib, new Date().toISOString())
    setBib('')
    setOpen(false)
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-sm text-gray-400 underline underline-offset-2"
      >
        กรอกบิบเอง
      </button>
    )
  }

  const keys = [['1','2','3'],['4','5','6'],['7','8','9'],['','0','⌫']]

  return (
    <div className="w-full bg-gray-50 border border-gray-200 rounded-2xl p-4">
      <div className="text-center mb-3">
        <span className="text-3xl font-bold tracking-widest font-mono min-h-[2rem] block">
          {bib || <span className="text-gray-300">—</span>}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 mb-3">
        {keys.flat().map((k, i) => (
          <button
            key={i}
            onClick={() => k === '⌫' ? handleBackspace() : k ? handleKey(k) : undefined}
            className={`py-4 rounded-xl text-xl font-medium ${
              k === '⌫' ? 'bg-gray-200 text-gray-700' :
              k ? 'bg-white border border-gray-200 active:bg-gray-100' :
              'invisible'
            }`}
          >
            {k}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <button onClick={() => { setBib(''); setOpen(false) }} className="flex-1 py-3 rounded-xl bg-gray-200 text-gray-700 font-medium">
          ยกเลิก
        </button>
        <button onClick={handleSubmit} disabled={!bib} className="flex-1 py-3 rounded-xl bg-black text-white font-medium disabled:opacity-40">
          บันทึก
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: FinishLog component**

Create `components/FinishLog.tsx`:

```tsx
import type { PendingRecord } from '@/types'
import { formatTime } from '@/lib/time'

interface Props {
  records: PendingRecord[]
  timezone: string
}

export default function FinishLog({ records, timezone }: Props) {
  if (records.length === 0) return null

  const recent = [...records].reverse().slice(0, 10)

  return (
    <div className="w-full">
      <p className="text-xs text-gray-400 mb-2 font-medium uppercase tracking-wider">ล่าสุด</p>
      <div className="divide-y divide-gray-100">
        {recent.map((r) => (
          <div key={r.local_id} className="flex justify-between py-2.5 text-sm">
            <span className="font-mono font-semibold">{r.bib_number}</span>
            <span className="text-gray-400 font-mono">{formatTime(r.finish_time, timezone)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: CaptureScreen component**

Create `components/CaptureScreen.tsx`:

```tsx
'use client'
import { useState, useEffect, useCallback } from 'react'
import { v4 as uuidv4 } from 'uuid'
import MicButton from './MicButton'
import ConfirmCapture from './ConfirmCapture'
import ManualBibInput from './ManualBibInput'
import FinishLog from './FinishLog'
import type { Event, PendingRecord } from '@/types'
import type { SpeechResult } from '@/lib/speech'
import { addPendingRecord, getPendingRecords } from '@/lib/storage'
import { syncPendingRecords } from '@/lib/sync'
import { formatTime } from '@/lib/time'

interface Props {
  event: Event
}

export default function CaptureScreen({ event }: Props) {
  const [pending, setPending] = useState<SpeechResult & { capturedAt: string } | null>(null)
  const [records, setRecords] = useState<PendingRecord[]>([])
  const [error, setError] = useState<string | null>(null)
  const [duplicateWarning, setDuplicateWarning] = useState<{ bib: string; capturedAt: string; existingTime: string } | null>(null)

  useEffect(() => {
    setRecords(getPendingRecords(event.id))
  }, [event.id])

  // Sync when online
  useEffect(() => {
    function handleOnline() {
      syncPendingRecords(event.id, () => {})
    }
    window.addEventListener('online', handleOnline)
    if (navigator.onLine) handleOnline()
    return () => window.removeEventListener('online', handleOnline)
  }, [event.id])

  function saveRecord(bib: string, capturedAt: string, force = false) {
    const existingRecords = getPendingRecords(event.id)
    const duplicate = existingRecords.find((r) => r.bib_number === bib)

    if (duplicate && !force) {
      // Store pending overwrite data so the overwrite button can call saveRecord(..., true)
      setDuplicateWarning({ bib, capturedAt, existingTime: duplicate.finish_time })
      return
    }

    if (duplicate && force) {
      // Remove the old record before inserting the new one
      const updated = existingRecords.filter((r) => r.bib_number !== bib)
      localStorage.setItem(`timing:pending:${event.id}`, JSON.stringify(updated))
    }

    const record: PendingRecord = {
      local_id: uuidv4(),
      event_id: event.id,
      bib_number: bib,
      finish_time: capturedAt,
      synced: false,
    }
    addPendingRecord(record)
    setRecords(getPendingRecords(event.id))
    setPending(null)
    setError(null)
    setDuplicateWarning(null)
  }

  function handleSpeechResult(result: SpeechResult) {
    setPending(result)
    setError(null)
    setDuplicateWarning(null)
  }

  function handleManualSubmit(bib: string, capturedAt: string) {
    saveRecord(bib, capturedAt)
  }

  function handleConfirm() {
    if (!pending?.bib) return
    saveRecord(pending.bib, pending.capturedAt)
  }

  return (
    <div className="flex flex-col items-center px-6 pt-8 pb-6 gap-6 min-h-screen">
      <div className="w-full text-center">
        <p className="text-xs text-gray-400 uppercase tracking-wider font-medium">ปล่อยตัว</p>
        <p className="text-2xl font-mono font-semibold mt-0.5">
          {formatTime(event.start_time, event.timezone)}
        </p>
      </div>

      <div className="flex-1 flex items-center justify-center">
        <MicButton
          onResult={handleSpeechResult}
          onError={(e) => setError(`ไมค์ผิดพลาด: ${e}`)}
          disabled={!!pending}
        />
      </div>

      {error && (
        <p className="text-red-500 text-sm text-center">{error}</p>
      )}

      {duplicateWarning && (
        <div className="w-full bg-yellow-50 border border-yellow-200 rounded-2xl p-4 text-sm text-yellow-800">
          <p className="mb-3">
            บิบ {duplicateWarning.bib} บันทึกไปแล้ว ({formatTime(duplicateWarning.existingTime, event.timezone)}) — เขียนทับด้วยเวลาใหม่?
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => saveRecord(duplicateWarning.bib, duplicateWarning.capturedAt, true)}
              className="flex-1 bg-yellow-700 text-white rounded-xl py-2.5 text-sm font-medium"
            >
              ✓ เขียนทับ
            </button>
            <button
              onClick={() => { setDuplicateWarning(null); setPending(null) }}
              className="flex-1 bg-yellow-100 text-yellow-800 rounded-xl py-2.5 text-sm font-medium"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      )}

      {pending && (
        <div className="w-full max-w-sm">
          <ConfirmCapture
            transcript={pending.transcript}
            bib={pending.bib}
            capturedAt={pending.capturedAt}
            timezone={event.timezone}
            onConfirm={handleConfirm}
            onDiscard={() => { setPending(null); setDuplicateWarning(null) }}
          />
        </div>
      )}

      <div className="w-full max-w-sm">
        <ManualBibInput onSubmit={handleManualSubmit} />
      </div>

      <div className="w-full max-w-sm">
        <FinishLog records={records} timezone={event.timezone} />
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Install uuid**

```bash
npm install uuid
npm install -D @types/uuid
```

- [ ] **Step 7: Create capture page**

Create `app/event/[id]/capture/page.tsx`:

```tsx
'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import CaptureScreen from '@/components/CaptureScreen'
import type { Event } from '@/types'

export default function CapturePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [event, setEvent] = useState<Event | null>(null)

  useEffect(() => {
    async function load() {
      const { getEventById } = await import('@/lib/storage')
      const local = getEventById(id)
      if (local) { setEvent(local); return }
      const { getEvent } = await import('@/lib/db')
      const remote = await getEvent(id)
      if (remote) {
        const { saveEvent } = await import('@/lib/storage')
        saveEvent(remote)
        setEvent(remote)
      } else {
        router.push('/')
      }
    }
    load()
  }, [id, router])

  if (!event) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400">กำลังโหลด...</p>
      </div>
    )
  }

  return <CaptureScreen event={event} />
}
```

- [ ] **Step 8: Commit**

```bash
git add components/ app/event/
git commit -m "feat: add Race Capture screen (mic, confirm, manual input, finish log)"
```

---

### Task 15: Live Results screen

**Files:**
- Create: `components/ResultsTable.tsx`
- Create: `components/ConflictsPanel.tsx`
- Create: `app/event/[id]/results/page.tsx`

- [ ] **Step 1: ResultsTable component**

Create `components/ResultsTable.tsx`:

```tsx
import type { FinishRecord, Event } from '@/types'
import { calcNetTime, formatTime, formatNetTime } from '@/lib/time'

interface Props {
  records: FinishRecord[]
  event: Event
}

export default function ResultsTable({ records, event }: Props) {
  const sorted = [...records].sort((a, b) =>
    calcNetTime(event.start_time, a.finish_time) -
    calcNetTime(event.start_time, b.finish_time)
  )

  if (sorted.length === 0) {
    return <p className="text-gray-400 text-center text-sm py-8">ยังไม่มีผล</p>
  }

  return (
    <div className="w-full">
      <div className="grid grid-cols-3 text-xs text-gray-400 font-medium uppercase tracking-wider pb-2 border-b border-gray-100">
        <span>#</span>
        <span>บิบ</span>
        <span className="text-right">เวลาสุทธิ</span>
      </div>
      {sorted.map((r, i) => (
        <div key={r.id} className="grid grid-cols-3 py-3 border-b border-gray-50 text-sm">
          <span className="text-gray-400 font-medium">{i + 1}</span>
          <span className="font-mono font-semibold">{r.bib_number}</span>
          <span className="font-mono text-right">
            {formatNetTime(calcNetTime(event.start_time, r.finish_time))}
          </span>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: ConflictsPanel component**

Create `components/ConflictsPanel.tsx`:

```tsx
import type { SyncConflict } from '@/types'
import { formatTime } from '@/lib/time'

interface Props {
  conflicts: SyncConflict[]
  timezone: string
}

export default function ConflictsPanel({ conflicts, timezone }: Props) {
  if (conflicts.length === 0) return null

  return (
    <div className="w-full bg-yellow-50 border border-yellow-200 rounded-2xl p-4">
      <p className="text-xs font-semibold text-yellow-700 uppercase tracking-wider mb-3">
        ⚠️ Sync Conflicts ({conflicts.length})
      </p>
      <div className="space-y-2">
        {conflicts.map((c, i) => (
          <div key={i} className="text-xs text-yellow-800">
            <span className="font-mono font-bold">บิบ {c.bib_number}</span>
            {' '}— เก็บไว้: {formatTime(c.kept_finish_time, timezone)}
            {', '}ทิ้ง: {formatTime(c.discarded_finish_time, timezone)}
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create results page**

Create `app/event/[id]/results/page.tsx`:

```tsx
'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import ResultsTable from '@/components/ResultsTable'
import ConflictsPanel from '@/components/ConflictsPanel'
import type { Event, FinishRecord, SyncConflict } from '@/types'
import { supabase } from '@/lib/supabase'
import { getEvent } from '@/lib/db'
import { getEventById, saveEvent } from '@/lib/storage'

export default function ResultsPage() {
  const { id } = useParams<{ id: string }>()
  const [event, setEvent] = useState<Event | null>(null)
  const [records, setRecords] = useState<FinishRecord[]>([])
  const [conflicts, setConflicts] = useState<SyncConflict[]>([])

  useEffect(() => {
    async function load() {
      const local = getEventById(id)
      if (local) { setEvent(local) }
      else {
        const remote = await getEvent(id)
        if (remote) { saveEvent(remote); setEvent(remote) }
      }

      const { getFinishRecords } = await import('@/lib/db')
      const data = await getFinishRecords(id)
      setRecords(data)

      // Trigger sync of any pending offline records; surface conflicts
      const { syncPendingRecords } = await import('@/lib/sync')
      await syncPendingRecords(id, (conflict) => {
        setConflicts((prev) => [...prev, conflict])
      })
    }
    load()
  }, [id])

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`results-${id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'finish_records', filter: `event_id=eq.${id}` },
        () => {
          import('@/lib/db').then(({ getFinishRecords }) =>
            getFinishRecords(id).then(setRecords)
          )
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [id])

  if (!event) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400">กำลังโหลด...</p>
      </div>
    )
  }

  return (
    <main className="px-6 pt-8 pb-6 max-w-sm mx-auto">
      <h1 className="text-2xl font-semibold tracking-tight mb-1">ผลการแข่งขัน</h1>
      <p className="text-sm text-gray-400 mb-6">{event.name}</p>
      <ConflictsPanel conflicts={conflicts} timezone={event.timezone} />
      <div className="mt-4">
        <ResultsTable records={records} event={event} />
      </div>
    </main>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add components/ResultsTable.tsx components/ConflictsPanel.tsx app/event/[id]/results/
git commit -m "feat: add Live Results screen with realtime Supabase subscription"
```

---

### Task 16: Export screen

**Files:**
- Create: `app/event/[id]/export/page.tsx`

- [ ] **Step 1: Create export page**

Create `app/event/[id]/export/page.tsx`:

```tsx
'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import type { Event, FinishRecord } from '@/types'
import { getEvent } from '@/lib/db'
import { getEventById, saveEvent } from '@/lib/storage'
import { generateCsv, downloadCsv } from '@/lib/export'
import { formatTime } from '@/lib/time'

export default function ExportPage() {
  const { id } = useParams<{ id: string }>()
  const [event, setEvent] = useState<Event | null>(null)
  const [records, setRecords] = useState<FinishRecord[]>([])

  useEffect(() => {
    async function load() {
      const local = getEventById(id)
      if (local) setEvent(local)
      else {
        const remote = await getEvent(id)
        if (remote) { saveEvent(remote); setEvent(remote) }
      }
      const { getFinishRecords } = await import('@/lib/db')
      const data = await getFinishRecords(id)
      setRecords(data)
    }
    load()
  }, [id])

  function handleDownload() {
    if (!event) return
    const csv = generateCsv(records, event)
    const date = new Date(event.start_time).toISOString().slice(0, 10)
    downloadCsv(csv, `timing-${date}.csv`)
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
      <h1 className="text-2xl font-semibold tracking-tight mb-1">ส่งออก CSV</h1>
      <p className="text-sm text-gray-400 mb-6">{event.name}</p>

      <div className="bg-gray-50 rounded-2xl p-4 mb-6 text-sm">
        <p className="text-gray-500">จำนวนบันทึก: <span className="font-semibold text-gray-900">{records.length} คน</span></p>
        <p className="text-gray-500 mt-1">ปล่อยตัว: <span className="font-semibold text-gray-900 font-mono">{formatTime(event.start_time, event.timezone)}</span></p>
      </div>

      <button
        onClick={handleDownload}
        disabled={records.length === 0}
        className="w-full bg-black text-white rounded-xl py-4 text-base font-medium disabled:opacity-40"
      >
        ⬇️ ดาวน์โหลด CSV
      </button>

      <p className="mt-4 text-xs text-gray-400 text-center">
        ไฟล์มีคอลัมน์: bib, finish_time, net_time
      </p>
    </main>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/event/[id]/export/
git commit -m "feat: add Export CSV screen"
```

---

### Task 17: Install Prompt component

**Files:**
- Create: `components/InstallPrompt.tsx`
- Modify: `app/layout.tsx`

- [ ] **Step 1: Create InstallPrompt**

Create `components/InstallPrompt.tsx`:

```tsx
'use client'
import { useEffect, useState } from 'react'

export default function InstallPrompt() {
  const [prompt, setPrompt] = useState<Event | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    function handler(e: Event) {
      e.preventDefault()
      setPrompt(e)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  if (!prompt || dismissed) return null

  async function handleInstall() {
    const deferredPrompt = prompt as BeforeInstallPromptEvent
    deferredPrompt.prompt()
    await deferredPrompt.userChoice
    setDismissed(true)
  }

  return (
    <div className="fixed bottom-6 left-4 right-4 bg-black text-white rounded-2xl p-4 flex items-center justify-between shadow-xl z-50">
      <div>
        <p className="text-sm font-medium">ติดตั้งแอป</p>
        <p className="text-xs text-gray-400 mt-0.5">เพิ่มไปยังหน้าจอหลัก</p>
      </div>
      <div className="flex gap-2">
        <button onClick={() => setDismissed(true)} className="px-3 py-2 text-xs text-gray-400">
          ไว้ก่อน
        </button>
        <button onClick={handleInstall} className="px-4 py-2 bg-white text-black rounded-xl text-xs font-medium">
          ติดตั้ง
        </button>
      </div>
    </div>
  )
}

// Extend Window type for TypeScript
declare global {
  interface BeforeInstallPromptEvent extends Event {
    prompt(): Promise<void>
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
  }
}
```

- [ ] **Step 2: Update app/layout.tsx to include InstallPrompt**

Replace the full contents of `app/layout.tsx` (extends the version from Task 11):

```tsx
import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import InstallPrompt from '@/components/InstallPrompt'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Timing',
  description: 'Race timing for running events',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Timing',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#000000',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
      </head>
      <body className={`${inter.className} bg-white text-gray-900 antialiased`}>
        {children}
        <InstallPrompt />
      </body>
    </html>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add components/InstallPrompt.tsx app/layout.tsx
git commit -m "feat: add install prompt for PWA add-to-home-screen"
```

---

## Chunk 6: Deploy & Final Checks

### Task 18: Deploy to Vercel

- [ ] **Step 1: Run all tests**

```bash
npm test
```

Expected output:
```
✓ __tests__/speech.test.ts (9)
✓ __tests__/time.test.ts (5)
✓ __tests__/export.test.ts (5)
✓ __tests__/storage.test.ts (7)
✓ __tests__/sync.test.ts (5)
✓ __tests__/db.test.ts (5)

Test Files  6 passed
Tests      36 passed
```

Fix any failures before proceeding.

- [ ] **Step 2: Verify production build**

```bash
npx next build
```

Expected: Build completes with no TypeScript or lint errors. Fix any errors before pushing.

- [ ] **Step 3: Push to GitHub**

Create a GitHub repo at https://github.com/new, then:

```bash
# Replace YOUR_USERNAME with your actual GitHub username
git remote add origin https://github.com/YOUR_USERNAME/timing.git
git push -u origin main
```

- [ ] **Step 4: Deploy on Vercel**

1. Go to https://vercel.com, sign in
2. "Add New Project" → import your GitHub repo (`timing`)
3. Add environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL` = your Supabase project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = your anon key
4. Deploy
5. Verify: deployment URL shows the app (e.g. `https://timing-xxx.vercel.app`)

- [ ] **Step 5: Enable Supabase Realtime**

In Supabase dashboard → Database → Replication:
- Enable realtime for `finish_records` table
- Verify: toggle should be ON (green)

- [ ] **Step 6: Test on mobile**

1. Open deployed URL on iOS or Android
2. Test speech recognition — speak "สองสามห้า", confirm bib `235` appears with correct timestamp. Pass: bib saved to log.
3. Test manual bib entry — tap "กรอกบิบเอง", enter `099`, tap บันทึก. Pass: `099` appears in log.
4. Add to Home Screen → reopen from home screen. Pass: app opens fullscreen, no browser address bar.
5. Turn off WiFi/mobile data → record bib `001` → turn on internet. Pass: bib `001` appears in Live Results screen within ~5 seconds.

- [ ] **Step 7: Final commit**

```bash
git add -A
git commit -m "chore: final cleanup before launch"
git push
```
