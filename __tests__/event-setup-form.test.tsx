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

// Helper: fill name, date, and distances (required to reach password validation)
function fillNameAndDate() {
  fireEvent.change(screen.getByPlaceholderText('e.g. XYZ Marathon 2026'), {
    target: { value: 'Test Marathon' },
  })
  fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-04-01' } })
  fireEvent.change(screen.getByPlaceholderText('e.g. 10K'), { target: { value: '10K' } })
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

  it('calls createEventWithDistances with password as 3rd argument', async () => {
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
