# F-21 — Dashboard split into a DashboardService

**Date:** 2026-06-26
**Unit:** F-21 (4th in the F-20 hexagonal-re-point series)
**Status:** Plan — locked spec approved at FORGE Gate 1
**Author:** forge-planner

---

## Goal

Behaviour-preserving hexagonal re-point of the admin dashboard's two data routes
off raw Supabase and onto owned seams: a new `DashboardService` that composes
existing repositories, plus one genuinely-new seam (`DiscrepanciesRepository`).
Response shapes stay **BYTE-IDENTICAL**.

🗣 The dashboard screen's data feed currently reaches into the database directly
and does all its arithmetic in the web route. We're moving that arithmetic into
an in-house "dashboard desk" and giving the database a proper labelled socket, so
the screen looks and behaves exactly the same but the wiring is swap-proof.

**Explicitly OUT OF SCOPE (locked):** no DB migration, no RLS change, no new
package dependency, no UI change, no guard standardization (that is F-RLS-04i),
no change to any wire response.

🗣 We are only re-routing pipes. We are not changing the kitchen, the locks on the
doors, or what the plates look like when they come out.

---

## Mini-map

```
DOMAIN (dashboard core)
  ├─ DashboardService (NEW service) → composes the 5 repos below + owns all maths
  ├─ DiscrepanciesRepository (NEW port) → [Supabase] (NEW adapter) + [Fake]
  ├─ VisitsRepository (port, +2 windowed methods) → [Supabase]
  ├─ ComplaintsRepository (port, +3 windowed methods) → [Supabase]
  └─ Orders / Pricing (ports, REUSED as-is) → [Supabase]
🗣 two admin routes stop touching the DB; they call one desk that does identical maths
```

---

## Domain terms (plain-English)

- **DashboardService** — `lib/services/DashboardService.ts`. The "dashboard desk":
  one place that gathers numbers from the repositories and does every rollup/tally
  the route does today. 🗣 One clerk who collects all the figures and adds them up,
  instead of the maths being scattered across the web route.
- **DiscrepanciesRepository** — a NEW port (`lib/ports/`) + Supabase adapter. The
  labelled socket for the `discrepancies` table, which has had none until now.
  🗣 Discrepancies (short / not-sent deliveries) finally get their own proper
  socket instead of being read by raw cables.
- **Port** — the interface the app owns (`lib/ports/`). 🗣 The socket shape.
- **Adapter** — the Supabase implementation (`lib/adapters/supabase/`). 🗣 The plug.
- **Fake adapter** — an in-memory stand-in (`lib/adapters/fake/`) so tests run with
  no database. 🗣 A pretend plug for the test bench.
- **Contract test** — one shared test suite both the real and fake plug must pass
  (`lib/ports/__contracts__/`). 🗣 One exam both plugs sit, so they can't drift apart.
- **Wiring / composition root** — `lib/wiring/`. The only business-layer file allowed
  to import an adapter; it bolts plugs into sockets and exports the ready singleton.
  🗣 The fuse box. Swap a vendor = edit this one file.
- **`londonToday(now)`** — `lib/dates.ts`, returns the UK-local calendar date string.
  Used for pricing-expiry and orders-today. 🗣 "What's today's date in London right
  now," so a late-evening BST order isn't mis-dated.
- **Service-role singleton** — the adapter wired with the master DB key (bypasses
  row-level security), matching what both routes do today. 🗣 The master key — same
  one the routes already hold; the rollback parachute.

---

## Compliance / architecture flags

- **Hexagonal layering (CLAUDE.md + ADR-0002):** UI → service → adapter. After this
  unit, both routes import ZERO adapters and ZERO vendor SDKs. ✅ target.
- **F-TD-11 wiring fence:** services export factories only; singletons live in
  `lib/wiring/`. Pinned by `tests/unit/lint/no-adapter-imports.test.ts`. ✅ followed.
- **F-TD-05 services-fence:** a service may not import another service file. The
  DashboardService imports only ports (and the `londonToday` date helper, which is a
  pure utility, not a service). ✅ no service→service import. (Unlike F-20 PR3's
  MapDataService, this service introduces no presentation type that lives in another
  service file, so no ports-barrel re-export trick is needed.)
- **F-04 / F-27 vendor-SDK fence:** `@supabase/supabase-js` imported only inside the
  new `lib/adapters/supabase/DiscrepanciesRepository.ts`. ✅.
- **Dependency justification:** NO new `package.json` entry. ✅ nothing to justify.
- **No migration:** filename-convention test is irrelevant here. ✅.

