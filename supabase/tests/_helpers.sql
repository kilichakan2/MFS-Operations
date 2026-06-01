-- ============================================================
-- pgTAP shared helpers for order-pipeline tests
-- ============================================================
--
-- Source from each test file at the top:
--   \i supabase/tests/_helpers.sql
--
-- Provides reusable test users + customer + product for the
-- order-pipeline RLS / schema tests.
--
-- All helpers create their data inside the current transaction
-- and rely on BEGIN ... ROLLBACK to clean up. Never commit.
-- ============================================================

CREATE OR REPLACE FUNCTION test_helper_make_user(p_name text, p_role user_role)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_id uuid;
BEGIN
  -- users_auth_check: admin => password_hash NOT NULL, otherwise pin_hash NOT NULL.
  INSERT INTO users (name, role, active, pin_hash, password_hash)
  VALUES (
    p_name, p_role, true,
    CASE WHEN p_role = 'admin' THEN NULL
         ELSE '$2a$10$ANVILTESTPLACEHOLDERHASHFORTESTSXXXXXXXXXXXXXXXXX' END,
    CASE WHEN p_role = 'admin' THEN '$2a$10$ANVILTESTPLACEHOLDERHASHFORTESTSXXXXXXXXXXXXXXXXX'
         ELSE NULL END
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION test_helper_make_customer(p_name text DEFAULT 'Test Customer')
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO customers (name, active)
  VALUES (p_name, true)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION test_helper_make_product(p_name text DEFAULT 'Test Product', p_code text DEFAULT 'TEST-001')
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO products (name, code, active)
  VALUES (p_name, p_code, true)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION test_helper_make_order(
  p_customer uuid, p_creator uuid, p_state order_state DEFAULT 'placed'
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO orders (
    customer_id, delivery_date, created_by, state,
    printed_at, printed_by, completed_at
  )
  VALUES (
    p_customer, CURRENT_DATE + 1, p_creator, p_state,
    CASE WHEN p_state IN ('printed', 'completed') THEN now()       ELSE NULL END,
    CASE WHEN p_state IN ('printed', 'completed') THEN p_creator   ELSE NULL END,
    CASE WHEN p_state = 'completed'               THEN now()       ELSE NULL END
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- Impersonate a role for RLS testing by SETting app.current_user_id and
-- the connecting role's GUC so policies that check current_setting
-- see the test user.
CREATE OR REPLACE FUNCTION test_helper_set_user(p_user_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('app.current_user_id', p_user_id::text, true);  -- transaction-local
END $$;
