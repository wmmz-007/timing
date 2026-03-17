import { describe, it, expect } from 'vitest'
import { generateCsv } from '@/lib/export'
import type { FinishRecord, Event } from '@/types'

const event: Event = {
  id: 'evt-1',
  name: 'Test Race',
  start_time: '2026-03-16T07:00:00+07:00',
  timezone: 'Asia/Bangkok',
}

const records: FinishRecord[] = [
  { id: 'r1', event_id: 'evt-1', bib_number: '235', finish_time: '2026-03-16T07:42:15+07:00', created_at: '' },
  { id: 'r2', event_id: 'evt-1', bib_number: '099', finish_time: '2026-03-16T07:40:55+07:00', created_at: '' },
]

describe('generateCsv', () => {
  it('generates header row', () => {
    expect(generateCsv(records, event).split('\n')[0]).toBe('bib,finish_time,net_time')
  })
  it('preserves leading zeros in bib_number', () => {
    expect(generateCsv(records, event)).toContain('099,')
  })
  it('exports finish_time as HH:MM:SS local time', () => {
    expect(generateCsv(records, event)).toContain('235,07:42:15,')
  })
  it('computes net_time correctly', () => {
    expect(generateCsv(records, event)).toContain('235,07:42:15,00:42:15')
  })
  it('sorts records by net_time ascending', () => {
    const lines = generateCsv(records, event).split('\n').slice(1).filter(Boolean)
    expect(lines[0]).toContain('099')
    expect(lines[1]).toContain('235')
  })
})
