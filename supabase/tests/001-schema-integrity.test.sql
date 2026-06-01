-- ============================================================
-- pgTAP: schema integrity for order-pipeline
-- ============================================================
-- Verifies tables exist, RLS is enabled on each, enum values are
-- exactly what the migration declared, and indexes exist.
-- ============================================================

BEGIN;
SELECT plan(20);

\i supabase/tests/_helpers.sql

-- ── Tables exist ─────────────────────────────────────────────

SELECT has_table('public', 'orders',            'orders table exists');
SELECT has_table('public', 'order_lines',       'order_lines table exists');
SELECT has_table('public', 'order_audit_log',   'order_audit_log table exists');

-- ── RLS enabled on every table ──────────────────────────────

SELECT is(
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'orders'),
  true,
  'RLS enabled on orders'
);
SELECT is(
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'order_lines'),
  true,
  'RLS enabled on order_lines'
);
SELECT is(
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'order_audit_log'),
  true,
  'RLS enabled on order_audit_log'
);

-- ── Enum values exactly match the spec ──────────────────────

SELECT set_eq(
  $$SELECT unnest(enum_range(NULL::order_state))::text$$,
  ARRAY['placed', 'printed', 'completed'],
  'order_state enum has exactly placed/printed/completed'
);

SELECT set_eq(
  $$SELECT unnest(enum_range(NULL::order_uom))::text$$,
  ARRAY['kg', 'unit'],
  'order_uom enum has exactly kg/unit'
);

SELECT set_eq(
  $$SELECT unnest(enum_range(NULL::order_audit_action))::text$$,
  ARRAY['created', 'edited', 'printed', 'reprinted',
        'line_added', 'line_edited', 'line_done', 'completed'],
  'order_audit_action enum has all 8 values'
);

-- ── Indexes exist on key columns ────────────────────────────

SELECT has_index('public', 'orders',      'orders_delivery_date_idx', 'orders has index on delivery_date');
SELECT has_index('public', 'orders',      'orders_state_idx',         'orders has index on state');
SELECT has_index('public', 'orders',      'orders_customer_id_idx',   'orders has index on customer_id');
SELECT has_index('public', 'order_lines', 'order_lines_order_id_idx', 'order_lines has index on order_id');
SELECT has_index('public', 'order_audit_log', 'order_audit_log_order_id_idx', 'audit log has index on order_id');

-- ── Sequence + reference generator exist ────────────────────

SELECT has_sequence('public', 'order_reference_seq', 'order_reference_seq exists');
SELECT has_function('public', 'generate_order_reference', ARRAY[]::text[],
                    'generate_order_reference() exists');

-- ── Trigger functions + triggers exist ──────────────────────

SELECT has_function('public', 'orders_audit_trigger', ARRAY[]::text[],
                    'orders_audit_trigger function exists');
SELECT has_function('public', 'order_lines_audit_trigger', ARRAY[]::text[],
                    'order_lines_audit_trigger function exists');

SELECT is(
  (SELECT COUNT(*)::int FROM pg_trigger WHERE tgname = 'orders_audit' AND NOT tgisinternal),
  1,
  'orders_audit trigger is attached to orders'
);
SELECT is(
  (SELECT COUNT(*)::int FROM pg_trigger WHERE tgname = 'order_lines_audit' AND NOT tgisinternal),
  1,
  'order_lines_audit trigger is attached to order_lines'
);

SELECT * FROM finish();
ROLLBACK;
