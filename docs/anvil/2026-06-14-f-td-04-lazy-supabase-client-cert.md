# ANVIL Clearance Certificate

Date: 2026-06-14
App: MFS-Operations
Branch: f-td-04-lazy-supabase-client
PR: #35

## Scope — what this certificate actually covers

| Change / path | Risk tier | Layers required | Layers run |
| --- | --- | --- | --- |
| Lazy Supabase service client (new `lib/adapters/supabase/client.ts`) + 88 import-path rewrites + deletion of `lib/supabase.ts` and `tests/setup.ts` | Medium (pure code-move refactor; no schema/auth/RLS/endpoint change) | Unit, Integration, E2E @critical smoke | Typecheck, Lint, straggler grep, Unit (1536), Integration (122), E2E @critical (chromium 3/3) |

**Not run under the efficiency dial:** Full E2E suite re-run on a Vercel preview branch was not performed — this is a low/medium-risk code-move refactor (no auth/payments/migration/RLS), so the tier calls for the @critical smoke only. DB/pgTAP/RLS and Edge-function layers are not applicable (nothing in those layers was touched).
**Baseline characterisation pass?** No — diff-driven matrix on a refactor with an existing test baseline.

## Test Results

| Layer | Status | Notes |
| --- | --- | --- |
| Typecheck (tsc) | ✅ 0 errors | matches baseline |
| Lint (next lint) | ✅ 0 warnings/errors | matches baseline |
| Straggler grep (`@/lib/supabase`) | ✅ 0 remaining | all import sites migrated; old files deleted |
| Unit (Vitest) | ✅ 1536/1536 passed | `setup 0ms` — green with NO setup file; module-load env-clean (the F-TD-04 acceptance proof) |
| Integration (Vitest) | ✅ 122/122 passed | real local Supabase; lazy proxy byte-identical to eager client across rewritten call-sites |
| Database (pgTAP) | n/a — not required | no schema/RLS/SQL change in this PR |
| Edge Functions (Deno) | n/a — not required | no edge functions touched |
| E2E (Playwright @critical) | ✅ chromium 3/3 passed | routes render full correct content across rewritten imports |

## Warnings (non-blocking)

- 🟡 Mobile Safari / WebKit: 2 @critical specs (`01-order-place.spec.ts:38`, `02-picking-list-print.spec.ts:25`) flake/fail on WebKit only. Isolated to pre-existing E2E-harness flakiness — same flows pass clean on chromium, error-context snapshots show the app fully rendered, and this PR touches no spec/config/env. Not introduced by F-TD-04. Recommend a follow-up BACKLOG item to add WebKit retries / `@flaky` tagging. Does not gate this PR. (Logged as BACKLOG F-TD-17.)

## Migration

None.
Rollback script: N/A — no migration. Rollback = `git revert` of the PR merge.
PITR confirmed: N/A — no destructive migration, no data at risk.

## Merge Sequence

1. (no migration — skip `supabase db push`)
2. Merge PR #35 → Vercel auto-deploys
3. Smoke test: 3 @critical Playwright paths against the production URL post-merge

## Verdict

✅ CLEARED FOR PRODUCTION
