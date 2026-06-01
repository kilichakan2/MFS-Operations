-- ============================================================
-- pgTAP: audit log triggers
-- ============================================================
-- Verifies the audit triggers on orders + order_lines emit the
-- right actions for each operation:
--   - INSERT on orders         → 'created'
--   - state transition printed → 'printed'
--   - reprint (printed_at change while state=printed) → 'reprinted'
--   - state transition completed → 'completed'
--   - other UPDATE on orders   → 'edited'
--   - INSERT on order_lines    → 'line_added'
--   - UPDATE on order_lines    → 'line_edited'
--   - done_at set on order_lines (was NULL) → 'line_done'
-- ============================================================

BEGIN;
SELECT plan(8);

\i supabase/tests/_helpers.sql

-- Fixtures
DO $$ DECLARE
  v_cust uuid := test_helper_make_customer();
  v_sales uuid := test_helper_make_user('audit-sales', 'sales');
  v_office uuid := test_helper_make_user('audit-office', 'office');
  v_butcher uuid := test_helper_make_user('audit-butcher', 'butcher');
  v_prod uuid := test_helper_make_product();
BEGIN
  PERFORM set_config('test.cust', v_cust::text, true);
  PERFORM set_config('test.sales', v_sales::text, true);
  PERFORM set_config('test.office', v_office::text, true);
  PERFORM set_config('test.butcher', v_butcher::text, true);
  PERFORM set_config('test.prod', v_prod::text, true);
END $$;

-- ── Order INSERT emits 'created' ────────────────────────────

DO $$ DECLARE v_order uuid;
BEGIN
  PERFORM set_config('app.user_id', current_setting('test.sales'), true);
  INSERT INTO orders (customer_id, delivery_date, created_by)
  VALUES (current_setting('test.cust')::uuid, CURRENT_DATE + 1, current_setting('test.sales')::uuid)
  RETURNING id INTO v_order;
  PERFORM set_config('test.order', v_order::text, true);
END $$;

SELECT is(
  (SELECT action::text FROM order_audit_log
   WHERE order_id = current_setting('test.order')::uuid),
  'created',
  'order INSERT emits created audit row'
);

-- ── Order line INSERT emits 'line_added' ────────────────────

INSERT INTO order_lines (order_id, line_number, product_id, quantity, uom)
VALUES (current_setting('test.order')::uuid, 1, current_setting('test.prod')::uuid, 5, 'kg');

SELECT is(
  (SELECT COUNT(*)::int FROM order_audit_log
   WHERE order_id = current_setting('test.order')::uuid AND action = 'line_added'),
  1,
  'order_line INSERT emits line_added audit row'
);

-- ── State transition placed → printed emits 'printed' ───────

UPDATE orders
SET state = 'printed', printed_at = now(), printed_by = current_setting('test.office')::uuid
WHERE id = current_setting('test.order')::uuid;

SELECT is(
  (SELECT COUNT(*)::int FROM order_audit_log
   WHERE order_id = current_setting('test.order')::uuid AND action = 'printed'),
  1,
  'printed transition emits printed audit row'
);

-- ── Reprint (printed_at changes while still printed) → 'reprinted' ──

UPDATE orders
SET printed_at = now() + interval '1 second',
    printed_by = current_setting('test.office')::uuid
WHERE id = current_setting('test.order')::uuid;

SELECT is(
  (SELECT COUNT(*)::int FROM order_audit_log
   WHERE order_id = current_setting('test.order')::uuid AND action = 'reprinted'),
  1,
  'reprint emits reprinted audit row (not duplicate printed)'
);

-- ── Line marked done emits 'line_done' ──────────────────────

UPDATE order_lines
SET done_at = now(), done_by = current_setting('test.butcher')::uuid
WHERE order_id = current_setting('test.order')::uuid AND line_number = 1;

SELECT is(
  (SELECT COUNT(*)::int FROM order_audit_log
   WHERE order_id = current_setting('test.order')::uuid AND action = 'line_done'),
  1,
  'line done emits line_done audit row'
);

-- ── State transition printed → completed emits 'completed' ──

UPDATE orders SET state = 'completed', completed_at = now()
WHERE id = current_setting('test.order')::uuid;

SELECT is(
  (SELECT COUNT(*)::int FROM order_audit_log
   WHERE order_id = current_setting('test.order')::uuid AND action = 'completed'),
  1,
  'completed transition emits completed audit row'
);

-- ── Other update on orders emits 'edited' ───────────────────

-- Create a fresh placed order, edit a non-state field
DO $$ DECLARE v_order uuid;
BEGIN
  INSERT INTO orders (customer_id, delivery_date, created_by, order_notes)
  VALUES (current_setting('test.cust')::uuid, CURRENT_DATE + 1, current_setting('test.sales')::uuid, 'original')
  RETURNING id INTO v_order;
  PERFORM set_config('test.order2', v_order::text, true);

  UPDATE orders SET order_notes = 'edited' WHERE id = v_order;
END $$;

SELECT is(
  (SELECT COUNT(*)::int FROM order_audit_log
   WHERE order_id = current_setting('test.order2')::uuid AND action = 'edited'),
  1,
  'non-state UPDATE on orders emits edited audit row'
);

-- ── Full lifecycle audit ordering ───────────────────────────

SELECT is(
  (SELECT string_agg(action::text, ',' ORDER BY created_at, id)
   FROM order_audit_log
   WHERE order_id = current_setting('test.order')::uuid),
  'created,line_added,printed,reprinted,line_done,completed',
  'Full lifecycle audit trail captures all events in order'
);

SELECT * FROM finish();
ROLLBACK;
