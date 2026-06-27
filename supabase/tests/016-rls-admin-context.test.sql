-- ============================================================
-- pgTAP: RLS policies on customers + products + audit_log (F-RLS-04i)
-- ============================================================
-- Proves the admin-context RLS cutover at the DB layer. The 15 admin-context
-- routes stopped using the RLS-bypassing service-role key and now run as the
-- per-request `authenticated` role (GUC `app.current_user_id` set from an
-- app-minted token), so the baseline policies below finally enforce:
--
--   customers / products:
--     - SELECT  : any authed user (GUC present + non-empty) — presence policy.
--     - INSERT  : is_admin() only.
--     - UPDATE  : is_admin() only.
--     - an ABSENT / EMPTY GUC SELECT is FAIL-CLOSED. NOTE: unlike `visits`
--       (which casts the GUC to uuid and throws 22P02), the customers/products
--       `_select` policy is a TEXT presence check
--       (current_setting(...) IS NOT NULL AND <> ''), so an empty-string GUC
--       returns an EMPTY result set (clean deny), NOT a throw. We assert empty.
--
--   audit_log:
--     - INSERT  : WITH CHECK (user_id = GUC) — the inserted row's author must be
--                 the caller (anti-spoof). This is what makes the import audit
--                 write pass ONLY when created_by/user_id == caller.userId.
--     - SELECT  : is_admin() only.
--
--   visits (cross-rep, mirrors I3 at the DB layer):
--     - admin (is_admin() true) sees ANOTHER rep's visit; a non-owning non-admin
--       does NOT. This is the headline R-VIS tripwire: a silent narrowing would
--       leave the admin analytics screens empty.
--
-- RLS is enforced ONLY for non-bypass connections. These tests
-- SET LOCAL ROLE authenticated to simulate the per-request authenticated client
-- and set app.current_user_id to the test user. The baseline already GRANTs ALL
-- on these tables to authenticated; we re-assert the grants explicitly so the
-- test is self-contained about the privilege surface it relies on (mirrors 006 /
-- 014).
-- ============================================================

BEGIN;

-- Re-assert the authenticated-role grants (already in baseline.sql) so the test
-- is self-contained and clear about the privilege surface it relies on.
GRANT SELECT, INSERT, UPDATE, DELETE ON customers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON products  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON audit_log TO authenticated;

SELECT plan(18);

\ir _helpers.sql

-- Fixtures (created via the bypass path — no RLS): an admin user, a sales user
-- (non-admin), a second sales rep, one customer, one product, one visit OWNED BY
-- the second rep (so the admin cross-rep read has a foreign row to find).
DO $$ DECLARE
  v_admin   uuid := test_helper_make_user('rls-admin-ctx-admin', 'admin');
  v_sales   uuid := test_helper_make_user('rls-admin-ctx-sales', 'sales');
  v_rep_b   uuid := test_helper_make_user('rls-admin-ctx-rep-b', 'sales');
  v_cust    uuid := test_helper_make_customer('rls-admin-ctx-cust');
  v_prod    uuid := test_helper_make_product('rls-admin-ctx-prod', 'RLS-ADMIN-CTX-001');
  v_visit   uuid;
BEGIN
  PERFORM set_config('test.admin', v_admin::text, true);
  PERFORM set_config('test.sales', v_sales::text, true);
  PERFORM set_config('test.rep_b', v_rep_b::text, true);
  PERFORM set_config('test.cust',  v_cust::text,  true);
  PERFORM set_config('test.prod',  v_prod::text,  true);

  -- A visit owned by rep-B (valid visit_type/outcome enum literals).
  INSERT INTO visits (user_id, customer_id, visit_type, outcome)
  VALUES (v_rep_b, v_cust, 'routine', 'positive')
  RETURNING id INTO v_visit;
  PERFORM set_config('test.visit', v_visit::text, true);
END $$;

-- ── Switch to non-superuser to enforce RLS ──────────────────
SET LOCAL ROLE authenticated;

-- ── customers SELECT presence policy ─────────────────────────
-- #1: admin (GUC present) can SELECT customers.
SELECT set_config('app.current_user_id', current_setting('test.admin'), true);
SELECT isnt_empty(
  format($$SELECT * FROM customers WHERE id = %L$$, current_setting('test.cust')),
  '1: admin (GUC present) can SELECT customers'
);

-- #2: a non-admin authed user can ALSO SELECT customers (presence policy, not is_admin()).
SELECT set_config('app.current_user_id', current_setting('test.sales'), true);
SELECT isnt_empty(
  format($$SELECT * FROM customers WHERE id = %L$$, current_setting('test.cust')),
  '2: non-admin authed user can SELECT customers (presence policy)'
);

-- #3: empty GUC SELECT is fail-closed (TEXT presence check → empty result, no throw).
SELECT set_config('app.current_user_id', '', true);
SELECT is_empty(
  format($$SELECT * FROM customers WHERE id = %L$$, current_setting('test.cust')),
  '3: empty GUC SELECT customers is fail-closed (presence policy → empty)'
);

-- ── customers INSERT / UPDATE is_admin() ─────────────────────
-- #4: admin can INSERT a customer.
SELECT set_config('app.current_user_id', current_setting('test.admin'), true);
SELECT lives_ok(
  $$INSERT INTO customers (name, active) VALUES ('rls-admin-insert-cust', true);$$,
  '4: admin can INSERT a customer (is_admin() WITH CHECK)'
);

