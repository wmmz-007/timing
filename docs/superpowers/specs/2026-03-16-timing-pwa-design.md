# Timing PWA — Design Spec
**Date:** 2026-03-16
**Status:** Approved

---

## Overview

A Progressive Web App (PWA) for recording runner finish times at large running events (200+ participants). Staff at the finish line speak bib numbers into a microphone; the system transcribes in real-time via Web Speech API and records bib + timestamp. The recorded data is exported as CSV for offline mapping with athlete information and prize calculation.

The system is designed for a freelancer assisting event organizers — prioritizing reliability and simplicity over feature richness, with a clear path to expand in future phases.

---

## Context & Constraints

- **Event scale:** 200+ runners, annual event
- **User:** Freelancer staff operating at the finish line
- **Equipment:** None to start — phone or laptop with browser only
- **Phase 1 goal:** Capture bib + finish time reliably; export for offline processing
- **Future:** Real-time public leaderboard (out of scope for Phase 1)

---

## Architecture

```
Browser (staff phone / laptop)
  └── PWA (Next.js + Tailwind CSS)
        ├── Web Speech API        ← real-time speech-to-text
        ├── Local Storage         ← offline-first record buffer
        └── Supabase (PostgreSQL) ← shared state, realtime sync
```

- **Frontend:** Next.js, Tailwind CSS (Apple-style: clean, white, minimal)
- **Database:** Supabase — free tier sufficient, realtime built-in
- **Deploy:** Vercel — free, deploy from GitHub
- **PWA:** `manifest.json` with `display: standalone`, install prompt on first open

---

## Screens

### 1. Event Setup
Configure the event before race day.

Fields:
- Event name
- Event date
- Start time (used to calculate net time; interpreted as local time, Asia/Bangkok UTC+7)
- Timezone (default: `Asia/Bangkok`, stored on event for portability)

### 2. Race Capture (Primary screen)
Used by staff standing at the finish line. Mobile-first layout, fullscreen when launched from home screen.

**Flow:**
1. Staff holds the large mic button
2. Speaks the bib number (e.g. "สองสามห้า" or "235")
3. Web Speech API returns a string transcript
4. App parses transcript → numeric bib (see Speech Parsing section below)
5. System shows: bib number + calculated finish timestamp
6. Staff taps ✓ to confirm or ✗ to discard
7. `finish_time` (full timestamptz) captured at the moment speech recognition returns the transcript (before staff confirms) — this is the runner's actual finish time. The timestamp is displayed to staff for verification and saved unchanged when ✓ is tapped. The delay between recognition and confirmation is intentionally ignored.
8. Record saved locally; synced to Supabase when online; recent log shown below

**Layout (mobile portrait):**
```
┌─────────────────────────────┐
│  🏃 Race Capture            │
│  Start: 07:00:00            │
│                             │
│        [🎤 Hold to speak]   │
│                             │
│  Heard: "สองสามห้า"         │
│  Bib: 235  →  07:42:15      │
│                             │
│     [✓ Save]   [✗ Discard]  │
│─────────────────────────────│
│  235   07:42:15             │
│  180   07:41:03             │
│  099   07:40:55             │
└─────────────────────────────┘
```

**Manual fallback:** Numeric keypad input always available — staff can type bib manually if speech fails.

### 3. Live Results (Staff view)
Simple table sorted by net time, showing all recorded entries. Updates in real-time via Supabase realtime subscription. Any device can join by opening the event URL (e.g. `/event/[event-id]`). No login required in Phase 1. Supabase RLS policies restrict reads and writes to records matching the current event ID.

### 4. Export
Download finish records as CSV for offline prize calculation.

---

## Data Model

```
Event
├── id            UUID
├── name          string        "งานวิ่ง XYZ 2026"
├── start_time    timestamptz   2026-03-16T07:00:00+07:00  ← full timestamp, authoritative date+time
└── timezone      string        "Asia/Bangkok"
```
Note: no separate `date` field — event date is always derived from `start_time` in the event timezone.

