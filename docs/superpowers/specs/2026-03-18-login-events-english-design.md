# Spec: Login, Events Search, English UI, Capture Rename

**Date:** 2026-03-18
**Status:** Approved

---

## Overview

Three changes to the Timing app:
1. Home page becomes a PIN login page
2. Events list moves to `/events` with search + add-event modal
3. All UI text converted from Thai to English; capture page renamed to "Race Timing Record"

---

## 1. Login Page (`app/page.tsx`)

Replace the current home page state machine with a login page.

**Behaviour:**
- If `sessionStorage.getItem('authed') === '1'` → redirect to `/events` immediately (no login needed)
- Render: app name ("Timing"), Timer icon, PIN input (`type="password"`)
- PIN validated against `process.env.NEXT_PUBLIC_APP_PIN`
- On correct PIN: `sessionStorage.setItem('authed', '1')` → `router.push('/events')`
- On incorrect PIN: show inline error "Incorrect PIN"
- On submit with empty input: show "Enter PIN"

**No accounts, no backend auth call.** PIN is a shared secret in env var.

---

## 2. Events Page (`app/events/page.tsx`) — New

Protected route. State machine: `mode: 'list' | 'edit'`.

**Auth guard:**
- On mount: if `sessionStorage.getItem('authed') !== '1'` → `router.replace('/')`

**Logout:**
- Top-right button: "Logout"
- On click: `sessionStorage.removeItem('authed')` → `router.push('/')`

**Search + List:**
- On mount: fetch all events via `getEvents()`
- Search input filters events by name (case-insensitive, real-time)
- Each event row: name (tappable → `/event/[id]`), ✏️ edit button, 🗑️ delete button
- Delete flow: same as current home page (getEventStats → confirm → deleteEvent + clearEventCache)
- Loading state, error state with retry button, empty state all present

**When to show "+ Add Event" button:**
- Events list is empty (no events at all), OR
- Search query returns no matches

**Add Event Modal:**
- `showAddModal: boolean` state
- Renders full-screen modal overlay with `EventSetupForm`
- Modal has X close button (top-right) → closes modal, returns to search
- After `EventSetupForm` calls `onCreated(event)`:
  - Modal body switches to confirmation view:
    - Text: "Event created! Go to this event?"
    - Button: "Go to this page" → `router.push('/event/${event.id}')`
  - No auto-redirect; user must press the button

**Edit mode:**
- ✏️ button sets `mode = 'edit'`, `editingEvent = event`
- Renders `EventEditForm` (full page, same as current home page)
- `onSaved` → refresh events, `mode = 'list'`
- `onCancel` → `mode = 'list'`

---

## 3. English UI

All user-visible Thai text replaced with English across:

### Pages

| File | Key changes |
|---|---|
| `app/layout.tsx` | `lang="th"` → `lang="en"` |
| `app/event/[id]/page.tsx` | "ควบคุมงาน" → "Event Control"; nav links: "Race Timing Record", "Results", "Export", "Settings" |
| `app/event/[id]/capture/page.tsx` | title/heading → "Race Timing Record" |
| `app/event/[id]/results/page.tsx` | "ผลการแข่งขัน" → "Results" |
| `app/event/[id]/export/page.tsx` | "ส่งออก CSV" → "Export CSV" |
| `app/event/[id]/settings/page.tsx` | "ตั้งค่า" → "Settings" |

### Components

| File | Key changes |
|---|---|
| `components/EventSetupForm.tsx` | All labels, placeholders, buttons, errors |
| `components/EventEditForm.tsx` | All labels, placeholders, buttons, errors |
| `components/DistanceList.tsx` | Labels, buttons, placeholders |
| `components/CaptureScreen.tsx` | All UI text |
| `components/ManualBibInput.tsx` | Labels, buttons |
| `components/CaptureToast.tsx` | Toast messages |
| `components/ConflictsPanel.tsx` | Messages, buttons |
| `components/ResultsTable.tsx` | Column headers, filter labels, empty states |
| `components/AthleteImport.tsx` | Labels, buttons, error messages |
| `components/PrizeConfig.tsx` | Labels, buttons |
| `components/InstallPrompt.tsx` | Prompt text, buttons |

**Not changed:** Internal error strings in `lib/db.ts`, `lib/storage.ts` (never shown to users directly).

---

## 4. Capture Page Rename

- Nav link in `app/event/[id]/page.tsx`: "บันทึกเวลา" → **"Race Timing Record"**
- Page heading in `app/event/[id]/capture/page.tsx` (if any): → **"Race Timing Record"**
- Route stays at `/event/[id]/capture` (no URL change)

---

## Auth Persistence

- Storage: `sessionStorage` (key: `authed`, value: `'1'`)
- Session expires when browser tab is closed
- No cookie, no JWT, no server-side session

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

---

## Tests

### `__tests__/login-page.test.tsx`
1. Redirects to `/events` if already authed (sessionStorage has `authed=1`)
2. Shows "Incorrect PIN" on wrong PIN
3. Sets sessionStorage and redirects on correct PIN
4. Shows "Enter PIN" if submitted empty

### `__tests__/events-page.test.tsx`
1. Redirects to `/` if not authed
2. Renders event list after load
3. Filters events by search query
4. Shows "+ Add Event" when list is empty
5. Shows "+ Add Event" when search returns no matches
6. Opens add modal on "+ Add Event" click
7. Shows confirmation after EventSetupForm creates event
8. "Go to this page" navigates to `/event/[id]`
9. Edit button opens EventEditForm
10. Delete button shows confirmation with stats
11. Delete confirm removes event from list
12. Logout clears sessionStorage and redirects to `/`
