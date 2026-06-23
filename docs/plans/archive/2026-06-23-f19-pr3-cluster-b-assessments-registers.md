# F-19 PR3 — Cluster B (HACCP assessments & registers): build + re-point in one PR

> Date: 2026-06-23 · Author: forge-planner (FORGE Phase 2 — Order)
> FORGE unit: F-19 (HACCP crunch) · This plan: PR3 of ~10 · Lane: STANDARD
> Status: planned, awaiting Gate 2.
> Spec lock: Gate 1 approved 2026-06-23 — Cluster B, **COMBINED rhythm** (foundation +
> re-point in ONE PR), **BYTE-IDENTICAL behaviour preservation**, NO schema change, NO migration.
> Depends on: Cluster A (PR1 #68 `c724e77` + PR2 #69 `335203e`, both SHIPPED) — the
> daily-checks hexagon is the template this PR mirrors. The CA ledger is NOT touched here
> (Cluster B routes file no corrective actions).
> Precedent mirrored: F-19 PR1 (foundation) + PR2 (re-point) collapsed into one PR, exactly
> as the roadmap's "combined" rhythm prescribes for Cluster B.

---

## Visual mini-map

```
DOMAIN (core logic)
  ├─ HaccpAssessmentsRepository (port) → [Supabase] (adapter) + [Fake] (test)
  │    covers 5 tables: allergen-assessment · allergen-monthly-reviews
  │    · food-defence · food-fraud · product-specs
  └─ HaccpAssessmentsService depends on the port only (lifts monthlyReviewUtils helpers)
  wired in lib/wiring/haccp.ts (the one business file allowed to import lib/adapters/**)
🗣 One new socket for the five "register" tables. The 5 screens unplug from the database and plug into this socket — same output, swappable vendor. No corrective-action ledger involved; these are reference registers, not daily deviation logs.
```

🗣 **In plain English:** Cluster A was the seven *daily* food-safety forms. Cluster B is the
five *standing registers* — your allergen assessment, the monthly allergen review, the food-
defence plan, the food-fraud assessment, and the product spec sheets. Today each of those five
screens reaches straight into the database. This PR builds one clean, tested "registers machine"
and re-wires all five screens to call it — in a single PR (the roadmap calls this the "combined"
rhythm). Nothing a user sees or does changes: same forms, same replies, same saved rows.

---

## 1. Goal & guardrails

Extract the persistence of the **5 Cluster B route files** out of inline `supabaseService`
calls and behind ONE new owned hexagon (`HaccpAssessmentsRepository` port +
`HaccpAssessmentsService` + Supabase & Fake adapters + a wiring line in `lib/wiring/haccp.ts`),
THEN re-point all 5 routes onto it — **in this one PR**. Mirror of the shipped Cluster A
daily-checks template (`lib/domain/HaccpDailyCheck.ts`, `lib/ports/HaccpDailyChecksRepository.ts`,
`lib/services/HaccpDailyChecksService.ts`, `lib/adapters/supabase/HaccpDailyChecksRepository.ts`,
`lib/wiring/haccp.ts`).

🗣 **In plain English:** Build the box, plug Supabase into it, then rewire the five screens to
use it — all at once. Cluster A did this in two PRs (build, then flip); Cluster B is small and
self-contained enough that the roadmap approved doing both in one.

### Hard constraints (locked at Gate 1 — restated so the implementer cannot drift)

1. **BYTE-IDENTICAL behaviour.** Every GET response shape (keys + order + values), every
   POST/PATCH effect + status code + error string, every role-gate, preserved EXACTLY. The
   route keeps building its response literal in the SAME key order it uses today.
2. **NO schema change, NO migration, NO SQL, NO RLS policy.** `supabase/migrations/` untouched.
   Every column the routes read/write already exists.
3. **NO new dependency.** `package.json` untouched. New files import only the already-wrapped
   `@supabase/supabase-js` (inside the adapter tree), `@/lib/errors`, `@/lib/observability/log`,
   and (re-homed) the pure `monthlyReviewUtils` helpers.
4. **All 5 routes DROP their direct `@supabase/supabase-js` import** (`import { supabaseService }
   from '@/lib/adapters/supabase/client'` + the `const supabase = supabaseService` line). After
   this PR, NO `app/api/haccp/{allergen-assessment,allergen-assessment/monthly-reviews,food-defence,
   food-fraud,product-specs}/route.ts` file imports `@supabase/*` or names a `haccp_*` table.
   (Rip-out test goes from "5 route files + adapter" to "1 adapter + 1 wiring line".)
5. **Vendor types never leak past the adapter.** The adapter maps snake_case DB rows to domain
   models; the routes speak the app's own vocabulary. (See §3 nuance: the Cluster B GET selects
   use *aliased non-inner* joins — `assessor:assessed_by(name)` — unlike Cluster A's
   `users!inner(name)`. The adapter carries those raw aliased shapes verbatim so the wire output
   is byte-identical; see §8.)
6. **Service depends on the port ONLY** (no adapter import — lint-enforced by
   `tests/unit/lint/no-adapter-imports.test.ts`). Adapters are the ONLY place `@supabase/*` is
   imported. Wiring is the ONLY business-layer place adapters are imported.
7. **Service-role wiring ONLY.** The new singleton is bound to `supabaseService` (the service-role
   key) — exactly the access the routes have today. **NO `…ForCaller(userId)` per-caller
   authenticated factory** — per-caller RLS is deferred to **F-RLS-04h** (Cluster G, PR10), the
   same posture as Cluster A. Do not add one.
8. **Determinism.** Any "now"/"today" logic (`food-defence`/`food-fraud` `review_due =
   next_review_date < now`; `product-specs` `review_due = reviewed_at null || > 12 months`;
   the `assessed_at`/`updated_at`/`reviewed_at` insert timestamps; the monthly-review
   `reviewed_at`) is passed INTO the service as a parameter (`now: Date` or ISO string), never
   computed via `new Date()` inside the service — mirroring Cluster A's `now`/`today` discipline.
   The adapter/route owns the wall clock.
9. **Reads define errors out of existence** (null/empty on miss); every DB failure throws
   `ServiceError`. **No insert in Cluster B has a 23505/409 path today** (none of the 5 routes
   maps a unique-violation to a clean 409 — they all surface the raw pg message at 500), so the
   port methods do NOT add a ConflictError path. Preserve the current 500-on-any-error behaviour
   exactly (see §3 / Risk R5).

### Hexagonal rules (CLAUDE.md "Non-negotiable architecture", ADR-0002)
Routes are presentation (`app/**`): they call the service singleton from `lib/wiring/`, never the
adapter, never a vendor SDK. The route keeps only presentation-edge concerns: the cookie role
gate, the wall-clock (`new Date()`), request-body parsing, response assembly + key order.
Everything that touches a table or derives a register value moves into the service path.

---

## 2. OUT OF SCOPE (stated explicitly, per the spec)

- **F-PROD-01 (allergen version-history UI)** — **DEFERRED / resolved as display-only.**
  `haccp_allergen_assessment` is ALREADY append-only (every POST inserts a fresh row; the GET
  returns `all_assessments` desc + `assessment = latest`), and the version-history display
  already exists on `app/haccp/allergens/page.tsx`. The roadmap's open question was "does Hakan
  want a draft/published state?" — that would need a schema change (`version int` + `status`
  enum). **Decision: NO draft/published in this PR** (it is a schema change, and constraint #2
  forbids any). The history feature is satisfied by the existing append-only + display surface;
  this PR preserves it byte-identically. Same append-only shape on food-defence/food-fraud.
- **Per-caller RLS / authenticated client** — DEFERRED to F-RLS-04h (Cluster G). Wiring stays
  service-role only; no `…ForCaller`.
- **No UI change.** The 4 page files (`app/haccp/{allergens,food-defence,food-fraud,product-specs}/
  page.tsx`) are NOT edited — they call the same API routes with the same request/response
  contract.
