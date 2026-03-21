# Toggle Mic + Interim Bib Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hold-to-record with toggle-mic + interim bib detection + Enter-to-confirm, eliminating the 1-2s save delay caused by waiting for `isFinal`.

**Architecture:** `lib/speech.ts` is rewritten to call `onInterim(transcript, bib|null)` on every recognition frame instead of waiting for `isFinal`. `CaptureScreen.tsx` captures timestamp on first interim bib match and saves on Enter. `MicButton.tsx` switches from hold (onPressStart/onPressEnd) to a single toggle (onToggle). **Note:** The spec's file-affected table mentions `myGen` as a parameter to `startSpeechRecognition`, but this plan implements `myGen` as a closure-captured variable inside `CaptureScreen.startListeningSession` instead — the session-gen guard is still enforced, just in the caller's closure rather than in the callee's signature. This is simpler, requires no interface change to `speech.ts`, and achieves the same correctness guarantee.

**Tech Stack:** React 19, Next.js, Web Speech API (th-TH), Vitest + Testing Library, TypeScript

**Spec:** `docs/superpowers/specs/2026-03-19-toggle-mic-interim-bib-design.md`

---

## File Map

| File | Action | What changes |
|---|---|---|
| `lib/speech.ts` | Modify | Remove `capturedAt`, `onResult`, `SpeechResult` type, `resultFired`, `sessionEnded`; add `onInterim(transcript, bib\|null)`; `onend` always calls `onError('')` |
| `components/MicButton.tsx` | Modify | Replace `onPressStart`/`onPressEnd` with `onToggle`; update labels |
| `components/CaptureScreen.tsx` | Modify | Toggle logic, interim bib state, Enter confirm, overwrite fix, candidate box UI; remove `SpeechResult` import |
| `__tests__/speech.test.ts` | Modify | Rewrite for new API |
| `__tests__/mic-button.test.tsx` | Modify | Rewrite for toggle API |
| `__tests__/capture-screen.test.tsx` | Modify | Full rewrite for new API + new tests |

---

## Task 1: Rewrite `lib/speech.ts`

**Files:**
- Modify: `lib/speech.ts`
- Modify: `__tests__/speech.test.ts`

### Background

Current `startSpeechRecognition(lang, capturedAt, onResult, onError, onInterim?)` ignores interim results and fires `onResult` only on `isFinal=true`. The new version fires `onInterim(transcript, bib|null)` on every result frame. `onend` always fires `onError('')` to trigger the restart loop in `CaptureScreen`. `resultFired` and `sessionEnded` are removed — the session-gen guard in `CaptureScreen` prevents double-fire. The `SpeechResult` export is removed entirely.

- [ ] **Step 1: Replace `__tests__/speech.test.ts` with tests for the new API**

