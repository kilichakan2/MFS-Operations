-- ============================================================
-- pgTAP: RLS policies on cash_months + cash_entries + cheque_records (F-RLS-04e)
-- ============================================================
-- Proves the Cash-context RLS cutover policy set
-- (20260621120000_cash_authenticated_rls_policies.sql):
--
--   - A VALID-USER GUC (app.current_user_id maps to a real users row)
--     can SELECT / INSERT / UPDATE / DELETE on `cash_months`,
--     `cash_entries` AND `cheque_records`. Role model is valid-user-ONLY
--     (no role filter), so ANY real user passes. The in-place UPDATEs are
--     the deliberate divergences asserted explicitly: cash_entries UPDATE
--     (updateEntry PATCH) and cheque_records UPDATE (bankCheque + updateCheque
--     PATCH) — a missing UPDATE policy would silently break entry edits,
--     cheque banking, and cheque edits under the badge.
--   - An EMPTY / ABSENT GUC is FAIL-CLOSED: reads return nothing and writes
--     are blocked. Like pricing (04d), the policies use the SECURITY DEFINER
--     helper public.current_user_is_valid(); an empty GUC yields
--     nullif('','') = NULL, NULL::uuid = NULL, so the EXISTS short-circuits to
--     FALSE *without throwing* — a CLEAN deny. So: empty-GUC SELECT returns
--     ZERO ROWS (no 22P02 throw), and empty-GUC INSERT is a clean 42501 RLS
--     violation (not a 22P02 cast error). Both are fail-closed; nothing leaks.
--   - The MASTER-KEY role BYPASSES RLS entirely (sees all rows regardless of
--     GUC) — the rollback parachute and the Storage-port paths' posture.
--
-- RLS is enforced ONLY for non-bypass connections. These tests
-- SET LOCAL ROLE authenticated to simulate the per-request authenticated
-- client and set app.current_user_id to the test user.
-- ============================================================

BEGIN;

-- Baseline already GRANTs all three cash tables to authenticated in prod
-- (20260101000000_baseline.sql lines 2548, 2553, 2558). Re-assert explicitly so
-- the test is self-contained and clear about the privilege surface it relies on.
GRANT SELECT, INSERT, UPDATE, DELETE ON cash_months    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON cash_entries   TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON cheque_records TO authenticated;

SELECT plan(14);

\ir _helpers.sql

-- Fixtures (created via the bypass path — no RLS): one valid office user, one
-- driver user, one customer, one seed cash_months + one seed cash_entry + one
-- seed cheque_record so the read/update/delete tests have targets. The seed
-- month uses a far-future (year, month) to dodge the UNIQUE(year, month).
DO $$ DECLARE
  v_user   uuid := test_helper_make_user('rls-cash-user', 'office');
  v_driver uuid := test_helper_make_user('rls-cash-driver', 'driver');
  v_cust   uuid := test_helper_make_customer('rls-cash-cust');
  v_month  uuid;
  v_entry  uuid;
  v_cheque uuid;
BEGIN
  PERFORM set_config('test.user',   v_user::text,   true);
  PERFORM set_config('test.driver', v_driver::text, true);
  PERFORM set_config('test.cust',   v_cust::text,   true);

  INSERT INTO cash_months (year, month, opening_balance, created_by)
  VALUES (2099, 1, 100.00, v_user)
  RETURNING id INTO v_month;
  PERFORM set_config('test.month', v_month::text, true);

  INSERT INTO cash_entries (month_id, entry_date, type, amount, description, created_by)
  VALUES (v_month, DATE '2099-01-05', 'income', 50.00, 'rls-seed-entry', v_user)
  RETURNING id INTO v_entry;
  PERFORM set_config('test.entry', v_entry::text, true);

  INSERT INTO cheque_records (date, customer_id, amount, driver_id, logged_by)
  VALUES (DATE '2099-01-05', v_cust, 250.00, v_driver, v_user)
  RETURNING id INTO v_cheque;
  PERFORM set_config('test.cheque', v_cheque::text, true);
END $$;

-- ── Switch to non-superuser to enforce RLS ──────────────────
SET LOCAL ROLE authenticated;

-- ── VALID USER: full CRUD on cash_months ────────────────────

SELECT set_config('app.current_user_id', current_setting('test.user'), true);

SELECT isnt_empty(
  $$SELECT * FROM cash_months$$,
  'valid user can SELECT cash_months'
);

