-- F-PROD-02 — KDS line-done undo: add the `line_undone` audit action.
--
-- This file does ONE thing: extend the `order_audit_action` ENUM with a
-- new value. It is deliberately ISOLATED from the trigger/RPC migration
-- (20260617130001) for a Postgres reason:
--
--   `ALTER TYPE ... ADD VALUE` adds an enum label, but on PG12+ a newly
--   added value cannot be USED (e.g. cast to the type, assigned to a
--   column of that type) in the SAME transaction that added it. The
--   Supabase migration runner wraps each file in its own transaction.
--   So the enum-add and the trigger function that references
--   `'line_undone'::order_audit_action` MUST live in two separate,
--   ordered migration files. This is File A; the trigger is File B.
--
-- Additive + backward-compatible: existing code never emits `line_undone`,
-- so this is harmless on its own and applies to prod ahead of the code.

ALTER TYPE order_audit_action ADD VALUE IF NOT EXISTS 'line_undone';
