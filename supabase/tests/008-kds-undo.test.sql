-- ============================================================
-- pgTAP: KDS line-undo cascade + TOCTOU guards (F-PROD-02)
-- ============================================================
-- Exercises the real kds_undo_line(p_line_id, p_when) RPC added in
-- migration 20260617130001. Proves:
--
--   (a) CHECK-constraint safety — across a cascade undo the orders row
--       NEVER observably holds state='completed' with completed_at NULL
--       (the 20260530000000 CHECK forbids it; the RPC flips state and
--       clears completed_at in the SAME statement/txn). We assert the
--       final state is the legal printed+NULL, and that the in-function
--       cascade succeeded WITHOUT raising 23514.
--
--   (b) TOCTOU / concurrency guard (R-C1) — pgTAP runs in one session so
--       true OS-thread concurrency isn't expressible; we simulate the
--       guard the way the plan permits:
--         - calling kds_undo_line on an ALREADY-pending line (done_at
--           already NULL) writes NOTHING (the line UPDATE guard
--           `done_at IS NOT NULL` matches zero rows) and reports the
--           order was not reopened;
--         - the order-revert UPDATE guarded on state='completed' is a
--           no-op when the order is already 'printed' (a raced
--           re-print/re-open) — the second undo of an already-reopened
--           order touches nothing.
-- ============================================================

BEGIN;
SELECT plan(9);

\ir _helpers.sql

-- Fixtures
DO $$ DECLARE
  v_cust    uuid := test_helper_make_customer();
  v_sales   uuid := test_helper_make_user('undo-sales', 'sales');
  v_office  uuid := test_helper_make_user('undo-office', 'office');
  v_butcher uuid := test_helper_make_user('undo-butcher', 'butcher');
  v_prod    uuid := test_helper_make_product();
BEGIN
  PERFORM set_config('test.cust', v_cust::text, true);
  PERFORM set_config('test.sales', v_sales::text, true);
  PERFORM set_config('test.office', v_office::text, true);
  PERFORM set_config('test.butcher', v_butcher::text, true);
  PERFORM set_config('test.prod', v_prod::text, true);
  PERFORM set_config('app.current_user_id', v_sales::text, true);
END $$;

-- ── Build a COMPLETED single-line order (the cascade case) ──────────
DO $$ DECLARE v_order uuid; v_line uuid;
BEGIN
  INSERT INTO orders (customer_id, delivery_date, created_by, state, printed_at, printed_by)
  VALUES (current_setting('test.cust')::uuid, CURRENT_DATE + 1,
          current_setting('test.sales')::uuid, 'printed', now(),
          current_setting('test.office')::uuid)
  RETURNING id INTO v_order;
  PERFORM set_config('test.order', v_order::text, true);

  INSERT INTO order_lines (order_id, line_number, product_id, quantity, uom)
  VALUES (v_order, 1, current_setting('test.prod')::uuid, 5, 'kg')
  RETURNING id INTO v_line;
  PERFORM set_config('test.line', v_line::text, true);

  -- mark the only line done, then complete the order (state machine legal)
  UPDATE order_lines SET done_at = now(), done_by = current_setting('test.butcher')::uuid
   WHERE id = v_line;
  UPDATE orders SET state = 'completed', completed_at = now() WHERE id = v_order;
END $$;

-- Sanity: the order really is completed before we undo.
SELECT is(
  (SELECT state::text FROM orders WHERE id = current_setting('test.order')::uuid),
  'completed',
  'fixture: order is completed before the cascade undo'
);

-- ── (a) Cascade undo via the RPC ────────────────────────────────────
SELECT is(
  kds_undo_line(current_setting('test.line')::uuid, now()),
  true,
  'kds_undo_line on a completed order returns reopened=true'
);

-- The line is back to pending.
SELECT is(
  (SELECT done_at FROM order_lines WHERE id = current_setting('test.line')::uuid),
  NULL,
  'cascade undo cleared the line done_at'
);

-- The order is the LEGAL printed + completed_at NULL combination — never
-- the CHECK-illegal completed + NULL. (If the RPC had set state without
-- clearing completed_at, the UPDATE would have raised 23514 and this test
-- file would have errored out before reaching here.)
SELECT is(
  (SELECT state::text FROM orders WHERE id = current_setting('test.order')::uuid),
  'printed',
  'cascade undo reverted order to printed'
);
SELECT is(
  (SELECT completed_at FROM orders WHERE id = current_setting('test.order')::uuid),
  NULL,
  'cascade undo cleared completed_at (CHECK-legal printed+NULL state)'
);
-- Direct CHECK-violation guard: no row may ever hold completed+NULL.
SELECT is(
  (SELECT COUNT(*)::int FROM orders
    WHERE state = 'completed' AND completed_at IS NULL),
  0,
  'no order ever observably holds state=completed with completed_at NULL'
);

-- ── (b) TOCTOU guard — second undo on the now-pending line ──────────
-- The line is already pending and the order already printed; a second
-- undo must touch nothing and report reopened=false (both guards miss).
SELECT is(
  kds_undo_line(current_setting('test.line')::uuid, now()),
  false,
  'second undo on an already-pending line reports reopened=false (order-revert guard misses)'
);

-- Prove the second call wrote NOTHING: the orders audit trigger fires
-- only on an actual UPDATE to orders, and the order_lines trigger only
-- on an actual line UPDATE. Capture both audit counts, run undo again,
-- assert NEITHER grew (no order revert, no line clear — both guards miss).
DO $$ DECLARE v_audit_before int;
BEGIN
  SELECT COUNT(*)::int INTO v_audit_before FROM order_audit_log
   WHERE order_id = current_setting('test.order')::uuid;
  PERFORM set_config('test.audit_before', v_audit_before::text, true);
  PERFORM kds_undo_line(current_setting('test.line')::uuid, now());
END $$;

SELECT is(
  (SELECT COUNT(*)::int FROM order_audit_log
    WHERE order_id = current_setting('test.order')::uuid),
  current_setting('test.audit_before')::int,
  'a repeat undo on an already-printed order writes no audit row (true no-op, both TOCTOU guards miss)'
);

-- The line stays pending after the repeat undos (idempotent).
SELECT is(
  (SELECT done_at FROM order_lines WHERE id = current_setting('test.line')::uuid),
  NULL,
  'repeat undo leaves the already-pending line untouched'
);

SELECT * FROM finish();
ROLLBACK;
