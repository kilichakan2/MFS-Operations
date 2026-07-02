-- ============================================================
-- pgTAP: RLS on haccp_goods_in_thresholds + haccp_goods_in_threshold_audit
-- (20260702120000_haccp_goods_in_thresholds.sql)
-- ============================================================
-- Proves the deliberate divergence from the 30-table active-only HACCP pattern
-- (mirror of 018-rls-process-room-thresholds.test.sql):
--
--   - RLS is ENABLED on both new tables.
--   - haccp_goods_in_thresholds: any ACTIVE staff member can SELECT the limits,
--     but only an ADMIN can INSERT / UPDATE / DELETE (is_admin() at the DB —
--     defense-in-depth beyond the route's isAdmin gate). A non-admin write is
--     denied AT THE DATABASE (INSERT → 42501; UPDATE/DELETE → 0 rows, no-op).
--   - haccp_goods_in_threshold_audit: only an admin can SELECT / INSERT; there
--     is NO UPDATE/DELETE policy → the trail is IMMUTABLE (even an admin's
--     UPDATE / DELETE matches 0 rows).
--   - The band CHECK rejects an inverted row (amber < pass) AND an amber band
--     with no pass line beneath it (the nullable-band divergence from CCP-3).
--
-- The 11 seed rows are installed by the migration, so this test reads the live
-- 'poultry' row (THE FIX: 4.0 / 5.0) as its target.
-- ============================================================

BEGIN;

SELECT plan(16);

\ir _helpers.sql

-- Fixtures: one ADMIN user, one non-admin ACTIVE user (office). Read the seeded
-- 'poultry' row id. All via the owner (bypass) path before SET ROLE.
DO $$ DECLARE
  v_admin   uuid := test_helper_make_user('rls-gith-admin', 'admin');
  v_office  uuid := test_helper_make_user('rls-gith-office', 'office');
  v_poultry uuid;
BEGIN
  PERFORM set_config('test.admin', v_admin::text, true);
  PERFORM set_config('test.office', v_office::text, true);
  SELECT id INTO v_poultry FROM haccp_goods_in_thresholds WHERE category = 'poultry';
  PERFORM set_config('test.poultry', v_poultry::text, true);
END $$;

-- ── 1) RLS enabled on both tables + band CHECK (4 assertions, owner path) ────
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'haccp_goods_in_thresholds'),
  'RLS is enabled on haccp_goods_in_thresholds');
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'haccp_goods_in_threshold_audit'),
  'RLS is enabled on haccp_goods_in_threshold_audit');
SELECT throws_ok(
  $$INSERT INTO haccp_goods_in_thresholds (category, label, pass_max_c, amber_max_c)
    VALUES ('rls-bad-band', 'Bad band', 9.0, 5.0)$$,
  '23514', NULL,
  'band CHECK rejects an inverted row (amber < pass)');
SELECT throws_ok(
  $$INSERT INTO haccp_goods_in_thresholds (category, label, pass_max_c, amber_max_c)
    VALUES ('rls-bad-band2', 'Bad band 2', NULL, 5.0)$$,
  '23514', NULL,
  'band CHECK rejects an amber band with no pass line (pass NULL, amber set)');

-- ── Switch to the per-request authenticated role to enforce RLS ─────────────
SET LOCAL ROLE authenticated;

-- ── 2) NON-ADMIN active staff: read yes, write no (6 assertions) ────────────
SELECT set_config('app.current_user_id', current_setting('test.office'), true);

SELECT isnt_empty($$SELECT * FROM haccp_goods_in_thresholds$$,
  'non-admin active staff CAN SELECT thresholds');
SELECT throws_ok(
  $$INSERT INTO haccp_goods_in_thresholds (category, label, pass_max_c, amber_max_c)
    VALUES ('rls-deny', 'Deny', 1.0, 2.0)$$,
  '42501', NULL,
  'non-admin denied INSERT thresholds (42501)');

-- UPDATE / DELETE under an is_admin()-USING policy match 0 rows for a non-admin
-- (silent no-op, not a throw) — prove the row is untouched.
UPDATE haccp_goods_in_thresholds SET pass_max_c = 99
  WHERE id = current_setting('test.poultry')::uuid;
SELECT is(
  (SELECT pass_max_c::text FROM haccp_goods_in_thresholds WHERE id = current_setting('test.poultry')::uuid),
  '4.0',
  'non-admin UPDATE of a threshold is a no-op (row unchanged)');

DELETE FROM haccp_goods_in_thresholds WHERE id = current_setting('test.poultry')::uuid;
SELECT isnt_empty(
  format($$SELECT * FROM haccp_goods_in_thresholds WHERE id = %L$$, current_setting('test.poultry')),
  'non-admin DELETE of a threshold is a no-op (row still present)');

SELECT is_empty($$SELECT * FROM haccp_goods_in_threshold_audit$$,
  'non-admin CANNOT SELECT the audit log');
SELECT throws_ok(
  format($$INSERT INTO haccp_goods_in_threshold_audit (threshold_id, changed_by, new_pass_max_c)
    VALUES (%L, %L, 3.0)$$, current_setting('test.poultry'), current_setting('test.office')),
  '42501', NULL,
  'non-admin denied INSERT into the audit log (42501)');

-- ── 3) ADMIN: can update a threshold + write/read the audit (4 assertions) ──
SELECT set_config('app.current_user_id', current_setting('test.admin'), true);

SELECT lives_ok(
  format($$UPDATE haccp_goods_in_thresholds SET pass_max_c = 3.0 WHERE id = %L$$,
    current_setting('test.poultry')),
  'admin CAN UPDATE a threshold');
SELECT is(
  (SELECT pass_max_c::text FROM haccp_goods_in_thresholds WHERE id = current_setting('test.poultry')::uuid),
  '3.0',
  'admin UPDATE actually changed the threshold');
SELECT lives_ok(
  format($$INSERT INTO haccp_goods_in_threshold_audit (threshold_id, changed_by, old_pass_max_c, new_pass_max_c)
    VALUES (%L, %L, 4.0, 3.0)$$, current_setting('test.poultry'), current_setting('test.admin')),
  'admin CAN INSERT an audit row');
SELECT isnt_empty($$SELECT * FROM haccp_goods_in_threshold_audit$$,
  'admin CAN SELECT the audit log');

-- ── 4) Audit immutability: even an admin cannot UPDATE/DELETE it (2 assertions)
-- Assertions key on THIS test's own row (changed_by = the fixture admin created
-- in this transaction) — never LIMIT 1 over the whole threshold_id, which is
-- order-dependent on a dirty DB (the integration suite commits real poultry
-- audit rows; ANVIL 2026-07-02 caught the LIMIT 1 read picking one of those).
UPDATE haccp_goods_in_threshold_audit SET new_pass_max_c = 99
  WHERE threshold_id = current_setting('test.poultry')::uuid;
SELECT is(
  (SELECT new_pass_max_c::text FROM haccp_goods_in_threshold_audit
     WHERE threshold_id = current_setting('test.poultry')::uuid
       AND changed_by = current_setting('test.admin')::uuid),
  '3.0',
  'audit log is immutable — admin UPDATE is a no-op (no UPDATE policy)');
DELETE FROM haccp_goods_in_threshold_audit WHERE threshold_id = current_setting('test.poultry')::uuid;
SELECT isnt_empty(
  format($$SELECT * FROM haccp_goods_in_threshold_audit WHERE changed_by = %L$$,
    current_setting('test.admin')),
  'audit log is immutable — admin DELETE is a no-op (no DELETE policy)');

RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
