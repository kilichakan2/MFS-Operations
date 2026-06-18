# Code-critic review — F-RLS-04c Routes RLS cutover

**Date:** 2026-06-18
**Branch:** f-rls-04c-routes-rls-cutover (off `main` @ 715b640)
**Reviewer:** code-critic subagent (FORGE Guard phase)
**Verdict:** ✅ **CLEAR WITH NITS** — no blockers, handed to ANVIL.

## What the change is
RLS cutover for the Routes context. (1) New migration `20260618120000_routes_authenticated_rls_policies.sql`
adds a 7-policy set so `routes`/`route_stops` (RLS-enabled, zero policies) are reachable by the
`authenticated` role; (2) 5 route files / 7 handlers flipped from the service-role singleton
(`routesService`) to the per-request authenticated factory (`routesServiceForCaller(userId)`).

## Test + lint results (verified by the critic, not trusted)
- Unit: 1860/1860 pass
- Integration: 234/234 pass; routes suite 38/38 incl. 3 new F-RLS-04c cases
- pgTAP: all 10 files `ok`, incl. `009-rls-routes.test.sql` (11 assertions). Overall "Result: FAIL"
  is the known `_helpers.sql` "no plan found" artifact (include file scanned as a test), not a real failure.
- Typecheck: clean. ESLint: clean on all 6 changed files; `no-adapter-imports` 37/37 green.
- Migration apply: `npm run db:reset` applied `20260618120000` cleanly (7 NOTICE lines = idempotent DROP POLICY IF EXISTS lead-ins).

## Security (Layer 1) — PASS
- Full policy set present (`…20260618120000:68-137`): routes SELECT/INSERT/UPDATE/DELETE; route_stops SELECT/INSERT/DELETE. Headline SELECT must-fix satisfied (pgTAP `isnt_empty` on both + populated-join integration tests).
- Write identity is always the authenticated caller (`x-mfs-user-id`), never a body/query param. `routes/today` `?userId=` (`today/route.ts:81`) flows only into `getNextRouteForUser` (a READ filter); the RLS client stays bound to `sessionUserId` (line 78) — cannot write as another user.
- No memoization of the per-caller client (`lib/wiring/routes.ts:60-68`) — fresh token + client per call. No identity leak.
- Migration non-destructive (CREATE POLICY only; DROP POLICY IF EXISTS lead-ins; ROLLBACK block lines 139-146; 14-digit name; no FORCE ROW LEVEL SECURITY). pgTAP 151-154 proves service-role bypass.
- RLS never stricter nor looser than the service's own gating (valid-user-only predicate, no `role IN (...)`). Admin-only PATCH/DELETE stays route-layer (`admin/runs/[id]/route.ts:25,84`), 403 before any DB hit.

## Correctness (Layer 2) — PASS
- route_stops has no UPDATE policy — verified correct: `RoutesRepository.ts` only INSERTs (:364, :457) or DELETEs (:428) route_stops; `saveRoute` replaces via delete-then-insert. No `.update()` on route_stops.
- Cascade delete safe: `deleteRoute` (:499) deletes routes, relies on ON DELETE CASCADE; explicit route_stops delete covered by `route_stops_delete`.
- RETURNING paths covered: `createRoute` (.select().single() :339) + `setRouteStatus` (.select().maybeSingle() :480) need `routes_select` to read back — policy exists.
- Status-code order preserved: admin 403 (lines 25,84) before the new userId 401 guard (lines 35,94). Integration `403s for a non-admin` confirms.

## Conventions (Layer 3) + Hexagonal (3b) — PASS
- No `@supabase/*` import in any `app/**` file; vendor client built only in `lib/wiring/routes.ts:64`. Rip-out test holds (one adapter + one wiring file).
- Conventional commits, clean separation (migration / pgTAP / route flip / docs).

## 🟡 Warning (should resolve before ship — non-blocking)
**Non-admin join-visibility** (baseline `users_select` @ `20260101000000_baseline.sql:2488`, surfaced by this cutover).
`users_select` = own row OR `is_admin()`; `is_admin()` = role='admin' only. Under the authenticated client a
**non-admin** caller (office/warehouse) reading a route assigned to a *different* user gets `assignee`/`creator`
joins resolved to **null** — those `users` rows aren't visible to them. Today (service-role) they resolve.
The 3 new integration tests all run as `role: "admin"`, so the non-admin path is unproven, not proven-safe.
Pre-existing baseline behaviour, Routes UI largely admin-facing → 🟡 not 🔴.
**Action:** confirm whether a non-admin ever loads a peer's route in the Route Planner / today view. If yes,
the assignee/creator name renders blank → either add a minimal `users` directory SELECT policy, or accept +
record it. Add a non-admin integration case to lock whichever behaviour is chosen.

