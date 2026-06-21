-- 20260621130000_complaints_authenticated_rls_policies.sql
--
-- F-RLS-04f — Complaints/Compliments RLS cutover. Mirror of
-- 20260621120000 (cash), adapted to complaints + complaint_notes + compliments.
--
-- SHARED-BOARD model (Gate 1 LOCKED): any valid logged-in staff member may
-- SELECT/INSERT/UPDATE/DELETE every complaint/note/compliment — preserves
-- today's behaviour. NOT owner-restricted.
--
-- WHAT THIS DOES:
--   1) DROPs the 3 EXISTING dormant OWNERSHIP policies on `complaints`
--      (complaints_insert / complaints_select / complaints_update, baseline
--      L2431/2434/2437). They filter by user_id = app.current_user_id (owner-OR-
--      admin) which would HIDE other users' complaints from a non-admin under the
--      badge — wrong for the shared board. (There is NO baseline complaints_delete.)
--   2) CREATEs the FULL permissive valid-user set: 4 commands × 3 tables = 12
--      policies, using public.current_user_is_valid().
--
-- WHY THE FULL SET: complaint_notes (enable_rls_42 L116) and compliments (L117)
--   are RLS-ENABLED with ZERO policies → DENY EVERYTHING for the authenticated
--   role. Once the routes run as `authenticated`, every read returns nothing
--   unless SELECT policies ship → the boards blank. SELECT is the headline
--   must-fix. INSERT/UPDATE/DELETE ship too so create/resolve/note/post all work
--   under the badge. (complaints UPDATE is required — resolveOpen PATCHes a row
--   in place.)
--
-- ROLE MODEL — VALID-USER ONLY, no role filter (Pattern B, mirrors 04c/04d/04e):
--   any caller whose GUC maps to a real public.users row is allowed. No app-layer
--   role gate exists on these 8 routes today (all roles use them), so RLS is
--   never stricter than the route gating — the shared board is exactly preserved.
--
-- PREDICATE: public.current_user_is_valid() (SECURITY DEFINER STABLE helper,
--   shipped 20260618130000) — recursion-proof valid-user check. EXECUTE already
--   granted to `authenticated`; no new grant, no new helper.
--
-- GRANTS: baseline.sql L2563/L2568/L2573 already GRANT ALL on all three tables
--   TO authenticated → NO GRANT added here.
--
-- EMBEDS UNAFFECTED: the complaint/compliment reads embed `customers` and `users`;
--   both already have authenticated SELECT policies (customers_select baseline
--   L2449; users_directory_select 20260618130000) → FK names resolve under the
--   badge. This migration touches neither (F-RLS-04f §4 RISK 1).
--
-- NOT TOUCHED: audit_log policies (the screen2 routes' raw audit writes stay
--   master-key — F-TD-31). This migration is complaints/notes/compliments only.
--
-- MASTER-KEY ROLE still BYPASSES RLS (no FORCE) → the parachute singletons and
--   the raw audit/email service-role paths are unaffected.
--
-- NON-DESTRUCTIVE: DROP POLICY + CREATE POLICY only — no DROP TABLE/TRUNCATE/
--   ALTER TYPE/DROP COLUMN/DROP NOT NULL, no data touched → NO PITR gate fires.
--
-- One policy per command per table → no over-grant possible (Postgres OR's
--   permissive policies; here each command has exactly one).
--
-- Apply via Supabase MCP apply_migration ONLY. Local: npm run db:reset. Prod
-- application deferred to the ship gate: apply to PROD FIRST, then merge
-- (the 04a/04b/04c/04d/04e/F-TD-22 ordering).

-- ── 0) Remove the stale ownership policies on complaints (shared board) ──
DROP POLICY IF EXISTS complaints_insert        ON complaints;   -- baseline owner-only
DROP POLICY IF EXISTS complaints_select        ON complaints;   -- baseline owner-OR-admin
DROP POLICY IF EXISTS complaints_update        ON complaints;   -- baseline owner-OR-admin

