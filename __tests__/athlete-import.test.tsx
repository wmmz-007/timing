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