```ts
// __tests__/speech.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { parseTranscriptToBib, startSpeechRecognition } from '@/lib/speech'

describe('parseTranscriptToBib', () => {
  it('parses Arabic digit string directly', () => {
    expect(parseTranscriptToBib('235')).toBe('235')
  })
  it('parses Thai word-per-digit', () => {
    expect(parseTranscriptToBib('สองสามห้า')).toBe('235')
  })
  it('parses Thai digits with spaces', () => {
    expect(parseTranscriptToBib('สอง สาม ห้า')).toBe('235')
  })
  it('strips prefix "บิบ" before parsing', () => {
    expect(parseTranscriptToBib('บิบ 235')).toBe('235')
  })
  it('strips prefix "หมายเลข" before parsing', () => {
    expect(parseTranscriptToBib('หมายเลข สองสามห้า')).toBe('235')
  })
  it('preserves leading zeros', () => {
    expect(parseTranscriptToBib('ศูนย์เก้าเก้า')).toBe('099')
  })
  it('returns null when no digits found', () => {
    expect(parseTranscriptToBib('สวัสดี')).toBeNull()
  })
  it('returns null for empty string', () => {
    expect(parseTranscriptToBib('')).toBeNull()
  })
  it('handles all 10 Thai digit words', () => {
    expect(parseTranscriptToBib('ศูนย์หนึ่งสองสามสี่ห้าหกเจ็ดแปดเก้า')).toBe('0123456789')
  })
})

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
    ;(globalThis as any).SpeechRecognition = vi.fn(function () { return mockRec })
  })

  afterEach(() => {
    delete (globalThis as any).SpeechRecognition
  })

  function makeResultEvent(transcript: string, isFinal = false) {
    return {
      resultIndex: 0,
      results: [{ 0: { transcript, confidence: 1 }, length: 1, isFinal }],
    }
  }

  it('calls onInterim with transcript and parsed bib on interim result', () => {
    const onInterim = vi.fn()
    startSpeechRecognition('th-TH', onInterim, vi.fn())
    mockRec.onresult?.(makeResultEvent('235', false))
    expect(onInterim).toHaveBeenCalledWith('235', '235')
  })

  it('calls onInterim with null bib when transcript has no digits', () => {
    const onInterim = vi.fn()
    startSpeechRecognition('th-TH', onInterim, vi.fn())
    mockRec.onresult?.(makeResultEvent('สวัสดี', false))
    expect(onInterim).toHaveBeenCalledWith('สวัสดี', null)
  })

  it('calls onInterim on final result too (isFinal=true)', () => {
    const onInterim = vi.fn()
    startSpeechRecognition('th-TH', onInterim, vi.fn())
    mockRec.onresult?.(makeResultEvent('321', true))
    expect(onInterim).toHaveBeenCalledWith('321', '321')
  })

  it('does NOT call recognition.stop() when bib found (no mid-session stop)', () => {
    startSpeechRecognition('th-TH', vi.fn(), vi.fn())
    mockRec.onresult?.(makeResultEvent('235', true))
    expect(mockRec.stop).not.toHaveBeenCalled()
  })

  it('calls onError("") via onend unconditionally (restart trigger)', () => {
    const onError = vi.fn()
    startSpeechRecognition('th-TH', vi.fn(), onError)
    mockRec.onend?.()
    expect(onError).toHaveBeenCalledWith('')
  })

  it('calls onError("") via onend even after bib was detected (no resultFired guard)', () => {
    const onError = vi.fn()
    startSpeechRecognition('th-TH', vi.fn(), onError)
    mockRec.onresult?.(makeResultEvent('235', true))
    mockRec.onend?.()
    expect(onError).toHaveBeenCalledWith('')
  })

  it('calls onError with error string when recognition fails', () => {
    const onError = vi.fn()
    startSpeechRecognition('th-TH', vi.fn(), onError)
    mockRec.onerror?.({ error: 'no-speech' })
    expect(onError).toHaveBeenCalledWith('no-speech')
  })

  it('calls onError immediately when SpeechRecognition is not supported', () => {
    delete (globalThis as any).SpeechRecognition
    const onError = vi.fn()
    startSpeechRecognition('th-TH', vi.fn(), onError)
    expect(onError).toHaveBeenCalledWith('Web Speech API is not supported in this browser')
  })

  it('calls onError twice when onerror then onend fire (CaptureScreen myGen guard handles dedup)', () => {
    // speech.ts no longer deduplicates — CaptureScreen's session-gen guard handles this
    const onError = vi.fn()
    startSpeechRecognition('th-TH', vi.fn(), onError)
    mockRec.onerror?.({ error: 'no-speech' })
    mockRec.onend?.()
    expect(onError).toHaveBeenCalledTimes(2)
    expect(onError).toHaveBeenNthCalledWith(1, 'no-speech')
    expect(onError).toHaveBeenNthCalledWith(2, '')
  })

  it('sets lang and interimResults on the recognition instance', () => {
    startSpeechRecognition('th-TH', vi.fn(), vi.fn())
    expect(mockRec.lang).toBe('th-TH')
    expect(mockRec.interimResults).toBe(true)
  })

  it('calls recognition.start()', () => {
    startSpeechRecognition('th-TH', vi.fn(), vi.fn())
    expect(mockRec.start).toHaveBeenCalledOnce()
  })

  it('returned stop function calls recognition.stop()', () => {
    const stop = startSpeechRecognition('th-TH', vi.fn(), vi.fn())
    stop()
    expect(mockRec.stop).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd "/Users/wichita.pum/Desktop/entrepreneur./Timing" && npx vitest run __tests__/speech.test.ts
```

Expected: all tests in this file FAIL — the new test file tests the new API against the old `lib/speech.ts` implementation.

- [ ] **Step 3: Rewrite `lib/speech.ts`**

Note: `SpeechResult` interface and `onResult` callback are removed. If any other file imports `SpeechResult` from `@/lib/speech`, TypeScript will catch it in Task 4 Step 2.

