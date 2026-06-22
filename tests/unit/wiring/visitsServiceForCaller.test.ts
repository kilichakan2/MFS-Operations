/**
 * tests/unit/wiring/visitsServiceForCaller.test.ts
 *
 * F-RLS-04g — proves the per-request authenticated Visits wiring factory.
 *
 * `visitsServiceForCaller(callerUserId)` must, for EACH call:
 *   - mint a fresh DB token via dbTokenMinter.mint({ userId: callerUserId })
 *   - build a fresh authenticated client via authenticatedClientForCaller({ token })
 *   - build the Supabase Visits TABLE adapter bound to THAT client
 *   - build the service with `visits` = the per-caller table repo
 *     (createVisitsService) — SINGLE port. Like complaints there is NO storage
 *     port and NO RPC, so there is nothing else to assert; do NOT expect any
 *     second port.
 *   - return a VisitsService built from that port
 *
 * Critically it must NEVER memoize: two calls → two mints → two client builds.
 * A memoized client would leak one caller's identity to another (Risk R-CONC-1;
 * the mirror of the Orders/Routes/Users/Pricing/Cash/Complaints cutover risk).
 *
 * The vendor seams (dbTokenMinter, authenticatedClientForCaller,
 * createSupabaseVisitsRepository) are mocked so the test inspects the wiring
 * graph the factory assembles without standing up Supabase. The master-key
 * singleton path is exercised by the existing Visits adapter unit tests; here we
 * pin the per-caller factory, the single-port shape, and the surviving parachute.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ── Mocks for the seams the factory composes ────────────────────
const mintMock = vi.fn(async (claims: { userId: string }) => `token-for-${claims.userId}`);
const authedClientMock = vi.fn((args: { token: string }) => ({ __client: args.token }));
const visitsRepoMock = vi.fn((client: unknown) => ({ __visitsRepo: client }));
const serviceMock = vi.fn((deps: unknown) => ({ __service: deps }));

// The master-key table singleton the module imports at load (for the parachute).
const VISITS_SINGLETON = { __masterKeyVisitsSingleton: true } as const;

vi.mock("@/lib/wiring/dbToken", () => ({
  dbTokenMinter: { mint: (claims: { userId: string }) => mintMock(claims) },
}));

vi.mock("@/lib/adapters/supabase", () => ({
  // The master-key singleton the module imports at load.
  supabaseVisitsRepository: VISITS_SINGLETON,
  // The per-caller TABLE adapter factory.
  createSupabaseVisitsRepository: (client: unknown) => visitsRepoMock(client),
  authenticatedClientForCaller: (args: { token: string }) => authedClientMock(args),
}));

vi.mock("@/lib/services", () => ({
  createVisitsService: (deps: unknown) => serviceMock(deps),
}));

describe("F-RLS-04g visitsServiceForCaller (per-request authenticated wiring)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("mints a token, builds a client, binds the single TABLE port to it", async () => {
    const { visitsServiceForCaller } = await import("@/lib/wiring/visits");

    const service = await visitsServiceForCaller("user-123");

    // Token minted FOR THIS caller.
    expect(mintMock).toHaveBeenCalledTimes(1);
    expect(mintMock).toHaveBeenCalledWith({ userId: "user-123" });

    // Client built from THAT token.
    expect(authedClientMock).toHaveBeenCalledTimes(1);
    expect(authedClientMock).toHaveBeenCalledWith({ token: "token-for-user-123" });

    // The TABLE adapter is bound to THAT per-caller client.
    expect(visitsRepoMock).toHaveBeenCalledTimes(1);
    expect(visitsRepoMock).toHaveBeenCalledWith({ __client: "token-for-user-123" });

    // SINGLE PORT: the service is built with ONLY the per-caller visits repo.
    // createVisitsService is ALSO invoked once at module load for the master-key
    // singleton, so assert the per-caller call SHAPE rather than a total count.
    expect(serviceMock).toHaveBeenCalledWith({
      visits: { __visitsRepo: { __client: "token-for-user-123" } },
    });

    // No second port (the single-port shape — there is no storage / RPC port).
    const passedDeps = serviceMock.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(Object.keys(passedDeps)).toEqual(["visits"]);

    // Returns whatever createVisitsService produced.
    expect(service).toEqual({
      __service: { visits: { __visitsRepo: { __client: "token-for-user-123" } } },
    });
  });

  it("NEVER memoizes — each call mints a fresh token and builds a fresh client", async () => {
    const { visitsServiceForCaller } = await import("@/lib/wiring/visits");

    await visitsServiceForCaller("user-A");
    await visitsServiceForCaller("user-B");

    // Two calls → two mints, two client builds, two TABLE-adapter builds.
    expect(mintMock).toHaveBeenCalledTimes(2);
    expect(authedClientMock).toHaveBeenCalledTimes(2);
    expect(visitsRepoMock).toHaveBeenCalledTimes(2);

    // The second caller got their OWN token/client — no identity leak.
    expect(mintMock).toHaveBeenNthCalledWith(1, { userId: "user-A" });
    expect(mintMock).toHaveBeenNthCalledWith(2, { userId: "user-B" });
    expect(authedClientMock).toHaveBeenNthCalledWith(1, { token: "token-for-user-A" });
    expect(authedClientMock).toHaveBeenNthCalledWith(2, { token: "token-for-user-B" });
  });

  it("keeps the master-key visitsService singleton as the rollback parachute", async () => {
    const mod = await import("@/lib/wiring/visits");
    // The master-key singleton MUST still be exported (rollback parachute).
    expect(mod.visitsService).toBeDefined();
  });
});
