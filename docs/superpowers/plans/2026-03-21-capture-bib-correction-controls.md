# Capture BIB Correction Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add inline BIB correction controls (`⌫`, `Clear`, `พูดใหม่`) while keeping microphone behavior continuous (open until manually closed) on the capture screen.

**Architecture:** Extend `CaptureScreen` state with a manual-edit lock (`manualEditActive`) so user edits are not overwritten by interim speech frames. Add three correction handlers that mutate candidate state in place and a restart helper for `พูดใหม่` that keeps listening mode active. Update tests in `capture-screen.test.tsx` using TDD to validate continuous mic behavior and correction controls.

**Tech Stack:** React 19, Next.js App Router, TypeScript, Vitest, Testing Library, Web Speech API integration via `lib/speech.ts`.

---

## File Structure

- Modify: `components/CaptureScreen.tsx`
  - Add manual-edit lock state/ref
  - Add correction handlers (`handleBackspaceCandidate`, `handleClearCandidate`, `handleSpeakAgain`)
  - Gate speech-driven `interimBib` updates behind lock
  - Render small control buttons near BIB candidate box
- Modify: `__tests__/capture-screen.test.tsx`
  - Add new failing tests for correction controls and manual edit lock behavior
  - Keep existing flow tests green
- Optional modify: `components/MicButton.tsx`
  - Only if label hint must clarify continuous mode (avoid unless necessary)

---

### Task 1: Add failing tests for correction controls and lock behavior

**Files:**
- Modify: `__tests__/capture-screen.test.tsx`
- Test command: `npm test -- __tests__/capture-screen.test.tsx`

- [ ] **Step 1: Write failing test — backspace removes last digit**

```ts
it('backspace removes last candidate digit', async () => {
  render(<CaptureScreen event={event} distances={[]} athletes={athletes} />)
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /กดเปิดไมค์/i })) })
  await act(async () => { capturedOnInterim?.('4567', '4567') })
  fireEvent.click(screen.getByRole('button', { name: /backspace bib/i }))
  expect(screen.getByTestId('bib-candidate-box')).toHaveTextContent('456')
})
```

- [ ] **Step 2: Write failing test — clear resets candidate**

```ts
it('clear resets bib candidate to dash', async () => {
  render(<CaptureScreen event={event} distances={[]} athletes={athletes} />)
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /กดเปิดไมค์/i })) })
  await act(async () => { capturedOnInterim?.('4567', '4567') })
  fireEvent.click(screen.getByRole('button', { name: /clear bib/i }))
  expect(screen.getByTestId('bib-candidate-box')).toHaveTextContent('—')
})
```

- [ ] **Step 3: Write failing test — speech does not overwrite while manual lock active**

```ts
it('manual lock blocks new speech bib until speak-again', async () => {
  render(<CaptureScreen event={event} distances={[]} athletes={athletes} />)
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /กดเปิดไมค์/i })) })
  await act(async () => { capturedOnInterim?.('4567', '4567') })
  fireEvent.click(screen.getByRole('button', { name: /backspace bib/i }))
  await act(async () => { capturedOnInterim?.('1234', '1234') })
  expect(screen.getByTestId('bib-candidate-box')).toHaveTextContent('456')
})
```

- [ ] **Step 4: Write failing test — speak-again unlocks and accepts fresh speech**

```ts
it('speak again clears lock and accepts fresh speech', async () => {
  render(<CaptureScreen event={event} distances={[]} athletes={athletes} />)
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /กดเปิดไมค์/i })) })
  await act(async () => { capturedOnInterim?.('4567', '4567') })
  fireEvent.click(screen.getByRole('button', { name: /clear bib/i }))
  fireEvent.click(screen.getByRole('button', { name: /speak again/i }))
  await act(async () => { capturedOnInterim?.('1234', '1234') })
  expect(screen.getByTestId('bib-candidate-box')).toHaveTextContent('1234')
})
```

- [ ] **Step 5: Run tests to verify RED**

Run: `npm test -- __tests__/capture-screen.test.tsx`
Expected: FAIL in new tests (buttons/lock behavior not implemented yet).

- [ ] **Step 6: Commit test-only changes (optional checkpoint)**

```bash
git add __tests__/capture-screen.test.tsx
git commit -m "test: add failing specs for bib correction controls"
```

---

### Task 2: Implement manual-edit lock and correction handlers

**Files:**
- Modify: `components/CaptureScreen.tsx`
- Test: `__tests__/capture-screen.test.tsx`

- [ ] **Step 1: Add lock state + ref**

Add:

```ts
const [manualEditActive, setManualEditActive] = useState(false)
const manualEditActiveRef = useRef(false)
useEffect(() => { manualEditActiveRef.current = manualEditActive }, [manualEditActive])
```

- [ ] **Step 2: Gate speech updates behind lock**

In speech `onInterim` callback, only update `interimBib` when `manualEditActiveRef.current === false`.
Transcript can continue updating for operator visibility.

- [ ] **Step 3: Add handlers**

Implement:
- `handleBackspaceCandidate()`
- `handleClearCandidate()`
- `handleSpeakAgain()`

Rules:
- No-op if `pausedRef.current` or `!listeningRef.current`
- `⌫` and `Clear` set `manualEditActive=true`
- `พูดใหม่` clears candidate + transcript, sets `manualEditActive=false`, restarts listening session (stop current -> start new)

- [ ] **Step 4: Keep Enter confirm behavior intact**

`handleConfirm()` must save what is currently shown in candidate (`interimBib`), including manual edits.

- [ ] **Step 5: Run tests to verify GREEN**

Run: `npm test -- __tests__/capture-screen.test.tsx`
Expected: PASS including newly added cases.

- [ ] **Step 6: Commit implementation**

```bash
git add components/CaptureScreen.tsx __tests__/capture-screen.test.tsx
git commit -m "feat: add inline bib correction controls with manual edit lock"
```

---

### Task 3: UI polish and accessibility labels

**Files:**
- Modify: `components/CaptureScreen.tsx`
- Optional modify: `components/MicButton.tsx`

- [ ] **Step 1: Render compact controls near BIB box**

Add button row while `listening && !paused` with labels and ARIA:
- `⌫` with `aria-label="backspace bib"`
- `Clear` with `aria-label="clear bib"`
- `พูดใหม่` with `aria-label="speak again"`

- [ ] **Step 2: Show edit-lock hint (optional small text)**

When `manualEditActive`, show subtle text: `แก้มืออยู่`.

- [ ] **Step 3: Run targeted tests**

Run: `npm test -- __tests__/capture-screen.test.tsx`
Expected: PASS.

- [ ] **Step 4: Commit UI polish**

```bash
git add components/CaptureScreen.tsx
git commit -m "ui: add compact bib correction buttons on capture screen"
```

---

### Task 4: Final verification

**Files:**
- Verify repository-wide integrity

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 2: Run production build**

Run: `npm run build`
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 3: Final commit if verification tweaks required**

```bash
git add -A
git commit -m "chore: finalize bib correction controls verification fixes"
```

---

## References

- Spec: `docs/superpowers/specs/2026-03-21-capture-bib-correction-controls-design.md`
- Related implementation area: `components/CaptureScreen.tsx`
- Skills: @superpowers:test-driven-development @superpowers:verification-before-completion

