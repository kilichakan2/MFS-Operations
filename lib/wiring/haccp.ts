/**
 * lib/wiring/haccp.ts — composition root for the HACCP Cluster A domain (F-19 PR1)
 *
 * The ONE business-layer file where the HACCP daily-check + corrective-action
 * ports are bolted to their concrete vendor adapters. Like `lib/wiring/cash.ts`
 * / `lib/wiring/visits.ts`, this is one of the only files allowed to import from
 * `@/lib/adapters/*` — everything in `lib/services/**` + `lib/usecases/**`
 * depends on ports alone (ADR-0002), pinned by
 * `tests/unit/lint/no-adapter-imports.test.ts`.
 *
 * SERVICE-ROLE SINGLETONS ONLY. PR1 wires the MASTER-KEY (RLS-bypassing)
 * service-role client — exactly the access the routes have today, so the PR2
 * re-point is byte-identical. The 30 HACCP tables have RLS ENABLED + ZERO
 * policies (a deny-all trap only service-role opens), so the master key is the
 * only thing that works on them today.
 *
 * F-RLS-04h PR10a: the per-request authenticated `…ForCaller(userId)` factories
 * are ADDED here (12 of them — one per service + `submitHaccpDailyCheckForCaller`),
 * exactly as F-18's `visitsServiceForCaller` was added by F-RLS-04g. Each mints a
 * short-lived DB token, builds a per-caller authenticated client (Postgres
 * `authenticated` role, so the HACCP RLS policies fire), and binds the relevant
 * adapter(s) to it. They are INERT in PR10a — NO caller in `app/**` (no route
 * edited). PR10b throws the switch by sourcing the caller id from the
 * `x-mfs-user-id` header. The service-role singletons below STAY as the
 * one-line rollback parachutes (and the public visitor kiosk keeps the
 * `haccpPeopleService` singleton in PR10b — no logged-in user).
 *
 * Per-request — NEVER memoize: the minted token is per-caller, and a memoized
 * client would leak one caller's identity to another. Each `…ForCaller` call
 * mints a fresh token and builds a fresh client. Mirrors `visitsServiceForCaller`.
 *
 * Rip-out contract (CLAUDE.md acceptance test): swapping the database vendor for
 * HACCP = one new adapter per port (`lib/adapters/<vendor>/Haccp*Repository`) +
 * the wiring lines below. The services, the use-case, `lib/domain/Haccp*`, and
 * the ports are untouched.
 *
 * INTRODUCE-ONLY (F-19 PR1 + PR10a): the singletons and the new `…ForCaller`
 * factories are constructed but have NO caller — the HACCP routes are untouched.
 * PR10b throws the switch.
 */
import {
  createHaccpDailyChecksService,
  createHaccpCorrectiveActionsService,
  createHaccpAssessmentsService,
  createHaccpTrainingService,
  createHaccpPeopleService,
  createHaccpReviewsService,
  createHaccpAnnualReviewService,
  createHaccpReportingService,
  createHaccpHandbookService,
  createHaccpSuppliersService,
  createHaccpLookupsService,
  type HaccpDailyChecksService,
  type HaccpCorrectiveActionsService,
  type HaccpAssessmentsService,
  type HaccpTrainingService,
  type HaccpPeopleService,
  type HaccpReviewsService,
  type HaccpAnnualReviewService,
  type HaccpReportingService,
  type HaccpHandbookService,
  type HaccpSuppliersService,
  type HaccpLookupsService,
} from "@/lib/services";
import {
  createSubmitHaccpDailyCheck,
  type SubmitHaccpDailyCheck,
} from "@/lib/usecases/submitHaccpDailyCheck";
import {
  supabaseHaccpDailyChecksRepository,
  supabaseHaccpCorrectiveActionsRepository,
  supabaseHaccpAssessmentsRepository,
  supabaseHaccpTrainingRepository,
  supabaseHaccpPeopleRepository,
  supabaseHaccpReviewsRepository,
  supabaseHaccpAnnualReviewRepository,
  supabaseHaccpReportingRepository,
  supabaseHaccpHandbookRepository,
  supabaseHaccpSuppliersRepository,
  supabaseHaccpLookupsRepository,
  // F-RLS-04h PR10a — per-caller adapter factories (keycard-bound repos).
  createSupabaseHaccpDailyChecksRepository,
  createSupabaseHaccpCorrectiveActionsRepository,
  createSupabaseHaccpAssessmentsRepository,
  createSupabaseHaccpTrainingRepository,
  createSupabaseHaccpPeopleRepository,
  createSupabaseHaccpReviewsRepository,
  createSupabaseHaccpAnnualReviewRepository,
  createSupabaseHaccpReportingRepository,
  createSupabaseHaccpHandbookRepository,
  createSupabaseHaccpSuppliersRepository,
  createSupabaseHaccpLookupsRepository,
  authenticatedClientForCaller,
} from "@/lib/adapters/supabase";
import { xlsxSpreadsheetExporter } from "@/lib/adapters/xlsx";
import { dbTokenMinter } from "@/lib/wiring/dbToken";

