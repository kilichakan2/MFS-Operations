# F-10 — `PasswordHasher` port: wrap `bcryptjs` behind an owned socket

**Date:** 2026-06-14
**Unit:** F-10 (FORGE)
**Spec status:** Gate 1 locked — scope = FULL CLOSE
**Baseline (main @ 6ce160e):** tsc 0 errors · lint 0 · unit 1536 · integration 122
**Type:** Behaviour-preserving refactor (no auth behaviour change, no re-hashing)

---

## Mini-map

```
        ┌─ DOMAIN (auth logic in 4 routes) ─┐
        └──────────────┬────────────────────┘
                 PasswordHasher           ← NEW port (socket the app owns)
                       │
                  [bcrypt]                 ← NEW adapter (the only bcryptjs plug)
   🗣 today 4 routes each hold a raw bcrypt plug; after F-10 there is one
      socket and one plug — swap the hasher = 1 new adapter + 1 wiring line
```

---

## Goal

Today four API routes import `bcryptjs` directly and each repeats the same
boilerplate: `String()` casting of inputs and a `try/catch` around the bcrypt
call. F-10 moves all of that into one owned wrapper so the routes call **our**
socket (`PasswordHasher`) instead of the vendor.

**🗣 In plain English:** Right now four different doors each have their own
hand-wired lock from the same supplier, and each door re-implements the same
"don't jam the key" safety tape. We're replacing them with one lock design we
own; the four doors just ask "is this the right key?" and never touch the
supplier again. Nothing about which keys open which doors changes — same lock,
same strength, existing keys still work.

**Hard constraints (behaviour-preserving):**
- Same algorithm (bcrypt), same cost factor **12** for hashing.
- Existing stored hashes (in `users.password_hash` / `users.pin_hash`) must
  still verify — no credential is re-hashed, no migration.
- No change to login / kds-pin / user-admin HTTP behaviour (same status codes,
  same JSON shapes, same rate-limiting, same logging outcomes).

---

## Domain terms (plain English)

