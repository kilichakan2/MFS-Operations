# Rollback — F-19 PR10b HACCP RLS route cutover

**PR:** #79 · branch `feat/f19-pr10b-haccp-rls-route-cutover`
**Migration in this PR:** NONE. PR10a (#78) shipped the 30-table RLS policy family +
`current_user_is_active()` helper. PR10b only re-points routes — there is **nothing to roll
back in the database**.

🗣 In plain English: PR10b only changed which key each HACCP door reaches for (personal keycard
instead of master key). No locks were added or changed in this PR, so a rollback never touches
the database — you only flip the doors back to the master key.

## How to roll back (code-only, no DB action)

`git revert` the squash-merge commit (or redeploy the prior production build via Vercel). That
restores all 32 routes to the service-role singletons. Because the singletons were retained as
parachutes in `lib/wiring/haccp.ts`, the revert is a clean import swap with no other change.

Per-route revert, if doing it by hand instead of `git revert`:
1. In each of the 32 flipped route files under `app/api/haccp/**`:
   - import: `haccpXServiceForCaller` → `haccpXService`
     (`submitHaccpDailyCheckForCaller` → `submitHaccpDailyCheck`).
   - identity source: `req.headers.get('x-mfs-user-role')` → `req.cookies.get('mfs_role')?.value`
     and `req.headers.get('x-mfs-user-id')` → `req.cookies.get('mfs_user_id')?.value`.
   - drop the `await … ForCaller(userId)` mint; call the singleton's methods directly.
2. `app/api/haccp/visitor/route.ts` and `app/api/haccp/supplier-code/route.ts` are unchanged by
   PR10b — leave them.

## Why no DB rollback is needed

The PR10a policies are **additive** and the **service-role client bypasses RLS**. The moment the
routes revert to the service-role singletons, every HACCP table is fully accessible again exactly
as before PR10b — the policies sit dormant (the master key ignores them). No `DROP POLICY`, no
PITR, no data action.

🗣 In plain English: the locks stay installed but the master key opens them all regardless, so
reverting the doors to the master key instantly restores the old behaviour with zero database
surgery.