```ts
// lib/speech.ts
const THAI_DIGITS: Record<string, string> = {
  'ศูนย์': '0',
  'หนึ่ง': '1',
  'สอง':  '2',
  'สาม':  '3',
  'สี่':   '4',
  'ห้า':   '5',
  'หก':   '6',
  'เจ็ด':  '7',
  'แปด':  '8',
  'เก้า':  '9',
}

const PREFIX_WORDS = ['บิบ', 'หมายเลข']

export function parseTranscriptToBib(transcript: string): string | null {
  let text = transcript.trim()
  for (const prefix of PREFIX_WORDS) {
    if (text.startsWith(prefix)) {
      text = text.slice(prefix.length).trim()
      break
    }
  }
  const arabicMatch = text.replace(/\s/g, '').match(/^\d+$/)
  if (arabicMatch) return arabicMatch[0]
  let result = ''
  let remaining = text.replace(/\s/g, '')
  while (remaining.length > 0) {
    let matched = false
    for (const [word, digit] of Object.entries(THAI_DIGITS)) {
      if (remaining.startsWith(word)) {
        result += digit
        remaining = remaining.slice(word.length)
        matched = true
        break
      }
    }
    if (!matched) break
  }
  if (result.length > 0) return result
  return null
}

export function startSpeechRecognition(
  lang: string,
  onInterim: (transcript: string, bib: string | null) => void,
  onError: (error: string) => void,
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

  recognition.onresult = (event: any) => {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript
      const bib = parseTranscriptToBib(transcript)
      onInterim(transcript, bib)
    }
  }

  recognition.onerror = (event: any) => {
    onError(event.error)
  }

  recognition.onend = () => {
    onError('')
  }

  recognition.start()
  return () => recognition.stop()
}
```

- [ ] **Step 4: Run tests — all should pass**

```bash
cd "/Users/wichita.pum/Desktop/entrepreneur./Timing" && npx vitest run __tests__/speech.test.ts
```

Expected: all 22 tests PASS

- [ ] **Step 5: Commit**

```bash
cd "/Users/wichita.pum/Desktop/entrepreneur./Timing" && git add lib/speech.ts __tests__/speech.test.ts && git commit -m "feat: rewrite speech.ts to fire onInterim on every frame, remove isFinal gate"
```

---

## Task 2: Rewrite `MicButton.tsx`

**Files:**
- Modify: `components/MicButton.tsx`
- Modify: `__tests__/mic-button.test.tsx`

- [ ] **Step 1: Replace `__tests__/mic-button.test.tsx`**

```tsx
// __tests__/mic-button.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import MicButton from '@/components/MicButton'

describe('MicButton', () => {
  it('renders idle label when listening=false', () => {
    render(<MicButton listening={false} onToggle={() => {}} />)
    expect(screen.getByRole('button')).toHaveTextContent('Tap to Record')
  })

  it('renders listening label when listening=true', () => {
    render(<MicButton listening={true} onToggle={() => {}} />)
    expect(screen.getByRole('button')).toHaveTextContent('Recording...')
  })

  it('calls onToggle on click when not listening', () => {
    const onToggle = vi.fn()
    render(<MicButton listening={false} onToggle={onToggle} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onToggle).toHaveBeenCalledOnce()
  })

  it('calls onToggle on click when listening (toggle off)', () => {
    const onToggle = vi.fn()
    render(<MicButton listening={true} onToggle={onToggle} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onToggle).toHaveBeenCalledOnce()
  })

  it('does not call onToggle when disabled', () => {
    const onToggle = vi.fn()
    render(<MicButton listening={false} onToggle={onToggle} disabled />)
    fireEvent.click(screen.getByRole('button'))
    expect(onToggle).not.toHaveBeenCalled()
  })

  it('applies listening styles when listening=true', () => {
    render(<MicButton listening={true} onToggle={() => {}} />)
    const btn = screen.getByRole('button')
    expect(btn.className).toContain('bg-red-500')
    expect(btn.className).toContain('animate-pulse')
  })

  it('applies idle styles when listening=false', () => {
    render(<MicButton listening={false} onToggle={() => {}} />)
    expect(screen.getByRole('button').className).toContain('bg-black')
  })
})
```

- [ ] **Step 2: Run tests to confirm failure**

```bash
cd "/Users/wichita.pum/Desktop/entrepreneur./Timing" && npx vitest run __tests__/mic-button.test.tsx
```

Expected: all 7 tests FAIL — `onToggle` prop doesn't exist yet, old labels still in component

- [ ] **Step 3: Rewrite `components/MicButton.tsx`**

```tsx
// components/MicButton.tsx
'use client'
import { Mic } from 'lucide-react'

interface Props {
  listening: boolean
  onToggle: () => void
  disabled?: boolean
}

export default function MicButton({ listening, onToggle, disabled }: Props) {
  return (
    <button
      onClick={() => { if (!disabled) onToggle() }}
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
      <span>{listening ? 'Recording...' : 'Tap to Record'}</span>
    </button>
  )
}
```

- [ ] **Step 4: Run tests — all should pass**

```bash
cd "/Users/wichita.pum/Desktop/entrepreneur./Timing" && npx vitest run __tests__/mic-button.test.tsx
```

Expected: all 7 tests PASS

- [ ] **Step 5: Commit**

```bash
cd "/Users/wichita.pum/Desktop/entrepreneur./Timing" && git add components/MicButton.tsx __tests__/mic-button.test.tsx && git commit -m "feat: replace MicButton hold API with single onToggle click"
```

