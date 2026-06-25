-- 20260625120000_haccp_authenticated_rls_policies.sql
--
-- F-19 Cluster G / F-RLS-04h PR10a — HACCP RLS foundation (introduce-only, INERT).
--
-- Byte-identical-intent mirror of the shipped cutover migrations
-- (20260619120000 pricing, 20260621120000 cash, 20260621130000 complaints,
-- 20260622120000 visit_notes), adapted to the 30 `haccp_*` tables — with ONE
-- deliberate divergence: the predicate is the NEW active-aware helper
-- `public.current_user_is_active()` (NOT the existence-only
-- `public.current_user_is_valid()`), so a DEACTIVATED staff member is denied.
--
-- ADDITIVE migration: adds the FULL policy family (4 commands × 30 tables = 120
-- policies) + one new SECURITY DEFINER helper so that — once PR10b flips the
-- authenticated HACCP routes onto the `…ForCaller` clients — the per-request
-- AUTHENTICATED Supabase client can read AND write through the Postgres
-- `authenticated` role with RLS enforcing "real, active staff only".
--
-- WHY THE FULL SET: 20260613000000_enable_rls_42_tables.sql ran
--   ALTER TABLE haccp_* ENABLE ROW LEVEL SECURITY on all 30 tables but added
--   NO policies. RLS-enabled + zero-policies = DENY EVERYTHING for the
--   authenticated role (a deny-all trap only service-role opens). Every one of
--   the 30 tables is enumerated EXPLICITLY (no DO/loop) so a missing table is
--   visible in the diff — a stray un-policied table would silently break its
--   screen the moment its route flips in PR10b.
--
-- ROLE MODEL — ACTIVE-USER ONLY, no `role IN (...)` filter: any caller whose
--   GUC maps to a real public.users row WITH active = true is allowed. HACCP
--   data is org-wide operational (CONTEXT.md "HACCP visibility"): any active
--   staff member may read AND write every HACCP record, regardless of who
--   created it. Fine-grained "only admin edits suppliers" stays at the route
--   edge (`requireRole`); the DB policy is the backstop, not the primary gate —
--   RLS is never stricter than the service's own gating.
--
-- PREDICATE: public.current_user_is_active() (NEW — defined below). Active-aware
--   sibling of current_user_is_valid(): same SECURITY DEFINER STABLE
--   recursion-proof shape, plus `AND u.active = true`. We deliberately do NOT
--   alter current_user_is_valid() — cash/pricing/complaints/users-directory
--   depend on its existence-only contract; widening it would silently re-gate
--   them.
--
-- GRANTS: 20260101000000_baseline.sql already runs
--   `GRANT ALL ON TABLE "public"."haccp_*" TO "authenticated"` on all 30 tables
--   (verified). → NO table GRANT added here (mirrors cash, which added none).
--
-- INERT IN PR10a: the live HACCP routes still import the service-role
--   master-key singletons in lib/wiring/haccp.ts, and the service_role BYPASSES
--   RLS entirely (tables are ENABLE, never FORCE). So these policies are NEVER
--   evaluated on any live request until PR10b flips routes onto the `…ForCaller`
--   authenticated clients. The `…ForCaller` factories added in PR10a have no
--   caller. → ZERO production behaviour change.
--
-- NON-DESTRUCTIVE: CREATE FUNCTION + CREATE POLICY only — no DROP TABLE /
--   TRUNCATE / ALTER TYPE / DROP COLUMN / DROP NOT NULL → NO PITR gate fires.
--
-- IDEMPOTENT: every policy is preceded by DROP POLICY IF EXISTS, and the helper
--   uses CREATE OR REPLACE, so `npm run db:reset` and preview-branch re-syncs
--   are re-runnable.
--
-- One policy per command per table → no over-grant possible (Postgres OR's
--   permissive policies; here each command has exactly one).
--
-- Apply via Supabase MCP apply_migration. Local: npm run db:reset. Prod
-- application is PROD-FIRST at the ship gate: apply to PROD, confirm green,
-- THEN merge (the 04a/04b/04c/04d/04e/04f/04g ordering). Safe pre-merge because
-- the policies are dormant under service-role.

-- ── 0) The active-aware, recursion-proof predicate helper ───────────────────
-- SECURITY DEFINER + owner postgres = reads public.users AS THE OWNER, bypassing
-- RLS, so a users SELECT policy could call it without recursing (42P17). STABLE:
-- result is fixed within a statement. nullif(…, '') turns an empty/absent GUC
-- into NULL → NULL::uuid → the EXISTS short-circuits to FALSE WITHOUT throwing
-- (a clean fail-closed deny, never a 22P02 cast error). Mirrors the proven
-- current_user_is_valid() shape (20260618130000) + `AND u.active = true`.
CREATE OR REPLACE FUNCTION public.current_user_is_active()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
  AS $$
    SELECT EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = nullif(current_setting('app.current_user_id', true), '')::uuid
        AND u.active = true
    )
  $$;
