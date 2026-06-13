-- ============================================================
-- T3 — Harden the SECURITY DEFINER functions
-- ============================================================
--
-- Closes two advisor findings against schema public, ZERO app
-- behaviour change:
--   (A) function_search_path_mutable x4  -> pin search_path=public
--       on the 4 mutable functions (matches the existing convention
--       the other 3 already use; PostgREST already runs effectively
--       with search_path=public so this is a no-op at runtime).
--   (B) anon_security_definer_function_executable x4 -> revoke
--       EXECUTE (incl. the PUBLIC catch-all) from anon/authenticated
--       on the 4 SECURITY DEFINER functions, keeping ONLY the grants
--       the app / triggers / RLS policies actually need.
--
-- DELIBERATE residual: is_admin() keeps EXECUTE for `authenticated`
-- (RLS policies on 13 tables call it; F-RLS-03 needs it). So the
-- advisor authenticated_security_definer_function_executable count
-- ends at 1 (is_admin only) BY DESIGN, not by omission.
--
-- ADDITIVE / non-destructive: no DROP, no body change, no data
-- change. Zero downtime. PITR NOT required (rollback = re-GRANT,
-- see plan §Rollback).
--
-- Exact signatures used in every statement (overloaded-safe).
-- Live grants verified against prod uqgecljspgtevoylwkep this
-- session; the older migration FILES are stale — the guards below
-- re-read pg_proc/proacl at apply time, so stale files cannot cause
-- a silent wrong-state apply.
-- ============================================================

-- ─── Pre-state drift guard: abort unless the 7 expected functions
--     exist with the expected definer mode. Fail-closed. ──
DO $$
DECLARE
  v_missing text[];
BEGIN
  SELECT coalesce(array_agg(want ORDER BY want), ARRAY[]::text[])
    INTO v_missing
  FROM (VALUES
    ('replace_agreement_lines(p_agreement_id uuid, p_lines jsonb)'),
    ('is_admin()'),
    ('orders_audit_trigger()'),
    ('order_lines_audit_trigger()'),
    ('generate_order_reference()'),
    ('haccp_search(query text)'),
    ('set_updated_at()')
  ) AS w(want)
  WHERE NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND (p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')') = w.want
  );

  IF array_length(v_missing, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'T3 guard: expected functions missing/renamed (drift): %', v_missing;
  END IF;

  -- Definer-mode guard: the 4 we treat as SECURITY DEFINER must be so.
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public'
      AND (p.proname||'('||pg_get_function_identity_arguments(p.oid)||')') IN
          ('replace_agreement_lines(p_agreement_id uuid, p_lines jsonb)','is_admin()',
           'orders_audit_trigger()','order_lines_audit_trigger()')
      AND p.prosecdef = false
  ) THEN
    RAISE EXCEPTION 'T3 guard: a function expected to be SECURITY DEFINER is INVOKER (drift)';
  END IF;
  -- NOTE: generate_order_reference is deliberately NOT in the definer-mode list above.
  -- It is INVOKER in prod but DEFINER in the migration files (out-of-band prod drift);
  -- Pass A normalizes it to INVOKER in every environment, so its mode is not pre-asserted.

  RAISE NOTICE 'T3 pre-guard passed: 7 functions present, 4 definer-mode confirmed.';
END $$;

-- ============================================================
-- PASS A — pin search_path = public on the 4 mutable functions
-- (no body change; clears function_search_path_mutable x4)
-- ============================================================
ALTER FUNCTION public.generate_order_reference()                 SET search_path = public;
ALTER FUNCTION public.haccp_search(text)                          SET search_path = public;
ALTER FUNCTION public.replace_agreement_lines(uuid, jsonb)        SET search_path = public;
ALTER FUNCTION public.set_updated_at()                            SET search_path = public;

-- Drift reconciliation: generate_order_reference is INVOKER in prod but DEFINER in
-- the migration files (prod was altered out-of-band). Normalize every environment to
-- prod's validated, least-privilege INVOKER state. No-op on prod; converts local/preview
-- DEFINER->INVOKER. Safe: the function only runs as the orders.reference column DEFAULT
-- during INSERTs, which the app performs as service_role (full access). Prod has run it as
-- INVOKER successfully. This makes the advisor outcome identical across all environments
-- and removes a phantom anon-definer finding on local/preview. (Broader prod<>migrations
-- drift logged to BACKLOG.)
ALTER FUNCTION public.generate_order_reference() SECURITY INVOKER;

