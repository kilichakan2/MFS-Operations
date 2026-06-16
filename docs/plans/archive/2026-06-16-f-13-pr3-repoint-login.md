# F-13 PR3 — Re-point `/api/auth/login` through `usersService`

**Date:** 2026-06-16
**Unit:** F-13 PR3 (final PR of the F-13 Users-domain trilogy)
**Status:** plan locked for implementation
**Scope:** ONE route file. No migration. No new dependency. No API contract change.

🗣 In plain English: this is the last and riskiest step of moving the staff/login
code behind the app's own "Users" interface. PR1 built the interface, PR2 moved the
six low-risk routes, and this PR moves the one that matters most — the actual login
door — and nothing else. We are changing wiring, not behaviour: the login page must
behave byte-for-byte identically afterwards.

---

## Mini-map — the Users hexagon after this PR

```
DOMAIN (core: UsersService, UserCredential)
  └─ UsersRepository (port) → [Supabase]  (adapter)
                            → [Fake]       (adapter, tests)
  composed by: lib/wiring/users.ts  →  usersService (service-role singleton)
  login route: app/api/auth/login/route.ts  →  imports usersService (NOT @supabase/*)
🗣 after this PR the login door talks to the Users socket, not Supabase directly — swap the DB = one adapter + one wiring line
```

---

## 1 · Goal

Re-point `app/api/auth/login/route.ts` so its two database touches — reading the
credential hash by username, and stamping `last_login_at` on success — go through the
pre-wired `usersService` singleton from `lib/wiring/users.ts` instead of a direct
`@supabase/*` query. Drop the route's direct `@supabase/supabase-js` (service-role
client) import. Behaviour, status codes, response shape, cookies, error paths, and the
rate limiter all stay byte-identical.

🗣 In plain English: today the login route reaches straight into the database. After
this PR it asks the Users service to do the two database jobs for it. The user-facing
behaviour does not change at all — this is a plumbing swap that makes the database
replaceable in one place.

---

## 2 · Domain terms

- **`usersService`** — the pre-wired Users service singleton (`lib/wiring/users.ts`),
  service-role, RLS-bypassing — same security posture login uses today.
  🗣 The one ready-to-use Users helper the route calls; it already has the database
  vendor plugged in behind it.
- **`findCredentialByName(name)`** — service method returning a `UserCredential | null`.
  🗣 "Give me this person's login record including their scrambled password." Returns
  nothing (null) if no such name.
- **`recordLogin(id, when: Date)`** — service method that stamps `last_login_at`.
  🗣 "Mark that this user just logged in, at this time."
- **`UserCredential`** — the only domain shape carrying a hash. Fields (camelCase):
  `id, name, role, active, secondaryRoles, passwordHash, pinHash`.
  🗣 The login record. Note the field names are camelCase (`pinHash`, `passwordHash`,
  `secondaryRoles`) — the database's snake_case (`pin_hash`, `secondary_roles`) is
  already translated away inside the adapter.

---

## 3 · Compliance / architecture flags

- **CLAUDE.md "build it like Lego" / ADR-0002:** this PR IMPROVES compliance — it
  removes a direct vendor import from a route (UI/API layer must not import
  `lib/adapters/**` or vendor SDKs directly). No new breach.
- **F-04 / F-27 lint guard** (`@supabase/*` outside `lib/adapters/<vendor>/`): after this
  PR the login route no longer imports `@supabase/supabase-js` indirectly via
  `@/lib/adapters/supabase/client`, so it stops being a (tolerated, route-layer) consumer
  of the service-role client. Net: one fewer adapter import in `app/**`.
- **ADR conflicts:** NONE. ADR-0002 (`docs/adr/0002-hexagonal-shape-and-naming.md`) is
  exactly what this PR satisfies further.

🗣 In plain English: this change moves the codebase toward the rule the project already
committed to (no vendor code in the UI/API layer). It breaks no rule and resolves a
small one.

---

## 4 · Exact files to change

| File | Change |
|---|---|
| `app/api/auth/login/route.ts` | Replace the direct Supabase read + `last_login_at` update with `usersService.findCredentialByName` + `usersService.recordLogin`. Drop the `supabaseService` import. |
| `tests/integration/auth-login.test.ts` (NEW) | Add an integration suite that asserts byte-identical behaviour across all login paths against the local Supabase + booted server. |

