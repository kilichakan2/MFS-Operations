-- ============================================================
-- pgTAP: RLS policies on orders + order_lines
-- ============================================================
-- Verifies the role-based access matrix from the Frame spec.
--
-- RLS is enforced ONLY for non-service-role connections — the
-- service-role key bypasses RLS entirely (that's its definition).
-- These tests connect using set_session_role and set app.user_id
-- to simulate an authenticated user calling via the anon key.
--
-- Visibility matrix (from Frame spec):
--   - admin / sales / office / warehouse / butcher: read all orders
--   - admin / sales / office:                       insert orders
--   - admin / sales / office:                       edit placed orders
--   - admin / office / warehouse:                   edit printed orders
--   - butcher: update order_lines (api enforces field-level)
--   - driver:  no access
-- ============================================================

BEGIN;
SELECT plan(14);

\ir _helpers.sql

-- Fixtures: one user per role, plus a customer
DO $$ DECLARE
  v_cust uuid := test_helper_make_customer();
  v_admin     uuid := test_helper_make_user('rls-admin',     'admin');
  v_sales     uuid := test_helper_make_user('rls-sales',     'sales');
  v_office    uuid := test_helper_make_user('rls-office',    'office');
  v_warehouse uuid := test_helper_make_user('rls-warehouse', 'warehouse');
  v_butcher   uuid := test_helper_make_user('rls-butcher',   'butcher');
  v_driver    uuid := test_helper_make_user('rls-driver',    'driver');
BEGIN
  PERFORM set_config('test.cust',      v_cust::text,      true);
  PERFORM set_config('test.admin',     v_admin::text,     true);
  PERFORM set_config('test.sales',     v_sales::text,     true);
  PERFORM set_config('test.office',    v_office::text,    true);
  PERFORM set_config('test.warehouse', v_warehouse::text, true);
  PERFORM set_config('test.butcher',   v_butcher::text,   true);
  PERFORM set_config('test.driver',    v_driver::text,    true);

  -- Create one order using superuser/service-role path to set up
  -- the read-test fixtures (service role bypasses RLS)
  PERFORM test_helper_make_order(v_cust, v_sales, 'placed');
END $$;

-- ── Switch to non-superuser to enforce RLS ──────────────────
SET LOCAL ROLE authenticated;

-- ── READ: every back-office role can SELECT orders ──────────

PERFORM set_config('app.user_id', current_setting('test.admin'), true);
SELECT isnt_empty(
  $$SELECT * FROM orders$$,
  'admin can read orders'
);

PERFORM set_config('app.user_id', current_setting('test.sales'), true);
SELECT isnt_empty(
  $$SELECT * FROM orders$$,
  'sales can read orders'
);

PERFORM set_config('app.user_id', current_setting('test.office'), true);
SELECT isnt_empty(
  $$SELECT * FROM orders$$,
  'office can read orders'
);

PERFORM set_config('app.user_id', current_setting('test.warehouse'), true);
SELECT isnt_empty(
  $$SELECT * FROM orders$$,
  'warehouse can read orders'
);

PERFORM set_config('app.user_id', current_setting('test.butcher'), true);
SELECT isnt_empty(
  $$SELECT * FROM orders$$,
  'butcher can read orders'
);

-- ── READ: driver cannot SELECT orders ──────────────────────

PERFORM set_config('app.user_id', current_setting('test.driver'), true);
SELECT is_empty(
  $$SELECT * FROM orders$$,
  'driver cannot read orders (RLS filters all rows)'
);

-- ── INSERT: sales / office / admin can insert ──────────────

PERFORM set_config('app.user_id', current_setting('test.sales'), true);
SELECT lives_ok(
  format($$
    INSERT INTO orders (customer_id, delivery_date, created_by)
    VALUES (%L, CURRENT_DATE+1, %L);
  $$, current_setting('test.cust'), current_setting('test.sales')),
  'sales can INSERT orders'
);

PERFORM set_config('app.user_id', current_setting('test.office'), true);
SELECT lives_ok(
  format($$
    INSERT INTO orders (customer_id, delivery_date, created_by)
    VALUES (%L, CURRENT_DATE+1, %L);
  $$, current_setting('test.cust'), current_setting('test.office')),
  'office can INSERT orders'
);

PERFORM set_config('app.user_id', current_setting('test.admin'), true);
SELECT lives_ok(
  format($$
    INSERT INTO orders (customer_id, delivery_date, created_by)
    VALUES (%L, CURRENT_DATE+1, %L);
  $$, current_setting('test.cust'), current_setting('test.admin')),
  'admin can INSERT orders'
);

-- ── INSERT: warehouse / butcher / driver cannot insert ─────

PERFORM set_config('app.user_id', current_setting('test.warehouse'), true);
SELECT throws_ok(
  format($$
    INSERT INTO orders (customer_id, delivery_date, created_by)
    VALUES (%L, CURRENT_DATE+1, %L);
  $$, current_setting('test.cust'), current_setting('test.warehouse')),
  '42501',
  NULL,
  'warehouse cannot INSERT orders (RLS denies)'
);

PERFORM set_config('app.user_id', current_setting('test.butcher'), true);
SELECT throws_ok(
  format($$
    INSERT INTO orders (customer_id, delivery_date, created_by)
    VALUES (%L, CURRENT_DATE+1, %L);
  $$, current_setting('test.cust'), current_setting('test.butcher')),
  '42501',
  NULL,
  'butcher cannot INSERT orders (RLS denies)'
);

PERFORM set_config('app.user_id', current_setting('test.driver'), true);
SELECT throws_ok(
  format($$
    INSERT INTO orders (customer_id, delivery_date, created_by)
    VALUES (%L, CURRENT_DATE+1, %L);
  $$, current_setting('test.cust'), current_setting('test.driver')),
  '42501',
  NULL,
  'driver cannot INSERT orders (RLS denies)'
);

-- ── UPDATE placed: sales can edit ──────────────────────────

-- Find the existing placed order
DO $$ DECLARE v_order uuid;
BEGIN
  SELECT id INTO v_order FROM orders WHERE state = 'placed' LIMIT 1;
  PERFORM set_config('test.placed_order', v_order::text, true);
END $$;

PERFORM set_config('app.user_id', current_setting('test.sales'), true);
SELECT lives_ok(
  format($$
    UPDATE orders SET order_notes = 'sales edit' WHERE id = %L;
  $$, current_setting('test.placed_order')),
  'sales can UPDATE placed order'
);

-- ── UPDATE placed: driver cannot edit ──────────────────────

PERFORM set_config('app.user_id', current_setting('test.driver'), true);
SELECT is(
  (WITH u AS (
     UPDATE orders SET order_notes = 'driver edit attempt'
     WHERE id = current_setting('test.placed_order')::uuid
     RETURNING id
   ) SELECT COUNT(*)::int FROM u),
  0,
  'driver UPDATE on placed order is RLS-filtered (no rows affected)'
);

SELECT * FROM finish();
ROLLBACK;
