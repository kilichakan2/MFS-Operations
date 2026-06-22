-- 20260622120000_visit_notes_authenticated_policies.sql
--
-- F-RLS-04g — Visits RLS cutover. The 7th copy of the cutover pattern
-- (04a Orders → 04f Complaints). Adds the MISSING visit_notes policies.
--
-- KEY DECISION — the `visits` table policies are NOT touched. The dormant
-- baseline policies already encode the rule exactly (baseline.sql L2494-2503):
--   visits_select/update/delete: USING (user_id = app.current_user_id OR is_admin())
--   visits_insert:               WITH CHECK (user_id = app.current_user_id)
-- They simply START FIRING once the routes run as the `authenticated` role.
-- DO NOT add/alter/drop any `visits` policy.
--
-- EMPTY-GUC NOTE (divergence from complaints/04f): the baseline `visits` policies
-- cast current_setting('app.current_user_id', true)::uuid, so an empty-string GUC
-- THROWS SQLSTATE 22P02 (''::uuid) before `OR is_admin()` short-circuits — and the
-- visit_notes policies below reuse that cast inside their EXISTS subquery, so they
-- throw too. This is fail-closed-by-throw (no rows either way; unreachable on the
-- live path — routes 401 without a userId). Complaints/04f instead REPLACED its
-- baseline with the current_user_is_valid() helper (clean empty); F-RLS-04g keeps
-- the GUC-cast `visits` policies untouched, so pgTAP 014 asserts a 22P02 throw on
-- empty-GUC SELECT (assertions #14a/#14b), not an empty result set.
--
-- THE TRAP this migration fixes: visit_notes has RLS ENABLED
-- (20260613000000_enable_rls_42_tables.sql:115) with ZERO policies → deny-all to
-- the authenticated role. Without these policies EVERY notes route returns
-- empty/blank once the routes are cut over.
--
-- POLICY SHAPE — visibility is DERIVED FROM THE PARENT VISIT (single source of
-- truth; notes inherit the visit's access rule via an EXISTS subquery):
--   SELECT: parent visit is visible to the caller (own OR admin)
--   INSERT: parent visit is visible AND the note's author is the caller
--   UPDATE: edit only your own note, or admin (app rule "author or manager";
--           manager = admin only here)
--   DELETE: own note or admin — defense-in-depth symmetry (NO delete-note route
--           exists today, so it is not route-exercised; added for parity — see
--           plan §8.2 for the decision).
--
-- ROLE MODEL: the EXISTS predicate references visits.user_id vs the GUC and
-- public.is_admin() — so sales/drivers see only notes on their own visits, admin
-- sees all, office sees none (no visits → no notes). Matches the visits rule.
--
-- GRANTS: baseline.sql L2783 already GRANTs ALL on visit_notes TO authenticated
--   → NO GRANT added here.
--
-- EMBEDS UNAFFECTED: visit detail/admin reads embed `customers` (customers_select
--   baseline L2449) and `users` (users_directory_select 20260618130000); both
--   grant authenticated SELECT → FK names resolve under the badge. Untouched.
--
-- MASTER-KEY role still BYPASSES RLS (tables are ENABLE, not FORCE) → the
--   parachute singleton and the deferred screen3/sync create path are unaffected.
--
-- NON-DESTRUCTIVE: DROP POLICY IF EXISTS + CREATE POLICY only — no DROP TABLE/
--   TRUNCATE/ALTER TYPE/DROP COLUMN/DROP NOT NULL, no data touched → NO PITR gate.
--
-- Apply via Supabase MCP apply_migration ONLY. Local: npm run db:reset. Prod
-- application deferred to the ship gate: apply to PROD FIRST, then merge
-- (the 04a-04f / F-TD-22 ordering).

-- ── idempotent drops of the NEW policy names (re-runnable) ──
DROP POLICY IF EXISTS visit_notes_select ON visit_notes;
DROP POLICY IF EXISTS visit_notes_insert ON visit_notes;
DROP POLICY IF EXISTS visit_notes_update ON visit_notes;
DROP POLICY IF EXISTS visit_notes_delete ON visit_notes;

-- ── SELECT: visible iff the PARENT VISIT is visible to the caller ──
CREATE POLICY visit_notes_select ON visit_notes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.visits v
      WHERE v.id = visit_notes.visit_id
        AND ( v.user_id = current_setting('app.current_user_id', true)::uuid
              OR public.is_admin() )
    )
  );

-- ── INSERT: parent visit visible AND the note's author is the caller ──
CREATE POLICY visit_notes_insert ON visit_notes
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.visits v
      WHERE v.id = visit_notes.visit_id
        AND ( v.user_id = current_setting('app.current_user_id', true)::uuid
              OR public.is_admin() )
    )
    AND visit_notes.user_id = current_setting('app.current_user_id', true)::uuid
  );

-- ── UPDATE: edit only your own note, or admin (manager = admin here) ──
CREATE POLICY visit_notes_update ON visit_notes
  FOR UPDATE USING (
    visit_notes.user_id = current_setting('app.current_user_id', true)::uuid
    OR public.is_admin()
  )
  WITH CHECK (
    visit_notes.user_id = current_setting('app.current_user_id', true)::uuid
    OR public.is_admin()
  );

-- ── DELETE: own note or admin — defense-in-depth symmetry (no route today) ──
CREATE POLICY visit_notes_delete ON visit_notes
  FOR DELETE USING (
    visit_notes.user_id = current_setting('app.current_user_id', true)::uuid
    OR public.is_admin()
  );
