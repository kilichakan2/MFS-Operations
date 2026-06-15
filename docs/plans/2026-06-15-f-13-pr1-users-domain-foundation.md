# F-13 PR1 — Users-domain foundation (precision execution plan)

**Date:** 2026-06-15
**Unit:** F-13 "Users + Auth" (3-PR unit) · **This plan: PR1 only**
**Author:** forge-planner (FORGE Phase 2 — Order)
**Status:** plan locked for implementation; PR2/PR3 explicitly out of scope.

---

## Visual mini-map

```
DOMAIN (core logic)
  ├─ UsersRepository (port) → [Supabase]  (adapter, service-role) + [Fake] (adapter, in-memory)
  ├─ PasswordHasher  (port) → [bcrypt]    (adapter, already shipped — reused, not touched)
  └─ Role (domain type, moved here from observability in PR1)
🗣 PR1 builds the socket (UsersRepository + UsersService) and proves both plugs fit — no route is rewired yet, so nothing the user sees can change.
```

🗣 In plain English: PR1 lays the plumbing for everything to do with staff
accounts and login. We carve out a clean "staff operations" interface, write the
two implementations behind it (the real database one and a fake in-memory one for
tests), and a service that orchestrates them — but we deliberately do NOT touch any
of the 7 live login/admin pages. That makes PR1 incapable of changing behaviour: a
plumbing-only change with all the safety of new, unused code.

---

## 1 · Scope (in / out)

### In scope (everything below lands in PR1, additively)
1. **F-08 UsersRepository port expansion** — grow `lib/ports/UsersRepository.ts`
   from one method (`findUserById`) to the full surface all 7 user-touching routes
   need (§4). Expand the Supabase adapter, the Fake adapter, and the shared
   contract suite to match.
2. **UsersService** — `lib/services/UsersService.ts`, factory-only (no pre-wired
   singleton), depends on the port only, mirroring `OrdersService.ts`.
3. **Composition root** — `lib/wiring/users.ts`, service-role singleton only, with
   a documented seam comment for the F-RLS-04b per-caller factory.
4. **ARCH-FU-01** — create `lib/domain/Role.ts`, move the `Role` union + its runtime
   mirror there, re-export from `lib/domain`, re-point every importer, delete the
   `Role` export from `lib/observability/Caller.ts` (re-import it back), and tighten
   `UserSummary.role` from `string` to the `Role` union.
5. **ARCH-FU-03** — remove the unused `callerUserId` param from
   `OrdersService.editOrder` (signature + the one route call site + tests).
6. **ARCH-FU-04** — adopt the round-trip-read happy-path test pattern; retrofit
   `OrdersService.test.ts`; make it the documented template for `UsersService.test.ts`.
7. **F-TD-05** — add a `no-restricted-imports` rule forbidding cross-service imports
   (a `lib/services/**` file importing another `lib/services/*` module) in BOTH
   `.eslintrc.json` mirror sites, and a pinning test mirroring the
   `no-adapter-imports.test.ts` load-from-disk pattern.

### Out of scope (do NOT do in PR1)
- **No route is edited.** All 7 routes in §4 stay byte-identical. Re-pointing the
  6 non-login routes = PR2; re-pointing the login route = PR3.
  🗣 In plain English: the new service exists but nothing calls it in production yet
  — exactly how F-RLS-03 shipped its bridge "introduce-only".
- **No RLS, no authenticated DB client.** UsersService uses the service-role client
  singleton (`supabaseService`), exactly as the routes do today. Flipping users onto
  the authenticated client + RLS policies is the separate next unit **F-RLS-04b**.
- **No migration.** PR1 changes no schema (confirmed §8). If an implementer thinks a
  migration is needed, STOP — that is a scope breach, escalate to the conductor.
- **No new package.json dependency** (bcrypt/passwordHasher + Supabase already present).

---

## 2 · Domain terms (plain-English glossary for this plan)

- **Port** = `lib/ports/UsersRepository.ts`, the interface the app owns.
  🗣 The socket shape. The app insists on these staff operations; the vendor must fit them.
- **Adapter** = `lib/adapters/supabase/UsersRepository.ts` (real) and
  `lib/adapters/fake/UsersRepository.ts` (in-memory test twin).
  🗣 The two plugs that fit the socket. One talks to the real database, one is a
  pretend database living in memory so tests run fast with no DB.
- **Service** = `lib/services/UsersService.ts`, business orchestration over the port.
  🗣 The front desk. Routes ask the front desk; the front desk works the database
  through the socket. Routes never reach past it.
- **Wiring / composition root** = `lib/wiring/users.ts`.
  🗣 The one place the abstract socket is bolted to a concrete plug. Swapping the
  database vendor = new plug + edit this one file. Nothing else.