- **No CA-ledger touch.** Cluster B routes file zero corrective actions; `HaccpCorrectiveActions*`
  and `submitHaccpDailyCheck` are NOT imported or changed.

🗣 **In plain English:** We are NOT building a new "draft vs published" feature for the allergen
assessment (that would change the database — banned here). The history list already works because
every save keeps the old rows. We just move the plumbing behind a clean socket. No screens
change; the daily-deviation corrective-action machine from Cluster A is not involved.

---

## 3. The 5 Cluster B routes — verified against the real files

| # | Route file | Handlers | Table(s) | Persistence model | Joins on GET |
|---|---|---|---|---|---|
| 1 | `app/api/haccp/allergen-assessment/route.ts` | GET, POST | `haccp_allergen_assessment` | **append-only** (every POST inserts fresh; never overwrites) | `assessor:assessed_by(name)`, `updater:updated_by(name)` (aliased, non-inner) |
| 2 | `app/api/haccp/allergen-assessment/monthly-reviews/route.ts` | GET, POST | `haccp_allergen_monthly_reviews` (+ READS `haccp_deliveries`) | **UPSERT on `month_year`** (re-running a month overwrites it) | `reviewer:reviewed_by(name)` |
| 3 | `app/api/haccp/food-defence/route.ts` | GET, POST | `haccp_food_defence_plans` | **append-only** versioned insert | `preparer:prepared_by(name)`, `approver:approved_by(name)`, `creator:created_by(name)` |
| 4 | `app/api/haccp/food-fraud/route.ts` | GET, POST | `haccp_food_fraud_assessments` | **append-only** versioned insert | `preparer:prepared_by(name)`, `approver:approved_by(name)`, `creator:created_by(name)` |
| 5 | `app/api/haccp/product-specs/route.ts` | GET, POST, PATCH | `haccp_product_specs` | **in-place UPDATE** by id (PATCH; `active:false` = soft-delete) + append insert (POST) | `reviewer:reviewed_by(name)`, `creator:created_by(name)` |

**THREE distinct persistence models in one cluster (the central risk — see Risk R1):**
- **append-only** (allergen-assessment, food-defence, food-fraud): POST always inserts a new row.
- **upsert-same-key** (monthly-reviews): POST `.upsert(..., { onConflict: 'month_year' })` — re-run
  a month and it OVERWRITES that month's row. Map this to its OWN port method
  (`upsertMonthlyReview`); do NOT "improve" it into an insert.
- **in-place update + soft-delete** (product-specs PATCH): `.update(updates).eq('id', id)` — and
  `active:false` is just one possible field in `updates`, the soft-delete. Map this to its OWN port
  method (`updateProductSpec(id, updates, now)`); preserve the "only set `allergens` if it was in
  the body" dynamic-key nuance (route lines 128-131).

**Role-gating (verified, IDENTICAL across all 5):**
- GET: `mfs_role` ∈ `{warehouse, butcher, admin}`, else 401 `'Unauthorised'`.
- POST/PATCH: `mfs_role === 'admin'` AND `mfs_user_id` present, else 403 `'Admin only'`.
- The role-cookie gate STAYS in every route (presentation-edge).

**No 23505/409 path anywhere in Cluster B (verified):** all 5 routes do
`if (error) return NextResponse.json({ error: error.message }, { status: 500 })` on any DB error
— including a hypothetical unique-violation. So the adapter throws `ServiceError` on every DB
error and the route catch returns its existing 500. (Contrast Cluster A, which had clean 409
paths → ConflictError. Cluster B has none → no ConflictError mapping. See Risk R5.)

**All current call sites are `supabaseService` via `@/lib/adapters/supabase/client`** (NOT raw
`fetch`) — verified in all 5 files. No raw-fetch inheritance (ADR-0005 Per-Site Map assigns no
`app/api/haccp/**` route).

🗣 **In plain English:** Five screens, but three *different* save behaviours hiding in them. The
allergen assessment, food-defence and food-fraud always ADD a new row (keep history). The monthly
review OVERWRITES the same month if you run it twice. The product spec EDITS a row in place, and
"deactivate" is just an edit that flips an `active` flag. The plan keeps each of those three
behaviours as its own clearly-named method so the move can't accidentally turn one into another.

---

## 4. Architecture / naming decision — ONE aggregate (`HaccpAssessments`), NOT five per-group modules

**DECISION: build ONE cohesive `HaccpAssessments` domain file + ONE port + ONE service + ONE
Supabase adapter + ONE Fake adapter, covering all 5 register groups.** Justified below.

### Why one aggregate (mirrors the Cluster A "one deep file" precedent)

Cluster A's design decision 2 (resolved at Render, documented at `lib/domain/HaccpDailyCheck.ts`
lines 10-19) chose ONE cohesive domain file for SEVEN sub-domains, and ONE service for all seven,
reasoning that splitting pure type/CRUD modules per sub-domain creates SHALLOW modules (each file
almost entirely interface, no behaviour to hide) and widens the barrel's import surface without
hiding anything. The same reasoning applies — more strongly — to Cluster B:

- The 5 register groups share a common skeleton: a `created_by`/`reviewed_by`/`assessed_by`
  user-ref, a `next_review_date`/`reviewed_at` review cadence, an `active`/version notion, and
  the SAME role-gate. They are five faces of one "standing registers" ledger.
- Cluster B has even LESS per-group behaviour than Cluster A (no corrective-action derivation, no
  temp-status maths, no batch-code building) — almost all logic is thin CRUD plus the two small
  `review_due` predicates and the monthly aggregation. Five separate ports/services would each be
  a near-empty pass-through (fails the deletion test: complexity would just MOVE to a wider barrel,
  not concentrate).
- One port keeps the rip-out test at "one adapter + one wiring line"; five ports would need five
  adapters + five wiring lines for the same vendor swap — strictly worse on the CLAUDE.md
  acceptance test.

**Verdict: one `HaccpAssessments` aggregate.** This is the deeper, Ousterhout-honest choice and
the direct mirror of the shipped Cluster A precedent.

🗣 **In plain English:** Build ONE "registers" machine covering all five, not five tiny machines.
The five registers are nearly identical CRUD with a thin review-date check — splitting them would
give you five almost-empty boxes and make swapping the database five times harder. Cluster A made
exactly this call for its seven forms; we follow it.

---

## 5. Files created (8) + barrel edits (5) + routes re-pointed (5) + re-home (1)

**Created — domain (1):**
1. `lib/domain/HaccpAssessment.ts` — row + input types for the 5 register groups (§6). Pure TS,
   no imports.

**Created — port (1):**
2. `lib/ports/HaccpAssessmentsRepository.ts` — the read/insert/upsert/update interface (§7).
   Pure interface; imports domain types only.

**Created — service (1):**
3. `lib/services/HaccpAssessmentsService.ts` — `createHaccpAssessmentsService(deps)` factory;
   depends on the `assessments` port alone. Owns the two `review_due` predicates +
   the monthly-review aggregation (lifts the `monthlyReviewUtils` helpers — see §9), all taking
   `now` as a parameter (§ constraint 8).

**Created — Supabase adapter (1):**
4. `lib/adapters/supabase/HaccpAssessmentsRepository.ts` — verbatim `.select()`/insert/upsert/
   update strings (§8); the ONLY `@supabase/*` importer for these 5 tables; factory +
   service-role singleton bound to `supabaseService`.

**Created — Fake adapter (1):**
5. `lib/adapters/fake/HaccpAssessmentsRepository.ts` — in-memory impl for unit tests.

**Created — unit tests (3):**
6. `tests/unit/services/HaccpAssessmentsService.test.ts` — review_due predicates, monthly
   aggregation/site-status, read/insert/upsert/update delegation (against the Fake).