🗣 Every house rule this project enforces is satisfied: no new vendor, no new package,
no layer-violation, and the database master key stays exactly where it already is.

## ADR conflicts

**None.** ADR-0002 (hexagonal shape & naming) is the governing ADR and this unit
follows it exactly — it is the same pattern F-20 PR1/PR2/PR3 shipped. No ADR is
contradicted or amended.

---

## Files to change

### NEW files (7)
1. `lib/domain/Discrepancy.ts` — owned domain types (`DiscrepancyToday`,
   `DiscrepancyWeekRollupRow`, `DiscrepancyDetail`). Pure TS, no imports of framework/vendor.
2. `lib/ports/DiscrepanciesRepository.ts` — the new port interface.
3. `lib/ports/__contracts__/DiscrepanciesRepository.contract.ts` — shared contract suite.
4. `lib/adapters/supabase/DiscrepanciesRepository.ts` — the Supabase adapter (only vendor import).
5. `lib/adapters/fake/DiscrepanciesRepository.ts` — the in-memory Fake.
6. `lib/services/DashboardService.ts` — the new service (factory export only).
7. `lib/wiring/dashboard.ts` — composition root (service-role singletons).
   Plus: `lib/wiring/discrepancies.ts` — the DiscrepanciesRepository service-role singleton.
   (Counted as the 8th new file; named separately so other domains can reuse the repo singleton.)

### EDITED files (8)
8. `lib/domain/index.ts` — re-export the new Discrepancy domain types.
9. `lib/domain/Complaint.ts` — add the windowed read shapes the dashboard needs
   (`ComplaintWeekRollupRow`; the open>48h and today rows reuse `Complaint`).
10. `lib/ports/index.ts` — re-export `DiscrepanciesRepository`.
11. `lib/ports/ComplaintsRepository.ts` — add 3 windowed read methods (signatures below).
12. `lib/ports/VisitsRepository.ts` — add 2 windowed read methods (signatures below).
13. `lib/adapters/supabase/ComplaintsRepository.ts` — implement the 3 new methods (verbatim selects).
14. `lib/adapters/supabase/VisitsRepository.ts` — implement the 2 new methods (verbatim selects).
15. `lib/adapters/supabase/index.ts` + `lib/adapters/fake/index.ts` — export the new Discrepancies repos
    (and the 5 new windowed methods come for free on existing exports).
16. `lib/services/index.ts` — export `createDashboardService`.
17. `app/api/dashboard/route.ts` — re-point onto `dashboardService`.
18. `app/api/detail/discrepancy/route.ts` — re-point onto `discrepanciesRepository.findDetailById`.

🗣 Seven brand-new small files (the discrepancies socket, its two plugs, its exam, the
dashboard desk and its fuse box) plus light edits to existing sockets/plugs and the two
web routes. No file outside `lib/` and the two routes is touched.

---

## VERIFIED field-parity analysis (the load-bearing part)

I read both routes and every existing repo method against the route's literal
queries. Findings:

### `app/api/dashboard/route.ts` — 12 parallel queries, mapped to seams

| # | Route query (what it selects / filters) | Existing method? | Verdict |
|---|---|---|---|
| 1 | complaints, `status=open` AND `created_at < ago48h`, `customers(name)` + `users(name)`, ASC | `listOpen` joins names but has NO 48h filter | **NEW** `listOpenOlderThan(before)` |
| 2 | visits, `outcome IN (at_risk,lost)`, `created_at >= ago7d` (NO upper bound), `customers(name)`+`users(name)`, DESC | `listAtRisk({from,to})` applies BOTH gte+lte | **REUSE w/ note**: pass `from=ago7d`. See R1. |
| 3 | visits, `commitment_made=true`, `created_at < ago24h`, joins, ASC | `listCommitments({from:null,to:ago24h})` — `lt`, from optional, ASC | **REUSE as-is** ✅ exact match |
| 4 | discrepancies today, window [zoneFrom,zoneTo], `customers(name)`+`products(name)`+`users(name)`, DESC, limit 50 | none | **NEW** `listToday(window)` |
| 5 | complaints today, window, `customers(name)`+`users(name)`, DESC, limit 50 | none | **NEW** `listTodayWithNames(window)` |
| 6 | visits today, window, select `id,created_at,outcome,visit_type,notes,pipeline_status,customer_id,prospect_name,customers(name),users(name)`, DESC, limit 50 | none (`listAllWithFilters` = limit 200, no window-only path) | **NEW** `listTodayForDashboard(window)` |
| 7 | discrepancies this week, select `reason, products(name)`, window | none | **NEW** `listWeekRollup(window)` |
| 8 | complaints this week, select `category,status,created_at,resolved_at`, window | none | **NEW** `listWeekRollup(window)` |
| 9 | visits this week, select `visit_type,outcome,user_id,customer_id,prospect_name,users(name)`, window | none | **NEW** `listWeekForDashboard(window)` |
| 10 | prospects this week, `prospect_name not null`, select `prospect_name,prospect_postcode,outcome,visit_type,users(name)`, window, DESC | `listProspects({from,to})` returns a SUPERSET (adds id,created_at,pipeline_status) | **REUSE as-is** ✅ (service reads only needed fields) |
| 11 | price_agreements, select `id,status,valid_until`, no filter | `listAgreements({})` returns full agreements+lines | **REUSE as-is** (service reads id/status/validUntil; see R3 over-fetch note) |
| 12 | orders, `delivery_date = londonToday(now)`, select `state` | `listOrders({deliveryDate})` returns full Order+lines+joins | **REUSE as-is** (service reads `.state`; see R3 over-fetch note) |

