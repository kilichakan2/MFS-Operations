# Code review — F-14 PR2 (Routes re-point onto routesService)

**Date:** 2026-06-17
**PR:** #51 — `feat(routes): re-point 5 Routes endpoints through routesService (F-14 PR2)`
**Branch:** feat/f-14-pr2-routes-repoint
**Reviewer:** code-critic (FORGE Guard phase)
**Verdict:** **CLEAR TO ADVANCE — no blockers.** One 🟡 warning to resolve as a conductor/Hakan decision (mirror the N2 approval) before the ANVIL cert is signed.

🗣 In plain English: nothing dangerous or broken — no security holes, no auth regressions, no architecture breaches, real depth. The single warning is "a field's data type changed on the wire without sign-off — confirm that's intended," the same kind of conscious decision N2 was.

---

## What was run vs. relied on
- `npm run lint` (next lint) → **clean, 0 warnings/errors** (ran).
- `npx tsc --noEmit` → **exit 0** (ran).
- Unit suite → **DENIED by sandbox**; relied on the implementer's reported **1805 unit passing**, mitigated by statically reading `tests/unit/services/RoutesService.test.ts` + the contract suite (both well-formed).
- Integration suite → not attempted in-sandbox (needs local Supabase + Docker); relied on the implementer's reported **230 integration passing**, mitigated by reading `tests/integration/routes.test.ts` in full.
- **ANVIL must actually execute the unit + integration suites** — Guard could not.

---

## 🔴 Blockers
None.

---

## 🟡 Warnings (should resolve — non-blocking; a decision, not a code defect)

### W-NUM — wire-type drift: `numeric` columns flip JSON string → JSON number — **DECISION: ACCEPTED 2026-06-17 (Hakan)**
> **Resolution:** Accepted as a deliberate additive-correctness change (4th approved deviation alongside W1/N1/N2). The number form matches the UI's declared `number` types and is the more-correct value. ANVIL adds a `typeof === 'number'` assertion to `tests/integration/routes.test.ts` to pin it. Documented in the ANVIL cert.

- **Where:** `lib/adapters/supabase/RoutesRepository.ts:205,313` + the 4 GET routes (`/api/routes`, `/api/routes/[id]`, `/api/routes/today`, `/api/admin/runs`).
- **What:** `total_distance_km` and `distance_from_prev_km` are Postgres `numeric` (baseline migration lines 1225, 1253). PostgREST returns `numeric` as a **JSON string** (`"12.5"`). The OLD routes spread the raw row onto the wire (`{ ...r }`), so these went out as **strings**. The new adapter runs `num()` on both, so the routes now emit **numbers** (`12.5`), wherever the value is non-null.
- **Why it slipped:** the integration suite does not assert the *type* of these fields (the PUT test sets `totalDistanceKm: 12.5` but never re-reads it), so the drift wasn't caught.
- **Risk:** Low. The UI types already declare these as `number` and use them via arithmetic/`toFixed`, so runtime now matches the declared type (arguably more-correct). But "byte-identical" was the PR's contract, and this change is not among the three approved deviations (W1/N1/N2).
- **Fix options:** (a) accept + document like N2, and add an integration assertion pinning `typeof === 'number'`; or (b) coerce back to string in the route mappers to stay truly byte-identical.