No other files. No `lib/**` edits (the port, service, adapters, and wiring already exist
from PR1, confirmed against source). No migration. No `package.json` change.

🗣 In plain English: one real code file changes, plus one new test file. Everything the
route now leans on was already built and shipped in PR1.

---

## 5 · Step-by-step implementation

### Step 1 — Swap the imports (top of `route.ts`)

**Before (lines 12–18):**
```ts
import { NextRequest, NextResponse } from 'next/server'
import { supabaseService }           from '@/lib/adapters/supabase/client'
import { sessionTokens }             from '@/lib/wiring/session'
import { passwordHasher }            from '@/lib/wiring/password'

// Service role key — bypasses RLS. Never expose to the client.
const supabase = supabaseService
```

**After:**
```ts
import { NextRequest, NextResponse } from 'next/server'
import { usersService }              from '@/lib/wiring/users'
import { sessionTokens }             from '@/lib/wiring/session'
import { passwordHasher }            from '@/lib/wiring/password'
```

Delete the `supabaseService` import AND the `const supabase = supabaseService` line.
Update the file header comment block (lines 1–10): it currently says "Uses
the service-role key env var — bypasses RLS" describing a direct client. Reword to:
"Reads the credential and stamps last-login through the Users service
(`@/lib/wiring/users`), which composes the service-role adapter (RLS bypassed) — this
route never imports a vendor SDK." Keep the PasswordHasher note as-is.

🗣 In plain English: stop importing the raw database client; import the Users service
instead. The service still uses the same powerful service-role key under the hood, so
login keeps reading any user's record exactly as before.

### Step 2 — Replace the credential read (lines 113–148)

**Before (the direct query + error branches):**
```ts
const { data: user, error: dbError } = await supabase
  .from('users')
  .select('id, name, role, secondary_roles, pin_hash, password_hash, active')
  .ilike('name', name)
  .single()

if (dbError) {
  if (dbError.code === 'PGRST116') {
    recordFailure(name)
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }
  console.error('[login] DB error:', dbError.code, dbError.message)
  return NextResponse.json({ error: 'Database error' }, { status: 500 })
}

if (!user) {
  return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
}

if (!user.active) {
  return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
}

const hashToCheck: string | null =
  user.role === 'admin' ? user.password_hash : user.pin_hash
```

**After:**
```ts
// Fetch the credential by name through the Users service (service-role —
// RLS bypassed inside the adapter). The service returns null on miss and
// throws ServiceError on a real DB failure (caught by the top-level catch
// → 500), so the two-branch error shape below collapses cleanly:
//   - null            → unknown user → 401 (was the PGRST116 branch)
//   - ServiceError    → DB failure   → 500 (was the dbError 500 branch,
//                        now via the outer try/catch as "Server error")
let user
try {
  user = await usersService.findCredentialByName(name)
} catch (e) {
  console.error('[login] DB error:', e)
  return NextResponse.json({ error: 'Database error' }, { status: 500 })
}

if (!user) {
  recordFailure(name)
  return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
}

if (!user.active) {
  return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
}

// camelCase domain fields (the adapter already mapped pin_hash/password_hash).
const hashToCheck: string | null =
  user.role === 'admin' ? user.passwordHash : user.pinHash
```

**Behaviour-preservation notes the implementer MUST honour:**
- **Field renames:** `user.password_hash → user.passwordHash`, `user.pin_hash →
  user.pinHash`, `user.secondary_roles → user.secondaryRoles` (used later, see Step 4).
  These are the adapter's camelCase domain fields — the snake_case columns never reach
  the route now.
- **`recordFailure(name)` on the miss path:** TODAY the unknown-user path runs through the
  `PGRST116` branch, which DOES call `recordFailure(name)`. The old `if (!user)` branch
  at line 130 was effectively dead (with `.single()` a miss is always a PGRST116 error,
  never `data: null`). With `findCredentialByName` a miss returns `null`, so the
  `if (!user)` branch now becomes the live unknown-user path — therefore it MUST call
  `recordFailure(name)` to preserve the rate-limiter behaviour. **Do not drop this call.**
