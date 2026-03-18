import { describe, it, expect } from 'vitest'
import { generateCsv } from '@/lib/export'
import type { FinishRecord, Event, Athlete, EventDistance, SubgroupPrizeOverride } from '@/types'
import { computeRanks } from '@/lib/ranking'

const event: Event = {
  id: 'evt-1',
  name: 'Test Race',
  timezone: 'Asia/Bangkok',
  overall_lockout: false,
  created_at: '2026-03-17T00:00:00Z',
  password: '',
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
    const parts = unknownLine.split(',')
    // name, distance, gender, age_group blank (positions 1-4)
    expect(parts[1]).toBe('')
    expect(parts[2]).toBe('')
    expect(parts[3]).toBe('')
    expect(parts[4]).toBe('')
    // overall_rank, division_rank blank (positions 7-8)
    expect(parts[7]).toBe('')
    expect(parts[8]).toBe('')
  })

  it('returns header only when records is empty', () => {
    const rankMap = computeRanks([], athletes, [dist], overrides, false)
    const csv = generateCsv([], event, athletes, [dist], rankMap)
    const lines = csv.split('\n').filter(Boolean)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('bib')
  })

  it('outputs empty string not null for missing ranks', () => {
    // Pass an empty rankMap so all bibs have no rank entry
    const csv = generateCsv(records, event, athletes, [dist], new Map())
    expect(csv).not.toContain(',null,')
    expect(csv).not.toContain(',undefined,')
  })
})
