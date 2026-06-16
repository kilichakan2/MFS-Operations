# F-TD-22 — Prevent duplicate usernames (UNIQUE on `lower(name)`)

- **Unit:** F-TD-22
- **Date:** 2026-06-16
- **Author:** forge-planner (FORGE Phase 2 — Order)
- **Spec status:** locked at Gate 1 (do not re-litigate)
- **Domain:** Users (already migrated to ports/adapters in F-13)

---

## Visual mini-map

```
DOMAIN (Users core logic)
  └─ UsersRepository (port) → [Supabase] (adapter)  ← createUser maps 23505 → ConflictError
                            → [Fake]     (adapter)  ← mirrors the same dup rejection
🗣 one socket (UsersRepository), two plugs (real DB + in-memory twin) — both must reject a duplicate name identically
```

🗣 **In plain English:** We're adding a rule to the staff table so two people can't share the same login name (treating "Hakan"/"hakan" as the same). The database enforces it; both the real adapter and its test stand-in learn to report the clash the same way; the create screen turns that clash into a friendly "name already exists" message instead of a server error.

---

## 1. Goal

A uniqueness rule so **no two case-insensitive-identical usernames can coexist** on the `users` table. Hakan's committed requirement: he does not want two identical usernames to exist. The rule covers **all** rows (active *and* inactive), because login does not filter on `active`.

🗣 **In plain English:** Once this ships, the system physically refuses to store a second "hakan" — even a deactivated old "Hakan" still reserves the name, because the login screen looks people up by name regardless of whether they're switched off.

---

## 2. Domain terms (plain-English bridge)

- **UNIQUE index on `lower(name)`** — a database rule that rejects any insert whose name, lowercased, already exists. 🗣 The bouncer at the door checks the lowercased name against everyone already inside; same name = turned away. We index the *lowercased* form because login matches case-insensitively (`.ilike`), so "Hakan" and "hakan" must count as the same person.
- **Postgres error `23505`** — the specific failure code Postgres returns on a unique-constraint violation. 🗣 The bouncer's exact rejection slip. The Supabase driver hands this code to our adapter; we must catch it and never let the raw code leak upward.
- **`ConflictError`** — an existing app-owned error class (`lib/errors/ConflictError.ts`) that maps to HTTP 409. 🗣 Our own translation of "that clashes with what already exists" — a word the rest of the app understands without knowing anything about Postgres.
- **Fake adapter** (`lib/adapters/fake/UsersRepository.ts`) — the in-memory twin of the real database adapter, used by fast tests. 🗣 A cardboard stand-in for the DB that must behave identically, so tests that pass against it aren't lying about real behaviour.
- **Contract test** (`lib/ports/__contracts__/UsersRepository.contract.ts`) — one shared test suite both adapters must pass. 🗣 One exam both the real DB adapter and the cardboard twin sit, so they can never quietly disagree.
- **14-digit migration timestamp** — filename form `YYYYMMDDHHMMSS_name.sql` (banned: the short `YYYYMMDD_NNN`). 🗣 A strict file-naming rule so two migrations on the same day don't collide and break the Supabase preview branches.

---

## 3. Compliance / discipline flags

- **Migration filename convention (CLAUDE.md):** new migration MUST be `YYYYMMDDHHMMSS_name.sql` with a 14-digit timestamp **after** the newest existing file (`20260615173901_...`). Enforced by `tests/unit/migrations/filename-convention.test.ts` (also pins: no duplicate 14-digit prefix). Pick `20260616120000` (or any time today after the last migration).
- **FORGE+ANVIL full loop required:** touches prod DB schema + auth-adjacent create path → not docs/test-only. Full Frame→Order→Render→Guard→ANVIL→Ship.
- **Supabase MCP token is EXPIRED** — it MUST be re-authorised before the read-only prod dedup check (§9) and before the migration is applied to prod (Ship phase). Flag this to the conductor; it is a Ship-sequence prerequisite, not a coding blocker.

---

## 4. ADR conflicts

**None.** Checked ADR-0002 (hexagonal shape/naming), ADR-0003 (strangler-fig + FREEZE rule), ADR-0004 (RLS vs service-role).

