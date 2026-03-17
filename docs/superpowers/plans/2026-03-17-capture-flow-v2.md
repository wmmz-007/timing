# Capture Flow v2 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the slow confirm-step capture flow with a continuous auto-save speech mode and a persistent manual numpad.

**Architecture:** `CaptureScreen` owns the speech recognition loop and all state. `MicButton` becomes a pure display/toggle button. A new `CaptureToast` component renders a queued list of success and duplicate toasts. `ConfirmCapture` is deleted.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest + @testing-library/react, Lucide icons, uuid

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Modify | `components/MicButton.tsx` | Pure toggle button; accept controlled `listening` + `onToggle` props |
| Create | `components/CaptureToast.tsx` | Render toast queue (success + duplicate variants) |
| Modify | `components/ManualBibInput.tsx` | Stay open after submit; X close button |
| Modify | `components/CaptureScreen.tsx` | Continuous loop, toast state, no pending/confirm |
| Delete | `components/ConfirmCapture.tsx` | No longer needed |
| Create | `__tests__/capture-toast.test.tsx` | Unit tests for CaptureToast |
| Create | `__tests__/mic-button.test.tsx` | Unit tests for MicButton v2 |
| Create | `__tests__/capture-screen.test.tsx` | Integration tests for CaptureScreen v2 |

Note: `ManualBibInput` tests are covered inline in Task 3.

---

## Task 1: MicButton v2 — Fully Controlled

**Files:**
- Modify: `components/MicButton.tsx`
- Create: `__tests__/mic-button.test.tsx`

- [ ] **Step 1: Write failing tests**

```tsx
// __tests__/mic-button.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import MicButton from '@/components/MicButton'

describe('MicButton', () => {
  it('renders idle state when listening=false', () => {
    render(<MicButton listening={false} onToggle={() => {}} />)
    expect(screen.getByRole('button')).toHaveTextContent('กดพูดเลขบิบ')
  })

  it('renders listening state when listening=true', () => {
    render(<MicButton listening={true} onToggle={() => {}} />)
    expect(screen.getByRole('button')).toHaveTextContent('กำลังฟัง...')
  })

  it('calls onToggle when pressed', () => {
    const onToggle = vi.fn()
    render(<MicButton listening={false} onToggle={onToggle} />)
    fireEvent.pointerDown(screen.getByRole('button'))
    expect(onToggle).toHaveBeenCalledOnce()
  })

  it('does not call onToggle when disabled', () => {
    const onToggle = vi.fn()
    render(<MicButton listening={false} onToggle={onToggle} disabled />)
    fireEvent.pointerDown(screen.getByRole('button'))
    expect(onToggle).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run __tests__/mic-button.test.tsx
```

Expected: FAIL — component has wrong props interface

- [ ] **Step 3: Rewrite MicButton**

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
      onPointerDown={() => { if (!disabled) onToggle() }}
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
      <span>{listening ? 'กำลังฟัง...' : 'กดพูดเลขบิบ'}</span>
    </button>
  )
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run __tests__/mic-button.test.tsx
```

Expected: 4/4 PASS

- [ ] **Step 5: Commit**

```bash
git add components/MicButton.tsx __tests__/mic-button.test.tsx
git commit -m "refactor: MicButton v2 — fully controlled, remove recognition logic"
```

---

## Task 2: CaptureToast — New Component

**Files:**
- Create: `components/CaptureToast.tsx`
- Create: `__tests__/capture-toast.test.tsx`

- [ ] **Step 1: Write failing tests**

```tsx
// __tests__/capture-toast.test.tsx
import { render, screen, fireEvent, act } from '@testing-library/react'
import CaptureToast from '@/components/CaptureToast'

const TZ = 'Asia/Bangkok'
const successToast = {
  toastId: 'tid-1',
  type: 'saved' as const,
  bib: '235',
  finishTime: '2026-03-17T03:42:05.000Z',
  localId: 'lid-1',
}
const dupToast = {
  toastId: 'tid-2',
  type: 'duplicate' as const,
  bib: '235',
  newTime: '2026-03-17T03:42:10.000Z',
  existingTime: '2026-03-17T03:42:05.000Z',
}

