# Capture BIB Correction Controls Design

**Date:** 2026-03-21  
**Status:** Draft (approved in brainstorming, pending final user review)  
**Scope:** `CaptureScreen` continuous listening behavior + inline BIB correction controls

## Goal

Improve reliability during live timing when speech recognition misses or mutates digits.

The operator should keep the mic open continuously and correct BIB quickly without leaving the screen.

## Requirements (from user)

1. Mic must NOT auto-open when entering capture page.
2. Press mic button once = open mic and keep it open continuously until manually closed.
3. Avoid "jumping" mic state on its own (auto reconnect is allowed only while listening remains true).
4. Add in-place correction controls in capture UI:
   - `⌫` remove last digit
   - `Clear` clear all current candidate digits
   - `พูดใหม่` clear candidate and restart listening immediately
5. Keep race flow continuous on MacBook operation (minimal interruption).

## UX Design

### A. Continuous Mic State

- `listening=false` on initial page load.
- Entering capture page does not call start listening automatically.
- `handleToggle()` becomes the only open/close source.
- When recognition session ends/errors while `listening=true`, system restarts recognition internally (reconnect behavior), but does not flip UI back to closed.

### B. Inline BIB Correction Controls

Show a compact row of controls inside/under BIB candidate area while `listening && !paused`:

- `⌫`: mutate displayed candidate by removing the last digit.
- `Clear`: candidate becomes empty (`—` in UI).
- `พูดใหม่`: clear candidate/transcript and restart recognition session immediately.

### C. Manual Edit Lock

To prevent speech frames from instantly overwriting user edits:

- Add `manualEditActive` state/ref.
- On `⌫` or `Clear`, set `manualEditActive=true`.
- While `manualEditActive=true`, ignore speech-driven updates to `interimBib`.
- On `พูดใหม่`, reset `manualEditActive=false`, clear values, and accept speech updates again.

### D. Confirm Behavior

- `Enter` still saves the currently displayed BIB candidate.
- If user edited candidate manually, saved value must reflect edited candidate.

## State/Data Flow Changes

Add state/ref in capture component:

- `manualEditActive` (`useState<boolean>`) and mirror ref for async callbacks.

Recognition callback behavior:

- `onInterim(transcript, bib)` always updates transcript display.
- `interimBib` updates only when `manualEditActive=false`.

Control handlers:

- `handleBackspaceCandidate()`
- `handleClearCandidate()`
- `handleSpeakAgain()`

All handlers are no-op when paused or mic is closed.

## Error Handling

- If restart in `พูดใหม่` fails, keep mic state visible and surface existing capture error behavior.
- No destructive reset of saved records.

## Test Plan (required)

1. Mic closed on initial render (no auto-open).
2. Toggle opens and remains open until manual close.
3. `⌫` removes last candidate digit.
4. `Clear` resets candidate to dash.
5. While manual edit lock is active, speech callback does not overwrite edited candidate.
6. `พูดใหม่` clears lock and allows fresh speech candidate.
7. Enter save persists currently visible candidate after manual edits.

## Files Expected to Change

- `components/CaptureScreen.tsx`
- `__tests__/capture-screen.test.tsx`
- (optional, if label tweaks needed) `components/MicButton.tsx`

## Out of Scope

- New NLP parsing rules
- Auto-correction by dictionary/model
- Separate moderation/review queue