7. `tests/unit/adapters/supabase/HaccpAssessmentsRepository.test.ts` — row→domain mapping per
   method; verbatim-select smoke (the byte-identity pin); null/`[]`-on-miss; ServiceError on
   DB error.
8. `tests/unit/wiring/haccpAssessments.test.ts` — the singleton constructs + exposes the full
   method surface; asserts service-role wiring only (no `…ForCaller`).

**Edited — re-home the pure helpers (1, no behaviour change):**
- `lib/allergen/monthlyReviewUtils.ts` — these 3 pure functions (`monthDateRange`,
  `deriveSiteStatus`, `buildCategoryBreakdown`) are currently imported by the monthly-reviews
  route AND `tests/unit/allergenMonthlyReview.test.ts`. **Re-export them from the service** (the
  service imports + re-exposes them) so the lifted logic has one home, BUT keep
  `lib/allergen/monthlyReviewUtils.ts` as the source module so the existing unit test
  (`tests/unit/allergenMonthlyReview.test.ts`) keeps passing unchanged. **Decision: the service
  IMPORTS from `lib/allergen/monthlyReviewUtils.ts` (a pure, vendor-free module — allowed by
  ADR-0002, like importing `@/lib/errors`) rather than copying the bodies.** This avoids
  byte-drift risk entirely (one source of truth) and keeps the existing test green. The route
  stops importing them directly (it calls the service). Confirm at Render the service-imports-util
  path passes `no-adapter-imports` lint (it does — the util is not an adapter).

**Edited — barrels (4, additive re-export only — NO behaviour change):**
- `lib/domain/index.ts` — add the `HaccpAssessment.ts` types.
- `lib/ports/index.ts` — add `HaccpAssessmentsRepository`.
- `lib/services/index.ts` — add `createHaccpAssessmentsService` + types.
- `lib/adapters/supabase/index.ts` + `lib/adapters/fake/index.ts` — add the new repos.

**Edited — wiring (1):**
- `lib/wiring/haccp.ts` — add ONE singleton:
  `export const haccpAssessmentsService = createHaccpAssessmentsService({ assessments: supabaseHaccpAssessmentsRepository });`
  Service-role only; no `…ForCaller`.

**Edited — route re-points (5):** the 5 files in §3.

**Created — integration tests (1, the byte-identity safety net):**
- `tests/integration/haccpAssessments.test.ts` (or extend the existing `tests/integration/
  haccp.test.ts` — match the repo layout; the implementer chooses, one describe per route group).

**NO migration, NO `package.json`, NO `.eslintrc.json`, NO UI page edit.** New adapter files land
under the existing allow-listed glob `lib/adapters/supabase/**/*.ts` — no lint-config change.

🗣 **In plain English:** Eight new files (the machine + its tests), five tiny "add to the export
list" edits, one new wiring line, and the five route files rewired. The monthly-review helper math
stays in its current file and the service just calls it — that way the existing test for it keeps
passing and there's zero risk of mistyping the date logic.

---

## 6. Domain — `lib/domain/HaccpAssessment.ts` (shape guide)

Pure TypeScript, no imports. Carry RAW DB column names/values for the GET-list rows so the wire
output stays byte-identical; model each POST/PATCH body as the app's own input vocabulary. The
implementer copies field names + types from the route bodies cited in §3/§8.

**Shared:** `HaccpUserRef = { readonly name: string } | null` — the `(name)` join target (these
joins are NON-inner, so they can be `null`).

**1. allergen-assessment:**
- `AllergenAssessmentRow` — the GET `.select` columns: `id, site_status, raw_materials,
  cross_contam_risk, procedure_notes, assessed_at, next_review_date, assessor (HaccpUserRef),
  updater (HaccpUserRef)`. (The aliases `assessor`/`updater` are the JSON keys the route returns —
  carry them verbatim.)
- `AllergenAssessmentListResult = { assessment: AllergenAssessmentRow | null; all_assessments:
  readonly AllergenAssessmentRow[] }` — the EXACT GET response shape (backward-compat
  `assessment = latest`).
- `CreateAllergenAssessmentInput = { site_status; raw_materials?; cross_contam_risk?;
  procedure_notes?; next_review_date }`.
- `AllergenAssessmentPersist` — the derived insert row: `{ assessed_by, assessed_at,
  next_review_date, site_status, raw_materials, cross_contam_risk, procedure_notes, updated_by,
  updated_at }` (the route defaults `raw_materials ?? []`, `cross_contam_risk ?? ''`,
  `procedure_notes ?? null`; both timestamps = the SAME `now` ISO — pass `now` in).

**2. allergen monthly-reviews:**
- `MonthlyReviewRow` — GET `.select` columns: `id, month_year, period_start, period_end,
  total_deliveries, allergen_detections, category_breakdown, detection_details, site_status,
  reviewed_at, notes, reviewer (HaccpUserRef)`.
- `MonthlyReviewDeliveryRow` — the delivery rows the POST reads to aggregate: `id, date, supplier,
  product, product_category, allergens_identified, allergen_notes, batch_number`.
- `RunMonthlyReviewInput = { month_year: string; notes?: string }`.
- `MonthlyReviewPersist` — the derived UPSERT row: `{ month_year, period_start, period_end,
  total_deliveries, allergen_detections, category_breakdown, detection_details, site_status,
  reviewed_by, reviewed_at, notes }`.
- `MonthlyReviewResult` — the EXACT POST response: `{ review: MonthlyReviewRow; total_deliveries;
  detections; site_status; already_existed: false }`.

**3. food-defence:**
- `FoodDefenceRow` — GET `.select`: `id, version, issue_date, next_review_date, team,
  physical_perimeter, physical_internal, cyber_controls, backup_recovery, emergency_contacts,
  personnel_notes, goods_notes, incident_notes, created_at, preparer, approver, creator`.
- `FoodDefenceListResult = { plans: readonly FoodDefenceRow[]; latest: FoodDefenceRow | null;
  review_due: boolean }` (`review_due = latest ? next_review_date < now : true`).
- `CreateFoodDefenceInput` — the POST body (version, issue_date, next_review_date, the 6 array
  fields, the 3 notes, prepared_by?, approved_by?).
- `FoodDefencePersist` — the insert row (arrays defaulted to `[]`, notes `?.trim() || null`,
  `prepared_by/approved_by || null`, `created_by`).

**4. food-fraud:**
- `FoodFraudRow` — GET `.select`: `id, version, issue_date, next_review_date, risks, supply_chain,
  mitigation_notes, created_at, preparer, approver, creator`.
- `FoodFraudListResult = { assessments: readonly FoodFraudRow[]; latest: FoodFraudRow | null;
  review_due: boolean }`.
- `CreateFoodFraudInput` + `FoodFraudPersist` (same shape discipline; `risks` is a required array,
  `supply_chain` defaults `[]`).

**5. product-specs:**
- `ProductSpecRow` — GET `.select`: `id, product_name, description, ingredients, allergens,
  allergen_notes, portion_weight_g, storage_temp_c, shelf_life_chilled_days,
  shelf_life_frozen_days, packaging_type, micro_limits, version, reviewed_at, active, created_at,
  updated_at, reviewer, creator`.
- `ProductSpecWithReviewDue = ProductSpecRow & { review_due: boolean }` — the GET maps each row to
  add `review_due = !reviewed_at || reviewed_at < (now − 12 months)`.
- `ProductSpecListResult = { specs: readonly ProductSpecWithReviewDue[]; review_due_count: number }`.
- `CreateProductSpecInput` + `ProductSpecPersist` (the POST insert, defaults per route lines
  83-98; `version || 'V1.0'`, `updated_at = now`).
