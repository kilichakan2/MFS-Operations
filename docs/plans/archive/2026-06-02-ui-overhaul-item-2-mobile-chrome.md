# UI Overhaul — Item 2: Mobile Chrome (AppHeader + BottomNav + MoreDrawer)

## 1. Goal
Restyle the mobile chrome — sticky top bar, bottom tab bar, slide-up More drawer — to the Hakan-approved Claude Design mock while preserving every existing functional behaviour (sync dot, language toggle, logout, iOS touch routing, per-page chrome rendering, DesktopRouteNav functionality).

## 2. Source spec
- Order prompt for this run (verbatim consolidated spec — the truth)
- Frame artefact: `docs/plans/2026-06-01-ui-overhaul-locked-decisions.md` §3-4 (role nav matrices, locked decisions)
- Design tokens already shipped in Item 1: `docs/plans/2026-06-01-ui-overhaul-design-tokens.md`
- Item 1 plan (parent context): `docs/plans/2026-06-02-ui-overhaul-item-1-design-system-foundation.md`
- Visual: Claude Design mock for mobile chrome (Hakan-approved)

## 3. Compliance
NO. This is presentational chrome only. No auth, no payments, no data retention, no HACCP, no legislation, no financial logic. No DOCUMENT_CONTROL.md update required.

## 4. Branch + base
- Branch: `feat/ui-overhaul-02-mobile-chrome`
- Base: `main` @ `382a2fbaf60603a3ecbf2e07d6d2e050822166ce`

## 5. Gate 2 resolution — Path B ratified

**Path chosen (Hakan, Gate 2)**: **Path B — BottomNav exports a thin `@deprecated` lucide-backed `Icons` shim; DesktopRouteNav stays BYTE-IDENTICAL.**

**Repo reality** (`/Users/hakankilic/MFS-Operations/components/DesktopRouteNav.tsx`): the file currently consumes **ten** distinct entries from `BottomNav.Icons`: `dashboard, routes, complaint, pricing, compliment, cash, admin, dispatch, visit, runs` (counted across lines 42-75 of DesktopRouteNav.tsx via `grep -n 'Icons\.' components/DesktopRouteNav.tsx`).

The spec asserts the inline `<svg>` `Icons` object in `BottomNav.tsx` (lines 67-150) is DELETED. Path B reconciles this by replacing the deleted inline SVG block with a **lucide-react-backed compatibility shim** under the same export name (`Icons`). The shim is explicitly `@deprecated` and exists for the sole purpose of keeping DesktopRouteNav.tsx unchanged. Item 3 of the UI overhaul will delete both the shim and DesktopRouteNav.tsx when the new sidebar pattern lands.

**Shim shape (exact wiring — see Step 3 in §7)**:
```ts
import {
  LayoutDashboard, Map, AlertCircle, Tags, ThumbsUp, Banknote,
  Settings, MapPin, ClipboardList, Calendar, ShoppingBag,
  Navigation, Heart, Globe, MoreHorizontal,
} from 'lucide-react'

/**
 * @deprecated Kept for DesktopRouteNav.tsx compatibility ONLY.
 * Item 3 of the UI overhaul replaces DesktopRouteNav with the
 * new sidebar pattern and deletes this shim. New code should
 * import directly from 'lucide-react'.
 */
export const Icons = {
  dashboard:  <LayoutDashboard size={24} strokeWidth={2} />,
  routes:     <Map             size={24} strokeWidth={2} />,
  complaint:  <AlertCircle     size={24} strokeWidth={2} />,
  pricing:    <Tags            size={24} strokeWidth={2} />,
  compliment: <ThumbsUp        size={24} strokeWidth={2} />,
  cash:       <Banknote        size={24} strokeWidth={2} />,
  admin:      <Settings        size={24} strokeWidth={2} />,
  visit:      <MapPin          size={24} strokeWidth={2} />,
  dispatch:   <ClipboardList   size={24} strokeWidth={2} />,
  runs:       <Calendar        size={24} strokeWidth={2} />,
} as const
```

**Visual parity caveat (load-bearing)**: the lucide-react replacements MUST visually match the current inline SVGs in DesktopRouteNav's rendering. If the current inline SVGs use a specific `strokeWidth`, `viewBox`, or `fill` treatment that differs from lucide's defaults, the implementer MUST tune the shim's props to match. The 24px / strokeWidth 2 values above are the starting assumption — the implementer verifies and adjusts before Step 8's smoke check. **Goal: zero visible regression on `/routes` and `/runs`.**