- **Contract suite** = `lib/ports/__contracts__/UsersRepository.contract.ts`.
  🗣 One shared exam both plugs must pass, so the fake can never quietly drift from
  the real database's behaviour.
- **UserSummary** = the safe read shape (`id, name, role, active, secondary_roles, email,
  last_login_at, created_at`) — NEVER carries `pin_hash`/`password_hash`.
  🗣 What's safe to hand around the app. The password fingerprints are stripped at
  the database boundary so they can't leak through a list or a profile read.
- **Credential hash** = `pin_hash` / `password_hash` columns.
  🗣 The salted bcrypt fingerprint of a PIN/password. Login compares against it;
  it must never travel into a read that returns user lists.

---

## 3 · Compliance flags & ADR conflicts

- **CLAUDE.md "## Non-negotiable architecture"** — every rule applies. PR1 honours
  them (self-check §10). No conflict.
- **ADR-0002 (hexagonal shape & naming)** — port in `lib/ports/`, adapters in
  `lib/adapters/<vendor>/`, service depends on port, wiring is the only adapter
  importer, vendor types never cross the boundary. PR1 follows it exactly. **No conflict.**
- **ADR-0004 (RLS vs service-role security model)** — PR1 deliberately keeps users on
  service-role (RLS deferred to F-RLS-04b). This is **consistent** with ADR-0004's
  staged-cutover model (Orders went service-role → RLS across F-RLS-03/04a). **No conflict.**
- **ADR-0007 (app-minted token + GUC bridge for RLS)** — not exercised in PR1 (no
  authenticated client). The wiring seam comment points forward to it. **No conflict.**
- **`lib/ports/UsersRepository.ts` header doc** — currently warns that adding methods
  now "would be speculative generality (APOSD §'general-purpose by accident')." PR1
  must **rewrite that header** to record that F-13 has arrived and every new method is
  consumed by a committed PR (PR2/PR3) in the same unit. See §5 risk R1. **This is the
  one doc the implementer must consciously revise, not a conflict to escalate.**

🗣 In plain English: nothing in the plan fights an existing architectural decision.
The only "conflict" is a stale comment that says "don't expand this yet" — and F-13
is precisely the moment it told us to expand it, so we update the comment to say so.

---

## 4 · The exact port surface (derived 1:1 from the 7 routes)

Every method below is justified by a named route that consumes it in PR2 or PR3.
**This is not speculative generality** — the port doc's own warning is addressed by
citing the committed consumer for each method.

### 4.1 Domain shapes (in `lib/domain/User.ts`, exported via `lib/domain`)

```
UserSummary (EXPANDED — the safe read shape; NEVER carries hashes)
  readonly id: string
  readonly name: string
  readonly role: Role                       // tightened from string (ARCH-FU-01)
  readonly active: boolean
  readonly secondaryRoles: readonly Role[]  // NEW — needed by login, team, haccp-team, admin list
  readonly email: string | null             // NEW — admin list/create/update
  readonly lastLoginAt: string | null       // NEW — admin list (ISO timestamp)
  readonly createdAt: string                 // NEW — admin list ordering
```
🗣 In plain English: `UserSummary` grows from 4 fields to 8 so the admin screens and
login grids have what they display — but the two password-fingerprint columns are
still absent by design. Vendor column names (`secondary_roles`, `last_login_at`,
`created_at`) are mapped to clean camelCase domain names at the adapter; the app
never sees the database's spelling.

```
AuthType = 'password' | 'pin'        // NEW domain type for /auth/type
```

```
CreateUserInput (NEW — admin POST)
  readonly name: string
  readonly role: Role
  readonly credential: string          // plaintext PIN/password; adapter NEVER stores this raw
  readonly secondaryRoles: readonly Role[]
  readonly email: string | null
```

```
UpdateUserInput (NEW — admin PATCH; all optional, partial update)
  readonly active?: boolean
  readonly email?: string | null
  readonly secondaryRoles?: readonly Role[]
  readonly credential?: { plaintext: string; role: Role }  // optional re-hash
```

> **Hashing boundary decision for create/update:** the routes today call
> `passwordHasher.hash(credential)` and then write `pin_hash`/`password_hash`. In PR1
> the **adapter** owns the column-selection-by-role logic (`role==='admin' ? password_hash
> : pin_hash`, and clearing the other field on update), but it must NOT import bcrypt.
> The plaintext→hash step stays a **PasswordHasher port call made in the UsersService**,
> which passes the already-hashed value into a narrow adapter write. Concretely:
> - `UsersService` depends on **both** `UsersRepository` AND `PasswordHasher` (two ports;
>   this is composition of ports, not services — allowed, mirrors how use-cases compose).
> - The service hashes via `PasswordHasher`, then calls
>   `repo.createUser({...input, passwordHash, hashColumn})` / `repo.updateUser(id, {...})`
>   with the hash already computed. The adapter writes the hash to the correct column.
> 🗣 In plain English: who turns a typed PIN into a stored fingerprint? The service
> does, using the existing bcrypt port. The database adapter only ever receives an
> already-scrambled fingerprint and decides which column it lands in. bcrypt stays
> locked inside its one adapter folder — the lint guard already enforces that.