- `UpdateProductSpecInput` — the PATCH body MINUS `id`. NOTE the dynamic-key nuance: the route
  spreads `...rest` and ONLY sets `allergens` if `'allergens' in body` (lines 120-131). Model the
  update as `{ id: string; updates: Record<string, unknown>; allergensProvided: boolean;
  allergens: string[] | undefined }` OR carry the raw `Record` — pick the shape that lets the
  adapter reproduce "spread rest + conditional allergens + `updated_at = now`" byte-identically.

🗣 **In plain English:** One file naming every field each of the five registers reads and writes,
in the app's own words, so the rest of the code never sees the database's column spelling. Three
fiddly bits are captured precisely: the allergen GET returns `assessment` = newest plus the full
list; the monthly review's reply has a fixed set of summary keys; and the product-spec edit only
touches the `allergens` field if the caller actually sent it.

---

## 7. Port — `lib/ports/HaccpAssessmentsRepository.ts` (full method signatures)

Pure interface; imports domain types only. One method per route read/insert/update, each mapped
to a handler. `now` (the wall clock) is passed in by the service from the route (constraint 8).

```ts
import type {
  AllergenAssessmentListResult,
  AllergenAssessmentPersist,
  MonthlyReviewRow,
  MonthlyReviewDeliveryRow,
  MonthlyReviewPersist,
  FoodDefenceRow,
  FoodDefencePersist,
  FoodFraudRow,
  FoodFraudPersist,
  ProductSpecRow,
  ProductSpecPersist,
} from "@/lib/domain";

export interface HaccpAssessmentsRepository {
  // ── 1. allergen-assessment ───────────────────────────────────
  /** All assessments (assessed_at DESC) + latest. → GET /allergen-assessment. */
  listAllergenAssessments(): Promise<AllergenAssessmentListResult>;
  /** Append a fresh assessment row; returns the inserted row. Never overwrites.
   *  → POST /allergen-assessment. */
  insertAllergenAssessment(
    payload: AllergenAssessmentPersist,
  ): Promise<AllergenAssessmentRow>;

  // ── 2. allergen monthly-reviews ──────────────────────────────
  /** All monthly reviews (period_start DESC). → GET /…/monthly-reviews. */
  listMonthlyReviews(): Promise<readonly MonthlyReviewRow[]>;
  /** Deliveries in [start,end] for aggregation. → POST /…/monthly-reviews. */
  listDeliveriesInRange(
    start: string,
    end: string,
  ): Promise<readonly MonthlyReviewDeliveryRow[]>;
  /** UPSERT on month_year (re-run overwrites the month). Returns the saved row.
   *  → POST /…/monthly-reviews. */
  upsertMonthlyReview(payload: MonthlyReviewPersist): Promise<MonthlyReviewRow>;

  // ── 3. food-defence ──────────────────────────────────────────
  /** All plan versions (created_at DESC). → GET /food-defence. */
  listFoodDefencePlans(): Promise<readonly FoodDefenceRow[]>;
  /** Append a new plan version; returns the inserted row. → POST /food-defence. */
  insertFoodDefencePlan(payload: FoodDefencePersist): Promise<FoodDefenceRow>;

  // ── 4. food-fraud ────────────────────────────────────────────
  /** All assessment versions (created_at DESC). → GET /food-fraud. */
  listFoodFraudAssessments(): Promise<readonly FoodFraudRow[]>;
  /** Append a new assessment version; returns inserted row. → POST /food-fraud. */
  insertFoodFraudAssessment(payload: FoodFraudPersist): Promise<FoodFraudRow>;

  // ── 5. product-specs ─────────────────────────────────────────
  /** Active specs (product_name ASC). → GET /product-specs. */
  listActiveProductSpecs(): Promise<readonly ProductSpecRow[]>;
  /** Insert a new spec; returns the inserted row. → POST /product-specs. */
  insertProductSpec(payload: ProductSpecPersist): Promise<ProductSpecRow>;
  /** In-place UPDATE by id (active:false = soft-delete). Returns updated row.
   *  `updates` already includes updated_at = now and the conditional allergens.
   *  → PATCH /product-specs. */
  updateProductSpec(
    id: string,
    updates: Record<string, unknown>,
  ): Promise<ProductSpecRow>;
}
```

**Boundary discipline:** the adapter maps snake_case → the domain row shapes (carrying the aliased
join keys `assessor`/`updater`/`reviewer`/`preparer`/`approver`/`creator` verbatim) and throws
`ServiceError` on every DB failure. Reads return null/`[]` on miss. **No ConflictError method** —
Cluster B has no 409 path (§3 / R5).

🗣 **In plain English:** Twelve methods, one per thing the five screens do. Each insert/update
returns the saved row because the routes echo it back to the screen. The two "list" reads can't
fail-to-find — they just return an empty list or null. There's deliberately no "duplicate → 409"
method because none of these screens has one today.

---

## 8. Adapter — verbatim `.select()` / insert / upsert / update strings (THE byte-identity anchor)

Copy each EXACTLY as it appears today. The re-point must reproduce these char-for-char.

| Method | Route source | Verbatim detail |
|---|---|---|
| `listAllergenAssessments` | `allergen-assessment/route.ts:24-32` | `.from('haccp_allergen_assessment').select('id, site_status, raw_materials, cross_contam_risk, procedure_notes, assessed_at, next_review_date, assessor:assessed_by(name), updater:updated_by(name)').order('assessed_at', { ascending: false })`. Then `all = data ?? []`, `latest = all[0] ?? null`, return `{ assessment: latest, all_assessments: all }`. |
| `insertAllergenAssessment` | `allergen-assessment/route.ts:71-85` | `.insert({ assessed_by, assessed_at, next_review_date, site_status, raw_materials, cross_contam_risk, procedure_notes, updated_by, updated_at }).select().single()`. Defaults: `raw_materials ?? []`, `cross_contam_risk ?? ''`, `procedure_notes ?? null`. Both timestamps = the SAME `now` ISO. **No 409 path.** |
| `listMonthlyReviews` | `monthly-reviews/route.ts:33-41` | `.from('haccp_allergen_monthly_reviews').select('id, month_year, period_start, period_end, total_deliveries, allergen_detections, category_breakdown, detection_details, site_status, reviewed_at, notes, reviewer:reviewed_by ( name )').order('period_start', { ascending: false })`. |
| `listDeliveriesInRange` | `monthly-reviews/route.ts:74-79` | `.from('haccp_deliveries').select('id, date, supplier, product, product_category, allergens_identified, allergen_notes, batch_number').gte('date', start).lte('date', end).order('date', { ascending: true })`. |
| `upsertMonthlyReview` | `monthly-reviews/route.ts:105-124` | `.upsert({ month_year, period_start, period_end, total_deliveries, allergen_detections, category_breakdown, detection_details, site_status, reviewed_by, reviewed_at, notes }, { onConflict: 'month_year' }).select().single()`. `notes?.trim() || null`; `reviewed_at = now`. |
| `listFoodDefencePlans` | `food-defence/route.ts:20-31` | `.from('haccp_food_defence_plans').select('id, version, issue_date, next_review_date, team, physical_perimeter, physical_internal, cyber_controls, backup_recovery, emergency_contacts, personnel_notes, goods_notes, incident_notes, created_at, preparer:prepared_by ( name ), approver:approved_by ( name ), creator:created_by   ( name )').order('created_at', { ascending: false })`. |
| `insertFoodDefencePlan` | `food-defence/route.ts:67-87` | `.insert({ version (trimmed), issue_date, next_review_date, team/physical_perimeter/physical_internal/cyber_controls/backup_recovery/emergency_contacts (each `Array.isArray(x) ? x : []`), personnel_notes/goods_notes/incident_notes (`?.trim() || null`), prepared_by/approved_by (`|| null`), created_by }).select().single()`. **No 409 path.** |
| `listFoodFraudAssessments` | `food-fraud/route.ts:22-31` | `.from('haccp_food_fraud_assessments').select('id, version, issue_date, next_review_date, risks, supply_chain, mitigation_notes, created_at, preparer:prepared_by ( name ), approver:approved_by ( name ), creator:created_by   ( name )').order('created_at', { ascending: false })`. |
| `insertFoodFraudAssessment` | `food-fraud/route.ts:68-82` | `.insert({ version (trimmed), issue_date, next_review_date, risks, supply_chain (`Array.isArray ? : []`), mitigation_notes (`?.trim() || null`), prepared_by/approved_by (`|| null`), created_by }).select().single()`. **No 409 path.** |
| `listActiveProductSpecs` | `product-specs/route.ts:23-36` | `.from('haccp_product_specs').select('id, product_name, description, ingredients, allergens, allergen_notes, portion_weight_g, storage_temp_c, shelf_life_chilled_days, shelf_life_frozen_days, packaging_type, micro_limits, version, reviewed_at, active, created_at, updated_at, reviewer:reviewed_by ( name ), creator:created_by   ( name )').eq('active', true).order('product_name', { ascending: true })`. |
| `insertProductSpec` | `product-specs/route.ts:80-101` | `.insert({ … defaults per lines 83-98, `version || 'V1.0'`, `updated_at = now`, `created_by = userId` }).select().single()`. **No 409 path.** |
| `updateProductSpec` | `product-specs/route.ts:133-138` | `.update(updates).eq('id', id).select().single()` where `updates = { ...rest, updated_at = now }` and `allergens` set ONLY if `'allergens' in body` (route lines 120-131 — the dynamic-key nuance built in the route, passed to the adapter as the ready `updates` map). **No 409 path.** |

