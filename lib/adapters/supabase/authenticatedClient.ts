/**
 * lib/adapters/supabase/authenticatedClient.ts
 * ───────────────────────────────────────────────────────────────────────────
 * F-RLS-03 (ADR-0007, ADR-0004) — the per-request AUTHENTICATED Supabase
 * client and the named requireServiceRole() escape hatch.
 *
 * INTRODUCE-ONLY: this file is built beside the live path and wired into ZERO
 * production routes by F-RLS-03. The first route cutover (Orders) is F-RLS-04a.
 *
 * Two clients, one purpose each:
 *   - authenticatedClientForCaller({ token }) — the keycard. Anon-key client
 *     with the caller's minted DB token as Authorization: Bearer. Runs as the
 *     Postgres `authenticated` role, so RLS policies are EVALUATED. Built fresh
 *     per request (do NOT memoize — the token is per-caller).
 *   - requireServiceRole() — the master key. Wraps the existing service-role
 *     client (getSupabaseService); BYPASSES RLS. Named so future code that
 *     skips RLS does so visibly and on purpose. Admin/system paths only.
 *
 * Hexagonal (ADR-0002): a SupabaseClient is a vendor type and must NOT cross
 * the adapter boundary. This factory returns it only to other adapter/wiring
 * code; F-RLS-04a will consume it inside a route/use-case via wiring, mapping
 * vendor rows to domain types the way the repositories already do.
 *
 * The minter (lib/adapters/web-crypto/DbTokenMinter.ts) is the single place
 * that knows the claim shape; this factory takes an already-minted { token }.
 * The two compose in a use-case/route in F-RLS-04a, NOT here.
 * ───────────────────────────────────────────────────────────────────────────
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseService } from "./client";

/**
 * Per-request authenticated client: anon key + the caller's minted DB token
 * as Authorization: Bearer. Runs as the Postgres `authenticated` role, so RLS
 * fires. Built fresh per request (do NOT memoize — the token is per-caller).
 */
export function authenticatedClientForCaller(caller: {
  token: string;
}): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${caller.token}` } },
    },
  );
}

/**
 * The named escape hatch for the master-key client (ADR-0004). Admin/system
 * paths only. Distinct from authenticatedClientForCaller: this BYPASSES RLS.
 */
export function requireServiceRole(): SupabaseClient {
  return getSupabaseService();
}
