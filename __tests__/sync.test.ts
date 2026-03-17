import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolveConflict, syncPendingRecords } from '@/lib/sync'
import type { PendingRecord, FinishRecord, SyncConflict } from '@/types'

// Mock dependencies for syncPendingRecords integration test
vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn() },
}))
vi.mock('@/lib/storage', () => ({
  getPendingRecords: vi.fn(),
  markSynced: vi.fn(),
  removeSynced: vi.fn(),
}))

import { supabase } from '@/lib/supabase'
import { getPendingRecords, markSynced, removeSynced } from '@/lib/storage'

describe('resolveConflict', () => {
  it('keeps the record with the earliest finish_time (local wins)', () => {
    const local: PendingRecord = {
      local_id: 'loc-1', event_id: 'evt-1', bib_number: '235',
      finish_time: '2026-03-16T07:40:00+07:00', synced: false,
    }
    const existing: FinishRecord = {
      id: 'db-1', event_id: 'evt-1', bib_number: '235',
      finish_time: '2026-03-16T07:42:00+07:00', created_at: '',
    }
    const result = resolveConflict(local, existing)
    expect(result.winner).toBe('local')
    expect(result.conflict.kept_finish_time).toBe(local.finish_time)
    expect(result.conflict.discarded_finish_time).toBe(existing.finish_time)
  })

  it('keeps existing when existing is earlier', () => {
    const local: PendingRecord = {
      local_id: 'loc-1', event_id: 'evt-1', bib_number: '235',
      finish_time: '2026-03-16T07:45:00+07:00', synced: false,
    }
    const existing: FinishRecord = {
      id: 'db-1', event_id: 'evt-1', bib_number: '235',
      finish_time: '2026-03-16T07:42:00+07:00', created_at: '',
    }
    const result = resolveConflict(local, existing)
    expect(result.winner).toBe('existing')
  })

  it('local wins on tie (equal timestamps)', () => {
    const time = '2026-03-16T07:42:00+07:00'
    const local: PendingRecord = {
      local_id: 'loc-1', event_id: 'evt-1', bib_number: '235',
      finish_time: time, synced: false,
    }
    const existing: FinishRecord = {
      id: 'db-1', event_id: 'evt-1', bib_number: '235',
      finish_time: time, created_at: '',
    }
    const result = resolveConflict(local, existing)
    expect(result.winner).toBe('local')
  })
})

describe('syncPendingRecords', () => {
  beforeEach(() => vi.clearAllMocks())

  it('does nothing when no pending records', async () => {
    vi.mocked(getPendingRecords).mockReturnValue([])
    await syncPendingRecords('evt-1', vi.fn())
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('inserts a new record when no conflict exists', async () => {
    const pending: PendingRecord = {
      local_id: 'loc-1', event_id: 'evt-1', bib_number: '235',
      finish_time: '2026-03-16T07:42:00+07:00', synced: false,
    }
    vi.mocked(getPendingRecords).mockReturnValue([pending])

    const maybeSingleMock = vi.fn().mockResolvedValue({ data: null, error: null })
    const insertMock = vi.fn().mockResolvedValue({ data: null, error: null })
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: maybeSingleMock,
      insert: insertMock,
    } as ReturnType<typeof supabase.from>)

    const onConflict = vi.fn()
    await syncPendingRecords('evt-1', onConflict)

    expect(onConflict).not.toHaveBeenCalled()
    expect(markSynced).toHaveBeenCalledWith('evt-1', 'loc-1')
  })
})