### 4.2 The credential-hash READ decision (the single most important design call)

Login (route 1) and kds-pin (route 4) must **read a hash to compare**. Every other
read must NOT expose hashes. The clean separation:

```
UsersRepository (port) — READ methods
  findUserById(id): Promise<UserSummary | null>                  // existing — unchanged shape (now richer UserSummary)
  findUserByName(name): Promise<UserSummary | null>              // ilike; NO hash — used by /auth/type
  listUsersByRoles(roles: readonly Role[], opts: {              // /auth/team, /auth/haccp-team
      activeOnly: boolean
      orderBy: readonly ('role'|'name')[]
  }): Promise<readonly UserSummary[]>                            // NO hash
  listAllUsers(): Promise<readonly UserSummary[]>                // admin GET list; ordered by created_at; NO hash

  // ─── The NARROW credential-read seam (hashes legitimately needed) ───
  findCredentialByName(name): Promise<UserCredential | null>     // /auth/login (PR3)
  listCredentialsByRoles(roles, { activeOnly }): Promise<readonly UserCredential[]>  // /auth/kds-pin (PR4? — kds-pin is route 4, PR2)
```

```
UserCredential (NEW — the ONLY shape that carries a hash; quarantined)
  readonly id: string
  readonly name: string
  readonly role: Role
  readonly active: boolean
  readonly secondaryRoles: readonly Role[]
  readonly passwordHash: string | null
  readonly pinHash: string | null
```

```
UsersRepository (port) — WRITE methods
  createUser(input: CreateUserPersist): Promise<UserSummary>     // admin POST (PR2)
  updateUser(id, patch: UpdateUserPersist): Promise<UserSummary | null>  // admin PATCH (PR2); null on no-row
  deleteUser(id): Promise<void>                                  // admin DELETE (PR2)
  recordLogin(id, when: Date): Promise<void>                     // login last_login_at fire-and-forget (PR3)
```
(`CreateUserPersist`/`UpdateUserPersist` = the input shapes above but with `credential`
replaced by a pre-computed `passwordHash`/`pinHash` + which column — the service does the
hashing, so the adapter receives no plaintext.)

**Why two read families, not one with an optional "includeHash" flag:** a boolean flag
would mean every list method *could* return hashes, so a future careless caller could flip
it. Two distinct return types (`UserSummary` never has a hash field; `UserCredential` is the
only type with one, returned by exactly two narrowly-named methods) makes "hash leak"
a **compile error**, not a code-review catch.
🗣 In plain English: instead of one read method with a "give me the passwords too" switch
(easy to leave on by accident), we have a normal read path that physically cannot return a
password fingerprint, and two bluntly-named "fetch credential to verify login" methods that
are the only doors hashes come through. A leak would have to be deliberate and obvious.

### 4.3 Per-route mapping (proof every method has a committed consumer)

| # | Route | Reads/Writes | Port method(s) | Lands in |
|---|-------|--------------|----------------|----------|
| 1 | `auth/login` POST | read hash by name, then write last_login_at | `findCredentialByName` + `recordLogin` | PR3 |
| 2 | `auth/type` POST | read role+active by name | `findUserByName` | PR2 |
| 3 | `auth/team` GET | list 4 roles, active, order name | `listUsersByRoles` | PR2 |
| 4 | `auth/kds-pin` POST | read hashes for butcher+warehouse active | `listCredentialsByRoles` | PR2 |
| 5 | `auth/haccp-team` GET | list butcher+warehouse, active, order role,name | `listUsersByRoles` | PR2 |
| 6 | `admin/users` GET+POST | list all; create+hash | `listAllUsers` + `createUser` | PR2 |
| 7 | `admin/users/[id]` PATCH+DELETE | update(+re-hash) ; delete | `updateUser` + `deleteUser` | PR2 |

🗣 In plain English: every single method we add is checked off against a real route in a
PR that's already committed in this unit. None is "might be handy later" — the whole point
is PR2/PR3 become pure re-pointing with zero further port churn.

---

## 5 · File-by-file change list

