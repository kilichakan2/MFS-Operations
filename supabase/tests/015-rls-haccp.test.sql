-- ============================================================
-- pgTAP: RLS policies on the haccp_* tables (F-19 PR10a / F-RLS-04h)
-- ============================================================
-- Proves the HACCP RLS foundation
-- (20260625120000_haccp_authenticated_rls_policies.sql):
--
--   - An ACTIVE-USER GUC (app.current_user_id maps to a real users row WITH
--     active = true) can SELECT / INSERT / UPDATE / DELETE on the haccp_*
--     tables. Role model is ACTIVE-user-ONLY (no role filter), so ANY real,
--     switched-on staff member passes.
--   - An EMPTY / ABSENT GUC is FAIL-CLOSED: reads return ZERO rows (no throw —
--     the SECURITY DEFINER helper public.current_user_is_active() short-circuits
--     via nullif('','') = NULL → FALSE), writes are a CLEAN 42501 RLS violation
--     (not a 22P02 cast error).
--   - A NON-EXISTENT user (random UUID, no users row) is DENIED identically.
--   - An INACTIVE user (a real users row with active = false) is DENIED — the
--     genuinely new guarantee vs current_user_is_valid(), which checks existence
--     only. This is the one behaviour distinguishing the new helper.
--   - The MASTER-KEY role BYPASSES RLS entirely (sees rows regardless of GUC) —
--     the live path today, so PR10a is inert in production.
--
-- SAMPLING: the policy predicate is identical and helper-driven across all 30
-- haccp_* tables (the only per-table variation is the column list, which the
-- policy never references). We prove the HELPER + the four-command pattern on a
-- representative spread of 5 tables: haccp_deliveries (daily-check write target),
-- haccp_suppliers (admin CRUD surface), haccp_sop_content (handbook read),
-- haccp_corrective_actions (cross-cutting CA), haccp_documents (docs surface).
-- The "all 30 are locked" completeness guarantee comes from the explicit
-- enumeration in the migration + the schema-integrity test, not from 30 runs.
--
-- RLS is enforced ONLY for non-bypass connections. These tests
-- SET LOCAL ROLE authenticated to simulate the per-request authenticated client
-- and set app.current_user_id to the test user.
-- ============================================================

BEGIN;

-- Baseline already GRANTs ALL on every haccp_* table to authenticated
-- (20260101000000_baseline.sql). Re-assert the privileges the 5 sampled tables
-- rely on so the test is self-contained about the surface it exercises.
GRANT SELECT, INSERT, UPDATE, DELETE ON haccp_deliveries         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON haccp_suppliers          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON haccp_sop_content        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON haccp_corrective_actions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON haccp_documents          TO authenticated;

SELECT plan(58);

\ir _helpers.sql

-- Fixtures (created via the bypass path — no RLS): one ACTIVE user, one INACTIVE
-- user (hand-made, because test_helper_make_user always sets active = true), and
-- one seed row per sampled table so the read/update/delete tests have targets.
DO $$ DECLARE
  v_user     uuid := test_helper_make_user('rls-haccp-user', 'office');
  v_inactive uuid;
  v_delivery uuid;
  v_supplier uuid;
  v_sop      uuid;
  v_ca       uuid;
  v_doc      uuid;
BEGIN
  PERFORM set_config('test.user', v_user::text, true);

  -- A real users row that is SWITCHED OFF (the inactive deny test).
  INSERT INTO users (name, role, active, pin_hash)
  VALUES ('rls-haccp-inactive', 'office', false,
          '$2a$10$ANVILTESTPLACEHOLDERHASHFORTESTSXXXXXXXXXXXXXXXXX')
  RETURNING id INTO v_inactive;
  PERFORM set_config('test.inactive', v_inactive::text, true);

  INSERT INTO haccp_deliveries
    (submitted_by, supplier, product, product_category, temp_status, covered_contaminated)
  VALUES (v_user, 'rls-seed-supplier', 'rls-seed-product', 'beef', 'pass', 'no')
  RETURNING id INTO v_delivery;
  PERFORM set_config('test.delivery', v_delivery::text, true);

  INSERT INTO haccp_suppliers (name)
  VALUES ('rls-seed-supplier-row')
  RETURNING id INTO v_supplier;
  PERFORM set_config('test.supplier', v_supplier::text, true);

  INSERT INTO haccp_sop_content (sop_ref, title, content_md)
  VALUES ('RLS-SEED-SOP', 'rls seed sop', 'rls seed body')
  RETURNING id INTO v_sop;
  PERFORM set_config('test.sop', v_sop::text, true);

  INSERT INTO haccp_corrective_actions
    (actioned_by, source_table, source_id, ccp_ref, deviation_description, action_taken)
  VALUES (v_user, 'haccp_deliveries', v_delivery, 'CCP-1', 'rls seed deviation', 'rls seed action')
  RETURNING id INTO v_ca;
  PERFORM set_config('test.ca', v_ca::text, true);

  INSERT INTO haccp_documents
    (doc_ref, title, version, category, description, purpose, updated_at, review_due)
  VALUES ('RLS-SEED-DOC', 'rls seed doc', 'v1', 'haccp_system', 'rls seed desc',
          'rls seed purpose', CURRENT_DATE, CURRENT_DATE + 365)
  RETURNING id INTO v_doc;
  PERFORM set_config('test.doc', v_doc::text, true);
