SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';


CREATE TYPE "public"."agreement_status" AS ENUM (
    'draft',
    'active',
    'cancelled'
);


ALTER TYPE "public"."agreement_status" OWNER TO "postgres";


CREATE TYPE "public"."audit_screen" AS ENUM (
    'screen1',
    'screen2',
    'screen3',
    'screen5'
);


ALTER TYPE "public"."audit_screen" OWNER TO "postgres";


CREATE TYPE "public"."complaint_category" AS ENUM (
    'weight',
    'quality',
    'delivery',
    'missing_item',
    'pricing',
    'service',
    'other'
);


ALTER TYPE "public"."complaint_category" OWNER TO "postgres";


CREATE TYPE "public"."complaint_received_via" AS ENUM (
    'phone',
    'in_person',
    'whatsapp',
    'email',
    'other'
);


ALTER TYPE "public"."complaint_received_via" OWNER TO "postgres";


CREATE TYPE "public"."complaint_status" AS ENUM (
    'open',
    'resolved'
);


ALTER TYPE "public"."complaint_status" OWNER TO "postgres";


CREATE TYPE "public"."discrepancy_reason" AS ENUM (
    'out_of_stock',
    'supplier_short',
    'butcher_error',
    'other'
);


ALTER TYPE "public"."discrepancy_reason" OWNER TO "postgres";


CREATE TYPE "public"."discrepancy_status" AS ENUM (
    'short',
    'not_sent'
);


ALTER TYPE "public"."discrepancy_status" OWNER TO "postgres";


CREATE TYPE "public"."discrepancy_unit" AS ENUM (
    'kg',
    'units'
);


ALTER TYPE "public"."discrepancy_unit" OWNER TO "postgres";


CREATE TYPE "public"."price_unit" AS ENUM (
    'per_kg',
    'per_box'
);


ALTER TYPE "public"."price_unit" OWNER TO "postgres";


CREATE TYPE "public"."user_role" AS ENUM (
    'warehouse',
    'office',
    'sales',
    'admin',
    'driver',
    'butcher'
);


ALTER TYPE "public"."user_role" OWNER TO "postgres";


CREATE TYPE "public"."visit_outcome" AS ENUM (
    'positive',
    'neutral',
    'at_risk',
    'lost'
);


ALTER TYPE "public"."visit_outcome" OWNER TO "postgres";


CREATE TYPE "public"."visit_type" AS ENUM (
    'routine',
    'new_pitch',
    'complaint_followup',
    'delivery_issue'
);


ALTER TYPE "public"."visit_type" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."haccp_search"("query" "text") RETURNS TABLE("sop_ref" "text", "title" "text", "source_doc" "text", "section_key" "text", "snippet" "text", "rank" real)
    LANGUAGE "sql" STABLE
    AS $$
  SELECT
    s.sop_ref,
    s.title,
    s.source_doc,
    s.section_key,
    ts_headline(
      'english',
      s.content_md,
      plainto_tsquery('english', query),
      'StartSel=<mark>, StopSel=</mark>, MaxWords=30, MinWords=10, MaxFragments=2, FragmentDelimiter= … '
    ) AS snippet,
    ts_rank(s.search_vector, plainto_tsquery('english', query)) AS rank
  FROM haccp_sop_content s
  WHERE s.active = true
    AND s.search_vector @@ plainto_tsquery('english', query)
  ORDER BY rank DESC
  LIMIT 20;
$$;


ALTER FUNCTION "public"."haccp_search"("query" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT COALESCE(
    (SELECT role = 'admin'
     FROM public.users
     WHERE id = current_setting('app.current_user_id', true)::uuid),
    false
  )
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."is_admin"() IS 'Returns true if the current session user (set via app.current_user_id GUC) has role=admin.';


CREATE OR REPLACE FUNCTION "public"."replace_agreement_lines"("p_agreement_id" "uuid", "p_lines" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Delete all existing lines for this agreement
  DELETE FROM price_agreement_lines
  WHERE agreement_id = p_agreement_id;

  -- Insert the new lines (empty array = agreement with no lines is valid)
  IF jsonb_array_length(p_lines) > 0 THEN
    INSERT INTO price_agreement_lines (
      agreement_id,
      product_id,
      product_name_override,
      price,
      unit,
      notes,
      position
    )
    SELECT
      (line->>'agreement_id')::uuid,
      NULLIF(line->>'product_id', '')::uuid,
      NULLIF(line->>'product_name_override', ''),
      (line->>'price')::numeric,
      (line->>'unit')::price_unit,
      NULLIF(line->>'notes', ''),
      (line->>'position')::integer
    FROM jsonb_array_elements(p_lines) AS line;
  END IF;
END;
$$;


ALTER FUNCTION "public"."replace_agreement_lines"("p_agreement_id" "uuid", "p_lines" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."agreement_ref_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."agreement_ref_seq" OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."alarm_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "subscription_id" "uuid",
    "overdue_key" "text" NOT NULL,
    "notification_count" integer DEFAULT 0,
    "first_sent_at" timestamp with time zone DEFAULT "now"(),
    "last_sent_at" timestamp with time zone DEFAULT "now"(),
    "resolved_at" timestamp with time zone
);


ALTER TABLE "public"."alarm_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "screen" "public"."audit_screen" NOT NULL,
    "action" "text" NOT NULL,
    "record_id" "uuid",
    "summary" "text" NOT NULL
);


ALTER TABLE "public"."audit_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cash_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "month_id" "uuid" NOT NULL,
    "entry_date" "date" NOT NULL,
    "type" "text" NOT NULL,
    "category" "text",
    "amount" numeric(10,2) NOT NULL,
    "description" "text" NOT NULL,
    "reference" "text",
    "attachment_path" "text",
    "attachment_name" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "edited_by" "uuid",
    "edited_at" timestamp with time zone,
    "customer_id" "uuid",
    CONSTRAINT "cash_entries_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "cash_entries_type_check" CHECK (("type" = ANY (ARRAY['income'::"text", 'expense'::"text"])))
);


ALTER TABLE "public"."cash_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cash_months" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "year" integer NOT NULL,
    "month" integer NOT NULL,
    "opening_balance" numeric(10,2) DEFAULT 0 NOT NULL,
    "is_locked" boolean DEFAULT false NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "cash_months_month_check" CHECK ((("month" >= 1) AND ("month" <= 12)))
);


ALTER TABLE "public"."cash_months" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cheque_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "date" "date" NOT NULL,
    "customer_id" "uuid",
    "amount" numeric(10,2) NOT NULL,
    "cheque_number" "text",
    "driver_id" "uuid" NOT NULL,
    "notes" "text",
    "logged_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "banked" boolean DEFAULT false NOT NULL,
    "banked_by" "uuid",
    "banked_at" timestamp with time zone,
    "customer_name" "text",
    CONSTRAINT "cheque_records_amount_check" CHECK (("amount" > (0)::numeric))
);


ALTER TABLE "public"."cheque_records" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."complaint_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "complaint_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "body" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "complaint_notes_body_check" CHECK (("char_length"(TRIM(BOTH FROM "body")) >= 1))
);


ALTER TABLE "public"."complaint_notes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."complaints" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "category" "public"."complaint_category" NOT NULL,
    "description" "text" NOT NULL,
    "received_via" "public"."complaint_received_via" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "status" "public"."complaint_status" DEFAULT 'open'::"public"."complaint_status" NOT NULL,
    "resolution_note" "text",
    "resolved_by" "uuid",
    "resolved_at" timestamp with time zone,
    CONSTRAINT "complaints_description_check" CHECK (("char_length"("description") >= 5)),
    CONSTRAINT "complaints_resolution_check" CHECK (((("status" = 'open'::"public"."complaint_status") AND ("resolution_note" IS NULL) AND ("resolved_by" IS NULL) AND ("resolved_at" IS NULL)) OR (("status" = 'resolved'::"public"."complaint_status") AND ("resolution_note" IS NOT NULL) AND ("resolved_by" IS NOT NULL) AND ("resolved_at" IS NOT NULL))))
);


ALTER TABLE "public"."complaints" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."compliments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "body" "text" NOT NULL,
    "posted_by" "uuid" NOT NULL,
    "recipient_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "compliments_body_check" CHECK (("char_length"("body") > 0))
);


ALTER TABLE "public"."compliments" OWNER TO "postgres";


COMMENT ON TABLE "public"."compliments" IS 'Team compliments — positive shoutouts posted by any team member. recipient_id is optional (can be directed at a specific person or the whole team).';


CREATE TABLE IF NOT EXISTS "public"."customer_road_times" (
    "from_id" "uuid" NOT NULL,
    "to_id" "uuid" NOT NULL,
    "duration_s" integer NOT NULL,
    "distance_m" integer NOT NULL,
    "computed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."customer_road_times" OWNER TO "postgres";


COMMENT ON TABLE "public"."customer_road_times" IS 'Pre-computed road times between all customer pairs and hub locations. Hub sentinel UUIDs: MFS=00000000-0000-0000-0000-000000000001, Ozmen=00000000-0000-0000-0000-000000000002';


CREATE TABLE IF NOT EXISTS "public"."customers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "name" "text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "external_system_id" character varying(255),
    "external_system_source" character varying(100),
    "postcode" "text",
    "lat" double precision,
    "lng" double precision,
    "geocoded_at" timestamp with time zone,
    "is_approximate_location" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."customers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."discrepancies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "ordered_qty" numeric(8,3) NOT NULL,
    "sent_qty" numeric(8,3),
    "unit" "public"."discrepancy_unit" NOT NULL,
    "status" "public"."discrepancy_status" NOT NULL,
    "reason" "public"."discrepancy_reason" NOT NULL,
    "note" "text",
    CONSTRAINT "discrepancies_ordered_qty_check" CHECK (("ordered_qty" > (0)::numeric)),
    CONSTRAINT "discrepancies_sent_qty_check" CHECK (("sent_qty" > (0)::numeric))
);


ALTER TABLE "public"."discrepancies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."haccp_allergen_assessment" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "assessed_by" "uuid",
    "assessed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "next_review_date" "date" NOT NULL,
    "site_status" "text" DEFAULT 'nil_allergens'::"text" NOT NULL,
    "raw_materials" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "cross_contam_risk" "text" DEFAULT 'None — no allergens handled on site'::"text" NOT NULL,
    "procedure_notes" "text",
    "updated_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "haccp_allergen_assessment_site_status_check" CHECK (("site_status" = ANY (ARRAY['nil_allergens'::"text", 'allergens_present'::"text", 'under_review'::"text"])))
);


ALTER TABLE "public"."haccp_allergen_assessment" OWNER TO "postgres";


COMMENT ON TABLE "public"."haccp_allergen_assessment" IS 'SALSA 1.4.1 — documented site allergen identification and cross-contamination risk assessment. One active record.';


CREATE TABLE IF NOT EXISTS "public"."haccp_allergen_monthly_reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "month_year" "text" NOT NULL,
    "period_start" "date" NOT NULL,
    "period_end" "date" NOT NULL,
    "total_deliveries" integer DEFAULT 0 NOT NULL,
    "allergen_detections" integer DEFAULT 0 NOT NULL,
    "category_breakdown" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "detection_details" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "site_status" "text" NOT NULL,
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "haccp_allergen_monthly_reviews_site_status_check" CHECK (("site_status" = ANY (ARRAY['confirmed_nil'::"text", 'detections_found'::"text", 'no_deliveries'::"text"])))
);


ALTER TABLE "public"."haccp_allergen_monthly_reviews" OWNER TO "postgres";


COMMENT ON TABLE "public"."haccp_allergen_monthly_reviews" IS 'SALSA 1.4.2 — monthly allergen monitoring records. Evidence of active allergen management.';