### Modify
1. **`lib/domain/User.ts`** — expand `UserSummary` (8 fields, §4.1); tighten `role` to
   `Role`; add `AuthType`, `CreateUserInput`, `UpdateUserInput`, `UserCredential`,
   `CreateUserPersist`, `UpdateUserPersist`. Rewrite the header doc: F-13 has arrived,
   minimalism rationale superseded, cite the committed consumers.
2. **`lib/domain/index.ts`** — re-export the new types AND `Role` (`export type { Role } from './Role'`)
   + the runtime `KNOWN_ROLES`/`isKnownRole` if those move too (see decision in step 3).
3. **`lib/observability/Caller.ts`** — DELETE the local `Role` union + `KNOWN_ROLES` +
   `isKnownRole`; re-import them from `@/lib/domain`. Update the header doc (the F-13
   forward-path note is now history). **Decision:** move BOTH the `Role` type AND the
   `KNOWN_ROLES`/`isKnownRole` runtime mirror to `lib/domain/Role.ts` — they are a single
   source-of-truth pair (the Caller.ts doc says so) and splitting them invites drift.
   🗣 In plain English: the list of valid roles and the function that checks a string is a
   valid role belong together; move them as a unit into the domain layer where the rest of
   the app can reach them without importing the logging module.
4. **`lib/observability/index.ts`** — re-export `Role` from its new home (keep the
   `export { type Role } from './Caller'` working by having Caller re-export, OR point the
   barrel at `@/lib/domain`). Keep `makeCaller`/`Caller` exports intact. Pick whichever keeps
   existing `@/lib/observability` importers green with a one-line change.
5. **`lib/services/OrdersService.ts`** — (a) change `import type { Role } from "@/lib/observability"`
   → `from "@/lib/domain"` (line 125; the header note lines 84-94 already predicts this exact
   one-liner). (b) **ARCH-FU-03:** remove `callerUserId` from `editOrder` signature (line 296-302),
   remove `_callerUserId` from the impl (line 441), update the method JSDoc (lines 288-292 — delete
   the "currently unused" paragraph).
6. **`lib/auth/session.ts`** — change the `Role`/`isKnownRole`/`makeCaller` import (lines 66-71)
   from `@/lib/observability/Caller` to pull `Role`/`isKnownRole` from `@/lib/domain` (and keep
   `makeCaller`/`Caller` from observability). One import-block edit, no logic change.
7. **`lib/ports/UsersRepository.ts`** — expand to the full surface (§4); rewrite the header doc.
8. **`lib/adapters/supabase/UsersRepository.ts`** — implement every new method; map vendor
   columns→domain camelCase; keep `findUser*`/`list*` projections hash-free; `findCredential*`
   project the hash columns. Keep the `createSupabase...` factory + singleton shape.
