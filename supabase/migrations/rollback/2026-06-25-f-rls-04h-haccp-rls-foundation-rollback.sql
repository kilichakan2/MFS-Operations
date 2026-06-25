-- rollback: 2026-06-25-f-rls-04h-haccp-rls-foundation-rollback.sql
--
-- Manual DB rollback for
-- 20260625120000_haccp_authenticated_rls_policies.sql (F-19 PR10a).
-- Drops the 120 HACCP policies (4 commands × 30 tables) the foundation added,
-- then the active-aware helper -> all 30 haccp_* tables return to the pre-PR10a
-- deny-all-to-authenticated posture.
--
-- This is SAFE/INERT in PR10a: the live HACCP routes still hold the service-role
-- master key (which BYPASSES RLS — the tables are ENABLE, never FORCE), and the
-- new `…ForCaller` factories have no caller. So neither these policies nor their
-- removal change any live request until PR10b flips the routes.
--
-- Tables stay ENABLE ROW LEVEL SECURITY (that predates this PR — set by
-- 20260613000000_enable_rls_42_tables.sql) and are NOT touched here.
--
-- No data rollback / no PITR: DROP POLICY + DROP FUNCTION only — additive/
-- idempotent counterparts, no data.

DROP POLICY IF EXISTS haccp_allergen_assessment_select ON haccp_allergen_assessment;
DROP POLICY IF EXISTS haccp_allergen_assessment_insert ON haccp_allergen_assessment;
DROP POLICY IF EXISTS haccp_allergen_assessment_update ON haccp_allergen_assessment;
DROP POLICY IF EXISTS haccp_allergen_assessment_delete ON haccp_allergen_assessment;

DROP POLICY IF EXISTS haccp_allergen_monthly_reviews_select ON haccp_allergen_monthly_reviews;
DROP POLICY IF EXISTS haccp_allergen_monthly_reviews_insert ON haccp_allergen_monthly_reviews;
DROP POLICY IF EXISTS haccp_allergen_monthly_reviews_update ON haccp_allergen_monthly_reviews;
DROP POLICY IF EXISTS haccp_allergen_monthly_reviews_delete ON haccp_allergen_monthly_reviews;

DROP POLICY IF EXISTS haccp_allergen_training_select ON haccp_allergen_training;
DROP POLICY IF EXISTS haccp_allergen_training_insert ON haccp_allergen_training;
DROP POLICY IF EXISTS haccp_allergen_training_update ON haccp_allergen_training;
DROP POLICY IF EXISTS haccp_allergen_training_delete ON haccp_allergen_training;

DROP POLICY IF EXISTS haccp_annual_reviews_select ON haccp_annual_reviews;
DROP POLICY IF EXISTS haccp_annual_reviews_insert ON haccp_annual_reviews;
DROP POLICY IF EXISTS haccp_annual_reviews_update ON haccp_annual_reviews;
DROP POLICY IF EXISTS haccp_annual_reviews_delete ON haccp_annual_reviews;

DROP POLICY IF EXISTS haccp_calibration_log_select ON haccp_calibration_log;
DROP POLICY IF EXISTS haccp_calibration_log_insert ON haccp_calibration_log;
DROP POLICY IF EXISTS haccp_calibration_log_update ON haccp_calibration_log;
DROP POLICY IF EXISTS haccp_calibration_log_delete ON haccp_calibration_log;

DROP POLICY IF EXISTS haccp_cleaning_log_select ON haccp_cleaning_log;
DROP POLICY IF EXISTS haccp_cleaning_log_insert ON haccp_cleaning_log;
DROP POLICY IF EXISTS haccp_cleaning_log_update ON haccp_cleaning_log;
DROP POLICY IF EXISTS haccp_cleaning_log_delete ON haccp_cleaning_log;

DROP POLICY IF EXISTS haccp_cold_storage_temps_select ON haccp_cold_storage_temps;
DROP POLICY IF EXISTS haccp_cold_storage_temps_insert ON haccp_cold_storage_temps;
DROP POLICY IF EXISTS haccp_cold_storage_temps_update ON haccp_cold_storage_temps;
DROP POLICY IF EXISTS haccp_cold_storage_temps_delete ON haccp_cold_storage_temps;

