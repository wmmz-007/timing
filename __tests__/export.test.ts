import { describe, it, expect } from 'vitest'
import { generateCsv } from '@/lib/export'
import type { FinishRecord, Event, Athlete, EventDistance, SubgroupPrizeOverride } from '@/types'
import { computeRanks } from '@/lib/ranking'

const event: Event = {
  id: 'evt-1',
  name: 'Test Race',
  timezone: 'Asia/Bangkok',
  overall_lockout: false,
}

const dist: EventDistance = {
  id: 'd1', event_id: 'evt-1', name: '10K',
  start_time: '2026-03-16T07:00:00+07:00', overall_top_n: 3, default_top_n: 3,
}

const athletes: Athlete[] = [
  { id: 'a1', event_id: 'evt-1', bib_number: '235', name: 'สมชาย', distance_id: 'd1', gender: 'Male', age_group: '30-39' },
  { id: 'a2', event_id: 'evt-1', bib_number: '099', name: 'สมหญิง', distance_id: 'd1', gender: 'Female', age_group: '20-29' },
]

const records: FinishRecord[] = [
  { id: 'r1', event_id: 'evt-1', bib_number: '235', finish_time: '2026-03-16T07:42:15+07:00', created_at: '2026-03-16T07:42:15Z' },
  { id: 'r2', event_id: 'evt-1', bib_number: '099', finish_time: '2026-03-16T07:40:55+07:00', created_at: '2026-03-16T07:40:55Z' },
]

const overrides: SubgroupPrizeOverride[] = []

describe('generateCsv', () => {
  it('generates header row', () => {
    const rankMap = computeRanks(records, athletes, [dist], overrides, false)
    const csv = generateCsv(records, event, athletes, [dist], rankMap)
    expect(csv.split('\n')[0]).toBe('bib,name,distance,gender,age_group,finish_time,net_time,overall_rank,division_rank')
  })

  it('preserves leading zeros in bib_number', () => {
    const rankMap = computeRanks(records, athletes, [dist], overrides, false)
    expect(generateCsv(records, event, athletes, [dist], rankMap)).toContain('099,')
  })

  it('exports finish_time as HH:MM:SS local time', () => {
    const rankMap = computeRanks(records, athletes, [dist], overrides, false)
    expect(generateCsv(records, event, athletes, [dist], rankMap)).toContain('235,สมชาย,10K,Male,30-39,07:42:15,')
  })

  it('computes net_time correctly', () => {
    const rankMap = computeRanks(records, athletes, [dist], overrides, false)
    expect(generateCsv(records, event, athletes, [dist], rankMap)).toContain(',00:42:15,')
  })

  it('sorts by net_time ascending', () => {
    const rankMap = computeRanks(records, athletes, [dist], overrides, false)
    const lines = generateCsv(records, event, athletes, [dist], rankMap).split('\n').slice(1).filter(Boolean)
    expect(lines[0]).toContain('099')
    expect(lines[1]).toContain('235')
  })

  it('blank fields for bib not in athletes', () => {
    const unknownRecord: FinishRecord = {
      id: 'r3', event_id: 'evt-1', bib_number: '999', finish_time: '2026-03-16T08:00:00+07:00', created_at: '2026-03-16T08:00:00Z'
    }
    const rankMap = computeRanks([...records, unknownRecord], athletes, [dist], overrides, false)
    const csv = generateCsv([...records, unknownRecord], event, athletes, [dist], rankMap)
    const unknownLine = csv.split('\n').find((l) => l.startsWith('999,'))!
    expect(unknownLine).toContain('999,,,,,')
  })
})
