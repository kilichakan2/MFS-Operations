/**
 * tests/unit/wiring/complimentsServiceForCaller.test.ts
 *
 * F-RLS-04f — proves the per-request authenticated Compliments wiring factory.
 *
 * `complimentsServiceForCaller(callerUserId)` must, for EACH call:
 *   - mint a fresh DB token via dbTokenMinter.mint({ userId: callerUserId })
 *   - build a fresh authenticated client via authenticatedClientForCaller({ token })
 *   - build the Supabase Compliments TABLE adapter bound to THAT client
 *   - build the service with `compliments` = the per-caller table repo
 *     (createComplimentsService) — SINGLE port. Unlike cash there is NO storage
 *     port and NO RPC, so there is nothing else to assert; do NOT expect a second
 *     port.
 *   - return a ComplimentsService built from that port
 *
 * Critically it must NEVER memoize: two calls → two mints → two client builds.
 * A memoized client would leak one caller's identity to another (Risk R-CONC-1).
 *
 * The vendor seams are mocked so the test inspects the wiring graph the factory
 * assembles without standing up Supabase.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ── Mocks for the seams the factory composes ────────────────────
const mintMock = vi.fn(async (claims: { userId: string }) => `token-for-${claims.userId}`);
const authedClientMock = vi.fn((args: { token: string }) => ({ __client: args.token }));
const complimentsRepoMock = vi.fn((client: unknown) => ({ __complimentsRepo: client }));
const serviceMock = vi.fn((deps: unknown) => ({ __service: deps }));

// The master-key table singleton the module imports at load (for the parachute).
const COMPLIMENTS_SINGLETON = { __masterKeyComplimentsSingleton: true } as const;

vi.mock("@/lib/wiring/dbToken", () => ({
  dbTokenMinter: { mint: (claims: { userId: string }) => mintMock(claims) },
}));

vi.mock("@/lib/adapters/supabase", () => ({
  supabaseComplimentsRepository: COMPLIMENTS_SINGLETON,
  createSupabaseComplimentsRepository: (client: unknown) => complimentsRepoMock(client),
  authenticatedClientForCaller: (args: { token: string }) => authedClientMock(args),
}));

vi.mock("@/lib/services", () => ({
  createComplimentsService: (deps: unknown) => serviceMock(deps),
}));

describe("F-RLS-04f complimentsServiceForCaller (per-request authenticated wiring)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("mints a token, builds a client, binds the single TABLE port to it", async () => {
    const { complimentsServiceForCaller } = await import("@/lib/wiring/compliments");

    const service = await complimentsServiceForCaller("user-123");

    expect(mintMock).toHaveBeenCalledTimes(1);
    expect(mintMock).toHaveBeenCalledWith({ userId: "user-123" });

    expect(authedClientMock).toHaveBeenCalledTimes(1);
    expect(authedClientMock).toHaveBeenCalledWith({ token: "token-for-user-123" });

    expect(complimentsRepoMock).toHaveBeenCalledTimes(1);
    expect(complimentsRepoMock).toHaveBeenCalledWith({ __client: "token-for-user-123" });

    // SINGLE PORT: the service is built with ONLY the per-caller compliments repo.
    expect(serviceMock).toHaveBeenCalledWith({
      compliments: { __complimentsRepo: { __client: "token-for-user-123" } },
    });

    // No second port (the single-port difference from cash).
    const passedDeps = serviceMock.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(Object.keys(passedDeps)).toEqual(["compliments"]);

    expect(service).toEqual({
      __service: { compliments: { __complimentsRepo: { __client: "token-for-user-123" } } },
    });
  });

  it("NEVER memoizes — each call mints a fresh token and builds a fresh client", async () => {
    const { complimentsServiceForCaller } = await import("@/lib/wiring/compliments");

    await complimentsServiceForCaller("user-A");
    await complimentsServiceForCaller("user-B");

    expect(mintMock).toHaveBeenCalledTimes(2);
    expect(authedClientMock).toHaveBeenCalledTimes(2);
    expect(complimentsRepoMock).toHaveBeenCalledTimes(2);

    expect(mintMock).toHaveBeenNthCalledWith(1, { userId: "user-A" });
    expect(mintMock).toHaveBeenNthCalledWith(2, { userId: "user-B" });
    expect(authedClientMock).toHaveBeenNthCalledWith(1, { token: "token-for-user-A" });
    expect(authedClientMock).toHaveBeenNthCalledWith(2, { token: "token-for-user-B" });
  });

  it("keeps the master-key complimentsService singleton as the rollback parachute", async () => {
    const mod = await import("@/lib/wiring/compliments");
    expect(mod.complimentsService).toBeDefined();
  });
});