describe('CaptureToast', () => {
  it('renders success toast with bib number', () => {
    render(<CaptureToast toasts={[successToast]} timezone={TZ} onUndo={() => {}} onOverwrite={() => {}} onSkip={() => {}} onDismiss={() => {}} />)
    expect(screen.getByText(/บิบ 235/)).toBeInTheDocument()
    expect(screen.getByText('ย้อนกลับ')).toBeInTheDocument()
  })

  it('calls onUndo with localId when undo tapped', () => {
    const onUndo = vi.fn()
    render(<CaptureToast toasts={[successToast]} timezone={TZ} onUndo={onUndo} onOverwrite={() => {}} onSkip={() => {}} onDismiss={() => {}} />)
    fireEvent.click(screen.getByText('ย้อนกลับ'))
    expect(onUndo).toHaveBeenCalledWith('lid-1')
  })

  it('calls onDismiss with toastId after 2 seconds', () => {
    vi.useFakeTimers()
    const onDismiss = vi.fn()
    render(<CaptureToast toasts={[successToast]} timezone={TZ} onUndo={() => {}} onOverwrite={() => {}} onSkip={() => {}} onDismiss={onDismiss} />)
    act(() => { vi.advanceTimersByTime(2000) })
    expect(onDismiss).toHaveBeenCalledWith('tid-1')
    vi.useRealTimers()
  })

  it('renders duplicate toast with อ่านใหม่ and ข้าม buttons', () => {
    render(<CaptureToast toasts={[dupToast]} timezone={TZ} onUndo={() => {}} onOverwrite={() => {}} onSkip={() => {}} onDismiss={() => {}} />)
    expect(screen.getByText(/235 ซ้ำ/)).toBeInTheDocument()
    expect(screen.getByText('อ่านใหม่')).toBeInTheDocument()
    expect(screen.getByText('ข้าม')).toBeInTheDocument()
  })

  it('calls onOverwrite with bib when อ่านใหม่ tapped', () => {
    const onOverwrite = vi.fn()
    render(<CaptureToast toasts={[dupToast]} timezone={TZ} onUndo={() => {}} onOverwrite={onOverwrite} onSkip={() => {}} onDismiss={() => {}} />)
    fireEvent.click(screen.getByText('อ่านใหม่'))
    expect(onOverwrite).toHaveBeenCalledWith('235')
  })

  it('calls onSkip when ข้าม tapped', () => {
    const onSkip = vi.fn()
    render(<CaptureToast toasts={[dupToast]} timezone={TZ} onUndo={() => {}} onOverwrite={() => {}} onSkip={onSkip} onDismiss={() => {}} />)
    fireEvent.click(screen.getByText('ข้าม'))
    expect(onSkip).toHaveBeenCalledOnce()
  })

  it('renders nothing when toasts array is empty', () => {
    const { container } = render(<CaptureToast toasts={[]} timezone={TZ} onUndo={() => {}} onOverwrite={() => {}} onSkip={() => {}} onDismiss={() => {}} />)
    expect(container.firstChild).toBeNull()
  })

  it('success toast auto-dismiss does not interfere with a duplicate toast in the queue', () => {
    vi.useFakeTimers()
    const onDismiss = vi.fn()
    const onSkip = vi.fn()
    render(
      <CaptureToast
        toasts={[successToast, dupToast]}
        timezone={TZ}
        onUndo={() => {}} onOverwrite={() => {}} onSkip={onSkip} onDismiss={onDismiss}
      />
    )
    act(() => { vi.advanceTimersByTime(2000) })
    // Only the success toast is dismissed; onSkip is NOT called
    expect(onDismiss).toHaveBeenCalledWith('tid-1')
    expect(onSkip).not.toHaveBeenCalled()
    vi.useRealTimers()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run __tests__/capture-toast.test.tsx
```

Expected: FAIL — component does not exist

- [ ] **Step 3: Create CaptureToast**

```tsx
// components/CaptureToast.tsx
'use client'
import { useEffect } from 'react'
import { RotateCcw } from 'lucide-react'
import { formatTime } from '@/lib/time'

export type Toast =
  | { toastId: string; type: 'saved'; bib: string; finishTime: string; localId: string }
  | { toastId: string; type: 'duplicate'; bib: string; newTime: string; existingTime: string }

interface Props {
  toasts: Toast[]
  timezone: string
  onUndo: (localId: string) => void
  onOverwrite: (bib: string) => void
  onSkip: () => void
  onDismiss: (toastId: string) => void
}

function SavedToast({ toast, timezone, onUndo, onDismiss }: {
  toast: Extract<Toast, { type: 'saved' }>
  timezone: string
  onUndo: (localId: string) => void
  onDismiss: (toastId: string) => void
}) {
  useEffect(() => {
    const t = setTimeout(() => onDismiss(toast.toastId), 2000)
    return () => clearTimeout(t)
  }, [toast.toastId, onDismiss])

  return (
    <div className="flex items-center justify-between bg-gray-900 text-white rounded-2xl px-4 py-3 shadow-lg">
      <span className="text-sm font-medium">
        บิบ {toast.bib} — {formatTime(toast.finishTime, timezone)}
      </span>
      <button
        onClick={() => onUndo(toast.localId)}
        className="flex items-center gap-1 text-xs text-gray-400 ml-4"
      >
        <RotateCcw size={12} /> ย้อนกลับ
      </button>
    </div>
  )
}

function DuplicateToast({ toast, timezone, onOverwrite, onSkip }: {
  toast: Extract<Toast, { type: 'duplicate' }>
  timezone: string
  onOverwrite: (bib: string) => void
  onSkip: () => void
}) {
  return (
    <div className="bg-yellow-50 border border-yellow-200 rounded-2xl px-4 py-3 shadow-lg">
      <p className="text-sm font-medium text-yellow-800 mb-2">
        {toast.bib} ซ้ำ — บันทึกไปแล้ว {formatTime(toast.existingTime, timezone)}
      </p>
      <div className="flex gap-2">
        <button
          onClick={() => onOverwrite(toast.bib)}
          className="flex-1 py-2 rounded-xl bg-yellow-700 text-white text-xs font-medium"
        >
          อ่านใหม่
        </button>
        <button
          onClick={onSkip}
          className="flex-1 py-2 rounded-xl bg-yellow-100 text-yellow-800 text-xs font-medium"
        >
          ข้าม
        </button>
      </div>
    </div>
  )
}

export default function CaptureToast({ toasts, timezone, onUndo, onOverwrite, onSkip, onDismiss }: Props) {
  if (toasts.length === 0) return null
  return (
    <div className="fixed top-4 left-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) =>
        t.type === 'saved'
          ? <SavedToast key={t.toastId} toast={t} timezone={timezone} onUndo={onUndo} onDismiss={onDismiss} />
          : <DuplicateToast key={t.toastId} toast={t} timezone={timezone} onOverwrite={onOverwrite} onSkip={onSkip} />
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run __tests__/capture-toast.test.tsx
```

Expected: 8/8 PASS

- [ ] **Step 5: Commit**

```bash
git add components/CaptureToast.tsx __tests__/capture-toast.test.tsx
git commit -m "feat: add CaptureToast component with success and duplicate variants"
```

---

## Task 3: ManualBibInput v2 — Persistent Numpad

**Files:**
- Modify: `components/ManualBibInput.tsx`
- Create: `__tests__/manual-bib-input.test.tsx`

- [ ] **Step 1: Write failing tests**

```tsx
// __tests__/manual-bib-input.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import ManualBibInput from '@/components/ManualBibInput'

describe('ManualBibInput v2', () => {
  it('opens numpad when กรอกบิบเอง tapped', () => {
    render(<ManualBibInput onSubmit={() => {}} />)
    fireEvent.click(screen.getByText('กรอกบิบเอง'))
    expect(screen.getByText('บันทึก')).toBeInTheDocument()
  })

  it('stays open after submit', () => {
    const onSubmit = vi.fn()
    render(<ManualBibInput onSubmit={onSubmit} />)
    fireEvent.click(screen.getByText('กรอกบิบเอง'))
    fireEvent.click(screen.getByText('2'))
    fireEvent.click(screen.getByText('3'))
    fireEvent.click(screen.getByText('5'))
    fireEvent.click(screen.getByText('บันทึก'))
    expect(onSubmit).toHaveBeenCalledOnce()
    // Numpad still visible
    expect(screen.getByText('บันทึก')).toBeInTheDocument()
  })

  it('clears input after submit', () => {
    render(<ManualBibInput onSubmit={() => {}} />)
    fireEvent.click(screen.getByText('กรอกบิบเอง'))
    fireEvent.click(screen.getByText('2'))
    fireEvent.click(screen.getByText('บันทึก'))
    // Input shows placeholder dash (no bib digits)
    expect(screen.queryByText('2')).not.toBeInTheDocument()
  })

  it('closes when X button tapped', () => {
    render(<ManualBibInput onSubmit={() => {}} />)
    fireEvent.click(screen.getByText('กรอกบิบเอง'))
    fireEvent.click(screen.getByRole('button', { name: '' })) // X button (icon only)
    expect(screen.getByText('กรอกบิบเอง')).toBeInTheDocument()
    expect(screen.queryByText('บันทึก')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run __tests__/manual-bib-input.test.tsx
```

Expected: FAIL — component closes after submit and has no X button

- [ ] **Step 3: Update ManualBibInput**

```tsx
// components/ManualBibInput.tsx
'use client'
import { useState } from 'react'
import { X } from 'lucide-react'

interface Props {
  onSubmit: (bib: string, capturedAt: string) => void
}

export default function ManualBibInput({ onSubmit }: Props) {
  const [bib, setBib] = useState('')
  const [open, setOpen] = useState(false)

  function handleKey(digit: string) {
    setBib((prev) => prev + digit)
  }

  function handleBackspace() {
    setBib((prev) => prev.slice(0, -1))
  }

  function handleSubmit() {
    if (!bib) return
    onSubmit(bib, new Date().toISOString())
    setBib('')
    // Stay open — user can immediately enter next bib
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-sm text-gray-400 underline underline-offset-2"
      >
        กรอกบิบเอง
      </button>
    )
  }

  const keys = [['1','2','3'],['4','5','6'],['7','8','9'],['','0','⌫']]

  return (
    <div className="w-full bg-gray-50 border border-gray-200 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-3xl font-bold tracking-widest font-mono min-h-[2rem]">
          {bib || <span className="text-gray-300">—</span>}
        </span>
        <button
          onClick={() => { setBib(''); setOpen(false) }}
          aria-label="close"
          className="text-gray-400 p-1"
        >
          <X size={18} />
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2 mb-3">
        {keys.flat().map((k, i) => (
          <button
            key={i}
            onClick={() => k === '⌫' ? handleBackspace() : k ? handleKey(k) : undefined}
            className={`py-4 rounded-xl text-xl font-medium ${
              k === '⌫' ? 'bg-gray-200 text-gray-700' :
              k ? 'bg-white border border-gray-200 active:bg-gray-100' :
              'invisible'
            }`}
          >
            {k}
          </button>
        ))}
      </div>
      <button
        onClick={handleSubmit}
        disabled={!bib}
        className="w-full py-3 rounded-xl bg-black text-white font-medium disabled:opacity-40"
      >
        บันทึก
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run __tests__/manual-bib-input.test.tsx
```

Expected: 4/4 PASS

- [ ] **Step 5: Commit**

```bash
git add components/ManualBibInput.tsx __tests__/manual-bib-input.test.tsx
git commit -m "refactor: ManualBibInput v2 — stay open after submit, X close button"
```

---

## Task 4: CaptureScreen v2 + Delete ConfirmCapture

**Files:**
- Modify: `components/CaptureScreen.tsx`
- Delete: `components/ConfirmCapture.tsx`
- Create: `__tests__/capture-screen.test.tsx`

- [ ] **Step 1: Write failing tests**

```tsx
// __tests__/capture-screen.test.tsx
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import CaptureScreen from '@/components/CaptureScreen'
import * as speech from '@/lib/speech'
import * as storage from '@/lib/storage'
import type { Event } from '@/types'

const event: Event = {
  id: 'evt-1',
  name: 'Test Race',
  start_time: '2026-03-17T03:00:00.000Z',
  timezone: 'Asia/Bangkok',
}

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
    render(<CaptureScreen event={event} />)
    expect(screen.getByText('กดพูดเลขบิบ')).toBeInTheDocument()
  })

  it('starts listening when mic button toggled', () => {
    render(<CaptureScreen event={event} />)
    fireEvent.pointerDown(screen.getByRole('button', { name: /กดพูดเลขบิบ/ }))
    expect(screen.getByText('กำลังฟัง...')).toBeInTheDocument()
  })

  it('auto-saves bib and shows success toast on speech result', async () => {
    render(<CaptureScreen event={event} />)
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
    render(<CaptureScreen event={event} />)
    fireEvent.pointerDown(screen.getByRole('button', { name: /กดพูดเลขบิบ/ }))
    act(() => {
      capturedOnResult?.({ transcript: 'สองสามห้า', bib: '235', capturedAt: '2026-03-17T03:42:10.000Z' })
    })
    await waitFor(() => expect(screen.getByText(/235 ซ้ำ/)).toBeInTheDocument())
    expect(storage.addPendingRecord).not.toHaveBeenCalled()
  })

  it('stops listening when mic button toggled again', () => {
    render(<CaptureScreen event={event} />)
    const btn = screen.getByRole('button', { name: /กดพูดเลขบิบ/ })
    fireEvent.pointerDown(btn)
    expect(screen.getByText('กำลังฟัง...')).toBeInTheDocument()
    fireEvent.pointerDown(screen.getByRole('button', { name: /กำลังฟัง/ }))
    expect(screen.getByText('กดพูดเลขบิบ')).toBeInTheDocument()
  })

  it('ignores garbled speech (no bib) and continues listening', async () => {
    render(<CaptureScreen event={event} />)
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
    render(<CaptureScreen event={event} />)
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
    render(<CaptureScreen event={event} />)
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
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run __tests__/capture-screen.test.tsx
```

Expected: FAIL — CaptureScreen still uses old flow

- [ ] **Step 3: Rewrite CaptureScreen**

Note on `overwriteBib`: uses both state (for React re-renders) and a ref (for async loop closures), same pattern as `listening` and `paused`.

```tsx
// components/CaptureScreen.tsx
'use client'
import { useState, useEffect, useRef } from 'react'
import { v4 as uuidv4 } from 'uuid'
import MicButton from './MicButton'
import ManualBibInput from './ManualBibInput'
import FinishLog from './FinishLog'
import CaptureToast, { type Toast } from './CaptureToast'
import type { Event, PendingRecord } from '@/types'
import type { SpeechResult } from '@/lib/speech'
import { startSpeechRecognition } from '@/lib/speech'
import { addPendingRecord, getPendingRecords } from '@/lib/storage'
import { syncPendingRecords } from '@/lib/sync'
import { formatTime } from '@/lib/time'

interface Props {
  event: Event
}

export default function CaptureScreen({ event }: Props) {
  const [listening, setListening] = useState(false)
  const [paused, setPaused] = useState(false)
  const [overwriteBib, setOverwriteBib] = useState<string | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [records, setRecords] = useState<PendingRecord[]>([])

  // Refs mirror state for async loop closures (avoid stale captures)
  const listeningRef = useRef(false)
  const pausedRef = useRef(false)
  const overwriteBibRef = useRef<string | null>(null)
  const stopRef = useRef<(() => void) | null>(null)

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

  function refreshRecords() {
    setRecords(getPendingRecords(event.id))
  }

  function saveRecord(bib: string, capturedAt: string, force = false): string {
    if (force) {
      const existing = getPendingRecords(event.id).filter((r) => r.bib_number !== bib)
      localStorage.setItem(`timing:pending:${event.id}`, JSON.stringify(existing))
    }
    const localId = uuidv4()
    addPendingRecord({ local_id: localId, event_id: event.id, bib_number: bib, finish_time: capturedAt, synced: false })
    refreshRecords()
    return localId
  }

  // handleResult uses refs for overwriteBib so async loop closures always read current value
  function handleResult(result: SpeechResult, isOneShot = false) {
    if (!result.bib) return // garbled — loop restarts naturally

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
      if (isOneShot) {
        setListening(false)
        listeningRef.current = false
      }
    }
  }

  async function runLoop() {
    while (listeningRef.current && !pausedRef.current) {
      await new Promise<void>((resolve) => {
        stopRef.current = startSpeechRecognition(
          'th-TH',
          (result) => { handleResult(result); resolve() },
          (_error: string) => resolve() // on error: restart loop
        )
      })
    }
  }

  function handleToggle() {
    if (!listening) {
      setListening(true)
      listeningRef.current = true
      runLoop()
    } else {
      setListening(false)
      listeningRef.current = false
      try { stopRef.current?.() } catch { /* already ended */ }
    }
  }

  function handleUndo(localId: string) {
    const updated = getPendingRecords(event.id).filter((r) => r.local_id !== localId)
    localStorage.setItem(`timing:pending:${event.id}`, JSON.stringify(updated))
    refreshRecords()
    setToasts((prev) => prev.filter((t) => t.type !== 'saved' || t.localId !== localId))
  }

  function handleDismiss(toastId: string) {
    setToasts((prev) => prev.filter((t) => t.toastId !== toastId))
    // Does NOT touch paused — only duplicate-toast handlers clear paused
  }

  function handleOverwrite(bib: string) {
    setOverwriteBib(bib)
    overwriteBibRef.current = bib
    setPaused(false)
    pausedRef.current = false
    setToasts((prev) => prev.filter((t) => !(t.type === 'duplicate' && t.bib === bib)))

    if (listeningRef.current) {
      runLoop() // continuous mode: loop picks up overwriteBibRef.current on next result
    } else {
      // Manual-only mode: one-shot recognition session
      setListening(true)
      listeningRef.current = true
      startSpeechRecognition(
        'th-TH',
        (result) => handleResult(result, true),
        (_error: string) => {
          setListening(false)
          listeningRef.current = false
          setOverwriteBib(null)
          overwriteBibRef.current = null
        }
      )
    }
  }

  function handleSkip() {
    setPaused(false)
    pausedRef.current = false
    setOverwriteBib(null)
    overwriteBibRef.current = null
    setToasts((prev) => prev.filter((t) => t.type !== 'duplicate'))
    if (listeningRef.current) runLoop()
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

      <div className="w-full text-center">
        <p className="text-xs text-gray-400 uppercase tracking-wider font-medium">ปล่อยตัว</p>
        <p className="text-2xl font-mono font-semibold mt-0.5">
          {formatTime(event.start_time, event.timezone)}
        </p>
      </div>

      <div className="flex-1 flex items-center justify-center">
        <MicButton listening={listening} onToggle={handleToggle} />
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

- [ ] **Step 4: Delete ConfirmCapture.tsx**

```bash
git rm components/ConfirmCapture.tsx
```

- [ ] **Step 5: Run all tests**

```bash
npx vitest run
```

Expected: all tests pass (capture-screen, capture-toast, mic-button, manual-bib-input, plus all pre-existing tests)

- [ ] **Step 6: Build check**

```bash
npm run build
```

Expected: clean build, no TypeScript errors

- [ ] **Step 7: Commit**

```bash
git add components/CaptureScreen.tsx __tests__/capture-screen.test.tsx
git commit -m "feat: capture flow v2 — continuous speech, auto-save, toast queue, persistent numpad"
```

---

## Task 5: Push and Verify

- [ ] **Step 1: Push to GitHub (triggers Vercel deploy)**

```bash
git push
```

- [ ] **Step 2: Verify on mobile**

1. Open Vercel URL on phone
2. Open a test event → Capture screen
3. Tap mic once → button turns red with pulse
4. Say "สองสามห้า" → black toast "บิบ 235 — HH:MM:SS" appears at top, auto-disappears after 2s
5. Record appears in FinishLog below
6. Say same bib again → yellow "235 ซ้ำ" toast appears, loop pauses
7. Tap "ข้าม" → toast disappears, loop resumes (button stays red)
8. Tap mic again → button goes black, loop stops
9. Tap "กรอกบิบเอง" → numpad opens, enter bib → tap บันทึก → numpad stays open, toast appears
10. Tap X on numpad → closes
