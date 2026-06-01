-- ============================================================
-- pgTAP: order reference generator
-- ============================================================
-- Verifies generate_order_reference() produces MFS-YYYY-NNNN
-- format, sequential numbering, correct year, and is set as the
-- DEFAULT on the orders.reference column.
-- ============================================================

BEGIN;
SELECT plan(7);

\i supabase/tests/_helpers.sql

-- Reset the sequence for a deterministic test. The whole test
-- runs inside this transaction and ROLLBACKs at the end, so this
-- does not affect anything outside.
ALTER SEQUENCE order_reference_seq RESTART WITH 1;

-- ── Generated format ────────────────────────────────────────

SELECT matches(
  generate_order_reference(),
  '^MFS-\d{4}-\d{4}$',
  'generate_order_reference produces MFS-YYYY-NNNN format'
);

-- The first call after RESTART WITH 1 should give us a known
-- year (current) and sequence ending in 0002 (we just called 0001)
-- — but rather than couple to today's year, assert that the year
-- in the reference matches the current year.
SELECT is(
  substring(generate_order_reference() FROM '^MFS-(\d{4})-'),
  EXTRACT(YEAR FROM CURRENT_DATE)::text,
  'Year in reference matches CURRENT_DATE year'
);

-- ── Sequence is strictly monotonic ──────────────────────────

ALTER SEQUENCE order_reference_seq RESTART WITH 100;
SELECT is(
  generate_order_reference(),
  format('MFS-%s-0100', EXTRACT(YEAR FROM CURRENT_DATE)::text),
  'Sequence position 100 produces ...0100'
);
SELECT is(
  generate_order_reference(),
  format('MFS-%s-0101', EXTRACT(YEAR FROM CURRENT_DATE)::text),
  'Sequence increments to ...0101'
);

-- ── Padding to 4 digits ─────────────────────────────────────

ALTER SEQUENCE order_reference_seq RESTART WITH 7;
SELECT is(
  generate_order_reference(),
  format('MFS-%s-0007', EXTRACT(YEAR FROM CURRENT_DATE)::text),
  'Single-digit sequence is padded to 4 digits'
);

-- ── Used as DEFAULT on orders.reference ─────────────────────

SELECT col_default_is(
  'public', 'orders', 'reference',
  'generate_order_reference()',
  'orders.reference has generate_order_reference() as DEFAULT'
);

-- ── Inserting an order picks up the generated reference ─────

ALTER SEQUENCE order_reference_seq RESTART WITH 500;
WITH new_order AS (
  INSERT INTO orders (customer_id, delivery_date, created_by)
  SELECT
    test_helper_make_customer('ref-test cust'),
    CURRENT_DATE + 1,
    test_helper_make_user('ref-test user', 'sales')
  RETURNING reference
)
SELECT is(
  (SELECT reference FROM new_order),
  format('MFS-%s-0500', EXTRACT(YEAR FROM CURRENT_DATE)::text),
  'Insert uses generated reference automatically'
);

SELECT * FROM finish();
ROLLBACK;