END $$;

-- ── Switch to non-superuser to enforce RLS ──────────────────
SET LOCAL ROLE authenticated;

-- ════════════════════════════════════════════════════════════
-- 1) ACTIVE USER — full CRUD on each sampled table (20 assertions: 4 × 5)
-- ════════════════════════════════════════════════════════════
SELECT set_config('app.current_user_id', current_setting('test.user'), true);

-- haccp_deliveries
SELECT isnt_empty($$SELECT * FROM haccp_deliveries$$,
  'active user can SELECT haccp_deliveries');
SELECT lives_ok(format($$
    INSERT INTO haccp_deliveries
      (submitted_by, supplier, product, product_category, temp_status, covered_contaminated)
    VALUES (%L, 'ins-supplier', 'ins-product', 'beef', 'pass', 'no');
  $$, current_setting('test.user')),
  'active user can INSERT haccp_deliveries');
SELECT lives_ok(format($$
    UPDATE haccp_deliveries SET notes = 'rls-update' WHERE id = %L;
  $$, current_setting('test.delivery')),
  'active user can UPDATE haccp_deliveries');
SELECT lives_ok($$DELETE FROM haccp_deliveries WHERE supplier = 'ins-supplier'$$,
  'active user can DELETE haccp_deliveries');

-- haccp_suppliers
SELECT isnt_empty($$SELECT * FROM haccp_suppliers$$,
  'active user can SELECT haccp_suppliers');
SELECT lives_ok($$INSERT INTO haccp_suppliers (name) VALUES ('ins-supplier-row')$$,
  'active user can INSERT haccp_suppliers');
SELECT lives_ok(format($$
    UPDATE haccp_suppliers SET notes = 'rls-update' WHERE id = %L;
  $$, current_setting('test.supplier')),
  'active user can UPDATE haccp_suppliers');
SELECT lives_ok($$DELETE FROM haccp_suppliers WHERE name = 'ins-supplier-row'$$,
  'active user can DELETE haccp_suppliers');

-- haccp_sop_content
SELECT isnt_empty($$SELECT * FROM haccp_sop_content$$,
  'active user can SELECT haccp_sop_content');
SELECT lives_ok($$INSERT INTO haccp_sop_content (sop_ref, title, content_md)
    VALUES ('INS-SOP', 'ins sop', 'ins body')$$,
  'active user can INSERT haccp_sop_content');
SELECT lives_ok(format($$
    UPDATE haccp_sop_content SET title = 'rls-update' WHERE id = %L;
  $$, current_setting('test.sop')),
  'active user can UPDATE haccp_sop_content');
SELECT lives_ok($$DELETE FROM haccp_sop_content WHERE sop_ref = 'INS-SOP'$$,
  'active user can DELETE haccp_sop_content');

-- haccp_corrective_actions
SELECT isnt_empty($$SELECT * FROM haccp_corrective_actions$$,
  'active user can SELECT haccp_corrective_actions');
SELECT lives_ok(format($$
    INSERT INTO haccp_corrective_actions
      (actioned_by, source_table, source_id, ccp_ref, deviation_description, action_taken)
    VALUES (%L, 'haccp_deliveries', %L, 'CCP-2', 'ins deviation', 'ins action');
  $$, current_setting('test.user'), current_setting('test.delivery')),
  'active user can INSERT haccp_corrective_actions');