**Construction (F-06 / ADR-0002 template, mirrors `HaccpDailyChecksRepository`):**
`createSupabaseHaccpAssessmentsRepository(client)` factory + `supabaseHaccpAssessmentsRepository`
singleton bound to `supabaseService`.

**Error contract:** reads return null/`[]` on miss; EVERY DB failure throws `ServiceError`
(`@/lib/errors`). **No `23505 → ConflictError`** — Cluster B has no clean 409 path; preserve the
500-on-any-error behaviour (R5).

> **BYTE-IDENTITY NUANCE (the Cluster B difference from Cluster A):** these GET selects use
> **aliased, NON-inner** joins (`assessor:assessed_by(name)`, `reviewer:reviewed_by(name)`, etc.),
> whereas Cluster A used `users!inner(name)`. Consequences the adapter MUST preserve: (a) the JSON
> key is the ALIAS (`assessor`, `updater`, `reviewer`, `preparer`, `approver`, `creator`), not
> `users`; (b) because the join is NOT `!inner`, a row with a null `assessed_by`/`reviewed_by`/etc.
> still returns (the user object is `null`), it is NOT filtered out. Carry the raw aliased shapes
> verbatim. Some routes have inconsistent whitespace inside the join parens (`( name )` vs
> `(name)`) — this does not affect output but copy it verbatim anyway to keep the diff a pure move.

🗣 **In plain English:** The adapter asks the database for the exact same columns, in the exact
same order, with the exact same filters and the exact same "join the user's name" syntax the
routes use now — so when the route swaps its inline call for this adapter, the reply is byte-for-
byte identical. One genuine difference from Cluster A: these screens label the joined name
differently (`assessor`, `reviewer`, …) and keep rows even when nobody is recorded — both
preserved.

---

## 9. Service — `lib/services/HaccpAssessmentsService.ts`

`createHaccpAssessmentsService({ assessments })`. Depends on the port ALONE (no adapter import).
Mostly thin pass-throughs to the port, PLUS the small derived logic the routes do today, with
`now` passed in:

- **read pass-throughs:** `listAllergenAssessments()`, `listMonthlyReviews()`,
  `listFoodDefencePlans()`, `listFoodFraudAssessments()`.
- **`getFoodDefence(now)`** — `listFoodDefencePlans()` then derive `{ plans, latest: plans[0] ??
  null, review_due: latest ? new Date(latest.next_review_date) < now : true }`. (The route computes
  `review_due` inline at `food-defence/route.ts:37` — lift it, take `now`.)
- **`getFoodFraud(now)`** — same shape (`food-fraud/route.ts:37-39`).
- **`getProductSpecs(now)`** — `listActiveProductSpecs()` then map each row to add `review_due =
  !reviewed_at || new Date(reviewed_at) < (now − 12 months)`, and compute `review_due_count`
  (`product-specs/route.ts:40-51`). Take `now`; do the 12-month subtraction from `now`.
- **`runMonthlyReview({ input, userId, now })`** — the aggregation orchestration
  (`monthly-reviews/route.ts:64-136`):
  1. `range = monthDateRange(input.month_year)`; if `null` → return a typed
     `{ ok:false, status:400, message:'Invalid month format — expected YYYY-MM' }`.
  2. `rows = await assessments.listDeliveriesInRange(range.start, range.end)`.
  3. `totalDeliveries = rows.length`; `detections = rows.filter(allergens_identified === true)`;
     `allergenDetections = detections.length`; `categoryBreakdown = buildCategoryBreakdown(rows)`;
     `siteStatus = deriveSiteStatus(totalDeliveries, allergenDetections)`; build
     `detectionDetails` (the `detections.map` at lines 95-102, verbatim keys).
  4. build `MonthlyReviewPersist` (`reviewed_at = now.toISOString()`, `notes?.trim() || null`).
  5. `saved = await assessments.upsertMonthlyReview(persist)`.
  6. return `{ ok:true, result: { review: saved, total_deliveries, detections: allergenDetections,
     site_status: siteStatus, already_existed: false } }`.
  `monthDateRange`/`deriveSiteStatus`/`buildCategoryBreakdown` are IMPORTED from
  `@/lib/allergen/monthlyReviewUtils` (pure module, no copy — see §5 re-home decision).
- **insert builders + pass-throughs:** `buildAllergenAssessmentPersist({ input, userId, now })`,
  `insertAllergenAssessment(persist)`; same `build…Persist` + `insert…` pair for food-defence,
  food-fraud, product-specs. `updateProductSpec(id, updates)` pass-through (the route builds the
  `updates` map with the conditional-allergens nuance + `updated_at` — see §10.5).

