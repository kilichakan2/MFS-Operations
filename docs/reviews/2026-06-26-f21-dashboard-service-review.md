# Code-critic review — F-21 Dashboard split into DashboardService (PR #84)

**Date:** 2026-06-26
**Branch:** `feat/f21-dashboard-service` (base `main` @ `c09036f`)
**Phase:** FORGE Guard (review of record)
**Verdict:** ✅ **NO BLOCKERS — hand to ANVIL**

> Caveat: the code-critic subagent's sandbox denied command execution this session, so
> `tsc` / `eslint` / the unit suite were **not run** by the critic — everything below is
> static review. ANVIL executes all suites for the green confirmation.

---

## Scope reviewed
Behaviour-preserving hexagonal re-point of two admin routes off raw Supabase onto owned seams:
- `app/api/dashboard/route.ts` (GET) → new `DashboardService` (composes 5 ports, owns ALL aggregation).
- `app/api/detail/discrepancy/route.ts` (GET) → new `DiscrepanciesRepository.findDetailById` (was raw `fetch`).

New seams: `DiscrepanciesRepository` (port + supabase adapter + Fake + `__contracts__` contract + `lib/wiring/discrepancies.ts`); `DashboardService` (`lib/services/`) + `lib/wiring/dashboard.ts`.
Extended: `ComplaintsRepository` (+`listOpenOlderThan`, +`listTodayWithNames`, +`listWeekRollup`); `VisitsRepository` (+`listTodayForDashboard`, +`listWeekForDashboard`, +`listAtRiskSince`).
Reused as-is: `VisitsRepository.listCommitments`/`listProspects`, `OrdersRepository.listOrders`, `PricingRepository.listAgreements`.

---

## The four required confirmations

### R1 (the trap) — CONFIRMED SAFE ✅
`lib/adapters/supabase/VisitsRepository.ts` `listAtRiskSince(from)` is **gte-only, no `.lte()`** —
`.in('outcome',['at_risk','lost']).gte('created_at', from).order('created_at',{ascending:false})`,
same `AT_RISK_COLS` as the original. Byte-identical to the original unbounded at-risk query
(dashboard route lines 69–74). `listAtRisk` (gte+lte) was NOT reused. Inclusion behaviour pinned
by `tests/unit/services/DashboardService.test.ts:184-195` (a today-window at_risk visit IS included).

### R4 (recorded deviation) — CONFIRMED COSMETIC ✅
Detail-route 500 body changes `{error:'DB error'}` → `{error:'Server error'}`; **HTTP status unchanged (500)**.
Only consumer traced: `components/DetailModal.tsx:232-233` reads `res.status`, never the body `error`
string. Drift invisible to the frontend; matches every other re-pointed route's 500. Pinned by
`tests/unit/api/detail-discrepancy.route.test.ts:141-146`. Approved deviation — not a finding.

### Hexagonal fences — ALL HELD ✅ (rip-out test PASSES)
- Both routes import only `next/server` + their wiring singleton — **zero** `@/lib/adapters/*`, zero `@supabase/*`.
- `lib/domain/**`, `lib/ports/**` — no adapter/vendor imports.
- `@supabase/supabase-js` only in `lib/adapters/supabase/DiscrepanciesRepository.ts`.
- `DashboardService` exports `createDashboardService` factory only; singletons live in `lib/wiring/`.
- Vendor nested-join rows mapped to owned domain types via the adapter's `one<T>()` coercion — no PostgREST shape leaks.
- Rip-out: swap the DB vendor = one new adapter folder + two `lib/wiring/*.ts` lines.
- Shipped `.eslintrc.json` rule (pinned by `no-adapter-imports.test.ts`) already covers the new surfaces.

### Determinism — CONFIRMED ✅
`DashboardService` never calls bare `new Date()`; `now` injected via `load({now, window})`; route reads
the clock once (`dashboard/route.ts:38`) and passes it in. Pinned by `DashboardService.test.ts:337-342`.

---

## Byte-identity audit (adversarial, field-by-field) — ALL IDENTICAL
All 12 queries + every rollup diffed original-inline vs moved-service. Verified equal:
- Null/default coercions: `category ?? '' / ?? 'other'`, `?? 'Unknown'`, `pipeline_status ?? 'Logged'`,
  `outcome ?? 'neutral'`, `visit_type ?? 'routine'`, `prospect_name ?? 'Prospect'`, `detail ?? ''`, `unit ?? ''`, `note ?? null`.
