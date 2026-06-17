# ANVIL Clearance Certificate

> **FINALIZED at Lock by the FORGE conductor (2026-06-17).** ANVIL Runner ran the approved
> Gate-3 matrix cleanly from the branch and found no blockers; no destructive migration → no
> PITR required. Pre-ship preview smoke result recorded at the foot of this cert.

Date: 2026-06-17
App: MFS-Operations
Branch: feat/f-14-routes-domain-pr1
PR: #50 — feat(routes): Routes domain foundation (F-14 PR1)
HEAD: 12abe754e3a2b06870e06c294abc475d3b9bbe36

## Scope — what this certificate actually covers

F-14 PR1 is an **INTRODUCE-ONLY hexagonal extraction** of the Delivery Routes domain. It ADDS a
new owned port + two adapters + a service + a composition root + a lifted UK-time util, plus their
tests. It does NOT edit any `app/**` route, contains NO migration, adds NO new dependency, and NO
production code calls the new engine yet.

🗣 In plain English: this PR slides a new self-contained "delivery routes" engine into the codebase
alongside the proven Orders/Users engines, but does not plug it into anything live. The screens and
the existing web handlers are untouched, so there is no behaviour to break.

| Change / path                                          | Risk tier | Layers required        | Layers run                          |
| ------------------------------------------------------ | --------- | ---------------------- | ----------------------------------- |
| `lib/domain/Route.ts` (+ barrel)                       | Low       | Unit (types via service/contract) | Unit ✓                   |
| `lib/ports/RoutesRepository.ts` (+ contract, barrel)   | Med       | Unit (contract) + Integration | Unit ✓ + Integration ✓       |
| `lib/adapters/fake/RoutesRepository.ts` (+ barrel)     | Med       | Unit (contract)        | Unit ✓ (Fake contract 15/15)        |
| `lib/adapters/supabase/RoutesRepository.ts` (+ barrel) | Med       | Integration (real PG)  | Integration ✓ (15/15 vs local PG)   |
| `lib/services/RoutesService.ts` (+ barrel)             | Med       | Unit (Fake) — rollover + week bounds | Unit ✓ (RoutesService 7/7) |
| `lib/utils/ukDateAndHour.ts` (`getUKWeekBounds`)       | Low       | Unit                   | Unit ✓ (ukDateAndHour 19/19)        |
| `lib/wiring/routes.ts`                                 | Low       | Lint pin (no-adapter-imports) | Unit ✓ (lint pin 22/22)      |
| `docs/plans/BACKLOG.md` (ARCH-FU-06 entry)             | None      | n/a                    | n/a — doc                           |

**Not run under the efficiency dial:**
- **pgTAP / RLS** — `n/a — not required`. No policy change, no schema change. RLS on `routes` /
  `route_stops` is unchanged (enabled, no policies; service-role bypasses it). Routes RLS policies
  are F-RLS-04c, a later unit. (Confirmation sweep run anyway: existing pgTAP suite 88/88 real tests
  green — see note below.)
- **E2E `@critical`** — `n/a — not required` for this PR. Introduce-only: no route/UI touched, no
  wire-shape change, no production importer, so there is nothing to smoke. The conductor runs the
  pre-ship preview smoke at Gate 4. NOT run here by design (preview/prod smokes are not spun up for
  an introduce-only PR with zero behaviour change).

**Baseline characterisation pass?** No — this is a normal diff-driven matrix on a focused PR.

🗣 In plain English: the certificate covers the new engine's logic and its database adapter against
a real local Postgres. It deliberately does NOT cover database security policies or browser flows,
because this PR changed neither — and it says so plainly so nobody later reads a bare ✓ as
"everything was tested."

## Test Results

| Layer                 | Status                | Notes                                                         |
| --------------------- | --------------------- | ------------------------------------------------------------- |
| Unit (Vitest)         | ✅ 1803/1803 passed   | Whole suite; matches approved baseline of 1803. Zero regression. F-14 additions inside it: RoutesService 7/7, Fake contract 15/15, ukDateAndHour 19/19, no-adapter-imports pin 22/22. |
| Integration (Vitest)  | ✅ 211/211 passed     | Full integration suite vs LOCAL Postgres (Docker stack up). Includes Supabase `RoutesRepository` contract **15/15** — proves UNIQUE(route_id,position) rollback + cascade-delete live. Broader suite unbroken. |
| Typecheck (tsc)       | ✅ 0 errors           | `tsc --noEmit` clean. STRICT.                                 |
| Lint (next lint)      | ✅ 0/0                | No ESLint warnings or errors. STRICT.                         |
| Database (pgTAP)      | n/a — not required    | No policy/schema change (F-RLS-04c owns Routes RLS). Confirmation sweep: 88/88 real subtests green (see pgTAP note). |
| Edge Functions (Deno) | n/a — not required    | No edge function touched.                                     |
| E2E (Playwright)      | n/a — not required    | Introduce-only; no route/UI change. Pre-ship preview smoke is the conductor's Gate 4 step. |

### pgTAP note (non-blocking, pre-existing)
`supabase test db` printed `Result: FAIL` / exit 1, but all 8 test files report `ok` and **88/88
real subtests pass**. The FAIL originates solely from `supabase/tests/_helpers.sql` — a shared
include file with no TAP plan ("No plan found in TAP output / No subtests run"). F-14 touched zero
`.sql` / `supabase/**` files, so this is a pre-existing harness artifact, not a regression and not
introduced by this PR.
🗣 In plain English: every database-policy test passed; the "FAIL" line is the runner complaining
that a shared helper snippet (correctly) contains no tests — that has always been the case here.

