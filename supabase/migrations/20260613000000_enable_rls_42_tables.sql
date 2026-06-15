-- ============================================================
-- T2 — Enable RLS on the 42 exposed public tables
-- ============================================================
--
-- Closes advisor Finding 2 (rls_disabled_in_public x42) from the
-- RLS audit (docs/rls-audit-2026-06-12.md §3b). Each ALTER below
-- turns RLS ON with ZERO policies attached. Per ADR-0004 the app
-- is service-role-everywhere, and service-role BYPASSES RLS — so
-- the app's own queries are unaffected. The effect is deny-all to
-- the anon/authenticated PostgREST roles, which is the entire point:
-- the /rest/v1/<table> endpoints stop serving these tables to anyone
-- holding the public anon key.
--
-- This is the identical, production-proven pattern already running
-- on order_idempotency_keys (20260611_001). Per-table read/write
-- POLICIES are OUT OF SCOPE here and land later per-domain
-- (F-RLS-04a..i).
--
-- HARD CONSTRAINT: ENABLE, never FORCE. FORCE would subject the
-- app's own service-role queries to the (nonexistent) policies and
-- take production down. Do not change ENABLE to FORCE.
--
-- ADDITIVE only — no DROP, no data change, no ALTER TYPE. Zero
-- downtime. PITR not required (state is recoverable by the rollback
-- block in this plan §5; ALTER ... DISABLE is instant).
-- ============================================================

-- ─── Drift guard: abort unless exactly the expected 42 RLS-disabled
--     public tables are present, matching the 2026-06-12 audit set ──
DO $$
DECLARE
  v_expected text[] := ARRAY[
    -- Financial (3)
    'cash_entries','cash_months','cheque_records',
    -- Commercial pricing (3)
    'price_agreements','price_agreement_lines','customer_road_times',
    -- Staff personal / GDPR (3)
    'haccp_health_records','haccp_staff_training','haccp_allergen_training',
    -- Operational / routing / notes (6)
    'routes','route_stops','hub_sentinels','visit_notes','complaint_notes','compliments',
    -- HACCP compliance (27)
    'haccp_suppliers','haccp_corrective_actions','haccp_deliveries',
    'haccp_cold_storage_temps','haccp_documents','haccp_mince_log',
    'haccp_daily_diary','haccp_cleaning_log','haccp_processing_temps',
    'haccp_returns','haccp_calibration_log','haccp_cold_storage_units',
    'haccp_sop_content','haccp_meatprep_log','haccp_allergen_assessment',
    'haccp_allergen_monthly_reviews','haccp_product_specs','haccp_food_defence_plans',
    'haccp_food_fraud_assessments','haccp_recall_config','haccp_annual_reviews',
    'haccp_weekly_review','haccp_monthly_review','haccp_dispatch_log',
    'haccp_time_separation_log','haccp_document_versions','haccp_document_reviews'
  ];
  v_live_disabled  text[];
  v_missing        text[];
  v_unexpected     text[];
