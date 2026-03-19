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

`Space` keydown handler changes from keydown=start / keyup=stop to a single toggle-on-keydown. `Enter` keydown saves the current bib candidate.

---

### 2. Speech Recognition: Interim-Based Detection

**`lib/speech.ts` changes:**

- Remove `capturedAt` parameter — caller no longer passes it in
- Remove `onResult` callback — no longer waiting for `isFinal`
- Add unified `onInterim(transcript: string, bib: string | null)` callback, fired on every interim frame
- `parseTranscriptToBib` is called on every interim result
- `isFinal` is no longer used for saving; the recognition restart loop (`onend` → restart) is preserved unchanged

**Before:**
```
interim → discard
isFinal → parseTranscriptToBib → save
```

**After:**
```
interim → parseTranscriptToBib → onInterim(transcript, bib | null)
isFinal → ignored (recognition restarts via existing onend loop)
```

---

### 3. Bib Candidate State (`CaptureScreen.tsx`)

Two new state values replace the single `interimTranscript` flow:

```ts
interimBib: string | null         // latest bib from interim (updates every frame)
confirmedCapturedAt: string | null // timestamp from FIRST interim frame that found a bib
```

**Rules:**

- `onInterim` fires with `bib !== null`:
  - If `confirmedCapturedAt === null` → set `confirmedCapturedAt = new Date().toISOString()`
  - Always update `interimBib = bib` (so display shows the most complete number)
- `onInterim` fires with `bib === null`:
  - Update `interimTranscript` for display only; do not clear `interimBib` or `confirmedCapturedAt`
    (a partial result clearing the number would be disruptive mid-utterance)
- Recognition session ends (restart) → clear `interimBib` and `confirmedCapturedAt` so the next utterance starts fresh
- Operator presses Enter → `handleConfirm({ bib: interimBib, capturedAt: confirmedCapturedAt })`; clears both; mic stays open
- Operator closes mic → clear both; stop recognition

---

### 4. Bib Candidate Display (always visible)

The candidate box is always shown while mic is open. It never hides.

```
┌──────────────────────────┐
│  BIB   —                 │  ← no bib detected yet
└──────────────────────────┘

┌──────────────────────────┐
│  BIB   3                 │  ← first interim match
└──────────────────────────┘

┌──────────────────────────┐
│  BIB   321               │  ← updated as speech continues
│  กด Enter เพื่อบันทึก    │  ← hint shown when bib present
└──────────────────────────┘
```

When `interimBib` is null → show `—`
When `interimBib` is set → show the number + Enter prompt

---

### 5. MicButton Changes

- Replace `onPressStart` / `onPressEnd` props with single `onToggle`
- Label: `"Tap to Record"` (not listening) / `"Recording..."` (listening)
- Listening state visual unchanged: `bg-red-500 scale-95 animate-pulse`

---

### 6. Keyboard Shortcuts

| Key | Action |
|---|---|
| `Space` | Toggle mic open / close |
| `Enter` | Confirm bib candidate (only when `interimBib` is set) |

---

### 7. Preserved Behaviors

- Auto-restart loop on recognition session end (unchanged)
- Pre-warm on mount (unchanged)
- Duplicate bib detection and pause flow (unchanged)
- Manual bib input fallback (unchanged)
- Sync + storage layer (unchanged)

---

## Files Affected

| File | Change |
|---|---|
| `lib/speech.ts` | Remove `capturedAt` param + `onResult`; add `onInterim(transcript, bib)` |
| `components/CaptureScreen.tsx` | Toggle logic, interim bib state, Enter handler, candidate display |
| `components/MicButton.tsx` | Replace press/release props with `onToggle` |

---

## Out of Scope

- `recognition.continuous = true` (browser compatibility risk, not needed)
- Auto-save without Enter confirmation (false-save risk in noisy environments)
- Any changes to results, export, or sync flows