ALTER FUNCTION public.current_user_is_active() OWNER TO postgres;
-- Lock down EXECUTE (F-RLS-03 / harden-security-definer discipline): only the
-- `authenticated` role evaluates this in an RLS predicate. The server/bypass
-- role never evaluates RLS predicates (it bypasses RLS), so it does NOT need
-- EXECUTE here — keeping the surface minimal.
REVOKE EXECUTE ON FUNCTION public.current_user_is_active() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.current_user_is_active() FROM anon;
GRANT  EXECUTE ON FUNCTION public.current_user_is_active() TO authenticated;

-- ── 1) The policy family — 4 commands × 30 tables (enumerated explicitly) ────
-- Naming: <table>_<command>. UPDATE carries BOTH USING and WITH CHECK; INSERT
-- carries WITH CHECK; SELECT/DELETE carry USING. Predicate identical across all
-- four commands (any active staff may read+write) — consistent with the in-repo
-- idiom, command-granular for future tightening.

-- ── haccp_allergen_assessment ───────────────────────────────
DROP POLICY IF EXISTS haccp_allergen_assessment_select ON haccp_allergen_assessment;
DROP POLICY IF EXISTS haccp_allergen_assessment_insert ON haccp_allergen_assessment;
DROP POLICY IF EXISTS haccp_allergen_assessment_update ON haccp_allergen_assessment;
DROP POLICY IF EXISTS haccp_allergen_assessment_delete ON haccp_allergen_assessment;
CREATE POLICY haccp_allergen_assessment_select ON haccp_allergen_assessment
  FOR SELECT USING ( public.current_user_is_active() );
CREATE POLICY haccp_allergen_assessment_insert ON haccp_allergen_assessment
  FOR INSERT WITH CHECK ( public.current_user_is_active() );
CREATE POLICY haccp_allergen_assessment_update ON haccp_allergen_assessment
  FOR UPDATE USING ( public.current_user_is_active() )
             WITH CHECK ( public.current_user_is_active() );
CREATE POLICY haccp_allergen_assessment_delete ON haccp_allergen_assessment
  FOR DELETE USING ( public.current_user_is_active() );

-- ── haccp_allergen_monthly_reviews ──────────────────────────
DROP POLICY IF EXISTS haccp_allergen_monthly_reviews_select ON haccp_allergen_monthly_reviews;
DROP POLICY IF EXISTS haccp_allergen_monthly_reviews_insert ON haccp_allergen_monthly_reviews;
DROP POLICY IF EXISTS haccp_allergen_monthly_reviews_update ON haccp_allergen_monthly_reviews;
DROP POLICY IF EXISTS haccp_allergen_monthly_reviews_delete ON haccp_allergen_monthly_reviews;
CREATE POLICY haccp_allergen_monthly_reviews_select ON haccp_allergen_monthly_reviews
  FOR SELECT USING ( public.current_user_is_active() );
CREATE POLICY haccp_allergen_monthly_reviews_insert ON haccp_allergen_monthly_reviews
  FOR INSERT WITH CHECK ( public.current_user_is_active() );
CREATE POLICY haccp_allergen_monthly_reviews_update ON haccp_allergen_monthly_reviews
  FOR UPDATE USING ( public.current_user_is_active() )
             WITH CHECK ( public.current_user_is_active() );
CREATE POLICY haccp_allergen_monthly_reviews_delete ON haccp_allergen_monthly_reviews
  FOR DELETE USING ( public.current_user_is_active() );

-- ── haccp_allergen_training ─────────────────────────────────
DROP POLICY IF EXISTS haccp_allergen_training_select ON haccp_allergen_training;
DROP POLICY IF EXISTS haccp_allergen_training_insert ON haccp_allergen_training;
DROP POLICY IF EXISTS haccp_allergen_training_update ON haccp_allergen_training;
DROP POLICY IF EXISTS haccp_allergen_training_delete ON haccp_allergen_training;
CREATE POLICY haccp_allergen_training_select ON haccp_allergen_training
  FOR SELECT USING ( public.current_user_is_active() );
CREATE POLICY haccp_allergen_training_insert ON haccp_allergen_training
  FOR INSERT WITH CHECK ( public.current_user_is_active() );
CREATE POLICY haccp_allergen_training_update ON haccp_allergen_training
  FOR UPDATE USING ( public.current_user_is_active() )
             WITH CHECK ( public.current_user_is_active() );
CREATE POLICY haccp_allergen_training_delete ON haccp_allergen_training
  FOR DELETE USING ( public.current_user_is_active() );

-- ── haccp_annual_reviews ────────────────────────────────────
DROP POLICY IF EXISTS haccp_annual_reviews_select ON haccp_annual_reviews;
DROP POLICY IF EXISTS haccp_annual_reviews_insert ON haccp_annual_reviews;
DROP POLICY IF EXISTS haccp_annual_reviews_update ON haccp_annual_reviews;
DROP POLICY IF EXISTS haccp_annual_reviews_delete ON haccp_annual_reviews;
CREATE POLICY haccp_annual_reviews_select ON haccp_annual_reviews
  FOR SELECT USING ( public.current_user_is_active() );
