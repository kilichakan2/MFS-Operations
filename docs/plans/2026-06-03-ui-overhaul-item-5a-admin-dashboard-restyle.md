# Item 5a — /dashboard/admin restyle (UI overhaul)

## Goal
Replace the 838-line `app/dashboard/admin/page.tsx` (formerly `/screen4`) with a token-faithful, mockup-driven layout: 5 KPI tiles, a pill-strip range picker (Today / This week / This month / This quarter), 6 list/chart cards in a 2-col desktop grid (1-col mobile stack), and 3 compact stat blocks. Same data sources + one new orders query. No chrome edits, no `/orders` edits, no production logic changes. Same role gating, same redirect/auth behaviour.

## Source spec
This plan is the contract. Inputs:
- Design bundle at `/tmp/mfs-design/mfs-ops-app/project/` — `MFS Admin Dashboard Restyle.html` + `dashboard.jsx` + `dashboard-blocks.jsx` + `dashboard-cards.jsx` + `dashboard-chrome.jsx` + `icons.jsx`. Designer ↔ user transcript at `/tmp/mfs-design/mfs-ops-app/chats/chat1.md` lines 822–1434.
- Locked content brief: `docs/plans/2026-06-01-ui-overhaul-locked-decisions.md:111-120`.
- Design tokens: `docs/plans/2026-06-01-ui-overhaul-design-tokens.md` + `tailwind.config.ts` + `app/globals.css`.
- Existing surface: `app/dashboard/admin/page.tsx` + `app/api/dashboard/route.ts`.
- Consultant decisions on Frame Q1–Q14 (Gate 1 sign-off, this session).

## Compliance
**NO.** Restyle pass — no auth, payments, RLS, HACCP, legislation, or financial logic touched. Role-permission relationships byte-identical. One mechanical Supabase read added against the existing `orders` table; same role gating (admin only via middleware). No schema change, no new endpoint, no feature-flag toggle.

