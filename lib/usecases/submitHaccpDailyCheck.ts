/**
 * lib/usecases/submitHaccpDailyCheck.ts
 *
 * The daily-check submit use-case (F-19 PR1). ONE business operation — "save a
 * daily-check row, then file any corrective actions" — that spans TWO services:
 * `HaccpDailyChecksService` (insert the log row) and
 * `HaccpCorrectiveActionsService` (file the CA rows into the shared ledger).
 *
 * DESIGN DECISION 1 (resolved at Render as Ousterhout would): the use-case
 * SPLIT (not folding the CA write into the daily-checks service). ADR-0002
 * forbids a service importing another service, so the two-service composition
 * lives here. This gives PR2's daily-check routes the SMALLEST interface — one
 * `submit…` call that hides BOTH the log insert AND the entire CA fan-out +
 * soft-fail contract. It is a deep module: a one-method facade over two-table
 * orchestration, heterogeneous CA payloads, and the "a CA-write failure must NOT
 * sink a submitted check" rule. The CA service must exist standalone anyway (the
 * admin queue/sign-off routes need it with no daily-check), so keeping it
 * separate and composing here keeps the CA ledger logic in exactly one place
 * (locality). Deletion test: delete this use-case and the composition + soft-
 * fail smears into every PR2 route — so it holds weight.
 *
 * THE SOFT-FAIL CONTRACT lives HERE, not in the adapter or the CA service: a
 * CA-insert failure is logged and turned into `ca_write_failed: true` — it is
 * NOT thrown, so a deviation submission that succeeds today never 500s in PR2.
 * The daily-check row is already committed before the CA write is attempted.
 *
 * Construction: factory (F-07 template); production wiring in
 * `lib/wiring/haccp.ts` — service-role singletons (no auth change in PR1).
 */

import type { CorrectiveActionInsert } from "@/lib/domain";
import type {
  HaccpDailyChecksService,
  HaccpCorrectiveActionsService,
} from "@/lib/services";
import { log } from "@/lib/observability/log";

export interface SubmitHaccpDailyCheckDeps {
  readonly dailyChecks: HaccpDailyChecksService;
  readonly correctiveActions: HaccpCorrectiveActionsService;
}

/** The outcome of filing the (already-built) CA rows after a committed insert. */
export interface CorrectiveActionFiling {
  /** True iff the CA insert threw — the daily-check row still committed. */
  readonly ca_write_failed: boolean;
}

export interface SubmitHaccpDailyCheck {
  /**
   * File N corrective-action rows after the daily-check row is already
   * committed. A no-op (returns `ca_write_failed:false`) when `rows` is empty.
   * Never throws on a CA-insert failure — it logs and returns
   * `ca_write_failed:true`, preserving the routes' soft-fail behaviour.
   *
   * @param label a short tag for the log line (e.g. the sub-domain name).
   */
  fileCorrectiveActions(
    rows: readonly CorrectiveActionInsert[],
    label: string,
  ): Promise<CorrectiveActionFiling>;
}

export function createSubmitHaccpDailyCheck(
  deps: SubmitHaccpDailyCheckDeps,
): SubmitHaccpDailyCheck {
  const { correctiveActions } = deps;

  return {
    async fileCorrectiveActions(rows, label) {
      if (rows.length === 0) return { ca_write_failed: false };
      try {
        await correctiveActions.insertCorrectiveActions(rows);
        return { ca_write_failed: false };
      } catch (e) {
        // Soft-fail: the daily-check row is already committed — a CA-insert
        // failure is logged, NOT thrown (matches the routes' `ca_write_failed`).
        log.error("submitHaccpDailyCheck CA insert failed", {
          label,
          error: e instanceof Error ? e.message : String(e),
        });
        return { ca_write_failed: true };
      }
    },
  };
}
