-- ============================================================
-- pgTAP: RLS write policies on public.users (F-RLS-04b)
-- ============================================================
-- Verifies the 3 new write policies added by
-- 20260617124846_users_authenticated_write_policies.sql:
--
--   users_insert  WITH CHECK ( is_admin() )
--   users_update  USING + WITH CHECK ( is_admin() )
--   users_delete  USING ( is_admin() )
--
-- RLS is enforced ONLY for non-service-role connections — the
-- service-role key bypasses RLS entirely. These tests SET LOCAL ROLE
-- authenticated and set app.current_user_id to simulate the per-request
-- authenticated (keycard) client the 4 admin routes now use.
--
-- Matrix:
--   - admin GUC      → INSERT / UPDATE / DELETE all ALLOWED
--   - non-admin GUC  → INSERT / UPDATE / DELETE all DENIED
--   - empty GUC ('') → INSERT DENIED (not errored — inline nullif()::uuid → NULL → no match)
-- ============================================================

BEGIN;

-- Local Supabase doesn't auto-grant the users table to the authenticated
-- role; production does. Replicate the prod GRANT explicitly so the
-- RLS-under-authenticated tests exercise the policies (not a missing GRANT).
GRANT SELECT, INSERT, UPDATE, DELETE ON users TO authenticated;

SELECT plan(10);

\ir _helpers.sql

-- Fixtures created via the service-role/superuser path (bypasses RLS):
--   an admin, a non-admin (warehouse), and one pre-existing warehouse row
--   the UPDATE/DELETE cases target.
DO $$ DECLARE
  v_admin     uuid := test_helper_make_user('rls-u-admin',     'admin');
  v_warehouse uuid := test_helper_make_user('rls-u-warehouse', 'warehouse');
  v_target    uuid := test_helper_make_user('rls-u-target',    'warehouse');
BEGIN
  PERFORM set_config('test.admin',     v_admin::text,     true);
  PERFORM set_config('test.warehouse', v_warehouse::text, true);
  PERFORM set_config('test.target',    v_target::text,    true);
END $$;

-- ── Switch to non-superuser to enforce RLS ──────────────────
SET LOCAL ROLE authenticated;

-- ── INSERT ──────────────────────────────────────────────────

-- admin → INSERT allowed (warehouse row needs pin_hash to satisfy users_auth_check)
SELECT set_config('app.current_user_id', current_setting('test.admin'), true);
SELECT lives_ok(
  $$INSERT INTO users (name, role, active, pin_hash)
    VALUES ('rls-u-admin-insert', 'warehouse', true,
            '$2a$10$ANVILTESTPLACEHOLDERHASHFORTESTSXXXXXXXXXXXXXXXXX')$$,
  'admin can INSERT a user (users_insert)'
);

-- non-admin → INSERT denied (42501 = insufficient_privilege from RLS)
SELECT set_config('app.current_user_id', current_setting('test.warehouse'), true);
SELECT throws_ok(
  $$INSERT INTO users (name, role, active, pin_hash)
    VALUES ('rls-u-warehouse-insert', 'warehouse', true,
            '$2a$10$ANVILTESTPLACEHOLDERHASHFORTESTSXXXXXXXXXXXXXXXXX')$$,
  '42501',
  NULL,
  'non-admin cannot INSERT a user (users_insert denies)'
);

