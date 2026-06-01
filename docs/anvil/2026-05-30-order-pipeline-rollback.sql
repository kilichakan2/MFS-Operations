-- ============================================================
-- ROLLBACK: 20260530_001_order_pipeline_schema.sql
-- ============================================================
--
-- This migration is fully ADDITIVE (CREATE TYPE / CREATE TABLE /
-- CREATE INDEX / CREATE POLICY only). Running this rollback
-- removes the new schema but does NOT touch any pre-existing
-- objects on the production database.
--
-- Safe to run AS LONG AS you accept that all order data created
-- via the new feature will be lost. If you need to preserve the
-- data, take a backup of orders / order_lines / order_audit_log
-- before running this script.
--
-- PITR is NOT required for this rollback — the migration is
-- additive and the rollback is reverse-additive. There's no
-- "alter column type" or "drop column" type operation that would
-- corrupt existing data on any other table.
--
-- ============================================================

-- ─── Triggers first (depend on functions + tables) ─────────────

DROP TRIGGER IF EXISTS order_lines_audit ON order_lines;
DROP TRIGGER IF EXISTS orders_audit      ON orders;

DROP FUNCTION IF EXISTS order_lines_audit_trigger();
DROP FUNCTION IF EXISTS orders_audit_trigger();

-- ─── Policies (auto-dropped with table, but be explicit) ──────

DROP POLICY IF EXISTS order_audit_log_insert  ON order_audit_log;
DROP POLICY IF EXISTS order_audit_log_read    ON order_audit_log;

DROP POLICY IF EXISTS order_lines_update_done ON order_lines;
DROP POLICY IF EXISTS order_lines_update_full ON order_lines;
DROP POLICY IF EXISTS order_lines_insert      ON order_lines;
DROP POLICY IF EXISTS order_lines_read        ON order_lines;

DROP POLICY IF EXISTS orders_update_printed   ON orders;
DROP POLICY IF EXISTS orders_update_placed    ON orders;
DROP POLICY IF EXISTS orders_insert           ON orders;
DROP POLICY IF EXISTS orders_read             ON orders;

-- ─── Tables (drop in reverse dependency order) ────────────────
-- order_audit_log and order_lines both reference orders. Cascade
-- deletes any remaining audit / line rows along with the order.

DROP TABLE IF EXISTS order_audit_log;
DROP TABLE IF EXISTS order_lines;
DROP TABLE IF EXISTS orders;

-- ─── Reference sequence + generator ───────────────────────────

DROP FUNCTION IF EXISTS generate_order_reference();
DROP SEQUENCE IF EXISTS order_reference_seq;

-- ─── Enums ────────────────────────────────────────────────────

DROP TYPE IF EXISTS order_uom;
DROP TYPE IF EXISTS order_audit_action;
DROP TYPE IF EXISTS order_state;

-- ============================================================
-- After this rollback:
--   - All order-pipeline tables / enums / sequences / functions
--     are gone.
--   - All pre-existing tables (orders, products, customers, users,
--     etc.) are untouched.
--   - The mfsops.com /orders and /kds routes will return 500
--     errors when called against the rolled-back DB. Toggle the
--     feature flag (NEXT_PUBLIC_ORDER_PIPELINE_ENABLED=false) at
--     the same time as running this rollback to hide the UI.
-- ============================================================
