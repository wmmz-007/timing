import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
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

  describe('Download Template', () => {
    let mockAnchor: { href: string; download: string; click: ReturnType<typeof vi.fn> }
    let capturedBlob: Blob | undefined

    beforeEach(() => {
      mockAnchor = { href: '', download: '', click: vi.fn() }
      capturedBlob = undefined
      vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
        capturedBlob = blob as Blob
        return 'blob:mock'
      })
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
      const origCreateElement = document.createElement.bind(document)
      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        if (tag === 'a') return mockAnchor as unknown as HTMLAnchorElement
        return origCreateElement(tag)
      })
    })

    afterEach(() => vi.restoreAllMocks())

    it('"Download Template" button is always rendered', () => {
      render(<AthleteImport eventId="e1" distances={[]} onImported={vi.fn()} />)
      expect(screen.getByRole('button', { name: /download template/i })).toBeInTheDocument()
    })

    it('clicking "Download Template" with distances generates CSV containing distance names', async () => {
      vi.useFakeTimers()
      render(<AthleteImport eventId="e1" distances={mockDistances} onImported={vi.fn()} />)
      fireEvent.click(screen.getByRole('button', { name: /download template/i }))
      expect(URL.createObjectURL).toHaveBeenCalled()
      expect(mockAnchor.click).toHaveBeenCalled()
      expect(mockAnchor.download).toBe('athlete-template.csv')
      expect(mockAnchor.href).toBe('blob:mock')
      const text = await capturedBlob!.text()
      expect(text).toMatch(/^bib_number,name,distance,gender,age_group/)
      expect(text).toContain('10K')
      expect(text).toContain('21K')
      vi.runAllTimers()
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock')
      vi.useRealTimers()
    })

    it('clicking "Download Template" with no distances generates header-only CSV', async () => {
      render(<AthleteImport eventId="e1" distances={[]} onImported={vi.fn()} />)
      fireEvent.click(screen.getByRole('button', { name: /download template/i }))
      const text = await capturedBlob!.text()
      expect(text).toBe('bib_number,name,distance,gender,age_group')
    })
  })
})