CREATE TABLE IF NOT EXISTS "public"."haccp_allergen_training" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "submitted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "logged_by" "uuid" NOT NULL,
    "staff_user_id" "uuid",
    "staff_name" "text" NOT NULL,
    "job_role" "text" NOT NULL,
    "training_completed" "text" NOT NULL,
    "certification_date" "date" NOT NULL,
    "refresh_date" "date" NOT NULL,
    "reviewed_by" "text",
    "review_date" "date",
    "review_signed_by" "uuid",
    "confirmation_items" "jsonb",
    "supervisor_name" "text",
    "document_version" "text"
);


ALTER TABLE "public"."haccp_allergen_training" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."haccp_annual_reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "review_year" "text" NOT NULL,
    "review_period_from" "date" NOT NULL,
    "review_period_to" "date" NOT NULL,
    "checklist" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "action_plan" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "signed_off_by" "uuid",
    "signed_off_at" timestamp with time zone,
    "approved_by" "uuid",
    "approved_at" "date",
    "locked" boolean DEFAULT false NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."haccp_annual_reviews" OWNER TO "postgres";


COMMENT ON TABLE "public"."haccp_annual_reviews" IS 'SALSA 3.1 — Annual food safety systems review. One draft at a time. Labels stored in checklist jsonb for self-contained audit records.';


CREATE TABLE IF NOT EXISTS "public"."haccp_calibration_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "submitted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "submitted_by" "uuid" NOT NULL,
    "date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "time_of_check" time without time zone DEFAULT CURRENT_TIME NOT NULL,
    "thermometer_id" "text" NOT NULL,
    "ice_water_result_c" numeric(4,1),
    "ice_water_pass" boolean,
    "boiling_water_result_c" numeric(4,1),
    "boiling_water_pass" boolean,
    "action_taken" "text",
    "synced_at" timestamp with time zone,
    "calibration_mode" "text" DEFAULT 'manual'::"text" NOT NULL,
    "cert_reference" "text",
    "purchase_date" "date",
    "verified_by" "text",
    CONSTRAINT "haccp_calibration_log_calibration_mode_check" CHECK (("calibration_mode" = ANY (ARRAY['manual'::"text", 'certified_probe'::"text"])))
);


ALTER TABLE "public"."haccp_calibration_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."haccp_cleaning_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "submitted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "submitted_by" "uuid" NOT NULL,
    "date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "time_of_clean" time without time zone DEFAULT CURRENT_TIME NOT NULL,
    "what_was_cleaned" "text" NOT NULL,
    "issues" boolean DEFAULT false NOT NULL,
    "what_did_you_do" "text",
    "synced_at" timestamp with time zone,
    "verified_by" "text",
    "sanitiser_temp_c" numeric
);


ALTER TABLE "public"."haccp_cleaning_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."haccp_cold_storage_temps" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "submitted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "submitted_by" "uuid" NOT NULL,
    "date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "session" "text" NOT NULL,
    "unit_id" "uuid" NOT NULL,
    "temperature_c" numeric(4,1) NOT NULL,
    "temp_status" "text" NOT NULL,
    "comments" "text",
    "corrective_action_required" boolean DEFAULT false NOT NULL,
    "synced_at" timestamp with time zone,
    CONSTRAINT "haccp_cold_storage_temps_session_check" CHECK (("session" = ANY (ARRAY['AM'::"text", 'PM'::"text"]))),
    CONSTRAINT "haccp_cold_storage_temps_temp_status_check" CHECK (("temp_status" = ANY (ARRAY['pass'::"text", 'amber'::"text", 'critical'::"text"])))
);


ALTER TABLE "public"."haccp_cold_storage_temps" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."haccp_cold_storage_units" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "unit_type" "text" NOT NULL,
    "target_temp_c" numeric(4,1) NOT NULL,
    "max_temp_c" numeric(4,1) NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "haccp_cold_storage_units_unit_type_check" CHECK (("unit_type" = ANY (ARRAY['chiller'::"text", 'freezer'::"text", 'room'::"text"])))
);


ALTER TABLE "public"."haccp_cold_storage_units" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."haccp_corrective_actions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "submitted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "actioned_by" "uuid" NOT NULL,
    "source_table" "text" NOT NULL,
    "source_id" "uuid" NOT NULL,
    "ccp_ref" "text" NOT NULL,
    "deviation_description" "text" NOT NULL,
    "action_taken" "text" NOT NULL,
    "product_disposition" "text",
    "recurrence_prevention" "text",
    "verified_by" "uuid",
    "verified_at" timestamp with time zone,
    "resolved" boolean DEFAULT false NOT NULL,
    "management_verification_required" boolean DEFAULT false NOT NULL,
    "synced_at" timestamp with time zone,
    CONSTRAINT "haccp_corrective_actions_product_disposition_check" CHECK (("product_disposition" = ANY (ARRAY['accept'::"text", 'conditional_accept'::"text", 'reject'::"text", 'dispose'::"text", 'assess'::"text"])))
);


ALTER TABLE "public"."haccp_corrective_actions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."haccp_daily_diary" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "submitted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "submitted_by" "uuid" NOT NULL,
    "date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "phase" "text" NOT NULL,
    "check_results" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "issues" boolean DEFAULT false NOT NULL,
    "what_did_you_do" "text",
    "synced_at" timestamp with time zone,
    CONSTRAINT "haccp_daily_diary_phase_check" CHECK (("phase" = ANY (ARRAY['opening'::"text", 'operational'::"text", 'closing'::"text"])))
);


ALTER TABLE "public"."haccp_daily_diary" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."haccp_deliveries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "submitted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "submitted_by" "uuid" NOT NULL,
    "date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "time_of_delivery" time without time zone DEFAULT CURRENT_TIME NOT NULL,
    "supplier" "text" NOT NULL,
    "product" "text" NOT NULL,
    "product_category" "text" NOT NULL,
    "temperature_c" numeric(4,1),
    "temp_status" "text" NOT NULL,
    "covered_contaminated" "text" NOT NULL,
    "contamination_notes" "text",
    "corrective_action_required" boolean DEFAULT false NOT NULL,
    "notes" "text",
    "synced_at" timestamp with time zone,
    "born_in" "text",
    "slaughter_site" "text",
    "batch_number" "text",
    "cut_site" "text",
    "delivery_number" integer,
    "reared_in" "text",
    "supplier_id" "uuid",
    "contamination_type" "text",
    "species" "text",
    "allergens_identified" boolean DEFAULT false NOT NULL,
    "allergen_notes" "text",
    CONSTRAINT "chk_delivery_species" CHECK ((("species" IS NULL) OR ("species" = ANY (ARRAY['lamb'::"text", 'beef'::"text", 'imported_vac'::"text"])))),
    CONSTRAINT "haccp_deliveries_contamination_type_check" CHECK (("contamination_type" = ANY (ARRAY['uncovered'::"text", 'contaminated_faecal'::"text", 'packaging_damaged'::"text", 'missing_docs'::"text"]))),
    CONSTRAINT "haccp_deliveries_covered_contaminated_check" CHECK (("covered_contaminated" = ANY (ARRAY['no'::"text", 'yes'::"text", 'yes_actioned'::"text"]))),
    CONSTRAINT "haccp_deliveries_product_category_check" CHECK (("product_category" = ANY (ARRAY['lamb'::"text", 'beef'::"text", 'red_meat'::"text", 'offal'::"text", 'mince_prep'::"text", 'frozen'::"text", 'poultry'::"text", 'dairy'::"text", 'chilled_other'::"text", 'dry_goods'::"text", 'frozen_beef_lamb'::"text"]))),
    CONSTRAINT "haccp_deliveries_temp_status_check" CHECK (("temp_status" = ANY (ARRAY['pass'::"text", 'urgent'::"text", 'fail'::"text"])))
);


ALTER TABLE "public"."haccp_deliveries" OWNER TO "postgres";


COMMENT ON COLUMN "public"."haccp_deliveries"."contamination_type" IS 'C6 — classification per CA-001. NULL when covered_contaminated=no. Required when yes or yes_actioned.';


COMMENT ON COLUMN "public"."haccp_deliveries"."allergens_identified" IS 'SALSA 1.4.2 — allergen check at intake. MFS is allergen-free; true = non-conformance, CA required.';


COMMENT ON COLUMN "public"."haccp_deliveries"."allergen_notes" IS 'Required when allergens_identified=true. Describe allergens found.';


CREATE TABLE IF NOT EXISTS "public"."haccp_dispatch_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "submitted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "submitted_by" "uuid" NOT NULL,
    "date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "time_of_dispatch" time without time zone DEFAULT CURRENT_TIME NOT NULL,
    "customer_id" "uuid",
    "customer_name" "text",
    "product" "text" NOT NULL,
    "product_category" "text" NOT NULL,
    "quantity_kg" numeric,
    "quantity_units" integer,
    "batch_numbers" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "source_delivery_ids" "uuid"[] DEFAULT '{}'::"uuid"[],
    "temperature_c" numeric,
    "temp_status" "text",
    "vehicle_reg" "text",
    "driver_name" "text",
    "notes" "text",
    "synced_at" timestamp with time zone,
    CONSTRAINT "haccp_dispatch_log_product_category_check" CHECK (("product_category" = ANY (ARRAY['red_meat'::"text", 'offal'::"text", 'mince_prep'::"text", 'frozen'::"text", 'other'::"text"]))),
    CONSTRAINT "haccp_dispatch_log_temp_status_check" CHECK ((("temp_status" = ANY (ARRAY['pass'::"text", 'fail'::"text"])) OR ("temp_status" IS NULL)))
);


ALTER TABLE "public"."haccp_dispatch_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."haccp_document_reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "review_date" "date" NOT NULL,
    "reviewed_by" "uuid" NOT NULL,
    "position" "text" NOT NULL,
    "documents_reviewed" "text"[] NOT NULL,
    "comments" "text",
    "signed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."haccp_document_reviews" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."haccp_document_versions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "doc_ref" "text" NOT NULL,
    "old_version" "text" NOT NULL,
    "new_version" "text" NOT NULL,
    "changes_made" "text" NOT NULL,
    "changed_by" "uuid" NOT NULL,
    "approved_by" "uuid",
    "changed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."haccp_document_versions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."haccp_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "doc_ref" "text" NOT NULL,
    "title" "text" NOT NULL,
    "version" "text" NOT NULL,
    "category" "text" NOT NULL,
    "description" "text" NOT NULL,
    "purpose" "text" NOT NULL,
    "linked_docs" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "status" "text" DEFAULT 'current'::"text" NOT NULL,
    "updated_at" "date" NOT NULL,
    "review_due" "date" NOT NULL,
    "owner" "text" DEFAULT 'Hakan Kilic'::"text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "register_type" "text"[] DEFAULT '{fsa,salsa}'::"text"[] NOT NULL,
    CONSTRAINT "haccp_documents_category_check" CHECK (("category" = ANY (ARRAY['handbook_policy'::"text", 'monitoring_forms'::"text", 'corrective_actions'::"text", 'mince_meat_prep'::"text", 'health_monitoring'::"text", 'training'::"text", 'salsa'::"text", 'allergen'::"text", 'food_fraud'::"text", 'food_defence'::"text", 'haccp_system'::"text"]))),
    CONSTRAINT "haccp_documents_status_check" CHECK (("status" = ANY (ARRAY['current'::"text", 'superseded'::"text", 'draft'::"text"])))
);


ALTER TABLE "public"."haccp_documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."haccp_food_defence_plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "version" "text" NOT NULL,
    "issue_date" "date" NOT NULL,
    "next_review_date" "date" NOT NULL,
    "team" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "physical_perimeter" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "physical_internal" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "cyber_controls" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "backup_recovery" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "emergency_contacts" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "personnel_notes" "text",
    "goods_notes" "text",
    "incident_notes" "text",
    "prepared_by" "uuid",
    "approved_by" "uuid",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."haccp_food_defence_plans" OWNER TO "postgres";


COMMENT ON TABLE "public"."haccp_food_defence_plans" IS 'SALSA 4.2.3 / BSD 4.4 — Food Defence Plans. Each row is an immutable version. Latest by created_at is current.';