-- #5: non-admin INSERT is REJECTED 42501.
SELECT set_config('app.current_user_id', current_setting('test.sales'), true);
SELECT throws_ok(
  $$INSERT INTO customers (name, active) VALUES ('rls-nonadmin-insert-cust', true);$$,
  '42501', NULL,
  '5: non-admin INSERT customer is REJECTED (42501 — is_admin() false)'
);

-- #6: admin can UPDATE a customer.
SELECT set_config('app.current_user_id', current_setting('test.admin'), true);
SELECT lives_ok(
  format($$UPDATE customers SET active = false WHERE id = %L;$$, current_setting('test.cust')),
  '6: admin can UPDATE a customer (is_admin())'
);

-- #7: non-admin UPDATE is denied (0 rows visible to the UPDATE under RLS).
SELECT set_config('app.current_user_id', current_setting('test.sales'), true);
SELECT is_empty(
  format($$UPDATE customers SET active = true WHERE id = %L RETURNING id;$$, current_setting('test.cust')),
  '7: non-admin UPDATE customer affects 0 rows (is_admin() USING denies)'
);

-- ── products SELECT presence + INSERT/UPDATE is_admin() ──────
-- #8: admin can SELECT products.
SELECT set_config('app.current_user_id', current_setting('test.admin'), true);
SELECT isnt_empty(
  format($$SELECT * FROM products WHERE id = %L$$, current_setting('test.prod')),
  '8: admin (GUC present) can SELECT products'
);

-- #9: non-admin can ALSO SELECT products (presence policy).
SELECT set_config('app.current_user_id', current_setting('test.sales'), true);
SELECT isnt_empty(
  format($$SELECT * FROM products WHERE id = %L$$, current_setting('test.prod')),
  '9: non-admin authed user can SELECT products (presence policy)'
);

-- #10: admin can INSERT a product.
SELECT set_config('app.current_user_id', current_setting('test.admin'), true);
SELECT lives_ok(
  $$INSERT INTO products (name, code, active) VALUES ('rls-admin-insert-prod', 'RLS-ADMIN-P2', true);$$,
  '10: admin can INSERT a product (is_admin() WITH CHECK)'
);

-- #11: non-admin INSERT product is REJECTED 42501.
SELECT set_config('app.current_user_id', current_setting('test.sales'), true);
SELECT throws_ok(
  $$INSERT INTO products (name, code, active) VALUES ('rls-nonadmin-insert-prod', 'RLS-NONADMIN-P', true);$$,
  '42501', NULL,
  '11: non-admin INSERT product is REJECTED (42501 — is_admin() false)'
);

-- #12: admin can UPDATE a product.
SELECT set_config('app.current_user_id', current_setting('test.admin'), true);
SELECT lives_ok(
  format($$UPDATE products SET active = false WHERE id = %L;$$, current_setting('test.prod')),
  '12: admin can UPDATE a product (is_admin())'
);

-- ── audit_log INSERT WITH CHECK (user_id = GUC) ──────────────
-- #13: a caller can INSERT an audit row authored as themselves.
SELECT set_config('app.current_user_id', current_setting('test.admin'), true);
SELECT lives_ok(
  format($$
    INSERT INTO audit_log (user_id, screen, action, record_id, summary)
    VALUES (%L, 'screen5', 'imported', NULL, 'rls-audit-self');
  $$, current_setting('test.admin')),
  '13: caller can INSERT an audit row authored as themselves (user_id = GUC)'
);

-- #14: an audit INSERT authored as someone ELSE is REJECTED 42501 (anti-spoof).
SELECT throws_ok(
  format($$
    INSERT INTO audit_log (user_id, screen, action, record_id, summary)
    VALUES (%L, 'screen5', 'imported', NULL, 'rls-audit-spoof');
  $$, current_setting('test.sales')),
  '42501', NULL,
  '14: audit INSERT authored as another user is REJECTED (42501 — WITH CHECK user_id = GUC)'
);

-- ── audit_log SELECT is_admin() ──────────────────────────────
-- #15: admin can SELECT audit_log.
SELECT isnt_empty(
  $$SELECT * FROM audit_log WHERE summary = 'rls-audit-self'$$,
  '15: admin can SELECT audit_log (is_admin())'
);

-- #16: a non-admin canNOT SELECT audit_log (is_admin() false → empty).
SELECT set_config('app.current_user_id', current_setting('test.sales'), true);
SELECT is_empty(
  $$SELECT * FROM audit_log WHERE summary = 'rls-audit-self'$$,
  '16: non-admin canNOT SELECT audit_log (is_admin() false → empty)'
);

-- ── visits cross-rep (R-VIS / I3 at the DB layer) ────────────
-- #17: admin sees ANOTHER rep's visit (is_admin() in visits policy → all rows).
SELECT set_config('app.current_user_id', current_setting('test.admin'), true);
SELECT isnt_empty(
  format($$SELECT * FROM visits WHERE id = %L$$, current_setting('test.visit')),
  '17: admin sees ANOTHER rep''s visit (cross-rep via is_admin())'
);

-- #18: a non-owning non-admin does NOT see that rep's visit (owner-only fires).
SELECT set_config('app.current_user_id', current_setting('test.sales'), true);
SELECT is_empty(
  format($$SELECT * FROM visits WHERE id = %L$$, current_setting('test.visit')),
  '18: non-owning non-admin CANNOT see another rep''s visit (no silent share)'
);

SELECT * FROM finish();
ROLLBACK;