---

## Task 3: Rewrite `CaptureScreen.tsx` + tests

**Files:**
- Modify: `components/CaptureScreen.tsx`
- Modify: `__tests__/capture-screen.test.tsx`

### Background

This task rewrites `CaptureScreen.tsx` completely and provides the full updated test file. Key changes:
- Remove `SpeechResult` import (type no longer exported from `speech.ts`)
- Remove `spaceHeldRef`, `pressStartHandlerRef`, `pressEndHandlerRef`, `handlePressStart`, `handlePressEnd`
- Add `interimBib` state, `interimBibRef`, `bibCapturedAtRef`, `toggleHandlerRef`, `handleConfirmRef`
- Rewrite `startListeningSession` (no params; generates `myGen` internally)
- Add `handleToggle`, `handleConfirm`
- Simplify `handleOverwrite` (no `startListeningSession` call)
- Add bib candidate box to JSX

- [ ] **Step 1: Replace `__tests__/capture-screen.test.tsx` in full**

```tsx
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

// ─── Core toggle behavior ────────────────────────────────────────────────────

describe('CaptureScreen toggle mic', () => {
  it('renders mic button in idle state', () => {
    render(<CaptureScreen event={event} distances={[]} athletes={athletes} />)
    expect(screen.getByText('Tap to Record')).toBeInTheDocument()
  })

  it('opens mic on button click', async () => {
    render(<CaptureScreen event={event} distances={[]} athletes={athletes} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /tap to record/i })) })
    expect(screen.getByText('Recording...')).toBeInTheDocument()
  })

  it('closes mic on second button click', async () => {
    render(<CaptureScreen event={event} distances={[]} athletes={athletes} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /tap to record/i })) })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /recording/i })) })
    expect(screen.getByText('Tap to Record')).toBeInTheDocument()
  })

  it('opens mic on Space keydown', async () => {
    render(<CaptureScreen event={event} distances={[]} athletes={athletes} />)
    await act(async () => { fireEvent.keyDown(window, { code: 'Space' }) })
    expect(screen.getByText('Recording...')).toBeInTheDocument()
  })

  it('closes mic on second Space keydown', async () => {
    render(<CaptureScreen event={event} distances={[]} athletes={athletes} />)
    await act(async () => { fireEvent.keyDown(window, { code: 'Space' }) })
    await act(async () => { fireEvent.keyDown(window, { code: 'Space' }) })
    expect(screen.getByText('Tap to Record')).toBeInTheDocument()
  })

  it('does not open mic when paused', async () => {
    // Trigger paused state: open mic, detect bib, detect as duplicate, confirm → paused
    vi.mocked(storage.getPendingRecords).mockReturnValue([
      { local_id: 'lid-1', event_id: 'evt-1', bib_number: '321', finish_time: '2026-03-17T03:42:00Z', synced: false }
    ])
    render(<CaptureScreen event={event} distances={[]} athletes={athletes} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /tap to record/i })) })
    await act(async () => { capturedOnInterim?.('321', '321') })
    await act(async () => { fireEvent.keyDown(window, { code: 'Enter' }) })
    // Now paused — a second click should be blocked
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /tap to record/i })) })
    // Still idle (toggle-on was blocked by paused guard)
    expect(screen.getByText('Tap to Record')).toBeInTheDocument()
  })

  it('stops pre-warm before starting real recognition session', () => {
    render(<CaptureScreen event={event} distances={[]} athletes={athletes} />)
    expect(mockPrewarm!.start).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /tap to record/i }))
    expect(mockPrewarm!.stop).toHaveBeenCalled()
  })

  it('starts pre-warm SpeechRecognition on mount', () => {
    render(<CaptureScreen event={event} distances={[]} athletes={athletes} />)
    expect((window as any).SpeechRecognition).toHaveBeenCalled()
    expect(mockPrewarm!.start).toHaveBeenCalled()
  })
})

// ─── Interim bib candidate ───────────────────────────────────────────────────

describe('CaptureScreen interim bib candidate', () => {
  it('shows candidate bib box when mic is open', async () => {
    render(<CaptureScreen event={event} distances={[]} athletes={athletes} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /tap to record/i })) })
    expect(screen.getByTestId('bib-candidate-box')).toBeInTheDocument()
  })

  it('shows dash when mic is open but no bib detected', async () => {
    render(<CaptureScreen event={event} distances={[]} athletes={athletes} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /tap to record/i })) })
    expect(screen.getByTestId('bib-candidate-box')).toHaveTextContent('—')
  })

  it('shows bib when interim bib detected', async () => {
    render(<CaptureScreen event={event} distances={[]} athletes={athletes} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /tap to record/i })) })
    await act(async () => { capturedOnInterim?.('321', '321') })
    expect(screen.getByTestId('bib-candidate-box')).toHaveTextContent('321')
  })

  it('updates bib as interim speech continues', async () => {
    render(<CaptureScreen event={event} distances={[]} athletes={athletes} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /tap to record/i })) })
    await act(async () => { capturedOnInterim?.('3', '3') })
    await act(async () => { capturedOnInterim?.('32', '32') })
    await act(async () => { capturedOnInterim?.('321', '321') })
    expect(screen.getByTestId('bib-candidate-box')).toHaveTextContent('321')
  })

  it('null-bib frame does not clear existing candidate', async () => {
    render(<CaptureScreen event={event} distances={[]} athletes={athletes} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /tap to record/i })) })
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
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /tap to record/i })) })
    await act(async () => { capturedOnInterim?.('321', '321') })
    // Simulate session restart (onend fires → onError(''))
    act(() => { capturedOnError?.('') })
    // Candidate should still be there
    expect(screen.getByTestId('bib-candidate-box')).toHaveTextContent('321')
  })
})

// ─── Enter to confirm ────────────────────────────────────────────────────────

describe('CaptureScreen Enter to confirm', () => {
  it('saves bib on Enter after detection', async () => {
    render(<CaptureScreen event={event} distances={[]} athletes={athletes} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /tap to record/i })) })
    await act(async () => { capturedOnInterim?.('321', '321') })
    await act(async () => { fireEvent.keyDown(window, { code: 'Enter' }) })
    expect(storage.addPendingRecord).toHaveBeenCalledWith(
      expect.objectContaining({ bib_number: '321', event_id: 'evt-1' })
    )
  })

  it('shows success toast after confirm', async () => {
    render(<CaptureScreen event={event} distances={[]} athletes={athletes} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /tap to record/i })) })
    await act(async () => { capturedOnInterim?.('235', '235') })
    await act(async () => { fireEvent.keyDown(window, { code: 'Enter' }) })
    await waitFor(() => expect(screen.getByText(/Bib 235/)).toBeInTheDocument())
  })

  it('Enter is a no-op when no candidate', async () => {
    render(<CaptureScreen event={event} distances={[]} athletes={athletes} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /tap to record/i })) })
    await act(async () => { fireEvent.keyDown(window, { code: 'Enter' }) })
    expect(storage.addPendingRecord).not.toHaveBeenCalled()
  })

  it('mic stays open after confirm', async () => {
    render(<CaptureScreen event={event} distances={[]} athletes={athletes} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /tap to record/i })) })
    await act(async () => { capturedOnInterim?.('321', '321') })
    await act(async () => { fireEvent.keyDown(window, { code: 'Enter' }) })
    expect(screen.getByText('Recording...')).toBeInTheDocument()
  })

  it('bib candidate resets to dash after confirm', async () => {
    render(<CaptureScreen event={event} distances={[]} athletes={athletes} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /tap to record/i })) })
    await act(async () => { capturedOnInterim?.('321', '321') })
    await act(async () => { fireEvent.keyDown(window, { code: 'Enter' }) })
    expect(screen.getByTestId('bib-candidate-box')).toHaveTextContent('—')
  })

  it('shows duplicate toast when same bib confirmed twice', async () => {
    vi.mocked(storage.getPendingRecords).mockReturnValue([
      { local_id: 'lid-1', event_id: 'evt-1', bib_number: '235', finish_time: '2026-03-17T03:42:05.000Z', synced: false }
    ])
    render(<CaptureScreen event={event} distances={[]} athletes={athletes} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /tap to record/i })) })
    await act(async () => { capturedOnInterim?.('235', '235') })
    await act(async () => { fireEvent.keyDown(window, { code: 'Enter' }) })
    await waitFor(() => expect(screen.getByText(/235 duplicate/)).toBeInTheDocument())
    expect(storage.addPendingRecord).not.toHaveBeenCalled()
  })

  it('starts pre-warm again after saving a bib', async () => {
    const MockSR = (window as any).SpeechRecognition as ReturnType<typeof vi.fn>
    render(<CaptureScreen event={event} distances={[]} athletes={athletes} />)
    const callCountAfterMount = MockSR.mock.calls.length
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /tap to record/i })) })
    await act(async () => { capturedOnInterim?.('235', '235') })
    await act(async () => { fireEvent.keyDown(window, { code: 'Enter' }) })
    await waitFor(() => expect(screen.getByText(/Bib 235/)).toBeInTheDocument())
    expect(MockSR.mock.calls.length).toBeGreaterThan(callCountAfterMount)
  })
})

// ─── Session restart behavior ────────────────────────────────────────────────

describe('CaptureScreen session restart', () => {
  it('stays listening when session ends while mic is open (restarts)', async () => {
    render(<CaptureScreen event={event} distances={[]} athletes={athletes} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /tap to record/i })) })
    act(() => { capturedOnError?.('') })
    expect(screen.getByText('Recording...')).toBeInTheDocument()
  })

  it('restarts on real error while mic is open', async () => {
    render(<CaptureScreen event={event} distances={[]} athletes={athletes} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /tap to record/i })) })
    act(() => { capturedOnError?.('no-speech') })
    expect(screen.getByText('Recording...')).toBeInTheDocument()
  })

  it('discards stale interim callback after session gen changes', async () => {
    render(<CaptureScreen event={event} distances={[]} athletes={athletes} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /tap to record/i })) })
    // Capture the current onInterim
    const staleOnInterim = capturedOnInterim
    // Toggle off — increments sessionGen
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /recording/i })) })
    // Stale callback fires — must be ignored
    act(() => { staleOnInterim?.('321', '321') })
    expect(storage.addPendingRecord).not.toHaveBeenCalled()
    // Candidate box is not visible (mic closed)
    expect(screen.queryByTestId('bib-candidate-box')).not.toBeInTheDocument()
  })
})

// ─── Duplicate / Overwrite flow ──────────────────────────────────────────────

describe('CaptureScreen duplicate and overwrite', () => {
  it('overwrite: clicking Overwrite does not start a new listening session', async () => {
    vi.mocked(storage.getPendingRecords).mockReturnValue([
      { local_id: 'lid-1', event_id: 'evt-1', bib_number: '235', finish_time: '2026-03-17T03:42:05.000Z', synced: false }
    ])
    render(<CaptureScreen event={event} distances={[]} athletes={athletes} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /tap to record/i })) })
    await act(async () => { capturedOnInterim?.('235', '235') })
    await act(async () => { fireEvent.keyDown(window, { code: 'Enter' }) })
    await waitFor(() => screen.getByText(/235 duplicate/))
    const callsBefore = vi.mocked(speech.startSpeechRecognition).mock.calls.length
    await act(async () => { fireEvent.click(screen.getByText('Overwrite')) })
    // No new session started — toggle mic is still open
    expect(vi.mocked(speech.startSpeechRecognition).mock.calls.length).toBe(callsBefore)
  })

  it('overwrite: speaking bib again after Overwrite force-saves', async () => {
    vi.mocked(storage.getPendingRecords).mockReturnValue([
      { local_id: 'lid-1', event_id: 'evt-1', bib_number: '235', finish_time: '2026-03-17T03:42:05.000Z', synced: false }
    ])
    render(<CaptureScreen event={event} distances={[]} athletes={athletes} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /tap to record/i })) })
    await act(async () => { capturedOnInterim?.('235', '235') })
    await act(async () => { fireEvent.keyDown(window, { code: 'Enter' }) })
    await waitFor(() => screen.getByText(/235 duplicate/))
    vi.mocked(storage.getPendingRecords).mockReturnValue([])
    await act(async () => { fireEvent.click(screen.getByText('Overwrite')) })
    // Speak bib again, then confirm
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
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /tap to record/i })) })
    await act(async () => { capturedOnInterim?.('235', '235') })
    await act(async () => { fireEvent.keyDown(window, { code: 'Enter' }) })
    await waitFor(() => screen.getByText(/235 duplicate/))
    await act(async () => { fireEvent.click(screen.getByText('Skip')) })
    // Candidate box visible again (not paused)
    expect(screen.getByTestId('bib-candidate-box')).toBeInTheDocument()
  })

  it('manual save while paused clears paused state', async () => {
    vi.mocked(storage.getPendingRecords).mockReturnValue([
      { local_id: 'lid-1', event_id: 'evt-1', bib_number: '235', finish_time: '2026-03-17T03:42:05.000Z', synced: false }
    ])
    render(<CaptureScreen event={event} distances={[]} athletes={athletes} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /tap to record/i })) })
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
    // Candidate box should be visible again (paused cleared)
    expect(screen.getByTestId('bib-candidate-box')).toBeInTheDocument()
  })
})

// ─── Distance display ────────────────────────────────────────────────────────

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
```