- ADR-0002: the change stays inside the already-migrated Users domain. Vendor error code (`23505`) is caught **inside the adapter** and mapped to a domain error (`ConflictError`) before crossing the port boundary — exactly the "vendor types never cross the port boundary" rule (ADR-0002 line 27). ✅
- ADR-0003 FREEZE rule: no new `@supabase/supabase-js` import outside `lib/adapters/supabase/**`. We add NO new vendor import (the adapter already imports the SDK; we only add error-mapping logic and one error-class import). ✅
- ADR-0004: the create path runs service-role (RLS bypassed) today and stays that way — no RLS/policy change. ✅

🗣 **In plain English:** Nothing here contradicts a past architectural decision. The Postgres-specific code stays trapped inside the one folder allowed to know about Postgres; everywhere else only sees our own "conflict" word.

---

## 5. Confirmation of locked-spec premises (verified in code)

1. **Login is case-insensitive** — `lib/adapters/supabase/UsersRepository.ts` `findUserByName` / `findCredentialByName` both use `.ilike("name", name.trim())` (lines 126, 181). ✅ Confirms index must be on `lower(name)`, covering all rows.
2. **Only the create path introduces a duplicate** — `UpdateUserPersist` and `UpdateUserInput` in `lib/domain/User.ts` (lines 101–106, 129–137) have **no `name` field**; `updateUser` in both adapters never touches `name`. The API cannot rename a user. ✅ So the ONLY entry point is `createUser` → `POST /api/admin/users`. **Plan adds NO rename guarding.**
3. **`createUser` currently inserts `input.name` raw** — `lib/adapters/supabase/UsersRepository.ts` line 215 (`name: input.name`) and `lib/adapters/fake/UsersRepository.ts` line 201 (`name: input.name`). No trim today. ✅ The route already trims (`route.ts` line 53: `String(body?.name ?? '').trim()`), but we add a defensive trim at the adapter write too (canonical stored form).
4. **`createUser` flows route → service → adapter** — `app/api/admin/users/route.ts` POST (line 85) calls `usersService.createUser`; `lib/services/UsersService.ts` `createUser` (line 166) hashes then calls `users.createUser`. The service is a pure pass-through for `name` (no transform) — it does NOT need to trim; the trim lives at the route (already there) and defensively at the adapter. ✅
5. **`ConflictError` already exists** — `lib/errors/ConflictError.ts` (httpStatus 409, code `CONFLICT`). Reuse it; do **not** invent a new error class.
6. **Seed names are all distinct case-insensitively** — `supabase/seed.sql`: `Hakan Kilic`, `Ege Ozmen`, `Emre`, `Daz`, `Omer`, `Mehmet`, plus six `ANVIL-TEST-<role>` fixtures. No two collide on `lower(trim(name))`. ✅ **Seed needs NO change.** (Note for ANVIL: the integration contract's `freshName()` already produces unique `ANVIL-TEST-write-<ts>-<n>` names, so the existing create round-trip cases won't trip the new index.)

🗣 **In plain English:** I read the code to confirm the plan's assumptions are true: login is case-insensitive, users can't be renamed (so only the "add user" button can create a clash), the conflict error class already exists, and the seeded staff list has no duplicate names. All confirmed — nothing surprising to work around.

---

## 6. Design decision: trim-on-write + plain `lower(name)` index (recommended)

**Recommendation (matches locked spec):** index on `lower(name)` (NOT `lower(trim(name))`), and **trim the name at write time** so stored values are already canonical.

Why not `lower(trim(name))` in the index?
- A functional index on `lower(trim(name))` would also work, but it pushes the canonicalisation rule into the DB *and* leaves untrimmed values stored (" Hakan" stays stored with its space, only the index normalises it). That splits "what's stored" from "what's unique" — a future raw query for `name = 'Hakan'` would miss the row.
- Trim-on-write keeps the **stored value** canonical, so `lower(name)` alone is sufficient and the stored data matches the uniqueness key. Cleaner data, simpler index, one source of truth.

