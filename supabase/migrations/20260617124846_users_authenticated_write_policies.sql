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
-- 20260615173901_*): the inline EXISTS(... nullif(current_setting(...),'')::uuid
-- ... role='admin') form, for CONSISTENCY with how Orders is already written.
--
-- EMPTY-GUC BEHAVIOR (verified, corrected from an earlier assumption): an
-- empty-string GUC REJECTS the write fail-closed (no row is ever written), but
-- the rejection currently surfaces as a 22P02 cast error, NOT a clean 42501
-- deny. Reason: this predicate's EXISTS subquery scans public.users, which
-- invokes the PRE-EXISTING users_select read policy (baseline.sql) whose
-- ::uuid cast is unguarded on the empty string. So the inline form does NOT
-- avoid the 22P02 — both it and the bare public.is_admin() helper land on it
-- (is_admin() is SECURITY DEFINER so its own users read bypasses users_select,
-- but it has its own unguarded ::uuid cast, so it throws 22P02 too). Either
-- form is fail-closed; neither is "cleaner" for the empty-GUC edge. That edge
-- is unreachable on the 4 authenticated admin routes (they always carry a valid
-- token → valid uuid GUC) and service-role bypasses RLS entirely. The clean-deny
-- fix = guard users_select's cast, deferred to F-RLS-04b-is-admin-guard.
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