**Hard constraint preserved**: DO NOT touch `components/DesktopRouteNav.tsx`. No exception.

## 6. Files to change

### Modify
- `components/AppHeader.tsx`
  - Line 139: header `className` swap `bg-[#16205B]` → `bg-mfs-navy`; keep sticky/safe-area styling. Height becomes 64px content + safe-area-inset-top (current `pb-3` + dynamic `paddingTop`); add `min-h-[64px]` to the inner flex row.
  - Line 144: logo color `text-[#EB6619]` → `text-mfs-orange`.
  - Lines 145-150: title rendering — change classes from `text-white/80 text-sm font-semibold truncate` to `text-white text-sm font-semibold uppercase tracking-wider truncate`. Keep the `|` divider styling.
  - Lines 85-87 (DotMenu trigger SVG): replace the inline 3-dot SVG with `<MoreVertical className="w-5 h-5" />` from `lucide-react`. The button wrapper and its colour classes (`text-white/70`, `text-white`) stay; the SVG inside is the only swap.
  - PRESERVE verbatim: `SyncDot` (lines 16-39), DotMenu's outer button structure & 44×44 touch target, language row (lines 94-102), logout row (lines 107-124), all event handlers, `maxWidth` prop, `actions` prop, `sticky top-0 z-[999]`, the `MfsLogo` component import.

- `components/BottomNav.tsx`
  - Delete lines 67-150 (the entire inline `<svg>` `export const Icons = { … }` object).
  - Replace it with the **lucide-react-backed `@deprecated` `Icons` shim** (see §5 for the exact wiring) — 10 keys (`dashboard, routes, complaint, pricing, compliment, cash, admin, visit, dispatch, runs`), each `size={24} strokeWidth={2}` to match the current inline SVG visuals. The shim is exported under the same name (`Icons`) so DesktopRouteNav.tsx continues to compile and render unchanged.
  - At the top of the file, import the 15 lucide icons needed across this file: `LayoutDashboard, Map, AlertCircle, Tags, ThumbsUp, Banknote, Settings, MapPin, ClipboardList, Calendar, ShoppingBag, Navigation, Heart, Globe, MoreHorizontal` (10 for the shim + 4 for new BottomNav rendering surfaces consumed via RoleNav + `MoreHorizontal` for the More cell).
  - Replace the `NavItem` interface (lines 6-11) with the new shape:
    ```ts
    export interface NavItem {
      href:         string
      label:        string
      icon:         React.ReactNode
      desktopOnly?: boolean
      /** @deprecated Use desktopOnly. Kept for DesktopRouteNav.tsx
       *  compatibility only. Removed in Item 3 when DesktopRouteNav
       *  is replaced by the new sidebar pattern. */
      badge?: string
    }
    export interface NavMatrix {
      visible:   NavItem[]   // 3 (driver) or 4 (others) tabs
      overflow?: NavItem[]   // undefined for driver
    }
    interface BottomNavProps {
      matrix: NavMatrix
      onOpenMore?: () => void
    }
    ```
  - Rewrite the component body (lines 17-65):
    - Read `matrix.visible` and `matrix.overflow`.
    - If `overflow` defined and length > 0: append a synthetic `More` tab as the 4th visible cell (label `'More'`, icon `<MoreHorizontal />`, no `href`; rendered as a `<button>` not a `<Link>`, calling `onOpenMore`).
    - If `overflow` undefined: render exactly the 3 visible tabs, `flex-1` centered, no More slot.
    - Container: `fixed bottom-0 left-0 right-0 z-[9999] bg-white border-t border-mfs-neutral-200`, **keep** `padding-bottom: env(safe-area-inset-bottom)`, **keep** `transform: 'translateZ(0)'`, **keep** `WebkitTransform: 'translateZ(0)'`, **keep** `touchAction: 'manipulation'` — the iOS hardware-compositing layer must survive.
    - Per-cell: 56px tall (`min-h-[56px]`), `flex-1`, vertical flex centered, icon 24px (`w-6 h-6`), label uppercase Inter Medium 11px tracking 0.05em (`text-[11px] font-medium uppercase tracking-[0.05em]`).
    - Active state (matches `pathname === href`): `text-mfs-orange` on icon + label, plus a 3px orange bar via an absolutely-positioned `<span className="absolute top-0 left-0 right-0 h-[3px] bg-mfs-orange" />` inside the cell (cell becomes `relative`). Inactive: `text-mfs-neutral-500`.
    - The More button is never "active" (no pathname match concept).
  - PRESERVE: hardware-compositing hack, `aria-label="Main navigation"`, `aria-current="page"` on the active tab, `touchAction: 'manipulation'` on the cell.

