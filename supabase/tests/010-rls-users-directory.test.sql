-- ============================================================
-- pgTAP: user-directory read access on public.users (F-RLS-04c addendum)
-- ============================================================
-- Proves the directory-read fix
-- (20260618130000_users_directory_read_for_authenticated.sql):
--
--   (a) A NON-ADMIN valid-user GUC CAN SELECT id/name/role of ANOTHER
--       user's row — the directory policy (users_directory_select) OR's
--       with the baseline own-row-OR-admin users_select, so any logged-in
--       user can read every user's NON-HASH columns. This is the fix for
--       the Routes assignee/creator NULL-name regression under the
--       authenticated role.
--
--   (b) The SAME non-admin caller CANNOT read pin_hash / password_hash of
--       another user — the column-privilege lockdown (REVOKE blanket SELECT,
--       re-GRANT only the 8 non-hash columns) DENIES the hash columns at the
--       PRIVILEGE layer (42501 insufficient_privilege), regardless of the
--       permissive row policy. THIS IS THE HASH-PROTECTION PROOF.
--
--   (c) The SERVICE-ROLE connection CAN still read pin_hash / password_hash
--       of any user — login + kds-pin (which run under service-role) stay
--       intact.
--
-- IMPORTANT (column-privilege, not RLS): case (b) is a COLUMN GRANT denial,
-- not a row-policy denial. Local Supabase otherwise ships the blanket
-- `GRANT ALL ON users TO authenticated`, so the migration's REVOKE +
-- narrowed-GRANT must be replicated INSIDE this txn BEFORE switching to the
-- authenticated role — exactly the prod privilege surface (mirroring 007's
-- explicit-grant precedent). Without it (b) would pass for the wrong reason.
-- ============================================================

BEGIN;

\ir _helpers.sql

-- Replicate the PROD privilege surface for `authenticated`: the directory
-- migration REVOKEs blanket SELECT and re-grants only the 8 non-hash columns.
-- (The migration ran on db:reset, but re-assert here so the test is
-- self-contained and exercises the column-privilege deny deterministically.)
REVOKE SELECT ON public.users FROM authenticated;
GRANT  SELECT (id, created_at, name, role, active, last_login_at, email, secondary_roles)
  ON public.users TO authenticated;

SELECT plan(5);

-- Fixtures via the service-role/superuser path (bypasses RLS). The non-admin
-- caller (warehouse) reads a peer row. We make the peer an ADMIN so it carries
-- a password_hash (test_helper_make_user only sets password_hash for admins;
-- non-admins carry pin_hash) — this lets case (c) prove the owner reads BOTH
-- hash columns from rows that actually populate them: password_hash from the
-- admin peer, pin_hash from the warehouse caller.
DO $$ DECLARE
  v_caller uuid := test_helper_make_user('rls-dir-caller', 'warehouse');
  v_peer   uuid := test_helper_make_user('rls-dir-peer',   'admin');
BEGIN
  PERFORM set_config('test.caller', v_caller::text, true);
  PERFORM set_config('test.peer',   v_peer::text,   true);
END $$;

-- ── (c) SERVICE-ROLE / superuser can still read the hash columns ──
-- Run this BEFORE switching role, while still the owner (proxy for the
-- service-role path that bypasses RLS and holds full column privilege).
SELECT isnt(
  (SELECT password_hash FROM users WHERE id = current_setting('test.peer')::uuid),
  NULL,
  'service-role/owner CAN read password_hash (login path intact)'
);
SELECT isnt(
  (SELECT pin_hash FROM users WHERE id = current_setting('test.caller')::uuid),
  NULL,
  'service-role/owner CAN read pin_hash (kds-pin path intact)'
);

-- ── Switch to non-superuser to enforce RLS + column privilege ──
SET LOCAL ROLE authenticated;
SELECT set_config('app.current_user_id', current_setting('test.caller'), true);

-- ── (a) non-admin CAN read a PEER's id/name/role (directory policy) ──
SELECT is(
  (SELECT name FROM users WHERE id = current_setting('test.peer')::uuid),
  'rls-dir-peer',
  'non-admin valid-user CAN SELECT another users row name/role (users_directory_select)'
);

-- ── (b) non-admin CANNOT read the peer's hash columns (column deny) ──
-- Selecting password_hash as `authenticated` is refused for lack of column
-- privilege → 42501 insufficient_privilege. THE hash-protection proof.
SELECT throws_ok(
  format($$SELECT password_hash FROM users WHERE id = %L$$, current_setting('test.peer')),
  '42501',
  NULL,
  'non-admin CANNOT read password_hash of another user (column-privilege deny — hashes sealed)'
);
SELECT throws_ok(
  format($$SELECT pin_hash FROM users WHERE id = %L$$, current_setting('test.peer')),
  '42501',
  NULL,
  'non-admin CANNOT read pin_hash of another user (column-privilege deny — hashes sealed)'
);

SELECT * FROM finish();
ROLLBACK;
