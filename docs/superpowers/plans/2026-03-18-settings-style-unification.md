# Settings Style Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply a single `rounded-xl / px-3 py-2.5 / focus:ring-2 focus:ring-black` token set to all inputs and the column-mapping select in the Settings page, so Distances, Athletes, and Prizes sections look visually identical.

**Architecture:** Pure Tailwind CSS class replacements in two component files — no logic, no layout, no new files. `DistanceList.tsx` and `settings/page.tsx` are already correct.

**Tech Stack:** Next.js 15, Tailwind CSS v4, TypeScript

---

## File Map

| File | Action | What changes |
|------|--------|--------------|
| `components/PrizeConfig.tsx` | Modify | 3 inputs + 1 button — class string only |
| `components/AthleteImport.tsx` | Modify | 1 `<select>` — class string only |

---

### Task 1: Fix PrizeConfig inputs and ghost button

**Files:**
- Modify: `components/PrizeConfig.tsx:91` (overall_top_n input)
- Modify: `components/PrizeConfig.tsx:101` (default_top_n input)
- Modify: `components/PrizeConfig.tsx:131` (subgroup override input)
- Modify: `components/PrizeConfig.tsx:113` (toggle button)

> Note: This is a CSS-only change. No unit tests are needed — verify visually in browser. Run `tsc --noEmit` to confirm no type errors.

- [ ] **Step 1: Update overall_top_n input (line 91)**

Both top-N inputs share the same className string. Use the unique `onBlur` context to target each one individually.

Find (unique context for overall_top_n):
```
onBlur={(e) => handleDistanceTopN(dist.id, 'overall_top_n', parseInt(e.target.value, 10))}
                disabled={disabled}
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
```
Replace with:
```
onBlur={(e) => handleDistanceTopN(dist.id, 'overall_top_n', parseInt(e.target.value, 10))}
                disabled={disabled}
                className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black"
```

- [ ] **Step 2: Update default_top_n input (line 101)**

Find (unique context for default_top_n):
```
onBlur={(e) => handleDistanceTopN(dist.id, 'default_top_n', parseInt(e.target.value, 10))}
                disabled={disabled}
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
```
Replace with:
```
onBlur={(e) => handleDistanceTopN(dist.id, 'default_top_n', parseInt(e.target.value, 10))}
                disabled={disabled}
                className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black"
```

- [ ] **Step 3: Update subgroup override input (line 131)**

Find:
```
className="w-16 border border-gray-200 rounded-lg px-2 py-1 text-sm text-center"
```
Replace with:
```
className="w-16 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-black"
```

- [ ] **Step 4: Update toggle button (line 113)**

Find:
```
className="text-sm text-gray-500 underline"
```
Replace with:
```
className="text-sm text-gray-500 hover:text-gray-900"
```

- [ ] **Step 5: Run TypeScript check**

```bash
npx tsc --noEmit
```
Expected: no output (zero errors)

- [ ] **Step 6: Commit**

```bash
git add components/PrizeConfig.tsx
git commit -m "style: unify PrizeConfig inputs to rounded-xl design token"
```

---

### Task 2: Fix AthleteImport column-mapping select

**Files:**
- Modify: `components/AthleteImport.tsx:184` (column-mapping `<select>`)

> Note: CSS-only change. The select already has the correct focus ring — only `rounded-lg`, `px-2`, `py-1.5` need updating.

- [ ] **Step 1: Update column-mapping select (line 184)**

Find:
```
className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-black"
```
Replace with:
```
className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black"
```

- [ ] **Step 2: Run TypeScript check**

```bash
npx tsc --noEmit
```
Expected: no output (zero errors)

- [ ] **Step 3: Commit**

```bash
git add components/AthleteImport.tsx
git commit -m "style: unify AthleteImport select to rounded-xl design token"
```

---

### Task 3: Visual verification

- [ ] **Step 1: Run dev server**

```bash
npm run dev
```

- [ ] **Step 2: Open Settings page in browser**

Navigate to an event → Settings. Open each accordion section and verify:

| Check | Expected |
|-------|----------|
| Distances inputs | `rounded-xl`, tall padding |
| Athletes column-mapping selects | `rounded-xl`, tall padding, same height as Distance inputs |
| Prizes top-N inputs | `rounded-xl`, tall padding, focus ring visible on click |
| Prizes subgroup override inputs | `rounded-xl`, same height as other inputs |
| "Show all subgroup" button | No underline |

- [ ] **Step 3: Push**

```bash
git push
```
