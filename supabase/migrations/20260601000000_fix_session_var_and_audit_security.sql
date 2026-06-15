-- ============================================================
-- Align order-pipeline session variable + harden audit triggers
-- ============================================================
--
-- Two production bugs caught by ANVIL pgTAP layer on 2026-06-01,
-- both invisible in production because the API uses the service
-- role key which bypasses RLS entirely. Surfaced as soon as any
-- non-service-role caller (anon-key client, RLS test) touches the
-- order-pipeline tables.
--
-- BUG 1 — Session variable mismatch
-- The original migration (20260530_001_...) used `app.user_id`
-- as the session variable for "who is acting" checks. The rest
-- of production uses `app.current_user_id` everywhere
-- (users_select policy, is_admin() function, every other RLS
-- policy). When my policy's EXISTS subquery hits users, that
-- table's own RLS keyed off app.current_user_id finds nothing
-- and the policy denies. Also: the audit trigger read
-- app.user_id, which the API never sets — so every audit row
-- had user_id = NULL.
--
-- BUG 2 — Audit triggers run without SECURITY DEFINER
-- The orders_audit and order_lines_audit triggers INSERT into
-- order_audit_log, which has a WITH CHECK (false) policy
-- (intentionally — direct inserts are blocked; the audit log is
-- supposed to be append-only via trigger). But without
-- SECURITY DEFINER, the trigger function runs with the caller's
-- privileges. A non-admin caller hits WITH CHECK (false) and the
-- whole transaction rolls back. Triggers writing to RLS-locked
-- tables MUST be SECURITY DEFINER.
--
-- Fix: drop and recreate the 10 policies + 2 trigger functions
-- with corrected variable name AND SECURITY DEFINER attribute.
-- ADDITIVE — no DROP TABLE, DROP COLUMN, ALTER TYPE, or data
-- changes. PITR not required.
-- ============================================================

CREATE OR REPLACE FUNCTION orders_audit_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_action  order_audit_action;
BEGIN
  BEGIN
    v_user_id := nullif(current_setting('app.current_user_id', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  IF TG_OP = 'INSERT' THEN
    v_action := 'created';
    INSERT INTO order_audit_log (order_id, user_id, action, payload)
    VALUES (NEW.id, v_user_id, v_action, to_jsonb(NEW));
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.state IS DISTINCT FROM OLD.state THEN
      v_action := CASE NEW.state
        WHEN 'printed'   THEN 'printed'::order_audit_action
        WHEN 'completed' THEN 'completed'::order_audit_action
        ELSE 'edited'::order_audit_action
      END;
    ELSIF NEW.state = 'printed' AND NEW.printed_at IS DISTINCT FROM OLD.printed_at THEN
      v_action := 'reprinted';
    ELSE
      v_action := 'edited';
    END IF;

    INSERT INTO order_audit_log (order_id, user_id, action, payload)
    VALUES (NEW.id, v_user_id, v_action, jsonb_build_object(
      'before', to_jsonb(OLD),
      'after',  to_jsonb(NEW)
    ));
    RETURN NEW;
  END IF;

  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION order_lines_audit_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_action  order_audit_action;
BEGIN
  BEGIN
    v_user_id := nullif(current_setting('app.current_user_id', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  IF TG_OP = 'INSERT' THEN
    v_action := 'line_added';
    INSERT INTO order_audit_log (order_id, user_id, action, payload)
    VALUES (NEW.order_id, v_user_id, v_action, to_jsonb(NEW));
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.done_at IS NULL AND NEW.done_at IS NOT NULL THEN
      v_action := 'line_done';
    ELSE
      v_action := 'line_edited';
    END IF;

    INSERT INTO order_audit_log (order_id, user_id, action, payload)
    VALUES (NEW.order_id, v_user_id, v_action, jsonb_build_object(
      'before', to_jsonb(OLD),
      'after',  to_jsonb(NEW)
    ));
    RETURN NEW;
  END IF;

  RETURN NEW;
END $$;

-- ─── RLS POLICIES — drop + recreate with new variable name ────

DROP POLICY IF EXISTS orders_read           ON orders;
DROP POLICY IF EXISTS orders_insert         ON orders;
DROP POLICY IF EXISTS orders_update_placed  ON orders;
DROP POLICY IF EXISTS orders_update_printed ON orders;

CREATE POLICY orders_read ON orders
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = nullif(current_setting('app.current_user_id', true), '')::uuid
        AND u.role IN ('admin', 'sales', 'office', 'warehouse', 'butcher')
    )
  );

CREATE POLICY orders_insert ON orders
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = nullif(current_setting('app.current_user_id', true), '')::uuid
        AND u.role IN ('admin', 'sales', 'office')
    )
  );

CREATE POLICY orders_update_placed ON orders
  FOR UPDATE
  USING (
    state = 'placed' AND EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = nullif(current_setting('app.current_user_id', true), '')::uuid
        AND u.role IN ('admin', 'sales', 'office')
    )
  );

CREATE POLICY orders_update_printed ON orders
  FOR UPDATE
  USING (
    state IN ('printed', 'completed') AND EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = nullif(current_setting('app.current_user_id', true), '')::uuid
        AND u.role IN ('admin', 'office', 'warehouse')
    )
  );

DROP POLICY IF EXISTS order_lines_read         ON order_lines;
DROP POLICY IF EXISTS order_lines_insert       ON order_lines;
DROP POLICY IF EXISTS order_lines_update_full  ON order_lines;
DROP POLICY IF EXISTS order_lines_update_done  ON order_lines;

CREATE POLICY order_lines_read ON order_lines
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = nullif(current_setting('app.current_user_id', true), '')::uuid
        AND u.role IN ('admin', 'sales', 'office', 'warehouse', 'butcher')
    )
  );

CREATE POLICY order_lines_insert ON order_lines
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = nullif(current_setting('app.current_user_id', true), '')::uuid
        AND u.role IN ('admin', 'sales', 'office')
    )
  );

CREATE POLICY order_lines_update_full ON order_lines
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = nullif(current_setting('app.current_user_id', true), '')::uuid
        AND u.role IN ('admin', 'sales', 'office')
    )
  );

CREATE POLICY order_lines_update_done ON order_lines
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = nullif(current_setting('app.current_user_id', true), '')::uuid
        AND u.role = 'butcher'
    )
  );

DROP POLICY IF EXISTS order_audit_log_read   ON order_audit_log;
DROP POLICY IF EXISTS order_audit_log_insert ON order_audit_log;

CREATE POLICY order_audit_log_read ON order_audit_log
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = nullif(current_setting('app.current_user_id', true), '')::uuid
        AND u.role IN ('admin', 'office')
    )
  );

CREATE POLICY order_audit_log_insert ON order_audit_log
  FOR INSERT
  WITH CHECK (false);
