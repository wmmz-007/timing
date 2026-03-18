# Login, Events Search & English UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace home page with a PIN login screen, move event management to `/events` with search + add-modal, and translate all UI from Thai to English.

**Architecture:** `app/page.tsx` becomes a PIN login page. A new `app/events/page.tsx` hosts the event list (search + add modal + edit/delete) behind a sessionStorage auth guard. All user-visible Thai strings across pages and components are replaced with English equivalents.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind v4, Vitest + @testing-library/react, sessionStorage for auth, `process.env.NEXT_PUBLIC_APP_PIN` for the shared PIN.

**Spec:** `docs/superpowers/specs/2026-03-18-login-events-english-design.md`

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Replace | `app/page.tsx` | PIN login page |
| Create | `app/events/page.tsx` | Authenticated events list, search, add modal, edit, delete |
| Edit | `app/layout.tsx` | `lang="en"` |
| Edit | `app/event/[id]/page.tsx` | English nav labels, "Race Timing Record" rename |
| Edit | `app/event/[id]/capture/page.tsx` | English loading text and heading |
| Edit | `app/event/[id]/results/page.tsx` | English headings |
| Edit | `app/event/[id]/export/page.tsx` | English headings and labels |
| Edit | `app/event/[id]/settings/page.tsx` | English headings and labels |
| Edit | `components/EventSetupForm.tsx` | English form labels |
| Edit | `components/EventEditForm.tsx` | English form labels and errors |
| Edit | `components/DistanceList.tsx` | English labels |
| Edit | `components/CaptureScreen.tsx` | English UI text |
| Edit | `components/ManualBibInput.tsx` | English labels |
| Edit | `components/CaptureToast.tsx` | English toast messages |
| Edit | `components/ConflictsPanel.tsx` | English labels |
| Edit | `components/ResultsTable.tsx` | English column headers |
| Edit | `components/AthleteImport.tsx` | English labels and errors |
| Edit | `components/PrizeConfig.tsx` | English labels |
| Edit | `components/InstallPrompt.tsx` | English install text |
| Create | `.env.example` | Document required env vars |
| Delete | `__tests__/home-page.test.tsx` | Replaced by login + events tests |
| Create | `__tests__/login-page.test.tsx` | Login page tests |
| Create | `__tests__/events-page.test.tsx` | Events page tests |
| Edit | `__tests__/event-edit-form.test.tsx` | Update Thai assertions → English |
| Edit | `__tests__/capture-toast.test.tsx` | Update Thai assertions → English |
| Edit | `__tests__/manual-bib-input.test.tsx` | Update Thai assertions → English |
| Edit | `__tests__/capture-screen.test.tsx` | Update Thai assertions → English |

---

## Task 1: `.env.example` + Login Page

**Files:**
- Create: `.env.example`
- Replace: `app/page.tsx`
- Delete: `__tests__/home-page.test.tsx`
- Create: `__tests__/login-page.test.tsx`

- [ ] **Step 1: Create `.env.example`**

```
NEXT_PUBLIC_APP_PIN=your_pin_here
```

- [ ] **Step 2: Write the failing login page tests**

