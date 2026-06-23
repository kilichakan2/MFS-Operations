# Rollback — F-19 PR2 (Cluster A HACCP route re-point)

**Migration: NONE.** This PR re-points 9 HACCP route files onto the PR1 hexagon.
It changes no schema, no RLS policy, no SQL — `supabase/migrations/` is untouched.

## Rollback path: revert-only (no data recovery needed)

There is no database change to undo, so there is nothing to reverse at the DB layer
and no PITR is required.

To roll back the code:

```
git revert <merge-sha>     # revert the PR #69 merge commit
# Vercel auto-deploys the revert on push to main.
```

The reverted code restores the pre-PR routes (inline `supabaseService`), which read
and write the exact same tables in the exact same way (the re-point is byte-identical),
so a revert is safe at any time with no data migration.

🗣 **In plain English:** Nothing was added to or changed in the database, so undoing
this PR is just putting the old screen-wiring back — one `git revert`, Vercel redeploys,
done. No data to restore, no PITR.