export const haccpDailyChecksService: HaccpDailyChecksService =
  createHaccpDailyChecksService({
    dailyChecks: supabaseHaccpDailyChecksRepository,
  });

export const haccpCorrectiveActionsService: HaccpCorrectiveActionsService =
  createHaccpCorrectiveActionsService({
    correctiveActions: supabaseHaccpCorrectiveActionsRepository,
  });

export const submitHaccpDailyCheck: SubmitHaccpDailyCheck =
  createSubmitHaccpDailyCheck({
    correctiveActions: haccpCorrectiveActionsService,
  });

// F-19 PR3 — Cluster B "standing registers" (allergen-assessment, allergen
// monthly-reviews, food-defence, food-fraud, product-specs). Service-role
// singleton ONLY — exactly the access the 5 routes have today, so the re-point
// is byte-identical. NO `…ForCaller` (per-caller RLS deferred to F-RLS-04h).
export const haccpAssessmentsService: HaccpAssessmentsService =
  createHaccpAssessmentsService({
    assessments: supabaseHaccpAssessmentsRepository,
  });

// F-19 PR4 — Cluster C "people & training" (staff + allergen training;
// haccp_health_records people + public visitor kiosk). Service-role singletons
// ONLY — exactly the access the 3 routes have today, so the re-point is
// byte-identical. NO `…ForCaller` (per-caller RLS deferred to F-RLS-04h).
export const haccpTrainingService: HaccpTrainingService =
  createHaccpTrainingService({
    training: supabaseHaccpTrainingRepository,
  });

export const haccpPeopleService: HaccpPeopleService =
  createHaccpPeopleService({
    people: supabaseHaccpPeopleRepository,
  });

// F-19 PR5 — Cluster D "reviews" (weekly + monthly reviews with the auto
// corrective-action side-effect) + the annual SALSA review (draft/lock/sign-off).
// Service-role singletons ONLY — exactly the access the 2 routes have today, so
// the PR6 re-point is byte-identical. NO `…ForCaller` (per-caller RLS deferred
// to F-RLS-04h, Cluster G). INTRODUCE-ONLY: no caller yet.
export const haccpReviewsService: HaccpReviewsService =
  createHaccpReviewsService({ reviews: supabaseHaccpReviewsRepository });

export const haccpAnnualReviewService: HaccpAnnualReviewService =
  createHaccpAnnualReviewService({
    annualReview: supabaseHaccpAnnualReviewRepository,
  });

