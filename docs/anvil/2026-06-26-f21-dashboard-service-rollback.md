# F-21 Dashboard split — Rollback note

Date: 2026-06-26
Branch: feat/f21-dashboard-service
PR: #84

## Migration: NONE

F-21 is a **code-only** behaviour-preserving hexagonal re-point. It adds NO
migration, changes NO schema, alters NO RLS policy, and adds NO dependency.

🗣 In plain English: nothing about the database shape or its security rules
changed — only the wiring inside the app moved. So there is no data to undo.

## Rollback procedure (code-only)

If the deployed code misbehaves after merge, the entire change reverts with a
single git operation — there is no database state to reconcile:

```
git revert -m 1 <merge-commit-sha>      # revert the squash/merge of PR #84
# → Vercel auto-deploys the reverted code
```

No `supabase db push`, no PITR, no branch surgery. The previous `/api/dashboard`
and `/api/detail/discrepancy` route bodies (the inline-Supabase versions on
`main`) come straight back, and the new `lib/services/DashboardService.ts` +
`lib/adapters|ports|wiring/**` files are removed by the revert. Nothing else in
the app imports them, so the revert is clean.

🗣 In plain English: if something's wrong, you press "undo" on the merge and
Vercel rebuilds the old code. There is no risk of half-changed data because the
data never changed.