9. **`lib/adapters/fake/UsersRepository.ts`** — faithful in-memory twin of every new method
   (store credentials separately so list/read methods can't return them).
10. **`lib/adapters/fake/index.ts`** / **`lib/adapters/supabase/index.ts`** — no change needed
    if barrels already re-export the factory; verify the new types flow through `@/lib/ports`.
11. **`lib/ports/index.ts`** — export any new port-adjacent types if the implementer puts input
    types in the port file (prefer putting them in `lib/domain` per §4.1, so likely no change).
12. **`lib/ports/__contracts__/UsersRepository.contract.ts`** — expand the shared exam to cover
    every new method, including the **hashes-never-leak** assertions (§7) and round-trip-read.
13. **`tests/unit/adapters/fake/UsersRepository.test.ts`** — extend the setup with seed data
    for all the new contract cases.
14. **`tests/integration/adapters/supabase/UsersRepository.test.ts`** — extend the setup
    (`setupTestUsers` already seeds one user per role with placeholder hashes — reuse it; add a
    create/update/delete cleanup since those cases write rows).
15. **`tests/integration/_setup.ts`** — if create/update/delete contract cases need teardown,
    add a `cleanup` that deletes the `ANVIL-TEST-` rows the case created. Do NOT delete the
    shared `setupTestUsers` rows (other suites share them).
16. **`.eslintrc.json`** — add the F-TD-05 cross-service `no-restricted-imports` pattern in
    the **services/usecases override block** (the only block where it belongs). See §6.
17. **`tests/unit/services/OrdersService.test.ts`** — (a) **ARCH-FU-03:** drop the trailing
    `USER_ID` arg from all 8 `editOrder(...)` call sites (lines 278, 294, 317, 336, 350, 365, 398,
    765) + update the §8/coverage comment. (b) **ARCH-FU-04:** retrofit the create/place happy
    paths to read back via `findOrderById` and assert persistence; document the pattern in the
    file header as the template.

### Create
18. **`lib/domain/Role.ts`** — the `Role` union + `KNOWN_ROLES` + `isKnownRole`, moved verbatim
    from `Caller.ts` (the Caller.ts doc lines 14-16 pre-authorise this exact move). Pure
    TypeScript, no framework/vendor imports.
19. **`lib/services/UsersService.ts`** — factory `createUsersService({ users, passwordHasher })`,
    NO pre-wired singleton, NO adapter import. Methods orchestrate the port + hashing. Mirror
    `OrdersService.ts`'s doc style and the "primitives not Caller" auth posture.
20. **`lib/services/index.ts`** — export `createUsersService` + `UsersService` type (check the
    barrel exists; OrdersService is exported from `@/lib/services`).
21. **`lib/wiring/users.ts`** — composition root: `usersService = createUsersService({ users:
    supabaseUsersRepository, passwordHasher })` (service-role singleton only). Add a clearly
    fenced comment block for the F-RLS-04b per-caller factory seam (copy the shape of
    `lib/wiring/orders.ts` lines 70-117 as a commented-out / documented placeholder — do NOT
    implement the authenticated factory in PR1).
22. **`lib/domain/Role.test.ts`** (or fold into existing) — unit test the moved
    `isKnownRole`/`KNOWN_ROLES` parity (port the assertions currently in
    `tests/unit/observability/Caller.test.ts` that test `Role`-as-a-set; update that file's import).
23. **`tests/unit/services/UsersService.test.ts`** — full unit suite against the Fake (the
    ARCH-FU-04 round-trip pattern is the template). Include the architecture-pin grep (no
    cross-service import, no adapter import) mirroring OrdersService.test.ts lines ~780-795.
24. **`tests/unit/lint/no-cross-service-imports.test.ts`** — F-TD-05 pin. Load `.eslintrc.json`
    from disk (the `no-adapter-imports.test.ts` pattern, NOT the hermetic-mirror pattern), assert:
    a `lib/services/Foo.ts` importing `@/lib/services/OrdersService` (alias) → 1 error; relative
    form `../services/OrdersService` → 1 error; a wiring file importing a service → 0 errors;
    a service importing a port → 0 errors; the message text verbatim.

### Re-point importers of `Role` (ARCH-FU-01 — complete enumeration)

`Role` (and its runtime mirror) is imported from `@/lib/observability/Caller` or
`@/lib/observability` in exactly these places (verified by grep — see §11):

| File | Current import | Change |
|------|----------------|--------|
| `lib/services/OrdersService.ts:125` | `type Role from "@/lib/observability"` | → `from "@/lib/domain"` (also ARCH-FU-03) |
| `lib/auth/session.ts:66-71` | `{ makeCaller, isKnownRole, type Caller, type Role } from "@/lib/observability/Caller"` | split: `Role`,`isKnownRole` ← `@/lib/domain`; `makeCaller`,`Caller` ← `@/lib/observability/Caller` |
| `lib/observability/withRequestContext.ts:43` | `{ makeCaller, isKnownRole } from "./Caller"` | `isKnownRole` now re-exported by Caller (it re-imports) → **no change needed** if Caller re-exports; otherwise → `@/lib/domain` |
| `tests/unit/auth/session.test.ts:18` | `type Role from "@/lib/observability/Caller"` | → `@/lib/domain` |
| `tests/unit/observability/Caller.test.ts:16` | `{ makeCaller, type Caller, type Role } from "@/lib/observability/Caller"` | `Role` ← `@/lib/domain`; rest stay (or move the role-set assertions to `Role.test.ts`) |

**Belt-and-braces:** after editing, re-run the grep in §11 and confirm ZERO remaining
`Role`-from-observability imports except the intentional re-export inside `Caller.ts`
and `lib/observability/index.ts`.

🗣 In plain English: "move the Role type" sounds scary but it's five one-line import
swaps plus one new file. The Caller.ts doc literally told us this day would come and
named the destination file, so there are no surprises — we just follow its instructions
and then grep to prove nothing was missed.

---

## 6 · ESLint mirror-site enumeration (F-TD-05)

There is **one** ESLint config file: `.eslintrc.json`. Inside it the
`no-restricted-imports` rule appears in **two mirror sites**:
- **Site A** — top-level `rules` block (lines 4-22): applies everywhere. The cross-service
  ban does NOT go here (routes/components legitimately import services).
- **Site B** — the `lib/services/**` + `lib/usecases/**` override block (lines 37-69): this
  is where the F-TD-05 cross-service pattern goes, added to the existing `patterns` array
  (alongside the F-TD-11 adapter ban).

Add to **Site B's `patterns`**:
```
{ "group": ["@/lib/services/*", "**/services/*"],
  "message": "Services and use-cases must not import another service directly (ADR-0002 line 23 / F-TD-05). Compose via a use-case in lib/usecases/ or depend on the other domain's PORT. Wire concretions in lib/wiring/." }
```
**Caution — self-import:** the pattern `@/lib/services/*` would also flag a service importing
its own barrel `@/lib/services` (no trailing segment) — verify the glob only matches a
*named sibling module* (`@/lib/services/OrdersService`), NOT the barrel `@/lib/services` and
NOT same-file. Test cases in the pin (step 24) must include a "service imports the barrel" =
allowed case if the barrel re-export pattern is used, OR confirm services never import the
barrel. The implementer must tune the glob so it catches `OrdersService.ts` importing
`UsersService` but not false-positives on legitimate `@/lib/ports` / `@/lib/domain` imports.

**Two pin tests reference the config**, but only one must be touched:
- `tests/unit/lint/no-adapter-imports.test.ts` — loads config from disk; the new
  cross-service rule will be live in the config it loads, but its existing cases don't assert
  the new rule. No edit required (it stays green). Optionally add a case — but the dedicated
  new pin (step 24) is the home for F-TD-05 cases.
- `tests/unit/lint/no-supabase-sdk.test.ts` — **hermetic mirror** (hand-rolled config copy).
  It does NOT load from disk, so it will NOT see the new rule and will NOT break. Do **not**
  add the cross-service rule to its hand-rolled copy (out of its scope — it pins the
  vendor-SDK bans only). **No edit required.**

🗣 In plain English: there's only one rules file, but the rule we're adding is written twice
inside it (once globally, once for the service layer); we touch the service-layer copy only.
Of the two tests that watch the rules file, one reads the real file (so it just keeps
passing) and one keeps its own private copy of only the vendor bans (so it's untouched). The
new behaviour gets its own dedicated test that reads the real file and proves the cross-service
ban fires.

---

## 7 · TDD slice order (red → green, atomic-commit-friendly)

Each slice is an independent commit. Run `npx tsc --noEmit`, `npm run lint`, and the unit
suite green at the end of every slice. Order chosen so each slice compiles on its own.

**Slice 0 — ARCH-FU-01 Role move (mechanical, do first; everything else builds on it).**
- RED: create `lib/domain/Role.ts` + `lib/domain/Role.test.ts` (port the role-set parity
  assertions). Test fails (file empty).
- GREEN: move the union+mirror, re-export from `lib/domain`, re-point the 5 importers,
  make `Caller.ts` re-import. `tsc` + lint + full suite green.
- Then tighten `UserSummary.role: Role` (the contract suite's `typeof user.role === 'string'`
  still passes since `Role` literals are strings).

**Slice 1 — ARCH-FU-03 editOrder param removal (mechanical, isolated).**
- RED: drop the `USER_ID` arg from the 8 OrdersService.test.ts call sites → `tsc` fails on
  the still-5-arg signature.
- GREEN: remove `callerUserId`/`_callerUserId` from the service signature+impl+JSDoc, drop
  the arg at the route call site (`app/api/orders/[id]/route.ts:72-78`). Suite green.

**Slice 2 — ARCH-FU-04 round-trip-read pattern + OrdersService retrofit.**
- RED: add the read-back assertion to the placeOrder happy-path test → already-green logic,
  but it documents the pattern. (If the Fake doesn't persist readably, that's a real bug to
  surface — but it does.) Update the file header to document the template.

**Slice 3 — domain shapes + port surface (no impl yet, contract suite as the RED).**
- RED: expand `lib/domain/User.ts` (the new types) + `lib/ports/UsersRepository.ts` (the full
  interface) + the contract suite cases (read, hash-free reads, credential reads, write
  round-trips, hashes-never-leak). The Fake + Supabase adapters now fail to compile (missing
  methods) → RED across both adapter test files.
- GREEN: implement the Fake adapter fully (fast, no DB) → fake unit suite green. Implement the
  Supabase adapter → integration suite green (requires `db:up`).

**Hashes-never-leak assertions (in the contract suite, Slice 3):**
- After `listAllUsers()` / `listUsersByRoles()` / `findUserById()` / `findUserByName()`:
  `expect(Object.keys(user)).not.toContain('passwordHash')` and `...not.toContain('pinHash')`
  AND a type-level guarantee (`UserSummary` simply has no such field → it's a compile error to
  read one). Add an explicit runtime assertion too (defends the adapter mapping, not just the type).
- `findCredentialByName()` / `listCredentialsByRoles()` → the ONLY cases that assert a hash
  field is present.

**Slice 4 — UsersService.**
- RED: `tests/unit/services/UsersService.test.ts` against the Fake (+ a Fake PasswordHasher,
  or reuse the bcrypt adapter — prefer a fake hasher for determinism). Cover every method with
  the round-trip pattern, the architecture-pin grep, and the hash-handling (service hashes,
  adapter receives only the hash).
- GREEN: implement `lib/services/UsersService.ts` + export from `lib/services/index.ts`.

**Slice 5 — wiring.**
- GREEN: `lib/wiring/users.ts` (service-role singleton + F-RLS-04b seam comment). No new test
  needed beyond `tsc` (it's a parts list); optionally a smoke that `usersService` constructs.

**Slice 6 — F-TD-05 ESLint cross-service pin.**
- RED: `tests/unit/lint/no-cross-service-imports.test.ts` asserting the ban fires → fails
  (rule not in config yet).
- GREEN: add the pattern to `.eslintrc.json` Site B. Run `npm run lint` on the whole tree to
  confirm NO existing service trips it (OrdersService imports only ports — safe; UsersService
  imports only ports + the PasswordHasher port via... — **verify UsersService imports the
  PasswordHasher PORT type, not a service**; the `passwordHasher` singleton comes from wiring,
  not a service import). Suite green.

🗣 In plain English: we go in mechanical-first order — move the type, delete the dead param,
adopt the test pattern — then build the new socket, prove both plugs pass the same exam
(including the "passwords can never leak" exam), then the service, the wiring, and finally the
guard rail. Every step ends with a fully green, shippable tree.

---

## 8 · Migration confirmation

**PR1 needs NO migration.** It changes no schema: every column it reads/writes
(`id, name, role, secondary_roles, active, email, last_login_at, created_at, pin_hash,
password_hash`) already exists (proven by the 7 routes selecting/inserting them today).
PR1 only re-organises *application* code. If an implementer believes a migration is needed,
STOP and escalate — it signals a scope error.
🗣 In plain English: we're not touching the database's shape at all, just the code that talks
to it. No 14-digit-timestamp migration file, nothing to apply to prod.

---

## 9 · Acceptance criteria (Gate checks)

- [ ] `npx tsc --noEmit` → **0 errors** (main is at 0; any regression is a hard blocker).
- [ ] `npm run lint` → **0 errors/warnings** (main is at 0/0; hard blocker on regression).
- [ ] Unit suite green, including: the expanded contract suite (Fake), `UsersService.test.ts`,
      `Role.test.ts`, the F-TD-05 pin, the retrofitted `OrdersService.test.ts`.
- [ ] Integration suite green (`npm run db:up` then `npm run test:integration -- adapters/supabase`):
      the expanded contract suite passes against the real Supabase adapter.
- [ ] **Hashes-never-leak proven by a test**: a contract-suite case asserts no hash field on
      every `UserSummary`-returning method, and that only `findCredential*`/`listCredentials*`
      expose a hash. (Type-level + runtime.)
- [ ] **Rip-out test PASS**: swapping the DB vendor for Users = 1 new adapter folder +
      edit `lib/wiring/users.ts` only. No route, service, or domain file changes. (§10.)
- [ ] **Zero behaviour change**: no file under `app/**` is edited except the single ARCH-FU-03
      one-line arg drop in `app/api/orders/[id]/route.ts` (which is Orders, not Users, and is a
      no-op — `callerUserId` was already unused inside the service). All 7 user routes byte-identical.
- [ ] No new `package.json` entry.

---

## 10 · Hexagonal self-check (Gate 2 verdict inputs)

- **Port used/added:** `UsersRepository` (expanded, app-owned, `lib/ports/`). Also consumes the
  existing `PasswordHasher` port for the create/update hashing step.
- **Adapter(s):** `lib/adapters/supabase/UsersRepository.ts` (real, service-role) and
  `lib/adapters/fake/UsersRepository.ts` (in-memory twin). Both satisfy the same contract.
- **New dependencies:** **NONE.** No `package.json` change. (bcrypt + Supabase already present
  and already wrapped behind their adapter folders.) → nothing to justify, nothing to wrap.
- **Vendor leak check:** Supabase row shapes touched only inside the adapter; the port/service/
  domain see only domain types (`UserSummary`, `UserCredential`, …). Hashes quarantined in
  `UserCredential`, returned by two narrowly-named methods only.
- **Rip-out test:** replace Supabase for Users → write a new `lib/adapters/<vendor>/UsersRepository.ts`
  + change the singleton wiring in `lib/wiring/users.ts`. Routes (PR2/PR3), `UsersService`, and
  `lib/domain` are untouched. **PASS.**

🗣 In plain English: the socket is owned by the core, both plugs fit it, no new vendor was
brought in, and ripping out the database would cost exactly one new plug plus one wiring edit —
which is the rule. This passes the architecture gate.

---

## 11 · Risk Assessment (mandatory)

Severity scale: **must-fix** (blocks Gate 2 until resolved) · high · medium · low.

### R1 — Speculative-generality accusation on the expanded port — **medium, not must-fix**
The port doc currently forbids expansion as speculative. Mitigation: §4.3 maps every method to
a committed PR2/PR3 consumer; the implementer must rewrite the port header to record F-13's
arrival and cite those consumers. If a method ends up with NO consumer, delete it.
🗣 In plain English: we're allowed to grow the interface only because every new method has a
named page that will use it within this same unit — and we write that justification down.

### R2 — Hash leak through a read method — **must-fix (security)**
A careless adapter projection (`select('*')` or adding `pin_hash` to a list projection) would
leak credential fingerprints into `UserSummary`-returning methods. Mitigation: the two-types
design (§4.2) makes it a compile error to put a hash on `UserSummary`; PLUS a runtime
contract-suite assertion on every read method; PLUS the credential methods are the only ones
projecting the hash columns. **Must-fix:** the hashes-never-leak test must exist and pass
before merge.
🗣 In plain English: passwords leaking out of a "list staff" call is the worst thing that could
go wrong here, so we make it impossible two ways — the type system won't let a password ride on
the safe shape, and a test proves it at runtime.

### R3 — `Role` move breaks a hidden importer (compile/runtime) — **high, mitigated**
Missing an importer would be a `tsc` failure (caught pre-merge) or, worse, a runtime-mirror
(`isKnownRole`) drift. Mitigation: §5 enumerates all 5 importers from grep; Caller.ts re-exports
so `@/lib/observability` consumers stay green; §11 grep re-run after editing must show zero
stray imports; `Role.test.ts` pins the union/mirror parity. `tsc` 0 is a gate.
🗣 In plain English: moving a widely-used type risks missing a spot — but the compiler will
scream if we do, and we keep the old import path working as a forwarder so nothing breaks even
if a caller wasn't updated.

### R4 — Cross-service ESLint pattern over-matches (false positives) — **medium, mitigated**
The `@/lib/services/*` glob could flag a service importing its own barrel or a legitimate
`@/lib/ports` import. Mitigation: the pin test (step 24) includes allowed-cases; run
`npm run lint` on the whole tree in Slice 6 and confirm no existing file trips it; tune the glob
to match only named sibling service modules. Lint 0 is a gate.
🗣 In plain English: a guard rail that's too aggressive would block legal code; we test both
"should fire" and "should NOT fire" cases and run it against the whole repo before trusting it.

### R5 — Behaviour drift via the create/update column logic — **medium, mitigated**
The route today picks `pin_hash` vs `password_hash` by role and clears the other on update
(`[id]/route.ts:50-54`). Moving that into the adapter risks a subtle mismatch (e.g. not clearing
the stale field). Mitigation: contract-suite round-trip cases for create AND update-with-re-hash
must assert the correct column is set and the other is null; since no route is re-pointed in PR1,
even a bug here cannot reach production until PR2 (defence in depth). **Not must-fix for PR1**
(unused code), but the test must exist now so PR2 is safe.
🗣 In plain English: the fiddly "which password column, and clear the old one" logic moves house;
we pin its exact behaviour with tests now, and since nothing live calls it yet, a slip can't hurt
real users before PR2 wires it in.

### R6 — Integration test write-case pollution of shared seed rows — **low, mitigated**
Create/update/delete contract cases write/delete rows. If they touch the shared `setupTestUsers`
rows, other suites break. Mitigation: write cases create their own `ANVIL-TEST-`-prefixed rows
with a `cleanup` that deletes only those; never delete the shared per-role users.
🗣 In plain English: the new database tests must clean up after themselves and not disturb the
shared test fixtures other tests rely on.

### Categories with no material risk in PR1
- **Concurrency/races:** PR1 adds no concurrent path (service-role, no route wired, no new
  transaction). The login last_login_at fire-and-forget pattern isn't introduced until PR3.
- **Data migration:** none (§8).
- **Launch blockers:** none beyond the gates in §9; PR1 is additive and behaviour-neutral.

### Must-fix summary (Gate 2 blockers)
- **R2 (hash leak)** — the hashes-never-leak test must exist and pass before merge.
  Everything else is mitigated-but-not-blocking.

---

## 12 · What PR2 / PR3 will do (context only — DO NOT build here)
- **PR2:** re-point routes 2,3,4,5,6,7 through `usersService` (pure re-pointing; the port is
  already complete, so no port churn).
- **PR3:** re-point route 1 (login) alone — the highest-risk surface, isolated.
- **F-RLS-04b (separate unit):** add the per-caller authenticated factory to `lib/wiring/users.ts`
  (the seam comment PR1 leaves) + RLS policies.
