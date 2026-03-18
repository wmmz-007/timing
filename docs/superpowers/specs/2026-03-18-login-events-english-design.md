# Spec: Login, Events Search, English UI, Capture Rename

**Date:** 2026-03-18
**Status:** Approved

---

## Overview

Three changes to the Timing app:
1. Home page becomes a PIN login page
2. Events list moves to `/events` with search + add-event modal
3. All UI text converted from Thai to English; capture page nav link renamed to "Race Timing Record"

---

## 1. Login Page (`app/page.tsx`)

Replace the current home page state machine with a login page.

**Must be `'use client'`.** All `sessionStorage` reads must happen inside `useEffect` (not at module scope or during SSR render) to avoid server-side crashes.

**Behaviour:**
- On mount (`useEffect`): if `sessionStorage.getItem('authed') === '1'` → `router.replace('/events')`
- Render: app name ("Timing"), Timer icon, PIN input (`type="password"`, `autoFocus`)
- PIN validated against `process.env.NEXT_PUBLIC_APP_PIN`
- On correct PIN: `sessionStorage.setItem('authed', '1')` → `router.push('/events')`
- On incorrect PIN: show inline error "Incorrect PIN"
- On submit with empty input: show "Enter PIN"
- If `NEXT_PUBLIC_APP_PIN` is absent or empty string: treat every non-empty submission as incorrect (login is always blocked — deployments must set the env var)

**No accounts, no backend auth call.** PIN is a shared secret in env var.

---

## 2. Events Page (`app/events/page.tsx`) — New

Must be `'use client'`. All `sessionStorage` reads inside `useEffect`.

State machine: `mode: 'list' | 'edit'` plus `showAddModal: boolean`.

**Auth guard:**
- On mount (`useEffect`): if `sessionStorage.getItem('authed') !== '1'` → `router.replace('/')`

**Logout:**
- Top-right button: "Logout"
- On click: `sessionStorage.removeItem('authed')` → `router.push('/')`

**Search + List:**
- On mount: fetch all events via `getEvents()`
- Search input filters events by name (case-insensitive substring match, real-time, no debounce needed)
- Each event row: name (tappable → `router.push('/event/${id}')`) + ✏️ edit button + 🗑️ delete button
- Delete flow: same optimistic pattern as current `app/page.tsx` — `getEventStats` → inline confirmation panel → `deleteEvent(id)` + `clearEventCache(id)` → `setEvents(prev => prev.filter(e => e.id !== id))`
  - Note: `clearEventCache` touches `localStorage` (not sessionStorage); this is unrelated to the auth session
- Loading state ("Loading..."), error state ("Failed to load. Retry") with retry button, empty state ("No events yet")

**"+ Add Event" button:**
- Always visible — shown at the bottom of the page at all times (regardless of whether events exist or search has results)
- Additionally shown inline in the empty state and in the "no search results" state as a prominent CTA
- Clicking it sets `showAddModal = true`

**Add Event Modal:**
- Full-screen overlay on top of the events page
- Two internal states: `'form'` (default) and `'created'`
- **Form state:** renders `EventSetupForm`. X button (top-right of modal) closes modal (`showAddModal = false`), returns to search
- **Created state:** triggered when `EventSetupForm` calls `onCreated(event: Event)`
  - Shows: "Event created!" heading + event name
  - Shows: "Go to this page" button → `router.push('/event/${event.id}')`
  - X button still present — closes modal and refreshes event list (`loadEvents()`), returns to search

**Edit mode:**
- ✏️ button sets `mode = 'edit'`, `editingEvent = event`
- Renders `EventEditForm` with props: `{ event: editingEvent, onSaved: handleEditSaved, onCancel: handleEditCancel }`
  - `onSaved: () => void` — calls `loadEvents()` then `setMode('list')`, clears `editingEvent`
  - `onCancel: () => void` — sets `mode = 'list'`, clears `editingEvent`
- Full page (no modal), same pattern as current `app/page.tsx`

---

## 3. English UI + Capture Rename

All user-visible Thai text replaced with English. `app/page.tsx` is replaced entirely (Thai strings disappear naturally — no separate translation needed).

### Pages

| File | Key changes |
|---|---|
| `app/layout.tsx` | `lang="th"` → `lang="en"` |
| `app/event/[id]/page.tsx` | Title: "Event Control"; nav links: "Race Timing Record", "Results", "Export", "Settings" |
| `app/event/[id]/capture/page.tsx` | Any heading/title → "Race Timing Record" |
| `app/event/[id]/results/page.tsx` | Title → "Results" |
| `app/event/[id]/export/page.tsx` | Title → "Export CSV" |
| `app/event/[id]/settings/page.tsx` | Title → "Settings" |

### Components

