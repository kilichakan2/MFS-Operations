-- ============================================================
-- pgTAP: RLS policies on visits + visit_notes (F-RLS-04g)
-- ============================================================
-- Proves the Visits RLS cutover:
--
--   - The DORMANT baseline `visits` policies (own-row OR is_admin()) START
--     FIRING under the `authenticated` role. This migration did NOT touch them;
--     this test proves they now enforce owner-scoping. The OWNER-ONLY shape is
--     the headline: a non-owning non-admin (user-B / office's position) CANNOT
--     see user-A's visit — a test that only read the caller's own row would also
--     pass under a (wrong) shared-board policy, so the cross-rep DENY is the
--     proof.
--   - The NEW `visit_notes` policies (20260622120000_visit_notes_authenticated_
--     policies.sql) derive visibility FROM THE PARENT VISIT via an EXISTS
--     subquery: read a note iff you can see its visit (own OR admin); INSERT
--     additionally pins author = caller (anti-spoof); UPDATE/DELETE limited to
--     own note or admin.
--   - admin (is_admin() true) sees ALL visits + notes — the only see-all role.
--   - An EMPTY / ABSENT GUC is FAIL-CLOSED. The `visits` baseline policies cast
--     current_setting('app.current_user_id', true)::uuid, so an empty-string GUC
--     hits ''::uuid and THROWS SQLSTATE 22P02 *before* the `OR is_admin()`
--     short-circuit. `visit_notes`' policy uses the same cast inside its parent-
--     visit EXISTS subquery, so it throws 22P02 too. This is FAIL-CLOSED-BY-THROW:
--     security-equivalent to empty (no rows either way) and unreachable on the
--     live path (every flipped route mints a token for a real userId — 401 if
--     absent — and db_pre_request sets the GUC). Writes under an empty GUC are
--     blocked 42501. NOTE the divergence from complaints/04f: that cutover
--     REPLACED its baseline policies with the current_user_is_valid() helper
--     (clean empty result), whereas F-RLS-04g keeps the GUC-cast baseline `visits`
--     policies UNTOUCHED (guardrail #5) — hence this test asserts a 22P02 THROW
--     on empty-GUC SELECT, not an empty result set.
--   - The MASTER-KEY role BYPASSES RLS entirely (the rollback parachute + the
--     deferred screen3/sync create path).
--
-- RLS is enforced ONLY for non-bypass connections. These tests
-- SET LOCAL ROLE authenticated to simulate the per-request authenticated
-- client and set app.current_user_id to the test user.
--
-- "office sees none" is the SAME mechanism as the user-B assertions (user-B is a
-- non-owning, non-admin valid user = exactly office's position). The integration
-- layer asserts the office-empty board explicitly.
-- ============================================================

BEGIN;

-- Baseline already GRANTs ALL on both tables to authenticated in prod
-- (baseline.sql — visit_notes L2783). Re-assert explicitly so the test is
-- self-contained and clear about the privilege surface it relies on.
GRANT SELECT, INSERT, UPDATE, DELETE ON visits      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON visit_notes TO authenticated;

-- 17 assertions: logical checks #1-#16, but #14 is split into #14a (visits) +
-- #14b (visit_notes), so the GUC-cast empty-key fail-closed-by-throw is proven on
-- BOTH tables — hence 17 TAP lines, not 16.
SELECT plan(17);

\ir _helpers.sql

-- Fixtures (created via the bypass path — no RLS): user-A (sales, owns the
-- visit), user-B (sales, a DIFFERENT non-owning rep = office's position), an
-- admin user, one customer; one `visits` row owned by user-A (customer_id set,
-- prospect_name NULL to satisfy visits_customer_check); one `visit_notes` row on
-- that visit authored by user-A.
DO $$ DECLARE
  v_user_a  uuid := test_helper_make_user('rls-visits-user-a', 'sales');
  v_user_b  uuid := test_helper_make_user('rls-visits-user-b', 'sales');
  v_admin   uuid := test_helper_make_user('rls-visits-admin',  'admin');
  v_cust    uuid := test_helper_make_customer('rls-visits-cust');
  v_visit   uuid;
  v_note    uuid;
BEGIN
  PERFORM set_config('test.user_a', v_user_a::text, true);
  PERFORM set_config('test.user_b', v_user_b::text, true);
  PERFORM set_config('test.admin',  v_admin::text,  true);
  PERFORM set_config('test.cust',   v_cust::text,   true);

  -- Seed visit OWNED BY USER-A (valid visit_type/visit_outcome enum literals).
  INSERT INTO visits (user_id, customer_id, visit_type, outcome)
  VALUES (v_user_a, v_cust, 'routine', 'positive')
  RETURNING id INTO v_visit;
  PERFORM set_config('test.visit', v_visit::text, true);

  -- Seed note on that visit, authored by USER-A.
  INSERT INTO visit_notes (visit_id, user_id, body)
  VALUES (v_visit, v_user_a, 'rls-seed-visit-note')
  RETURNING id INTO v_note;
  PERFORM set_config('test.note', v_note::text, true);
END $$;

-- ── Switch to non-superuser to enforce RLS ──────────────────
SET LOCAL ROLE authenticated;

-- ── #1/#2: user-A (owner) sees own visit + own note ──────────
SELECT set_config('app.current_user_id', current_setting('test.user_a'), true);

SELECT isnt_empty(
  format($$SELECT * FROM visits WHERE id = %L$$, current_setting('test.visit')),
  '1: owner (user-A) can SELECT own visit'
);
SELECT isnt_empty(
  format($$SELECT * FROM visit_notes WHERE id = %L$$, current_setting('test.note')),
  '2: owner (user-A) can SELECT own note (parent-visit EXISTS)'
);

-- ── #3/#4: user-B (other rep, = office position) sees NEITHER ──
SELECT set_config('app.current_user_id', current_setting('test.user_b'), true);

SELECT is_empty(
  format($$SELECT * FROM visits WHERE id = %L$$, current_setting('test.visit')),
  '3: other-rep (user-B) CANNOT see user-A''s visit (owner-only fires)'
);
SELECT is_empty(
  format($$SELECT * FROM visit_notes WHERE id = %L$$, current_setting('test.note')),
  '4: other-rep (user-B) CANNOT see user-A''s note (inherits parent deny)'
);

-- ── #5/#6: admin sees ALL ────────────────────────────────────
SELECT set_config('app.current_user_id', current_setting('test.admin'), true);

SELECT isnt_empty(
  format($$SELECT * FROM visits WHERE id = %L$$, current_setting('test.visit')),
  '5: admin sees ALL visits (is_admin())'
);
SELECT isnt_empty(
  format($$SELECT * FROM visit_notes WHERE id = %L$$, current_setting('test.note')),
  '6: admin sees ALL notes'
);

-- ── #7: user-A can INSERT a note on own visit, author = A ─────
SELECT set_config('app.current_user_id', current_setting('test.user_a'), true);

SELECT lives_ok(
  format($$
    INSERT INTO visit_notes (visit_id, user_id, body)
    VALUES (%L, %L, 'rls-insert-own-note');
  $$, current_setting('test.visit'), current_setting('test.user_a')),
  '7: author can INSERT a note on own visit'
);

-- ── #8: user-B CANNOT insert a note on a visit they cannot see ─
SELECT set_config('app.current_user_id', current_setting('test.user_b'), true);

SELECT throws_ok(
  format($$
    INSERT INTO visit_notes (visit_id, user_id, body)
    VALUES (%L, %L, 'rls-insert-other-visit');
  $$, current_setting('test.visit'), current_setting('test.user_b')),
  '42501',
  NULL,
  '8: cannot INSERT a note on a visit you cannot see (parent EXISTS deny)'
);

-- ── #9: author-spoof — user-A inserts a note authored as user-B ─
SELECT set_config('app.current_user_id', current_setting('test.user_a'), true);

SELECT throws_ok(
  format($$
    INSERT INTO visit_notes (visit_id, user_id, body)
    VALUES (%L, %L, 'rls-insert-spoof');
  $$, current_setting('test.visit'), current_setting('test.user_b')),
  '42501',
  NULL,
  '9: cannot INSERT a note authored as someone else (WITH CHECK author = caller)'
);

-- ── #10: user-A can UPDATE own note ──────────────────────────
SELECT lives_ok(
  format($$
    UPDATE visit_notes SET body = 'rls-edited-own' WHERE id = %L;
  $$, current_setting('test.note')),
  '10: author can UPDATE own note'
);

-- ── #11: user-B cannot UPDATE user-A's note (0 rows under RLS) ─
SELECT set_config('app.current_user_id', current_setting('test.user_b'), true);

SELECT is_empty(
  format($$
    UPDATE visit_notes SET body = 'rls-hijack' WHERE id = %L RETURNING id;
  $$, current_setting('test.note')),
  '11: other-rep cannot UPDATE another author''s note (0 rows visible)'
);

-- ── #12: admin can UPDATE any note ───────────────────────────
SELECT set_config('app.current_user_id', current_setting('test.admin'), true);

SELECT lives_ok(
  format($$
    UPDATE visit_notes SET body = 'rls-admin-edit' WHERE id = %L;
  $$, current_setting('test.note')),
  '12: admin can UPDATE any note'
);

-- ── #13: user-A can DELETE own note (defense-in-depth policy) ─
SELECT set_config('app.current_user_id', current_setting('test.user_a'), true);

SELECT lives_ok(
  $$DELETE FROM visit_notes WHERE body = 'rls-insert-own-note';$$,
  '13: author can DELETE own note (defense-in-depth DELETE policy)'
);

-- ── #14: empty GUC is fail-closed-by-THROW on SELECT (22P02) ──
-- The `visits` baseline policy casts ('app.current_user_id', true)::uuid, so an
-- empty-string GUC hits ''::uuid and THROWS 22P02 *before* `OR is_admin()` can
-- short-circuit. `visit_notes` reuses the same cast inside its parent-visit
-- EXISTS subquery, so it throws 22P02 as well. Security-equivalent to empty (no
-- rows either way) and unreachable on the live path (routes 401 when no userId).
-- This DIVERGES from complaints/04f, which REPLACED its baseline with the
-- current_user_is_valid() helper (clean empty); F-RLS-04g keeps the GUC-cast
-- `visits` policies untouched (guardrail #5) → we assert the THROW, not empty.
SELECT set_config('app.current_user_id', '', true);

SELECT throws_ok(
  format($$SELECT * FROM visits WHERE id = %L$$, current_setting('test.visit')),
  '22P02',
  NULL,
  '14a: empty GUC fail-closed-by-throw on SELECT visits (22P02 ''''::uuid cast)'
);
SELECT throws_ok(
  format($$SELECT * FROM visit_notes WHERE id = %L$$, current_setting('test.note')),
  '22P02',
  NULL,
  '14b: empty GUC fail-closed-by-throw on SELECT visit_notes (22P02 in EXISTS cast)'
);

-- ── #15: empty GUC is fail-closed-by-THROW on INSERT (22P02) ──
-- Same root cause as #14: the visit_notes INSERT WITH CHECK casts the GUC to
-- uuid in BOTH clauses (the parent-visit EXISTS subquery's `v.user_id = ''::uuid`
-- and the author pin `visit_notes.user_id = ''::uuid`). An empty-string GUC hits
-- ''::uuid and THROWS 22P02 before the policy can produce a 42501 RLS denial. The
-- write still does NOT succeed → fail-closed is preserved; only the SQLSTATE
-- differs (22P02 cast-throw vs 42501 policy-deny). Unreachable on the live path
-- (routes 401 without a userId). Asserted as a 22P02 throw for the same reason as
-- #14a/#14b — see the EMPTY-GUC NOTE in the migration header.
SELECT throws_ok(
  format($$
    INSERT INTO visit_notes (visit_id, user_id, body)
    VALUES (%L, %L, 'rls-empty-guc-insert');
  $$, current_setting('test.visit'), current_setting('test.user_a')),
  '22P02',
  NULL,
  '15: empty GUC fail-closed-by-throw on INSERT visit_notes (22P02 ''''::uuid cast)'
);

-- ── #16: master-key role bypasses RLS (GUC irrelevant) ───────
RESET ROLE;                                          -- back to the superuser/owner test role
SELECT set_config('app.current_user_id', '', true);  -- empty GUC must NOT matter
SELECT isnt_empty(
  format($$SELECT * FROM visits WHERE id = %L$$, current_setting('test.visit')),
  '16: master-key role (RLS bypass) reads visits regardless of an empty GUC'
);

SELECT * FROM finish();
ROLLBACK;
