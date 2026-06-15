# F-13 PR2 — Re-point the 6 non-login routes through UsersService (precision execution plan)

**Date:** 2026-06-15
**Unit:** F-13 "Users + Auth" (3-PR unit) · **This plan: PR2 only**
**Author:** forge-planner (FORGE Phase 2 — Order)
**Status:** plan locked for implementation. PR1 SHIPPED (commit `7d482c6`). PR3 (login) and F-RLS-04b (RLS) explicitly OUT of scope.

---

## Visual mini-map

```
DOMAIN (core logic)
  ├─ UsersRepository (port) → [Supabase] (adapter, service-role) + [Fake] (adapter)
  └─ PasswordHasher  (port) → [bcrypt]   (adapter — used only inside kds-pin compare; not re-touched)
🗣 PR2 plugs 6 routes into the front desk (UsersService) that PR1 already built — no new socket, no new plug, no code in the core changes. Pure re-wiring of who-calls-whom.
```

🗣 In plain English: PR1 built the staff-operations front desk and proved it
works, but no live page called it yet. PR2 simply changes 6 web endpoints so
that, instead of reaching into the database themselves, they ask the front desk.
Nothing the staff or customers see should change by a single character — same
JSON, same status codes. The whole point is that this is mechanical re-pointing
with zero new design.

---

## 1 · Goal (one sentence)

Replace the direct `supabaseService.from('users')...` calls inside 6 route files
with calls to the already-built `usersService` singleton, keeping every HTTP
response **byte-identical** (same JSON keys, same casing, same status codes).

🗣 In plain English: take out the database wires that currently run straight from
each page into Supabase, and route them through the front desk instead — without
changing what comes back out the other end.

**The single hardest constraint in this whole PR (read this twice):** the routes
today return the database's **snake_case** column names in their JSON
(`secondary_roles`, `last_login_at`, `created_at`). The service/domain returns
**camelCase** (`secondaryRoles`, `lastLoginAt`, `createdAt`). The UI pages that
consume these responses read the **snake_case** keys (proven in §3). Therefore
**each route must map the camelCase domain object the service returns back into
the exact snake_case JSON shape it returns today.** A naive `return
NextResponse.json(domainObject)` would silently break the admin and login/HACCP
screens. This mapping-back is the core of every read route's diff.

🗣 In plain English: the front desk speaks "tidy English" (`secondaryRoles`); the
web pages were built to hear "database-ese" (`secondary_roles`). So each endpoint
must translate the front desk's answer back into database-ese before sending it to
the page — otherwise the pages get fields they don't recognise and show blanks.

---

## 2 · Domain terms (plain-English glossary for this plan)

- **Route file** = a file under `app/api/.../route.ts` — the web endpoint a page calls.
  🗣 The reception window the browser talks to. We're changing who *it* phones, not its address.
- **`usersService`** = the singleton exported from `@/lib/wiring/users`.
  🗣 The ready-to-use front desk. Routes import this one object and call its methods.
- **Domain object (camelCase)** = `UserSummary` / `UserCredential` / `AuthType` from `@/lib/domain`.
  🗣 The tidy in-house version of a user record, with clean field names and no database spellings.
- **Response shape (snake_case)** = the JSON the route emits today, matching the DB columns.
  🗣 What the web page expects to receive. It must not change one character in PR2.
- **Re-point** = swap a route's direct-DB call for a `usersService` call + a shape-back map.
  🗣 Re-routing the phone line through reception, then translating reception's answer back to the format the caller expects.