CREATE POLICY haccp_annual_reviews_insert ON haccp_annual_reviews
  FOR INSERT WITH CHECK ( public.current_user_is_active() );
CREATE POLICY haccp_annual_reviews_update ON haccp_annual_reviews
  FOR UPDATE USING ( public.current_user_is_active() )
             WITH CHECK ( public.current_user_is_active() );
CREATE POLICY haccp_annual_reviews_delete ON haccp_annual_reviews
  FOR DELETE USING ( public.current_user_is_active() );

-- ── haccp_calibration_log ───────────────────────────────────
DROP POLICY IF EXISTS haccp_calibration_log_select ON haccp_calibration_log;
DROP POLICY IF EXISTS haccp_calibration_log_insert ON haccp_calibration_log;
DROP POLICY IF EXISTS haccp_calibration_log_update ON haccp_calibration_log;
DROP POLICY IF EXISTS haccp_calibration_log_delete ON haccp_calibration_log;
CREATE POLICY haccp_calibration_log_select ON haccp_calibration_log
  FOR SELECT USING ( public.current_user_is_active() );
CREATE POLICY haccp_calibration_log_insert ON haccp_calibration_log
  FOR INSERT WITH CHECK ( public.current_user_is_active() );
CREATE POLICY haccp_calibration_log_update ON haccp_calibration_log
  FOR UPDATE USING ( public.current_user_is_active() )
             WITH CHECK ( public.current_user_is_active() );
CREATE POLICY haccp_calibration_log_delete ON haccp_calibration_log
  FOR DELETE USING ( public.current_user_is_active() );

-- ── haccp_cleaning_log ──────────────────────────────────────
DROP POLICY IF EXISTS haccp_cleaning_log_select ON haccp_cleaning_log;
DROP POLICY IF EXISTS haccp_cleaning_log_insert ON haccp_cleaning_log;
DROP POLICY IF EXISTS haccp_cleaning_log_update ON haccp_cleaning_log;
DROP POLICY IF EXISTS haccp_cleaning_log_delete ON haccp_cleaning_log;
CREATE POLICY haccp_cleaning_log_select ON haccp_cleaning_log
  FOR SELECT USING ( public.current_user_is_active() );
CREATE POLICY haccp_cleaning_log_insert ON haccp_cleaning_log
  FOR INSERT WITH CHECK ( public.current_user_is_active() );
CREATE POLICY haccp_cleaning_log_update ON haccp_cleaning_log
  FOR UPDATE USING ( public.current_user_is_active() )
             WITH CHECK ( public.current_user_is_active() );
CREATE POLICY haccp_cleaning_log_delete ON haccp_cleaning_log
  FOR DELETE USING ( public.current_user_is_active() );

-- ── haccp_cold_storage_temps ────────────────────────────────
DROP POLICY IF EXISTS haccp_cold_storage_temps_select ON haccp_cold_storage_temps;
DROP POLICY IF EXISTS haccp_cold_storage_temps_insert ON haccp_cold_storage_temps;
DROP POLICY IF EXISTS haccp_cold_storage_temps_update ON haccp_cold_storage_temps;
DROP POLICY IF EXISTS haccp_cold_storage_temps_delete ON haccp_cold_storage_temps;
CREATE POLICY haccp_cold_storage_temps_select ON haccp_cold_storage_temps
  FOR SELECT USING ( public.current_user_is_active() );
CREATE POLICY haccp_cold_storage_temps_insert ON haccp_cold_storage_temps
  FOR INSERT WITH CHECK ( public.current_user_is_active() );
CREATE POLICY haccp_cold_storage_temps_update ON haccp_cold_storage_temps
  FOR UPDATE USING ( public.current_user_is_active() )
             WITH CHECK ( public.current_user_is_active() );
CREATE POLICY haccp_cold_storage_temps_delete ON haccp_cold_storage_temps
  FOR DELETE USING ( public.current_user_is_active() );

-- ── haccp_cold_storage_units ────────────────────────────────
DROP POLICY IF EXISTS haccp_cold_storage_units_select ON haccp_cold_storage_units;
DROP POLICY IF EXISTS haccp_cold_storage_units_insert ON haccp_cold_storage_units;
DROP POLICY IF EXISTS haccp_cold_storage_units_update ON haccp_cold_storage_units;
DROP POLICY IF EXISTS haccp_cold_storage_units_delete ON haccp_cold_storage_units;
CREATE POLICY haccp_cold_storage_units_select ON haccp_cold_storage_units
  FOR SELECT USING ( public.current_user_is_active() );
CREATE POLICY haccp_cold_storage_units_insert ON haccp_cold_storage_units
  FOR INSERT WITH CHECK ( public.current_user_is_active() );
