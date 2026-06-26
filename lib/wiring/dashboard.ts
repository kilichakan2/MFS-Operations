/**
 * lib/wiring/dashboard.ts — composition root for the admin Dashboard (F-21)
 *
 * The ONE business-layer file where the DashboardService's five ports
 * (Discrepancies, Complaints, Visits, Orders, Pricing) are bolted to their
 * concrete Supabase adapters — same F-TD-11 rule as every other wiring file
 * (only composition roots import from `@/lib/adapters/*`, pinned by
 * `tests/unit/lint/no-adapter-imports.test.ts`).
 *
 * Security posture (F-21): SERVICE-ROLE singletons (master key, RLS bypassed) —
 * the same posture the GET /api/dashboard route uses today (it reads everything
 * with the service-role key). Per-user RLS deferred to F-RLS-04i.
 *
 * Rip-out contract (CLAUDE.md acceptance test): swapping the DB vendor for the
 * dashboard = one new adapter folder + the wiring lines below. DashboardService,
 * the route and lib/domain are untouched.
 */
import { createDashboardService, type DashboardService } from "@/lib/services";
import {
  supabaseDiscrepanciesRepository,
  supabaseComplaintsRepository,
  supabaseVisitsRepository,
  supabaseOrdersRepository,
  supabasePricingRepository,
} from "@/lib/adapters/supabase";

export const dashboardService: DashboardService = createDashboardService({
  discrepancies: supabaseDiscrepanciesRepository,
  complaints: supabaseComplaintsRepository,
  visits: supabaseVisitsRepository,
  orders: supabaseOrdersRepository,
  pricing: supabasePricingRepository,
});
