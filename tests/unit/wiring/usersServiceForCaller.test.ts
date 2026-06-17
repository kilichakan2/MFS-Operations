/**
 * tests/unit/wiring/usersServiceForCaller.test.ts
 *
 * F-RLS-04b — proves the per-request authenticated Users wiring factory.
 *
 * `usersServiceForCaller(callerUserId)` must, for EACH call:
 *   - mint a fresh DB token via dbTokenMinter.mint({ userId: callerUserId })
 *   - build a fresh authenticated client via authenticatedClientForCaller({ token })
 *   - build the Supabase Users adapter bound to THAT client
 *   - return a UsersService built from ports (createUsersService)
 *
 * Critically it must NEVER memoize: two calls → two mints → two client
 * builds. A memoized client would leak one admin's identity to another
 * (Risk R4 mirror from the Orders cutover).
 *
 * The vendor seams (dbTokenMinter, authenticatedClientForCaller,
 * createSupabaseUsersRepository) are mocked so the test inspects the wiring
 * graph the factory assembles without standing up Supabase. The
 * service-role singleton path is exercised by the existing UsersRepository
 * unit tests; here we only pin the per-caller factory.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ── Mocks for the three seams the factory composes ──────────────
const mintMock = vi.fn(async (claims: { userId: string }) => `token-for-${claims.userId}`);
const authedClientMock = vi.fn((args: { token: string }) => ({ __client: args.token }));
const repoMock = vi.fn((client: unknown) => ({ __repo: client }));
const serviceMock = vi.fn((deps: unknown) => ({ __service: deps }));

vi.mock("@/lib/wiring/dbToken", () => ({
  dbTokenMinter: { mint: (claims: { userId: string }) => mintMock(claims) },
}));

vi.mock("@/lib/adapters/supabase", () => ({
  // The service-role singleton the module also imports at load.
  supabaseUsersRepository: { __serviceRoleSingleton: true },
  createSupabaseUsersRepository: (client: unknown) => repoMock(client),
  authenticatedClientForCaller: (args: { token: string }) => authedClientMock(args),
}));

vi.mock("@/lib/services", () => ({
  createUsersService: (deps: unknown) => serviceMock(deps),
}));

vi.mock("@/lib/wiring/password", () => ({
  passwordHasher: { __passwordHasher: true },
}));

describe("F-RLS-04b usersServiceForCaller (per-request authenticated wiring)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("mints a token for the caller, builds a client, returns a UsersService", async () => {
    const { usersServiceForCaller } = await import("@/lib/wiring/users");

    const service = await usersServiceForCaller("admin-123");

    // Token minted FOR THIS caller.
    expect(mintMock).toHaveBeenCalledTimes(1);
    expect(mintMock).toHaveBeenCalledWith({ userId: "admin-123" });

    // Client built from THAT token.
    expect(authedClientMock).toHaveBeenCalledTimes(1);
    expect(authedClientMock).toHaveBeenCalledWith({ token: "token-for-admin-123" });

    // Adapter bound to THAT client.
    expect(repoMock).toHaveBeenCalledTimes(1);
    expect(repoMock).toHaveBeenCalledWith({ __client: "token-for-admin-123" });

    // Service built from ports (the authed repo + the shared passwordHasher).
    // NOTE: createUsersService is ALSO invoked once at module load for the
    // service-role singleton, so we assert the per-caller call happened with
    // the authed repo rather than pinning a total call count.
    expect(serviceMock).toHaveBeenCalledWith({
      users: { __repo: { __client: "token-for-admin-123" } },
      passwordHasher: { __passwordHasher: true },
    });

    // Returns whatever createUsersService produced.
    expect(service).toEqual({
      __service: {
        users: { __repo: { __client: "token-for-admin-123" } },
        passwordHasher: { __passwordHasher: true },
      },
    });
  });

  it("NEVER memoizes — each call mints a fresh token and builds a fresh client", async () => {
    const { usersServiceForCaller } = await import("@/lib/wiring/users");

    await usersServiceForCaller("admin-A");
    await usersServiceForCaller("admin-B");

    // Two calls → two mints, two client builds, two adapter builds.
    expect(mintMock).toHaveBeenCalledTimes(2);
    expect(authedClientMock).toHaveBeenCalledTimes(2);
    expect(repoMock).toHaveBeenCalledTimes(2);

    // The second caller got their OWN token/client — no identity leak.
    expect(mintMock).toHaveBeenNthCalledWith(1, { userId: "admin-A" });
    expect(mintMock).toHaveBeenNthCalledWith(2, { userId: "admin-B" });
    expect(authedClientMock).toHaveBeenNthCalledWith(1, { token: "token-for-admin-A" });
    expect(authedClientMock).toHaveBeenNthCalledWith(2, { token: "token-for-admin-B" });
  });

  it("keeps the service-role singleton available as the rollback parachute", async () => {
    const mod = await import("@/lib/wiring/users");
    // The master-key singleton MUST still be exported (5 public routes + rollback).
    expect(mod.usersService).toBeDefined();
  });
});