- **Port (`PasswordHasher`)** — the interface the app owns, written in business
  language ("hash a credential", "does this credential match this stored
  hash?"). 🗣 The shape of socket our auth logic insists on; the hashing vendor
  has to fit it, not the other way round.
- **Adapter (`lib/adapters/bcrypt/`)** — the one concrete implementation that
  imports `bcryptjs`. 🗣 The actual plug for the bcrypt vendor; the only file in
  the whole app allowed to touch the bcrypt library.
- **Wiring / composition root (`lib/wiring/`)** — the only business-layer place
  allowed to import an adapter; it bolts the adapter to the port and exports a
  ready-to-use singleton. 🗣 The parts list that screws the plug into the socket
  once, so the rest of the app just imports a finished, working hasher.
- **TOTAL `compare`** — the compare method never throws; on any bad input
  (garbage stored hash) it returns `false`. 🗣 The "does this key match?"
  question can never explode in your hand — a damaged lock just answers "no",
  it never crashes the door.
- **Cost factor 12** — bcrypt's work setting; higher = slower = harder to brute
  force. 🗣 How many times the scrambler folds the dough; 12 is what every
  existing credential was made with, so we keep it exactly.

---

## Compliance / sensitivity flags

- **Auth-critical code.** This touches the login path and credential hashing.
  Per MEMORY (`feedback_forge_anvil_for_production_work`), this gets the full
  FORGE loop + ANVIL — not frame-light.
- **No PII / data migration.** No DB schema change, no row rewrites. Stored
  hashes are read and compared exactly as today.
- **Secrets:** none introduced. bcrypt needs no env var (unlike SessionTokens'
  `SESSION_SECRET`), so the wiring file is even simpler — no lazy `getSecret`.

---

## ADR conflicts

**None.** This change is the direct fulfilment of:
- **ADR-0002** (`docs/adr/0002-hexagonal-shape-and-naming.md`) — ports in
  `lib/ports/`, adapters in `lib/adapters/<vendor>/`, wiring in `lib/wiring/`,
  dependencies point inward. F-10 follows it exactly (mirrors the T1
  `SessionTokens` precedent: `lib/ports/SessionTokens.ts` +
  `lib/adapters/web-crypto/` + `lib/wiring/session.ts`).
- **ADR-0003** (Supabase FREEZE rule) — F-10 is the same *family* of work
  (a vendor moved behind a lint-enforced wrapper) but a different vendor;
  it does not alter ADR-0003.

🗣 In plain English: no decision log entry says "do it differently" — F-10 is
the house style applied to one more vendor.

---

## Exact file list

### New files (4)
| # | Path | Purpose |
|---|------|---------|
| N1 | `lib/ports/PasswordHasher.ts` | The port (pure TS, no imports of vendor/framework). |
| N2 | `lib/adapters/bcrypt/PasswordHasher.ts` | The adapter — the ONLY file importing `bcryptjs`. |
| N3 | `lib/adapters/bcrypt/index.ts` | Barrel re-export of the factory (matches `web-crypto/index.ts`). |
| N4 | `lib/wiring/password.ts` | Composition root — exports the `passwordHasher` singleton. |

### New test files (1)
| # | Path | Purpose |
|---|------|---------|
| N5 | `tests/unit/adapters/bcrypt/PasswordHasher.test.ts` | Adapter bench tests (round-trip, total compare, casting). |

### Modified files (8)
| # | Path | Change |
|---|------|--------|
| M1 | `app/api/auth/login/route.ts` | Swap `bcrypt.compare` → `passwordHasher.compare`; drop try/catch + `String()`. |
| M2 | `app/api/auth/kds-pin/route.ts` | Swap `bcrypt.compare` → `passwordHasher.compare` inside the loop (loop stays); drop per-call try/catch. |
| M3 | `app/api/admin/users/route.ts` | Swap `bcrypt.hash(cred, 12)` → `passwordHasher.hash(cred)`; drop try/catch + `String()`. |
| M4 | `app/api/admin/users/[id]/route.ts` | Swap `bcrypt.hash(body.credential, 12)` → `passwordHasher.hash(...)`. |
| M5 | `lib/ports/index.ts` | Add `export type { PasswordHasher } from "./PasswordHasher";`. |
| M6 | `.eslintrc.json` | Add `bcryptjs` to the forbidden `paths` (base + services override) and exempt `lib/adapters/bcrypt/**`. |
| M7 | `tests/unit/lint/no-supabase-sdk.test.ts` | Extend the hermetic mirror to assert `bcryptjs` is forbidden in `app/**` and allowed in `lib/adapters/bcrypt/**`. |
| M8 | `tests/unit/lint/no-adapter-imports.test.ts` | The real-config pin: add a `bcryptjs` forbidden/allowed pair + message-verbatim case so the shipped `.eslintrc.json` edit can't drift. |

**Touched-file count: 13** (4 new src + 1 new test + 8 modified).

> Note: `tests/integration/kds.test.ts` and `tests/integration/_globalSetup.ts`
> import `bcryptjs` directly **and stay as-is** — they live under `tests/**`,
> which the lint override exempts, and they deliberately plant hashes at cost
> **10** (see "Behaviour-preserving proof" below). Do **not** route those test
> helpers through the new adapter; they are a fixture-planting concern, not app
> code, and their cost-10 hashes are load-bearing evidence.

---

## Interface signatures (spell-out for the implementer)

### N1 — `lib/ports/PasswordHasher.ts`
Pure TypeScript. No `import` of any vendor or framework (only `import type`
from `@/lib/domain` if ever needed — not needed here; primitives only).

```ts
export interface PasswordHasher {
  /**
   * Scramble a new credential (password OR PIN) for storage.
   * Caller passes the plaintext; gets back the storable hash.
   * @throws only on a genuine internal hashing failure (surfaces a 500).
   */
  hash(plain: string): Promise<string>;

  /**
   * TOTAL — never throws. Returns true iff `plain` matches the stored `hash`.
   * A malformed/garbage stored hash yields `false` (logged internally),
   * never an exception. Cost-factor agnostic: verifies hashes made at any
   * cost factor (existing stored credentials keep working).
   */
  compare(plain: string, hash: string): Promise<boolean>;
}
```
Doc comment MUST state: *"Despite the name `PasswordHasher`, this also hashes
PINs — the name is kept to match the roadmap. Both passwords and PINs flow
through `hash`/`compare` identically."*

🗣 In plain English: the contract is two questions — "scramble this" and "does
this match?" — written so the next person never has to know it's bcrypt
underneath.

### N2 — `lib/adapters/bcrypt/PasswordHasher.ts`
Factory pattern, matching `createWebCryptoSessionTokens`. The only `bcryptjs`
import in the app.

```ts
import bcrypt from "bcryptjs";
import type { PasswordHasher } from "@/lib/ports";

const COST_FACTOR = 12; // unchanged from the four routes' inline value

export function createBcryptPasswordHasher(): PasswordHasher {
  return {
    async hash(plain: string): Promise<string> {
      // Adapter OWNS the String() cast the routes used to do — prevents
      // bcryptjs "Illegal arguments: number, string" if a non-string slips in.
      return bcrypt.hash(String(plain), COST_FACTOR);
    },

    async compare(plain: string, hash: string): Promise<boolean> {
      try {
        return await bcrypt.compare(String(plain), String(hash));
      } catch (err) {
        // Preserve today's route-level console.error, now inside the adapter.
        console.error("[bcrypt] compare threw on malformed hash:", err);
        return false; // TOTAL — never propagate the throw.
      }
    },
  };
}
```
Decision: factory takes **no `deps` argument** (bcrypt needs no secret/env),
unlike `createWebCryptoSessionTokens`. Keep the factory shape (`createX()`
returning the port object) for house-style consistency and easy future
injection.

🗣 In plain English: this is the one box that knows the word "bcrypt". It also
swallows the two chores the routes used to do — forcing inputs to be text, and
not crashing on a corrupt stored hash.

### N3 — `lib/adapters/bcrypt/index.ts`
```ts
export { createBcryptPasswordHasher } from "./PasswordHasher";
```
Mirrors `lib/adapters/web-crypto/index.ts` (factory-only barrel; singleton
lives in wiring).

### N4 — `lib/wiring/password.ts`
```ts
import { createBcryptPasswordHasher } from "@/lib/adapters/bcrypt";
import type { PasswordHasher } from "@/lib/ports";

export const passwordHasher: PasswordHasher = createBcryptPasswordHasher();
```
**Wiring home decision:** a **new** `lib/wiring/password.ts`. The two existing
wiring files are `orders.ts` and `session.ts`, one-per-domain. Hashing is its
own concern (used by both the auth domain and the user-admin domain), so it
gets its own composition root rather than being crammed into `session.ts`.
Export name: **`passwordHasher`** (lowercamel singleton, matching
`sessionTokens`).

🗣 In plain English: one tiny parts-list file that hands the rest of the app a
finished hasher. Picking its own file (not `session.ts`) keeps each wiring file
about one thing.

---

## Per-route before/after sketches

### M1 — `app/api/auth/login/route.ts`
Remove `import bcrypt from 'bcryptjs'` (line 12). Add
`import { passwordHasher } from '@/lib/wiring/password'`.

**Before (lines 149–161):**
```ts
let valid = false
try {
  valid = await bcrypt.compare(String(credential), String(hashToCheck))
} catch (bcryptErr) {
  console.error('[login] bcrypt.compare threw:', bcryptErr)
  return NextResponse.json({ error: 'Authentication error' }, { status: 500 })
}
if (!valid) { ... }
```
**After:**
```ts
const valid = await passwordHasher.compare(credential, hashToCheck)
if (!valid) { ... }
```
- `credential` and `hashToCheck` are already strings here (lines 90, 138), so
  the adapter's `String()` is belt-and-braces. The route's own `String()` calls
  can drop.
- **Behaviour note (acceptable, document in PR):** Today a bcrypt throw returns
  HTTP **500** "Authentication error". After F-10, `compare` is TOTAL, so a
  garbage stored hash returns `false` → HTTP **401** "Invalid credentials"
  instead of 500. This only triggers on a *corrupt stored hash* (operationally a
  bug, not a real login). The spec mandates TOTAL compare, so this convergence
  is **intended** — login and kds-pin now behave identically on bad hashes
  ("treat a broken hash like a wrong credential"). Call it out explicitly at
  Gate 3 so the conductor signs off knowingly.
- The top-level `try { ... } catch (err)` (lines 78/261) STAYS — it's the
  route's own guard, unrelated to bcrypt.

🗣 In plain English: login asks the hasher "does this match?" and trusts the
answer. The one visible difference: if a stored hash is *corrupt*, the user now
sees "wrong credentials" instead of a server error — which is the safer, more
honest answer and matches what kds-pin already does.

### M2 — `app/api/auth/kds-pin/route.ts` (loop STAYS)
Remove `import bcrypt from 'bcryptjs'` (line 25). Add the wiring import.

**Before (lines 54–69):**
```ts
for (const user of users ?? []) {
  if (!user.pin_hash) continue
  try {
    const match = await bcrypt.compare(pin, String(user.pin_hash))
    if (match) { return NextResponse.json({ id, name, role }) }
  } catch (e) {
    console.error(`[POST /api/auth/kds-pin] bcrypt error for ${user.name}`, e)
  }
}
```
**After:**
```ts
for (const user of users ?? []) {
  if (!user.pin_hash) continue
  const match = await passwordHasher.compare(pin, user.pin_hash)
  if (match) { return NextResponse.json({ id, name, role }) }
}
```
- **The `for` loop stays in the route** — it is business logic ("check the PIN
  against every active butcher/warehouse user"). Only the inner `compare` call
  swaps.
- The per-iteration `try/catch` is removed: the adapter's TOTAL `compare`
  already returns `false` on a malformed hash, so a bad hash for one user
  cleanly continues to the next — exactly today's behaviour. The per-user
  `console.error` moves into the adapter (generic message; loses the username
  in the log line — acceptable, document in PR).

🗣 In plain English: the kitchen-screen login still walks through each butcher
asking "is this your PIN?" — that walk is the route's job and stays. We just
delete the safety tape around each question because the new lock can't crash.

### M3 — `app/api/admin/users/route.ts`
Remove `import bcrypt from 'bcryptjs'` (line 11). Add the wiring import.

**Before (lines 68–75):**
```ts
let hash: string
try {
  hash = await bcrypt.hash(String(credential), 12)
} catch (bcryptErr) {
  console.error('[POST /api/admin/users] bcrypt.hash failed:', bcryptErr)
  return NextResponse.json({ error: 'Failed to hash credential' }, { status: 500 })
}
```
**After:**
```ts
const hash = await passwordHasher.hash(credential)
```
- `credential` is already a string (line 41); adapter's `String()` is
  belt-and-braces.
- **Behaviour note:** the route's local try/catch around `hash` is dropped. The
  port's `hash` may still throw on a genuine internal failure; that propagates
  to the route's outer `try { ... } catch (err)` (lines 31/91), which already
  returns a 500. Net external behaviour on a real hashing failure: still HTTP
  500 (message string changes from "Failed to hash credential" to
  `String(err)` — acceptable, document in PR).

### M4 — `app/api/admin/users/[id]/route.ts`
Remove `import bcrypt from 'bcryptjs'` (line 8). Add the wiring import.

**Before (line 49):** `const hash = await bcrypt.hash(body.credential, 12)`
**After:** `const hash = await passwordHasher.hash(body.credential)`
- `body.credential` is typed `string | undefined` and gated by
  `if (body.credential && body.role)` (line 48), so it's a non-empty string at
  the call. The adapter's `String()` cast covers any residual type drift.
- The surrounding route `try { ... } catch` (lines 17/70) is unchanged and
  still catches a genuine hash throw → existing 500 path.

---

## Lint-rule decision — **YES, extend the rule to `bcryptjs`**

**Decision: YES.** After F-10, `bcryptjs` must be importable ONLY from
`lib/adapters/bcrypt/**` (and `tests/**`, which is already globally exempt).
Without extending the lint rule, nothing stops a future route from
re-importing `bcryptjs` directly and silently re-coupling — the exact failure
mode F-04 was built to prevent for Supabase. The spec calls for FULL CLOSE, so
the guard must close.

🗣 In plain English: it's not enough to *build* the one allowed plug — we have
to lock the supplier's parts cupboard so nobody quietly wires a second raw plug
later. F-04 already did this for the database; F-10 does it for the hasher.

### Mirrors that MUST be updated (3 edit sites — M6, M7, M8)

The repo keeps the lint guard truthful across three places. All three move
together or the unit suite fails:

1. **`.eslintrc.json` (M6) — the shipped config, source of truth.** Add a
   second forbidden path `bcryptjs` in **both** locations (legacy overrides
   REPLACE, not merge — see the F-TD-11 comment in `no-adapter-imports.test.ts`
   line 16):
   - the **base** `rules.no-restricted-imports.paths` array, and
   - the **services/usecases override** `paths` array (lines 29–34).
   Add a new override block (or extend the existing `files` list at line 18)
   so `lib/adapters/bcrypt/**/*.ts` turns the rule **off** for the adapter —
   exactly as `lib/adapters/supabase/**/*.ts` is exempted today (line 18).
   Proposed message (mirror the F-04 wording):
   > `"Use the PasswordHasher port via @/lib/wiring/password. bcryptjs may only be imported inside lib/adapters/bcrypt/. See ADR-0002 / F-10."`

2. **`tests/unit/lint/no-supabase-sdk.test.ts` (M7) — the hermetic mirror.**
   Its `f04Config` (lines 53–79) is a hand-rolled copy of `.eslintrc.json`.
   Add the `bcryptjs` path to its `paths` and `lib/adapters/bcrypt/**/*.ts` to
   the exempt `files` glob, then add cases: (a) `bcryptjs` forbidden in
   `app/api/foo/route.ts`, (b) allowed in
   `lib/adapters/bcrypt/PasswordHasher.ts`, (c) the new message verbatim.

3. **`tests/unit/lint/no-adapter-imports.test.ts` (M8) — the real-config pin.**
   This one loads the actual `.eslintrc.json` from disk
   (`loadRealConfig`, lines 55–61), so it is the drift-catcher. Add:
   (a) a case asserting `bcryptjs` in `lib/services/OrdersService.ts` reports
   `no-restricted-imports` (parity with case 6), (b) a case asserting
   `bcryptjs` in `app/api/foo/route.ts` reports an error, (c) a case asserting
   `bcryptjs` in `lib/adapters/bcrypt/PasswordHasher.ts` reports **zero**
   errors, (d) a message-verbatim case carrying the new forbidden message as a
   module-level constant (mirroring the `F04_MESSAGE` constant at line 40).

> **Mirror-count note for the conductor:** F-TD-04's lint work touched **4**
> mirrors. F-10 touches **3** lint sites: the config (M6) + two pinning tests
> (M7, M8). There is no fourth (`no-supabase-sdk` and `no-adapter-imports` are
> the only two lint pins; F-TD-04's extra mirrors were Supabase-client
> relocations, not lint files). The verbatim message string appears in exactly
> these 3 files and must be byte-identical in all three — a typo in any one
> fails M7/M8.

---

## TDD test plan

### N5 — adapter unit tests (`tests/unit/adapters/bcrypt/PasswordHasher.test.ts`)
No DB, no network — bench tests, modelled on
`tests/unit/adapters/web-crypto/SessionTokens.test.ts`.

| Case | Assertion |
|------|-----------|
| Round-trip | `hash(p)` then `compare(p, h)` → `true`. |
| Wrong plaintext | `compare("wrong", hash("right"))` → `false`. |
| Compare on garbage hash | `compare("x", "not-a-bcrypt-hash")` → `false`, does **not** throw. |
| Compare on empty hash | `compare("x", "")` → `false`, no throw. |
| Non-string plaintext (casting) | `compare(1234 as any, knownHash)` does not throw "Illegal arguments"; matches when `String(1234)` is the original plaintext. |
| Non-string in hash | `hash(5678 as any)` resolves to a string hash; `compare("5678", that)` → `true`. |
| Cost factor 12 | A hash from `hash(p)` has the `$2a$12$` / `$2b$12$` prefix (assert the embedded cost is `12`). |
| **Cross-cost compatibility** | A hash made at cost **10** via raw `bcryptjs` (the integration-fixture cost) verifies `true` through `compare` — proves no re-hash / no cost lock-in. |
| Logged-not-thrown | Garbage-hash case calls `console.error` (spy) and still returns `false`. |

### TDD ordering (write tests first)
1. Write N5 against N1's interface → red (adapter not built).
2. Build N2/N3 → N5 green.
3. Write/extend lint mirrors M7, M8 (red) → edit `.eslintrc.json` M6 → green.
4. Build N4 wiring; refactor routes M1–M4; M5 barrel export.
5. Full gate run (below).

### Existing tests that prove no behaviour regression
- **`tests/integration/kds.test.ts`** — plants a butcher PIN with
  `bcrypt.hash(TEST_PIN, 10)` (cost **10**) and exercises the real
  `/api/auth/kds-pin` route. After F-10 the route verifies that cost-10 hash
  through `passwordHasher.compare`. This is the **headline regression proof**:
  a hash made by a *different cost factor outside the adapter* still verifies,
  i.e. existing stored credentials keep working. Must stay green unchanged.
- **`tests/integration/_globalSetup.ts`** — seeds butchers with
  `bcrypt.hash(pin, 10)`; the same cross-cost proof flows through every
  integration test that logs anyone in. Stays as-is.
- **`tests/e2e/03-kds-butcher-flow.spec.ts`** (`@critical`) — the kitchen-screen
  butcher login end-to-end. Must stay green; it is part of the preview smoke.
- **`tests/e2e/redirects.spec.ts`** + **`tests/e2e/_auth.ts`** — exercise the
  main `/api/auth/login` redirect-by-role path. Must stay green.
- **`tests/unit/rateLimiter.test.ts`** — login rate-limiter unit logic;
  untouched by F-10 (we don't change `checkRateLimit`/`recordFailure`), confirms
  the surrounding login logic is unchanged.

**Gate run:** `npm run lint` (0), `tsc --noEmit` (0), `npm run test:unit`
(1536 + new N5 cases, all green), `npm run test:integration` (122 green,
**kds.test.ts the load-bearing one**), `npm run test:e2e:api` +
`npm run test:e2e:ui` for the `@critical` auth specs.

---

## Behaviour-preserving proof strategy ("do old hashes still verify?")

1. **Algorithm + cost unchanged:** the adapter calls the same `bcryptjs`
   `hash`/`compare`, with `COST_FACTOR = 12` for `hash`. `compare` is inherently
   cost-agnostic (the cost is encoded in the stored hash string), so it verifies
   *any* existing hash regardless of the cost it was made at.
2. **No rows touched:** zero DB migrations, zero `UPDATE` of `password_hash` /
   `pin_hash`. Existing production hashes are read and compared byte-for-byte as
   today.
3. **Live evidence in CI:** `kds.test.ts` and `_globalSetup.ts` plant hashes at
   cost **10** (not 12) and log users in through the real routes — so green CI
   is a direct demonstration that a *non-12* historical hash still authenticates
   through the new adapter. Plus the N5 "cross-cost compatibility" unit case.
4. **No new credential paths:** the only `hash` call sites (M3, M4) keep cost 12,
   identical to today, so newly created users are indistinguishable from those
   created on `main`.

🗣 In plain English: we never rewrite anyone's stored key, and we keep the exact
same lock and strength. The kitchen-login test even uses an *older-recipe* key
on purpose — when that test stays green, it proves yesterday's keys still open
today's doors.

---

## Risk Assessment

### Concurrency / race conditions
- **No new shared mutable state.** The adapter is stateless; the wiring exports
  a single stateless singleton (like `sessionTokens`). The login route's
  in-memory rate-limiter `Map` is untouched. **Severity: none.**
  🗣 Nothing new is shared between requests, so nothing new can collide.

### Security
- **R-SEC-1 — `compare` becoming TOTAL changes login's failure mode on a
  corrupt hash (500 → 401).** *Severity: Low.* This is spec-mandated and
  arguably *more* secure (no 500 leaks "this account exists but its hash is
  broken"; it now looks like any wrong credential). **Mitigation:** documented
  in M1; both auth routes now behave identically on bad hashes. **Must-fix: no.**
- **R-SEC-2 — cost factor or `String()` cast accidentally dropped in the
  adapter.** *Severity: Medium if it happened.* **Mitigation:** N5 pins both
  (cost-12 prefix assertion + non-string casting cases). **Must-fix: no**
  (covered by tests).
- **No new attack surface, no secrets, no new dependency.** The lint extension
  *reduces* the surface (one allowed import site instead of four).
  🗣 We're shrinking where the hasher can be touched, not widening it.

### Data migration
- **None.** No schema change, no row rewrite, no backfill. **Severity: none.**
  🗣 We don't touch a single stored credential.

### Business-logic flaws
- **R-BL-1 — kds-pin loop accidentally refactored away / short-circuited.**
  *Severity: High if it happened* (would break multi-butcher login). The loop is
  business logic and MUST stay in the route. **Mitigation:** spec + this plan
  call it out explicitly; `kds.test.ts` + `03-kds-butcher-flow.spec.ts` catch a
  broken loop. **Must-fix: no** (guarded by tests + explicit instruction).
- **R-BL-2 — log-message loss (per-user name in kds-pin error, distinct 500
  message in login/admin).** *Severity: Low* (observability only, no behaviour).
  **Mitigation:** documented as accepted in M1/M2/M3. **Must-fix: no.**

### Launch blockers
- **None identified.** No env var, no infra, no migration, no feature flag.
  Behaviour-preserving by design. The only ship gate is "all existing auth tests
  green" — which is exactly the regression net above.

### Severity summary
| Risk | Severity | Must-fix? |
|------|----------|-----------|
| R-SEC-1 (corrupt-hash 500→401) | Low | No (spec-mandated) |
| R-SEC-2 (cost/cast drift) | Medium | No (test-pinned) |
| R-BL-1 (kds loop) | High-if-broken | No (test-pinned + explicit) |
| R-BL-2 (log fidelity) | Low | No |

**No must-fix risks. Gate 2 is not blocked on a risk basis.**

---

## Rollback note

Pure refactor, no migration → rollback is a clean `git revert` of the F-10
commit/PR. No data to unwind, no env to reset, no half-migrated state possible.
If a regression surfaces post-merge, reverting restores the four inline
`bcryptjs` imports and the original `.eslintrc.json` in one step; stored hashes
are untouched throughout, so nothing else needs repair.
🗣 In plain English: if it goes wrong, one "undo" button puts the four old plugs
back and changes nothing about anyone's stored credentials.

---

## Hexagonal self-check

- **Port used/added:** **adds** `PasswordHasher` (`lib/ports/PasswordHasher.ts`).
- **Adapter implementing it:** `createBcryptPasswordHasher` in
  `lib/adapters/bcrypt/PasswordHasher.ts` — the only `bcryptjs` import site
  after F-10.
- **New dependencies:** **none.** `bcryptjs` (`^2.4.3`) and `@types/bcryptjs`
  are already in `package.json`; F-10 only *relocates* where it's imported.
- **Single-use vendor wrapped?** Yes — `bcryptjs` will be imported in exactly
  one file (`lib/adapters/bcrypt/PasswordHasher.ts`), satisfying the CLAUDE.md
  "single-use vendor must sit behind an owned wrapper" rule. The lint extension
  (M6–M8) enforces it.
- **Rip-out test:** swapping bcrypt for argon2/scrypt = **1 new adapter folder
  (`lib/adapters/<vendor>/`) + 1 wiring line edit in `lib/wiring/password.ts`**.
  Routes, ports, and tests-against-the-port don't change. **PASS.**
