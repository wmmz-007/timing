# Hold-to-Record Speed Improvement Spec

## Problem

The "Hold to Record Bib" button has two latency issues in real race conditions:

1. **Startup lag** — Web Speech API takes 1-2 seconds to initialize after button press before mic is ready
2. **Post-speech delay** — Recognition waits for a "final" result, adding ~1-2 seconds after user finishes speaking

In race timing, every second matters. The operator needs to press → speak → done with minimal delay.

## Goal

Reduce total round-trip time from button press to saved record, targeting < 1 second post-speech response.

---

## Design

### 1. Hold UX + Timestamp at Press

**Change `MicButton`** from a toggle (`onToggle`) to a hold interface (`onPressStart` + `onPressEnd`):

- `onPointerDown` → calls `onPressStart()` — `MicButton` passes no arguments
- `onPointerUp` / `onPointerLeave` / `onPointerCancel` → calls `onPressEnd()` — stops recognition if no bib found yet (no save)
- If bib is found while holding → recognition stops and record is saved; subsequent release is a no-op

**`capturedAt` is captured in `CaptureScreen.handlePressStart()`** — `CaptureScreen` calls `new Date().toISOString()` at the moment `onPressStart` fires and passes it into `startSpeechRecognition()`. The speech module no longer creates `capturedAt` internally.

New `MicButton` props:
```typescript
interface Props {
  listening: boolean
  onPressStart: () => void
  onPressEnd: () => void
  disabled?: boolean
}
```

**`handleOverwrite` one-shot path** — `CaptureScreen.handleOverwrite()` calls `startSpeechRecognition` directly (not via `MicButton`). In this path, `capturedAt = new Date().toISOString()` is captured at the moment the user presses the Overwrite button in the toast, since there is no `MicButton` pointer-down event available.

### 2. Interim Results

Enable `interimResults: true` in `startSpeechRecognition`. `recognition.continuous` stays `false` (default) — the session still auto-stops after one final result. Loop over all incoming results (both interim and final):

```typescript
recognition.interimResults = true
// recognition.continuous stays false (default)

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
```

As soon as any transcript (interim or final) contains a parseable bib number, stop immediately and call `onResult`.

**No-bib `onend` handler** — if a final result arrives with no parseable bib, no `onResult` call is made. The `onend` event fires naturally when the session ends. `startSpeechRecognition` registers an `onend` handler that calls `onError('')` to trigger loop restart — but only if `onResult` has not already fired (`resultFired` guard prevents spurious restart after successful bib capture):

```typescript
recognition.onend = () => {
  if (!resultFired) onError('') // triggers loop restart; skipped if bib already saved
}
```

`startSpeechRecognition` signature change — `capturedAt` is now a parameter:

```typescript
export function startSpeechRecognition(
  lang: string,
  capturedAt: string,
  onResult: (result: SpeechResult) => void,
  onError: (error: string) => void
): () => void
```

### 3. Pre-warm

**On `CaptureScreen` mount** — start a recognition instance immediately and stop it via `setTimeout(() => prewarm.stop(), 500)`. This forces the browser to initialize the speech recognition subsystem before the operator's first press. The 500ms abort is best-effort; if `onend` fires earlier, that is fine.

**After each bib save** — immediately pre-start a new recognition instance and store it in `prewarmRef`. On the next `onPressStart`, if `prewarmRef.current` is set, that instance is already running — `CaptureScreen` calls `onResult` as normal through its handlers. The pre-warm instance is "consumed" (ref cleared) when the first result or error arrives.

**Pre-warm `onend` handler** — the pre-warm instance registers both `onerror` and `onend` handlers that null `prewarmRef.current` (unless already consumed), so a dead instance is never left in the ref:

```typescript
prewarm.onerror = () => { if (prewarmRef.current === prewarm) prewarmRef.current = null }
prewarm.onend   = () => { if (prewarmRef.current === prewarm) prewarmRef.current = null }
```

Pre-warm instance lifecycle:
- Starts silently after bib saved (or on mount)
- Consumed on next press → becomes the active recognition session
- If `onerror` or `onend` fires before consumed → ref nulled, next press starts fresh
- On component unmount → `prewarmRef.current?.stop()` called in `useEffect` cleanup

---

## Files Changed

| File | Change |
|------|--------|
| `lib/speech.ts` | Add `capturedAt: string` param; enable `interimResults: true`; loop all results; stop on first valid bib; add `onend` → `onError('')` handler |
| `components/MicButton.tsx` | Replace `onToggle` with `onPressStart` + `onPressEnd`; pointer event handlers |
| `components/CaptureScreen.tsx` | Capture `capturedAt` on press; pass to speech; implement pre-warm logic; fix `handleOverwrite` capturedAt |
| `__tests__/speech.test.ts` | Tests for interim result handling, capturedAt passthrough, onend→onError |
| `__tests__/mic-button.test.tsx` | Tests for onPressStart/onPressEnd behavior |
| `__tests__/capture-screen.test.tsx` | Update mock signature for capturedAt param; update handleOverwrite one-shot path; add pre-warm lifecycle tests |

---

## Out of Scope

- Switching to a different speech recognition provider
- Always-on continuous mic mode
- Visual "mic ready" indicator
