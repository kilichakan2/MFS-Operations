-- ============================================================
-- T2 ROLLBACK — disable RLS on the 42 tables
-- ============================================================
-- Reverse of supabase/migrations/20260613_001_enable_rls_42_tables.sql.
--
-- ADDITIVE migration → NON-DESTRUCTIVE rollback. No data was changed
-- by the forward migration, so this restores the exact prior state.
-- ALTER ... DISABLE ROW LEVEL SECURITY is instant and lossless.
-- PITR is NOT required for this rollback (no data-loss scenario).
--
-- Use this ONLY if enabling RLS unexpectedly breaks a path that the
-- service-role bypass was assumed to cover. Per ADR-0004 the app is
-- service-role-everywhere and service-role bypasses RLS, so this
-- should never be needed — but it is here, tested, and instant.
-- ============================================================

-- Financial (3)
ALTER TABLE cash_entries                  DISABLE ROW LEVEL SECURITY;
ALTER TABLE cash_months                   DISABLE ROW LEVEL SECURITY;
ALTER TABLE cheque_records                DISABLE ROW LEVEL SECURITY;

-- Commercial pricing (3)
ALTER TABLE price_agreements              DISABLE ROW LEVEL SECURITY;
ALTER TABLE price_agreement_lines         DISABLE ROW LEVEL SECURITY;
ALTER TABLE customer_road_times           DISABLE ROW LEVEL SECURITY;

-- Staff personal / GDPR special-category (3)
ALTER TABLE haccp_health_records          DISABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_staff_training          DISABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_allergen_training       DISABLE ROW LEVEL SECURITY;

-- Operational / routing / notes (6)
ALTER TABLE routes                        DISABLE ROW LEVEL SECURITY;
ALTER TABLE route_stops                   DISABLE ROW LEVEL SECURITY;
ALTER TABLE hub_sentinels                 DISABLE ROW LEVEL SECURITY;
ALTER TABLE visit_notes                   DISABLE ROW LEVEL SECURITY;
ALTER TABLE complaint_notes               DISABLE ROW LEVEL SECURITY;
ALTER TABLE compliments                   DISABLE ROW LEVEL SECURITY;

-- HACCP compliance (27)
ALTER TABLE haccp_suppliers               DISABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_corrective_actions      DISABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_deliveries              DISABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_cold_storage_temps      DISABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_documents               DISABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_mince_log               DISABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_daily_diary             DISABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_cleaning_log            DISABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_processing_temps        DISABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_returns                 DISABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_calibration_log         DISABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_cold_storage_units      DISABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_sop_content             DISABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_meatprep_log            DISABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_allergen_assessment     DISABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_allergen_monthly_reviews DISABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_product_specs           DISABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_food_defence_plans      DISABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_food_fraud_assessments  DISABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_recall_config           DISABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_annual_reviews          DISABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_weekly_review           DISABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_monthly_review          DISABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_dispatch_log            DISABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_time_separation_log     DISABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_document_versions       DISABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_document_reviews        DISABLE ROW LEVEL SECURITY;