CREATE POLICY haccp_cold_storage_units_update ON haccp_cold_storage_units
  FOR UPDATE USING ( public.current_user_is_active() )
             WITH CHECK ( public.current_user_is_active() );
CREATE POLICY haccp_cold_storage_units_delete ON haccp_cold_storage_units
  FOR DELETE USING ( public.current_user_is_active() );

-- ── haccp_corrective_actions ────────────────────────────────
DROP POLICY IF EXISTS haccp_corrective_actions_select ON haccp_corrective_actions;
DROP POLICY IF EXISTS haccp_corrective_actions_insert ON haccp_corrective_actions;
DROP POLICY IF EXISTS haccp_corrective_actions_update ON haccp_corrective_actions;
DROP POLICY IF EXISTS haccp_corrective_actions_delete ON haccp_corrective_actions;
CREATE POLICY haccp_corrective_actions_select ON haccp_corrective_actions
  FOR SELECT USING ( public.current_user_is_active() );
CREATE POLICY haccp_corrective_actions_insert ON haccp_corrective_actions
  FOR INSERT WITH CHECK ( public.current_user_is_active() );
CREATE POLICY haccp_corrective_actions_update ON haccp_corrective_actions
  FOR UPDATE USING ( public.current_user_is_active() )
             WITH CHECK ( public.current_user_is_active() );
CREATE POLICY haccp_corrective_actions_delete ON haccp_corrective_actions
  FOR DELETE USING ( public.current_user_is_active() );

-- ── haccp_daily_diary ───────────────────────────────────────
DROP POLICY IF EXISTS haccp_daily_diary_select ON haccp_daily_diary;
DROP POLICY IF EXISTS haccp_daily_diary_insert ON haccp_daily_diary;
DROP POLICY IF EXISTS haccp_daily_diary_update ON haccp_daily_diary;
DROP POLICY IF EXISTS haccp_daily_diary_delete ON haccp_daily_diary;
CREATE POLICY haccp_daily_diary_select ON haccp_daily_diary
  FOR SELECT USING ( public.current_user_is_active() );
CREATE POLICY haccp_daily_diary_insert ON haccp_daily_diary
  FOR INSERT WITH CHECK ( public.current_user_is_active() );
CREATE POLICY haccp_daily_diary_update ON haccp_daily_diary
  FOR UPDATE USING ( public.current_user_is_active() )
             WITH CHECK ( public.current_user_is_active() );
CREATE POLICY haccp_daily_diary_delete ON haccp_daily_diary
  FOR DELETE USING ( public.current_user_is_active() );

-- ── haccp_deliveries ────────────────────────────────────────
DROP POLICY IF EXISTS haccp_deliveries_select ON haccp_deliveries;
DROP POLICY IF EXISTS haccp_deliveries_insert ON haccp_deliveries;
DROP POLICY IF EXISTS haccp_deliveries_update ON haccp_deliveries;
DROP POLICY IF EXISTS haccp_deliveries_delete ON haccp_deliveries;
CREATE POLICY haccp_deliveries_select ON haccp_deliveries
  FOR SELECT USING ( public.current_user_is_active() );
CREATE POLICY haccp_deliveries_insert ON haccp_deliveries
  FOR INSERT WITH CHECK ( public.current_user_is_active() );
CREATE POLICY haccp_deliveries_update ON haccp_deliveries
  FOR UPDATE USING ( public.current_user_is_active() )
             WITH CHECK ( public.current_user_is_active() );
CREATE POLICY haccp_deliveries_delete ON haccp_deliveries
  FOR DELETE USING ( public.current_user_is_active() );

-- ── haccp_dispatch_log ──────────────────────────────────────
DROP POLICY IF EXISTS haccp_dispatch_log_select ON haccp_dispatch_log;
DROP POLICY IF EXISTS haccp_dispatch_log_insert ON haccp_dispatch_log;
DROP POLICY IF EXISTS haccp_dispatch_log_update ON haccp_dispatch_log;
DROP POLICY IF EXISTS haccp_dispatch_log_delete ON haccp_dispatch_log;
CREATE POLICY haccp_dispatch_log_select ON haccp_dispatch_log
  FOR SELECT USING ( public.current_user_is_active() );
CREATE POLICY haccp_dispatch_log_insert ON haccp_dispatch_log
  FOR INSERT WITH CHECK ( public.current_user_is_active() );
CREATE POLICY haccp_dispatch_log_update ON haccp_dispatch_log
  FOR UPDATE USING ( public.current_user_is_active() )
             WITH CHECK ( public.current_user_is_active() );
CREATE POLICY haccp_dispatch_log_delete ON haccp_dispatch_log
  FOR DELETE USING ( public.current_user_is_active() );

