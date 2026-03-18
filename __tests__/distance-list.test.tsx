import { render, screen } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'
import DistanceList, { type DistanceRow } from '@/components/DistanceList'

const rows: DistanceRow[] = [
  { key: 'k1', name: '10', time: '07:00' },
]

describe('DistanceList', () => {
  it('name input is type="number"', () => {
    render(<DistanceList rows={rows} date="2026-01-01" onChange={vi.fn()} />)
    expect(screen.getByPlaceholderText('e.g. 10')).toHaveAttribute('type', 'number')
  })

  it('renders "km" label after name input', () => {
    render(<DistanceList rows={rows} date="2026-01-01" onChange={vi.fn()} />)
    expect(screen.getByText('km')).toBeInTheDocument()
  })

  it('name input placeholder is "e.g. 10"', () => {
    render(<DistanceList rows={rows} date="2026-01-01" onChange={vi.fn()} />)
    expect(screen.getByPlaceholderText('e.g. 10')).toBeInTheDocument()
  })
})