Create `__tests__/login-page.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockPush = vi.fn()
const mockReplace = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}))

let storageMock: Record<string, string> = {}

beforeEach(() => {
  storageMock = {}
  mockPush.mockReset()
  mockReplace.mockReset()
  vi.stubGlobal('sessionStorage', {
    getItem: (k: string) => storageMock[k] ?? null,
    setItem: (k: string, v: string) => { storageMock[k] = v },
    removeItem: (k: string) => { delete storageMock[k] },
  })
  vi.stubEnv('NEXT_PUBLIC_APP_PIN', '1234')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

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

  it('shows Incorrect PIN on wrong PIN', async () => {
    await renderPage()
    fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '9999' } })
    fireEvent.click(screen.getByRole('button', { name: /enter/i }))
    expect(screen.getByText('Incorrect PIN')).toBeInTheDocument()
  })

  it('sets sessionStorage authed and redirects to /events on correct PIN', async () => {
    await renderPage()
    fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '1234' } })
    fireEvent.click(screen.getByRole('button', { name: /enter/i }))
    expect(storageMock['authed']).toBe('1')
    expect(mockPush).toHaveBeenCalledWith('/events')
  })

  it('shows Enter PIN on empty submit', async () => {
    await renderPage()
    fireEvent.click(screen.getByRole('button', { name: /enter/i }))
    expect(screen.getByText('Enter PIN')).toBeInTheDocument()
  })

  it('shows Incorrect PIN when NEXT_PUBLIC_APP_PIN is empty', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_PIN', '')
    await renderPage()
    fireEvent.change(screen.getByLabelText('PIN'), { target: { value: 'anything' } })
    fireEvent.click(screen.getByRole('button', { name: /enter/i }))
    expect(screen.getByText('Incorrect PIN')).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Delete `__tests__/home-page.test.tsx`**

```bash
git rm __tests__/home-page.test.tsx
```

- [ ] **Step 4: Run tests to verify they fail**

```bash
npx vitest run __tests__/login-page.test.tsx
```

Expected: 5 failures (module not found or wrong implementation)

- [ ] **Step 5: Implement `app/page.tsx`** (login page — replaces the event list)

```tsx
'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Timer } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (sessionStorage.getItem('authed') === '1') {
      router.replace('/events')
    }
  }, [router])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!pin) { setError('Enter PIN'); return }
    const correct = process.env.NEXT_PUBLIC_APP_PIN
    if (!correct || pin !== correct) {
      setError('Incorrect PIN')
      setPin('')
      return
    }
    sessionStorage.setItem('authed', '1')
    router.push('/events')
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6">
      <div className="flex flex-col items-center gap-2 mb-8">
        <Timer size={48} />
        <h1 className="text-3xl font-bold">Timing</h1>
      </div>
      <form onSubmit={handleSubmit} className="w-full max-w-xs flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="pin" className="text-sm font-medium">PIN</label>
          <input
            id="pin"
            aria-label="PIN"
            type="password"
            value={pin}
            onChange={e => { setPin(e.target.value); setError(null) }}
            className="border rounded-xl px-4 py-3 text-base"
            autoFocus
            autoComplete="current-password"
          />
        </div>
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <button
          type="submit"
          className="bg-black text-white rounded-xl py-4 text-base font-medium"
        >
          Enter
        </button>
      </form>
    </main>
  )
}
```

- [ ] **Step 6: Run tests — all 5 must pass**

```bash
npx vitest run __tests__/login-page.test.tsx
```

Expected: 5 passed

- [ ] **Step 7: Run full suite — no regressions**

```bash
npx vitest run
```

Expected: all passing (home-page tests are gone; all others pass)

- [ ] **Step 8: Commit**

```bash
git add .env.example app/page.tsx __tests__/login-page.test.tsx
# home-page.test.tsx was already staged via git rm above
git commit -m "feat: replace home page with PIN login; add .env.example"
```

---

## Task 2: Events Page

**Files:**
- Create: `app/events/page.tsx`
- Create: `__tests__/events-page.test.tsx`

- [ ] **Step 1: Write the failing events page tests**

Create `__tests__/events-page.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Event } from '@/types'

const mockPush = vi.fn()
const mockReplace = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}))

vi.mock('@/lib/db', () => ({
  getEvents: vi.fn(),
  getEventStats: vi.fn(),
  deleteEvent: vi.fn(),
}))

vi.mock('@/lib/storage', () => ({
  clearEventCache: vi.fn(),
}))

vi.mock('@/components/EventSetupForm', () => ({
  default: ({ onCreated }: { onCreated: (e: Event) => void }) => (
    <button onClick={() => onCreated({ id: 'new-1', name: 'New Event', timezone: 'Asia/Bangkok', overall_lockout: false, created_at: '2026-03-18T00:00:00Z' })}>
      EventSetupForm
    </button>
  ),
}))

vi.mock('@/components/EventEditForm', () => ({
  default: ({ onSaved, onCancel }: { onSaved: () => void; onCancel: () => void }) => (
    <div>
      <span>EventEditForm</span>
      <button onClick={onSaved}>Save</button>
      <button onClick={onCancel}>Cancel</button>
    </div>
  ),
}))

const mockEvent1: Event = { id: 'e1', name: 'Marathon 2026', timezone: 'Asia/Bangkok', overall_lockout: false, created_at: '2026-03-18T00:00:00Z' }
const mockEvent2: Event = { id: 'e2', name: '5K Fun Run', timezone: 'Asia/Bangkok', overall_lockout: false, created_at: '2026-03-18T00:00:00Z' }

import { getEvents, getEventStats, deleteEvent } from '@/lib/db'
import { clearEventCache } from '@/lib/storage'

let storageMock: Record<string, string> = {}