- **The explicit `try/catch`** wrapping `findCredentialByName` reproduces the old
  `dbError → 500 "Database error"` path. Without it, a DB failure would fall to the
  outer catch and return `"Server error"` (still 500, but a different body). Keep the
  inner try/catch so the 500 body stays `{ error: 'Database error' }`.

🗣 In plain English: the service returns the record or `null`. We must remember to count
a failed attempt when the name is unknown (the old code did this through a quirk of how
`.single()` reports "no rows"), and we keep a small wrapper so a genuine database outage
still returns the same "Database error" message it does today.

### Step 3 — Replace the `last_login_at` stamp (lines 165–172)

**Before:**
```ts
supabase
  .from('users')
  .update({ last_login_at: new Date().toISOString() })
  .eq('id', user.id)
  .then(({ error: e }) => {
    if (e) console.error('[login] last_login_at update failed:', e.message)
  })
```

**After:**
```ts
// Fire-and-forget: stamp last-login through the service. recordLogin throws
// ServiceError on DB failure; catch and log so a stamp failure never blocks
// or fails the login (identical to today's behaviour).
void usersService.recordLogin(user.id, new Date()).catch((e) => {
  console.error('[login] last_login_at update failed:', e)
})
```

**Behaviour-preservation notes:**
- Must stay **fire-and-forget** — login does NOT await it (today's `.then()` is not
  awaited). A failure logs and is swallowed; login still succeeds.
- `recordLogin(id, when: Date)` takes a `Date` object (confirmed in
  `lib/ports/UsersRepository.ts:163`), and the adapter calls `.toISOString()` internally
  (`lib/adapters/supabase/UsersRepository.ts:284`). So pass `new Date()`, NOT
  `new Date().toISOString()` — the conversion moved into the adapter.

🗣 In plain English: stamping the login time stays "set it and forget it" — login never
waits for it and never fails because of it. One small detail: we now hand the service a
date object and it formats it; we don't format it ourselves anymore.

### Step 4 — Casing guard (R-MF-2) on the response (lines 174–205)

**Finding — the login response does NOT need snake_case mapping. Surface is small.**

The route already builds its OWN response contract with hand-picked keys; it does not
spread a user row. The only user-derived values it emits are:

| Response key | Source | Casing |
|---|---|---|
| `name` (in both the role-picker branch and the success branch) | `user.name` | unchanged — `name` is `name` in both shapes |
| `role` | `activeRole` (= `chosenRole ?? user.role`) | unchanged |
| `roles` (role-picker branch) | `[user.role, ...secondaryRoles]` | unchanged |
| `secondaryRoles` (success branch) | always `[]` (hardcoded `sessionSecondaryRoles`) | n/a — not read from the user |

The one internal read that changes spelling is `user.secondary_roles` at line 175 →
must become `user.secondaryRoles`. This is consumed internally to build the role picker
(`const secondaryRoles = user.secondaryRoles ?? []`) and the cast to `string[]` can be
dropped since the domain type is already `readonly Role[]`. It never appears in the
response under a snake_case key.

**Conclusion:** the login response is `success`, `role`, `secondaryRoles` (always `[]`),
`name`, `redirect`, plus the picker branch's `requiresRolePicker`, `roles`, `name`. None
of these is a snake_case user field surfaced to the POS UI. **No camelCase→snake_case
mapping is required.** The only edit is the internal `secondary_roles → secondaryRoles`
read.

🗣 In plain English: the casing trap that bit PR2 does not apply here. The login route
hand-builds its reply with its own field names; it never dumps a raw user record at the
UI. We just fix one internal field name we read inside the function. Nothing the front
end sees changes.

### Step 5 — Verify the cookie/session block is untouched

Lines 193–258 (cookie setting, session token issue) read only `user.id`, `user.name`,
`activeRole`, `sessionSecondaryRoles` — all already correct. **No edits.** Confirm
`user.id` and `user.name` still resolve (they do — both exist on `UserCredential`).

🗣 In plain English: the part that sets the login cookies is left exactly as-is; it only
uses the user's id and name, which the new record still has.