🗣 In plain English: the old code accidentally sent distances as text like `"12.5"`; the new code sends a real number `12.5`. The screens expect a number either way, so nothing visibly breaks — but a "nothing changes" PR did change this without sign-off. Either bless it on the record (it's the more-correct value) or send it back as text.

---

## 🔵 Informational / follow-up (not blocking)

### I-PATCH — PATCH no-match error *string* differs (status code 500 preserved)
- `app/api/admin/runs/[id]/route.ts:46-48`. OLD `.single()` on no-match emitted `{ error: <postgrest message> }` at 500; NEW emits `{ error: 'Route not found' }` at 500. **Status code identical**; only the message text changed, and the old text was an internal DB string never meant for users. UI only PATCHes runs that exist in the current-week list (`components/RunsContent.tsx:87`, `app/runs/page.tsx:109`) → path effectively unreachable. Defensible per the plan's explicit guidance; consistent with F-TD-20. **Record in the cert as a known intentional micro-deviation.**

### I-W1DEAD — W1 `?? ""` fallback is now dead code, not removed
- `lib/adapters/supabase/RoutesRepository.ts:208` — `createdAt: row.created_at ?? ""`. With `created_at` now in `SINGLE_COLS` (line 80) + `LIST_COLS`, `row.created_at` is always present, so the `?? ""` branch can never fire. Type stayed correctly non-nullable `string`. Harmless but slightly misleading; dropping the `?? ""` is optional. **W1 verdict: correctly done — sentinel unreachable, type non-nullable `string`. ✅**

---

## 🟢 Test-quality notes
- `tests/integration/routes.test.ts` — strong, behaviour-based, through the public HTTP interface: asserts exact key sets via `Object.keys(...).sort()` (POST echo line 104, PATCH bare row line 399); every status code (201/204/200/400/401-via-307/403/404/500); the verbatim PUT partial-failure message (lines 381-382); `visited`/`creator`/`created_at` presence-or-absence **per endpoint** (lines 185-186, 226-227, 162-163); trimmed `{id,name}` assignee with no `role` on runs (lines 260-261); `stop_count` (line 257). Exactly the byte-identical pinning the plan asked for. ✅
- N1 contract assertions meaningful, not tautological (`lib/ports/__contracts__/RoutesRepository.contract.ts:195-227`): contract sets `createdBy: ctx.assignedTo`, so the assertions genuinely catch a regression to the old `createdBy: null` single-read behaviour; Fake hydrates independently (`lib/adapters/fake/RoutesRepository.ts:141,263`) → proves **parity**, not a shared stub. ✅
- 7pm-rollover headline test real (`tests/unit/services/RoutesService.test.ts:44-77`): 18:59 vs 19:00 in GMT and BST, asserting the exact `minDate` string handed to a spy repo. ✅
- Coverage gaps (minor): (1) `today` integration test (line 210) asserts shape only, not a specific id — implementer-flagged, acceptable (rollover correctness owned by the service unit test); (2) the W-NUM numeric type and the PATCH no-match 500 path are unasserted — add a `typeof === 'number'` assertion if W-NUM is accepted.

---

## Layer summary
- **Security:** clean. All 5 routes use `routesService` (service-role singleton, `lib/wiring/routes.ts:31`); `routesServiceForCaller` has **zero** importers. Admin 403 + 401 guards stay in the routes, not the service. No new exposure. ✅
- **Correctness / byte-identicality:** verified field-for-field for all 5 routes. POST 201 (6-key echo) ✅; DELETE 204 ✅; PUT 200 `{id,updated:true}` + verbatim partial-failure strings reproduced in the adapter (`RoutesRepository.ts:424,440,466`) ✅; PATCH 200 bare row ✅; `[id]` 404 ✅; list emits both `assigned_to` and `assignee` + `creator` + `created_at` ✅; `[id]`/`today` omit `created_at`/`creator` ✅; runs emits `stop_count` + trimmed `{id,name}` + echoed `from`/`to` ✅; **no `...domainObject` spread onto any wire** ✅. The one deviation is W-NUM above.
- **N2 verified additive:** `[id]` stops add `visited`, no key removed. ✅
- **Hexagonal (CLAUDE.md + ADR-0002):** zero `@supabase/*`/`lib/adapters/**` imports in the 5 routes ✅; lint `no-restricted-imports` green ✅; `package.json`/`package-lock.json` untouched (no new dep) ✅; no migration ✅; rip-out test still one adapter + one wiring line ✅.
- **Depth:** 5 routes are correctly thin HTTP edges (auth + validate + map) — not pass-throughs ✅; adapter SINGLE_COLS + `toRouteWithStops` hides two-table join + position sort + vendor mapping + coercion — DEEP ✅; no new SPECULATIVE SEAM or PASS-THROUGH introduced. ✅

---

## Recommendation to the conductor
Advance to ANVIL. Surface W-NUM to Hakan as an explicit accept/reject (mirror N2); if accepted, ANVIL adds a `typeof === 'number'` assertion to `tests/integration/routes.test.ts`. Record I-PATCH in the cert as a known intentional micro-deviation. Cert must note Guard relied on the implementer's 1805 unit / 230 integration counts — ANVIL must actually run them.
