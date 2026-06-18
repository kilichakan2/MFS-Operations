-- ANVIL rollback — F-RLS-04c Routes RLS cutover (+ user-directory read fix)
-- Branch: f-rls-04c-routes-rls-cutover
-- Date: 2026-06-18
--
-- NON-DESTRUCTIVE change → this rollback is the inverse of two ADDITIVE
-- migrations (policies + privilege reshape only; no data touched, no PITR).
--
-- Two independent layers must be reverted. APP-LAYER first (cheapest, no DB),
-- then DB-LAYER if the policies/grants are to be removed too.
--
-- ────────────────────────────────────────────────────────────────────
-- LAYER 1 — APP CODE (one-line-per-route parachute; no deploy of new SQL)
-- ────────────────────────────────────────────────────────────────────
-- The wiring file lib/wiring/routes.ts KEEPS the service-role `routesService`
-- singleton precisely as the rollback parachute. To revert a route, swap the
-- per-request authenticated factory back to the service-role singleton:
--
--   app/api/routes/route.ts          : routesServiceForCaller(userId)  ->  routesService
--   app/api/routes/[id]/route.ts     : routesServiceForCaller(userId)  ->  routesService
--   app/api/routes/today/route.ts    : routesServiceForCaller(userId)  ->  routesService
--   app/api/admin/runs/route.ts      : routesServiceForCaller(userId)  ->  routesService
--   app/api/admin/runs/[id]/route.ts : routesServiceForCaller(userId)  ->  routesService
--
-- service-role bypasses RLS, so reverting the code alone fully restores the
-- pre-04c behaviour even if the DB policies below are left in place (they are
-- inert for the service-role connection). The DB layer can stay applied.
--
-- ────────────────────────────────────────────────────────────────────
-- LAYER 2 — DB (only if you also want to remove the policies/grants/function)
-- ────────────────────────────────────────────────────────────────────

-- Reverse 20260618120000_routes_authenticated_rls_policies.sql
DROP POLICY IF EXISTS routes_select       ON routes;
DROP POLICY IF EXISTS routes_insert       ON routes;
DROP POLICY IF EXISTS routes_update       ON routes;
DROP POLICY IF EXISTS routes_delete       ON routes;
DROP POLICY IF EXISTS route_stops_select  ON route_stops;
DROP POLICY IF EXISTS route_stops_insert  ON route_stops;
DROP POLICY IF EXISTS route_stops_delete  ON route_stops;

-- Reverse 20260618130000_users_directory_read_for_authenticated.sql
DROP POLICY IF EXISTS users_directory_select ON public.users;
GRANT ALL ON TABLE public.users TO authenticated;   -- restore the baseline blanket grant
DROP FUNCTION IF EXISTS public.current_user_is_valid();

-- NOTE: dropping the routes/route_stops policies while RLS stays ENABLED with
-- zero policies = DENY-ALL for the authenticated role. That is only safe AFTER
-- LAYER 1 reverts every route back to the service-role singleton (which bypasses
-- RLS). Always revert LAYER 1 first, LAYER 2 second.
