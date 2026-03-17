// __tests__/capture-screen.test.tsx
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import CaptureScreen from '@/components/CaptureScreen'
import * as speech from '@/lib/speech'
import * as storage from '@/lib/storage'
import type { Event, EventDistance, Athlete } from '@/types'

const event: Event = {
  id: 'evt-1',
  name: 'Test Race',
  timezone: 'Asia/Bangkok',
  overall_lockout: false,
  created_at: '2026-03-17T00:00:00Z',
}

const distanceSingle: EventDistance[] = [
  {
    id: 'dist-1',
    event_id: 'evt-1',
    name: 'Marathon',
    start_time: '2026-03-17T03:00:00.000Z',
    overall_top_n: 3,
    default_top_n: 3,
  },
]

const distanceMultiple: EventDistance[] = [
  {
    id: 'dist-1',
    event_id: 'evt-1',
    name: 'Marathon',
    start_time: '2026-03-17T03:00:00.000Z',
    overall_top_n: 3,
    default_top_n: 3,
  },
  {
    id: 'dist-2',
    event_id: 'evt-1',
    name: 'Half Marathon',
    start_time: '2026-03-17T04:00:00.000Z',
    overall_top_n: 3,
    default_top_n: 3,
  },
]

const athletes: Athlete[] = []

let capturedOnResult: ((r: speech.SpeechResult) => void) | null = null

vi.mock('@/lib/speech', () => ({
  startSpeechRecognition: vi.fn((_lang: string, onResult: (r: speech.SpeechResult) => void, _onError: (e: string) => void) => {
    capturedOnResult = onResult
    return () => {}
  }),
}))

vi.mock('@/lib/storage', () => ({
  getPendingRecords: vi.fn(() => []),
  addPendingRecord: vi.fn(),
  removePendingRecord: vi.fn(),
  removeRecordByBib: vi.fn(),
}))

vi.mock('@/lib/sync', () => ({
  syncPendingRecords: vi.fn(),
}))

beforeEach(() => {
  capturedOnResult = null
  vi.mocked(storage.getPendingRecords).mockReturnValue([])
  vi.mocked(storage.addPendingRecord).mockClear()
  localStorage.clear()
})

