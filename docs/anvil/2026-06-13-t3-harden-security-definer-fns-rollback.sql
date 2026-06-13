-- ============================================================
-- ROLLBACK — T3 Harden the SECURITY DEFINER functions
-- Migration: 20260613020000_harden_security_definer_fns.sql
-- ============================================================
--
-- NON-DESTRUCTIVE change (grants + search_path + one DEFINER->INVOKER
-- normalization only; NO DROP, NO body change, NO data change).
-- PITR NOT required. This script reverses ONLY the security-tightening
-- step that could, in theory, break a caller: it RE-GRANTS the EXECUTE
-- privileges that Pass B revoked.
--
-- The search_path pins (Pass A) and the generate_order_reference
-- DEFINER->INVOKER normalization are non-breaking and are LEFT IN PLACE
-- on rollback — re-loosening them would only re-open the advisor
-- findings for no benefit. If a full revert is ever required, append
-- the clearly-marked OPTIONAL block at the bottom.
--
-- Apply with: supabase db push (prod) OR psql against the target DB.
-- ============================================================

-- ─── Reverse Pass B: re-GRANT the revoked EXECUTE privileges ───
-- replace_agreement_lines: restore the broad grants (anon/authenticated
-- went via PUBLIC originally).
GRANT EXECUTE ON FUNCTION public.replace_agreement_lines(uuid, jsonb) TO PUBLIC;

-- is_admin: restore anon (authenticated + service_role were retained, not revoked).
GRANT EXECUTE ON FUNCTION public.is_admin() TO PUBLIC;

-- orders_audit_trigger / order_lines_audit_trigger: restore broad grants.
-- (Trigger functions never NEEDED caller EXECUTE; this only restores the
--  pre-migration ACL exactly.)
GRANT EXECUTE ON FUNCTION public.orders_audit_trigger() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.order_lines_audit_trigger() TO PUBLIC;

-- ============================================================
-- OPTIONAL — full revert of Pass A (search_path pins + INVOKER
-- normalization). NOT recommended: re-opens advisor findings.
-- Uncomment ONLY if a complete pre-T3 state is explicitly required.
-- ============================================================
-- ALTER FUNCTION public.generate_order_reference()          RESET search_path;
-- ALTER FUNCTION public.haccp_search(text)                  RESET search_path;
-- ALTER FUNCTION public.replace_agreement_lines(uuid, jsonb) RESET search_path;
-- ALTER FUNCTION public.set_updated_at()                    RESET search_path;
-- -- generate_order_reference was INVOKER in prod pre-T3; leaving it INVOKER
-- -- matches prod. Do NOT convert back to DEFINER (that was stale-file drift).
