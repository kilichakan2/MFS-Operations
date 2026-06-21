-- ANVIL rollback — F-RLS-04e Cash-context RLS cutover
-- Branch: f-rls-04e-cash-rls-cutover
-- Date: 2026-06-21
--
-- NON-DESTRUCTIVE change → this rollback is the inverse of one ADDITIVE
-- migration (policies only; no data touched, no grant added, no PITR).
--
-- Two independent layers must be reverted. APP-LAYER first (cheapest, no DB),
-- then DB-LAYER if the policies are to be removed too.
--
-- ────────────────────────────────────────────────────────────────────
-- LAYER 1 — APP CODE (one-line-per-handler parachute; no deploy of new SQL)
-- ────────────────────────────────────────────────────────────────────
-- The wiring file lib/wiring/cash.ts KEEPS the master-key `cashService`
-- singleton precisely as the rollback parachute. To revert a route, swap the
-- per-request authenticated factory back to the master-key singleton:
--
--   app/api/cash/month/route.ts        (GET, POST)   : cashServiceForCaller(userId) -> cashService
--   app/api/cash/month/[id]/route.ts   (PATCH)       : cashServiceForCaller(userId) -> cashService
--   app/api/cash/entry/route.ts        (POST)        : cashServiceForCaller(userId) -> cashService
--   app/api/cash/entry/[id]/route.ts   (PATCH, DELETE): cashServiceForCaller(userId) -> cashService
--   app/api/cash/cheques/route.ts      (GET, POST)   : cashServiceForCaller(userId) -> cashService
--   app/api/cash/cheques/[id]/route.ts (PATCH, DELETE): cashServiceForCaller(userId) -> cashService
--   app/api/cash/export/route.ts       (GET)         : cashServiceForCaller(userId) -> cashService
--
-- NOTE: app/api/cash/upload/route.ts was NEVER flipped — it already uses the
-- master-key singleton (storage-only, no RLS table surface; the cash-attachments
-- bucket has no authenticated storage.objects policies — E1). Nothing to revert
-- there. Likewise, inside the flipped routes the signed-URL mint (month GET) and
-- attachments.remove (entry DELETE) already run through the master-key storage
-- port — they are unaffected by either layer.
--
-- The master-key role bypasses RLS, so reverting the code alone fully restores
-- the pre-04e behaviour even if the DB policies below are left in place (they are
-- inert for the master-key connection). The DB layer can stay applied.
--
-- ────────────────────────────────────────────────────────────────────
-- LAYER 2 — DB (only if you also want to remove the policies)
-- ────────────────────────────────────────────────────────────────────

-- Reverse 20260621120000_cash_authenticated_rls_policies.sql
DROP POLICY IF EXISTS cash_months_select    ON cash_months;
DROP POLICY IF EXISTS cash_months_insert    ON cash_months;
DROP POLICY IF EXISTS cash_months_update    ON cash_months;
DROP POLICY IF EXISTS cash_months_delete    ON cash_months;
DROP POLICY IF EXISTS cash_entries_select   ON cash_entries;
DROP POLICY IF EXISTS cash_entries_insert   ON cash_entries;
DROP POLICY IF EXISTS cash_entries_update   ON cash_entries;
DROP POLICY IF EXISTS cash_entries_delete   ON cash_entries;
DROP POLICY IF EXISTS cheque_records_select ON cheque_records;
DROP POLICY IF EXISTS cheque_records_insert ON cheque_records;
DROP POLICY IF EXISTS cheque_records_update ON cheque_records;
DROP POLICY IF EXISTS cheque_records_delete ON cheque_records;

-- No grant to revert: baseline.sql already GRANT ALL on all three cash tables TO
-- authenticated, and the migration added none. The predicate helper
-- public.current_user_is_valid() is shared (shipped by 20260618130000 for 04c)
-- and MUST NOT be dropped here.
--
-- NOTE: dropping the cash policies while RLS stays ENABLED with zero policies =
-- DENY-ALL for the authenticated role. That is only safe AFTER LAYER 1 reverts
-- every flipped cash route back to the master-key singleton (which bypasses RLS).
-- Always revert LAYER 1 first, LAYER 2 second.