🗣 **In plain English:** Two ways to handle stray spaces. Option A: store the name with its spaces and only ignore them in the rule — messy, because the stored name and the "is it unique" name disagree. Option B (chosen): clean the spaces off *before* storing, so the stored name IS the canonical one and the simple lowercase rule is enough. We pick B.

---

## 7. Files changed (exhaustive)

| # | File | Change |
|---|------|--------|
| 1 | `supabase/migrations/20260616120000_unique_username_lower_index.sql` | **NEW** — `CREATE UNIQUE INDEX` on `lower(name)`. |
| 2 | `lib/adapters/supabase/UsersRepository.ts` | `createUser`: trim `input.name` on insert; catch Postgres `23505` → throw `ConflictError`; import `ConflictError`. |
| 3 | `lib/adapters/fake/UsersRepository.ts` | `createUser`: reject when a `lower(trim(name))` already exists → throw the SAME `ConflictError`; import it. Also store the trimmed name. |
| 4 | `app/api/admin/users/route.ts` | POST catch: detect `ConflictError` (or `err.httpStatus === 409` / `err.code === 'CONFLICT'`) → return **HTTP 409** body `{ error: 'A user with that name already exists.' }`; all other failures stay 500. |
| 5 | `lib/ports/__contracts__/UsersRepository.contract.ts` | **NEW contract case:** a create whose name duplicates an existing user's name (case-insensitive) rejects with `ConflictError`. Run by both adapter test files automatically. |
| 6 | `tests/unit/adapters/fake/UsersRepository.test.ts` | (verify-only) Fake contract setup already seeds a known user; the new contract case uses `ctx.knownUserName` — no setup change expected. Confirm green. |
| 7 | `tests/integration/adapters/supabase/UsersRepository.test.ts` | (verify-only) Same — the new contract case must clean up the duplicate-attempt (no row is created on a rejected insert, so `cleanup()` needs no change). Confirm green. |
| 8 | `tests/integration/admin-users.test.ts` | **NEW case:** POST `/api/admin/users` with a name that already exists → HTTP 409 + the exact message. |

**NOT changed (and why):**
- `lib/services/UsersService.ts` — pure pass-through for `name`; the `ConflictError` propagates through it untouched. No edit.
- `app/api/auth/login/route.ts` and the login adapter `.maybeSingle()` — **no change** (see Risk R5). Once names are unique, the duplicate-login 500 path can no longer trigger; the existing `.maybeSingle()` is already correct and needs nothing.
- `supabase/seed.sql` — seed names are already collision-free (§5.6).
- `lib/domain/User.ts`, `lib/ports/UsersRepository.ts` — no shape change; `createUser` already returns `UserSummary` and `@throws` is documented generically.

🗣 **In plain English:** Eight files touched — one new DB migration, two adapter edits (real + cardboard twin), one route edit for the 409 message, and the tests that prove it. The service in the middle needs no edit because it just passes the name through. The login screen needs no edit either — in fact it gets quietly safer.

---

## 8. Ordered, atomic steps (TDD)

> Each behaviour change names the failing test FIRST, then the code that makes it pass.

### Step 1 — Contract case: duplicate create is rejected (RED → GREEN on the Fake)
1a. **Add to `lib/ports/__contracts__/UsersRepository.contract.ts`** a new `it(...)`:
   - `it("createUser rejects a case-insensitively duplicate name with ConflictError", ...)`.
   - Body: call `ctx.repo.createUser({ name: ctx.knownUserName.toUpperCase(), role: "warehouse", secondaryRoles: [], email: null, passwordHash: "$2a$10$DUPNAMEHASHXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX", hashColumn: "pin_hash" })`.
   - Assert it rejects: `await expect(...).rejects.toBeInstanceOf(ConflictError)` (import `ConflictError` from `@/lib/errors` at the top of the contract file).
   - **Note for the implementer:** `ctx.knownUserName` is `ANVIL-FAKE-butcher` (fake) / `ANVIL-TEST-butcher` (real), both already seeded → the duplicate target exists. Use `.toUpperCase()` to also prove case-insensitivity.
   - No `cleanup()` change: a rejected insert creates no row.