SELECT lives_ok(format($$
    UPDATE haccp_corrective_actions SET resolved = true WHERE id = %L;
  $$, current_setting('test.ca')),
  'active user can UPDATE haccp_corrective_actions');
SELECT lives_ok($$DELETE FROM haccp_corrective_actions WHERE ccp_ref = 'CCP-2'$$,
  'active user can DELETE haccp_corrective_actions');

-- haccp_documents
SELECT isnt_empty($$SELECT * FROM haccp_documents$$,
  'active user can SELECT haccp_documents');
SELECT lives_ok(format($$
    INSERT INTO haccp_documents
      (doc_ref, title, version, category, description, purpose, updated_at, review_due)
    VALUES ('INS-DOC', 'ins doc', 'v1', 'haccp_system', 'ins desc', 'ins purpose',
            CURRENT_DATE, CURRENT_DATE + 30);
  $$),
  'active user can INSERT haccp_documents');
SELECT lives_ok(format($$
    UPDATE haccp_documents SET notes = 'rls-update' WHERE id = %L;
  $$, current_setting('test.doc')),
  'active user can UPDATE haccp_documents');
SELECT lives_ok($$DELETE FROM haccp_documents WHERE doc_ref = 'INS-DOC'$$,
  'active user can DELETE haccp_documents');

-- ════════════════════════════════════════════════════════════
-- 2) EMPTY GUC — fail-closed, no leak (10 assertions: 2 × 5)
-- ════════════════════════════════════════════════════════════
SELECT set_config('app.current_user_id', '', true);

SELECT is_empty($$SELECT * FROM haccp_deliveries$$,
  'empty GUC fail-closed SELECT haccp_deliveries (clean zero-rows)');
SELECT throws_ok(format($$
    INSERT INTO haccp_deliveries
      (submitted_by, supplier, product, product_category, temp_status, covered_contaminated)
    VALUES (%L, 'deny', 'deny', 'beef', 'pass', 'no');
  $$, current_setting('test.user')),
  '42501', NULL, 'empty GUC fail-closed INSERT haccp_deliveries (42501, not 22P02)');

SELECT is_empty($$SELECT * FROM haccp_suppliers$$,
  'empty GUC fail-closed SELECT haccp_suppliers (clean zero-rows)');
SELECT throws_ok($$INSERT INTO haccp_suppliers (name) VALUES ('deny')$$,
  '42501', NULL, 'empty GUC fail-closed INSERT haccp_suppliers (42501)');

SELECT is_empty($$SELECT * FROM haccp_sop_content$$,
  'empty GUC fail-closed SELECT haccp_sop_content (clean zero-rows)');
SELECT throws_ok($$INSERT INTO haccp_sop_content (sop_ref, title, content_md)
    VALUES ('DENY', 'deny', 'deny')$$,
  '42501', NULL, 'empty GUC fail-closed INSERT haccp_sop_content (42501)');

SELECT is_empty($$SELECT * FROM haccp_corrective_actions$$,
  'empty GUC fail-closed SELECT haccp_corrective_actions (clean zero-rows)');
SELECT throws_ok(format($$
    INSERT INTO haccp_corrective_actions
      (actioned_by, source_table, source_id, ccp_ref, deviation_description, action_taken)
    VALUES (%L, 'haccp_deliveries', %L, 'DENY', 'deny', 'deny');
  $$, current_setting('test.user'), current_setting('test.delivery')),
  '42501', NULL, 'empty GUC fail-closed INSERT haccp_corrective_actions (42501)');

SELECT is_empty($$SELECT * FROM haccp_documents$$,
  'empty GUC fail-closed SELECT haccp_documents (clean zero-rows)');
SELECT throws_ok($$INSERT INTO haccp_documents
    (doc_ref, title, version, category, description, purpose, updated_at, review_due)
    VALUES ('DENY', 'deny', 'v1', 'haccp_system', 'deny', 'deny', CURRENT_DATE, CURRENT_DATE + 1)$$,
  '42501', NULL, 'empty GUC fail-closed INSERT haccp_documents (42501)');

-- ════════════════════════════════════════════════════════════
-- 3) NON-EXISTENT USER — random UUID with no users row (10 assertions: 2 × 5)
-- ════════════════════════════════════════════════════════════
SELECT set_config('app.current_user_id', '00000000-0000-0000-0000-0000000000ff', true);

