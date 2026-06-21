/**
 * lib/wiring/visits.ts — composition root for the Visits domain (F-18 PR1)
 *
 * The ONE business-layer file where the Visits port is bolted to its concrete
 * vendor adapter. Like `lib/wiring/complaints.ts` / `lib/wiring/users.ts`, this
 * is one of the only files allowed to import from `@/lib/adapters/*` —
 * everything in `lib/services/**` depends on ports alone (ADR-0002), pinned by
 * `tests/unit/lint/no-adapter-imports.test.ts`.
 *
 * This file composes the SERVICE-ROLE `visitsService` singleton (master key —
 * bypasses RLS), the same security posture the six visit routes use today
 * (service-role key). PR1 is introduce-only: nothing imports `visitsService` in
 * production yet (PR2 re-points the routes).
 *
 * The per-request `visitsServiceForCaller(userId)` factory (which mints a
 * per-caller token so the visit RLS policies fire) is DEFERRED to the follow-on
 * F-RLS-04g — exactly as F-17's `complaintsServiceForCaller` was added later by
 * F-RLS-04f, and F-13's `usersServiceForCaller` by F-RLS-04b.
 *
 * Rip-out contract (CLAUDE.md acceptance test): swapping the database vendor
 * for Visits = one new adapter (`lib/adapters/<vendor>/VisitsRepository`) + the
 * one wiring line below. `VisitsService`, `lib/domain/Visit.ts`, and the port
 * are untouched.
 */
import { createVisitsService, type VisitsService } from "@/lib/services";
import { supabaseVisitsRepository } from "@/lib/adapters/supabase";

export const visitsService: VisitsService = createVisitsService({
  visits: supabaseVisitsRepository,
});
