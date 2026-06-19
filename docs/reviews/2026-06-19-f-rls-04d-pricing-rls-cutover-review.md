# Code-critic review — F-RLS-04d Pricing-context RLS cutover (PR #58)

**Date:** 2026-06-19
**Branch:** `feat/f-rls-04d-pricing-rls-cutover`
**Reviewer:** code-critic (FORGE Guard subagent)
**Verdict:** ✅ **CLEAR — no blockers. Hand to ANVIL.**

A security-sensitive RLS cutover: flips the pricing API routes from the service-role
(master-key) Supabase client to a per-request **authenticated** (logged-in-user) client so
Postgres RLS enforces access. Byte-identical mirror of the shipped F-RLS-04c (Routes cutover).

## Findings
- **No 🔴 blockers. No 🟡 should-fix. No 🔵 notes.**
- 🟢 Test quality: the suite genuinely proves the cutover (fail-closed empty GUC, service-role
  bypass, sales-own RBAC retained, rep_name non-blank, lines-UPDATE divergence) — no shallow
  or tautological tests.

## Audit focus results

### 1. Identity-leak / memoization (CRITICAL) — CLEAR
`lib/wiring/pricing.ts:83-91` — `pricingServiceForCaller(callerUserId)` mints a fresh token
(`dbTokenMinter.mint({ userId: callerUserId })`) and builds a fresh
`authenticatedClientForCaller({ token })` on **every** call. No module-level client cache, no
shared mutable state. Byte-for-byte structural mirror of `routesServiceForCaller`
(`lib/wiring/routes.ts:60-68`).
- `lib/adapters/supabase/authenticatedClient.ts:37-48` — fresh client per call, `persistSession: false` → no cross-request session bleed.
- `lib/wiring/dbToken.ts:18` — `dbTokenMinter` is a singleton but **stateless** (holds the
  signing secret only; binds userId per `.mint()` call). Singleton minter is correct, not a leak.
- No-memoization invariant pinned by `tests/unit/wiring/pricingServiceForCaller.test.ts:88-104`.

### 2. userId sourcing per handler — CLEAR
All 11 re-pointed handlers source `userId` from the `x-mfs-user-id` request header, validate it
(plus role) before any DB call, and pass it into the factory per request:
- `app/api/pricing/route.ts:53,61` (GET) · `:77,85` (POST)
- `app/api/pricing/[id]/route.ts:41,49` (GET) · `:70,78` (PATCH) · `:171,179` (DELETE)
- `app/api/pricing/[id]/lines/route.ts:26,34` (POST)
- `app/api/pricing/lines/[lineId]/route.ts:49,58` (PATCH) · `:106,115` (DELETE) — service built
  once, threaded into both `checkAccess` and the mutation (one token per request, R-BIZ-3). Good.
- `app/api/pricing/[id]/lines/replace/route.ts` — the only handler kept on service-role
  (intentional, see #4). No handler flipped that shouldn't have; none missed that should have.

### 3. RLS policy correctness — CLEAR
Verified against the live local DB (`pg_policy`):
- 8 policies, full CRUD on both tables. SELECT/DELETE use `USING current_user_is_valid()`;
  INSERT uses `WITH CHECK`; **UPDATE has BOTH `USING` and `WITH CHECK`** on both tables.
- `price_agreement_lines_update` **present** (R-BIZ-1 satisfied — `updateLine` PATCHes in place,
  unlike route_stops delete+insert).
- Predicate is the SECURITY DEFINER helper: `prosecdef=t`, `proconfig={search_path=public}`,
  owned by postgres, queries `public.users` directly — not inline EXISTS, so no 42P17 recursion.
- RLS enabled on both tables (`relrowsecurity=t`, `forced=f` → service-role still bypasses, as
  intended for email/replace).
- Migration additive (`CREATE POLICY` only, idempotent `DROP IF EXISTS` guards), no GRANT needed
  (`authenticated` already has SELECT/INSERT/UPDATE/DELETE on both — verified).

### 4. The replace-route exception — CLEAR
`app/api/pricing/[id]/lines/replace/route.ts:31,54,102` stays on `pricingService` (service-role)
by design. `20260613020000_harden_security_definer_fns.sql:107` revokes EXECUTE on
`replace_agreement_lines` from `authenticated` (keeps `service-role`), so running it under the
badge would 500. App-layer owner check still runs (`replace/route.ts:79-89`) — no auth bypass.

### 5. Hexagonal (CLAUDE.md non-negotiable) — CLEAR
- No new port/adapter/dependency; no `package.json` change.
- Vendor SDK (`createClient`) stays inside `lib/adapters/supabase/`; `SupabaseClient` never
  crosses into `app/**`. Wiring adapter imports allowed (sanctioned composition root). Lint pin
  `tests/unit/lint/no-adapter-imports.test.ts` passes.
- Rip-out test intact: swap vendor = one new adapter folder + edits to `lib/wiring/pricing.ts`.

### 6. Migration safety — CLEAR
Non-destructive (policies only, no DROP TABLE/TRUNCATE/ALTER TYPE → no PITR gate). Filename
`20260619120000_...` is the required 14-digit format. Rollback
`docs/anvil/2026-06-19-f-rls-04d-pricing-rls-cutover-rollback.sql` drops exactly the 8 new
policies, correctly does NOT drop the shared `current_user_is_valid()` helper (04c depends on
it), and documents LAYER-1-first ordering (revert app code before dropping policies).

### 7. Test quality — strong
- pgTAP `supabase/tests/011-rls-pricing.test.sql` (plan 12): valid-user full CRUD both tables,
  lines-UPDATE divergence asserted, empty-GUC fail-closed on SELECT (clean zero rows, no 22P02)
  and INSERT (42501 deny), service-role bypass. Behaviour-based.
- Integration `tests/integration/pricing.test.ts:447-549`: full create→list→view→add-line→edit
  flow under authenticated; sales-own RBAC still 403s a peer (proves RBAC stayed in app, not
  RLS); rep_name non-blank via directory policy.
- Unit `tests/unit/wiring/pricingServiceForCaller.test.ts`: per-caller token isolation +
  no-memoization + parachute-survives. Mocks only real seams.

## Depth verdict
`lib/wiring/pricing.ts → pricingServiceForCaller` → **DEEP** (not a pass-through). Composes
token mint + fresh authenticated client + port-bound service behind a one-arg interface.
Deletion test: removing it forces all 11 handlers to repeat the assembly → complexity
concentrates here. Real, used seam (authenticated vs service-role substitutable), not speculative.

## Suite / lint / typecheck
- Unit (full): **1928/1928 pass** (110 files)
- Wiring + lint pin (scoped): **52/52 pass**
- Migration filename convention: **4/4 pass**
- Typecheck (`tsc --noEmit`): clean (exit 0)
- DB policy/predicate/grant/RLS state: verified directly against local Supabase
- pgTAP `011-rls-pricing`: **NOT executed in this shell** (pgtap not in search_path on this local
  instance; `CREATE EXTENSION`/rolled-back-INSERT smokes correctly sandbox-blocked). Substituted
  read-only DB introspection of the actual policy predicates (matches the test's assertions). The
  pgTAP file is well-formed. **ANVIL must execute it in the pgTAP-enabled harness.**

## Handoff to ANVIL
No blockers. ANVIL must (1) execute `supabase/tests/011-rls-pricing.test.sql` in the
pgTAP-enabled harness (the one suite Guard could not run), and (2) apply the migration to prod
**before** merge per the F-RLS-04a/b/c ordering.