SELECT is_empty($$SELECT * FROM haccp_deliveries$$,
  'non-existent user denied SELECT haccp_deliveries');
SELECT throws_ok(format($$
    INSERT INTO haccp_deliveries
      (submitted_by, supplier, product, product_category, temp_status, covered_contaminated)
    VALUES (%L, 'deny', 'deny', 'beef', 'pass', 'no');
  $$, current_setting('test.user')),
  '42501', NULL, 'non-existent user denied INSERT haccp_deliveries (42501)');

SELECT is_empty($$SELECT * FROM haccp_suppliers$$,
  'non-existent user denied SELECT haccp_suppliers');
SELECT throws_ok($$INSERT INTO haccp_suppliers (name) VALUES ('deny')$$,
  '42501', NULL, 'non-existent user denied INSERT haccp_suppliers (42501)');

SELECT is_empty($$SELECT * FROM haccp_sop_content$$,
  'non-existent user denied SELECT haccp_sop_content');
SELECT throws_ok($$INSERT INTO haccp_sop_content (sop_ref, title, content_md)
    VALUES ('DENY', 'deny', 'deny')$$,
  '42501', NULL, 'non-existent user denied INSERT haccp_sop_content (42501)');

SELECT is_empty($$SELECT * FROM haccp_corrective_actions$$,
  'non-existent user denied SELECT haccp_corrective_actions');
SELECT throws_ok(format($$
    INSERT INTO haccp_corrective_actions
      (actioned_by, source_table, source_id, ccp_ref, deviation_description, action_taken)
    VALUES (%L, 'haccp_deliveries', %L, 'DENY', 'deny', 'deny');
  $$, current_setting('test.user'), current_setting('test.delivery')),
  '42501', NULL, 'non-existent user denied INSERT haccp_corrective_actions (42501)');

SELECT is_empty($$SELECT * FROM haccp_documents$$,
  'non-existent user denied SELECT haccp_documents');
SELECT throws_ok($$INSERT INTO haccp_documents
    (doc_ref, title, version, category, description, purpose, updated_at, review_due)
    VALUES ('DENY', 'deny', 'v1', 'haccp_system', 'deny', 'deny', CURRENT_DATE, CURRENT_DATE + 1)$$,
  '42501', NULL, 'non-existent user denied INSERT haccp_documents (42501)');

-- ════════════════════════════════════════════════════════════
-- 4) INACTIVE USER — a real users row with active = false (10 assertions: 2 × 5)
--    The genuinely NEW guarantee: current_user_is_active() denies a deactivated
--    staff member, where current_user_is_valid() would have allowed them.
-- ════════════════════════════════════════════════════════════
SELECT set_config('app.current_user_id', current_setting('test.inactive'), true);

SELECT is_empty($$SELECT * FROM haccp_deliveries$$,
  'INACTIVE user denied SELECT haccp_deliveries (the new guarantee)');
SELECT throws_ok(format($$
    INSERT INTO haccp_deliveries
      (submitted_by, supplier, product, product_category, temp_status, covered_contaminated)
    VALUES (%L, 'deny', 'deny', 'beef', 'pass', 'no');
  $$, current_setting('test.inactive')),
  '42501', NULL, 'INACTIVE user denied INSERT haccp_deliveries (42501)');

SELECT is_empty($$SELECT * FROM haccp_suppliers$$,
  'INACTIVE user denied SELECT haccp_suppliers');
SELECT throws_ok($$INSERT INTO haccp_suppliers (name) VALUES ('deny')$$,
  '42501', NULL, 'INACTIVE user denied INSERT haccp_suppliers (42501)');

SELECT is_empty($$SELECT * FROM haccp_sop_content$$,
  'INACTIVE user denied SELECT haccp_sop_content');
SELECT throws_ok($$INSERT INTO haccp_sop_content (sop_ref, title, content_md)
    VALUES ('DENY', 'deny', 'deny')$$,
  '42501', NULL, 'INACTIVE user denied INSERT haccp_sop_content (42501)');

SELECT is_empty($$SELECT * FROM haccp_corrective_actions$$,
  'INACTIVE user denied SELECT haccp_corrective_actions');