BEGIN
  -- Live set of RLS-disabled BASE tables in the public schema.
  SELECT coalesce(array_agg(c.relname ORDER BY c.relname), ARRAY[]::text[])
    INTO v_live_disabled
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'           -- ordinary base tables only
    AND c.relrowsecurity = false; -- RLS currently OFF

  -- Tables we expect to enable but that are NOT currently RLS-off
  -- (already enabled, renamed, or dropped since the audit).
  SELECT coalesce(array_agg(e ORDER BY e), ARRAY[]::text[])
    INTO v_missing
  FROM unnest(v_expected) e
  WHERE e <> ALL (v_live_disabled);

  -- RLS-off tables in the DB that are NOT in our expected set
  -- (new tables added since the audit — must be triaged, not silently enabled).
  SELECT coalesce(array_agg(l ORDER BY l), ARRAY[]::text[])
    INTO v_unexpected
  FROM unnest(v_live_disabled) l
  WHERE l <> ALL (v_expected);

  IF array_length(v_expected, 1) <> 42 THEN
    RAISE EXCEPTION 'T2 guard: expected list is % entries, must be 42', array_length(v_expected,1);
  END IF;

  IF array_length(v_missing, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'T2 guard: expected-but-not-RLS-disabled (drift): %', v_missing;
  END IF;

  IF array_length(v_unexpected, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'T2 guard: RLS-disabled tables NOT in expected set (new drift): %', v_unexpected;
  END IF;

  RAISE NOTICE 'T2 guard passed: exactly 42 expected RLS-disabled tables present.';
END $$;

-- ─── Enable RLS (ENABLE, never FORCE) — 42 explicit statements ──

-- Financial (3)
ALTER TABLE cash_entries                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_months                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE cheque_records                ENABLE ROW LEVEL SECURITY;

-- Commercial pricing (3)
ALTER TABLE price_agreements              ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_agreement_lines         ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_road_times           ENABLE ROW LEVEL SECURITY;

-- Staff personal / GDPR special-category (3)
ALTER TABLE haccp_health_records          ENABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_staff_training          ENABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_allergen_training       ENABLE ROW LEVEL SECURITY;

-- Operational / routing / notes (6)
ALTER TABLE routes                        ENABLE ROW LEVEL SECURITY;
ALTER TABLE route_stops                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE hub_sentinels                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE visit_notes                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE complaint_notes               ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliments                   ENABLE ROW LEVEL SECURITY;

-- HACCP compliance (27)
ALTER TABLE haccp_suppliers               ENABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_corrective_actions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_deliveries              ENABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_cold_storage_temps      ENABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_documents               ENABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_mince_log               ENABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_daily_diary             ENABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_cleaning_log            ENABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_processing_temps        ENABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_returns                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_calibration_log         ENABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_cold_storage_units      ENABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_sop_content             ENABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_meatprep_log            ENABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_allergen_assessment     ENABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_allergen_monthly_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_product_specs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_food_defence_plans      ENABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_food_fraud_assessments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_recall_config           ENABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_annual_reviews          ENABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_weekly_review           ENABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_monthly_review          ENABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_dispatch_log            ENABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_time_separation_log     ENABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_document_versions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE haccp_document_reviews        ENABLE ROW LEVEL SECURITY;

-- ─── Post-state assertion: all 42 are now RLS-enabled, and none of
--     them were accidentally FORCE'd (relforcerowsecurity must stay false) ──
DO $$
DECLARE
  v_expected text[] := ARRAY[
    'cash_entries','cash_months','cheque_records',
    'price_agreements','price_agreement_lines','customer_road_times',
    'haccp_health_records','haccp_staff_training','haccp_allergen_training',
    'routes','route_stops','hub_sentinels','visit_notes','complaint_notes','compliments',
    'haccp_suppliers','haccp_corrective_actions','haccp_deliveries',
    'haccp_cold_storage_temps','haccp_documents','haccp_mince_log',
    'haccp_daily_diary','haccp_cleaning_log','haccp_processing_temps',
    'haccp_returns','haccp_calibration_log','haccp_cold_storage_units',
    'haccp_sop_content','haccp_meatprep_log','haccp_allergen_assessment',
    'haccp_allergen_monthly_reviews','haccp_product_specs','haccp_food_defence_plans',
    'haccp_food_fraud_assessments','haccp_recall_config','haccp_annual_reviews',
    'haccp_weekly_review','haccp_monthly_review','haccp_dispatch_log',
    'haccp_time_separation_log','haccp_document_versions','haccp_document_reviews'
  ];
  v_not_enabled text[];
  v_forced      text[];
BEGIN
  SELECT coalesce(array_agg(e ORDER BY e), ARRAY[]::text[])
    INTO v_not_enabled
  FROM unnest(v_expected) e
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = e AND c.relrowsecurity = true
  );

  SELECT coalesce(array_agg(c.relname ORDER BY c.relname), ARRAY[]::text[])
    INTO v_forced
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = ANY (v_expected)
    AND c.relforcerowsecurity = true;   -- FORCE guard: must be empty

  IF array_length(v_not_enabled, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'T2 post-check: these expected tables are still RLS-off: %', v_not_enabled;
  END IF;

  IF array_length(v_forced, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'T2 post-check: FORCE RLS detected (must be ENABLE only): %', v_forced;
  END IF;

  RAISE NOTICE 'T2 post-check passed: all 42 RLS-enabled, none FORCE.';
END $$;