- `components/RoleNav.tsx`
  - Replace the existing per-role flat-array switch (lines 32-81) with a per-role `NavMatrix` builder. Each role's matrix follows spec §"ROLE NAV MATRICES":
    - sales: `visible = [Orders /orders, Visits /visits, Complaints /complaints]`, `overflow = [Pricing /pricing, Compliments /compliments, Routes /routes (desktopOnly), Runs /runs]`
    - office: `visible = [Dispatch /screen1, Cash /cash, Complaints /complaints]`, `overflow = [Pricing /pricing, Compliments /compliments, Routes /routes (desktopOnly), Runs /runs, Dashboard /screen4]`
    - warehouse: `visible = [Dispatch /screen1, Complaints /complaints, Routes /routes]`, `overflow = [Compliments /compliments, Runs /runs, Dashboard /screen4]`
    - driver: `visible = [My Route /driver, Complaints /complaints, Kudos /compliments]`, `overflow = undefined`. Driver's `Kudos` label stays the hardcoded string `'Kudos'` (NOT `t('navCompliments')`); status quo preserved.
    - admin: `visible = [Dashboard /screen4, Complaints /complaints, Pricing /pricing]`, `overflow = [Cash /cash, Compliments /compliments, Routes /routes, Runs /runs, Admin /screen5, Map /screen6]`. No `desktopOnly` flag in admin's matrix (per spec wording).
  - Replace `import BottomNav, { Icons, type NavItem }` with `import BottomNav, { type NavItem, type NavMatrix } from '@/components/BottomNav'` and per-icon imports from `lucide-react` matching the spec map: `ShoppingBag, MapPin, AlertCircle, ThumbsUp, Tags, Map, Calendar, ClipboardList, Banknote, LayoutDashboard, Navigation, Heart, Settings, Globe`.
  - Add `useState` for `moreOpen` and a `MoreDrawer` child:
    ```tsx
    const [moreOpen, setMoreOpen] = useState(false)
    …
    return (
      <>
        <BottomNav matrix={matrix} onOpenMore={() => setMoreOpen(true)} />
        {matrix.overflow && (
          <MoreDrawer
            open={moreOpen}
            onClose={() => setMoreOpen(false)}
            items={matrix.overflow}
          />
        )}
      </>
    )
    ```
  - Default (no role / empty) returns `null`.
  - PRESERVE: `useLanguage`/`t` usage for translatable labels, mfs_role cookie read pattern (lines 23-26), client-only hydration via `useEffect` (lines 32-81 currently — keep the same pattern, just set a `matrix` state instead of `items`).

- `components/DesktopRouteNav.tsx` — **NOT MODIFIED (Path B)**. The file remains byte-identical. It continues to `import { Icons } from '@/components/BottomNav'` and consume `Icons.dashboard`, `Icons.routes`, `Icons.complaint`, `Icons.pricing`, `Icons.compliment`, `Icons.cash`, `Icons.admin`, `Icons.dispatch`, `Icons.visit`, `Icons.runs`. The `@deprecated` lucide-backed shim in BottomNav.tsx (see above) supplies all 10 keys with `size={24} strokeWidth={2}` to match the current inline SVG visuals. Verified visually on `/routes` and `/runs` during Step 8's smoke check.

- `lib/translations.ts`
  - Line 42: change `navCompliments: { en: 'Kudos', tr: 'Tebrikler' }` to `navCompliments: { en: 'Compliments', tr: 'Övgüler' }`.
  - No other key changes.

- `package.json` + `package-lock.json`
  - Add runtime dep `lucide-react@latest` via `npm install lucide-react`.
  - Verify the lockfile diff contains exactly one new top-level entry (`lucide-react`) plus its transitive (none expected — lucide-react has zero runtime deps).

