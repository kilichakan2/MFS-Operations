# 0006 — Per-PR Supabase preview branches for pre-ship smokes

## Status

Accepted (2026-06-10 — Gate 1 lock + plan
`docs/plans/2026-06-10-f-infra-02-preview-smoke-plumbing.md`)

## Date

2026-06-10

## Deciders

Hakan Kilic (decision), FORGE grill session for F-INFRA-02

## Context

Vercel preview deployments inherited production Supabase credentials, so the
FORGE-mandated pre-ship smoke (`@critical` Playwright specs: 01-order-place,
02-picking-list-print, 03-kds-butcher-flow) could not run against a preview
without creating real orders in the production database. This gap was
discovered at F-01's ANVIL Gate 4 and tracked as F-INFRA-02. It is hard
prerequisite #3 for F-08 (Orders route rewrites) — the first migration unit
that changes user-visible behaviour and therefore must be smoke-tested on a
deployed build before merge.

Two options were considered for giving previews a safe database:

1. **Per-PR Supabase preview branches** — Supabase branching creates a
   disposable database per pull request, runs migrations + `supabase/seed.sql`
   automatically, and the Supabase↔Vercel integration injects the branch's
   credentials into the matching preview deployment. Requires the Supabase
   Pro plan (confirmed: project is on Pro) plus a small per-hour charge per
   active branch.
2. **A single persistent staging Supabase project** — free, but all PRs share
   one mutable database (state leakage between PRs) and migrations must be
   applied to staging manually per PR, making the smoke's signal unreliable.

## Decision

- Every pull request gets an **ephemeral Supabase preview branch**; the
  Vercel preview deployment for that PR is wired to the branch, never to
  production.
- **Hard invariant: no Vercel preview deployment may carry production
  Supabase credentials.** If a preview branch does not exist or its
  credentials are unavailable, the pre-ship smoke **fails closed** — the PR
  does not ship; there is no fallback to production.
- Preview branches are **deleted when their PR closes** (merge or abandon).
  The FORGE ship checklist includes a "no orphaned branches left billing"
  verification step.
- `supabase/seed.sql` is extended with a clearly-marked `ANVIL-TEST` fixtures
  block (test customer, test product, test staff users with bcrypt-hashed
  test PINs) so every branch is born ready for the `@critical` specs. The
  seed file runs only on local resets and branch creation — never against
  production.
- The smoke is **FORGE-run at Gate 4** from the conductor's machine
  (`BASE_URL=<preview-url>` + Vercel Protection Bypass for Automation
  header). CI execution (GitHub Actions) remains a separate future unit.
- The bypass secret lives in gitignored `.env.e2e.local`, never committed.

## Consequences

Easier:

- F-08 and every later route-rewrite unit gets a true end-to-end pre-ship
  check against a deployed build with zero production risk.
- The Gate-4 "preview smoke: N/A" exemption used for zero-runtime-surface
  PRs is no longer needed for runtime-touching PRs — they must run the smoke.
- Schema drift between PRs is impossible; each branch runs the PR's own
  migrations from scratch.

Harder / costs:

- Ongoing dependency on the Supabase Pro plan + pennies-per-hour branch
  compute while a PR is open; orphaned branches would bill silently, hence
  the mandatory cleanup check.
- Test PIN bcrypt hashes become repo-visible in `seed.sql` (marginal: one
  test PIN already appears in a committed spec comment; seed never reaches
  production, and F-TD-07 audits production for historical fixture leakage).
- The local test flows (`npm run test:integration`, localhost Playwright)
  must remain byte-identical in behaviour when `BASE_URL` is unset — the
  unit may not regress the existing safety invariants documented in
  CLAUDE.md "Local test infrastructure".

## References

- `docs/plans/BACKLOG.md` — F-08 hard prerequisites
- `docs/anvil/2026-06-10-f-td-03-cert.md` — prerequisite #1 (done)
- `playwright.config.ts` — existing BASE_URL + webServer env invariant
- ADR-0003 — strangler-fig migration (why F-08 needs this net first)
