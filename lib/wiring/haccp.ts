/**
 * lib/wiring/haccp.ts — composition root for the HACCP Cluster A domain (F-19 PR1)
 *
 * The ONE business-layer file where the HACCP daily-check + corrective-action
 * ports are bolted to their concrete vendor adapters. Like `lib/wiring/cash.ts`
 * / `lib/wiring/visits.ts`, this is one of the only files allowed to import from
 * `@/lib/adapters/*` — everything in `lib/services/**` + `lib/usecases/**`
 * depends on ports alone (ADR-0002), pinned by
 * `tests/unit/lint/no-adapter-imports.test.ts`.
 *
 * SERVICE-ROLE SINGLETONS ONLY. PR1 wires the MASTER-KEY (RLS-bypassing)
 * service-role client — exactly the access the routes have today, so the PR2
 * re-point is byte-identical. The 30 HACCP tables have RLS ENABLED + ZERO
 * policies (a deny-all trap only service-role opens), so the master key is the
 * only thing that works on them today.
 *
 * NO `…ForCaller(userId)` per-request authenticated factory is added here — that
 * fires RLS and is DEFERRED to F-RLS-04h (Cluster G, PR10, the closing lock),
 * exactly as F-18's `visitsServiceForCaller` was added later by F-RLS-04g and
 * F-16's `cashServiceForCaller` is deferred to F-RLS-04e. The per-table policy
 * set lands with that PR. (Wiring test pins that no `…ForCaller` leaked early.)
 *
 * Rip-out contract (CLAUDE.md acceptance test): swapping the database vendor for
 * HACCP Cluster A = one new adapter per port
 * (`lib/adapters/<vendor>/HaccpDailyChecksRepository` +
 * `…/HaccpCorrectiveActionsRepository`) + the two wiring lines below.
 * The services, the use-case, `lib/domain/Haccp*`, and the ports are untouched.
 *
 * INTRODUCE-ONLY (F-19 PR1): these singletons are constructed but have NO
 * caller — the 9 HACCP routes are untouched. PR2 throws the switch.
 */
import {
  createHaccpDailyChecksService,
  createHaccpCorrectiveActionsService,
  type HaccpDailyChecksService,
  type HaccpCorrectiveActionsService,
} from "@/lib/services";
import {
  createSubmitHaccpDailyCheck,
  type SubmitHaccpDailyCheck,
} from "@/lib/usecases/submitHaccpDailyCheck";
import {
  supabaseHaccpDailyChecksRepository,
  supabaseHaccpCorrectiveActionsRepository,
} from "@/lib/adapters/supabase";

export const haccpDailyChecksService: HaccpDailyChecksService =
  createHaccpDailyChecksService({
    dailyChecks: supabaseHaccpDailyChecksRepository,
  });

export const haccpCorrectiveActionsService: HaccpCorrectiveActionsService =
  createHaccpCorrectiveActionsService({
    correctiveActions: supabaseHaccpCorrectiveActionsRepository,
  });

export const submitHaccpDailyCheck: SubmitHaccpDailyCheck =
  createSubmitHaccpDailyCheck({
    dailyChecks: haccpDailyChecksService,
    correctiveActions: haccpCorrectiveActionsService,
  });

// F-RLS-04h (LATER) will add the per-caller authenticated factories here,
// mirroring visitsServiceForCaller. NOT in PR1 — service-role singletons only.
