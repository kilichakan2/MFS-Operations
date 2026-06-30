# Rollback note — F-PROD-04 beef mince + meat-prep BLS dispatch labels (PR #102)

Branch: fprod04-beef-mince-prep-dispatch-labels

## No data to roll back

This PR contains **NO migration, NO schema change, NO RLS change, NO new dependency**.
Confirmed by `git diff --name-only origin/main...HEAD`:

- `supabase/migrations/` — untouched
- `package.json` / `package-lock.json` — untouched

The change is pure application + native-bridge logic (printing aggregation, the
`/api/labels` route, the `/haccp/mince` prep print buttons, and the Sunmi
`SunmiPrintBridge.java` native renderer). No column was added, dropped or altered;
no row was written by the migration system.

## Rollback procedure

**Revert the PR.** There is no point-in-time-recovery (PITR) consideration because
no data and no schema were changed. Steps:

1. `gh pr revert 102` (or merge a revert commit) — restores the prior `/api/labels`
   behaviour and removes the prep print buttons.
2. Vercel auto-deploys the reverted code.
3. The native APK is a SEPARATE artifact: the conductor builds/publishes the APK
   post-merge. If only the APK needs reverting, re-publish the prior signed APK —
   the web revert does not touch the installed app.

No `supabase db` command, no PITR, no data restore is involved.
