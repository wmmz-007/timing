import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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

const distanceSingle: EventDistance[] = [{
  id: 'dist-1', event_id: 'evt-1', name: 'Marathon',
  start_time: '2026-03-17T03:00:00.000Z', overall_top_n: 3, default_top_n: 3,
}]

const distanceMultiple: EventDistance[] = [
  { id: 'dist-1', event_id: 'evt-1', name: 'Marathon',    start_time: '2026-03-17T03:00:00.000Z', overall_top_n: 3, default_top_n: 3 },
  { id: 'dist-2', event_id: 'evt-1', name: 'Half Marathon', start_time: '2026-03-17T04:00:00.000Z', overall_top_n: 3, default_top_n: 3 },
]

const athletes: Athlete[] = []

let capturedOnInterim: ((transcript: string, bib: string | null) => void) | null = null
let capturedOnError: ((e: string) => void) | null = null

vi.mock('@/lib/speech', () => ({
  startSpeechRecognition: vi.fn(
    (_lang: string, onInterim: (t: string, b: string | null) => void, onError: (e: string) => void) => {
      capturedOnInterim = onInterim
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

let mockPrewarm: {
  lang: string; interimResults: boolean
  onerror: (() => void) | null; onend: (() => void) | null
  start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>
} | null = null

beforeEach(() => {
  capturedOnInterim = null
  capturedOnError = null
  vi.mocked(storage.getPendingRecords).mockReturnValue([])
  vi.mocked(storage.addPendingRecord).mockClear()
  vi.mocked(storage.removeRecordByBib).mockClear()
  vi.mocked(storage.removePendingRecord).mockClear()
  vi.mocked(speech.startSpeechRecognition).mockClear()
  localStorage.clear()

  mockPrewarm = {
    lang: '', interimResults: false,
    onerror: null, onend: null,
    start: vi.fn(), stop: vi.fn(),
  }
  const MockSpeechRecognition = vi.fn(function () {
    if ((MockSpeechRecognition as any).mock.calls.length === 1) return mockPrewarm
    return { lang: '', interimResults: false, onerror: null, onend: null, start: vi.fn(), stop: vi.fn() }
  })
  ;(window as any).SpeechRecognition = MockSpeechRecognition
})

afterEach(() => {
  delete (window as any).SpeechRecognition
})

describe('CaptureScreen toggle mic', () => {
  it('renders mic button in idle state', () => {
    render(<CaptureScreen event={event} distances={[]} athletes={athletes} />)
    expect(screen.getByText('กดเปิดไมค์')).toBeInTheDocument()
  })

  it('opens mic on button click', async () => {
    render(<CaptureScreen event={event} distances={[]} athletes={athletes} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /กดเปิดไมค์/i })) })
    expect(screen.getByText('กดปิดไมค์')).toBeInTheDocument()
  })

  it('closes mic on second button click', async () => {
    render(<CaptureScreen event={event} distances={[]} athletes={athletes} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /กดเปิดไมค์/i })) })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /กดปิดไมค์/i })) })
    expect(screen.getByText('กดเปิดไมค์')).toBeInTheDocument()
  })

  it('opens mic on Space keydown', async () => {
    render(<CaptureScreen event={event} distances={[]} athletes={athletes} />)
    await act(async () => { fireEvent.keyDown(window, { code: 'Space' }) })
    expect(screen.getByText('กดปิดไมค์')).toBeInTheDocument()
  })

  it('closes mic on second Space keydown', async () => {
    render(<CaptureScreen event={event} distances={[]} athletes={athletes} />)
    await act(async () => { fireEvent.keyDown(window, { code: 'Space' }) })
    await act(async () => { fireEvent.keyDown(window, { code: 'Space' }) })
    expect(screen.getByText('กดเปิดไมค์')).toBeInTheDocument()
  })

  it('does not open mic when paused', async () => {
    vi.mocked(storage.getPendingRecords).mockReturnValue([
      { local_id: 'lid-1', event_id: 'evt-1', bib_number: '321', finish_time: '2026-03-17T03:42:00Z', synced: false }
    ])
    render(<CaptureScreen event={event} distances={[]} athletes={athletes} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /กดเปิดไมค์/i })) })
    await act(async () => { capturedOnInterim?.('321', '321') })
    await act(async () => { fireEvent.keyDown(window, { code: 'Enter' }) })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /กดเปิดไมค์/i })) })
    expect(screen.getByText('กดเปิดไมค์')).toBeInTheDocument()
  })

  it('stops pre-warm before starting real recognition session', () => {
    render(<CaptureScreen event={event} distances={[]} athletes={athletes} />)
    expect(mockPrewarm!.start).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /กดเปิดไมค์/i }))
    expect(mockPrewarm!.stop).toHaveBeenCalled()
  })

  it('starts pre-warm SpeechRecognition on mount', () => {
    render(<CaptureScreen event={event} distances={[]} athletes={athletes} />)
    expect((window as any).SpeechRecognition).toHaveBeenCalled()
    expect(mockPrewarm!.start).toHaveBeenCalled()
  })
})

