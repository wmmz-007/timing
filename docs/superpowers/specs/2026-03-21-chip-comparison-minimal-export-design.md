# Chip comparison minimal export — design spec

**Date:** 2026-03-21  
**Status:** Draft for review  
**Goal:** Export finish records for the team to verify against chip timing when the main system cannot ingest files. **Only bib and time** are required; include **both local wall time and UTC** so reviewers do not have to guess the timezone.

---

## 1. File format

| Attribute | Choice |
|-----------|--------|
| **Format** | CSV (comma-separated) |
| **Extension** | `.csv` |
| **Encoding** | UTF-8. Optional **UTF-8 BOM** at start of file if Excel (Windows) must open Thai/UTF-8 without garbling — product decision per deployment. |
| **Header row** | Required, exactly one line, fixed column order (see below). |
| **Line endings** | LF (`\n`) preferred; CRLF acceptable if tooling requires it. |

---

## 2. Columns (fixed order)

| Column | Name | Description |
|--------|------|-------------|
| 1 | `bib` | Bib number as string (no extra formatting unless stored that way in source data). |
| 2 | `finish_time_local` | **Time of day only:** `HH:MM:SS` (24-hour), in the **event’s configured timezone**. No date in this column. Must match the same semantic as app display time for finish (align with `formatTime(finish_time, event.timezone)` in `lib/time.ts`). |
| 3 | `finish_time_utc` | Single unambiguous instant: **ISO 8601 in UTC**, e.g. `2026-03-17T03:42:05.123Z`. Sourced from stored `finish_time` (ISO string). |

**Rationale:** Local column is human-friendly for same-day finish-line comparison; UTC column avoids ambiguity across midnight and for tooling/scripts.

---

## 3. Row ordering

- Sort rows by **`finish_time_utc` ascending** (earliest finish first).
- Ties (same instant): stable secondary sort by `bib` ascending.

---

## 4. Edge cases

- **Duplicate bib:** Emit **one row per recorded finish** (multiple crossings = multiple rows). No deduplication in this export unless explicitly requested later.
- **Missing/invalid time:** Should not occur in normal flow; if present, row may be omitted or flagged — implementation detail in a follow-up if needed.

---

## 5. Relationship to existing export

- Full CSV (`generateCsv` in `lib/export.ts`) remains for rich results (name, distance, ranks, etc.).
- This minimal export is a **separate generator** (or separate function + download) that reuses **timezone formatting** and **ISO** from `finish_time` only.

---

## 6. Testing (implementation phase)

- Unit test: given fixed `event.timezone` and `finish_time` ISO, assert CSV header and one row: `bib`, local `HH:MM:SS`, UTC string matches expected.
- Optional: snapshot test for multi-row sort order.

---

## 7. Out of scope (v1)

- Net time, gun vs chip offset, division, athlete name.
- XLSX binary format.
- Custom delimiter or TSV (CSV only unless requested).

---

## 8. Approval checklist

- [ ] Stakeholder confirms `finish_time_local` = **only** `HH:MM:SS` (no date).
- [ ] Stakeholder confirms `finish_time_utc` = full ISO UTC.
- [ ] Optional UTF-8 BOM policy decided for target users (Excel vs plain tools).