```

FinishRecord
├── id            UUID
├── event_id      UUID (FK)
├── bib_number    string        preserved as string to retain leading zeros (e.g. "099")
├── finish_time   timestamptz   2026-03-16T07:42:15.320+07:00  ← full wall-clock datetime
└── created_at    timestamptz   internal audit only, not exported
```

**Note on net_time:** `net_time` is a derived value (`finish_time - event.start_time`). It is NOT stored in the database to avoid stale data if `start_time` is corrected. It is computed client-side at read/export time.

---

## Speech Parsing

Web Speech API returns a raw string transcript. The app converts this to a numeric bib using the following logic:

1. **Arabic digits:** if transcript contains only digits (e.g. "235"), parse directly
2. **Thai word-per-digit:** map Thai digit words to numbers using the lookup table below, concatenate digits
3. **Mixed:** strip common prefix words (e.g. "บิบ", "หมายเลข") then apply rules above

**Thai digit lookup table (canonical spellings):**
| Word | Digit |
|---|---|
| ศูนย์ | 0 |
| หนึ่ง | 1 |
| สอง | 2 |
| สาม | 3 |
| สี่ | 4 |
| ห้า | 5 |
| หก | 6 |
| เจ็ด | 7 |
| แปด | 8 |
| เก้า | 9 |

A simple lookup table is sufficient — no external library required. If parsing produces no digits, show the raw transcript and prompt staff to use manual entry.

---

## Export Format

CSV with three columns. `net_time` computed at export time as `finish_time - event.start_time` in the event's timezone.

```
bib,finish_time,net_time
235,07:42:15,00:42:15
180,07:41:03,00:41:03
099,07:40:55,00:40:55
```

- `finish_time` exports time portion only (HH:MM:SS), local timezone
- `bib_number` exported as string — leading zeros are preserved (e.g. `099` not `99`)
- File is used externally (Excel / Google Sheets VLOOKUP) to map bibs to athlete profiles, categories, and prize eligibility

---

## Edge Cases

| Scenario | Behavior |
|---|---|
| Duplicate bib (online or offline) | Alert: "Bib 235 already recorded." Options: overwrite or cancel. Same behavior whether device is online or offline — the check runs against Local Storage first. |
| Duplicate bib at sync | If two devices both recorded the same bib offline, on sync the record with the earliest `finish_time` wins. The later duplicate is discarded and its data appended to a **Conflicts** section visible on the Live Results screen (bib number, both timestamps, which was kept). Staff can review and manually correct if needed. No separate table — displayed in-app only, not exported. |
| Speech not recognized | Show error, allow manual entry |
| No internet | Save to Local Storage, sync to Supabase when connection restored |
| App closed mid-race | Local Storage preserves all unsaved records |

---

## Access Model (Phase 1)

- No user authentication required
- Events are accessed by URL: `/event/[event-id]`
- **Security:** Supabase anon key is used. No RLS enforced in Phase 1 — all client queries include `WHERE event_id = [id]` as an application-level filter. This is sufficient for internal staff use where the event URL is shared privately. RLS can be added in a future phase if public access is introduced.
- Anyone with the event URL can view live results and submit records (staff only, link shared internally)

---

## PWA / Fullscreen

- `manifest.json`: `display: standalone`, `orientation: portrait`
- Install prompt shown on first visit ("Add to Home Screen")
- When launched from home screen: no browser chrome, fullscreen like a native app
- Works on iOS Safari and Android Chrome

---

## Design Language

- Apple-inspired: white background, clean typography, generous spacing
- Large touch targets (minimum 48px) for use while standing
- High-contrast mic button — prominent, impossible to miss
- Minimal navigation — one task per screen

---

## Out of Scope (Phase 1)

- Athlete registration or profile management
- Category/distance assignment within this system
- Public real-time leaderboard
- Chip timing / RFID integration
- Prize calculation logic (handled externally via CSV)
