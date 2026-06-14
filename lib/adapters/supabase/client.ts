/**
 * lib/adapters/supabase/client.ts
 * ───────────────────────────────────────────────────────────────────────────
 * Single shared Supabase service-role client for all server code.
 *
 * Service role key — bypasses RLS. Server-only. Never import in a client
 * component. The ONLY place (with the sibling repos) allowed to import
 * @supabase/supabase-js. See ADR-0002, ADR-0003.
 *
 * F-TD-04: construction is LAZY. Importing this module runs no createClient
 * and validates no env vars. The real client is built + memoized on first
 * property access (via supabaseService proxy) or first getSupabaseService() call.
 * This is what lets unit tests load the import graph with no env vars set.
 * ───────────────────────────────────────────────────────────────────────────
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let memo: SupabaseClient | null = null;

/** Build-once, return-same. The single shared service client. */
export function getSupabaseService(): SupabaseClient {
  if (memo === null) {
    memo = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
  }
  return memo;
}

/**
 * Back-compat lazy proxy. Existing call-sites do `supabaseService.from(...)`;
 * the proxy forwards every trap to the memoized real client, constructing it
 * on first ACCESS (not on import, and not on plain `const x = supabaseService`).
 */
export const supabaseService: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_t, prop, receiver) {
    return Reflect.get(getSupabaseService(), prop, receiver);
  },
  has(_t, prop) {
    return Reflect.has(getSupabaseService(), prop);
  },
  set(_t, prop, value, receiver) {
    return Reflect.set(getSupabaseService(), prop, value, receiver);
  },
  ownKeys(_t) {
    return Reflect.ownKeys(getSupabaseService());
  },
  getOwnPropertyDescriptor(_t, prop) {
    return Reflect.getOwnPropertyDescriptor(getSupabaseService(), prop);
  },
  getPrototypeOf(_t) {
    return Reflect.getPrototypeOf(getSupabaseService());
  },
});