describe('CaptureScreen v2', () => {
  it('renders mic button in idle state', () => {
    render(<CaptureScreen event={event} distances={[]} athletes={athletes} />)
    expect(screen.getByText('กดพูดเลขบิบ')).toBeInTheDocument()
  })

  it('starts listening when mic button toggled', () => {
    render(<CaptureScreen event={event} distances={[]} athletes={athletes} />)
    fireEvent.pointerDown(screen.getByRole('button', { name: /กดพูดเลขบิบ/ }))
    expect(screen.getByText('กำลังฟัง...')).toBeInTheDocument()
  })

  it('auto-saves bib and shows success toast on speech result', async () => {
    render(<CaptureScreen event={event} distances={[]} athletes={athletes} />)
    fireEvent.pointerDown(screen.getByRole('button', { name: /กดพูดเลขบิบ/ }))
    act(() => {
      capturedOnResult?.({ transcript: 'สองสามห้า', bib: '235', capturedAt: '2026-03-17T03:42:05.000Z' })
    })
    await waitFor(() => expect(screen.getByText(/บิบ 235/)).toBeInTheDocument())
    expect(storage.addPendingRecord).toHaveBeenCalledOnce()
  })

  it('shows duplicate toast when same bib spoken twice', async () => {
    vi.mocked(storage.getPendingRecords).mockReturnValue([
      { local_id: 'lid-1', event_id: 'evt-1', bib_number: '235', finish_time: '2026-03-17T03:42:05.000Z', synced: false }
    ])
    render(<CaptureScreen event={event} distances={[]} athletes={athletes} />)
    fireEvent.pointerDown(screen.getByRole('button', { name: /กดพูดเลขบิบ/ }))
    act(() => {
      capturedOnResult?.({ transcript: 'สองสามห้า', bib: '235', capturedAt: '2026-03-17T03:42:10.000Z' })
    })
    await waitFor(() => expect(screen.getByText(/235 ซ้ำ/)).toBeInTheDocument())
    expect(storage.addPendingRecord).not.toHaveBeenCalled()
  })

  it('stops listening when mic button toggled again', () => {
    render(<CaptureScreen event={event} distances={[]} athletes={athletes} />)
    const btn = screen.getByRole('button', { name: /กดพูดเลขบิบ/ })
    fireEvent.pointerDown(btn)
    expect(screen.getByText('กำลังฟัง...')).toBeInTheDocument()
    fireEvent.pointerDown(screen.getByRole('button', { name: /กำลังฟัง/ }))
    expect(screen.getByText('กดพูดเลขบิบ')).toBeInTheDocument()
  })

  it('ignores garbled speech (no bib) and continues listening', async () => {
    render(<CaptureScreen event={event} distances={[]} athletes={athletes} />)
    fireEvent.pointerDown(screen.getByRole('button', { name: /กดพูดเลขบิบ/ }))
    act(() => {
      capturedOnResult?.({ transcript: 'อะไรก็ไม่รู้', bib: null, capturedAt: '2026-03-17T03:42:05.000Z' })
    })
    expect(storage.addPendingRecord).not.toHaveBeenCalled()
    expect(screen.getByText('กำลังฟัง...')).toBeInTheDocument()
  })

  it('saves bib with different number after อ่านใหม่ — clears overwriteBib', async () => {
    vi.mocked(storage.getPendingRecords).mockReturnValue([
      { local_id: 'lid-1', event_id: 'evt-1', bib_number: '235', finish_time: '2026-03-17T03:42:05.000Z', synced: false }
    ])
    render(<CaptureScreen event={event} distances={[]} athletes={athletes} />)
    fireEvent.pointerDown(screen.getByRole('button', { name: /กดพูดเลขบิบ/ }))
    // Trigger duplicate for 235
    act(() => {
      capturedOnResult?.({ transcript: 'สองสามห้า', bib: '235', capturedAt: '2026-03-17T03:42:10.000Z' })
    })
    await waitFor(() => expect(screen.getByText(/235 ซ้ำ/)).toBeInTheDocument())
    // Tap อ่านใหม่ — sets overwriteBib='235'
    vi.mocked(storage.getPendingRecords).mockReturnValue([])
    fireEvent.click(screen.getByText('อ่านใหม่'))
    // User speaks a DIFFERENT bib (100) — should be saved normally, not force-overwrite
    act(() => {
      capturedOnResult?.({ transcript: 'หนึ่งศูนย์ศูนย์', bib: '100', capturedAt: '2026-03-17T03:42:15.000Z' })
    })
    await waitFor(() => expect(screen.getByText(/บิบ 100/)).toBeInTheDocument())
    expect(storage.addPendingRecord).toHaveBeenCalledOnce()
  })

  it('duplicate toast dismissal (ข้าม) does not stop listening', async () => {
    vi.mocked(storage.getPendingRecords).mockReturnValue([
      { local_id: 'lid-1', event_id: 'evt-1', bib_number: '235', finish_time: '2026-03-17T03:42:05.000Z', synced: false }
    ])
    render(<CaptureScreen event={event} distances={[]} athletes={athletes} />)
    fireEvent.pointerDown(screen.getByRole('button', { name: /กดพูดเลขบิบ/ }))
    act(() => {
      capturedOnResult?.({ transcript: 'สองสามห้า', bib: '235', capturedAt: '2026-03-17T03:42:10.000Z' })
    })
    await waitFor(() => expect(screen.getByText(/235 ซ้ำ/)).toBeInTheDocument())
    fireEvent.click(screen.getByText('ข้าม'))
    // Still listening
    expect(screen.getByText('กำลังฟัง...')).toBeInTheDocument()
  })
})

describe('CaptureScreen distance display', () => {
  it('zero distances: renders no ปล่อยตัว label and no time', () => {
    render(<CaptureScreen event={event} distances={[]} athletes={athletes} />)
    expect(screen.queryByText('ปล่อยตัว')).not.toBeInTheDocument()
    expect(screen.queryByText('10:00:00')).not.toBeInTheDocument()
  })

  it('single distance: renders ปล่อยตัว label and the distance start time', () => {
    render(<CaptureScreen event={event} distances={distanceSingle} athletes={athletes} />)
    expect(screen.getByText('ปล่อยตัว')).toBeInTheDocument()
    // 2026-03-17T03:00:00.000Z in Asia/Bangkok (UTC+7) = 10:00:00
    expect(screen.getByText('10:00:00')).toBeInTheDocument()
  })

  it('multiple distances: renders each distance name and time, no ปล่อยตัว label', () => {
    render(<CaptureScreen event={event} distances={distanceMultiple} athletes={athletes} />)
    expect(screen.queryByText('ปล่อยตัว')).not.toBeInTheDocument()
    expect(screen.getByText('Marathon')).toBeInTheDocument()
    expect(screen.getByText('Half Marathon')).toBeInTheDocument()
    // Marathon: 03:00 UTC = 10:00:00 Bangkok; Half Marathon: 04:00 UTC = 11:00:00 Bangkok
    expect(screen.getByText('10:00:00')).toBeInTheDocument()
    expect(screen.getByText('11:00:00')).toBeInTheDocument()
  })
})
