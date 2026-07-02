-- ============================================================
-- pgTAP: RLS on haccp_mince_thresholds + haccp_mince_threshold_audit
-- (20260702150000_haccp_mince_thresholds.sql)
-- ============================================================
-- Proves the deliberate divergence from the 30-table active-only HACCP pattern
-- (mirror of 019-rls-goods-in-thresholds.test.sql):
--
--   - RLS is ENABLED on both new tables.
--   - haccp_mince_thresholds: any ACTIVE staff member can SELECT the limits,
--     but only an ADMIN can INSERT / UPDATE / DELETE (is_admin() at the DB —
--     defense-in-depth beyond the route's isAdmin gate). A non-admin write is
--     denied AT THE DATABASE (INSERT → 42501; UPDATE/DELETE → 0 rows, no-op).
--   - haccp_mince_threshold_audit: only an admin can SELECT / INSERT; there
--     is NO UPDATE/DELETE policy → the trail is IMMUTABLE (even an admin's
--     UPDATE / DELETE matches 0 rows).
--   - The band CHECK rejects an inverted row (amber < pass) AND an amber band
--     with no pass line beneath it; the kill-binary CHECK rejects ANY amber
--     value on a kill_days row (kill-day grading is structurally binary).
--
-- The 9 seed rows are installed by the migration, so this test reads the live
-- 'mince_input' row (7.0 / 8.0) as its write target.
-- ============================================================

BEGIN;

SELECT plan(17);

\ir _helpers.sql

-- Fixtures: one ADMIN user, one non-admin ACTIVE user (office). Read the seeded
-- 'mince_input' row id. All via the owner (bypass) path before SET ROLE.
DO $$ DECLARE
  v_admin  uuid := test_helper_make_user('rls-mth-admin', 'admin');
  v_office uuid := test_helper_make_user('rls-mth-office', 'office');
  v_input  uuid;
BEGIN
  PERFORM set_config('test.admin', v_admin::text, true);
  PERFORM set_config('test.office', v_office::text, true);
  SELECT id INTO v_input FROM haccp_mince_thresholds WHERE key = 'mince_input';
  PERFORM set_config('test.mince_input', v_input::text, true);
END $$;

-- ── 1) RLS enabled on both tables + CHECK proofs (5 assertions, owner path) ──
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'haccp_mince_thresholds'),
  'RLS is enabled on haccp_mince_thresholds');
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'haccp_mince_threshold_audit'),
  'RLS is enabled on haccp_mince_threshold_audit');
SELECT throws_ok(
  $$INSERT INTO haccp_mince_thresholds (key, label, kind, pass_max, amber_max)
    VALUES ('rls-bad-band', 'Bad band', 'temp', 9.0, 5.0)$$,
  '23514', NULL,
  'band CHECK rejects an inverted row (amber < pass)');
SELECT throws_ok(
  $$INSERT INTO haccp_mince_thresholds (key, label, kind, pass_max, amber_max)
    VALUES ('rls-bad-band2', 'Bad band 2', 'temp', NULL, 5.0)$$,
  '23514', NULL,
  'band CHECK rejects an amber band with no pass line (pass NULL, amber set)');
SELECT throws_ok(
  $$INSERT INTO haccp_mince_thresholds (key, label, kind, pass_max, amber_max)
    VALUES ('rls-bad-kill', 'Bad kill band', 'kill_days', 6, 7)$$,
  '23514', NULL,
  'kill-binary CHECK rejects an amber value on a kill_days row');

-- ── Switch to the per-request authenticated role to enforce RLS ─────────────
SET LOCAL ROLE authenticated;

-- ── 2) NON-ADMIN active staff: read yes, write no (6 assertions) ────────────
SELECT set_config('app.current_user_id', current_setting('test.office'), true);

SELECT isnt_empty($$SELECT * FROM haccp_mince_thresholds$$,
  'non-admin active staff CAN SELECT thresholds');
