-- 20260615173901_orders_authenticated_delete_and_print_policies.sql
--
-- F-RLS-04a — Orders-context RLS cutover (expand-contract steps 3-4).
--
-- ADDITIVE migration: adds the two missing FOR DELETE policies on `orders`
-- and `order_lines` so the per-request AUTHENTICATED Supabase client (the
-- keycard, F-RLS-03) can perform the DELETEs that two in-scope write paths
-- already issue:
--
--   1. updateOrder line-replacement (edit path, flipped in step 5):
--      `client.from('order_lines').delete().eq('order_id', id)` — replaces
--      every line on an edit. WITHOUT a DELETE policy this is denied under
--      the `authenticated` role and EVERY in-role edit that touches lines
--      breaks. This is the must-fix that makes the migration required.
--
--   2. createOrder rollback / idempotency loser-path:
--      `client.from('orders').delete().eq('id', orderId)`. Create is NOT
--      flipped this unit (it stays service-role — order_idempotency_keys is
--      RLS-deny-all), so this policy is not exercised yet. It is added now
--      so the policy surface is complete and the create follow-up needs no
--      further migration.
--
-- Role model: MIRRORS the existing orders/order_lines write policies
-- (`order_lines_update_full`, `orders_update_placed` — admin/sales/office),
-- keyed off the same `app.current_user_id` GUC the rest of the Orders
-- policies read. RLS must never be MORE restrictive than the service's own
-- gating; admin/sales/office is the union of every role allowed to edit, so
-- every service-permitted DELETE passes.
--
-- Service-role still BYPASSES RLS (no FORCE), so KDS / cron / create remain
-- unaffected. This grants permission only; it deletes no data, drops no
-- column, alters no type — NON-DESTRUCTIVE, no PITR gate of its own.
--
-- Guard loop-back fix (2026-06-15) — warehouse first-print:
--   The picking-list POST route authorizes admin/office/WAREHOUSE to print,
--   but a brand-new order is `state='placed'`, governed by `orders_update_placed`
--   (admin/sales/office — NO warehouse). So a warehouse user printing a placed
--   order was denied by RLS -> recordPrint saw UPDATE 0 -> spurious ConflictError.
--   `orders_print_placed` (below) adds ONLY the placed->printed transition for
--   admin/office/warehouse: USING constrains the pre-update row to placed; the
--   WITH CHECK constrains the post-update row to printed, so warehouse gains the
--   print path WITHOUT broad edit rights on placed orders. Permissive policies
--   are OR'd, so this only ADDS the warehouse print path; nothing is removed.
--
-- Apply via Supabase MCP `apply_migration` ONLY (never `supabase db push`).
-- Local: `npm run db:reset`. Prod application is deferred to the ship gate.

DROP POLICY IF EXISTS orders_delete       ON orders;
DROP POLICY IF EXISTS order_lines_delete  ON order_lines;
DROP POLICY IF EXISTS orders_print_placed ON orders;

CREATE POLICY orders_delete ON orders
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = nullif(current_setting('app.current_user_id', true), '')::uuid
        AND u.role IN ('admin', 'sales', 'office')
    )
  );

CREATE POLICY order_lines_delete ON order_lines
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = nullif(current_setting('app.current_user_id', true), '')::uuid
        AND u.role IN ('admin', 'sales', 'office')
    )
  );

CREATE POLICY orders_print_placed ON orders
  FOR UPDATE
  USING (
    state = 'placed' AND EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = nullif(current_setting('app.current_user_id', true), '')::uuid
        AND u.role IN ('admin', 'office', 'warehouse')
    )
  )
  WITH CHECK (
    state = 'printed' AND EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = nullif(current_setting('app.current_user_id', true), '')::uuid
        AND u.role IN ('admin', 'office', 'warehouse')
    )
  );

-- ROLLBACK
-- DROP POLICY IF EXISTS orders_delete       ON orders;
-- DROP POLICY IF EXISTS order_lines_delete  ON order_lines;
-- DROP POLICY IF EXISTS orders_print_placed ON orders;
