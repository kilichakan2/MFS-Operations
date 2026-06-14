-- ============================================================================
-- F-RLS-03 — db-pre-request GUC bridge (app-minted token → app.current_user_id)
--
-- ADR-0007 (app-minted token + GUC bridge). ADR-0004 (RLS posture).
--
-- WHAT THIS DOES
--   PostgREST runs ONE named SQL function (the `db-pre-request` hook) before
--   every request. This bridge function reads the verified `user_id` claim out
--   of the per-request minted JWT (exposed by PostgREST at
--   `request.jwt.claims`) and copies it into the session variable
--   `app.current_user_id` that EVERY existing GUC-based RLS policy already
--   reads. No existing policy is rewritten.
--
-- ADDITIVE ONLY: this migration creates one function, sets one role attribute,
--   and reloads PostgREST config. No DROP / TRUNCATE / ALTER TYPE / DROP NOT
--   NULL. No data is touched. No PITR gate (ADR-0007 §Consequences).
--
-- INERT for current service_role traffic (the 83 master-key call sites):
--   service_role (a) bypasses RLS entirely (tables are ENABLE, not FORCE), so
--   the GUC value is irrelevant to it; and (b) carries no
--   request.jwt.claims.user_id, so the hook leaves the GUC empty. Either way no
--   currently-passing route changes behaviour. Proven by the Slice-4
--   integration test (service-role read still returns rows AFTER this runs).
--
-- THREE MUST-HAVE PROPERTIES (code-critic blockers if absent):
--   1. set_config('app.current_user_id', <claim>, true) — the 3rd arg `true`
--      (is_local) scopes the GUC to the current transaction, so identity can
--      NEVER bleed across pooled connections.
--   2. The hook NEVER throws — claim parsing is wrapped in
--      `EXCEPTION WHEN OTHERS`; on any error or missing claim the GUC is left
--      empty (fail-closed = deny). A throwing db_pre_request hook would
--      fail-closed ALL authenticated-role traffic once a route is cut over.
--   3. The Slice-4 integration test proves a service_role read still returns
--      rows after this migration (today's master-key path genuinely untouched).
--
-- ROLLBACK (instant, no data touched):
--   ALTER ROLE authenticator RESET pgrst.db_pre_request;
--   NOTIFY pgrst, 'reload config';
--   -- optionally: DROP FUNCTION public.db_pre_request();
-- ============================================================================

CREATE OR REPLACE FUNCTION public.db_pre_request()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claims json;
  v_uid    text;
BEGIN
  -- Defensive: this hook runs on EVERY request once configured. It must
  -- NEVER throw — any doubt collapses to an empty GUC (fail-closed = deny).
  BEGIN
    -- PostgREST exposes the VERIFIED JWT claims here (the `true` 2nd arg means
    -- "return NULL instead of erroring if the GUC is unset" — e.g. anon/no
    -- token). Confirmed against Supabase docs (Realtime Authorization;
    -- auth.uid() itself reads current_setting('request.jwt.claim.sub')).
    v_claims := current_setting('request.jwt.claims', true)::json;
    v_uid := v_claims ->> 'user_id';
    IF v_uid IS NULL OR v_uid = '' THEN
      v_uid := v_claims ->> 'sub';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- No claims / malformed claims / any runtime quirk → no identity.
    v_uid := NULL;
  END;

  -- MUST-HAVE #1: is_local := true (3rd arg) — transaction-scoped, so the
  -- identity is wiped at the end of each request and never carried to the
  -- next request on a reused pooled connection.
  PERFORM set_config('app.current_user_id', COALESCE(v_uid, ''), true);
END
$$;

-- Wire the hook onto the PostgREST connection role. `authenticator` is the
-- role PostgREST connects as and SET ROLEs from to `authenticated`/`anon`;
-- the `pgrst.db_pre_request` attribute lives on it.
ALTER ROLE authenticator SET pgrst.db_pre_request = 'public.db_pre_request';

-- Tell PostgREST to pick up the new config without a restart.
NOTIFY pgrst, 'reload config';
