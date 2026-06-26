# Code-critic review — F-20 Admin PR3/3 (Import + Map hexagonal re-point)

**Date:** 2026-06-26
**Branch:** `feat/f20-pr3-import-map` (reviewed local, pre-push)
**Plan:** `docs/plans/2026-06-26-f20-pr3-import-map.md`
**Reviewer:** code-critic subagent (FORGE Guard — sole review authority for this diff)

---

## VERDICT: CLEAR — no blockers, hand to ANVIL

A clean, faithful re-point. The three routes now reach the database only through owned
ports/services; behaviour is preserved exactly except the two Gate-1-approved deviations;
every load-bearing safety point is correct in code and (after the follow-up test below)
pinned by a test.

---

## What was run (code-critic's own results)

- Affected unit tests (3 route + 3 service + 4 fake-adapter/contract + lint pin): **127/127 pass**
- Full unit suite: **2512/2512 pass** (165 files) — no regression
- `tsc --noEmit`: clean (exit 0)
- ESLint on all 9 changed/new files: clean (exit 0)
- Lint pin `tests/unit/lint/no-adapter-imports.test.ts`: **green**
- Boundary grep on the 3 routes for `lib/adapters` / `@supabase` / `SUPA_` / `supabaseService` / `rest/v1`: **zero hits**
- Integration suite (real Supabase contract tests): NOT run (read-only session, no live local Supabase). Implementer reports 489 green incl. 25 new adapter tests; contract wiring verified by inspection. Not blocking — flagged un-run per rubric; ANVIL runs it.

## 🔴 Blockers
None.

## 🟡 Warnings (should-fix)
None.

## 🔵 Architecture / observability notes (follow-up, not actioned)

- **Benign double-log on non-23505 insert error.** `lib/adapters/supabase/CustomersRepository.ts:251`
  and `lib/adapters/supabase/ProductsRepository.ts:~170` `log.error` the failure, and the route
  (`app/api/admin/import/manual/route.ts:~85`) then `console.error`s it too. One log line became two.
  Counts/response unchanged. Leave or drop the adapter-side `log.error` for `insertOne` in a future tidy.
- **Map types routed through the ports barrel.** `lib/ports/index.ts:18` / `CustomersRepository.ts:29` /
  `VisitsRepository.ts:43` type-import `MapCustomer`/`MapVisit` from `lib/services/mapScene.ts`; the ports
  barrel re-exports them so `MapDataService` depends on the port, not another service (F-TD-05 fence fix).
  `mapScene.ts` imports only MapProvider port types — no vendor/framework/JSX — so type-only, zero runtime
  change, locked route re-export intact, lint pin green. Correct mechanical fix, NOT design drift.

## 🟢 Test-quality notes

- **GAP (actioned as a follow-up commit): `import/confirm` had no R-AUDIT test.** `import/manual` pins
  "an audit `record()` rejection does NOT change the 201" (`tests/unit/api/import-manual.route.test.ts:171`);
  the confirm route code is correct (`.catch(e => console.error(...))` on `auditLog.record(...)`) but was
  not pinned. Added: `auditRecord.mockRejectedValue(...)` → assert 201, closing symmetry with manual.
- W1 swallow well-covered on confirm: thrown `GeocoderError` (test ~194) and `setCoords` rejection (~205)
  each leave 201 intact; `trim()/toUpperCase()` keying (~175); 5s road-time `setTimeout` (~218). R-COUNT
  mapping fully pinned on manual (~95). Public-route tests via `Object.keys(body).sort()` — right shape.

## Load-bearing correctness points (all PASS)

1. **R-AUDIT** — both routes `await auditLog.record(...).catch(log)`; thrown audit error can't turn 201→500. ✅
2. **W1 fire-and-forget** — confirm geocode helper relies on call-site `.catch(() => {})`; `GeocoderError` or
   `setCoords` `ServiceError` swallowed, 201 preserved; did NOT copy geocode-all's 500; exact→outcode fully
   delegated to `geocoder.geocodeMany` (keyed `trim().toUpperCase()`); `is_approximate_location = coords.approximate`. ✅
3. **insertOne typed result** — `InsertOneResult` never throws on 23505; manual reproduces counts +
   `console.error`-on-non-23505. ✅ byte-verified vs `main`.
4. **import/confirm bulk** — all-or-nothing (`insertMany` throws → 500 `'Server error'`); customers returns
   `{id,postcode}[]`; `skipped = validRows.length - inserted` in the route. ✅
5. **5s road-time `setTimeout`** — byte-identical (iterates same rows); internal fetch to `/api/routes/compute-road-times`. ✅
6. **map/data deviation** — read failure → repo throws → route 500 `'Server error'` (Gate-1 approved);
   confirm 500 body generic, no raw PostgREST leak. ✅
7. **Plan deviation (Map types via ports barrel)** — type-only, locked re-export preserved, lint pin green. ✅

## Depth verdicts (new/touched modules)

- `AuditLogRepository` (port + supabase adapter + wiring) → **DEEP** — one-method `record` hiding
  domain→column mapping, vendor-error→`ServiceError` translation, await/best-effort contract. Genuine new
  seam (first owned audit writer). Bare singleton (no pass-through `AuditLogService`) is the right call.
- `MapDataService` → **PASS (borderline-thin)** — not a pass-through: branches on `layer`, composes two
  ports into one payload. Parallels Products/Customers service precedent.
- `insertMany`/`insertOne`/`listGeocodedForMap`/`listForMap` additions → faithful vendor-mapping inside
  `lib/adapters/supabase/*`, no leak. No depth concern.

**Hexagonal rip-out test: PASS.** Vendor touch confined to `lib/adapters/supabase/*`, wired in `lib/wiring/*`.
No new `package.json` dep. The three routes import services/wiring only.