// F-19 PR7 — Cluster E "reporting" (the 6 read-only reporting routes:
// today-status, overview, annual-review·data, audit·heatmap, audit per-section,
// audit·export). Depends on TWO ports — the reporting reads (Supabase, service-
// role) + the generic SpreadsheetExporter (xlsx). Service-role singleton ONLY —
// exactly the access the 6 routes have today, so the PR8 re-point is byte-
// identical. NO `…ForCaller` (per-caller RLS deferred to F-RLS-04h, Cluster G).
// INTRODUCE-ONLY: no caller yet — mirrors PR1/PR3/PR5.
export const haccpReportingService: HaccpReportingService =
  createHaccpReportingService({
    reporting: supabaseHaccpReportingRepository,
    spreadsheet: xlsxSpreadsheetExporter,
  });

// F-19 PR9a — Cluster F "docs & lookups" (the 8 HACCP admin/lookup surfaces:
// handbook, search, documents, users, customers, supplier-code, recall,
// admin/suppliers). THREE service-role singletons grouped by owned data — the
// SOP library, the supplier book, and the two form selectors. Service-role
// singletons ONLY — exactly the access the 8 routes have today, so the PR9b
// re-point is byte-identical. NO `…ForCaller` (per-caller RLS deferred to
// F-RLS-04h, Cluster G). INTRODUCE-ONLY: no caller yet — mirrors PR1/PR3/PR5/PR7.
export const haccpHandbookService: HaccpHandbookService =
  createHaccpHandbookService({ handbook: supabaseHaccpHandbookRepository });

export const haccpSuppliersService: HaccpSuppliersService =
  createHaccpSuppliersService({ suppliers: supabaseHaccpSuppliersRepository });

export const haccpLookupsService: HaccpLookupsService =
  createHaccpLookupsService({ lookups: supabaseHaccpLookupsRepository });

// ─────────────────────────────────────────────────────────────────────────
// F-RLS-04h PR10a — per-request authenticated `…ForCaller(userId)` factories.
//
// Each mints a short-lived DB token, builds a per-caller authenticated client
// (Postgres `authenticated` role → the HACCP RLS policies fire), and binds the
// relevant adapter(s) to it. INERT: no caller in `app/**` until PR10b. Per-
// request — NEVER memoize (a memoized client would leak one caller's identity
// to another). The service-role singletons above STAY as the rollback
// parachutes. Mirrors `visitsServiceForCaller`.
// ─────────────────────────────────────────────────────────────────────────

/** Daily-checks service bound to ONE caller (single port). */
export async function haccpDailyChecksServiceForCaller(
  callerUserId: string,
): Promise<HaccpDailyChecksService> {
  const token = await dbTokenMinter.mint({ userId: callerUserId });
  const client = authenticatedClientForCaller({ token });
  return createHaccpDailyChecksService({
    dailyChecks: createSupabaseHaccpDailyChecksRepository(client),
  });
}

/** Corrective-actions service bound to ONE caller (single port). */
export async function haccpCorrectiveActionsServiceForCaller(
  callerUserId: string,
): Promise<HaccpCorrectiveActionsService> {
  const token = await dbTokenMinter.mint({ userId: callerUserId });
  const client = authenticatedClientForCaller({ token });
  return createHaccpCorrectiveActionsService({
    correctiveActions: createSupabaseHaccpCorrectiveActionsRepository(client),
  });
}

/** Assessments service bound to ONE caller (single port). */
export async function haccpAssessmentsServiceForCaller(
  callerUserId: string,
): Promise<HaccpAssessmentsService> {
  const token = await dbTokenMinter.mint({ userId: callerUserId });
  const client = authenticatedClientForCaller({ token });
  return createHaccpAssessmentsService({
    assessments: createSupabaseHaccpAssessmentsRepository(client),
  });
}

/** Training service bound to ONE caller (single port). */
export async function haccpTrainingServiceForCaller(
  callerUserId: string,
): Promise<HaccpTrainingService> {
  const token = await dbTokenMinter.mint({ userId: callerUserId });
  const client = authenticatedClientForCaller({ token });
  return createHaccpTrainingService({
    training: createSupabaseHaccpTrainingRepository(client),
  });
}

/** People service bound to ONE caller (single port). The service-role
 *  `haccpPeopleService` singleton STAYS — the public visitor kiosk (no
 *  logged-in user) keeps it in PR10b. */
