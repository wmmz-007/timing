# Spec: Per-Event Password Authentication

**Date:** 2026-03-18
**Status:** Approved

---

## Overview

Replace the global PIN (env var `NEXT_PUBLIC_APP_PIN`) with per-event passwords stored in the database. Each event has its own password. Entering an event's password on the login page authenticates the user and redirects them directly to that event's page.

Also applies pending Supabase migrations (002, 003, 004) to production.

---

## 1. Database Migration (`004_add_event_password.sql`)

Add `password` column to `events` table:

```sql
ALTER TABLE events ADD COLUMN password TEXT NOT NULL DEFAULT '';
```

Events with `password = ''` cannot be used to log in — password must be set at creation time.

**Production Supabase:** Migrations 002, 003, and 004 must be applied manually in the Supabase SQL Editor. The plan will include the SQL to run.

---

## 2. Login Flow (`app/page.tsx`)

Replace global PIN logic with event password lookup.

**Behaviour:**
- On mount (`useEffect`): if `sessionStorage.getItem('authed') === '1'` → `router.replace('/events')`
- Render: app name ("Timing"), Timer icon, password input (`type="password"`, label "Event Password", `autoFocus`)
- On submit with empty input: show "Enter password"
- On submit with non-empty input: call `getEventByPassword(input)`
  - If match found: `sessionStorage.setItem('authed', '1')` → `router.push('/event/${event.id}')`
  - If no match (or event has `password = ''`): show "Incorrect password"
- Remove all `NEXT_PUBLIC_APP_PIN` references

---

## 3. Event Creation (`components/EventSetupForm.tsx`)

Add required "Event Password" field.

- Field: label "Event Password", `type="text"`, required, no default
- Validation: empty → inline error "Enter a password"
- Pass `password` to `createEventWithDistances`

---

## 4. Settings Page (`app/event/[id]/settings/page.tsx`)

Add new section "Access Password" at the bottom of the settings page.

- Display current password (plain text, so admin can read and share it)
- "Change" button → inline edit field → "Save" / "Cancel"
- On save: call `updateEventPassword(id, newPassword)`
- Validation: empty → inline error "Password cannot be empty"

---

## 5. TypeScript & db.ts

### `types/index.ts`
Add `password: string` to `Event` interface.

### `lib/db.ts`

**New function:**
```ts
getEventByPassword(password: string): Promise<Event | null>
// SELECT * FROM events WHERE password = input AND password != '' LIMIT 1
// Returns null if not found
```

**Updated function:**
```ts
createEventWithDistances(params: { name, timezone, password, distances[] }): Promise<Event>
// Include password in the events insert via the RPC or direct insert
```

**New function:**
```ts
updateEventPassword(id: string, password: string): Promise<void>
// UPDATE events SET password = $password WHERE id = $id
```

---

## 6. Env Var Cleanup

- Remove `NEXT_PUBLIC_APP_PIN=your_pin_here` from `.env.example`
- Remove from `app/page.tsx` entirely

---

## Auth Persistence

- Unchanged: `sessionStorage` key `authed = '1'`
- Session expires when browser tab is closed
- Any valid event password sets the same `authed` flag → user can navigate to `/events` list

---

## Files Changed

| Action | File |
|---|---|
| Create | `supabase/migrations/004_add_event_password.sql` |
| Edit | `types/index.ts` |
| Edit | `lib/db.ts` |
| Edit | `app/page.tsx` |
| Edit | `components/EventSetupForm.tsx` |
| Edit | `app/event/[id]/settings/page.tsx` |
| Edit | `.env.example` |

---

## Tests

### `__tests__/login-page.test.tsx` (replace existing)

Mock `@/lib/db` → `{ getEventByPassword }`.
Mock `next/navigation` → `{ useRouter: () => ({ push: mockPush, replace: mockReplace }) }`.
Mock `sessionStorage` via `vi.stubGlobal`.

1. Redirects to `/events` if `sessionStorage.authed === '1'` on mount
2. Shows "Incorrect password" when `getEventByPassword` returns null
3. Sets `sessionStorage.authed = '1'` and calls `router.push('/event/e1')` on correct password (`getEventByPassword` returns event with id `'e1'`)
4. Shows "Enter password" when submitted with empty input
5. Does not call `getEventByPassword` when input is empty

### `__tests__/event-setup-form.test.tsx` (update)

1. Shows "Enter a password" error when password field is empty on submit
2. Calls `createEventWithDistances` with `password` field included

### `__tests__/settings-page.test.tsx` (update or new)

Mock `@/lib/db` → include `updateEventPassword`.

1. Displays current event password in Access Password section
2. "Change" button shows inline edit field
3. "Save" calls `updateEventPassword` with new value
4. Empty password shows "Password cannot be empty" error
5. "Cancel" dismisses edit without saving
