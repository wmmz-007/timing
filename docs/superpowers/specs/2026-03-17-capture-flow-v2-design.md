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

**Start:** User presses the mic button once → enters LISTENING mode. Button turns red with a pulse animation.

**On each recognition result:**
- Timestamp is captured at the moment speech fires (same as before)
- Bib is parsed from transcript
- If bib is new → auto-save to Local Storage immediately → show flash toast
- If bib is duplicate → show yellow duplicate toast with action buttons
- Web Speech API restarts automatically → continues listening

**Stop:** User presses mic button again → exits LISTENING mode.

### Flash Toast (top of screen, fixed position)

- **New bib saved:** Black toast — "บิบ 235 — 10:42:05" — visible 1.5 seconds
  - Includes Undo button (tap within 1.5 s to remove the record)
- **Duplicate bib:** Yellow toast — "235 ซ้ำ" — stays until user acts
  - "อ่านใหม่" button: restarts recognition, result will overwrite existing record
  - "ข้าม" button: dismiss toast, continue listening

### Removed

`ConfirmCapture` component is removed entirely. The `pending` state and confirm flow in `CaptureScreen` are replaced by the toast mechanism.

---

## Manual Numpad v2

**Behaviour change:** After tapping "บันทึก", the numpad clears the input field but stays open. The user can immediately type the next bib number.

**Close button:** An X icon in the top-right corner of the numpad panel closes it. The existing "ยกเลิก" button is removed — X replaces it.

**On submit:** Shows the same flash toast as speech capture ("บิบ 235 — 10:42:05") for consistency.

---

## Components Affected

| Component | Change |
|---|---|
| `MicButton.tsx` | Add `continuous` prop; button toggles on/off instead of one-shot |
| `CaptureScreen.tsx` | Replace `pending`/confirm state with `toast` state; handle continuous mode |
| `ConfirmCapture.tsx` | **Deleted** |
| `ManualBibInput.tsx` | Remove `setOpen(false)` from submit; replace "ยกเลิก" with X close button |
| New: `CaptureToast.tsx` | Reusable toast for success (black) and duplicate (yellow) states |

---

## State Design (CaptureScreen)

```ts
type Toast =
  | { type: 'saved'; bib: string; time: string; localId: string }
  | { type: 'duplicate'; bib: string; newTime: string; existingTime: string }
  | null

// listening: true = continuous mode active
const [listening, setListening] = useState(false)
const [toast, setToast] = useState<Toast>(null)
const [records, setRecords] = useState<PendingRecord[]>([])
```

---

## Speech Recognition Continuity

`startSpeechRecognition` in `lib/speech.ts` currently runs one recognition session. For continuous mode, `CaptureScreen` calls it in a loop: after each result (or error), if `listening` is still `true`, restart recognition immediately. A ref tracks the stop function to avoid double-starts.

---

## Edge Cases

| Case | Behaviour |
|---|---|
| Speech returns no bib (garbled) | Silently ignored, recognition restarts |
| Undo tapped after toast disappears | Not possible — toast is gone, undo not accessible |
| Duplicate in continuous mode | Yellow toast pauses auto-restart until user acts (อ่านใหม่ / ข้าม) |
| Manual submit while speech listening | Both can run simultaneously; timestamps are independent |
