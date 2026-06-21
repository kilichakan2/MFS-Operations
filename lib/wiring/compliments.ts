/**
 * lib/wiring/compliments.ts — composition root for the Compliments domain (F-17 PR1)
 *
 * The ONE business-layer file where the Compliments port is bolted to its
 * concrete vendor adapter. Like `lib/wiring/cash.ts` / `lib/wiring/users.ts`,
 * this is one of the only files allowed to import from `@/lib/adapters/*` —
 * everything in `lib/services/**` depends on ports alone (ADR-0002), pinned by
 * `tests/unit/lint/no-adapter-imports.test.ts`.
 *
 * MASTER-KEY ONLY: this PR composes the service-role `complimentsService`
 * singleton (bypasses RLS, identical to the routes today). The per-caller
 * authenticated factory (`complimentsServiceForCaller`) is DEFERRED to
 * F-RLS-04f. No `*ForCaller` export, no authenticated client here.
 *
 * Rip-out contract (CLAUDE.md acceptance test): swapping the database vendor
 * for Compliments = one new adapter
 * (`lib/adapters/<vendor>/ComplimentsRepository`) + the one wiring line below.
 * `ComplimentsService`, `lib/domain/Compliment.ts`, and the port are untouched.
 *
 * NOT YET CONSUMED — introduce-only (F-17 PR1). No route calls this yet; PR2
 * re-points the two compliments routes through `complimentsService`.
 */
import {
  createComplimentsService,
  type ComplimentsService,
} from "@/lib/services";
import { supabaseComplimentsRepository } from "@/lib/adapters/supabase";

export const complimentsService: ComplimentsService =
  createComplimentsService({
    compliments: supabaseComplimentsRepository,
  });
