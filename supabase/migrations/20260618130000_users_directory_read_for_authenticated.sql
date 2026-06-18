-- 20260618130000_users_directory_read_for_authenticated.sql
--
-- F-RLS-04c addendum — user-directory read access (loop-back from Guard).
--
-- WHY (the regression this fixes):
--   The F-RLS-04c cutover flips the 5 Routes API routes onto the per-request
--   AUTHENTICATED Supabase client. The Routes GET wires embed user NAMES via
--   PostgREST FK-embedding on `public.users`:
--     assignee:users!routes_assigned_to_fkey (id, name, role)
--     creator:users!routes_created_by_fkey  (id, name)
--   Those embeds resolve through the `public.users` table's OWN RLS policy, not
--   the routes policy. The baseline `users_select` is own-row-OR-is_admin, so
--   under the `authenticated` role a NON-admin caller (office/warehouse) can
--   only SELECT their OWN users row. When they load a route assigned to / created
--   by someone else the FK-embed for that other user returns NULL — the
--   assignee/creator sub-object comes back null with no error. Today this is
--   masked because the Routes routes use the service-role key (RLS bypassed →
--   every users row visible). Hakan's decision: keep staff names/roles visible —
--   they are not secret (they already appear on routes/orders today).
--
-- WHAT (Option 1 — DB-only, zero app-code change):
--   1) A permissive directory SELECT row-policy: any caller whose GUC maps to a
--      real public.users row may SELECT any users row. It OR's with the baseline
--      users_select (PostgreSQL OR's permissive SELECT policies), so it WIDENS
--      non-admin reads to "any logged-in user sees every user's row".
--   2) A column-privilege RESHAPE: REVOKE blanket SELECT from `authenticated`,
--      re-GRANT SELECT on ONLY the 8 NON-HASH columns. RLS is ROW-level, not
--      column-level — a permissive row policy alone would expose pin_hash /
--      password_hash of every user to every authenticated caller. The column
--      GRANT seals the two hash columns at the PRIVILEGE layer: even under the
--      wide row policy, `SELECT pin_hash` as `authenticated` is DENIED for lack
--      of column privilege. The policy and the grant MUST ship together — that
--      is why both live in this one migration file.
--
-- WHY THE REVOKE IS SAFE (login/kds-pin unaffected):
--   The ONLY methods that project the hash columns (findCredentialByName,
--   listCredentialsByRoles) are called ONLY by app/api/auth/login and
--   app/api/auth/kds-pin, both via `usersService` — the SERVICE-ROLE singleton.
--   service-role bypasses RLS and uses SEPARATE grants, so the REVOKE on
--   `authenticated` cannot break any credential read. No `authenticated`-role
--   caller reads hashes (the 4 admin user routes that DO use the authenticated
--   factory project only hash-free SUMMARY_COLS). Verified by tracing every
--   caller — see plan A4.
--
-- NON-DESTRUCTIVE: no DROP TABLE / TRUNCATE / ALTER TYPE / DROP COLUMN /
--   DROP NOT NULL. REVOKE/GRANT change the PRIVILEGE SURFACE only (no data
--   touched) → NO PITR gate fires.
--
-- SERVICE-ROLE is UNAFFECTED (its grants are separate; it bypasses RLS). The
--   pre-auth `anon` grant is left AS-IS (no anon path reads users under RLS
--   today; touching it risks the pre-auth flows — out of scope, predates 04c).
--
-- Apply via Supabase MCP `apply_migration` ONLY (never `supabase db push`).
-- Local: `npm run db:reset`. Prod application is deferred to the ship gate.
--
-- ── DEVIATION FROM PLAN A5 (recorded) ────────────────────────────
--   The plan's A5 SQL sketch wrote the row-policy predicate as an INLINE
--   `EXISTS (SELECT 1 FROM users u WHERE u.id = <GUC>)`. That does NOT work:
--   a SELECT policy ON public.users whose predicate itself SELECTs FROM
--   public.users re-triggers the same SELECT policy → 42P17 infinite
--   recursion (it breaks not only this test but the already-shipped routes
--   policies, which subquery users and so re-enter this policy). The fix
--   mirrors the EXISTING in-repo idiom `public.is_admin()` (baseline.sql
--   L177-187): a SECURITY DEFINER STABLE helper reads public.users AS THE
--   OWNER, bypassing RLS, so no recursion. The policy's MEANING is identical
--   to the plan's contract (valid-user-only; OR's with baseline users_select).

-- 0) Non-recursive valid-user predicate (mirrors is_admin()'s definer pattern).
--    SECURITY DEFINER + owner = bypasses RLS when reading users, so a users
--    SELECT policy can call it without recursing. STABLE: result is fixed
--    within a statement.
CREATE OR REPLACE FUNCTION public.current_user_is_valid()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
  AS $$
    SELECT EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = nullif(current_setting('app.current_user_id', true), '')::uuid
    )
  $$;
ALTER FUNCTION public.current_user_is_valid() OWNER TO postgres;
-- Lock down EXECUTE (F-RLS-03 / harden-security-definer discipline): only the
-- `authenticated` role evaluates this in an RLS predicate, so grant it there
-- and revoke from PUBLIC + anon. The server/bypass role never evaluates RLS
-- predicates (it bypasses RLS), so it does NOT need EXECUTE here — unlike
-- is_admin() we deliberately do NOT grant the bypass role, keeping the surface
-- minimal.
REVOKE EXECUTE ON FUNCTION public.current_user_is_valid() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.current_user_is_valid() FROM anon;
GRANT  EXECUTE ON FUNCTION public.current_user_is_valid() TO authenticated;

-- 1) Row policy: any valid-user GUC may SELECT any users row. OR's with the
--    existing baseline users_select (own-row OR is_admin) — PostgreSQL OR's
--    permissive SELECT policies, so this WIDENS reads to "any logged-in user".
DROP POLICY IF EXISTS users_directory_select ON public.users;
CREATE POLICY users_directory_select ON public.users
  FOR SELECT
  USING ( public.current_user_is_valid() );

-- 2) Column-privilege lockdown: remove blanket SELECT, re-grant only the 8
--    NON-HASH columns. Even with the permissive row policy above, selecting
--    pin_hash / password_hash as `authenticated` is then DENIED for lack of
--    column privilege. Enumerated from baseline CREATE TABLE public.users
--    (20260101000000_baseline.sql lines 1271-1283): the 10 columns are
--    id, created_at, name, role, pin_hash, password_hash, active,
--    last_login_at, email, secondary_roles — the TWO excluded here are exactly
--    pin_hash and password_hash.
REVOKE SELECT ON public.users FROM authenticated;
GRANT  SELECT (id, created_at, name, role, active, last_login_at, email, secondary_roles)
  ON public.users TO authenticated;
-- INSERT/UPDATE/DELETE privileges on `authenticated` are UNCHANGED (baseline
-- GRANT ALL still covers them; the admin write routes need them and their RLS
-- policies (users_insert/update/delete) gate the rows). Only SELECT is reshaped.

-- ── ROLLBACK (manual; not auto-run) ──────────────────────────────
-- DROP POLICY IF EXISTS users_directory_select ON public.users;
-- GRANT ALL ON TABLE public.users TO authenticated;   -- restore blanket grant
-- DROP FUNCTION IF EXISTS public.current_user_is_valid();
