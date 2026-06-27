/**
 * tests/unit/wiring/adminContextForCaller.test.ts
 *
 * F-RLS-04i — proves the four NEW per-request authenticated admin-context wiring
 * factories: `customersServiceForCaller`, `productsServiceForCaller`,
 * `auditLogForCaller`, and `mapDataServiceForCaller`.
 *
 * Each factory must, for EACH call:
 *   - mint a fresh DB token via dbTokenMinter.mint({ userId: callerUserId })
 *   - build a fresh authenticated client via authenticatedClientForCaller({ token })
 *   - bind the relevant per-caller Supabase adapter(s) to THAT client
 *   - return the service / repository built from those port(s)
 *
 * Critically each must NEVER memoize: two calls → two mints → two client builds.
 * A memoized client would leak one caller's identity to another (Risk
 * R-IDENTITY). `mapDataServiceForCaller` additionally proves a SINGLE mint feeds
 * BOTH ports (customers + visits) — one key, two repos (mirrors
 * `submitHaccpDailyCheckForCaller`).
 *
 * The vendor seams (dbTokenMinter, authenticatedClientForCaller, the per-caller
 * adapter constructors) are mocked so the test inspects the wiring graph each
 * factory assembles without standing up Supabase. The master-key singleton path
 * is exercised by the existing adapter unit tests; here we pin the per-caller
 * factories, their port shapes, the single-mint-for-two-ports invariant, and the
 * surviving parachute singletons.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ── Mocks for the seams the factories compose ───────────────────
const mintMock = vi.fn(async (claims: { userId: string }) => `token-for-${claims.userId}`);
const authedClientMock = vi.fn((args: { token: string }) => ({ __client: args.token }));
const customersRepoMock = vi.fn((client: unknown) => ({ __customersRepo: client }));
const productsRepoMock = vi.fn((client: unknown) => ({ __productsRepo: client }));
const visitsRepoMock = vi.fn((client: unknown) => ({ __visitsRepo: client }));
const auditLogRepoMock = vi.fn((client: unknown) => ({ __auditLogRepo: client }));
const customersServiceMock = vi.fn((deps: unknown) => ({ __customersService: deps }));
const productsServiceMock = vi.fn((deps: unknown) => ({ __productsService: deps }));
const mapDataServiceMock = vi.fn((deps: unknown) => ({ __mapDataService: deps }));

// The master-key singletons the modules import at load (the parachutes).
const CUSTOMERS_SINGLETON = { __masterKeyCustomersSingleton: true } as const;
const PRODUCTS_SINGLETON = { __masterKeyProductsSingleton: true } as const;
const VISITS_SINGLETON = { __masterKeyVisitsSingleton: true } as const;
const AUDIT_LOG_SINGLETON = { __masterKeyAuditLogSingleton: true } as const;

vi.mock("@/lib/wiring/dbToken", () => ({
  dbTokenMinter: { mint: (claims: { userId: string }) => mintMock(claims) },
}));

vi.mock("@/lib/adapters/supabase", () => ({
  // Master-key singletons imported at load (parachutes).
  supabaseCustomersRepository: CUSTOMERS_SINGLETON,
  supabaseProductsRepository: PRODUCTS_SINGLETON,
  supabaseVisitsRepository: VISITS_SINGLETON,
  supabaseAuditLogRepository: AUDIT_LOG_SINGLETON,
  // Per-caller TABLE adapter factories.
  createSupabaseCustomersRepository: (client: unknown) => customersRepoMock(client),
  createSupabaseProductsRepository: (client: unknown) => productsRepoMock(client),
  createSupabaseVisitsRepository: (client: unknown) => visitsRepoMock(client),
  createSupabaseAuditLogRepository: (client: unknown) => auditLogRepoMock(client),
  authenticatedClientForCaller: (args: { token: string }) => authedClientMock(args),
}));

vi.mock("@/lib/services", () => ({
  createCustomersService: (deps: unknown) => customersServiceMock(deps),
  createProductsService: (deps: unknown) => productsServiceMock(deps),
  createMapDataService: (deps: unknown) => mapDataServiceMock(deps),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

// ── customersServiceForCaller ───────────────────────────────────
describe("F-RLS-04i customersServiceForCaller", () => {
  it("mints a token, builds a client, binds the single customers port to it", async () => {
    const { customersServiceForCaller } = await import("@/lib/wiring/customers");
    const service = await customersServiceForCaller("user-123");

    expect(mintMock).toHaveBeenCalledTimes(1);
    expect(mintMock).toHaveBeenCalledWith({ userId: "user-123" });
    expect(authedClientMock).toHaveBeenCalledTimes(1);
    expect(authedClientMock).toHaveBeenCalledWith({ token: "token-for-user-123" });
    expect(customersRepoMock).toHaveBeenCalledWith({ __client: "token-for-user-123" });

    expect(customersServiceMock).toHaveBeenCalledWith({
      customers: { __customersRepo: { __client: "token-for-user-123" } },
    });
    const deps = customersServiceMock.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(Object.keys(deps)).toEqual(["customers"]);
    expect(service).toEqual({
      __customersService: { customers: { __customersRepo: { __client: "token-for-user-123" } } },
    });
  });

  it("NEVER memoizes — each call mints a fresh token + client", async () => {
    const { customersServiceForCaller } = await import("@/lib/wiring/customers");
    await customersServiceForCaller("user-A");
    await customersServiceForCaller("user-B");

    expect(mintMock).toHaveBeenCalledTimes(2);
    expect(authedClientMock).toHaveBeenCalledTimes(2);
    expect(customersRepoMock).toHaveBeenCalledTimes(2);
    expect(mintMock).toHaveBeenNthCalledWith(1, { userId: "user-A" });
    expect(mintMock).toHaveBeenNthCalledWith(2, { userId: "user-B" });
  });

  it("keeps the master-key customersService singleton (rollback parachute)", async () => {
    const mod = await import("@/lib/wiring/customers");
    expect(mod.customersService).toBeDefined();
  });
});

// ── productsServiceForCaller ────────────────────────────────────
describe("F-RLS-04i productsServiceForCaller", () => {
  it("mints a token, builds a client, binds the single products port to it", async () => {
    const { productsServiceForCaller } = await import("@/lib/wiring/products");
    const service = await productsServiceForCaller("user-123");

    expect(mintMock).toHaveBeenCalledWith({ userId: "user-123" });
    expect(authedClientMock).toHaveBeenCalledWith({ token: "token-for-user-123" });
    expect(productsRepoMock).toHaveBeenCalledWith({ __client: "token-for-user-123" });

    expect(productsServiceMock).toHaveBeenCalledWith({
      products: { __productsRepo: { __client: "token-for-user-123" } },
    });
    const deps = productsServiceMock.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(Object.keys(deps)).toEqual(["products"]);
    expect(service).toEqual({
      __productsService: { products: { __productsRepo: { __client: "token-for-user-123" } } },
    });
  });

  it("NEVER memoizes — each call mints a fresh token + client", async () => {
    const { productsServiceForCaller } = await import("@/lib/wiring/products");
    await productsServiceForCaller("user-A");
    await productsServiceForCaller("user-B");
    expect(mintMock).toHaveBeenCalledTimes(2);
    expect(authedClientMock).toHaveBeenCalledTimes(2);
    expect(productsRepoMock).toHaveBeenCalledTimes(2);
  });

  it("keeps the master-key productsService singleton (rollback parachute)", async () => {
    const mod = await import("@/lib/wiring/products");
    expect(mod.productsService).toBeDefined();
  });
});

// ── auditLogForCaller ───────────────────────────────────────────
describe("F-RLS-04i auditLogForCaller", () => {
  it("mints a token, builds a client, returns the per-caller audit-log repo", async () => {
    const { auditLogForCaller } = await import("@/lib/wiring/auditLog");
    const repo = await auditLogForCaller("user-123");

    expect(mintMock).toHaveBeenCalledWith({ userId: "user-123" });
    expect(authedClientMock).toHaveBeenCalledWith({ token: "token-for-user-123" });
    expect(auditLogRepoMock).toHaveBeenCalledWith({ __client: "token-for-user-123" });
    // Bare repository — NOT wrapped in a service.
    expect(repo).toEqual({ __auditLogRepo: { __client: "token-for-user-123" } });
  });

  it("NEVER memoizes — each call mints a fresh token + client", async () => {
    const { auditLogForCaller } = await import("@/lib/wiring/auditLog");
    await auditLogForCaller("user-A");
    await auditLogForCaller("user-B");
    expect(mintMock).toHaveBeenCalledTimes(2);
    expect(authedClientMock).toHaveBeenCalledTimes(2);
    expect(auditLogRepoMock).toHaveBeenCalledTimes(2);
  });

  it("keeps the master-key auditLog singleton (rollback parachute)", async () => {
    const mod = await import("@/lib/wiring/auditLog");
    expect(mod.auditLog).toBeDefined();
  });
});

// ── mapDataServiceForCaller (single mint, TWO ports) ────────────
describe("F-RLS-04i mapDataServiceForCaller", () => {
  it("mints ONCE and feeds BOTH ports (customers + visits) from the same client", async () => {
    const { mapDataServiceForCaller } = await import("@/lib/wiring/mapData");
    const service = await mapDataServiceForCaller("user-123");

    // SINGLE mint + SINGLE client build feeding two ports.
    expect(mintMock).toHaveBeenCalledTimes(1);
    expect(mintMock).toHaveBeenCalledWith({ userId: "user-123" });
    expect(authedClientMock).toHaveBeenCalledTimes(1);
    expect(authedClientMock).toHaveBeenCalledWith({ token: "token-for-user-123" });

    // BOTH per-caller repos built from THAT same client.
    expect(customersRepoMock).toHaveBeenCalledWith({ __client: "token-for-user-123" });
    expect(visitsRepoMock).toHaveBeenCalledWith({ __client: "token-for-user-123" });

    expect(mapDataServiceMock).toHaveBeenCalledWith({
      customers: { __customersRepo: { __client: "token-for-user-123" } },
      visits: { __visitsRepo: { __client: "token-for-user-123" } },
    });
    const deps = mapDataServiceMock.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(Object.keys(deps)).toEqual(["customers", "visits"]);
    expect(service).toEqual({
      __mapDataService: {
        customers: { __customersRepo: { __client: "token-for-user-123" } },
        visits: { __visitsRepo: { __client: "token-for-user-123" } },
      },
    });
  });

  it("NEVER memoizes — each call mints a fresh token + client", async () => {
    const { mapDataServiceForCaller } = await import("@/lib/wiring/mapData");
    await mapDataServiceForCaller("user-A");
    await mapDataServiceForCaller("user-B");
    expect(mintMock).toHaveBeenCalledTimes(2);
    expect(authedClientMock).toHaveBeenCalledTimes(2);
    expect(customersRepoMock).toHaveBeenCalledTimes(2);
    expect(visitsRepoMock).toHaveBeenCalledTimes(2);
  });

  it("keeps the master-key mapDataService singleton (rollback parachute)", async () => {
    const mod = await import("@/lib/wiring/mapData");
    expect(mod.mapDataService).toBeDefined();
  });
});
