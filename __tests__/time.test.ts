import { describe, it, expect } from 'vitest'
import { calcNetTime, formatTime, formatNetTime } from '@/lib/time'

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
