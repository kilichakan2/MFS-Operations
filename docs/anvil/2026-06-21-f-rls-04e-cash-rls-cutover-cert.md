# ANVIL Clearance Certificate

Date: 2026-06-21
App: MFS-Operations
Branch: f-rls-04e-cash-rls-cutover
PR: #61
Preview build: dpl_6T7qcUCXm8h67VHCWahaBQ3g5G7Q (commit ab4adea, state READY)
Preview URL: https://mfs-operations-lwahmw1hs-hakan-kilics-projects-2c54f03f.vercel.app

## Scope — what this certificate actually covers

| Change / path                                                                 | Risk tier | Layers required                  | Layers run                                    |
| ----------------------------------------------------------------------------- | --------- | -------------------------------- | --------------------------------------------- |
| 7 cash route files (11 handlers) flipped to `cashServiceForCaller(userId)`    | Critical  | Unit + Integration + pgTAP + E2E | Unit ✓ · Integration ✓ · pgTAP ✓ · E2E+deep ✓ |
| `lib/wiring/cash.ts` two-port split (authenticated svc + master-key storage)  | Critical  | Unit (=== port-identity proof)   | Unit ✓ (cashServiceForCaller.test.ts)         |
| Migration `20260621120000_cash_authenticated_rls_policies.sql` (12 policies)  | Critical  | pgTAP + Integration + E2E        | pgTAP ✓ (14/14) · Integration ✓ · deep E2E ✓  |

**Not run under the efficiency dial:** None — this is the Critical tier (RLS / auth / migration). Full ladder run, AND the full high-risk double-run: local rungs + a deep cash CRUD round-trip on the live Vercel preview (beyond the @critical smoke).
**Baseline characterisation pass?** No — diff-driven, full coverage of the changed surface.

🗣 In plain English: this change re-locks the cash screens so every read/write runs as the
logged-in user under database security rules, instead of a master key that sees everything. Because
it touches money handling + security + a migration, it earned the full test ladder with no shortcuts,
plus a live-preview proof that a real user can still create and read a cash entry.

## Test Results

| Layer                 | Status            | Notes                                                                                                  |
| --------------------- | ----------------- | ------------------------------------------------------------------------------------------------------ |
| Unit (Vitest)         | ✅ 1984/1984 passed | Incl. `tests/unit/wiring/cashServiceForCaller.test.ts` — asserts the two-port `===` split (auth svc vs master-key storage). |
| Integration (Vitest)  | ✅ 27/27 passed    | `tests/integration/cash.test.ts` against local Supabase (post `db:reset` with new migration). Incl. 4 new F-RLS-04e cutover proofs: SELECT end-to-end under the badge, INSERT under the badge + office gate passes, role gates still 403 in the app (not RLS), cheque FK-embed driver name non-blank. |
| Database (pgTAP)      | ✅ 14/14 passed    | `supabase/tests/012-rls-cash.test.sql` reports `... ok` in the full-suite run (whole suite: 130 assertions, no `not ok`). Valid-user CRUD + empty-GUC fail-closed deny (42501) + master-key bypass. |
| Edge Functions (Deno) | n/a — not required | No edge function in this diff.                                                                          |
| E2E (Playwright)      | ✅ 12/12 + deep    | @critical preview smoke 12 passed / 1 skipped (skip = conditional KDS reopen case, non-cash). Deep cash verify: 1 passed (see below). |

### pgTAP suite-level note (read before reacting to "Result: FAIL")

`supabase test db --local` prints `Result: FAIL` at the SUITE level, but every real test file
reports `... ok` (12 files, 130 assertions, zero `not ok`, zero `Failed N/M`). The FAIL is solely
attributable to `supabase/tests/_helpers.sql` — an `\ir`-included helper file, not a test, which
emits 0 tests and trips "No plan found in TAP output". This is the documented pre-existing artifact,
not a regression introduced by this PR. `012-rls-cash.test.sql` passed its full `plan(14)`.

