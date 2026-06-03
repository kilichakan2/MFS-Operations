# Item 5a.1 — Dashboard drill-downs + admin views

## Goal
Wire the forward-declared filter URLs from Item 5a (PR #10) so that destination pages actually pre-filter, add five new admin list pages so every dashboard card has somewhere to tap into, and make all six restyled dashboard cards clickable. No production-logic changes beyond what the four Buckets require.

## Source spec
This plan is the contract. Inputs:
- Item 5a plan + post-merge state: `docs/plans/2026-06-03-ui-overhaul-item-5a-admin-dashboard-restyle.md` + `main` HEAD `f0c1289`.
- Frame Q1–Q10 decisions (Gate 1 sign-off, this session).
- Locked-decisions: `docs/plans/2026-06-01-ui-overhaul-locked-decisions.md`.
- Execution plan: `docs/plans/2026-06-01-ui-overhaul-execution-plan.md`.
- URL param shapes from Item 5a (locked): `?status=open`, `?tab=all`, `?range={today|week|month|quarter}`, `?filter={all|draft|active|expired|cancelled}`.

## Compliance
**NO.** Logic + UI work — no auth, payments, RLS, HACCP, legislation, or financial logic touched. New `/admin/visits` route added to admin's read scope; admin gating already enforced via the `/admin` prefix in `middleware.ts:36` ROLE_PERMISSIONS — no middleware edit needed. New `/api/admin/visits` endpoint reads the existing `visits` table the dashboard already reads; no schema change, no new RLS policy.

## Branch + base
- Base: `main` HEAD `f0c1289` (PR #10 squash).
- Branch shape: **split into two PRs** (recommendation in §11 below) — `feat/ui-overhaul-05a1-url-filter-reading` (PR A) then `feat/ui-overhaul-05a1-admin-views` (PR B) on top of A's merge.

---

## Frame decisions reflected (Q1–Q10)

| # | Decision |
|---|---|
| Q1 | Add `this_quarter` to TimeChip union + `chipToRange()` in both `/complaints` (`page.tsx:20,101`) and `/visits` (`page.tsx:78,143`). Add `presetToChip()` mapping helper per page. |
| Q2 | `/complaints` auto-switches to `tab=all` on mount when any filter param (`?status=`) is present, even when `?tab=` is absent. |
| Q3 | Build new `app/admin/visits/page.tsx` (B1). New `/api/admin/visits` endpoint (justified in §3 — keeps dashboard payload thin). Re-point Visits KPI tile from `/visits?range={preset}` to `/admin/visits?range={preset}`. |
| Q4 | Build dedicated list pages for At-risk, Commitments, Prospects (D1). |
| Q5 | Build dedicated list page for Discrepancies (D1). Re-point Discrepancies KPI tile from `/dispatch` to `/admin/discrepancies?range={preset}`. |
| Q6 | Optional `href?: Route` prop on existing `Card` primitive. Root becomes `<Link>` with KpiTile-style hover when set; stays `<div>` when absent. |
| Q7 | Per-row drill-downs out of scope. Whole-card tap only. |
| Q8 | 3 stat blocks stay read-only. |
| Q9 | `/pricing` — direct init-from-URL on `ViewFilter` (no mapping, values match). |
| Q10 | No middleware edit — `/admin` prefix already covers `/admin/visits`, `/admin/at-risk`, etc. `/api/admin` already covers `/api/admin/visits`. |

---

## 1. File-by-file changes

### Bucket A — URL filter reading + this_quarter chip

#### `app/visits/page.tsx` (1058 lines, ~50 line delta)
- **Line 78** — `TimeChip` union: add `'this_quarter'`.
- **Line 143** — `chipToRange()`: add `case 'this_quarter'` returning `{ from: <first-of-current-quarter-YYYY-MM-DD>, to: today }`. Quarter math: `q = Math.floor(month/3); start = new Date(year, q*3, 1)`.
- **Line ~246** — `TIME_CHIP_CONFIGS`: append `{ id:'this_quarter', key:'chipQuarter' }`. New translation key `chipQuarter = 'This quarter'` (also Turkish `chipQuarter: 'Bu çeyrek'` per existing `lib/translations.ts` pattern).
- **Line ~648 (MyVisitsTab)** — `useSearchParams()` on mount: read `?range=`, run `presetToChip()` mapping, initial `setChip()` if valid.
- New helper inline near `chipToRange()`: `function presetToChip(preset: string|null): TimeChip|null` mapping `today→today, week→this_week, month→this_month, quarter→this_quarter`, returning `null` for unknown.

#### `app/complaints/page.tsx` (678 lines, ~60 line delta)
- **Line 20** — `TimeChip` union: add `'this_quarter'`.
- **Line 101** — `chipToRange()`: same quarter case as `/visits`.
- **Line ~190** — `TIME_CHIP_CONFIGS`: append the same entry.
- **Line ~387** — `AllComplaintsTab`: `useSearchParams()` on mount, init `chip` via `presetToChip()` for `?range=`. Add a new `statusFilter` state (`'all'|'open'|'resolved'`, default `'all'`); init from `?status=`. Add a small status-filter chip strip above the open/resolved blocks so the user can toggle off the URL-driven filter without editing the URL.
- **Line ~430-431** — Conditionally hide `openComplaints` when `statusFilter === 'resolved'`, hide `resolvedComplaints` when `statusFilter === 'open'`.
- **Line ~525** — Outer `Complaints` component: `useSearchParams()` on mount, init `activeTab`. Auto-switch logic: if `?tab=all` OR any of `?status=` is present, set `activeTab='all'` (Q2). Otherwise stay `'log'`.

#### `app/pricing/page.tsx` (1256 lines, ~15 line delta)
- **Line ~1036** — `filter` state init: `useSearchParams()` lazy init. `const initial = (params.get('filter') ?? 'all') as string; const f: ViewFilter = ['all','draft','active','expired','cancelled'].includes(initial) ? initial as ViewFilter : 'all'`. Use `useState<ViewFilter>(() => f)`.
- No chip / mapping work — `ViewFilter` values match URL values 1:1.

### Bucket B — `/admin/visits` page + API endpoint

#### `app/admin/visits/page.tsx` (NEW, ~350 lines target)
- Layout mirrors the restyled `/dashboard/admin`:
  - `<AppHeader title="Admin · Visits">` with HACCP + Refresh actions (carry the same pattern).
  - `<PageHeading>` eyebrow `Admin · All reps · Visits`.
  - Filter strip: `<RangeTabs>` (Today / This week / This month / This quarter — same 4 presets as dashboard) + `<RangeLabel from={range.from} to={range.to} />` caption.
  - Secondary filters row: rep `<select>` (populated from response), visit-type chip strip (`all|routine|new_pitch|complaint_followup|delivery_issue`), outcome chip strip (`all|positive|neutral|at_risk|lost`).
  - List table — desktop columns: Customer / Rep / Type / Outcome / When / Notes excerpt. Mobile stack: customer + rep + small inline metadata.
  - Spinner first-load.
  - URL param init: `?range=` via the same `presetToChip()` equivalent (mapping to Item 5a `preset` enum directly since the admin view uses dashboard vocabulary).
- Imports `Card`, `RangeTabs`, `RangeLabel`, `PageHeading`, `EmptyState` from `app/dashboard/admin/_components/primitives.tsx`. **Same primitives package — no duplicate component code.**

#### `app/api/admin/visits/route.ts` (NEW, ~80 lines)
- `GET` — admin-only (already gated by middleware via `/api/admin` prefix).
- Query params: `from`, `to` (ISO strings, mirroring `/api/dashboard`), optional `rep_id`, `type`, `outcome`.
- Supabase query against `visits` table — same shape as the dashboard's `weekVisitsRes` (joins users + customers) but **without the user_id filter** (admin sees all reps), with optional WHERE narrowing by the three filters.
- Returns `{ rows: VisitRow[] }` — flat array, no aggregation.
- No new schema, no new RLS policy. Same admin role gating as the rest of `/api/admin/*`.

**Why a new endpoint instead of extending `/api/dashboard`:** the dashboard's response is already ~30KB on a busy week; adding 100-200 row-level visits balloons it for a glance-view that doesn't need them. Admin /visits also needs re-fetchability on filter change, which the dashboard does not. Two endpoints, two responsibilities.

### Bucket D — Four new admin list pages

Each page follows the same template:
- `<AppHeader title="Admin · {Name}">`.
- `<PageHeading>` eyebrow `Admin · {Subtitle}`.
- `<RangeTabs>` + `<RangeLabel>` strip (where applicable — see per-page note).
- Single list table on desktop / list-row stack on mobile.
- Imports `Card`, `RangeTabs`, `RangeLabel`, `PageHeading`, `EmptyState`, `ListRow`, `RowHead`, `TableRow` from the existing primitives.
- Spinner first-load.
- Data source: dedicated `/api/admin/{name}` endpoint (option ii — see §3). `/admin/discrepancies` is the lone exception, reusing `/api/dashboard`.

#### `app/admin/at-risk/page.tsx` (NEW, ~220 lines)
- **Data:** `/api/admin/at-risk` (NEW endpoint, see §3).
- **Columns:** Account / Outcome / Reason / Rep / Avg order value / Hours since last visit.
- **Schema verification (PR B implementation):** during C2-equivalent step, implementer checks for stored `reason` column on `visits` and `line_total`/`value` column on `orders`. Falls back to server-side derivation (per §3) or drops `avg_order_value` column if neither orders aggregate column exists.

#### `app/admin/commitments/page.tsx` (NEW, ~220 lines)
- **Data:** `/api/admin/commitments` (NEW endpoint, see §3).
- **Columns:** Customer / Commitment item / Rep / Due date / Status / Hours ago.
- **Schema verification:** implementer checks for `commitment_due` (or similarly-named) column on `visits`. If absent, drop `due_date` column from page and `status` reads always `'pending'`.

#### `app/admin/prospects/page.tsx` (NEW, ~210 lines)
- **Data:** `/api/admin/prospects` (NEW endpoint, see §3).
- **Columns:** Account / Postcode / Stage / Visit type / Outcome / Rep / Value (conditional — see below).
- **Schema verification:** `pipeline_status` already exists on `visits` (the dashboard's visits-today query selects it at `/api/dashboard:103`) — surfaces directly as `stage`. `value` likely has no schema column — implementer verifies and drops the column if missing.

#### `app/admin/discrepancies/page.tsx` (NEW, ~250 lines)
- **Data:** `/api/dashboard` (existing). The dashboard already returns the full `discrepanciesToday` row shape with every column the page needs — cleanest of the five.
- **Columns:** Customer / Product / Status (`short`/`not_sent`) / Reason / Ordered qty / Sent qty / Logged by / Created at.
- **Re-fetches the dashboard endpoint on RangeTabs change** (acknowledged Risk #4 — small payload bloat, single-endpoint pragmatism wins here).
- **Note on tile re-point:** `app/dashboard/admin/page.tsx` Discrepancies tile href flips from `/dispatch` (Item 5a placeholder) to `/admin/discrepancies?range={preset}`. Documented as a deliberate amendment to the locked Item 5a destinations.

### Bucket C — Clickable cards

#### `app/dashboard/admin/_components/primitives.tsx` (~30 line delta)
- `Card` primitive: add optional `href?: Route` prop. When set, render root as `<Link href={href} className={[...same classes, 'cursor-pointer no-underline text-inherit transition-shadow hover:shadow-md']}>`. When absent, render as `<div>` (current behaviour). Pull the existing hover-shadow class string from `KpiTile` so the visual treatment is verbatim.
- Export the new signature; no breaking changes to existing call sites.

#### `app/dashboard/admin/_components/cards.tsx` (~20 line delta)
- Each card component (`OpenComplaintsCard`, `AtRiskCard`, `CommitmentsCard`, `VisitsByRepCard`, `ComplaintCategoriesCard`, `ProspectsCard`) gets a new optional `href?: Route` prop that forwards to `<Card href={href}>`.
- Zero visual change inside cards — no padding, typography, colour, or content edits. Acceptance criterion at §8 verifies this with a grep of the changed lines.

#### `app/dashboard/admin/page.tsx` (~12 line delta — only `href`-prop additions + 2 KPI re-points)
- Six card invocations get an `href` prop:
  - `<OpenComplaintsCard ... href={'/complaints?status=open&tab=all' as Route}>` — explicit `tab=all` (cards can include it; only the KPI tile's locked href omits it).
  - `<AtRiskCard ... href={'/admin/at-risk' as Route}>` — no range param (page is hard-coded to rolling 7d).
  - `<CommitmentsCard ... href={'/admin/commitments' as Route}>` — no range param (page is hard-coded to 24h+).
  - `<ProspectsCard ... href={'/admin/prospects' as Route}>` — no range param.
  - `<VisitsByRepCard ... href={'/admin/visits' as Route}>` — no preset-suffix (the admin page has its own RangeTabs initialised to its default).
  - `<ComplaintCategoriesCard ... href={'/complaints?tab=all' as Route}>` — no status filter (shows breakdown across all complaints).
- Two KPI tile `href` amendments:
  - Visits KPI: `href={`/visits?range=${preset}` as Route}` → `href={`/admin/visits?range=${preset}` as Route}`.
  - Discrepancies KPI: `href="/dispatch"` → `href={`/admin/discrepancies?range=${preset}` as Route}`.
- All other 3 KPI hrefs stay byte-identical from Item 5a.

### Translations (small)
- `lib/translations.ts` — add `chipQuarter: 'This quarter'` (EN) and `chipQuarter: 'Bu çeyrek'` (TR). Used by both `/visits` and `/complaints` chip strips.

---

## 2. New routes added

| Route | Purpose | Data source |
|---|---|---|
| `/admin/visits` | All reps' visits list with rep/type/outcome/range filters | `/api/admin/visits` (NEW) |
| `/admin/at-risk` | At-risk accounts list (rolling 7d) | existing `/api/dashboard` |
| `/admin/commitments` | Unreviewed commitments list (rolling 24h+) | existing `/api/dashboard` |
| `/admin/prospects` | Prospects this week list | existing `/api/dashboard` |
| `/admin/discrepancies` | Discrepancies in selected range | existing `/api/dashboard` |
| `/api/admin/visits` | GET — admin-only flat visits list | new endpoint |

All five page routes inherit admin gating from `middleware.ts:36` via the `/admin` prefix. The new API endpoint inherits from `/api/admin` (same line). **Zero middleware edits.**

---

## 3. API delta

### Four new admin endpoints — dedicated per page (option ii)

Hakan's Gate 2 sign-off picked "extend the API in 5a.1 — ship complete pages." I'm taking **option (ii) — dedicated endpoints** rather than fattening `/api/dashboard`. Justification:

The same reasoning I used for `/api/admin/visits` (responsibility separation, filter re-fetchability, payload thinness on the glance view) applies to the other three orphan-card pages. Five admin pages with five admin endpoints is a coherent pattern. Folding the missing-column work into `/api/dashboard` would (a) inflate the response by ~10KB worst-case to support data the dashboard cards themselves ignore, (b) couple the dashboard's query shape to the admin-list pages' filter needs, and (c) muddy the dashboard's role as "compact glance aggregates." Pattern parity across all five admin pages wins on read.

`/admin/discrepancies` remains the one exception — it stays on `/api/dashboard` per Risk #4 (the dashboard already returns the full discrepancy row shape; building a 5th dedicated endpoint for a page whose columns *all* exist is busywork). If perf bites, a `/api/admin/discrepancies` endpoint lands in Item 6.

#### `/api/admin/visits` (NEW)
```ts
GET /api/admin/visits?from=ISO&to=ISO&rep_id?=uuid&type?=string&outcome?=string

→ 200 OK { rows: VisitRow[] }
  // VisitRow = { id, customer, rep, visit_type, outcome, notes, created_at }
```
- Supabase service-role query against `visits` table with optional WHERE narrowing. Joins `users` for `rep` name, `customers` for `customer` name.

#### `/api/admin/at-risk` (NEW)
```ts
GET /api/admin/at-risk?from=ISO?&to=ISO?

→ 200 OK { rows: AtRiskRow[] }
  // AtRiskRow = {
  //   id, customer, outcome: 'at_risk'|'lost', rep, hoursAgo,
  //   reason: string,            // derived server-side (see below)
  //   avg_order_value: number    // derived from orders aggregate (see below)
  // }
```
- **Reason derivation.** The `visits` table is unlikely to carry a stored `reason` column. Reason gets computed server-side from the visit's `outcome` + a small heuristic on recency:
  - `outcome = 'lost'` → reason `'Lost — last visit {hoursAgo}h ago'`
  - `outcome = 'at_risk'` AND visit notes mention 'volume' / 'payment' / 'price' keywords → matched reason classification
  - Default → `'At risk — last visit {hoursAgo}h ago'`
  - Implementer verifies the visits schema during C2 (PR B). If a `reason` column exists, surface it directly and skip the heuristic.
- **avg_order_value derivation.** Server-side aggregate against `orders` table joined to the customer. Compute over the rolling 90 days. If `orders.line_total` column exists, sum; else if `orders.value` exists, average that. Implementer verifies schema during C2 (PR B). **If neither column exists**, drop `avg_order_value` from the row and document in the commit body — do NOT add a schema column (the no-schema-change constraint holds).

#### `/api/admin/commitments` (NEW)
```ts
GET /api/admin/commitments?from=ISO?&to=ISO?

→ 200 OK { rows: CommitmentRow[] }
  // CommitmentRow = {
  //   id, customer, detail, rep, hoursAgo,
  //   due_date: string | null,                              // ISO date or null if column missing
  //   status: 'pending' | 'overdue' | 'completed-late'      // derived from due_date + today
  // }
```
- **due_date column verification.** Implementer checks during C2 (PR B) whether the `visits` table has a `commitment_due` (or similarly-named) column. If yes, surface directly. **If no, drop `due_date` from the row and `status` becomes unconditionally `'pending'`** (since overdue can't be computed). Documented in the page's commit body.
- **status derivation.** Server-side: `due_date < today` → `'overdue'`; `due_date >= today` AND visit not marked completed → `'pending'`; commitment marked complete after due date → `'completed-late'` (only if a completion timestamp exists in schema). Mostly server-side computation; no schema change.

#### `/api/admin/prospects` (NEW)
```ts
GET /api/admin/prospects?from=ISO?&to=ISO?

→ 200 OK { rows: ProspectRow[] }
  // ProspectRow = {
  //   name, postcode, outcome, visitType, rep,
  //   stage: string | null,    // surfaces pipeline_status from visits row (already in schema)
  //   value: number | null     // dropped if no schema column (likely)
  // }
```
- **stage surfacing.** The dashboard already selects `pipeline_status` for the visits-today query at `app/api/dashboard/route.ts:103` (`select('id, created_at, outcome, visit_type, notes, pipeline_status, ...')`) — the field is in schema and surfaced through the existing `TodayVisitItem.pipelineStatus` shape. The current `prospectsThisWeek` mapping just doesn't propagate it. The new endpoint surfaces `pipeline_status` as `stage`.
- **value — likely dropped.** The `visits` table is unlikely to have a `deal_value` or `quoted_value` column. Implementer verifies during C2 (PR B). **If no value column exists, drop `value` from the row entirely and omit it from the page's column set** (vs. shipping with empty cells). Documented in the commit body. The no-schema-change constraint forbids adding a column for this.

### `/api/dashboard` — UNCHANGED
The four orphan-card pages above use their own dedicated endpoints. `/admin/discrepancies` remains on `/api/dashboard` (cleanest data-shape fit). The dashboard cards themselves continue to consume the same compact aggregates Item 5a shipped.

---

## 4. Bucket A URL-param reading — exact init logic

### `/pricing`
```ts
const params = useSearchParams()
const [filter, setFilter] = useState<ViewFilter>(() => {
  const raw = params?.get('filter')
  return (['all','draft','active','expired','cancelled'] as ViewFilter[]).includes(raw as ViewFilter)
    ? raw as ViewFilter
    : 'all'
})
```

### `/visits` (MyVisitsTab)
```ts
const params = useSearchParams()
const [chip, setChip] = useState<TimeChip>(() => presetToChip(params?.get('range')) ?? 'today')

function presetToChip(p: string | null | undefined): TimeChip | null {
  switch (p) {
    case 'today':   return 'today'
    case 'week':    return 'this_week'
    case 'month':   return 'this_month'
    case 'quarter': return 'this_quarter'
    default:        return null
  }
}
```

### `/complaints` (outer + AllComplaintsTab)
Outer:
```ts
const params = useSearchParams()
const [activeTab, setActiveTab] = useState<'log'|'all'>(() => {
  if (params?.get('tab') === 'all') return 'all'
  if (params?.get('status') || params?.get('range')) return 'all'  // Q2 auto-switch
  return 'log'
})
```
AllComplaintsTab:
```ts
const params = useSearchParams()
const [chip, setChip]   = useState<TimeChip>(() => presetToChip(params?.get('range')) ?? 'today')
const [statusFilter, setStatusFilter] = useState<'all'|'open'|'resolved'>(() => {
  const s = params?.get('status')
  return (s === 'open' || s === 'resolved') ? s : 'all'
})
// Inside render, gate the two existing lists:
{statusFilter !== 'resolved' && openComplaints.length > 0 && /* render open list */}
{statusFilter !== 'open' && resolvedComplaints.length > 0 && /* render resolved list */}
```
Plus a small status-filter chip strip (3 chips: All / Open / Resolved) rendered above the lists so the user can untoggle the URL-driven filter without editing the URL.

---

## 5. Card primitive change — before/after

### Before (Item 5a)
```tsx
export function Card({ children, className = '', compact = false }: {
  children: ReactNode; className?: string; compact?: boolean
}) {
  return (
    <div className={[
      'bg-white border border-mfs-neutral-200 rounded-lg shadow-sm',
      compact ? 'p-4' : 'p-5',
      className,
    ].join(' ')}>
      {children}
    </div>
  )
}
```

### After (Item 5a.1)
```tsx
import Link from 'next/link'
import type { Route } from 'next'

export function Card({ children, className = '', compact = false, href }: {
  children: ReactNode; className?: string; compact?: boolean; href?: Route
}) {
  const shared = [
    'block bg-white border border-mfs-neutral-200 rounded-lg shadow-sm',
    compact ? 'p-4' : 'p-5',
    className,
  ].join(' ')
  if (href) {
    return (
      <Link href={href} className={[
        shared,
        'cursor-pointer no-underline text-inherit transition-shadow hover:shadow-md',
      ].join(' ')}>
        {children}
      </Link>
    )
  }
  return <div className={shared}>{children}</div>
}
```

Each card component (OpenComplaintsCard, AtRiskCard, etc.) gets `href?: Route` added to its props interface and forwards it to `<Card href={href}>`.

---

## 6. Card destination wiring (final href values)

| Card | New `href` value | Notes |
|---|---|---|
| OpenComplaints | `/complaints?status=open&tab=all` | Explicit `tab=all` — cards can include it; KPI tile (locked) cannot. |
| AtRisk | `/admin/at-risk` | No range — page is hard-coded to rolling 7d. |
| Commitments | `/admin/commitments` | No range — page is hard-coded to 24h+. |
| Prospects | `/admin/prospects` | No range — fixed this-week window. |
| VisitsByRep | `/admin/visits` | No preset suffix — admin page has its own RangeTabs default. |
| ComplaintCategories (donut) | `/complaints?tab=all` | No status filter — shows breakdown across all. |

KPI tile amendments (Item 5a's commit C12 is partially superseded — flagged for the consultant's awareness):

| KPI tile | Item 5a href | Item 5a.1 href | Reason |
|---|---|---|---|
| Visits | `/visits?range=${preset}` | `/admin/visits?range=${preset}` | B1 made `/admin/visits` the canonical admin destination. |
| Discrepancies | `/dispatch` | `/admin/discrepancies?range=${preset}` | Item 5a Q3 noted `/dispatch` was a placeholder; D1 unblocks the real destination. |

All other 3 KPI hrefs (Open complaints, Active pricing, Orders today) stay byte-identical from Item 5a's C12.

---

## 7. Test plan

### Unit tests (vitest, node env — no jsdom, pure helpers only)
- **`tests/unit/dashboard-admin/preset-to-chip.test.ts`** (NEW) — `presetToChip()` mapping for each of `today / week / month / quarter / null / unknown-string`. Pure data assertions. The helper lives co-located with each consumer page (small duplication preferable to a shared lib for a 6-line function), but the test file asserts the behaviour shape; the impl per-page is a near-copy.
- **`tests/unit/dashboard-admin/chip-to-range-quarter.test.ts`** (NEW) — verify the new `this_quarter` case computes `start = first of current calendar quarter` correctly. Pure data assertions against a known fixed date.

### Existing unit tests preserved
- `tests/unit/dashboard-admin/primitives.test.ts` — extends with assertions on the new `Card` href branching (pure: a `cardRootProps()` helper that returns the className + element-type pair).

### E2E tests (Playwright)
- **`tests/e2e/admin-views.spec.ts`** (NEW) — one `test.describe` per new admin page (5 pages × 2-3 assertions each):
  - Page loads + AppHeader title present.
  - At least one expected column header renders.
  - Loading spinner appears then resolves (first-load behaviour).
  - For `/admin/visits` and `/admin/discrepancies` (range-tabbed pages): clicking a different RangeTab triggers a re-fetch (assert spinner appears, then list updates or "Nothing to surface" appears).
- **`tests/e2e/url-filter-init.spec.ts`** (NEW) — Bucket A coverage:
  - `/complaints?status=open` → auto-switches to All tab, status filter chip strip shows "Open" active, only open list visible.
  - `/complaints?range=week` → AllComplaintsTab chip initialises to "This week".
  - `/visits?range=quarter` → MyVisitsTab chip initialises to the new "This quarter".
  - `/pricing?filter=active` → page initialises with Active filter selected.
- **`tests/e2e/dashboard-admin-restyle.spec.ts`** — update Test 7 (Visits KPI tap-through) to assert `/admin/visits?range=today` (post-amendment URL). Update Test 8 (Discrepancies KPI tap-through) to assert `/admin/discrepancies?range=today`. Add 6 new card tap-through assertions paralleling the existing KPI ones (or consolidate into a parametrised loop).

### Chrome matrix
The five new admin pages add new admin scenarios. `tests/e2e/chrome-matrix.spec.ts:45` admin `ROLE_ROUTES` array gets 5 new entries: `/admin/visits`, `/admin/at-risk`, `/admin/commitments`, `/admin/prospects`, `/admin/discrepancies`. The matrix automatically generates one desktop + one mobile clearance scenario per route → **10 new chrome matrix scenarios** (66 → 76 total). Implementer runs the full matrix at Gate 3.

---

## 8. Acceptance criteria

One bullet per Frame decision plus structural. Guard verifies each at Gate 3.

- [ ] **Q1 — this_quarter chip.** `TimeChip` union in both `/complaints` and `/visits` includes `'this_quarter'`. `chipToRange()` returns correct start-of-quarter date. `TIME_CHIP_CONFIGS` arrays include the new entry. The chip is visible on the live chip strip on both pages for all roles.
- [ ] **Q1 — presetToChip helper.** Each Bucket A page has a `presetToChip()` function returning the correct mapping (`today→today`, `week→this_week`, `month→this_month`, `quarter→this_quarter`, unknown→`null`).
- [ ] **Q2 — Complaints auto-switch.** Visiting `/complaints?status=open` (no `?tab=`) lands on the All tab (not the default Log tab).
- [ ] **Q3 — `/admin/visits`.** File `app/admin/visits/page.tsx` exists and renders. `/api/admin/visits` endpoint returns row-level visits. Visits KPI tile href is `/admin/visits?range=${preset}`.
- [ ] **Q4 — Three admin pages.** `app/admin/at-risk/page.tsx`, `app/admin/commitments/page.tsx`, `app/admin/prospects/page.tsx` all exist and render. Each consumes its dedicated `/api/admin/{name}` endpoint per the Gate 2 column-gap amendment (§3 option ii).
- [ ] **Q4 amendment — /admin/at-risk columns.** Page renders `reason` + `avg_order_value` columns. If `avg_order_value` is genuinely unavailable in schema (no `orders.line_total` or `orders.value`), drop the column from the page and document in the commit body. **No schema migration.**
- [ ] **Q4 amendment — /admin/commitments columns.** Page renders `due_date` + derived `status` (overdue/pending/completed-late). If `commitment_due` (or similar) is missing from `visits` schema, drop `due_date` from the page and status reads unconditionally `'pending'`. Documented in the commit body. **No schema migration.**
- [ ] **Q4 amendment — /admin/prospects columns.** Page renders `stage` sourced from the existing `pipeline_status` column on `visits` (already in schema per §3). The `value` column ships if the schema has a `deal_value`/`quoted_value` column; otherwise the column is omitted from the page entirely (not rendered with empty cells) and the omission is documented in the commit body. **No schema migration.**
- [ ] **Q5 — Discrepancies admin page + tile re-point.** `app/admin/discrepancies/page.tsx` exists and renders. Reuses existing `/api/dashboard` response (only page of the five that does — cleanest data-shape fit per §3). Discrepancies KPI tile href is `/admin/discrepancies?range=${preset}`.
- [ ] **Q6 — Card primitive `href` prop.** `Card` accepts optional `href: Route`. With `href` set, root renders as `<Link>` with `cursor-pointer` + hover-shadow. Without `href`, root stays `<div>`. **No padding/typography/colour change inside cards** — grep diff on `_components/cards.tsx` shows only `href`-prop forwarding lines added; no class-string edits inside card bodies.
- [ ] **Q7 — No nested links.** No `<Link>` inside a `<Card href=...>` body — per-row drill-downs not added.
- [ ] **Q8 — Stat blocks stay read-only.** `HunterFarmerSplitBlock` + `ValueStatBlock` calls in `page.tsx` have no `href` prop.
- [ ] **Q9 — Pricing init-from-URL.** Visiting `/pricing?filter=active` initialises the filter state to `'active'`.
- [ ] **Q10 — Middleware untouched.** `git diff main..HEAD -- middleware.ts` returns empty. New admin paths gated automatically.
- [ ] **Structural — chrome matrix.** Chrome matrix expands to 76 scenarios (66 + 10 new admin routes). Each new admin page clears C1–C10 at desktop + mobile.
- [ ] **Structural — no /orders edit.** `git diff main..HEAD -- 'app/orders/*'` returns empty.
- [ ] **Structural — no chrome edit.** `git diff main..HEAD -- components/{RoleNav,BottomNav,MoreDrawer,DesktopSidebar,PwaGuard,AppHeader}.tsx` returns empty.
- [ ] **Structural — no Item 4 backlog touch.** `git diff main..HEAD` shows no edits to the stale `screen[N]` comment refs (`app/map/page.tsx:9,12,85`, `app/routes/page.tsx:467`, `components/MapView.tsx:6`, `app/haccp/page.tsx:771`).

---

## 9. Rollback approach

`git revert <merge-sha>` reverses everything atomically. No URL changes (no permanent redirects added), no schema migrations, no manifest/SW changes — no cache busts required. Browsers re-fetch normally within seconds.

The new `/api/admin/visits` endpoint becomes a 404 after revert — its only consumer is the removed `/admin/visits` page, so no downstream impact.

If a partial issue surfaces in just one of the 5 new admin pages, prefer a targeted patch over a full revert — each new page is independent.

---

## 10. Out of scope (DO NOT touch)

- `/orders` page + its `OrderPipelinePausedNotice` + the order-pipeline phase-2 backlog.
- Chrome (`RoleNav`, `BottomNav`, `MoreDrawer`, `DesktopSidebar`, `PwaGuard`, `AppHeader`). The new admin pages render *inside* the existing chrome.
- Per-row drill-downs on cards (Q7 — deferred).
- Stat-block clickability (Q8 — deferred).
- The pre-existing `/admin` tabs (`users`, `customers`, `products`, `export`, `permissions`, `audit`) — they stay as in-page tabs. Item 5a.1 only adds new sibling routes under `/admin/*`, it does not convert existing tabs to routes.
- `/admin/audit` real implementation (the mock `AuditSection` at `app/admin/page.tsx:1253` stays mocked).
- Item 5b / 5c / 6 / 7 surfaces.
- Item 4 backlog (`screen[N]` comment refs, middleware prefix-boundary, dead `_auth.ts` regex, Leaflet MapView crash).
- Timezone correctness hotfix for `/api/dashboard` (queued separately).
- Stat-block clickability beyond Q8.
- Schema/RLS changes. New DB columns (`reason`, `avg_order_value`, `due`, `stage`, `quoted_value` flagged in §1 Bucket D as deferred).

---

## 11. PR shape — recommendation

**Recommend: split into TWO PRs.**

### PR A — `feat/ui-overhaul-05a1-url-filter-reading` (~400-500 lines)
**Scope:**
- Bucket A on all three destination pages (`/complaints`, `/visits`, `/pricing`).
- `this_quarter` TimeChip addition + chipToRange case in both `/complaints` and `/visits`.
- `presetToChip()` helper per page.
- New `chipQuarter` translation key (EN + TR).
- New unit tests: `preset-to-chip.test.ts`, `chip-to-range-quarter.test.ts`.
- New e2e spec: `url-filter-init.spec.ts` (4 scenarios).
- **No new pages, no new endpoints, no card edits.**

**Why split here:** PR A is mergeable independently. The moment it lands, Item 5a's existing forward-declared URLs (`/complaints?status=open`, `/pricing?filter=active`, `/visits?range=week`) start actually pre-filtering. Small, focused, low-risk. The `this_quarter` chip lands as a beneficial side-effect on `/visits` and `/complaints` for all roles — users gain a new filter option immediately.

### PR B — `feat/ui-overhaul-05a1-admin-views` (~1500-1900 lines) — built on PR A's merge
**Scope:**
- Five new admin pages + four new admin endpoints (`/api/admin/visits`, `/api/admin/at-risk`, `/api/admin/commitments`, `/api/admin/prospects`). `/admin/discrepancies` stays on `/api/dashboard`.
- Server-side derivation of `reason` / `status` per §3, plus per-column schema verification with documented drops if columns are missing.
- Card primitive `href` prop.
- Six card destination wirings.
- Two KPI tile amendments (Visits + Discrepancies).
- Chrome matrix `ROLE_ROUTES` array gets 5 new admin entries.
- Updated `dashboard-admin-restyle.spec.ts` (Test 7/8 amendments + 6 card tap-through assertions).
- New e2e spec: `admin-views.spec.ts`.
- Translations: any per-page page-title strings if introduced.

**Why this split:** PR B is the "new pages" narrative — 5 new admin pages built on a common pattern. Reviewers can scan them as 5 instances of the same template. Each page is independent; if one is broken, the rest still land in a targeted patch. Building on PR A's merge means PR B's `this_quarter` chip + `presetToChip` helper are already in place — PR B's admin pages can use them without owning the change.

### Why not single PR
A ~1700-line single PR for the consolidated scope is reviewable but creates a long Vercel-preview feedback loop (every typo on page #3 of 5 requires re-eyeballing all of pages #1, #2, #4, #5). The split lets the small URL-filter behaviour land first — that's the user-visible win from clicking the Item 5a KPI tiles. The admin pages come next as a coherent block.

### Why not finer split (split B from Frame)
The Frame brief proposed an even finer split (PR 1 = Bucket A + 2 already-existing-destination cards). Possible, but the marginal value is small — both cards' destination pages already work after PR A, but the cards themselves don't become clickable until the `Card` primitive ships its `href` prop. Pulling primitive changes into PR A muddies its "URL-filter-reading only" narrative. Two PRs is the right cut.

### Consultant call to make at Gate 2
Approve "split into PR A then PR B" → implementer cuts PR A first. Or push back with a different cut.

---

## 12. Risks and open questions

1. **Chip-strip visual delta on /complaints + /visits.** Adding the `this_quarter` chip widens the chip strip by ~120px. At mobile width (375px) the strip already scrolls horizontally (`scrollOnSmall` behavior on RangeTabs) — adding one more chip stays within that pattern. Worth eyeballing the live preview at the iPhone width to confirm no clipping.

2. **`AllComplaintsTab` status filter UI.** Bucket A adds a new visible "Open / Resolved / All" chip strip above the lists in AllComplaintsTab. This is a small visual addition not covered by Item 5a's restyle. The chip strip uses the same `RangeTabs` primitive pattern (pill segmented control) — no new component, but a visible UI element that wasn't there before.

3. **Admin column gaps closed via dedicated endpoints.** Gate 2 amendment: Hakan picked "extend the API in 5a.1 — ship complete pages." Option (ii) — dedicated `/api/admin/at-risk`, `/api/admin/commitments`, `/api/admin/prospects` endpoints — surfaces every Frame-flagged column via server-side derivation (reason, status) or schema-confirmed fields (stage). The no-schema-change hard constraint still binds: any column whose source DB field is genuinely missing gets dropped from the page rather than added via migration. Implementer verifies per-column during PR B C2-equivalent step and documents drops in commit bodies.

4. **`/admin/discrepancies` re-fetch on RangeTabs change.** Since the discrepancies page reuses the `/api/dashboard` endpoint (no extension), changing the RangeTab re-fetches the entire dashboard payload. That's wasteful but not broken. If perf becomes a concern, a small `/api/admin/discrepancies` endpoint can land in Item 6.

5. **PR B size.** 5 new pages + endpoint + tests + card wiring ≈ 1700 lines. Vercel preview review surface is large. Mitigated by the common template pattern (each page is recognisable as a copy of the previous), but a thorough preview eyeball at multiple breakpoints will take 15-30 min vs. Item 5a's 5-10 min.

6. **`/admin/visits` filter UI scope.** The page needs rep selector, type filter, outcome filter, range tabs. Each filter is a dropdown or chip strip. Implementer must keep the filter row tight at mobile width — flag for re-eyeball.

7. **Two-PR sequencing.** PR B depends on PR A's merge (the `this_quarter` chip in `/visits` is used by `/admin/visits`'s `RangeTabs`). If PR A lingers in review, PR B has to wait. Mitigated by the small size of PR A.

8. **Chrome matrix flakes.** Adding 10 new scenarios to a 66-scenario suite extends total runtime from ~3 min to ~3:30 min. The existing flake on `/orders` sales desktop may now be joined by potential flakes on new admin pages. Implementer reports any new flakes at Gate 3 separately from real failures.

---

## 13. Implementer guidance (non-binding)

- **Vertical slices.** PR A: Bucket A on one destination at a time. `/pricing` first (smallest, no chip-union work), then `/complaints` (most invasive — has the status filter chip strip addition), then `/visits` (medium — chip union + presetToChip wiring).
- **Common admin page template.** Build `/admin/discrepancies` first (smallest data-shape gap — every column maps), then `/admin/at-risk` / `/admin/commitments` / `/admin/prospects` (paste-and-prune the template). Build `/admin/visits` last (largest — needs its own API endpoint + filter row).
- **Card primitive change is small.** ~15 lines. Land it before wiring card hrefs.
- **Cards' `href` wiring is mechanical.** ~3 lines per card.
- **Don't import from Item 5a's `_components/` into the new admin pages by duplicating — actually import from `app/dashboard/admin/_components/primitives.tsx`.** The five new admin pages re-use Item 5a's primitives package as-is. No duplicate components.
- **EmptyState copy.** Each new admin page reuses Item 5a's `EmptyState` component for the empty-data case. Copy stays `Nothing to surface — {range.label}` where applicable.
- **No DB testing.** Vitest is configured for `environment: 'node'`. All new tests are pure-data assertions on exported helpers. Component rendering verified at the chrome matrix layer + per-page dev-server smoke.
- **Discrepancies pre-existing follow-up.** The Discrepancies KPI tile re-point happens in PR B (alongside the `/admin/discrepancies` page landing). PR A is silent on Discrepancies.