CREATE TABLE IF NOT EXISTS "public"."haccp_food_fraud_assessments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "version" "text" NOT NULL,
    "issue_date" "date" NOT NULL,
    "next_review_date" "date" NOT NULL,
    "risks" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "supply_chain" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "mitigation_notes" "text",
    "prepared_by" "uuid",
    "approved_by" "uuid",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."haccp_food_fraud_assessments" OWNER TO "postgres";


COMMENT ON TABLE "public"."haccp_food_fraud_assessments" IS 'BSD 1.6.4 — Food fraud vulnerability assessments. Each row is an immutable version. Latest by created_at is current.';


CREATE TABLE IF NOT EXISTS "public"."haccp_health_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "submitted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "submitted_by" "uuid" NOT NULL,
    "record_type" "text" NOT NULL,
    "date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "staff_user_id" "uuid",
    "staff_name" "text",
    "health_questions" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "additional_notes" "text",
    "fit_for_work" boolean NOT NULL,
    "exclusion_reason" "text",
    "return_date" "date",
    "absence_from" "date",
    "absence_to" "date",
    "absence_reason" "text",
    "illness_type" "text",
    "symptom_free_48h" boolean,
    "medical_certificate_provided" boolean,
    "visitor_name" "text",
    "visitor_company" "text",
    "visitor_reason" "text",
    "visitor_declaration_confirmed" boolean,
    "manager_signed_by" "uuid",
    "manager_signed_at" timestamp with time zone,
    "manager_signed_name" "text",
    CONSTRAINT "haccp_health_records_illness_type_check" CHECK (("illness_type" = ANY (ARRAY['gastrointestinal'::"text", 'other_illness'::"text", 'serious_illness'::"text"]))),
    CONSTRAINT "haccp_health_records_record_type_check" CHECK (("record_type" = ANY (ARRAY['new_staff_declaration'::"text", 'return_to_work'::"text", 'visitor'::"text"])))
);


ALTER TABLE "public"."haccp_health_records" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."haccp_meatprep_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "submitted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "submitted_by" "uuid" NOT NULL,
    "date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "time_of_production" time without time zone DEFAULT CURRENT_TIME NOT NULL,
    "batch_code" "text" NOT NULL,
    "product_name" "text" NOT NULL,
    "input_temp_c" numeric(4,1) NOT NULL,
    "output_temp_c" numeric(4,1) NOT NULL,
    "input_temp_pass" boolean NOT NULL,
    "output_temp_pass" boolean NOT NULL,
    "allergens_present" "text"[],
    "label_check_completed" boolean DEFAULT false NOT NULL,
    "corrective_action" "text",
    "synced_at" timestamp with time zone,
    "source_batch_numbers" "text"[] DEFAULT '{}'::"text"[],
    "source_delivery_ids" "uuid"[] DEFAULT '{}'::"uuid"[],
    "kill_date" "date",
    "days_from_kill" integer,
    "product_species" "text",
    "output_mode" "text" DEFAULT 'chilled'::"text" NOT NULL,
    CONSTRAINT "haccp_meatprep_log_output_mode_check" CHECK (("output_mode" = ANY (ARRAY['chilled'::"text", 'frozen'::"text"])))
);


ALTER TABLE "public"."haccp_meatprep_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."haccp_mince_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "submitted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "submitted_by" "uuid" NOT NULL,
    "date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "time_of_production" time without time zone DEFAULT CURRENT_TIME NOT NULL,
    "batch_code" "text" NOT NULL,
    "product_species" "text" NOT NULL,
    "kill_date" "date" NOT NULL,
    "days_from_kill" integer NOT NULL,
    "kill_date_within_limit" boolean NOT NULL,
    "input_temp_c" numeric(4,1) NOT NULL,
    "output_temp_c" numeric(4,1) NOT NULL,
    "input_temp_pass" boolean NOT NULL,
    "output_temp_pass" boolean NOT NULL,
    "corrective_action" "text",
    "synced_at" timestamp with time zone,
    "source_batch_numbers" "text"[] DEFAULT '{}'::"text"[],
    "source_delivery_ids" "uuid"[] DEFAULT '{}'::"uuid"[],
    "output_mode" "text" DEFAULT 'chilled'::"text" NOT NULL,
    CONSTRAINT "haccp_mince_log_output_mode_check" CHECK (("output_mode" = ANY (ARRAY['chilled'::"text", 'frozen'::"text"])))
);


ALTER TABLE "public"."haccp_mince_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."haccp_monthly_review" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "submitted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "submitted_by" "uuid" NOT NULL,
    "month_year" "date" NOT NULL,
    "date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "equipment_checks" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "facilities_checks" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "haccp_system_review" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "further_notes" "text",
    "synced_at" timestamp with time zone
);


ALTER TABLE "public"."haccp_monthly_review" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."haccp_processing_temps" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "submitted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "submitted_by" "uuid" NOT NULL,
    "date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "session" "text" NOT NULL,
    "product_temp_c" numeric(4,1) NOT NULL,
    "room_temp_c" numeric(4,1) NOT NULL,
    "product_within_limit" boolean NOT NULL,
    "room_within_limit" boolean NOT NULL,
    "within_limits" boolean NOT NULL,
    "corrective_action_required" boolean DEFAULT false NOT NULL,
    "synced_at" timestamp with time zone,
    CONSTRAINT "haccp_processing_temps_session_check" CHECK (("session" = ANY (ARRAY['AM'::"text", 'PM'::"text"])))
);


ALTER TABLE "public"."haccp_processing_temps" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."haccp_product_specs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_name" "text" NOT NULL,
    "description" "text",
    "ingredients" "text",
    "allergens" "text"[],
    "portion_weight_g" numeric,
    "storage_temp_c" numeric,
    "shelf_life_chilled_days" integer,
    "shelf_life_frozen_days" integer,
    "packaging_type" "text",
    "micro_limits" "text",
    "version" "text" DEFAULT 'V1.0'::"text" NOT NULL,
    "reviewed_at" "date",
    "reviewed_by" "uuid",
    "active" boolean DEFAULT true NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "allergen_notes" "text"
);


ALTER TABLE "public"."haccp_product_specs" OWNER TO "postgres";


COMMENT ON TABLE "public"."haccp_product_specs" IS 'BSD 1.6.2 — Product specifications for MFS own-produced items. Admin-managed, version-controlled.';


CREATE TABLE IF NOT EXISTS "public"."haccp_recall_config" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "internal_team" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "regulatory" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "other_contacts" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "updated_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."haccp_recall_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."haccp_returns" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "submitted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "submitted_by" "uuid" NOT NULL,
    "date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "time_of_return" time without time zone DEFAULT CURRENT_TIME NOT NULL,
    "product" "text" NOT NULL,
    "temperature_c" numeric(4,1),
    "return_code" "text" NOT NULL,
    "return_code_notes" "text",
    "disposition" "text" NOT NULL,
    "never_resell_reason" "text",
    "corrective_action" "text",
    "synced_at" timestamp with time zone,
    "customer" "text",
    "customer_id" "uuid",
    "source_batch_number" "text",
    "verified_by" "text",
    CONSTRAINT "haccp_returns_disposition_check" CHECK (("disposition" = ANY (ARRAY['restock'::"text", 'reprocess'::"text", 'quarantine'::"text", 'dispose'::"text"]))),
    CONSTRAINT "haccp_returns_return_code_check" CHECK (("return_code" = ANY (ARRAY['RC01'::"text", 'RC02'::"text", 'RC03'::"text", 'RC04'::"text", 'RC05'::"text", 'RC06'::"text", 'RC07'::"text", 'RC08'::"text"])))
);


ALTER TABLE "public"."haccp_returns" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."haccp_sop_content" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sop_ref" "text" NOT NULL,
    "title" "text" NOT NULL,
    "content_md" "text" NOT NULL,
    "version" "text" DEFAULT 'V4.1'::"text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "section_key" "text",
    "source_doc" "text",
    "search_vector" "tsvector" GENERATED ALWAYS AS (("setweight"("to_tsvector"('"english"'::"regconfig", COALESCE("title", ''::"text")), 'A'::"char") || "setweight"("to_tsvector"('"english"'::"regconfig", COALESCE("content_md", ''::"text")), 'B'::"char"))) STORED
);


ALTER TABLE "public"."haccp_sop_content" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."haccp_staff_training" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "submitted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "logged_by" "uuid" NOT NULL,
    "staff_user_id" "uuid",
    "staff_name" "text" NOT NULL,
    "training_type" "text" NOT NULL,
    "completion_date" "date" NOT NULL,
    "confirmation_items" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "supervisor_signed_by" "uuid",
    "supervisor_signed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "document_version" "text",
    "job_role" "text",
    "refresh_date" "date",
    "supervisor_name" "text",
    CONSTRAINT "haccp_staff_training_training_type_check" CHECK (("training_type" = ANY (ARRAY['warehouse_operative'::"text", 'butchery_process_room'::"text"])))
);


ALTER TABLE "public"."haccp_staff_training" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."haccp_suppliers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "address" "text",
    "contact_name" "text",
    "contact_phone" "text",
    "contact_email" "text",
    "fsa_approval_no" "text",
    "fsa_activities" "text",
    "cert_type" "text",
    "cert_expiry" "date",
    "products_supplied" "text",
    "date_approved" "date",
    "notes" "text",
    "categories" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "label_code" "text"
);


ALTER TABLE "public"."haccp_suppliers" OWNER TO "postgres";


COMMENT ON COLUMN "public"."haccp_suppliers"."label_code" IS 'Short code for 58mm label printing (max 6 chars). Falls back to first 4 chars of name if null.';


CREATE TABLE IF NOT EXISTS "public"."haccp_time_separation_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "submitted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "submitted_by" "uuid" NOT NULL,
    "date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "time_of_entry" time without time zone DEFAULT CURRENT_TIME NOT NULL,
    "clean_completed_time" time without time zone NOT NULL,
    "clean_verified_by" "text" NOT NULL,
    "allergens_in_production" "text" NOT NULL,
    "corrective_action" "text",
    "synced_at" timestamp with time zone,
    "plain_products_end_time" time without time zone,
    "allergen_products_start_time" time without time zone
);


ALTER TABLE "public"."haccp_time_separation_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."haccp_weekly_review" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "submitted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "submitted_by" "uuid" NOT NULL,
    "week_ending" "date" NOT NULL,
    "date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "assessments" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "synced_at" timestamp with time zone
);


ALTER TABLE "public"."haccp_weekly_review" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."hub_sentinels" (
    "id" "uuid" NOT NULL,
    "name" "text" NOT NULL
);


ALTER TABLE "public"."hub_sentinels" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."price_agreement_lines" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "agreement_id" "uuid" NOT NULL,
    "product_id" "uuid",
    "product_name_override" "text",
    "price" numeric NOT NULL,
    "unit" "public"."price_unit" DEFAULT 'per_kg'::"public"."price_unit" NOT NULL,
    "notes" "text",
    "position" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "price_agreement_lines_price_check" CHECK (("price" > (0)::numeric)),
    CONSTRAINT "product_or_override" CHECK ((("product_id" IS NOT NULL) OR (("product_name_override" IS NOT NULL) AND ("char_length"(TRIM(BOTH FROM "product_name_override")) > 0))))
);


ALTER TABLE "public"."price_agreement_lines" OWNER TO "postgres";


COMMENT ON TABLE "public"."price_agreement_lines" IS 'Individual product lines within a price agreement. product_id links to the products table; product_name_override is used for custom/freetext products.';


CREATE TABLE IF NOT EXISTS "public"."price_agreements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "reference_number" "text" DEFAULT ((('MFS-'::"text" || "to_char"("now"(), 'YYYY'::"text")) || '-'::"text") || "lpad"(("nextval"('"public"."agreement_ref_seq"'::"regclass"))::"text", 4, '0'::"text")) NOT NULL,
    "customer_id" "uuid",
    "prospect_name" "text",
    "agreed_by" "uuid" NOT NULL,
    "status" "public"."agreement_status" DEFAULT 'draft'::"public"."agreement_status" NOT NULL,
    "valid_from" "date" DEFAULT CURRENT_DATE NOT NULL,
    "valid_until" "date",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "customer_or_prospect" CHECK ((("customer_id" IS NOT NULL) OR (("prospect_name" IS NOT NULL) AND ("char_length"(TRIM(BOTH FROM "prospect_name")) > 0))))
);