### Deep preview verify (the high-risk rung Hakan insisted on)

Proved on the REAL Vercel preview + its Supabase preview branch (NOT prod; previewProbe confirmed all
4 DB-identity checks → seed-born preview DB):

- **Auth:** real UI login (admin password flow) → genuine session cookie → `page.request` carries it →
  middleware injects `x-mfs-user-id`/`x-mfs-user-role` → route builds `cashServiceForCaller(userId)`
  (identical authenticated RLS path to office; admin used only because opening a month is admin-gated).
- **SELECT under the badge:** `GET /api/cash/month?year&month` → 200, shape `{exists, month, entries, summary}`.
- **INSERT under the badge:** `POST /api/cash/entry` (amount 0.01, tagged description) → 201, amount is a JSON number.
- **Read-back visibility:** re-fetched the month → the just-created entry id present in `entries` (the
  create→read round-trip a blank SELECT policy would have hidden). Response shape unchanged.
- **DELETE under the badge:** probe row deleted → 200; preview DB left clean.
- **Result:** `1 passed (8.5s)` — RLS permits valid-user CRUD end-to-end on the live deploy, and the
  per-caller authenticated client path works against the real database, not just local pgTAP.

🗣 In plain English: on the actual deployed site, a logged-in user created a cash entry and read it
straight back through the new locked-down path — proving the security rules let real users do their
job. The test row was deleted afterwards so nothing is left behind.

## Architecture rung (seam crossed — wiring split a port)

✅ `lib/wiring/cash.ts` exposes `cashServiceForCaller(userId)` (authenticated table client) while the
`AttachmentStorage` port stays on the master-key singleton — deliberate (the cash-attachments bucket
has no authenticated storage.objects policies). The `===` port-identity split is unit-pinned. No vendor
SDK leaks past the adapter boundary. Seam holds.

## Warnings (non-blocking)

- 🟡 One @critical E2E spec skipped (`04-kds-line-undo` reopen-warning, conditional, non-cash) — pre-existing conditional skip, unrelated to this change.
- 🔵 Test-infra: `scripts/e2e-preview.mjs` gained a backward-compatible optional `--grep <pattern>`
  passthrough (default `@critical` unchanged) so ANVIL could run the one-off `@cash-deep` deep-verify
  spec through the SAME guard+env wiring as the standing smoke. The one-off spec itself was removed
  after the proof (it requires a live preview + admin creds; not standing coverage). **LOCK DECISION
  (conductor): REVERTED** — the passthrough served its purpose; reverting keeps the shipped tree
  byte-identical to the exact commit ANVIL certified (`ab4adea`), with no rebuild and no stale-cert
  risk. Can return in its own tiny PR later if wanted.

## Migration

Additive — `CREATE POLICY` only (12 policies across cash_months / cash_entries / cheque_records).
No DROP TABLE / TRUNCATE / ALTER TYPE / DROP COLUMN / DROP NOT NULL → **NON-DESTRUCTIVE, no PITR gate fires.**
(The leading `DROP POLICY IF EXISTS` lines are idempotency guards on the NEW policies, not data ops.)
Rollback script: docs/anvil/2026-06-21-f-rls-04e-cash-rls-cutover-rollback.sql (two-layer parachute:
LAYER 1 = swap each flipped route's `cashServiceForCaller(userId)` → master-key `cashService` singleton,
no SQL deploy; LAYER 2 = drop the 12 policies only if returning to bare RLS-enabled-no-policy).
PITR confirmed: N/A (non-destructive).

## Merge Sequence

1. Apply migration to PROD FIRST (Supabase MCP `apply_migration` / `supabase db push --project-ref uqgecljspgtevoylwkep`) — additive, safe before code.
2. Merge PR #61 → Vercel auto-deploys.
3. Smoke test: @critical paths on https://www.mfsops.com (post-deploy), then a manual cash create+read sanity check.

## Verdict

CLEARED FOR PRODUCTION
