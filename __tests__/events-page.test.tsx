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
  vi.mocked(getEvents).mockReset()
  vi.mocked(getEventStats).mockReset()
  vi.mocked(deleteEvent).mockReset()
  vi.mocked(clearEventCache).mockReset()
  vi.mocked(getEvents).mockResolvedValue([mockEvent1, mockEvent2])
  vi.mocked(getEventStats).mockResolvedValue({ recordCount: 5, athleteCount: 3 })
  vi.mocked(deleteEvent).mockResolvedValue(undefined as unknown as void)
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