SELECT lives_ok(
  format($$
    INSERT INTO cash_months (year, month, opening_balance, created_by)
    VALUES (2099, 2, 0, %L);
  $$, current_setting('test.user')),
  'valid user can INSERT cash_months'
);

SELECT lives_ok(
  format($$
    UPDATE cash_months SET is_locked = true WHERE id = %L;
  $$, current_setting('test.month')),
  'valid user can UPDATE cash_months (setMonthLocked PATCH)'
);

-- ── VALID USER: full CRUD on cash_entries ───────────────────

SELECT isnt_empty(
  $$SELECT * FROM cash_entries$$,
  'valid user can SELECT cash_entries'
);

SELECT lives_ok(
  format($$
    INSERT INTO cash_entries (month_id, entry_date, type, amount, description, created_by)
    VALUES (%L, DATE '2099-01-06', 'expense', 12.5, 'rls-insert-entry', %L);
  $$, current_setting('test.month'), current_setting('test.user')),
  'valid user can INSERT cash_entries'
);

-- The in-place UPDATE divergence: updateEntry PATCHes a row, so the entries
-- table needs an UPDATE policy. Assert it explicitly.
SELECT lives_ok(
  format($$
    UPDATE cash_entries SET amount = 99.0 WHERE id = %L;
  $$, current_setting('test.entry')),
  'valid user can UPDATE cash_entries (the updateEntry-PATCH divergence)'
);

SELECT lives_ok(
  format($$
    DELETE FROM cash_entries WHERE description = 'rls-insert-entry';
  $$),
  'valid user can DELETE cash_entries'
);

-- ── VALID USER: full CRUD on cheque_records ─────────────────

SELECT isnt_empty(
  $$SELECT * FROM cheque_records$$,
  'valid user can SELECT cheque_records'
);

SELECT lives_ok(
  format($$
    INSERT INTO cheque_records (date, customer_id, amount, driver_id, logged_by)
    VALUES (DATE '2099-01-06', %L, 75.0, %L, %L);
  $$, current_setting('test.cust'), current_setting('test.driver'), current_setting('test.user')),
  'valid user can INSERT cheque_records'
);

-- The in-place UPDATE divergence: bankCheque AND updateCheque PATCH a row, so
-- the cheque table needs an UPDATE policy. Assert it explicitly.
SELECT lives_ok(
  format($$
    UPDATE cheque_records SET banked = true, banked_by = %L WHERE id = %L;
  $$, current_setting('test.user'), current_setting('test.cheque')),
  'valid user can UPDATE cheque_records (bankCheque / updateCheque PATCH divergence)'
);

SELECT lives_ok(
  format($$
    DELETE FROM cheque_records WHERE id = %L;
  $$, current_setting('test.cheque')),
  'valid user can DELETE cheque_records'
);

-- ── EMPTY GUC: fail-closed (no leak) ────────────────────────
-- Empty GUC: current_user_is_valid() returns FALSE (no throw), so the SELECT
-- policy denies cleanly → ZERO rows visible (fail-closed without an exception).
SELECT set_config('app.current_user_id', '', true);

SELECT is_empty(
  $$SELECT * FROM cash_months$$,
  'empty GUC is fail-closed on SELECT cash_months (clean zero-rows deny)'
);

-- Empty GUC: the WITH CHECK predicate is FALSE → a clean 42501 RLS violation
-- (not a 22P02 cast error, because the helper short-circuits before any cast).
SELECT throws_ok(
  format($$
    INSERT INTO cash_entries (month_id, entry_date, type, amount, description, created_by)
    VALUES (%L, DATE '2099-01-07', 'income', 5.0, 'rls-deny', %L);
  $$, current_setting('test.month'), current_setting('test.user')),
  '42501',
  NULL,
  'empty GUC is fail-closed on INSERT cash_entries (42501 RLS deny)'
);

-- ── MASTER-KEY ROLE: bypasses RLS (sees everything, GUC irrelevant) ──
RESET ROLE;                                          -- back to the superuser/owner test role
SELECT set_config('app.current_user_id', '', true);  -- empty GUC must NOT matter
SELECT isnt_empty(
  format($$SELECT * FROM cash_months WHERE id = %L$$, current_setting('test.month')),
  'master-key role (RLS bypass) reads cash_months regardless of an empty GUC'
);

SELECT * FROM finish();
ROLLBACK;
