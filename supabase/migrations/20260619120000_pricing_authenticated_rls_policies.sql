-- 20260619120000_pricing_authenticated_rls_policies.sql
--
-- F-RLS-04d — Pricing-context RLS cutover. Byte-identical-intent mirror of
-- 20260618120000 (routes), adapted to price_agreements + price_agreement_lines.
--
-- ADDITIVE migration: adds the FULL policy set (8 policies, 4 per table) the
-- `price_agreements` and `price_agreement_lines` tables need so the per-request
-- AUTHENTICATED Supabase client (the keycard, F-RLS-03) can read AND write
-- through the Postgres `authenticated` role once the 6 Pricing API route files
-- (11 handlers) are flipped onto `pricingServiceForCaller`.
--
-- WHY THE FULL SET (the critical difference vs 04a/04b):
--   `20260613000000_enable_rls_42_tables.sql` ran
--   `ALTER TABLE price_agreements/price_agreement_lines ENABLE ROW LEVEL SECURITY`
--   but added NO policies. RLS-enabled + zero-policies = DENY EVERYTHING for
--   non-service-role. So once the pricing routes run as `authenticated`, every
--   read returns nothing unless SELECT policies ship → pricing screens blank.
--   SELECT is the headline must-fix. INSERT/UPDATE/DELETE ship too so
--   create/edit/delete work under the badge.
--
-- ROLE MODEL — VALID-USER ONLY, no `role IN (...)` filter (mirrors 04c):
--   Any caller whose GUC maps to a real `public.users` row is allowed. The
--   "sales own only" RBAC stays in the route layer (getAgreementOwner /
--   getLineOwner checks) exactly as today — RLS is never stricter than the
--   service's own gating.
--
-- PREDICATE: public.current_user_is_valid() (SECURITY DEFINER STABLE helper,
--   shipped in 20260618130000 L72-93) — the standardized recursion-proof
--   valid-user check. EXECUTE already granted to `authenticated` there; no new
--   grant, no new helper.
--
-- GRANTS: table-level `GRANT ALL ON price_agreements/price_agreement_lines TO
--   authenticated` already exists in `20260101000000_baseline.sql` (lines 2748,
--   2753), so NO GRANT is added here.
--
-- SERVICE-ROLE still BYPASSES RLS (no FORCE) — so the activation-email use-case
--   (pricingActivationEmail, recipient + full-agreement reads) and any cron/
--   back-office path remain unaffected; they keep using the service-role
--   singleton.
--
-- NON-DESTRUCTIVE: `CREATE POLICY` only — no DROP TABLE / TRUNCATE / ALTER TYPE /
--   DROP COLUMN / DROP NOT NULL → NO PITR gate fires.
--
-- One policy per command on each table, so no over-grant is possible (PostgreSQL
--   OR's permissive policies for the same command — here each command has exactly
--   one).
--
-- KEY DIVERGENCE FROM THE ROUTES MIGRATION (deliberate, verified):
--   `route_stops` got NO UPDATE policy because `saveRoute` replaces stops via
--   delete-then-insert. `price_agreement_lines` DOES need an UPDATE policy:
--   `lines/[lineId]` PATCH calls `pricingService.updateLine` → an in-place UPDATE
--   on a single line row. The `replace` route uses the `replace_agreement_lines`
--   RPC (delete+insert), so it needs INSERT+DELETE; the line PATCH needs UPDATE.
--   Hence the FULL 4-policy set on BOTH tables. Missing the lines UPDATE policy =
--   line edits silently fail under the badge.
--
-- EMPTY/ABSENT-GUC EDGE (inherited from 04a/04b/04c, deferred — do NOT fix here):
--   an empty-string GUC's `nullif(...,'')::uuid` cast inside the helper raises
--   22P02 rather than a clean 42501 deny. It is FAIL-CLOSED either way (no row is
--   read or written) and UNREACHABLE on these routes (they always carry a valid
--   token → valid uuid GUC).
--
-- Apply via Supabase MCP `apply_migration` ONLY (never `supabase db push`).
-- Local: `npm run db:reset`. Prod application is deferred to the ship gate
-- (apply to prod FIRST, then merge — the F-RLS-04a / 04b / 04c / F-TD-22 ordering).

DROP POLICY IF EXISTS price_agreements_select       ON price_agreements;
DROP POLICY IF EXISTS price_agreements_insert       ON price_agreements;
DROP POLICY IF EXISTS price_agreements_update       ON price_agreements;
DROP POLICY IF EXISTS price_agreements_delete       ON price_agreements;
DROP POLICY IF EXISTS price_agreement_lines_select  ON price_agreement_lines;
DROP POLICY IF EXISTS price_agreement_lines_insert  ON price_agreement_lines;
DROP POLICY IF EXISTS price_agreement_lines_update  ON price_agreement_lines;
DROP POLICY IF EXISTS price_agreement_lines_delete  ON price_agreement_lines;

-- ── price_agreements ────────────────────────────────────────
CREATE POLICY price_agreements_select ON price_agreements
  FOR SELECT USING ( public.current_user_is_valid() );

CREATE POLICY price_agreements_insert ON price_agreements
  FOR INSERT WITH CHECK ( public.current_user_is_valid() );

CREATE POLICY price_agreements_update ON price_agreements
  FOR UPDATE USING ( public.current_user_is_valid() )
             WITH CHECK ( public.current_user_is_valid() );

CREATE POLICY price_agreements_delete ON price_agreements
  FOR DELETE USING ( public.current_user_is_valid() );

-- ── price_agreement_lines (FULL set incl. UPDATE — updateLine PATCHes a row
--    in place, unlike route_stops which is delete-then-insert) ──
CREATE POLICY price_agreement_lines_select ON price_agreement_lines
  FOR SELECT USING ( public.current_user_is_valid() );

CREATE POLICY price_agreement_lines_insert ON price_agreement_lines
  FOR INSERT WITH CHECK ( public.current_user_is_valid() );

CREATE POLICY price_agreement_lines_update ON price_agreement_lines
  FOR UPDATE USING ( public.current_user_is_valid() )
             WITH CHECK ( public.current_user_is_valid() );

CREATE POLICY price_agreement_lines_delete ON price_agreement_lines
  FOR DELETE USING ( public.current_user_is_valid() );

-- ROLLBACK
-- DROP POLICY IF EXISTS price_agreements_select       ON price_agreements;
-- DROP POLICY IF EXISTS price_agreements_insert       ON price_agreements;
-- DROP POLICY IF EXISTS price_agreements_update       ON price_agreements;
-- DROP POLICY IF EXISTS price_agreements_delete       ON price_agreements;
-- DROP POLICY IF EXISTS price_agreement_lines_select  ON price_agreement_lines;
-- DROP POLICY IF EXISTS price_agreement_lines_insert  ON price_agreement_lines;
-- DROP POLICY IF EXISTS price_agreement_lines_update  ON price_agreement_lines;
-- DROP POLICY IF EXISTS price_agreement_lines_delete  ON price_agreement_lines;
