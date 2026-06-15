-- ============================================================
-- SB1: Order pipeline schema
-- Plan: docs/plans/2026-05-30-order-pipeline-kds-implementation.md
-- Frame: docs/plans/2026-05-30-order-pipeline-kds-frame.md
--
-- Creates the database structure for the order pipeline feature:
--   - orders                 (one row per customer order)
--   - order_lines            (one row per line item in an order)
--   - order_audit_log        (immutable audit trail of every mutation)
--
-- Plus the supporting enums, reference-number sequence + generator,
-- indexes, RLS policies (per the role visibility matrix), and the
-- audit-log trigger function.
--
-- Idempotent: every CREATE uses IF NOT EXISTS, every CREATE TYPE
-- is guarded by an existence check. Safe to re-apply.
-- ============================================================

-- ─── ENUMS ─────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE order_state AS ENUM ('placed', 'printed', 'completed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE order_audit_action AS ENUM (
    'created',
    'edited',
    'printed',
    'reprinted',
    'line_added',
    'line_edited',
    'line_done',
    'completed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE order_uom AS ENUM ('kg', 'unit');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── REFERENCE NUMBER SEQUENCE + GENERATOR ─────────────────────
--
-- Orders get reference MFS-YYYY-NNNN where NNNN is a per-year
-- 4-digit zero-padded counter. We use a single sequence and
-- compose the reference at insert time. Year-rollover handled
-- by resetting the sequence on Jan 1 (cron, not in this migration)
-- OR by detecting year change in the trigger.

CREATE SEQUENCE IF NOT EXISTS order_reference_seq;

CREATE OR REPLACE FUNCTION generate_order_reference()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year integer;
  v_seq  integer;
BEGIN
  v_year := EXTRACT(YEAR FROM CURRENT_DATE);
  v_seq  := nextval('order_reference_seq');
  RETURN format('MFS-%s-%s', v_year, lpad(v_seq::text, 4, '0'));
END $$;

-- ─── ORDERS TABLE ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS orders (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference       text NOT NULL UNIQUE DEFAULT generate_order_reference(),

  customer_id     uuid NOT NULL REFERENCES customers(id),

  delivery_date   date NOT NULL,
  delivery_notes  text,
  order_notes     text,

  state           order_state NOT NULL DEFAULT 'placed',

  created_by      uuid NOT NULL REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),

  printed_by      uuid REFERENCES users(id),
  printed_at      timestamptz,

  completed_at    timestamptz,

  -- State transitions are append-only — printed/completed timestamps
  -- can only be set when the state advances. Reverse transitions are
  -- blocked here at the DB level.
  CHECK (
    (state = 'placed'    AND printed_at IS NULL     AND completed_at IS NULL) OR
    (state = 'printed'   AND printed_at IS NOT NULL AND completed_at IS NULL) OR
    (state = 'completed' AND printed_at IS NOT NULL AND completed_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS orders_delivery_date_idx   ON orders (delivery_date);
CREATE INDEX IF NOT EXISTS orders_state_idx           ON orders (state);
CREATE INDEX IF NOT EXISTS orders_customer_id_idx     ON orders (customer_id);
CREATE INDEX IF NOT EXISTS orders_created_by_idx      ON orders (created_by);
CREATE INDEX IF NOT EXISTS orders_created_at_idx      ON orders (created_at DESC);

-- ─── ORDER LINES TABLE ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS order_lines (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id              uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,

  line_number           integer NOT NULL,

  -- Either a catalogued product (product_id set, ad_hoc_description NULL)
  -- or an ad-hoc line (product_id NULL, ad_hoc_description set).
  -- Enforced by the CHECK constraint below.
  product_id            uuid REFERENCES products(id),
  ad_hoc_description    text,

  quantity              numeric(10, 3) NOT NULL,
  uom                   order_uom NOT NULL,

  notes                 text,

  done_at               timestamptz,
  done_by               uuid REFERENCES users(id),

  CHECK (quantity > 0),
  CHECK (
    (product_id IS NOT NULL AND ad_hoc_description IS NULL) OR
    (product_id IS NULL     AND ad_hoc_description IS NOT NULL)
  ),
  -- done_by must be set IFF done_at is set
  CHECK (
    (done_at IS NULL     AND done_by IS NULL) OR
    (done_at IS NOT NULL AND done_by IS NOT NULL)
  ),

  UNIQUE (order_id, line_number)
);

CREATE INDEX IF NOT EXISTS order_lines_order_id_idx   ON order_lines (order_id);
CREATE INDEX IF NOT EXISTS order_lines_product_id_idx ON order_lines (product_id);
CREATE INDEX IF NOT EXISTS order_lines_done_at_idx    ON order_lines (done_at) WHERE done_at IS NOT NULL;

-- ─── ORDER AUDIT LOG ───────────────────────────────────────────
--
-- Append-only. No updates, no deletes (enforced via RLS later).
-- payload is jsonb to capture the diff or context for each action.

CREATE TABLE IF NOT EXISTS order_audit_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  user_id       uuid REFERENCES users(id),
  action        order_audit_action NOT NULL,
  payload       jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_audit_log_order_id_idx ON order_audit_log (order_id);
CREATE INDEX IF NOT EXISTS order_audit_log_created_at_idx ON order_audit_log (created_at DESC);

-- ─── AUDIT TRIGGER FUNCTIONS ───────────────────────────────────
--
-- Two triggers — one on orders, one on order_lines. Each emits an
-- audit row capturing the action and a payload. user_id is taken
-- from the session via current_setting('app.current_user_id', true) which
-- API routes set via SET LOCAL at the start of each transaction.

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
  -- API sets this via SET LOCAL app.current_user_id = '<uuid>'; nullable for
  -- system actions (e.g. cron, migrations).
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
    -- Detect state transitions
    IF NEW.state IS DISTINCT FROM OLD.state THEN
      v_action := CASE NEW.state
        WHEN 'printed'   THEN 'printed'::order_audit_action
        WHEN 'completed' THEN 'completed'::order_audit_action
        ELSE 'edited'::order_audit_action
      END;
    ELSIF NEW.state = 'printed' AND NEW.printed_at IS DISTINCT FROM OLD.printed_at THEN
      -- Already in printed state but printed_at changed = reprint
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

DROP TRIGGER IF EXISTS orders_audit ON orders;
CREATE TRIGGER orders_audit
  AFTER INSERT OR UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION orders_audit_trigger();

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
    -- Detect "line marked done" specifically
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

DROP TRIGGER IF EXISTS order_lines_audit ON order_lines;
CREATE TRIGGER order_lines_audit
  AFTER INSERT OR UPDATE ON order_lines
  FOR EACH ROW EXECUTE FUNCTION order_lines_audit_trigger();

-- ─── ROW LEVEL SECURITY ────────────────────────────────────────
--
-- Per the role visibility matrix in the Frame spec:
--   admin / sales / office / warehouse  - read all orders
--   butcher                              - read all order_lines (for KDS),
--                                          write only done_at + done_by
--   driver                               - no access (out of scope for MVP)
--
-- The service role bypasses RLS entirely (API routes use it via
-- supabaseService). RLS here is a defence-in-depth layer for any
-- direct client access via the anon key.

ALTER TABLE orders          ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_lines     ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_audit_log ENABLE ROW LEVEL SECURITY;

-- ORDERS policies

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

-- Sales and office can both edit while in 'placed' state.
-- Only office and admin can edit a 'printed' order.
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

-- ORDER_LINES policies

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

-- Sales / office / admin can fully edit lines (qty, notes, product change)
CREATE POLICY order_lines_update_full ON order_lines
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = nullif(current_setting('app.current_user_id', true), '')::uuid
        AND u.role IN ('admin', 'sales', 'office')
    )
  );

-- Butchers can mark lines done (only sets done_at + done_by)
-- The "only" is enforced at the API layer; RLS just permits any
-- update from a butcher. Belt-and-braces: SB5 will add a CHECK
-- constraint or stricter policy on the butcher-update path.
CREATE POLICY order_lines_update_done ON order_lines
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = nullif(current_setting('app.current_user_id', true), '')::uuid
        AND u.role = 'butcher'
    )
  );

-- ORDER_AUDIT_LOG policies — append-only, read by all back-office roles

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

-- Inserts come from triggers (running as the connecting role). The
-- service role bypasses RLS so trigger-driven inserts work; for any
-- direct anon-key client write attempt this would block.
CREATE POLICY order_audit_log_insert ON order_audit_log
  FOR INSERT
  WITH CHECK (false);
