# Per-Event Password Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace global PIN auth with per-event passwords stored in the `events` DB table; each event's password gates access to that event.

**Architecture:** Add `password` column to `events` via migration 004 (which also updates the `create_event_with_distances` RPC). Login page queries `getEventByPassword()` instead of checking env var. EventSetupForm collects a password on creation. Settings page shows/edits the event password.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase (postgres + JS client), Vitest + @testing-library/react, Tailwind v4

---

## File Structure

| File | Change |
|---|---|
| `supabase/migrations/004_add_event_password.sql` | New — adds `password` column + rewrites RPC |
| `types/index.ts` | Edit — add `password: string` to `Event` |
| `lib/db.ts` | Edit — update `createEventWithDistances`, add `getEventByPassword`, `updateEventPassword` |
| `app/page.tsx` | Edit — replace PIN logic with `getEventByPassword` call |
| `components/EventSetupForm.tsx` | Edit — add "Event Password" field |
| `app/event/[id]/settings/page.tsx` | Edit — add "Access Password" always-visible section |
| `.env.example` | Edit — remove `NEXT_PUBLIC_APP_PIN` |
| `__tests__/login-page.test.tsx` | Replace entirely |
| `__tests__/event-setup-form.test.tsx` | New |
| `__tests__/settings-page.test.tsx` | New |

---

## Context: Production Supabase DB

The production Supabase project currently only has migrations 001 applied (`events` and `finish_records` tables, old schema). Migrations 002, 003, and 004 must be applied manually in the Supabase SQL Editor **before** deploying the new code. The plan includes the exact SQL to run.

---

## Task 1: Migration file + types + db.ts

**Files:**
- Create: `supabase/migrations/004_add_event_password.sql`
- Modify: `types/index.ts`
- Modify: `lib/db.ts`

- [ ] **Step 1: Create migration file**

Create `supabase/migrations/004_add_event_password.sql`:

```sql
-- Add password column to events
ALTER TABLE events ADD COLUMN password TEXT NOT NULL DEFAULT '';

-- Redefine RPC to accept p_password (replaces the version from migration 002)
CREATE OR REPLACE FUNCTION create_event_with_distances(
  p_name      text,
  p_timezone  text,
  p_password  text,
  p_distances jsonb
) RETURNS events AS $$
DECLARE
  v_event events;
BEGIN
  INSERT INTO events (name, timezone, overall_lockout, password)
  VALUES (p_name, p_timezone, false, p_password)
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
```

> **Note for production deployment:** After merging this code, run migrations 002, 003, and 004 in the Supabase SQL Editor in order. Migration 002 is in `supabase/migrations/002_multi_distance.sql`, 003 in `003_add_created_at.sql`, and 004 is the file above.

- [ ] **Step 2: Add `password` to Event type**

In `types/index.ts`, update the `Event` interface from:

```ts
export interface Event {
  id: string
  name: string
  timezone: string
  overall_lockout: boolean
  created_at: string
}
```

To:

```ts
export interface Event {
  id: string
  name: string
  timezone: string
  overall_lockout: boolean
  created_at: string
  password: string
}
```

- [ ] **Step 3: Update `createEventWithDistances` in `lib/db.ts`**

Change the function signature from (lines 6–18):
```ts
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
```

To:
```ts
export async function createEventWithDistances(
  name: string,
  timezone: string,
  password: string,
  distances: { name: string; start_time: string; overall_top_n?: number; default_top_n?: number }[]
): Promise<Event> {
  const { data, error } = await supabase.rpc('create_event_with_distances', {
    p_name: name,
    p_timezone: timezone,
    p_password: password,
    p_distances: JSON.stringify(distances),
  })
  if (error) throw error
  return data as Event
}
```

- [ ] **Step 4: Add `getEventByPassword` to `lib/db.ts`**

Add after `getEvents` (after line 45):

```ts
export async function getEventByPassword(password: string): Promise<Event | null> {
  const trimmed = password.trim()
  if (!trimmed) return null
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('password', trimmed)
    .neq('password', '')
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data as Event | null
}
```

- [ ] **Step 5: Add `updateEventPassword` to `lib/db.ts`**

Add after `updateEventName` (after line 53):