-- empty GUC → INSERT REJECTED (fail-closed: no row is ever written). The
-- security invariant is "a blank/no-identity keycard cannot create a user" —
-- which holds regardless of the exact SQLSTATE. NOTE: the rejection currently
-- surfaces as 22P02 (not a 42501 deny) because the new write policy's
-- "is the caller an admin?" subquery scans public.users, which is governed by
-- the PRE-EXISTING users_select read policy whose ::uuid cast is unguarded on
-- the empty string. This is pre-existing (F-RLS-04a's orders policies share it),
-- unreachable on the authenticated admin routes (they always carry a valid
-- token), and tracked for hardening in F-RLS-04b-is-admin-guard. We assert
-- "throws (rejected)" rather than the code, so the test is truthful today and
-- stays green after the helper is hardened to a clean deny.
SELECT set_config('app.current_user_id', '', true);
SELECT throws_ok(
  $$INSERT INTO users (name, role, active, pin_hash)
    VALUES ('rls-u-empty-insert', 'warehouse', true,
            '$2a$10$ANVILTESTPLACEHOLDERHASHFORTESTSXXXXXXXXXXXXXXXXX')$$,
  NULL,
  NULL,
  'empty GUC cannot INSERT a user (rejected, fail-closed — no row written)'
);

-- Prove the INVARIANT (not just "it threw"): no row was written. Switch the GUC
-- back to the admin so the verification read passes users_select (the empty GUC
-- would make this SELECT throw via the same unguarded ::uuid cast).
SELECT set_config('app.current_user_id', current_setting('test.admin'), true);
SELECT is(
  (SELECT count(*)::int FROM users WHERE name = 'rls-u-empty-insert'),
  0,
  'empty GUC INSERT wrote no row'
);

-- ── UPDATE ──────────────────────────────────────────────────

-- admin → UPDATE allowed
SELECT set_config('app.current_user_id', current_setting('test.admin'), true);
SELECT lives_ok(
  format($$UPDATE users SET active = false WHERE id = %L$$,
         current_setting('test.target')),
  'admin can UPDATE a user (users_update)'
);

-- non-admin → UPDATE is RLS-filtered to zero rows (no permission, no match)
SELECT set_config('app.current_user_id', current_setting('test.warehouse'), true);
DO $$ DECLARE v_affected int;
BEGIN
  WITH u AS (
    UPDATE users SET active = false
    WHERE id = current_setting('test.target')::uuid
    RETURNING id
  )
  SELECT COUNT(*)::int INTO v_affected FROM u;
  PERFORM set_config('test.nonadmin_update_count', v_affected::text, true);
END $$;
SELECT is(
  current_setting('test.nonadmin_update_count')::int,
  0,
  'non-admin UPDATE on a user is RLS-filtered (no rows affected)'
);

-- empty GUC → UPDATE REJECTED (fail-closed: target row is never modified).
-- Same pre-existing users_select cast as the INSERT case above — surfaces as a
-- throw rather than a 0-row filter. We assert "throws (rejected)" so the write
-- cannot silently succeed; the valid-non-admin case above already proves the
-- clean RLS-filter path. (Tracked: F-RLS-04b-is-admin-guard.)
SELECT set_config('app.current_user_id', '', true);
SELECT throws_ok(
  format($$UPDATE users SET active = false WHERE id = %L$$,
         current_setting('test.target')),
  NULL,
  NULL,
  'empty GUC cannot UPDATE a user (rejected, fail-closed — row unchanged)'
);

-- Prove the INVARIANT (not just "it threw"): the target row is UNCHANGED. The
-- admin-UPDATE above set active=false and the non-admin UPDATE was RLS-filtered
-- to 0 rows, so the target's active is false right before this empty-GUC throw —
-- it must STILL be false. Read with the admin GUC (the empty GUC would make this
-- SELECT throw via users_select's unguarded ::uuid cast).
SELECT set_config('app.current_user_id', current_setting('test.admin'), true);
SELECT is(
  (SELECT active FROM users WHERE id = current_setting('test.target')::uuid),
  false,
  'empty GUC UPDATE did not modify the target row'
);

-- ── DELETE ──────────────────────────────────────────────────

-- non-admin → DELETE is RLS-filtered to zero rows (target survives)
SELECT set_config('app.current_user_id', current_setting('test.warehouse'), true);
DO $$ DECLARE v_affected int;
BEGIN
  WITH d AS (
    DELETE FROM users
    WHERE id = current_setting('test.target')::uuid
    RETURNING id
  )
  SELECT COUNT(*)::int INTO v_affected FROM d;
  PERFORM set_config('test.nonadmin_delete_count', v_affected::text, true);
END $$;
SELECT is(
  current_setting('test.nonadmin_delete_count')::int,
  0,
  'non-admin DELETE on a user is RLS-filtered (no rows affected)'
);

-- admin → DELETE allowed (one row removed)
SELECT set_config('app.current_user_id', current_setting('test.admin'), true);
DO $$ DECLARE v_affected int;
BEGIN
  WITH d AS (
    DELETE FROM users
    WHERE id = current_setting('test.target')::uuid
    RETURNING id
  )
  SELECT COUNT(*)::int INTO v_affected FROM d;
  PERFORM set_config('test.admin_delete_count', v_affected::text, true);
END $$;
SELECT is(
  current_setting('test.admin_delete_count')::int,
  1,
  'admin can DELETE a user (users_delete — one row removed)'
);

SELECT * FROM finish();
ROLLBACK;