## Branch + base
- Branch: `feat/ui-overhaul-05a-admin-dashboard-restyle` (implementer cuts from main; not yet cut).
- Base: current `main` HEAD `1ff35e0` (PR #9 squash — annualReview hotfix).

---

## Frame decisions reflected here (Q1–Q14)
Reference for traceability — acceptance criteria below verify each.

| # | Decision |
|---|---|
| Q1 | Mockup IA wins. Restructure accepted. |
| Q2 | One new Supabase query against existing `orders` table inside `/api/dashboard`. No schema change. |
| Q3 | Orders KPI tap → `/orders` (lands on `<OrderPipelinePausedNotice />` for now — accepted). |
| Q4 | Page heading: eyebrow only `ADMIN · DAILY GLANCE`. No big H1 — `<AppHeader title="Dashboard">` carries the page title. |
| Q5 | Status colours through `mfs-success` / `mfs-warning` / `mfs-danger` Tailwind utilities (already in `tailwind.config.ts` + `app/globals.css:59-61` — confirmed present, no addition needed). |
| Q6 | Visits-by-rep: no warning treatment. Plain navy bars, descending by count. No threshold constant. |
| Q7 | Tabbed Today feed dropped. DetailModal usage removed from this page (3 other consumers keep the component alive). |
| Q8 | AppHeader `actions` (HACCP shortcut + Refresh) preserved untouched. |
| Q9 | DateFilterBar replaced with 4-pill RangeTabs. Last Month + Custom dropped. `buildRange()` gets a `quarter` case. |
| Q10 | Charts swap: complaint categories = Recharts donut (PieChart with innerRadius). Hunter/farmer = CSS split bar (no Recharts). |
| Q11 | Sales-activity type breakdown (routine / new pitch / complaint f/u / delivery issue) dropped. Visits-by-rep is one bar per rep, count only. |
| Q12 | Discrepancies KPI sub-label uses `range.label`, not "Awaiting reconciliation". |
| Q13 | Loading state: keep current full-page `<Spinner />` first-load behaviour. No per-card skeletons. |
| Q14 | Empty states: list cards with empty data show inline `Nothing to surface — {range.label}` instead of hiding. KPI tiles always render. Chart cards (donut, split-bar) hide when total === 0. |

---

## Files to change

### Brief deliverable 1 — API delta (data layer)
- **`app/api/dashboard/route.ts`** — patch. Add a 12th parallel query reading `orders` filtered to `delivery_date = today` (or `created_at` if `delivery_date` is absent — implementer verifies the column at C1). Group by `state` (placed / printed / completed). Add to response payload:
  ```ts
  ordersToday: {
    placed:    number  // count where state = 'placed'
    printed:   number  // count where state = 'printed'
    completed: number  // count where state = 'completed'
    total:     number  // sum of all three
  }
  ```
  No other queries change. No business logic touched. No middleware change (route already gated; `/api/dashboard` is in admin's `ROLE_PERMISSIONS`).

### Brief deliverable 2 — primitives (NEW)
- **`app/dashboard/admin/_components/primitives.tsx`** — new file. Pure presentation building blocks consumed by `page.tsx` and `cards.tsx`. Exports:
  - `Card` — base surface (white bg, hairline border, `--mfs-soft-neutral` page bg; `rounded-lg` radius, `shadow-sm` elevation). Token-faithful equivalent of design-tokens spec §7.3.
  - `CardHead` — icon + uppercase title + optional count pill. Compact-mode flag for mobile density.
  - `SectionLabel` — small-caps, tracked-out, muted (`--fg3` ≈ `text-mfs-neutral-500`). Maps to design-tokens type ramp `caption`.
  - `ListRow` — mobile stacked row primitive (left accent dot + cells + bottom hairline).
  - `TableRow` + `RowHead` — desktop grid row primitive (column heads + grid rows).
  - `StagePill` — used by `ProspectsCard` rows (colour dot + uppercase stage label).
  - `KpiTile` — KPI card variant with 4px left accent stripe, value (display ramp 30px mobile / 44px desktop), uppercase label, optional sub. Props: `{ value, label, sub, accent: 'success'|'warning'|'danger'|'navy', icon: ReactNode, href: string, tight?: boolean }`. Wraps content in `<Link>` for full-tile tap. `tight` flag enables `whitespace-nowrap` + smaller sub size (used by Orders tile on mobile per addendum spec).
  - `RangeTabs` — 4-option pill strip. Props: `{ value, onChange, ranges, scrollOnSmall?: boolean }`. Active = navy fill / white text; inactive = `--fg2` ≈ `text-mfs-neutral-700`. Hides scrollbar chrome on mobile (the addendum's chat fix at `chat1.md:1162`).
  - `PageHeading` — eyebrow only, no H1. Renders `ADMIN · DAILY GLANCE` (tracked-out uppercase, muted).
  - `EmptyState` — `Nothing to surface — {rangeLabel}` inline message used by surviving operational list cards when their data array is empty.
- Pure functions exported alongside for vitest:
  - `accentClassFor(accent: 'success'|'warning'|'danger'|'navy') → { stripe, value }` — maps accent to Tailwind colour utility names. Lets tests assert mapping without DOM.
  - `formatOrdersSubLabel({ placed, printed, completed }) → string` — returns `"12 placed / 8 printed / 4 completed"`.

### Brief deliverable 3 — cards (NEW)
- **`app/dashboard/admin/_components/cards.tsx`** — new file. Composes primitives + data. Six exports, each takes a `compact: boolean` flag (true on mobile <md). Empty-state behaviour per Q14:
  - `OpenComplaintsCard({ items, compact })` — Card + CardHead with count badge + desktop table (cols: Account / Category / Age / Owner; Age in `text-mfs-danger`) OR mobile list-rows (red accent dot, account + age inline, category/owner subline). EmptyState if `items.length === 0`.
  - `AtRiskCard({ items, compact })` — Card + CardHead + desktop table (cols: Account / Reason / Avg order) OR mobile list-rows (amber accent dot). EmptyState if empty.
  - `CommitmentsCard({ items, compact })` — Card + CardHead + list-rows. Due-state pill: overdue = red pill (`bg-mfs-danger/8` + `text-mfs-danger`), otherwise muted neutral. EmptyState if empty.
  - `VisitsByRepCard({ reps, compact })` — Card + CardHead + single horizontal bar per rep, ordered descending by count. Bar fill = `bg-mfs-navy`. NO warning dot, NO amber bar (Q6). EmptyState if empty.
  - `ComplaintCategoriesCard({ categories, compact })` — Card + CardHead + Recharts `<PieChart>` (donut: innerRadius=44, outerRadius=66) + legend list (colour swatch + label + count). Centre overlay shows total count + "this week" caption. Hides if `categories.length === 0`.
  - `ProspectsCard({ items, compact })` — Card + CardHead + desktop table (cols: Account / Stage / Value) OR mobile list-rows + StagePill. EmptyState if empty.

### Brief deliverable 4 — stat blocks (NEW)
- **`app/dashboard/admin/_components/stat-blocks.tsx`** — new file. Three compact stat block variants in a single `StatBlock` switch component. Props: `{ kind: 'split'|'value', label, value?, unit?, hunter?, farmer? }`:
  - `kind = 'split'` (Hunter/farmer): SectionLabel + 10px split bar (`bg-mfs-orange` left / `bg-mfs-navy` right) + percentage row below.
  - `kind = 'value'` (Avg resolution, Complaints this week): SectionLabel + display-ramp value + optional unit. Mobile = 30px value; desktop = 38px.

### Brief deliverable 5 — page rewrite
- **`app/dashboard/admin/page.tsx`** — full rewrite. ~838 lines → ~250 lines target. Structure:
  - `'use client'` directive + imports (RoleNav, AppHeader, primitives, cards, stat-blocks).
  - `DashboardData` interface — keep current fields; ADD `ordersToday: { placed, printed, completed, total }`.
  - `EMPTY` constant — extend.
  - `buildRange(preset, ...)` — keep, ADD `'quarter'` case (start = first day of current calendar quarter, end = now; label = "This quarter"). Drop `'last_month'` and `'custom'` cases (Q9). `Preset` type becomes `'today' | 'week' | 'month' | 'quarter'`.
  - `Screen4Page` component (rename to `AdminDashboardPage` — minor cleanup since file moved to /dashboard/admin):
    - State: `data`, `loading`, `error`, `lastFetch`, `preset`. Drop `modal`, `customFrom`, `customTo` (Q7, Q9).
    - `range` memo derived from `preset` only (no custom inputs).
    - `fetchData` callback — unchanged shape (still `GET /api/dashboard?from=…&to=…`).
    - Layout:
      ```
      <AppHeader title="Dashboard" actions={<HACCP> + <Refresh>} />   ← preserved (Q8)
      <PageHeading />                                                  ← eyebrow only (Q4)
      <KpiTile × 5 (Open complaints / Visits / Discrepancies / Active pricing / Orders today)>  ← Q2, Q12
      <RangeTabs value={preset} onChange={setPreset} />                ← Q9
      <StatBlock × 3 (hunter/farmer split / avg resolve / complaints week)>  ← Q10
      <Cards grid: desktop 2-col / mobile 1-col stack>
        <OpenComplaintsCard /><AtRiskCard /><CommitmentsCard />
        <ProspectsCard /><VisitsByRepCard /><ComplaintCategoriesCard />
      <Spinner /> on first load                                        ← Q13
      ```
  - Drop entirely: `Badge`, `AlertGroup`, `AlertRow`, `TodayTabs`, `DateFilterBar`, `BreakdownRow`, `KpiCard` (replaced by extracted `KpiTile`), the modal state and `<DetailModal>` import (Q7).
  - The stale `[screen4]` console.log at line 294 disappears with `TodayTabs` (the consultant's Item 6 backlog entry resolves naturally — note this in the PR body).

### Brief deliverable 6 — token confirmation
- **`app/globals.css`** — no edit. Lines 59–61 already define `--mfs-success`, `--mfs-warning`, `--mfs-danger`. `tailwind.config.ts` already exposes the matching utilities. Plan confirms — implementer verifies at C1.

---

## Component breakdown (block → token-spec primitive)

| Block | Built from | Data source |
|---|---|---|
| KPI row (5 tiles) | `KpiTile` = `Card` 7.3 + 4px left stripe + display-ramp value + caption-ramp label + optional sub. Mobile 2-col grid w/ Orders tile spanning full row 3; desktop 1×5 grid. | `data.openComplaints48h.length`, `totalVisits = sum(visitsToday[].count)`, `data.discrepanciesToday.length`, `data.activePricing`, `data.ordersToday.total` |
| Range tabs | `RangeTabs` — segmented pill strip `--radius-pill`, active fill `--mfs-navy`. | Local state `preset: Preset` |
| Stat blocks (3) | `StatBlock` switch — compact `Card` variant w/ section-label + display-ramp value OR split-bar. | `data.hunterFarmer`, `data.avgResolutionHours`, `data.totalComplaintsWeek` |
| Open complaints card | `Card` + `CardHead` + `TableRow`/`RowHead` (desktop) or `ListRow` (mobile). Age in `text-mfs-danger`. | `data.openComplaints48h` |
| At-risk accounts card | Same primitives. Amber accent dot mobile. | `data.atRiskAccounts` |
| Unreviewed commitments card | `Card` + `CardHead` + `ListRow`. Overdue pill = `bg-mfs-danger/8` + `text-mfs-danger`. | `data.unreviewedCommitments` (filter `over = hoursAgo > 24`) |
| Visits by rep card | `Card` + `CardHead` + horizontal bar per rep (`bg-mfs-navy`, no thresholds). | `data.weekVisitsByRep` sorted desc by `total` |
| Complaint categories card | `Card` + `CardHead` + Recharts `PieChart` (innerRadius=44, outerRadius=66) + centre total + legend list. | `data.weekComplaintCategories` mapped to colour cycle: maroon / orange / navy / sand / red |
| Prospects card | `Card` + `CardHead` + `TableRow`/`ListRow` + `StagePill` (Quoted=orange, Sampling=sand, Contacted=navy — matches design intent; pipeline_status values from data). | `data.prospectsThisWeek` |
| Page heading | `PageHeading` — caption ramp uppercase, muted. | static literal `"ADMIN · DAILY GLANCE"` |
| Empty state | `EmptyState` — inline message in card body when array empty. | `range.label` |

---

## Token-to-Tailwind mapping

Every colour resolves through Tailwind utilities backed by `app/globals.css` CSS variables (no hex literals).

| Mockup token | Tailwind utility | CSS variable |
|---|---|---|
| `STATUS.danger` `#FF3300` | `bg-mfs-danger`, `text-mfs-danger` | `--mfs-danger: #FF3300` (= `--mfs-red`) |
| `STATUS.warning` `#B45309` | `bg-mfs-warning`, `text-mfs-warning` | `--mfs-warning: #B45309` |
| `STATUS.success` `#16A34A` | `bg-mfs-success`, `text-mfs-success` | `--mfs-success: #16A34A` |
| `STATUS.blue` `#16205B` | `bg-mfs-navy`, `text-mfs-navy` | `--mfs-navy: #16205B` |
| `--bg` `#EDEAE1` | `bg-mfs-soft-neutral` (or `bg-mfs-neutral-100`) | `--mfs-soft-neutral: #EDEAE1` |
| `--bg-raised` `#FFFFFF` | `bg-white` | n/a |
| `--fg1` `#1E1E1E` | `text-mfs-black` (or `text-mfs-neutral-900`) | `--mfs-black: #1E1E1E` |
| `--fg2` `#4a4a4a` (mock) | `text-mfs-neutral-700` `#3A352C` (closest brand-aligned) | `--mfs-neutral-700` |
| `--fg3` `#7c786e` (mock) | `text-mfs-neutral-500` `#5C5648` (closest brand-aligned) | `--mfs-neutral-500` |
| `--border` `#d8d3c5` (mock) | `border-mfs-neutral-200` `#DDD8CB` | `--mfs-neutral-200` |
| `--mfs-maroon` | `bg-mfs-maroon`, `text-mfs-maroon` | `--mfs-maroon: #590129` |
| `--mfs-orange` | `bg-mfs-orange`, `text-mfs-orange` | `--mfs-orange: #EB6619` |
| `--mfs-sand` | `bg-mfs-sand`, `text-mfs-sand` | `--mfs-sand: #C0946F` |

The designer's `--fg2` `#4a4a4a` and `--fg3` `#7c786e` differ marginally from our locked `--mfs-neutral-700` `#3A352C` and `--mfs-neutral-500` `#5C5648` — implementation uses the brand-aligned tokens (closer to brand neutrals, designer's drift accepted as a minor optical change, not a token deviation).

Card border `--border` `#d8d3c5` differs from our `--mfs-neutral-200` `#DDD8CB` by ~2 units — use `--mfs-neutral-200`. No new tokens introduced.

---

## API delta — orders query shape

**Step in `/api/dashboard`** (between existing `pricingRes` and the response):

```ts
// ── Orders today (Item 5a KPI) ───────────────────────────────────────────
const ordersTodayRes = supabase
  .from('orders')
  .select('state')
  .gte('created_at', /* today midnight ISO, server-side calc */)
  .lt('created_at', /* tomorrow midnight ISO */)
```

Add to `Promise.all`. Shape into response:

```ts
const ordersRows = (ordersTodayRes.data ?? []) as { state: string }[]
const ordersToday = {
  placed:    ordersRows.filter(o => o.state === 'placed').length,
  printed:   ordersRows.filter(o => o.state === 'printed').length,
  completed: ordersRows.filter(o => o.state === 'completed').length,
  total:     ordersRows.length,
}
```

Append `ordersToday` to the existing `NextResponse.json({...})` payload.

**Implementer must verify at C1**: the `orders` table column for "today's orders" — likely `created_at` per existing pipeline conventions, but `delivery_date` may be the operational truth. Inspect `app/orders/page.tsx` and adjacent code for the canonical filter. If `delivery_date` is preferred, use it.

No new endpoint. No schema change. No RLS change. Same admin gating.

---

## Range expansion — `buildRange()` quarter case

Add to `app/dashboard/admin/page.tsx` `buildRange()`:

```ts
if (preset === 'quarter') {
  const q = Math.floor(now.getMonth() / 3)
  const start = new Date(now.getFullYear(), q * 3, 1)
  start.setHours(0, 0, 0, 0)
  return { from: start.toISOString(), to: now.toISOString(), label: 'This quarter' }
}
```

Drop `'last_month'` and `'custom'` branches. `Preset` type narrows to `'today' | 'week' | 'month' | 'quarter'`. Drop `customFrom` / `customTo` state.

---

## Step-by-step commit sequence

Strict order; each commit compiles, passes tsc, and (where tests apply) passes vitest. No mega-commits.

- [x] **C1 — API: orders query + `ordersToday` field.**
  Edit `app/api/dashboard/route.ts`. Verify the orders date-filter column choice (`created_at` vs `delivery_date`) by reading adjacent order code; document the choice in the commit body. Update `DashboardData` interface and `EMPTY` constant in `page.tsx` to carry `ordersToday`. Page does not yet consume it.
  Commit: `feat(api): add orders query to /api/dashboard for Item 5a Orders KPI`

- [x] **C2 — primitives test fixture (red).**
  New: `tests/unit/dashboard-admin/primitives.test.ts`. Tests:
  - `accentClassFor('success')` → `{ stripe: 'bg-mfs-success', value: 'text-mfs-success' }` (and warning/danger/navy)
  - `formatOrdersSubLabel({placed:12, printed:8, completed:4})` → `"12 placed / 8 printed / 4 completed"`
  - `formatOrdersSubLabel({placed:0, printed:0, completed:0})` → `"0 placed / 0 printed / 0 completed"`
  Imports from `app/dashboard/admin/_components/primitives` — fails since file does not exist (red).
  Commit: `test(unit): add Item 5a dashboard primitives fixtures (red)`

- [x] **C3 — primitives impl (green).**
  New: `app/dashboard/admin/_components/primitives.tsx` exporting all primitives listed in deliverable 2. `accentClassFor` + `formatOrdersSubLabel` exported alongside as pure helpers. Vitest goes green.
  Commit: `feat(dashboard-admin): add primitives.tsx for Item 5a restyle`

- [x] **C4 — cards test fixture (red).**
  New: `tests/unit/dashboard-admin/cards.test.ts`. Tests:
  - `pickStageColor('Quoted')` → `'bg-mfs-orange'` (and Sampling/Contacted)
  - `sortRepsByCountDesc([{rep:'A',n:5},{rep:'B',n:12}])` → `[{rep:'B',n:12},{rep:'A',n:5}]`
  - `categoryColorCycle` returns the 5-colour cycle (maroon/orange/navy/sand/red) for the 5 mockup categories
  Imports from `app/dashboard/admin/_components/cards` — fails (red).
  Commit: `test(unit): add Item 5a dashboard cards helper fixtures (red)`

- [x] **C5 — cards impl (green).**
  New: `app/dashboard/admin/_components/cards.tsx` exporting six card components + the three pure helpers from C4. Recharts wired for the donut.
  Commit: `feat(dashboard-admin): add cards.tsx (6 list/chart cards) for Item 5a restyle`

- [x] **C6 — stat-blocks impl + test.**
  New: `app/dashboard/admin/_components/stat-blocks.tsx` exporting `StatBlock`. Pure render — tests assert prop branching on `kind`. Test file: `tests/unit/dashboard-admin/stat-blocks.test.ts`.
  Commit: `feat(dashboard-admin): add stat-blocks.tsx for Item 5a restyle`

- [x] **C7 — page rewrite.**
  Rewrite `app/dashboard/admin/page.tsx` per deliverable 5. AppHeader actions (HACCP + Refresh) preserved verbatim. `buildRange()` gets quarter case; `last_month` / `custom` branches removed. `Preset` type narrows. Drop unused imports (`PieChart` (now in cards), `DetailModal`, `useMemo` if no longer needed). Verify `npx tsc --noEmit` baseline preserved.
  Commit: `refactor(dashboard-admin): rewrite page.tsx with token-based restyle (Item 5a)`

- [x] **C8 — e2e structural spec.**
  New: `tests/e2e/dashboard-admin-restyle.spec.ts`. Mirror `tests/e2e/route-manager.spec.ts` style — `test.describe`, `loginAsAdmin` from `_auth.ts`, navigate to `/dashboard/admin`, assert structural surface. Eight assertions:
  1. All 5 KPI tile labels visible (`Open complaints`, `Visits`, `Discrepancies`, `Active pricing`, `Orders today`).
  2. Page heading shows `Admin · Daily glance` eyebrow; no `<h1>Dashboard</h1>` inside the page body (AppHeader's own title text is OK — scope the negative to main content).
  3. RangeTabs: all 4 pills visible (`Today`, `This week`, `This month`, `This quarter`). Click `This week` → active-state class / `aria-pressed` flips. Click `This quarter` → same.
  4. Complaint-categories donut: SVG present inside the card; at least one `<path>` or `<circle>` with a non-zero `stroke-dasharray` / `d` attribute.
  5. AppHeader still carries HACCP shortcut + Refresh button (text / aria-label match).
  6. Orders KPI tap → URL changes to `/orders` (don't assert page contents — `/orders` is paused; we're testing the tap target).
  7. Card grid: 6 cards on desktop. Acceptable fallback if child-count is fragile — assert the 6 section headers (`Open complaints`, `At-risk accounts`, `Unreviewed commitments`, `Prospects this week`, `Visits by rep`, `Complaint categories`) are all visible.
  8. 3 stat blocks render with labels (`Hunter / farmer ratio`, `Avg. resolution`, `Complaints this week` — match whatever C7 ships).

  Deliberate non-coverage: empty-state hiding (controlled-data problem; deferred to dev smoke + Vercel), exact data values, mobile/desktop layout deltas beyond card count (chrome matrix handles), donut segment count / colour (would couple to mock data).

  Verification inside C8: `npx playwright test tests/e2e/dashboard-admin-restyle.spec.ts` shows 1 file / 8 passed. Then `npx playwright test tests/e2e/chrome-matrix.spec.ts --grep "admin.*dashboard/admin"` confirms no collision.

  Commit: `test(e2e): dashboard-admin restyle structural assertions`

- [x] **C9 — docs archive.**
  Mark this plan's checklist complete (✅ on every commit row above). Commit as plan archive.
  Commit: `docs(plans): archive Item 5a admin dashboard restyle plan`

Total: 9 commits.

---

## Test plan

Run in order; each gate must pass before next.

1. **Type check.** `npx tsc --noEmit` — must hold parity with `main` (currently 72 errors per Item 4's post-merge state; restyle should not add new typed-route violations because all new component `href` props are literal strings from the registered route set).

2. **Unit tests.** `npx vitest run` — all green including:
   - `tests/unit/dashboard-admin/primitives.test.ts` (new, C2)
   - `tests/unit/dashboard-admin/cards.test.ts` (new, C4)
   - `tests/unit/dashboard-admin/stat-blocks.test.ts` (new, C6)
   - `tests/unit/dashboardShaping.test.ts` — keep passing (unchanged in this PR; the inline-mirrored helpers still test the shaping math).
   - `tests/unit/annualReview.test.ts` — should still pass post-hotfix.

3. **Build.** `npm run build` — clean exit code 0. Confirms no orphan imports from the page rewrite, no typed-route violation on the new `<Link>` `href` props.

4. **Dev server boot + manual check.** `npm run dev` + visit `http://localhost:3000/dashboard/admin` (admin session). Confirm visually:
   - 5 KPI tiles render with correct accents.
   - Range tabs switch and refetch data.
   - 6 cards render in 2-col grid (desktop ≥1024px) / 1-col stack (mobile <768px).
   - Empty data → cards show inline "Nothing to surface — {range.label}".
   - Orders tile → tap → `<OrderPipelinePausedNotice />` (expected).

5. **Structural E2E.** `npx playwright test tests/e2e/dashboard-admin-restyle.spec.ts` — 8 assertions all green (added at C8).

6. **Chrome matrix E2E.** `npx playwright test tests/e2e/chrome-matrix.spec.ts --grep "admin.*dashboard/admin"` — admin/desktop + admin/mobile scenarios for `/dashboard/admin` must both clear C1–C10 (chrome integrity).

7. **Full chrome matrix sanity.** `npx playwright test tests/e2e/chrome-matrix.spec.ts` — full 66 scenarios. Expected: 63 pass + 2 admin `/map` failures (pre-existing Leaflet bug, documented in Item 4 backlog) + 1 known flake. Item 5a introduces zero regressions.

---

## Acceptance criteria

One bullet per Q1–Q14 + structural items. Guard verifies each against the diff at Gate 3.

- [x] **Q1** — Page renders KPI row + pill RangeTabs + 3 stat blocks + 6 cards in a 2-col desktop grid (1-col mobile stack). No tabbed Today feed. No DateFilterBar. No discrepancies-by-reason / by-product blocks. No sales-activity multi-bar.
- [x] **Q2** — `/api/dashboard` returns `ordersToday: { placed, printed, completed, total }`. One new Supabase query against `orders`. No schema change, no new endpoint, no business logic.
- [x] **Q3** — Orders KPI tile renders with sub-label `"{placed} placed / {printed} printed / {completed} completed"` and `href="/orders"`. The `/orders` page itself is not edited.
- [x] **Q4** — Page renders `<PageHeading>` eyebrow `ADMIN · DAILY GLANCE` above the KPI row. No `<h1>Dashboard</h1>` in content. `<AppHeader title="Dashboard">` unchanged.
- [x] **Q5** — `grep -nE "#16A34A|#B45309|#FF3300" app/dashboard/admin/` returns ZERO hits in the new files (and zero new occurrences anywhere). All status colour rendering reaches `mfs-success` / `mfs-warning` / `mfs-danger` Tailwind utilities (or the matching CSS variables).
- [x] **Q6** — VisitsByRepCard has no warning-dot rendering, no amber-bar branch, no `VISIT_THRESHOLD` constant. All bars are `bg-mfs-navy`.
- [x] **Q7** — `<DetailModal>` import removed from `app/dashboard/admin/page.tsx`. No `modal` state. The 3 other DetailModal consumers (`app/map/page.tsx`, `app/routes/page.tsx`, `components/MapTabContent.tsx`) are untouched.
- [x] **Q8** — AppHeader `actions` slot still contains the HACCP shortcut + Refresh button, byte-identical JSX to current `app/dashboard/admin/page.tsx:533-548`.
- [x] **Q9** — `<RangeTabs>` renders 4 pills (Today / This week / This month / This quarter). `Preset` type is `'today' | 'week' | 'month' | 'quarter'`. `buildRange()` has a `quarter` case; `'last_month'` and `'custom'` branches removed. No date-input controls on the page.
- [x] **Q10** — ComplaintCategoriesCard uses Recharts `<PieChart>` with `innerRadius > 0`. Hunter/farmer stat block uses two `<span>` width-percent bars, NOT Recharts.
- [x] **Q11** — VisitsByRepCard renders one bar per rep (count only). No `routine` / `new_pitch` / `complaint_followup` / `delivery_issue` rendering on this page.
- [x] **Q12** — Discrepancies KPI sub-label is `range.label` (matches the prior pattern). Not the literal `"Awaiting reconciliation"`.
- [x] **Q13** — First-load behaviour: `<Spinner />` until `data` resolves, then full content render. No per-card skeleton states.
- [x] **Q14** — Each list-card with empty data renders an inline `<EmptyState>` showing `Nothing to surface — {range.label}`. ComplaintCategoriesCard hides (returns null) when `categories.length === 0`. KPI tiles always render.
- [x] **Structural** — `app/dashboard/admin/page.tsx` line count drops by ≥60% vs `main` (838 → ≤330). Three new files under `app/dashboard/admin/_components/`. Three new vitest fixture files under `tests/unit/dashboard-admin/`. Chrome matrix admin/dashboard scenarios remain green.

---

## Out of scope (DO NOT touch)

- **Chrome.** No edits to `components/RoleNav.tsx`, `components/BottomNav.tsx`, `components/MoreDrawer.tsx`, `components/DesktopSidebar.tsx`, `components/PwaGuard.tsx`. `AppHeader.tsx` consumed unchanged (Q8 preserves the existing `actions`).
- **`/orders` surface.** No edits to `app/orders/page.tsx`, `app/orders/new/page.tsx`, `app/orders/[id]/page.tsx`, `app/orders/[id]/edit/page.tsx`, `components/OrderPipelinePausedNotice.tsx`, or any feature flag controlling the paused state.
- **Other dashboard surfaces.** `/dashboard/office` and `/dashboard/warehouse` (Items 5b/5c) — not created in this PR.
- **DetailModal component.** Stays alive — 3 other consumers. Just one fewer consumer after this PR.
- **Pre-existing helper extraction.** `tests/unit/dashboardShaping.test.ts` inline-mirrors helpers from `app/api/dashboard/route.ts`. Do not refactor them into `lib/dashboardShaping.ts` in this PR.
- **Item 4 backlog (per Item 6 deferred list).** No edits to `middleware.ts:154` prefix-boundary, `tests/e2e/_auth.ts:87` regex, `components/MapView.tsx` Leaflet bug, the stale `screen[N]` comment/console refs at `app/map/page.tsx:9,12,85`, `app/routes/page.tsx:467`, `components/MapView.tsx:6`, `app/haccp/page.tsx:771`. (Side-effect note: the stale `[screen4]` console.log at current `app/dashboard/admin/page.tsx:294` disappears naturally with the `TodayTabs` removal — that backlog entry is resolved by this PR's restructure.)
- **Phase-2 order pipeline.** All items in `docs/backlog/2026-06-01-order-pipeline-phase2.md` — not part of Item 5a.
- **Schema, RLS, supabase migrations.** No DB changes whatsoever.
- **New dependencies.** Recharts is already wired; no new packages.

---

## Rollback approach

Restyle is the entirety of the change — `git revert <merge-sha>` reverses all 8 commits in one shot, restoring the 838-line legacy `/screen4`-style content. Browser caches are unaffected (no URL change, no manifest change, no SW change). Redeploy after revert; users on the restyled page see the legacy layout on next refresh.

Data layer rollback is the API delta only: `/api/dashboard`'s `ordersToday` field disappears after revert. Legacy page would not have consumed it, so no downstream impact.

If a partial issue surfaces (e.g. donut chart breaks at one breakpoint), prefer a targeted patch over revert.

---

## Risks and open questions

1. **`orders` table date column.** Plan assumes `created_at` for today's-orders filter, with implementer verifying at C1 against existing `/api/orders` and `/api/kds/orders` conventions. If `delivery_date` is the operational truth, switch — note in C1 commit body. The wrong column gives a count that doesn't match what office sees.

2. **Recharts PieChart in donut mode.** Already wired and used on `/dashboard/admin` today for hunter/farmer. Re-using for complaint categories with `innerRadius=44, outerRadius=66` is well-trodden; low risk.

3. **Two cards may resolve to amber simultaneously (Discrepancies + Active pricing).** Designer's flagged-not-changed observation; accepted by Hakan at Gate 1. No mitigation in this PR.

4. **Chrome matrix flake.** `sales role @desktop › /orders` flaked once during Item 4 Gate 5. If it flakes again during Item 5a Guard, retry once; halt and report if it repeats systematically.

5. **`tsc` baseline drift.** Item 4 PR body cited 68 errors; post-merge environment shows 72 (driven by `.next/types/link.d.ts` regeneration). Item 5a should not move this number — new `<Link href="/orders">` etc. are all in the registered route set. Watch for surprises at the C7 page-rewrite commit.

6. **Empty-state coverage.** Mockup has no empty-state design; Q14 dictates `EmptyState` inline message. Visual quality depends on `rangeLabel` text fit — if "This quarter" is long enough to wrap on mobile, implementer trims.

7. **Pre-existing `/map` admin chrome matrix failures.** Documented in Item 4 backlog as a Leaflet/StrictMode bug. Item 5a does not touch `/map` — those failures stay red. Acceptable per Item 4 Gate 5 sign-off.

8. **No new chrome matrix scenarios for the restyled cards.** The existing 2 admin/dashboard scenarios cover layout integrity (C1–C10). Card-level rendering correctness is not asserted at the e2e layer — relies on visual review during C7 dev-server smoke test + Vercel preview. If consultant wants explicit per-card e2e assertions, treat as a follow-up plan.

---

## Implementer guidance (non-binding notes)

- **Vertical slices.** C1 (data) → C2/C3 (primitives + test) → C4/C5 (cards + test) → C6 (stat-blocks + test) → C7 (page rewrite). Each pair lands a single behaviour end-to-end.
- **No DOM testing.** Vitest is configured for `environment: 'node'`. New tests must be pure-data assertions on exported helpers (`accentClassFor`, `formatOrdersSubLabel`, `pickStageColor`, etc.). Component rendering is verified at the chrome matrix layer + manual dev-server smoke.
- **Don't import from `dashboard-blocks.jsx` / `dashboard-cards.jsx`.** Those are reference HTML mockups, not source code. Re-derive equivalents in TSX with token-resolved colours.
- **Recharts donut at small breakpoint.** The mockup donut is 132px. Implementer may need to scale down for compact mobile cards; 96–110px is fine. Document in C5 commit body.
- **EmptyState copy.** Keep it minimal: `Nothing to surface — Today`, `Nothing to surface — This week`, etc. Don't add icons or padding that competes with the card's CardHead.