SELECT throws_ok(
  $$INSERT INTO haccp_mince_thresholds (key, label, kind, pass_max, amber_max)
    VALUES ('rls-deny', 'Deny', 'temp', 1.0, 2.0)$$,
  '42501', NULL,
  'non-admin denied INSERT thresholds (42501)');

-- UPDATE / DELETE under an is_admin()-USING policy match 0 rows for a non-admin
-- (silent no-op, not a throw) — prove the row is untouched.
UPDATE haccp_mince_thresholds SET pass_max = 99
  WHERE id = current_setting('test.mince_input')::uuid;
SELECT is(
  (SELECT pass_max::text FROM haccp_mince_thresholds WHERE id = current_setting('test.mince_input')::uuid),
  '7.0',
  'non-admin UPDATE of a threshold is a no-op (row unchanged)');

DELETE FROM haccp_mince_thresholds WHERE id = current_setting('test.mince_input')::uuid;
SELECT isnt_empty(
  format($$SELECT * FROM haccp_mince_thresholds WHERE id = %L$$, current_setting('test.mince_input')),
  'non-admin DELETE of a threshold is a no-op (row still present)');

SELECT is_empty($$SELECT * FROM haccp_mince_threshold_audit$$,
  'non-admin CANNOT SELECT the audit log');
SELECT throws_ok(
  format($$INSERT INTO haccp_mince_threshold_audit (threshold_id, changed_by, new_pass_max)
    VALUES (%L, %L, 3.0)$$, current_setting('test.mince_input'), current_setting('test.office')),
  '42501', NULL,
  'non-admin denied INSERT into the audit log (42501)');

-- ── 3) ADMIN: can update a threshold + write/read the audit (4 assertions) ──
SELECT set_config('app.current_user_id', current_setting('test.admin'), true);

SELECT lives_ok(
  format($$UPDATE haccp_mince_thresholds SET pass_max = 6.5 WHERE id = %L$$,
    current_setting('test.mince_input')),
  'admin CAN UPDATE a threshold');
SELECT is(
  (SELECT pass_max::text FROM haccp_mince_thresholds WHERE id = current_setting('test.mince_input')::uuid),
  '6.5',
  'admin UPDATE actually changed the threshold');
SELECT lives_ok(
  format($$INSERT INTO haccp_mince_threshold_audit (threshold_id, changed_by, old_pass_max, new_pass_max)
    VALUES (%L, %L, 7.0, 6.5)$$, current_setting('test.mince_input'), current_setting('test.admin')),
  'admin CAN INSERT an audit row');
SELECT isnt_empty($$SELECT * FROM haccp_mince_threshold_audit$$,
  'admin CAN SELECT the audit log');

-- ── 4) Audit immutability: even an admin cannot UPDATE/DELETE it (2 assertions)
-- Assertions key on THIS test's own row (changed_by = the fixture admin created
-- in this transaction) — never LIMIT 1 over the whole threshold_id, which is
-- order-dependent on a dirty DB (the integration suite commits real audit rows;
-- the goods-in ANVIL run 2026-07-02 caught the LIMIT 1 read picking one).
UPDATE haccp_mince_threshold_audit SET new_pass_max = 99
  WHERE threshold_id = current_setting('test.mince_input')::uuid;
SELECT is(
  (SELECT new_pass_max::text FROM haccp_mince_threshold_audit
     WHERE threshold_id = current_setting('test.mince_input')::uuid
       AND changed_by = current_setting('test.admin')::uuid),
  '6.5',
  'audit log is immutable — admin UPDATE is a no-op (no UPDATE policy)');
DELETE FROM haccp_mince_threshold_audit WHERE threshold_id = current_setting('test.mince_input')::uuid;
SELECT isnt_empty(
  format($$SELECT * FROM haccp_mince_threshold_audit WHERE changed_by = %L$$,
    current_setting('test.admin')),
  'audit log is immutable — admin DELETE is a no-op (no DELETE policy)');

RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