-- ── haccp_document_reviews ──────────────────────────────────
DROP POLICY IF EXISTS haccp_document_reviews_select ON haccp_document_reviews;
DROP POLICY IF EXISTS haccp_document_reviews_insert ON haccp_document_reviews;
DROP POLICY IF EXISTS haccp_document_reviews_update ON haccp_document_reviews;
DROP POLICY IF EXISTS haccp_document_reviews_delete ON haccp_document_reviews;
CREATE POLICY haccp_document_reviews_select ON haccp_document_reviews
  FOR SELECT USING ( public.current_user_is_active() );
CREATE POLICY haccp_document_reviews_insert ON haccp_document_reviews
  FOR INSERT WITH CHECK ( public.current_user_is_active() );
CREATE POLICY haccp_document_reviews_update ON haccp_document_reviews
  FOR UPDATE USING ( public.current_user_is_active() )
             WITH CHECK ( public.current_user_is_active() );
CREATE POLICY haccp_document_reviews_delete ON haccp_document_reviews
  FOR DELETE USING ( public.current_user_is_active() );

-- ── haccp_document_versions ─────────────────────────────────
DROP POLICY IF EXISTS haccp_document_versions_select ON haccp_document_versions;
DROP POLICY IF EXISTS haccp_document_versions_insert ON haccp_document_versions;
DROP POLICY IF EXISTS haccp_document_versions_update ON haccp_document_versions;
DROP POLICY IF EXISTS haccp_document_versions_delete ON haccp_document_versions;
CREATE POLICY haccp_document_versions_select ON haccp_document_versions
  FOR SELECT USING ( public.current_user_is_active() );
CREATE POLICY haccp_document_versions_insert ON haccp_document_versions
  FOR INSERT WITH CHECK ( public.current_user_is_active() );
CREATE POLICY haccp_document_versions_update ON haccp_document_versions
  FOR UPDATE USING ( public.current_user_is_active() )
             WITH CHECK ( public.current_user_is_active() );
CREATE POLICY haccp_document_versions_delete ON haccp_document_versions
  FOR DELETE USING ( public.current_user_is_active() );

-- ── haccp_documents ─────────────────────────────────────────
DROP POLICY IF EXISTS haccp_documents_select ON haccp_documents;
DROP POLICY IF EXISTS haccp_documents_insert ON haccp_documents;
DROP POLICY IF EXISTS haccp_documents_update ON haccp_documents;
DROP POLICY IF EXISTS haccp_documents_delete ON haccp_documents;
CREATE POLICY haccp_documents_select ON haccp_documents
  FOR SELECT USING ( public.current_user_is_active() );
CREATE POLICY haccp_documents_insert ON haccp_documents
  FOR INSERT WITH CHECK ( public.current_user_is_active() );
CREATE POLICY haccp_documents_update ON haccp_documents
  FOR UPDATE USING ( public.current_user_is_active() )
             WITH CHECK ( public.current_user_is_active() );
CREATE POLICY haccp_documents_delete ON haccp_documents
  FOR DELETE USING ( public.current_user_is_active() );

-- ── haccp_food_defence_plans ────────────────────────────────
DROP POLICY IF EXISTS haccp_food_defence_plans_select ON haccp_food_defence_plans;
DROP POLICY IF EXISTS haccp_food_defence_plans_insert ON haccp_food_defence_plans;
DROP POLICY IF EXISTS haccp_food_defence_plans_update ON haccp_food_defence_plans;
DROP POLICY IF EXISTS haccp_food_defence_plans_delete ON haccp_food_defence_plans;
CREATE POLICY haccp_food_defence_plans_select ON haccp_food_defence_plans
  FOR SELECT USING ( public.current_user_is_active() );
CREATE POLICY haccp_food_defence_plans_insert ON haccp_food_defence_plans
  FOR INSERT WITH CHECK ( public.current_user_is_active() );
CREATE POLICY haccp_food_defence_plans_update ON haccp_food_defence_plans
  FOR UPDATE USING ( public.current_user_is_active() )
             WITH CHECK ( public.current_user_is_active() );
CREATE POLICY haccp_food_defence_plans_delete ON haccp_food_defence_plans
  FOR DELETE USING ( public.current_user_is_active() );

-- ── haccp_food_fraud_assessments ────────────────────────────
DROP POLICY IF EXISTS haccp_food_fraud_assessments_select ON haccp_food_fraud_assessments;
DROP POLICY IF EXISTS haccp_food_fraud_assessments_insert ON haccp_food_fraud_assessments;
DROP POLICY IF EXISTS haccp_food_fraud_assessments_update ON haccp_food_fraud_assessments;
DROP POLICY IF EXISTS haccp_food_fraud_assessments_delete ON haccp_food_fraud_assessments;
CREATE POLICY haccp_food_fraud_assessments_select ON haccp_food_fraud_assessments
  FOR SELECT USING ( public.current_user_is_active() );
CREATE POLICY haccp_food_fraud_assessments_insert ON haccp_food_fraud_assessments
  FOR INSERT WITH CHECK ( public.current_user_is_active() );
