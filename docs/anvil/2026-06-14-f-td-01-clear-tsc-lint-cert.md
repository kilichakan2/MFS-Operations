# ANVIL Clearance Certificate

Date: 2026-06-14
App: MFS-Operations
Unit: F-TD-01 — Clear all `tsc --noEmit` errors + all `next lint` problems; add `typecheck` npm script
Branch: f-td-01-clear-tsc-lint
PR: #33
Base: main

## Scope — what this certificate actually covers

This is a **re-confirmation pass**, not a new-behavior test-writing pass. The unit is pure
tech-debt hygiene: it cleared 60 `tsc --noEmit` type errors and 58 `next lint` problems, and
added a `typecheck` npm script (`"typecheck": "tsc --noEmit"`). NO new runtime behavior was
introduced, so no new test files were written (per the approved matrix). Code-critic (Guard)
already returned SHIP with zero findings; ANVIL's job here is to confirm every gate is green
on the branch and pin the deliverable.

| Change / path                          | Risk tier | Layers required                     | Layers run                          |
| -------------------------------------- | --------- | ----------------------------------- | ----------------------------------- |
| Type-error + lint fixes across 40 files | Low (hygiene, no behavior change) | Typecheck, Lint, Unit, Integration, Suppression-guard | Typecheck, Lint, Unit, Integration, Suppression-guard |

**Not run under the efficiency dial:** pgTAP/RLS and Edge Functions — N/A (no migration, no DB
change, no edge function touched). E2E `@critical` Playwright — deferred to the pre-ship PREVIEW
smoke the conductor runs at Ship (not run in this ANVIL pass).
**Baseline characterisation pass?** No — this is a diff-scoped re-confirmation of a hygiene unit;
the existing suite (unit + integration) is the coverage and it was re-run green.

## Test Results

| Layer                  | Status              | Notes                                                        |
| ---------------------- | ------------------- | ------------------------------------------------------------ |
| Typecheck (`tsc --noEmit`) | ✅ 0 errors      | Unit deliverable. Exit 0, empty output.                      |
| Lint (`next lint`)     | ✅ 0 problems       | "✔ No ESLint warnings or errors". Exit 0.                    |
| Unit (Vitest)          | ✅ 1528/1528 passed | 75 files. `npx vitest run`, 1.57s.                           |
| Integration (Vitest)   | ✅ 115/115 passed   | 12 files. `npm run test:integration` vs local Supabase, seeded fresh via `npm run db:reset`. 9.21s. |
| Database (pgTAP)        | n/a — not required  | No migration, no RLS change, no schema change in this unit.  |
| Edge Functions (Deno)  | n/a — not required   | No edge function touched.                                    |
| E2E (Playwright)       | deferred             | `@critical` preview smoke runs at pre-ship (conductor).      |

### Suppression guard (HARD gate)

`git diff main...f-td-01-clear-tsc-lint | grep -nE 'ts-expect-error|ts-ignore|eslint-disable'`
→ **empty (PASS)**. No type/lint suppressions were added to achieve the green typecheck/lint —
the errors were fixed at source, not silenced.

## Warnings (non-blocking)

None.

## Migration

None. This unit touches no `supabase/migrations/**` and no `.sql` files (diff confirmed). No
schema change, no data change, no destructive operations.

Rollback: not applicable as SQL. Since there is no migration/data change, **rollback = revert
the PR** (`git revert` of the merge commit, or close PR #33 unmerged). No SQL rollback script
is required and none is written.

PITR confirmed: N/A — no destructive migration, no PITR required.

## Gate 3 + Gate 4 note (forward-looking)

With the branch now at 0 `tsc` errors and 0 lint problems, the strict typecheck/lint gates
(Gate 3 build-quality and Gate 4 pre-merge) are **now eligible to run STRICT for later units** —
future ANVIL/FORGE passes can treat any new `tsc`/lint regression as a hard blocker against a
clean baseline, rather than against a backlog of 118 pre-existing problems.

## Merge Sequence

No migration, so the standard "migration first" step is skipped:

1. ✅ All gates green (this certificate)
2. Merge PR #33 → Vercel auto-deploys (no DB step needed)
3. Pre-ship `@critical` Playwright smoke on the current Vercel preview (conductor runs this)
4. Post-merge: 3 `@critical` paths on live prod as the rollback trigger

## Verdict

✅ CLEARED FOR PRODUCTION

## Ship Record — 2026-06-14 (prod-verified)

- **Merged:** PR #33 squash-merged to `main` → `72cb80b` (`chore(td): clear all tsc errors + ESLint problems — gates go strict (F-TD-01) (#33)`). Branch `f-td-01-clear-tsc-lint` deleted on merge.
- **No migration** — no `supabase db push`, no PITR. Rollback = revert `72cb80b` / `vercel rollback` (no data touched).
- **Pre-ship preview smoke:** 4/4 DB-identity probe + **8/8 @critical** green on `mfs-operations-git-f-td-0-409a51-…vercel.app` (PR #33 preview, commit 12022dd).
- **Prod deploy:** `dpl_Da7dJrdfACQj3uF24TUoQPDykScY` (target production, commit 72cb80b) → READY; auto-promoted to `https://www.mfsops.com`.
- **Post-deploy prod smoke (3/3 green):** `GET /login` → 200 · `GET /api/kds/orders` → 200 · forged `mfs_session` cookie on `/dashboard` → 307 (middleware fails closed; T1 intact).
- **User-visible change shipped:** the "Log New" button label is now `'Yeni Kayıt'` (was `'Yeni Kaydet'`) — intentional, Hakan-approved.
- **Gate consequence:** with `main` now at tsc 0 / lint 0, ANVIL's typecheck + lint layers are eligible to run **STRICT** for every later sprint unit — any regression is a hard blocker against a clean baseline.

✅ SHIPPED — F-TD-01 complete.
