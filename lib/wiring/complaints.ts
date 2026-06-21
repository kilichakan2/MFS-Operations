/**
 * lib/wiring/complaints.ts — composition root for the Complaints domain (F-17 PR1)
 *
 * The ONE business-layer file where the Complaints port is bolted to its
 * concrete vendor adapter. Like `lib/wiring/cash.ts` / `lib/wiring/users.ts`,
 * this is one of the only files allowed to import from `@/lib/adapters/*` —
 * everything in `lib/services/**` depends on ports alone (ADR-0002), pinned by
 * `tests/unit/lint/no-adapter-imports.test.ts`.
 *
 * This file composes BOTH:
 *   - the MASTER-KEY `complaintsService` singleton (bypasses RLS), which STAYS
 *     as the one-line rollback parachute; and
 *   - the per-request `complaintsServiceForCaller(userId)` factory (F-RLS-04f),
 *     which builds a fresh Complaints graph whose single TABLE port is bound to
 *     ONE caller (the Postgres `authenticated` role, so the complaint RLS
 *     policies fire). SINGLE-PORT — unlike cash there is no Storage and no RPC,
 *     so there is no second port to keep on the master key.
 *
 * Rip-out contract (CLAUDE.md acceptance test): swapping the database vendor
 * for Complaints = one new adapter (`lib/adapters/<vendor>/ComplaintsRepository`)
 * + the one wiring line below. `ComplaintsService`, `lib/domain/Complaint.ts`,
 * and the port are untouched.
 *
 * CONSUMED by the 6 complaint route files since F-RLS-04f (screen2/sync,
 * screen2/resolve, screen2/note, screen2/open, screen2/all, detail/complaint).
 *
 * Per-request — NEVER memoize: the minted token is per-caller, and a memoized
 * client would leak one caller's identity to another. Each call mints a fresh
 * token and builds a fresh client. Mirrors `cashServiceForCaller` (single-port).
 */
import {
  createComplaintsService,
  type ComplaintsService,
} from "@/lib/services";
import {
  supabaseComplaintsRepository, // keep — service-role parachute singleton
  createSupabaseComplaintsRepository, // NEW — per-caller table repo
  authenticatedClientForCaller, // NEW
} from "@/lib/adapters/supabase";
import { dbTokenMinter } from "@/lib/wiring/dbToken";

export const complaintsService: ComplaintsService = createComplaintsService({
  complaints: supabaseComplaintsRepository,
});

/** Build a ComplaintsService whose table reads/writes run as ONE caller
 *  (Postgres `authenticated` role, so the complaint RLS policies fire).
 *  Per-request — NEVER memoize (a memoized client would leak one caller's
 *  identity to another). Mirrors cashServiceForCaller (single-port: complaints
 *  have no Storage and no RPC). Consumed by the 6 complaint routes since
 *  F-RLS-04f. The `complaintsService` singleton above STAYS as the rollback
 *  parachute. */
export async function complaintsServiceForCaller(
  callerUserId: string,
): Promise<ComplaintsService> {
  const token = await dbTokenMinter.mint({ userId: callerUserId });
  const client = authenticatedClientForCaller({ token });
  return createComplaintsService({
    complaints: createSupabaseComplaintsRepository(client), // per-caller (RLS fires)
  });
}
