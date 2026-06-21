-- ============================================================
-- pgTAP: RLS policies on complaints + complaint_notes + compliments (F-RLS-04f)
-- ============================================================
-- Proves the Complaints/Compliments RLS cutover policy set
-- (20260621130000_complaints_authenticated_rls_policies.sql):
--
--   - SHARED BOARD (the headline divergence from cash): the policies are the
--     valid-user check public.current_user_is_valid(), NOT an ownership filter.
--     A VALID user (user-B) can read a complaint LOGGED BY ANOTHER user (user-A).
--     This is the critical assertion — a test that only read the caller's own row
--     would ALSO pass under the WRONG dropped baseline owner-only policy, so the
--     cross-user read is what proves the migration replaced them correctly.
--   - A VALID-USER GUC (app.current_user_id maps to a real users row) can
--     SELECT / INSERT / UPDATE / DELETE on `complaints`, `complaint_notes` AND
--     `compliments`. The in-place complaints UPDATE is the deliberate divergence
--     asserted explicitly (resolveOpen PATCHes status open→resolved) — a missing
--     UPDATE policy would silently break "resolve" under the badge.
--   - An EMPTY / ABSENT GUC is FAIL-CLOSED: reads return nothing and writes are
--     blocked. Like cash (04e), the policies use the SECURITY DEFINER helper
--     public.current_user_is_valid(); an empty GUC short-circuits to FALSE
--     *without throwing* — empty-GUC SELECT returns ZERO ROWS (no 22P02 throw),
--     and empty-GUC INSERT is a clean 42501 RLS violation.
--   - The MASTER-KEY role BYPASSES RLS entirely (sees all rows regardless of
--     GUC) — the rollback parachute and the raw audit/email service-role paths.
--
-- RLS is enforced ONLY for non-bypass connections. These tests
-- SET LOCAL ROLE authenticated to simulate the per-request authenticated
-- client and set app.current_user_id to the test user.
-- ============================================================

BEGIN;

-- Baseline already GRANTs all three tables to authenticated in prod
-- (20260101000000_baseline.sql lines 2563, 2568, 2573). Re-assert explicitly so
-- the test is self-contained and clear about the privilege surface it relies on.
GRANT SELECT, INSERT, UPDATE, DELETE ON complaints      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON complaint_notes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON compliments     TO authenticated;

SELECT plan(14);

\ir _helpers.sql