1b. **Run the Fake test** `npm run test:unit -- adapters/fake/UsersRepository` → **RED** (Fake currently allows the duplicate).

1c. **Edit `lib/adapters/fake/UsersRepository.ts`** `createUser`:
   - At the top of `createUser`, compute `const trimmed = input.name.trim();` and `const target = trimmed.toLowerCase();`.
   - Before assigning an id, scan the store: `for (const r of store.values()) { if (r.name.trim().toLowerCase() === target) throw new ConflictError("A user with that name already exists"); }`.
   - Store the trimmed name: `name: trimmed` (was `input.name`).
   - Import `ConflictError` from `@/lib/errors`.

1d. **Re-run** → **GREEN** on the Fake.

### Step 2 — Supabase adapter: map `23505` → ConflictError (RED → GREEN on integration)
2a. **The same contract case** now runs against the Supabase adapter via `tests/integration/adapters/supabase/UsersRepository.test.ts`. But it will only pass once BOTH (a) the migration exists locally and (b) the adapter maps the error. Do the migration first (Step 3), then run; until then this is the expected RED for the real adapter.

2b. **Edit `lib/adapters/supabase/UsersRepository.ts`** `createUser`:
   - Insert `name: input.name.trim()` (was `input.name`).
   - In the existing `if (error)` block, BEFORE the generic `throw new ServiceError(...)`, add:
     ```
     if ((error as { code?: string }).code === '23505') {
       throw new ConflictError("A user with that name already exists", { cause: error });
     }
     ```
   - Keep the existing `log.error(...)` and the generic `throw new ServiceError("User create failed", { cause: error })` for every OTHER error (still 500).
   - Import `ConflictError` from `@/lib/errors` (alongside the existing `ServiceError` import).

### Step 3 — Migration (the DB rule)
3a. **Create `supabase/migrations/20260616120000_unique_username_lower_index.sql`** with the SQL in §10.
3b. **`npm run db:reset`** (local) → migrations + seed re-run; must succeed (seed is collision-free).
3c. **`npm run test:unit -- migrations/filename-convention`** → stays **GREEN** (14-digit name, unique prefix).
3d. **Re-run the Supabase integration contract** (`npm run db:up` once, then `npm run test:integration -- adapters/supabase/UsersRepository`) → the duplicate-create case is now **GREEN** (DB raises `23505`, adapter maps it).

### Step 4 — Route returns 409 (RED → GREEN on integration)
4a. **Add to `tests/integration/admin-users.test.ts`** a new case:
   - `it("POST /api/admin/users with a duplicate name returns 409", ...)`.
   - POST `/api/admin/users` as `role: "admin"` with `body: { name: users.butcher.name, role: "warehouse", credential: "1234" }` (or any already-seeded name; the butcher fixture name is case-insensitively present).
   - Assert `res.status === 409` and `res.body.error === 'A user with that name already exists.'`.
   - Cleanup: a rejected create persists nothing → no cleanup needed.

4b. **Run** → **RED** (route currently emits 500 via `String(err)`).

4c. **Edit `app/api/admin/users/route.ts`** POST `catch (err)`:
   - Before the generic 500, add a conflict branch. Import `ConflictError` from `@/lib/errors` and check `if (err instanceof ConflictError) return NextResponse.json({ error: 'A user with that name already exists.' }, { status: 409 })`.
   - (Robustness fallback, since the route uses manual try/catch not `withErrors`: also accept a duck-typed check `(err as { httpStatus?: number })?.httpStatus === 409` — but `instanceof ConflictError` is the primary path and is reliable here because the error is constructed in-process.)
   - Leave the existing `console.error(...)` + `return NextResponse.json({ error: String(err) }, { status: 500 })` as the default for all other errors.

4d. **Re-run** → **GREEN**.

### Step 5 — Full local gate
5a. `npm run test:unit` (Fake contract + filename convention + any route unit) → GREEN.
5b. `npm run test:integration` (Supabase contract + admin-users route) → GREEN.
5c. `npm run test:e2e:api` smoke → unchanged GREEN (no behaviour change to existing flows).
5d. ANVIL hands off to Ship; **Ship phase only** runs the prod dedup check (§9) and applies the migration to prod.