-- ── idempotent drops of the NEW policy names ────────────────
DROP POLICY IF EXISTS complaints_select_v2     ON complaints;
DROP POLICY IF EXISTS complaints_insert_v2     ON complaints;
DROP POLICY IF EXISTS complaints_update_v2     ON complaints;
DROP POLICY IF EXISTS complaints_delete_v2     ON complaints;
DROP POLICY IF EXISTS complaint_notes_select   ON complaint_notes;
DROP POLICY IF EXISTS complaint_notes_insert   ON complaint_notes;
DROP POLICY IF EXISTS complaint_notes_update   ON complaint_notes;
DROP POLICY IF EXISTS complaint_notes_delete   ON complaint_notes;
DROP POLICY IF EXISTS compliments_select       ON compliments;
DROP POLICY IF EXISTS compliments_insert       ON compliments;
DROP POLICY IF EXISTS compliments_update       ON compliments;
DROP POLICY IF EXISTS compliments_delete       ON compliments;

-- ── complaints (shared board; UPDATE needed — resolveOpen PATCHes in place) ──
-- NOTE the _v2 suffix: the baseline used the bare names complaints_{select,insert,
-- update} for the OWNERSHIP rules we just dropped. New names avoid any ambiguity
-- with the baseline identifiers in logs/dumps and make the rollback unambiguous.
CREATE POLICY complaints_select_v2 ON complaints
  FOR SELECT USING ( public.current_user_is_valid() );
CREATE POLICY complaints_insert_v2 ON complaints
  FOR INSERT WITH CHECK ( public.current_user_is_valid() );
CREATE POLICY complaints_update_v2 ON complaints
  FOR UPDATE USING ( public.current_user_is_valid() )
             WITH CHECK ( public.current_user_is_valid() );
CREATE POLICY complaints_delete_v2 ON complaints
  FOR DELETE USING ( public.current_user_is_valid() );

-- ── complaint_notes (0 policies today; createNote INSERTs) ──
CREATE POLICY complaint_notes_select ON complaint_notes
  FOR SELECT USING ( public.current_user_is_valid() );
CREATE POLICY complaint_notes_insert ON complaint_notes
  FOR INSERT WITH CHECK ( public.current_user_is_valid() );
CREATE POLICY complaint_notes_update ON complaint_notes
  FOR UPDATE USING ( public.current_user_is_valid() )
             WITH CHECK ( public.current_user_is_valid() );
CREATE POLICY complaint_notes_delete ON complaint_notes
  FOR DELETE USING ( public.current_user_is_valid() );

-- ── compliments (0 policies today; createCompliment INSERTs) ──
CREATE POLICY compliments_select ON compliments
  FOR SELECT USING ( public.current_user_is_valid() );
CREATE POLICY compliments_insert ON compliments
  FOR INSERT WITH CHECK ( public.current_user_is_valid() );
CREATE POLICY compliments_update ON compliments
  FOR UPDATE USING ( public.current_user_is_valid() )
             WITH CHECK ( public.current_user_is_valid() );
CREATE POLICY compliments_delete ON compliments
  FOR DELETE USING ( public.current_user_is_valid() );

-- ROLLBACK (manual): DROP the 12 _v2/notes/compliments policies below (see also
-- the standalone rollback .sql under supabase/migrations/rollback/). The 3 dropped
-- baseline ownership policies are NOT auto-restored — see plan §11 rollback nuance
-- (they were dormant; the code lever is the real rollback).
-- DROP POLICY IF EXISTS complaints_select_v2     ON complaints;
-- DROP POLICY IF EXISTS complaints_insert_v2     ON complaints;
-- DROP POLICY IF EXISTS complaints_update_v2     ON complaints;
-- DROP POLICY IF EXISTS complaints_delete_v2     ON complaints;
-- DROP POLICY IF EXISTS complaint_notes_select   ON complaint_notes;
-- DROP POLICY IF EXISTS complaint_notes_insert   ON complaint_notes;
-- DROP POLICY IF EXISTS complaint_notes_update   ON complaint_notes;
-- DROP POLICY IF EXISTS complaint_notes_delete   ON complaint_notes;
-- DROP POLICY IF EXISTS compliments_select       ON compliments;
-- DROP POLICY IF EXISTS compliments_insert       ON compliments;
-- DROP POLICY IF EXISTS compliments_update       ON compliments;
-- DROP POLICY IF EXISTS compliments_delete       ON compliments;
