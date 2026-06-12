# T1 — Sign the `mfs_session` cookie (HMAC-SHA256)

- **Date:** 2026-06-12
- **Unit:** T1 (Critical #1 from `docs/rls-audit-2026-06-12.md`, Finding 1 / threat T1)
- **Spec status:** Locked at FORGE Gate 1 — no deviation
- **Branch:** `fix/t1-sign-session-cookie` (matches house pattern: `fix/f-td-10-…`, `feat/f-08-…`)
- **PR title:** `fix(auth): HMAC-sign mfs_session cookie — closes priv-esc Finding 1 (T1)`
- **DB impact:** none — no migrations, no schema, no data

---

## 1. Goal

Make the `mfs_session` cookie tamper-proof. Today it is plain JSON that the
server trusts blindly; any logged-in user can edit it in devtools to
`"role":"admin"` and become an administrator. After T1, every session cookie
carries an HMAC-SHA256 signature computed with a server-only secret
(`SESSION_SECRET`); the middleware rejects any cookie whose signature does not
match — including every cookie issued before this change.

**🗣 In plain English:** the app currently hands users a name badge written in
pencil and believes whatever is on it. We are switching to a badge with a
hologram seal only the server can make. If anyone edits their badge — or shows
up with an old pencil badge — the door turns them away and sends them back to
the login screen. Everyone logs in once more after this ships; that is the
whole user-visible cost.

Non-goals (locked out of scope): no expiry/revocation claims, no encryption of
the payload, no change to login UX, no change to the unsigned display cookies
(`mfs_role`, `mfs_user_id`, `mfs_name`) — see Risk R6 for the residual they
carry.

**🗣 In plain English:** we are only adding the seal. We are not changing what
is written on the badge, how long it lasts, or the other convenience labels the
app uses for display — those get their own follow-up.

---

## 2. Domain terms

- **Session claims** — the four facts the badge states: `userId`, `name`,
  `role`, `secondaryRoles`. Unchanged from today.
  **🗣 In plain English:** who you are, your display name, your job, and any
  extra hats you wear.
- **Token** — the sealed badge: `base64url(claimsJson) + "." + base64url(hmac)`.
  **🗣 In plain English:** the badge text plus the hologram seal, glued
  together with a dot, written in an alphabet that is safe to put in a cookie.
- **SESSION_SECRET** — the server-only key used to make and check seals.
  Minimum 32 random bytes. Generate with `openssl rand -base64 48`.
  **🗣 In plain English:** the stamp that makes the hologram. Only the server
  has it; whoever has the stamp can forge badges, so it never leaves the
  server's environment settings.

---

## 3. Architecture decisions (Gate 2 material)

### 3.1 Port — `SessionTokens` at `lib/ports/SessionTokens.ts`

```ts
export interface SessionTokens {
  /** Seal claims into a cookie-safe token. Throws if the secret is unavailable. */
  issue(claims: SessionClaims): Promise<string>;
  /** Open and check a token. Returns the claims, or null on ANY failure
      (bad seal, tampered payload, legacy unsigned JSON, malformed input,
      missing secret). Never throws. */
  verify(token: string | null | undefined): Promise<SessionClaims | null>;
}
```

**🗣 In plain English:** the app owns a two-button contract — "seal this
badge" and "check this badge". The contract is written in business language
(sessions), not in crypto language, so we can swap the sealing technology later
without touching the rest of the app.

Depth-rule compliance (ADR-0002): `verify` hides base64url decoding, structural
parsing, constant-time signature comparison, JSON parsing, and a shape check
(`userId`/`name`/`role` must be non-empty strings; `secondaryRoles` an optional
string array). It defines errors out of existence — `null` is the one failure
shape, exactly what the middleware needs.

**🗣 In plain English:** all the fiddly checking lives behind the button; the
caller only ever sees "good badge" or "no badge".

`SessionClaims` is a new domain type at `lib/domain/Session.ts`:
`{ userId: string; name: string; role: string; secondaryRoles?: string[] }`.
`role` stays a plain `string` to mirror today's behaviour exactly — the
middleware never validated role strings (unknown roles simply match no
permissions), and T1 must not change authorisation behaviour.

**🗣 In plain English:** we keep the badge fields exactly as they are today —
this task adds the seal, it does not redesign the badge.

### 3.2 Adapter — `lib/adapters/web-crypto/SessionTokens.ts`

**Critical runtime finding:** Next.js middleware (Next 15.3.6, no
`runtime` override in `middleware.ts`) runs on the **Edge runtime**, which
cannot import `node:crypto` — `createHmac` is unavailable there and the build
fails if it is imported. The **Web Crypto API** (`globalThis.crypto.subtle`)
is built into BOTH runtimes: the Edge runtime and Node (global since Node 19;
this repo runs Node 24). One adapter therefore serves the login route (Node),
the middleware (Edge), and the vitest test helper (Node) with **zero new npm
dependencies**.

**🗣 In plain English:** the doorman (middleware) lives in a slimmed-down
room where Node's classic crypto toolbox doesn't fit, but a standard
hologram-checking kit is built into every room — so we use that one kit
everywhere instead of carrying two different kits that could drift apart.

Spec note: Gate 1 said "Node's built-in crypto". Web Crypto IS Node's built-in
crypto (`globalThis.crypto`), satisfying the binding constraint — no new
dependencies — while also working in the Edge runtime where `node:crypto`
literally cannot load. This is compliance in substance; flagged to the
conductor explicitly.

Placement justification: Web Crypto is platform stdlib, not a vendor — but the
audit explicitly anticipates moving to "signed or encrypted sessions — e.g.
HMAC … or an encrypted JWT". Putting the mechanism behind a port keeps that
future swap at one adapter + one wiring line, which is exactly the CLAUDE.md
rip-out contract. Folder is named `web-crypto` (not `node-crypto`) because the
implementation calls the Web Crypto API.

**🗣 In plain English:** even though this isn't a paid vendor, we still put
the sealing machine in its own swappable box, because the security audit
already says we may upgrade the sealing technology later.

Factory shape (house style — adapters/services export factories):

```ts
export function createWebCryptoSessionTokens(deps: {
  getSecret: () => string | undefined; // lazy — read per call, never at import
}): SessionTokens;
```

Implementation requirements (pinned here so the implementer cannot drift):

- HMAC-SHA256 via `crypto.subtle.importKey("raw", …, { name: "HMAC", hash: "SHA-256" }, …)`.
- **Signature comparison via `crypto.subtle.verify(...)` — never string
  equality.** `subtle.verify` is constant-time; `sigA === sigB` leaks timing.
  **🗣 In plain English:** we let the crypto kit compare the seals itself,
  because hand-comparing them letter by letter lets an attacker measure how
  long the comparison took and guess the seal one letter at a time.
- Token format: `base64url(claimsJson) + "." + base64url(hmacBytes)`. base64url
  needs no URI-encoding in a cookie header. No version prefix — secret rotation
  already implies a mass re-login, which the business accepted at Gate 1.
- `getSecret()` returning `undefined`/empty: `issue` throws
  `new Error("SESSION_SECRET is not set — cannot issue sessions")`; `verify`
  returns `null` (fail closed) and `console.error`s once per process.
  **🗣 In plain English:** if the stamp is missing, the server refuses to hand
  out badges (login shows a server error) and refuses to accept any badge
  (everyone is sent to the login page). Nothing falls back to "let them in".
- Secret material and tokens are never logged.

### 3.3 Wiring — `lib/wiring/session.ts` (new composition root)

```ts
import { createWebCryptoSessionTokens } from "@/lib/adapters/web-crypto";
import type { SessionTokens } from "@/lib/ports";

export const sessionTokens: SessionTokens = createWebCryptoSessionTokens({
  getSecret: () => process.env.SESSION_SECRET,
});
```

One domain, one wiring file, mirroring `lib/wiring/orders.ts`. A parts list,
no logic. No ESLint change is needed: the F-TD-11 `no-restricted-imports`
override only constrains `lib/services/**` and `lib/usecases/**` (neither is
touched), and the new adapter imports no vendor SDK, so
`tests/unit/lint/no-adapter-imports.test.ts` is unaffected.

**🗣 In plain English:** one small "assembly" file plugs the sealing machine
into the app. The existing lint tripwires that police the architecture don't
need rewiring — this slots into the rules as they stand.

### 3.4 Middleware strategy

`middleware.ts` imports the ready-made singleton from `@/lib/wiring/session`
and becomes `async`. The import chain is
`middleware → lib/wiring/session → lib/adapters/web-crypto → (nothing)` plus
type-only imports of the port and domain type — no Supabase, no Node built-ins,
no heavy modules, fully Edge-compatible and a few hundred bytes of bundle.
This is the sanctioned hexagonal path (presentation imports wiring singletons),
so middleware does NOT need a special leaner composition.

**🗣 In plain English:** the doorman gets the badge-checker through the normal
front door of the architecture, and the badge-checker is light enough to carry
into the doorman's small room — no special back-door arrangement needed.

Verification replaces the bare `JSON.parse` at `middleware.ts:116-125`:
`const session = await sessionTokens.verify(sessionCookie)`; on `null` →
reuse the existing malformed-cookie branch verbatim (clear `mfs_session`,
redirect to `/login`) — with the existing HACCP nuance preserved: requests
under `/haccp` redirect to `/haccp`, others to `/login?from=…`, matching the
current no-cookie branch at `middleware.ts:106-114`. The matcher config is
unchanged.

**🗣 In plain English:** a fake or old badge is treated exactly like having no
badge at all — you land on the same login screen you'd see if you'd never
logged in, including the special kiosk login for the HACCP tablets.

### 3.5 Rip-out test answer

Replace HMAC tomorrow (say, encrypted JWTs): write
`lib/adapters/<new>/SessionTokens.ts` satisfying the existing port, change the
one import + factory call in `lib/wiring/session.ts`. \*\*Two files: one adapter

- one wiring line. Nothing in middleware, routes, or tests changes\*\* (the test
  helper signs through the same wiring/adapter factory).

**🗣 In plain English:** swapping the sealing technology later means building
one new machine and changing one plug — the doors, the login desk, and the
test robots never notice.

---

## 4. Every `mfs_session` touchpoint (repo-wide audit)

| File                                                 | Today                                            | T1 action                              |
| ---------------------------------------------------- | ------------------------------------------------ | -------------------------------------- |
| `app/api/auth/login/route.ts:207`                    | sets plain JSON cookie                           | sign via `sessionTokens.issue`         |
| `app/api/auth/haccp-admin/route.ts:35`               | sets plain JSON cookie (kiosk admin, 8h)         | sign via `sessionTokens.issue`         |
| `middleware.ts:104-125`                              | bare `JSON.parse`                                | verify via `sessionTokens.verify`      |
| `app/api/auth/logout/route.ts:15,29`                 | clears cookie                                    | **no change** (clearing needs no seal) |
| `app/login/page.tsx:31`                              | comment only                                     | **no change**                          |
| `tests/integration/_setup.ts:298-308`                | fabricates plain cookie                          | sign via new shared helper             |
| `tests/integration/orders-idempotency.test.ts:64-76` | own inline plain cookie                          | use the shared helper                  |
| `tests/e2e/_auth.ts`                                 | real UI login (server-issued cookie)             | **no change** — server now signs       |
| `tests/e2e/_previewProbe.ts:163-175`                 | forwards the real `Set-Cookie` from a real login | **no change**                          |
| `tests/e2e/api/**`, other specs                      | no cookie fabrication found (repo-wide grep)     | **no change**                          |

**🗣 In plain English:** only two places hand out badges and one place checks
them — those three change. The logout desk just shreds badges, so it doesn't
care about seals. The robots that log in like real users get real sealed
badges automatically; only the robots that used to print their own badges must
now use the official sealing machine.

---

## 5. Numbered steps (TDD, vertical slices, red→green→refactor)

NO-REFORMAT rule applies throughout: touch only the lines listed; never
reformat surrounding code. Baselines: 1511 unit tests green, 60 pre-existing
tsc errors, 58 pre-existing lint warnings — add zero new ones, fix zero
unrelated ones.

**🗣 In plain English:** the builder writes a failing test first, then the
smallest code to pass it, and never "tidies up" lines this task doesn't own —
keeps the change easy to review and easy to undo.

### Slice A — port + adapter (pure, no app changes yet)

1. **RED** — new `tests/unit/adapters/web-crypto/SessionTokens.test.ts`
   (house style mirrors `tests/unit/adapters/fake/*.test.ts`; runs under
   `vitest.config.ts` with the `@` alias). Cases:
   - round-trip: `issue` then `verify` returns identical claims, with and
     without `secondaryRoles`;
   - tampered payload (decode, set `role:"admin"`, re-encode, keep old sig) → `null`;
   - tampered/truncated signature → `null`;
   - token signed with a different secret → `null`;
   - legacy unsigned cookie (`JSON.stringify({...})`, both raw and
     URI-encoded as the old helper produced) → `null`;
   - malformed inputs: empty string, `undefined`, `null`, no dot, two dots,
     non-base64url junk, base64url of non-JSON → `null`, never a throw;
   - missing secret: `issue` rejects with the pinned message; `verify` → `null`;
   - token contains no `.`-breaking or cookie-unsafe characters (regex
     `^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$`).
2. **GREEN** — create `lib/domain/Session.ts` (`SessionClaims`), export from
   `lib/domain/index.ts`; create `lib/ports/SessionTokens.ts`, export type from
   `lib/ports/index.ts`; create `lib/adapters/web-crypto/SessionTokens.ts` +
   `lib/adapters/web-crypto/index.ts` per §3.2.
3. **REFACTOR** — header comments in house style (what-this-hides, ADR-0002
   references), no behaviour change.

   **🗣 In plain English:** slice A builds and battle-tests the sealing machine
   on the bench before it is bolted into the app — including every way a
   forger or a glitch could present a bad badge.

### Slice B — wiring + issuers + middleware (the app change)

4. Create `lib/wiring/session.ts` per §3.3.
5. **RED** — new `tests/integration/session-signing.test.ts` (uses existing
   `_setup.ts` plumbing; runs against the auto-booted server):
   - signed cookie for `ANVIL-TEST-admin` → `GET /api/reference` returns 200;
   - same cookie with payload re-encoded to `role:"admin"` from a sales
     session but original signature → 307 (redirect: "manual");
   - legacy unsigned JSON cookie (today's exact format) → 307;
   - garbage cookie value → 307 and `Set-Cookie` clears `mfs_session`;
   - no cookie → 307 (regression pin of existing behaviour).
     These are red until steps 6-8 land AND the helper signs (step 9) — write
     them signing locally via `createWebCryptoSessionTokens` with
     `process.env.SESSION_SECRET` so they don't depend on step 9's helper order.
6. `app/api/auth/login/route.ts` — at :207 replace the raw
   `JSON.stringify(...)` cookie value with
   `await sessionTokens.issue({ userId: user.id, name: user.name, role: activeRole, secondaryRoles: sessionSecondaryRoles })`.
   Cookie options (httpOnly, secure, sameSite, maxAge 30d, path) unchanged.
   Import the singleton from `@/lib/wiring/session`. Everything else in the
   route — rate limiter, role picker, the four display cookies — untouched.
7. `app/api/auth/haccp-admin/route.ts` — same replacement at :35 (claims:
   the hard-coded admin id/name/role; keep the 8-hour maxAge and flags).
8. `middleware.ts` — make `middleware` async; replace :116-125 with the
   verify call per §3.4. Headers `x-mfs-*` (:141-145) now read from verified
   claims — same fields, same defaults (`secondaryRoles ?? []`).

   **🗣 In plain English:** slice B bolts the machine in: the two login desks
   start sealing badges, and the doorman starts checking seals. The robot
   tests prove a forged, edited, or pre-upgrade badge bounces to the login
   page while a properly sealed one sails through.

### Slice C — test plumbing

9. `tests/integration/_setup.ts` — add and export
   `signSessionCookie(session: { userId: string; name: string; role: string; secondaryRoles?: string[] }): Promise<string>`
   that calls `createWebCryptoSessionTokens({ getSecret: () => process.env.SESSION_SECRET }).issue(...)`
   (import from `@/lib/adapters/web-crypto` — allowed: the `tests/**` ESLint
   override lifts import restrictions, and the `@` alias exists in
   `vitest.integration.config.ts:47`). Update `api()` (:295-309) to
   `await` it for the `mfs_session` part. base64url tokens need no
   `encodeURIComponent`.
10. `tests/integration/orders-idempotency.test.ts` — replace the inline
    cookie build (:64-76) with the shared `signSessionCookie` helper.
11. `tests/integration/_globalSetup.ts` — in the layer-1 guard (:52-90),
    also require `SESSION_SECRET` in `.env.test.local` (fail fast with an
    actionable message, matching :69's style) and set
    `process.env.SESSION_SECRET = …` alongside :89-90 so it reaches both the
    vitest process (for the signing helper) and the spawned dev server (via
    the existing `...process.env` spread at :174).
12. `playwright.config.ts` — add
    `SESSION_SECRET: process.env.SESSION_SECRET ?? ''` to the `webServer.env`
    block (:171-174). `dotenv.config({ path: '.env.test.local' })` at :63
    already loads it into the Playwright process; passing it explicitly keeps
    the "explicit env is THE safety boundary" invariant. E2E specs themselves
    need no change — they log in for real.

    **🗣 In plain English:** the test robots and the throwaway test server
    must share the same stamp, or every robot login would bounce. These three
    edits hand the test stamp to everyone who needs it and refuse to start the
    test run if the stamp is missing.

### Slice D — env + docs housekeeping

13. `.env.local.example` — add a documented `SESSION_SECRET=` line with the
    `openssl rand -base64 48` generation hint.
14. Local-only (not committed): add a generated value to `.env.local` and a
    fixed test value to `.env.test.local` (e.g. a 64-char random string —
    any stable string ≥32 bytes; it guards a local throwaway DB).
15. Full local gate: `npm run test` (unit, 1511 + new green),
    `npm run db:up && npm run test:integration`, `npm run test:e2e:api`,
    `npm run test:e2e:ui`; `npx tsc --noEmit` and `npm run lint` show no NEW
    errors beyond the 60/58 baselines.

    **🗣 In plain English:** before asking to ship, the builder proves the
    whole house still stands — every automated check that passed before
    passes after, and the new locks work.

---

## 6. Files to change (complete)

New: `lib/domain/Session.ts` · `lib/ports/SessionTokens.ts` ·
`lib/adapters/web-crypto/SessionTokens.ts` · `lib/adapters/web-crypto/index.ts` ·
`lib/wiring/session.ts` · `tests/unit/adapters/web-crypto/SessionTokens.test.ts` ·
`tests/integration/session-signing.test.ts`

Edited: `lib/domain/index.ts` · `lib/ports/index.ts` · `middleware.ts` ·
`app/api/auth/login/route.ts` · `app/api/auth/haccp-admin/route.ts` ·
`tests/integration/_setup.ts` · `tests/integration/orders-idempotency.test.ts` ·
`tests/integration/_globalSetup.ts` · `playwright.config.ts` ·
`.env.local.example`

Untouched by design: `app/api/auth/logout/route.ts`, `app/login/page.tsx`,
`tests/e2e/_auth.ts`, `tests/e2e/_previewProbe.ts`, `lib/auth/session.ts`
(reads headers the middleware sets — unchanged contract), `.eslintrc.json`,
all DB/migrations.

**🗣 In plain English:** seven new files (the machine, its contract, its plug,
and its tests), ten small edits, zero database changes.

---

## 7. ADR review

- **ADR-0002 (hexagonal shape + F-TD-11 wiring amendment):** complied with —
  port in `lib/ports/`, adapter in `lib/adapters/web-crypto/`, factory-only
  exports, singleton only in `lib/wiring/session.ts`. No conflict.
- **ADR-0003 (strangler fig / FREEZE):** no Supabase surface touched; no
  conflict.
- **ADR-0004 (RLS vs service-role):** this unit is the audit's "auth track"
  fix that ADR-0004's threat model depends on; it advances, not conflicts.
- **ADR-0005/0006:** not implicated (note 0006: preview smokes require the
  preview deployment to have `SESSION_SECRET` — see Risk R1).
- One judgment call vs. the F-07 contract-test pattern: **no fake adapter or
  `__contracts__` test is added** for `SessionTokens`. The repo's contract
  tests exist so services can be unit-tested against fakes; no service
  consumes this port (middleware and routes do), and the real adapter is
  pure, dependency-free and instant — tests use it directly. Adding a fake
  would be speculative generality.

  **🗣 In plain English:** none of the project's written architecture
  decisions are violated. We also skip building a "pretend" sealing machine
  for tests, because the real one is already fast and safe to use in tests —
  building a fake would be busywork.

---

## 8. Rollout note (read before merge — ordering matters)

1. **BEFORE merging:** generate the secret (`openssl rand -base64 48`) and set
   `SESSION_SECRET` in Vercel for **Production AND Preview** environments.
   Preview is not optional — the Gate-4 preview smoke logs in against the
   PR's preview deployment, and with the secret missing, login 500s and the
   smoke fails (correctly, but it blocks the gate).
2. Merge + deploy.
3. **Every user is logged out once** (old unsigned cookies fail verification —
   by design, no grace window, per the locked spec). Deploy at a low-usage
   moment and tell the team beforehand: "you'll need to log in again once".
4. Rollback: revert the PR. Old code accepts any JSON cookie, so signed
   cookies issued meanwhile FAIL `JSON.parse`? No — signed tokens are not
   JSON, so post-revert the middleware's existing malformed-cookie branch
   clears them and users re-login once more. Rollback is safe, costing one
   more re-login. No data to migrate either way.

Per-environment behaviour when `SESSION_SECRET` is unset (decided):

| Environment          | Behaviour                                                                                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Production / Preview | **Fail closed.** Login returns 500 ("Server error" path, with a pinned server-log message); middleware treats every session as invalid → redirect to /login. |
| Local dev            | Same fail-closed behaviour; the server log says exactly what to add to `.env.local`.                                                                         |
| Tests                | `_globalSetup.ts` refuses to start the run with an actionable message; Playwright's webServer passes the value from `.env.test.local`.                       |

**🗣 In plain English:** set the secret stamp in Vercel for both the real site
and the rehearsal sites BEFORE pressing merge — the deploy is deliberately
built to lock everyone out rather than run unsealed. Everyone logs in again
once. If anything goes wrong, reverting is safe and just costs one more login.

---

## 9. ANVIL test matrix sketch

- **Unit** (`tests/unit/adapters/web-crypto/SessionTokens.test.ts`): sign/verify
  round-trip (± secondaryRoles), tampered payload, tampered signature, wrong
  secret, legacy unsigned JSON (raw + URI-encoded), 7 malformed-input shapes,
  missing-secret (issue throws / verify null), cookie-safe charset pin.
- **Integration** (`tests/integration/session-signing.test.ts`): signed cookie
  → 200 on protected API; tampered-role cookie → 307; legacy unsigned cookie
  → 307; garbage cookie → 307 + `mfs_session` cleared; no cookie → 307.
  Plus: the entire existing integration suite now rides on signed cookies via
  `api()` — every passing test doubles as proof the helper signs correctly.
- **E2E**: existing flows unchanged and binding — `test:e2e:ui` login →
  protected page; `test:e2e:api` smoke; Gate-4 `@critical` preview smoke
  (real login on the preview deployment proves prod-shaped signing end to end).

**🗣 In plain English:** bench tests for the machine, door tests for the
forged/old/garbage badges, and a full dress rehearsal where a robot logs in
like a real user and walks through the app.

---

## 10. Acceptance criteria

1. `mfs_session` set by login and haccp-admin is `b64url.b64url`, not JSON.
2. Editing any claim in devtools and reloading lands on /login with the cookie
   cleared. A pre-deploy (unsigned) cookie does the same.
3. Valid signed sessions behave byte-for-byte like today: same `x-mfs-*`
   headers, same role routing, same HACCP redirect nuances, role picker and
   rate limiter untouched.
4. `verify` never throws on any input; missing `SESSION_SECRET` fails closed
   in every environment per §8.
5. Rip-out: swapping the HMAC implementation = 1 new adapter + 1 wiring line.
6. Zero new npm dependencies; zero new tsc/lint findings over the 60/58
   baselines; 1511 existing unit tests + full integration/e2e suites green.
7. No DB changes of any kind.

**🗣 In plain English:** forged and stale badges bounce, honest users notice
nothing except one re-login, nothing new was bought or installed, and every
existing safety check still passes.

---

## 11. Risk Assessment

| #   | Category                          | Risk                                                                                                                                                                       | Severity | Mitigation                                                                                                                             | Must-fix?                                                                                  |
| --- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| R1  | Launch blocker                    | `SESSION_SECRET` missing in Vercel (Prod and/or Preview) at deploy → all logins 500, Gate-4 preview smoke fails                                                            | **High** | Rollout step 1 is a hard precondition: set in BOTH scopes before merge; fail-closed design makes the miss loud, not silent             | **MUST-FIX (process)** — Gate 4 may not run until conductor confirms both env vars are set |
| R2  | Security                          | Implementer uses `node:crypto`/`createHmac` in the adapter → Edge middleware build break, or a second divergent implementation                                             | **High** | Plan pins ONE Web Crypto adapter (§3.2); unit test runs the same code path the middleware bundles                                      | **MUST-FIX (resolved by plan)** — any deviation is a Gate 3 reject                         |
| R3  | Security                          | Non-constant-time signature comparison (string equality) enables timing-based forgery                                                                                      | **High** | §3.2 pins `crypto.subtle.verify`; code-critic checks for `===` on signatures                                                           | **MUST-FIX (resolved by plan)**                                                            |
| R4  | Security                          | Weak or shared secret (short string, committed to git, same value local/prod)                                                                                              | Medium   | ≥32 random bytes via `openssl rand -base64 48`; `.env*` already gitignored; distinct values per environment; never logged              | Yes — covered by rollout note + review                                                     |
| R5  | Business logic                    | Behaviour drift in middleware rewrite (HACCP redirect nuance, header defaults, ghost-admin secondary filter downstream)                                                    | Medium   | §3.4 pins reuse of existing branches verbatim; integration pins (no-cookie 307) + full e2e regression; `lib/auth/session.ts` untouched | Yes — acceptance criterion 3                                                               |
| R6  | Security (residual, out of scope) | 32 `/api/haccp/*` routes read the **unsigned** `mfs_role`/`mfs_user_id` cookies directly (those paths are PUBLIC in middleware) — forgeable independently of `mfs_session` | Medium   | Out of T1's locked scope; record in `docs/plans/BACKLOG.md` as an auth-track follow-up (rides the T4/`requireRole` migration)          | No — but MUST be logged in BACKLOG in this PR                                              |
| R7  | Concurrency / race                | None material: verification is stateless and pure; multi-instance Vercel shares one env secret; no shared mutable state added                                              | Low      | n/a                                                                                                                                    | No                                                                                         |
| R8  | Data migration                    | None — no DB touch; the only "migration" is the deliberate one-time mass re-login                                                                                          | Low      | Rollout communication (§8.3)                                                                                                           | No                                                                                         |
| R9  | Operational                       | Sessions still have no server-side revocation/expiry beyond the 30-day cookie — unchanged from today                                                                       | Low      | Explicit non-goal; future auth-track work                                                                                              | No                                                                                         |

**Headline:** three must-fix risks. R1 is the live one for the conductor — a
deployment-ordering precondition (secret in Vercel Prod + Preview before
merge). R2 and R3 are resolved by decisions pinned in this plan and become
Gate 3 reject-criteria for the implementer. R6 is a newly surfaced residual
hole adjacent to T1 that must be written into BACKLOG.md within this PR.

**🗣 In plain English:** the three deal-breakers are: (1) put the secret stamp
into Vercel for both real and rehearsal sites before merging — the plan makes
forgetting impossible to miss because logins simply stop; (2) use the one
crypto kit that works in both rooms, not the one that breaks the build; (3)
let the kit compare seals so attackers can't use a stopwatch to forge one.
Separately, we discovered 32 kitchen-compliance pages still trust a pencil
label — too big to sneak into this task, so it goes on the official to-do list
today.