---

## 6 · TDD test plan

**Posture:** behaviour must be byte-identical, so tests are characterization tests —
write/confirm them GREEN against the current route first, then refactor the route and
keep them green. There is currently **no dedicated login route unit/integration test**
(grep found none in `tests/integration/` or `tests/unit/` beyond the rate-limiter unit);
login is only exercised indirectly through the E2E `_auth.ts` UI flow. This PR adds the
missing direct coverage.

### 6.1 New integration suite — `tests/integration/auth-login.test.ts`

Mirror the established pattern in `tests/integration/admin-users.test.ts` and
`tests/integration/kds.test.ts` (boot dev server on 3100 wired to local Supabase via
`.env.test.local`; seed via the existing helpers). Assert against `POST /api/auth/login`:

1. **Success (PIN user) + last_login stamp.** Seeded active non-admin user, correct PIN
   → 200, body `{ success: true, role, secondaryRoles: [], name, redirect }`, and the
   `mfs_session` + `mfs_role` + `mfs_user_id` + `mfs_name` cookies set; `mfs_secondary_roles`
   cleared (maxAge 0). Re-read the user and assert `last_login_at` advanced.
2. **Success (admin user, password path).** Seeded active admin, correct password →
   200, `role: 'admin'`, redirect `/dashboard/admin`.
3. **Wrong password/PIN.** Correct name, wrong credential → 401 `{ error: 'Invalid
   credentials' }`. Assert NO session cookie set.
4. **Unknown user.** Name that does not exist → 401 `{ error: 'Invalid credentials' }`.
   (This is the critical path that changed from PGRST116 to `null`.) Verify a repeated
   unknown-name attempt still counts toward the rate limiter (i.e. `recordFailure` ran).
5. **Inactive account.** Seeded `active: false` user, correct credential → 403
   `{ error: 'Account is inactive' }`.
6. **Missing fields.** Empty/absent `name` or `credential` → 400 `{ error: 'Name and
   credential are required' }`.
7. **Malformed JSON body.** Non-JSON payload → 400 `{ error: 'Invalid JSON body' }`.
8. **Multi-role picker.** User with `secondaryRoles` non-empty, no `chosenRole` → 200
   `{ requiresRolePicker: true, roles: [...], name }`, NO cookie set.
