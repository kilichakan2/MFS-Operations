/**
 * tests/unit/wiring/pricingServiceForCaller.test.ts
 *
 * F-RLS-04d — proves the per-request authenticated Pricing wiring factory.
 *
 * `pricingServiceForCaller(callerUserId)` must, for EACH call:
 *   - mint a fresh DB token via dbTokenMinter.mint({ userId: callerUserId })
 *   - build a fresh authenticated client via authenticatedClientForCaller({ token })
 *   - build the Supabase Pricing adapter bound to THAT client
 *   - return a PricingService built from ports (createPricingService)
 *
 * Critically it must NEVER memoize: two calls → two mints → two client
 * builds. A memoized client would leak one caller's identity to another
 * (Risk R-CONC-1; the mirror of the Orders/Routes/Users cutover risk).
 *
 * The vendor seams (dbTokenMinter, authenticatedClientForCaller,
 * createSupabasePricingRepository) are mocked so the test inspects the wiring
 * graph the factory assembles without standing up Supabase. The service-role
 * singleton path is exercised by the existing PricingRepository unit tests;
 * here we only pin the per-caller factory and the surviving parachute.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ── Mocks for the seams the factory composes ────────────────────
const mintMock = vi.fn(async (claims: { userId: string }) => `token-for-${claims.userId}`);
const authedClientMock = vi.fn((args: { token: string }) => ({ __client: args.token }));
const repoMock = vi.fn((client: unknown) => ({ __repo: client }));
const serviceMock = vi.fn((deps: unknown) => ({ __service: deps }));

vi.mock("@/lib/wiring/dbToken", () => ({
  dbTokenMinter: { mint: (claims: { userId: string }) => mintMock(claims) },
}));

vi.mock("@/lib/adapters/supabase", () => ({
  // The service-role singletons the module also imports at load.
  supabasePricingRepository: { __serviceRoleSingleton: true },
  supabaseUsersRepository: { __serviceRoleUsersSingleton: true },
  createSupabasePricingRepository: (client: unknown) => repoMock(client),
  authenticatedClientForCaller: (args: { token: string }) => authedClientMock(args),
}));

vi.mock("@/lib/services", () => ({
  createPricingService: (deps: unknown) => serviceMock(deps),
}));

// The pricing wiring also composes the activation-email use-case at module
// load; stub it so importing the module does not require the real graph.
vi.mock("@/lib/usecases/pricingActivationEmail", () => ({
  createPricingActivationEmail: (deps: unknown) => ({ __activationEmail: deps }),
}));

describe("F-RLS-04d pricingServiceForCaller (per-request authenticated wiring)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("mints a token for the caller, builds a client, returns a PricingService", async () => {
    const { pricingServiceForCaller } = await import("@/lib/wiring/pricing");

    const service = await pricingServiceForCaller("sales-123");

    // Token minted FOR THIS caller.
    expect(mintMock).toHaveBeenCalledTimes(1);
    expect(mintMock).toHaveBeenCalledWith({ userId: "sales-123" });

    // Client built from THAT token.
    expect(authedClientMock).toHaveBeenCalledTimes(1);
    expect(authedClientMock).toHaveBeenCalledWith({ token: "token-for-sales-123" });

    // Adapter bound to THAT client.
    expect(repoMock).toHaveBeenCalledTimes(1);
    expect(repoMock).toHaveBeenCalledWith({ __client: "token-for-sales-123" });

    // Service built from ports (the authed pricing repo). createPricingService
    // is ALSO invoked once at module load for the service-role singleton, so we
    // assert the per-caller call happened with the authed repo rather than
    // pinning a total call count.
    expect(serviceMock).toHaveBeenCalledWith({
      pricing: { __repo: { __client: "token-for-sales-123" } },
    });

    // Returns whatever createPricingService produced.
    expect(service).toEqual({
      __service: { pricing: { __repo: { __client: "token-for-sales-123" } } },
    });
  });

  it("NEVER memoizes — each call mints a fresh token and builds a fresh client", async () => {
    const { pricingServiceForCaller } = await import("@/lib/wiring/pricing");

    await pricingServiceForCaller("sales-A");
    await pricingServiceForCaller("sales-B");

    // Two calls → two mints, two client builds, two adapter builds.
    expect(mintMock).toHaveBeenCalledTimes(2);
    expect(authedClientMock).toHaveBeenCalledTimes(2);
    expect(repoMock).toHaveBeenCalledTimes(2);

    // The second caller got their OWN token/client — no identity leak.
    expect(mintMock).toHaveBeenNthCalledWith(1, { userId: "sales-A" });
    expect(mintMock).toHaveBeenNthCalledWith(2, { userId: "sales-B" });
    expect(authedClientMock).toHaveBeenNthCalledWith(1, { token: "token-for-sales-A" });
    expect(authedClientMock).toHaveBeenNthCalledWith(2, { token: "token-for-sales-B" });
  });

  it("keeps the service-role singleton + activation-email use-case as the parachute", async () => {
    const mod = await import("@/lib/wiring/pricing");
    // The master-key singleton MUST still be exported (rollback + email path).
    expect(mod.pricingService).toBeDefined();
    // The activation-email use-case stays on the service-role posture (E1).
    expect(mod.pricingActivationEmail).toBeDefined();
  });
});
