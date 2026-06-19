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
 * PR1 is INTRODUCE-ONLY: this singleton is constructed but has NO caller
 * yet — PR2 re-points the eight `app/api/cash/**` routes onto it. It uses
 * the SERVICE-ROLE client (master key — bypasses RLS), identical to the
 * routes today, so PR2's behaviour is byte-identical. The per-caller
 * authenticated factory (mirroring pricingServiceForCaller) is F-RLS-04e,
 * NOT this PR.
 */
import { createCashService, type CashService } from "@/lib/services";
import {
  supabaseCashRepository,
  supabaseAttachmentStorage,
} from "@/lib/adapters/supabase";

export const cashService: CashService = createCashService({
  cash: supabaseCashRepository,
  attachments: supabaseAttachmentStorage,
});

// F-RLS-04e (LATER) will add cashServiceForCaller(userId) here, mirroring
// pricingServiceForCaller. NOT in PR1 — service-role singleton only.