describe('CaptureScreen interim bib candidate', () => {
  it('shows candidate bib box when mic is open', async () => {
    render(<CaptureScreen event={event} distances={[]} athletes={athletes} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /กดเปิดไมค์/i })) })
    expect(screen.getByTestId('bib-candidate-box')).toBeInTheDocument()
  })

  it('shows dash when mic is open but no bib detected', async () => {
    render(<CaptureScreen event={event} distances={[]} athletes={athletes} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /กดเปิดไมค์/i })) })
    expect(screen.getByTestId('bib-candidate-box')).toHaveTextContent('—')
  })

  it('shows bib when interim bib detected', async () => {
    render(<CaptureScreen event={event} distances={[]} athletes={athletes} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /กดเปิดไมค์/i })) })
    await act(async () => { capturedOnInterim?.('321', '321') })
    expect(screen.getByTestId('bib-candidate-box')).toHaveTextContent('321')
  })

  it('updates bib as interim speech continues', async () => {
    render(<CaptureScreen event={event} distances={[]} athletes={athletes} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /กดเปิดไมค์/i })) })
    await act(async () => { capturedOnInterim?.('3', '3') })
    await act(async () => { capturedOnInterim?.('32', '32') })
    await act(async () => { capturedOnInterim?.('321', '321') })
    expect(screen.getByTestId('bib-candidate-box')).toHaveTextContent('321')
  })

  it('null-bib frame does not clear existing candidate', async () => {
    render(<CaptureScreen event={event} distances={[]} athletes={athletes} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /กดเปิดไมค์/i })) })
    await act(async () => { capturedOnInterim?.('321', '321') })
    await act(async () => { capturedOnInterim?.('สวัสดี', null) })
    expect(screen.getByTestId('bib-candidate-box')).toHaveTextContent('321')
  })

  it('candidate box not rendered when mic is closed', () => {
    render(<CaptureScreen event={event} distances={[]} athletes={athletes} />)
    expect(screen.queryByTestId('bib-candidate-box')).not.toBeInTheDocument()
  })

  it('session restart preserves pending bib candidate', async () => {
    render(<CaptureScreen event={event} distances={[]} athletes={athletes} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /กดเปิดไมค์/i })) })
    await act(async () => { capturedOnInterim?.('321', '321') })
    act(() => { capturedOnError?.('') })
    expect(screen.getByTestId('bib-candidate-box')).toHaveTextContent('321')
  })
})

