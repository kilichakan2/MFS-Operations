# ANVIL Clearance Certificate

Date: 2026-06-21
App: MFS-Operations
Branch: feat/f-18-pr1-visits-domain-foundation
PR: #65 — F-18 PR1, Visits domain foundation

## Scope — what this certificate actually covers

| Change / path                                              | Risk tier | Layers required | Layers run            |
| ---------------------------------------------------------- | --------- | --------------- | --------------------- |
| lib/domain/Visit.ts, lib/ports/VisitsRepository.ts         | Low       | Unit + tsc/lint | Unit ✓ tsc ✓ lint ✓   |
| lib/services/VisitsService.ts                              | Low       | Unit + tsc/lint | Unit ✓ tsc ✓ lint ✓   |
| lib/adapters/supabase/VisitsRepository.ts                  | Low       | Unit + tsc/lint | Unit ✓ tsc ✓ lint ✓   |
| lib/adapters/fake/VisitsRepository.ts                      | Low       | Unit + tsc/lint | Unit ✓ tsc ✓ lint ✓   |
| lib/wiring/visits.ts + barrel index.ts files               | Low       | Unit + tsc/lint | Unit ✓ tsc ✓ lint ✓   |

**Not run under the efficiency dial:** Integration, DB/RLS (pgTAP), Edge (Deno), and E2E (Playwright)
were deliberately NOT authored. This PR is an introduce-only hexagonal extraction: the new Visits
port/service/adapters/wiring are DEAD CODE — confirmed by an exact-symbol grep of app/ and components/
returning ZERO imports of visitsService / wiring/visits / createVisitsService / supabaseVisitsRepository /
VisitsService. No route is wired, no migration ran, no UI changed → those layers have no new surface to
exercise. Integration + E2E belong to PR2 (route re-point); RLS/pgTAP belongs to F-RLS-04g (RLS cutover).
This is a scoping decision, not a skipped required layer.

**Baseline characterisation pass?** No.

## Test Results

| Layer                       | Status              | Notes                                                            |
| --------------------------- | ------------------- | --------------------------------------------------------------- |
| Unit (Vitest)               | ✅ 2114/2114 passed | 125 files; +68 vs main baseline (2046) — the new Visits suites. |
| tsc (--noEmit)              | ✅ 0 errors         | —                                                               |
| lint (next lint)            | ✅ 0 warnings/errors| Includes the no-adapter-imports pin (service → port only).      |
| Integration (Vitest)        | n/a — not required  | No route wired to the new code (PR2).                           |
| Database (pgTAP)            | n/a — not required  | No migration / no RLS change (F-RLS-04g).                       |
| Edge Functions (Deno)       | n/a — not required  | No supabase/functions change.                                   |
| Local full-stack rung       | n/a — not required  | No DB/route/UI surface to exercise; unit-only tier.            |
| E2E (Playwright)            | n/a — not required  | No app/ or components/ change (PR2).                            |
| Populated UI smoke          | n/a — not required  | No UI change.                                                   |
| Breadth crawl               | n/a — not required  | No UI change.                                                   |
| Architecture rung (seam)    | ✅ verified         | Touched port (Visits) has a domain-only suite running on the in-memory Fake adapter; no vendor SDK imported in any domain test; service imports ports only (lint-pinned). |

## Warnings (non-blocking)

None.

## Migration

None. No rollback script required. PITR confirmed: N/A (no migration).

## Merge Sequence

1. No migration → no `supabase db push` step.
2. Merge PR #65 → Vercel auto-deploys (deploys DEAD code; no runtime behaviour change).
3. Smoke test: read-only non-5xx production checks as a build-deployed safety net (no behaviour to validate).

## Manual smoke at merge

**Not required** — this PR adds unreachable code only. No route, UI, schema, or dependency changed;
exact-symbol grep confirms zero production imports of the new symbols. There is no live path to smoke.
The first behaviour change for Visits arrives in PR2 (route re-point), which gets its own full ANVIL pass.

## Verdict

✅ CLEARED FOR PRODUCTION — conditional on the FORGE ship gate (Hakan's /ship).
