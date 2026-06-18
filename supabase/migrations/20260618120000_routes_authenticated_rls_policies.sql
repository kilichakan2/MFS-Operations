-- 20260618120000_routes_authenticated_rls_policies.sql
--
-- F-RLS-04c — Routes-context RLS cutover.
--
-- ADDITIVE migration: adds the FULL policy set (7 policies) the `routes` and
-- `route_stops` tables need so the per-request AUTHENTICATED Supabase client
-- (the keycard, F-RLS-03) can read AND write through the Postgres
-- `authenticated` role once the 5 Routes API routes are flipped onto
-- `routesServiceForCaller`.
--
-- WHY THE FULL SET (not just writes — the critical difference vs 04a/04b):
--   `20260613000000_enable_rls_42_tables.sql` ran
--   `ALTER TABLE routes/route_stops ENABLE ROW LEVEL SECURITY` but added NO
--   policies. RLS-enabled + zero-policies = DENY EVERYTHING for non-service-role.
--   So unlike Orders/Users (which already had baseline SELECT policies and only
--   needed the missing writes), Routes needs SELECT too — without `routes_select`
--   + `route_stops_select` EVERY authenticated GET returns nothing and the Route
--   Planner, /today driver view and admin runs list all go blank. SELECT is the
--   headline must-fix here.
--
-- ROLE MODEL — VALID-USER ONLY, no `role IN (...)` filter:
--   Any caller whose GUC maps to a real `public.users` row is allowed. The Route
--   handlers do NOT role-gate create/save (routes / routes/[id] / routes/today let
--   any signed-in user create/save), so RLS must not be stricter than the
--   service's own gating (the 04a rule "RLS is never stricter than the service's
--   own gating"). The admin-only gate on PATCH/DELETE stays at the ROUTE layer
--   (admin/runs/[id] already 403s non-admins before the DB is touched), so the DB
--   policy needs no role filter to enforce it.
--
-- GRANTS: table-level `GRANT ALL ON routes/route_stops TO authenticated` already
--   exists in `20260101000000_baseline.sql` (lines 2768, 2773), so NO GRANT is
--   added here.
--
-- SERVICE-ROLE still BYPASSES RLS (no FORCE) — so `routes/compute-road-times`,
--   `routes/users`, and any cron remain unaffected; they keep using the
--   service-role singleton.
--
-- NON-DESTRUCTIVE: `CREATE POLICY` only — no DROP TABLE / TRUNCATE / ALTER TYPE /
--   DROP NOT NULL. Grants permission only; deletes no data, drops no column,
--   alters no type → NO PITR gate fires.
--
-- One policy per command on each table, so no over-grant is possible (PostgreSQL
--   OR's permissive policies for the same command — here each command has exactly
--   one). `route_stops` gets NO UPDATE policy: `saveRoute` replaces stops via
--   delete-then-insert, so no `route_stops` UPDATE is ever issued by the adapter.
--
-- EMPTY/ABSENT-GUC EDGE (inherited from 04a/04b, deferred — do NOT fix here):
--   an empty-string GUC's `nullif(...,'')::uuid` cast raises 22P02 (a cast error)
--   rather than a clean 42501 deny. It is FAIL-CLOSED either way (no row is read
--   or written) and UNREACHABLE on these routes (they always carry a valid token
--   → valid uuid GUC). The clean-deny fix is the same deferred is-admin /
--   cast-guard follow-up referenced in F-RLS-04b — reference only.
--
-- Apply via Supabase MCP `apply_migration` ONLY (never `supabase db push`).
-- Local: `npm run db:reset`. Prod application is deferred to the ship gate
-- (apply to prod FIRST, then merge — the F-RLS-04a / 04b / F-TD-22 ordering).

DROP POLICY IF EXISTS routes_select       ON routes;
DROP POLICY IF EXISTS routes_insert       ON routes;
DROP POLICY IF EXISTS routes_update       ON routes;
DROP POLICY IF EXISTS routes_delete       ON routes;
DROP POLICY IF EXISTS route_stops_select  ON route_stops;
DROP POLICY IF EXISTS route_stops_insert  ON route_stops;
DROP POLICY IF EXISTS route_stops_delete  ON route_stops;

-- ── routes ──────────────────────────────────────────────────

CREATE POLICY routes_select ON routes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = nullif(current_setting('app.current_user_id', true), '')::uuid
    )
  );

CREATE POLICY routes_insert ON routes
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = nullif(current_setting('app.current_user_id', true), '')::uuid
    )
  );

CREATE POLICY routes_update ON routes
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = nullif(current_setting('app.current_user_id', true), '')::uuid
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = nullif(current_setting('app.current_user_id', true), '')::uuid
    )
  );

CREATE POLICY routes_delete ON routes
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = nullif(current_setting('app.current_user_id', true), '')::uuid
    )
  );

-- ── route_stops (NO UPDATE — saveRoute does delete-then-insert) ──

CREATE POLICY route_stops_select ON route_stops
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = nullif(current_setting('app.current_user_id', true), '')::uuid
    )
  );

CREATE POLICY route_stops_insert ON route_stops
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = nullif(current_setting('app.current_user_id', true), '')::uuid
    )
  );

CREATE POLICY route_stops_delete ON route_stops
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = nullif(current_setting('app.current_user_id', true), '')::uuid
    )
  );

-- ROLLBACK
-- DROP POLICY IF EXISTS routes_select       ON routes;
-- DROP POLICY IF EXISTS routes_insert       ON routes;
-- DROP POLICY IF EXISTS routes_update       ON routes;
-- DROP POLICY IF EXISTS routes_delete       ON routes;
-- DROP POLICY IF EXISTS route_stops_select  ON route_stops;
-- DROP POLICY IF EXISTS route_stops_insert  ON route_stops;
-- DROP POLICY IF EXISTS route_stops_delete  ON route_stops;
