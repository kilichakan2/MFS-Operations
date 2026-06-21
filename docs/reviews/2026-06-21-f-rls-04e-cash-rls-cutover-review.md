# Code review — F-RLS-04e Cash-context RLS cutover

**Date:** 2026-06-21
**Branch / PR:** `f-rls-04e-cash-rls-cutover` / PR #61 (base `main`, from `b83ef53`)
**Reviewer:** code-critic subagent (FORGE Guard phase — sole review authority)
**Plan:** `docs/plans/2026-06-21-f-rls-04e-cash-rls-cutover.md`

## VERDICT: SHIP

Clean, faithful 4th copy of the proven per-request authenticated-client RLS cutover
(Orders F-RLS-04a → Users F-RLS-04b → Pricing F-RLS-04d → Cash). No blockers, no
should-fix, no nice-to-haves. Hand to ANVIL.

## Diff scope
13 files, +793 / −15. Migration + wiring factory + 7 route flips + pgTAP + integration
+ wiring unit test + rollback runbook. Byte-identical wire (only 15 deletions, all the
import-swap shadows).

## Focus-area findings — all PASS

1. **Two-port split in `cashServiceForCaller` — CORRECT.** `lib/wiring/cash.ts:173-183`:
   table port `createSupabaseCashRepository(client)` = per-caller authenticated client;
   storage port `supabaseAttachmentStorage` = master-key singleton (same object). Wiring
   unit test `tests/unit/wiring/cashServiceForCaller.test.ts:97-103` asserts
   `passedDeps.attachments` `.toBe(STORAGE_SINGLETON)` — true `===` identity, not shape.
   The naive single-port pricing copy is explicitly avoided. This is the load-bearing
   correctness point and it is locked.

2. **RLS policy completeness / fail-closed — CORRECT.**
   `supabase/migrations/20260621120000_cash_authenticated_rls_policies.sql`: all 12
   policies (4 commands × `cash_months`/`cash_entries`/`cheque_records`). UPDATE policies
   carry both USING + WITH CHECK; INSERT WITH CHECK only; SELECT/DELETE USING only — all
   correct per command. Predicate `public.current_user_is_valid()` everywhere — no
   `USING (true)`, no over-grant (one policy per command → no OR-widening). Helper is
   SECURITY DEFINER STABLE, EXECUTE granted only to `authenticated`
   (`20260618130000_...sql:72-93`). pgTAP `012-rls-cash.test.sql` proves valid-user CRUD
   incl. both in-place UPDATEs, empty-GUC fail-closed (zero-row SELECT + 42501 INSERT),
   and master-key bypass.

3. **Per-route flip correctness — CORRECT.** 7 files / 11 handlers flip to
   `cashServiceForCaller(userId)`; `app/api/cash/upload/route.ts:16` correctly stays on
   the master-key `cashService`. Every per-caller service built AFTER the auth gate
   (below `if (!userId) return 401`, and below role-403 in the admin-only handlers).
   Storage sub-ops (signed-URL in `month GET`, `attachments.remove` in `entry/[id] DELETE`)
   ride the master-key storage port inside the per-caller service.
   - Nuance (not a finding): `cheques/[id] PATCH` builds the per-caller service before the
     per-action 403 branches (`cheques/[id]/route.ts:30`) — mints a token for an office
     user who then 403s on `edit`. Byte-identical on the wire (403, no DB call), matches
     the documented pricing pattern (inline comment lines 27-28). Harmless wasted mint, no
     over-grant.

4. **Byte-identical wire — CONFIRMED.** No status codes / response shapes / validation
   changed. Every edit is the import swap + `const cashService = await cashServiceForCaller(userId)`
   shadow line. `validateEntry` + `new Date()` (F-TD-28) untouched; `export GET` `now`
   untouched. 23 pre-existing cash integration tests pass unchanged.

5. **Hexagonal contract — PASS.** No `@supabase/*` import added outside `lib/adapters/`;
   adapters imported only in `lib/wiring/cash.ts`. No `package.json` change.
   `no-adapter-imports` pin passes. Rip-out test holds.

6. **Migration safety — PASS.** CREATE POLICY only (leading `DROP POLICY IF EXISTS` are
   idempotency guards on this migration's own policies, not destructive). No
   DROP TABLE/TRUNCATE/ALTER TYPE/DROP COLUMN/DROP NOT NULL → **no PITR gate**. Filename is
   a full 14-digit timestamp, after the latest (`20260619120000`). Applied cleanly on
   `db:reset`.

## Two implementer deviations — both ACCEPTED

- **Rollback file at `docs/anvil/2026-06-21-...-rollback.sql`** instead of the plan's
  non-existent `supabase/migrations/rollback/` path. Matches the real F-RLS-04d house
  style; documents the two-layer code-first-then-DB revert and ordering. Improves on the
  plan.
- **`seedCurrentMonth` seeds the real calendar month via the service-role client.** Sound:
  the suite lives in far-future Y=2099 (where the app gate 403s office writes), so proving
  "office can INSERT under the badge" requires the real current month. Service-role for
  fixture setup is correct (bypasses RLS); reuses an ambient row (`maybeSingle`), tracks
  only self-created ids for `afterAll` cleanup, deletes the inserted entry inline.
  Leak-free.

## Architecture depth verdict
No pass-through, no speculative seam. Zero new ports/adapters — feeds an existing port a
different client. `cashServiceForCaller` is a deep factory: behind `userId` it hides token
minting, client construction, the two-port split, and never-memoize discipline. Deletion
test: removing it smears per-request auth-client assembly across 7 routes — earns its keep.

## Test / lint results
| Check | Result |
|---|---|
| `npx tsc --noEmit` | PASS (exit 0) |
| ESLint (9 changed files) | PASS (exit 0) |
| Unit suite | 1984 / 1984 (incl. 3 new `cashServiceForCaller` + `no-adapter-imports` pin) |
| pgTAP suite | 130 tests all files `ok` incl. `012-rls-cash` (14). The `Result: FAIL` line is the pre-existing `_helpers.sql` "No plan found" artifact — an include file, unrelated |
| Cash integration | 27 / 27 (incl. 4 new F-RLS-04e assertions) |

## Ship-gate reminder (process, not a code finding)
Apply the migration to PROD **FIRST**, then merge the code — doors before badges, per the
plan §10 ordering and Vercel preview-branch resync rules.