export async function haccpPeopleServiceForCaller(
  callerUserId: string,
): Promise<HaccpPeopleService> {
  const token = await dbTokenMinter.mint({ userId: callerUserId });
  const client = authenticatedClientForCaller({ token });
  return createHaccpPeopleService({
    people: createSupabaseHaccpPeopleRepository(client),
  });
}

/** Reviews service bound to ONE caller (single port). */
export async function haccpReviewsServiceForCaller(
  callerUserId: string,
): Promise<HaccpReviewsService> {
  const token = await dbTokenMinter.mint({ userId: callerUserId });
  const client = authenticatedClientForCaller({ token });
  return createHaccpReviewsService({
    reviews: createSupabaseHaccpReviewsRepository(client),
  });
}

/** Annual-review service bound to ONE caller (single port). */
export async function haccpAnnualReviewServiceForCaller(
  callerUserId: string,
): Promise<HaccpAnnualReviewService> {
  const token = await dbTokenMinter.mint({ userId: callerUserId });
  const client = authenticatedClientForCaller({ token });
  return createHaccpAnnualReviewService({
    annualReview: createSupabaseHaccpAnnualReviewRepository(client),
  });
}

/** Reporting service bound to ONE caller. TWO ports: the DB `reporting` port is
 *  per-caller (keycard); the `spreadsheet` (xlsx) exporter is NOT a DB port and
 *  carries no identity → reuse the SHARED `xlsxSpreadsheetExporter` singleton. */
export async function haccpReportingServiceForCaller(
  callerUserId: string,
): Promise<HaccpReportingService> {
  const token = await dbTokenMinter.mint({ userId: callerUserId });
  const client = authenticatedClientForCaller({ token });
  return createHaccpReportingService({
    reporting: createSupabaseHaccpReportingRepository(client),
    spreadsheet: xlsxSpreadsheetExporter,
  });
}

/** Handbook service bound to ONE caller (single port). */
export async function haccpHandbookServiceForCaller(
  callerUserId: string,
): Promise<HaccpHandbookService> {
  const token = await dbTokenMinter.mint({ userId: callerUserId });
  const client = authenticatedClientForCaller({ token });
  return createHaccpHandbookService({
    handbook: createSupabaseHaccpHandbookRepository(client),
  });
}

/** Suppliers service bound to ONE caller (single port). */
export async function haccpSuppliersServiceForCaller(
  callerUserId: string,
): Promise<HaccpSuppliersService> {
  const token = await dbTokenMinter.mint({ userId: callerUserId });
  const client = authenticatedClientForCaller({ token });
  return createHaccpSuppliersService({
    suppliers: createSupabaseHaccpSuppliersRepository(client),
  });
}

/** Lookups service bound to ONE caller (single port). */
export async function haccpLookupsServiceForCaller(
  callerUserId: string,
): Promise<HaccpLookupsService> {
  const token = await dbTokenMinter.mint({ userId: callerUserId });
  const client = authenticatedClientForCaller({ token });
  return createHaccpLookupsService({
    lookups: createSupabaseHaccpLookupsRepository(client),
  });
}

/** Daily-check submission use-case bound to ONE caller (multi-port via
 *  composition). Mint+build the client ONCE, build a per-caller
 *  `HaccpCorrectiveActionsService` from THAT same client, and pass it into the
 *  use-case — NO second mint. Mirrors `pickingListUsecaseForCaller`. */
export async function submitHaccpDailyCheckForCaller(
  callerUserId: string,
): Promise<SubmitHaccpDailyCheck> {
  const token = await dbTokenMinter.mint({ userId: callerUserId });
  const client = authenticatedClientForCaller({ token });
  const callerCorrectiveActions = createHaccpCorrectiveActionsService({
    correctiveActions: createSupabaseHaccpCorrectiveActionsRepository(client),
  });
  return createSubmitHaccpDailyCheck({
    correctiveActions: callerCorrectiveActions,
  });
}