ALTER TABLE "public"."price_agreements" OWNER TO "postgres";


COMMENT ON TABLE "public"."price_agreements" IS 'Customer-specific agreed pricing. Status: draft (being built) | active (live) | cancelled (withdrawn). Expired is computed on read when valid_until < CURRENT_DATE.';


CREATE TABLE IF NOT EXISTS "public"."products" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "name" "text" NOT NULL,
    "category" "text",
    "active" boolean DEFAULT true NOT NULL,
    "external_system_id" character varying(255),
    "external_system_source" character varying(100),
    "code" "text",
    "box_size" "text"
);


ALTER TABLE "public"."products" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."push_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "endpoint" "text" NOT NULL,
    "p256dh" "text" NOT NULL,
    "auth" "text" NOT NULL,
    "device_label" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "last_used" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."push_subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."route_stops" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "route_id" "uuid" NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "position" integer NOT NULL,
    "priority" "text" DEFAULT 'none'::"text" NOT NULL,
    "locked_position" boolean DEFAULT false NOT NULL,
    "priority_note" "text",
    "estimated_arrival" time without time zone,
    "drive_time_from_prev_min" integer,
    "distance_from_prev_km" numeric,
    "visited" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "route_stops_priority_check" CHECK (("priority" = ANY (ARRAY['none'::"text", 'urgent'::"text", 'priority'::"text"])))
);


ALTER TABLE "public"."route_stops" OWNER TO "postgres";


COMMENT ON TABLE "public"."route_stops" IS 'Individual stops within a route, ordered by position';


COMMENT ON COLUMN "public"."route_stops"."priority" IS 'none=standard, urgent=low stock, priority=time-critical early delivery';


COMMENT ON COLUMN "public"."route_stops"."locked_position" IS 'If true the optimiser must not reorder this stop';


CREATE TABLE IF NOT EXISTS "public"."routes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text",
    "planned_date" "date" NOT NULL,
    "assigned_to" "uuid",
    "created_by" "uuid",
    "departure_time" time without time zone DEFAULT '08:00:00'::time without time zone NOT NULL,
    "end_point" "text" DEFAULT 'mfs'::"text" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "total_distance_km" numeric,
    "total_duration_min" integer,
    "google_maps_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "routes_end_point_check" CHECK (("end_point" = ANY (ARRAY['mfs'::"text", 'ozmen_john_street'::"text"]))),
    CONSTRAINT "routes_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'active'::"text", 'completed'::"text"])))
);


ALTER TABLE "public"."routes" OWNER TO "postgres";


COMMENT ON TABLE "public"."routes" IS 'Planned delivery/sales routes assigned to a driver or rep';


COMMENT ON COLUMN "public"."routes"."end_point" IS 'mfs = MFS Sheffield warehouse; ozmen_john_street = Ozmen depot';


CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "name" "text" NOT NULL,
    "role" "public"."user_role" NOT NULL,
    "pin_hash" "text",
    "password_hash" "text",
    "active" boolean DEFAULT true NOT NULL,
    "last_login_at" timestamp with time zone,
    "email" "text",
    "secondary_roles" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    CONSTRAINT "users_auth_check" CHECK (((("role" = 'admin'::"public"."user_role") AND ("password_hash" IS NOT NULL)) OR (("role" <> 'admin'::"public"."user_role") AND ("pin_hash" IS NOT NULL))))
);


ALTER TABLE "public"."users" OWNER TO "postgres";


COMMENT ON COLUMN "public"."users"."secondary_roles" IS 'Additional roles beyond primary role. Admin never permitted. Grants union of permissions.';


CREATE TABLE IF NOT EXISTS "public"."visit_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "visit_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "body" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone,
    CONSTRAINT "visit_notes_body_check" CHECK (("char_length"("body") > 0))
);


ALTER TABLE "public"."visit_notes" OWNER TO "postgres";


COMMENT ON TABLE "public"."visit_notes" IS 'Timestamped update notes added to a visit after initial logging. Each note is authored by a user and editable by that author only. Separate from the visits.notes field which is the original logged note.';


CREATE TABLE IF NOT EXISTS "public"."visits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "customer_id" "uuid",
    "prospect_name" "text",
    "prospect_postcode" "text",
    "visit_type" "public"."visit_type" NOT NULL,
    "outcome" "public"."visit_outcome" NOT NULL,
    "commitment_made" boolean DEFAULT false NOT NULL,
    "commitment_detail" "text",
    "notes" "text",
    "prospect_lat" double precision,
    "prospect_lng" double precision,
    "is_approximate_location" boolean DEFAULT false NOT NULL,
    "pipeline_status" "text" DEFAULT 'Logged'::"text" NOT NULL,
    CONSTRAINT "visits_commitment_check" CHECK (((("commitment_made" = false) AND ("commitment_detail" IS NULL)) OR (("commitment_made" = true) AND ("commitment_detail" IS NOT NULL)))),
    CONSTRAINT "visits_customer_check" CHECK (((("customer_id" IS NOT NULL) AND ("prospect_name" IS NULL)) OR (("customer_id" IS NULL) AND ("prospect_name" IS NOT NULL))))
);


ALTER TABLE "public"."visits" OWNER TO "postgres";


COMMENT ON COLUMN "public"."visits"."pipeline_status" IS 'Sales pipeline status, independent of visit outcome. Values: Logged, Not Progressing, Trial Order Placed, Awaiting Feedback, Won, Not Won';


ALTER TABLE ONLY "public"."alarm_sessions"
    ADD CONSTRAINT "alarm_sessions_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."cash_entries"
    ADD CONSTRAINT "cash_entries_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."cash_months"
    ADD CONSTRAINT "cash_months_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."cash_months"
    ADD CONSTRAINT "cash_months_year_month_key" UNIQUE ("year", "month");


ALTER TABLE ONLY "public"."cheque_records"
    ADD CONSTRAINT "cheque_records_pkey" PRIMARY KEY ("id");


ALTER TABLE "public"."haccp_meatprep_log"
    ADD CONSTRAINT "chk_meatprep_species" CHECK ((("product_species" IS NULL) OR ("product_species" = ANY (ARRAY['lamb'::"text", 'beef'::"text", 'imported_vac'::"text"])))) NOT VALID;


ALTER TABLE "public"."haccp_mince_log"
    ADD CONSTRAINT "chk_mince_species" CHECK (("product_species" = ANY (ARRAY['lamb'::"text", 'beef'::"text", 'imported_vac'::"text"]))) NOT VALID;


ALTER TABLE ONLY "public"."complaint_notes"
    ADD CONSTRAINT "complaint_notes_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."complaints"
    ADD CONSTRAINT "complaints_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."compliments"
    ADD CONSTRAINT "compliments_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."customer_road_times"
    ADD CONSTRAINT "customer_road_times_pkey" PRIMARY KEY ("from_id", "to_id");


ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_external_unique" UNIQUE ("external_system_id", "external_system_source");


ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_name_key" UNIQUE ("name");


ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."discrepancies"
    ADD CONSTRAINT "discrepancies_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."haccp_allergen_assessment"
    ADD CONSTRAINT "haccp_allergen_assessment_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."haccp_allergen_monthly_reviews"
    ADD CONSTRAINT "haccp_allergen_monthly_reviews_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."haccp_allergen_training"
    ADD CONSTRAINT "haccp_allergen_training_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."haccp_annual_reviews"
    ADD CONSTRAINT "haccp_annual_reviews_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."haccp_calibration_log"
    ADD CONSTRAINT "haccp_calibration_log_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."haccp_cleaning_log"
    ADD CONSTRAINT "haccp_cleaning_log_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."haccp_cold_storage_temps"
    ADD CONSTRAINT "haccp_cold_storage_temps_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."haccp_cold_storage_units"
    ADD CONSTRAINT "haccp_cold_storage_units_name_key" UNIQUE ("name");


ALTER TABLE ONLY "public"."haccp_cold_storage_units"
    ADD CONSTRAINT "haccp_cold_storage_units_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."haccp_corrective_actions"
    ADD CONSTRAINT "haccp_corrective_actions_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."haccp_daily_diary"
    ADD CONSTRAINT "haccp_daily_diary_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."haccp_deliveries"
    ADD CONSTRAINT "haccp_deliveries_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."haccp_dispatch_log"
    ADD CONSTRAINT "haccp_dispatch_log_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."haccp_document_reviews"
    ADD CONSTRAINT "haccp_document_reviews_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."haccp_document_versions"
    ADD CONSTRAINT "haccp_document_versions_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."haccp_documents"
    ADD CONSTRAINT "haccp_documents_doc_ref_key" UNIQUE ("doc_ref");


ALTER TABLE ONLY "public"."haccp_documents"
    ADD CONSTRAINT "haccp_documents_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."haccp_food_defence_plans"
    ADD CONSTRAINT "haccp_food_defence_plans_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."haccp_food_fraud_assessments"
    ADD CONSTRAINT "haccp_food_fraud_assessments_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."haccp_health_records"
    ADD CONSTRAINT "haccp_health_records_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."haccp_meatprep_log"
    ADD CONSTRAINT "haccp_meatprep_log_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."haccp_mince_log"
    ADD CONSTRAINT "haccp_mince_log_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."haccp_monthly_review"
    ADD CONSTRAINT "haccp_monthly_review_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."haccp_processing_temps"
    ADD CONSTRAINT "haccp_processing_temps_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."haccp_product_specs"
    ADD CONSTRAINT "haccp_product_specs_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."haccp_recall_config"
    ADD CONSTRAINT "haccp_recall_config_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."haccp_returns"
    ADD CONSTRAINT "haccp_returns_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."haccp_sop_content"
    ADD CONSTRAINT "haccp_sop_content_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."haccp_sop_content"
    ADD CONSTRAINT "haccp_sop_content_sop_ref_version_key" UNIQUE ("sop_ref", "version");


ALTER TABLE ONLY "public"."haccp_staff_training"
    ADD CONSTRAINT "haccp_staff_training_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."haccp_suppliers"
    ADD CONSTRAINT "haccp_suppliers_name_key" UNIQUE ("name");


ALTER TABLE ONLY "public"."haccp_suppliers"
    ADD CONSTRAINT "haccp_suppliers_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."haccp_time_separation_log"
    ADD CONSTRAINT "haccp_time_separation_log_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."haccp_weekly_review"
    ADD CONSTRAINT "haccp_weekly_review_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."hub_sentinels"
    ADD CONSTRAINT "hub_sentinels_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."price_agreement_lines"
    ADD CONSTRAINT "price_agreement_lines_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."price_agreements"
    ADD CONSTRAINT "price_agreements_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."price_agreements"
    ADD CONSTRAINT "price_agreements_reference_number_key" UNIQUE ("reference_number");


ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_external_unique" UNIQUE ("external_system_id", "external_system_source");


ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_name_key" UNIQUE ("name");


ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_user_id_endpoint_key" UNIQUE ("user_id", "endpoint");


ALTER TABLE ONLY "public"."route_stops"
    ADD CONSTRAINT "route_stops_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."route_stops"
    ADD CONSTRAINT "route_stops_route_id_position_key" UNIQUE ("route_id", "position");


ALTER TABLE ONLY "public"."routes"
    ADD CONSTRAINT "routes_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."haccp_deliveries"
    ADD CONSTRAINT "uq_haccp_deliveries_date_num" UNIQUE ("date", "delivery_number");


ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."visit_notes"
    ADD CONSTRAINT "visit_notes_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."visits"
    ADD CONSTRAINT "visits_pkey" PRIMARY KEY ("id");