DROP POLICY IF EXISTS haccp_cold_storage_units_select ON haccp_cold_storage_units;
DROP POLICY IF EXISTS haccp_cold_storage_units_insert ON haccp_cold_storage_units;
DROP POLICY IF EXISTS haccp_cold_storage_units_update ON haccp_cold_storage_units;
DROP POLICY IF EXISTS haccp_cold_storage_units_delete ON haccp_cold_storage_units;

DROP POLICY IF EXISTS haccp_corrective_actions_select ON haccp_corrective_actions;
DROP POLICY IF EXISTS haccp_corrective_actions_insert ON haccp_corrective_actions;
DROP POLICY IF EXISTS haccp_corrective_actions_update ON haccp_corrective_actions;
DROP POLICY IF EXISTS haccp_corrective_actions_delete ON haccp_corrective_actions;

DROP POLICY IF EXISTS haccp_daily_diary_select ON haccp_daily_diary;
DROP POLICY IF EXISTS haccp_daily_diary_insert ON haccp_daily_diary;
DROP POLICY IF EXISTS haccp_daily_diary_update ON haccp_daily_diary;
DROP POLICY IF EXISTS haccp_daily_diary_delete ON haccp_daily_diary;

DROP POLICY IF EXISTS haccp_deliveries_select ON haccp_deliveries;
DROP POLICY IF EXISTS haccp_deliveries_insert ON haccp_deliveries;
DROP POLICY IF EXISTS haccp_deliveries_update ON haccp_deliveries;
DROP POLICY IF EXISTS haccp_deliveries_delete ON haccp_deliveries;

DROP POLICY IF EXISTS haccp_dispatch_log_select ON haccp_dispatch_log;
DROP POLICY IF EXISTS haccp_dispatch_log_insert ON haccp_dispatch_log;
DROP POLICY IF EXISTS haccp_dispatch_log_update ON haccp_dispatch_log;
DROP POLICY IF EXISTS haccp_dispatch_log_delete ON haccp_dispatch_log;

DROP POLICY IF EXISTS haccp_document_reviews_select ON haccp_document_reviews;
DROP POLICY IF EXISTS haccp_document_reviews_insert ON haccp_document_reviews;
DROP POLICY IF EXISTS haccp_document_reviews_update ON haccp_document_reviews;
DROP POLICY IF EXISTS haccp_document_reviews_delete ON haccp_document_reviews;

DROP POLICY IF EXISTS haccp_document_versions_select ON haccp_document_versions;
DROP POLICY IF EXISTS haccp_document_versions_insert ON haccp_document_versions;
DROP POLICY IF EXISTS haccp_document_versions_update ON haccp_document_versions;
DROP POLICY IF EXISTS haccp_document_versions_delete ON haccp_document_versions;

DROP POLICY IF EXISTS haccp_documents_select ON haccp_documents;
DROP POLICY IF EXISTS haccp_documents_insert ON haccp_documents;
DROP POLICY IF EXISTS haccp_documents_update ON haccp_documents;
DROP POLICY IF EXISTS haccp_documents_delete ON haccp_documents;

DROP POLICY IF EXISTS haccp_food_defence_plans_select ON haccp_food_defence_plans;
DROP POLICY IF EXISTS haccp_food_defence_plans_insert ON haccp_food_defence_plans;
DROP POLICY IF EXISTS haccp_food_defence_plans_update ON haccp_food_defence_plans;
DROP POLICY IF EXISTS haccp_food_defence_plans_delete ON haccp_food_defence_plans;

DROP POLICY IF EXISTS haccp_food_fraud_assessments_select ON haccp_food_fraud_assessments;
DROP POLICY IF EXISTS haccp_food_fraud_assessments_insert ON haccp_food_fraud_assessments;
DROP POLICY IF EXISTS haccp_food_fraud_assessments_update ON haccp_food_fraud_assessments;
DROP POLICY IF EXISTS haccp_food_fraud_assessments_delete ON haccp_food_fraud_assessments;

DROP POLICY IF EXISTS haccp_health_records_select ON haccp_health_records;
DROP POLICY IF EXISTS haccp_health_records_insert ON haccp_health_records;
DROP POLICY IF EXISTS haccp_health_records_update ON haccp_health_records;
DROP POLICY IF EXISTS haccp_health_records_delete ON haccp_health_records;

DROP POLICY IF EXISTS haccp_meatprep_log_select ON haccp_meatprep_log;
DROP POLICY IF EXISTS haccp_meatprep_log_insert ON haccp_meatprep_log;
DROP POLICY IF EXISTS haccp_meatprep_log_update ON haccp_meatprep_log;
DROP POLICY IF EXISTS haccp_meatprep_log_delete ON haccp_meatprep_log;

