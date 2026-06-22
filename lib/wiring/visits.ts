/**
 * lib/wiring/visits.ts — composition root for the Visits domain (F-18 PR1)
 *
 * The ONE business-layer file where the Visits port is bolted to its concrete
 * vendor adapter. Like `lib/wiring/complaints.ts` / `lib/wiring/users.ts`, this
 * is one of the only files allowed to import from `@/lib/adapters/*` —
 * everything in `lib/services/**` depends on ports alone (ADR-0002), pinned by
 * `tests/unit/lint/no-adapter-imports.test.ts`.
 *
 * This file composes BOTH:
 *   - the MASTER-KEY `visitsService` singleton (bypasses RLS), which STAYS as
 *     the one-line rollback parachute and still powers the deferred
 *     screen3/sync create path; and
 *   - the per-request `visitsServiceForCaller(userId)` factory (ADDED by
 *     F-RLS-04g), which builds a fresh Visits graph whose single TABLE port is
 *     bound to ONE caller (the Postgres `authenticated` role, so the visits +
 *     visit_notes RLS policies fire). SINGLE-PORT — like complaints there is no
 *     Storage and no RPC, so there is no second port to keep on the master key.
 *
 * Rip-out contract (CLAUDE.md acceptance test): swapping the database vendor
 * for Visits = one new adapter (`lib/adapters/<vendor>/VisitsRepository`) + the
 * one wiring line below. `VisitsService`, `lib/domain/Visit.ts`, and the port
 * are untouched.
 *
 * CONSUMED by the 7 flipped visit read/own-mutate handlers since F-RLS-04g
 * (admin/visits GET, detail/visit GET, screen3/visit/notes GET·POST·PATCH,
 * screen3/visit PATCH·DELETE). The screen3/sync create path stays on the
 * master-key singleton this copy — deferred to a follow-on (plan §13a).
 *
 * Per-request — NEVER memoize: the minted token is per-caller, and a memoized
 * client would leak one caller's identity to another. Each call mints a fresh
 * token and builds a fresh client. Mirrors `complaintsServiceForCaller`.
 */
import { createVisitsService, type VisitsService } from "@/lib/services";
import {
  supabaseVisitsRepository, // keep — service-role parachute singleton
  createSupabaseVisitsRepository, // NEW — per-caller table repo
  authenticatedClientForCaller, // NEW
} from "@/lib/adapters/supabase";
import { dbTokenMinter } from "@/lib/wiring/dbToken";

export const visitsService: VisitsService = createVisitsService({
  visits: supabaseVisitsRepository,
});

/** Build a VisitsService whose reads/writes run as ONE caller (Postgres
 *  `authenticated` role, so the visits + visit_notes RLS policies fire).
 *  Per-request — NEVER memoize (a memoized client would leak one caller's
 *  identity to another). Single port (visits) — like complaints there is no
 *  Storage and no RPC. Consumed by the 7 flipped visit handlers since
 *  F-RLS-04g. The `visitsService` singleton above STAYS as the rollback
 *  parachute. */
export async function visitsServiceForCaller(
  callerUserId: string,
): Promise<VisitsService> {
  const token = await dbTokenMinter.mint({ userId: callerUserId });
  const client = authenticatedClientForCaller({ token });
  return createVisitsService({
    visits: createSupabaseVisitsRepository(client), // per-caller (RLS fires)
  });
}