CREATE POLICY haccp_food_fraud_assessments_update ON haccp_food_fraud_assessments
  FOR UPDATE USING ( public.current_user_is_active() )
             WITH CHECK ( public.current_user_is_active() );
CREATE POLICY haccp_food_fraud_assessments_delete ON haccp_food_fraud_assessments
  FOR DELETE USING ( public.current_user_is_active() );

-- ── haccp_health_records ────────────────────────────────────
DROP POLICY IF EXISTS haccp_health_records_select ON haccp_health_records;
DROP POLICY IF EXISTS haccp_health_records_insert ON haccp_health_records;
DROP POLICY IF EXISTS haccp_health_records_update ON haccp_health_records;
DROP POLICY IF EXISTS haccp_health_records_delete ON haccp_health_records;
CREATE POLICY haccp_health_records_select ON haccp_health_records
  FOR SELECT USING ( public.current_user_is_active() );
CREATE POLICY haccp_health_records_insert ON haccp_health_records
  FOR INSERT WITH CHECK ( public.current_user_is_active() );
CREATE POLICY haccp_health_records_update ON haccp_health_records
  FOR UPDATE USING ( public.current_user_is_active() )
             WITH CHECK ( public.current_user_is_active() );
CREATE POLICY haccp_health_records_delete ON haccp_health_records
  FOR DELETE USING ( public.current_user_is_active() );

-- ── haccp_meatprep_log ──────────────────────────────────────
DROP POLICY IF EXISTS haccp_meatprep_log_select ON haccp_meatprep_log;
DROP POLICY IF EXISTS haccp_meatprep_log_insert ON haccp_meatprep_log;
DROP POLICY IF EXISTS haccp_meatprep_log_update ON haccp_meatprep_log;
DROP POLICY IF EXISTS haccp_meatprep_log_delete ON haccp_meatprep_log;
CREATE POLICY haccp_meatprep_log_select ON haccp_meatprep_log
  FOR SELECT USING ( public.current_user_is_active() );
CREATE POLICY haccp_meatprep_log_insert ON haccp_meatprep_log
  FOR INSERT WITH CHECK ( public.current_user_is_active() );
CREATE POLICY haccp_meatprep_log_update ON haccp_meatprep_log
  FOR UPDATE USING ( public.current_user_is_active() )
             WITH CHECK ( public.current_user_is_active() );
CREATE POLICY haccp_meatprep_log_delete ON haccp_meatprep_log
  FOR DELETE USING ( public.current_user_is_active() );

-- ── haccp_mince_log ─────────────────────────────────────────
DROP POLICY IF EXISTS haccp_mince_log_select ON haccp_mince_log;
DROP POLICY IF EXISTS haccp_mince_log_insert ON haccp_mince_log;
DROP POLICY IF EXISTS haccp_mince_log_update ON haccp_mince_log;
DROP POLICY IF EXISTS haccp_mince_log_delete ON haccp_mince_log;
CREATE POLICY haccp_mince_log_select ON haccp_mince_log
  FOR SELECT USING ( public.current_user_is_active() );
CREATE POLICY haccp_mince_log_insert ON haccp_mince_log
  FOR INSERT WITH CHECK ( public.current_user_is_active() );
CREATE POLICY haccp_mince_log_update ON haccp_mince_log
  FOR UPDATE USING ( public.current_user_is_active() )
             WITH CHECK ( public.current_user_is_active() );
CREATE POLICY haccp_mince_log_delete ON haccp_mince_log
  FOR DELETE USING ( public.current_user_is_active() );

-- ── haccp_monthly_review ────────────────────────────────────
DROP POLICY IF EXISTS haccp_monthly_review_select ON haccp_monthly_review;
DROP POLICY IF EXISTS haccp_monthly_review_insert ON haccp_monthly_review;
DROP POLICY IF EXISTS haccp_monthly_review_update ON haccp_monthly_review;
DROP POLICY IF EXISTS haccp_monthly_review_delete ON haccp_monthly_review;
CREATE POLICY haccp_monthly_review_select ON haccp_monthly_review
  FOR SELECT USING ( public.current_user_is_active() );
CREATE POLICY haccp_monthly_review_insert ON haccp_monthly_review
  FOR INSERT WITH CHECK ( public.current_user_is_active() );
CREATE POLICY haccp_monthly_review_update ON haccp_monthly_review
  FOR UPDATE USING ( public.current_user_is_active() )
             WITH CHECK ( public.current_user_is_active() );
CREATE POLICY haccp_monthly_review_delete ON haccp_monthly_review
  FOR DELETE USING ( public.current_user_is_active() );

-- ── haccp_processing_temps ──────────────────────────────────
DROP POLICY IF EXISTS haccp_processing_temps_select ON haccp_processing_temps;
DROP POLICY IF EXISTS haccp_processing_temps_insert ON haccp_processing_temps;
DROP POLICY IF EXISTS haccp_processing_temps_update ON haccp_processing_temps;
DROP POLICY IF EXISTS haccp_processing_temps_delete ON haccp_processing_temps;
CREATE POLICY haccp_processing_temps_select ON haccp_processing_temps
  FOR SELECT USING ( public.current_user_is_active() );