CREATE INDEX "cash_entries_date_idx" ON "public"."cash_entries" USING "btree" ("entry_date");


CREATE INDEX "cash_entries_month_id_idx" ON "public"."cash_entries" USING "btree" ("month_id");


CREATE INDEX "cheque_records_customer_id_idx" ON "public"."cheque_records" USING "btree" ("customer_id");


CREATE INDEX "cheque_records_date_idx" ON "public"."cheque_records" USING "btree" ("date" DESC);


CREATE INDEX "cheque_records_driver_id_idx" ON "public"."cheque_records" USING "btree" ("driver_id");


CREATE INDEX "complaint_notes_complaint_id_idx" ON "public"."complaint_notes" USING "btree" ("complaint_id");


CREATE INDEX "complaint_notes_created_at_idx" ON "public"."complaint_notes" USING "btree" ("created_at" DESC);


CREATE INDEX "compliments_created_idx" ON "public"."compliments" USING "btree" ("created_at" DESC);


CREATE INDEX "compliments_posted_by_idx" ON "public"."compliments" USING "btree" ("posted_by");


CREATE INDEX "crt_age_idx" ON "public"."customer_road_times" USING "btree" ("computed_at");


CREATE INDEX "crt_from_idx" ON "public"."customer_road_times" USING "btree" ("from_id");


CREATE INDEX "crt_to_idx" ON "public"."customer_road_times" USING "btree" ("to_id");


CREATE INDEX "customers_lat_lng_idx" ON "public"."customers" USING "btree" ("lat", "lng") WHERE (("lat" IS NOT NULL) AND ("lng" IS NOT NULL));


CREATE INDEX "idx_alarm_sessions_subscription" ON "public"."alarm_sessions" USING "btree" ("subscription_id");


CREATE INDEX "idx_alarm_sessions_unresolved" ON "public"."alarm_sessions" USING "btree" ("resolved_at") WHERE ("resolved_at" IS NULL);


CREATE INDEX "idx_allergen_assessment_assessed_at" ON "public"."haccp_allergen_assessment" USING "btree" ("assessed_at" DESC);


CREATE UNIQUE INDEX "idx_allergen_monthly_reviews_month" ON "public"."haccp_allergen_monthly_reviews" USING "btree" ("month_year");


CREATE UNIQUE INDEX "idx_annual_reviews_one_draft" ON "public"."haccp_annual_reviews" USING "btree" ("locked") WHERE ("locked" = false);


CREATE INDEX "idx_audit_log_created_at" ON "public"."audit_log" USING "btree" ("created_at" DESC);


CREATE INDEX "idx_audit_log_screen" ON "public"."audit_log" USING "btree" ("screen");


CREATE INDEX "idx_audit_log_user_id" ON "public"."audit_log" USING "btree" ("user_id");


CREATE INDEX "idx_complaints_category" ON "public"."complaints" USING "btree" ("category");


CREATE INDEX "idx_complaints_created_at" ON "public"."complaints" USING "btree" ("created_at" DESC);


CREATE INDEX "idx_complaints_customer_id" ON "public"."complaints" USING "btree" ("customer_id");


CREATE INDEX "idx_complaints_status" ON "public"."complaints" USING "btree" ("status");


CREATE INDEX "idx_customers_external" ON "public"."customers" USING "btree" ("external_system_source", "external_system_id");


CREATE INDEX "idx_discrepancies_created_at" ON "public"."discrepancies" USING "btree" ("created_at" DESC);


CREATE INDEX "idx_discrepancies_customer_id" ON "public"."discrepancies" USING "btree" ("customer_id");


CREATE INDEX "idx_discrepancies_reason" ON "public"."discrepancies" USING "btree" ("reason");


CREATE INDEX "idx_discrepancies_status" ON "public"."discrepancies" USING "btree" ("status");


CREATE INDEX "idx_haccp_at_refresh" ON "public"."haccp_allergen_training" USING "btree" ("refresh_date");


CREATE INDEX "idx_haccp_at_staff" ON "public"."haccp_allergen_training" USING "btree" ("staff_user_id");


CREATE INDEX "idx_haccp_ca_by" ON "public"."haccp_corrective_actions" USING "btree" ("actioned_by");


CREATE INDEX "idx_haccp_ca_ccp" ON "public"."haccp_corrective_actions" USING "btree" ("ccp_ref");


CREATE INDEX "idx_haccp_ca_resolved" ON "public"."haccp_corrective_actions" USING "btree" ("resolved");


CREATE INDEX "idx_haccp_ca_source" ON "public"."haccp_corrective_actions" USING "btree" ("source_table", "source_id");


CREATE INDEX "idx_haccp_cal_date" ON "public"."haccp_calibration_log" USING "btree" ("date");


CREATE INDEX "idx_haccp_cl_by" ON "public"."haccp_cleaning_log" USING "btree" ("submitted_by");


CREATE INDEX "idx_haccp_cl_date" ON "public"."haccp_cleaning_log" USING "btree" ("date");


CREATE INDEX "idx_haccp_cst_by" ON "public"."haccp_cold_storage_temps" USING "btree" ("submitted_by");


CREATE INDEX "idx_haccp_cst_date" ON "public"."haccp_cold_storage_temps" USING "btree" ("date");


CREATE UNIQUE INDEX "idx_haccp_cst_unique" ON "public"."haccp_cold_storage_temps" USING "btree" ("date", "session", "unit_id");


CREATE INDEX "idx_haccp_cst_unit" ON "public"."haccp_cold_storage_temps" USING "btree" ("unit_id");


CREATE INDEX "idx_haccp_dd_by" ON "public"."haccp_daily_diary" USING "btree" ("submitted_by");


CREATE INDEX "idx_haccp_dd_date" ON "public"."haccp_daily_diary" USING "btree" ("date");


CREATE UNIQUE INDEX "idx_haccp_dd_unique" ON "public"."haccp_daily_diary" USING "btree" ("date", "phase");


CREATE INDEX "idx_haccp_del_species" ON "public"."haccp_deliveries" USING "btree" ("species") WHERE ("species" IS NOT NULL);


CREATE INDEX "idx_haccp_deliveries_batch" ON "public"."haccp_deliveries" USING "btree" ("batch_number");


CREATE INDEX "idx_haccp_deliveries_by" ON "public"."haccp_deliveries" USING "btree" ("submitted_by");


CREATE INDEX "idx_haccp_deliveries_date" ON "public"."haccp_deliveries" USING "btree" ("date");


CREATE INDEX "idx_haccp_deliveries_supplier_id" ON "public"."haccp_deliveries" USING "btree" ("supplier_id");


CREATE INDEX "idx_haccp_disp_batches" ON "public"."haccp_dispatch_log" USING "gin" ("batch_numbers");


CREATE INDEX "idx_haccp_disp_customer" ON "public"."haccp_dispatch_log" USING "btree" ("customer_id");


CREATE INDEX "idx_haccp_disp_date" ON "public"."haccp_dispatch_log" USING "btree" ("date");


CREATE INDEX "idx_haccp_disp_submitted" ON "public"."haccp_dispatch_log" USING "btree" ("submitted_by");


CREATE INDEX "idx_haccp_hr_date" ON "public"."haccp_health_records" USING "btree" ("date");


CREATE INDEX "idx_haccp_hr_staff" ON "public"."haccp_health_records" USING "btree" ("staff_user_id");


CREATE INDEX "idx_haccp_hr_type" ON "public"."haccp_health_records" USING "btree" ("record_type");


CREATE INDEX "idx_haccp_ml_batch" ON "public"."haccp_mince_log" USING "btree" ("batch_code");


CREATE INDEX "idx_haccp_ml_by" ON "public"."haccp_mince_log" USING "btree" ("submitted_by");


CREATE INDEX "idx_haccp_ml_date" ON "public"."haccp_mince_log" USING "btree" ("date");


CREATE INDEX "idx_haccp_ml_kill_date" ON "public"."haccp_mince_log" USING "btree" ("kill_date");


CREATE INDEX "idx_haccp_ml_source_batches" ON "public"."haccp_mince_log" USING "gin" ("source_batch_numbers");


CREATE UNIQUE INDEX "idx_haccp_ml_unique_batch" ON "public"."haccp_mince_log" USING "btree" ("date", "batch_code");


CREATE INDEX "idx_haccp_mpl_batch" ON "public"."haccp_meatprep_log" USING "btree" ("batch_code");


CREATE INDEX "idx_haccp_mpl_by" ON "public"."haccp_meatprep_log" USING "btree" ("submitted_by");


CREATE INDEX "idx_haccp_mpl_date" ON "public"."haccp_meatprep_log" USING "btree" ("date");


CREATE INDEX "idx_haccp_mpl_kill_date" ON "public"."haccp_meatprep_log" USING "btree" ("kill_date");


CREATE INDEX "idx_haccp_mpl_source_batches" ON "public"."haccp_meatprep_log" USING "gin" ("source_batch_numbers");


CREATE UNIQUE INDEX "idx_haccp_mpl_unique_batch" ON "public"."haccp_meatprep_log" USING "btree" ("date", "batch_code");


CREATE INDEX "idx_haccp_mr_month" ON "public"."haccp_monthly_review" USING "btree" ("month_year");


CREATE INDEX "idx_haccp_pt_by" ON "public"."haccp_processing_temps" USING "btree" ("submitted_by");


CREATE INDEX "idx_haccp_pt_date" ON "public"."haccp_processing_temps" USING "btree" ("date");


CREATE UNIQUE INDEX "idx_haccp_pt_unique" ON "public"."haccp_processing_temps" USING "btree" ("date", "session");


CREATE INDEX "idx_haccp_ret_by" ON "public"."haccp_returns" USING "btree" ("submitted_by");


CREATE INDEX "idx_haccp_ret_customer_id" ON "public"."haccp_returns" USING "btree" ("customer_id");


CREATE INDEX "idx_haccp_ret_date" ON "public"."haccp_returns" USING "btree" ("date");


CREATE INDEX "idx_haccp_ret_return_code" ON "public"."haccp_returns" USING "btree" ("return_code");


CREATE INDEX "idx_haccp_ret_source_batch" ON "public"."haccp_returns" USING "btree" ("source_batch_number");


CREATE INDEX "idx_haccp_sop_content_fts" ON "public"."haccp_sop_content" USING "gin" ("search_vector");


CREATE INDEX "idx_haccp_sop_search" ON "public"."haccp_sop_content" USING "gin" ("search_vector");


CREATE INDEX "idx_haccp_st_staff" ON "public"."haccp_staff_training" USING "btree" ("staff_user_id");


CREATE INDEX "idx_haccp_st_type" ON "public"."haccp_staff_training" USING "btree" ("training_type");


CREATE INDEX "idx_haccp_tsl_by" ON "public"."haccp_time_separation_log" USING "btree" ("submitted_by");


CREATE INDEX "idx_haccp_tsl_date" ON "public"."haccp_time_separation_log" USING "btree" ("date");


CREATE UNIQUE INDEX "idx_haccp_wr_unique" ON "public"."haccp_weekly_review" USING "btree" ("week_ending");


CREATE INDEX "idx_haccp_wr_week" ON "public"."haccp_weekly_review" USING "btree" ("week_ending");


CREATE INDEX "idx_products_external" ON "public"."products" USING "btree" ("external_system_source", "external_system_id");


CREATE INDEX "idx_push_subscriptions_user" ON "public"."push_subscriptions" USING "btree" ("user_id");


CREATE INDEX "idx_visits_commitment_made" ON "public"."visits" USING "btree" ("commitment_made") WHERE ("commitment_made" = true);


CREATE INDEX "idx_visits_created_at" ON "public"."visits" USING "btree" ("created_at" DESC);


CREATE INDEX "idx_visits_customer_id" ON "public"."visits" USING "btree" ("customer_id");


CREATE INDEX "idx_visits_outcome" ON "public"."visits" USING "btree" ("outcome");


