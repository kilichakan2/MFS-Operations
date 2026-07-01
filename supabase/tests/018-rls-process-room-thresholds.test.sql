-- ============================================================
-- pgTAP: RLS on haccp_process_room_thresholds + haccp_threshold_audit
-- (20260701120000_haccp_process_room_thresholds.sql)
-- ============================================================
-- Proves the deliberate divergence from the 30-table active-only HACCP pattern:
--
--   - RLS is ENABLED on both new tables.
--   - haccp_process_room_thresholds: any ACTIVE staff member can SELECT the
--     limits, but only an ADMIN can INSERT / UPDATE / DELETE (is_admin() at the
--     DB — defense-in-depth beyond the route's isAdmin gate). A non-admin write
--     is denied AT THE DATABASE (INSERT → 42501; UPDATE/DELETE → 0 rows, no-op).
--   - haccp_threshold_audit: only an admin can SELECT / INSERT; there is NO
--     UPDATE/DELETE policy → the trail is IMMUTABLE (even an admin's UPDATE /
--     DELETE matches 0 rows).
--   - The band CHECK (target_temp_c <= max_temp_c) rejects an inverted row.
--
-- The seed rows (Product core 4/7, Room ambient 12/15) are installed by the
-- migration, so this test reads the live 'Product core' row as its target.
-- ============================================================

BEGIN;

SELECT plan(15);

\ir _helpers.sql

-- Fixtures: one ADMIN user, one non-admin ACTIVE user (office). Read the seeded
-- 'Product core' row id. All via the owner (bypass) path before SET ROLE.
DO $$ DECLARE
  v_admin   uuid := test_helper_make_user('rls-thr-admin', 'admin');
  v_office  uuid := test_helper_make_user('rls-thr-office', 'office');
  v_product uuid;
BEGIN
  PERFORM set_config('test.admin', v_admin::text, true);
  PERFORM set_config('test.office', v_office::text, true);
  SELECT id INTO v_product FROM haccp_process_room_thresholds WHERE name = 'Product core';
  PERFORM set_config('test.product', v_product::text, true);
END $$;

-- ── 1) RLS enabled on both tables + band CHECK (3 assertions, owner path) ────
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'haccp_process_room_thresholds'),
  'RLS is enabled on haccp_process_room_thresholds');
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'haccp_threshold_audit'),
  'RLS is enabled on haccp_threshold_audit');
SELECT throws_ok(
  $$INSERT INTO haccp_process_room_thresholds (name, target_temp_c, max_temp_c)
    VALUES ('rls-bad-band', 9.0, 5.0)$$,
  '23514', NULL,
  'band CHECK rejects an inverted row (target > max)');

-- ── Switch to the per-request authenticated role to enforce RLS ─────────────
SET LOCAL ROLE authenticated;

-- ── 2) NON-ADMIN active staff: read yes, write no (6 assertions) ────────────
SELECT set_config('app.current_user_id', current_setting('test.office'), true);

SELECT isnt_empty($$SELECT * FROM haccp_process_room_thresholds$$,
  'non-admin active staff CAN SELECT thresholds');
SELECT throws_ok(
  $$INSERT INTO haccp_process_room_thresholds (name, target_temp_c, max_temp_c)
    VALUES ('rls-deny', 1.0, 2.0)$$,
  '42501', NULL,
  'non-admin denied INSERT thresholds (42501)');

-- UPDATE / DELETE under an is_admin()-USING policy match 0 rows for a non-admin
-- (silent no-op, not a throw) — prove the row is untouched.
UPDATE haccp_process_room_thresholds SET target_temp_c = 99
  WHERE id = current_setting('test.product')::uuid;
SELECT is(
  (SELECT target_temp_c::text FROM haccp_process_room_thresholds WHERE id = current_setting('test.product')::uuid),
  '4.0',
  'non-admin UPDATE of a threshold is a no-op (row unchanged)');

DELETE FROM haccp_process_room_thresholds WHERE id = current_setting('test.product')::uuid;
SELECT isnt_empty(
  format($$SELECT * FROM haccp_process_room_thresholds WHERE id = %L$$, current_setting('test.product')),
  'non-admin DELETE of a threshold is a no-op (row still present)');

SELECT is_empty($$SELECT * FROM haccp_threshold_audit$$,
  'non-admin CANNOT SELECT the audit log');
SELECT throws_ok(
  format($$INSERT INTO haccp_threshold_audit (threshold_id, changed_by, new_target_temp_c)
    VALUES (%L, %L, 3.0)$$, current_setting('test.product'), current_setting('test.office')),
  '42501', NULL,
  'non-admin denied INSERT into the audit log (42501)');

-- ── 3) ADMIN: can update a threshold + write/read the audit (4 assertions) ──
SELECT set_config('app.current_user_id', current_setting('test.admin'), true);

SELECT lives_ok(
  format($$UPDATE haccp_process_room_thresholds SET target_temp_c = 3.0 WHERE id = %L$$,
    current_setting('test.product')),
  'admin CAN UPDATE a threshold');
SELECT is(
  (SELECT target_temp_c::text FROM haccp_process_room_thresholds WHERE id = current_setting('test.product')::uuid),
  '3.0',
  'admin UPDATE actually changed the threshold');
SELECT lives_ok(
  format($$INSERT INTO haccp_threshold_audit (threshold_id, changed_by, old_target_temp_c, new_target_temp_c)
    VALUES (%L, %L, 4.0, 3.0)$$, current_setting('test.product'), current_setting('test.admin')),
  'admin CAN INSERT an audit row');
SELECT isnt_empty($$SELECT * FROM haccp_threshold_audit$$,
  'admin CAN SELECT the audit log');

-- ── 4) Audit immutability: even an admin cannot UPDATE/DELETE it (2 assertions)
UPDATE haccp_threshold_audit SET new_target_temp_c = 99
  WHERE threshold_id = current_setting('test.product')::uuid;
SELECT is(
  (SELECT new_target_temp_c::text FROM haccp_threshold_audit
     WHERE threshold_id = current_setting('test.product')::uuid LIMIT 1),
  '3.0',
  'audit log is immutable — admin UPDATE is a no-op (no UPDATE policy)');
DELETE FROM haccp_threshold_audit WHERE threshold_id = current_setting('test.product')::uuid;
SELECT isnt_empty($$SELECT * FROM haccp_threshold_audit$$,
  'audit log is immutable — admin DELETE is a no-op (no DELETE policy)');

RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