CREATE POLICY haccp_processing_temps_insert ON haccp_processing_temps
  FOR INSERT WITH CHECK ( public.current_user_is_active() );
CREATE POLICY haccp_processing_temps_update ON haccp_processing_temps
  FOR UPDATE USING ( public.current_user_is_active() )
             WITH CHECK ( public.current_user_is_active() );
CREATE POLICY haccp_processing_temps_delete ON haccp_processing_temps
  FOR DELETE USING ( public.current_user_is_active() );

-- ── haccp_product_specs ─────────────────────────────────────
DROP POLICY IF EXISTS haccp_product_specs_select ON haccp_product_specs;
DROP POLICY IF EXISTS haccp_product_specs_insert ON haccp_product_specs;
DROP POLICY IF EXISTS haccp_product_specs_update ON haccp_product_specs;
DROP POLICY IF EXISTS haccp_product_specs_delete ON haccp_product_specs;
CREATE POLICY haccp_product_specs_select ON haccp_product_specs
  FOR SELECT USING ( public.current_user_is_active() );
CREATE POLICY haccp_product_specs_insert ON haccp_product_specs
  FOR INSERT WITH CHECK ( public.current_user_is_active() );
CREATE POLICY haccp_product_specs_update ON haccp_product_specs
  FOR UPDATE USING ( public.current_user_is_active() )
             WITH CHECK ( public.current_user_is_active() );
CREATE POLICY haccp_product_specs_delete ON haccp_product_specs
  FOR DELETE USING ( public.current_user_is_active() );

-- ── haccp_recall_config ─────────────────────────────────────
DROP POLICY IF EXISTS haccp_recall_config_select ON haccp_recall_config;
DROP POLICY IF EXISTS haccp_recall_config_insert ON haccp_recall_config;
DROP POLICY IF EXISTS haccp_recall_config_update ON haccp_recall_config;
DROP POLICY IF EXISTS haccp_recall_config_delete ON haccp_recall_config;
CREATE POLICY haccp_recall_config_select ON haccp_recall_config
  FOR SELECT USING ( public.current_user_is_active() );
CREATE POLICY haccp_recall_config_insert ON haccp_recall_config
  FOR INSERT WITH CHECK ( public.current_user_is_active() );
CREATE POLICY haccp_recall_config_update ON haccp_recall_config
  FOR UPDATE USING ( public.current_user_is_active() )
             WITH CHECK ( public.current_user_is_active() );
CREATE POLICY haccp_recall_config_delete ON haccp_recall_config
  FOR DELETE USING ( public.current_user_is_active() );

-- ── haccp_returns ───────────────────────────────────────────
DROP POLICY IF EXISTS haccp_returns_select ON haccp_returns;
DROP POLICY IF EXISTS haccp_returns_insert ON haccp_returns;
DROP POLICY IF EXISTS haccp_returns_update ON haccp_returns;
DROP POLICY IF EXISTS haccp_returns_delete ON haccp_returns;
CREATE POLICY haccp_returns_select ON haccp_returns
  FOR SELECT USING ( public.current_user_is_active() );
CREATE POLICY haccp_returns_insert ON haccp_returns
  FOR INSERT WITH CHECK ( public.current_user_is_active() );
CREATE POLICY haccp_returns_update ON haccp_returns
  FOR UPDATE USING ( public.current_user_is_active() )
             WITH CHECK ( public.current_user_is_active() );
CREATE POLICY haccp_returns_delete ON haccp_returns
  FOR DELETE USING ( public.current_user_is_active() );

-- ── haccp_sop_content ───────────────────────────────────────
DROP POLICY IF EXISTS haccp_sop_content_select ON haccp_sop_content;
DROP POLICY IF EXISTS haccp_sop_content_insert ON haccp_sop_content;
DROP POLICY IF EXISTS haccp_sop_content_update ON haccp_sop_content;
DROP POLICY IF EXISTS haccp_sop_content_delete ON haccp_sop_content;
CREATE POLICY haccp_sop_content_select ON haccp_sop_content
  FOR SELECT USING ( public.current_user_is_active() );
CREATE POLICY haccp_sop_content_insert ON haccp_sop_content
  FOR INSERT WITH CHECK ( public.current_user_is_active() );
CREATE POLICY haccp_sop_content_update ON haccp_sop_content
  FOR UPDATE USING ( public.current_user_is_active() )
             WITH CHECK ( public.current_user_is_active() );
CREATE POLICY haccp_sop_content_delete ON haccp_sop_content
  FOR DELETE USING ( public.current_user_is_active() );

