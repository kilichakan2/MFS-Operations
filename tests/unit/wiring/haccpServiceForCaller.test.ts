/**
 * tests/unit/wiring/haccpServiceForCaller.test.ts
 *
 * F-19 PR10a / F-RLS-04h — proves the per-request authenticated HACCP wiring
 * factories (`…ForCaller`). Mirrors `complaintsServiceForCaller.test.ts`.
 *
 * Each `…ForCaller(callerUserId)` factory must, for EACH call:
 *   - mint a fresh DB token via dbTokenMinter.mint({ userId: callerUserId })
 *   - build a fresh authenticated client via authenticatedClientForCaller({ token })
 *   - build the per-caller Supabase repo(s) bound to THAT client
 *   - build the service with those per-caller repos
 *   - return the service
 *
 * Critically it must NEVER memoize: two calls → two mints → two client builds.
 * A memoized client would leak one caller's identity to another (Risk R-CONC-1;
 * the mirror of the Orders/Routes/Users/Pricing/Cash/Complaints cutover risk).
 *
 * Coverage is a REPRESENTATIVE subset of the 12 factories — the single-DB-port
 * shape (haccpDailyChecksServiceForCaller), the TWO-port shape (reporting: a
 * per-caller DB port + the SHARED non-DB xlsx exporter), and the MULTI-PORT
 * composition (submitHaccpDailyCheckForCaller mints ONE client and builds the
 * inner corrective-actions service off the SAME client — no second mint). The
 * other single-port factories are byte-identical to the daily-checks one.
 *
 * The vendor seams (dbTokenMinter, authenticatedClientForCaller, the
 * createSupabaseHaccp*Repository factories, the xlsx exporter) are mocked so the
 * test inspects the wiring graph the factory assembles without standing up
 * Supabase. The master-key singleton paths are exercised by the existing HACCP
 * adapter/wiring tests; here we pin the per-caller factories, their shapes, and
 * the surviving parachutes.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ── Mocks for the seams the factories compose ───────────────────
const mintMock = vi.fn(async (claims: { userId: string }) => `token-for-${claims.userId}`);
const authedClientMock = vi.fn((args: { token: string }) => ({ __client: args.token }));

const dailyChecksRepoMock = vi.fn((client: unknown) => ({ __dailyChecksRepo: client }));
const caRepoMock = vi.fn((client: unknown) => ({ __caRepo: client }));
const reportingRepoMock = vi.fn((client: unknown) => ({ __reportingRepo: client }));

const XLSX_EXPORTER = { __xlsxExporterSingleton: true } as const;

// Service / use-case factory mocks — tag the deps so we can assert the graph.
const dailyChecksServiceMock = vi.fn((deps: unknown) => ({ __dailyChecksService: deps }));
const caServiceMock = vi.fn((deps: unknown) => ({ __caService: deps }));
const reportingServiceMock = vi.fn((deps: unknown) => ({ __reportingService: deps }));
const submitUsecaseMock = vi.fn((deps: unknown) => ({ __submitUsecase: deps }));

vi.mock("@/lib/wiring/dbToken", () => ({
  dbTokenMinter: { mint: (claims: { userId: string }) => mintMock(claims) },
}));

vi.mock("@/lib/adapters/supabase", () => ({
  // Master-key singletons the module imports at load (parachutes).
  supabaseHaccpDailyChecksRepository: { __dailyChecksRepoSingleton: true },
  supabaseHaccpCorrectiveActionsRepository: { __caRepoSingleton: true },
  supabaseHaccpAssessmentsRepository: { __assessmentsRepoSingleton: true },
  supabaseHaccpTrainingRepository: { __trainingRepoSingleton: true },
  supabaseHaccpPeopleRepository: { __peopleRepoSingleton: true },
  supabaseHaccpReviewsRepository: { __reviewsRepoSingleton: true },
  supabaseHaccpAnnualReviewRepository: { __annualReviewRepoSingleton: true },
  supabaseHaccpReportingRepository: { __reportingRepoSingleton: true },
  supabaseHaccpHandbookRepository: { __handbookRepoSingleton: true },
  supabaseHaccpSuppliersRepository: { __suppliersRepoSingleton: true },
  supabaseHaccpLookupsRepository: { __lookupsRepoSingleton: true },
  // Per-caller adapter factories (the keycard-bound repos under test).
  createSupabaseHaccpDailyChecksRepository: (c: unknown) => dailyChecksRepoMock(c),
  createSupabaseHaccpCorrectiveActionsRepository: (c: unknown) => caRepoMock(c),
  createSupabaseHaccpAssessmentsRepository: vi.fn(() => ({})),
  createSupabaseHaccpTrainingRepository: vi.fn(() => ({})),
  createSupabaseHaccpPeopleRepository: vi.fn(() => ({})),
  createSupabaseHaccpReviewsRepository: vi.fn(() => ({})),
  createSupabaseHaccpAnnualReviewRepository: vi.fn(() => ({})),
  createSupabaseHaccpReportingRepository: (c: unknown) => reportingRepoMock(c),
  createSupabaseHaccpHandbookRepository: vi.fn(() => ({})),
  createSupabaseHaccpSuppliersRepository: vi.fn(() => ({})),
  createSupabaseHaccpLookupsRepository: vi.fn(() => ({})),
  authenticatedClientForCaller: (args: { token: string }) => authedClientMock(args),
}));

vi.mock("@/lib/adapters/xlsx", () => ({
  xlsxSpreadsheetExporter: XLSX_EXPORTER,
}));

vi.mock("@/lib/services", () => ({
  createHaccpDailyChecksService: (deps: unknown) => dailyChecksServiceMock(deps),
  createHaccpCorrectiveActionsService: (deps: unknown) => caServiceMock(deps),
  createHaccpReportingService: (deps: unknown) => reportingServiceMock(deps),
  // The other service factories are exercised through real wiring at load for
  // the singletons; stub them so the module imports cleanly.
  createHaccpAssessmentsService: vi.fn((deps: unknown) => ({ __assessmentsService: deps })),
  createHaccpTrainingService: vi.fn((deps: unknown) => ({ __trainingService: deps })),
  createHaccpPeopleService: vi.fn((deps: unknown) => ({ __peopleService: deps })),
  createHaccpReviewsService: vi.fn((deps: unknown) => ({ __reviewsService: deps })),
  createHaccpAnnualReviewService: vi.fn((deps: unknown) => ({ __annualReviewService: deps })),
  createHaccpHandbookService: vi.fn((deps: unknown) => ({ __handbookService: deps })),
  createHaccpSuppliersService: vi.fn((deps: unknown) => ({ __suppliersService: deps })),
  createHaccpLookupsService: vi.fn((deps: unknown) => ({ __lookupsService: deps })),
}));

vi.mock("@/lib/usecases/submitHaccpDailyCheck", () => ({
  createSubmitHaccpDailyCheck: (deps: unknown) => submitUsecaseMock(deps),
}));

describe("F-RLS-04h haccp …ForCaller (per-request authenticated wiring)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("single port: haccpDailyChecksServiceForCaller mints a token, builds a client, binds the repo to it", async () => {
    const { haccpDailyChecksServiceForCaller } = await import("@/lib/wiring/haccp");

    const service = await haccpDailyChecksServiceForCaller("user-123");

    expect(mintMock).toHaveBeenCalledTimes(1);
    expect(mintMock).toHaveBeenCalledWith({ userId: "user-123" });

    expect(authedClientMock).toHaveBeenCalledTimes(1);
    expect(authedClientMock).toHaveBeenCalledWith({ token: "token-for-user-123" });

    // The repo is bound to THAT per-caller client.
    expect(dailyChecksRepoMock).toHaveBeenCalledWith({ __client: "token-for-user-123" });

    // SINGLE port: the service is built with ONLY the per-caller dailyChecks repo.
    const deps = dailyChecksServiceMock.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(Object.keys(deps)).toEqual(["dailyChecks"]);
    expect(deps.dailyChecks).toEqual({ __dailyChecksRepo: { __client: "token-for-user-123" } });

    expect(service).toEqual({
      __dailyChecksService: {
        dailyChecks: { __dailyChecksRepo: { __client: "token-for-user-123" } },
      },
    });
  });

  it("two ports: haccpReportingServiceForCaller binds the DB port per-caller, keeps the xlsx exporter SHARED", async () => {
    const { haccpReportingServiceForCaller } = await import("@/lib/wiring/haccp");

    await haccpReportingServiceForCaller("user-rpt");

    expect(mintMock).toHaveBeenCalledTimes(1);
    expect(reportingRepoMock).toHaveBeenCalledWith({ __client: "token-for-user-rpt" });

    const deps = reportingServiceMock.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(Object.keys(deps).sort()).toEqual(["reporting", "spreadsheet"]);
    // DB port is per-caller (keycard); the non-DB xlsx exporter stays the SHARED
    // singleton (no identity → not minted per caller).
    expect(deps.reporting).toEqual({ __reportingRepo: { __client: "token-for-user-rpt" } });
    expect(deps.spreadsheet).toBe(XLSX_EXPORTER);
  });

  it("multi-port composition: submitHaccpDailyCheckForCaller mints ONE client and builds the inner CA service off the SAME client", async () => {
    const { submitHaccpDailyCheckForCaller } = await import("@/lib/wiring/haccp");

    await submitHaccpDailyCheckForCaller("user-sub");

    // Exactly ONE mint / ONE client for the whole composition (NOT two).
    expect(mintMock).toHaveBeenCalledTimes(1);
    expect(authedClientMock).toHaveBeenCalledTimes(1);
    expect(authedClientMock).toHaveBeenCalledWith({ token: "token-for-user-sub" });

    // The inner CA service is built from a CA repo bound to THAT same client.
    expect(caRepoMock).toHaveBeenCalledWith({ __client: "token-for-user-sub" });
    const caDeps = caServiceMock.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(caDeps.correctiveActions).toEqual({ __caRepo: { __client: "token-for-user-sub" } });

    // The use-case is built with the per-caller CA service.
    const usecaseDeps = submitUsecaseMock.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(usecaseDeps.correctiveActions).toEqual({
      __caService: { correctiveActions: { __caRepo: { __client: "token-for-user-sub" } } },
    });
  });

  it("NEVER memoizes — each call mints a fresh token and builds a fresh client", async () => {
    const { haccpDailyChecksServiceForCaller } = await import("@/lib/wiring/haccp");

    await haccpDailyChecksServiceForCaller("user-A");
    await haccpDailyChecksServiceForCaller("user-B");

    expect(mintMock).toHaveBeenCalledTimes(2);
    expect(authedClientMock).toHaveBeenCalledTimes(2);
    expect(dailyChecksRepoMock).toHaveBeenCalledTimes(2);

    // The second caller got their OWN token/client — no identity leak.
    expect(mintMock).toHaveBeenNthCalledWith(1, { userId: "user-A" });
    expect(mintMock).toHaveBeenNthCalledWith(2, { userId: "user-B" });
    expect(authedClientMock).toHaveBeenNthCalledWith(1, { token: "token-for-user-A" });
    expect(authedClientMock).toHaveBeenNthCalledWith(2, { token: "token-for-user-B" });
  });

  it("keeps the master-key HACCP singletons as the rollback parachutes", async () => {
    const mod = await import("@/lib/wiring/haccp");
    // The public-kiosk people service especially MUST survive (PR10b keeps it on
    // service-role). Spot-check a representative set of the 12 parachutes.
    expect(mod.haccpDailyChecksService).toBeDefined();
    expect(mod.haccpPeopleService).toBeDefined();
    expect(mod.haccpReportingService).toBeDefined();
    expect(mod.submitHaccpDailyCheck).toBeDefined();
  });
});