🗣 **In plain English:** Write the failing test first, watch it fail, then make it pass — five rounds: cardboard twin rejects dupes, real adapter translates the DB rejection, the migration plants the DB rule, the route returns the 409 message, then run the whole suite green. The actual prod database only gets touched in the final Ship step, after a safety check.

---

## 9. Pre-ship prod dedup verification (read-only — MANDATORY before applying the migration)

The unique index **fails to create** if duplicate `lower(name)` values already exist in prod. Before applying the migration to prod, run this **read-only** query (Supabase MCP must be re-authorised first — token currently expired):

```sql
-- Read-only: how many case-insensitive name collisions exist in prod today?
SELECT lower(trim(name)) AS canonical_name, count(*) AS n
FROM public.users
GROUP BY lower(trim(name))
HAVING count(*) > 1
ORDER BY n DESC, canonical_name;
```

**Expected result: 0 rows** (small staff table; seed shows distinct names).

**Branch on the result:**
- **0 rows →** proceed: apply the migration to prod.
- **>0 rows → STOP the Ship sequence.** Do NOT auto-dedup. Hakan resolves each collision manually: for each canonical name with >1 row, decide the survivor, reassign any linked rows (e.g. orders' `created_by` / KDS attributions referencing the loser's `id`), then remove the loser. Re-run the query until it returns 0, THEN apply the migration. *(This plan deliberately does NOT script the dedup — survivorship is a human call.)*

🗣 **In plain English:** The new rule can't be added if two duplicate names already exist in the live database — Postgres would reject it. So before touching prod we run a harmless counting query. We expect zero duplicates. If any show up, we stop and Hakan decides which row to keep by hand (and re-points anything that referenced the deleted one); we never auto-merge people.

---

## 10. The migration SQL (exact)

`supabase/migrations/20260616120000_unique_username_lower_index.sql`:

```sql
-- F-TD-22 — Prevent duplicate usernames.
-- A UNIQUE index on lower(name) so no two case-insensitively-identical
-- usernames can coexist. Covers ALL rows (active AND inactive): login
-- looks users up by name with .ilike and does NOT filter on active, so a
-- deactivated name still reserves the name. NOT a partial index.
--
-- Pairs with trim-on-write in lib/adapters/{supabase,fake}/UsersRepository.ts
-- (createUser stores name.trim()), so the stored value is already canonical
-- and lower(name) — not lower(trim(name)) — is sufficient.
--
-- Pre-condition (verified read-only before apply): zero existing
-- lower(trim(name)) collisions in prod. If any exist this CREATE fails;
-- resolve duplicates by hand first (see the F-TD-22 plan §9).

CREATE UNIQUE INDEX IF NOT EXISTS users_lower_name_unique_idx
  ON public.users (lower(name));
```

**Rollback** (one line, if ever needed):

```sql
DROP INDEX IF EXISTS public.users_lower_name_unique_idx;
```

Notes:
- `IF NOT EXISTS` makes the migration idempotent on re-run (db:reset safe).
- Plain `CREATE` (not `CONCURRENTLY`) is correct inside a Supabase migration transaction; the `users` table is tiny (staff only), so the brief lock is negligible.

🗣 **In plain English:** One SQL line plants the rule; one SQL line removes it if we ever need to back out. It's safe to run more than once, and on a staff-sized table it's instant.

---

## 11. Acceptance criteria

1. A `CREATE UNIQUE INDEX` on `lower(name)` exists in `supabase/migrations/`, 14-digit filename, filename-convention test green, no duplicate version prefix.
2. The Fake adapter rejects a create whose `lower(trim(name))` already exists, throwing `ConflictError`.
3. The Supabase adapter maps Postgres `23505` on `createUser` to `ConflictError`; all other create failures still throw `ServiceError` (500).
4. Both adapters store the **trimmed** name.
5. The shared contract case (duplicate-name create → `ConflictError`) passes on BOTH adapters.
6. `POST /api/admin/users` with an existing (case-insensitive) name returns **HTTP 409** with body `{ error: 'A user with that name already exists.' }`; every other failure still returns 500.
7. No new `package.json` dependency. No new vendor SDK import outside `lib/adapters/supabase/**`.
8. `auth/login` route + adapter unchanged; existing login flows unaffected.
9. Full local suite (unit + integration + api smoke) green.
10. Pre-ship prod dedup query returns 0 (or collisions resolved by hand) before the migration is applied to prod.

