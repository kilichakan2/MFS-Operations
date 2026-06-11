# UI Overhaul — Item 3: Desktop Chrome (Sidebar + Top Bar)

## Goal
Ship the desktop chrome (left sidebar + extended top bar) for md+ viewports, keep Item 2's mobile chrome untouched at <md, and delete Item 2's Path B technical debt (`DesktopRouteNav.tsx` + the `@deprecated Icons` shim in `BottomNav.tsx`).

## Source spec
- This Order brief (locked spec — Item 3, Frame escalated by Hakan).
- `docs/plans/2026-06-01-ui-overhaul-locked-decisions.md` §3-4 (per-role item lists, view-as deferred to Item 7).
- `docs/plans/2026-06-01-ui-overhaul-design-tokens.md` §7.7 (sidebar primitive contract).
- Per-role sidebar items, test files, and dimensions are the VERBATIM lists in the Order brief. Amendments A1-A7 supersede the brief where in conflict.

## Compliance
NO — this is chrome only. Does not touch auth, payments, data retention, HACCP, legislation, or financial logic. No compliance document update required.

## Branch
- Branch name: `feat/ui-overhaul-03-desktop-chrome`
- Base commit: `00d4c87` ("fix(ui-overhaul): hide stale DesktopRouteNav on /routes and /runs (#3)") on `main`.

---

## Files to change

### MODIFY (4)

