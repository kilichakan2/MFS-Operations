-- ============================================================
-- pgTAP: empty-GUC fail-closed pin (F-RLS-final)
-- ============================================================
-- Pins the SECURITY INVARIANT that anchors the whole RLS posture:
--
--     With the GUC `app.current_user_id` set to the EMPTY STRING — exactly what
--     the `db_pre_request` bridge sets when there is NO valid login — NO table
--     returns a foreign row under the per-request `authenticated` role.
--
-- This file ADDS NO migration and CHANGES NO schema. It documents the existing
-- baseline behaviour so a future change can't silently flip a deny into a leak.
--
-- The baseline policies split into TWO shapes, and the deny mechanism DIFFERS
-- per table (see F-RLS-final plan, Frame-correction flag #2). The pin asserts
-- the ACTUAL per-table mechanism, NOT a uniform "no error":
--
--   • Presence-check tables (customers / products) — the `_select` policy is a
--     TEXT presence check:
--         current_setting('app.current_user_id', true) IS NOT NULL
--           AND current_setting('app.current_user_id', true) <> ''
--     An empty-string GUC fails the `<> ''` test, so the policy denies by
--     returning an EMPTY result set — NO error (is_empty).
--
--   • Cast / is_admin() tables (users / visits, and is_admin() itself) — the
--     `_select` policy is `… OR public.is_admin()`, and is_admin() (baseline.sql
--     L181-187) does a BARE `current_setting('app.current_user_id', true)::uuid`
--     with no nullif. `''::uuid` raises 22P02 ("invalid input syntax for type
--     uuid"). So an empty GUC on these tables THROWS 22P02 — which still DENIES
--     (the query errors out; no rows leak), but by jamming the lock, not by
--     quietly returning nothing (throws_ok '22P02').
--
-- Both outcomes satisfy the invariant: empty GUC => no foreign row. Asserting
-- the per-table mechanism means a future change that, e.g., wraps is_admin() in
-- nullif (flipping a throw into an empty result) is CAUGHT and forces a
-- conscious update — not a silent drift toward a leak.
--
-- RLS is enforced ONLY for non-bypass connections. SET LOCAL ROLE authenticated
-- simulates the per-request authenticated client. The baseline already GRANTs to
-- authenticated; we re-assert the grants explicitly so the test is
-- self-contained about the privilege surface it relies on (mirrors 014 / 016).
-- ============================================================

BEGIN;

-- Re-assert the authenticated-role grants (already in baseline.sql) so the test
-- is self-contained and clear about the privilege surface it relies on.
GRANT SELECT, INSERT, UPDATE, DELETE ON customers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON products  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON users     TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON visits    TO authenticated;

SELECT plan(8);

\ir _helpers.sql

-- Fixtures (created via the bypass path — no RLS) so there IS a real row that
-- the empty-GUC query must FAIL to see: an admin user, one customer, one
-- product, and one visit owned by the admin.
DO $$ DECLARE
  v_admin uuid := test_helper_make_user('empty-guc-admin', 'admin');
  v_cust  uuid := test_helper_make_customer('empty-guc-cust');
  v_prod  uuid := test_helper_make_product('empty-guc-prod', 'EMPTY-GUC-001');
  v_visit uuid;
BEGIN
  PERFORM set_config('test.admin', v_admin::text, true);
  PERFORM set_config('test.cust',  v_cust::text,  true);
  PERFORM set_config('test.prod',  v_prod::text,  true);

  INSERT INTO visits (user_id, customer_id, visit_type, outcome)
  VALUES (v_admin, v_cust, 'routine', 'positive')
  RETURNING id INTO v_visit;
  PERFORM set_config('test.visit', v_visit::text, true);
END $$;

-- ── Switch to non-superuser so RLS is actually enforced ─────
SET LOCAL ROLE authenticated;

-- ── The empty-string GUC: the exact db_pre_request fail-closed value ──
SELECT set_config('app.current_user_id', '', true);

-- ── Presence-check tables: empty GUC => EMPTY result, NO error ──────────
-- #1: customers — TEXT presence policy denies by returning nothing.
SELECT is_empty(
  format($$SELECT * FROM customers WHERE id = %L$$, current_setting('test.cust')),
  '1: empty GUC SELECT customers is fail-closed (presence policy => empty, no throw)'
);

-- #2: products — same presence policy.
SELECT is_empty(
  format($$SELECT * FROM products WHERE id = %L$$, current_setting('test.prod')),
  '2: empty GUC SELECT products is fail-closed (presence policy => empty, no throw)'
);

-- ── Cast / is_admin() tables: empty GUC => THROWS 22P02 (still a deny) ───
-- #3: users — `… OR is_admin()`; is_admin()'s bare ''::uuid cast throws 22P02.
SELECT throws_ok(
  format($$SELECT * FROM users WHERE id = %L$$, current_setting('test.admin')),
  '22P02', NULL,
  '3: empty GUC SELECT users THROWS 22P02 (is_admin() bare ::uuid cast) — denies by jamming'
);

-- #4: visits — `… OR is_admin()`; same 22P02 throw on empty GUC.
SELECT throws_ok(
  format($$SELECT * FROM visits WHERE id = %L$$, current_setting('test.visit')),
  '22P02', NULL,
  '4: empty GUC SELECT visits THROWS 22P02 (is_admin() bare ::uuid cast) — denies by jamming'
);

-- #5: is_admin() itself — the ROOT cause of the throws above. Pinning it
--     documents WHY users/visits jam rather than return empty.
SELECT throws_ok(
  $$SELECT public.is_admin()$$,
  '22P02', NULL,
  '5: empty GUC public.is_admin() THROWS 22P02 (bare ::uuid cast is the root cause)'
);

-- ── Positive sanity: a VALID GUC returns the row — proving the empty-GUC
--    denial is the GUC's doing, not a broken fixture ──────────────────────
SELECT set_config('app.current_user_id', current_setting('test.admin'), true);

-- #6: valid GUC — customers row is now visible (presence policy passes).
SELECT isnt_empty(
  format($$SELECT * FROM customers WHERE id = %L$$, current_setting('test.cust')),
  '6: valid GUC SELECT customers returns the row (presence policy passes)'
);

-- #7: valid GUC — is_admin() resolves to true for the admin fixture (no throw).
SELECT is(
  public.is_admin(),
  true,
  '7: valid admin GUC public.is_admin() resolves to true (no throw)'
);

-- #8: valid GUC — visits row is now visible (is_admin() => all rows).
SELECT isnt_empty(
  format($$SELECT * FROM visits WHERE id = %L$$, current_setting('test.visit')),
  '8: valid admin GUC SELECT visits returns the row (is_admin() => all rows)'
);

SELECT * FROM finish();
ROLLBACK;
