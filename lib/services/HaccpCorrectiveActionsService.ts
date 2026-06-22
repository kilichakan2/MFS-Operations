/**
 * lib/services/HaccpCorrectiveActionsService.ts
 *
 * The Corrective-Actions service (F-19) — the standalone business object over
 * the shared CA ledger. Factory here, wiring in `lib/wiring/haccp.ts`; depends
 * on the `correctiveActions` port alone, never on another service and never on
 * the adapters folder (lint-enforced, ADR-0002 / F-TD-11).
 *
 * It exists as its OWN service (not folded into the daily-checks service)
 * because the admin verification queue + sign-off (corrective-actions GET +
 * [id] PATCH in PR2) need it standalone, with no daily-check involved. The
 * daily-check → CA composition happens in `lib/usecases/submitHaccpDailyCheck`,
 * which calls this service's `insertCorrectiveActions`.
 *
 * Thin by design: the CA port already carries the depth (the
 * (source_table, source_id) hub, the queue filters, the sign-off filter); this
 * service is the named business surface PR2's routes call.
 */

import type {
  CorrectiveActionInsert,
  CorrectiveActionQueue,
} from "@/lib/domain";
import type { HaccpCorrectiveActionsRepository } from "@/lib/ports";

export interface HaccpCorrectiveActionsServiceDeps {
  readonly correctiveActions: HaccpCorrectiveActionsRepository;
}

export interface HaccpCorrectiveActionsService {
  /** File N corrective-action rows AS-IS into the shared ledger. A no-op when
   *  `rows` is empty. Throws ServiceError on a DB failure — the caller (the
   *  submit use-case) owns the `ca_write_failed` soft-fail contract. */
  insertCorrectiveActions(
    rows: readonly CorrectiveActionInsert[],
  ): Promise<void>;

  /** The admin verification queue (unresolved + recently resolved).
   *  → GET /api/haccp/corrective-actions. */
  listVerificationQueue(): Promise<CorrectiveActionQueue>;

  /** Sign off a corrective action.
   *  → PATCH /api/haccp/corrective-actions/[id]. */
  signOff(id: string, verifiedBy: string): Promise<void>;
}

export function createHaccpCorrectiveActionsService(
  deps: HaccpCorrectiveActionsServiceDeps,
): HaccpCorrectiveActionsService {
  const { correctiveActions } = deps;

  return {
    insertCorrectiveActions: (rows) => correctiveActions.insertMany(rows),
    listVerificationQueue: () => correctiveActions.listVerificationQueue(),
    signOff: (id, verifiedBy) => correctiveActions.signOff(id, verifiedBy),
  };
}