## Architecture rung (change crosses a seam)

This PR introduces a new seam (`RoutesRepository` port), so the architecture rung applies:
- The touched port has a **domain-only test substrate**: the shared contract suite
  (`lib/ports/__contracts__/RoutesRepository.contract.ts`) runs against the in-memory **Fake**
  adapter with no DB / network / vendor SDK — 15/15 green in the unit layer.
- **No vendor SDK is imported in any domain/service/port test.** `@supabase/*` appears only in
  `lib/adapters/supabase/**` (verified by the pinned `no-adapter-imports` lint test, 22/22). The
  Supabase contract test correctly lives in the integration layer, not the domain layer.

🗣 In plain English: the new engine genuinely runs on a stand-in for the database in its fast tests,
which proves the database can be swapped — the seam is real, not welded shut.

## Introduce-only invariants — all confirmed by the Runner

- `git diff --name-only main...HEAD` → zero `app/**`, zero `supabase/migrations/**`, zero
  `package.json` / lockfile. Only `lib/**`, `tests/**`, and one `docs/plans/BACKLOG.md` entry.
- No production importer: `grep -rln "wiring/routes" app/ components/` → NONE.
- `routesServiceForCaller` ships present but UNUSED, commented for F-RLS-04c (per Guard review
  `lib/wiring/routes.ts:60-68`).
- No migration → no PITR check, no destructive-migration flag.

## Rip-out test (CLAUDE.md acceptance)

**PASS.** Replacing Supabase for Routes = one new adapter file
(`lib/adapters/<vendor>/RoutesRepository.ts`) + one wiring change in `lib/wiring/routes.ts`. Domain,
port, service, and (since no route is wired yet) every consumer are untouched.

## Warnings (non-blocking) — PR2 carry-forward from the Guard review

These are NOT addressed in PR1 by design (introduce-only). They are recorded here so PR2 (the
re-point) picks them up consciously:
- **W1 — `createdAt: ""` empty-string sentinel** (`lib/adapters/supabase/RoutesRepository.ts:201`).
  Harmless in PR1 (no consumer). PR2 must NOT echo `createdAt` for the `[id]` / `today` endpoints.
  Cleaner fix: make `Route.createdAt: string | null`, emit `null`.
- **N1 — Fake-vs-Supabase divergence on `creator`/`createdBy`/`createdAt` for single reads.** The
  contract does not assert these on single reads, so suites stay green though the adapters differ.
  Tighten in PR2 (Fake mirrors the omission, or add a contract assertion).
- **N2 — `visited` column parity in GET-one select.** Today's `[id]` GET omits `visited` on stops;
  the adapter's single-read columns include it. PR2 will consciously ADD `visited` to the `[id]`
  GET response (desirable — `today` already returns it) — must be owned, not inherited silently.

🗣 In plain English: three notes the reviewer flagged are about the *next* PR (the one that wires
the engine into the live handlers and must match the old JSON exactly). They are correctly out of
scope for this introduce-only PR; the cert carries them forward so they don't get lost.

## Migration

None. No schema change, no policy change, no backfill.

**Rollback:** trivial — revert PR #50 (`git revert` / GitHub "Revert"). There is no migration to
undo and nothing in production references the new code, so a revert is a clean no-side-effect
removal of the new files.

PITR confirmed: N/A (no destructive migration; no migration at all).

## Merge Sequence (no migration → simplified)

1. ✅ All required tests passing (ANVIL certified — this cert).
2. No `supabase db push` step — F-14 PR1 has NO migration.
3. Merge PR #50 → Vercel auto-deploys (introduce-only: build adds new modules, no runtime path
   changes).
4. Conductor's Gate-4 pre-ship preview `@critical` smoke confirms no regression on the live build.
   (Expected unaffected — no behaviour change.)
5. Confirm the Supabase preview branch for PR #50 auto-deletes on merge (no orphaned branches).

## Verdict

✅ CLEARED FOR PRODUCTION (FINALIZED at Lock by the conductor, 2026-06-17)

No 🔴 blockers. All required layers ran and passed; unaffected layers correctly marked `n/a`. The
three Guard findings (W1/N1/N2) are PR2 carry-forward items, not PR1 defects.

## Pre-ship preview smoke (Gate 4)

Preview deployment `dpl_Hop3xoYg5e5QD5LESEdUp3ia5toh` (commit `12abe75`, branch head), state READY,
alias `mfs-operations-git-feat-f-d5896e-…vercel.app`. Ran the `@critical` Playwright suite via
`npm run test:e2e:preview -- <url> --unprotected` (protection OFF → BACKLOG F-INFRA-04).

- previewProbe: all 4 DB identity checks passed (deployment reads a seed-born preview DB).
- **10/10 runnable @critical passed** (50.2s), 1 skipped — the `04-kds-line-undo` reopen-warning
  spec (board-state dependent; proven deterministically at integration+pgTAP+unit, same as F-PROD-02).
- Exit code 0.

🗣 In plain English: the exact build about to ship was smoke-tested on its live preview and every
runnable critical path passed — confirming the dormant Routes engine didn't disturb anything live.
