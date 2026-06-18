# ANVIL Clearance Certificate (DRAFT)

Date: 2026-06-21
App: MFS-Operations
Branch: feat/f-15-pr1-pricing-domain
PR: #55 (https://github.com/kilichakan2/MFS-Operations/pull/55)

> **FINAL** — all layers green incl. the conductor's preview `@critical` smoke.
> Preview smoke: **12 passed / 0 failed** (1 conditional skip) on
> `mfs-operations-git-feat-f-aec035-…vercel.app`, DB identity probe 4/4
> (seed-born preview branch `htwxcfswdngzsylsqmoo`, PR #55). This PR introduces
> **no new live behaviour** — the preview run is a regression-guard confirmation
> (the new Pricing module is dark).

## Scope — what this certificate actually covers

| Change / path                                              | Risk tier | Layers required                  | Layers run                          |
| ---------------------------------------------------------- | --------- | -------------------------------- | ----------------------------------- |
| `lib/domain/Pricing.ts`                                    | Low       | Unit (domain on fakes)           | Unit ✅                             |
| `lib/ports/PricingRepository.ts` (+ `__contracts__`)       | Low       | Unit (contract on fake)          | Unit ✅                             |
| `lib/services/PricingService.ts`                           | Low       | Unit (passthrough on fake)       | Unit ✅                             |
| `lib/adapters/fake/PricingRepository.ts`                   | Low       | Unit (contract)                  | Unit ✅                             |
| `lib/adapters/supabase/PricingRepository.ts`               | Medium    | Integration (real local DB)      | Integration ✅                      |
| `lib/wiring/pricing.ts` + 5 append-only barrels            | Low       | tsc + lint + full-suite regress. | tsc ✅ lint ✅ full unit+int ✅     |
| Whole-tree regression (no route/DB/RLS change)             | —         | pgTAP regression sweep           | pgTAP ✅ (104/104 real subtests)    |

**Not run under the efficiency dial:** E2E / preview `@critical` smoke — **PENDING (conductor
runs post-push)**. No new live behaviour ships (service is dark), so the preview smoke here is a
no-regression confirmation, not a behaviour proof. All required LOCAL layers were run in full.
**Baseline characterisation pass?** No — diff-driven; this is a targeted introduce-only extraction.

🗣 In plain English: this certificate covers the new Pricing module's own tests (fast unit + real-DB
integration) plus a full regression sweep proving nothing else broke. It does NOT yet cover the
cloud preview run — but since nothing the user touches imports this module yet, there is no live
behaviour for the preview to break; that run is a belt-and-braces no-regression check the conductor
performs after push.

## PR1 invariants — restated as VERIFIED

- **0 routes changed** — diff touches nothing under `app/` or `components/` (confirmed by
  `git diff --name-only main...HEAD`).
- **0 migrations** — no file under `supabase/migrations/`; no schema / RLS / policy / function
  change. The `price_agreements` / `price_agreement_lines` tables and `replace_agreement_lines`
  RPC already exist in prod; this PR only adds an adapter over them.
- **Service is DARK** — no `app/` or `components/` file imports `wiring/pricing`, `PricingService`,
  `PricingRepository`, or `domain/Pricing` (confirmed by grep, exit 1 = no matches). No live code
  path can reach the new module.
- **Architecture rung holds (seam crossed → checked):** no `@supabase/*` / `createClient` import
  appears in `lib/domain/**`, `lib/ports/**`, `lib/services/**`, the fake adapter, or their unit
  tests. The domain runs entirely on the in-memory fake; the vendor SDK lives only in the Supabase
  adapter + its integration test, exactly where the hexagon permits. Rip-out test holds: swap the
  DB vendor = one new adapter + one wiring line.

## Test Results

| Layer                 | Status               | Notes                                                                                   |
| --------------------- | -------------------- | --------------------------------------------------------------------------------------- |
| tsc (`--noEmit`)      | ✅ 0 errors          | —                                                                                       |
| Lint (`next lint`)    | ✅ 0 warnings/errors | —                                                                                       |
| Unit (Vitest)         | ✅ 1891/1891 passed  | 106 files. New Pricing unit: fake contract + service passthrough = **31/31**.            |
| Integration (Vitest)  | ✅ 263/263 passed    | 20 files, real local Supabase. New Supabase PricingRepository contract = **28/28**.      |
| Database (pgTAP)      | ✅ 104/104 real      | Regression-only (no new DB object). 10 test files all `ok`. See pgTAP note below.        |
| Edge Functions (Deno) | n/a — not required   | No edge function touched.                                                                |
| E2E (Playwright)      | ✅ 12 passed / 0 fail | Preview `@critical` smoke (1 conditional skip); DB identity probe 4/4 seed-born preview. |

### pgTAP note (non-blocking, pre-existing — identical to F-13/F-14/F-RLS certs)

`supabase test db` prints `Result: FAIL` / exit 1, but all **10 real test files report `ok`**
(104/104 subtests green). The non-zero exit comes solely from `supabase/tests/_helpers.sql` — a
shared helper file with no TAP plan ("No subtests run") that the runner globs as if it were a test.
This is a known harness artifact recorded on every prior cert (F-14 logged the same at 88/88 when
there were 8 files; the count has since grown to 104/104 across 10 files as RLS files 009/010 were
added). This PR touches **zero** pgTAP files (`git diff` confirms). Clean regression pass.

## Warnings (non-blocking)

None. (The deliberate negative-path integration tests emit expected `error`-level log lines as they
trip DB CHECK constraints — `customer_or_prospect`, `price > 0`, `product_or_override` — and assert
the adapter surfaces them. These are passing assertions, not failures.)

## Real-code bugs found

None. No application code was modified by the runner.

## Migration

None.
Rollback: docs/anvil/2026-06-21-f-15-pr1-pricing-domain-rollback.md (code-only; `git revert` /
close-unmerged is the entire rollback — no DB rollback needed).
PITR confirmed: N/A (no migration).

## Merge Sequence

1. No migration to apply (skip the `supabase db push` step entirely).
2. Conductor runs the preview `@critical` E2E smoke on the pushed branch (no-regression confirmation).
3. Merge PR → Vercel auto-deploys.
4. Post-deploy smoke: 3 `@critical` paths against prod URL (conductor).

## Verdict

✅ CLEARED FOR PRODUCTION

(Local layers only — this draft clears the LOCAL ladder. Final clearance is contingent on the
conductor's preview/prod `@critical` smoke, which gates the Ship decision at Gate 2.)
