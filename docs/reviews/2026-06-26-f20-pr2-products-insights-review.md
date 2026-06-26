# Code-critic review — F-20 Admin PR2/3 (Products + Insights hexagonal re-point)

- **Date:** 2026-06-26
- **Branch:** feat/f20-pr2-products-insights
- **Diff range:** main...HEAD (4 commits: `273d6c1`, `911e0d2`, `8e77968`, `3c9f713` + the 2 prior Products-half commits `6ddc24d`, `00494f5`)
- **Plan:** docs/plans/2026-06-26-f20-pr2-products-insights.md
- **Reviewer:** code-critic subagent (FORGE Guard phase)

## VERDICT: CLEAR-WITH-NITS — no blockers, hand to ANVIL

The re-point is correct and safe. Byte-identical holds for every **success** response and every guard; the R1 null-stage trap is genuinely handled (three-layer coverage); suite/typecheck/lint all green. One undocumented deviation (500 **error-body** string drift, failure-path only, status unchanged) plus one minor observability log thinning — both 🟡, neither blocking.

## Test / lint / typecheck (run by code-critic, not just trusted)
- Full unit suite: **2465/2465 passing** (159 files) — matches implementer claim.
- New files spot-run (118 tests, 8 files): all green — R1 null-stage parity (supabase + fake + route), R2 strict-`lt` window, 404 anchor, no-adapter-imports lint pin.
- `tsc --noEmit`: clean (exit 0).
- `eslint` on all 11 changed code files: clean (exit 0). Adapter-import ban is the live `.eslintrc.json`, passes against the real new files.

## 🔴 Blockers
None.

## 🟡 Warnings (fix or consciously accept)
1. **All 5 routes — undocumented 500-error-BODY string change.** On a DB transport error the old code returned: products GET `{ error: <postgrest message> }`, products PATCH `{ error: <postgrest message> }`, the 3 insight routes `{ error: 'Database error' }` — all status 500. After the re-point the adapter throws `ServiceError`, which unwinds to the route catch, so the body is now `{ error: 'Server error' }` (insight + products GET) or `{ error: String(err) }` (products PATCH). **HTTP status unchanged (still 500); only the opaque error string differs.** Plan's "byte-identical" scopes to success shapes + guards and never mentions this. Files: `app/api/admin/products/route.ts:43-45`, `app/api/admin/products/[id]/route.ts` catch, the three insight routes' catch blocks.
   - *Conductor note:* the old code leaked the raw PostgREST message to the client; the new generic body is hexagonally cleaner (vendor types must not leak past the adapter boundary). Treated as an **accepted, recorded deviation** (same spirit as PR1's 404 ruling — old behaviour was never a success path), NOT fixed.
2. **Products GET — thinner DB-error log.** `lib/adapters/supabase/ProductsRepository.ts` logs `log.error("ProductsRepository.listAll DB error", …)` carrying `error.message` only, vs the old route's `console.error('[GET /api/admin/products]', error)` with the full error object (code + details). Minor observability loss on the failure path. **Accepted** (structured logging is the house style; enrichment is a 🔵 follow-up, not in scope).

## 🔵 Architecture notes (non-blocking)
- `ProductsService` is a pure thin pass-through (`lib/services/ProductsService.ts:50-60`). Normally a 🔴 PASS-THROUGH by the depth rubric, but **NOT blocked**: (a) plan explicitly declares it a deliberate Strangler-Fig boundary plug mirroring PR1's `CustomersService`; (b) it satisfies the real `app/** may not import adapters` import-boundary rule. It is the *right* thin — a genuine, load-bearing seam even though the body adds no logic.

### Depth verdicts (new/touched only)
- `lib/services/ProductsService.ts` → PASS-THROUGH, 🔵 not blocked (approved boundary plug, matches PR1).
- `lib/services/VisitsService.ts` (3 new methods) → PASS-THROUGH, 🔵 — same rationale, extends a real service.
- `lib/ports/ProductsRepository.ts` / `lib/ports/VisitsRepository.ts` (extended) → DEEP ✅ — real ports, two genuine adapters, shared contract test.
- `lib/adapters/supabase/ProductsRepository.ts` + `…/VisitsRepository.ts` (new reads) → DEEP ✅ — hide PostgREST query shape, column lists, vendor row→domain mapping.
- `lib/domain/ProductAdminView` → appropriate second domain type (mirrors `CustomerAdminView`), avoids bloating slim Orders-view `Product`. ✅

## 🟢 Test-quality notes
- **R1 genuinely proven, not claimed.** `tests/unit/api/admin-insights.routes.test.ts:115-128` asserts `stage === null` through the public route handler; supabase + fake adapter tests pin the mapper level. Three layers, all green — highest-risk invariant, covered through the public interface.
- **R3 parity is real** but the fake's two mapper paths (`toVisit` applies `?? 'Logged'`, `toProspectVisit` preserves null) are hand-mirrored from supabase, not shared. Correct today; residual structural risk if a future read picks the wrong mapper in only one adapter (each adapter seeded independently, so the contract test wouldn't necessarily catch it). Named, not a defect.
- **Guard tests pin both styles deliberately** — products 403 `'Admin only'` (`x-mfs-user-role`) and insights 401 `'Unauthenticated'` (`x-mfs-user-id`), byte-identical, correctly NOT standardized.
- **404 anchor** pinned at route level (`admin-products.route.test.ts:154-159`) and contract level; R4 ordering (error throw before null check) verified by the supabase adapter test.

## Invariant scorecard
1. Byte-identical success shapes — ✅ all 5 routes (products GET 7-key bare array; PATCH 5-key subset; 3 insight `{rows}` exact camelCase), asserted via `Object.keys().sort()` vs main.
2. Guards byte-identical — ✅ preserved verbatim, not standardized.
3. The ONE agreed 404 — ✅ real; `setActive` keeps `if (error) throw` before null→404, so transport error still 500s, genuine no-row → 404.
4. R1 (null `pipeline_status` → null stage) — ✅ three-layer coverage, not coerced to 'Logged'.
5. R2 (`lt` strict + conditional `from`) / R3 (fake↔supabase parity) — ✅ proven by supabase + fake tests.
6. Derivations stay route-side — ✅ repo/service return raw rows.

**Hexagonal boundaries** — ✅ none of the 5 routes import `@/lib/adapters/**`; services import ports only; only `lib/wiring/products.ts` imports the adapter; service-role singleton posture preserved (no `…ForCaller`, correctly deferred). No vendor SDK leak.

## Bottom line
No blockers → hand to ANVIL. Two 🟡 recorded as **accepted deviations** (above), not fixed: the 500 error-body string drift (cleaner, no-leak behaviour) and the thinner products-GET DB-error log. The "byte-for-byte except the ONE 404" claim is true for success + guards; the failure-path error strings are the one honest asterisk.
