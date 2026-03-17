# Capture Flow v2 — Design Spec
**Date:** 2026-03-17
**Status:** Approved

---

## Overview

Redesign the Race Capture screen for high-throughput scenarios where multiple athletes finish simultaneously. The key changes are: (1) continuous speech mode that auto-saves without a confirm step, and (2) a persistent manual numpad that stays open between entries.

---

## Problem Statement

Current flow requires: press mic → speak → read confirm card → tap confirm → repeat. This is too slow when 5–10 athletes finish within seconds of each other. The confirm step adds ~2–3 seconds per bib, creating a backlog.

---

## Capture Flow v2

### Continuous Speech Mode

**Start:** User presses the mic button once → `CaptureScreen` sets `listening = true`. Button turns red with a pulse animation.

**On each recognition result:**
- Timestamp is captured at the moment speech fires (inside `onresult`)
- Bib is parsed from transcript
- If bib is new → auto-save to Local Storage immediately → push success toast
- If bib is duplicate → set `paused = true` → push duplicate toast (loop waits)
- If transcript yields no bib → silently ignored → recognition restarts immediately

**Stop:** User presses mic button again → `CaptureScreen` sets `listening = false` → loop exits.

### Continuous Loop Strategy

`CaptureScreen` owns the loop and calls `startSpeechRecognition` directly. `MicButton` is a pure display/toggle button — it has no knowledge of the recognition API.

Loop pseudocode:
```ts
async function runLoop() {
  while (listeningRef.current && !pausedRef.current) {
    await new Promise<void>((resolve) => {
      // startSpeechRecognition returns the stop fn synchronously,
      // but onresult/onerror always fire asynchronously (next event loop tick),
      // so stopRef.current is always assigned before any callback fires.
      stopRef.current = startSpeechRecognition(
        'th-TH',
        (result) => { handleResult(result); resolve() },
        () => resolve() // on error: restart
      )
    })
  }
}
```

`listeningRef` and `pausedRef` are refs that mirror the corresponding state values, so the async loop closure reads current values without stale captures.

Calling stop on an already-ended session is wrapped in try/catch (no-op). The existing 4-second safety timeout in `MicButton` is removed — not needed in continuous mode.

**Acknowledged limitation:** There is a ~100–300 ms gap between `onresult` firing and the next session becoming active. A runner finishing in this gap will not be captured by voice. The manual numpad is the fallback for missed bibs.

### Flash Toast

Each toast has a stable `toastId` (uuid) used for all callbacks — no array-index-based operations.

```ts
type Toast =
  | { toastId: string; type: 'saved'; bib: string; finishTime: string; localId: string }
  | { toastId: string; type: 'duplicate'; bib: string; newTime: string; existingTime: string }
```

**Success toast (black):** "บิบ 235 — 10:42:05"
- `finishTime` is a raw ISO timestamp; `CaptureToast` formats it for display via `formatTime`
- Auto-dismisses after 2 seconds (keyed by `toastId`, safe against queue mutations)
- Undo button: removes record by `localId` from Local Storage, removes toast from queue

**Duplicate toast (yellow):** "235 ซ้ำ — บันทึกไปแล้ว 10:41:58"
- Stays until user acts; does not auto-dismiss
- **"อ่านใหม่"** — sets `overwriteBib` to the duplicate bib string, removes toast, clears `paused`, restarts loop. On the next recognition result: if bib matches `overwriteBib`, save with force=true; then clear `overwriteBib` regardless of which bib was spoken.
- **"ข้าม"** — removes toast, clears `paused` **and** clears `overwriteBib`, restarts loop. Existing record is kept.

**Success-toast dismissal does not affect `paused`:** `onDismiss` only removes the toast from the queue. Clearing `paused` is the exclusive responsibility of the duplicate-toast action handlers ("อ่านใหม่" / "ข้าม").

### Manual Entry Duplicate

