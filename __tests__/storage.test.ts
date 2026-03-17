import { describe, it, expect, beforeEach } from 'vitest'
import {
  getPendingRecords,
  addPendingRecord,
  markSynced,
  removeSynced,
  getEventById,
  saveEvent,
} from '@/lib/storage'

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
    const event: import('@/types').Event = { id: 'evt-1', name: 'Test', start_time: '2026-03-16T07:00:00+07:00', timezone: 'Asia/Bangkok', overall_lockout: false }
    saveEvent(event)
    expect(getEventById('evt-1')).toEqual(event)
  })
})
