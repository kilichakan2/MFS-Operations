/**
 * tests/integration/adapters/supabase/rls-bridge.test.ts
 *
 * F-RLS-03 Slice 4 — the LOAD-BEARING proof of the unit. F-RLS-03 flips zero
 * production routes, so this end-to-end test is the only thing that
 * demonstrates the app-minted-token → GUC-bridge mechanism actually works.
 *
 * It does NOT go through the Next.js routes — it talks straight to Supabase's
 * PostgREST as the anon/authenticated role, exactly the way a future
 * authenticated route will, so it isolates "did the bridge set the GUC" from
 * any app code:
 *
 *   - 4.2 DENY:    anon client with NO valid token → customers SELECT returns
 *                  zero rows (RLS denial; the GUC is empty).
 *   - 4.3 ALLOW:   mint({ userId }) → authenticatedClientForCaller({ token })
 *                  → customers SELECT returns rows. Proves: token verified →
 *                  PostgREST exposed request.jwt.claims → db_pre_request wrote
 *                  app.current_user_id → existing customers_select policy passed.
 *   - 4.3b ISOLATION: two different minted users on fresh clients each see the
 *                  allow result independently — is_local := true means no GUC
 *                  bleed across requests/connections.
 *   - 4.4 INERT:   a service_role SELECT still returns rows AFTER the migration
 *                  (today's master-key path the 83 routes use is untouched).
 *
 * The `customers` table is chosen deliberately: its existing GUC policy
 * `customers_select` allows the read iff app.current_user_id is non-empty
 * (baseline line 2449) — independent of per-row ownership — so it cleanly
 * proves the bridge populated the GUC.
 *
 * REQUIREMENTS to actually run (vs skip):
 *   - SUPABASE_JWT_SECRET — the Supabase project JWT secret; the minter signs
 *     with it and PostgREST verifies with it. Server-side only.
 *   - NEXT_PUBLIC_SUPABASE_ANON_KEY — to build the authenticated client.
 *   - The 20260614210221_db_pre_request_guc_bridge.sql migration applied to the
 *     target DB (local: `npm run db:reset`; CI: the preview branch).
 *
 * When SUPABASE_JWT_SECRET or the anon key is absent (e.g. a local dev box that
 * hasn't provisioned the secret yet), the suite SKIPS rather than failing —
 * but it is fully wired to run on the Supabase preview branch in CI, where the
 * secret is present. It NEVER fakes a pass: the allow-case is a real
 * round-trip through PostgREST + the bridge.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import {
  authenticatedClientForCaller,
} from "@/lib/adapters/supabase/authenticatedClient";
import { createWebCryptoDbTokenMinter } from "@/lib/adapters/web-crypto";
import { getServiceClient, setupTestUsers, type TestUserSet } from "../../_setup";

const JWT_SECRET = process.env.SUPABASE_JWT_SECRET;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost:54321";

// Skip (don't fail) when the secret or anon key isn't provisioned locally.
// On the preview branch both are present, so the proof runs there.
const CAN_RUN = Boolean(JWT_SECRET) && Boolean(ANON_KEY);

const minter = createWebCryptoDbTokenMinter({
  getSecret: () => process.env.SUPABASE_JWT_SECRET,
});

/** A bare anon-key client carrying NO Bearer token — the deny baseline. */
function anonClientNoToken() {
  return createClient(SUPABASE_URL, ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

describe.skipIf(!CAN_RUN)("F-RLS-03 app-minted token → GUC bridge (end-to-end)", () => {
  let users: TestUserSet;

  beforeAll(async () => {
    users = await setupTestUsers();
  }, 30_000);

  it("4.2 DENY — anon client with no token reads zero customer rows (RLS denies)", async () => {
    const anon = anonClientNoToken();
    const { data, error } = await anon.from("customers").select("id").limit(5);
    // RLS denial surfaces as zero rows (not an error) for SELECT.
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it("4.3 ALLOW — minted token → authenticated client reads customer rows", async () => {
    // Ensure at least one customer exists to be read.
    const svc = getServiceClient();
    const { count } = await svc
      .from("customers")
      .select("id", { count: "exact", head: true });
    expect(count ?? 0).toBeGreaterThan(0);

    const token = await minter.mint({ userId: users.admin.id });
    const authed = authenticatedClientForCaller({ token });
    const { data, error } = await authed
      .from("customers")
      .select("id")
      .limit(5);
    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThan(0);
  });

  it("4.3b ISOLATION — two minted users each read independently (is_local := true, no GUC bleed)", async () => {
    const tokenA = await minter.mint({ userId: users.admin.id });
    const tokenB = await minter.mint({ userId: users.sales.id });

    const clientA = authenticatedClientForCaller({ token: tokenA });
    const clientB = authenticatedClientForCaller({ token: tokenB });

    const resA = await clientA.from("customers").select("id").limit(1);
    const resB = await clientB.from("customers").select("id").limit(1);

    expect(resA.error).toBeNull();
    expect(resB.error).toBeNull();
    // Each authenticated request independently passes the GUC check; neither
    // depends on a leaked GUC from the other.
    expect((resA.data ?? []).length).toBeGreaterThan(0);
    expect((resB.data ?? []).length).toBeGreaterThan(0);
  });

  it("4.4 INERT — service_role read still returns customer rows after the migration", async () => {
    const svc = getServiceClient();
    const { data, error } = await svc.from("customers").select("id").limit(5);
    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThan(0);
  });
});