| File | Key changes |
|---|---|
| `components/EventSetupForm.tsx` | All labels, placeholders, buttons, errors |
| `components/EventEditForm.tsx` | All labels, placeholders, buttons, errors (including "กำลังโหลด...", "บันทึก", "ยกเลิก", inline errors) |
| `components/DistanceList.tsx` | Labels, buttons, placeholders |
| `components/CaptureScreen.tsx` | All UI text |
| `components/ManualBibInput.tsx` | Labels, buttons |
| `components/CaptureToast.tsx` | Toast messages |
| `components/ConflictsPanel.tsx` | Messages, buttons |
| `components/ResultsTable.tsx` | Column headers, filter labels, empty states |
| `components/AthleteImport.tsx` | Labels, buttons, error messages |
| `components/PrizeConfig.tsx` | Labels, buttons |
| `components/InstallPrompt.tsx` | Prompt text, buttons |

**Not changed:** Internal strings in `lib/db.ts`, `lib/storage.ts` (never shown to users directly).

---

## Auth Persistence

- Storage: `sessionStorage` (key: `authed`, value: `'1'`)
- Session expires when browser tab is closed
- No cookie, no JWT, no server-side session
- Env var: `NEXT_PUBLIC_APP_PIN` — must be set in `.env.local` before running. Add to `.env.example` as `NEXT_PUBLIC_APP_PIN=your_pin_here`

---

## Files Changed/Created

| Action | File |
|---|---|
| Replace | `app/page.tsx` → PIN login page |
| New | `app/events/page.tsx` → search + event state machine |
| Edit | `app/layout.tsx` |
| Edit | `app/event/[id]/page.tsx` |
| Edit | `app/event/[id]/capture/page.tsx` |
| Edit | `app/event/[id]/results/page.tsx` |
| Edit | `app/event/[id]/export/page.tsx` |
| Edit | `app/event/[id]/settings/page.tsx` |
| Edit | `components/EventSetupForm.tsx` |
| Edit | `components/EventEditForm.tsx` |
| Edit | `components/DistanceList.tsx` |
| Edit | `components/CaptureScreen.tsx` |
| Edit | `components/ManualBibInput.tsx` |
| Edit | `components/CaptureToast.tsx` |
| Edit | `components/ConflictsPanel.tsx` |
| Edit | `components/ResultsTable.tsx` |
| Edit | `components/AthleteImport.tsx` |
| Edit | `components/PrizeConfig.tsx` |
| Edit | `components/InstallPrompt.tsx` |
| Create | `.env.example` (add `NEXT_PUBLIC_APP_PIN=your_pin_here`) |

---

## Tests

### `__tests__/login-page.test.tsx`

Mock `next/navigation` → `{ useRouter: () => ({ push: mockPush, replace: mockReplace }) }`.
Mock `sessionStorage` via `vi.stubGlobal`.

1. Redirects to `/events` (`router.replace`) if sessionStorage has `authed=1` (checked in useEffect on mount)
2. Shows "Incorrect PIN" when wrong PIN submitted (mock `NEXT_PUBLIC_APP_PIN = '1234'`, submit `'9999'`)
3. Sets `sessionStorage.authed = '1'` and calls `router.push('/events')` on correct PIN
4. Shows "Enter PIN" when form submitted with empty input
5. If `NEXT_PUBLIC_APP_PIN` is empty string, any non-empty submission shows "Incorrect PIN"

### `__tests__/events-page.test.tsx`

Mock `@/lib/db` → `{ getEvents, getEventStats, deleteEvent }`.
Mock `@/lib/storage` → `{ clearEventCache }`.
Mock `next/navigation` → `{ useRouter: () => ({ push: mockPush, replace: mockReplace }) }`.
Mock `EventSetupForm` and `EventEditForm` as stubs.
Set `sessionStorage.setItem('authed', '1')` in `beforeEach`.

1. Redirects to `/` (`router.replace`) if sessionStorage does not have `authed=1`
2. Renders event names after `getEvents` resolves (mock returns 2 events: "Marathon 2026", "5K Fun Run")
3. Filters events case-insensitively: type "marathon" in search → only "Marathon 2026" visible, "5K Fun Run" not in DOM
4. Shows "+ Add Event" button when `getEvents` returns empty array
5. Shows "+ Add Event" button prominently when search query returns no matches (e.g. type "zzz" with 2 events loaded)
6. "+ Add Event" button click opens modal (EventSetupForm stub visible)
7. EventSetupForm stub calling `onCreated` with mock event switches modal to confirmation: "Event created!" heading and "Go to this page" button visible
8. "Go to this page" button calls `router.push('/event/new-1')`
9. X button on confirmation view closes modal and calls `getEvents` again (loadEvents refresh)
10. ✏️ edit button click renders EventEditForm stub
11. Delete button shows confirmation panel — mock `getEventStats` returns `{ recordCount: 5, athleteCount: 3 }` — assert confirmation text contains "5" and "3"
12. Confirm delete: calls `deleteEvent` and `clearEventCache` — event row removed from DOM optimistically (no re-fetch)
13. Logout button clears `sessionStorage.authed` and calls `router.push('/')`