9. **Invalid role selection.** `chosenRole` not in the user's roles → 400 `{ error:
   'Invalid role selection' }`.
10. **No-hash account.** User whose role-appropriate hash column is null → 403
    `{ error: 'Account not configured — ask an admin to reset your credentials' }`.

### 6.2 Optional unit coverage (if time permits, not blocking)

A thin unit test of the route handler with a `createFakeUsersRepository`-backed
`usersService` (the Fake is at `lib/adapters/fake/UsersRepository.ts`, exporting
`createFakeUsersRepository`) and a fake `passwordHasher`. This would let cases 3/4/5/8/9/10
run without a DB. Not required if the integration suite covers them.

### 6.3 Tests that MUST stay green

- `tests/unit/rateLimiter.test.ts` — rate-limiter logic is untouched; must still pass.
- The E2E `_auth.ts`-driven specs (`01-order-place`, `02-picking-list-print`,
  `03-kds-butcher-flow`, `redirects`, etc.) — these perform the REAL UI login. They are
  the strongest byte-identical proof. Run `npm run test:e2e:ui` (Gate-4 will also run the
  `@critical` preview smoke).
- `tests/integration/admin-users.test.ts`, `tests/integration/kds.test.ts` — PR2 routes,
  must stay green (no change, but they share `usersService`).
- `tests/unit/services/UsersService.test.ts`, `tests/unit/adapters/fake/UsersRepository.test.ts`,
  `tests/integration/adapters/**` — Users contract tests; unchanged, must stay green.

🗣 In plain English: we write a focused test file that fires every kind of login (right,
wrong, unknown, locked-out, inactive, multi-role, broken account) and checks the exact
reply and cookies. Then we keep the existing real-browser login tests green as the
ultimate proof nothing changed for users.

---

## 7 · Hexagonal check (Gate 2 verdict — computed)

- **Port used:** `lib/ports/UsersRepository.ts` (`findCredentialByName`, `recordLogin`) —
  already exists, no change.
- **Adapter:** `lib/adapters/supabase/UsersRepository.ts` (`supabaseUsersRepository`,
  service-role) wired in `lib/wiring/users.ts` — already exists, no change.
- **New dependencies:** NONE. No `package.json` entry added. Confirmed.
- **Vendor leak:** none. The route stops importing `@/lib/adapters/supabase/client`
  (which imports `@supabase/supabase-js`). All vendor types stay behind the adapter.
- **Rip-out test:** BEFORE — login imported the Supabase service client directly, so
  swapping the DB touched the login route too. AFTER — login depends only on
  `usersService` (the wiring singleton); swapping the DB = one new adapter folder + the
  one wiring line in `lib/wiring/users.ts`, login untouched.

**RIP-OUT TEST: PASS (and strictly improved by this PR).**

🗣 In plain English: this PR removes the last direct database wire from the login door.
After it, replacing the database means writing one new adapter and changing one wiring
line — login does not change. That is exactly the project's acceptance test, and this PR
makes it true for the highest-risk route.

---

## 8 · Risk Assessment

### 8.1 Concurrency / race conditions
- **In-memory rate limiter is unchanged** (per-instance `Map`). Not introduced or altered
  here — pre-existing known limitation noted in the route's own comments. **No material
  new risk.** Severity: none. Must-fix: no.
- **Fire-and-forget `recordLogin`** stays non-awaited, same as today. No new ordering
  hazard. Severity: none.

### 8.2 Security
- **Service-role posture preserved.** `usersService` (from `lib/wiring/users.ts`) composes
  the service-role singleton — identical RLS-bypass behaviour to today's direct
  `supabaseService`. Login MUST read other users' credentials, so service-role is correct
  and intended here (the wiring header documents this). Severity: none. Must-fix: no.
- **Hash quarantine intact.** `findCredentialByName` returns `UserCredential` (the only
  hash-bearing shape); the hash is compared via the `PasswordHasher` port and never
  logged or returned. Severity: none.
- **Non-enumeration preserved.** Unknown user and wrong password both return the same
  401 `Invalid credentials`. The refactor keeps both paths identical. Severity: none.

### 8.3 Data migration
- **None.** No schema change, no migration file. Severity: none. Must-fix: no.

### 8.4 Business-logic flaws (the real watch-points)
- **R1 — `recordFailure` on the unknown-user path (MEDIUM, mitigated).** The old code
  counted a failed attempt for an unknown user via the `PGRST116` branch; the dead
  `if (!user)` branch did not. After the swap, a miss is `null` and flows through
  `if (!user)`, which MUST now call `recordFailure(name)`. If the implementer forgets it,
  unknown-name attempts stop counting toward lockout — a real (if minor) auth-hardening
  regression. **Mitigation:** Step 2 mandates the `recordFailure(name)` call on the
  `!user` branch, and integration test case 4 asserts it. Severity: MEDIUM if missed,
  zero if the plan is followed. Must-fix: NO (the plan prevents it; the test guards it).
- **R2 — 500 body drift (LOW, mitigated).** A genuine DB failure today returns
  `{ error: 'Database error' }` (status 500) from the `dbError` branch. The service throws
  `ServiceError` instead; without the inner try/catch it would fall to the outer catch and
  return `{ error: 'Server error' }` (still 500, different body). **Mitigation:** Step 2
  wraps `findCredentialByName` in a try/catch returning the same `Database error` body.
  Severity: LOW (status unchanged, body byte-match preserved). Must-fix: no.
- **R3 — `recordLogin` argument type (LOW, mitigated).** `recordLogin` takes a `Date`, not
  an ISO string (the adapter formats). Passing a string would type-error (TypeScript
  catches it) or, if cast, the adapter would call `.toISOString()` on a string and break.
  **Mitigation:** Step 3 passes `new Date()`. `tsc` + integration case 1 (stamp advances)
  guard it. Severity: LOW. Must-fix: no.

### 8.5 Launch blockers
- **None.** Single-route refactor, fully reversible, no migration, no env change, no new
  dependency. Gate-4 preview smoke (`@critical` specs, which include a real login) is the
  go/no-go and will exercise this path on a live preview.

### 8.6 Latent quirks found — DEFER to BACKLOG, do NOT fix here
- **L1 — analogous to F-TD-20.** I checked for a PATCH-500-vs-404-style latent quirk. The
  closest is the now-confirmed-dead `if (!user)` branch (line 130–132): with `.single()`
  it was unreachable. This PR makes it the live miss path (correct), so there is no
  lingering dead branch left behind — nothing to defer there.
- **L2 — `Account is inactive` returns 403 before credential verification only by column
  order.** Today (and after) an inactive user with a correct credential gets 403, but an
  inactive user with a WRONG credential ALSO gets 403 (the active check precedes the
  compare) — i.e. inactivity is disclosed regardless of credential correctness, a mild
  user-enumeration signal. **Pre-existing; byte-identical preserved by this PR; do NOT
  change.** Recommend a BACKLOG entry (e.g. `F-TD-21`: "login discloses account-inactive
  status before credential check — decide whether to fold into the generic 401"). Severity:
  LOW. Must-fix: no.

### Risk headline
**No must-fix risks. Gate 2 is clear to proceed.** The two watch-points (R1 unknown-user
`recordFailure`, R2 500 body) are fully handled by the step instructions and are pinned by
integration tests. One latent enumeration quirk (L2) is flagged for BACKLOG, not fixed.

🗣 In plain English: nothing here blocks the build. The two things that could quietly
break (counting failed logins for unknown names, and the exact wording of a database-error
reply) are spelled out in the steps and locked down by tests. One small pre-existing
"login tells you if an account is disabled" behaviour is left untouched and parked on the
backlog.

---

## 9 · Branch name suggestion

Following the repo convention (`feat/f-rls-04a-...`, `f-13-pr1-...`, `f-13-pr2-...`):

```
f-13-pr3-repoint-login
```

Commit subject convention (matches `7d482c6`, `96c8a33`):
`refactor(auth): re-point /auth/login through UsersService (F-13 PR3)`

🗣 In plain English: name the branch `f-13-pr3-repoint-login`, matching how the last two
parts of this work were named.

---

## 10 · Rollback note

Single-file behavioural change, fully reversible:
1. **Pre-merge:** revert the route to the direct `supabaseService` query (restore the
   import + the two DB blocks). The PR1/PR2 infrastructure is untouched, so reverting the
   route alone restores prior behaviour exactly.
2. **Post-merge:** `git revert <merge-sha>` — no migration to unwind, no env to reset, no
   data change. The `usersService` singleton stays in place (still used by the 6 PR2
   routes), so reverting login does not strand anything.
3. **Parachute:** the service-role wiring in `lib/wiring/users.ts` is the same posture as
   the old direct client, so there is no auth-mode flip to reverse.

🗣 In plain English: if anything looks wrong, this is a one-file undo with nothing else to
clean up — no database changes, no settings to flip. The safest possible kind of revert.

---

## 11 · Acceptance criteria

- [ ] `app/api/auth/login/route.ts` imports `usersService` from `@/lib/wiring/users` and
      NO longer imports `@/lib/adapters/supabase/client` or any `@supabase/*` symbol.
- [ ] Credential read goes through `usersService.findCredentialByName(name)`; last-login
      stamp through `usersService.recordLogin(user.id, new Date())`.
- [ ] Unknown-user path returns 401 `Invalid credentials` AND calls `recordFailure(name)`.
- [ ] DB-failure path returns 500 `{ error: 'Database error' }` (inner try/catch).
- [ ] All response bodies, status codes, and cookies are byte-identical to pre-PR.
- [ ] New `tests/integration/auth-login.test.ts` covers all 10 paths and is green.
- [ ] `tests/unit/rateLimiter.test.ts`, the E2E `@critical` login specs, and the PR2
      Users integration suites stay green.
- [ ] `tsc` + ESLint clean (the `no-adapter-imports` lint test stays green).
- [ ] No `package.json` change; no migration.
- [ ] Gate-4 preview smoke (real login) passes on the PR's preview deployment.
```
