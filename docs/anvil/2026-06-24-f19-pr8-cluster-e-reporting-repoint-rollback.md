# Rollback note — F-19 PR8 (Cluster E reporting re-point)

Date: 2026-06-24
Branch: feat/f19-pr8-cluster-e-reporting-repoint
PR: #75

## Migration

**NONE.** This PR changes zero `supabase/` files — no migration, no schema change,
no RLS/policy change. `git diff --name-only origin/main...HEAD -- supabase/`
returns empty.

## What the PR changes

Application code only: 6 HACCP reporting route files re-pointed from direct
`supabaseService` / `import * as XLSX from 'xlsx'` calls onto the existing
`haccpReportingService` wiring singleton (built + proved byte-identical in PR7,
#74), plus an `.eslintrc.json` line arming the xlsx import ban, plus the PR7
parity unit test and the execution plan doc.

## Rollback path

Because no database object is touched, rollback is **code-only**:

1. **Revert the merge** — `git revert -m 1 <merge-sha>` (or "Revert" on the PR),
   then merge the revert. Vercel auto-deploys the reverted code.
   — OR —
2. **Vercel instant rollback** — promote the previous production deployment
   (Vercel Dashboard → Deployments → previous → Promote to Production).

No data migration to reverse, no PITR involved, no data at risk. The
`haccpReportingService` singleton and its adapters already exist on `main` from
PR7 (introduce-only) and are unaffected by a revert of the route re-point.

## PITR

N/A — no destructive migration, no data mutation in this PR (all 6 routes are
read-only GETs).
