import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import type { Event, EventDistance } from '@/types'

vi.mock('@/lib/db', () => ({
  getDistancesForEvent: vi.fn(),
  updateEventName: vi.fn(),
  updateDistance: vi.fn(),
  addDistance: vi.fn(),
  deleteDistance: vi.fn(),
}))

vi.mock('@/lib/storage', () => ({
  saveEvent: vi.fn(),
  saveDistances: vi.fn(),
}))

import {
  getDistancesForEvent,
  updateEventName,
  updateDistance,
  addDistance,
  deleteDistance,
} from '@/lib/db'
import EventEditForm from '@/components/EventEditForm'

const mockEvent: Event = {
  id: 'evt-1',
  name: 'Test Event',
  timezone: 'Asia/Bangkok',
  overall_lockout: false,
  created_at: '2026-03-17T00:00:00Z',
}

// 2026-03-17T00:00:00Z = 07:00 Bangkok time
const mockDistances: EventDistance[] = [
  {
    id: 'dist-1',
    event_id: 'evt-1',
    name: '10K',
    start_time: '2026-03-17T00:00:00.000Z',
    overall_top_n: 3,
    default_top_n: 3,
  },
]

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getDistancesForEvent).mockResolvedValue(mockDistances)
  vi.mocked(updateEventName).mockResolvedValue(undefined)
  vi.mocked(updateDistance).mockResolvedValue(undefined)
  vi.mocked(addDistance).mockResolvedValue(mockDistances[0])
  vi.mocked(deleteDistance).mockResolvedValue(undefined)
})

describe('EventEditForm', () => {
  it('shows loading then pre-filled form with event name', async () => {
    render(<EventEditForm event={mockEvent} onSaved={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByText('Loading...')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByDisplayValue('Test Event')).toBeInTheDocument())
    expect(screen.getByDisplayValue('10K')).toBeInTheDocument()
  })

  it('calls onCancel when cancel button clicked', async () => {
    const onCancel = vi.fn()
    render(<EventEditForm event={mockEvent} onSaved={vi.fn()} onCancel={onCancel} />)
    await waitFor(() => screen.getByText('‹ Cancel'))
    fireEvent.click(screen.getByText('‹ Cancel'))
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('calls onCancel immediately when no distances (stale event)', async () => {
    vi.mocked(getDistancesForEvent).mockResolvedValue([])
    const onCancel = vi.fn()
    render(<EventEditForm event={mockEvent} onSaved={vi.fn()} onCancel={onCancel} />)
    await waitFor(() => expect(onCancel).toHaveBeenCalledOnce())
  })

  it('shows load error message when getDistancesForEvent throws', async () => {
    vi.mocked(getDistancesForEvent).mockRejectedValue(new Error('network error'))
    render(<EventEditForm event={mockEvent} onSaved={vi.fn()} onCancel={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('Failed to load. Please try again.')).toBeInTheDocument())
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
  })

  it('skips updateEventName when name unchanged', async () => {
    const onSaved = vi.fn()
    render(<EventEditForm event={mockEvent} onSaved={onSaved} onCancel={vi.fn()} />)
    await waitFor(() => screen.getByDisplayValue('Test Event'))
    fireEvent.click(screen.getByRole('button', { name: /Save/i }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(updateEventName).not.toHaveBeenCalled()
  })

  it('calls updateEventName when name changed', async () => {
    const onSaved = vi.fn()
    render(<EventEditForm event={mockEvent} onSaved={onSaved} onCancel={vi.fn()} />)
    await waitFor(() => screen.getByDisplayValue('Test Event'))
    fireEvent.change(screen.getByDisplayValue('Test Event'), { target: { value: 'New Name' } })
    fireEvent.click(screen.getByRole('button', { name: /Save/i }))
    await waitFor(() => expect(updateEventName).toHaveBeenCalledWith('evt-1', 'New Name'))
    expect(onSaved).toHaveBeenCalled()
  })

  it('calls updateDistance for existing distance row', async () => {
    const onSaved = vi.fn()
    render(<EventEditForm event={mockEvent} onSaved={onSaved} onCancel={vi.fn()} />)
    await waitFor(() => screen.getByDisplayValue('10K'))
    fireEvent.click(screen.getByRole('button', { name: /Save/i }))
    await waitFor(() => expect(updateDistance).toHaveBeenCalledWith('dist-1', expect.objectContaining({ name: '10K' })))
    expect(onSaved).toHaveBeenCalled()
  })

  it('shows inline error when deleteDistance throws (RESTRICT)', async () => {
    vi.mocked(deleteDistance).mockRejectedValue({ code: '23503', message: 'FK violation' })
    vi.mocked(getDistancesForEvent).mockResolvedValue([
      ...mockDistances,
      { id: 'dist-2', event_id: 'evt-1', name: '5K', start_time: '2026-03-17T01:00:00.000Z', overall_top_n: 3, default_top_n: 3 },
    ])
    render(<EventEditForm event={mockEvent} onSaved={vi.fn()} onCancel={vi.fn()} />)
    await waitFor(() => screen.getAllByRole('button', { name: /remove distance/i }))
    const removeBtns = screen.getAllByRole('button', { name: /remove distance/i })
    fireEvent.click(removeBtns[1])
    fireEvent.click(screen.getByRole('button', { name: /Save/i }))
    await waitFor(() => expect(screen.getByText(/Cannot delete distance/)).toBeInTheDocument())
  })
})
