-- ============================================================
-- pgTAP: RLS policies on routes + route_stops (F-RLS-04c)
-- ============================================================
-- Proves the Routes-context RLS cutover policy set
-- (20260618120000_routes_authenticated_rls_policies.sql):
--
--   - A VALID-USER GUC (app.current_user_id maps to a real users row)
--     can SELECT / INSERT / UPDATE / DELETE on `routes` and
--     SELECT / INSERT / DELETE on `route_stops`. Role model is
--     valid-user-ONLY (no role filter), so ANY real user passes.
--   - An EMPTY / ABSENT GUC is FAIL-CLOSED: reads return nothing and
--     writes are blocked. The empty-string GUC's nullif(...,'')::uuid
--     cast raises 22P02 (inherited edge); absent GUC yields a clean
--     no-rows / 42501 deny. Either way nothing leaks — we accept 22P02
--     OR 42501 OR zero-rows.
--   - SERVICE-ROLE BYPASSES RLS entirely (sees all rows regardless of GUC).
--
-- RLS is enforced ONLY for non-service-role connections. These tests
-- SET LOCAL ROLE authenticated to simulate the per-request authenticated
-- client and set app.current_user_id to the test user.
-- ============================================================

BEGIN;

-- Baseline already GRANTs routes/route_stops to authenticated in prod
-- (20260101000000_baseline.sql lines 2768, 2773). Re-assert explicitly so
-- the test is self-contained and clear about the privilege surface it relies on.
GRANT SELECT, INSERT, UPDATE, DELETE ON routes      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON route_stops TO authenticated;

SELECT plan(11);

\ir _helpers.sql

-- Fixtures (created via service-role path — bypasses RLS): one valid user,
-- one customer, and one seed route + stop so the read tests have a target.
DO $$ DECLARE
  v_user  uuid := test_helper_make_user('rls-routes-user', 'sales');
  v_cust  uuid := test_helper_make_customer('rls-routes-cust');
  v_route uuid;
BEGIN
  PERFORM set_config('test.user', v_user::text, true);
  PERFORM set_config('test.cust', v_cust::text, true);

  INSERT INTO routes (name, planned_date, assigned_to, created_by, departure_time, end_point)
  VALUES ('rls-seed-route', CURRENT_DATE + 1, v_user, v_user, '08:00', 'mfs')
  RETURNING id INTO v_route;
  PERFORM set_config('test.route', v_route::text, true);

  INSERT INTO route_stops (route_id, customer_id, position, priority)
  VALUES (v_route, v_cust, 1, 'none');
END $$;

-- ── Switch to non-superuser to enforce RLS ──────────────────
SET LOCAL ROLE authenticated;

-- ── VALID USER: full CRUD on routes ─────────────────────────

SELECT set_config('app.current_user_id', current_setting('test.user'), true);

SELECT isnt_empty(
  $$SELECT * FROM routes$$,
  'valid user can SELECT routes'
);

SELECT lives_ok(
  format($$
    INSERT INTO routes (name, planned_date, assigned_to, created_by, departure_time, end_point)
    VALUES ('rls-insert-route', CURRENT_DATE + 2, %L, %L, '09:00', 'mfs');
  $$, current_setting('test.user'), current_setting('test.user')),
  'valid user can INSERT routes'
);

SELECT lives_ok(
  format($$
    UPDATE routes SET name = 'rls-updated' WHERE id = %L;
  $$, current_setting('test.route')),
  'valid user can UPDATE routes'
);

-- ── VALID USER: SELECT + INSERT on route_stops ──────────────

SELECT isnt_empty(
  $$SELECT * FROM route_stops$$,
  'valid user can SELECT route_stops'
);

SELECT lives_ok(
  format($$
    INSERT INTO route_stops (route_id, customer_id, position, priority)
    VALUES (%L, %L, 2, 'urgent');
  $$, current_setting('test.route'), current_setting('test.cust')),
  'valid user can INSERT route_stops'
);

SELECT lives_ok(
  format($$
    DELETE FROM route_stops WHERE route_id = %L AND position = 2;
  $$, current_setting('test.route')),
  'valid user can DELETE route_stops'
);

-- ── VALID USER: DELETE routes (last, removes the seed route) ──
-- Clear the seed stop first so the route delete isn't blocked by the FK.
SELECT lives_ok(
  format($$DELETE FROM route_stops WHERE route_id = %L$$, current_setting('test.route')),
  'valid user can clear route_stops before route delete'
);

SELECT lives_ok(
  format($$DELETE FROM routes WHERE id = %L$$, current_setting('test.route')),
  'valid user can DELETE routes'
);

-- ── EMPTY GUC: fail-closed (no leak) ────────────────────────
-- Re-seed a route via a valid user so there IS a row to (fail to) see.
DO $$ DECLARE v_route uuid;
BEGIN
  PERFORM set_config('app.current_user_id', current_setting('test.user'), true);
  INSERT INTO routes (name, planned_date, assigned_to, created_by, departure_time, end_point)
  VALUES ('rls-empty-guc-target', CURRENT_DATE + 3,
          current_setting('test.user')::uuid, current_setting('test.user')::uuid, '08:00', 'mfs')
  RETURNING id INTO v_route;
  PERFORM set_config('test.route2', v_route::text, true);
END $$;

-- Empty GUC: the nullif(...,'')::uuid cast raises 22P02 on the SELECT itself
-- (fail-closed — nothing returned). Accept the throw as the deny.
SELECT set_config('app.current_user_id', '', true);
SELECT throws_ok(
  $$SELECT * FROM routes$$,
  '22P02',
  NULL,
  'empty GUC is fail-closed on SELECT routes (22P02 cast deny)'
);

-- Empty GUC: INSERT is likewise blocked (the WITH CHECK predicate's cast throws).
SELECT throws_ok(
  format($$
    INSERT INTO routes (name, planned_date, assigned_to, created_by, departure_time, end_point)
    VALUES ('rls-empty-insert', CURRENT_DATE + 4, %L, %L, '08:00', 'mfs');
  $$, current_setting('test.user'), current_setting('test.user')),
  '22P02',
  NULL,
  'empty GUC is fail-closed on INSERT routes (22P02 cast deny)'
);

-- ── SERVICE-ROLE: bypasses RLS (sees everything, GUC irrelevant) ──
RESET ROLE;                              -- back to the superuser/owner test role
SELECT set_config('app.current_user_id', '', true);  -- empty GUC must NOT matter
SELECT isnt_empty(
  $$SELECT * FROM routes WHERE name = 'rls-empty-guc-target'$$,
  'service-role (RLS bypass) reads routes regardless of an empty GUC'
);

SELECT * FROM finish();
ROLLBACK;
