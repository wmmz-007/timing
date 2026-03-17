import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Supabase client
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

import { supabase } from '@/lib/supabase'
import { createEvent, getEvent, createFinishRecord, getFinishRecords } from '@/lib/db'

const mockChain = (returnValue: unknown) => {
  const chain: Record<string, unknown> = {}
  const methods = ['select', 'insert', 'update', 'eq', 'order', 'single', 'maybeSingle']
  methods.forEach((m) => { chain[m] = vi.fn(() => chain) })
  chain['then'] = vi.fn((cb: (v: unknown) => unknown) => Promise.resolve(cb(returnValue)))
  return chain
}

beforeEach(() => vi.clearAllMocks())

describe('createEvent', () => {
  it('inserts event and returns data', async () => {
    const mockEvent = { id: 'evt-1', name: 'Test', start_time: '2026-03-16T07:00:00+07:00', timezone: 'Asia/Bangkok' }
    const chain = mockChain({ data: mockEvent, error: null })
    vi.mocked(supabase.from).mockReturnValue(chain as unknown as ReturnType<typeof supabase.from>)
    const result = await createEvent({ name: 'Test', start_time: '2026-03-16T07:00:00+07:00', timezone: 'Asia/Bangkok' })
    expect(result).toEqual(mockEvent)
  })
})

describe('getEvent', () => {
  it('returns event by id', async () => {
    const mockEvent = { id: 'evt-1', name: 'Test', start_time: '2026-03-16T07:00:00+07:00', timezone: 'Asia/Bangkok' }
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
