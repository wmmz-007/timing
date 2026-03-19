# Toggle Mic + Interim Bib Detection Design

**Date:** 2026-03-19
**Status:** Approved

## Problem

Current hold-to-record flow has a 1-2 second save delay because `speech.ts` ignores interim results and waits for `isFinal=true` before parsing a bib number. In a race timing context where runners cross the finish line rapidly, this delay is unacceptable.

Secondary issue: hold-to-record requires one hand to stay on the button, making it harder to operate during a busy finish.

## Goal

- Save bib records with near-zero perceived delay
- Keep mic open continuously during an active timing session
- Let the operator confirm each bib with a single keypress (Enter)
- `capturedAt` timestamp = moment bib is first detected in interim results (closest proxy to when speech began, which is closest to when runner crossed)

---

## Design

### 1. Mode Change: Toggle Instead of Hold

| | Before | After |
|---|---|---|
| Open mic | Hold button / hold Space | Press button or Space once |
| Close mic | Release button / release Space | Press button or Space again |
| Confirm bib | n/a | Press Enter |

`Space` keydown handler changes from keydown=start / keyup=stop to a single toggle-on-keydown.

**Ref cleanup in `CaptureScreen.tsx`:**
- Remove `spaceHeldRef` — debounce for hold-key repeats; dead code with toggle semantics
- Remove `pressStartHandlerRef` and `pressEndHandlerRef` — replace with:
  - `toggleHandlerRef` — points to `handleToggle`; used by Space keydown
  - `handleConfirmRef` — points to `handleConfirm`; used by Enter keydown. A ref is needed for the same stale-closure reason as the old refs: the `useEffect` has `[]` deps, so it must call the handler via ref to always invoke the current render's version.
- The keyboard `useEffect` is rewritten: Space keydown → `toggleHandlerRef.current()`; Enter keydown → `handleConfirmRef.current()`. No keyup handler needed.

---

### 2. Speech Recognition: Interim-Based Detection

**`lib/speech.ts` changes:**

- Remove `capturedAt` parameter — caller no longer passes it in
- Remove `onResult` callback — no longer waiting for `isFinal`
- Remove `resultFired` local variable — it existed to prevent `onend` from restarting after `recognition.stop()` was called mid-session; in the new design there is no mid-session stop triggered by a result, so `onend` always calls `onError('')`
- Remove `sessionEnded` local variable — same reason
- Add `onInterim(transcript: string, bib: string | null)` callback, fired on every `onresult` frame
- `parseTranscriptToBib` is called on every result frame
- Add `myGen: number` parameter — `startSpeechRecognition` passes it through so `CaptureScreen` can gate callbacks on `sessionGenRef.current === myGen`

**Before:**
```
interim → discard
isFinal → parseTranscriptToBib → recognition.stop() → onResult → save
onend (no result) → onError('') → CaptureScreen checks listeningRef → restart
```

**After:**
```
every result frame → parseTranscriptToBib → onInterim(transcript, bib | null)
  [gated in CaptureScreen: if sessionGenRef.current !== myGen, ignore]
onend → onError('') → CaptureScreen checks listeningRef.current
  → if true (mic open): restart (increment myGen, start new session)
  → if false (mic closed by toggle-off): do nothing
```

Note: when the operator calls `handleToggle` to close the mic, `listeningRef.current` is set to `false` before `recognition.stop()` is called. This means the subsequent `onend` → `onError('')` path sees `listeningRef.current === false` and does not restart.

---

### 3. Bib Candidate State (`CaptureScreen.tsx`)

Full state inventory for the new flow:

```ts
interimTranscript: string          // raw transcript text for display (kept from old design)
interimBib: string | null          // latest bib parsed from interim (updates every frame)
capturedAt: string | null          // timestamp from FIRST interim frame that found a bib
```

**Rules for `onInterim(transcript, bib)` (always gated on `myGen` guard first):**

- Always set `interimTranscript = transcript`
- If `bib !== null`:
  - If `capturedAt === null` → set `capturedAt = new Date().toISOString()`
  - Always set `interimBib = bib` (shows most complete number as speech continues: "3" → "32" → "321")
- If `bib === null`:
  - Do not clear `interimBib` or `capturedAt` (a partial/null frame must not wipe a pending candidate)

**Session restart (`onend` fires, listeningRef is true, recognition restarts):**
- `sessionGenRef` is incremented before starting the new session (new `myGen`) — this invalidates any stale `onInterim` calls from the old session
- Only clear `interimBib` and `capturedAt` if both are currently `null` (no pending candidate)
- If a candidate is pending, do NOT clear — it survives the ~300ms restart gap