beforeEach(() => {
  storageMock = { authed: '1' }
  mockPush.mockReset()
  mockReplace.mockReset()
  vi.stubGlobal('sessionStorage', {
    getItem: (k: string) => storageMock[k] ?? null,
    setItem: (k: string, v: string) => { storageMock[k] = v },
    removeItem: (k: string) => { delete storageMock[k] },
  })
  vi.mocked(getEvents).mockResolvedValue([mockEvent1, mockEvent2])
  vi.mocked(getEventStats).mockResolvedValue({ recordCount: 5, athleteCount: 3 })
  vi.mocked(deleteEvent).mockResolvedValue(void 0 as unknown as void)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function renderPage() {
  vi.resetModules()
  const { default: Page } = await import('@/app/events/page')
  render(<Page />)
}

describe('Events Page', () => {
  it('redirects to / if not authed', async () => {
    storageMock = {}
    await renderPage()
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'))
  })

  it('renders event names after load', async () => {
    await renderPage()
    await waitFor(() => expect(screen.getByText('Marathon 2026')).toBeInTheDocument())
    expect(screen.getByText('5K Fun Run')).toBeInTheDocument()
  })

  it('filters events case-insensitively by name', async () => {
    await renderPage()
    await waitFor(() => screen.getByText('Marathon 2026'))
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'marathon' } })
    expect(screen.getByText('Marathon 2026')).toBeInTheDocument()
    expect(screen.queryByText('5K Fun Run')).not.toBeInTheDocument()
  })

  it('shows + Add Event when events list is empty', async () => {
    vi.mocked(getEvents).mockResolvedValue([])
    await renderPage()
    await waitFor(() => expect(screen.getAllByRole('button', { name: /add event/i }).length).toBeGreaterThan(0))
  })

  it('shows + Add Event prominently when search returns no matches', async () => {
    await renderPage()
    await waitFor(() => screen.getByText('Marathon 2026'))
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'zzz' } })
    expect(screen.getAllByRole('button', { name: /add event/i }).length).toBeGreaterThan(0)
  })

  it('opens add modal when + Add Event clicked', async () => {
    await renderPage()
    await waitFor(() => screen.getByText('Marathon 2026'))
    fireEvent.click(screen.getAllByRole('button', { name: /add event/i })[0])
    expect(screen.getByText('EventSetupForm')).toBeInTheDocument()
  })

  it('shows confirmation after EventSetupForm creates event', async () => {
    await renderPage()
    await waitFor(() => screen.getByText('Marathon 2026'))
    fireEvent.click(screen.getAllByRole('button', { name: /add event/i })[0])
    fireEvent.click(screen.getByText('EventSetupForm'))
    await waitFor(() => expect(screen.getByText('Event created!')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /go to this page/i })).toBeInTheDocument()
  })

  it('"Go to this page" navigates to /event/[id]', async () => {
    await renderPage()
    await waitFor(() => screen.getByText('Marathon 2026'))
    fireEvent.click(screen.getAllByRole('button', { name: /add event/i })[0])
    fireEvent.click(screen.getByText('EventSetupForm'))
    await waitFor(() => screen.getByRole('button', { name: /go to this page/i }))
    fireEvent.click(screen.getByRole('button', { name: /go to this page/i }))
    expect(mockPush).toHaveBeenCalledWith('/event/new-1')
  })

  it('X button on confirmation closes modal and refreshes list', async () => {
    await renderPage()
    await waitFor(() => screen.getByText('Marathon 2026'))
    fireEvent.click(screen.getAllByRole('button', { name: /add event/i })[0])
    fireEvent.click(screen.getByText('EventSetupForm'))
    await waitFor(() => screen.getByText('Event created!'))
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(screen.queryByText('Event created!')).not.toBeInTheDocument()
    expect(getEvents).toHaveBeenCalledTimes(2) // initial load + refresh
  })

  it('edit button opens EventEditForm', async () => {
    await renderPage()
    await waitFor(() => screen.getByText('Marathon 2026'))
    fireEvent.click(screen.getByRole('button', { name: /edit marathon 2026/i }))
    expect(screen.getByText('EventEditForm')).toBeInTheDocument()
  })

  it('delete button shows confirmation with record and athlete counts', async () => {
    await renderPage()
    await waitFor(() => screen.getByText('Marathon 2026'))
    fireEvent.click(screen.getByRole('button', { name: /delete marathon 2026/i }))
    await waitFor(() => expect(screen.getByText(/5/)).toBeInTheDocument())
    expect(screen.getByText(/3/)).toBeInTheDocument()
  })

  it('confirm delete calls deleteEvent, clearEventCache, and removes event from list', async () => {
    await renderPage()
    await waitFor(() => screen.getByText('Marathon 2026'))
    fireEvent.click(screen.getByRole('button', { name: /delete marathon 2026/i }))
    await waitFor(() => screen.getByRole('button', { name: /confirm delete/i }))
    fireEvent.click(screen.getByRole('button', { name: /confirm delete/i }))
    await waitFor(() => expect(deleteEvent).toHaveBeenCalledWith('e1'))
    expect(clearEventCache).toHaveBeenCalledWith('e1')
    expect(screen.queryByText('Marathon 2026')).not.toBeInTheDocument()
  })

  it('logout clears sessionStorage and redirects to /', async () => {
    await renderPage()
    await waitFor(() => screen.getByText('Marathon 2026'))
    fireEvent.click(screen.getByRole('button', { name: /logout/i }))
    expect(storageMock['authed']).toBeUndefined()
    expect(mockPush).toHaveBeenCalledWith('/')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run __tests__/events-page.test.tsx
```

Expected: failures (file not found)

- [ ] **Step 3: Implement `app/events/page.tsx`**

The events page is a state machine similar to the old `app/page.tsx` but with:
- Auth guard (sessionStorage check in useEffect)
- Search input filtering `events` by `name.toLowerCase().includes(query.toLowerCase())`
- `showAddModal: boolean` state for the add event modal
- `modalState: 'form' | 'created'` state inside the modal
- `createdEvent: Event | null` to hold the just-created event for the confirmation view
- Logout button top-right: `sessionStorage.removeItem('authed')` → `router.push('/')`
- Delete flow identical to old home page (getEventStats → inline confirm panel → deleteEvent + clearEventCache → optimistic filter)
- Edit mode identical to old home page (mode = 'edit', renders EventEditForm full-page)

```tsx
'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Trash2 } from 'lucide-react'
import EventSetupForm from '@/components/EventSetupForm'
import EventEditForm from '@/components/EventEditForm'
import type { Event } from '@/types'

type Mode = 'list' | 'edit'

export default function EventsPage() {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('list')
  const [events, setEvents] = useState<Event[]>([])
  const [editingEvent, setEditingEvent] = useState<Event | null>(null)
  const [query, setQuery] = useState('')
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deleteStats, setDeleteStats] = useState<{ recordCount: number; athleteCount: number } | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)
  const [statsError, setStatsError] = useState(false)
  const [deleteError, setDeleteError] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [modalState, setModalState] = useState<'form' | 'created'>('form')
  const [createdEvent, setCreatedEvent] = useState<Event | null>(null)

  useEffect(() => {
    if (sessionStorage.getItem('authed') !== '1') {
      router.replace('/')
    }
  }, [router])

  const loadEvents = useCallback(async () => {
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
  }, [])

  useEffect(() => { loadEvents() }, [loadEvents])

  function handleLogout() {
    sessionStorage.removeItem('authed')
    router.push('/')
  }

  async function handleDeleteClick(id: string) {
    setConfirmDeleteId(id)
    setStatsLoading(true)
    setStatsError(false)
    setDeleteError(false)
    try {
      const { getEventStats } = await import('@/lib/db')
      setDeleteStats(await getEventStats(id))
    } catch {
      setStatsError(true)
    } finally {
      setStatsLoading(false)
    }
  }

  function handleDeleteCancel() {
    setConfirmDeleteId(null)
    setDeleteStats(null)
    setStatsError(false)
    setDeleteError(false)
  }

  async function handleDeleteConfirm() {
    if (!confirmDeleteId) return
    const id = confirmDeleteId
    setDeleteError(false)
    try {
      const { deleteEvent } = await import('@/lib/db')
      const { clearEventCache } = await import('@/lib/storage')
      await deleteEvent(id)
      clearEventCache(id)
      setEvents(prev => prev.filter(e => e.id !== id))
      setConfirmDeleteId(null)
      setDeleteStats(null)
    } catch {
      setDeleteError(true)
    }
  }

  function handleEditClick(event: Event) {
    setEditingEvent(event)
    setMode('edit')
  }

  async function handleEditSaved() {
    setMode('list')
    setEditingEvent(null)
    await loadEvents()
  }

  function handleEditCancel() {
    setMode('list')
    setEditingEvent(null)
  }

  function openAddModal() {
    setModalState('form')
    setCreatedEvent(null)
    setShowAddModal(true)
  }

  function handleEventCreated(event: Event) {
    setCreatedEvent(event)
    setModalState('created')
  }

  function handleModalClose() {
    setShowAddModal(false)
    if (modalState === 'created') loadEvents()
  }

  const filtered = events.filter(e =>
    e.name.toLowerCase().includes(query.toLowerCase())
  )
  const noMatches = query.length > 0 && filtered.length === 0

  if (mode === 'edit' && editingEvent) {
    return (
      <main className="min-h-screen p-6 max-w-md mx-auto">
        <EventEditForm event={editingEvent} onSaved={handleEditSaved} onCancel={handleEditCancel} />
      </main>
    )
  }

  return (
    <main className="min-h-screen p-6 max-w-md mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Events</h1>
        <button onClick={handleLogout} className="text-sm text-gray-500">Logout</button>
      </div>

      <input
        role="searchbox"
        type="search"
        placeholder="Search events..."
        value={query}
        onChange={e => setQuery(e.target.value)}
        className="w-full border rounded-xl px-4 py-3 mb-4 text-base"
      />

      {listLoading && <p className="text-gray-400 text-center py-8">Loading...</p>}

      {listError && (
        <div className="text-center py-8">
          <p className="text-red-500 mb-2">Failed to load. Retry</p>
          <button onClick={loadEvents} className="text-sm underline">Retry</button>
        </div>
      )}

      {!listLoading && !listError && events.length === 0 && (
        <div className="text-center py-8">
          <p className="text-gray-400 mb-4">No events yet</p>
          <button onClick={openAddModal} className="bg-black text-white rounded-xl px-6 py-3">
            + Add Event
          </button>
        </div>
      )}

      {!listLoading && !listError && events.length > 0 && (
        <ul className="space-y-2">
          {filtered.map(event => (
            <li key={event.id}>
              <div className="flex items-center gap-2 p-3 rounded-xl border">
                <button
                  className="flex-1 text-left font-medium"
                  onClick={() => router.push(`/event/${event.id}`)}
                >
                  {event.name}
                </button>
                <button
                  aria-label={`Edit ${event.name}`}
                  onClick={() => handleEditClick(event)}
                  className="p-1 text-gray-400"
                >
                  <Pencil size={16} />
                </button>
                <button
                  aria-label={`Delete ${event.name}`}
                  onClick={() => handleDeleteClick(event.id)}
                  className="p-1 text-gray-400"
                >
                  <Trash2 size={16} />
                </button>
              </div>

              {confirmDeleteId === event.id && (
                <div className="mt-1 p-3 rounded-xl border border-red-200 bg-red-50">
                  {statsLoading && <p className="text-sm text-gray-500">Loading...</p>}
                  {!statsLoading && statsError && (
                    <div>
                      <p className="text-sm text-red-500">Failed to load stats</p>
                      <button onClick={handleDeleteCancel} className="text-sm underline mt-1">Cancel</button>
                    </div>
                  )}
                  {!statsLoading && deleteStats && (
                    <>
                      {deleteError && <p className="text-sm text-red-500 mb-2">Delete failed. Please try again.</p>}
                      <p className="text-sm mb-2">
                        Delete &ldquo;{event.name}&rdquo;? This will remove {deleteStats.recordCount} records and {deleteStats.athleteCount} athletes. This cannot be undone.
                      </p>
                      <div className="flex gap-2">
                        <button
                          aria-label="Confirm delete"
                          onClick={handleDeleteConfirm}
                          className="bg-red-600 text-white rounded-lg px-3 py-1 text-sm"
                        >
                          Confirm Delete
                        </button>
                        <button
                          onClick={handleDeleteCancel}
                          className="text-sm underline"
                        >
                          Cancel
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {noMatches && (
        <div className="text-center py-4">
          <p className="text-gray-400 mb-3">No events match &ldquo;{query}&rdquo;</p>
          <button onClick={openAddModal} className="bg-black text-white rounded-xl px-6 py-3">
            + Add Event
          </button>
        </div>
      )}

      {!listLoading && !listError && (
        <div className="mt-6">
          <button
            onClick={openAddModal}
            className="w-full border-2 border-dashed rounded-xl py-4 text-gray-500"
          >
            + Add Event
          </button>
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50">
          <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-end mb-4">
              <button aria-label="Close" onClick={handleModalClose} className="text-gray-400 text-xl">✕</button>
            </div>
            {modalState === 'form' && (
              <EventSetupForm onCreated={handleEventCreated} />
            )}
            {modalState === 'created' && createdEvent && (
              <div className="text-center py-4">
                <p className="text-xl font-semibold mb-1">Event created!</p>
                <p className="text-gray-500 mb-6">{createdEvent.name}</p>
                <button
                  onClick={() => router.push(`/event/${createdEvent.id}`)}
                  className="bg-black text-white rounded-xl px-8 py-4 text-base font-medium"
                >
                  Go to this page
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  )
}
```

- [ ] **Step 4: Run events page tests — all 13 must pass**

```bash
npx vitest run __tests__/events-page.test.tsx
```

Expected: 13 passed

- [ ] **Step 5: Run full suite — no regressions**

```bash
npx vitest run
```

Expected: all passing

- [ ] **Step 6: Commit**

```bash
git add app/events/page.tsx __tests__/events-page.test.tsx
git commit -m "feat: add events search page with auth guard and add-event modal"
```

---

## Task 3: English — App Pages

**Files:**
- Edit: `app/layout.tsx`
- Edit: `app/event/[id]/page.tsx`
- Edit: `app/event/[id]/capture/page.tsx`
- Edit: `app/event/[id]/results/page.tsx`
- Edit: `app/event/[id]/export/page.tsx`
- Edit: `app/event/[id]/settings/page.tsx`

Read each file before editing. Replace exactly the strings listed below.

- [ ] **Step 1: Edit `app/layout.tsx`**

Change: `lang="th"` → `lang="en"`

- [ ] **Step 2: Edit `app/event/[id]/page.tsx`**

String replacements:
- `"ควบคุมงาน"` → `"Event Control"`
- `"บันทึกเวลา"` → `"Race Timing Record"`
- `"Race Capture"` → remove or change subtitle to `"Timing"` (keep it short; remove if it creates duplication)
- `"ผลการแข่งขัน"` → `"Results"`
- `"Live Results"` → `"Live"` (or remove subtitle)
- `"ส่งออก CSV"` → `"Export CSV"`
- `"ตั้งค่า"` → `"Settings"`

- [ ] **Step 3: Edit `app/event/[id]/capture/page.tsx`**

String replacements:
- `"กำลังโหลด..."` → `"Loading..."`
- Any heading that contains `"บันทึกเวลา"` → `"Race Timing Record"` (read file to check if a heading exists; the nav link was updated in Step 2, but the page itself may also have a title)

- [ ] **Step 4: Edit `app/event/[id]/results/page.tsx`**

String replacements:
- `"กำลังโหลด..."` → `"Loading..."`
- `"ผลการแข่งขัน"` → `"Results"`

- [ ] **Step 5: Edit `app/event/[id]/export/page.tsx`**

String replacements:
- `"กำลังโหลด..."` → `"Loading..."`
- `"ส่งออก CSV"` → `"Export CSV"`
- `"จำนวนบันทึก: {records.length} คน"` → `"Records: {records.length}"`
- `"จำนวนนักกีฬา: {athletes.length} คน"` → `"Athletes: {athletes.length}"`
- `"ดาวน์โหลด CSV"` → `"Download CSV"`
- `"คอลัมน์:"` → `"Columns:"`

- [ ] **Step 6: Edit `app/event/[id]/settings/page.tsx`**

String replacements:
- `"กำลังโหลด..."` → `"Loading..."`
- `"ตั้งค่า"` → `"Settings"`
- `"ไม่มีการเชื่อมต่อ — แก้ไขได้เมื่อออนไลน์"` → `"Offline — edits available when online"`
- `"ระยะและเวลาปล่อยตัว"` → `"Distances & Start Times"`
- `"กรุณาตั้งชื่อระยะก่อน import นักกีฬา"` → `"Name all distances before importing athletes"`
- `"นักกีฬา"` → `"Athletes"`
- `"รางวัล"` → `"Prizes"`

- [ ] **Step 7: Run full suite**

```bash
npx vitest run
```

Expected: all passing (page files have no direct test assertions to update)

- [ ] **Step 8: Commit**

```bash
git add app/layout.tsx app/event/
git commit -m "feat: translate all app pages to English; rename capture to Race Timing Record"
```

---

## Task 4: English — EventSetupForm, EventEditForm, DistanceList

**Files:**
- Edit: `components/EventSetupForm.tsx`
- Edit: `components/EventEditForm.tsx`
- Edit: `components/DistanceList.tsx`
- Edit: `__tests__/event-edit-form.test.tsx`

Read each file before editing.

- [ ] **Step 1: Edit `components/EventSetupForm.tsx`**

String replacements:
- `"ชื่องาน"` → `"Event Name"`
- `"เช่น งานวิ่ง XYZ 2026"` → `"e.g. XYZ Marathon 2026"`
- `"วันที่"` → `"Date"`
- `"ระยะและเวลาปล่อยตัว"` → `"Distances & Start Times"`
- `"ไม่สามารถสร้างงานได้ กรุณาลองใหม่"` → `"Failed to create event. Please try again."`
- `"กำลังสร้าง..."` → `"Creating..."`
- `"สร้างงาน"` → `"Create Event"`

- [ ] **Step 2: Edit `components/EventEditForm.tsx`**

String replacements:
- `"‹ ยกเลิก"` → `"‹ Cancel"`
- `"แก้ไขงาน"` → `"Edit Event"`
- `"กำลังโหลด..."` → `"Loading..."`
- `"โหลดไม่ได้ กรุณาลองใหม่"` → `"Failed to load. Please try again."`
- `"ชื่องาน"` → `"Event Name"`
- `"วันที่"` → `"Date"`
- `"ระยะและเวลาปล่อยตัว"` → `"Distances & Start Times"`
- `"ลบระยะ \\"${distName}\\" ไม่ได้ เนื่องจากมีนักกีฬา กรุณาจัดการใน Settings"` → `"Cannot delete distance \\"${distName}\\" — athletes are assigned. Manage in Settings."`
- `"บันทึกไม่ได้ กรุณาลองใหม่"` → `"Failed to save. Please try again."`
- `"การเปลี่ยนแปลงอื่นๆ ถูกบันทึกแล้ว"` → `"Other changes were saved."`
- `"กำลังบันทึก..."` → `"Saving..."`
- `"บันทึก"` (button label, not the word elsewhere) → `"Save"`

- [ ] **Step 3: Edit `components/DistanceList.tsx`**

String replacements:
- `"เช่น 10K"` → `"e.g. 10K"`
- `"+ เพิ่มระยะ"` → `"+ Add Distance"`

- [ ] **Step 4: Update Thai assertions in `__tests__/event-edit-form.test.tsx`**

Find and update these assertions:
- `screen.getByText('กำลังโหลด...')` → `screen.getByText('Loading...')`
- `screen.getByText('‹ ยกเลิก')` → `screen.getByText('‹ Cancel')`
- `screen.getByText('โหลดไม่ได้ กรุณาลองใหม่')` → `screen.getByText('Failed to load. Please try again.')`
- `screen.queryByText('กำลังโหลด...')` → `screen.queryByText('Loading...')`
- `{ name: /บันทึก/i }` → `{ name: /Save/i }` (all 4 occurrences)
- `screen.getByText(/ลบระยะ.*ไม่ได้/)` → `screen.getByText(/Cannot delete distance/)` (test for RESTRICT delete error)

- [ ] **Step 5: Run tests**

```bash
npx vitest run __tests__/event-edit-form.test.tsx
npx vitest run
```

Expected: all passing

- [ ] **Step 6: Commit**

```bash
git add components/EventSetupForm.tsx components/EventEditForm.tsx components/DistanceList.tsx __tests__/event-edit-form.test.tsx
git commit -m "feat: translate EventSetupForm, EventEditForm, DistanceList to English"
```

---

## Task 5: English — CaptureScreen, ManualBibInput, CaptureToast

**Files:**
- Edit: `components/CaptureScreen.tsx`
- Edit: `components/ManualBibInput.tsx`
- Edit: `components/CaptureToast.tsx`
- Edit: `__tests__/capture-screen.test.tsx`
- Edit: `__tests__/manual-bib-input.test.tsx`
- Edit: `__tests__/capture-toast.test.tsx`

Read each file before editing.

- [ ] **Step 1: Edit `components/CaptureScreen.tsx`**

String replacements (read file to find exact locations):
- `"ปล่อยตัว"` → `"Start"`
- `"กรอกบิบเอง"` → `"Enter Bib Manually"`
- Any occurrence of `"กดพูดเลขบิบ"` → `"Hold to Record Bib"`
- Any occurrence of `"กำลังฟัง..."` → `"Listening..."`

- [ ] **Step 2: Edit `components/ManualBibInput.tsx`**

String replacements:
- `"กรอกบิบเอง"` → `"Enter Bib Manually"`
- `"บันทึก"` → `"Save"`

- [ ] **Step 3: Edit `components/CaptureToast.tsx`**

String replacements:
- `"บิบ ${toast.bib}"` prefix → `"Bib ${toast.bib}"`
- `"ย้อนกลับ"` → `"Undo"`
- `"${toast.bib} ซ้ำ —"` → `"Bib ${toast.bib} duplicate —"`
- `"อ่านใหม่"` → `"Overwrite"`
- `"ข้าม"` → `"Skip"`

- [ ] **Step 4: Update assertions in `__tests__/capture-screen.test.tsx`**

Find and update:
- `/กดพูดเลขบิบ/` → `/Hold to Record Bib/` (appears ~8 times as `getByRole` name matcher)
- `'กำลังฟัง...'` → `'Listening...'` (appears ~4 times as `getByText`)
- `/กำลังฟัง/` → `/Listening/` (appears as `getByRole` name matcher)
- `/บิบ 235/` → `/Bib 235/`
- `/บิบ 100/` → `/Bib 100/`
- `/235 ซ้ำ/` → `/235 duplicate/`
- `'ข้าม'` → `'Skip'` (fireEvent.click and getByText)
- `'อ่านใหม่'` → `'Overwrite'` (fireEvent.click — appears in duplicate-overwrite test)
- `'ปล่อยตัว'` → `'Start'` (queryByText/getByText for start-time display — appears ~4 times)

- [ ] **Step 5: Update assertions in `__tests__/manual-bib-input.test.tsx`**

Find and update:
- `'กรอกบิบเอง'` → `'Enter Bib Manually'` (all occurrences)
- `'บันทึก'` → `'Save'` (all occurrences)
- `/บันทึก/` → `/Save/` (if any)

- [ ] **Step 6: Update assertions in `__tests__/capture-toast.test.tsx`**

Find and update:
- `/บิบ 235/` → `/Bib 235/`
- `'ย้อนกลับ'` → `'Undo'`
- `/235 ซ้ำ/` → `/235 duplicate/`
- `'ข้าม'` → `'Skip'`
- `'อ่านใหม่'` → `'Overwrite'` (check if present)

- [ ] **Step 7: Run tests**

```bash
npx vitest run __tests__/capture-screen.test.tsx __tests__/manual-bib-input.test.tsx __tests__/capture-toast.test.tsx
npx vitest run
```

Expected: all passing

- [ ] **Step 8: Commit**

```bash
git add components/CaptureScreen.tsx components/ManualBibInput.tsx components/CaptureToast.tsx __tests__/capture-screen.test.tsx __tests__/manual-bib-input.test.tsx __tests__/capture-toast.test.tsx
git commit -m "feat: translate CaptureScreen, ManualBibInput, CaptureToast to English"
```

---

## Task 6: English — Remaining Components

**Files:**
- Edit: `components/ConflictsPanel.tsx`
- Edit: `components/ResultsTable.tsx`
- Edit: `components/AthleteImport.tsx`
- Edit: `components/PrizeConfig.tsx`
- Edit: `components/InstallPrompt.tsx`

Read each file before editing. No test assertion updates needed for these components.

- [ ] **Step 1: Edit `components/ConflictsPanel.tsx`**

String replacements:
- `"บิบ ${c.bib_number}"` → `"Bib ${c.bib_number}"`
- `"เก็บไว้:"` → `"Kept:"`
- `"ทิ้ง:"` → `"Discarded:"`

- [ ] **Step 2: Edit `components/ResultsTable.tsx`**

String replacements:
- `"ยังไม่มีผล"` → `"No results yet"`
- `"ทุกระยะ"` → `"All distances"`
- `"ทุกเพศ"` → `"All genders"`
- `"บิบ"` (column header) → `"Bib"`
- `"ชื่อ"` (column header) → `"Name"`
- `"เวลาสุทธิ"` → `"Net Time"`

- [ ] **Step 3: Edit `components/AthleteImport.tsx`**

String replacements:
- `"ไฟล์ไม่มีข้อมูล"` → `"File has no data"`
- `"ไม่สามารถอ่านไฟล์ได้"` → `"Could not read file"`
- `"กรุณาตั้งชื่อระยะก่อน import นักกีฬา"` → `"Name all distances before importing athletes"`
- `"เลือกไฟล์ CSV"` → `"Select CSV File"`
- `"บิบ *"` → `"Bib *"`
- `"ระยะ *"` → `"Distance *"`
- `"ชื่อ"` (column label in preview) → `"Name"`
- `"เพศ"` → `"Gender"`
- `"รุ่นอายุ"` → `"Age Group"`
- `"— ไม่ใช้ —"` → `"— ignore —"`
- Template: `"ระยะที่ไม่ตรง: ${unmatched.join(', ')} — แถวเหล่านี้จะถูกข้าม"` → `"Unmatched distances: ${unmatched.join(', ')} — these rows will be skipped"`
- Template: `"นำเข้า ${unique.length} คน, ข้าม ${allRows.length - unique.length} แถว"` → `"Imported ${unique.length} athletes, skipped ${allRows.length - unique.length} rows"`
- `"นำเข้าไม่สำเร็จ กรุณาลองใหม่"` → `"Import failed. Please try again."`
- `"กำลังนำเข้า..."` → `"Importing..."`
- `"ยืนยันนำเข้า"` → `"Confirm Import"`

- [ ] **Step 4: Edit `components/PrizeConfig.tsx`**

String replacements:
- `"ได้ overall แล้วออกจาก division"` → `"Overall winners excluded from division"`
- `"Overall top N (ต่อเพศ)"` → `"Overall top N (per gender)"`
- `"ซ่อน"` → `"Hide"`
- `"ดูทั้งหมด"` → `"Show all"`
- `"กรุณา import นักกีฬาก่อน"` → `"Import athletes first"`

- [ ] **Step 5: Edit `components/InstallPrompt.tsx`**

String replacements:
- `"ติดตั้งแอป"` → `"Install App"`
- `"เพิ่มไปยังหน้าจอหลัก"` → `"Add to Home Screen"`
- `"ไว้ก่อน"` → `"Later"`
- `"ติดตั้ง"` (button) → `"Install"`
- `"ติดตั้งแอปบน iPhone"` → `"Install on iPhone"`
- iOS instruction text: translate "กด ... แล้วเลือก ... เพิ่มในหน้าจอโฮม" → `"Tap"` + `"then select"` + `"Add to Home Screen"` (keep inline icons in place, just translate surrounding Thai words)

- [ ] **Step 6: Run full suite**

```bash
npx vitest run
```

Expected: all passing

- [ ] **Step 7: Commit**

```bash
git add components/ConflictsPanel.tsx components/ResultsTable.tsx components/AthleteImport.tsx components/PrizeConfig.tsx components/InstallPrompt.tsx
git commit -m "feat: translate remaining components to English"
```