**Validation:** Cluster B validation is minimal and lives at the route edge today (e.g.
`allergen-assessment` `if (!site_status || !next_review_date)` → 400; food-defence/food-fraud the
`version/issue_date/next_review_date` required checks; food-fraud `Array.isArray(risks)` → 400;
product-specs `if (!product_name?.trim())` → 400). **Decision: lift these required-field checks into
`validate…` service methods returning `{ ok } | { ok:false, status, message }`** (mirroring
Cluster A's `validate…` cascades) so the exact 400 strings are unit-tested, OR keep them at the
route edge. **Recommendation: lift them** (consistency with Cluster A, gets unit tests, shrinks the
route to "validate → build → insert → reply"). Either is byte-identical; confirm at Render.

🗣 **In plain English:** The service is mostly a thin relay to the database box, plus the two small
"is this review overdue?" calculations and the monthly-review number-crunching — all of which take
"what time is it" as an input instead of reading the clock themselves, so they're testable and
deterministic. The monthly-review date maths is reused from its existing file, not retyped.

---

## 10. Per-route re-point notes (before → after)

For each route: the role gate STAYS; the wall clock (`new Date()`) STAYS at the route edge and is
passed into the service; the response literal is rebuilt in the SAME key order. Drop the
`import { supabaseService }` + `const supabase = supabaseService` from all 5.

### 10.1 — `allergen-assessment/route.ts`
- **GET:** role gate stays → `const result = await haccpAssessmentsService.listAllergenAssessments()`
  → `return NextResponse.json(result)` (already `{ assessment, all_assessments }`).
- **POST:** role/admin gate stays; parse body; `if (!site_status || !next_review_date)` → 400
  (route or `validateAllergenAssessment`); `const row = await
  haccpAssessmentsService.insertAllergenAssessment(haccpAssessmentsService.buildAllergenAssessmentPersist({ input, userId, now: new Date() }))`
  → `return NextResponse.json({ assessment: row }, { status: 201 })`.
- DB error → service throws `ServiceError`; route `try/catch` returns its existing 500 path. NOTE:
  today the `.error` branch returns the raw pg message at 500 and the catch returns `'Server error'`
  at 500. Preserve the catch's `'Server error'` (R5 / same posture as Cluster A R6).

### 10.2 — `allergen-assessment/monthly-reviews/route.ts`
- **GET:** role gate → `const reviews = await haccpAssessmentsService.listMonthlyReviews()` →
  `return NextResponse.json({ reviews })` (route wraps; service returns the array).
- **POST:** admin gate; parse `{ month_year, notes }`; `const r = await
  haccpAssessmentsService.runMonthlyReview({ input, userId, now: new Date() })`; `if (!r.ok) return
  NextResponse.json({ error: r.message }, { status: r.status })`; else `return
  NextResponse.json(r.result, { status: 201 })`. **The whole aggregate-then-upsert moves into the
  service.** The route stops importing `monthlyReviewUtils` directly.
- 🔴 **UPSERT-same-month preserved:** `runMonthlyReview` calls `upsertMonthlyReview` (onConflict
  `month_year`) — re-running a month OVERWRITES it, exactly as today. Pin in an integration test.

### 10.3 — `food-defence/route.ts`
- **GET:** role gate → `const result = await haccpAssessmentsService.getFoodDefence(new Date())` →
  `return NextResponse.json(result)` (`{ plans, latest, review_due }`).
- **POST:** admin gate; the 3 required-field 400s (version/issue_date/next_review_date — route or
  `validateFoodDefence`); `const row = await
  haccpAssessmentsService.insertFoodDefencePlan(haccpAssessmentsService.buildFoodDefencePersist({ input, userId }))`
  → `return NextResponse.json({ plan: row }, { status: 201 })`.

### 10.4 — `food-fraud/route.ts`
- **GET:** role gate → `const result = await haccpAssessmentsService.getFoodFraud(new Date())` →
  `return NextResponse.json(result)` (`{ assessments, latest, review_due }`).
- **POST:** admin gate; the 4 required-field 400s (version/issue_date/next_review_date +
  `Array.isArray(risks)` → `'Risks must be an array'`); `const row = await
  haccpAssessmentsService.insertFoodFraudAssessment(buildFoodFraudPersist({ input, userId }))` →
  `return NextResponse.json({ assessment: row }, { status: 201 })`.

### 10.5 — `product-specs/route.ts`
- **GET:** role gate → `const result = await haccpAssessmentsService.getProductSpecs(new Date())` →
  `return NextResponse.json(result)` (`{ specs, review_due_count }`). The 12-month `review_due` per
  row + the count move into the service.
- **POST:** admin gate; `if (!product_name?.trim())` → 400; `const row = await
  haccpAssessmentsService.insertProductSpec(buildProductSpecPersist({ input, userId, now: new Date() }))`
  → `return NextResponse.json({ spec: row }, { status: 201 })`.
- **PATCH:** admin gate; `const { id, allergens, ...rest } = body`; `if (!id)` → 400 `'ID required'`.
  🔴 **The dynamic-key nuance STAYS at the route edge** (it depends on `'allergens' in body`, which
  only the route sees): build `updates = { ...rest, updated_at: new Date().toISOString() }` and
  `if ('allergens' in body) updates.allergens = Array.isArray(allergens) && allergens.length > 0 ?
  allergens : null` — EXACTLY as today (lines 123-131). Then `const row = await
  haccpAssessmentsService.updateProductSpec(id, updates)` → `return NextResponse.json({ spec: row })`.
  🔴 **Soft-delete = `active:false` in the body** flows through `...rest` into `updates` unchanged —
  do NOT special-case it. Pin both (in-place update; `active:false` soft-delete) in integration tests.

🗣 **In plain English:** Each screen's route shrinks to "check the cookie, grab the clock, ask the
service, send the reply." The two trickiest moves are kept exactly: re-running a monthly review
still overwrites that month, and editing a product spec still only touches the fields you sent
(with deactivate being just an edit that sets `active=false`).

---

## 11. Byte-identity checklist (per route group)

- [ ] **allergen-assessment GET** — `{ assessment: <newest>, all_assessments: [<all desc>] }`;
  `assessor`/`updater` keys present; null when no rows.
- [ ] **allergen-assessment POST** — append-only (old rows untouched); `{ assessment: <row> }`
  201; `site_status`/`next_review_date` 400; both timestamps equal; defaults `[]`/`''`/`null`.
- [ ] **monthly-reviews GET** — `{ reviews: [<period_start desc>] }`; `reviewer` key.
- [ ] **monthly-reviews POST** — bad month → 400 exact string; aggregation counts +
  `category_breakdown` + `detection_details` + `site_status` (`no_deliveries`/`confirmed_nil`/
  `detections_found`) correct; 🔴 re-run same month OVERWRITES (one row, not two); response
  `{ review, total_deliveries, detections, site_status, already_existed:false }` 201.
- [ ] **food-defence GET** — `{ plans, latest, review_due }`; `review_due` true when latest's
  `next_review_date < now` (and true when no plans); 3 aliased name joins.
- [ ] **food-defence POST** — append-only; 3 required-field 400s; arrays defaulted; notes trimmed
  → null; `{ plan } ` 201.
- [ ] **food-fraud GET/POST** — same as food-defence + `Array.isArray(risks)` 400; `{ assessments,
  latest, review_due }` / `{ assessment }` 201.
- [ ] **product-specs GET** — `{ specs, review_due_count }`; only `active:true`; `review_due` per
  row (`!reviewed_at || >12mo`); ordered by `product_name`.
- [ ] **product-specs POST** — `product_name` 400; defaults incl. `version || 'V1.0'`; `{ spec }`
  201.
- [ ] **product-specs PATCH** — 🔴 in-place update by id; 🔴 `active:false` soft-delete; 🔴
  `allergens` only updated if in body; `!id` → 400 `'ID required'`; `{ spec }` 200.
- [ ] **all 5** — GET 401 `'Unauthorised'` for bad role; POST/PATCH 403 `'Admin only'` for
  non-admin/no-user; DB error → 500 (`'Server error'` from the catch).
- [ ] **all 5** — NO `@supabase/*` import, NO `haccp_*` table name remaining in the file.

---

## 12. Hexagonal verdict (Gate 2)

- **Port:** ADDS **one** — `HaccpAssessmentsRepository` (`lib/ports/HaccpAssessmentsRepository.ts`),
  12 methods covering the 5 register groups (read/insert/upsert/update). No existing port changed.
- **Adapter:** ADDS `createSupabaseHaccpAssessmentsRepository` (the only `@supabase/*` importer for
  these 5 tables) + a Fake repo (tests). Both under `lib/adapters/{supabase,fake}/**` — already
  ESLint-allow-listed; no `.eslintrc.json` change.
- **New dependencies:** **NONE.** New files import only already-wrapped `@supabase/supabase-js`
  (inside the adapter tree), `@/lib/errors`, `@/lib/observability/log`, and the pure vendor-free
  `@/lib/allergen/monthlyReviewUtils`. `package.json` untouched.
- **Single-use vendor wrap:** N/A — no new vendor; Supabase already wrapped.
- **Rip-out test:** **PASS (fully realised in this PR).** Before: the 5 routes each imported
  `supabaseService` directly (rip-out cost = "5 route files + adapter"). After: the routes depend
  ONLY on the `haccpAssessmentsService` singleton from `lib/wiring/haccp.ts`; swapping the DB
  vendor for Cluster B = ONE new adapter + ONE wiring line, nothing in `app/**` changes.

**Verdict line:** Port: **1 new** (`HaccpAssessmentsRepository`). Adapter: **1 new**
(`SupabaseHaccpAssessmentsRepository`; Fake for tests). New deps: **0**. Rip-out: **PASS**.
**Gate 2: PASS — no blocker.**

🗣 **In plain English:** One clean new socket, one Supabase plug, zero new vendors, and "rip out
the database = one adapter swap + one wiring line" holds. Green Gate-2 verdict.

---

## 13. Risk Assessment (mandatory)

**Headline: NO must-fix risks. No Gate-2 blocker.** This is a live byte-identical re-point; the
risk surface is behaviour drift, and every sharp edge is pinned by a unit + integration test.

| # | Category | Severity | Finding | Mitigation | Must-fix? |
|---|---|---|---|---|---|
| **R1** | **Business-logic / byte-identity (THREE persistence models in one cluster)** | **MEDIUM** | append-only (3 routes) vs UPSERT-same-month (monthly-reviews) vs in-place-update + soft-delete (product-specs). A "tidy-up" that turns the upsert into an insert (double rows per month) or the in-place update into an append (lost edit / orphan rows), or that flips the product-spec dynamic-allergens nuance, silently changes stored data. | Each model is its OWN port method (`upsertMonthlyReview` with `onConflict:'month_year'`; `updateProductSpec(id, updates)`; the `insert…` family). §8 pins each verbatim; §11 byte-identity checklist + dedicated integration tests (re-run-same-month = one row; PATCH = in-place; `active:false` = soft-delete; allergens-only-if-in-body). | No (mitigated by per-method modelling + tests; this is the unit's central discipline) |
| R2 | **Business-logic (review_due determinism)** | LOW | `review_due` (food-defence/food-fraud `next_review_date < now`; product-specs `reviewed_at null || >12mo`) computed in the service. If the service reaches for `new Date()` instead of the injected `now`, tests become time-flaky and a TZ edge could differ. | Constraint 8: `now` is a parameter; service never calls `new Date()`. Unit tests pass a fixed `now` and assert both sides of each boundary (12-month edge, past/future review date). | No |
| R3 | **Business-logic (aliased non-inner joins)** | LOW | Cluster B GET joins are aliased + NON-inner (`assessor:assessed_by(name)`), unlike Cluster A's `users!inner(name)`. If the adapter copies the Cluster A `!inner` pattern, rows with a null `assessed_by`/`reviewed_by` would be FILTERED OUT (silently dropping history) and the JSON key would change to `users`. | §8 nuance box pins the exact aliased non-inner strings + the null-user-still-returned behaviour. Verbatim-select smoke test asserts the exact string per method; integration test includes a row with a null user-ref and asserts it still returns with `assessor:null`. | No |
| R4 | **Security** | LOW | Service-role (RLS-bypass) wiring — same access the routes have today; no new exposure. Per-caller RLS deferred to F-RLS-04h. The admin-only POST/PATCH gate + the warehouse/butcher/admin GET gate STAY in every route. | Wiring header cites the deferral (mirrors Cluster A); wiring test asserts NO `…ForCaller`. Role gates unchanged in the routes. | No |
| R5 | **Error-body drift on DB-failure 500s** | LOW | Cluster B has NO 409 path — every DB error today returns 500 (raw pg message via `.error` branch, or `'Server error'` via the catch). The service throws `ServiceError`; the route catch returns `'Server error'`, so a DB-error 500 body shifts from a pg string to `'Server error'`. | Same accepted posture as Cluster A R6 / F-18 R3: the front-end does not display these 500 bodies (already inconsistent). Preserve the catch's `'Server error'`; flag to Gate 3 for a one-line decision. **No ConflictError mapping added** (none exists today). | No |
| R6 | **Concurrency / race (monthly-review upsert)** | LOW | Two admins running the SAME month concurrently both upsert on `month_year` — the unique key serialises them; last write wins (a re-run overwrite, which is the intended semantics). No lost-update beyond the documented overwrite. Product-spec PATCH is last-write-wins on the whole row (pre-existing). | No change from today (frozen, ADR-0003 diff-only). Documented; the upsert key prevents duplicate-month rows. | No |
| R7 | **Data migration** | NONE | No schema/SQL/RLS change. `supabase/migrations/` untouched. | n/a | No |
| R8 | **Launch blocker** | NONE | Live behaviour change but byte-identical; 5 admin-register screens (lower traffic than daily checks). Gates: full integration + pgTAP regression + E2E `@critical` + preview smoke before merge. | §14 matrix; Gate-4 preview smoke. | No |
| R9 | **Scope creep (F-PROD-01 draft/published)** | NONE | Temptation to add a draft/published state for the allergen assessment (F-PROD-01). That is a schema change → banned by constraint #2; explicitly OUT OF SCOPE (§2). | §2 states it deferred/display-only; no `version`/`status` column added. | No |

🗣 **In plain English:** Nothing here can force a redesign or block the gate. The one real job is
precision: three different "save" behaviours live in this cluster, and the plan gives each its own
clearly-named method so the move can't accidentally swap one for another. The two date checks take
the clock as an input so they're testable, and the slightly different "join the name" syntax is
copied exactly so no history rows vanish. No must-fix risk.

---

## 14. Test plan / ANVIL matrix

**Unit (NEW — fast, fake DB, no Docker):**
- `HaccpAssessmentsService.test.ts` — `review_due` predicates (both sides of the 12-month edge +
  past/future review dates with a fixed `now`); the monthly-review aggregation (`no_deliveries` /
  `confirmed_nil` / `detections_found`, category breakdown, detection-details shape) via
  `runMonthlyReview` against the Fake; the bad-month 400 string; read/insert/upsert/update
  delegation; the product-specs `review_due_count`; (if validation is lifted) every required-field
  400 string verbatim.
- `adapters/supabase/HaccpAssessmentsRepository.test.ts` — row→domain mapping per method;
  **verbatim-select smoke** (assert each exact column/join string — the byte-identity pin, incl.
  the aliased non-inner joins); null/`[]`-on-miss; `ServiceError` on DB error; the upsert passes
  `{ onConflict:'month_year' }`; the update passes `updates` + `.eq('id', id)` unchanged.
- `wiring/haccpAssessments.test.ts` — the singleton constructs + exposes the full surface; asserts
  service-role wiring ONLY (no `…ForCaller`).
- **Regression:** `tests/unit/allergenMonthlyReview.test.ts` (existing) + `allergenAssessment.test.ts`
  + `allergenCheck.test.ts` MUST stay green — the re-home keeps `monthlyReviewUtils` as the source.

**Integration (NEW — `tests/integration/haccpAssessments.test.ts`, real local Supabase):** boots
the dev server against local Supabase (`.env.test.local` invariant + sentinel probe). Per route
group, assert wire shape + status + DB writes byte-identical:
- allergen-assessment: GET `{assessment, all_assessments}` (newest first; null when empty); POST
  append-only (insert N, assert N+1 rows, latest = newest); `site_status`/`next_review_date` 400;
  401 bad role; 403 non-admin.
- monthly-reviews: GET `{reviews}`; POST aggregation correctness for each site_status; 🔴 **re-run
  same month → ONE row (overwrite), not two**; bad-month 400; 403 non-admin.
- food-defence + food-fraud: GET `{plans/assessments, latest, review_due}` incl. `review_due`
  true/false boundary + null-user-ref row still returned with `creator:null` (R3 pin); POST
  append-only + required-field 400s; food-fraud `risks` array 400.
- product-specs: GET `{specs, review_due_count}` (active-only, `review_due` per row); POST
  `product_name` 400; 🔴 **PATCH in-place update** (same id, row count unchanged, field changed);
  🔴 **`active:false` soft-delete** (row disappears from the active GET); 🔴 **allergens updated
  only when in body** (PATCH without allergens leaves them; with `[]` sets null); `!id` 400.

**pgTAP (REGRESSION only):** no migration, no new policy → run the existing pgTAP suite green to
prove the RLS/policy surface is unchanged. State explicitly to ANVIL: NO new pgTAP (no schema/
policy change).

**E2E `@critical` (NEW live Cluster B paths) — EXHAUSTIVE browser-tap across all 5 screens**
(per Hakan's "100% tap/button confidence on critical HACCP sections" standard, matching the 7
Cluster A specs added in PR2): one `@critical` spec per screen exercising every form/button:
- `app/haccp/allergens/page.tsx` — both the allergen-assessment form AND the monthly-review run
  button (the two routes share this page); assert the history list renders, a new assessment
  appears, a monthly review runs + re-runs (overwrite).
- `app/haccp/food-defence/page.tsx` — create a new plan version; `review_due` banner; version list.
- `app/haccp/food-fraud/page.tsx` — create a new assessment version; `review_due`; risks array.
- `app/haccp/product-specs/page.tsx` — create a spec; edit it in place; deactivate it (soft-delete
  disappears from the active list); `review_due` count.
- Plus home-nav reachability. Run against the PR's Supabase preview branch at Gate 4
  (`npm run test:e2e:preview`), production-build preview (`--unprotected`, DB-identity probes).

**Full prod build:** `next build` clean; `npm run typecheck` 0; `next lint` 0;
`tests/unit/lint/no-adapter-imports.test.ts` green; `npm run test:integration` green.

🗣 **In plain English:** Fast fake-database unit tests pin every rule and the exact database
columns. Real-database integration tests re-create each of the five screens' saves and check the
stored rows + JSON replies match exactly — with dedicated tests for the three trick behaviours
(monthly re-run overwrites, product-spec edits in place, deactivate hides the row). Then full
browser click-through on all five screens on a production-build preview, because HACCP is the
section Hakan wants bullet-proof. pgTAP just re-confirms nothing about the database locks moved.

---

## 15. Step-by-step build sequence (executable blind)

1. **Branch** off `main` (e.g. `f19-pr3-cluster-b-assessments-registers`).
2. `lib/domain/HaccpAssessment.ts` — the row + input + persist types (§6). Pure TS.
3. `lib/ports/HaccpAssessmentsRepository.ts` — the 12-method interface (§7).
4. `lib/adapters/fake/HaccpAssessmentsRepository.ts` — in-memory impl (record inserts/upserts/
   updates; return canned rows) for unit tests.
5. `lib/services/HaccpAssessmentsService.ts` — `createHaccpAssessmentsService(deps)`; the
   pass-throughs + `getFoodDefence`/`getFoodFraud`/`getProductSpecs`/`runMonthlyReview` (take
   `now`) + the `build…Persist` builders (+ optional `validate…`); import `monthlyReviewUtils` (§9).
6. `lib/adapters/supabase/HaccpAssessmentsRepository.ts` — verbatim selects/insert/upsert/update
   (§8); factory + service-role singleton; ONLY `@supabase/*` importer for the 5 tables.
7. **Barrel edits (4, additive):** domain, ports, services, supabase + fake adapter indexes.
8. **Wiring:** add `haccpAssessmentsService` singleton to `lib/wiring/haccp.ts` (service-role only;
   no `…ForCaller`).
9. **Write the 3 unit tests** (§14). Run `npm run test:unit` → green (incl. existing allergen tests).
10. **Re-point the 5 routes** (§10), simplest first: food-defence + food-fraud (near-identical
    append-only), then allergen-assessment, then product-specs (PATCH nuance), then monthly-reviews
    (aggregation moves into the service; route stops importing `monthlyReviewUtils`). For each:
    swap `import { supabaseService }` for the wiring singleton; delete the `const supabase` line;
    rewrite GET + POST(+PATCH); keep the role gate + `new Date()` at the edge + response key order.
11. After each route: confirm NO `@supabase/*` import and NO `haccp_*` table name remains.
12. **Write `tests/integration/haccpAssessments.test.ts`** (§14) — boot local Supabase
    (`npm run db:up`, `npm run db:reset`). Run `npm run test:integration` → green.
13. **Add the 5 E2E `@critical` browser specs** (§14) per the repo's Playwright convention.
14. **Full bar:** `npm run test:unit` (regression green), `npm run typecheck` 0, `next lint` 0,
    `no-adapter-imports` lint test green, `next build` clean, pgTAP regression green.
15. **Grep-confirm:** `grep -rl "@/lib/adapters/supabase/client\|from('haccp\|from(\"haccp"
    app/api/haccp/allergen-assessment app/api/haccp/food-defence app/api/haccp/food-fraud
    app/api/haccp/product-specs` returns nothing (all 5 routes dropped the direct import + table
    calls).

🗣 **In plain English:** Build inside-out (types → socket → fake → brain → real Supabase plug →
export lists → wiring), prove the machine with fast tests, then rewire the five screens easiest-
first, then prove the live paths with real-database + browser tests and a clean production build.

---

## 16. ADR check

- **ADR-0002 (hexagonal shape + naming)** — GOVERNING, honoured: domain/port import nothing
  inward-violating; the Supabase adapter is the sole `@supabase/*` importer for these 5 tables;
  the service depends on the port (+ a pure util) only and exports a factory; wiring is the only
  adapter-importing business file; routes call the wiring singleton, never the adapter/vendor. No
  vendor type leaks past the adapter. **No conflict.**
- **ADR-0003 (strangler-fig + FREEZE)** — followed: diff-only review scope; pre-existing
  500-on-any-error + upsert/in-place semantics frozen; the re-point is behaviour-preserving.
- **ADR-0004 / ADR-0007 (RLS mechanism / token-GUC bridge)** — out of scope, correctly deferred to
  F-RLS-04h (Cluster G). Service-role singleton only; no per-caller client. No conflict.
- **ADR-0005 (raw-fetch Per-Site Map)** — NO conflict, NO inheritance: the Per-Site Map assigns no
  `app/api/haccp/**` route (HACCP already uses `supabaseService`, never raw `fetch`).
- **ADR-0006 (per-PR Supabase preview branches)** — the Gate-4 `@critical` preview smoke runs
  against this PR's preview branch.

**No ADR conflicts.**

---

## 17. Acceptance criteria

- 8 new files + 4 additive barrel edits + 1 wiring line + 5 re-pointed routes; `monthlyReviewUtils`
  re-homed (route stops importing it directly; util file + its test unchanged). NO migration, NO
  `package.json`, NO `.eslintrc.json`, NO UI page edit.
- NO route imports `@supabase/*` or names a `haccp_*` table after the PR (grep-proven).
- ONE port (`HaccpAssessmentsRepository`) + ONE Supabase adapter + ONE Fake adapter; ONE aggregate
  service. Verbatim selects/insert/upsert/update from §8 reproduced char-for-char (incl. the
  aliased non-inner joins).
- `npm run test:unit` green incl. the 3 new files + the existing allergen tests; NEW
  `tests/integration/haccpAssessments.test.ts` green incl. the upsert-overwrite, in-place-update,
  `active:false` soft-delete, allergens-only-if-in-body, and null-user-ref-still-returned pins;
  pgTAP regression green; 5 E2E `@critical` browser specs green on the production-build preview;
  `next build` / `typecheck` 0 / `next lint` 0; `no-adapter-imports` lint test green.
- Every GET response shape (keys + order + values), POST/PATCH effect + status + error string, and
  role-gate byte-identical to pre-PR.
- Wiring exports service-role singleton ONLY (no `…ForCaller`).
- Rip-out test PASS; no new dependency; one port + one adapter added.
- Gate-4 preview smoke green against the PR's Supabase preview branch.
- F-PROD-01 draft/published explicitly NOT built (no schema change); display-only history
  preserved byte-identically.
