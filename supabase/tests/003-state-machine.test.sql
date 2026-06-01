-- ============================================================
-- pgTAP: state machine + CHECK constraints
-- ============================================================
-- Verifies the DB-level guards on orders + order_lines:
--   - orders state-machine timestamps are coherent
--   - order_lines: product_id XOR ad_hoc_description
--   - order_lines: quantity > 0
--   - order_lines: done_at and done_by set together
--   - order_lines: unique (order_id, line_number)
-- ============================================================

BEGIN;
SELECT plan(11);

\ir _helpers.sql

-- Test fixtures
DO $$ DECLARE
  v_cust uuid := test_helper_make_customer();
  v_user uuid := test_helper_make_user('sm-tester', 'sales');
  v_prod uuid := test_helper_make_product();
BEGIN
  PERFORM set_config('test.cust', v_cust::text, true);
  PERFORM set_config('test.user', v_user::text, true);
  PERFORM set_config('test.prod', v_prod::text, true);
END $$;

-- ── orders: state-machine CHECK constraint ────────────────────

-- 'placed' allows NULL printed_at + NULL completed_at — happy path
SELECT lives_ok(
  format($$
    INSERT INTO orders (customer_id, delivery_date, created_by)
    VALUES (%L, CURRENT_DATE+1, %L);
  $$, current_setting('test.cust'), current_setting('test.user')),
  'state=placed without printed_at/completed_at is permitted'
);

-- 'printed' WITHOUT printed_at = rejected
SELECT throws_ok(
  format($$
    INSERT INTO orders (customer_id, delivery_date, created_by, state)
    VALUES (%L, CURRENT_DATE+1, %L, 'printed');
  $$, current_setting('test.cust'), current_setting('test.user')),
  '23514',
  NULL,
  'state=printed without printed_at is rejected (check_violation)'
);

-- 'completed' without printed_at = rejected
SELECT throws_ok(
  format($$
    INSERT INTO orders (customer_id, delivery_date, created_by, state, completed_at)
    VALUES (%L, CURRENT_DATE+1, %L, 'completed', now());
  $$, current_setting('test.cust'), current_setting('test.user')),
  '23514',
  NULL,
  'state=completed without printed_at is rejected'
);

-- 'completed' without completed_at = rejected
SELECT throws_ok(
  format($$
    INSERT INTO orders (customer_id, delivery_date, created_by, state, printed_at, printed_by)
    VALUES (%L, CURRENT_DATE+1, %L, 'completed', now(), %L);
  $$, current_setting('test.cust'), current_setting('test.user'), current_setting('test.user')),
  '23514',
  NULL,
  'state=completed without completed_at is rejected'
);

-- ── order_lines: product_id XOR ad_hoc_description ──────────

-- Setup a parent order for line tests
DO $$ DECLARE
  v_order uuid;
BEGIN
  v_order := test_helper_make_order(
    current_setting('test.cust')::uuid,
    current_setting('test.user')::uuid
  );
  PERFORM set_config('test.order', v_order::text, true);
END $$;

-- BOTH set: rejected
SELECT throws_ok(
  format($$
    INSERT INTO order_lines (order_id, line_number, product_id, ad_hoc_description, quantity, uom)
    VALUES (%L, 1, %L, 'cannot have both', 5, 'kg');
  $$, current_setting('test.order'), current_setting('test.prod')),
  '23514',
  NULL,
  'order_lines with both product_id and ad_hoc_description is rejected'
);

-- NEITHER set: rejected
SELECT throws_ok(
  format($$
    INSERT INTO order_lines (order_id, line_number, quantity, uom)
    VALUES (%L, 1, 5, 'kg');
  $$, current_setting('test.order')),
  '23514',
  NULL,
  'order_lines with neither product_id nor ad_hoc_description is rejected'
);

-- Only product_id: allowed
SELECT lives_ok(
  format($$
    INSERT INTO order_lines (order_id, line_number, product_id, quantity, uom)
    VALUES (%L, 1, %L, 5, 'kg');
  $$, current_setting('test.order'), current_setting('test.prod')),
  'order_lines with only product_id is permitted'
);

-- Only ad_hoc_description: allowed
SELECT lives_ok(
  format($$
    INSERT INTO order_lines (order_id, line_number, ad_hoc_description, quantity, uom)
    VALUES (%L, 2, 'one-off', 2, 'unit');
  $$, current_setting('test.order')),
  'order_lines with only ad_hoc_description is permitted'
);

-- ── order_lines: quantity > 0 ───────────────────────────────

SELECT throws_ok(
  format($$
    INSERT INTO order_lines (order_id, line_number, ad_hoc_description, quantity, uom)
    VALUES (%L, 3, 'zero qty', 0, 'kg');
  $$, current_setting('test.order')),
  '23514',
  NULL,
  'order_lines with quantity = 0 is rejected'
);

-- ── order_lines: unique (order_id, line_number) ─────────────

SELECT throws_ok(
  format($$
    INSERT INTO order_lines (order_id, line_number, ad_hoc_description, quantity, uom)
    VALUES (%L, 1, 'duplicate line number', 1, 'kg');
  $$, current_setting('test.order')),
  '23505',
  NULL,
  'order_lines with duplicate (order_id, line_number) is rejected'
);

-- ── order_lines: done_at / done_by paired ───────────────────

SELECT throws_ok(
  format($$
    INSERT INTO order_lines (order_id, line_number, ad_hoc_description, quantity, uom, done_at, done_by)
    VALUES (%L, 99, 'half-done', 1, 'kg', now(), NULL);
  $$, current_setting('test.order')),
  '23514',
  NULL,
  'order_lines with done_at set but done_by NULL is rejected'
);

SELECT * FROM finish();
ROLLBACK;
