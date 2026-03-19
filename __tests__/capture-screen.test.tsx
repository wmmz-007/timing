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
  password: '',
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
let capturedOnError: ((e: string) => void) | null = null

vi.mock('@/lib/speech', () => ({
  startSpeechRecognition: vi.fn(
    (_lang: string, _capturedAt: string, onResult: (r: speech.SpeechResult) => void, onError: (e: string) => void) => {
      capturedOnResult = onResult
      capturedOnError = onError
      return () => {}
    }
  ),
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

// Mock window.SpeechRecognition for pre-warm tests
let mockPrewarm: { lang: string; interimResults: boolean; onerror: (() => void) | null; onend: (() => void) | null; start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> } | null = null

beforeEach(() => {
  capturedOnResult = null
  capturedOnError = null
  vi.mocked(storage.getPendingRecords).mockReturnValue([])
  vi.mocked(storage.addPendingRecord).mockClear()
  localStorage.clear()

  mockPrewarm = { lang: '', interimResults: false, onerror: null, onend: null, start: vi.fn(), stop: vi.fn() }
  const MockSpeechRecognition = vi.fn(function() {
    // First call returns the tracked mockPrewarm; subsequent calls return fresh instances
    if ((MockSpeechRecognition as any).mock.calls.length === 1) return mockPrewarm
    return { lang: '', interimResults: false, onerror: null, onend: null, start: vi.fn(), stop: vi.fn() }
  })
  ;(window as any).SpeechRecognition = MockSpeechRecognition
})

afterEach(() => {
  delete (window as any).SpeechRecognition
})

describe('CaptureScreen v2', () => {
  it('renders mic button in idle state', () => {
    render(<CaptureScreen event={event} distances={[]} athletes={athletes} />)
    expect(screen.getByText('Hold to Record Bib')).toBeInTheDocument()
  })

  it('starts listening when mic button pressed down', () => {
    render(<CaptureScreen event={event} distances={[]} athletes={athletes} />)
    fireEvent.pointerDown(screen.getByRole('button', { name: /Hold to Record Bib/ }))
    expect(screen.getByText('Listening...')).toBeInTheDocument()
  })

  it('stops listening when mic button released (pointerUp)', () => {
    render(<CaptureScreen event={event} distances={[]} athletes={athletes} />)
    const btn = screen.getByRole('button', { name: /Hold to Record Bib/ })
    fireEvent.pointerDown(btn)
    expect(screen.getByText('Listening...')).toBeInTheDocument()
    fireEvent.pointerUp(btn)
    expect(screen.getByText('Hold to Record Bib')).toBeInTheDocument()
  })

  it('auto-saves bib and shows success toast on speech result', async () => {
    render(<CaptureScreen event={event} distances={[]} athletes={athletes} />)
    fireEvent.pointerDown(screen.getByRole('button', { name: /Hold to Record Bib/ }))
    act(() => {
      capturedOnResult?.({ transcript: 'สองสามห้า', bib: '235', capturedAt: '2026-03-17T03:42:05.000Z' })
    })
    await waitFor(() => expect(screen.getByText(/Bib 235/)).toBeInTheDocument())
    expect(storage.addPendingRecord).toHaveBeenCalledOnce()
  })

  it('shows duplicate toast when same bib spoken twice', async () => {
    vi.mocked(storage.getPendingRecords).mockReturnValue([
      { local_id: 'lid-1', event_id: 'evt-1', bib_number: '235', finish_time: '2026-03-17T03:42:05.000Z', synced: false }
    ])
    render(<CaptureScreen event={event} distances={[]} athletes={athletes} />)
    fireEvent.pointerDown(screen.getByRole('button', { name: /Hold to Record Bib/ }))
    act(() => {
      capturedOnResult?.({ transcript: 'สองสามห้า', bib: '235', capturedAt: '2026-03-17T03:42:10.000Z' })
    })
    await waitFor(() => expect(screen.getByText(/235 duplicate/)).toBeInTheDocument())
    expect(storage.addPendingRecord).not.toHaveBeenCalled()
  })

  it('ignores garbled speech (no bib) and stops listening', async () => {
    render(<CaptureScreen event={event} distances={[]} athletes={athletes} />)
    fireEvent.pointerDown(screen.getByRole('button', { name: /Hold to Record Bib/ }))
    act(() => {
      capturedOnError?.('')  // onend fires when no bib found → onError('')
    })
    expect(storage.addPendingRecord).not.toHaveBeenCalled()
    expect(screen.getByText('Hold to Record Bib')).toBeInTheDocument()
  })

  it('saves bib with different number after Overwrite — clears overwriteBib', async () => {
    vi.mocked(storage.getPendingRecords).mockReturnValue([
      { local_id: 'lid-1', event_id: 'evt-1', bib_number: '235', finish_time: '2026-03-17T03:42:05.000Z', synced: false }
    ])
    render(<CaptureScreen event={event} distances={[]} athletes={athletes} />)
    fireEvent.pointerDown(screen.getByRole('button', { name: /Hold to Record Bib/ }))
    act(() => {
      capturedOnResult?.({ transcript: 'สองสามห้า', bib: '235', capturedAt: '2026-03-17T03:42:10.000Z' })
    })
    await waitFor(() => expect(screen.getByText(/235 duplicate/)).toBeInTheDocument())
    vi.mocked(storage.getPendingRecords).mockReturnValue([])
    fireEvent.click(screen.getByText('Overwrite'))
    act(() => {
      capturedOnResult?.({ transcript: 'หนึ่งศูนย์ศูนย์', bib: '100', capturedAt: '2026-03-17T03:42:15.000Z' })
    })
    await waitFor(() => expect(screen.getByText(/Bib 100/)).toBeInTheDocument())
    expect(storage.addPendingRecord).toHaveBeenCalledOnce()
  })

  it('duplicate toast dismissal (Skip) returns to idle state', async () => {
    vi.mocked(storage.getPendingRecords).mockReturnValue([
      { local_id: 'lid-1', event_id: 'evt-1', bib_number: '235', finish_time: '2026-03-17T03:42:05.000Z', synced: false }
    ])
    render(<CaptureScreen event={event} distances={[]} athletes={athletes} />)
    fireEvent.pointerDown(screen.getByRole('button', { name: /Hold to Record Bib/ }))
    act(() => {
      capturedOnResult?.({ transcript: 'สองสามห้า', bib: '235', capturedAt: '2026-03-17T03:42:10.000Z' })
    })
    await waitFor(() => expect(screen.getByText(/235 duplicate/)).toBeInTheDocument())
    fireEvent.click(screen.getByText('Skip'))
    // Session already ended when bib result fired; Skip just clears the toast
    expect(screen.getByText('Hold to Record Bib')).toBeInTheDocument()
  })

  it('starts pre-warm SpeechRecognition on mount', () => {
    render(<CaptureScreen event={event} distances={[]} athletes={athletes} />)
    expect((window as any).SpeechRecognition).toHaveBeenCalled()
    expect(mockPrewarm!.start).toHaveBeenCalled()
  })

  it('manual save while paused clears paused state — mic button becomes pressable again', async () => {
    vi.mocked(storage.getPendingRecords).mockReturnValue([
      { local_id: 'lid-1', event_id: 'evt-1', bib_number: '235', finish_time: '2026-03-17T03:42:05.000Z', synced: false }
    ])
    render(<CaptureScreen event={event} distances={[]} athletes={athletes} />)
    // Trigger duplicate (pauses mic)
    fireEvent.pointerDown(screen.getByRole('button', { name: /Hold to Record Bib/ }))
    act(() => {
      capturedOnResult?.({ transcript: '235', bib: '235', capturedAt: '2026-03-17T03:42:10.000Z' })
    })
    await waitFor(() => expect(screen.getByText(/235 duplicate/)).toBeInTheDocument())
    // Manual submit with a new bib while paused
    vi.mocked(storage.getPendingRecords).mockReturnValue([])
    fireEvent.click(screen.getByText('Enter Bib Manually'))
    fireEvent.click(screen.getByRole('button', { name: '9' }))
    fireEvent.click(screen.getByRole('button', { name: '9' }))
    fireEvent.click(screen.getByRole('button', { name: '9' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(storage.addPendingRecord).toHaveBeenCalled())
    // Mic button should be pressable again (paused cleared)
    fireEvent.pointerDown(screen.getByRole('button', { name: /Hold to Record Bib/ }))
    expect(screen.getByText('Listening...')).toBeInTheDocument()
  })

  it('starts pre-warm again after saving a bib', async () => {
    const MockSR = (window as any).SpeechRecognition as ReturnType<typeof vi.fn>
    render(<CaptureScreen event={event} distances={[]} athletes={athletes} />)
    const callCountAfterMount = MockSR.mock.calls.length
    // Save a bib
    fireEvent.pointerDown(screen.getByRole('button', { name: /Hold to Record Bib/ }))
    act(() => {
      capturedOnResult?.({ transcript: '235', bib: '235', capturedAt: '2026-03-17T03:42:05.000Z' })
    })
    await waitFor(() => expect(screen.getByText(/Bib 235/)).toBeInTheDocument())
    // Pre-warm should have been called again after save
    expect(MockSR.mock.calls.length).toBeGreaterThan(callCountAfterMount)
  })

  it('discards stale onResult from first session when second press starts before result arrives', async () => {
    render(<CaptureScreen event={event} distances={[]} athletes={athletes} />)
    const btn = screen.getByRole('button', { name: /Hold to Record Bib/ })
    // First press
    fireEvent.pointerDown(btn)
    const firstOnResult = capturedOnResult
    // Release before result
    fireEvent.pointerUp(btn)
    // Second press immediately
    fireEvent.pointerDown(btn)
    // First session's stale onResult fires
    act(() => {
      firstOnResult?.({ transcript: '235', bib: '235', capturedAt: '2026-03-17T03:42:05.000Z' })
    })
    // Should NOT have saved — stale callback discarded
    expect(storage.addPendingRecord).not.toHaveBeenCalled()
    expect(screen.getByText('Listening...')).toBeInTheDocument()
  })

  it('stops pre-warm before starting real recognition session', () => {
    render(<CaptureScreen event={event} distances={[]} athletes={athletes} />)
    // Pre-warm should be running after mount
    expect(mockPrewarm!.start).toHaveBeenCalled()
    // Press the mic button — should stop the pre-warm first
    fireEvent.pointerDown(screen.getByRole('button', { name: /Hold to Record Bib/ }))
    expect(mockPrewarm!.stop).toHaveBeenCalled()
  })
})

describe('CaptureScreen distance display', () => {
  it('zero distances: renders no Start label and no time', () => {
    render(<CaptureScreen event={event} distances={[]} athletes={athletes} />)
    expect(screen.queryByText('Start')).not.toBeInTheDocument()
    expect(screen.queryByText('10:00:00')).not.toBeInTheDocument()
  })

  it('single distance: renders Start label and the distance start time', () => {
    render(<CaptureScreen event={event} distances={distanceSingle} athletes={athletes} />)
    expect(screen.getByText('Start')).toBeInTheDocument()
    expect(screen.getByText('10:00:00')).toBeInTheDocument()
  })

  it('multiple distances: renders each distance name and time, no Start label', () => {
    render(<CaptureScreen event={event} distances={distanceMultiple} athletes={athletes} />)
    expect(screen.queryByText('Start')).not.toBeInTheDocument()
    expect(screen.getByText('Marathon')).toBeInTheDocument()
    expect(screen.getByText('Half Marathon')).toBeInTheDocument()
    expect(screen.getByText('10:00:00')).toBeInTheDocument()
    expect(screen.getByText('11:00:00')).toBeInTheDocument()
  })
})