🗣 Of the 12 database calls, 5 already have a perfect or superset socket we reuse, and
7 need brand-new socket methods. Every "new" one is a real gap, not duplication.

### `app/api/detail/discrepancy/route.ts`
Single raw `fetch` reading `discrepancies?id=eq.<id>` with
`customers(id,name)`, `products(id,name,category)`, `users(name)`. Maps to NEW
`DiscrepanciesRepository.findDetailById(id)`.
**Empty/not-found behaviour to PRESERVE (verified at route line 33):** today the raw
fetch returns `rows = []` on no match → route returns **404 `{error:'Not found'}`**.
So `findDetailById` MUST return `null` on miss (define-errors-out-of-existence), and
the route maps `null → 404`. A DB error (`!res.ok`) returns **500 `{error:'DB error'}`**
today; after re-point the adapter throws `ServiceError` → route catch returns
**500 `{error:'Server error'}`**. ⚠ The error-body STRING changes from `'DB error'`
to `'Server error'` on the DB-failure path. See **R4** — must be decided.

---

## NEW vs EXTENDED vs REUSED repo methods (exact signatures)

### NEW port — `DiscrepanciesRepository` (`lib/ports/DiscrepanciesRepository.ts`)
```ts
export interface DiscrepancyWindow { readonly from: string; readonly to: string }

export interface DiscrepanciesRepository {
  /** Discrepancies in [from,to], newest first, limit 50. customers(name) +
   *  products(name) + logged-by users(name) resolved. RAW reason (no replace).
   *  → dashboard Zone 2. @throws ServiceError on DB failure. */
  listToday(window: DiscrepancyWindow): Promise<readonly DiscrepancyToday[]>;

  /** Discrepancies in [from,to] (no limit), reason + products(name) only — the
   *  rollup feed. → dashboard Zone 3. @throws ServiceError on DB failure. */
  listWeekRollup(window: DiscrepancyWindow): Promise<readonly DiscrepancyWeekRollupRow[]>;

  /** One discrepancy by id with customer{id,name} + product{id,name,category} +
   *  logged-by rep name. null on miss (route maps null→404). RAW reason.
   *  → GET /api/detail/discrepancy. @throws ServiceError on DB failure. */
  findDetailById(id: string): Promise<DiscrepancyDetail | null>;
}
```
Adapter selects (copied VERBATIM from the routes):
- `listToday`: `id, created_at, status, reason, ordered_qty, sent_qty, customers(name), products(name), users!discrepancies_user_id_fkey(name)` + `.gte('created_at',from).lte('created_at',to).order('created_at',{ascending:false}).limit(50)`
- `listWeekRollup`: `reason, products(name)` + `.gte('created_at',from).lte('created_at',to)`
- `findDetailById`: `id, created_at, status, reason, ordered_qty, sent_qty, unit, note, customers(id,name), products(id,name,category), users!discrepancies_user_id_fkey(name)` + `.eq('id',id).maybeSingle()`

**Boundary note (ADR-0002 line 27):** the adapter maps nested-join rows
(`customers`/`products`/`users` arriving as object-or-1-element-array) to the owned
domain shapes using the same `one<T>()` coercion helper the Visits adapter uses.
**The RAW `reason` value is carried in the domain type** (no `replace(/_/g,' ')`); the
presentation `.replace` STAYS IN THE ROUTE/SERVICE, mirroring how Visit/Complaint carry
RAW enums. The domain types carry numeric `orderedQty`/`sentQty` as `number | null`.

