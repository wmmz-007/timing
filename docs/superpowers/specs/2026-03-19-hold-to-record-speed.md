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

- `onPointerDown` → calls `onPressStart(capturedAt)` where `capturedAt = new Date().toISOString()` is captured immediately at press time
- `onPointerUp` / `onPointerLeave` / `onPointerCancel` → calls `onPressEnd()` — stops recognition if no bib found yet (no save)
- If bib is found while holding → recognition stops and record is saved; subsequent release is a no-op

**`capturedAt` moves to caller** — `CaptureScreen` captures the timestamp on `onPointerDown` and passes it into `startSpeechRecognition()`. The speech module no longer creates `capturedAt` internally.

New `MicButton` props:
```typescript
interface Props {
  listening: boolean
  onPressStart: () => void
  onPressEnd: () => void
  disabled?: boolean
}
```

`CaptureScreen` captures `capturedAt` in `handlePressStart()` and passes it to `startSpeechRecognition`.

### 2. Interim Results

Enable `interimResults: true` in `startSpeechRecognition`. Loop over all incoming results:

```typescript
recognition.interimResults = true

recognition.onresult = (event: any) => {
  for (let i = event.resultIndex; i < event.results.length; i++) {
    const transcript = event.results[i][0].transcript
    const bib = parseTranscriptToBib(transcript)
    if (bib) {
      recognition.stop()
      onResult({ transcript, bib, capturedAt })
      return
    }
  }
}
```

As soon as a partial transcript contains a parseable bib number, stop immediately and call `onResult`. No waiting for the final result.

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

**On `CaptureScreen` mount** — start a recognition instance immediately and abort it after 500ms. This forces the browser to initialize the speech recognition subsystem before the operator needs it.

**After each bib save** — immediately pre-start a new recognition instance and store it in a ref (`prewarmRef`). On the next `onPressStart`, if `prewarmRef.current` is set, use that running instance (already initialized) instead of starting a fresh one. This eliminates startup lag for every capture after the first.

Pre-warm instance lifecycle:
- Starts silently after bib saved
- Consumed on next press → becomes the active recognition session
- If it fires `onerror` (timeout/silence) before being consumed → discarded, next press starts fresh
- On component unmount → stopped if still running

---

## Files Changed

| File | Change |
|------|--------|
| `lib/speech.ts` | Add `capturedAt: string` param; enable `interimResults: true`; loop all results; stop on first valid bib |
| `components/MicButton.tsx` | Replace `onToggle` with `onPressStart` + `onPressEnd`; pointer event handlers |
| `components/CaptureScreen.tsx` | Capture `capturedAt` on press; pass to speech; implement pre-warm logic |
| `__tests__/speech.test.ts` | Tests for interim result handling, capturedAt passthrough |
| `__tests__/mic-button.test.tsx` | Tests for onPressStart/onPressEnd behavior |

---

## Out of Scope

- Switching to a different speech recognition provider
- Always-on continuous mic mode
- Visual "mic ready" indicator
