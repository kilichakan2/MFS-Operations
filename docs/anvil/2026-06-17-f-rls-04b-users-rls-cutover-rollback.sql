-- ANVIL rollback — F-RLS-04b Users-context RLS cutover
-- Date: 2026-06-17
-- Branch: feat/f-rls-04b-users-rls-cutover
-- PR: #47
--
-- MIGRATION CLASS: ADDITIVE (CREATE POLICY only — grants permission, drops
-- nothing, deletes no data). Vercel code rollback alone fully restores
-- behaviour; this DB rollback is OPTIONAL clean-up, not a data-recovery step.
-- No PITR is required for this migration.
--
-- ─── ROLLBACK HAS TWO HALVES — DO BOTH TO FULLY REVERSE F-RLS-04b ───────────
--
-- HALF 1 (CODE — the real parachute, do this FIRST):
--   Re-point the 4 admin Users routes back to the SERVICE-ROLE singleton.
--   In each handler, replace the per-request authenticated graph
--     `const svc = await usersServiceForCaller(callerUserId);`
--   with the pre-wired service-role singleton
--     `import { usersService } from "@/lib/wiring/users";`  // service-role; bypasses RLS
--     ... use `usersService` directly (no callerUserId needed).
--   Files:
--     - app/api/admin/users/route.ts           (GET, POST)
--     - app/api/admin/users/[id]/route.ts      (PATCH, DELETE)
--   `usersService` (service-role) is kept in lib/wiring/users.ts precisely as
--   this parachute (see its F-RLS-04b comment block). Service-role bypasses RLS,
--   so the routes work whether or not HALF 2 below has run. Vercel: redeploy /
--   `vercel rollback` to the pre-merge build does this automatically.
--
-- HALF 2 (DB — optional clean-up; safe to leave in place):
--   Drop the 3 additive write policies. Harmless to leave: with the routes back
--   on service-role they are never evaluated (service-role bypasses RLS), and
--   the unchanged users_select policy is NOT touched here.

DROP POLICY IF EXISTS users_insert ON public.users;
DROP POLICY IF EXISTS users_update ON public.users;
DROP POLICY IF EXISTS users_delete ON public.users;

-- NOTE: do NOT drop users_select — it predates F-RLS-04b (baseline RLS) and
-- covers reads for both the authenticated and service-role paths.