CREATE INDEX "idx_visits_pipeline_status" ON "public"."visits" USING "btree" ("pipeline_status");


CREATE INDEX "idx_visits_user_id" ON "public"."visits" USING "btree" ("user_id");


CREATE INDEX "price_agreements_agreed_by_idx" ON "public"."price_agreements" USING "btree" ("agreed_by");


CREATE INDEX "price_agreements_created_idx" ON "public"."price_agreements" USING "btree" ("created_at" DESC);


CREATE INDEX "price_agreements_customer_idx" ON "public"."price_agreements" USING "btree" ("customer_id");


CREATE INDEX "price_agreements_status_idx" ON "public"."price_agreements" USING "btree" ("status");


CREATE INDEX "price_lines_agreement_idx" ON "public"."price_agreement_lines" USING "btree" ("agreement_id");


CREATE INDEX "price_lines_product_idx" ON "public"."price_agreement_lines" USING "btree" ("product_id");


CREATE INDEX "route_stops_customer_id_idx" ON "public"."route_stops" USING "btree" ("customer_id");


CREATE INDEX "route_stops_route_id_idx" ON "public"."route_stops" USING "btree" ("route_id");


CREATE INDEX "routes_assigned_to_idx" ON "public"."routes" USING "btree" ("assigned_to");


CREATE INDEX "routes_planned_date_idx" ON "public"."routes" USING "btree" ("planned_date");


CREATE INDEX "routes_status_idx" ON "public"."routes" USING "btree" ("status");


CREATE INDEX "users_active_role_idx" ON "public"."users" USING "btree" ("active", "role");


CREATE INDEX "visit_notes_created_idx" ON "public"."visit_notes" USING "btree" ("visit_id", "created_at");


CREATE INDEX "visit_notes_user_id_idx" ON "public"."visit_notes" USING "btree" ("user_id");


CREATE INDEX "visit_notes_visit_id_idx" ON "public"."visit_notes" USING "btree" ("visit_id");


CREATE INDEX "visits_prospect_coords_idx" ON "public"."visits" USING "btree" ("prospect_lat", "prospect_lng") WHERE (("prospect_lat" IS NOT NULL) AND ("prospect_lng" IS NOT NULL));


CREATE RULE "no_delete_haccp_allergen_training" AS
    ON DELETE TO "public"."haccp_allergen_training" DO INSTEAD NOTHING;


CREATE RULE "no_delete_haccp_calibration_log" AS
    ON DELETE TO "public"."haccp_calibration_log" DO INSTEAD NOTHING;


CREATE RULE "no_delete_haccp_cleaning_log" AS
    ON DELETE TO "public"."haccp_cleaning_log" DO INSTEAD NOTHING;


CREATE RULE "no_delete_haccp_cold_storage_temps" AS
    ON DELETE TO "public"."haccp_cold_storage_temps" DO INSTEAD NOTHING;


CREATE RULE "no_delete_haccp_corrective_actions" AS
    ON DELETE TO "public"."haccp_corrective_actions" DO INSTEAD NOTHING;


CREATE RULE "no_delete_haccp_daily_diary" AS
    ON DELETE TO "public"."haccp_daily_diary" DO INSTEAD NOTHING;


CREATE RULE "no_delete_haccp_deliveries" AS
    ON DELETE TO "public"."haccp_deliveries" DO INSTEAD NOTHING;


CREATE RULE "no_delete_haccp_dispatch_log" AS
    ON DELETE TO "public"."haccp_dispatch_log" DO INSTEAD NOTHING;


CREATE RULE "no_delete_haccp_document_reviews" AS
    ON DELETE TO "public"."haccp_document_reviews" DO INSTEAD NOTHING;


CREATE RULE "no_delete_haccp_document_versions" AS
    ON DELETE TO "public"."haccp_document_versions" DO INSTEAD NOTHING;


CREATE RULE "no_delete_haccp_health_records" AS
    ON DELETE TO "public"."haccp_health_records" DO INSTEAD NOTHING;


CREATE RULE "no_delete_haccp_meatprep_log" AS
    ON DELETE TO "public"."haccp_meatprep_log" DO INSTEAD NOTHING;


CREATE RULE "no_delete_haccp_mince_log" AS
    ON DELETE TO "public"."haccp_mince_log" DO INSTEAD NOTHING;


CREATE RULE "no_delete_haccp_monthly_review" AS
    ON DELETE TO "public"."haccp_monthly_review" DO INSTEAD NOTHING;


CREATE RULE "no_delete_haccp_processing_temps" AS
    ON DELETE TO "public"."haccp_processing_temps" DO INSTEAD NOTHING;


CREATE RULE "no_delete_haccp_returns" AS
    ON DELETE TO "public"."haccp_returns" DO INSTEAD NOTHING;


CREATE RULE "no_delete_haccp_staff_training" AS
    ON DELETE TO "public"."haccp_staff_training" DO INSTEAD NOTHING;


CREATE RULE "no_delete_haccp_time_separation_log" AS
    ON DELETE TO "public"."haccp_time_separation_log" DO INSTEAD NOTHING;


CREATE RULE "no_delete_haccp_weekly_review" AS
    ON DELETE TO "public"."haccp_weekly_review" DO INSTEAD NOTHING;


CREATE RULE "no_update_haccp_allergen_training" AS
    ON UPDATE TO "public"."haccp_allergen_training" DO INSTEAD NOTHING;


CREATE RULE "no_update_haccp_calibration_log" AS
    ON UPDATE TO "public"."haccp_calibration_log" DO INSTEAD NOTHING;


CREATE RULE "no_update_haccp_cleaning_log" AS
    ON UPDATE TO "public"."haccp_cleaning_log" DO INSTEAD NOTHING;


CREATE RULE "no_update_haccp_cold_storage_temps" AS
    ON UPDATE TO "public"."haccp_cold_storage_temps" DO INSTEAD NOTHING;


CREATE RULE "no_update_haccp_daily_diary" AS
    ON UPDATE TO "public"."haccp_daily_diary" DO INSTEAD NOTHING;


CREATE RULE "no_update_haccp_deliveries" AS
    ON UPDATE TO "public"."haccp_deliveries" DO INSTEAD NOTHING;


CREATE RULE "no_update_haccp_dispatch_log" AS
    ON UPDATE TO "public"."haccp_dispatch_log" DO INSTEAD NOTHING;


CREATE RULE "no_update_haccp_document_reviews" AS
    ON UPDATE TO "public"."haccp_document_reviews" DO INSTEAD NOTHING;


CREATE RULE "no_update_haccp_document_versions" AS
    ON UPDATE TO "public"."haccp_document_versions" DO INSTEAD NOTHING;


CREATE RULE "no_update_haccp_health_records" AS
    ON UPDATE TO "public"."haccp_health_records" DO INSTEAD NOTHING;


CREATE RULE "no_update_haccp_meatprep_log" AS
    ON UPDATE TO "public"."haccp_meatprep_log" DO INSTEAD NOTHING;


CREATE RULE "no_update_haccp_mince_log" AS
    ON UPDATE TO "public"."haccp_mince_log" DO INSTEAD NOTHING;


CREATE RULE "no_update_haccp_monthly_review" AS
    ON UPDATE TO "public"."haccp_monthly_review" DO INSTEAD NOTHING;


CREATE RULE "no_update_haccp_processing_temps" AS
    ON UPDATE TO "public"."haccp_processing_temps" DO INSTEAD NOTHING;


CREATE RULE "no_update_haccp_returns" AS
    ON UPDATE TO "public"."haccp_returns" DO INSTEAD NOTHING;


CREATE RULE "no_update_haccp_staff_training" AS
    ON UPDATE TO "public"."haccp_staff_training" DO INSTEAD NOTHING;


CREATE RULE "no_update_haccp_time_separation_log" AS
    ON UPDATE TO "public"."haccp_time_separation_log" DO INSTEAD NOTHING;


CREATE RULE "no_update_haccp_weekly_review" AS
    ON UPDATE TO "public"."haccp_weekly_review" DO INSTEAD NOTHING;


CREATE OR REPLACE TRIGGER "price_agreements_updated_at" BEFORE UPDATE ON "public"."price_agreements" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();


ALTER TABLE ONLY "public"."alarm_sessions"
    ADD CONSTRAINT "alarm_sessions_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "public"."push_subscriptions"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id");


ALTER TABLE ONLY "public"."cash_entries"
    ADD CONSTRAINT "cash_entries_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");


ALTER TABLE ONLY "public"."cash_entries"
    ADD CONSTRAINT "cash_entries_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id");


ALTER TABLE ONLY "public"."cash_entries"
    ADD CONSTRAINT "cash_entries_edited_by_fkey" FOREIGN KEY ("edited_by") REFERENCES "public"."users"("id");


ALTER TABLE ONLY "public"."cash_entries"
    ADD CONSTRAINT "cash_entries_month_id_fkey" FOREIGN KEY ("month_id") REFERENCES "public"."cash_months"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."cash_months"
    ADD CONSTRAINT "cash_months_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");


ALTER TABLE ONLY "public"."cheque_records"
    ADD CONSTRAINT "cheque_records_banked_by_fkey" FOREIGN KEY ("banked_by") REFERENCES "public"."users"("id");


ALTER TABLE ONLY "public"."cheque_records"
    ADD CONSTRAINT "cheque_records_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id");


ALTER TABLE ONLY "public"."cheque_records"
    ADD CONSTRAINT "cheque_records_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "public"."users"("id");


ALTER TABLE ONLY "public"."cheque_records"
    ADD CONSTRAINT "cheque_records_logged_by_fkey" FOREIGN KEY ("logged_by") REFERENCES "public"."users"("id");


ALTER TABLE ONLY "public"."complaint_notes"
    ADD CONSTRAINT "complaint_notes_complaint_id_fkey" FOREIGN KEY ("complaint_id") REFERENCES "public"."complaints"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."complaint_notes"
    ADD CONSTRAINT "complaint_notes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."complaints"
    ADD CONSTRAINT "complaints_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id");


ALTER TABLE ONLY "public"."complaints"
    ADD CONSTRAINT "complaints_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id");


ALTER TABLE ONLY "public"."complaints"
    ADD CONSTRAINT "complaints_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id");


ALTER TABLE ONLY "public"."compliments"
    ADD CONSTRAINT "compliments_posted_by_fkey" FOREIGN KEY ("posted_by") REFERENCES "public"."users"("id");


ALTER TABLE ONLY "public"."compliments"
    ADD CONSTRAINT "compliments_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id");


ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");


ALTER TABLE ONLY "public"."discrepancies"
    ADD CONSTRAINT "discrepancies_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id");


ALTER TABLE ONLY "public"."discrepancies"
    ADD CONSTRAINT "discrepancies_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");


ALTER TABLE ONLY "public"."discrepancies"
    ADD CONSTRAINT "discrepancies_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id");


ALTER TABLE ONLY "public"."haccp_allergen_assessment"
    ADD CONSTRAINT "haccp_allergen_assessment_assessed_by_fkey" FOREIGN KEY ("assessed_by") REFERENCES "public"."users"("id");


ALTER TABLE ONLY "public"."haccp_allergen_assessment"
    ADD CONSTRAINT "haccp_allergen_assessment_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id");


ALTER TABLE ONLY "public"."haccp_allergen_monthly_reviews"
    ADD CONSTRAINT "haccp_allergen_monthly_reviews_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id");


ALTER TABLE ONLY "public"."haccp_allergen_training"
    ADD CONSTRAINT "haccp_allergen_training_logged_by_fkey" FOREIGN KEY ("logged_by") REFERENCES "public"."users"("id");


ALTER TABLE ONLY "public"."haccp_allergen_training"
    ADD CONSTRAINT "haccp_allergen_training_review_signed_by_fkey" FOREIGN KEY ("review_signed_by") REFERENCES "public"."users"("id");


ALTER TABLE ONLY "public"."haccp_allergen_training"
    ADD CONSTRAINT "haccp_allergen_training_staff_user_id_fkey" FOREIGN KEY ("staff_user_id") REFERENCES "public"."users"("id");


