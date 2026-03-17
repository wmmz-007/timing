import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import type { Event } from '@/types'

// ---- Mocks ----

const mockPush = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
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
    <button
      onClick={() =>
        onCreated({
          id: 'new-1',
          name: 'New',
          timezone: 'Asia/Bangkok',
          overall_lockout: false,
          created_at: '2026-03-17T00:00:00Z',
        })
      }
    >
      EventSetupForm
    </button>
  ),
}))

vi.mock('@/components/EventEditForm', () => ({
  default: ({
    onSaved,
    onCancel,
  }: {
    onSaved: () => void
    onCancel: () => void
  }) => (
    <div>
      <span>EventEditForm</span>
      <button onClick={onSaved}>Save</button>
      <button onClick={onCancel}>Cancel</button>
    </div>
  ),
}))

// ---- Helpers ----

const event1: Event = {
  id: 'evt-1',
  name: 'งานวิ่ง Alpha',
  timezone: 'Asia/Bangkok',
  overall_lockout: false,
  created_at: '2026-01-01T00:00:00Z',
}

const event2: Event = {
  id: 'evt-2',
  name: 'งานวิ่ง Beta',
  timezone: 'Asia/Bangkok',
  overall_lockout: false,
  created_at: '2026-02-01T00:00:00Z',
}

async function renderPage() {
  const { default: HomePage } = await import('@/app/page')
  render(<HomePage />)
}

// ---- Tests ----

describe('HomePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('renders event list with event names', async () => {
    const { getEvents } = await import('@/lib/db')
    vi.mocked(getEvents).mockResolvedValue([event1, event2])

    await renderPage()

    await waitFor(() => {
      expect(screen.getByText('งานวิ่ง Alpha')).toBeInTheDocument()
      expect(screen.getByText('งานวิ่ง Beta')).toBeInTheDocument()
    })
  })

  it('shows empty state when no events', async () => {
    const { getEvents } = await import('@/lib/db')
    vi.mocked(getEvents).mockResolvedValue([])

    await renderPage()

    await waitFor(() => {
      expect(screen.getByText('ยังไม่มีงาน')).toBeInTheDocument()
    })
  })

  it('shows error state and retry button on getEvents failure', async () => {
    const { getEvents } = await import('@/lib/db')
    vi.mocked(getEvents).mockRejectedValue(new Error('network error'))

    await renderPage()

    await waitFor(() => {
      expect(screen.getByText('โหลดไม่ได้ กรุณาลองใหม่')).toBeInTheDocument()
      expect(screen.getByText('ลองใหม่')).toBeInTheDocument()
    })
  })

  it('navigates to event when event name is clicked', async () => {
    const { getEvents } = await import('@/lib/db')
    vi.mocked(getEvents).mockResolvedValue([event1])

    await renderPage()

    await waitFor(() => {
      expect(screen.getByText('งานวิ่ง Alpha')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('งานวิ่ง Alpha'))
    expect(mockPush).toHaveBeenCalledWith('/event/evt-1')
  })

  it('switches to edit mode when pencil button is clicked', async () => {
    const { getEvents } = await import('@/lib/db')
    vi.mocked(getEvents).mockResolvedValue([event1])

    await renderPage()

    await waitFor(() => {
      expect(screen.getByText('งานวิ่ง Alpha')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByLabelText('แก้ไข งานวิ่ง Alpha'))

    await waitFor(() => {
      expect(screen.getByText('EventEditForm')).toBeInTheDocument()
    })
  })

  it('switches to create mode when create button is clicked', async () => {
    const { getEvents } = await import('@/lib/db')
    vi.mocked(getEvents).mockResolvedValue([])

    await renderPage()

    await waitFor(() => {
      expect(screen.getByText('+ สร้างงานใหม่')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('+ สร้างงานใหม่'))

    await waitFor(() => {
      expect(screen.getByText('EventSetupForm')).toBeInTheDocument()
    })
  })

  it('shows delete confirmation panel when trash button is clicked', async () => {
    const { getEvents, getEventStats } = await import('@/lib/db')
    vi.mocked(getEvents).mockResolvedValue([event1])
    vi.mocked(getEventStats).mockResolvedValue({ recordCount: 5, athleteCount: 3 })

    await renderPage()

    await waitFor(() => {
      expect(screen.getByText('งานวิ่ง Alpha')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByLabelText('ลบ งานวิ่ง Alpha'))

    await waitFor(() => {
      expect(screen.getByText(/ลบงาน/)).toBeInTheDocument()
    })
  })

  it('calls deleteEvent and removes event from list on confirm', async () => {
    const { getEvents, getEventStats, deleteEvent } = await import('@/lib/db')
    const { clearEventCache } = await import('@/lib/storage')
    vi.mocked(getEvents).mockResolvedValue([event1, event2])
    vi.mocked(getEventStats).mockResolvedValue({ recordCount: 5, athleteCount: 3 })
    vi.mocked(deleteEvent).mockResolvedValue(undefined)
    vi.mocked(clearEventCache).mockImplementation(() => undefined)

    await renderPage()

    await waitFor(() => {
      expect(screen.getByText('งานวิ่ง Alpha')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByLabelText('ลบ งานวิ่ง Alpha'))

    await waitFor(() => {
      expect(screen.getByText('ยืนยันลบ')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('ยืนยันลบ'))

    await waitFor(() => {
      expect(deleteEvent).toHaveBeenCalledWith('evt-1')
      expect(screen.queryByText('งานวิ่ง Alpha')).not.toBeInTheDocument()
    })

    // Other event remains
    expect(screen.getByText('งานวิ่ง Beta')).toBeInTheDocument()
  })
})
