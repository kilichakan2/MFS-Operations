# Code-Critic Review — F-13 PR3 (re-point /auth/login through UsersService)

- **PR:** #45 · branch `f-13-pr3-repoint-login` · base `main`
- **Date:** 2026-06-16
- **Reviewer:** code-critic subagent (FORGE Guard phase — sole review authority)
- **Verdict:** **SHIP-WITH-NITS** (no blockers; one 🟡 should-note)

## Scope
Re-point `app/api/auth/login/route.ts` alone through the `usersService` singleton:
- credential read → `usersService.findCredentialByName(name)`
- last-login stamp → `usersService.recordLogin(...)`
- drop direct `@supabase/supabase-js` import
- behaviour intended byte-identical; no migration, no new dep, no API contract change.

## Explicit yes/no
- **Behaviour parity:** Mostly yes — ONE documented exception (W1, duplicate-name edge).
- **R1 lockout integrity:** YES — `recordFailure(name)` fires on the `if (!user)` null branch (`route.ts:131`); unit + integration both drive 5-fail → 6th-is-429 against an unknown name.
- **R2 error mapping:** YES — inner try/catch returns `{ error: 'Database error' }` 500 (`route.ts:117-121`), distinct from outer `Server error`.
- **Deviation (a) — no-hash 403 moved to unit test:** SOUND — DB CHECK `users_auth_check` (`baseline.sql:1282`) makes null-hash rows un-seedable; unit test injects a fake credential.
- **Deviation (b) — `(allRoles as readonly string[]).includes(activeRole)`:** SOUND — preserves identical runtime string comparison after `secondaryRoles` typed `readonly Role[]`; `tsc` passes.
- **Hexagonal clean:** YES — zero `@supabase/*` / `lib/adapters/**` imports in route (grep confirmed); imports only `usersService`/`sessionTokens`/`passwordHasher` from `lib/wiring/`. Wiring composes the service-role singleton (`lib/wiring/users.ts:25-28`) — same security posture as old direct client. Rip-out test passes.

## Findings

### 🟡 W1 — duplicate-name edge is NOT byte-identical — `app/api/auth/login/route.ts:115`
Old route used `.single()`; adapter `findCredentialByName` uses `.maybeSingle()` (`lib/adapters/supabase/UsersRepository.ts:182`). Lookup is `.ilike("name", …)` (case-insensitive) and there is **no unique constraint on `users.name`** (only `users_pkey` on `id`) and no app-level name-uniqueness guard on user creation. On two+ matching rows:
- **Old:** `.single()` → `PGRST116` → matched `dbError.code === 'PGRST116'` branch → **recordFailure + 401 Invalid credentials**.
- **New:** `.maybeSingle()` returns a truthy error on >1 row → adapter throws `ServiceError` → route inner catch → **500 "Database error", recordFailure does NOT fire**.

Precondition is operator error (two users with the same name or case variants like "Hakan"/"hakan"). The 500 is arguably *better* surfacing, but the "byte-identical" claim has this one exception. **Not a blocker.** Recommend: ship-record note + 🔵 BACKLOG follow-up to add a `users.name` uniqueness guard.

### 🟢 G1 — R1/R2 guards genuinely pinned, not tautological
R1 drives a real 6-attempt lockout (asserts 6th=429 AND `compare` never ran). R2 asserts `Database error` specifically vs `Server error`. Both in unit AND integration.

### 🟢 G2 — recordLogin fire-and-forget parity preserved
`void usersService.recordLogin(user.id, new Date()).catch(…)` (`route.ts:172-174`) matches old non-awaited `.then()`; stamp failure logs, never blocks login. Tests assert `(id, Date)` and `last_login_at` advancing.

### 🟢 G3 — camelCase rename fully covered
`passwordHash`/`pinHash`/`secondaryRoles` reads exercised by admin-vs-non-admin hash-selection and multi-role picker tests.

### 🟢 G4 — cookie/body parity asserted
All five cookies present on success; `mfs_secondary_roles` Max-Age=0; no `mfs_session` on 401/403/picker; exact bodies checked.

## Depth verdicts
- No new abstraction introduced — diff *removes* a wire and routes through an existing port. No pass-through, no speculative seam created by this PR.
- `usersServiceForCaller` speculative seam in `lib/wiring/users.ts:31-58` is pre-existing (PR1), not built — out of scope.
- Rip-out test: replacing Supabase for Users = one new adapter folder + edits to `lib/wiring/users.ts` only. Holds.

## Test + lint results
- New route unit `tests/unit/api/auth-login.route.test.ts`: **9/9 pass**
- Lint pin `tests/unit/lint/no-adapter-imports.test.ts`: **18/18 pass**
- Full unit suite `tests/unit`: **1721/1721 pass, 91 files** (baseline 1712 → +9, no regressions)
- `tsc --noEmit`: exit 0
- `eslint app/api/auth/login/route.ts`: exit 0
- Integration `tests/integration/auth-login.test.ts`: **NOT run by critic** (needs live local Supabase + dev server) — **ANVIL must run it** (`npm run db:up && npm run test:integration`).

## Conductor handoff
No blockers. One 🟡 W1 → ship-record note + 🔵 BACKLOG (name-uniqueness guard). Hand to ANVIL; ANVIL must execute the integration suite against local Supabase (not run in this audit).
