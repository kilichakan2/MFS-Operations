/**
 * tests/unit/wiring/cashServiceForCaller.test.ts
 *
 * F-RLS-04e — proves the per-request authenticated Cash wiring factory.
 *
 * `cashServiceForCaller(callerUserId)` must, for EACH call:
 *   - mint a fresh DB token via dbTokenMinter.mint({ userId: callerUserId })
 *   - build a fresh authenticated client via authenticatedClientForCaller({ token })
 *   - build the Supabase Cash TABLE adapter bound to THAT client
 *   - build the service with `cash` = the per-caller table repo AND
 *     `attachments` = the MASTER-KEY supabaseAttachmentStorage singleton (NOT a
 *     per-caller storage). The cash-attachments bucket has no authenticated
 *     storage.objects policies, so a per-caller token would fail-closed-deny all
 *     file ops — the storage port MUST stay on the master-key singleton (E1).
 *   - return a CashService built from those ports (createCashService)
 *
 * Critically it must NEVER memoize: two calls → two mints → two client builds.
 * A memoized client would leak one caller's identity to another (Risk R-CONC-1;
 * the mirror of the Orders/Routes/Users/Pricing cutover risk).
 *
 * The vendor seams (dbTokenMinter, authenticatedClientForCaller,
 * createSupabaseCashRepository) are mocked so the test inspects the wiring graph
 * the factory assembles without standing up Supabase. The master-key singleton
 * path is exercised by the existing Cash adapter unit tests; here we pin the
 * per-caller factory, the two-port split, and the surviving parachute.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ── Mocks for the seams the factory composes ────────────────────
const mintMock = vi.fn(async (claims: { userId: string }) => `token-for-${claims.userId}`);
const authedClientMock = vi.fn((args: { token: string }) => ({ __client: args.token }));
const cashRepoMock = vi.fn((client: unknown) => ({ __cashRepo: client }));
const serviceMock = vi.fn((deps: unknown) => ({ __service: deps }));

// The master-key storage singleton the module imports at load. A distinct,
// identifiable object so the test can assert the storage port is THIS exact
// singleton (not a per-caller storage).
const STORAGE_SINGLETON = { __masterKeyStorageSingleton: true } as const;
// The master-key table singleton the module also imports (for the parachute).
const CASH_SINGLETON = { __masterKeyCashSingleton: true } as const;

vi.mock("@/lib/wiring/dbToken", () => ({
  dbTokenMinter: { mint: (claims: { userId: string }) => mintMock(claims) },
}));

vi.mock("@/lib/adapters/supabase", () => ({
  // The master-key singletons the module imports at load.
  supabaseCashRepository: CASH_SINGLETON,
  supabaseAttachmentStorage: STORAGE_SINGLETON,
  // The per-caller TABLE adapter factory.
  createSupabaseCashRepository: (client: unknown) => cashRepoMock(client),
  authenticatedClientForCaller: (args: { token: string }) => authedClientMock(args),
}));

vi.mock("@/lib/services", () => ({
  createCashService: (deps: unknown) => serviceMock(deps),
}));

describe("F-RLS-04e cashServiceForCaller (per-request authenticated wiring)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("mints a token, builds a client, binds the TABLE port to it, keeps STORAGE on the master-key singleton", async () => {
    const { cashServiceForCaller } = await import("@/lib/wiring/cash");

    const service = await cashServiceForCaller("office-123");

    // Token minted FOR THIS caller.
    expect(mintMock).toHaveBeenCalledTimes(1);
    expect(mintMock).toHaveBeenCalledWith({ userId: "office-123" });

    // Client built from THAT token.
    expect(authedClientMock).toHaveBeenCalledTimes(1);
    expect(authedClientMock).toHaveBeenCalledWith({ token: "token-for-office-123" });

    // The TABLE adapter is bound to THAT per-caller client.
    expect(cashRepoMock).toHaveBeenCalledTimes(1);
    expect(cashRepoMock).toHaveBeenCalledWith({ __client: "token-for-office-123" });

    // The service is built with the per-caller TABLE repo AND the MASTER-KEY
    // storage singleton — the cash-specific two-port split. createCashService is
    // ALSO invoked once at module load for the master-key singleton, so we assert
    // the per-caller call shape rather than pinning a total call count.
    expect(serviceMock).toHaveBeenCalledWith({
      cash: { __cashRepo: { __client: "token-for-office-123" } },
      attachments: STORAGE_SINGLETON,
    });

    // THE CASH-SPECIFIC MUST-FIX: the storage port handed to the per-caller
    // service is the EXACT master-key singleton object, never a per-caller
    // storage. A naive copy of the single-port pricing factory would drop this.
    const passedDeps = serviceMock.mock.calls.at(-1)?.[0] as {
      attachments: unknown;
    };
    expect(passedDeps.attachments).toBe(STORAGE_SINGLETON);

    // Returns whatever createCashService produced.
    expect(service).toEqual({
      __service: {
        cash: { __cashRepo: { __client: "token-for-office-123" } },
        attachments: STORAGE_SINGLETON,
      },
    });
  });

  it("NEVER memoizes — each call mints a fresh token and builds a fresh client", async () => {
    const { cashServiceForCaller } = await import("@/lib/wiring/cash");

    await cashServiceForCaller("office-A");
    await cashServiceForCaller("office-B");

    // Two calls → two mints, two client builds, two TABLE-adapter builds.
    expect(mintMock).toHaveBeenCalledTimes(2);
    expect(authedClientMock).toHaveBeenCalledTimes(2);
    expect(cashRepoMock).toHaveBeenCalledTimes(2);

    // The second caller got their OWN token/client — no identity leak.
    expect(mintMock).toHaveBeenNthCalledWith(1, { userId: "office-A" });
    expect(mintMock).toHaveBeenNthCalledWith(2, { userId: "office-B" });
    expect(authedClientMock).toHaveBeenNthCalledWith(1, { token: "token-for-office-A" });
    expect(authedClientMock).toHaveBeenNthCalledWith(2, { token: "token-for-office-B" });
  });

  it("keeps the master-key cashService singleton as the rollback parachute", async () => {
    const mod = await import("@/lib/wiring/cash");
    // The master-key singleton MUST still be exported (rollback parachute).
    expect(mod.cashService).toBeDefined();
  });
});