- [ ] **Step 2: Run tests to confirm failures**

```bash
cd "/Users/wichita.pum/Desktop/entrepreneur./Timing" && npx vitest run __tests__/capture-screen.test.tsx 2>&1 | tail -20
```

Expected: most tests FAIL — old `CaptureScreen` still uses hold-to-record API

- [ ] **Step 3: Rewrite `components/CaptureScreen.tsx`**

```tsx
// components/CaptureScreen.tsx
'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { v4 as uuidv4 } from 'uuid'
import MicButton from './MicButton'
import ManualBibInput from './ManualBibInput'
import FinishLog from './FinishLog'
import CaptureToast, { type Toast } from './CaptureToast'
import type { Event, EventDistance, Athlete, PendingRecord } from '@/types'
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
  const [interimTranscript, setInterimTranscript] = useState('')
  const [interimBib, setInterimBib] = useState<string | null>(null)
  const [paused, setPaused] = useState(false)
  const [overwriteBib, setOverwriteBib] = useState<string | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [records, setRecords] = useState<PendingRecord[]>([])

  const listeningRef = useRef(false)
  const pausedRef = useRef(false)
  const overwriteBibRef = useRef<string | null>(null)
  const stopRef = useRef<(() => void) | null>(null)
  const prewarmRef = useRef<{ stop: () => void } | null>(null)
  const sessionGenRef = useRef(0)
  // Refs for reading latest interim state inside recognition callbacks (avoid stale closures)
  const interimBibRef = useRef<string | null>(null)
  const bibCapturedAtRef = useRef<string | null>(null)
  // Refs so keyboard useEffect always calls latest handler versions
  const toggleHandlerRef = useRef<() => void>(() => {})
  const handleConfirmRef = useRef<() => void>(() => {})

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

  // Keyboard handler: Space = toggle mic, Enter = confirm bib
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return
      if (e.code === 'Space') {
        e.preventDefault()
        toggleHandlerRef.current()
      } else if (e.code === 'Enter') {
        e.preventDefault()
        handleConfirmRef.current()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    startPrewarm()
    const timer = setTimeout(() => {
      try { prewarmRef.current?.stop() } catch { /* ignore */ }
    }, 500)
    return () => {
      clearTimeout(timer)
      try { prewarmRef.current?.stop() } catch { /* ignore */ }
      prewarmRef.current = null
    }
  }, [])

  function startListeningSession() {
    const myGen = ++sessionGenRef.current
    stopRef.current = startSpeechRecognition(
      'th-TH',
      (transcript, bib) => {
        if (sessionGenRef.current !== myGen) return
        setInterimTranscript(transcript)
        if (bib !== null) {
          if (interimBibRef.current === null) {
            bibCapturedAtRef.current = new Date().toISOString()
          }
          interimBibRef.current = bib
          setInterimBib(bib)
        }
        // null-bib frame: update display only, do not clear pending candidate
      },
      (error) => {
        if (sessionGenRef.current !== myGen) return
        if (listeningRef.current) {
          // Session ended while mic is open — restart.
          // Preserve candidate across the restart gap; only clear transcript.
          if (interimBibRef.current === null) setInterimTranscript('')
          startListeningSession()
        } else {
          setListening(false)
          listeningRef.current = false
          setInterimTranscript('')
        }
      }
    )
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

  function handleConfirmResult(bib: string, capturedAt: string) {
    const existing = getPendingRecords(event.id).find((r) => r.bib_number === bib)
    const isOverwrite = overwriteBibRef.current === bib

    if (existing && !isOverwrite) {
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
      const localId = saveRecord(bib, capturedAt, !!existing)
      setOverwriteBib(null)
      overwriteBibRef.current = null
      setToasts((prev) => [...prev, {
        toastId: uuidv4(),
        type: 'saved',
        bib,
        finishTime: capturedAt,
        localId,
      }])
    }
  }

  function handleToggle() {
    if (listeningRef.current) {
      // Close mic
      listeningRef.current = false
      ++sessionGenRef.current
      setListening(false)
      setInterimTranscript('')
      interimBibRef.current = null
      bibCapturedAtRef.current = null
      setInterimBib(null)
      try { stopRef.current?.() } catch { /* already ended */ }
      stopRef.current = null
    } else {
      // Open mic
      if (pausedRef.current) return
      try { prewarmRef.current?.stop() } catch { /* already ended */ }
      prewarmRef.current = null
      setListening(true)
      listeningRef.current = true
      startListeningSession()
    }
  }

  function handleConfirm() {
    if (pausedRef.current) return
    if (interimBib === null) return
    const bib = interimBib
    const capturedAt = bibCapturedAtRef.current ?? new Date().toISOString()
    // Invalidate in-flight callbacks to prevent re-population during save
    ++sessionGenRef.current
    interimBibRef.current = null
    bibCapturedAtRef.current = null
    setInterimBib(null)
    setInterimTranscript('')
    handleConfirmResult(bib, capturedAt)
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
    // Set overwrite flag and unpause. Do NOT start a new session — toggle mic is already open.
    setOverwriteBib(bib)
    overwriteBibRef.current = bib
    setPaused(false)
    pausedRef.current = false
    setToasts((prev) => prev.filter((t) => !(t.type === 'duplicate' && t.bib === bib)))
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
      setPaused(false)
      pausedRef.current = false
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

  // Update handler refs every render so keyboard useEffect always calls latest version
  toggleHandlerRef.current = handleToggle
  handleConfirmRef.current = handleConfirm

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

      <div className="flex-1 flex flex-col items-center justify-center gap-3">
        <MicButton
          listening={listening}
          onToggle={handleToggle}
        />

        {/* Raw interim transcript — mic-is-hearing feedback */}
        <div className={`w-48 h-12 rounded-xl bg-gray-900 border border-gray-700 flex items-center justify-center px-3 transition-opacity duration-150 ${listening && interimTranscript ? 'opacity-100' : 'opacity-0'}`}>
          <span className="text-white text-xl font-mono font-semibold tracking-widest">
            {interimTranscript}
          </span>
        </div>

        {/* Bib candidate box — shown when mic open and not paused */}
        {listening && !paused && (
          <div
            data-testid="bib-candidate-box"
            className="w-48 rounded-xl bg-gray-900 border border-gray-700 flex flex-col items-center justify-center px-3 py-4 gap-1"
          >
            <span className="text-xs text-gray-400 uppercase tracking-wider">BIB</span>
            <span className="text-4xl font-mono font-bold text-white">
              {interimBib ?? '—'}
            </span>
            {interimBib && (
              <span className="text-xs text-gray-400 mt-1">กด Enter เพื่อบันทึก</span>
            )}
          </div>
        )}
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
cd "/Users/wichita.pum/Desktop/entrepreneur./Timing" && npx vitest run 2>&1 | tail -20
```

Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
cd "/Users/wichita.pum/Desktop/entrepreneur./Timing" && git add components/CaptureScreen.tsx __tests__/capture-screen.test.tsx && git commit -m "feat: toggle mic + interim bib detection + Enter to confirm"
```

---

## Task 4: Final verification

**Files:** none (read-only)

- [ ] **Step 1: Full test suite**

```bash
cd "/Users/wichita.pum/Desktop/entrepreneur./Timing" && npx vitest run
```

Expected: all tests PASS, zero failures

- [ ] **Step 2: TypeScript build check**

```bash
cd "/Users/wichita.pum/Desktop/entrepreneur./Timing" && npx tsc --noEmit
```

Expected: no errors. TypeScript will catch any remaining references to the removed `SpeechResult` type or old `MicButton` props (`onPressStart`/`onPressEnd`).

- [ ] **Step 3: Final commit (only if TypeScript revealed fixes)**

```bash
cd "/Users/wichita.pum/Desktop/entrepreneur./Timing" && git add -p && git commit -m "fix: clean up TypeScript errors from speech API refactor"
```

Skip this step if Step 2 was already clean.

---

## Manual verification checklist (in browser)

After implementation, verify these flows work end-to-end:

1. Open mic (click or Space) → button turns red, "Recording...", BIB box shows `—`
2. Speak "สามสองหนึ่ง" → BIB box shows `321` immediately (no 1-2s wait)
3. Press Enter → toast confirms save, BIB box resets to `—`, mic stays open
4. Speak again → next bib detected, confirm with Enter
5. Press Space again → mic closes, BIB box disappears
6. Duplicate bib: speak an already-saved bib + Enter → duplicate toast appears, BIB box hidden
7. Click Overwrite → speak bib again + Enter → force-saves

---

## Implementation status (2026-03-21)

**Done:** Tasks 1–4 implemented in-repo; `vitest` (189 tests) and `tsc --noEmit` pass.

**Deviations from the inline code blocks above (keep these when maintaining):**

1. **`handleConfirm` — duplicate vs success**
   - On **duplicate** (`existing && !overwrite`): do **not** increment `sessionGenRef` before `handleConfirmResult`, so the same mocked `onInterim` from the initial `startSpeechRecognition` call stays valid for the Overwrite flow tests (no extra `startSpeechRecognition` on Overwrite).
   - Stop recognition, clear interim, then `handleConfirmResult`; on duplicate, set `listening` to false (shows **Tap to Record**; matches “does not open mic when paused”).
   - On **success** (non-duplicate): increment `sessionGenRef`, then `handleConfirmResult`, then stop prewarm and `startListeningSession()` so the mic stays live and the next bib can be captured.

2. **`handleSkip`**
   - After clearing duplicate pause, if the mic was closed (`!listeningRef`), call `startListeningSession()` so the bib candidate box can show again (Skip / resume test).

3. **`handleManualSubmit` (success path)**
   - If the user clears a **paused** state by manual save while the mic was closed, reopen listening with `startListeningSession()` (manual-save-while-paused test).

4. **`handleConfirmResult` — `saveRecord(..., force)`**
   - Use `force = !!existing || isOverwrite` so Overwrite still calls `removeRecordByBib` when `getPendingRecords` is empty in tests (or in UI after a refresh) but `overwriteBibRef` matches the bib.
