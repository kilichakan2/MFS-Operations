# F-RLS-04b — Users-context RLS cutover — Guard (code-critic) Review

**Date:** 2026-06-17
**Branch:** feat/f-rls-04b-users-rls-cutover
**Commits reviewed:** `37536c1` (wiring factory + unit test), `564db0e` (4 routes + migration + pgTAP + integration block + plan + BACKLOG)
**Reviewer:** code-critic subagent (FORGE Guard — sole review authority)

## Verdict: NO BLOCKERS — advanced to ANVIL (after closing W1–W3 in a Render loop-back)

The cutover is sound. The 3 new write policies correctly restrict writes to admins (verified live, including a self-promotion attack), the per-request client cannot leak identity (never memoized), the 5 public routes are untouched, and all behavior contracts (409 / 500 / snake_case) are preserved.

## Test / lint / pgTAP results (at review time)

- Unit: 1725/1725 (92 files), incl. `usersServiceForCaller` 3/3 and `no-adapter-imports` 18/18.
- Typecheck: `tsc --noEmit` clean.
- pgTAP: `007-rls-users.test.sql` ok, 8/8; total 74 across 8 files. (`_helpers.sql` "No plan found" / overall `Result: FAIL` is a PRE-EXISTING harness artifact — the shared include has no plan(); same line appears for shipped orders tests.)
- Adversarial live RLS probe (as Postgres `authenticated` role, migration applied):
  - Non-admin INSERT → denied (RLS violation) ✓
  - Non-admin UPDATE of another row → `UPDATE 0` ✓
  - Non-admin self-promotion to admin → `UPDATE 0` (privilege-escalation blocked) ✓
  - Non-admin DELETE → `DELETE 0` ✓
  - Admin INSERT → `INSERT 0 1`; Admin UPDATE → `UPDATE 1` ✓
  - Empty-GUC INSERT → 22P02 throw (fail-closed, no row written) ✓
  - Read scoping: non-admin sees 1 row (own); admin sees all 19 ✓

## Depth verdict

- `lib/wiring/users.ts → usersServiceForCaller` — **DEEP ✅** (not a pass-through). One-arg interface (`callerUserId`) hides a 4-step assembly: mint per-caller token → build fresh authenticated client → bind adapter → build service. Deletion test concentrates: inlining forces all 4 routes to repeat the chain + re-learn "never memoize". Faithful mirror of shipped `ordersServiceForCaller` (`lib/wiring/orders.ts:88`).
- Routes — re-pointing + auth-guard swap in existing handlers; not a new module. Out of depth scope.

## 🟡 Warnings (should-fix, non-blocking) — ALL addressed in the Render loop-back

**W1 — Migration header rationale is INACCURATE.** `supabase/migrations/20260617124846_users_authenticated_write_policies.sql:16-24`. Header claims the inline `nullif(...)::uuid` form avoids `is_admin()`'s 22P02-on-empty-GUC. But an empty-GUC INSERT still throws 22P02 — because the inline predicate's `EXISTS (SELECT 1 FROM public.users …)` subquery scans `users`, invoking the PRE-EXISTING `users_select` policy (`baseline.sql:2488`) whose `::uuid` cast is unguarded. So the chosen form does not deliver a "clean 42501 deny"; it lands on the same 22P02. Also: `is_admin()` is `SECURITY DEFINER` (`baseline.sql:178`), so its internal `users` read would NOT trip `users_select` — but it has its own unguarded cast, so it ALSO throws 22P02 on empty GUC. Net: both forms reject empty-GUC writes (fail-closed); neither is "cleaner" for that case. The inline form is still correct **for consistency with the shipped Orders policies**. Fix = correct the comment, not the SQL. → **FIXED** (comment rewritten to state the real behavior; clean-deny hardening owned by `F-RLS-04b-is-admin-guard`).

**W2 — pgTAP empty-GUC tests assert "throws (any error)" not the invariant.** `supabase/tests/007-rls-users.test.sql` empty-GUC INSERT/UPDATE cases use `throws_ok(..., NULL, NULL, ...)` — pass on any exception, so a future change to the failure mode stays green. → **FIXED** (added row-count-unchanged assertions so the tests pin "no row written/modified", the invariant that matters).

**W3 — Non-admin GET test asserts middleware 307, not the route's own 403 guard.** `tests/integration/admin-users.test.ts:181-211`. The new route-level `requireRole(['admin'])` on GET is never exercised — middleware 307s the non-admin before the handler runs. If the guard were later deleted, no test fails. → **FIXED** (added a focused test invoking the GET handler with non-admin headers, bypassing middleware, pinning the 403).

## 🔵 Architecture notes (follow-up, not blocking)

- **N1** — Pre-existing unguarded `::uuid` in `users_select` (`baseline.sql:2488`) is the root cause behind W1/W2. Already logged as `F-RLS-04b-is-admin-guard` in BACKLOG. This diff correctly does NOT touch it (Strangler-Fig: new code held to standard, legacy migrated opportunistically).
- **N2** — Migration uses `DROP POLICY IF EXISTS` before each `CREATE` (idempotent/re-runnable; consistent with shipped orders migration). Re-run replaces rather than errors — noted only.

## 🟢 Good

- `tests/unit/wiring/usersServiceForCaller.test.ts:88-104` — "NEVER memoizes" test pins the identity-leak contract via observable behavior (two calls → two distinct mints/clients).
- `tests/integration/admin-users.test.ts:223-302` — F-RLS-04b block exercises all 4 routes under the authenticated client, preserving 409 / 500 / snake_case contracts via the public HTTP interface.
- `supabase/tests/007-rls-users.test.sql` — correctly `SET LOCAL ROLE authenticated` + sets GUC to exercise RLS as the real role; admin/non-admin/empty-GUC matrix across INSERT/UPDATE/DELETE; correct `GRANT … TO authenticated` fidelity fix for local.

## Confirmations

1. Security — sound. One policy per command (no permissive-OR over-grant); `users` is ENABLE (not FORCE) RLS so service-role correctly bypasses for the 5 public routes; per-request client built fresh, `persistSession:false`, never memoized. No non-admin write path found (verified live, incl. self-promotion).
2. Correctness — faithful mirror of `ordersServiceForCaller`. `caller.userId!` is safe: `requireRole` throws `UnauthorizedError` on null/empty userId before returning. 409/500/snake_case preserved.
3. Conventions/hexagonal — vendor SDK stays in adapter; routes import only `lib/wiring/` + `lib/auth/`; `no-adapter-imports` passes; 14-digit migration filename.
4. Test quality — strong; W2/W3 gaps closed in the loop-back.