describe('CaptureScreen Enter to confirm', () => {
  it('saves bib on Enter after detection', async () => {
    render(<CaptureScreen event={event} distances={[]} athletes={athletes} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /กดเปิดไมค์/i })) })
    await act(async () => { capturedOnInterim?.('321', '321') })
    await act(async () => { fireEvent.keyDown(window, { code: 'Enter' }) })
    expect(storage.addPendingRecord).toHaveBeenCalledWith(
      expect.objectContaining({ bib_number: '321', event_id: 'evt-1' })
    )
  })

  it('shows success toast after confirm', async () => {
    render(<CaptureScreen event={event} distances={[]} athletes={athletes} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /กดเปิดไมค์/i })) })
    await act(async () => { capturedOnInterim?.('235', '235') })
    await act(async () => { fireEvent.keyDown(window, { code: 'Enter' }) })
    await waitFor(() => expect(screen.getByText(/Bib 235/)).toBeInTheDocument())
  })

  it('Enter is a no-op when no candidate', async () => {
    render(<CaptureScreen event={event} distances={[]} athletes={athletes} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /กดเปิดไมค์/i })) })
    await act(async () => { fireEvent.keyDown(window, { code: 'Enter' }) })
    expect(storage.addPendingRecord).not.toHaveBeenCalled()
  })

  it('ignores repeated Enter keydown to avoid duplicate saves', async () => {
    render(<CaptureScreen event={event} distances={[]} athletes={athletes} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /กดเปิดไมค์/i })) })
    await act(async () => { capturedOnInterim?.('321', '321') })
    await act(async () => { fireEvent.keyDown(window, { code: 'Enter', repeat: true }) })
    expect(storage.addPendingRecord).not.toHaveBeenCalled()
    await act(async () => { fireEvent.keyDown(window, { code: 'Enter' }) })
    expect(storage.addPendingRecord).toHaveBeenCalledTimes(1)
  })

  it('mic stays open after confirm', async () => {
    render(<CaptureScreen event={event} distances={[]} athletes={athletes} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /กดเปิดไมค์/i })) })
    await act(async () => { capturedOnInterim?.('321', '321') })
    await act(async () => { fireEvent.keyDown(window, { code: 'Enter' }) })
    expect(screen.getByText('กดปิดไมค์')).toBeInTheDocument()
  })

  it('bib candidate resets to dash after confirm', async () => {
    render(<CaptureScreen event={event} distances={[]} athletes={athletes} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /กดเปิดไมค์/i })) })
    await act(async () => { capturedOnInterim?.('321', '321') })
    await act(async () => { fireEvent.keyDown(window, { code: 'Enter' }) })
    expect(screen.getByTestId('bib-candidate-box')).toHaveTextContent('—')
  })

  it('shows duplicate toast when same bib confirmed twice', async () => {
    vi.mocked(storage.getPendingRecords).mockReturnValue([
      { local_id: 'lid-1', event_id: 'evt-1', bib_number: '235', finish_time: '2026-03-17T03:42:05.000Z', synced: false }
    ])
    render(<CaptureScreen event={event} distances={[]} athletes={athletes} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /กดเปิดไมค์/i })) })
    await act(async () => { capturedOnInterim?.('235', '235') })
    await act(async () => { fireEvent.keyDown(window, { code: 'Enter' }) })
    await waitFor(() => expect(screen.getByText(/235 duplicate/)).toBeInTheDocument())
    expect(storage.addPendingRecord).not.toHaveBeenCalled()
  })

  it('starts pre-warm again after saving a bib', async () => {
    const MockSR = (window as any).SpeechRecognition as ReturnType<typeof vi.fn>
    render(<CaptureScreen event={event} distances={[]} athletes={athletes} />)
    const callCountAfterMount = MockSR.mock.calls.length
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /กดเปิดไมค์/i })) })
    await act(async () => { capturedOnInterim?.('235', '235') })
    await act(async () => { fireEvent.keyDown(window, { code: 'Enter' }) })
    await waitFor(() => expect(screen.getByText(/Bib 235/)).toBeInTheDocument())
    expect(MockSR.mock.calls.length).toBeGreaterThan(callCountAfterMount)
  })
})

describe('CaptureScreen session restart', () => {
  it('stays listening when session ends while mic is open (restarts)', async () => {
    render(<CaptureScreen event={event} distances={[]} athletes={athletes} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /กดเปิดไมค์/i })) })
    act(() => { capturedOnError?.('') })
    expect(screen.getByText('กดปิดไมค์')).toBeInTheDocument()
  })

  it('restarts on real error while mic is open', async () => {
    render(<CaptureScreen event={event} distances={[]} athletes={athletes} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /กดเปิดไมค์/i })) })
    act(() => { capturedOnError?.('no-speech') })
    expect(screen.getByText('กดปิดไมค์')).toBeInTheDocument()
  })

  it('discards stale interim callback after session gen changes', async () => {
    render(<CaptureScreen event={event} distances={[]} athletes={athletes} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /กดเปิดไมค์/i })) })
    const staleOnInterim = capturedOnInterim
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /กดปิดไมค์/i })) })
    act(() => { staleOnInterim?.('321', '321') })
    expect(storage.addPendingRecord).not.toHaveBeenCalled()
    expect(screen.queryByTestId('bib-candidate-box')).not.toBeInTheDocument()
  })

  it('ignores repeated Space keydown to avoid immediate re-toggle', async () => {
    render(<CaptureScreen event={event} distances={[]} athletes={athletes} />)
    await act(async () => { fireEvent.keyDown(window, { code: 'Space' }) })
    expect(screen.getByText('กดปิดไมค์')).toBeInTheDocument()
    await act(async () => { fireEvent.keyDown(window, { code: 'Space', repeat: true }) })
    expect(screen.getByText('กดปิดไมค์')).toBeInTheDocument()
  })
})

