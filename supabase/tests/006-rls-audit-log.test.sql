-- ============================================================
-- pgTAP: RLS on order_audit_log
-- ============================================================
-- The audit log is append-only via triggers. Verify:
--   - Direct INSERTs from any non-service-role connection are rejected
--   - SELECT is permitted only for admin + office
--   - All other roles see no rows (RLS-filtered)
-- ============================================================

BEGIN;
SELECT plan(6);

\ir _helpers.sql

DO $$ DECLARE
  v_cust    uuid := test_helper_make_customer();
  v_admin   uuid := test_helper_make_user('audit-rls-admin',     'admin');
  v_sales   uuid := test_helper_make_user('audit-rls-sales',     'sales');
  v_office  uuid := test_helper_make_user('audit-rls-office',    'office');
  v_butcher uuid := test_helper_make_user('audit-rls-butcher',   'butcher');
  v_order   uuid;
BEGIN
  PERFORM set_config('test.cust',    v_cust::text,    true);
  PERFORM set_config('test.admin',   v_admin::text,   true);
  PERFORM set_config('test.sales',   v_sales::text,   true);
  PERFORM set_config('test.office',  v_office::text,  true);
  PERFORM set_config('test.butcher', v_butcher::text, true);

  -- Create an order to generate an audit row via the trigger
  v_order := test_helper_make_order(v_cust, v_sales, 'placed');
  PERFORM set_config('test.order', v_order::text, true);
END $$;

-- ── Switch to authenticated role to enforce RLS ─────────────
SET LOCAL ROLE authenticated;

-- ── Audit log has 1 row from trigger fire ───────────────────
-- (Run as admin so RLS doesn't filter the row out before we count)

PERFORM set_config('app.user_id', current_setting('test.admin'), true);
SELECT is(
  (SELECT COUNT(*)::int FROM order_audit_log
   WHERE order_id = current_setting('test.order')::uuid),
  1,
  'admin can read audit log entry (trigger fired on order INSERT)'
);

-- ── Office can also read ───────────────────────────────────

PERFORM set_config('app.user_id', current_setting('test.office'), true);
SELECT is(
  (SELECT COUNT(*)::int FROM order_audit_log
   WHERE order_id = current_setting('test.order')::uuid),
  1,
  'office can read audit log entries'
);

-- ── Sales / butcher cannot read ───────────────────────────

PERFORM set_config('app.user_id', current_setting('test.sales'), true);
SELECT is_empty(
  format($$SELECT * FROM order_audit_log WHERE order_id = %L$$,
         current_setting('test.order')),
  'sales cannot read audit log (RLS filters all rows)'
);

PERFORM set_config('app.user_id', current_setting('test.butcher'), true);
SELECT is_empty(
  format($$SELECT * FROM order_audit_log WHERE order_id = %L$$,
         current_setting('test.order')),
  'butcher cannot read audit log (RLS filters all rows)'
);

-- ── Direct INSERT (any role) is rejected ───────────────────
-- The order_audit_log_insert policy is WITH CHECK (false), so
-- non-trigger inserts always fail regardless of role.

PERFORM set_config('app.user_id', current_setting('test.admin'), true);
SELECT throws_ok(
  format($$
    INSERT INTO order_audit_log (order_id, user_id, action, payload)
    VALUES (%L, %L, 'edited', '{}'::jsonb);
  $$, current_setting('test.order'), current_setting('test.admin')),
  '42501',
  NULL,
  'direct INSERT into audit log is blocked even for admin (policy WITH CHECK false)'
);

-- ── Audit row from trigger contains the correct action ──────

PERFORM set_config('app.user_id', current_setting('test.admin'), true);
SELECT is(
  (SELECT action::text FROM order_audit_log
   WHERE order_id = current_setting('test.order')::uuid LIMIT 1),
  'created',
  'trigger-inserted audit row has action=created for the new order'
);

SELECT * FROM finish();
ROLLBACK;