```ts
export async function updateEventPassword(id: string, password: string): Promise<void> {
  const { error } = await supabase
    .from('events')
    .update({ password })
    .eq('id', id)
  if (error) throw error
}
```

- [ ] **Step 6: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: 1 type error in `components/EventSetupForm.tsx` on the `createEventWithDistances` call (expected — it will be fixed in Task 3). All other files should be error-free.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/004_add_event_password.sql types/index.ts lib/db.ts
git commit -m "feat: add password column migration and db.ts functions"
```

---

## Task 2: Login page rewrite (TDD)

**Files:**
- Modify: `__tests__/login-page.test.tsx` (replace entirely)
- Modify: `app/page.tsx`

The current `app/page.tsx` uses `process.env.NEXT_PUBLIC_APP_PIN` for auth. Replace it with a call to `getEventByPassword`. The current test file uses `vi.stubEnv` and tests the old PIN flow — replace entirely.

**Pattern note:** The component calls `await import('@/lib/db')` inside `handleSubmit`. Use `vi.mock('@/lib/db', ...)` at the top of the test — Vitest hoists this and intercepts all dynamic imports too.

- [ ] **Step 1: Write failing tests**

Replace `__tests__/login-page.test.tsx` entirely with:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockPush = vi.fn()
const mockReplace = vi.fn()
const mockGetEventByPassword = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}))

vi.mock('@/lib/db', () => ({
  getEventByPassword: (...args: unknown[]) => mockGetEventByPassword(...args),
}))

let storageMock: Record<string, string> = {}

beforeEach(() => {
  storageMock = {}
  mockPush.mockReset()
  mockReplace.mockReset()
  mockGetEventByPassword.mockReset()
  vi.stubGlobal('sessionStorage', {
    getItem: (k: string) => storageMock[k] ?? null,
    setItem: (k: string, v: string) => { storageMock[k] = v },
    removeItem: (k: string) => { delete storageMock[k] },
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// Use vi.resetModules() + dynamic import so the fresh module picks up the mocks
// (consistent with the rest of the test suite that mocks @/lib/db)
async function renderPage() {
  vi.resetModules()
  const { default: Page } = await import('@/app/page')
  render(<Page />)
}

describe('Login Page', () => {
  it('redirects to /events if already authed', async () => {
    storageMock['authed'] = '1'
    await renderPage()
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/events'))
  })

  it('shows "Incorrect password" when getEventByPassword returns null', async () => {
    mockGetEventByPassword.mockResolvedValue(null)
    await renderPage()
    fireEvent.change(screen.getByLabelText('Event Password'), { target: { value: 'wrongpass' } })
    fireEvent.click(screen.getByRole('button', { name: /enter/i }))
    await waitFor(() => expect(screen.getByText('Incorrect password')).toBeInTheDocument())
  })

  it('sets sessionStorage authed and calls router.push on correct password', async () => {
    mockGetEventByPassword.mockResolvedValue({
      id: 'e1', name: 'Test', timezone: 'Asia/Bangkok',
      overall_lockout: false, created_at: '', password: 'pass1234',
    })
    await renderPage()
    fireEvent.change(screen.getByLabelText('Event Password'), { target: { value: 'pass1234' } })
    fireEvent.click(screen.getByRole('button', { name: /enter/i }))
    await waitFor(() => {
      expect(storageMock['authed']).toBe('1')
      expect(mockPush).toHaveBeenCalledWith('/event/e1')
    })
  })

  it('shows "Enter password" on empty submit', async () => {
    await renderPage()
    fireEvent.click(screen.getByRole('button', { name: /enter/i }))
    expect(screen.getByText('Enter password')).toBeInTheDocument()
    expect(mockGetEventByPassword).not.toHaveBeenCalled()
  })

  it('does not call getEventByPassword when input is whitespace-only', async () => {
    await renderPage()
    fireEvent.change(screen.getByLabelText('Event Password'), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: /enter/i }))
    expect(screen.getByText('Enter password')).toBeInTheDocument()
    expect(mockGetEventByPassword).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npx vitest run __tests__/login-page.test.tsx`
Expected: FAIL — "Event Password" label not found (old page still has "PIN" label)

- [ ] **Step 3: Implement new `app/page.tsx`**

Replace entire file with:

```tsx
'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Timer } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (sessionStorage.getItem('authed') === '1') {
      router.replace('/events')
    }
  }, [router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = password.trim()
    if (!trimmed) { setError('Enter password'); return }
    setLoading(true)
    setError(null)
    try {
      const { getEventByPassword } = await import('@/lib/db')
      const event = await getEventByPassword(trimmed)
      if (!event) {
        setError('Incorrect password')
        setPassword('')
        return
      }
      sessionStorage.setItem('authed', '1')
      router.push(`/event/${event.id}`)
    } catch {
      setError('Something went wrong. Try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6">
      <div className="flex flex-col items-center gap-2 mb-8">
        <Timer size={48} />
        <h1 className="text-3xl font-bold">Timing</h1>
      </div>
      <form onSubmit={handleSubmit} className="w-full max-w-xs flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="password" className="text-sm font-medium">Event Password</label>
          <input
            id="password"
            aria-label="Event Password"
            type="password"
            value={password}
            onChange={e => { setPassword(e.target.value); setError(null) }}
            className="border rounded-xl px-4 py-3 text-base"
            autoFocus
            autoComplete="current-password"
          />
        </div>
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="bg-black text-white rounded-xl py-4 text-base font-medium disabled:opacity-50"
        >
          {loading ? 'Checking...' : 'Enter'}
        </button>
      </form>
    </main>
  )
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `npx vitest run __tests__/login-page.test.tsx`
Expected: 5/5 PASS

- [ ] **Step 5: Commit**

```bash
git add __tests__/login-page.test.tsx app/page.tsx
git commit -m "feat: replace PIN login with per-event password lookup"
```

---

## Task 3: EventSetupForm password field (TDD)

**Files:**
- Create: `__tests__/event-setup-form.test.tsx`
- Modify: `components/EventSetupForm.tsx`

The form currently has 3 fields (name, date, distances). Add a 4th "Event Password" field. The field is `type="text"` (visible) so admins can see and share the password. Validation: required + minimum 4 characters.

- [ ] **Step 1: Write failing tests**

Create `__tests__/event-setup-form.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import EventSetupForm from '@/components/EventSetupForm'

const mockCreateEventWithDistances = vi.fn()
const mockSaveEvent = vi.fn()

vi.mock('@/lib/db', () => ({
  createEventWithDistances: (...args: unknown[]) => mockCreateEventWithDistances(...args),
}))

vi.mock('@/lib/storage', () => ({
  saveEvent: (...args: unknown[]) => mockSaveEvent(...args),
}))

beforeEach(() => {
  mockCreateEventWithDistances.mockReset()
  mockSaveEvent.mockReset()
})

// Helper: fill name and date (required to reach password validation)
function fillNameAndDate() {
  fireEvent.change(screen.getByPlaceholderText('e.g. XYZ Marathon 2026'), {
    target: { value: 'Test Marathon' },
  })
  fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-04-01' } })
}

