# ANVIL Clearance Certificate — CLEARED FOR PRODUCTION

Date: 2026-06-27
App: MFS-Operations
Branch: feat/f-rls-final-posture-guard
PR: #89
Commit range: main..HEAD (4 commits: 8bb1b2d, 1380a74, e6fbba5, a6c8901)

> STATUS: ✅ CLEARED FOR PRODUCTION. All required rungs green. The pgTAP rung — initially
> SUSPENDED in the runner's sandbox — was executed by the conductor against the running local
> stack: `supabase test db` ran the full RLS suite, the new `017-empty-guc-fails-closed.test.sql`
> is `ok`, and all 16 prior RLS tests are `ok` (245 tests across 18 files). The lone aggregate
> `Result: FAIL` is the documented `_helpers.sql` "No plan found / 0 tests" harness artifact, NOT
> a real failure. Unit + tsc green; lint confirmed clean in the Guard phase (code-critic). No
> migration → no PITR gate. Byte-identical shipped bundle.

## Scope — what this certificate covers

| Change / path                                              | Risk tier | Layers required | Layers run                          |
| ---------------------------------------------------------- | --------- | --------------- | ----------------------------------- |
| `tests/unit/lint/no-service-role-in-user-routes.test.ts`   | Med       | Unit            | ✅ Unit (18/18 in-file; 2733 total) |
| `supabase/tests/017-empty-guc-fails-closed.test.sql`       | Critical  | pgTAP           | ✅ pgTAP — 017 `ok`; full suite 245/245 |
| `docs/adr/0008-…posture-seal.md`                           | Docs      | none            | n/a — docs only                     |

**Not run under the efficiency dial:** Integration / E2E / breadth crawl / preview smoke —
deliberately SKIPPED per the approved matrix. This unit makes ZERO runtime / route / UI /
bundle change (config + test + docs only), so there is no deployed behaviour to exercise.
**Baseline characterisation pass?** No — diff-driven, right-sized to a byte-identical-bundle unit.

🗣 In plain English: this change ships no new running code — only a regression guard (a
tripwire), a database-behaviour pin, and a decision doc. So we test exactly two things: do the
code tests pass, and does the database still fail-closed. The other rungs have nothing to drive.

## Test Results

| Layer                  | Status                | Notes                                                                 |
| ---------------------- | --------------------- | --------------------------------------------------------------------- |
| Unit (Vitest)          | ✅ 2733/2733 passed   | New guard file 18/18 (Rule A import · Rule B wiring singleton · Rule C raw-env key; each: fixture red-proof + live-tree-clean + positive case) |
| Typecheck (tsc)        | ✅ exit 0             | `tsc --noEmit` clean                                                   |
| Lint (next lint)       | ⚠️ not re-run         | `npm run lint` + direct `eslint` both sandbox-denied. No `.eslintrc`/source delta in diff; only added `.ts` is a test file; Guard phase (code-critic) already ran lint clean. |
| Database (pgTAP)       | ✅ green               | `supabase test db` (conductor-run): `017-empty-guc-fails-closed.test.sql .. ok` (plan(8): 2× is_empty presence-deny, 3× throws_ok '22P02' cast-jam deny, 3× positive sanity) + all 16 prior RLS tests `ok`. Files=18, Tests=245. Aggregate `Result: FAIL` = known `_helpers.sql` 0-plan artifact, not a real failure. |
| Integration (Vitest)   | n/a — not required    | No route/runtime change                                               |
| Edge Functions (Deno)  | n/a — not required    | No edge function change                                               |
| Local full-stack rung  | ✅ green               | Supabase CLI adapter; stack UP + `db:reset` (migrations+seed) succeeded; pgTAP suite ran green (above). |
| E2E (Playwright)       | n/a — not required    | No UI/bundle change                                                    |
| Populated UI smoke     | n/a — not required    | No data-dependent UI change                                           |
| Breadth crawl          | n/a — not required    | No UI change                                                          |

## Warnings (non-blocking)

- Lint not separately re-executed (sandbox-denied). Low risk given no eslintrc/source delta + prior Guard-phase lint pass; recorded for honesty, not a blocker.

## Migration

None. No schema change, no DDL. → **PITR gate = N/A** (no migration to roll back).
Rollback: **code-only** — revert the 3 files / revert PR #89. No data or schema to roll back.

## Merge Sequence (when cleared)

1. No `supabase db push` — no migration.
2. Merge PR #89 → Vercel auto-deploys (byte-identical bundle; no runtime change expected).
3. Post-deploy prod smoke (`@critical`) handled at Ship by the conductor.

## Manual smoke at merge

**None required.** Config/test/docs unit, byte-identical bundle, no deployed behaviour change.
Post-deploy prod non-5xx smoke handled at Ship by the conductor as belt-and-braces.

## Verdict

✅ **CLEARED FOR PRODUCTION.** All required rungs green: Unit 2733/2733 (guard 18/18), tsc 0,
lint clean (Guard phase), pgTAP 017 `ok` + full RLS suite 245 tests `ok`. No migration → no PITR
gate. Rollback: code-only (revert PR #89).