ALTER TABLE ONLY "public"."haccp_annual_reviews"
    ADD CONSTRAINT "haccp_annual_reviews_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id");


ALTER TABLE ONLY "public"."haccp_annual_reviews"
    ADD CONSTRAINT "haccp_annual_reviews_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");


ALTER TABLE ONLY "public"."haccp_annual_reviews"
    ADD CONSTRAINT "haccp_annual_reviews_signed_off_by_fkey" FOREIGN KEY ("signed_off_by") REFERENCES "public"."users"("id");


ALTER TABLE ONLY "public"."haccp_calibration_log"
    ADD CONSTRAINT "haccp_calibration_log_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id");


ALTER TABLE ONLY "public"."haccp_cleaning_log"
    ADD CONSTRAINT "haccp_cleaning_log_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id");


ALTER TABLE ONLY "public"."haccp_cold_storage_temps"
    ADD CONSTRAINT "haccp_cold_storage_temps_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id");


ALTER TABLE ONLY "public"."haccp_cold_storage_temps"
    ADD CONSTRAINT "haccp_cold_storage_temps_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "public"."haccp_cold_storage_units"("id");


ALTER TABLE ONLY "public"."haccp_corrective_actions"
    ADD CONSTRAINT "haccp_corrective_actions_actioned_by_fkey" FOREIGN KEY ("actioned_by") REFERENCES "public"."users"("id");


ALTER TABLE ONLY "public"."haccp_corrective_actions"
    ADD CONSTRAINT "haccp_corrective_actions_verified_by_fkey" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id");


ALTER TABLE ONLY "public"."haccp_daily_diary"
    ADD CONSTRAINT "haccp_daily_diary_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id");


ALTER TABLE ONLY "public"."haccp_deliveries"
    ADD CONSTRAINT "haccp_deliveries_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id");


ALTER TABLE ONLY "public"."haccp_deliveries"
    ADD CONSTRAINT "haccp_deliveries_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."haccp_suppliers"("id");


ALTER TABLE ONLY "public"."haccp_dispatch_log"
    ADD CONSTRAINT "haccp_dispatch_log_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id");


ALTER TABLE ONLY "public"."haccp_dispatch_log"
    ADD CONSTRAINT "haccp_dispatch_log_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id");


ALTER TABLE ONLY "public"."haccp_document_reviews"
    ADD CONSTRAINT "haccp_document_reviews_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id");


ALTER TABLE ONLY "public"."haccp_document_versions"
    ADD CONSTRAINT "haccp_document_versions_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id");


ALTER TABLE ONLY "public"."haccp_document_versions"
    ADD CONSTRAINT "haccp_document_versions_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id");


ALTER TABLE ONLY "public"."haccp_document_versions"
    ADD CONSTRAINT "haccp_document_versions_doc_ref_fkey" FOREIGN KEY ("doc_ref") REFERENCES "public"."haccp_documents"("doc_ref");


ALTER TABLE ONLY "public"."haccp_food_defence_plans"
    ADD CONSTRAINT "haccp_food_defence_plans_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id");


ALTER TABLE ONLY "public"."haccp_food_defence_plans"
    ADD CONSTRAINT "haccp_food_defence_plans_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");


ALTER TABLE ONLY "public"."haccp_food_defence_plans"
    ADD CONSTRAINT "haccp_food_defence_plans_prepared_by_fkey" FOREIGN KEY ("prepared_by") REFERENCES "public"."users"("id");


ALTER TABLE ONLY "public"."haccp_food_fraud_assessments"
    ADD CONSTRAINT "haccp_food_fraud_assessments_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id");


ALTER TABLE ONLY "public"."haccp_food_fraud_assessments"
    ADD CONSTRAINT "haccp_food_fraud_assessments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");


ALTER TABLE ONLY "public"."haccp_food_fraud_assessments"
    ADD CONSTRAINT "haccp_food_fraud_assessments_prepared_by_fkey" FOREIGN KEY ("prepared_by") REFERENCES "public"."users"("id");


ALTER TABLE ONLY "public"."haccp_health_records"
    ADD CONSTRAINT "haccp_health_records_manager_signed_by_fkey" FOREIGN KEY ("manager_signed_by") REFERENCES "public"."users"("id");


ALTER TABLE ONLY "public"."haccp_health_records"
    ADD CONSTRAINT "haccp_health_records_staff_user_id_fkey" FOREIGN KEY ("staff_user_id") REFERENCES "public"."users"("id");


ALTER TABLE ONLY "public"."haccp_health_records"
    ADD CONSTRAINT "haccp_health_records_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id");


ALTER TABLE ONLY "public"."haccp_meatprep_log"
    ADD CONSTRAINT "haccp_meatprep_log_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id");


ALTER TABLE ONLY "public"."haccp_mince_log"
    ADD CONSTRAINT "haccp_mince_log_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id");


ALTER TABLE ONLY "public"."haccp_monthly_review"
    ADD CONSTRAINT "haccp_monthly_review_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id");


ALTER TABLE ONLY "public"."haccp_processing_temps"
    ADD CONSTRAINT "haccp_processing_temps_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id");


ALTER TABLE ONLY "public"."haccp_product_specs"
    ADD CONSTRAINT "haccp_product_specs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");


ALTER TABLE ONLY "public"."haccp_product_specs"
    ADD CONSTRAINT "haccp_product_specs_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id");


ALTER TABLE ONLY "public"."haccp_recall_config"
    ADD CONSTRAINT "haccp_recall_config_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id");


ALTER TABLE ONLY "public"."haccp_returns"
    ADD CONSTRAINT "haccp_returns_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id");


ALTER TABLE ONLY "public"."haccp_returns"
    ADD CONSTRAINT "haccp_returns_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id");


ALTER TABLE ONLY "public"."haccp_staff_training"
    ADD CONSTRAINT "haccp_staff_training_logged_by_fkey" FOREIGN KEY ("logged_by") REFERENCES "public"."users"("id");


ALTER TABLE ONLY "public"."haccp_staff_training"
    ADD CONSTRAINT "haccp_staff_training_staff_user_id_fkey" FOREIGN KEY ("staff_user_id") REFERENCES "public"."users"("id");


ALTER TABLE ONLY "public"."haccp_staff_training"
    ADD CONSTRAINT "haccp_staff_training_supervisor_signed_by_fkey" FOREIGN KEY ("supervisor_signed_by") REFERENCES "public"."users"("id");


ALTER TABLE ONLY "public"."haccp_time_separation_log"
    ADD CONSTRAINT "haccp_time_separation_log_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id");


ALTER TABLE ONLY "public"."haccp_weekly_review"
    ADD CONSTRAINT "haccp_weekly_review_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id");


ALTER TABLE ONLY "public"."price_agreement_lines"
    ADD CONSTRAINT "price_agreement_lines_agreement_id_fkey" FOREIGN KEY ("agreement_id") REFERENCES "public"."price_agreements"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."price_agreement_lines"
    ADD CONSTRAINT "price_agreement_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."price_agreements"
    ADD CONSTRAINT "price_agreements_agreed_by_fkey" FOREIGN KEY ("agreed_by") REFERENCES "public"."users"("id");


ALTER TABLE ONLY "public"."price_agreements"
    ADD CONSTRAINT "price_agreements_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");


ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."route_stops"
    ADD CONSTRAINT "route_stops_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE RESTRICT;


ALTER TABLE ONLY "public"."route_stops"
    ADD CONSTRAINT "route_stops_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "public"."routes"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."routes"
    ADD CONSTRAINT "routes_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."routes"
    ADD CONSTRAINT "routes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."visit_notes"
    ADD CONSTRAINT "visit_notes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."visit_notes"
    ADD CONSTRAINT "visit_notes_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "public"."visits"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."visits"
    ADD CONSTRAINT "visits_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id");


ALTER TABLE ONLY "public"."visits"
    ADD CONSTRAINT "visits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id");


ALTER TABLE "public"."alarm_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."audit_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "audit_log_insert" ON "public"."audit_log" FOR INSERT WITH CHECK (("user_id" = ("current_setting"('app.current_user_id'::"text", true))::"uuid"));


CREATE POLICY "audit_log_select" ON "public"."audit_log" FOR SELECT USING ("public"."is_admin"());


ALTER TABLE "public"."complaints" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "complaints_insert" ON "public"."complaints" FOR INSERT WITH CHECK (("user_id" = ("current_setting"('app.current_user_id'::"text", true))::"uuid"));


CREATE POLICY "complaints_select" ON "public"."complaints" FOR SELECT USING ((("user_id" = ("current_setting"('app.current_user_id'::"text", true))::"uuid") OR "public"."is_admin"()));


CREATE POLICY "complaints_update" ON "public"."complaints" FOR UPDATE USING ((("user_id" = ("current_setting"('app.current_user_id'::"text", true))::"uuid") OR "public"."is_admin"()));


ALTER TABLE "public"."customers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "customers_delete" ON "public"."customers" FOR DELETE USING ("public"."is_admin"());


CREATE POLICY "customers_insert" ON "public"."customers" FOR INSERT WITH CHECK ("public"."is_admin"());


CREATE POLICY "customers_select" ON "public"."customers" FOR SELECT USING ((("current_setting"('app.current_user_id'::"text", true) IS NOT NULL) AND ("current_setting"('app.current_user_id'::"text", true) <> ''::"text")));


CREATE POLICY "customers_update" ON "public"."customers" FOR UPDATE USING ("public"."is_admin"());


ALTER TABLE "public"."discrepancies" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "discrepancies_insert" ON "public"."discrepancies" FOR INSERT WITH CHECK (("user_id" = ("current_setting"('app.current_user_id'::"text", true))::"uuid"));


CREATE POLICY "discrepancies_select" ON "public"."discrepancies" FOR SELECT USING ((("user_id" = ("current_setting"('app.current_user_id'::"text", true))::"uuid") OR "public"."is_admin"()));


ALTER TABLE "public"."products" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "products_insert" ON "public"."products" FOR INSERT WITH CHECK ("public"."is_admin"());


CREATE POLICY "products_select" ON "public"."products" FOR SELECT USING ((("current_setting"('app.current_user_id'::"text", true) IS NOT NULL) AND ("current_setting"('app.current_user_id'::"text", true) <> ''::"text")));


CREATE POLICY "products_update" ON "public"."products" FOR UPDATE USING ("public"."is_admin"());


ALTER TABLE "public"."push_subscriptions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "service role only for alarm_sessions" ON "public"."alarm_sessions" USING (("auth"."role"() = 'service_role'::"text"));


ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "users manage own subscriptions" ON "public"."push_subscriptions" USING (("user_id" = "auth"."uid"()));


CREATE POLICY "users_select" ON "public"."users" FOR SELECT USING ((("id" = ("current_setting"('app.current_user_id'::"text", true))::"uuid") OR "public"."is_admin"()));


ALTER TABLE "public"."visits" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "visits_delete" ON "public"."visits" FOR DELETE USING ((("user_id" = ("current_setting"('app.current_user_id'::"text", true))::"uuid") OR "public"."is_admin"()));


CREATE POLICY "visits_insert" ON "public"."visits" FOR INSERT WITH CHECK (("user_id" = ("current_setting"('app.current_user_id'::"text", true))::"uuid"));


CREATE POLICY "visits_select" ON "public"."visits" FOR SELECT USING ((("user_id" = ("current_setting"('app.current_user_id'::"text", true))::"uuid") OR "public"."is_admin"()));


CREATE POLICY "visits_update" ON "public"."visits" FOR UPDATE USING ((("user_id" = ("current_setting"('app.current_user_id'::"text", true))::"uuid") OR "public"."is_admin"()));


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";