**Enter key — confirm (`handleConfirm`):**
- Blocked when `paused === true` (duplicate toast is open)
- Blocked when `interimBib === null`
- Otherwise:
  1. Increment `sessionGenRef` (invalidates any in-flight `onInterim` from the current session, preventing candidate re-population during the save operation)
  2. Pass `{ bib: interimBib, capturedAt }` to save logic
  3. Clear `interimBib`, `capturedAt`, and `interimTranscript`
  4. Mic stays open (restart loop continues)

**Toggle-off (`handleToggle` when mic is open):**
- Set `listeningRef.current = false` first
- Increment `sessionGenRef` (invalidates any in-flight callbacks)
- Clear `interimBib`, `capturedAt`, `interimTranscript`
- Call `recognition.stop()`

---

### 4. Duplicate / Overwrite Flow

When `handleConfirm` detects a duplicate bib:
- Sets `paused = true` (existing behavior)
- Shows duplicate toast (existing behavior)
- `interimBib` and `capturedAt` are cleared at this point

When operator clicks **Overwrite** in the toast:
- Sets `overwriteBibRef` to the duplicate bib value
- Clears `paused`
- **Explicitly: does NOT call `startListeningSession`** — the toggle mic is already open; remove that call from the current `handleOverwrite` implementation
- Operator speaks the bib again; the next `handleConfirm` call sees `overwriteBibRef` matches and force-saves

When operator clicks **Cancel** in the toast:
- Clears `paused`; mic resumes; operator can speak a different bib

---

### 5. UI Layout

Two display areas below the mic button:

**A. Raw transcript** (kept from existing design): shows `interimTranscript` as small text — gives the operator feedback that the mic is hearing speech

**B. Candidate bib box** (new, always rendered while mic is open and not paused):

```
Mic open, not paused, no bib yet:
┌──────────────────────────┐
│  BIB   —                 │  interimBib = null → show dash
└──────────────────────────┘

Mic open, not paused, bib detected:
┌──────────────────────────┐
│  BIB   321               │  interimBib = "321"
│  กด Enter เพื่อบันทึก    │  hint shown only when interimBib is set
└──────────────────────────┘
```

- Hidden when mic is closed
- Hidden when `paused === true` (duplicate toast is active; showing both would be confusing)
- The bib number shown is `interimBib` (not the raw `interimTranscript`)

---

### 6. MicButton Changes

- Replace `onPressStart` / `onPressEnd` props with single `onToggle`
- Not-listening label: `"Tap to Record"` (was `"Hold to Record Bib"`)
- Listening label: `"Recording..."` (was `"Listening..."`)
- Listening visual unchanged: `bg-red-500 scale-95 animate-pulse`

---

### 7. Keyboard Shortcuts

| Key | Action |
|---|---|
| `Space` | Toggle mic open / close |
| `Enter` | Confirm bib (no-op if `paused` or `interimBib === null`) |

---

### 8. Preserved Behaviors

- Auto-restart loop on recognition session end (unchanged logic; `onend` → `onError('')` → CaptureScreen restarts if `listeningRef.current`)
- Pre-warm on mount (unchanged)
- Duplicate bib detection and pause flow (unchanged — paused blocks Enter)
- Manual bib input fallback (unchanged)
- Sync + storage layer (unchanged)

---

## Files Affected

| File | Change |
|---|---|
| `lib/speech.ts` | Remove `capturedAt` param, `onResult`, `resultFired`, `sessionEnded`; add `myGen` param; add `onInterim(transcript, bib)` callback |
| `components/CaptureScreen.tsx` | Toggle logic; `interimBib` + `capturedAt` + `interimTranscript` state; Enter handler (guarded); candidate box display; remove `spaceHeldRef` + `pressStartHandlerRef` + `pressEndHandlerRef`; add `toggleHandlerRef` + `handleConfirmRef`; remove `startListeningSession` call from overwrite path; increment `sessionGenRef` on confirm and toggle-off |
| `components/MicButton.tsx` | Replace press/release props with `onToggle`; update not-listening label to `"Tap to Record"` and listening label to `"Recording..."` |

---

## Out of Scope

- `recognition.continuous = true` (browser compatibility risk, not needed)
- Auto-save without Enter confirmation (false-save risk in noisy environments)
- Any changes to results, export, or sync flows
