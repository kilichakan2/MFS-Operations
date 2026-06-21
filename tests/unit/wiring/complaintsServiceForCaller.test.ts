/**
 * tests/unit/wiring/complaintsServiceForCaller.test.ts
 *
 * F-RLS-04f — proves the per-request authenticated Complaints wiring factory.
 *
 * `complaintsServiceForCaller(callerUserId)` must, for EACH call:
 *   - mint a fresh DB token via dbTokenMinter.mint({ userId: callerUserId })
 *   - build a fresh authenticated client via authenticatedClientForCaller({ token })
 *   - build the Supabase Complaints TABLE adapter bound to THAT client
 *   - build the service with `complaints` = the per-caller table repo
 *     (createComplaintsService) — SINGLE port. Unlike cash there is NO storage
 *     port and NO RPC, so there is nothing else to assert; do NOT expect an
 *     `attachments` (or any second) port.
 *   - return a ComplaintsService built from that port
 *
 * Critically it must NEVER memoize: two calls → two mints → two client builds.
 * A memoized client would leak one caller's identity to another (Risk R-CONC-1;
 * the mirror of the Orders/Routes/Users/Pricing/Cash cutover risk).
 *
 * The vendor seams (dbTokenMinter, authenticatedClientForCaller,
 * createSupabaseComplaintsRepository) are mocked so the test inspects the wiring
 * graph the factory assembles without standing up Supabase. The master-key
 * singleton path is exercised by the existing Complaints adapter unit tests; here
 * we pin the per-caller factory, the single-port shape, and the surviving parachute.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ── Mocks for the seams the factory composes ────────────────────
const mintMock = vi.fn(async (claims: { userId: string }) => `token-for-${claims.userId}`);
const authedClientMock = vi.fn((args: { token: string }) => ({ __client: args.token }));
const complaintsRepoMock = vi.fn((client: unknown) => ({ __complaintsRepo: client }));
const serviceMock = vi.fn((deps: unknown) => ({ __service: deps }));

// The master-key table singleton the module imports at load (for the parachute).
const COMPLAINTS_SINGLETON = { __masterKeyComplaintsSingleton: true } as const;

vi.mock("@/lib/wiring/dbToken", () => ({
  dbTokenMinter: { mint: (claims: { userId: string }) => mintMock(claims) },
}));

vi.mock("@/lib/adapters/supabase", () => ({
  // The master-key singleton the module imports at load.
  supabaseComplaintsRepository: COMPLAINTS_SINGLETON,
  // The per-caller TABLE adapter factory.
  createSupabaseComplaintsRepository: (client: unknown) => complaintsRepoMock(client),
  authenticatedClientForCaller: (args: { token: string }) => authedClientMock(args),
}));

vi.mock("@/lib/services", () => ({
  createComplaintsService: (deps: unknown) => serviceMock(deps),
}));

describe("F-RLS-04f complaintsServiceForCaller (per-request authenticated wiring)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("mints a token, builds a client, binds the single TABLE port to it", async () => {
    const { complaintsServiceForCaller } = await import("@/lib/wiring/complaints");

    const service = await complaintsServiceForCaller("user-123");

    // Token minted FOR THIS caller.
    expect(mintMock).toHaveBeenCalledTimes(1);
    expect(mintMock).toHaveBeenCalledWith({ userId: "user-123" });

    // Client built from THAT token.
    expect(authedClientMock).toHaveBeenCalledTimes(1);
    expect(authedClientMock).toHaveBeenCalledWith({ token: "token-for-user-123" });

    // The TABLE adapter is bound to THAT per-caller client.
    expect(complaintsRepoMock).toHaveBeenCalledTimes(1);
    expect(complaintsRepoMock).toHaveBeenCalledWith({ __client: "token-for-user-123" });

    // SINGLE PORT: the service is built with ONLY the per-caller complaints repo.
    // createComplaintsService is ALSO invoked once at module load for the
    // master-key singleton, so assert the per-caller call SHAPE rather than a
    // total call count.
    expect(serviceMock).toHaveBeenCalledWith({
      complaints: { __complaintsRepo: { __client: "token-for-user-123" } },
    });

    // No second port (the single-port difference from cash — there is no
    // `attachments` / storage / RPC port to assert).
    const passedDeps = serviceMock.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(Object.keys(passedDeps)).toEqual(["complaints"]);

    // Returns whatever createComplaintsService produced.
    expect(service).toEqual({
      __service: { complaints: { __complaintsRepo: { __client: "token-for-user-123" } } },
    });
  });

  it("NEVER memoizes — each call mints a fresh token and builds a fresh client", async () => {
    const { complaintsServiceForCaller } = await import("@/lib/wiring/complaints");

    await complaintsServiceForCaller("user-A");
    await complaintsServiceForCaller("user-B");

    // Two calls → two mints, two client builds, two TABLE-adapter builds.
    expect(mintMock).toHaveBeenCalledTimes(2);
    expect(authedClientMock).toHaveBeenCalledTimes(2);
    expect(complaintsRepoMock).toHaveBeenCalledTimes(2);

    // The second caller got their OWN token/client — no identity leak.
    expect(mintMock).toHaveBeenNthCalledWith(1, { userId: "user-A" });
    expect(mintMock).toHaveBeenNthCalledWith(2, { userId: "user-B" });
    expect(authedClientMock).toHaveBeenNthCalledWith(1, { token: "token-for-user-A" });
    expect(authedClientMock).toHaveBeenNthCalledWith(2, { token: "token-for-user-B" });
  });

  it("keeps the master-key complaintsService singleton as the rollback parachute", async () => {
    const mod = await import("@/lib/wiring/complaints");
    // The master-key singleton MUST still be exported (rollback parachute).
    expect(mod.complaintsService).toBeDefined();
  });
});