### Create
- `components/MoreDrawer.tsx` — slide-up bottom sheet.
  - Props: `{ open: boolean; onClose: () => void; items: NavItem[] }`.
  - Backdrop: full-screen `fixed inset-0 bg-mfs-navy/50 z-[9998]` (Navy at 50% opacity), `transition-opacity duration-150`, opacity 0 when `!open`, opacity 1 when `open`. `onClick={onClose}`. `aria-hidden={!open}`.
  - Sheet: `fixed bottom-0 left-0 right-0 z-[9999] bg-white rounded-t-mfs-lg shadow-mfs-3 px-5 py-6` (20px horizontal / 24px vertical = `px-5 py-6`). `transition-transform duration-[250ms] ease-out`, `translate-y-full` when closed, `translate-y-0` when open. `padding-bottom: env(safe-area-inset-bottom)`.
  - Drag handle: 36×4px (`w-9 h-1`) `bg-mfs-neutral-300 rounded-full mx-auto mt-3` — 12px top margin satisfied via `mt-3`. Clickable: tapping the handle calls `onClose` (drag-down gesture deferred — tap-to-close is the MVP).
  - Caption header: `<p className="text-xs uppercase tracking-wider text-mfs-neutral-500 mt-4 mb-2">MORE OPTIONS</p>`.
  - Rows: map `items` to a `<Link href={item.href}>` (or `<button>` if `desktopOnly` should not navigate — per spec it still navigates, just shows a "DESKTOP" hint). Each row:
    - `flex items-center gap-3 min-h-[56px] border-b border-mfs-neutral-200 last:border-b-0`
    - 24px icon (`w-6 h-6`) in `text-mfs-neutral-900`
    - Label: `flex-1 text-base font-medium text-mfs-neutral-900` (Inter Medium 16px = `text-base font-medium`)
    - If `item.desktopOnly`: trailing pill — `<span className="bg-mfs-neutral-100 text-mfs-neutral-500 text-[10px] font-medium uppercase px-2 py-0.5 rounded-mfs-pill">DESKTOP</span>` (padding 2px 8px = `px-2 py-0.5`).
    - On click: row navigates (regular Link behaviour), then close drawer (`onClick={onClose}`).
  - Close: tap backdrop OR tap drag handle. ESC keypress also closes (consistency with DotMenu pattern).
  - `aria-modal`, `role="dialog"`, `aria-label="More navigation options"` on the sheet.

- `tests/unit/nav/role-nav-matrices.test.ts` — pure-data L1 unit.
- `tests/e2e/mobile-chrome.spec.ts` — Playwright L4 chromium @ 390×844.

## 7. Steps (TDD vertical slices)

The current suite is ~1162 tests, all green. Each step ends green; commits are atomic.

### Step 1 — Translation flip (red → green → commit)
- **Red**: Add a new test file `tests/unit/nav/role-nav-matrices.test.ts` containing ONLY the translation assertion:
  ```ts
  import t from '@/lib/translations'
  it('navCompliments EN is "Compliments"', () => expect(t.navCompliments.en).toBe('Compliments'))
  it('navCompliments TR is "Övgüler"', () => expect(t.navCompliments.tr).toBe('Övgüler'))
  ```
  `npm run test -- tests/unit/nav/role-nav-matrices.test.ts` → red.
- **Green**: Edit `lib/translations.ts` line 42 → `navCompliments: { en: 'Compliments', tr: 'Övgüler' }`.
- Confirm full `npm run test` still green (no other fixtures depend on these strings — grep verified zero hits in /tests).
- **Commit**: `feat(i18n): rename Kudos → Compliments, Tebrikler → Övgüler`

### Step 2 — Install lucide-react (no test gate; pure dependency add)
- Run `npm install lucide-react`.
- Verify `package.json` has exactly one new line under `dependencies`: `"lucide-react": "^x.y.z"`.
- Verify `package-lock.json` diff is bounded (one top-level `node_modules/lucide-react` entry; no transitive surprises).
- Run `npm run test` → green (no test depends on lucide yet).
- Run `npx tsc --noEmit` → green.
- **Commit**: `chore(deps): add lucide-react for nav icons`