-- ── haccp_staff_training ────────────────────────────────────
DROP POLICY IF EXISTS haccp_staff_training_select ON haccp_staff_training;
DROP POLICY IF EXISTS haccp_staff_training_insert ON haccp_staff_training;
DROP POLICY IF EXISTS haccp_staff_training_update ON haccp_staff_training;
DROP POLICY IF EXISTS haccp_staff_training_delete ON haccp_staff_training;
CREATE POLICY haccp_staff_training_select ON haccp_staff_training
  FOR SELECT USING ( public.current_user_is_active() );
CREATE POLICY haccp_staff_training_insert ON haccp_staff_training
  FOR INSERT WITH CHECK ( public.current_user_is_active() );
CREATE POLICY haccp_staff_training_update ON haccp_staff_training
  FOR UPDATE USING ( public.current_user_is_active() )
             WITH CHECK ( public.current_user_is_active() );
CREATE POLICY haccp_staff_training_delete ON haccp_staff_training
  FOR DELETE USING ( public.current_user_is_active() );

-- ── haccp_suppliers ─────────────────────────────────────────
DROP POLICY IF EXISTS haccp_suppliers_select ON haccp_suppliers;
DROP POLICY IF EXISTS haccp_suppliers_insert ON haccp_suppliers;
DROP POLICY IF EXISTS haccp_suppliers_update ON haccp_suppliers;
DROP POLICY IF EXISTS haccp_suppliers_delete ON haccp_suppliers;
CREATE POLICY haccp_suppliers_select ON haccp_suppliers
  FOR SELECT USING ( public.current_user_is_active() );
CREATE POLICY haccp_suppliers_insert ON haccp_suppliers
  FOR INSERT WITH CHECK ( public.current_user_is_active() );
CREATE POLICY haccp_suppliers_update ON haccp_suppliers
  FOR UPDATE USING ( public.current_user_is_active() )
             WITH CHECK ( public.current_user_is_active() );
CREATE POLICY haccp_suppliers_delete ON haccp_suppliers
  FOR DELETE USING ( public.current_user_is_active() );

-- ── haccp_time_separation_log ───────────────────────────────
DROP POLICY IF EXISTS haccp_time_separation_log_select ON haccp_time_separation_log;
DROP POLICY IF EXISTS haccp_time_separation_log_insert ON haccp_time_separation_log;
DROP POLICY IF EXISTS haccp_time_separation_log_update ON haccp_time_separation_log;
DROP POLICY IF EXISTS haccp_time_separation_log_delete ON haccp_time_separation_log;
CREATE POLICY haccp_time_separation_log_select ON haccp_time_separation_log
  FOR SELECT USING ( public.current_user_is_active() );
CREATE POLICY haccp_time_separation_log_insert ON haccp_time_separation_log
  FOR INSERT WITH CHECK ( public.current_user_is_active() );
CREATE POLICY haccp_time_separation_log_update ON haccp_time_separation_log
  FOR UPDATE USING ( public.current_user_is_active() )
             WITH CHECK ( public.current_user_is_active() );
CREATE POLICY haccp_time_separation_log_delete ON haccp_time_separation_log
  FOR DELETE USING ( public.current_user_is_active() );

-- ── haccp_weekly_review ─────────────────────────────────────
DROP POLICY IF EXISTS haccp_weekly_review_select ON haccp_weekly_review;
DROP POLICY IF EXISTS haccp_weekly_review_insert ON haccp_weekly_review;
DROP POLICY IF EXISTS haccp_weekly_review_update ON haccp_weekly_review;
DROP POLICY IF EXISTS haccp_weekly_review_delete ON haccp_weekly_review;
CREATE POLICY haccp_weekly_review_select ON haccp_weekly_review
  FOR SELECT USING ( public.current_user_is_active() );
CREATE POLICY haccp_weekly_review_insert ON haccp_weekly_review
  FOR INSERT WITH CHECK ( public.current_user_is_active() );
CREATE POLICY haccp_weekly_review_update ON haccp_weekly_review
  FOR UPDATE USING ( public.current_user_is_active() )
             WITH CHECK ( public.current_user_is_active() );
CREATE POLICY haccp_weekly_review_delete ON haccp_weekly_review
  FOR DELETE USING ( public.current_user_is_active() );

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (manual; mirrored in supabase/migrations/rollback/). Drops the 120
-- policies (4 per table × 30), then the helper. Tables stay ENABLE ROW LEVEL
-- SECURITY (predates this PR) → rollback returns to the pre-PR10a
-- deny-all-to-authenticated posture, which is harmless because service-role
-- (the live path) bypasses RLS.
--
--   DROP POLICY IF EXISTS haccp_<table>_select ON haccp_<table>;  (×30)
--   DROP POLICY IF EXISTS haccp_<table>_insert ON haccp_<table>;  (×30)
--   DROP POLICY IF EXISTS haccp_<table>_update ON haccp_<table>;  (×30)
--   DROP POLICY IF EXISTS haccp_<table>_delete ON haccp_<table>;  (×30)
--   DROP FUNCTION IF EXISTS public.current_user_is_active();
-- ════════════════════════════════════════════════════════════════════════════
