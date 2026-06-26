# Code-Critic Review — F-19 PR10b — HACCP RLS Route Cutover

- **Date:** 2026-06-25 (FORGE Guard phase)
- **Branch / PR:** `feat/f19-pr10b-haccp-rls-route-cutover` / #79
- **Base:** `main` (HEAD `791287f`)
- **Reviewer:** code-critic subagent (sole review authority for this FORGE Guard)
- **Scope:** 32 HACCP routes flipped onto per-caller `…ForCaller(userId)` factories; identity moved from forgeable cookies to tamper-proof middleware headers.

## VERDICT: CLEAR — no blockers. Hand to ANVIL.

Every locked decision honoured exactly. Pure re-keying inside the existing hexagon — no new module/port/adapter, no migration, no dependency. The cutover strengthens the boundary by removing residual cookie coupling.

## Contract verification — all 7 locked decisions honoured

| # | Locked decision | Result |
|---|---|---|
| 1 | Identity from headers, not cookies | ✅ `grep "cookies.get('mfs_"` across `app/api/haccp/` returns **zero** code hits (one comment-only match in `visitor`). Same header `userId` feeds mint + stamping + gate in every route. |
| 2 | Guards byte-identical | ✅ Only added/removed `return NextResponse` lines in the 33-file route diff are the 3 `admin/suppliers` `!userId` folds, each returning the route's own `'Admin only'`/403. `audit/export` keeps plain-text `new NextResponse('Unauthorised', {status:401})`. |
| 3 | Factory async, awaited after guard | ✅ All `ForCaller(` calls awaited; mint sits below the guard return in GET/POST/PATCH (annual-review L36/55, calibration, `[id]`, audit/export, suppliers). |
| 4 | Per-request, never memoized | ✅ No module-level caching; wiring "distinct object per call" test green. |
| 5 | 7 daily-check routes dual-mint on POST | ✅ POST mints both `haccpDailyChecksServiceForCaller` + `submitHaccpDailyCheckForCaller`; GET mints only the daily-checks one. Pattern uniform across the 7. |
| 6 | supplier-code flipped, wider role guard preserved | ✅ Flipped to `haccpSuppliersServiceForCaller`; `['warehouse','butcher','admin','driver']` preserved verbatim, `!userId` folded, body `'Unauthorised'`/401 unchanged. |
| 7 | No migration/dep/inner-layer change; singletons retained | ✅ Only routes + tests + wiring doc-comments. All 12 service-role singletons still exported (parachutes); `lib/services/**`, `lib/usecases/**`, `lib/ports/**`, `lib/adapters/**`, `package.json` untouched. |

## 🔴 Blockers
None.

## 🟡 Warnings
None.

## 🔵 Architecture notes
None. Pure re-pointing inside the existing hexagon — nothing in depth-rubric scope. Rip-out test still PASS (routes depend on wiring factories only; no vendor SDK in any route).

## 🟢 Test-quality notes (all positive)
- `tests/unit/api/haccp-route-guards.route.test.ts` — meaningful, not shallow. Asserts byte-identical bodies (`toEqual`), asserts `…ForCaller` is **not called** on guard failure (guard-before-mint), and `toHaveBeenCalledWith("u-wh")` (mint uses the header userId).
  - L154-168 — R-SEC-1: request with `cookie: "mfs_role=admin"` + non-admin **header** is refused 401 with the CA factory not called → proves the cookie→header switch closed the impersonation hole.
  - L290-306 — `audit/export` pinned to `res.text() === "Unauthorised"` + not-JSON content-type assertion (R-SEC-2 byte-identical).
  - L369-393 — daily-check POST asserts both factories minted with the same header userId AND record stamping carries `userId: "u-wh"` → no split identity.
- `supabase/tests/015-rls-haccp.test.sql:333-367` — added round-trip-as-active-user + absent-identity-42501-deny pair on `haccp_deliveries` (plan 55→58).

## Results
- **Unit (full):** 2379/2379 passing, 148/148 files. Affected slice (route-guards 28 + wiring 10) = 38/38.
- **Typecheck:** `tsc --noEmit` clean.
- **Lint:** not run (`next lint`; no fast eslint wired — deferred, no risk given typecheck clean + no new patterns).
- **Integration / pgTAP / E2E:** not run (ANVIL's job — no local stack). pgTAP diff reviewed statically, well-formed.

## Cross-checks ("specific things to hunt")
- Cookie identity read in a flipped route → none (grep clean).
- Guard body changed vs main → none (only the 3 additive `!userId` `'Admin only'` folds).
- `audit/export` JSON conversion → did not happen (plain-text preserved + test-pinned).
- `admin/suppliers` `isAdmin(req)` → now reads `x-mfs-user-role` header; helper module-local (3 in-file callers) — no other caller broken.
- Mint before guard / unawaited factory → none.
- visitor flipped → no (comment-only diff, singleton retained).
- Split identity (cookie stamp + header mint) → none.

## Plan O1 resolution
Diff resolves the 31-vs-32 question as **32 flips including supplier-code**, matching the conductor's brief. No discrepancy.

## Hand-off
No loop-back. Advance to ANVIL for integration / pgTAP / exhaustive `@critical` HACCP E2E. Carry the plan's pre-ship **R-LB-1**: `SELECT active FROM users WHERE id = 'e5320cb8-8977-4f86-80d7-6bbc595ce183'` = true in PROD before the switch goes live.
