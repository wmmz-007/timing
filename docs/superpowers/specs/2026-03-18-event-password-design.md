# Spec: Per-Event Password Authentication

**Date:** 2026-03-18
**Status:** Approved

---

## Overview

Replace the global PIN (env var `NEXT_PUBLIC_APP_PIN`) with per-event passwords stored in the database. Each event has its own password. Entering an event's password on the login page authenticates the user and redirects them directly to that event's page.

Also applies pending Supabase migrations (002, 003, 004) to production.

---

## 1. Database Migration (`004_add_event_password.sql`)

Migration 004 does two things in one file:

**Step 1** — Add `password` column:
```sql
ALTER TABLE events ADD COLUMN password TEXT NOT NULL DEFAULT '';
```

**Step 2** — Redefine the `create_event_with_distances` RPC to accept `p_password`:
```sql
CREATE OR REPLACE FUNCTION create_event_with_distances(
  p_name      text,
  p_timezone  text,
  p_password  text,
  p_distances jsonb
) RETURNS events AS $$
DECLARE
  v_event events;
BEGIN
  INSERT INTO events (name, timezone, overall_lockout, password)
  VALUES (p_name, p_timezone, false, p_password)
  RETURNING * INTO v_event;

  INSERT INTO event_distances (event_id, name, start_time, overall_top_n, default_top_n)
  SELECT
    v_event.id,
    d->>'name',
    (d->>'start_time')::timestamptz,
    COALESCE((d->>'overall_top_n')::int, 3),
    COALESCE((d->>'default_top_n')::int, 3)
  FROM jsonb_array_elements(p_distances) d;

  RETURN v_event;
END;
$$ LANGUAGE plpgsql;
```

Events with `password = ''` (or whitespace-only) cannot be used to log in.

**Production Supabase:** Migrations 002, 003, and 004 must be applied manually in the Supabase SQL Editor. The plan will include the exact SQL to run for each migration.

---

## 2. Login Flow (`app/page.tsx`)

Replace global PIN logic with event password lookup.

**Behaviour:**
- On mount (`useEffect`): if `sessionStorage.getItem('authed') === '1'` → `router.replace('/events')`
- Render: app name ("Timing"), Timer icon, password input (`type="password"`, label "Event Password", `autoFocus`)
- On submit: trim input first
- If trimmed input is empty: show "Enter password"
- If trimmed input is non-empty: call `getEventByPassword(trimmedInput)`
  - If match found: `sessionStorage.setItem('authed', '1')` → `router.push('/event/${event.id}')`
  - If no match (returns null): show "Incorrect password"
  - If throws (network error): show "Something went wrong. Try again."
- Remove all `NEXT_PUBLIC_APP_PIN` references

---

## 3. Event Creation (`components/EventSetupForm.tsx`)

Add required "Event Password" field.

- Field: label "Event Password", `type="text"` (plaintext so admin can see and copy it), required, no default
- Note: `type="text"` is intentional — admin needs to see the password clearly to share it with team members
- Validation: trim value; if empty/whitespace → inline error "Enter a password"; minimum 4 characters → inline error "Password must be at least 4 characters"
- Pass `password` (trimmed) to `createEventWithDistances` as 4th positional argument (see db.ts below)

**Existing call signature change:** `createEventWithDistances(name, timezone, distances[])` → `createEventWithDistances(name, timezone, password, distances[])`. All call sites (currently only `EventSetupForm.tsx`) must be updated.

---

## 4. Settings Page (`app/event/[id]/settings/page.tsx`)

Add new section "Access Password" at the bottom of the settings page.

- This section is **always visible** (not an accordion) — do not extend the `openSection` type or add accordion controls
- Display current password (plain text, so admin can read and share it with team members)
- "Change" button → inline edit field (pre-filled with current password) → "Save" / "Cancel"
- On save: trim value; if empty/whitespace → inline error "Password cannot be empty"; if less than 4 characters → inline error "Password must be at least 4 characters"; else call `updateEventPassword(id, trimmedValue)`
- "Cancel" discards changes without saving

---

## 5. TypeScript & db.ts

### `types/index.ts`
Add `password: string` to `Event` interface.

### `lib/db.ts`

**Updated function** (add `password` as 4th positional param):
```ts
export async function createEventWithDistances(
  name: string,
  timezone: string,
  password: string,
  distances: { name: string; start_time: string; overall_top_n?: number; default_top_n?: number }[]
): Promise<Event>
// Calls RPC create_event_with_distances with p_password added
```

**New function:**
```ts
export async function getEventByPassword(password: string): Promise<Event | null>
// Trims password; if empty → return null immediately (no DB call)
// Use Supabase client: .from('events').select('*').eq('password', trimmed).neq('password', '').limit(1).maybeSingle()
// Returns null if not found; throws on network/DB error
```

**New function:**
```ts
export async function updateEventPassword(id: string, password: string): Promise<void>
// UPDATE events SET password = $password WHERE id = $id
// Caller is responsible for validation (trim, min length) before calling
```

---

## 6. Env Var Cleanup

- Remove `NEXT_PUBLIC_APP_PIN=your_pin_here` from `.env.example`
- Remove from `app/page.tsx` entirely

---

## Auth Persistence

- Unchanged: `sessionStorage` key `authed = '1'`
- Session expires when browser tab is closed
- **Intentional design:** Any valid event password sets the same `authed` flag → user can navigate to `/events` list and access any event from there. This is a deliberate choice for an internal admin tool — once authenticated with any event password, the user is trusted.

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
5. Does not call `getEventByPassword` when input is empty (or whitespace-only)

### `__tests__/event-setup-form.test.tsx` (update)

1. Shows "Enter a password" error when password field is empty on submit
2. Shows "Password must be at least 4 characters" when password is fewer than 4 characters
3. Calls `createEventWithDistances` with `password` as 4th argument when form is valid

### `__tests__/settings-page.test.tsx` (create)

Mock `@/lib/db` → include `getEvent`, `getDistancesForEvent`, `updateEventPassword`.

1. Displays current event password in "Access Password" section
2. "Change" button shows inline edit field pre-filled with current password
3. "Save" calls `updateEventPassword` with trimmed new value
4. Empty/whitespace password shows "Password cannot be empty" error
5. Password shorter than 4 characters shows "Password must be at least 4 characters" error
6. "Cancel" dismisses edit without calling `updateEventPassword`
