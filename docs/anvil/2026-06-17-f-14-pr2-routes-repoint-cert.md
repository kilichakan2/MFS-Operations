# ANVIL Clearance Certificate

Date: 2026-06-17
App: MFS-Operations
Branch: feat/f-14-pr2-routes-repoint
PR: #51 — F-14 PR2, re-point 5 Routes endpoints through routesService

## Scope — what this certificate actually covers

| Change / path | Risk tier | Layers required | Layers run |
| --- | --- | --- | --- |
| app/api/routes/route.ts, /[id]/route.ts, /today/route.ts | Medium | Unit + Integration | Unit ✅ + Integration ✅ |
| app/api/admin/runs/route.ts, /[id]/route.ts | Medium | Unit + Integration | Unit ✅ + Integration ✅ |
| lib/adapters/supabase/RoutesRepository.ts | Medium | Integration (adapter contract) | Integration ✅ |
| lib/ports/__contracts__/RoutesRepository.contract.ts | Low | Unit (fake-adapter contract) | Unit ✅ |
| E2E critical paths (order/picking/KDS) | regression-only | E2E @critical smoke | E2E ✅ 10/10 |

**Not run under the efficiency dial:** None deliberately skipped. pgTAP/RLS is n/a — no schema or policy change in this diff (F-RLS-04c owns Routes RLS in a later unit), not a skip.
**Baseline characterisation pass?** No — diff-driven, full required ladder run.

## Approved deviations from byte-identical (the only non-identical wire output)

| ID | Deviation | Pinned by |
| --- | --- | --- |
| W1 | Single reads (GET /[id], /today) hydrate `created_at` (kills the `""` sentinel; type stays non-nullable `string`) | Fake + Supabase adapter contract tests (createdAt non-empty) |
| N1 | Single reads hydrate `created_by` + `creator`, with contract assertions; Fake/Supabase parity | Fake + Supabase adapter contract tests |
| N2 | GET /api/routes/[id] stops now include `visited` (aligns /[id] with /today) — Hakan-approved additive change | routes.test.ts "[id] … stops include visited (N2)" |
| W-NUM | The two `numeric` distance fields (`total_distance_km`, `distance_from_prev_km`) emit as JSON numbers, not strings — Hakan-approved additive-correctness change (matches UI's declared `number` types) | routes.test.ts W-NUM type pin (NEW, commit 0bd0349) |
| I-PATCH | Micro-deviation: PATCH-missing-id path kept at 500 (not 404), preserving today's status code; only the error string changed (old text was an internal DB message). UI only PATCHes existing runs → path effectively unreachable. Consistent with F-TD-20. | Existing route behaviour; PATCH integration tests |

## Test Results

| Layer | Status | Notes |
| --- | --- | --- |
| Unit (Vitest) | ✅ 1805/1805 passed | 102 files; RoutesService rollover (18:59 vs 19:00, winter + BST)/week-bounds/delegation + getUKWeekBounds + Fake contract W1/N1 |
| Integration (Vitest, real Postgres) | ✅ 231/231 passed | 19 files; 5 endpoints byte-identical + Supabase adapter contract (atomic create+rollback, replace honouring UNIQUE(route_id,position), filters, summaries+stopCount, cascade delete) + W1/N1/N2/W-NUM |
| Database (pgTAP) | n/a — not required | No schema/policy change; F-RLS-04c owns Routes RLS |
| Edge Functions (Deno) | n/a — not required | None touched |
| E2E (Playwright @critical) — LOCAL | ✅ 10/10 passed (1 skipped) | Regression-only; specs (order place, picking-list print, KDS butcher, KDS line-undo) touch no Routes endpoint; ran on chromium against local stack |
| E2E (Playwright @critical) — PREVIEW | ✅ 10/10 passed (1 skipped) | Pre-ship smoke on the exact ship build (preview `dpl_34Xk…`, commit `0bd0349`) via `npm run test:e2e:preview -- … --unprotected`; DB identity probe 4/4 (seed-born preview DB); 1 board-dependent reopen-warning spec skipped (empty seed, same as F-PROD-02) |

**Guard note:** the code-critic (Guard phase) could not boot the test runner in its sandbox and relied on the implementer's reported counts. ANVIL **actually executed** all layers above — the counts here are real runs, not relied-upon.

## Warnings (non-blocking)
None.

## Migration
None. Rollback = revert the PR / branch (`git revert` of the merge, or close the PR). No data rollback, no PITR needed (no destructive operation, no migration).
PITR confirmed: N/A — no migration.

## Iteration
0 loops — all layers passed on the first Verify pass. No real-code bug; nothing ejected to FORGE.

## Merge Sequence
1. No migration step — skip `supabase db push`.
2. Merge PR #51 → Vercel auto-deploys.
3. Post-deploy smoke: @critical paths on the live prod URL (Routes endpoints unaffected by the critical smoke; optional Routes manual spot-check post-deploy).
   → if it fails: `vercel rollback` (no PITR — no data touched).

## Ship record
- Merged to main: PR #51 squash-merged as `12803d2` (branch `feat/f-14-pr2-routes-repoint` deleted).
- No migration step (skipped `supabase db push` — zero schema/policy change).
- Production deploy: `dpl_EsdcCQ8UXd6UvkKC6Tjbh6QQdBFj` (commit `12803d2`, target production) → READY.
- Pre-ship preview smoke: 10/10 @critical on the exact ship build (commit `0bd0349`), DB identity probe 4/4.
- Post-deploy production smoke: **6/6 non-5xx, zero 500s** on the live Routes + core endpoints (`/api/routes`, `/api/routes/today`, `/api/admin/runs`, `/api/routes/<missing-id>`, no-auth 401 guard, app shell). Protected routes return `307 → /login` (auth middleware) — healthy posture; the authenticated functional proof is the preview smoke. No rollback triggered.

## Verdict
✅ CLEARED & SHIPPED — F-14 PR2 live on production (`12803d2`). F-14 (Delivery Routes domain) COMPLETE (PR1 #50 + PR2 #51).
