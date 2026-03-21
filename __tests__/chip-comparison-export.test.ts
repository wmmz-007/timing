import { describe, it, expect } from 'vitest'
import { generateChipComparisonCsv } from '@/lib/export'
import type { FinishRecord, Event } from '@/types'

const event: Event = {
  id: 'evt-1',
  name: 'Test',
  timezone: 'Asia/Bangkok',
  overall_lockout: false,
  created_at: '2026-03-17T00:00:00Z',
  password: '',
}

// Two records: 099 finishes before 235 in UTC; input order is 235 then 099
const records: FinishRecord[] = [
  { id: 'r2', event_id: 'evt-1', bib_number: '235', finish_time: '2026-03-16T07:42:15+07:00', created_at: '2026-03-16T00:42:15Z' },
  { id: 'r1', event_id: 'evt-1', bib_number: '099', finish_time: '2026-03-16T07:40:55+07:00', created_at: '2026-03-16T00:40:55Z' },
]

describe('generateChipComparisonCsv', () => {
  it('header is bib,finish_time_local,finish_time_utc', () => {
    const csv = generateChipComparisonCsv(records, event)
    expect(csv.split('\n')[0]).toBe('bib,finish_time_local,finish_time_utc')
  })

  it('sorts by finish UTC ascending; tie-break by bib', () => {
    const csv = generateChipComparisonCsv(records, event)
    const lines = csv.split('\n').filter(Boolean)
    expect(lines[1]).toMatch(/^099,/)
    expect(lines[2]).toMatch(/^235,/)
  })

  it('finish_time_local matches formatTime (HH:MM:SS only)', () => {
    const csv = generateChipComparisonCsv(records, event)
    expect(csv).toContain('07:40:55')
    expect(csv).toContain('07:42:15')
  })

  it('finish_time_utc is ISO Z for each row', () => {
    const csv = generateChipComparisonCsv(records, event)
    expect(csv).toMatch(/2026-03-16T00:40:55\.\d{3}Z/)
    expect(csv).toMatch(/2026-03-16T00:42:15\.\d{3}Z/)
  })

  it('empty records returns header only', () => {
    const csv = generateChipComparisonCsv([], event)
    expect(csv).toBe('bib,finish_time_local,finish_time_utc')
  })
})