- **`listTeam`** = the service method for role-filtered lists (delegates to the port's `listUsersByRoles`).
  🗣 NOTE: the conductor's brief said "call `listUsersByRoles`" — but the *service* exposes that operation under the name `listTeam`. Routes call `usersService.listTeam(...)`. Same behaviour; the port method underneath is `listUsersByRoles`. (See §10 — this is a naming alignment, not a gap.)

---

## 3 · The byte-identical proof (per-route response & consumer audit)

This section is the evidence base for "no behaviour change". For each route it
records (a) today's response keys, (b) the consumer that reads them, (c) the
camelCase→snake_case map the re-pointed route must apply.

### Route 2 — `app/api/auth/type/route.ts` (POST)
- **Today:** selects `role, active` by `ilike` name; returns `{ authType: 'pin'|'password' }`.
- **Consumer:** the login flow reads `authType` (a flat string field — no casing issue).
- **Map-back:** trivial — `authTypeForName(name)` returns the `AuthType` string directly; route wraps it `{ authType }`. **No field renaming needed.**
- **Error/edge behaviour to preserve EXACTLY:**
  - empty/blank name → `400 { error: 'Name required' }` (route keeps this guard; service is NOT called).
  - DB miss / DB error / any thrown error → `200 { authType: 'pin' }` (non-enumeration). `authTypeForName` already returns `'pin'` for a missing/inactive user, BUT it **throws ServiceError on a DB failure** (the adapter throws). Today's route swallows ALL errors to `{ authType: 'pin' }` via its outer `catch {}`. **The re-pointed route MUST keep the outer `try/catch` returning `{ authType: 'pin' }`** so a DB failure still yields `pin`, byte-identical. Do NOT remove the catch.
  🗣 In plain English: this endpoint deliberately never admits when something went wrong — it always says "use a PIN". The service is happy to throw on a database error, so the route must keep its safety net that turns any error into the same bland "pin" answer.

### Route 3 — `app/api/auth/team/route.ts` (GET)
- **Today:** selects `id, name, role, secondary_roles`, primary role in `['warehouse','office','sales','driver']`, `active=true`, order by name asc; returns the **array of rows verbatim** (`[{ id, name, role, secondary_roles }]`).
- **Consumer:** `app/login/page.tsx:14` — `interface TeamMember { id; name; role; secondary_roles?: string[] }`. **Reads `secondary_roles` (snake_case).**
- **Map-back (REQUIRED):** `listTeam(['warehouse','office','sales','driver'], { activeOnly: true, orderBy: ['name'] })` returns `UserSummary[]` with 8 camelCase fields. The route must project each to **exactly `{ id, name, role, secondary_roles }`** (drop `active`, `email`, `lastLoginAt`, `createdAt`; rename `secondaryRoles`→`secondary_roles`). Returning the full `UserSummary` would (a) leak extra fields the response never had and (b) use the wrong casing → broken UI.
  ```
  data.map(u => ({ id: u.id, name: u.name, role: u.role, secondary_roles: u.secondaryRoles }))
  ```
- **Error behaviour:** today a DB error → `500 { error: error.message }`. `listTeam` throws `ServiceError` on DB failure (message `"User list failed"`). The route must keep its `try/catch` and on a thrown error return `500 { error: <message> }`. **Caveat (acceptable drift, document it):** the JSON `error` string changes from PostgREST's raw message to `"User list failed"`. This is an *error-path* message only (never seen on the happy path; the smoke test asserts only `200` + `Array.isArray`). The UI shows a generic "Could not load team" toast and ignores the body. **Decision: acceptable** — the contract that matters (200 + array shape) is preserved; the 500 body text is not part of any consumer contract. Note it in the PR description.
  🗣 In plain English: when the database is healthy (always, in practice) the response is identical. The only difference is the wording of the error message shown when the database is down — and no screen displays that wording, so it's invisible.

### Route 5 — `app/api/auth/haccp-team/route.ts` (GET)
- **Today:** selects `id, name, role, secondary_roles`, role in `['butcher','warehouse']`, `active=true`, order by **role asc then name asc**; returns rows verbatim.
- **Consumer:** `app/haccp/page.tsx:22` — `interface StaffMember { id; name; role; secondary_roles?: string[] }`. **Reads `secondary_roles`.**
- **Map-back (REQUIRED):** `listTeam(['butcher','warehouse'], { activeOnly: true, orderBy: ['role','name'] })` → project to `{ id, name, role, secondary_roles }` exactly as route 3. **Ordering must be `['role','name']`** (the adapter applies keys in sequence — verified `listUsersByRoles` honours multi-key order, `UsersRepository.ts:146-150`).
- **Error behaviour:** same as route 3 (`500 { error }`, message becomes `"User list failed"` on DB error — acceptable, document).

### Route 4 — `app/api/auth/kds-pin/route.ts` (POST)
- **Today:** selects `id, name, role, pin_hash, active`, role in `['butcher','warehouse']`, `active=true`; loops, `passwordHasher.compare(pin, user.pin_hash)`; on match returns `{ id, name, role }`; no match → `401 { error: 'No butcher matches that PIN' }`.
- **Consumer:** `app/kds/page.tsx:653` — reads `{ id, name, role }`. No casing issue (no `secondary_roles` returned).
- **Map-back:** `listCredentialsByRoles(['butcher','warehouse'], { activeOnly: true })` returns `UserCredential[]` carrying `pinHash` (camelCase). The PIN-compare LOOP stays in the route (it is business logic per the route's own comment, and PR1 deliberately left it route-side — the service has no "verify pin" method). The route iterates the credentials, `if (!user.pinHash) continue`, `await passwordHasher.compare(pin, user.pinHash)`, on match `return { id: user.id, name: user.name, role: user.role }`.
  🗣 In plain English: the "try the typed PIN against each active butcher" loop stays in the route exactly as today — only the way it FETCHES the candidate list changes (front desk instead of direct DB). `pin_hash` becomes `pinHash` inside the loop, but that's internal — the response is still just `{ id, name, role }`.
- **`passwordHasher` import stays** — kds-pin still imports `passwordHasher` from `@/lib/wiring/password` for the compare. That is allowed (a wiring import, not an adapter import). Only the `supabaseService` import is removed.
- **Guards to preserve EXACTLY:** PIN format `/^\d{3,8}$/` → `400`; DB error → `500 { error: 'Server error' }` (today the route maps a DB error to a literal `'Server error'`, NOT the raw message). `listCredentialsByRoles` throws `ServiceError` on DB failure — the route's `try/catch` catches it and must return `500 { error: 'Server error' }` to stay byte-identical. No match → `401 { error: 'No butcher matches that PIN' }`.

### Route 6 — `app/api/admin/users/route.ts` (GET list + POST create)
- **GET today:** selects `id, name, role, secondary_roles, active, last_login_at, created_at, email`, order by `created_at` asc; returns rows verbatim (8 snake_case fields).
- **GET consumer:** `app/admin/page.tsx:13` — `interface AppUser { id; name; role; secondary_roles; active; last_login_at; created_at; email }`. **Reads ALL of `secondary_roles`, `last_login_at`, `created_at` (snake_case).**
- **GET map-back (REQUIRED, the biggest one):** `listAllUsers()` → `UserSummary[]`; project each to the **exact 8-field snake_case AppUser shape**:
  ```
  data.map(u => ({
    id: u.id, name: u.name, role: u.role, secondary_roles: u.secondaryRoles,
    active: u.active, last_login_at: u.lastLoginAt, created_at: u.createdAt, email: u.email,
  }))
  ```
- **POST today:** admin-role header guard; trims `name/role/credential/email`; filters `secondary_roles` to drop `'admin'`; validates PIN `/^\d{4}$/` (non-admin) or password length ≥6 (admin); hashes; inserts with role-selected column; returns the created row (8 snake_case fields) at `201`.
- **POST map-back:** call `createUser({ name, role, credential, secondaryRoles, email })`. **The service hashes + selects the column + inserts**; it returns a `UserSummary` (camelCase) — project it back to the **same 8-field snake_case shape** as GET, return at `201`.
- **POST guards & validation that STAY IN THE ROUTE (must-keep, behaviour-critical):**
  - `x-mfs-user-role !== 'admin'` → `403 { error: 'Admin only' }` (auth posture is route-side, per OrdersService pattern).
  - body parse / trim / required-field check → `400 { error: 'name, role, and credential are required' }`.
  - PIN regex `/^\d{4}$/` for non-admin → `400 { error: 'PIN must be exactly 4 numeric digits (e.g. 1234)' }`.
  - admin password length <6 → `400 { error: 'Admin password must be at least 6 characters' }`.
  - **`secondary_roles` filter** (drop non-strings AND `'admin'`) STAYS in the route — `createUser`/the service do NOT do this filtering; the route builds `secondaryRoles` from the cleaned array and passes it in.
  - DB error → today `500 { error: error.message }`. `createUser` throws `ServiceError` (`"User create failed"`) → route `catch` returns `500 { error: String(err) }` (the existing outer catch). **Caveat:** the 500 body text changes from PostgREST's message to the ServiceError string. Acceptable (error path only; admin UI shows `data.error ?? 'Failed'`). Document.
  🗣 In plain English: who's allowed to create a user, what a valid PIN looks like, and stripping a sneaky "admin" out of the secondary-role list — all of that stays in the endpoint. Only the "hash it and write it to the database" part moves to the front desk. The created user is then translated back to database-ese before returning.

### Route 7 — `app/api/admin/users/[id]/route.ts` (PATCH update + DELETE)
- **PATCH today:** admin guard; builds `updates` from `active`, `email` (trim→null), `secondary_roles` (filter `'admin'`), and `credential`+`role` (hash, set role-column, clear the other); `update().eq('id').select(8 cols).single()`; returns updated row (8 snake_case) at `200`.
- **PATCH consumer:** `app/admin/page.tsx` toggleActive/reset/secondary-role flows read back the updated user; some merge `data as AppUser` (snake_case) into state. **Map-back to the 8-field snake_case shape REQUIRED.**
- **PATCH map-back:** translate the route body into `UpdateUserInput`:
  - `active` → `patch.active` (only when present)
  - `email` → trim→`|| null`, pass as `patch.email` (only when `body.email !== undefined`)
  - `secondary_roles` → filter `'admin'`, pass as `patch.secondaryRoles` (only when present) — **filtering stays route-side**
  - `credential` + `role` (both present) → `patch.credential = { plaintext: body.credential, role: body.role }` — **the service hashes + the adapter clears the other column (R5 logic now lives in the adapter, proven by the PR1 contract suite).**
  - Call `updateUser(id, patch)`; it returns `UserSummary | null`. **`null` → today's behaviour?** See the critical note below.
- **CRITICAL — the `.single()` vs `.maybeSingle()` not-found behaviour change (R-MF-1, see §8):**
  Today route 7 uses `.update(...).select(...).single()`. With PostgREST, `.single()` on an UPDATE that matches **zero rows** returns an **error** (code `PGRST116`), so the route falls into `if (error)` → **`500 { error: error.message }`**. The PR1 adapter `updateUser` uses `.maybeSingle()` and returns **`null`** on no-row (it does NOT throw). So the re-pointed route, on a non-existent id, would get `null` — and must DECIDE what to emit. **Two options:**
    - (A) Preserve today's literal behaviour: `null` → `500`. This is bug-for-bug compatible but emits a 500 for a not-found, which is wrong-but-unchanged.
    - (B) Emit `404 { error: 'User not found' }` on `null` — semantically correct, but a STATUS CODE CHANGE vs today (500→404).
  **Decision for PR2 (behaviour-neutral mandate): choose (A) — `null` → `500 { error: 'User not found' }`** to keep the status code identical to today. Returning a different *body* string at the same 500 status is acceptable (error path). Flag (B) as a follow-up cleanup in BACKLOG (a 500-for-missing-row is a latent bug, but FIXING it is a behaviour change that belongs in its own unit, not this re-pointing PR). **This is the one place an implementer could accidentally change a status code — it is called out as must-verify R-MF-1.**
  🗣 In plain English: today, editing a user that doesn't exist returns a server-error (500) — technically a bug, but it's the current behaviour. The new front desk returns a polite "not found" instead. To keep PR2 a pure no-behaviour-change re-point, the route must turn that "not found" back into the same 500 the old code produced, and we log a ticket to fix the underlying bug properly later. Do NOT "improve" it to a 404 in this PR.
- **DELETE today:** admin guard; `delete().eq('id', id)`; DB error → `500 { error: error.message }`; success → `200 { success: true }`.
- **DELETE map-back:** `await deleteUser(id)` (returns void, idempotent). On success return `200 { success: true }`. `deleteUser` throws `ServiceError` on DB failure → route `catch` returns `500 { error: String(err) }`. Byte-identical happy path; error body string changes (acceptable, document).
- **DELETE guards:** admin header guard stays route-side.

---

## 4 · Hexagonal compliance audit (the whole point of PR2)

After re-pointing, **none of the 6 files may import `@supabase/*` or
`@/lib/adapters/**`.** Verification per file:

| # | File | Remove import | Keep import | Add import |
|---|------|---------------|-------------|------------|
| 2 | `auth/type/route.ts` | `supabaseService` from `@/lib/adapters/supabase/client` | — | `usersService` from `@/lib/wiring/users` |
| 3 | `auth/team/route.ts` | `supabaseService` | — | `usersService` |
| 4 | `auth/kds-pin/route.ts` | `supabaseService` | **`passwordHasher` from `@/lib/wiring/password` STAYS** (compare loop) | `usersService` |
| 5 | `auth/haccp-team/route.ts` | `supabaseService` | — | `usersService` |
| 6 | `admin/users/route.ts` | `supabaseService`; **remove `passwordHasher` import** (hashing moves into the service) | — | `usersService` |
| 7 | `admin/users/[id]/route.ts` | `supabaseService`; **remove `passwordHasher` import** (hashing moves into the service) | — | `usersService` |

🗣 In plain English: after this PR, four of the files no longer mention the
database vendor at all. kds-pin still uses the bcrypt-compare helper (allowed — it
comes from wiring, not the adapter folder). The two admin files drop bcrypt too,
because the front desk now does the hashing.

- **`const supabase = supabaseService` line** — delete it in all 6 files.
- **No NON-user direct-Supabase usage** in any of these 6 files (all touch only the `users` table) — confirmed by reading each file. Nothing else to leave behind.
- **`@/lib/wiring/users` is the import source** (the service-role singleton) — same security posture as today. NOT `usersServiceForCaller` (that's F-RLS-04b, doesn't exist yet).
- **Lint guards that will now PASS** where they were N/A before: routes are under `app/**`, which the `no-restricted-imports` config forbids from importing `@/lib/adapters/**`. **Important:** check whether `app/**` is currently in scope of that lint rule — if these 6 files were pre-existing breaches (importing `@/lib/adapters/supabase/client` directly), they are exactly the debt PR2 pays down. After PR2 they import only `@/lib/wiring/*`, which is allowed.
  🗣 In plain English: the architecture rule says web pages must never phone the database vendor directly. These 6 were breaking that rule (known debt). PR2 fixes the breach — they now go through the front desk like the rules require.

---

## 5 · Service-surface adequacy check (does PR1 cover every need? — the scope-breach gate)

For each route, the exact service method + whether the existing surface suffices:

| # | Route need | Service method (exists?) | Sufficient? |
|---|-----------|--------------------------|-------------|
| 2 | role+active by name → 'pin'/'password' | `authTypeForName(name)` ✓ | **YES** — returns the decision directly; non-enumeration baked in |
| 3 | list 4 roles, active, by name | `listTeam(roles, { activeOnly, orderBy:['name'] })` ✓ | **YES** |
| 4 | hashes for butcher+warehouse active | `listCredentialsByRoles(roles, { activeOnly })` ✓ | **YES** — returns `UserCredential[]` with `pinHash`; compare loop stays route-side |
| 5 | list butcher+warehouse active, role→name | `listTeam(roles, { activeOnly, orderBy:['role','name'] })` ✓ | **YES** — multi-key order supported |
| 6 GET | list all, created_at asc | `listAllUsers()` ✓ | **YES** |
| 6 POST | create + hash + role-column | `createUser({ name, role, credential, secondaryRoles, email })` ✓ | **YES** — service hashes, adapter writes column |
| 7 PATCH | update + optional re-hash + clear other | `updateUser(id, UpdateUserInput)` ✓ | **YES** — credential `{ plaintext, role }`; adapter clears the other column |
| 7 DELETE | delete by id | `deleteUser(id)` ✓ | **YES** — idempotent |

**VERDICT: every route's need is met by the EXISTING service surface. NO scope
breach. ZERO new port methods, ZERO new service methods, ZERO port-signature
changes required.** The only naming note: the brief said `listUsersByRoles`; the
service exposes it as `listTeam` (delegating to the port's `listUsersByRoles`).
Routes call `listTeam`. This is the documented service name, not a gap.

🗣 In plain English: PR1 built exactly the right set of front-desk methods. Every
one of the 6 routes asks for something the front desk already offers. Nothing is
missing — confirming PR1 did its job and PR2 stays pure re-pointing.

---

## 6 · Files to change (exact list — application code only)

**Modify (6 route files — the ONLY application-code changes):**
1. `app/api/auth/type/route.ts`
2. `app/api/auth/team/route.ts`
3. `app/api/auth/kds-pin/route.ts`
4. `app/api/auth/haccp-team/route.ts`
5. `app/api/admin/users/route.ts`
6. `app/api/admin/users/[id]/route.ts`

**Do NOT touch:**
- `app/api/auth/login/route.ts` (route 1) — **PR3, explicitly out of scope.**
- `lib/ports/**`, `lib/services/**`, `lib/adapters/**`, `lib/domain/**`, `lib/wiring/**` — all complete from PR1; **any edit here is a scope breach, STOP and escalate.**
- Any UI page (`app/admin/page.tsx`, `app/login/page.tsx`, `app/haccp/page.tsx`, `app/kds/page.tsx`) — they keep reading snake_case; the routes preserve it. **No UI edit.**
- Any migration — **none (§7).**

**Tests (see §9 for which to add/update):** no test edit is strictly required for
the routes to ship green (existing integration assertions check field subsets that
survive). Recommended: add route-level integration coverage in PR2 or defer to the
ANVIL pass — decided in §9.

---

## 7 · Migration confirmation

**PR2 needs NO migration.** It changes zero schema. It reads/writes the same
`users` columns through the same service-role client — only the *call path*
changes (route → service → port → adapter instead of route → adapter). No
14-digit-timestamp file, nothing to apply to prod. If an implementer thinks a
migration is needed, STOP — that is a scope error, escalate.

🗣 In plain English: this is a pure code-wiring change. The database's shape and
data are completely untouched.

---

## 8 · Risk Assessment (mandatory)

Severity scale: **must-fix** (blocks Gate 2 until resolved) · high · medium · low.

### R-MF-1 — `updateUser` null-on-missing vs today's `.single()` 500 — **must-fix (behaviour drift / status code)**
PR1's `updateUser` returns `null` on a non-existent id; today's route emits `500`
(because `.single()` errors on zero rows). If the implementer naively maps `null →
404`, the status code changes (500→404) — a behaviour change forbidden in a
re-pointing PR. **Mitigation:** the route must map `null → 500 { error: 'User not
found' }` (decision (A), §3 route 7) to keep the status identical. **Must-fix:** an
integration/E2E case (or a manual check noted in the PR) confirming `PATCH
/api/admin/users/<nonexistent-uuid>` still returns `500` (not 404, not 200).
Log the "500-for-missing-row is a latent bug, fix as 404 later" follow-up in
`docs/plans/BACKLOG.md` as a new `F-TD-` item.
🗣 In plain English: editing a user that doesn't exist currently throws a 500. We
must keep that exact 500 (even though it's arguably wrong) so PR2 changes nothing
observable, and file a ticket to fix it properly in a later, dedicated change.

### R-MF-2 — Response casing/shape drift breaks the UI — **must-fix (behaviour drift)**
If any read route returns the camelCase `UserSummary` directly instead of mapping
back to snake_case, the admin list (`last_login_at`, `created_at`,
`secondary_roles`), login grid (`secondary_roles`), and HACCP door
(`secondary_roles`) render blanks/undefined. **Mitigation:** §3 specifies the
exact map-back per route; the acceptance criteria (§10) require a field-by-field
byte-identical check. **Must-fix:** an E2E/integration assertion (or documented
manual check) that `GET /api/admin/users` returns objects with snake_case keys
`secondary_roles`, `last_login_at`, `created_at` (NOT camelCase), and that
`/auth/team` + `/auth/haccp-team` rows carry `secondary_roles`.
🗣 In plain English: the single most likely way to break this PR is to forget the
translation back to database-ese. We pin it with a test that fails loudly if a
camelCase field ever appears in these responses.

### R-MF-3 — kds-pin hash-read path regression — **must-fix (security/auth-critical)**
kds-pin reads `pinHash` to compare a typed PIN. Risks: (a) reading the wrong field
(the service returns `UserCredential.pinHash`, NOT `pin_hash`); (b) dropping the
`if (!user.pinHash) continue` guard (a null hash must be skipped, not compared);
(c) accidentally widening the role filter or dropping `activeOnly`. **Mitigation:**
§3 route 4 specifies the loop verbatim against `pinHash`; keep `activeOnly: true`
and roles `['butcher','warehouse']`. **Must-fix:** the existing integration cases
(`tests/integration/kds.test.ts:147-172` — valid PIN→200 with correct id/role,
invalid→401, malformed→400) must pass UNCHANGED against the re-pointed route. These
already exist and are the regression net.
🗣 In plain English: the KDS PIN door is security-sensitive. We must read the
password fingerprint from the right field, skip accounts with no PIN set, and only
consider active butchers/warehouse staff — exactly as today. The existing PIN
tests are the proof.

### R-H-1 — create/update column-by-role + clear-other logic now in the adapter — **high, mitigated by PR1**
PR1 moved the "admin→password_hash else pin_hash, clear the other on update" logic
out of the route into the service (`hashColumnForRole`) + adapter (clear-other in
`updateUser`). PR2 relies on this being correct. **Mitigation:** PR1's contract
suite already pins this (the round-trip create/update-with-rehash cases asserting
the right column set + other column nulled — PR1 plan R5). PR2 adds NO new logic
here; it just calls `createUser`/`updateUser`. **Verify** the PR1 contract test for
the clear-other case exists and is green before relying on it; if it does not
exist, that is a PR1 gap — escalate (do not add it in PR2's route code).
🗣 In plain English: the fiddly "which password column, and wipe the old one" rule
moved into the front desk and database adapter in PR1, and PR1 tested it. PR2 just
trusts that — but we double-check the PR1 test is actually there.

### R-M-1 — 500-error body text changes on the error path — **medium, accepted**
On a DB failure, several routes today return the raw PostgREST `error.message`;
the re-pointed versions return the `ServiceError` string (`"User list failed"`,
etc.) or `String(err)`. **Mitigation:** this is error-path-only (never on the happy
path); no consumer contract depends on the 500 body string (UIs show generic
toasts; smokes assert status + happy-path shape). **Accepted as documented drift**
— call it out in the PR description. The *status codes* are all preserved.
🗣 In plain English: when the database is down, the wording of the error changes
slightly — but no screen ever shows that wording, and the database is never down in
practice, so it's invisible. We just write it down for honesty.

### R-M-2 — `authTypeForName` throws on DB failure but today's route swallows it — **medium, mitigated**
Today `/auth/type` returns `{ authType: 'pin' }` for literally any failure (outer
`catch {}`). `authTypeForName` throws `ServiceError` on a DB error. **Mitigation:**
keep the route's outer `try/catch` returning `{ authType: 'pin' }` (§3 route 2). A
thrown ServiceError is caught → `{ authType: 'pin' }`, byte-identical.
🗣 In plain English: the "always say pin, never admit failure" safety net must stay
wrapped around the new front-desk call.

### R-L-1 — `secondary_roles` admin-filter location — **low, mitigated**
The "drop `'admin'` from secondary_roles" filter is route-side today and STAYS
route-side (the service does NOT filter). If an implementer assumes the service
filters, an `'admin'` could slip into secondaryRoles. **Mitigation:** §3 routes 6
& 7 explicitly state the filter stays in the route, applied before building the
service input.
🗣 In plain English: the little "you can't secretly grant yourself admin via a
secondary role" cleanup stays in the endpoint; don't assume the front desk does it.

### Categories with no material risk in PR2
- **Concurrency/races:** no new concurrent path; service-role singleton, same as today. recordLogin (the fire-and-forget path) is route 1 (PR3) — not touched here.
- **Data migration:** none (§7).
- **Security (beyond R-MF-3):** no posture change — same service-role client, same admin-header guards stay route-side. RLS is F-RLS-04b. Hash quarantine (UserSummary has no hash field) is enforced at compile time from PR1; PR2 cannot leak a hash through routes 2/3/5/6/7 because the service hands them `UserSummary` (no hash). Only route 4 touches `UserCredential`, and it returns only `{ id, name, role }`.
- **Launch blockers:** none beyond the gates in §10.

### Must-fix summary (Gate 2 blockers)
- **R-MF-1** — PATCH non-existent id must stay `500` (not 404); verify + BACKLOG the latent bug.
- **R-MF-2** — every read route must return snake_case (no camelCase leak); pin with a test/check.
- **R-MF-3** — kds-pin hash-compare loop must read `pinHash`, keep the null-skip + activeOnly + role filter; existing kds tests must pass unchanged.
All three are mitigated by following §3 exactly; they are "must-verify before merge", not unresolved design holes.

---

## 9 · Tests — what exists, what to add, what the smoke asserts

**Existing tests that already cover these routes (regression net — must stay green):**
- `tests/integration/kds.test.ts:147-172` — kds-pin valid(200)/invalid(401)/malformed(400). **Direct regression net for R-MF-3. Must pass unchanged.**
- `tests/e2e/api/smoke.spec.ts:47-52` — `GET /api/auth/team` → 200 + `Array.isArray`. Survives the re-point (array shape preserved).
- `tests/e2e/redirects.spec.ts:42` — `/screen5/users` redirect; unrelated to the route bodies, unaffected.

**Recommended additions (decision: add the lightweight casing/status pins in PR2 so the must-fix risks are mechanically enforced, NOT deferred):**
- An integration assertion that `GET /api/admin/users` returns objects whose keys include `secondary_roles`, `last_login_at`, `created_at` and do NOT include `secondaryRoles`/`lastLoginAt`/`createdAt` (pins R-MF-2 for the heaviest-mapped route).
- An integration assertion that `PATCH /api/admin/users/<random-uuid>` (admin header) returns `500` (pins R-MF-1).
- An integration assertion that `GET /api/auth/haccp-team` rows carry `secondary_roles` and are ordered role-then-name (pins R-MF-2 + ordering).
- These belong in a new/extended integration spec (e.g. `tests/integration/admin-users.test.ts`). If the conductor prefers a thinner PR2, defer these to the ANVIL layer — but R-MF-1/2/3 then become manual must-checks recorded in the PR. **Planner recommendation: include them; they are cheap and directly retire the must-fix risks.**

**Preview smoke (Gate 4) should assert:** `GET /api/auth/team` and `GET
/api/auth/haccp-team` return 200 + arrays with `secondary_roles`; `POST
/api/auth/type` returns `{ authType }`. Do NOT smoke admin POST/PATCH/DELETE
against prod (writes). kds-pin smoke would need a known PIN — keep it in
integration, not preview.

🗣 In plain English: there are already tests that guard the KDS PIN door and the
team list — they must keep passing untouched. We add three small, cheap checks that
nail down the three must-fix risks (right casing, right status on a missing user,
right KDS behaviour) so a mistake can't slip through silently.

---

## 10 · Acceptance criteria (Gate checks)

- [ ] `npx tsc --noEmit` → **0 errors** (regression = hard blocker).
- [ ] `npm run lint` → **0 errors/warnings**; specifically, **no `@supabase/*` or `@/lib/adapters/**` import remains in any of the 6 route files** (grep-verifiable).
- [ ] All 6 routes import `usersService` from `@/lib/wiring/users`; kds-pin additionally keeps `passwordHasher` from `@/lib/wiring/password`; admin routes drop `passwordHasher`.
- [ ] **Response byte-identical** per §3: every read route returns the exact snake_case keys it returns today (`secondary_roles`, `last_login_at`, `created_at` where applicable); no camelCase leak (R-MF-2).
- [ ] **Status codes identical** per §3: 400/401/403/500 guards preserved; PATCH non-existent id → **500** (R-MF-1).
- [ ] `tests/integration/kds.test.ts` kds-pin cases pass UNCHANGED (R-MF-3).
- [ ] `GET /api/auth/team` smoke (`smoke.spec.ts`) still 200 + array.
- [ ] **Route 1 (`app/api/auth/login/route.ts`) is byte-for-byte untouched** (git diff shows it unchanged).
- [ ] No file under `lib/**` is edited (port/service/adapter/domain/wiring all untouched).
- [ ] **No new `package.json` entry.**
- [ ] No migration file added.
- [ ] BACKLOG updated with the R-MF-1 latent-bug follow-up (`F-TD-` item: "PATCH /admin/users/[id] returns 500 not 404 for missing id").

---

## 11 · TDD slice order (one route per slice; each independently compilable + green)

Each slice: re-point one route, run `npx tsc --noEmit` + `npm run lint` + the
relevant test, commit. Order = simplest map-back first → most complex last, so
confidence builds.

- **Slice 1 — `auth/type` (route 2).** Simplest: flat `{ authType }`, no field rename. Keep the outer catch (R-M-2). RED: none (no new test needed); GREEN: re-point, tsc+lint green.
- **Slice 2 — `auth/team` (route 3).** First map-back (`secondary_roles` rename, drop extra fields). GREEN: re-point + project to `{ id, name, role, secondary_roles }`; `smoke.spec` team test green.
- **Slice 3 — `auth/haccp-team` (route 5).** Same map-back as team + `orderBy:['role','name']`. Optionally add the haccp casing+ordering integration pin (R-MF-2).
- **Slice 4 — `auth/kds-pin` (route 4).** Read `pinHash`, keep the compare loop + null-skip + activeOnly. RED-first if writing a new case; GREEN: `kds.test.ts` cases pass unchanged (R-MF-3).
- **Slice 5 — `admin/users` GET+POST (route 6).** Heaviest map-back (8-field shape, both GET and POST-201). Add the GET casing pin (R-MF-2). Keep all 4 validation guards + admin guard + secondary_roles filter route-side.
- **Slice 6 — `admin/users/[id]` PATCH+DELETE (route 7).** Most subtle: `null→500` (R-MF-1), credential `{ plaintext, role }`, secondary_roles filter route-side, admin guard. Add the PATCH-missing-id 500 pin. Update BACKLOG.

After all slices: full `npm run lint` (confirm the adapter-import ban now passes
for these files), full `tsc`, full unit + integration suite, then the §10 checklist.

🗣 In plain English: we re-point one endpoint at a time, easiest first, proving the
tree stays green and shippable after each. The trickiest two (admin create/update)
come last, when the pattern is well-rehearsed.

---

## 12 · Hexagonal self-check (Gate 2 verdict inputs)

- **Port used/added:** `UsersRepository` (existing, app-owned, `lib/ports/`) — consumed indirectly via `UsersService`. **No port added, no port method added, no port signature changed.** Also reuses the existing `PasswordHasher` port (via the `passwordHasher` wiring singleton) in kds-pin's compare loop.
- **Adapter:** `lib/adapters/supabase/UsersRepository.ts` (service-role), wired in `lib/wiring/users.ts`. **No adapter edited.** Routes no longer touch the raw `supabaseService` adapter client directly.
- **New dependencies:** **NONE.** No `package.json` change. → nothing to justify, nothing to wrap.
- **Vendor leak check:** PR2 REMOVES vendor leaks — 6 routes stop importing `@supabase/supabase-js`-backed `supabaseService` and stop returning whatever PostgREST hands them. They now receive domain types and emit a deliberately-mapped JSON shape. Vendor types no longer cross into the route layer.
- **Rip-out test:** replacing Supabase for Users → write a new `lib/adapters/<vendor>/UsersRepository.ts` + edit `lib/wiring/users.ts`. After PR2 the 6 routes go through `usersService`, so they need ZERO changes on a vendor swap (before PR2 they would each have needed rewriting). **PASS — and PR2 strictly IMPROVES the rip-out cost from "6 routes + adapter + wiring" to "adapter + wiring".**

🗣 In plain English: PR2 adds no new vendor, defines no new socket, and actually
makes the database more swappable — after it, the 6 endpoints don't care who the
database vendor is. Ripping out Supabase would touch one adapter and one wiring
line, none of these routes. Passes the architecture gate cleanly.

---

## 13 · ADR conflicts

- **ADR-0002 (hexagonal shape & naming):** PR2 ENFORCES it (removes the app-layer→adapter breaches). **No conflict — compliance improvement.**
- **ADR-0004 (RLS vs service-role):** PR2 keeps Users on service-role (RLS deferred to F-RLS-04b) — consistent with the staged-cutover model. **No conflict.**
- **ADR-0007 (app-minted token / GUC bridge):** not exercised (no authenticated client). **No conflict.**
- No ADR forbids anything PR2 does. **No conflicts found.**

---

## 14 · What PR3 / F-RLS-04b will do (context only — DO NOT build here)
- **PR3:** re-point route 1 (`auth/login`) alone via `findCredentialByName` + `recordLogin` — the highest-risk surface, isolated.
- **F-RLS-04b:** add the per-caller authenticated factory to `lib/wiring/users.ts` (the seam comment already present) + RLS policies.
