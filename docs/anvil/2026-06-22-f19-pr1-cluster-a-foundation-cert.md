# ANVIL Clearance Certificate

Date: 2026-06-22
App: MFS-Operations
Branch: feat/f19-pr1-cluster-a-foundation
PR: #68 (base main)
FORGE unit: F-19 PR1 — Cluster A daily-check foundation (introduce-only hexagonal extraction)

## Scope — what this certificate actually covers

| Change / path | Risk tier | Layers required | Layers run |
| --- | --- | --- | --- |
| 18 new HACCP files (lib/domain, lib/ports, lib/adapters/{fake,supabase}, lib/services, lib/usecases, lib/wiring) + 5 additive barrel re-exports | Low (introduce-only / dead code — 0 live imports, 0 routes, 0 migration) | Unit + full-app regression (build + integration + pgTAP) | Unit, Build, Typecheck, Lint, Integration, pgTAP — all run |

**Not run under the efficiency dial:** New-code Integration / pgTAP / E2E deliberately deferred
to PR2 — the new modules are dead code (no route imports them, grep-proven), so they cannot be
exercised end-to-end until PR2 re-points routes. E2E `@critical` smoke deferred to the FORGE
ship step (preview + prod). The integration + pgTAP that DID run are a full-app REGRESSION sweep,
not new-code coverage.
**Baseline characterisation pass?** No.

## Test Results

| Layer | Status | Notes |
| --- | --- | --- |
| Unit (Vitest) | PASS — 2167/2167 (134 files) | Incl. 6 new HACCP files, W2 service-gate tests, soft-fail usecase test, wiring no-ForCaller test, no-adapter-imports lint test |
| Production build (next build) | PASS — Compiled successfully | Zero warnings/errors; full app incl. dead files + 5 barrel edits |
| Typecheck (tsc --noEmit) | PASS — clean | exit 0 |
| Lint (next lint) | PASS — clean | No ESLint warnings or errors |
| Integration (Vitest, regression) | PASS — 351/351 (24 files) | Local Supabase, fresh seed, DB-identity sentinel probe passed; localhost only |
| Database (pgTAP, regression) | PASS — 161/161 (14 test files, 0 failed) | `_helpers.sql` no-plan parse error flips runner exit code — harness artefact, all real tests ok; schema + RLS untouched (no migration) |
| Local full-stack rung | PASS — Supabase CLI adapter (db:up → db:reset → run → db:down) | localhost only; stack torn down clean |
| E2E (Playwright) | DEFERRED to ship-step smoke | @critical on Vercel preview (pre-merge) + prod (post-deploy w/ rollback) |
| Populated UI smoke | n/a — not required | No UI rendered/changed by this PR (dead code) |
| Breadth crawl | n/a — not required | No new reachable routes |

## Warnings (non-blocking)
None. (pgTAP runner exit-code artefact documented above — not a test failure: all 14 real
`.test.sql` files reported `ok`, 161 tests 0 failed; the overall FAIL is the shared `_helpers.sql`
glob having no `plan()`.)

## Guard (code-critic) summary
Two 🟡 warnings raised and fixed before this cert: W2 (delivery allergen-only CA gate — byte-identity)
and W1 (submitHaccpDailyCheck honest module — dead dep dropped, option-(a) Ousterhout call). Re-audit
verdict: both CLOSED, zero regression. Full record: `docs/reviews/2026-06-22-f19-pr1-cluster-a-foundation-review.md`.

## Migration
None.
Rollback script: n/a — no schema/data change. Rollback = revert the merge commit (`git revert <merge-sha>`).
PITR confirmed: N/A — no destructive migration → no PITR needed.

## Merge Sequence
1. No migration to apply — skip `supabase db push`.
2. Merge PR #68 → Vercel auto-deploys.
3. Ship-step smoke: @critical Playwright on the preview URL (pre-merge) then prod (post-deploy, rollback armed).

## Manual smoke at merge
Ship-step preview/prod `@critical` smoke advised (deferred to FORGE ship step, not run in ANVIL).
New-code end-to-end proof deferred to PR2 by design (dead code). What IS proven: full unit suite,
production build, typecheck, lint, and a full-app integration + pgTAP REGRESSION sweep — the app
still builds and every existing surface still passes with this branch merged in.

## Verdict
CLEARED FOR PRODUCTION — introduce-only / dead-code PR; all required layers (unit + full-app
regression) green; new-code integration/pgTAP/E2E deferred to PR2; E2E smoke deferred to ship step.
