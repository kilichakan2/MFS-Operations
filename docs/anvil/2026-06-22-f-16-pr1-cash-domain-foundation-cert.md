# ANVIL Clearance Certificate

Date: 2026-06-22
App: MFS-Operations
Branch: feat/f-16-pr1-cash-domain
PR: #59 — https://github.com/kilichakan2/MFS-Operations/pull/59

## Scope — what this certificate actually covers

F-16 PR1 is a **pure hexagonal extraction (introduce-only)**. It adds the Cash
domain foundation — domain types, two ports, Supabase + Fake adapters, the
`CashService`, and one wiring composition root — plus additive barrel re-exports.
**The new cash code has NO production caller**: no route imports it, no migration
ships, no RLS or UI changes. PR2 wires the routes; F-RLS-04e changes the DB.

> 🗣 In plain English: this PR builds the cash-handling engine and sets it on the
> bench, but doesn't plug it into the car yet. Nothing live calls it, so the entire
> risk surface (CSV builders, validation cascades) lives in the unit layer — which is
> fully covered. There is nothing for a database/route/browser test to exercise.

| Change / path                                                                                          | Risk tier | Layers required          | Layers run             |
| ----------------------------------------------------------------------------------------------------- | --------- | ------------------------ | ---------------------- |
| `lib/domain/Cash.ts` (domain types)                                                                    | Low       | Unit                     | Unit ✅                |
| `lib/ports/CashRepository.ts`, `lib/ports/AttachmentStorage.ts` (owned interfaces)                     | Low       | Unit + architecture rung | Unit ✅ + arch rung ✅ |
| `lib/services/CashService.ts` (CSV builders, validation, deleteEntry composition)                      | Med       | Unit (on fakes)          | Unit ✅ 93 in 3 files  |
| `lib/adapters/supabase/CashRepository.ts`, `lib/adapters/supabase/AttachmentStorage.ts` (vendor impl) | Low       | Unit (typecheck/lint)    | Lint ✅ + typecheck ✅ |
| `lib/adapters/fake/*` (in-memory fakes)                                                                | Low       | Unit                     | Unit ✅                |
| `lib/wiring/cash.ts` (composition root)                                                                | Low       | Unit                     | Unit ✅                |
| 5 barrel `index.ts` edits (additive re-exports)                                                        | Low       | Introduce-only guard     | Guard ✅               |

**Not run under the efficiency dial:** Integration (Vitest), Database (pgTAP/RLS),
Edge Functions (Deno), and E2E (Playwright) were **deliberately not run** — this is a
justified scope decision, NOT a skip. This PR ships no route change, no migration, no
RLS change, no UI change, and the new cash code has no production caller, so there is
nothing new for those layers to exercise. Running them would test only unchanged,
pre-existing behaviour.

> 🗣 In plain English: a database/browser test proves a live path works. F-16 PR1
> creates no live path — the code is unplugged — so those layers have nothing of this
> PR to check. We say that out loud rather than stamping a hollow ✅.

**Baseline characterisation pass?** No — this is a normal diff-driven matrix.

## Test Results

| Layer                 | Status                       | Notes                                                                                                                       |
| --------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Unit (Vitest)         | ✅ 1972/1972 passed          | Full suite, clean state. 112 files. Includes the 44 new cash tests + the architecture pin `no-adapter-imports.test.ts`.    |
| — cash subset         | ✅ 93/93 passed              | `CashService.test.ts` + `wiring/cashService.test.ts` + `lint/no-adapter-imports.test.ts` run explicitly, all green.       |
| Lint (next lint)      | ✅ clean                     | "No ESLint warnings or errors" — includes the no-adapter-imports boundary rule.                                            |
| Typecheck (tsc)       | ✅ clean                     | `tsc --noEmit` produced zero diagnostics.                                                                                  |
| Architecture rung     | ✅ pass                      | Seam crossed (new ports + adapters). No vendor SDK (`@supabase`/`@vercel`/`stripe`) in domain/ports/service. Service tested on in-memory fakes. |
| Integration (Vitest)  | n/a — not required           | No route/caller exercises the new code; no live path to test.                                                              |
| Database (pgTAP/RLS)  | n/a — not required           | No migration, no RLS change in this PR.                                                                                    |
| Edge Functions (Deno) | n/a — not required           | No edge function touched.                                                                                                  |
| E2E (Playwright)      | n/a — not required           | No UI change, no route change; nothing to drive in a browser.                                                              |

## Introduce-only guard

- `git diff main` touches **NO `app/**`** ✅
- `git diff main` touches **NO `supabase/migrations/**`** ✅
- Only non-`lib/` additions are the docs plan + 2 test files ✅
  (`docs/plans/2026-06-22-f-16-pr1-cash-domain-foundation.md`,
  `tests/unit/services/CashService.test.ts`, `tests/unit/wiring/cashService.test.ts`)
- 5 barrel `index.ts` edits are **additive only** ✅ (44 insertions, 0 deletions across
  `lib/{domain,ports,services}/index.ts` + `lib/adapters/{fake,supabase}/index.ts`)

> 🗣 In plain English: the diff is "new files only, plus table-of-contents lines that
> add — never remove or rewrite." Nothing existing was disturbed, which is exactly
> what an introduce-only PR must look like.

## Architecture / depth confirmation

The cash code follows the project's Lego rule: the domain (`lib/domain/Cash.ts`) and
ports (`lib/ports/*`) own the interface; the Supabase SDK is imported **only** in
`lib/adapters/supabase/`; the service depends on the ports, never on a vendor; the
adapter is wired to the service factory in `lib/wiring/cash.ts`. Rip-out test holds:
replacing the storage/DB vendor = one new adapter + one wiring line.

## Warnings (non-blocking)

None for PR1. **Three 🟡 carry-forward risks** flagged by Guard belong to **PR2 (route
wiring), not PR1** — they cannot manifest while the code has no caller:

1. **First-month opening-balance 400** — the opening-balance path for the first cash
   book month may return a 400; verify when the route is wired in PR2.
2. **`.maybeSingle()` miss-branch parity** — confirm the adapter's `.maybeSingle()`
   null/miss behaviour matches the route's expectations once routes call it.
3. **`updateCheque` / `setMonthLocked` response-shape mapping** — confirm the
   service→route response shape mapping when PR2 wires these.

> 🗣 In plain English: three things to watch when the engine gets plugged in next PR.
> None can fire today because nothing calls the cash code yet — so they are notes for
> PR2's ANVIL run, not blockers for PR1.

## Migration

None. No migration ships in this PR.

**Rollback script: N/A** — no migration → no rollback artifact required. Revert =
drop the branch / revert the merge commit.

PITR confirmed: N/A — no destructive migration.

## Merge Sequence

No migration, so the migration-first step is skipped:

1. Merge PR #59 → Vercel auto-deploys (code-only).
2. No production smoke required for behaviour change — the new code has no caller, so
   live behaviour is byte-identical to `main`.

## Verdict

✅ CLEARED FOR PRODUCTION
