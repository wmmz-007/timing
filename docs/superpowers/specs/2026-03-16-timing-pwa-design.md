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
- Start time (used to calculate net time)

### 2. Race Capture (Primary screen)
Used by staff standing at the finish line. Mobile-first layout, fullscreen when launched from home screen.

**Flow:**
1. Staff holds the large mic button
2. Speaks the bib number (e.g. "สองสามห้า" or "235")
3. Web Speech API transcribes to number
4. System shows: bib number + calculated finish timestamp
5. Staff taps ✓ to confirm or ✗ to discard
6. Record saved; recent log shown below

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
Simple table sorted by net time, showing all recorded entries. Updates in real-time via Supabase realtime subscription. Accessible from any device on the same event.

### 4. Export
Download finish records as CSV for offline prize calculation.

---

## Data Model

```
Event
├── id            UUID
├── name          string        "งานวิ่ง XYZ 2026"
├── date          date          2026-03-16
└── start_time    time          07:00:00

FinishRecord
├── id            UUID
├── event_id      UUID (FK)
├── bib_number    string
├── finish_time   timestamptz   07:42:15.320
├── net_time      interval      00:42:15.320  (finish_time - start_time)
└── created_at    timestamptz
```

---

## Export Format

CSV with three columns:

```
bib,finish_time,net_time
235,07:42:15,00:42:15
180,07:41:03,00:41:03
099,07:40:55,00:40:55
```

This file is used externally (Excel / Google Sheets VLOOKUP) to map bib numbers to athlete profiles, categories, and prize eligibility.

---

## Edge Cases

| Scenario | Behavior |
|---|---|
| Duplicate bib | Alert: "Bib 235 already recorded." Options: overwrite or cancel |
| Speech not recognized | Show error, allow manual entry |
| No internet | Save to Local Storage, sync to Supabase when connection restored |
| App closed mid-race | Local Storage preserves all unsaved records |

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
