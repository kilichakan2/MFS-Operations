-- ============================================================
-- pgTAP: RLS policies on price_agreements + price_agreement_lines (F-RLS-04d)
-- ============================================================
-- Proves the Pricing-context RLS cutover policy set
-- (20260619120000_pricing_authenticated_rls_policies.sql):
--
--   - A VALID-USER GUC (app.current_user_id maps to a real users row)
--     can SELECT / INSERT / UPDATE / DELETE on `price_agreements`
--     AND on `price_agreement_lines`. Role model is valid-user-ONLY
--     (no role filter), so ANY real user passes. The lines UPDATE is the
--     deliberate divergence from routes (route_stops had no UPDATE) — the
--     line PATCH (`updateLine`) issues an in-place UPDATE, so it is asserted
--     explicitly here.
--   - An EMPTY / ABSENT GUC is FAIL-CLOSED: reads return nothing and writes
--     are blocked. DEVIATION FROM 009-rls-routes: pricing policies use the
--     SECURITY DEFINER helper public.current_user_is_valid() rather than the
--     inline `EXISTS(... nullif(...,'')::uuid ...)` the routes policies inline.
--     With the helper, an empty GUC yields nullif('','') = NULL, NULL::uuid =
--     NULL, so the EXISTS short-circuits to FALSE *without throwing* — a CLEANER
--     deny than the routes form. Therefore: empty-GUC SELECT returns ZERO ROWS
--     (no 22P02 throw), and empty-GUC INSERT is a clean 42501 RLS violation
--     (not a 22P02 cast error). Both are fail-closed; nothing leaks.
--   - SERVICE-ROLE BYPASSES RLS entirely (sees all rows regardless of GUC).
--
-- RLS is enforced ONLY for non-service-role connections. These tests
-- SET LOCAL ROLE authenticated to simulate the per-request authenticated
-- client and set app.current_user_id to the test user.
-- ============================================================

BEGIN;

-- Baseline already GRANTs both pricing tables to authenticated in prod
-- (20260101000000_baseline.sql lines 2748, 2753). Re-assert explicitly so the
-- test is self-contained and clear about the privilege surface it relies on.
GRANT SELECT, INSERT, UPDATE, DELETE ON price_agreements      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON price_agreement_lines TO authenticated;

SELECT plan(12);

\ir _helpers.sql

-- Fixtures (created via service-role path — bypasses RLS): one valid user,
-- one customer, one seed agreement + one seed line so the read/update/delete
-- tests have a target.
DO $$ DECLARE
  v_user uuid := test_helper_make_user('rls-pricing-user', 'sales');
  v_cust uuid := test_helper_make_customer('rls-pricing-cust');
  v_agr  uuid;
  v_line uuid;
BEGIN
  PERFORM set_config('test.user', v_user::text, true);
  PERFORM set_config('test.cust', v_cust::text, true);

  INSERT INTO price_agreements (customer_id, agreed_by, valid_from)
  VALUES (v_cust, v_user, CURRENT_DATE)
  RETURNING id INTO v_agr;
  PERFORM set_config('test.agr', v_agr::text, true);

  INSERT INTO price_agreement_lines (agreement_id, product_name_override, price, unit, position)
  VALUES (v_agr, 'rls-seed-line', 10.0, 'per_kg', 0)
  RETURNING id INTO v_line;
  PERFORM set_config('test.line', v_line::text, true);
END $$;

-- ── Switch to non-superuser to enforce RLS ──────────────────
SET LOCAL ROLE authenticated;

-- ── VALID USER: full CRUD on price_agreements ───────────────

SELECT set_config('app.current_user_id', current_setting('test.user'), true);

SELECT isnt_empty(
  $$SELECT * FROM price_agreements$$,
  'valid user can SELECT price_agreements'
);

SELECT lives_ok(
  format($$
    INSERT INTO price_agreements (customer_id, agreed_by, valid_from)
    VALUES (%L, %L, CURRENT_DATE);
  $$, current_setting('test.cust'), current_setting('test.user')),
  'valid user can INSERT price_agreements'
);

