import { describe, it, expect } from 'vitest'
import { calcNetTime, formatTime, formatNetTime, getDistanceStartTime } from '@/lib/time'
import type { Athlete, EventDistance } from '@/types'

describe('calcNetTime', () => {
  it('returns net time in milliseconds', () => {
    const start = '2026-03-16T07:00:00+07:00'
    const finish = '2026-03-16T07:42:15+07:00'
    expect(calcNetTime(start, finish)).toBe(42 * 60 * 1000 + 15 * 1000)
  })
  it('handles sub-second precision', () => {
    const start  = '2026-03-16T07:00:00.000+07:00'
    const finish = '2026-03-16T07:42:15.320+07:00'
    expect(calcNetTime(start, finish)).toBe(42 * 60 * 1000 + 15 * 1000 + 320)
  })
})

describe('formatTime', () => {
  it('formats ISO timestamp to HH:MM:SS local time', () => {
    expect(formatTime('2026-03-16T07:42:15+07:00', 'Asia/Bangkok')).toBe('07:42:15')
  })
})

describe('formatNetTime', () => {
  it('formats milliseconds to HH:MM:SS', () => {
    expect(formatNetTime(42 * 60 * 1000 + 15 * 1000)).toBe('00:42:15')
  })
  it('handles hours', () => {
    expect(formatNetTime(1 * 3600 * 1000 + 5 * 60 * 1000 + 30 * 1000)).toBe('01:05:30')
  })
})

const d10k: EventDistance = {
  id: 'd1', event_id: 'e1', name: '10K',
  start_time: '2026-03-17T07:30:00+07:00', overall_top_n: 3, default_top_n: 3,
}
const d5k: EventDistance = {
  id: 'd2', event_id: 'e1', name: '5K',
  start_time: '2026-03-17T07:00:00+07:00', overall_top_n: 3, default_top_n: 3,
}
const athlete: Athlete = {
  id: 'a1', event_id: 'e1', bib_number: '235', name: 'Test',
  distance_id: 'd1', gender: 'Male', age_group: '30-39',
}

describe('getDistanceStartTime', () => {
  it('returns start_time for registered bib', () => {
    expect(getDistanceStartTime('235', [athlete], [d10k, d5k]))
      .toBe('2026-03-17T07:30:00+07:00')
  })

  it('returns earliest distance start_time for unregistered bib', () => {
    // 5K starts earlier (07:00) than 10K (07:30)
    expect(getDistanceStartTime('999', [], [d10k, d5k]))
      .toBe('2026-03-17T07:00:00+07:00')
  })

  it('returns null when bib unknown and distances empty', () => {
    expect(getDistanceStartTime('999', [], [])).toBeNull()
  })
})
