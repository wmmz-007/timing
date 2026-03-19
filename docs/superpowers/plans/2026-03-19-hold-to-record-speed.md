# Hold-to-Record Speed Improvement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce hold-to-record latency by capturing timestamp at press time, using interim speech results for immediate bib detection, and pre-warming the mic after each save.

**Architecture:** Three layered changes: (1) `lib/speech.ts` gets a new `capturedAt` parameter and interim results support; (2) `MicButton` switches from toggle to hold UX (onPressStart/onPressEnd); (3) `CaptureScreen` captures timestamp at press, passes it to speech, and pre-warms the mic after each save using a direct `SpeechRecognition` instance.

**Tech Stack:** Next.js 15 App Router, TypeScript, Web Speech API, Vitest + @testing-library/react

---

## File Map

| File | Change |
|------|--------|
| `lib/speech.ts` | Add `capturedAt: string` param; `interimResults: true`; loop all results; `resultFired` guard; `onend → onError('')` |
| `components/MicButton.tsx` | Replace `onToggle` with `onPressStart` + `onPressEnd`; add pointerUp/Leave/Cancel handlers |
| `components/CaptureScreen.tsx` | Capture `capturedAt` at press; pass to speech; pre-warm on mount + after save; remove `runLoop` |
| `__tests__/speech.test.ts` | Add `startSpeechRecognition` tests (interim, capturedAt passthrough, resultFired, onend) |
| `__tests__/mic-button.test.tsx` | Replace `onToggle` tests with `onPressStart`/`onPressEnd` tests |
| `__tests__/capture-screen.test.tsx` | Update mock signature; fix "stop" test; add pre-warm test |

---

## Task 1: Update `lib/speech.ts` — new signature + interim results

**Files:**
- Modify: `lib/speech.ts`
- Test: `__tests__/speech.test.ts`

### Background

Current `startSpeechRecognition(lang, onResult, onError)`:
- Creates `capturedAt` internally when result fires (too late — should be at button press)
- `interimResults: false` — waits for final result (~2s extra)
- No `onend` handler — loop restart relies on `onError` which doesn't fire on silence

New signature: `startSpeechRecognition(lang, capturedAt, onResult, onError)`.

- [ ] **Step 1: Add `startSpeechRecognition` tests to `__tests__/speech.test.ts`**

Append this `describe` block after the existing `parseTranscriptToBib` tests:

```typescript
describe('startSpeechRecognition', () => {
  let mockRec: {
    lang: string
    interimResults: boolean
    maxAlternatives: number
    onresult: ((e: any) => void) | null
    onerror: ((e: any) => void) | null
    onend: (() => void) | null
    start: ReturnType<typeof vi.fn>
    stop: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    mockRec = {
      lang: '',
      interimResults: false,
      maxAlternatives: 1,
      onresult: null,
      onerror: null,
      onend: null,
      start: vi.fn(),
      stop: vi.fn(),
    }
    ;(globalThis as any).SpeechRecognition = vi.fn(() => mockRec)
  })

  afterEach(() => {
    delete (globalThis as any).SpeechRecognition
  })

  function makeResultEvent(transcript: string) {
    return {
      resultIndex: 0,
      results: [{ 0: { transcript, confidence: 1 }, length: 1, isFinal: false }],
    }
  }

  it('passes capturedAt param through to SpeechResult', () => {
    const onResult = vi.fn()
    startSpeechRecognition('th-TH', '2026-01-01T10:00:00.000Z', onResult, vi.fn())
    mockRec.onresult?.(makeResultEvent('235'))
    expect(onResult).toHaveBeenCalledWith(
      expect.objectContaining({ capturedAt: '2026-01-01T10:00:00.000Z' })
    )
  })

  it('fires onResult immediately on interim result with valid bib', () => {
    const onResult = vi.fn()
    startSpeechRecognition('th-TH', '2026-01-01T10:00:00.000Z', onResult, vi.fn())
    mockRec.onresult?.(makeResultEvent('235'))
    expect(onResult).toHaveBeenCalledOnce()
    expect(onResult).toHaveBeenCalledWith({
      transcript: '235',
      bib: '235',
      capturedAt: '2026-01-01T10:00:00.000Z',
    })
  })

  it('calls recognition.stop() immediately when bib found', () => {
    startSpeechRecognition('th-TH', '2026-01-01T10:00:00.000Z', vi.fn(), vi.fn())
    mockRec.onresult?.(makeResultEvent('235'))
    expect(mockRec.stop).toHaveBeenCalledOnce()
  })

  it('does not call onResult when transcript has no bib', () => {
    const onResult = vi.fn()
    startSpeechRecognition('th-TH', '2026-01-01T10:00:00.000Z', onResult, vi.fn())
    mockRec.onresult?.(makeResultEvent('สวัสดี'))
    expect(onResult).not.toHaveBeenCalled()
  })

  it('calls onError("") via onend when session ends without bib (loop restart)', () => {
    const onError = vi.fn()
    startSpeechRecognition('th-TH', '2026-01-01T10:00:00.000Z', vi.fn(), onError)
    mockRec.onend?.()
    expect(onError).toHaveBeenCalledWith('')
  })

  it('does NOT call onError via onend after successful bib capture (resultFired guard)', () => {
    const onError = vi.fn()
    startSpeechRecognition('th-TH', '2026-01-01T10:00:00.000Z', vi.fn(), onError)
    mockRec.onresult?.(makeResultEvent('235'))  // resultFired = true
    mockRec.onend?.()                           // fires after stop()
    expect(onError).not.toHaveBeenCalled()
  })

  it('calls onError with error string when recognition fails', () => {
    const onError = vi.fn()
    startSpeechRecognition('th-TH', '2026-01-01T10:00:00.000Z', vi.fn(), onError)
    mockRec.onerror?.({ error: 'no-speech' })
    expect(onError).toHaveBeenCalledWith('no-speech')
  })

  it('calls onError immediately when SpeechRecognition is not supported', () => {
    delete (globalThis as any).SpeechRecognition
    const onError = vi.fn()
    startSpeechRecognition('th-TH', '2026-01-01T10:00:00.000Z', vi.fn(), onError)
    expect(onError).toHaveBeenCalledWith('Web Speech API is not supported in this browser')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/wichita.pum/Desktop/entrepreneur/Timing
npx vitest run __tests__/speech.test.ts
```

