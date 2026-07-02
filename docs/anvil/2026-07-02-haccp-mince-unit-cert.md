# ANVIL Clearance Certificate — /haccp/mince unit (finalized at Lock 2026-07-02)

Date: 2026-07-02
App: MFS-Operations (wholesale meat operations — HACCP compliance suite)
Branch: feat/haccp-mince-unit
PR: #113 (head c8f8533, base main a265579)
Unit: /haccp/mince rebuild — kit rebuild + DB-driven CCP-M thresholds (display-only amber) + bug fixes

## Scope — what this certificate actually covers

| Change / path                                              | Risk tier | Layers required                          | Layers run                                    |
| ---------------------------------------------------------- | --------- | ---------------------------------------- | --------------------------------------------- |
| lib/domain/mincePrep.ts (CCP-M grading rules)               | Critical  | Unit (fenceposts both sides, fail-closed) | Unit ✅ (all 6 temp channels + kill-days)      |
| lib/services/HaccpDailyChecksService.ts (+port/adapters)    | Critical  | Unit + Integration                        | Unit ✅ + Integration ✅                        |
| app/api/haccp/mince-prep + admin/mince-thresholds routes    | High      | Integration                               | Integration ✅ (pass/amber/fail, 403/200, audit) |
| supabase/migrations/20260702150000 (2 new tables, RLS)      | Critical  | pgTAP + Integration + preview migration   | pgTAP ✅ (020) + preview branch migrated ✅     |
| app/haccp/mince/page.tsx + admin CCP-M editor               | High      | E2E local + E2E preview + browser tap     | E2E local ✅ + preview ✅ + exhaustive tap ✅    |
| Hard-guard lint pins (4)                                    | High      | Unit                                      | Unit ✅ (all 4 present and green)               |

**Not run under the efficiency dial:** None — full ladder run (HACCP-critical standard, full
@critical suite re-run on the preview per the high-risk double-run rule).
**Baseline characterisation pass?** No — diff-driven, full coverage of the changed unit.

## Test Results

| Layer                    | Status                | Notes                                                                 |
| ------------------------ | --------------------- | --------------------------------------------------------------------- |
| Unit (Vitest)            | ✅ 3326/3326 (245 files) | incl. mincePrep fenceposts, service amber-paperwork rules, 4 lint pins |
| Integration (Vitest)     | ✅ 571/571 (46 files)  | real local Supabase; incl. haccp-mince-thresholds (GET/POST/PATCH/audit/fail-closed 500) |
| Database (pgTAP)         | ✅ 293 assertions, 0 failed | incl. 020 (admin double-lock, audit immutability, kill-binary CHECK). Summary-line FAIL = pre-existing `_helpers.sql` "No plan found" harness quirk (same on main), not a test failure |
| Edge Functions (Deno)    | n/a — not required    | no edge functions in this diff                                         |
| Local full-stack rung    | ✅                     | Supabase CLI adapter (local Docker stack), fresh `db:reset` seed       |
| E2E local (Playwright)   | ✅ 20/20               | 10 @critical taps × chromium + Mobile Safari; incl. −1 minus-key pin, amber-paperwork, dual-channel CCA, admin round-trip |
| E2E preview (full @critical) | ✅ 106 passed / 1 accepted-red / 1 flaky-green | Vercel preview of head c8f8533 + Supabase preview branch. Red = 25-haccp-reviews weekly (F-INFRA-08 accepted signature); flaky = 04-kds-line-undo (green on retry). Matches CI smoke run on same head exactly — no unexplained red |
| Exhaustive browser tap   | ✅ 2/2, 21 screenshots | every tab/species/mode toggle, both numpads incl. sign toggle on a CHILLED tile, CCA popup full flow, print use-by dialog opened + CANCELLED, date filters, admin CCP-M edit → self-update → restore |
| Populated UI smoke       | ✅ populated           | screen rendered 20+ seeded/created rows; interactions confirmed (submit, print strip, filters) |
| Breadth crawl            | scoped per matrix      | app-wide crawl not in the approved Gate-3 matrix; breadth carried by the full 108-spec @critical preview suite + the exhaustive tap of the changed screen |
| Audit trail (preview DB) | ✅ verified by query    | tap edit wrote 2 immutable audit rows (3.0→3.5, restored 3.5→3.0) with actor; thresholds table restored to exact LOCKED seed |

## Iterate loops used

0 of 2 — no layer failed; nothing ejected to FORGE.

## Warnings (non-blocking)

- 🟡 `04-kds-line-undo` reopen-warning spec flaked once on preview (passed on retry) — pre-existing, unrelated to this diff.
- 🟡 Accepted-red: `25-haccp-reviews` weekly (F-INFRA-08 consumed the weekly slot) — pre-existing, unrelated; do not chase.
- 🔵 pgTAP harness picks up `_helpers.sql` as a test ("No plan found" → summary FAIL despite 0 failed assertions) — pre-existing on main; consider excluding it from the glob (backlog candidate).

## Migration

Additive (2 new tables: haccp_mince_thresholds + haccp_mince_threshold_audit, seed, RLS policies, grants).
No destructive operations — the only DROP lines are DROP POLICY IF EXISTS idempotency guards.
Rollback script: docs/anvil/2026-07-02-haccp-mince-unit-rollback.sql — written AND tested (executed
against the local DB: both tables dropped cleanly; `db:reset` restored the 9 seed rows).
PITR confirmed: N/A (no destructive operation — no PITR gate).

## Preview environment

- Vercel preview: https://mfs-operations-git-feat-h-98e93a-hakan-kilics-projects-2c54f03f.vercel.app (deployment dpl_AEJF3UUkvd8uTtAMcRUD8KoGU1Vj, exact head c8f8533)
- Supabase preview branch: feat/haccp-mince-unit (ref thrrnzftowqspnhwnwdb), MIGRATIONS/FUNCTIONS deployed, healthy; auto-deletes on merge. No orphaned branches.
- Readiness gate passed: /api/auth/team returned 200 before any spec ran; previewProbe's 4 DB identity checks passed (seed-born preview DB, never production).

## Merge Sequence

1. supabase db push --project-ref uqgecljspgtevoylwkep   (migration FIRST — additive, safe under old code)
2. Merge PR #113 → Vercel auto-deploys
3. Smoke test: 3 @critical paths against https://mfs-operations.vercel.app

## Manual smoke at merge

**Not required** — critical flows proven on the real preview environment with real seeded data
(populated, not mount-only); the exhaustive tap covered every control on the changed screen with
screenshot evidence; the post-deploy smoke in the merge sequence is armed with Vercel rollback +
the tested rollback script. Named scope limit: no app-wide breadth crawl ran (not in the approved
matrix); app-wide breadth is covered by the 108-spec @critical preview suite only.

## Verdict

✅ CLEARED FOR PRODUCTION
