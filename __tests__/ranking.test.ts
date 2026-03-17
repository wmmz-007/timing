import { describe, it, expect } from 'vitest'
import { computeRanks } from '@/lib/ranking'
import type { FinishRecord, Athlete, EventDistance, SubgroupPrizeOverride } from '@/types'

const dist: EventDistance = {
  id: 'd1', event_id: 'e1', name: '10K',
  start_time: '2026-03-17T07:00:00+07:00', overall_top_n: 3, default_top_n: 3,
}

function makeRecord(bib: string, finishOffsetMs: number): FinishRecord {
  const finish = new Date(new Date(dist.start_time).getTime() + finishOffsetMs).toISOString()
  return { id: bib, event_id: 'e1', bib_number: bib, finish_time: finish, created_at: finish }
}

function makeAthlete(bib: string, gender: string, ageGroup: string): Athlete {
  return { id: bib, event_id: 'e1', bib_number: bib, name: '', distance_id: 'd1', gender, age_group: ageGroup }
}

describe('computeRanks — overall', () => {
  const records = [
    makeRecord('001', 40 * 60000),  // 40 min
    makeRecord('002', 42 * 60000),  // 42 min
    makeRecord('003', 45 * 60000),  // 45 min
    makeRecord('004', 50 * 60000),  // 50 min
    makeRecord('005', 35 * 60000),  // 35 min — fastest Female
  ]
  const athletes = [
    makeAthlete('001', 'Male', '30-39'),
    makeAthlete('002', 'Male', '30-39'),
    makeAthlete('003', 'Male', '40-49'),
    makeAthlete('004', 'Male', '40-49'),
    makeAthlete('005', 'Female', '30-39'),
  ]

  it('assigns overallRank 1-3 to top 3 males', () => {
    const map = computeRanks(records, athletes, [dist], [], false)
    expect(map.get('001')?.overallRank).toBe(1)
    expect(map.get('002')?.overallRank).toBe(2)
    expect(map.get('003')?.overallRank).toBe(3)
    expect(map.get('004')?.overallRank).toBeNull()
  })

  it('ranks females separately from males', () => {
    const map = computeRanks(records, athletes, [dist], [], false)
    expect(map.get('005')?.overallRank).toBe(1)
  })

  it('assigns divisionRank 1-3 per subgroup', () => {
    const map = computeRanks(records, athletes, [dist], [], false)
    expect(map.get('001')?.divisionRank).toBe(1)
    expect(map.get('002')?.divisionRank).toBe(2)
    expect(map.get('003')?.divisionRank).toBe(1)
    expect(map.get('004')?.divisionRank).toBe(2)
  })
})

describe('computeRanks — overall_lockout', () => {
  const records = [
    makeRecord('001', 40 * 60000),
    makeRecord('002', 42 * 60000),
    makeRecord('003', 45 * 60000),
    makeRecord('004', 50 * 60000),
  ]
  const athletes = [
    makeAthlete('001', 'Male', '30-39'),
    makeAthlete('002', 'Male', '30-39'),
    makeAthlete('003', 'Male', '30-39'),
    makeAthlete('004', 'Male', '30-39'),
  ]

  it('with lockout: overall winners excluded from division pool', () => {
    const map = computeRanks(records, athletes, [dist], [], true)
    // 001 wins overall rank 1 → excluded from division
    expect(map.get('001')?.overallRank).toBe(1)
    expect(map.get('001')?.divisionRank).toBeNull()
    // 002 wins overall rank 2 → excluded from division
    expect(map.get('002')?.overallRank).toBe(2)
    expect(map.get('002')?.divisionRank).toBeNull()
    // 004 gets division rank 2 (003 is rank 1 in division)
    expect(map.get('003')?.divisionRank).toBe(1)
    expect(map.get('004')?.divisionRank).toBe(2)
  })
})

describe('computeRanks — subgroup override', () => {
  const records = [makeRecord('001', 40 * 60000), makeRecord('002', 42 * 60000)]
  const athletes = [makeAthlete('001', 'Male', '30-39'), makeAthlete('002', 'Male', '30-39')]
  const override: SubgroupPrizeOverride = { id: 'o1', distance_id: 'd1', gender: 'Male', age_group: '30-39', top_n: 1 }

  it('uses override top_n instead of distance default', () => {
    const map = computeRanks(records, athletes, [dist], [override], false)
    expect(map.get('001')?.divisionRank).toBe(1)
    expect(map.get('002')?.divisionRank).toBeNull()  // top_n=1, so only rank 1
  })
})

describe('computeRanks — tie-breaking', () => {
  it('same net time: earlier created_at wins', () => {
    const sameTime = new Date(new Date(dist.start_time).getTime() + 40 * 60000).toISOString()
    const records: FinishRecord[] = [
      { id: 'r1', event_id: 'e1', bib_number: '001', finish_time: sameTime, created_at: '2026-03-17T07:41:00Z' },
      { id: 'r2', event_id: 'e1', bib_number: '002', finish_time: sameTime, created_at: '2026-03-17T07:40:00Z' },
    ]
    const athletes = [makeAthlete('001', 'Male', '30-39'), makeAthlete('002', 'Male', '30-39')]
    const map = computeRanks(records, athletes, [dist], [], false)
    // 002 created earlier → rank 1
    expect(map.get('002')?.overallRank).toBe(1)
    expect(map.get('001')?.overallRank).toBe(1)  // tie → same rank
  })
})

describe('computeRanks — unregistered bib', () => {
  it('skips bibs not in athletes, no entry in map', () => {
    const records = [makeRecord('999', 40 * 60000)]
    const map = computeRanks(records, [], [dist], [], false)
    expect(map.has('999')).toBe(false)
  })
})