---

## 12. TDD test plan (named tests)

| Behaviour | Test | File | Layer |
|-----------|------|------|-------|
| Duplicate create rejected w/ ConflictError (both adapters) | `createUser rejects a case-insensitively duplicate name with ConflictError` | `lib/ports/__contracts__/UsersRepository.contract.ts` | contract (Fake unit + Supabase integration) |
| Migration filename valid | existing `every migration filename uses a full 14-digit timestamp` + `no two migrations share the same 14-digit version prefix` | `tests/unit/migrations/filename-convention.test.ts` | unit (stays green) |
| Route returns 409 + exact message | `POST /api/admin/users with a duplicate name returns 409` | `tests/integration/admin-users.test.ts` | integration |
| Non-duplicate create still works | existing `createUser persists and reads back (round-trip)` | contract | regression (stays green — `freshName()` is unique) |
| Other create failures still 500 | covered by existing route catch + no change to ServiceError path | — | regression |

🗣 **In plain English:** The headline test makes both adapters reject a duplicate name the same way; a route test proves the friendly 409 message; the existing "create a normal user" and "migration filenames are valid" tests must stay green so we know we didn't break anything.

---

## 13. Risk Assessment

> Severity scale: 🔴 must-fix (Gate 2 blocker) · 🟠 fix-before-ship · 🟡 accept-with-note · 🟢 informational.

### R1 — Migration fails on existing prod duplicates (data-migration) — 🔴 must-fix-process (mitigated by §9)
If prod already holds two case-insensitive-identical names, `CREATE UNIQUE INDEX` fails and the prod deploy errors mid-migration.
- **Mitigation:** the **mandatory read-only dedup query (§9) runs BEFORE the migration is applied to prod**; on >0 rows the Ship sequence STOPS for manual resolution. This is a Ship-phase gate, not a code blocker — the code/plan is correct as written.
- **Must-fix flag:** the **process step is must-do** (skipping §9 risks a broken prod migration). The implementation itself has no code-level must-fix.
🗣 The only real danger is the live database already having a duplicate; we defuse it by counting first and refusing to proceed if any exist.

### R2 — Concurrency / race on simultaneous creates (concurrency) — 🟢 informational
Two admins could POST the same new name at the same instant; the application-level check in the Fake is not atomic.
- **Mitigation:** the **DB UNIQUE index is the authority** — Postgres serialises the second insert and raises `23505` atomically regardless of timing. The Fake's in-memory check is single-threaded by construction. No TOCTOU window in prod. No fix needed.
🗣 Even if two people click "add Hakan" at the same millisecond, the database lets exactly one through and rejects the other — the rule lives in the DB, not in racing app code.

### R3 — Error code leak past the adapter boundary (security / architecture) — 🟠 fix-before-ship (handled by Step 2)
If the raw `23505` / constraint name `users_lower_name_unique_idx` leaked to the client it would expose schema internals and violate ADR-0002.
- **Mitigation:** the adapter catches `23505` and throws `ConflictError` with a generic message; `AppError.toJSON()` strips `cause`/`stack` in production. The route returns a fixed message, never `String(err)` for the conflict branch. Verify the 409 body contains ONLY the friendly message.
🗣 We make sure the database's internal jargon never reaches the screen — the user sees "name already exists," not a Postgres code.

### R4 — Route catch-ordering bug emits 500 instead of 409 (business-logic) — 🟠 fix-before-ship (covered by Step 4 test)
The POST handler uses a manual `try/catch` that ends in `String(err)` 500. If the `ConflictError` branch is placed after/omitted, the conflict wrongly returns 500.
- **Mitigation:** Step 4's integration test asserts status 409 AND the exact message — it fails if the branch is missing or mis-ordered. Place the `instanceof ConflictError` check first in the catch.
🗣 The friendly message only works if the route checks for "conflict" before its generic error handler — a test guarantees that ordering.