- Quantity coercion: `ordered_qty != null ? Number(...) : null` → adapter `num()` helper, identical.
- Sort/slice: reason rollup `sort(b.count-a.count)`; product top-5 `sort().slice(0,5)`; category sort — verbatim.
- Date-window math: `ago48h/ago24h/ago7d` identical; `londonToday(now)` for pricing-expiry (`< todayStr`, strict)
  and orders-today. `< not <=` boundary pinned (`DashboardService.test.ts:318-325`).
- Select columns: every new adapter method copies the route's `.select()` verbatim into a named constant,
  same `.limit(50)`, `.order(...)`, `.gte/.lte/.lt`.
- Response key-set: all 19 top-level keys in order; nested shapes (`visitsToday[].visits[]` 6 keys,
  `weekVisitsByRep[].types` 4 seed keys, `ordersToday` 4, `hunterFarmer` 2) preserved.
- `hunterFarmer` predicate: `existing = customerId != null || prospectName == null`; `prospects = prospectName != null`.

---

## Depth verdicts
- `lib/services/DashboardService.ts` → **DEEP** — deletion test: ~220 lines of fan-out + 8 rollups/tallies fall
  back into the route if removed. Concentrates complexity behind a one-method `load` interface. Load-bearing.
- `lib/ports/DiscrepanciesRepository.ts` (+supabase adapter +Fake) → **REAL SEAM, not speculative** — three methods
  each map 1:1 to a live route op (`listToday`, `listWeekRollup`, `findDetailById`); each hides column mapping,
  join coercion, error translation, RAW-reason boundary. Fake is a second real implementation.
- `VisitsRepository`/`ComplaintsRepository` extensions → real read methods hiding a verbatim select + join mapping.
No PASS-THROUGH or SPECULATIVE SEAM introduced. No architecture blocker.

---

## Test quality (Pocock standard) — STRONG
Field-level, behaviour-pinning; would FAIL on aggregation drift:
- `DashboardService.test.ts` — frozen clock, seeded Fakes; exact 19-key set, `hoursAgo` to the digit,
  R1 inclusion, transforms, outcome distribution, drill-down key-set+values, reason rollup order + product top-5,
  category rollup, `avgResolutionHours` (`ms>0` guard + null-when-none), hunter/farmer, pricing `==today` boundary,
  orders tally, determinism.
- `dashboard.route.test.ts` — 401 guard, 19-key pass-through, from/to default parse, single-`now` injection, 500 path.
- `detail-discrepancy.route.test.ts` — 401, 400, 404-on-null, exact key-set, fallbacks, R4 500-body.
- `DiscrepanciesRepository.contract.ts` — adapter-agnostic, RAW-reason-carry + null-on-miss cases.

---

## Non-blocking findings
- 🟢 `tests/unit/api/detail-discrepancy.route.test.ts:13` — docstring says "11-key"; the assertion (and response)
  is **12 keys**. Assertion correct; comment miscounts. Cosmetic.
- 🔵 `lib/adapters/fake/DiscrepanciesRepository.ts` `byNewestThenId` — secondary id tie-break the real
  `.order('created_at',desc)` doesn't have (Postgres leaves equal-`created_at` unspecified). Fake-only test-stability
  aid; real ordering checked by contract/integration. No action.
- 🔵 R3 (pre-declared in plan) — `listOrders({deliveryDate})` + `listAgreements({})` fetch full rows where the
  dashboard reads only `state` / `id,status,validUntil`. Output byte-identical, marginally heavier per request.
  Acceptable for a low-frequency admin read; lean methods are a future perf follow-up.

---

## Boundaries confirmed honored
NO migration · NO RLS/policy change · NO new `package.json` dependency · NO UI change
(`app/dashboard/admin/page.tsx` untouched) · guards verbatim (`x-mfs-user-id` → 401 on both routes).

## Test/lint/tsc results
**NOT RUN by the critic this session** (sandbox denied execution). Static review found no visible type errors,
new code respects the shipped lint guard, test files well-formed. **ANVIL must execute:** `tsc --noEmit`, `eslint`,
full unit suite, the Supabase integration contract for `DiscrepanciesRepository` + new windowed Visits/Complaints
methods, and the `@critical` preview smoke.