Expected: 8 new tests FAIL (old 3-param signature used, no interimResults, no resultFired, no onend)

- [ ] **Step 3: Rewrite `startSpeechRecognition` in `lib/speech.ts`**

Replace lines 50–77 with:

```typescript
export function startSpeechRecognition(
  lang: string,
  capturedAt: string,
  onResult: (result: SpeechResult) => void,
  onError: (error: string) => void
): () => void {
  const SpeechRecognition =
    ((window as unknown) as { SpeechRecognition?: any; webkitSpeechRecognition?: any })
      .SpeechRecognition ||
    ((window as unknown) as { webkitSpeechRecognition?: any }).webkitSpeechRecognition

  if (!SpeechRecognition) {
    onError('Web Speech API is not supported in this browser')
    return () => {}
  }

  const recognition = new SpeechRecognition()
  recognition.lang = lang
  recognition.interimResults = true
  recognition.maxAlternatives = 1

  let resultFired = false

  recognition.onresult = (event: any) => {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript
      const bib = parseTranscriptToBib(transcript)
      if (bib) {
        resultFired = true
        recognition.stop()
        onResult({ transcript, bib, capturedAt })
        return
      }
    }
  }

  recognition.onerror = (event: any) => { onError(event.error) }

  recognition.onend = () => {
    if (!resultFired) onError('') // triggers loop restart; skipped if bib already saved
  }

  recognition.start()
  return () => recognition.stop()
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run __tests__/speech.test.ts
```

Expected: all 17 tests PASS (9 existing + 8 new)

- [ ] **Step 5: Commit**

```bash
git add lib/speech.ts __tests__/speech.test.ts
git commit -m "feat: update speech recognition — capturedAt param, interim results, resultFired guard"
```

---

## Task 2: Update `components/MicButton.tsx` — hold UX

**Files:**
- Modify: `components/MicButton.tsx`
- Test: `__tests__/mic-button.test.tsx`

### Background

Current `MicButton` has `onToggle` called on `onPointerDown`. Spec requires:
- `onPressStart` on `onPointerDown`
- `onPressEnd` on `onPointerUp`, `onPointerLeave`, `onPointerCancel`
- `disabled` still prevents both callbacks

- [ ] **Step 1: Replace `__tests__/mic-button.test.tsx` content**

