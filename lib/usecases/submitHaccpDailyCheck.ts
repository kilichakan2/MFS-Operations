/**
 * lib/usecases/submitHaccpDailyCheck.ts
 *
 * The corrective-action FILING use-case (F-19 PR1). It owns exactly ONE thing:
 * the soft-fail contract for filing corrective-action rows AFTER a daily-check
 * row has already been committed — "a CA-insert failure is logged, not thrown,
 * so a deviation submission still succeeds." The daily-check INSERT itself is
 * NOT composed here (see Decision 1).
 *
 * design: DESIGN DECISION 1 (resolved at Render as Ousterhout would — option (a)
 * "own the soft-fail contract", NOT option (b) "compose both writes"). The PR1
 * plan originally sketched a use-case that composes the daily-check insert THEN
 * the CA fan-out behind one method. We rejected that: the 7 daily-check
 * sub-domains have HETEROGENEOUS inserts (delivery inserts one row + returns an
 * id; cold-storage inserts N readings; mince-prep dispatches 3 different forms;
 * calibration has two modes; process-room writes two tables) and a bespoke
 * CA-derivation each. Forcing all seven insert+derive paths through one
 * `submit…` method would NOT be a deep module — it would be a SHALLOW 7-way
 * dispatcher whose interface (a union input covering all 7 forms) is nearly as
 * large as the per-route code it hides, merely RELOCATING each route's
 * complexity. Ousterhout's deep-module test prefers a small module that truly
 * owns ONE thing over a shallow one pretending to own seven. So this use-case
 * owns the soft-fail rule alone; PR2's routes call the daily-checks service for
 * the (form-specific) insert, then this for the CA filing. Deletion test: delete
 * this and the try/catch "log-don't-throw" rule smears into every PR2 route — so
 * it holds weight. The CA service stays standalone anyway (admin queue/sign-off
 * routes need it with no daily-check), and ADR-0002 forbids a service importing
 * another service, so the CA-filing wrapper belongs in a use-case, not a service.
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
import type { HaccpCorrectiveActionsService } from "@/lib/services";
import { log } from "@/lib/observability/log";

export interface SubmitHaccpDailyCheckDeps {
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
