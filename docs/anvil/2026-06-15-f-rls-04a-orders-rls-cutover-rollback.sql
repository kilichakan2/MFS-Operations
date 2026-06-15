-- 2026-06-15-f-rls-04a-orders-rls-cutover-rollback.sql
--
-- Rollback for migration:
--   supabase/migrations/20260615173901_orders_authenticated_delete_and_print_policies.sql
--
-- The forward migration is ADDITIVE — it only grants permission (three
-- CREATE POLICY statements). It deletes no data, drops no column, alters no
-- type. Therefore this rollback is a simple, non-data-loss DROP of the three
-- policies it added. No PITR is required for this migration (no destructive
-- DDL); PITR should nonetheless be confirmed enabled on the production project
-- as a general safety net before the prod flip (see cert).
--
-- NOTE on code rollback (separate from this DB rollback): the route-layer
-- cutover is reverted per-handler with a ONE-LINE swap — replace the
-- `*ForCaller(caller.userId!)` factory call with the imported service-role
-- singleton (`ordersService` / `pickingListUsecase`) in:
--   app/api/orders/route.ts            (GET)
--   app/api/orders/[id]/route.ts       (GET, PUT)
--   app/api/orders/[id]/picking-list/route.ts (GET, POST)
-- The service-role singletons were intentionally kept wired for exactly this.
-- Dropping the policies below WITHOUT also reverting the code would break
-- in-role edits/prints (the authenticated client would lose the DELETE/print
-- paths). If rolling back, revert the CODE first (or together), then DROP.

DROP POLICY IF EXISTS orders_delete       ON orders;
DROP POLICY IF EXISTS order_lines_delete  ON order_lines;
DROP POLICY IF EXISTS orders_print_placed ON orders;