When a manually entered bib is a duplicate, the same duplicate toast is shown.

**"อ่านใหม่" when `listening = true` (continuous mode active):** Sets `overwriteBib` to the duplicate bib, clears `paused`, removes toast. The existing loop picks up `overwriteBib` on the next result; after that result (regardless of which bib was spoken) both `overwriteBib` and any related state are cleared.

**"อ่านใหม่" when `listening = false` (manual-only mode):** Sets `overwriteBib`, then calls `startSpeechRecognition` directly (not `runLoop`) — a single one-shot session. `listening` is temporarily set to `true` so MicButton shows the active (red) state. When the result fires, the bib is saved (with force=true if it matches `overwriteBib`), then `overwriteBib` is cleared, `listening` is set back to `false`, and MicButton returns to idle. On error, same cleanup occurs with no save.

**"ข้าม"** in both modes: removes toast, clears `paused`, clears `overwriteBib`, leaves `listening` unchanged.

---

## Manual Numpad v2

**Behaviour change:** After tapping "บันทึก", the numpad clears the input field but stays open. The user can immediately type the next bib number.

**Close button:** An X icon in the top-right corner of the numpad panel closes it. "ยกเลิก" is removed.

**On submit:** Pushes the same success toast as speech capture (including undo support).

**Duplicate handling:** Same duplicate toast path (described above).

---

## MicButton v2 Props

```ts
interface MicButtonProps {
  listening: boolean         // controlled — CaptureScreen owns this state
  onToggle: () => void       // called when button is pressed
  disabled?: boolean
}
// onResult and onError props are removed — CaptureScreen handles recognition directly
```

---

## State Design (CaptureScreen)

```ts
const [listening, setListening] = useState(false)
const [paused, setPaused] = useState(false)
const [overwriteBib, setOverwriteBib] = useState<string | null>(null)
const [toasts, setToasts] = useState<Toast[]>([])
const [records, setRecords] = useState<PendingRecord[]>([])

const listeningRef = useRef(false)   // mirrors listening state for loop closure
const pausedRef = useRef(false)      // mirrors paused state for loop closure
const stopRef = useRef<(() => void) | null>(null)
```

---

## Components Affected

| Component | Change |
|---|---|
| `MicButton.tsx` | Fully controlled: remove internal state and recognition calls; accept `listening` + `onToggle` props; remove 4-second timeout |
| `CaptureScreen.tsx` | Replace `pending`/confirm state with toast queue + continuous loop |
| `ConfirmCapture.tsx` | **Deleted** |
| `ManualBibInput.tsx` | Remove `setOpen(false)` from submit; replace "ยกเลิก" with X close button |
| `CaptureToast.tsx` | **New** |
| `FinishLog.tsx` | No changes — receives `records[]` as before |

### CaptureToast Props

```ts
interface CaptureToastProps {
  toasts: Toast[]
  timezone: string
  onUndo: (localId: string) => void
  onOverwrite: (bib: string) => void
  onSkip: () => void
  onDismiss: (toastId: string) => void   // used for success-toast auto-dismiss; keyed by stable toastId
}
```

---

## Edge Cases

| Case | Behaviour |
|---|---|
| Speech returns no bib (garbled) | Silently ignored, recognition restarts |
| New bib arrives while success toast visible | Both toasts in queue; each has own undo via distinct `localId` |
| Duplicate toast shown; user taps "ข้าม" | `paused` cleared, `overwriteBib` cleared, loop restarts |
| "อ่านใหม่" then user speaks different bib | Saved normally; `overwriteBib` cleared regardless |
| Manual duplicate, `listening = false` | One-shot recognition session; `listening` temporarily true; reverts after result |
| Stop button pressed during duplicate pause | `listening = false`; duplicate toast stays until explicitly dismissed |
| Auto-dismiss fires while duplicate toast paused | Only success toast removed from queue; `paused` unchanged |
| Call stop on already-ended session | try/catch, no-op |