### R5 — Behaviour delta on the duplicate-name LOGIN path (business-logic, POSITIVE) — 🟢 informational
F-13 PR3 noted W1: the old login lookup used `.single()`, which 500s on duplicate names. The adapter now uses `.maybeSingle()` (`findCredentialByName`, line 182), which returns the FIRST of duplicates rather than erroring.
- **Effect of F-TD-22:** once names are unique, **duplicates can no longer exist**, so the `.maybeSingle()`-picks-one ambiguity can never trigger in prod. This is a **positive side effect** and resolves the W1 nit at its root.
- **Confirmed:** the login route + adapter need **NO code change** — `.maybeSingle()` is already correct, and the uniqueness rule removes the only scenario where it could behave ambiguously.
🗣 A nice bonus: the old worry about two same-named users confusing the login screen simply disappears, because we now forbid two same-named users. No login code changes.

### R6 — Inactive name reserves the name (business-logic, intended) — 🟢 informational
The index covers inactive rows, so a deactivated "Hakan" blocks creating a new "Hakan".
- **Mitigation:** this is the **locked, intended** behaviour (login doesn't filter on `active`). If Hakan later wants to free a name, he reactivates/renames/deletes the old row — out of scope here. Documented so it isn't a surprise.
🗣 By design, switching someone off doesn't free up their name; that's deliberate so an old login can't be silently re-created. If Hakan wants the name back, he deletes the old row.

### R7 — Trim changes stored values for future creates (data, minor) — 🟢 informational
Adding trim-on-write means a name typed with leading/trailing spaces is stored trimmed. The route already trims, so in practice nothing changes via the UI; the adapter trim is defensive for direct-service callers.
- **Mitigation:** trimming only removes surrounding whitespace; no interior change. Existing rows are untouched (no backfill). No migration data change.
🗣 We strip stray spaces off new names as we save them — the screen already did this, so users see no difference; it's just a belt-and-braces guard.

### Launch-blocker summary
- **One must-do process gate:** the §9 read-only prod dedup check before applying the migration (R1).
- **No code-level must-fix risk.** R3/R4 are covered by the planned steps + tests.
- Concurrency (R2), security-leak (R3), data-migration (R1), business-logic (R4/R5/R6), launch (R1 §9) all addressed.

🗣 **In plain English:** Nothing in the code blocks the build. The one hard rule is operational: run the harmless duplicate-count query against the live database before adding the rule, and stop if it finds anything.

---

## 14. Hexagonal / rip-out check

- **Port used:** `UsersRepository` (`lib/ports/UsersRepository.ts`) — existing, reused. No new port, no port-shape change (`createUser` already documents `@throws` generically).
- **Adapters implementing it:** `lib/adapters/supabase/UsersRepository.ts` (real) + `lib/adapters/fake/UsersRepository.ts` (twin) — both edited to enforce the rule and throw `ConflictError`.
- **New dependencies:** **none.** No `package.json` change.
- **New vendor SDK imports:** **none.** The `23505` handling uses the SDK's existing error object inside the already-allow-listed adapter folder; the only new import is the app-owned `ConflictError` from `@/lib/errors` (a domain error, not a vendor).
- **Vendor leak check:** Postgres `23505` is caught and mapped to `ConflictError` **inside the adapter** — the raw code never crosses the port boundary (ADR-0002 line 27). ✅
- **Rip-out test:** "If I replace Supabase tomorrow, how many files change for THIS feature?" → one adapter (`lib/adapters/supabase/UsersRepository.ts`) + the equivalent uniqueness enforcement in the new adapter, plus a migration for the new DB. The port, service, route, domain types, and contract test are vendor-agnostic and unchanged in shape. **Rip-out test: PASS.**

🗣 **In plain English:** The change clicks into the existing Lego socket — no new vendor, no new dependency. Swap Supabase for another database and only the one adapter (plus its migration) changes; the rule, the error word, and the screen logic all stay put.