```typescript
import { render, screen, fireEvent } from '@testing-library/react'
import MicButton from '@/components/MicButton'

describe('MicButton', () => {
  it('renders idle state when listening=false', () => {
    render(<MicButton listening={false} onPressStart={() => {}} onPressEnd={() => {}} />)
    expect(screen.getByRole('button')).toHaveTextContent('Hold to Record Bib')
  })

  it('renders listening state when listening=true', () => {
    render(<MicButton listening={true} onPressStart={() => {}} onPressEnd={() => {}} />)
    expect(screen.getByRole('button')).toHaveTextContent('Listening...')
  })

  it('calls onPressStart on pointerDown', () => {
    const onPressStart = vi.fn()
    render(<MicButton listening={false} onPressStart={onPressStart} onPressEnd={() => {}} />)
    fireEvent.pointerDown(screen.getByRole('button'))
    expect(onPressStart).toHaveBeenCalledOnce()
  })

  it('calls onPressEnd on pointerUp', () => {
    const onPressEnd = vi.fn()
    render(<MicButton listening={true} onPressStart={() => {}} onPressEnd={onPressEnd} />)
    fireEvent.pointerUp(screen.getByRole('button'))
    expect(onPressEnd).toHaveBeenCalledOnce()
  })

  it('calls onPressEnd on pointerLeave', () => {
    const onPressEnd = vi.fn()
    render(<MicButton listening={true} onPressStart={() => {}} onPressEnd={onPressEnd} />)
    fireEvent.pointerLeave(screen.getByRole('button'))
    expect(onPressEnd).toHaveBeenCalledOnce()
  })

  it('calls onPressEnd on pointerCancel', () => {
    const onPressEnd = vi.fn()
    render(<MicButton listening={true} onPressStart={() => {}} onPressEnd={onPressEnd} />)
    fireEvent.pointerCancel(screen.getByRole('button'))
    expect(onPressEnd).toHaveBeenCalledOnce()
  })

  it('does not call onPressStart when disabled', () => {
    const onPressStart = vi.fn()
    render(<MicButton listening={false} onPressStart={onPressStart} onPressEnd={() => {}} disabled />)
    fireEvent.pointerDown(screen.getByRole('button'))
    expect(onPressStart).not.toHaveBeenCalled()
  })

  it('does not call onPressEnd when disabled', () => {
    const onPressEnd = vi.fn()
    render(<MicButton listening={false} onPressStart={() => {}} onPressEnd={onPressEnd} disabled />)
    fireEvent.pointerUp(screen.getByRole('button'))
    expect(onPressEnd).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run __tests__/mic-button.test.tsx
```

Expected: FAIL — `onPressStart`/`onPressEnd` props don't exist yet

- [ ] **Step 3: Rewrite `components/MicButton.tsx`**

```typescript
'use client'
import { Mic } from 'lucide-react'

interface Props {
  listening: boolean
  onPressStart: () => void
  onPressEnd: () => void
  disabled?: boolean
}

export default function MicButton({ listening, onPressStart, onPressEnd, disabled }: Props) {
  return (
    <button
      onPointerDown={() => { if (!disabled) onPressStart() }}
      onPointerUp={() => { if (!disabled) onPressEnd() }}
      onPointerLeave={() => { if (!disabled) onPressEnd() }}
      onPointerCancel={() => { if (!disabled) onPressEnd() }}
      disabled={disabled}
      className={`
        w-48 h-48 rounded-full flex flex-col items-center justify-center
        text-white font-medium text-sm select-none
        transition-all duration-150
        ${listening
          ? 'bg-red-500 scale-95 shadow-inner animate-pulse'
          : 'bg-black shadow-lg active:scale-95'
        }
        disabled:opacity-40
      `}
    >
      <Mic size={40} strokeWidth={1.5} className="mb-2" />
      <span>{listening ? 'Listening...' : 'Hold to Record Bib'}</span>
    </button>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run __tests__/mic-button.test.tsx
```

Expected: all 8 tests PASS

- [ ] **Step 5: Commit**

```bash
git add components/MicButton.tsx __tests__/mic-button.test.tsx
git commit -m "feat: switch MicButton from toggle to hold UX (onPressStart/onPressEnd)"
```

---

## Task 3: Update `CaptureScreen` — integration + pre-warm

**Files:**
- Modify: `components/CaptureScreen.tsx`
- Test: `__tests__/capture-screen.test.tsx`

### Background

`CaptureScreen` changes:
1. `handleToggle` → `handlePressStart` + `handlePressEnd`
2. `capturedAt` captured at press time and passed to `startSpeechRecognition`
3. `runLoop` removed — each press is a single one-shot session
4. Pre-warm: `startPrewarm()` called on mount and after each `saveRecord`
5. `handleOverwrite` one-shot path captures `capturedAt = new Date().toISOString()` at overwrite button press

`__tests__/capture-screen.test.tsx` changes:
- Mock signature: 4 args `(lang, capturedAt, onResult, onError)`
- "stops listening when mic button toggled again" → now triggered by `pointerUp` not second `pointerDown`
- Add: pre-warm SpeechRecognition is started on mount