-- Fixtures (created via the bypass path — no RLS): TWO valid users (user-A,
-- user-B — to prove the SHARED BOARD: B reads A's complaint), one customer; one
-- seed `complaints` row (status open, owned by user-A — respects
-- complaints_resolution_check: open ⇒ resolution_note/resolved_by/resolved_at all
-- NULL), one seed `complaint_notes` row, one seed `compliments` row.
DO $$ DECLARE
  v_user_a uuid := test_helper_make_user('rls-complaints-user-a', 'office');
  v_user_b uuid := test_helper_make_user('rls-complaints-user-b', 'office');
  v_cust   uuid := test_helper_make_customer('rls-complaints-cust');
  v_comp   uuid;
  v_note   uuid;
  v_compl  uuid;
BEGIN
  PERFORM set_config('test.user_a', v_user_a::text, true);
  PERFORM set_config('test.user_b', v_user_b::text, true);
  PERFORM set_config('test.cust',   v_cust::text,   true);

  -- Seed complaint OWNED BY USER-A (status open → resolution columns NULL).
  INSERT INTO complaints (customer_id, category, description, received_via, user_id, status)
  VALUES (v_cust, 'quality', 'rls-seed-complaint', 'phone', v_user_a, 'open')
  RETURNING id INTO v_comp;
  PERFORM set_config('test.comp', v_comp::text, true);

  INSERT INTO complaint_notes (complaint_id, user_id, body)
  VALUES (v_comp, v_user_a, 'rls-seed-note')
  RETURNING id INTO v_note;
  PERFORM set_config('test.note', v_note::text, true);

  INSERT INTO compliments (body, posted_by, recipient_id)
  VALUES ('rls-seed-compliment', v_user_a, v_user_b)
  RETURNING id INTO v_compl;
  PERFORM set_config('test.compl', v_compl::text, true);
END $$;

-- ── Switch to non-superuser to enforce RLS ──────────────────
SET LOCAL ROLE authenticated;

-- The GUC is user-B for every valid-user assertion below — so the SELECT that
-- returns user-A's complaint PROVES the shared board (not owner-only).
SELECT set_config('app.current_user_id', current_setting('test.user_b'), true);

-- ── SHARED-BOARD assertion (the headline divergence from cash) ──
SELECT isnt_empty(
  format($$SELECT * FROM complaints WHERE id = %L$$, current_setting('test.comp')),
  'SHARED BOARD: user-B can SELECT a complaint LOGGED BY user-A (valid-user policy, NOT owner-only)'
);

-- ── VALID USER (user-B): SELECT on all 3 tables ─────────────
SELECT isnt_empty(
  $$SELECT * FROM complaints$$,
  'valid user can SELECT complaints'
);
SELECT isnt_empty(
  $$SELECT * FROM complaint_notes$$,
  'valid user can SELECT complaint_notes'
);
SELECT isnt_empty(
  $$SELECT * FROM compliments$$,
  'valid user can SELECT compliments'
);

-- ── VALID USER (user-B): INSERT on all 3 tables ─────────────
SELECT lives_ok(
  format($$
    INSERT INTO complaints (customer_id, category, description, received_via, user_id, status)
    VALUES (%L, 'service', 'rls-insert-complaint', 'email', %L, 'open');
  $$, current_setting('test.cust'), current_setting('test.user_b')),
  'valid user can INSERT complaints'
);
SELECT lives_ok(
  format($$
    INSERT INTO complaint_notes (complaint_id, user_id, body)
    VALUES (%L, %L, 'rls-insert-note');
  $$, current_setting('test.comp'), current_setting('test.user_b')),
  'valid user can INSERT complaint_notes'
);
SELECT lives_ok(
  format($$
    INSERT INTO compliments (body, posted_by, recipient_id)
    VALUES ('rls-insert-compliment', %L, NULL);
  $$, current_setting('test.user_b')),
  'valid user can INSERT compliments'
);

-- ── VALID USER (user-B): the in-place complaints UPDATE divergence ──
-- resolveOpen PATCHes status open→resolved (with all resolution columns set, to
-- satisfy complaints_resolution_check). A missing UPDATE policy would silently
-- break "resolve" under the badge — assert it explicitly.
SELECT lives_ok(
  format($$
    UPDATE complaints
       SET status = 'resolved',
           resolution_note = 'rls-resolved',
           resolved_by = %L,
           resolved_at = now()
     WHERE id = %L;
  $$, current_setting('test.user_b'), current_setting('test.comp')),
  'valid user can UPDATE complaints (the resolveOpen in-place PATCH divergence)'
);

-- ── VALID USER (user-B): DELETE on all 3 tables ─────────────
SELECT lives_ok(
  $$DELETE FROM complaint_notes WHERE body = 'rls-insert-note';$$,
  'valid user can DELETE complaint_notes'
);
SELECT lives_ok(
  $$DELETE FROM compliments WHERE body = 'rls-insert-compliment';$$,
  'valid user can DELETE compliments'
);
SELECT lives_ok(
  $$DELETE FROM complaints WHERE description = 'rls-insert-complaint';$$,
  'valid user can DELETE complaints'
);

-- ── EMPTY GUC: fail-closed (no leak) ────────────────────────
-- Empty GUC: current_user_is_valid() returns FALSE (no throw), so the SELECT
-- policy denies cleanly → ZERO rows visible (fail-closed without an exception).
SELECT set_config('app.current_user_id', '', true);

SELECT is_empty(
  $$SELECT * FROM complaints$$,
  'empty GUC is fail-closed on SELECT complaints (clean zero-rows deny)'
);

-- Empty GUC: the WITH CHECK predicate is FALSE → a clean 42501 RLS violation
-- (not a 22P02 cast error, because the helper short-circuits before any cast).
SELECT throws_ok(
  format($$
    INSERT INTO complaints (customer_id, category, description, received_via, user_id, status)
    VALUES (%L, 'quality', 'rls-deny-complaint', 'phone', %L, 'open');
  $$, current_setting('test.cust'), current_setting('test.user_a')),
  '42501',
  NULL,
  'empty GUC is fail-closed on INSERT complaints (42501 RLS deny)'
);

-- ── MASTER-KEY ROLE: bypasses RLS (sees everything, GUC irrelevant) ──
RESET ROLE;                                          -- back to the superuser/owner test role
SELECT set_config('app.current_user_id', '', true);  -- empty GUC must NOT matter
SELECT isnt_empty(
  format($$SELECT * FROM complaints WHERE id = %L$$, current_setting('test.comp')),
  'master-key role (RLS bypass) reads complaints regardless of an empty GUC'
);

SELECT * FROM finish();
ROLLBACK;
