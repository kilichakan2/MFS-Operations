/**
 * lib/wiring/cash.ts — composition root for the Cash domain (F-16 PR1)
 *
 * The ONE business-layer file where the Cash domain's abstract ports are
 * bolted to their concrete vendor adapters. Like `lib/wiring/pricing.ts` /
 * `lib/wiring/users.ts`, this is one of the only files allowed to import
 * from `@/lib/adapters/*` — everything in `lib/services/**` depends on
 * ports alone (ADR-0002), pinned by
 * `tests/unit/lint/no-adapter-imports.test.ts`.
 *
 * Rip-out contract (CLAUDE.md acceptance test): swapping the database
 * vendor for Cash = one new adapter folder (`lib/adapters/<vendor>/`
 * CashRepository + AttachmentStorage) + edits to THIS file. `CashService`,
 * `lib/domain/Cash.ts`, and the ports are untouched.
 *
 * This file composes BOTH:
 *   - the MASTER-KEY `cashService` singleton (bypasses RLS), which STAYS as the
 *     one-line rollback parachute AND as the engine the routes use for the
 *     Storage paths that stay on the master key (E1, below); and
 *   - the per-request `cashServiceForCaller(userId)` factory (F-RLS-04e), which
 *     builds a fresh Cash graph whose TABLE port is bound to ONE caller (the
 *     Postgres `authenticated` role, so the cash RLS policies fire) while its
 *     STORAGE port stays the master-key singleton.
 *
 * THE CASH-SPECIFIC TWIST (E1): the `cash-attachments` Storage bucket has NO
 * authenticated `storage.objects` policies, so a per-caller token would be
 * fail-closed-denied on every file op. So `cashServiceForCaller` keeps the
 * `AttachmentStorage` port on the master-key `supabaseAttachmentStorage`
 * singleton — only the TABLE port wears the badge. The upload route stays on the
 * master-key `cashService` entirely (storage-only, no RLS surface).
 *
 * CONSUMED by the 7 table-touching cash route files (11 handlers) since
 * F-RLS-04e (the cutover that also added the cash authenticated RLS policy set —
 * migration 20260621120000). `app/api/cash/upload` STAYS on the master-key
 * `cashService` singleton (storage-only).
 *
 * Per-request — NEVER memoize: the minted token is per-caller, and a memoized
 * client would leak one caller's identity to another. Each call mints a fresh
 * token and builds a fresh client. Mirrors `pricingServiceForCaller`.
 */
import { createCashService, type CashService } from "@/lib/services";
import {
  supabaseCashRepository,
  supabaseAttachmentStorage,
  createSupabaseCashRepository,
  authenticatedClientForCaller,
} from "@/lib/adapters/supabase";
import { dbTokenMinter } from "@/lib/wiring/dbToken";

export const cashService: CashService = createCashService({
  cash: supabaseCashRepository,
  attachments: supabaseAttachmentStorage,
});

// ─── Per-request authenticated composition (F-RLS-04e) ──────────────
//
// The pre-wired `cashService` singleton above uses the MASTER-KEY client
// (bypasses RLS) and STAYS: it is the one-line rollback parachute and the engine
// the routes use for the Storage paths that stay on the master key. The factory
// below builds a fresh Cash graph whose TABLE port is bound to ONE caller,
// reaching the DB as the Postgres `authenticated` role so the GUC-based cash RLS
// policies fire — while its STORAGE port stays the master-key singleton
// (cash-attachments has no authenticated storage policies — E1). Per-request —
// NEVER memoize (a memoized client would leak one caller's identity to another).

/** Build a CashService whose TABLE reads/writes run as ONE caller (Postgres
 *  `authenticated` role, so the cash RLS policies fire) while ATTACHMENT
 *  STORAGE stays on the master-key singleton (the cash-attachments bucket has
 *  no authenticated storage.objects policies — F-RLS-04e E1). Per-request —
 *  NEVER memoize. Mirrors pricingServiceForCaller. Consumed by the cash routes
 *  since F-RLS-04e. */
export async function cashServiceForCaller(
  callerUserId: string,
): Promise<CashService> {
  const token = await dbTokenMinter.mint({ userId: callerUserId });
  const client = authenticatedClientForCaller({ token });
  return createCashService({
    cash: createSupabaseCashRepository(client), // per-caller (RLS fires)
    attachments: supabaseAttachmentStorage, // master-key (Storage has no authed policies)
  });
}
