# Spec: Settings Page Style Unification

## Goal

Make Distances, Athletes, and Prizes sections visually consistent by applying a single design token system throughout the Settings page.

## Problem

Three components rendered inside the Settings page accordion use inconsistent styles:

| Component | Issue |
|-----------|-------|
| `PrizeConfig.tsx` | `rounded-lg` inputs, `py-1.5` padding, no focus ring, `underline` button |
| `AthleteImport.tsx` | `rounded-lg` on column-mapping `<select>` elements |
| `DistanceList.tsx` | Already correct — no changes needed |
| `settings/page.tsx` | Already correct — no changes needed |

## Design Tokens (Target)

| Token | Value |
|-------|-------|
| Border radius | `rounded-xl` (12px) — matches accordion card |
| Input padding | `px-3 py-2.5` |
| Focus ring | `focus:outline-none focus:ring-2 focus:ring-black` |
| Ghost button | `text-sm text-gray-500 hover:text-gray-900` (no underline) |

## Changes

### `components/PrizeConfig.tsx`

1. Per-distance top-N `<input>` elements (2 inputs: `overall_top_n`, `default_top_n`):
   - Replace `rounded-lg` with `rounded-xl`
   - Replace `py-1.5` with `py-2.5`
   - Add `focus:outline-none focus:ring-2 focus:ring-black`

2. Subgroup override `<input>` (third input, currently `w-16 ... rounded-lg px-2 py-1 text-sm text-center`):
   - Replace `rounded-lg` with `rounded-xl`
   - Replace `px-2` with `px-3`
   - Replace `py-1` with `py-2.5`
   - Add `focus:outline-none focus:ring-2 focus:ring-black`

3. "Show all / Hide subgroup" `<button>`:
   - Remove `underline` class
   - Replace with `text-sm text-gray-500 hover:text-gray-900`

### `components/AthleteImport.tsx`

1. Column-mapping `<select>` elements (currently `rounded-lg px-2 py-1.5`):
   - Replace `rounded-lg` with `rounded-xl`
   - Replace `px-2` with `px-3`
   - Replace `py-1.5` with `py-2.5`
   - (focus ring already present — no change needed)

## Out of Scope

- No layout changes
- No logic changes
- No new features
- No changes to `DistanceList.tsx` or `settings/page.tsx`

## Testing

Visual regression — verify in browser that:
- All inputs in all three sections have matching height and corner radius
- Focus ring appears on all PrizeConfig inputs (AthleteImport select already has focus ring)
- "Show subgroup" button no longer has underline decoration