### Step 3 — NavMatrix contract on BottomNav (red → green → commit)
- **Red**: Extend `tests/unit/nav/role-nav-matrices.test.ts` with a type-only smoke test that imports the new shape:
  ```ts
  import type { NavItem, NavMatrix } from '@/components/BottomNav'
  it('NavMatrix type is importable', () => {
    const m: NavMatrix = { visible: [], overflow: undefined }
    expect(m).toBeDefined()
  })
  ```
  Vitest run → red (NavMatrix doesn't exist).
- **Green**: In `components/BottomNav.tsx`:
  - At the top, add the lucide import block: `import { LayoutDashboard, Map, AlertCircle, Tags, ThumbsUp, Banknote, Settings, MapPin, ClipboardList, Calendar, ShoppingBag, Navigation, Heart, Globe, MoreHorizontal } from 'lucide-react'`.
  - **Delete the inline `<svg>` Icons object (lines 67-150)** and **immediately replace it with the `@deprecated` lucide-backed `Icons` shim** exactly as shown in §5 — 10 keys, each `size={24} strokeWidth={2}`, JSDoc `@deprecated` block intact. DesktopRouteNav.tsx continues to compile against this shim with zero changes to that file.
  - Update `NavItem` interface to add `desktopOnly?: boolean` and add the `@deprecated` JSDoc to `badge?: string` (kept for any other downstream consumer; DesktopRouteNav consumes only `icon`/`label`/`href`/`badge`).
  - Add `export interface NavMatrix { visible: NavItem[]; overflow?: NavItem[] }`.
  - Change `BottomNavProps` to `{ matrix: NavMatrix; onOpenMore?: () => void }`.
  - Rewrite component body per §6 (More slot logic + 3px orange active bar + uppercase 11px labels + mfs-neutral border + neutral-500 inactive). Keep translateZ hack, touchAction, env(safe-area).
  - Replace inline SVGs in rendered cells with `{item.icon}` (already `React.ReactNode`).
  - **Visual parity check**: before considering this step done, render `/routes` and `/runs` (the two pages DesktopRouteNav appears on) and confirm the 10 shim icons render at the same visual size/weight as the current inline SVGs. If lucide defaults look thinner/thicker, adjust `strokeWidth` in the shim and re-verify. This is a manual smoke verification inside the Step 3 green phase — no automated test gate for this beyond `npm run build`/`tsc` compiling.
- `npx tsc --noEmit` will now fail in RoleNav.tsx (uses `items` prop, which no longer exists). That is expected and resolved by Step 4. Run the new unit test in isolation: `npm run test -- tests/unit/nav` → green.
- **Commit (only after Step 4 fixes the tsc break)**: combined commit in Step 4.

> Note: Steps 3 and 4 are entangled at the TypeScript level — `BottomNav`'s props change breaks `RoleNav`. We land them as two file edits in a single commit to keep the tree compiling. The TDD red-green is preserved (unit test for NavMatrix written first; impl follows).

### Step 4 — RoleNav matrices (red → green → commit, paired with Step 3)
- **Red**: Extend `tests/unit/nav/role-nav-matrices.test.ts` with the per-role shape assertions exactly as the spec dictates:
  ```ts
  import { buildMatrix } from '@/components/RoleNav'  // export the pure builder
  it('sales matrix shape', () => {
    const m = buildMatrix('sales', t => t)            // t = identity for test
    expect(m.visible.length).toBe(3)
    expect(m.overflow?.length).toBe(4)
    expect(m.overflow?.find(i => i.label === 'Routes')?.desktopOnly).toBe(true)
  })
  it('office matrix shape',    () => { const m = buildMatrix('office',    t=>t); expect(m.visible.length).toBe(3); expect(m.overflow?.length).toBe(5) })
  it('warehouse matrix shape', () => { const m = buildMatrix('warehouse', t=>t); expect(m.visible.length).toBe(3); expect(m.overflow?.length).toBe(3) })
  it('driver matrix shape',    () => { const m = buildMatrix('driver',    t=>t); expect(m.visible.length).toBe(3); expect(m.overflow).toBeUndefined() })
  it('admin matrix shape',     () => { const m = buildMatrix('admin',     t=>t); expect(m.visible.length).toBe(3); expect(m.overflow?.length).toBe(6) })
  ```
  Run → red.
- **Green**: Rewrite `components/RoleNav.tsx`:
  - Add lucide imports (`ShoppingBag, MapPin, AlertCircle, ThumbsUp, Tags, Map, Calendar, ClipboardList, Banknote, LayoutDashboard, Navigation, Heart, Settings, Globe`).
  - Export `buildMatrix(role: Role, t: (key: TranslationKey) => string): NavMatrix` — pure function, no side effects. Driver's Kudos label is the literal string `'Kudos'`; all other labels go through `t(...)`.
  - In the component body: `useEffect` reads cookie, sets `matrix` state. Renders `<BottomNav matrix={matrix} onOpenMore={() => setMoreOpen(true)} />` + (when `matrix.overflow`) `<MoreDrawer … />` — `MoreDrawer` doesn't exist yet, so for THIS commit either:
    - (a) inline a no-op placeholder `{moreOpen && <div />}` and wire the real drawer in Step 5, OR
    - (b) land Step 5's MoreDrawer creation in the same commit.
  - Choose (a) for smaller commits.
- `npx tsc --noEmit` → green. `npm run test` → green. Existing Playwright suite untouched.
- **Commit**: `feat(nav): NavMatrix contract + role matrices with overflow`

### Step 5 — MoreDrawer component (red → green → commit)
- **Red**: Add E2E scenario stub in `tests/e2e/mobile-chrome.spec.ts` (file-scaffold only — single failing scenario "sales → More opens drawer"). Run `npx playwright test --project=chromium tests/e2e/mobile-chrome.spec.ts` → red.
- **Green**: Create `components/MoreDrawer.tsx` per §6 spec. Wire it into `RoleNav.tsx` (replace placeholder).
- Run the new spec → green for that scenario.
- **Commit**: `feat(nav): MoreDrawer slide-up sheet for overflow tabs`

### Step 6 — (REMOVED under Path B)
Path B keeps the `Icons` export alive as a `@deprecated` lucide-backed shim. The shim is introduced in Step 3 in the same pass that deletes the inline `<svg>` object. There is no separate deletion step. The shim — and `components/DesktopRouteNav.tsx` — are both removed by **Item 3** of the UI overhaul, not by this plan.

Execution order under Path B: 1 → 2 → 3+4 → 5 → 7 → 8 (smoke only) → 9 → 10 → 11.

### Step 7 — AppHeader visual swap (red → green → commit)
- **Red**: Add E2E scenario "top bar has navy bg, orange MFS logo, white uppercase title" to `mobile-chrome.spec.ts`. Run → red (header still hardcoded hex).
- **Green**: Edit `components/AppHeader.tsx` per §6:
  - Line 139: `bg-[#16205B]` → `bg-mfs-navy`.
  - Line 144: `text-[#EB6619]` → `text-mfs-orange`.
  - Lines 145-150: title classes → `text-white text-sm font-semibold uppercase tracking-wider truncate`. Keep `|` divider.
  - Lines 85-87: replace 3-dot inline SVG with `<MoreVertical className="w-5 h-5" />` (`import { MoreVertical } from 'lucide-react'`).
  - Add `min-h-[64px]` to the inner flex container so the header content area is exactly 64px (safe-area pad accumulates above).
- Run E2E scenario → green. Full vitest + Playwright suites → green.
- **Commit**: `feat(chrome): restyle top bar to mfs-navy + uppercase white title`

### Step 8 — DesktopRouteNav visual smoke check (Path B) (no commit)
- **Hard constraint**: `components/DesktopRouteNav.tsx` is NOT edited in this plan. `git diff components/DesktopRouteNav.tsx` MUST show zero changes through every commit of this PR.
- Smoke verification (manual, run by the implementer at the end of Step 7's TDD loop, before Step 9):
  - `npm run dev`, open `/routes` and `/runs` at desktop viewport (≥1024px width where DesktopRouteNav renders).
  - Confirm all 10 icons consumed by DesktopRouteNav (`dashboard, routes, complaint, pricing, compliment, cash, admin, dispatch, visit, runs`) render at the same visual size and weight as the pre-PR baseline. The lucide shim defaults are `size={24} strokeWidth={2}`. If any icon looks thinner/thicker/larger/smaller than the inline SVG it replaced, tune the shim props in `components/BottomNav.tsx` and re-verify. The contract is **zero visible regression**.
  - Run `npx tsc --noEmit` → green. `npm run build` → green.
- No commit gets created in this step (the shim was already landed in Step 3's commit).

### Step 9 — Complete E2E scenarios for mobile chrome (red → green → commit)
- Expand `tests/e2e/mobile-chrome.spec.ts` to cover every scenario from spec §"L4 E2E":
  - Sales login → bottom nav shows Orders/Visits/Complaints/More
  - Tap More → drawer slides up
  - Drawer shows Pricing/Compliments/Routes(DESKTOP badge)/Runs
  - Tap backdrop → drawer closes
  - Driver login → 3 tabs only (My Route/Complaints/Kudos), no More button rendered
  - Admin login → drawer contains Cash/Compliments/Routes/Runs/Admin/Map
  - Active tab has orange icon + orange label + 3px orange top bar
  - Top bar: Navy bg, orange MFS logo, white uppercase title
- Use `test.use({ viewport: { width: 390, height: 844 } })`. Use the existing `_auth.ts` helper from `tests/e2e/` for role login (verify it supports each role; if a role login helper is missing for sales/office/warehouse/driver/admin, that's a blocker — see §11).
- Run `npx playwright test --project=chromium tests/e2e/mobile-chrome.spec.ts` → all green.
- **Commit**: `test(e2e): mobile chrome scenarios for all five roles`

### Step 10 — Bundle size verification (no commit unless threshold exceeded)
- Run `npm run build` and read the Next.js bundle output for the role-nav-bearing route.
- Lucide tree-shaking expectation: ~15 icons × ~1KB each gzipped ≈ <15KB. If the report shows >15KB additional, investigate the import pattern (must NOT be `import * as Icons from 'lucide-react'`).
- If threshold blown: file a fix (likely an accidental barrel import), recommit, re-run.

### Step 11 — Final acceptance pass (no commit)
- `npx tsc --noEmit` → zero new errors.
- `npm run test` → all 1162+ existing + new ~7 unit tests green.
- `npm run build` → production build succeeds.
- `npx playwright test --project=chromium tests/e2e/mobile-chrome.spec.ts` → all scenarios green.
- `npx playwright test --project=chromium tests/e2e/` (full E2E) → green (sanity that we didn't break other specs).
- Open PR `feat: UI overhaul Item 2 — mobile chrome (top bar, bottom nav, more drawer)` against `main`.

## 8. Test plan (exactly the 2 files from spec)

### `tests/unit/nav/role-nav-matrices.test.ts` (L1 — pure data, NO jsdom)
- Translation: `navCompliments.en === 'Compliments'`, `navCompliments.tr === 'Övgüler'`.
- NavMatrix type importable from `@/components/BottomNav`.
- `buildMatrix('sales', identity)` → `visible.length===3`, `overflow.length===4`, `overflow.find(i=>i.label==='Routes').desktopOnly===true`.
- `buildMatrix('office', identity)` → `visible.length===3`, `overflow.length===5`.
- `buildMatrix('warehouse', identity)` → `visible.length===3`, `overflow.length===3`.
- `buildMatrix('driver', identity)` → `visible.length===3`, `overflow===undefined`.
- `buildMatrix('admin', identity)` → `visible.length===3`, `overflow.length===6`.

### `tests/e2e/mobile-chrome.spec.ts` (L4 — Playwright chromium 390×844)
```
test.use({ viewport: { width: 390, height: 844 } })
```
Scenarios (one `test(...)` per bullet):
- Sales login → bottom nav shows Orders, Visits, Complaints, More.
- Sales → Tap More → drawer slides up (sheet visible, backdrop visible).
- Sales drawer rows: Pricing, Compliments, Routes (with DESKTOP pill), Runs.
- Sales → Tap backdrop → drawer closes.
- Driver login → 3 tabs visible (My Route, Complaints, Kudos), no More button.
- Admin login → drawer rows: Cash, Compliments, Routes, Runs, Admin, Map.
- Active tab visual: orange icon + orange label + 3px orange bar on top of the cell.
- Top bar visual: navy bg, MFS logo orange, title uppercase white.

Run: `npx playwright test --project=chromium tests/e2e/mobile-chrome.spec.ts`.

NO L2 (no DB). NO L3 (no APIs).

## 9. Acceptance criteria (verbatim from spec)

- ✅ `npx tsc --noEmit` — zero new errors (baseline preserved)
- ✅ `npm run test` — all 1162+ existing tests green, plus new L1
- ✅ `npm run build` — production build succeeds
- ✅ `npx playwright test mobile-chrome.spec.ts` — all scenarios green
- ✅ Implementation matches the Claude Design mock visually
- ✅ All existing functionality preserved:
  - Sync dot, language toggle, logout, iOS touch routing
  - Per-page chrome rendering (not moved to layout.tsx)
  - DesktopRouteNav.tsx still functional and visually identical (compatibility via `@deprecated` `Icons` shim in BottomNav.tsx; the file itself is byte-identical)
- ✅ Bundle size: lucide-react tree-shaken adds <15KB gzipped (verify via `npm run build` size report; flag if exceeded — likely indicates wrong import pattern like `import * as Icons from 'lucide-react'`)

## 10. Out of scope (verbatim DO NOT list)

- **DO NOT touch components/DesktopRouteNav.tsx.** No exception. The file remains byte-identical through this PR. Compatibility is provided by the `@deprecated` lucide-backed `Icons` shim in `components/BottomNav.tsx` (see §5). Item 3 of the UI overhaul deletes both the shim and DesktopRouteNav.tsx together.
- Touch components/MfsLogo.tsx (uses currentColor; no variant needed)
- Touch any page file in app/ (chrome only)
- Touch app/layout.tsx (per-page chrome stays per-page)
- Change auth, middleware, RLS, or routing logic
- Change language toggle / logout / sync dot logic
- Touch /kds, /haccp/*, /login
- Rename any URLs (Item 4)
- Add dashboards (Item 5)
- Add view-as-role (Item 7)
- Restyle body content of any page (chrome only)
- Add viewport-conditional rendering that hides chrome on desktop (interim state: same chrome at all viewports until Item 3)
- Remove NavItem.badge entirely — keep as @deprecated for DesktopRouteNav compatibility
- Add @testing-library, jsdom, webkit, or any new dependency BEYOND lucide-react
- Extract DotMenu from AppHeader.tsx to its own file

## 11. Risks + open notes

- **Gate 2 resolution (CLOSED)**: Hakan ratified **Path B**. The `Icons` export survives as a `@deprecated` lucide-backed shim in `components/BottomNav.tsx`; `components/DesktopRouteNav.tsx` is byte-identical. See §5 for shim wiring and Step 8 in §7 for the smoke-check.
- **BottomNav `@deprecated` `Icons` shim visual parity (load-bearing under Path B)**: the shim must visually match the original inline SVGs (24px, strokeWidth=2). If lucide-react defaults differ from the inline SVG renderings (e.g., stroke width, fill behaviour, viewBox padding), the implementer MUST explicitly pass props in the shim to match. Verify on `/routes` and `/runs` during Step 3 and re-verify during Step 8's manual smoke check. Contract: zero visible regression on those pages.
- **lucide-react bundle size**: Must use per-icon imports (`import { ShoppingBag } from 'lucide-react'`), never `import * as Icons from 'lucide-react'`. If Step 10 reports >15KB gzipped overhead, the import pattern is wrong somewhere. Mitigation: explicit per-icon imports throughout; verify via `npm run build` route report.
- **Translation key flip impact**: `grep -rn "Kudos\|Tebrikler" tests/` returned zero hits inside `/tests`. Outside `/tests`, only RoleNav line 76 hardcodes `'Kudos'` (driver) and is preserved by spec. No fixture-level fallout expected, but verify by running the full vitest suite after Step 1.
- **TypeScript red between Steps 3 and 4**: BottomNav's props change breaks RoleNav until RoleNav is rewritten. Plan combines them into a single commit (paired green) — TDD discipline preserved at the unit-test level.
- **MoreDrawer animation timing**: Spec calls for 250ms slide-up + 150ms backdrop fade. Tailwind defaults don't ship a 250ms duration class; use arbitrary value `duration-[250ms]` and `duration-150` respectively.
- **DotMenu remains inline** (spec hard-constraint). Step 7 only swaps the trigger SVG; the menu structure is untouched.
- **`_auth.ts` E2E helper coverage**: existing Playwright auth helper at `tests/e2e/_auth.ts` was written for the order-pipeline specs. If it only supports a subset of roles (admin / office), Step 9 may need to add login helpers for sales/warehouse/driver. Verify during Step 9 prep; if missing, the implementer extends `_auth.ts` minimally to cover the missing roles (counts as supporting test infra, not a feature change).
- **Driver Kudos label**: Hardcoded literal `'Kudos'` per spec — explicitly NOT translated. Easy to forget; flagged here.
- **`navCompliments` TR change**: "Övgüler" includes a non-ASCII character (Ö). The file is UTF-8; verify the edit preserves encoding (no `?` mojibake).

## 12. Rollback approach

`git revert <merge-commit-sha>` reverts the entire PR cleanly. The new `MoreDrawer.tsx` file and `tests/unit/nav/` + `tests/e2e/mobile-chrome.spec.ts` files are removed; AppHeader / BottomNav / RoleNav / translations.ts return to pre-PR state; `npm install` after revert removes `lucide-react`. `components/DesktopRouteNav.tsx` is unchanged before and after the revert (Path B touches zero bytes of that file).

Partial rollback (e.g. keep translation flip, revert chrome restyle): revert specific commits in reverse order — each commit is atomic per §7. The translation flip (Step 1) is independently revertable; the chrome restyle (Steps 3+4+5+7) is one logical unit and would be reverted as a group.