SELECT throws_ok(format($$
    INSERT INTO haccp_corrective_actions
      (actioned_by, source_table, source_id, ccp_ref, deviation_description, action_taken)
    VALUES (%L, 'haccp_deliveries', %L, 'DENY', 'deny', 'deny');
  $$, current_setting('test.inactive'), current_setting('test.delivery')),
  '42501', NULL, 'INACTIVE user denied INSERT haccp_corrective_actions (42501)');

SELECT is_empty($$SELECT * FROM haccp_documents$$,
  'INACTIVE user denied SELECT haccp_documents');
SELECT throws_ok($$INSERT INTO haccp_documents
    (doc_ref, title, version, category, description, purpose, updated_at, review_due)
    VALUES ('DENY', 'deny', 'v1', 'haccp_system', 'deny', 'deny', CURRENT_DATE, CURRENT_DATE + 1)$$,
  '42501', NULL, 'INACTIVE user denied INSERT haccp_documents (42501)');

-- ════════════════════════════════════════════════════════════
-- 5) MASTER-KEY ROLE — bypasses RLS, GUC irrelevant (5 assertions: 1 × 5)
--    The inert-ness guarantee at the DB layer: the live (service-role) path is
--    unaffected by the policies, so PR10a changes nothing in production.
-- ════════════════════════════════════════════════════════════
RESET ROLE;                                         -- back to the superuser/owner test role
SELECT set_config('app.current_user_id', '', true);  -- empty GUC must NOT matter

SELECT isnt_empty(format($$SELECT * FROM haccp_deliveries WHERE id = %L$$,
  current_setting('test.delivery')),
  'master-key role reads haccp_deliveries regardless of empty GUC');
SELECT isnt_empty(format($$SELECT * FROM haccp_suppliers WHERE id = %L$$,
  current_setting('test.supplier')),
  'master-key role reads haccp_suppliers regardless of empty GUC');
SELECT isnt_empty(format($$SELECT * FROM haccp_sop_content WHERE id = %L$$,
  current_setting('test.sop')),
  'master-key role reads haccp_sop_content regardless of empty GUC');
SELECT isnt_empty(format($$SELECT * FROM haccp_corrective_actions WHERE id = %L$$,
  current_setting('test.ca')),
  'master-key role reads haccp_corrective_actions regardless of empty GUC');
SELECT isnt_empty(format($$SELECT * FROM haccp_documents WHERE id = %L$$,
  current_setting('test.doc')),
  'master-key role reads haccp_documents regardless of empty GUC');

-- ════════════════════════════════════════════════════════════
-- 6) PR10b ROUTE PATH — "the path a route now exercises" (3 assertions)
--    F-RLS-04h PR10b flips the routes onto the per-caller authenticated client.
--    Frame these two scenarios as the round-trip a daily-check write+read-back
--    now performs as the `authenticated` role on haccp_deliveries:
--      (a) GUC = active user → INSERT then SELECT round-trips the new row
--          (the happy path the cutover routes drive end-to-end);
--      (b) GUC cleared → the SAME INSERT raises 42501 (an absent identity is
--          refused — the lock the cutover finally engages).
-- ════════════════════════════════════════════════════════════
SET LOCAL ROLE authenticated;
SELECT set_config('app.current_user_id', current_setting('test.user'), true);

-- (a) active-user round-trip: write a row, then read it back as the SAME caller.
SELECT lives_ok(format($$
    INSERT INTO haccp_deliveries
      (submitted_by, supplier, product, product_category, temp_status, covered_contaminated)
    VALUES (%L, 'pr10b-roundtrip', 'rt-product', 'beef', 'pass', 'no');
  $$, current_setting('test.user')),
  'PR10b route path: active user INSERTs haccp_deliveries (write)');
SELECT isnt_empty(
  $$SELECT * FROM haccp_deliveries WHERE supplier = 'pr10b-roundtrip'$$,
  'PR10b route path: active user reads back the row it just wrote (read-back)');

-- (b) absent identity: the same INSERT is refused with 42501 (clean fail-closed).
SELECT set_config('app.current_user_id', '', true);
SELECT throws_ok(format($$
    INSERT INTO haccp_deliveries
      (submitted_by, supplier, product, product_category, temp_status, covered_contaminated)
    VALUES (%L, 'pr10b-noid', 'rt-product', 'beef', 'pass', 'no');
  $$, current_setting('test.user')),
  '42501', NULL,
  'PR10b route path: absent identity (no GUC) is refused INSERT haccp_deliveries (42501)');

RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