SELECT lives_ok(
  format($$
    UPDATE price_agreements SET notes = 'rls-updated' WHERE id = %L;
  $$, current_setting('test.agr')),
  'valid user can UPDATE price_agreements'
);

-- ── VALID USER: full CRUD on price_agreement_lines ──────────

SELECT isnt_empty(
  $$SELECT * FROM price_agreement_lines$$,
  'valid user can SELECT price_agreement_lines'
);

SELECT lives_ok(
  format($$
    INSERT INTO price_agreement_lines (agreement_id, product_name_override, price, unit, position)
    VALUES (%L, 'rls-insert-line', 7.5, 'per_box', 1);
  $$, current_setting('test.agr')),
  'valid user can INSERT price_agreement_lines'
);

-- The KEY divergence from routes: the line PATCH (updateLine) issues an
-- in-place UPDATE, so the lines table needs an UPDATE policy. Assert it.
SELECT lives_ok(
  format($$
    UPDATE price_agreement_lines SET price = 11.0 WHERE id = %L;
  $$, current_setting('test.line')),
  'valid user can UPDATE price_agreement_lines (the lines-UPDATE divergence)'
);

SELECT lives_ok(
  format($$
    DELETE FROM price_agreement_lines WHERE agreement_id = %L AND position = 1;
  $$, current_setting('test.agr')),
  'valid user can DELETE price_agreement_lines'
);

-- ── VALID USER: DELETE the agreement (last; clear its lines first) ──
SELECT lives_ok(
  format($$DELETE FROM price_agreement_lines WHERE agreement_id = %L$$, current_setting('test.agr')),
  'valid user can clear price_agreement_lines before agreement delete'
);

SELECT lives_ok(
  format($$DELETE FROM price_agreements WHERE id = %L$$, current_setting('test.agr')),
  'valid user can DELETE price_agreements'
);

-- ── EMPTY GUC: fail-closed (no leak) ────────────────────────
-- Re-seed an agreement via a valid user so there IS a row to (fail to) see.
DO $$ DECLARE v_agr uuid;
BEGIN
  PERFORM set_config('app.current_user_id', current_setting('test.user'), true);
  INSERT INTO price_agreements (customer_id, agreed_by, valid_from, notes)
  VALUES (current_setting('test.cust')::uuid, current_setting('test.user')::uuid,
          CURRENT_DATE, 'rls-empty-guc-target')
  RETURNING id INTO v_agr;
  PERFORM set_config('test.agr2', v_agr::text, true);
END $$;

-- Empty GUC: current_user_is_valid() returns FALSE (no throw), so the SELECT
-- policy denies cleanly → ZERO rows visible (fail-closed without an exception).
SELECT set_config('app.current_user_id', '', true);
SELECT is_empty(
  $$SELECT * FROM price_agreements$$,
  'empty GUC is fail-closed on SELECT price_agreements (clean zero-rows deny)'
);

-- Empty GUC: the WITH CHECK predicate is FALSE → a clean 42501 RLS violation
-- (not a 22P02 cast error, because the helper short-circuits before any cast).
SELECT throws_ok(
  format($$
    INSERT INTO price_agreements (customer_id, agreed_by, valid_from)
    VALUES (%L, %L, CURRENT_DATE);
  $$, current_setting('test.cust'), current_setting('test.user')),
  '42501',
  NULL,
  'empty GUC is fail-closed on INSERT price_agreements (42501 RLS deny)'
);

-- ── SERVICE-ROLE: bypasses RLS (sees everything, GUC irrelevant) ──
RESET ROLE;                                          -- back to the superuser/owner test role
SELECT set_config('app.current_user_id', '', true);  -- empty GUC must NOT matter
SELECT isnt_empty(
  $$SELECT * FROM price_agreements WHERE notes = 'rls-empty-guc-target'$$,
  'service-role (RLS bypass) reads price_agreements regardless of an empty GUC'
);

SELECT * FROM finish();
ROLLBACK;