-- ============================================================
-- PASS B — revoke EXECUTE (incl. PUBLIC) on the 4 SECURITY
-- DEFINER functions, keeping exactly what is needed.
-- ============================================================

-- replace_agreement_lines: KEEP service_role (app rpc mutates pricing).
REVOKE EXECUTE ON FUNCTION public.replace_agreement_lines(uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.replace_agreement_lines(uuid, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.replace_agreement_lines(uuid, jsonb) FROM authenticated;
-- (service_role retained — not revoked)

-- is_admin: KEEP authenticated + service_role (RLS policies / F-RLS-03).
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon;
-- (authenticated + service_role retained — not revoked)

-- orders_audit_trigger: trigger-only, no direct caller needs EXECUTE.
REVOKE EXECUTE ON FUNCTION public.orders_audit_trigger() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.orders_audit_trigger() FROM anon;
REVOKE EXECUTE ON FUNCTION public.orders_audit_trigger() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.orders_audit_trigger() FROM service_role;

-- order_lines_audit_trigger: trigger-only, no direct caller needs EXECUTE.
REVOKE EXECUTE ON FUNCTION public.order_lines_audit_trigger() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.order_lines_audit_trigger() FROM anon;
REVOKE EXECUTE ON FUNCTION public.order_lines_audit_trigger() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.order_lines_audit_trigger() FROM service_role;

-- ============================================================
-- PASS C — post-state verification. Re-read pg_proc.proconfig
-- (search_path) and the effective EXECUTE ACL, RAISE if the
-- end-state is not EXACTLY as intended. Fail-closed.
-- ============================================================
DO $$
DECLARE
  v_bad text[] := ARRAY[]::text[];

  -- helper: does role have EXECUTE on a function oid?
  --   has_function_privilege(role, oid, 'EXECUTE') accounts for the
  --   PUBLIC catch-all automatically, so it is the correct effective check.
  o_replace oid;
  o_isadmin oid;
  o_otrig   oid;
  o_oltrig  oid;
  o_genref  oid;
  o_haccp   oid;
  o_setupd  oid;
BEGIN
  SELECT p.oid INTO o_replace FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='replace_agreement_lines'
      AND pg_get_function_identity_arguments(p.oid)='p_agreement_id uuid, p_lines jsonb';
  SELECT p.oid INTO o_isadmin FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='is_admin' AND pg_get_function_identity_arguments(p.oid)='';
  SELECT p.oid INTO o_otrig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='orders_audit_trigger' AND pg_get_function_identity_arguments(p.oid)='';
  SELECT p.oid INTO o_oltrig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='order_lines_audit_trigger' AND pg_get_function_identity_arguments(p.oid)='';
  SELECT p.oid INTO o_genref FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='generate_order_reference' AND pg_get_function_identity_arguments(p.oid)='';
  SELECT p.oid INTO o_haccp FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='haccp_search' AND pg_get_function_identity_arguments(p.oid)='query text';
  SELECT p.oid INTO o_setupd FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='set_updated_at' AND pg_get_function_identity_arguments(p.oid)='';

  -- ── search_path pinned to public on all 4 (proconfig contains search_path=public) ──
  IF NOT (SELECT 'search_path=public' = ANY(coalesce(proconfig,'{}')) FROM pg_proc WHERE oid=o_genref) THEN
    v_bad := v_bad || 'generate_order_reference: search_path NOT pinned to public'; END IF;
  IF NOT (SELECT 'search_path=public' = ANY(coalesce(proconfig,'{}')) FROM pg_proc WHERE oid=o_haccp) THEN
    v_bad := v_bad || 'haccp_search: search_path NOT pinned to public'; END IF;
  IF NOT (SELECT 'search_path=public' = ANY(coalesce(proconfig,'{}')) FROM pg_proc WHERE oid=o_replace) THEN
    v_bad := v_bad || 'replace_agreement_lines: search_path NOT pinned to public'; END IF;
  IF NOT (SELECT 'search_path=public' = ANY(coalesce(proconfig,'{}')) FROM pg_proc WHERE oid=o_setupd) THEN
    v_bad := v_bad || 'set_updated_at: search_path NOT pinned to public'; END IF;
  -- and the 3 already-pinned definer fns stay pinned
  IF NOT (SELECT 'search_path=public' = ANY(coalesce(proconfig,'{}')) FROM pg_proc WHERE oid=o_isadmin) THEN
    v_bad := v_bad || 'is_admin: search_path NOT public (regression)'; END IF;
  IF NOT (SELECT 'search_path=public' = ANY(coalesce(proconfig,'{}')) FROM pg_proc WHERE oid=o_otrig) THEN
    v_bad := v_bad || 'orders_audit_trigger: search_path NOT public (regression)'; END IF;
  IF NOT (SELECT 'search_path=public' = ANY(coalesce(proconfig,'{}')) FROM pg_proc WHERE oid=o_oltrig) THEN
    v_bad := v_bad || 'order_lines_audit_trigger: search_path NOT public (regression)'; END IF;

  -- ── generate_order_reference normalized to SECURITY INVOKER in every env (drift fix) ──
  IF (SELECT prosecdef FROM pg_proc WHERE oid=o_genref) THEN
    v_bad := v_bad || 'generate_order_reference: still SECURITY DEFINER (normalize to INVOKER failed)'; END IF;

  -- ── replace_agreement_lines: service_role YES; anon/authenticated/public NO ──
  IF NOT has_function_privilege('service_role', o_replace, 'EXECUTE') THEN
    v_bad := v_bad || 'replace_agreement_lines: service_role LOST execute (app would break)'; END IF;
  IF has_function_privilege('anon', o_replace, 'EXECUTE') THEN
    v_bad := v_bad || 'replace_agreement_lines: anon STILL has execute'; END IF;
  IF has_function_privilege('authenticated', o_replace, 'EXECUTE') THEN
    v_bad := v_bad || 'replace_agreement_lines: authenticated STILL has execute'; END IF;

  -- ── is_admin: authenticated YES, service_role YES; anon NO ──
  IF NOT has_function_privilege('authenticated', o_isadmin, 'EXECUTE') THEN
    v_bad := v_bad || 'is_admin: authenticated LOST execute (F-RLS-03 / RLS policies would break)'; END IF;
  IF NOT has_function_privilege('service_role', o_isadmin, 'EXECUTE') THEN
    v_bad := v_bad || 'is_admin: service_role LOST execute'; END IF;
  IF has_function_privilege('anon', o_isadmin, 'EXECUTE') THEN
    v_bad := v_bad || 'is_admin: anon STILL has execute'; END IF;

  -- ── both audit triggers: NO caller execute for anon/authenticated/service_role ──
  IF has_function_privilege('anon', o_otrig, 'EXECUTE')          THEN v_bad := v_bad || 'orders_audit_trigger: anon STILL has execute'; END IF;
  IF has_function_privilege('authenticated', o_otrig, 'EXECUTE') THEN v_bad := v_bad || 'orders_audit_trigger: authenticated STILL has execute'; END IF;
  IF has_function_privilege('service_role', o_otrig, 'EXECUTE')  THEN v_bad := v_bad || 'orders_audit_trigger: service_role STILL has execute'; END IF;
  IF has_function_privilege('anon', o_oltrig, 'EXECUTE')          THEN v_bad := v_bad || 'order_lines_audit_trigger: anon STILL has execute'; END IF;
  IF has_function_privilege('authenticated', o_oltrig, 'EXECUTE') THEN v_bad := v_bad || 'order_lines_audit_trigger: authenticated STILL has execute'; END IF;
  IF has_function_privilege('service_role', o_oltrig, 'EXECUTE')  THEN v_bad := v_bad || 'order_lines_audit_trigger: service_role STILL has execute'; END IF;

  IF array_length(v_bad, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'T3 post-check FAILED: %', v_bad;
  END IF;

  RAISE NOTICE 'T3 post-check passed: search_path pinned x4, definer grants exactly as intended, is_admin authenticated retained by design.';
END $$;