- [ ] **Step 1: Update `__tests__/capture-screen.test.tsx`**

Replace the file entirely:

```typescript
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
  ;(window as any).SpeechRecognition = vi.fn(() => mockPrewarm)
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run __tests__/capture-screen.test.tsx
```

Expected: multiple FAIL — mock signature mismatch, `onPressStart`/`onPressEnd` props don't exist on MicButton yet (Task 2 already done), pre-warm test fails

- [ ] **Step 3: Rewrite `components/CaptureScreen.tsx`**

```typescript
'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { v4 as uuidv4 } from 'uuid'
import MicButton from './MicButton'
import ManualBibInput from './ManualBibInput'
import FinishLog from './FinishLog'
import CaptureToast, { type Toast } from './CaptureToast'
import type { Event, EventDistance, Athlete, PendingRecord } from '@/types'
import type { SpeechResult } from '@/lib/speech'
import { startSpeechRecognition } from '@/lib/speech'
import { addPendingRecord, getPendingRecords, removePendingRecord, removeRecordByBib } from '@/lib/storage'
import { syncPendingRecords } from '@/lib/sync'
import { formatTime } from '@/lib/time'

interface Props {
  event: Event
  distances: EventDistance[]
  athletes: Athlete[]
}

export default function CaptureScreen({ event, distances, athletes: _athletes }: Props) {
  const [listening, setListening] = useState(false)
  const [paused, setPaused] = useState(false)
  const [overwriteBib, setOverwriteBib] = useState<string | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [records, setRecords] = useState<PendingRecord[]>([])

  const listeningRef = useRef(false)
  const pausedRef = useRef(false)
  const overwriteBibRef = useRef<string | null>(null)
  const stopRef = useRef<(() => void) | null>(null)
  const prewarmRef = useRef<{ stop: () => void } | null>(null)

  useEffect(() => { listeningRef.current = listening }, [listening])
  useEffect(() => { pausedRef.current = paused }, [paused])
  useEffect(() => { overwriteBibRef.current = overwriteBib }, [overwriteBib])

  useEffect(() => {
    setRecords(getPendingRecords(event.id))
  }, [event.id])

  useEffect(() => {
    function handleOnline() { syncPendingRecords(event.id, () => {}) }
    window.addEventListener('online', handleOnline)
    if (navigator.onLine) handleOnline()
    return () => window.removeEventListener('online', handleOnline)
  }, [event.id])

  useEffect(() => {
    startPrewarm()
    // Abort mount pre-warm after 500ms to force browser subsystem init without holding mic open
    const timer = setTimeout(() => {
      try { prewarmRef.current?.stop() } catch { /* ignore */ }
    }, 500)
    return () => {
      clearTimeout(timer)
      try { prewarmRef.current?.stop() } catch { /* ignore */ }
      prewarmRef.current = null
    }
  }, [])

  function startPrewarm() {
    const SpeechRecognition =
      ((window as unknown) as { SpeechRecognition?: any; webkitSpeechRecognition?: any })
        .SpeechRecognition ||
      ((window as unknown) as { webkitSpeechRecognition?: any }).webkitSpeechRecognition
    if (!SpeechRecognition) return
    try {
      const prewarm = new SpeechRecognition()
      prewarm.lang = 'th-TH'
      prewarm.interimResults = true
      prewarmRef.current = prewarm
      prewarm.onerror = () => { if (prewarmRef.current === prewarm) prewarmRef.current = null }
      prewarm.onend   = () => { if (prewarmRef.current === prewarm) prewarmRef.current = null }
      prewarm.start()
    } catch { /* browser may not support */ }
  }

  function refreshRecords() {
    setRecords(getPendingRecords(event.id))
  }

  function saveRecord(bib: string, capturedAt: string, force = false): string {
    if (force) removeRecordByBib(event.id, bib)
    const localId = uuidv4()
    addPendingRecord({ local_id: localId, event_id: event.id, bib_number: bib, finish_time: capturedAt, synced: false })
    refreshRecords()
    startPrewarm()
    return localId
  }

  function handleResult(result: SpeechResult) {
    if (!result.bib) return
    const existing = getPendingRecords(event.id).find((r) => r.bib_number === result.bib)
    const isOverwrite = overwriteBibRef.current === result.bib

    if (existing && !isOverwrite) {
      setPaused(true)
      pausedRef.current = true
      setToasts((prev) => [...prev, {
        toastId: uuidv4(),
        type: 'duplicate',
        bib: result.bib!,
        newTime: result.capturedAt,
        existingTime: existing.finish_time,
      }])
    } else {
      const localId = saveRecord(result.bib, result.capturedAt, !!existing)
      setOverwriteBib(null)
      overwriteBibRef.current = null
      setToasts((prev) => [...prev, {
        toastId: uuidv4(),
        type: 'saved',
        bib: result.bib!,
        finishTime: result.capturedAt,
        localId,
      }])
    }
  }

  function handlePressStart() {
    if (listeningRef.current) return
    if (pausedRef.current) return
    const capturedAt = new Date().toISOString()
    setListening(true)
    listeningRef.current = true
    stopRef.current = startSpeechRecognition(
      'th-TH',
      capturedAt,
      (result) => {
        setListening(false)
        listeningRef.current = false
        handleResult(result)
      },
      () => {
        setListening(false)
        listeningRef.current = false
      }
    )
  }

  function handlePressEnd() {
    if (!listeningRef.current) return
    setListening(false)
    listeningRef.current = false
    try { stopRef.current?.() } catch { /* already ended */ }
    stopRef.current = null
  }

  function handleUndo(localId: string) {
    removePendingRecord(event.id, localId)
    refreshRecords()
    setToasts((prev) => prev.filter((t) => t.type !== 'saved' || t.localId !== localId))
  }

  const handleDismiss = useCallback((toastId: string) => {
    setToasts((prev) => prev.filter((t) => t.toastId !== toastId))
  }, [])

  function handleOverwrite(bib: string) {
    setOverwriteBib(bib)
    overwriteBibRef.current = bib
    setPaused(false)
    pausedRef.current = false
    setToasts((prev) => prev.filter((t) => !(t.type === 'duplicate' && t.bib === bib)))
    const capturedAt = new Date().toISOString()
    setListening(true)
    listeningRef.current = true
    stopRef.current = startSpeechRecognition(
      'th-TH',
      capturedAt,
      (result) => {
        setListening(false)
        listeningRef.current = false
        handleResult(result)
      },
      () => {
        setListening(false)
        listeningRef.current = false
        setOverwriteBib(null)
        overwriteBibRef.current = null
      }
    )
  }

  function handleSkip(toastId: string) {
    setPaused(false)
    pausedRef.current = false
    setOverwriteBib(null)
    overwriteBibRef.current = null
    setToasts((prev) => prev.filter((t) => t.toastId !== toastId))
  }

  function handleManualSubmit(bib: string, capturedAt: string) {
    const existing = getPendingRecords(event.id).find((r) => r.bib_number === bib)
    if (existing) {
      setPaused(true)
      pausedRef.current = true
      setToasts((prev) => [...prev, {
        toastId: uuidv4(),
        type: 'duplicate',
        bib,
        newTime: capturedAt,
        existingTime: existing.finish_time,
      }])
    } else {
      const localId = saveRecord(bib, capturedAt)
      setToasts((prev) => [...prev, {
        toastId: uuidv4(),
        type: 'saved',
        bib,
        finishTime: capturedAt,
        localId,
      }])
    }
  }

  return (
    <div className="flex flex-col items-center px-6 pt-8 pb-6 gap-6 min-h-screen">
      <CaptureToast
        toasts={toasts}
        timezone={event.timezone}
        onUndo={handleUndo}
        onOverwrite={handleOverwrite}
        onSkip={handleSkip}
        onDismiss={handleDismiss}
      />

      {distances.length === 0 ? null : distances.length === 1 ? (
        <div className="w-full text-center">
          <p className="text-xs text-gray-400 uppercase tracking-wider font-medium">Start</p>
          <p className="text-2xl font-mono font-semibold mt-0.5">
            {formatTime(distances[0].start_time, event.timezone)}
          </p>
        </div>
      ) : (
        <div className="w-full text-center">
          <div className="space-y-0.5">
            {distances.map((d) => (
              <p key={d.id} className="text-sm font-mono">
                <span className="text-gray-400">{d.name}</span>{' '}
                <span className="font-semibold">{formatTime(d.start_time, event.timezone)}</span>
              </p>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 flex items-center justify-center">
        <MicButton
          listening={listening}
          onPressStart={handlePressStart}
          onPressEnd={handlePressEnd}
        />
      </div>

      <div className="w-full max-w-sm">
        <ManualBibInput onSubmit={handleManualSubmit} />
      </div>

      <div className="w-full max-w-sm">
        <FinishLog records={records} timezone={event.timezone} />
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run all tests**

```bash
npx vitest run
```

Expected: all tests PASS. If TypeScript errors appear:
```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add components/CaptureScreen.tsx __tests__/capture-screen.test.tsx
git commit -m "feat: hold-to-record — capturedAt at press, pre-warm mic, remove runLoop"
```
