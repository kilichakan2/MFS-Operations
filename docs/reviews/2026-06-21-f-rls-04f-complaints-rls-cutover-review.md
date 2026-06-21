# Code review — F-RLS-04f Complaints/Compliments RLS cutover

**Date:** 2026-06-21
**Branch / PR:** `f-rls-04f-complaints-rls-cutover` / #64 (base `main`)
**Reviewer:** code-critic subagent (FORGE Guard, sole review authority)
**Verdict:** **SHIP — no blockers, hand to ANVIL.**

6th cutover of the established RLS pattern (faithful mirror of F-RLS-04e cash). Moves the
complaints + compliments domain from the service-role master-key client onto a per-request
authenticated client so Postgres RLS fires. Product decision: **shared-board model** (any valid
logged-in staff member sees/acts on every complaint). Adversarial focus was the two places a
silent security regression hides — the policy SQL and the never-memoize property — both clean.

## Test & lint results observed
- Unit (wiring): 9/9 (incl. fresh-mint-per-call) — pass
- Unit (lint pins + filename): 53/53 (`no-adapter-imports` + `filename-convention`) — pass
- `tsc --noEmit`: clean
- pgTAP `013-rls-complaints.test.sql`: **ok, 14 assertions** (suite-level `Result: FAIL` is the
  pre-existing `_helpers.sql` harness artifact — all 14 real test files print `ok`)
- Integration `complaints.test.ts`: 22/22 (3 new F-RLS-04f cases) on a freshly-reset local DB
- `npm run db:reset`: migration applied cleanly, idempotent DROPs skipped as designed

## Findings

### 🔴 Blockers — none
### 🟡 Warnings — none

### 🟢 Good (load-bearing, verified)
1. **Migration `20260621130000_…sql:78-83`** — DROPs the 3 stale baseline owner-only policies
   (`complaints_insert`/`_select`/`_update`, baseline `:2431/2434/2437`, `user_id = app.current_user_id OR is_admin()`)
   and recreates a full permissive CRUD set keyed on `public.current_user_is_valid()`. Grepped every
   migration — no surviving owner-restrictive policy on complaints/complaint_notes/compliments.
2. **UPDATE policies have BOTH `USING` and `WITH CHECK`** (complaints `:96-98`, notes `:108-110`,
   compliments `:120-122`) — F-RLS-04a lesson applied; one policy per command, no second permissive
   policy to OR-combine and over-grant.
3. **Shared-board guarantee proven, not asserted** — pgTAP `013:79` reads user-A's complaint under
   user-B's GUC (`isnt_empty`); integration `complaints.test.ts:520` does the same over real HTTP.
   The cross-user read is what distinguishes correct from a silent private-list regression.
4. **Fail-closed both ways** — empty GUC → SELECT 0 rows (`013:166`, no `22P02` cast throw), INSERT
   `42501` deny (`013:178`); master-key bypass confirmed (`013:188`).
5. **Never-memoize pinned** (`complaintsServiceForCaller.test.ts:80`, `complimentsServiceForCaller.test.ts:80`)
   — two calls → two distinct mints → two client builds; single-port shape asserted via
   `Object.keys(deps)`. Factories `await mint` + build fresh per call (`complaints.ts:60-68`,
   `compliments.ts:59-67`), no module-level cache.
6. **Route flips correct, 8 files / 9 handlers** — per-caller const shadows the singleton AFTER the
   401 gate in every handler (`compliments:22+41`, `compliments/users:19`, `detail/complaint:13`,
   `screen2/{all:22,note:36,open:18,resolve:28,sync:43}`). No handler lost its auth gate. Raw
   `audit_log` writes untouched (`sync:95`, `resolve:89`, `note:93` still use service-role key);
   `lib/compliment-email.ts` not in diff. F-TD-31/F-TD-32 stay deferred.
7. **Hexagonal contract intact** — no `@supabase/*`/`createClient` outside adapters, no `lib/adapters`
   import in any route, `package.json` untouched. Rip-out stays one-adapter-one-wiring.
8. **Rollback file complete** (`rollback/2026-06-21-f-rls-04f-…-rollback.sql`) — drops all 12 new
   policies; documents that the 3 dormant baseline policies are not restored (the code lever is the
   real rollback).

### Depth verdicts (new/touched only)
- `lib/wiring/complaints.ts` → **DEEP** — mints token, builds per-caller client, binds single port. Real isolation behaviour, not a shim.
- `lib/wiring/compliments.ts` → **DEEP** — same, single-port.
- 8 route edits → in-handler local-const change, out of depth scope per the scaling guard.

## Conductor note
code-critic ran the suite on the branch and ran `npm run db:reset` (local dev DB only — nothing
touched prod). The migration header defers prod application to the ship gate (**apply to PROD first,
then merge**) — ANVIL/Ship must confirm that ordering holds.