describe('CaptureScreen duplicate and overwrite', () => {
  it('overwrite: clicking Overwrite does not start a new listening session', async () => {
    vi.mocked(storage.getPendingRecords).mockReturnValue([
      { local_id: 'lid-1', event_id: 'evt-1', bib_number: '235', finish_time: '2026-03-17T03:42:05.000Z', synced: false }
    ])
    render(<CaptureScreen event={event} distances={[]} athletes={athletes} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /กดเปิดไมค์/i })) })
    await act(async () => { capturedOnInterim?.('235', '235') })
    await act(async () => { fireEvent.keyDown(window, { code: 'Enter' }) })
    await waitFor(() => screen.getByText(/235 duplicate/))
    const callsBefore = vi.mocked(speech.startSpeechRecognition).mock.calls.length
    await act(async () => { fireEvent.click(screen.getByText('Overwrite')) })
    expect(vi.mocked(speech.startSpeechRecognition).mock.calls.length).toBe(callsBefore)
  })

  it('overwrite: speaking bib again after Overwrite force-saves', async () => {
    vi.mocked(storage.getPendingRecords).mockReturnValue([
      { local_id: 'lid-1', event_id: 'evt-1', bib_number: '235', finish_time: '2026-03-17T03:42:05.000Z', synced: false }
    ])
    render(<CaptureScreen event={event} distances={[]} athletes={athletes} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /กดเปิดไมค์/i })) })
    await act(async () => { capturedOnInterim?.('235', '235') })
    await act(async () => { fireEvent.keyDown(window, { code: 'Enter' }) })
    await waitFor(() => screen.getByText(/235 duplicate/))
    vi.mocked(storage.getPendingRecords).mockReturnValue([])
    await act(async () => { fireEvent.click(screen.getByText('Overwrite')) })
    await act(async () => { capturedOnInterim?.('235', '235') })
    await act(async () => { fireEvent.keyDown(window, { code: 'Enter' }) })
    await waitFor(() => expect(screen.getByText(/Bib 235/)).toBeInTheDocument())
    expect(storage.removeRecordByBib).toHaveBeenCalledWith('evt-1', '235')
    expect(storage.addPendingRecord).toHaveBeenCalledOnce()
  })

  it('Skip clears paused state and mic resumes', async () => {
    vi.mocked(storage.getPendingRecords).mockReturnValue([
      { local_id: 'lid-1', event_id: 'evt-1', bib_number: '235', finish_time: '2026-03-17T03:42:05.000Z', synced: false }
    ])
    render(<CaptureScreen event={event} distances={[]} athletes={athletes} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /กดเปิดไมค์/i })) })
    await act(async () => { capturedOnInterim?.('235', '235') })
    await act(async () => { fireEvent.keyDown(window, { code: 'Enter' }) })
    await waitFor(() => screen.getByText(/235 duplicate/))
    await act(async () => { fireEvent.click(screen.getByText('Skip')) })
    expect(screen.getByTestId('bib-candidate-box')).toBeInTheDocument()
  })

  it('manual save while paused clears paused state', async () => {
    vi.mocked(storage.getPendingRecords).mockReturnValue([
      { local_id: 'lid-1', event_id: 'evt-1', bib_number: '235', finish_time: '2026-03-17T03:42:05.000Z', synced: false }
    ])
    render(<CaptureScreen event={event} distances={[]} athletes={athletes} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /กดเปิดไมค์/i })) })
    await act(async () => { capturedOnInterim?.('235', '235') })
    await act(async () => { fireEvent.keyDown(window, { code: 'Enter' }) })
    await waitFor(() => screen.getByText(/235 duplicate/))
    vi.mocked(storage.getPendingRecords).mockReturnValue([])
    fireEvent.click(screen.getByText('Enter Bib Manually'))
    fireEvent.click(screen.getByRole('button', { name: '9' }))
    fireEvent.click(screen.getByRole('button', { name: '9' }))
    fireEvent.click(screen.getByRole('button', { name: '9' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(storage.addPendingRecord).toHaveBeenCalled())
    expect(screen.getByTestId('bib-candidate-box')).toBeInTheDocument()
  })
})

describe('CaptureScreen distance display', () => {
  it('zero distances: renders no Start label and no time', () => {
    render(<CaptureScreen event={event} distances={[]} athletes={athletes} />)
    expect(screen.queryByText('Start')).not.toBeInTheDocument()
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