1. **`components/AppHeader.tsx`** (current: 162 lines, single `<header>` mobile-only)
   - Wrap the existing mobile `<header>` block (current lines 137-161) so it renders only at `<md`: add `md:hidden` to its className.
   - Add a NEW desktop `<header>` (sibling), rendered only at `≥md`: `hidden md:flex`.
     - Background: `bg-mfs-navy`, fixed height `h-16` (64px), full viewport width `w-full`.
     - Sticky `top-0 z-[999]`, `shadow-mfs-1`.
     - Left slot: MFS logo wordmark, `text-mfs-orange`, `font-bold tracking-wider`, 22px (`text-[22px]`).
     - Middle slot: `title` prop, uppercase, `tracking-wider`, `text-white`, 22px (`text-[22px]`).
     - Right slot (horizontal, `gap-4` = 16px):
       - `<SyncDot />` — reuse the existing in-file component verbatim.
       - Language pill: small "EN | TR" toggle. Active option `bg-mfs-orange text-mfs-navy`; inactive `bg-transparent text-white`. Reads `lang` + calls `setLang` from `useLanguage()`.
       - Avatar dropdown: 40×40 circle (`w-10 h-10 rounded-full`), `bg-mfs-neutral-300`, white initial letter centered. Initial = first uppercase letter of role (`S` sales, `O` office, `W` warehouse, `D` driver, `A` admin). Click toggles a floating menu with:
         - "Logout" — calls `await fetch('/api/auth/logout', { method: 'POST' })` then `router.replace('/login')` (identical to existing `DotMenu.handleLogout`).
         - "Settings" — disabled placeholder. `aria-disabled="true"`, no onClick, muted styling. Reserves the spot for Item 7 view-as wiring.
   - Reuse: `SyncDot` (already in file), `useLanguage` (already imported), `MfsLogo` (already imported), `useRouter` (already imported via `DotMenu`).
   - Avatar reads role via the same cookie pattern as `RoleNav.getClientRole()` — replicate as a local helper inside `AppHeader` (no shared util needed; matches the file's existing self-contained pattern).
   - The existing `DotMenu` and `SyncDot` definitions stay (DotMenu is used by the now-`md:hidden` mobile header).

2. **`components/RoleNav.tsx`** (current: 160 lines)
   - Add a new pure exported function `buildSidebarItems(role: Role, t: Translator): NavItem[]` alongside `buildMatrix`. Returns the verbatim per-role flat list defined in the Order brief (see "Per-role sidebar items" below). Uses the SAME `Translator` type and the SAME label conventions as `buildMatrix` (driver's `Kudos`/`My Route`, sales' `Orders` stay hardcoded literals; everything else flows through `t(...)`).
   - In the component body, also compute the sidebar list:
     ```ts
     const [sidebarItems, setSidebarItems] = useState<NavItem[]>([])
     useEffect(() => {
       const role = getClientRole()
       setMatrix(buildMatrix(role, ...))
       setSidebarItems(buildSidebarItems(role, ...))
     }, [])
     ```
   - Add a body-attribute effect:
     ```ts
     useEffect(() => {
       document.body.setAttribute('data-mfs-chrome', 'true')
       return () => { document.body.removeAttribute('data-mfs-chrome') }
     }, [])
     ```
     (Runs once on mount; cleanup on unmount. Re-mounts on every page that renders `<RoleNav />` re-set the attribute idempotently — no flash.)
   - Update the render to dispatch by viewport:
     ```tsx
     return (
       <>
         {/* Mobile chrome (Item 2) — <md only */}
         <div className="md:hidden">
           <BottomNav matrix={matrix} onOpenMore={() => setMoreOpen(true)} />
           {matrix.overflow && (
             <MoreDrawer open={moreOpen} onClose={() => setMoreOpen(false)} items={matrix.overflow} />
           )}
         </div>
         {/* Desktop chrome (Item 3) — ≥md only */}
         <div className="hidden md:block">
           <DesktopSidebar items={sidebarItems} />
         </div>
       </>
     )
     ```
   - Early-return guard stays: if BOTH `matrix.visible.length === 0` AND `sidebarItems.length === 0`, return null (i.e. no role). Otherwise render the dispatcher (each side has its own internal empty guard).
   - Import `DesktopSidebar` from `@/components/DesktopSidebar`.

3. **`components/BottomNav.tsx`** (current: 134 lines)
   - DELETE the `@deprecated Icons shim` block at lines 109-133 in its entirety (the divider comment, the docstring, and the entire `export const Icons = { ... } as const`).
   - Also DELETE the `@deprecated` `badge?: string` field in the `NavItem` interface (lines 16-23 docstring + the `badge` field). The `desktopOnly` field stays — `MoreDrawer` reads it.
   - Audit lucide imports at lines 5-8. Current set: `LayoutDashboard, Map, AlertCircle, Tags, ThumbsUp, Banknote, Settings, MapPin, ClipboardList, Calendar, MoreHorizontal`. Of these, ONLY `MoreHorizontal` is used in the runtime `BottomNav` component (line 99). The other 10 (`LayoutDashboard, Map, AlertCircle, Tags, ThumbsUp, Banknote, Settings, MapPin, ClipboardList, Calendar`) exist solely to power the `Icons` shim. After deleting the shim, drop those 10 imports. Final import line: `import { MoreHorizontal } from 'lucide-react'`.
   - Verify with `grep -rn "from '@/components/BottomNav'" app/ components/` — confirm no caller imports `Icons` or `badge`.

4. **`app/globals.css`** (current: 160 lines)
   - Append at the end of the file (after the desktop type-ramp media query at line 159):
     ```css
     /* ── Desktop chrome — body padding when RoleNav is mounted ─── */
     @media (min-width: 768px) {
       body[data-mfs-chrome="true"] {
         padding-left: 64px;
       }
     }
     ```

### CREATE (3)

5. **`components/DesktopSidebar.tsx`** — new file.
   - Props: `{ items: NavItem[] }` (import `NavItem` type from `@/components/BottomNav`).
   - Hooks: `useState` for `pinned: boolean` (default `false`) and `expanded: boolean` (default `false`). `useRef<NodeJS.Timeout | null>` for hover-delay + leave-delay timers. `usePathname()` for active detection.
   - Layout:
     - `<aside>` fixed-positioned: `fixed left-0 top-16` (top-16 = 64px), `h-[calc(100vh-64px)]`, `z-[998]`.
     - Width transitions between `w-16` (64px collapsed) and `w-60` (240px expanded). Class: `transition-[width] duration-[250ms] ease-[cubic-bezier(0,0,0.2,1)]`.
     - Effective width = `pinned ? !startedAsCollapsed : hovered` (see hover logic below). Concretely: track `pinnedExpanded: boolean | null` where `null` = unpinned (hover-driven), `true` = pinned expanded, `false` = pinned collapsed. Default `null`.
     - `bg-mfs-navy`, `shadow-mfs-2` on the right edge.
   - Hover-peek logic (only fires when NOT pinned, i.e. `pinnedExpanded === null`):
     - `onMouseEnter`: clear leave-timer; start 300ms enter-timer that sets `hovered=true`.
     - `onMouseLeave`: clear enter-timer; start 300ms leave-timer that sets `hovered=false`.
   - Pin toggle: chevron button at sidebar bottom, 32×32, centered horizontally. `ChevronRight` icon when effective state is collapsed; `ChevronLeft` when expanded. `onClick`:
     - If currently effectively expanded → set `pinnedExpanded = false` (pin collapsed, force `hovered=false`).
     - If currently effectively collapsed → set `pinnedExpanded = true` (pin expanded).
     - Subsequent clicks toggle between pinned-expanded and pinned-collapsed (never returns to `null`/hover mode in this PR — A7 says reset on reload only).
   - Effective `expanded` boolean:
     ```ts
     const expanded = pinnedExpanded ?? hovered
     ```
   - Per-item rendering: map `items` to `<Link>` elements, 48px tall (`h-12`).
     - Active detection: `pathname === item.href`.
     - Active state: 3px `bg-mfs-orange` vertical bar absolutely positioned `left-0 top-0 bottom-0 w-[3px]`; icon and label colored `text-mfs-orange`; row bg `bg-white/[0.08]`.
     - Inactive: icon + label `text-white`; row hover `hover:bg-white/[0.05]`.
     - Icon: 24px lucide icon (rendered by the NavItem). When collapsed: icon centered in 64px column. When expanded: icon 16px from left, then 12px gap, then label.
     - Label: Inter Medium 14px (`text-sm font-medium`); `opacity-0` when collapsed, `opacity-100` when expanded; `transition-opacity duration-150 ease-[cubic-bezier(0,0,0.2,1)]`; `whitespace-nowrap overflow-hidden`.
   - Chevron button: `text-white/70 hover:text-white`, no pin-related label translation needed (icon-only button). `aria-label="Pin sidebar expanded"` / `"Pin sidebar collapsed"` swap on state. Import `ChevronLeft, ChevronRight` from `lucide-react`.
   - Cleanup: clear both timers in a `useEffect` cleanup on unmount.
   - Empty guard: if `items.length === 0`, return `null`.

6. **`tests/unit/nav/desktop-sidebar-items.test.ts`** — pure data unit tests (no DOM).
   - Import `buildSidebarItems` from `@/components/RoleNav` and use identity translator `(k) => k`.
   - Tests:
     - `sales` → array length 7. Assert exact `href` + `label` per slot in order:
       1. `/orders` → `Orders` (literal)
       2. `/visits` → `navVisits`
       3. `/complaints` → `navComplaints`
       4. `/pricing` → `navPricing`
       5. `/compliments` → `navCompliments`
       6. `/routes` → `navRoutes`
       7. `/runs` → `navRuns`
     - `office` → length 8: `/screen1` `navDispatch`, `/cash` `navCash`, `/complaints` `navComplaints`, `/pricing` `navPricing`, `/compliments` `navCompliments`, `/routes` `navRoutes`, `/runs` `navRuns`, `/screen4` `navDashboard`.
     - `warehouse` → length 6: `/screen1` `navDispatch`, `/complaints` `navComplaints`, `/routes` `navRoutes`, `/compliments` `navCompliments`, `/runs` `navRuns`, `/screen4` `navDashboard`.
     - `driver` → length 3: `/driver` `My Route` (literal), `/complaints` `navComplaints`, `/compliments` `Kudos` (literal).
     - `admin` → length 9: `/screen4` `navDashboard`, `/complaints` `navComplaints`, `/pricing` `navPricing`, `/cash` `navCash`, `/compliments` `navCompliments`, `/routes` `navRoutes`, `/runs` `navRuns`, `/screen5` `navAdmin`, `/screen6` `navMap`.
     - Empty role `''` → returns `[]`.
   - NOTE on "Active item detection via passed pathname": `buildSidebarItems` itself does NOT take a pathname (active state is computed inside the component from `usePathname()`). The L1 test scope is pure data only; active detection is asserted in the E2E test below. Document this in a code comment in the test file.

7. **`tests/e2e/desktop-chrome.spec.ts`** — Playwright chromium, viewport 1440×900.
   - File header: `test.use({ viewport: { width: 1440, height: 900 } })`.
   - Scenarios:
     1. Login as `sales` → desktop sidebar visible at left, 7 nav items rendered (assert count).
     2. Sidebar collapsed by default → assert `aside` computed `clientWidth === 64`.
     3. Hover sidebar 400ms → wait → assert `clientWidth === 240`, labels visible (assert by text).
     4. Mouse-leave 400ms → wait → assert `clientWidth === 64`.
     5. Click chevron → sidebar pins expanded (assert width 240 persists after mouse-leave + 500ms wait). Click chevron again → pins collapsed (assert width 64 persists even on hover).
     6. Click "Orders" nav item → URL becomes `/orders`, top bar title text updates.
     7. Active item: navigate to `/orders` → assert the Orders row has a child with `bg-mfs-orange` and `w-[3px]` (the active bar), and icon/label have `text-mfs-orange` class.
     8. Login as `admin` → 9 sidebar items visible, no scrollbar on the `aside` (assert `scrollHeight === clientHeight`).
     9. Login as `driver` → 3 items only, sidebar renders without errors.
     10. Top bar avatar click → dropdown shows "Logout" enabled and "Settings" disabled (assert `aria-disabled="true"`).
     11. Top bar language pill: click "TR" → assert document language switches (sample any translated title changes from EN→TR string).
     12. Body padding: at 1440 viewport, assert `getComputedStyle(document.body).paddingLeft === '64px'` after login lands on a page with `RoleNav`.
     13. Switch viewport to 390×844 (`page.setViewportSize({ width: 390, height: 844 })`) → assert desktop sidebar `aside` is not visible (display:none via `hidden md:block` parent), mobile `BottomNav` is visible at bottom. (Regression check that Item 2 chrome still works.)
   - Do NOT place this file in `e2e/` — use `tests/e2e/` to match `mobile-chrome.spec.ts` location.

### DELETE (1)

8. **`components/DesktopRouteNav.tsx`** — delete the file outright. Verified zero refs in `app/` (and only self-refs in `components/`). Deletion safe.

---

## Per-role sidebar items (VERBATIM — for buildSidebarItems)

Each row: label / href / lucide icon. Icons must use `size={24} strokeWidth={2}` to match `buildMatrix` convention.

**SALES (7):**
| Label | href | Icon |
|---|---|---|
| `Orders` (literal) | `/orders` | `ShoppingBag` |
| `t('navVisits')` | `/visits` | `MapPin` |
| `t('navComplaints')` | `/complaints` | `AlertCircle` |
| `t('navPricing')` | `/pricing` | `Tags` |
| `t('navCompliments')` | `/compliments` | `ThumbsUp` |
| `t('navRoutes')` | `/routes` | `Map` |
| `t('navRuns')` | `/runs` | `Calendar` |

**OFFICE (8):**
| Label | href | Icon |
|---|---|---|
| `t('navDispatch')` | `/screen1` | `ClipboardList` |
| `t('navCash')` | `/cash` | `Banknote` |
| `t('navComplaints')` | `/complaints` | `AlertCircle` |
| `t('navPricing')` | `/pricing` | `Tags` |
| `t('navCompliments')` | `/compliments` | `ThumbsUp` |
| `t('navRoutes')` | `/routes` | `Map` |
| `t('navRuns')` | `/runs` | `Calendar` |
| `t('navDashboard')` | `/screen4` | `LayoutDashboard` |

**WAREHOUSE (6):**
| Label | href | Icon |
|---|---|---|
| `t('navDispatch')` | `/screen1` | `ClipboardList` |
| `t('navComplaints')` | `/complaints` | `AlertCircle` |
| `t('navRoutes')` | `/routes` | `Map` |
| `t('navCompliments')` | `/compliments` | `ThumbsUp` |
| `t('navRuns')` | `/runs` | `Calendar` |
| `t('navDashboard')` | `/screen4` | `LayoutDashboard` |

**DRIVER (3):**
| Label | href | Icon |
|---|---|---|
| `My Route` (literal) | `/driver` | `Navigation` |
| `t('navComplaints')` | `/complaints` | `AlertCircle` |
| `Kudos` (literal) | `/compliments` | `Heart` |

**ADMIN (9):**
| Label | href | Icon |
|---|---|---|
| `t('navDashboard')` | `/screen4` | `LayoutDashboard` |
| `t('navComplaints')` | `/complaints` | `AlertCircle` |
| `t('navPricing')` | `/pricing` | `Tags` |
| `t('navCash')` | `/cash` | `Banknote` |
| `t('navCompliments')` | `/compliments` | `ThumbsUp` |
| `t('navRoutes')` | `/routes` | `Map` |
| `t('navRuns')` | `/runs` | `Calendar` |
| `t('navAdmin')` | `/screen5` | `Settings` |
| `t('navMap')` | `/screen6` | `Globe` |

**No "More" item on desktop. No overflow split.** All items render in the sidebar.

All lucide icons listed above are ALREADY imported in `RoleNav.tsx` (lines 23-27). No new imports needed for `buildSidebarItems`.

---

## Steps (TDD red-green-refactor, atomic commits)

Branch off `main` at `00d4c87`.

### Phase 0 — verification & branch setup
- [ ] 1. `git checkout -b feat/ui-overhaul-03-desktop-chrome` from `main` (sha `00d4c87`).
- [ ] 2. Verify `grep -rn "DesktopRouteNav" app/` returns ZERO matches. (Also grep `components/` — only `DesktopRouteNav.tsx` itself should self-reference.) If anything in `app/` still imports `DesktopRouteNav`, STOP and report.
- [ ] 3. Verify `grep -rn "from '@/components/BottomNav'" app/ components/` to enumerate callers of `BottomNav`. Confirm no caller imports `Icons` or uses the `badge` field on `NavItem`. If any caller does, STOP and report.
- [ ] 4. Run `npm run test` baseline → record green count (expected ≥1172).

### Phase 1 — L1 test red, then green (buildSidebarItems)
- [ ] 5. RED: create `tests/unit/nav/desktop-sidebar-items.test.ts` with the 6 cases above (all roles + empty). Run `npm run test tests/unit/nav/desktop-sidebar-items.test.ts` → assert failure (function doesn't exist yet). Commit as `test(nav): red — desktop sidebar items per role`.
- [ ] 6. GREEN: add `buildSidebarItems(role, t)` to `components/RoleNav.tsx` returning the exact verbatim per-role lists from the table above. Re-run the L1 test → green. Run full `npm run test` → still ≥1172 green plus 6 new. Commit as `feat(nav): buildSidebarItems pure data per role`.

### Phase 2 — DesktopSidebar component
- [ ] 7. Create `components/DesktopSidebar.tsx` per the spec above (hover-peek, pin chevron, active-bar, width transitions, z-[998]). No tests yet — covered by E2E. Run `npx tsc --noEmit` → zero new errors. Commit as `feat(nav): DesktopSidebar collapsible left rail`.

### Phase 3 — AppHeader desktop variant
- [ ] 8. Modify `components/AppHeader.tsx`:
   - Wrap existing mobile `<header>` in `md:hidden`.
   - Add new desktop `<header>` (`hidden md:flex`) with logo / title / sync dot / language pill / avatar dropdown per spec.
   - Avatar reads role via local cookie-read helper (mirrors `RoleNav.getClientRole`).
   - "Settings" dropdown item is disabled placeholder.
   - Run `npx tsc --noEmit` → zero new errors. Run `npm run test` → still green. Commit as `feat(chrome): desktop top bar variant in AppHeader`.

### Phase 4 — RoleNav viewport dispatch + body attribute
- [ ] 9. Modify `components/RoleNav.tsx`:
   - Compute `sidebarItems` via `buildSidebarItems` alongside `matrix`.
   - Add the `data-mfs-chrome` body-attribute effect.
   - Replace the render block with the mobile (`md:hidden`) vs desktop (`hidden md:block`) dispatcher.
   - Run `npx tsc --noEmit` → zero new errors. Run `npm run test` → still green. Commit as `feat(chrome): RoleNav dispatches mobile vs desktop chrome`.

### Phase 5 — globals.css body padding
- [ ] 10. Append the `body[data-mfs-chrome="true"]` media query to `app/globals.css`. Verify it lands after the existing desktop type-ramp media query (line 159). Commit as `feat(chrome): body padding-left when desktop chrome mounted`.

### Phase 6 — Delete DesktopRouteNav
- [ ] 11. Re-verify `grep -rn "DesktopRouteNav" app/ components/` returns only the file itself. Run `git rm components/DesktopRouteNav.tsx`. Run `npx tsc --noEmit` → zero new errors. Run `npm run test` → still green. Commit as `chore(nav): remove orphaned DesktopRouteNav`.

### Phase 7 — Delete Icons shim + badge field + dead lucide imports
- [ ] 12. Edit `components/BottomNav.tsx`:
   - Delete lines 109-133 (the `@deprecated Icons shim` divider, docstring, and `export const Icons = { ... } as const`).
   - Delete the `@deprecated badge?: string` field in `NavItem` (lines 16-23 docstring + the field). Keep `desktopOnly?: boolean` — `MoreDrawer` reads it.
   - Trim lucide imports at lines 5-8 down to `import { MoreHorizontal } from 'lucide-react'` (the only icon still used at runtime — line 99). Drop the 10 shim-only icons: `LayoutDashboard, Map, AlertCircle, Tags, ThumbsUp, Banknote, Settings, MapPin, ClipboardList, Calendar`.
   - Verify with `grep -n "Icons\|badge" components/BottomNav.tsx` → no matches (besides the `MoreHorizontal` icon and the `aria-label` strings).
   - Run `npx tsc --noEmit` → zero new errors. Run `npm run test` → still green. Commit as `chore(nav): drop @deprecated Icons shim and badge field from BottomNav`.

### Phase 8 — E2E
- [ ] 13. Create `tests/e2e/desktop-chrome.spec.ts` with the 13 scenarios above. Run `npx playwright test tests/e2e/desktop-chrome.spec.ts` → all green. Run `npx playwright test tests/e2e/mobile-chrome.spec.ts` → still green (regression). Commit as `test(e2e): desktop chrome — sidebar, top bar, dispatch, regression`.

### Phase 9 — Final verification
- [ ] 14. Run in order: `npx tsc --noEmit`, `npm run test`, `npm run build`, `npx playwright test tests/e2e/desktop-chrome.spec.ts tests/e2e/mobile-chrome.spec.ts`. All must pass.
- [ ] 15. Push branch, open PR titled `feat(ui-overhaul): item 3 — desktop chrome (sidebar + top bar)`. Do not merge.

---

## Test plan

| Level | File | Scope |
|---|---|---|
| L1 unit | `tests/unit/nav/desktop-sidebar-items.test.ts` | Pure data: per-role item list shape (length + href + label, in order). Empty role returns `[]`. NO DOM, NO jsdom, NO @testing-library. |
| L4 E2E | `tests/e2e/desktop-chrome.spec.ts` | Playwright chromium @1440×900: 13 scenarios covering sidebar render, hover-peek, pin toggle, active state, top bar dropdown, language pill, body padding, mobile-regression viewport swap. |

Do NOT create:
- Any file under `components/__tests__/`
- Any `.test.tsx` file (no component-rendering unit tests)
- Tests in `e2e/` (use `tests/e2e/`)

NO L2 (no DB). NO L3 (no APIs).

---

## Acceptance criteria
- [ ] `npx tsc --noEmit` — zero new errors (baseline preserved)
- [ ] `npm run test` — all 1172+ existing tests still green plus new L1 (6 cases)
- [ ] `npm run build` — production build succeeds
- [ ] `npx playwright test desktop-chrome.spec.ts` — all scenarios green
- [ ] `npx playwright test mobile-chrome.spec.ts` — Item 2 still passes
- [ ] Desktop viewport (1440px): sidebar + top bar visible, mobile chrome HIDDEN
- [ ] Mobile viewport (390px): mobile chrome visible, sidebar HIDDEN
- [ ] Sync dot, language toggle, logout still functional in both chromes
- [ ] `components/DesktopRouteNav.tsx` no longer exists
- [ ] `Icons` shim no longer exists in `BottomNav.tsx` (`grep -n "export const Icons" components/BottomNav.tsx` returns nothing)
- [ ] Body padding correctly applied when pages mount RoleNav and removed when unmounted

### Preservation checks
- [ ] `AppHeader`'s `SyncDot` + `DotMenu` logic survives — mobile chrome unchanged at <md.
- [ ] `LanguageContext` consumed identically by both top bar variants.
- [ ] Logout endpoint `/api/auth/logout` called the same way from both the mobile `DotMenu` and the new desktop avatar dropdown.
- [ ] `RoleNav`'s `mfs_role` cookie read unchanged.
- [ ] No imports of `Icons` from `BottomNav.tsx` exist after deletion.
- [ ] Body `data-mfs-chrome` doesn't conflict with any existing body attribute (verified: no current consumer).

### Edge cases handled
- Navigating between RoleNav pages: each page's RoleNav re-sets `data-mfs-chrome` on mount, removes on unmount. Cleanup-on-unmount + immediate set-on-next-mount is idempotent — no flash of unstyled padding.
- Pages WITHOUT RoleNav (`/kds`, `/haccp/*`, `/login`): no attribute, no padding, no sidebar.
- SSR: `data-mfs-chrome` is set client-side only. First paint has 0 padding; hydrate adds the attr and CSS applies 64px padding. The 1-frame shift is masked by the sidebar's own shadow-2 slide-in. Acceptable for chrome.

---

## Out of scope (DO NOT)
- ❌ Touch any page file in `app/` (chrome only)
- ❌ Touch `app/layout.tsx`
- ❌ Touch `components/MfsLogo.tsx` (currentColor pattern stays)
- ❌ Touch `components/MoreDrawer.tsx` (Item 2 component, mobile-only)
- ❌ Change Item 2's mobile chrome behavior at <768px viewport
- ❌ Change auth, middleware, RLS, or routing logic
- ❌ Change language toggle / logout / sync dot logic — REUSE these
- ❌ Touch `/kds`, `/haccp/*`, `/login`
- ❌ Rename any URLs (Item 4)
- ❌ Add view-as-role functionality (Item 7) — the "Settings" dropdown item is a disabled placeholder only
- ❌ Introduce new dependencies (lucide-react already added in Item 2)
- ❌ Add `@testing-library`, `jsdom`, `webkit`
- ❌ Persist sidebar pin state (no localStorage, no cookie — A7)
- ❌ Update `docs/plans/2026-06-01-ui-overhaul-design-tokens.md` §7.7 widths (deferred to follow-up sweep — A2)

---

## Rollback
`git revert` the PR merge commit. The 4 modified files revert cleanly (each was atomic), the 3 created files vanish, and `components/DesktopRouteNav.tsx` returns. Mobile chrome (Item 2) was never touched at runtime so it survives a partial revert too.

---

## Risks & open notes

1. **SSR 1-frame body-padding shift.** `data-mfs-chrome` is set in `useEffect`, so first paint at md+ shows 0 padding for ~1 frame before hydration. Sidebar's slide-in shadow masks this. If it proves visible in QA, fallback: set the attribute in a `<script>` block in `app/layout.tsx` reading the cookie SSR-side — but that's an Item 4+ scope expansion. Flagged for ship-or-loop decision.

2. **Sidebar pin state resets on reload.** Per A7. Every page navigation that re-mounts `RoleNav` (full page nav within Next.js router preserves the React tree, so should be fine — but a full browser refresh resets to collapsed). Acceptable per spec; if Hakan complains, persistence is a follow-up.

3. **Shim icon repurposing.** The 10 lucide imports being deleted from `BottomNav.tsx` (`LayoutDashboard, Map, AlertCircle, Tags, ThumbsUp, Banknote, Settings, MapPin, ClipboardList, Calendar`) are ALL still used by `RoleNav.tsx` (lines 23-27 import the same set plus more). No visual parity risk — the icons are imported fresh from `lucide-react` directly in `RoleNav` already. Verified by inspection.

4. **768-1023px viewport band.** Tablets and small laptops in this band currently render mobile chrome (Item 2 had no desktop branch). With md=768px, those devices now switch to desktop chrome on first hit. This is per Hakan's A5 amendment — single boundary, no overlap — and tested explicitly in E2E scenario 13 (390×844 still mobile). Not a regression, but worth a manual sanity check on an iPad-sized viewport during QA.

5. **Avatar role-letter cookie read.** Both `RoleNav` and the new `AppHeader` desktop branch read the same `mfs_role` cookie. Same source of truth. If role-picker hasn't run yet (no cookie), the avatar shows blank — acceptable since the rest of the desktop chrome also won't render (RoleNav early-returns null with no items). Avatar dropdown stays clickable; "Logout" works regardless.

6. **`buildMatrix` and `buildSidebarItems` divergence.** Two parallel data builders for the same role concept invite drift. Acceptable for this PR — the mobile chrome (Item 2) needs the `visible`/`overflow` split, the desktop chrome needs the flat list. Consolidation, if desired, is an Item 5+ refactor and out of scope.

7. **Test file location.** `tests/e2e/` confirmed as the convention (Item 2's `mobile-chrome.spec.ts` lives there). Do NOT use root-level `e2e/`.

8. **`NavItem.badge` field deletion.** Confirmed via grounding that `MoreDrawer` reads `desktopOnly` but never `badge`. The shim-era `badge` field is dead. If Phase 0 step 3's grep finds a caller, STOP — do NOT improvise.
