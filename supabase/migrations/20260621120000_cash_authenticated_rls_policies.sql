-- 20260621120000_cash_authenticated_rls_policies.sql
--
-- F-RLS-04e — Cash-context RLS cutover. Byte-identical-intent mirror of
-- 20260619120000 (pricing), adapted to cash_months + cash_entries + cheque_records.
--
-- ADDITIVE migration: adds the FULL policy set (12 policies, 4 commands × 3
-- tables) so the per-request AUTHENTICATED Supabase client can read AND write
-- through the Postgres `authenticated` role once the cash API routes are flipped
-- onto cashServiceForCaller.
--
-- WHY THE FULL SET: 20260613000000_enable_rls_42_tables.sql ran
--   ALTER TABLE cash_months/cash_entries/cheque_records ENABLE ROW LEVEL SECURITY
--   but added NO policies. RLS-enabled + zero-policies = DENY EVERYTHING for
--   the authenticated role. Once the cash routes run as `authenticated`, every
--   read returns nothing unless SELECT policies ship → cash screens blank. SELECT
--   is the headline must-fix. INSERT/UPDATE/DELETE ship too so create/edit/delete/
--   lock/bank all work under the badge.
--
-- ROLE MODEL — VALID-USER ONLY, no `role IN (...)` filter (Pattern B, mirrors
--   04c/04d): any caller whose GUC maps to a real public.users row is allowed.
--   The office "current-month only" rule and the admin/office route gates stay
--   in the route + CashService.validateEntry layer exactly as today — RLS is
--   never stricter than the service's own gating. F-TD-28 (local-vs-London time
--   in validateEntry) is OUT OF SCOPE.
--
-- PREDICATE: public.current_user_is_valid() (SECURITY DEFINER STABLE helper,
--   shipped in 20260618130000) — recursion-proof valid-user check. EXECUTE
--   already granted to `authenticated`; no new grant, no new helper.
--
-- GRANTS: baseline.sql L2548/L2553/L2558 already GRANT ALL on all three tables
--   TO authenticated → NO GRANT added here.
--
-- STORAGE NOT TOUCHED: the cash-attachments bucket (storage.objects) has no
--   authenticated policies; the upload / attachment-remove / signed-URL paths
--   stay on the master-key client (wiring keeps the AttachmentStorage port on
--   the master-key singleton — F-RLS-04e E1). This migration is table-RLS only.
--
-- MASTER-KEY ROLE still BYPASSES RLS (no FORCE) → any master-key path (incl. the
--   parachute singleton and the storage port) is unaffected.
--
-- NON-DESTRUCTIVE: CREATE POLICY only — no DROP TABLE/TRUNCATE/ALTER TYPE/
--   DROP COLUMN/DROP NOT NULL → NO PITR gate fires.
--
-- One policy per command per table → no over-grant possible (Postgres OR's
--   permissive policies; here each command has exactly one).
--
-- Apply via Supabase MCP apply_migration ONLY. Local: npm run db:reset. Prod
-- application deferred to the ship gate: apply to PROD FIRST, then merge
-- (the 04a/04b/04c/04d/F-TD-22 ordering).

DROP POLICY IF EXISTS cash_months_select    ON cash_months;
DROP POLICY IF EXISTS cash_months_insert    ON cash_months;
DROP POLICY IF EXISTS cash_months_update    ON cash_months;
DROP POLICY IF EXISTS cash_months_delete    ON cash_months;
DROP POLICY IF EXISTS cash_entries_select   ON cash_entries;
DROP POLICY IF EXISTS cash_entries_insert   ON cash_entries;
DROP POLICY IF EXISTS cash_entries_update   ON cash_entries;
DROP POLICY IF EXISTS cash_entries_delete   ON cash_entries;
DROP POLICY IF EXISTS cheque_records_select ON cheque_records;
DROP POLICY IF EXISTS cheque_records_insert ON cheque_records;
DROP POLICY IF EXISTS cheque_records_update ON cheque_records;
DROP POLICY IF EXISTS cheque_records_delete ON cheque_records;

-- ── cash_months ─────────────────────────────────────────────
CREATE POLICY cash_months_select ON cash_months
  FOR SELECT USING ( public.current_user_is_valid() );

CREATE POLICY cash_months_insert ON cash_months
  FOR INSERT WITH CHECK ( public.current_user_is_valid() );

CREATE POLICY cash_months_update ON cash_months
  FOR UPDATE USING ( public.current_user_is_valid() )
             WITH CHECK ( public.current_user_is_valid() );

CREATE POLICY cash_months_delete ON cash_months
  FOR DELETE USING ( public.current_user_is_valid() );

-- ── cash_entries (UPDATE needed — updateEntry PATCHes a row in place) ──
CREATE POLICY cash_entries_select ON cash_entries
  FOR SELECT USING ( public.current_user_is_valid() );

CREATE POLICY cash_entries_insert ON cash_entries
  FOR INSERT WITH CHECK ( public.current_user_is_valid() );

CREATE POLICY cash_entries_update ON cash_entries
  FOR UPDATE USING ( public.current_user_is_valid() )
             WITH CHECK ( public.current_user_is_valid() );

CREATE POLICY cash_entries_delete ON cash_entries
  FOR DELETE USING ( public.current_user_is_valid() );

-- ── cheque_records (UPDATE needed — bankCheque + updateCheque PATCH in place) ──
CREATE POLICY cheque_records_select ON cheque_records
  FOR SELECT USING ( public.current_user_is_valid() );

CREATE POLICY cheque_records_insert ON cheque_records
  FOR INSERT WITH CHECK ( public.current_user_is_valid() );

CREATE POLICY cheque_records_update ON cheque_records
  FOR UPDATE USING ( public.current_user_is_valid() )
             WITH CHECK ( public.current_user_is_valid() );

CREATE POLICY cheque_records_delete ON cheque_records
  FOR DELETE USING ( public.current_user_is_valid() );

-- ROLLBACK (manual): DROP the 12 policies above (see the standalone rollback .sql).
-- DROP POLICY IF EXISTS cash_months_select    ON cash_months;
-- DROP POLICY IF EXISTS cash_months_insert    ON cash_months;
-- DROP POLICY IF EXISTS cash_months_update    ON cash_months;
-- DROP POLICY IF EXISTS cash_months_delete    ON cash_months;
-- DROP POLICY IF EXISTS cash_entries_select   ON cash_entries;
-- DROP POLICY IF EXISTS cash_entries_insert   ON cash_entries;
-- DROP POLICY IF EXISTS cash_entries_update   ON cash_entries;
-- DROP POLICY IF EXISTS cash_entries_delete   ON cash_entries;
-- DROP POLICY IF EXISTS cheque_records_select ON cheque_records;
-- DROP POLICY IF EXISTS cheque_records_insert ON cheque_records;
-- DROP POLICY IF EXISTS cheque_records_update ON cheque_records;
-- DROP POLICY IF EXISTS cheque_records_delete ON cheque_records;