### NEW domain types (`lib/domain/Discrepancy.ts`)
```ts
export type DiscrepancyStatus = "short" | "not_sent";

export interface DiscrepancyToday {
  readonly id: string;
  readonly createdAt: string;
  readonly status: DiscrepancyStatus;
  readonly reason: string;            // RAW (route does the .replace)
  readonly orderedQty: number | null;
  readonly sentQty: number | null;
  readonly customerName: string | null;  // ?? 'Unknown' applied in route/service
  readonly productName: string | null;
  readonly loggedByName: string | null;
}
export interface DiscrepancyWeekRollupRow {
  readonly reason: string;            // RAW
  readonly productName: string | null;
}
export interface DiscrepancyDetail {
  readonly id: string;
  readonly createdAt: string;
  readonly status: DiscrepancyStatus;
  readonly reason: string;            // RAW
  readonly orderedQty: number | null;
  readonly sentQty: number | null;
  readonly unit: string | null;
  readonly note: string | null;
  readonly customerId: string | null;
  readonly customerName: string | null;
  readonly productId: string | null;
  readonly productName: string | null;
  readonly productCategory: string | null;
  readonly loggedByName: string | null;
}
```

### EXTENDED port — `ComplaintsRepository` (+3 methods)
```ts
/** OPEN complaints with created_at < before, customers(name)+users(name)
 *  resolved, ASC. → dashboard Zone 1 (open>48h). */
listOpenOlderThan(before: string): Promise<readonly Complaint[]>;

/** Complaints in [from,to], customers(name)+users(name) resolved, DESC,
 *  limit 50. → dashboard Zone 2 (complaints today). */
listTodayWithNames(window: { from: string; to: string }): Promise<readonly Complaint[]>;

/** Complaints in [from,to], category+status+created_at+resolved_at ONLY (no
 *  joins) — the category-rollup + avg-resolution feed. → dashboard Zone 3. */
listWeekRollup(window: { from: string; to: string }): Promise<readonly ComplaintWeekRollupRow[]>;
```
Adapter selects (VERBATIM from dashboard route):
- `listOpenOlderThan`: `id, created_at, category, description, user_id, customers(name), users!complaints_user_id_fkey(name)` + `.eq('status','open').lt('created_at',before).order('created_at',{ascending:true})`
- `listTodayWithNames`: `id, created_at, category, status, description, resolution_note, customers(name), users!complaints_user_id_fkey(name)` + window + `.order('created_at',{ascending:false}).limit(50)`
- `listWeekRollup`: `category, status, created_at, resolved_at` + window
New domain shape `ComplaintWeekRollupRow { category: ComplaintCategory; status: ComplaintStatus; createdAt: string; resolvedAt: string | null }`.
**Mapping note:** `listOpenOlderThan`/`listTodayWithNames` return the existing `Complaint`
shape; the adapter's existing `toComplaint` mapper fills only selected columns (the
others default). The route/service reads `customerName`, `loggedByName`, `category`,
`status`, `description`, `resolutionNote`, `createdAt` off `Complaint` — all present in
the selects above.

### EXTENDED port — `VisitsRepository` (+2 methods)
```ts
/** Visits in [from,to], DESC, limit 50, with outcome, visit_type, notes,
 *  pipeline_status, customer_id, prospect_name, customers(name), users(name).
 *  → dashboard Zone 2 (visits-today, grouped by rep with drill-down). */
listTodayForDashboard(window: { from: string; to: string }): Promise<readonly Visit[]>;

/** Visits in [from,to] (no limit), with visit_type, outcome, user_id,
 *  customer_id, prospect_name, users(name). → dashboard Zone 3 (week rep
 *  grouping + hunter/farmer). */
listWeekForDashboard(window: { from: string; to: string }): Promise<readonly Visit[]>;
```
Adapter selects (VERBATIM from dashboard route lines 105 / 128):
- `listTodayForDashboard`: `id, created_at, outcome, visit_type, notes, pipeline_status, customer_id, prospect_name, customers(name), users!visits_user_id_fkey(name)` + window + `.order('created_at',{ascending:false}).limit(50)`
- `listWeekForDashboard`: `visit_type, outcome, user_id, customer_id, prospect_name, users!visits_user_id_fkey(name)` + window
Both map via the existing `toVisit` mapper (RAW enums preserved; un-selected fields default).

