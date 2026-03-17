import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Supabase client
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

import { supabase } from '@/lib/supabase'
import {
  getEvent, createFinishRecord, getFinishRecords,
  createEventWithDistances, getDistancesForEvent,
  getAthletesForEvent, upsertAthletes, getSubgroupOverrides, upsertSubgroupOverride, deleteSubgroupOverride,
  updateDistance, deleteDistanceAndAthletes,
  getEvents, updateEventName, deleteEvent, getEventStats, deleteDistance,
} from '@/lib/db'

const mockChain = (returnValue: unknown) => {
  const chain: Record<string, unknown> = {}
  const methods = ['select', 'insert', 'update', 'delete', 'upsert', 'eq', 'in', 'order', 'single', 'maybeSingle']
  methods.forEach((m) => { chain[m] = vi.fn(() => chain) })
  chain['then'] = vi.fn((cb: (v: unknown) => unknown) => Promise.resolve(cb(returnValue)))
  return chain
}

beforeEach(() => vi.clearAllMocks())


describe('getEvent', () => {
  it('returns event by id', async () => {
    const mockEvent = { id: 'evt-1', name: 'Test', timezone: 'Asia/Bangkok', overall_lockout: false }
    const chain = mockChain({ data: mockEvent, error: null })
    vi.mocked(supabase.from).mockReturnValue(chain as unknown as ReturnType<typeof supabase.from>)
    const result = await getEvent('evt-1')
    expect(result).toEqual(mockEvent)
  })

  it('returns null when not found', async () => {
    const chain = mockChain({ data: null, error: null })
    vi.mocked(supabase.from).mockReturnValue(chain as unknown as ReturnType<typeof supabase.from>)
    const result = await getEvent('missing')
    expect(result).toBeNull()
  })
})

describe('createFinishRecord', () => {
  it('inserts record and returns data', async () => {
    const mockRecord = { id: 'r1', event_id: 'evt-1', bib_number: '235', finish_time: '2026-03-16T07:42:00+07:00', created_at: '' }
    const chain = mockChain({ data: mockRecord, error: null })
    vi.mocked(supabase.from).mockReturnValue(chain as unknown as ReturnType<typeof supabase.from>)
    const result = await createFinishRecord({ event_id: 'evt-1', bib_number: '235', finish_time: '2026-03-16T07:42:00+07:00' })
    expect(result).toEqual(mockRecord)
  })
})

describe('getFinishRecords', () => {
  it('queries by event_id ordered by finish_time', async () => {
    const mockRecords = [{ id: 'r1', event_id: 'evt-1', bib_number: '235', finish_time: '', created_at: '' }]
    const chain = mockChain({ data: mockRecords, error: null })
    vi.mocked(supabase.from).mockReturnValue(chain as unknown as ReturnType<typeof supabase.from>)
    const result = await getFinishRecords('evt-1')
    expect(result).toEqual(mockRecords)
  })
})

describe('createEventWithDistances', () => {
  it('calls rpc with correct params', async () => {
    const mockEvent = { id: 'evt-1', name: 'Test', timezone: 'Asia/Bangkok', overall_lockout: false }
    const rpcChain = {
      data: mockEvent,
      error: null,
      then: vi.fn((cb: (v: unknown) => unknown) => Promise.resolve(cb({ data: mockEvent, error: null }))),
    }
    const mockRpc = vi.fn(() => rpcChain)
    vi.mocked(supabase as unknown as { rpc: typeof mockRpc }).rpc = mockRpc
    const result = await createEventWithDistances('Test', 'Asia/Bangkok', [
      { name: '10K', start_time: '2026-03-17T07:00:00+07:00' },
    ])
    expect(mockRpc).toHaveBeenCalledWith('create_event_with_distances', expect.objectContaining({
      p_name: 'Test',
      p_timezone: 'Asia/Bangkok',
      p_distances: JSON.stringify([{ name: '10K', start_time: '2026-03-17T07:00:00+07:00' }]),
    }))
    expect(result.name).toBe('Test')
  })
})

describe('getDistancesForEvent', () => {
  it('queries event_distances by event_id', async () => {
    const mockData = [{ id: 'd1', event_id: 'evt-1', name: '10K', start_time: '', overall_top_n: 3, default_top_n: 3 }]
    const chain = mockChain({ data: mockData, error: null })
    vi.mocked(supabase.from).mockReturnValue(chain as unknown as ReturnType<typeof supabase.from>)
    const result = await getDistancesForEvent('evt-1')
    expect(supabase.from).toHaveBeenCalledWith('event_distances')
    expect(result).toEqual(mockData)
  })
})

describe('getAthletesForEvent', () => {
  it('queries athletes by event_id', async () => {
    const mockData = [{ id: 'a1', event_id: 'evt-1', bib_number: '235', name: '', distance_id: 'd1', gender: 'Male', age_group: '30-39' }]
    const chain = mockChain({ data: mockData, error: null })
    vi.mocked(supabase.from).mockReturnValue(chain as unknown as ReturnType<typeof supabase.from>)
    const result = await getAthletesForEvent('evt-1')
    expect(supabase.from).toHaveBeenCalledWith('athletes')
    expect(result).toEqual(mockData)
  })
})

describe('deleteDistanceAndAthletes', () => {
  it('throws and does not delete distance if athletes delete fails', async () => {
    const errChain = mockChain({ data: null, error: { message: 'fail' } })
    vi.mocked(supabase.from).mockReturnValue(errChain as unknown as ReturnType<typeof supabase.from>)
    await expect(deleteDistanceAndAthletes('d1')).rejects.toEqual({ message: 'fail' })
  })
})

