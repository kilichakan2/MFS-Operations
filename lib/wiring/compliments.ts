/**
 * lib/wiring/compliments.ts — composition root for the Compliments domain (F-17 PR1)
 *
 * The ONE business-layer file where the Compliments port is bolted to its
 * concrete vendor adapter. Like `lib/wiring/cash.ts` / `lib/wiring/users.ts`,
 * this is one of the only files allowed to import from `@/lib/adapters/*` —
 * everything in `lib/services/**` depends on ports alone (ADR-0002), pinned by
 * `tests/unit/lint/no-adapter-imports.test.ts`.
 *
 * This file composes BOTH:
 *   - the MASTER-KEY `complimentsService` singleton (bypasses RLS), which STAYS
 *     as the one-line rollback parachute; and
 *   - the per-request `complimentsServiceForCaller(userId)` factory (F-RLS-04f),
 *     which builds a fresh Compliments graph whose single TABLE port is bound to
 *     ONE caller (the Postgres `authenticated` role, so the compliment RLS
 *     policies fire). SINGLE-PORT — unlike cash there is no Storage and no RPC,
 *     so there is no second port to keep on the master key.
 *
 * Rip-out contract (CLAUDE.md acceptance test): swapping the database vendor
 * for Compliments = one new adapter
 * (`lib/adapters/<vendor>/ComplimentsRepository`) + the one wiring line below.
 * `ComplimentsService`, `lib/domain/Compliment.ts`, and the port are untouched.
 *
 * CONSUMED by the 2 compliments route files since F-RLS-04f (compliments,
 * compliments/users).
 *
 * Per-request — NEVER memoize: the minted token is per-caller, and a memoized
 * client would leak one caller's identity to another. Each call mints a fresh
 * token and builds a fresh client. Mirrors `cashServiceForCaller` (single-port).
 */
import {
  createComplimentsService,
  type ComplimentsService,
} from "@/lib/services";
import {
  supabaseComplimentsRepository, // keep — service-role parachute singleton
  createSupabaseComplimentsRepository, // NEW — per-caller table repo
  authenticatedClientForCaller, // NEW
} from "@/lib/adapters/supabase";
import { dbTokenMinter } from "@/lib/wiring/dbToken";

export const complimentsService: ComplimentsService =
  createComplimentsService({
    compliments: supabaseComplimentsRepository,
  });

/** Build a ComplimentsService whose table reads/writes run as ONE caller
 *  (Postgres `authenticated` role, so the compliment RLS policies fire).
 *  Per-request — NEVER memoize (a memoized client would leak one caller's
 *  identity to another). Mirrors cashServiceForCaller (single-port: compliments
 *  have no Storage and no RPC). Consumed by the 2 compliments routes since
 *  F-RLS-04f. The `complimentsService` singleton above STAYS as the rollback
 *  parachute. */
export async function complimentsServiceForCaller(
  callerUserId: string,
): Promise<ComplimentsService> {
  const token = await dbTokenMinter.mint({ userId: callerUserId });
  const client = authenticatedClientForCaller({ token });
  return createComplimentsService({
    compliments: createSupabaseComplimentsRepository(client), // per-caller (RLS fires)
  });
}