### REUSED as-is (no signature change)
- `VisitsRepository.listCommitments({from:null,to:ago24h})` — exact match (query #3).
- `VisitsRepository.listAtRisk({from:ago7d, to:<?>})` — see **R1** (the `to` upper-bound).
- `VisitsRepository.listProspects({from:zoneFrom,to:zoneTo})` — superset, reused (query #10).
- `OrdersRepository.listOrders({deliveryDate: londonToday(now)})` — service tallies `.state` (query #12).
- `PricingRepository.listAgreements({})` — service computes active/draft/expired (query #11).
- `CustomersRepository` / `ProductsRepository` — **NO new methods**; names come back inside the
  visits/complaints/discrepancies adapter joins. Confirmed: the route never queries `customers`
  or `products` tables directly except via joins. ✅

### `DashboardService` (`lib/services/DashboardService.ts`) — factory + owned aggregation
```ts
export interface DashboardServiceDeps {
  readonly discrepancies: DiscrepanciesRepository;
  readonly complaints: ComplaintsRepository;
  readonly visits: VisitsRepository;
  readonly orders: OrdersRepository;
  readonly pricing: PricingRepository;
}
export interface DashboardWindow { readonly from: string; readonly to: string }

export interface DashboardService {
  /** Build the entire Screen-4 payload. `now` and `window` are INJECTED so all
   *  time maths is deterministic — the service NEVER calls new Date(). */
  load(input: { now: Date; window: DashboardWindow }): Promise<DashboardPayload>;
}
export function createDashboardService(deps: DashboardServiceDeps): DashboardService { … }
```
The service derives `ago48h/ago24h/ago7d` from `now`, fans out the repo reads via
`Promise.all`, and owns ALL aggregation currently in the route (lines 158-381):
group-visits-by-rep (+ outcome distribution + drill-down), week rep×visit_type
grouping, discrepancy-reason rollup, discrepancy-product top-5, complaint-category
rollup, avg resolution time, hunter/farmer counts, pricing active/draft/expired (via
`londonToday(now)`), orders state tally, and the `openComplaintsWeek` / `totalComplaintsWeek`
extras. It returns the byte-identical `DashboardPayload`.

**`DashboardPayload`** is a TS interface in `lib/services/DashboardService.ts` (or
`lib/domain/Dashboard.ts` if preferred) whose keys are EXACTLY: `openComplaints48h,
atRiskAccounts, unreviewedCommitments, discrepanciesToday, complaintsTodayList,
visitsToday, weekDiscrepancyReasons, weekDiscrepancyProducts, weekComplaintCategories,
weekVisitsByRep, prospectsThisWeek, hunterFarmer, activePricing, draftPricing,
expiredPricing, ordersToday, avgResolutionHours, totalComplaintsWeek, openComplaintsWeek`
— the route does `NextResponse.json(payload)` unchanged.

🗣 The desk takes "what time is it" and "which date window" as inputs instead of
reading the clock itself — so a test can freeze time and check every total to the digit.

---

## Numbered implementation steps (TDD order)

> **Build order is contract-first, then adapters, then service, then routes** — the
> proven F-20 sequence. Write the failing test before each implementation.

1. **Domain types** — write `lib/domain/Discrepancy.ts` (3 interfaces above);
   add `ComplaintWeekRollupRow` to `lib/domain/Complaint.ts`; re-export both from
   `lib/domain/index.ts`. (No test — pure types; the tsc gate covers them.)
2. **DiscrepanciesRepository port** — write `lib/ports/DiscrepanciesRepository.ts`;
   re-export from `lib/ports/index.ts`.
3. **Contract suite** — write `lib/ports/__contracts__/DiscrepanciesRepository.contract.ts`
   (`discrepanciesRepositoryContract(setup)` exporting cases for `listToday` window+limit+order,
   `listWeekRollup` window, `findDetailById` hit + `null`-on-miss + RAW-reason carry). Mirror
   `CustomersRepository.contract.ts` structure exactly.
4. **Fake adapter** — write `lib/adapters/fake/DiscrepanciesRepository.ts`
   (`createFakeDiscrepanciesRepository(seed)` + singleton); export from `lib/adapters/fake/index.ts`.
   Write `tests/unit/adapters/fake/DiscrepanciesRepository.test.ts` running the contract against the Fake.
5. **Supabase adapter** — write `lib/adapters/supabase/DiscrepanciesRepository.ts`
   (`createSupabaseDiscrepanciesRepository(client)` + `supabaseDiscrepanciesRepository`
   service-role singleton; verbatim selects; `one<T>()` coercion; RAW reason; ServiceError on
   failure). Export from `lib/adapters/supabase/index.ts`.
6. **Discrepancies wiring** — write `lib/wiring/discrepancies.ts` exporting
   `discrepanciesRepository` (service-role singleton).
7. **Extend ComplaintsRepository** — add the 3 methods to the port; implement in the
   Supabase adapter (verbatim selects) and the Fake; add the 3 cases to the existing
   Complaints contract (NB: there is currently **no** `ComplaintsRepository.contract.ts` —
   see R5; create one, or add focused fake+integration tests for the 3 methods).
8. **Extend VisitsRepository** — add the 2 methods to the port; implement in the Supabase
   adapter (verbatim selects) and Fake; add cases (same R5 note — no Visits contract exists today).
9. **Detail route re-point** — rewrite `app/api/detail/discrepancy/route.ts` to call
   `discrepanciesRepository.findDetailById(id)`; PRESERVE the `x-mfs-user-id`→401 guard
   VERBATIM, the `id` required→400, `null`→404, and the response field mapping (apply
   `.replace(/_/g,' ')` on reason + `?? 'Unknown'` / `?? ''` defaults IN THE ROUTE). Resolve R4
   on the 500 error-body string first.
10. **DashboardService** — write `lib/services/DashboardService.ts` (factory; injected `now`+`window`;
    all aggregation; `DashboardPayload`). Export `createDashboardService` from `lib/services/index.ts`.
    Write `tests/unit/services/DashboardService.test.ts` with fake repos + frozen `now`.
11. **Dashboard wiring** — write `lib/wiring/dashboard.ts` exporting `dashboardService`
    (service-role singletons for all 5 repos).
12. **Dashboard route re-point** — rewrite `app/api/dashboard/route.ts` to: keep the
    `x-mfs-user-id`→401 guard VERBATIM; parse `from`/`to` exactly as today
    (`searchParams.get('from') ?? todayUTC.toISOString()`, `…('to') ?? now.toISOString()`);
    build `now = new Date()`; call `dashboardService.load({ now, window:{from:zoneFrom,to:zoneTo} })`;
    `NextResponse.json(payload)`. PRESERVE the `force-dynamic` export and the catch→500 `'Server error'`.
13. **Lint/fence check** — confirm both routes import zero adapters; run the
    `no-adapter-imports` lint test.

🗣 We build the new socket and its plugs first and prove them on the bench, then move the
maths into the desk, then finally flip the two routes over — each step has a test that fails
until that step is done right.

---

## TDD test plan (ANVIL executes this)

### Unit (`tests/unit/…`, no DB)
- **DashboardService** (`services/DashboardService.test.ts`): with fake repos seeded
  and a FROZEN `now`, assert EVERY rollup/group/tally to the value:
  group-visits-by-rep (count + outcome distribution + drill-down order), week rep×visit_type,
  discrepancy-reason rollup (sorted desc), discrepancy-product top-5 (slice), complaint-category
  rollup, `avgResolutionHours` (incl. the `ms>0` guard + `null` when none resolved),
  hunter/farmer counts, pricing active/draft/expired (londonToday boundary cases:
  valid_until == today, < today, null), orders state tally, `openComplaintsWeek`,
  `totalComplaintsWeek`. **Plus the exact response key-set** (all 19 top-level keys + the
  nested shapes of `visitsToday[].visits[]`, `weekVisitsByRep[].types`, `ordersToday`, `hunterFarmer`).
- **Discrepancies Fake + contract** (`adapters/fake/DiscrepanciesRepository.test.ts`).
- **Complaints/Visits new methods** — fake-level tests (window filtering, limit, order,
  RAW-enum carry). (Contract cases if R5 resolves to "create the contracts".)
- **Both routes** (`tests/unit/routes/…` per existing route-test idiom, repos mocked):
  - dashboard: 401 when `x-mfs-user-id` missing; happy-path shape (key-set) with mocked
    `dashboardService.load`; 500 when the service throws.
  - detail/discrepancy: 401 missing header; 400 missing `id`; 404 on `null`; happy-path
    field mapping (RAW reason → spaced, `?? 'Unknown'` defaults); 500 when the repo throws.

### Integration (LIVE Supabase, `tests/integration/adapters/supabase/…`)
- `DiscrepanciesRepository.test.ts` — run the contract against the REAL adapter on local
  Supabase (`listToday` window+limit+order, `listWeekRollup`, `findDetailById` hit+miss).
  Requires a seeded `discrepancies` row with customer/product/user joins — confirm the seed
  has one (`npm run db:reset`); add a seed row if absent.
- Complaints/Visits new windowed methods against real Supabase (window + join-field parity).
- Booted-server smoke of BOTH routes (shape + guard) via the integration runner's DB-identity-probe harness.

### E2E (`@critical` preview smoke)
- Standard `npm run test:e2e:preview -- <preview-url> --unprotected`, readiness-gated on
  `/api/auth/team`=200. **NO exhaustive every-button browser sweep** — this is backend-only,
  no UI change, no RLS change; the right-sized depth per the established rule (see
  `[[anvil-full-browser-taps]]`).

🗣 The test bench checks every total with a frozen clock; the live-database tests confirm the
new plugs read the real tables correctly; and the standard preview smoke confirms the screen
still loads. We deliberately skip the heavyweight click-every-button sweep because nothing the
user sees or the security rules change.

---

## Acceptance criteria

1. `app/api/dashboard/route.ts` and `app/api/detail/discrepancy/route.ts` import
   **zero** files from `lib/adapters/**` and **zero** vendor SDKs (`@supabase/*`).
2. Both routes' wire responses are byte-identical to pre-F-21 (key-set tests green;
   integration shape smoke green).
3. The `x-mfs-user-id`→401 guard on both routes is preserved VERBATIM.
4. `DashboardService.load` takes `now` + `window` as inputs and calls `new Date()` zero times.
5. `DiscrepanciesRepository` (port + Supabase + Fake) passes one shared contract.
6. No new `package.json` entry; no migration; no RLS change; no UI change.
7. Rip-out test holds: swapping the DB vendor for the dashboard = new adapter folder +
   the two `lib/wiring/*.ts` lines. Nothing in routes/service/domain changes.
8. `no-adapter-imports` lint test + tsc + full unit/integration suites green; `@critical` preview smoke green.

---

## Risk Assessment

### R1 — at-risk window upper-bound mismatch (business-logic / byte-identity) — **MUST-FIX**
**Severity: HIGH.** The dashboard's at-risk query (line 69-74) filters
`created_at >= ago7d` with **NO upper bound**. The existing `listAtRisk({from,to})`
applies BOTH `gte(from)` AND `lte(to)`. If the plan reuses `listAtRisk` and passes
`to = now.toISOString()` (or `zoneTo`), the `lte` upper bound could EXCLUDE rows with a
future-ish or clock-skewed `created_at` that today's unbounded query includes — a
behaviour change.
**Mitigation (decide at Gate 2):** either (a) pass `to = now.toISOString()` and prove via
integration test that no at-risk row ever has `created_at > now` (true in practice — DB
default is server now), making `lte(now)` a no-op vs unbounded; OR (b) the cleaner, safer
option — add a dedicated `listAtRiskSince(from)` method (gte only, DESC, AT_RISK_COLS) so the
query is byte-identical to today by construction. **Recommend (b)** — it removes the
reasoning burden and the clock-skew edge entirely. **Flag: must-fix** (a wrong choice silently
changes which accounts show as at-risk).
🗣 Today's "at-risk this week" list has no top end on the date. The existing reusable method
puts a top end on it. If we reuse it carelessly we could quietly drop accounts. The fix is to
add a method that, like today, only has a bottom end.

### R2 — `now` injection vs route clock drift (concurrency/determinism) — LOW
**Severity: LOW.** The route computes `now = new Date()` ONCE and derives all windows
from it. The plan must pass that SAME `now` into `dashboardService.load`, not let the
service capture its own. If the service called `new Date()` internally, the route's
`zoneTo ?? now` and the service's ago-windows would use two different instants — a sub-ms
skew, harmless to output but a determinism smell.
**Mitigation:** `now` is an explicit `load` input (already in the spec + signature above);
unit tests freeze it. No race exists (read-only, single request). **Not a blocker.**
🗣 Make sure the clock is read once and handed to the desk, not read twice. Already designed in.

### R3 — over-fetch on reused Orders/Pricing reads (performance / behaviour) — LOW
**Severity: LOW.** `listOrders({deliveryDate})` returns full orders WITH embedded lines +
customer + creator joins; the dashboard only needs `state`. Likewise `listAgreements({})`
returns agreements WITH all lines; the dashboard needs `id,status,valid_until`. Output stays
byte-identical (the service reads only the needed fields), but each route call now fetches more
columns/rows than today's lean `select('state')` / `select('id,status,valid_until')`.
**Mitigation:** acceptable for behaviour-preservation (dashboards are low-frequency admin
reads); document it. If a future perf pass matters, add lean `countOrdersByStateForDate` /
`listAgreementStatuses` methods then. **Not a blocker** — no correctness impact.
🗣 We reuse two existing sockets that happen to fetch a bit more than the dashboard needs.
The numbers come out identical; it's just slightly heavier. Fine for an admin screen.

### R4 — detail-route 500 error-body string change (byte-identity) — **MUST-FIX (decision)**
**Severity: MEDIUM.** Today the detail route returns `{error:'DB error'}` (status 500) when
the raw fetch `!res.ok`, and `{error:'Server error'}` (status 500) only in the outer catch.
After re-point, the adapter throws `ServiceError` → the outer catch returns
`{error:'Server error'}`. So on a DB-read failure the **body string changes from 'DB error'
to 'Server error'** (status stays 500). The 404 `{error:'Not found'}` and 401/400 paths are
unchanged.
**Mitigation (decide at Gate 2, AskUserQuestion):** either accept the harmless body-string
drift (no client reads the 500 body) and note it as a documented, intentional deviation, OR
have the route catch `ServiceError` specifically and emit `{error:'DB error'}` to stay
byte-identical. **Recommend: accept the drift** (consistent with every other re-pointed route's
500 = 'Server error'), but it must be an explicit decision, not silent. **Flag: must-fix
decision** (byte-identity claim is otherwise technically false on this one path).
🗣 The only visible change in the whole unit is the wording of an error message that shows up
only when the database itself fails — and only in a field no screen displays. We should pick
"leave it as the standard wording" on purpose rather than by accident.

### R5 — no existing Complaints/Visits CONTRACT to extend (test-coverage) — MEDIUM
**Severity: MEDIUM.** The spec says "add cases to the shared `__contracts__` contract test"
for the new Complaints/Visits methods, but `__contracts__/` currently has NO
`ComplaintsRepository.contract.ts` or `VisitsRepository.contract.ts` (verified: only Customers,
Orders, Pricing, Products, Routes, Users, AuditLog, Geocoder exist). These two ports shipped
(F-17/F-18) with fake + integration tests but no shared contract file.
**Mitigation:** for the 2 new Visits + 3 new Complaints methods, either (a) create minimal new
contract files covering ONLY the new methods, or (b) cover them with focused fake-unit +
Supabase-integration tests (the F-17/F-18 pattern). **Recommend (b)** to avoid scope-creep into
re-contracting already-shipped methods; the new methods still get fake + live coverage. **Not a
blocker** — just sets the test shape; flagged so the implementer doesn't hunt for a file that
isn't there.
🗣 Two of the existing sockets never got a shared "exam paper," only their own quizzes. Rather
than write a whole exam for them now, we quiz just the new buttons we're adding. The new socket
(Discrepancies) does get the full shared exam.

### R6 — DashboardService deletion-test depth (architecture) — LOW (PASS)
**Severity: LOW — verdict PASS.** Deletion test: if `DashboardService` were deleted, ALL the
aggregation (12-query fan-out, 8 rollups/tallies, hunter/farmer, pricing/orders logic, ~220
lines) would NOT vanish — it would move back into the route unchanged. So the service
**concentrates** complexity behind a one-method interface (`load`) → it earns its keep (deep
module). It is NOT a pass-through. ✅
🗣 Pull the dashboard desk out and the wall sags — all the arithmetic falls back into the route.
That means the desk is load-bearing, not decoration. Good.

### Categories with no material risk
- **Security:** no auth/RLS change; service-role posture identical to today; guards preserved
  verbatim. No new attack surface. No migration → no data-migration risk.
- **Launch blockers:** none beyond R1 and R4 (both resolvable at Gate 2 with a decision, no code
  unknowns).

### MUST-FIX summary (Gate 2 blockers)
- **R1** — at-risk window: add `listAtRiskSince(from)` (gte-only) rather than reuse
  `listAtRisk` with an `lte`, to preserve the unbounded-top behaviour byte-for-byte.
- **R4** — detail-route 500 body string: make an explicit decision (recommend accept the
  standard `'Server error'`), don't let it drift silently.

Both are decisions, not deep unknowns — they do not loop back to Order, but they MUST be
resolved in the plan/at Gate 2 before Render proceeds.

---

## Biggest risk + mitigation (headline)

**The biggest risk is R1 — the at-risk window's missing upper bound.** It is the one place
where "just reuse the existing method" would silently change which accounts appear in a
manager-facing alert. The plan mitigates it by NOT reusing `listAtRisk` for this query and
instead adding a dedicated `listAtRiskSince(from)` that is `gte`-only — making the query
byte-identical to today by construction, with an integration test pinning it.
🗣 The one trap is a tempting shortcut that would quietly drop at-risk accounts off the
manager's screen. We avoid it by giving that query its own exact-match method instead of
bending a similar one.
