# ANVIL Record — SUSPENDED (infrastructure unreachable)

Date: 2026-06-29
App: MFS-Operations
Branch: fprod04-pass1-print-regression-hardening
PR: #98
Status: ⏸️ SUSPENDED — NOT CLEARED (local Docker/Supabase unreachable; sandbox-denied from starting it)

## What this records

This is **not** a clearance certificate and **not** a 2-loop test failure. The unit
layer ran and passed, and the mandatory mince-test fix was applied and committed. The
two E2E layers could not run because the local full-stack rung (Docker + local
Supabase) is down on this machine and the runner is sandbox-denied from starting it.
Per ANVIL, a required infrastructure dependency being unreachable mid-Verify is a
🔴 SUSPEND — the run holds rather than clearing on the rungs that happened to run.

## Scope — what was under test

| Change / path | Risk tier | Layers required (approved matrix) | Layers run |
| --- | --- | --- | --- |
| `lib/printing/labelFetch.ts` (shared print client + pure `classifyLabelResponse`) | Medium (HACCP print path, no API/DB/auth change) | Unit + E2E new + E2E @critical regression | Unit only |
| `tests/e2e/29-haccp-print-dead-session.spec.ts` (mince self-skip fixed) | — | E2E new | not run (infra) |

Layers correctly excluded by the approved matrix: Integration (no API/DB change),
pgTAP/RLS (no migration, no policy), PITR (no destructive migration), Edge functions
(none touched). These are `n/a — not required`, not gaps.

## Per-layer results

| Layer | Status | Notes |
| --- | --- | --- |
| Unit (Vitest) | ✅ 8/8 passed | `tests/unit/printing/labelFetch.test.ts` — classifier: label / auth-bounce / 401·404·500 errors / malformed-url guard / `/login`-in-query not misclassified |
| TypeScript (touched files) | ✅ clean | `tsc --noEmit` reported no errors in `29-haccp-print-dead-session.spec.ts` or `labelFetch.ts` |
| E2E new — `29-haccp-print-dead-session.spec.ts` (3 tests) | ⏸️ SUSPENDED | Local Supabase (`:54321`) and dev server (`:3000`) both connection-refused; `docker info` times out (EXIT 124). Cannot boot the auto-server without local Supabase. |
| E2E @critical regression (75 specs) | ⏸️ SUSPENDED | Same blocker — needs the local stack up. |
| Local full-stack rung (Supabase CLI adapter) | 🔴 could not come Up | `docker info` unresponsive; `open -a Docker` and `supabase start` both sandbox-denied; `git push` also denied. |

## Mandatory fix (code-critic 🟡 #2) — DONE, path taken: built its own mince run

The mince dead-session test previously called `test.skip(!hasPrintable)`, which would
self-skip on an empty seed and produce a green run with **zero** mince-print coverage.

Investigation of `app/haccp/mince/page.tsx` showed a mince run is fully creatable via
the UI with no pre-seeded data: the submit gate requires only species + kill date +
input temp + output temp (source delivery batches are optional). Using the
**Imported / vac-packed** species (which has `killEnforced: false`, so no kill-date
limit can block it) makes the run unconditionally submittable.

The test now calls a new `logMinceRun(page)` helper that logs an all-pass mince run
(species → past kill date → input 5°C → output 1°C → Submit), then prints from the row
that appears in "Today's mince runs". **The self-skip is removed; the mince print path
is now always exercised.** Committed as `f7b14c7` (not yet pushed — see Outstanding).
This means no documented coverage gap is needed — the preferred "build own run" path
was viable.

## Migration / rollback

Migration: **None.** This is a code-only, client-side change (no `/api/labels`,
`middleware.ts`, session/auth, Sunmi bridge, DB, or migration touched). Happy path is
byte-identical.

Rollback note: revert the PR (`git revert` / redeploy previous Vercel build). No data
migration to reverse, so no rollback SQL and no PITR.

## Root-cause hypothesis (the suspend, not a code fault)

Docker Desktop is not running on this machine, so local Supabase cannot start; the
runner's sandbox denies launching Docker, running `supabase start`, and `git push`.
Nothing observed indicates a fault in the change under test — the unit classifier is
fully green and the helper compiles cleanly. The E2E proof is pending the stack only.

## Outstanding actions to clear (hand-back to conductor / Hakan)

1. **Start Docker Desktop**, then `npm run db:up` and `npm run db:reset` (fresh seed).
2. **Push the committed test fix**: `git push origin fprod04-pass1-print-regression-hardening`
   (local commit `f7b14c7` — needed so branch HEAD matches what gets verified).
3. Re-run the two E2E layers locally:
   - `npx playwright test --project=chromium tests/e2e/29-haccp-print-dead-session.spec.ts`
   - `npx playwright test --project=chromium --grep @critical`
4. If both green with the mince test no longer skipping, re-enter Lock and issue the
   clearance certificate.

## Verdict

⏸️ SUSPENDED — NOT CLEARED. Unit green; mandatory mince fix applied; E2E pending the
local stack. No clearance certificate is issued.