## 🔵 Tidiness note (follow-up, not blocking)
Dead `routesService` import in all 5 route files (`route.ts:22`, `[id]/route.ts:20`, `today/route.ts:26`,
`admin/runs/route.ts:19`, `admin/runs/[id]/route.ts:13`) — each handler shadows it with the local
`const routesService = await routesServiceForCaller(...)`. Kept deliberately as the documented one-line
rollback parachute (defensible). Optionally drop the import and change the rollback note to "re-import + swap."

## Depth verdicts (new/touched only)
- `lib/wiring/routes.ts › routesServiceForCaller` → DEEP ✅ (small interface `userId → RoutesService`, hides token mint + authenticated client + repo wiring).
- 5 route handlers → out of scope (rebind + one guard, interface unchanged).
- Policy set → one policy per command, over-grant-proof.

## Probe summary
1. All 7 handlers rebind to `routesServiceForCaller` — confirmed, none on the singleton.
2. `userId` from header everywhere; `today` `?userId=` read-only — confirmed safe.
3. Migration predicate correct, idempotent, ROLLBACK, 14-digit, references public.users — confirmed.
4. pgTAP proves valid-user CRUD, fail-closed empty/absent GUC, service-role bypass — confirmed 11/11.
5. 3 integration cases prove populated joins + full write cycle — confirmed (assignee/creator/customer not-null).
6. No accidental dual singleton+caller use — confirmed; dead singleton import is the only leftover (🔵, intentional).

**Final: no blockers. Hand to ANVIL. Resolve the 🟡 before the ship gate.**

---

## Guard re-audit (loop-back) — directory-read fix — 2026-06-18

**Verdict: ✅ CLEAR** (no blockers, no warnings). The earlier 🟡 (non-admin route-name visibility) is **CLOSED**.

Hakan confirmed the 🟡 was a real regression (office/warehouse view peer routes). Looped back to Order;
forge-planner designed Option 1 (DB-only). Implementer built it on the same branch (4 new commits) and
corrected a plan defect. Re-audited by code-critic.

### New commits audited
- `2961bd7` directory-read RLS policy + hash-column lockdown migration
- `3deae8b` non-recursive predicate via SECURITY DEFINER helper (plan-defect fix)
- `eae6f55` pgTAP `010-rls-users-directory`
- `40a850d` non-admin peer-route integration regression lock

### The fix
`supabase/migrations/20260618130000_users_directory_read_for_authenticated.sql`:
- `users_directory_select` RLS policy (SELECT) on `public.users`, valid-user predicate via the new helper — OR's with baseline `users_select`, widening non-admin reads to all rows.
- Same migration: `REVOKE SELECT ON public.users FROM authenticated` + `GRANT SELECT (id, created_at, name, role, active, last_login_at, email, secondary_roles)` — the 8 non-hash columns only. Seals `pin_hash`/`password_hash` at the privilege layer.
- New `public.current_user_is_valid()` — `STABLE SECURITY DEFINER SET search_path = public`, OWNER postgres, EXECUTE revoked from PUBLIC/anon + granted to authenticated. Reads `users` as owner (RLS-bypassed) → breaks the 42P17 recursion an inline `EXISTS(SELECT … FROM users)` SELECT-policy-on-users would cause. Fail-closed on absent/empty GUC.

### Probe results (all CONFIRMED)
1. Hash sealing works — 8 granted cols cross-checked vs baseline (10 cols; only `pin_hash`/`password_hash` omitted); policy + REVOKE/GRANT in one migration; pgTAP 010(b) `throws_ok 42501` genuine deny.
2. SECURITY DEFINER fn safe — pinned search_path (no escalation), boolean-only, fail-closed, EXECUTE minimal.
3. Recursion gone — only 2 users SELECT policies, both via definer helpers, neither reads users inline; routes-policy users-subquery resolves via helper, no re-entry.
4. 04b safe — `007-rls-users` asserts only write policies + admin reads; no read-isolation assertion to break.
5. Migration discipline — non-destructive (privilege change only), 14-digit name after 20260618120000, DROP-IF-EXISTS lead-ins, ROLLBACK restores (drop policy + GRANT ALL + drop fn).
6. Login intact — login + kds-pin use the service-role singleton (`lib/wiring/users.ts`), bypass the REVOKE; pgTAP 010(c) proves service-role reads hashes.

### Depth verdict
`current_user_is_valid()` → DEEP / earns its place (carries the no-recursion + fail-closed mechanism behind a 0-arg boolean; reused idiom, not a pass-through).

### Tests (run by critic this pass)
Unit 1860/1860 · routes integration 39/39 (incl. non-admin peer-name regression lock) · users integration 37/37 (credential reads intact) · migration/adapter guards 41/41 · lint clean · typecheck clean (main session).

### Carry-forward to ANVIL
The critic was environment-blocked from executing raw pgTAP (no local psql / docker exec denied); verified `007/009/010` statically + via the integration suites. **ANVIL MUST run the pgTAP suite itself** for the authoritative DB-layer green (judge per-file `ok`; ignore the known `_helpers.sql` "no plan found" cosmetic artifact).

