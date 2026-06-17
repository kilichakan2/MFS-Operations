# F-RLS-04b — Users-context RLS cutover (plan)

**Date:** 2026-06-17
**Branch:** `feat/f-rls-04b-users-rls-cutover` (mirrors `feat/f-rls-04a-orders-rls-cutover`)
**Spec locked at:** Gate 1 (Frame)
**Template:** F-RLS-04a (Orders cutover) — the already-shipped mirror (PR #42, `91c1091`)
**ADR conflicts:** none. Reuses ADR-0002 (hexagonal), ADR-0004 (RLS posture), ADR-0007 (app-minted token + GUC bridge). No new ADR, no new dependency.

🗣 In plain English: this is the Users version of the door-lock upgrade we already did for Orders. The 4 admin-only user-management screens stop using the building master key and start using a per-person keycard that the database checks. The 5 public/login routes keep the master key because there is no logged-in person to issue a keycard to yet.

---

## 1 · Overview

Today every Users-domain route reaches the database through the **service-role** Supabase client — the master key that bypasses RLS entirely. F-RLS-04b flips the **4 admin Users routes** onto the **per-request authenticated client** (the keycard, F-RLS-03), so the database's own Row-Level-Security policies are evaluated on every admin user-management write. The 5 public/pre-auth routes stay on service-role because they run before any session exists (login, kds-pin) or are deliberately kiosk/public.

🗣 In plain English: RLS = the database checking "are you allowed to touch this row?" on its own, instead of trusting the app code to have checked. Master key = checks skipped. Keycard = checks run. We move only the routes where a real logged-in admin is the caller.

This is non-destructive and additive:
- **Code:** one new wiring factory (`usersServiceForCaller`) + re-point 4 route handlers. The service-role singleton STAYS as the rollback parachute and for the 5 public routes.
- **DB:** one additive migration adding 3 `CREATE POLICY` statements (INSERT/UPDATE/DELETE on `public.users`), all gated on `is_admin()`. Nothing dropped, no data touched.

### Verified prior-art (confirmed against the repo)

| Fact | Location | Confirmed |
|---|---|---|
| Seam spec (commented block) | `lib/wiring/users.ts` lines 32-55 | ✓ exact shape `usersServiceForCaller(callerUserId)` |
| Mirror pattern | `lib/wiring/orders.ts` lines 86-98 (`ordersServiceForCaller`) | ✓ |
| Authenticated client factory | `lib/adapters/supabase/authenticatedClient.ts` lines 37-48 | ✓ |
| Token minter | `lib/wiring/dbToken.ts` (`dbTokenMinter.mint({ userId })`) | ✓ |
| GUC bridge | `supabase/migrations/20260614210221_db_pre_request_guc_bridge.sql` | ✓ live, reused, no change |
| Adapter takes injected client | `lib/adapters/supabase/UsersRepository.ts` factory line 102; service singleton line 306 | ✓ |
| 23505→ConflictError map (F-TD-22) | `UsersRepository.ts` lines 224-233 | ✓ inside adapter, vendor-side of boundary |
| Adapter barrel exports both factory + `authenticatedClientForCaller` | `lib/adapters/supabase/index.ts` lines 35, 39 | ✓ |
| Existing users RLS | `supabase/migrations/20260101000000_baseline.sql` line 2488 (`users_select`) | ✓ own row OR `is_admin()` |
| `is_admin()` helper | baseline lines 177-187 | ✓ `SELECT role='admin' FROM users WHERE id = current_setting('app.current_user_id', true)::uuid` |
| RLS migration to mirror | `supabase/migrations/20260615173901_orders_authenticated_delete_and_print_policies.sql` | ✓ additive `CREATE POLICY` only |
| Middleware sets `x-mfs-user-id` for `/api/admin/*` | `middleware.ts` line 151; `/api/admin` is in admin ROLE_PERMISSIONS line 37 | ✓ |
| `requireRole` returns `caller.userId` | `lib/auth/session.ts` lines 70-117 | ✓ |

---

## 2 · Domain terms (plain English)

- **Port** — `UsersRepository` (`lib/ports/UsersRepository.ts`): the socket the Users service insists on. 🗣 The shape the database adapter must fit; unchanged here.
- **Adapter** — `createSupabaseUsersRepository(client)` (`lib/adapters/supabase/UsersRepository.ts`): the plug. 🗣 Already accepts an injected client — we just feed it the keycard client instead of the master-key one. No adapter edit.
- **Service-role client** — the master key. 🗣 Bypasses every database permission check. Stays for the 5 public routes + rollback.
- **Authenticated client** — the keycard (`authenticatedClientForCaller`). 🗣 Carries the caller's identity so the database runs its own checks.
- **GUC `app.current_user_id`** — a per-transaction session variable the bridge fills from the keycard's token. 🗣 The database's note saying "this request is being made by user X"; every RLS policy reads it.
- **`is_admin()`** — DB function returning true if `app.current_user_id` belongs to a row with `role='admin'`. 🗣 The database asking "is the keycard holder an admin?" on its own.

---

## 3 · Compliance / architecture flags

- **Hexagonal (ADR-0002):** the vendor `SupabaseClient` is built and consumed entirely inside `lib/wiring/users.ts`. The route receives a ready `UsersService` built from ports; it never sees a Supabase type. ✓ No new boundary breach.
- **No new dependency.** Zero `package.json` change. The dependency-justification rule is N/A.
- **Migration filename convention (CLAUDE.md "Local test infrastructure"):** MUST use the full 14-digit `YYYYMMDDHHMMSS_name.sql` form. The short `YYYYMMDD_NNN` form is BANNED (collides + breaks preview-branch resync). Enforced by `tests/unit/migrations/filename-convention.test.ts`.
- **RLS posture (ADR-0004):** service-role still BYPASSES RLS (tables are `ENABLE`, not `FORCE`). The 5 public routes keep working unchanged. ✓

🗣 In plain English: nothing here breaks the Lego rules. Vendor code stays inside the one allowed wiring box; no new vendor library is added; the migration is named the way the project demands so it does not collide.

---

## 4 · Exact files to change

| # | File | Change |
|---|---|---|
| 1 | `lib/wiring/users.ts` | Replace the commented seam (lines 32-55) with the real `usersServiceForCaller(callerUserId)` async factory. Add imports for `createSupabaseUsersRepository`, `authenticatedClientForCaller`, `dbTokenMinter`. Keep the `usersService` service-role singleton. |
| 2 | `app/api/admin/users/route.ts` | Re-point GET + POST onto `usersServiceForCaller(callerUserId)`. Capture `callerUserId` (see §5). |
| 3 | `app/api/admin/users/[id]/route.ts` | Re-point PATCH + DELETE onto `usersServiceForCaller(callerUserId)`. Capture `callerUserId`. |
| 4 | `supabase/migrations/<14-digit>_users_authenticated_write_policies.sql` | NEW additive migration: 3 `CREATE POLICY` (INSERT/UPDATE/DELETE) on `public.users`, gated on `is_admin()`. |
| 5 | `tests/integration/admin-users.test.ts` | Extend to assert the 4 admin routes work under the authenticated client (real session cookie → `x-mfs-user-id` flows through middleware → keycard). |
| 6 | `supabase/tests/007-rls-users.test.sql` (NEW) | pgTAP: the 3 new policies allow-admin / deny-non-admin. |
| 7 | `tests/unit/wiring/usersServiceForCaller.test.ts` (NEW, or alongside existing wiring tests) | Unit: factory mints a token, builds a fresh client per call, never memoizes, returns a `UsersService`. |

**Files NOT touched (assert this in review):** `lib/adapters/supabase/UsersRepository.ts` (adapter already injectable), `lib/services/UsersService.ts`, `lib/ports/UsersRepository.ts`, `lib/domain/**`, and the 5 public-route files (`/api/auth/login`, `/api/auth/kds-pin`, `/api/auth/team`, `/api/auth/haccp-team`, `/api/auth/type`).

🗣 In plain English: 3 code files + 1 migration + 3 test files. The core logic, the adapter, and every login/public route are deliberately left alone.

---

## 5 · Route-by-route change (before → after, and how each gets `callerUserId`)

**Critical finding (Risk A resolved):** the 4 admin routes today read the raw `x-mfs-user-role` header manually and do NOT capture `userId` — and GET currently has **no role guard at all**. The authenticated client needs the caller's `userId` to mint the token. Middleware **already sets `x-mfs-user-id`** for `/api/admin/*` (middleware.ts line 151; `/api/admin` is in the admin permission list line 37). The clean way to get it — matching the Orders mirror — is to read it from the request.

🗣 In plain English: to issue a keycard we need to know WHO is asking. The login system already stamps every admin request with the caller's user-id; the routes just have not been reading it yet. We start reading it.

Two acceptable patterns — **pick ONE and apply it to all four routes for consistency:**

- **Pattern P1 (preferred, mirrors Orders):** adopt `requireRole(req, ['admin'])` from `lib/auth/session.ts`. It throws `UnauthorizedError` (401) if `x-mfs-user-id` is missing and `ForbiddenError` (403) if the role is not admin, and returns `caller.userId`. This REPLACES the manual `x-mfs-user-role !== 'admin' → 403` check. Then `await usersServiceForCaller(caller.userId!)`.
  - ⚠️ Behaviour nuance: `requireRole` returns **401** for missing identity where the current manual check would (for POST/PATCH/DELETE) return **403** only on wrong role and never explicitly handle missing identity. In practice middleware guarantees identity is present for `/api/admin/*` (no cookie → redirect), so the 401 branch is unreachable in production. Document this; the integration suite must confirm a valid admin still gets 200/201.
- **Pattern P2 (minimal):** keep the existing manual `x-mfs-user-role` guard, and additionally read `const callerUserId = req.headers.get('x-mfs-user-id')?.trim()`. If absent → 401/403. Then `await usersServiceForCaller(callerUserId)`. Smaller diff, but duplicates auth logic `requireRole` already centralises.

**Recommendation:** P1. It is exactly what the Orders routes do (`requireRole(...)` → `caller.userId!` → `...ForCaller`), removes hand-rolled header parsing, and keeps the codebase consistent. The 401-vs-403 nuance is unreachable in prod and must be pinned by a test.

> **GATE-1 CLARIFICATION NEEDED (low severity):** GET `/api/admin/users` currently has **no** role guard (any authenticated user who reaches the route gets the full user list — though middleware restricts `/api/admin` to admins at the path level). Under P1, GET gains an explicit `requireRole(req, ['admin'])`. This is a (defensible, security-positive) behaviour change: a non-admin who somehow reached GET would now get 403 instead of 200. Recommend ADOPTING the guard (defence-in-depth) but FLAG it to the conductor — if "zero behaviour change" is required, GET must still capture `userId` for the keycard but without adding the 403 gate (P2-for-GET). **This is a judgement call for the conductor, not the implementer.**

| Route | Before (wiring + guard) | After |
|---|---|---|
| `GET /api/admin/users` | `usersService.listAllUsers()`; NO role guard | `requireRole(req,['admin'])` → `(await usersServiceForCaller(caller.userId!)).listAllUsers()` (see GET flag above) |
| `POST /api/admin/users` | manual `x-mfs-user-role!=='admin'→403`; `usersService.createUser(...)` | `requireRole(req,['admin'])` → `(await usersServiceForCaller(caller.userId!)).createUser(...)`; keep ConflictError→409, keep field validation |
| `PATCH /api/admin/users/[id]` | manual 403; `usersService.updateUser(id,patch)` | `requireRole(req,['admin'])` → `...usersServiceForCaller(caller.userId!).updateUser(...)`; keep R-MF-1 null→500 |
| `DELETE /api/admin/users/[id]` | manual 403; `usersService.deleteUser(id)` | `requireRole(req,['admin'])` → `...usersServiceForCaller(caller.userId!).deleteUser(id)` |

**Preserved verbatim:** the `toAppUser` snake_case projection (R-MF-2), the ConflictError→409 mapping, the R-MF-1 null→500 mapping (F-TD-20 still deferred), all field/PIN validation, the `secondary_roles` 'admin' filter.

---

## 6 · The wiring change (`usersServiceForCaller`)

Replace the commented block in `lib/wiring/users.ts` with the real factory, mirroring `ordersServiceForCaller` (orders.ts lines 88-98):

```
export async function usersServiceForCaller(
  callerUserId: string,
): Promise<UsersService> {
  const token  = await dbTokenMinter.mint({ userId: callerUserId });
  const client = authenticatedClientForCaller({ token });
  return createUsersService({
    users:          createSupabaseUsersRepository(client),
    passwordHasher,
  });
}
```

New imports needed in `users.ts`: `createSupabaseUsersRepository`, `authenticatedClientForCaller` (from `@/lib/adapters/supabase`), `dbTokenMinter` (from `@/lib/wiring/dbToken`).

**Rules (from the seam comment + Orders mirror):**
- **NEVER memoize.** The minted token is per-caller; a cached client would leak one admin's identity to another (Risk R4 in Orders).
- The service-role `usersService` singleton (lines 27-30) **STAYS** — rollback parachute + the 5 public routes still import it.
- `passwordHasher` is the same port instance both paths use (`lib/wiring/password`).

🗣 In plain English: this is a parts-list edit — connect the keycard client to the same Users service factory. Build a brand-new one each request so two admins never share an identity. The old master-key version stays bolted in next to it.

---

## 7 · The migration (full SQL, 14-digit filename)

**Filename:** `supabase/migrations/<14-digit-timestamp>_users_authenticated_write_policies.sql` — use a real 14-digit timestamp later than `20260616120000` (the F-TD-22 index), e.g. `20260617HHMMSS_...`. NEVER the short form.

**State today (confirmed):** RLS is ENABLED on `public.users`. The ONLY policy is `users_select` (own row OR `is_admin()`). There is NO INSERT/UPDATE/DELETE policy → under the authenticated client those three operations are **deny-all** today. The 3 new policies open them for admins only.

**`is_admin()` predicate choice (Risk: consistency):** the project has TWO equivalent forms in use:
1. `is_admin()` function call (used by `users_select`, `customers_*`, `products_*`).
2. inline `EXISTS (SELECT 1 FROM users u WHERE u.id = nullif(current_setting('app.current_user_id', true),'')::uuid AND u.role='admin')` (used by the F-RLS-04a orders policies).

**Use `is_admin()` directly** — it is exactly what the sibling `users_select` policy uses, keeps the new users policies stylistically identical to the existing users policy, and is the smallest, most readable surface.

⚠️ **`is_admin()` empty-GUC note (verify in pgTAP):** `is_admin()` casts `current_setting('app.current_user_id', true)::uuid` WITHOUT a `nullif(...,'')` guard. If the GUC is the empty string, `''::uuid` would error. In production the GUC is always either a valid uuid (keycard present) or the policy simply returns false for service-role (which bypasses RLS anyway). This exact function already governs live `users_select`, `customers`, and `products` writes under the authenticated client, so it is proven safe in practice. The pgTAP test MUST include a "GUC empty → denied, not errored" case to pin this.

```sql
-- <14-digit>_users_authenticated_write_policies.sql
--
-- F-RLS-04b — Users-context RLS cutover.
-- ADDITIVE: adds the 3 missing write policies (INSERT/UPDATE/DELETE) on
-- public.users so the per-request AUTHENTICATED client (F-RLS-03) can run the
-- admin user-management writes the 4 flipped admin routes issue. All 3 gate on
-- is_admin() — identical to the existing users_select policy's admin branch.
-- The existing users_select policy (own row OR is_admin) covers reads and is
-- UNCHANGED. Service-role still BYPASSES RLS (no FORCE) — the 5 public routes
-- are unaffected. Grants permission only; deletes no data, drops nothing.
--
-- Local: npm run db:reset. Prod application is deferred to the ship gate
-- (apply to prod FIRST, then merge — F-RLS-04a / F-TD-22 ordering).

-- Local Supabase may not auto-grant table privileges to the authenticated role
-- the way prod does; pgTAP replicates the prod GRANT in its own transaction.

DROP POLICY IF EXISTS users_insert ON public.users;
DROP POLICY IF EXISTS users_update ON public.users;
DROP POLICY IF EXISTS users_delete ON public.users;

CREATE POLICY users_insert ON public.users
  FOR INSERT
  WITH CHECK ( public.is_admin() );

CREATE POLICY users_update ON public.users
  FOR UPDATE
  USING      ( public.is_admin() )
  WITH CHECK ( public.is_admin() );

CREATE POLICY users_delete ON public.users
  FOR DELETE
  USING      ( public.is_admin() );

-- ROLLBACK
-- DROP POLICY IF EXISTS users_insert ON public.users;
-- DROP POLICY IF EXISTS users_update ON public.users;
-- DROP POLICY IF EXISTS users_delete ON public.users;
```

**Apply via Supabase MCP `apply_migration` ONLY** (never `supabase db push`), matching the F-RLS-04a / F-TD-22 ship discipline: apply to prod FIRST, verify, then merge.

🗣 In plain English: three new database rules — "an admin may add / change / remove user rows; nobody else can." Reads are already covered. The login routes use the master key so they ignore these rules entirely. Easy to undo: three DROP lines.

---

## 8 · Policy-vs-route superset cross-check (the F-RLS-04a lesson)

The DB policy must be a **superset of (or equal to)** the route's own role gate, or a valid admin write breaks at the database. Route gate = admin-only (after §5). Policy = `is_admin()`. They match exactly per operation:

| Operation | Route gate (after §5) | DB policy predicate | Superset check | Read-back covered? |
|---|---|---|---|---|
| INSERT (POST create) | admin only | `users_insert` WITH CHECK `is_admin()` | ✓ equal | `users_select`: admin reads ANY row → created row read-back ✓ |
| UPDATE (PATCH) | admin only | `users_update` USING + WITH CHECK `is_admin()` | ✓ equal | admin reads ANY row → updated row read-back ✓ |
| DELETE | admin only | `users_delete` USING `is_admin()` | ✓ equal | DELETE issues no read-back ✓ |
| SELECT (GET list) | admin only | `users_select` (own row OR `is_admin()`) | ✓ admin sees all | n/a |

🗣 In plain English: the database's "who may do this" must be at least as generous as the route's "who may do this", or a legitimately-authorised admin gets blocked by the database. Here both sides say exactly "admins", so every real admin action passes and nobody else gets through.

---

## 9 · createUser / updateUser read-back under RLS (Risk C)

The adapter's `createUser` (UsersRepository.ts lines 211-240) does `.insert(...).select(SUMMARY_COLS).single()` — INSERT **then read the row back** in one PostgREST call. Under the authenticated client:
- INSERT permitted by `users_insert` (admin). ✓
- The `.select(...)` read-back permitted by `users_select` (admin reads any row). ✓
- **23505 → ConflictError still fires:** the unique-violation is raised by the `lower(name)` index (F-TD-22) regardless of which client issued the INSERT; the adapter's `error.code === '23505'` branch is unchanged. ✓ (Pin in integration: duplicate name under authenticated client still → 409.)

`updateUser` (lines 242-277) does `.update(...).select(...).maybeSingle()`:
- UPDATE permitted by `users_update`. ✓
- read-back permitted by `users_select`. ✓
- **R-MF-1 preserved:** zero-row match → `data === null` → route maps to 500 (NOT 404). Under RLS, a row that an admin is denied from updating would ALSO surface as 0 rows → same null → same 500. Since admin can update any row, this only bites non-admins, who are already 403'd at the route. ✓

🗣 In plain English: creating and editing a user each do "write, then read it back" in one shot. Because an admin is allowed to both write and read any user row, both halves succeed. The duplicate-name 409 and the "missing id → 500" quirk both still behave exactly as today.

---

## 10 · DELETE idempotency + self-delete edge (Risk D)

`deleteUser` (lines 279-288) is `.delete().eq('id', id)` with no row-count assertion → deleting a non-existent id is a no-op that returns void (idempotent). Under RLS:
- DELETE permitted by `users_delete` (admin). ✓
- **Self-delete:** an admin deleting their own row is allowed by `is_admin()` (evaluated at policy time, before the row is gone). After deletion the admin's session cookie still works until expiry but `is_admin()` would then return false (their row is gone) — same outcome as today's service-role path (the app already permits self-delete; this is not a new behaviour). The DELETE itself succeeds. ✓
- **Idempotency preserved:** deleting an already-absent / RLS-invisible row is still a silent no-op (no error, returns void). ✓

🗣 In plain English: deleting a user that is not there does nothing and does not error — same as today. An admin can still delete themselves; the database lets the delete through because it checks "are you an admin?" before the row disappears. Nothing about this changes versus the master-key path.

---

## 11 · No over-grant / OR-combination (Risk E — stated non-issue)

PostgreSQL combines **permissive** policies for the same command with OR. In F-RLS-04a the print-guard had to be careful because a NARROW new UPDATE policy combined (OR) with an existing LOOSE one could over-grant. **Here there is exactly ONE policy per operation on `public.users`** (we are adding the first INSERT, the first UPDATE, the first DELETE policy; `users_select` is the only SELECT policy and is unchanged). With one policy per command there is **nothing to OR against → no over-grant is possible.** This is a deliberate, verified non-issue.

🗣 In plain English: over-granting happens when two database rules for the same action get added together and accidentally let too many people in. Here each action has exactly one rule, so there is nothing to add together — the risk cannot occur.

---

## 12 · ANVIL test matrix

| Layer | Expectation |
|---|---|
| **Unit** (`tests/unit/wiring/usersServiceForCaller.test.ts` NEW) | `usersServiceForCaller(id)` mints a token via `dbTokenMinter`, builds a client via `authenticatedClientForCaller`, returns a `UsersService`. Assert: NOT memoized (two calls → two distinct client builds / two mint calls — mirror the Orders wiring test if one exists). Adapter behaviour under an injected client already covered by existing `UsersRepository` unit tests (factory shape unchanged). |
| **Integration** (`tests/integration/admin-users.test.ts`) | The 4 admin routes under the authenticated client (real session cookie → middleware sets `x-mfs-user-id` → keycard). Admin GET lists all users; admin POST creates (201) + read-back; admin PATCH updates (200) + R-MF-1 missing-id still 500; admin DELETE 200 + idempotent re-delete. Duplicate-name POST under authed client → 409 (ConflictError survives). R-MF-2 snake_case projection still holds. Non-admin (if reachable) → 403. |
| **DB / pgTAP** (`supabase/tests/007-rls-users.test.sql` NEW) | The 3 new policies: admin GUC → INSERT/UPDATE/DELETE ALLOWED; non-admin GUC (e.g. office/warehouse) → all three DENIED; empty GUC → DENIED (not errored — pins the `is_admin()` empty-string note §7). GRANT the table privileges to `authenticated` in the test transaction (mirror `005-rls-orders.test.sql` lines 25-27). |
| **E2E @critical** | Admin create / edit / delete a user via the UI still works end-to-end against the preview (real session). Must stay green (8/8 @critical, matching F-13/F-TD-22 ship records). |

🗣 In plain English: four rungs of the ladder — (1) the wiring builds a fresh keycard each time, (2) the four admin screens still work when they go through the database's checks, (3) the database rules themselves let admins in and keep everyone else out, (4) the real admin UI still creates/edits/deletes users. Every rung green before ship.

---

## 13 · Rollback parachute (Risk F)

Two independent, instant rollbacks:

1. **Code (route re-point):** swap each `await usersServiceForCaller(caller.userId!)` back to the `usersService` service-role singleton (still exported from `lib/wiring/users.ts`). 4 one-line edits, behaviour returns to today's master-key path exactly. (Mirror of the Orders rollback note in `app/api/orders/[id]/route.ts` line 50.)
2. **DB (drop policies):**
   ```sql
   DROP POLICY IF EXISTS users_insert ON public.users;
   DROP POLICY IF EXISTS users_update ON public.users;
   DROP POLICY IF EXISTS users_delete ON public.users;
   ```
   After dropping, those operations are deny-all under the authenticated client again — so drop the policies ONLY after (or together with) re-pointing the routes to service-role, never policies-first while routes are still on the keycard.

🗣 In plain English: two undo buttons. One puts the four screens back on the master key (4 line edits). The other removes the three database rules. Order matters: put the screens back on the master key first, then remove the rules — otherwise the screens would be locked out.

---

## 14 · Hexagonal rip-out check

**Rip-out test:** "If I replace Supabase for Users tomorrow, how many files change?"
- One new adapter folder (`lib/adapters/<newvendor>/UsersRepository.ts` + its authenticated-client equivalent) + edits to the ONE wiring file `lib/wiring/users.ts`. The 4 routes, the service, the ports, and the domain are untouched — they only ever see `UsersService` built from ports.
- The vendor `SupabaseClient` is constructed and consumed entirely inside `lib/wiring/users.ts` and the adapter; it never crosses into the route. ✓
- No vendor SDK import added outside `lib/adapters/supabase/`. ✓
- No new `package.json` entry. ✓

**Result: PASS.** This cutover IMPROVES locality (admin routes drop hand-rolled header parsing in favour of `requireRole`, and stop reaching for the master-key singleton directly).

🗣 In plain English: swapping the database vendor for Users would still be "one new adapter + one wiring line" — the routes and core logic would not notice. The Lego contract holds.

---

## 15 · Acceptance criteria

1. The 4 admin Users routes reach the DB as the `authenticated` role (RLS evaluated); the 5 public routes still use service-role.
2. `usersServiceForCaller` exists in `lib/wiring/users.ts`, never memoizes, and the service-role singleton remains.
3. The migration adds exactly 3 policies (INSERT/UPDATE/DELETE) on `public.users`, all `is_admin()`-gated, 14-digit filename, additive, applied to prod FIRST then merged.
4. Admin create (incl. duplicate→409), edit (incl. missing-id→500), delete (incl. idempotent re-delete) all work under RLS; R-MF-2 snake_case projection intact.
5. pgTAP proves allow-admin / deny-non-admin / deny-empty-GUC for all 3 policies.
6. E2E @critical green; integration + unit green; no vendor import outside the adapter; rip-out test PASS.
7. GET role-guard decision (§5 flag) resolved by the conductor and reflected in tests.
