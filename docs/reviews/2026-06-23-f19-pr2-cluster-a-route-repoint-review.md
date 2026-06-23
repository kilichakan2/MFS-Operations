# Code Review — F-19 PR2 — Cluster A HACCP route re-point

> Date: 2026-06-23 · Reviewer: code-critic (FORGE Phase 4 — Guard)
> PR #69 · Branch `feat/f19-pr2-cluster-a-route-repoint` · diff vs `main` @ `e357657`
> 9 files changed, +329 / −1880.

## VERDICT: No blockers — hand to ANVIL.

Every one of the 9 routes is a faithful re-point onto the PR1 hexagon. Behaviour matches the
old inline code, the W2 allergen trap is closed, no vendor SDK leaks back into the routes, and
the full unit suite + typecheck + lint are green. No loop-back. Next gate is ANVIL's
integration/E2E ladder (the right place to prove byte-identical wire output against a real DB).

## W2 verdict — allergen gate INTACT (yes)

Allergen-only delivery (temp fine, contamination "no") records the issue but files ZERO
corrective-action rows — confirmed.

- `lib/services/HaccpDailyChecksService.ts:970-972` — `buildDeliveryCorrectiveActions` early-returns
  `[]` when `!hasDeviationTemp && !hasDeviationContam`, **before** the allergen push at line 1015.
  Byte-identical to the original route's `if (hasDeviationTemp || hasDeviationContam)` wrapper.
- `app/api/haccp/delivery/route.ts` calls the builder and adds NO allergen-CA logic of its own.
- `corrective_action_required:true` still set on the delivery row (`built.persist.corrective_action_required`)
  while the CA fan-out stays empty — the old divergence, intentionally preserved.

## Per-route byte-identity (spot-check) — all match

- **delivery** — supplier resolution, `tempStatus`, validation, `next_number` (GET), batch-number
  derivation, ConflictError→409, response key-order all delegated/preserved. ✅
- **cold-storage** (`:60-95`) — status-code precedence preserved exactly: missing-fields 400 →
  today-only 400 → units-empty 500 → unit-unknown 400 → CA. ✅ (note N1: double `buildColdStorage`
  call, correctness-neutral.)
- **calibration** — certified vs manual dispatch, `done_this_month`/`this_month_count` aggregation
  kept route-side, `ice_pass`/`boil_pass`/`any_fail` derived from `built`. ✅
- **cleaning** — validate → insert → CA, `ca_write_failed` echoed. ✅
- **process-room** — temps vs diary dispatch, interpolated 409 strings now in service/adapter;
  diary CA rows carry `null` disposition/recurrence. ✅
- **mince-prep** — kill-date hard-fail 400 still carries `kill_date_hard_fail` + `days_from_kill`
  (`:402-407`); meatprep `has_deviation` INCLUDES `allergenLabelIssue` (`:608-610`) while CA write
  gates on temperature only (`buildMeatPrepCorrectiveActions` service `:1701`); timesep writes NO
  CA row (`:653-656`). ✅
- **corrective-actions GET / [id] PATCH** — joined selects + sign-off moved to service; admin gate
  + `!id` guard kept route-side. ✅

## Heterogeneity preserved (all four)

- product-return: CA on EVERY post (`:~70`). ✅
- process-room diary: `null` disposition + `null` recurrence. ✅
- timesep: NO CA row (`mince-prep/route.ts:653`). ✅
- meatprep: deviation flag allergen-inclusive (`:608-610`), CA gate temp-only (service `:1701`). ✅

## Soft-fail contract — verified

- Every POST inserts the primary row before calling `submitHaccpDailyCheck.fileCorrectiveActions(...)`.
- `tests/unit/usecases/submitHaccpDailyCheck.test.ts`: happy → `ca_write_failed:false`; CA failure →
  `ca_write_failed:true` and does NOT throw; empty batch → no-op. Green.

## Hexagonal / boundary — clean

- Routes import only the 3 singletons from `@/lib/wiring/haccp` + `ConflictError` + domain types.
- No `@supabase/*`, no `supabaseService`, no `.from('haccp_*')` in any of the 9 routes. ✅
- No `package.json` entry, no migration, no `lib/` edit. ✅
- No `…ForCaller` added (F-RLS-04h owns that). ✅
- Rip-out test now fully realised: HACCP DB swap = one adapter + one wiring line; routes unchanged.

## Depth verdicts

Deep modules built in PR1, not in this diff (out of scope). All 9 route files → **route-edge glue
(PASS)** — keep route-local concerns (cookie role gate, param parse, response key-order, kill-date
arithmetic), delegate logic to deep services. Deletion test passes correctly: −1880/+329, logic
concentrated in PR1's services. No PASS-THROUGH or SPECULATIVE SEAM introduced.

## Findings

- 🔵 `app/api/haccp/mince-prep/route.ts:105,145` — literal table names `'haccp_mince_log'` /
  `'haccp_meatprep_log'` passed as string args into `countMinceRuns(table, date)`. PR1
  service-signature decision (no SDK, no `.from()` leak), but a DB table identifier surfaces in
  the route as a magic string. Cleaner: take a form enum and map to the table in the adapter.
  Not introduced by this diff — candidate for a future F-TD- tidy. NOT blocking.
- 🟢 Test quality — behaviour tested at the service/use-case seam through public methods incl.
  error/soft-fail modes; correct distribution for a re-point. Route-level byte-identity left to ANVIL.
- 🟡 — none.
- 🔴 — none.

## R6 (GET/PATCH 500 body) — acceptable as-is

`corrective-actions/route.ts:33` + `[id]/route.ts:38` return `{ error: 'Server error' }` on DB
failure (services throw `ServiceError`, catch swallows) instead of the old raw pg message. Matches
accepted F-18 R3 posture; strictly better security-wise (no raw Postgres detail leaked to the
admin client). Status code (500) unchanged. AGREED acceptable.

## Test / lint / typecheck

- Unit: `npm test` → **2167 / 2167 passed (134 files)**, 0 failures.
- Typecheck: `tsc --noEmit` → clean, 0 errors.
- Lint: `next lint` → 0 warnings/errors.
- Integration / DB / E2E: not run (ANVIL's job).

## Open item for ANVIL

Prove actual byte-identical wire output + DB writes for each of the 9 routes against the real
Supabase schema — especially the cold-storage status-code precedence chain and the mince
kill-date hard-fail extra keys (unit tests cover the service seam, not the full HTTP round-trip).

## Housekeeping

Project script is `npm test` (vitest run); there is no `npm run test:unit`.