describe('upsertAthletes', () => {
  it('throws and does not insert if delete fails', async () => {
    const errChain = mockChain({ data: null, error: { message: 'del fail' } })
    vi.mocked(supabase.from).mockReturnValue(errChain as unknown as ReturnType<typeof supabase.from>)
    await expect(upsertAthletes('evt-1', [{ event_id: 'evt-1', bib_number: '1', name: '', distance_id: 'd1', gender: '', age_group: '' }])).rejects.toEqual({ message: 'del fail' })
  })
})

describe('getEvents', () => {
  it('returns all events ordered by created_at desc', async () => {
    const mockEvents = [
      { id: 'e1', name: 'Event 1', timezone: 'Asia/Bangkok', overall_lockout: false, created_at: '2026-03-17T10:00:00Z' },
      { id: 'e2', name: 'Event 2', timezone: 'Asia/Bangkok', overall_lockout: false, created_at: '2026-03-16T10:00:00Z' },
    ]
    const chain = mockChain({ data: mockEvents, error: null })
    vi.mocked(supabase.from).mockReturnValue(chain as unknown as ReturnType<typeof supabase.from>)
    const result = await getEvents()
    expect(result).toEqual(mockEvents)
    expect(chain.order).toHaveBeenCalledWith('created_at', { ascending: false })
  })

  it('returns empty array when no events', async () => {
    const chain = mockChain({ data: [], error: null })
    vi.mocked(supabase.from).mockReturnValue(chain as unknown as ReturnType<typeof supabase.from>)
    const result = await getEvents()
    expect(result).toEqual([])
  })
})

describe('updateEventName', () => {
  it('updates the event name', async () => {
    const chain = mockChain({ error: null })
    vi.mocked(supabase.from).mockReturnValue(chain as unknown as ReturnType<typeof supabase.from>)
    await updateEventName('evt-1', 'New Name')
    expect(vi.mocked(supabase.from)).toHaveBeenCalledWith('events')
    expect(chain.update).toHaveBeenCalledWith({ name: 'New Name' })
    expect(chain.eq).toHaveBeenCalledWith('id', 'evt-1')
  })

  it('throws on error', async () => {
    const chain = mockChain({ error: { message: 'db error' } })
    vi.mocked(supabase.from).mockReturnValue(chain as unknown as ReturnType<typeof supabase.from>)
    await expect(updateEventName('evt-1', 'x')).rejects.toMatchObject({ message: 'db error' })
  })
})

describe('deleteEvent', () => {
  it('deletes athletes first then event', async () => {
    const athleteChain = mockChain({ error: null })
    const eventChain = mockChain({ error: null })
    vi.mocked(supabase.from)
      .mockReturnValueOnce(athleteChain as unknown as ReturnType<typeof supabase.from>)
      .mockReturnValueOnce(eventChain as unknown as ReturnType<typeof supabase.from>)
    await deleteEvent('evt-1')
    expect(vi.mocked(supabase.from)).toHaveBeenNthCalledWith(1, 'athletes')
    expect(vi.mocked(supabase.from)).toHaveBeenNthCalledWith(2, 'events')
    expect(athleteChain.eq).toHaveBeenCalledWith('event_id', 'evt-1')
    expect(eventChain.eq).toHaveBeenCalledWith('id', 'evt-1')
  })

  it('throws if athlete delete fails', async () => {
    const athleteChain = mockChain({ error: { message: 'fail' } })
    vi.mocked(supabase.from).mockReturnValue(athleteChain as unknown as ReturnType<typeof supabase.from>)
    await expect(deleteEvent('evt-1')).rejects.toMatchObject({ message: 'fail' })
  })
})

describe('getEventStats', () => {
  it('returns record and athlete counts', async () => {
    const recordChain = mockChain({ count: 10, error: null })
    const athleteChain = mockChain({ count: 5, error: null })
    vi.mocked(supabase.from)
      .mockReturnValueOnce(recordChain as unknown as ReturnType<typeof supabase.from>)
      .mockReturnValueOnce(athleteChain as unknown as ReturnType<typeof supabase.from>)
    const result = await getEventStats('evt-1')
    expect(result).toEqual({ recordCount: 10, athleteCount: 5 })
  })

  it('returns zero counts when null', async () => {
    const recordChain = mockChain({ count: null, error: null })
    const athleteChain = mockChain({ count: null, error: null })
    vi.mocked(supabase.from)
      .mockReturnValueOnce(recordChain as unknown as ReturnType<typeof supabase.from>)
      .mockReturnValueOnce(athleteChain as unknown as ReturnType<typeof supabase.from>)
    const result = await getEventStats('evt-1')
    expect(result).toEqual({ recordCount: 0, athleteCount: 0 })
  })
})

describe('deleteDistance', () => {
  it('deletes distance by id', async () => {
    const chain = mockChain({ error: null })
    vi.mocked(supabase.from).mockReturnValue(chain as unknown as ReturnType<typeof supabase.from>)
    await deleteDistance('dist-1')
    expect(vi.mocked(supabase.from)).toHaveBeenCalledWith('event_distances')
    expect(chain.eq).toHaveBeenCalledWith('id', 'dist-1')
  })

  it('throws when athletes exist (RESTRICT)', async () => {
    const chain = mockChain({ error: { message: 'violates foreign key constraint', code: '23503' } })
    vi.mocked(supabase.from).mockReturnValue(chain as unknown as ReturnType<typeof supabase.from>)
    await expect(deleteDistance('dist-1')).rejects.toMatchObject({ code: '23503' })
  })
})
