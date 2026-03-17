import { describe, it, expect, beforeEach } from 'vitest'
import {
  getPendingRecords, addPendingRecord, markSynced, removeSynced,
  removePendingRecord, removeRecordByBib,
  getEventById, saveEvent,
  saveDistances, getDistances, saveAthletes, getAthletes,
  clearEventCache,
} from '@/lib/storage'
import type { EventDistance, Athlete, Event } from '@/types'

beforeEach(() => {
  localStorage.clear()
})

describe('pending records', () => {
  it('returns empty array when nothing stored', () => {
    expect(getPendingRecords('evt-1')).toEqual([])
  })

  it('adds a pending record', () => {
    addPendingRecord({
      local_id: 'loc-1',
      event_id: 'evt-1',
      bib_number: '235',
      finish_time: '2026-03-16T07:42:15+07:00',
      synced: false,
    })
    const records = getPendingRecords('evt-1')
    expect(records).toHaveLength(1)
    expect(records[0].bib_number).toBe('235')
  })

  it('marks a record as synced', () => {
    addPendingRecord({
      local_id: 'loc-1',
      event_id: 'evt-1',
      bib_number: '235',
      finish_time: '2026-03-16T07:42:15+07:00',
      synced: false,
    })
    markSynced('evt-1', 'loc-1')
    const records = getPendingRecords('evt-1')
    expect(records[0].synced).toBe(true)
  })

  it('removes synced records', () => {
    addPendingRecord({ local_id: 'loc-1', event_id: 'evt-1', bib_number: '235', finish_time: '', synced: true })
    addPendingRecord({ local_id: 'loc-2', event_id: 'evt-1', bib_number: '180', finish_time: '', synced: false })
    removeSynced('evt-1')
    const records = getPendingRecords('evt-1')
    expect(records).toHaveLength(1)
    expect(records[0].local_id).toBe('loc-2')
  })

  it('allows caller to detect duplicate bib before adding', () => {
    // The duplicate check lives in the UI layer (CaptureScreen), not storage.
    // This test verifies that getPendingRecords returns data the caller can use to detect a duplicate.
    addPendingRecord({ local_id: 'loc-1', event_id: 'evt-1', bib_number: '235', finish_time: '', synced: false })
    const existing = getPendingRecords('evt-1').find((r) => r.bib_number === '235')
    expect(existing).toBeDefined()
    expect(existing?.bib_number).toBe('235')
  })
})

describe('event storage', () => {
  it('returns null when event not found', () => {
    expect(getEventById('missing')).toBeNull()
  })

  it('saves and retrieves an event', () => {
    const event: Event = { id: 'evt-1', name: 'Test', timezone: 'Asia/Bangkok', overall_lockout: false, created_at: '2026-03-17T00:00:00Z' }
    saveEvent(event)
    expect(getEventById('evt-1')).toEqual(event)
  })
})

describe('distances cache', () => {
  it('returns empty array when nothing stored', () => {
    expect(getDistances('evt-1')).toEqual([])
  })

  it('saves and retrieves distances', () => {
    const distances: EventDistance[] = [{
      id: 'd1', event_id: 'evt-1', name: '10K',
      start_time: '2026-03-17T07:00:00+07:00', overall_top_n: 3, default_top_n: 3,
    }]
    saveDistances('evt-1', distances)
    expect(getDistances('evt-1')).toEqual(distances)
  })
})

describe('athletes cache', () => {
  it('returns empty array when nothing stored', () => {
    expect(getAthletes('evt-1')).toEqual([])
  })

  it('saves and retrieves athletes', () => {
    const athletes: Athlete[] = [{
      id: 'a1', event_id: 'evt-1', bib_number: '235', name: 'สมชาย',
      distance_id: 'd1', gender: 'Male', age_group: '30-39',
    }]
    saveAthletes('evt-1', athletes)
    expect(getAthletes('evt-1')).toEqual(athletes)
  })
})

describe('clearEventCache', () => {
  it('removes all 4 LocalStorage keys for an event', () => {
    localStorage.setItem('timing:event:e1', '{"id":"e1"}')
    localStorage.setItem('timing:pending:e1', '[]')
    localStorage.setItem('timing:distances:e1', '[]')
    localStorage.setItem('timing:athletes:e1', '[]')
    // Key for a different event — must NOT be removed
    localStorage.setItem('timing:event:e2', '{"id":"e2"}')

    clearEventCache('e1')

    expect(localStorage.getItem('timing:event:e1')).toBeNull()
    expect(localStorage.getItem('timing:pending:e1')).toBeNull()
    expect(localStorage.getItem('timing:distances:e1')).toBeNull()
    expect(localStorage.getItem('timing:athletes:e1')).toBeNull()
    // Other event untouched
    expect(localStorage.getItem('timing:event:e2')).not.toBeNull()
  })
})

describe('getEventById strips stale start_time', () => {
  it('removes start_time field if present in cached data', () => {
    // Simulate old cached event with start_time
    localStorage.setItem('timing:event:evt-1', JSON.stringify({
      id: 'evt-1', name: 'Test', start_time: '2026-03-16T07:00:00+07:00',
      timezone: 'Asia/Bangkok', overall_lockout: false,
    }))
    const event = getEventById('evt-1')
    expect(event).not.toBeNull()
    expect((event as unknown as Record<string, unknown>)['start_time']).toBeUndefined()
  })
})