describe('EventSetupForm — password field', () => {
  it('shows "Enter a password" when password field is empty on submit', async () => {
    render(<EventSetupForm onCreated={vi.fn()} />)
    fillNameAndDate()
    fireEvent.click(screen.getByRole('button', { name: /create event/i }))
    await waitFor(() =>
      expect(screen.getByText('Enter a password')).toBeInTheDocument()
    )
    expect(mockCreateEventWithDistances).not.toHaveBeenCalled()
  })

  it('shows "Password must be at least 4 characters" for short password', async () => {
    render(<EventSetupForm onCreated={vi.fn()} />)
    fillNameAndDate()
    fireEvent.change(screen.getByLabelText('Event Password'), { target: { value: 'ab' } })
    fireEvent.click(screen.getByRole('button', { name: /create event/i }))
    await waitFor(() =>
      expect(screen.getByText('Password must be at least 4 characters')).toBeInTheDocument()
    )
    expect(mockCreateEventWithDistances).not.toHaveBeenCalled()
  })

  it('calls createEventWithDistances with password as 4th argument', async () => {
    const mockEvent = {
      id: 'new-1', name: 'Test Marathon', timezone: 'Asia/Bangkok',
      overall_lockout: false, created_at: '', password: 'race2026',
    }
    mockCreateEventWithDistances.mockResolvedValue(mockEvent)
    const onCreated = vi.fn()
    render(<EventSetupForm onCreated={onCreated} />)
    fillNameAndDate()
    fireEvent.change(screen.getByLabelText('Event Password'), { target: { value: 'race2026' } })
    fireEvent.click(screen.getByRole('button', { name: /create event/i }))
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(mockEvent))
    expect(mockCreateEventWithDistances).toHaveBeenCalledWith(
      'Test Marathon',
      'Asia/Bangkok',
      'race2026',
      expect.any(Array)
    )
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npx vitest run __tests__/event-setup-form.test.tsx`
Expected: FAIL — "Event Password" label not found

- [ ] **Step 3: Update `components/EventSetupForm.tsx`**

Add `password` and `passwordError` state. Add "Event Password" field with `id="event-password"` and `aria-label="Event Password"`. Add password label with `htmlFor="event-password"`. Also add `htmlFor="event-date"` and `id="event-date"` to the date field (so `getByLabelText('Date')` works in tests). Update `handleSubmit` with validation and pass `password` to `createEventWithDistances`.

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
  const [password, setPassword] = useState('')
  const [distances, setDistances] = useState<DistanceRow[]>([
    { key: crypto.randomUUID(), name: '', time: '07:00' },
  ])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name || !date) return
    const trimmedPassword = password.trim()
    if (!trimmedPassword) { setPasswordError('Enter a password'); return }
    if (trimmedPassword.length < 4) { setPasswordError('Password must be at least 4 characters'); return }
    setLoading(true)
    setError(null)
    setPasswordError(null)
    try {
      const { createEventWithDistances } = await import('@/lib/db')
      const { saveEvent } = await import('@/lib/storage')
      const distancePayload = distances.map((row) => ({
        name: row.name,
        start_time: rowToStartTime(date, row.time),
      }))
      const event = await createEventWithDistances(name, 'Asia/Bangkok', trimmedPassword, distancePayload)
      saveEvent(event)
      onCreated(event)
    } catch (err) {
      setError('Failed to create event. Please try again.')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Event Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. XYZ Marathon 2026"
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-black"
          required
        />
      </div>
      <div>
        <label htmlFor="event-date" className="block text-sm font-medium text-gray-700 mb-1">Date</label>
        <input
          id="event-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-black"
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Distances & Start Times</label>
        <DistanceList rows={distances} date={date} onChange={setDistances} />
      </div>
      <div>
        <label htmlFor="event-password" className="block text-sm font-medium text-gray-700 mb-1">Event Password</label>
        <input
          id="event-password"
          aria-label="Event Password"
          type="text"
          value={password}
          onChange={(e) => { setPassword(e.target.value); setPasswordError(null) }}
          placeholder="Share this with your team"
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-black"
        />
        {passwordError && <p className="text-red-500 text-sm mt-1">{passwordError}</p>}
      </div>
      {error && <p className="text-red-500 text-sm">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full bg-black text-white rounded-xl py-4 text-base font-medium disabled:opacity-50"
      >
        {loading ? 'Creating...' : 'Create Event'}
      </button>
    </form>
  )
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `npx vitest run __tests__/event-setup-form.test.tsx`
Expected: 3/3 PASS

- [ ] **Step 5: Run full test suite to check no regressions**

Run: `npx vitest run`
Expected: All tests pass (events-page tests that use EventSetupForm stub won't be affected)

- [ ] **Step 6: Commit**

```bash
git add __tests__/event-setup-form.test.tsx components/EventSetupForm.tsx
git commit -m "feat: add Event Password field to EventSetupForm"
```

---

## Task 4: Settings page Access Password section (TDD)

**Files:**
- Create: `__tests__/settings-page.test.tsx`
- Modify: `app/event/[id]/settings/page.tsx`

Add an always-visible "Access Password" section below the three existing accordion sections. It shows the current password and allows changing it inline. This section is NOT an accordion — do not modify the `openSection` type or state.

- [ ] **Step 1: Write failing tests**

Create `__tests__/settings-page.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetEvent = vi.fn()
const mockGetDistancesForEvent = vi.fn()
const mockGetAthletesForEvent = vi.fn()
const mockGetSubgroupOverrides = vi.fn()
const mockUpdateEventPassword = vi.fn()
const mockPush = vi.fn()

vi.mock('@/lib/db', () => ({
  getEvent: (...args: unknown[]) => mockGetEvent(...args),
  getDistancesForEvent: (...args: unknown[]) => mockGetDistancesForEvent(...args),
  getAthletesForEvent: (...args: unknown[]) => mockGetAthletesForEvent(...args),
  getSubgroupOverrides: (...args: unknown[]) => mockGetSubgroupOverrides(...args),
  updateEventPassword: (...args: unknown[]) => mockUpdateEventPassword(...args),
}))

vi.mock('@/lib/storage', () => ({
  saveEvent: vi.fn(),
  saveDistances: vi.fn(),
  saveAthletes: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'evt-1' }),
  useRouter: () => ({ push: mockPush, replace: vi.fn() }),
}))

const mockEvent = {
  id: 'evt-1',
  name: 'Test Marathon',
  timezone: 'Asia/Bangkok',
  overall_lockout: false,
  created_at: '2026-01-01T00:00:00Z',
  password: 'secret123',
}

const mockDistance = {
  id: 'dist-1',
  event_id: 'evt-1',
  name: 'Full',
  start_time: '2026-04-01T07:00:00.000Z',
  overall_top_n: 3,
  default_top_n: 3,
}

beforeEach(() => {
  mockGetEvent.mockReset()
  mockGetDistancesForEvent.mockReset()
  mockGetAthletesForEvent.mockReset()
  mockGetSubgroupOverrides.mockReset()
  mockUpdateEventPassword.mockReset()
  mockPush.mockReset()

  mockGetEvent.mockResolvedValue(mockEvent)
  mockGetDistancesForEvent.mockResolvedValue([mockDistance])
  mockGetAthletesForEvent.mockResolvedValue([])
  mockGetSubgroupOverrides.mockResolvedValue([])
  mockUpdateEventPassword.mockResolvedValue(undefined)

  Object.defineProperty(navigator, 'onLine', {
    value: true, writable: true, configurable: true,
  })
})

async function renderPage() {
  vi.resetModules()
  const { default: SettingsPage } = await import('@/app/event/[id]/settings/page')
  render(<SettingsPage />)
}

describe('Settings Page — Access Password', () => {
  it('displays current event password', async () => {
    await renderPage()
    await waitFor(() => expect(screen.getByText('secret123')).toBeInTheDocument())
  })

  it('"Change" button shows inline edit field pre-filled with current password', async () => {
    await renderPage()
    await waitFor(() => screen.getByRole('button', { name: /change/i }))
    fireEvent.click(screen.getByRole('button', { name: /change/i }))
    expect(screen.getByDisplayValue('secret123')).toBeInTheDocument()
  })

  it('"Save" calls updateEventPassword with trimmed new value', async () => {
    await renderPage()
    await waitFor(() => screen.getByRole('button', { name: /change/i }))
    fireEvent.click(screen.getByRole('button', { name: /change/i }))
    fireEvent.change(screen.getByDisplayValue('secret123'), { target: { value: '  newpass  ' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() =>
      expect(mockUpdateEventPassword).toHaveBeenCalledWith('evt-1', 'newpass')
    )
  })

  it('shows "Password cannot be empty" for blank input', async () => {
    await renderPage()
    await waitFor(() => screen.getByRole('button', { name: /change/i }))
    fireEvent.click(screen.getByRole('button', { name: /change/i }))
    fireEvent.change(screen.getByDisplayValue('secret123'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    expect(screen.getByText('Password cannot be empty')).toBeInTheDocument()
    expect(mockUpdateEventPassword).not.toHaveBeenCalled()
  })

  it('shows "Password must be at least 4 characters" for short password', async () => {
    await renderPage()
    await waitFor(() => screen.getByRole('button', { name: /change/i }))
    fireEvent.click(screen.getByRole('button', { name: /change/i }))
    fireEvent.change(screen.getByDisplayValue('secret123'), { target: { value: 'ab' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    expect(screen.getByText('Password must be at least 4 characters')).toBeInTheDocument()
    expect(mockUpdateEventPassword).not.toHaveBeenCalled()
  })

  it('"Cancel" dismisses edit without calling updateEventPassword', async () => {
    await renderPage()
    await waitFor(() => screen.getByRole('button', { name: /change/i }))
    fireEvent.click(screen.getByRole('button', { name: /change/i }))
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }))
    expect(mockUpdateEventPassword).not.toHaveBeenCalled()
    expect(screen.queryByDisplayValue('secret123')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npx vitest run __tests__/settings-page.test.tsx`
Expected: FAIL — "secret123" not found (Access Password section doesn't exist yet)

- [ ] **Step 3: Add state and handler to `app/event/[id]/settings/page.tsx`**

Add three new state variables after `const [openSection, setOpenSection] = useState<0 | 1 | 2 | 3>(1)` (line 19):

```ts
const [pwEditing, setPwEditing] = useState(false)
const [pwInput, setPwInput] = useState('')
const [pwError, setPwError] = useState<string | null>(null)
```

Add the `handleSavePassword` function after `handleDeleteDistance` (after line 99):

```ts
async function handleSavePassword() {
  const trimmed = pwInput.trim()
  if (!trimmed) { setPwError('Password cannot be empty'); return }
  if (trimmed.length < 4) { setPwError('Password must be at least 4 characters'); return }
  try {
    const { updateEventPassword } = await import('@/lib/db')
    await updateEventPassword(id, trimmed)
    setEvent(prev => prev ? { ...prev, password: trimmed } : prev)
    setPwEditing(false)
    setPwError(null)
  } catch {
    setPwError('Failed to save. Try again.')
  }
}
```

- [ ] **Step 4: Add Access Password section to the JSX**

In `app/event/[id]/settings/page.tsx`, add the following block after the closing `</div>` of Section 3 (Prizes), before the closing `</main>` tag (after line 207):

```tsx
{/* Access Password — always visible */}
<div className="border border-gray-100 rounded-2xl mt-3 overflow-hidden">
  <div className="px-5 py-4">
    <p className="font-medium mb-3">Access Password</p>
    {pwEditing ? (
      <div className="space-y-2">
        <input
          type="text"
          value={pwInput}
          onChange={e => { setPwInput(e.target.value); setPwError(null) }}
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-black"
          autoFocus
        />
        {pwError && <p className="text-red-500 text-sm">{pwError}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleSavePassword}
            className="flex-1 bg-black text-white rounded-xl py-2.5 text-sm font-medium"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => { setPwEditing(false); setPwError(null) }}
            className="flex-1 border border-gray-200 rounded-xl py-2.5 text-sm"
          >
            Cancel
          </button>
        </div>
      </div>
    ) : (
      <div className="flex items-center justify-between">
        <span className="font-mono text-sm">{event.password}</span>
        <button
          type="button"
          onClick={() => { setPwInput(event.password); setPwEditing(true) }}
          className="text-sm text-gray-500 underline"
        >
          Change
        </button>
      </div>
    )}
  </div>
</div>
```

- [ ] **Step 5: Run tests to confirm they pass**

Run: `npx vitest run __tests__/settings-page.test.tsx`
Expected: 6/6 PASS

- [ ] **Step 6: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add __tests__/settings-page.test.tsx app/event/[id]/settings/page.tsx
git commit -m "feat: add Access Password section to settings page"
```

---

## Task 5: Env cleanup + final verification

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Remove NEXT_PUBLIC_APP_PIN from `.env.example`**

The file currently contains:
```
NEXT_PUBLIC_APP_PIN=your_pin_here
```

Remove that line entirely. The file should end up empty (or contain only Supabase vars if they're documented there). Check what the file currently contains and remove only the PIN line.

- [ ] **Step 2: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass (the old login test no longer uses env stubs — no issue)

- [ ] **Step 3: TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add .env.example
git commit -m "chore: remove NEXT_PUBLIC_APP_PIN from env example"
```

---

## Production Deployment Checklist

After all code is merged and before deploying to Vercel:

1. Open Supabase SQL Editor for the Timing project
2. Run migration 002 (copy from `supabase/migrations/002_multi_distance.sql`)
3. Run migration 003 (copy from `supabase/migrations/003_add_created_at.sql`)
4. Run migration 004 (copy from `supabase/migrations/004_add_event_password.sql`)
5. Existing events will have `password = ''` — update them manually via Supabase table editor or SQL: `UPDATE events SET password = 'your_chosen_password' WHERE id = 'your_event_id';`
6. Remove `NEXT_PUBLIC_APP_PIN` env var from Vercel project settings (it's no longer used)
7. Deploy
