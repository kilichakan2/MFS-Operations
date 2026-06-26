/**
 * lib/wiring/discrepancies.ts — composition root for the Discrepancies domain (F-21)
 *
 * The ONE business-layer file where the DiscrepanciesRepository port is bolted
 * to its concrete Supabase adapter — same F-TD-11 rule as every other wiring
 * file (only composition roots import from `@/lib/adapters/*`, pinned by
 * `tests/unit/lint/no-adapter-imports.test.ts`).
 *
 * Security posture (F-21): SERVICE-ROLE singleton (master key, RLS bypassed) —
 * the same posture both re-pointed routes use today (the dashboard route and
 * the detail/discrepancy route both read with the service-role key). Per-user
 * RLS deferred to F-RLS-04i.
 *
 * Named separately from `lib/wiring/dashboard.ts` so other domains can reuse the
 * repo singleton (e.g. the detail/discrepancy route imports THIS singleton
 * directly, not the dashboard service).
 *
 * Rip-out contract (CLAUDE.md acceptance test): swapping the database vendor for
 * Discrepancies = one new adapter (`lib/adapters/<vendor>/DiscrepanciesRepository`)
 * + the one wiring line below. The port, domain, routes and DashboardService are
 * untouched.
 */
import { supabaseDiscrepanciesRepository } from "@/lib/adapters/supabase";
import type { DiscrepanciesRepository } from "@/lib/ports";

export const discrepanciesRepository: DiscrepanciesRepository =
  supabaseDiscrepanciesRepository;
