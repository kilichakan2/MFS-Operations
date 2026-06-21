/**
 * lib/wiring/complaints.ts — composition root for the Complaints domain (F-17 PR1)
 *
 * The ONE business-layer file where the Complaints port is bolted to its
 * concrete vendor adapter. Like `lib/wiring/cash.ts` / `lib/wiring/users.ts`,
 * this is one of the only files allowed to import from `@/lib/adapters/*` —
 * everything in `lib/services/**` depends on ports alone (ADR-0002), pinned by
 * `tests/unit/lint/no-adapter-imports.test.ts`.
 *
 * MASTER-KEY ONLY: this PR composes the service-role `complaintsService`
 * singleton (bypasses RLS, identical to the routes today). The per-caller
 * authenticated factory (`complaintsServiceForCaller`) — the Postgres
 * `authenticated` role so the complaint RLS policies fire — is DEFERRED to
 * F-RLS-04f. No `*ForCaller` export, no authenticated client here.
 *
 * Rip-out contract (CLAUDE.md acceptance test): swapping the database vendor
 * for Complaints = one new adapter (`lib/adapters/<vendor>/ComplaintsRepository`)
 * + the one wiring line below. `ComplaintsService`, `lib/domain/Complaint.ts`,
 * and the port are untouched.
 *
 * NOT YET CONSUMED — introduce-only (F-17 PR1). No route calls this yet; PR2
 * re-points the eight complaint routes through `complaintsService`.
 */
import {
  createComplaintsService,
  type ComplaintsService,
} from "@/lib/services";
import { supabaseComplaintsRepository } from "@/lib/adapters/supabase";

export const complaintsService: ComplaintsService = createComplaintsService({
  complaints: supabaseComplaintsRepository,
});