GRANT ALL ON FUNCTION "public"."haccp_search"("query" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."haccp_search"("query" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."haccp_search"("query" "text") TO "service_role";


GRANT ALL ON FUNCTION "public"."is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";


GRANT ALL ON FUNCTION "public"."replace_agreement_lines"("p_agreement_id" "uuid", "p_lines" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."replace_agreement_lines"("p_agreement_id" "uuid", "p_lines" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."replace_agreement_lines"("p_agreement_id" "uuid", "p_lines" "jsonb") TO "service_role";


GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";


GRANT ALL ON SEQUENCE "public"."agreement_ref_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."agreement_ref_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."agreement_ref_seq" TO "service_role";


GRANT ALL ON TABLE "public"."alarm_sessions" TO "anon";
GRANT ALL ON TABLE "public"."alarm_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."alarm_sessions" TO "service_role";


GRANT ALL ON TABLE "public"."audit_log" TO "anon";
GRANT ALL ON TABLE "public"."audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_log" TO "service_role";


GRANT ALL ON TABLE "public"."cash_entries" TO "anon";
GRANT ALL ON TABLE "public"."cash_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."cash_entries" TO "service_role";


GRANT ALL ON TABLE "public"."cash_months" TO "anon";
GRANT ALL ON TABLE "public"."cash_months" TO "authenticated";
GRANT ALL ON TABLE "public"."cash_months" TO "service_role";


GRANT ALL ON TABLE "public"."cheque_records" TO "anon";
GRANT ALL ON TABLE "public"."cheque_records" TO "authenticated";
GRANT ALL ON TABLE "public"."cheque_records" TO "service_role";


GRANT ALL ON TABLE "public"."complaint_notes" TO "anon";
GRANT ALL ON TABLE "public"."complaint_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."complaint_notes" TO "service_role";


GRANT ALL ON TABLE "public"."complaints" TO "anon";
GRANT ALL ON TABLE "public"."complaints" TO "authenticated";
GRANT ALL ON TABLE "public"."complaints" TO "service_role";


GRANT ALL ON TABLE "public"."compliments" TO "anon";
GRANT ALL ON TABLE "public"."compliments" TO "authenticated";
GRANT ALL ON TABLE "public"."compliments" TO "service_role";


GRANT ALL ON TABLE "public"."customer_road_times" TO "anon";
GRANT ALL ON TABLE "public"."customer_road_times" TO "authenticated";
GRANT ALL ON TABLE "public"."customer_road_times" TO "service_role";


GRANT ALL ON TABLE "public"."customers" TO "anon";
GRANT ALL ON TABLE "public"."customers" TO "authenticated";
GRANT ALL ON TABLE "public"."customers" TO "service_role";


GRANT ALL ON TABLE "public"."discrepancies" TO "anon";
GRANT ALL ON TABLE "public"."discrepancies" TO "authenticated";
GRANT ALL ON TABLE "public"."discrepancies" TO "service_role";


GRANT ALL ON TABLE "public"."haccp_allergen_assessment" TO "anon";
GRANT ALL ON TABLE "public"."haccp_allergen_assessment" TO "authenticated";
GRANT ALL ON TABLE "public"."haccp_allergen_assessment" TO "service_role";


GRANT ALL ON TABLE "public"."haccp_allergen_monthly_reviews" TO "anon";
GRANT ALL ON TABLE "public"."haccp_allergen_monthly_reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."haccp_allergen_monthly_reviews" TO "service_role";


GRANT ALL ON TABLE "public"."haccp_allergen_training" TO "anon";
GRANT ALL ON TABLE "public"."haccp_allergen_training" TO "authenticated";
GRANT ALL ON TABLE "public"."haccp_allergen_training" TO "service_role";


GRANT ALL ON TABLE "public"."haccp_annual_reviews" TO "anon";
GRANT ALL ON TABLE "public"."haccp_annual_reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."haccp_annual_reviews" TO "service_role";


GRANT ALL ON TABLE "public"."haccp_calibration_log" TO "anon";
GRANT ALL ON TABLE "public"."haccp_calibration_log" TO "authenticated";
GRANT ALL ON TABLE "public"."haccp_calibration_log" TO "service_role";


GRANT ALL ON TABLE "public"."haccp_cleaning_log" TO "anon";
GRANT ALL ON TABLE "public"."haccp_cleaning_log" TO "authenticated";
GRANT ALL ON TABLE "public"."haccp_cleaning_log" TO "service_role";


GRANT ALL ON TABLE "public"."haccp_cold_storage_temps" TO "anon";
GRANT ALL ON TABLE "public"."haccp_cold_storage_temps" TO "authenticated";
GRANT ALL ON TABLE "public"."haccp_cold_storage_temps" TO "service_role";


GRANT ALL ON TABLE "public"."haccp_cold_storage_units" TO "anon";
GRANT ALL ON TABLE "public"."haccp_cold_storage_units" TO "authenticated";
GRANT ALL ON TABLE "public"."haccp_cold_storage_units" TO "service_role";


GRANT ALL ON TABLE "public"."haccp_corrective_actions" TO "anon";
GRANT ALL ON TABLE "public"."haccp_corrective_actions" TO "authenticated";
GRANT ALL ON TABLE "public"."haccp_corrective_actions" TO "service_role";


GRANT ALL ON TABLE "public"."haccp_daily_diary" TO "anon";
GRANT ALL ON TABLE "public"."haccp_daily_diary" TO "authenticated";
GRANT ALL ON TABLE "public"."haccp_daily_diary" TO "service_role";


GRANT ALL ON TABLE "public"."haccp_deliveries" TO "anon";
GRANT ALL ON TABLE "public"."haccp_deliveries" TO "authenticated";
GRANT ALL ON TABLE "public"."haccp_deliveries" TO "service_role";


GRANT ALL ON TABLE "public"."haccp_dispatch_log" TO "anon";
GRANT ALL ON TABLE "public"."haccp_dispatch_log" TO "authenticated";
GRANT ALL ON TABLE "public"."haccp_dispatch_log" TO "service_role";


GRANT ALL ON TABLE "public"."haccp_document_reviews" TO "anon";
GRANT ALL ON TABLE "public"."haccp_document_reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."haccp_document_reviews" TO "service_role";


GRANT ALL ON TABLE "public"."haccp_document_versions" TO "anon";
GRANT ALL ON TABLE "public"."haccp_document_versions" TO "authenticated";
GRANT ALL ON TABLE "public"."haccp_document_versions" TO "service_role";


GRANT ALL ON TABLE "public"."haccp_documents" TO "anon";
GRANT ALL ON TABLE "public"."haccp_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."haccp_documents" TO "service_role";


GRANT ALL ON TABLE "public"."haccp_food_defence_plans" TO "anon";
GRANT ALL ON TABLE "public"."haccp_food_defence_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."haccp_food_defence_plans" TO "service_role";


GRANT ALL ON TABLE "public"."haccp_food_fraud_assessments" TO "anon";
GRANT ALL ON TABLE "public"."haccp_food_fraud_assessments" TO "authenticated";
GRANT ALL ON TABLE "public"."haccp_food_fraud_assessments" TO "service_role";


GRANT ALL ON TABLE "public"."haccp_health_records" TO "anon";
GRANT ALL ON TABLE "public"."haccp_health_records" TO "authenticated";
GRANT ALL ON TABLE "public"."haccp_health_records" TO "service_role";


GRANT ALL ON TABLE "public"."haccp_meatprep_log" TO "anon";
GRANT ALL ON TABLE "public"."haccp_meatprep_log" TO "authenticated";
GRANT ALL ON TABLE "public"."haccp_meatprep_log" TO "service_role";


GRANT ALL ON TABLE "public"."haccp_mince_log" TO "anon";
GRANT ALL ON TABLE "public"."haccp_mince_log" TO "authenticated";
GRANT ALL ON TABLE "public"."haccp_mince_log" TO "service_role";


GRANT ALL ON TABLE "public"."haccp_monthly_review" TO "anon";
GRANT ALL ON TABLE "public"."haccp_monthly_review" TO "authenticated";
GRANT ALL ON TABLE "public"."haccp_monthly_review" TO "service_role";


GRANT ALL ON TABLE "public"."haccp_processing_temps" TO "anon";
GRANT ALL ON TABLE "public"."haccp_processing_temps" TO "authenticated";
GRANT ALL ON TABLE "public"."haccp_processing_temps" TO "service_role";


GRANT ALL ON TABLE "public"."haccp_product_specs" TO "anon";
GRANT ALL ON TABLE "public"."haccp_product_specs" TO "authenticated";
GRANT ALL ON TABLE "public"."haccp_product_specs" TO "service_role";


GRANT ALL ON TABLE "public"."haccp_recall_config" TO "anon";
GRANT ALL ON TABLE "public"."haccp_recall_config" TO "authenticated";
GRANT ALL ON TABLE "public"."haccp_recall_config" TO "service_role";


GRANT ALL ON TABLE "public"."haccp_returns" TO "anon";
GRANT ALL ON TABLE "public"."haccp_returns" TO "authenticated";
GRANT ALL ON TABLE "public"."haccp_returns" TO "service_role";


GRANT ALL ON TABLE "public"."haccp_sop_content" TO "anon";
GRANT ALL ON TABLE "public"."haccp_sop_content" TO "authenticated";
GRANT ALL ON TABLE "public"."haccp_sop_content" TO "service_role";


GRANT ALL ON TABLE "public"."haccp_staff_training" TO "anon";
GRANT ALL ON TABLE "public"."haccp_staff_training" TO "authenticated";
GRANT ALL ON TABLE "public"."haccp_staff_training" TO "service_role";


GRANT ALL ON TABLE "public"."haccp_suppliers" TO "anon";
GRANT ALL ON TABLE "public"."haccp_suppliers" TO "authenticated";
GRANT ALL ON TABLE "public"."haccp_suppliers" TO "service_role";


GRANT ALL ON TABLE "public"."haccp_time_separation_log" TO "anon";
GRANT ALL ON TABLE "public"."haccp_time_separation_log" TO "authenticated";
GRANT ALL ON TABLE "public"."haccp_time_separation_log" TO "service_role";


GRANT ALL ON TABLE "public"."haccp_weekly_review" TO "anon";
GRANT ALL ON TABLE "public"."haccp_weekly_review" TO "authenticated";
GRANT ALL ON TABLE "public"."haccp_weekly_review" TO "service_role";


GRANT ALL ON TABLE "public"."hub_sentinels" TO "anon";
GRANT ALL ON TABLE "public"."hub_sentinels" TO "authenticated";
GRANT ALL ON TABLE "public"."hub_sentinels" TO "service_role";


GRANT ALL ON TABLE "public"."price_agreement_lines" TO "anon";
GRANT ALL ON TABLE "public"."price_agreement_lines" TO "authenticated";
GRANT ALL ON TABLE "public"."price_agreement_lines" TO "service_role";


GRANT ALL ON TABLE "public"."price_agreements" TO "anon";
GRANT ALL ON TABLE "public"."price_agreements" TO "authenticated";
GRANT ALL ON TABLE "public"."price_agreements" TO "service_role";


GRANT ALL ON TABLE "public"."products" TO "anon";
GRANT ALL ON TABLE "public"."products" TO "authenticated";
GRANT ALL ON TABLE "public"."products" TO "service_role";


GRANT ALL ON TABLE "public"."push_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "service_role";


GRANT ALL ON TABLE "public"."route_stops" TO "anon";
GRANT ALL ON TABLE "public"."route_stops" TO "authenticated";
GRANT ALL ON TABLE "public"."route_stops" TO "service_role";


GRANT ALL ON TABLE "public"."routes" TO "anon";
GRANT ALL ON TABLE "public"."routes" TO "authenticated";
GRANT ALL ON TABLE "public"."routes" TO "service_role";


GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";


GRANT ALL ON TABLE "public"."visit_notes" TO "anon";
GRANT ALL ON TABLE "public"."visit_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."visit_notes" TO "service_role";


GRANT ALL ON TABLE "public"."visits" TO "anon";
GRANT ALL ON TABLE "public"."visits" TO "authenticated";
GRANT ALL ON TABLE "public"."visits" TO "service_role";


ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";


ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";


ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
