-- ANVIL rollback — F-RLS-04d Pricing-context RLS cutover
-- Branch: f-rls-04d-pricing-rls-cutover
-- Date: 2026-06-19
--
-- NON-DESTRUCTIVE change → this rollback is the inverse of one ADDITIVE
-- migration (policies only; no data touched, no grant added, no PITR).
--
-- Two independent layers must be reverted. APP-LAYER first (cheapest, no DB),
-- then DB-LAYER if the policies are to be removed too.
--
-- ────────────────────────────────────────────────────────────────────
-- LAYER 1 — APP CODE (one-line-per-route parachute; no deploy of new SQL)
-- ────────────────────────────────────────────────────────────────────
-- The wiring file lib/wiring/pricing.ts KEEPS the service-role `pricingService`
-- singleton precisely as the rollback parachute. To revert a route, swap the
-- per-request authenticated factory back to the service-role singleton:
--
--   app/api/pricing/route.ts               : pricingServiceForCaller(userId)  ->  pricingService
--   app/api/pricing/[id]/route.ts          : pricingServiceForCaller(userId)  ->  pricingService
--   app/api/pricing/[id]/lines/route.ts    : pricingServiceForCaller(userId)  ->  pricingService
--   app/api/pricing/lines/[lineId]/route.ts: pricingServiceForCaller(userId)  ->  pricingService
--
-- NOTE: app/api/pricing/[id]/lines/replace/route.ts was NEVER flipped — it
-- already uses the service-role singleton (its `replace_agreement_lines`
-- SECURITY DEFINER RPC is authenticated-REVOKED by the T3 hardening migration,
-- mirroring the activation-email E1 decision). Nothing to revert there.
--
-- service-role bypasses RLS, so reverting the code alone fully restores the
-- pre-04d behaviour even if the DB policies below are left in place (they are
-- inert for the service-role connection). The DB layer can stay applied.
--
-- ────────────────────────────────────────────────────────────────────
-- LAYER 2 — DB (only if you also want to remove the policies)
-- ────────────────────────────────────────────────────────────────────

-- Reverse 20260619120000_pricing_authenticated_rls_policies.sql
DROP POLICY IF EXISTS price_agreements_select       ON price_agreements;
DROP POLICY IF EXISTS price_agreements_insert       ON price_agreements;
DROP POLICY IF EXISTS price_agreements_update       ON price_agreements;
DROP POLICY IF EXISTS price_agreements_delete       ON price_agreements;
DROP POLICY IF EXISTS price_agreement_lines_select  ON price_agreement_lines;
DROP POLICY IF EXISTS price_agreement_lines_insert  ON price_agreement_lines;
DROP POLICY IF EXISTS price_agreement_lines_update  ON price_agreement_lines;
DROP POLICY IF EXISTS price_agreement_lines_delete  ON price_agreement_lines;

-- No grant to revert: baseline.sql already GRANT ALL on both pricing tables TO
-- authenticated, and the migration added none. The predicate helper
-- public.current_user_is_valid() is shared (shipped by 20260618130000 for 04c)
-- and MUST NOT be dropped here.
--
-- NOTE: dropping the pricing policies while RLS stays ENABLED with zero policies
-- = DENY-ALL for the authenticated role. That is only safe AFTER LAYER 1 reverts
-- every flipped pricing route back to the service-role singleton (which bypasses
-- RLS). Always revert LAYER 1 first, LAYER 2 second.