DROP POLICY IF EXISTS haccp_mince_log_select ON haccp_mince_log;
DROP POLICY IF EXISTS haccp_mince_log_insert ON haccp_mince_log;
DROP POLICY IF EXISTS haccp_mince_log_update ON haccp_mince_log;
DROP POLICY IF EXISTS haccp_mince_log_delete ON haccp_mince_log;

DROP POLICY IF EXISTS haccp_monthly_review_select ON haccp_monthly_review;
DROP POLICY IF EXISTS haccp_monthly_review_insert ON haccp_monthly_review;
DROP POLICY IF EXISTS haccp_monthly_review_update ON haccp_monthly_review;
DROP POLICY IF EXISTS haccp_monthly_review_delete ON haccp_monthly_review;

DROP POLICY IF EXISTS haccp_processing_temps_select ON haccp_processing_temps;
DROP POLICY IF EXISTS haccp_processing_temps_insert ON haccp_processing_temps;
DROP POLICY IF EXISTS haccp_processing_temps_update ON haccp_processing_temps;
DROP POLICY IF EXISTS haccp_processing_temps_delete ON haccp_processing_temps;

DROP POLICY IF EXISTS haccp_product_specs_select ON haccp_product_specs;
DROP POLICY IF EXISTS haccp_product_specs_insert ON haccp_product_specs;
DROP POLICY IF EXISTS haccp_product_specs_update ON haccp_product_specs;
DROP POLICY IF EXISTS haccp_product_specs_delete ON haccp_product_specs;

DROP POLICY IF EXISTS haccp_recall_config_select ON haccp_recall_config;
DROP POLICY IF EXISTS haccp_recall_config_insert ON haccp_recall_config;
DROP POLICY IF EXISTS haccp_recall_config_update ON haccp_recall_config;
DROP POLICY IF EXISTS haccp_recall_config_delete ON haccp_recall_config;

DROP POLICY IF EXISTS haccp_returns_select ON haccp_returns;
DROP POLICY IF EXISTS haccp_returns_insert ON haccp_returns;
DROP POLICY IF EXISTS haccp_returns_update ON haccp_returns;
DROP POLICY IF EXISTS haccp_returns_delete ON haccp_returns;

DROP POLICY IF EXISTS haccp_sop_content_select ON haccp_sop_content;
DROP POLICY IF EXISTS haccp_sop_content_insert ON haccp_sop_content;
DROP POLICY IF EXISTS haccp_sop_content_update ON haccp_sop_content;
DROP POLICY IF EXISTS haccp_sop_content_delete ON haccp_sop_content;

DROP POLICY IF EXISTS haccp_staff_training_select ON haccp_staff_training;
DROP POLICY IF EXISTS haccp_staff_training_insert ON haccp_staff_training;
DROP POLICY IF EXISTS haccp_staff_training_update ON haccp_staff_training;
DROP POLICY IF EXISTS haccp_staff_training_delete ON haccp_staff_training;

DROP POLICY IF EXISTS haccp_suppliers_select ON haccp_suppliers;
DROP POLICY IF EXISTS haccp_suppliers_insert ON haccp_suppliers;
DROP POLICY IF EXISTS haccp_suppliers_update ON haccp_suppliers;
DROP POLICY IF EXISTS haccp_suppliers_delete ON haccp_suppliers;

DROP POLICY IF EXISTS haccp_time_separation_log_select ON haccp_time_separation_log;
DROP POLICY IF EXISTS haccp_time_separation_log_insert ON haccp_time_separation_log;
DROP POLICY IF EXISTS haccp_time_separation_log_update ON haccp_time_separation_log;
DROP POLICY IF EXISTS haccp_time_separation_log_delete ON haccp_time_separation_log;

DROP POLICY IF EXISTS haccp_weekly_review_select ON haccp_weekly_review;
DROP POLICY IF EXISTS haccp_weekly_review_insert ON haccp_weekly_review;
DROP POLICY IF EXISTS haccp_weekly_review_update ON haccp_weekly_review;
DROP POLICY IF EXISTS haccp_weekly_review_delete ON haccp_weekly_review;

DROP FUNCTION IF EXISTS public.current_user_is_active();
