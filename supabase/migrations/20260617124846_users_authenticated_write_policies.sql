-- 20260617124846_users_authenticated_write_policies.sql
--
-- F-RLS-04b — Users-context RLS cutover.
-- ADDITIVE: adds the 3 missing write policies (INSERT/UPDATE/DELETE) on
-- public.users so the per-request AUTHENTICATED client (F-RLS-03) can run the
-- admin user-management writes the 4 flipped admin routes issue. All 3 gate on
-- an inline "caller is an admin" predicate. The existing users_select policy
-- (own row OR is_admin) covers reads and is UNCHANGED. Service-role still
-- BYPASSES RLS (no FORCE) — the 5 public routes are unaffected. Grants
-- permission only; deletes no data, drops nothing.
--
-- One policy per command: there is no existing INSERT/UPDATE/DELETE policy on
-- public.users to OR against, so no over-grant is possible (PostgreSQL OR's
-- permissive policies for the same command — here each command has exactly one).
--
-- PREDICATE CHOICE (matches the shipped F-RLS-04a orders policies
-- 20260615173901_*, NOT the bare public.is_admin() helper). is_admin() casts
-- current_setting('app.current_user_id', true)::uuid with no nullif guard, so an
-- EMPTY-STRING GUC raises 22P02 (errors → 500) instead of denying. The GUC
-- bridge (20260614210221_*) sets the GUC to COALESCE(user_id, '') = '' on any
-- anon/no-token/fail-closed request, so that edge is reachable. The inline
-- nullif(current_setting(...),'')::uuid form turns an empty/unset GUC into NULL,
-- the EXISTS subquery yields no row, and RLS cleanly DENIES (42501) — never
-- errors. is_admin()-hardening is logged separately (F-RLS-04b-is-admin-guard).
--
-- Local: npm run db:reset. Prod application is deferred to the ship gate
-- (apply to prod FIRST via Supabase MCP apply_migration, then merge —
-- F-RLS-04a / F-TD-22 ordering). NEVER `supabase db push`.

DROP POLICY IF EXISTS users_insert ON public.users;
DROP POLICY IF EXISTS users_update ON public.users;
DROP POLICY IF EXISTS users_delete ON public.users;

CREATE POLICY users_insert ON public.users
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = nullif(current_setting('app.current_user_id', true), '')::uuid
        AND u.role = 'admin'
    )
  );

CREATE POLICY users_update ON public.users
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = nullif(current_setting('app.current_user_id', true), '')::uuid
        AND u.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = nullif(current_setting('app.current_user_id', true), '')::uuid
        AND u.role = 'admin'
    )
  );

CREATE POLICY users_delete ON public.users
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = nullif(current_setting('app.current_user_id', true), '')::uuid
        AND u.role = 'admin'
    )
  );

-- ROLLBACK
-- DROP POLICY IF EXISTS users_insert ON public.users;
-- DROP POLICY IF EXISTS users_update ON public.users;
-- DROP POLICY IF EXISTS users_delete ON public.users;
