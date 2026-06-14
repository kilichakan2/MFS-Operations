# F-RLS-03 — Introduce a per-request authenticated DB client (INTRODUCE-ONLY)

- **Date:** 2026-06-14
- **Unit:** F-RLS-03 (Phase 0.5 RLS safety track; ADR-0004 sequencing)
- **Authoritative spec:** ADR-0007 (mechanism), ADR-0004 (posture), ADR-0002 (shape)
- **Scope class:** prod-code + DB migration → full FORGE + ANVIL (not frame-light)

## Visual mini-map

```
DOMAIN (core logic)
  ├─ DbTokenMinter (NEW port)  → [web-crypto adapter] (reuses HMAC primitive)
  ├─ SessionTokens (port)      → [web-crypto] (existing, untouched)
  ├─ {Orders,Customers,…}Repository (ports) → [supabase] (existing, untouched)
  └─ authenticated DB client + requireServiceRole() → [supabase] (NEW, vendor-side only)
🗣 Add one new socket (mint a DB token) + a per-request "who's asking" plug; rip out Supabase = still one adapter + one wiring line.
```

## Goal

Build — but do NOT switch on — the machinery that lets the database enforce
row-level security (RLS) per logged-in user, instead of every request using the
master key that bypasses RLS entirely.

**🗣 In plain English:** Today every database call uses a master key, so Postgres
trusts whatever the app claims about who's asking. This unit lays the wiring for a
"stamped with who's asking" connection so Postgres can re-check permissions itself
— but it leaves all 83 existing routes on the old master-key path. Nothing in
production behaves differently after this ships; we only *prove the new path works*
with a test. The actual flip of the first route (Orders) is the next unit (F-RLS-04a).

Four artefacts ship: (a) a token minter, (b) a per-request authenticated client
factory, (c) a database "bridge" migration, (d) a `requireServiceRole()` named
escape hatch for the existing master-key client. Plus an integration test that
proves the whole chain end-to-end against the Supabase preview branch.

## Domain terms (plain-English bridge)

- **Authenticated DB client** — a database connection stamped with *who is asking*,
  so Postgres's RLS rules decide what that user sees. 🗣 A keycard with your photo
  on it; the door checks the photo. Opposite of the master key.
- **Admin / service-role client** — the existing master-key connection
  (`supabaseService`) that ignores RLS. 🗣 The master key the night guard carries —
  opens every door, no questions. Stays available, but only behind `requireServiceRole()`.
- **GUC bridge** — a tiny Postgres hook (`db-pre-request`) that reads the user id out
  of the per-request token and writes it into the session variable
  `app.current_user_id` that every existing RLS policy already reads. 🗣 The hook
  copies your id onto the clipboard the existing rules already check, so no rule has
  to be rewritten. Inert until a route actually switches to the authenticated client.
- **db-pre-request hook** — PostgREST runs one named SQL function before every
  request. 🗣 A doorman who runs the same one-line check on everyone walking in — so
  it must NEVER throw, or it slams the door on all authenticated traffic at once.
- **HS256 JWT** — a JSON token signed with a shared secret using HMAC-SHA256.
  🗣 A tamper-proof note: anyone with the secret can verify it wasn't altered.
  PostgREST already knows how to read these — that's why we mint one in this shape.
- **`SUPABASE_JWT_SECRET`** — the Supabase project's JWT signing secret. 🗣 The shared
  secret that makes PostgREST trust our minted note. Server-side only, never shipped
  to the browser.

## Compliance / architecture flags

- **Hexagonal contract (CLAUDE.md + ADR-0002):** a Supabase client is a vendor type
  and must NOT cross the adapter boundary. The authenticated-client factory and the
  service-role escape hatch live ONLY in `lib/adapters/supabase/`. 🗣 The Lego rule:
  vendor parts stay inside the vendor's box.
- **No new dependency (ADR-0007 §Decision):** mint the token with the Web Crypto HMAC
  primitive already in `lib/adapters/web-crypto/SessionTokens.ts`. `package.json` must
  not gain a `jsonwebtoken`/`jose` entry. 🗣 We already own a signing tool; use it,
  don't buy another.
- **Non-destructive migration (ADR-0007 §Decision):** the bridge migration adds a
  function + sets one role attribute + reloads config. No DROP/TRUNCATE/ALTER
  TYPE/DROP NOT NULL. No PITR gate (state is recoverable by the rollback block).
  🗣 We add a doorman; we don't move any walls.

## ADR conflicts

**None that block.** One clarification to record, not a conflict:

- ADR-0004 §Target state literally says the authenticated client is "built from the
  anon key plus the user's **JWT**" — assuming Supabase Auth issues that JWT. ADR-0007
  already supersedes that **mechanism** (app-minted token + GUC bridge) while keeping
  ADR-0004's posture. This plan follows ADR-0007. No new ADR is needed; ADR-0007 is
  the authoritative record. 🗣 The newer decision doc already fixed the wording gap;
  we just follow it.

## Prerequisite (Hakan provisions BEFORE Render — NOT a build step)

`SUPABASE_JWT_SECRET` must be added (server-side only, never `NEXT_PUBLIC_`):
1. **Vercel → Production** env
2. **Vercel → Preview** env (so the preview branch the integration test runs against
   can verify the minted token)
3. **Local `.env.test.local`** (so `npm run test:integration` and the preview smoke
   can mint a token the booted server / preview DB will accept)

Source: Supabase → Settings → API → **JWT Secret** (the project's legacy JWT secret —
the one PostgREST uses to verify HS256 bearer tokens). 🗣 One secret, three places.
The build can't be validated until it's in all three, so this gates Render.

**Where it is read:** ONLY in `lib/wiring/dbToken.ts` (the composition root passes a
lazy `getSecret: () => process.env.SUPABASE_JWT_SECRET` into the minter factory), and
in the integration test's local minter (same pattern as `session-signing.test.ts`
reads `SESSION_SECRET`). The minter adapter and the route code never read
`process.env` directly. 🗣 The secret enters through exactly one labelled door.

---

## Exact files to change

### New files

| Path | Purpose |
|---|---|
| `lib/ports/DbTokenMinter.ts` | NEW port: vendor-free contract for "mint a short-lived DB identity token for this user". |
| `lib/adapters/web-crypto/DbTokenMinter.ts` | Adapter: mints the HS256 JWT reusing the existing HMAC primitive. |
| `lib/adapters/supabase/authenticatedClient.ts` | Adapter: `authenticatedClientForCaller(...)` (per-request anon-key client + Bearer) and `requireServiceRole()` escape hatch. |
| `lib/wiring/dbToken.ts` | Composition root: wires `DbTokenMinter` to the web-crypto adapter with the lazy `SUPABASE_JWT_SECRET` getter. |
| `supabase/migrations/<14-digit>_db_pre_request_guc_bridge.sql` | The GUC bridge migration (function + role attribute + reload). |
| `tests/unit/adapters/web-crypto/DbTokenMinter.test.ts` | Unit: token is a verifiable HS256 JWT with the right claim shape + lifetime. |
| `tests/unit/adapters/supabase/authenticatedClient.test.ts` | Unit: factory attaches the Bearer header; `requireServiceRole()` returns the service client. |
| `tests/integration/adapters/supabase/rls-bridge.test.ts` | Integration: the end-to-end bridge proof (deny without token, allow with token). |

### Modified files

| Path | Change |
|---|---|
| `lib/ports/index.ts` | Re-export `DbTokenMinter`. |
| `lib/adapters/web-crypto/index.ts` | Re-export `createWebCryptoDbTokenMinter`. |
| `lib/adapters/supabase/index.ts` | Re-export `authenticatedClientForCaller` + `requireServiceRole`. |
| `.eslintrc.json` | Lint-mirror guard (see Step 7) — forbid the new authenticated-client / JWT-secret surface from being imported/read outside its adapter. |
| `tests/unit/lint/no-adapter-imports.test.ts` | Pin the new lint-mirror cases against the shipped config. |
| `CONTEXT.md` | (Already has the three glossary entries — verify, add nothing unless wording drifted.) |

### NOT touched (explicitly out of scope)

- `lib/adapters/supabase/client.ts` (`supabaseService` / `getSupabaseService`) — kept
  verbatim; `requireServiceRole()` WRAPS it, does not replace it.
- All `lib/wiring/orders.ts`, `lib/services/**`, `lib/usecases/**`, `app/**` — no
  repository is rewired; the 83 `supabaseService` call sites are NOT touched (deferred
  to F-RLS-final).
- Every existing RLS policy and migration — unchanged.

🗣 The new path sits beside the old one. We change zero production behaviour.

---

## Numbered build steps (TDD: red → green per slice)

### Slice 1 — The DbTokenMinter port + adapter (token minting)

**Step 1.1 (RED).** Write `tests/unit/adapters/web-crypto/DbTokenMinter.test.ts`
asserting, against a fixed secret:
- `mint({ userId })` returns a string of the form `header.payload.signature`
  (three base64url segments — true JWT compact form, NOT the 2-segment `mfs_session`
  shape).
- Decoding the header gives `{ "alg": "HS256", "typ": "JWT" }`.
- Decoding the payload gives `{ role: "authenticated", sub: <userId>, user_id: <userId>, iat: <n>, exp: <n> }` with `exp - iat === TOKEN_TTL_SECONDS` (proposed **60s**).
- The signature verifies under the same secret via Web Crypto `verify` (independent re-computation in the test).
- With a missing secret, `mint` throws (fail-closed, mirrors `SessionTokens.issue`).

**🗣 Why a 3-segment JWT, not the 2-segment session token:** PostgREST only accepts
standard JWTs (`header.payload.signature`). The existing `mfs_session` is a custom
2-segment shape PostgREST would reject — so the new minter produces the standard form
even though it reuses the same HMAC signing tool.

**Step 1.2 (GREEN).** Write `lib/ports/DbTokenMinter.ts`:

```ts
export interface DbTokenMinter {
  /** Mint a short-lived HS256 JWT carrying { role: 'authenticated', user_id }.
   *  @throws if the signing secret is unavailable (fail closed). */
  mint(claims: { userId: string }): Promise<string>;
}
```

Then `lib/adapters/web-crypto/DbTokenMinter.ts` exporting
`createWebCryptoDbTokenMinter({ getSecret }: { getSecret: () => string | undefined }): DbTokenMinter`.
Reuse the *exact* base64url + `importHmacKey` + `crypto.subtle.sign` primitives from
the sibling `SessionTokens.ts` (copy the tiny helpers or extract a shared internal
`hmac.ts` in the same folder — prefer extraction to avoid drift, but keep it inside
`lib/adapters/web-crypto/`). Claim shape:
`{ role: "authenticated", sub: userId, user_id: userId, iat: now, exp: now + 60 }`,
header `{ alg: "HS256", typ: "JWT" }`, signing input `base64url(header) + "." + base64url(payload)`.

**🗣 Plain English:** The minter is a new socket ("give me a DB token for this user");
the web-crypto adapter is the plug that fills it using the signing tool we already own.

**Step 1.3.** `lib/wiring/dbToken.ts`:
```ts
export const dbTokenMinter: DbTokenMinter = createWebCryptoDbTokenMinter({
  getSecret: () => process.env.SUPABASE_JWT_SECRET,
});
```
Re-export the factory from `lib/adapters/web-crypto/index.ts`; re-export the port
type from `lib/ports/index.ts`.

**🗣 STOP-AND-REPORT trigger:** If during Step 1.2 the existing Web Crypto primitive
cannot produce a JWT PostgREST accepts (e.g. PostgREST rejects the signature, or a
base64url padding quirk), STOP — do not add `jose`/`jsonwebtoken`. Report to the
conductor; adding a dep re-opens the ADR-0007 "no new dependency" decision.

### Slice 2 — The authenticated client factory + requireServiceRole

**Step 2.1 (RED).** Write `tests/unit/adapters/supabase/authenticatedClient.test.ts`:
- `authenticatedClientForCaller({ token })` builds a client whose global headers
  include `Authorization: Bearer <token>` (assert by inspecting the options passed to
  a mocked `createClient`, following the pattern in
  `tests/unit/adapters/supabase/client.test.ts`).
- It uses `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` (the anon key,
  NOT the service-role key).
- `requireServiceRole()` returns the same instance as `getSupabaseService()`.

**Step 2.2 (GREEN).** Write `lib/adapters/supabase/authenticatedClient.ts`:

```ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseService } from "./client";

/** Per-request authenticated client: anon key + the caller's minted DB token as
 *  Authorization: Bearer. Runs as the Postgres `authenticated` role, so RLS fires.
 *  Built fresh per request (do NOT memoize — the token is per-caller). */
export function authenticatedClientForCaller(
  caller: { token: string },
): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${caller.token}` } },
    },
  );
}

/** The named escape hatch for the master-key client (ADR-0004). Admin/system
 *  paths only. Distinct from authenticatedClientForCaller: this BYPASSES RLS. */
export function requireServiceRole(): SupabaseClient {
  return getSupabaseService();
}
```

Re-export both from `lib/adapters/supabase/index.ts`.

**🗣 Two clients, one purpose each:** `authenticatedClientForCaller` is the keycard
(RLS decides). `requireServiceRole()` is the master key (RLS skipped) with a name on
it so future code that bypasses RLS does so *visibly and on purpose*. The minter
(Slice 1) hands the token to the factory; the factory bolts it onto the Bearer header.

**Note (signature):** the factory takes `{ token }`, not `{ userId, role }`, so the
minter (vendor-free port) stays the single place that knows claim shape. A future
route does: `mint({ userId }) → authenticatedClientForCaller({ token })`. The two
compose in a use-case/route in F-RLS-04a, NOT here.

### Slice 3 — The GUC bridge migration

**Step 3.1.** Author `supabase/migrations/<14-digit>_db_pre_request_guc_bridge.sql`.
Filename: 14-digit `YYYYMMDDHHMMSS` prefix to sort AFTER `20260613020000_…`
(F-TD-15 convention; pick the actual ship timestamp at commit, e.g.
`20260614HHMMSS_db_pre_request_guc_bridge.sql`). Body sketch:

```sql
-- ============================================================
-- F-RLS-03 — db-pre-request GUC bridge (app-minted token → app.current_user_id)
-- ADR-0007. ADDITIVE: function + role attribute + reload. No DROP/ALTER TYPE.
-- INERT for service_role traffic (service_role does not run db_pre_request
-- claim logic against a user id it never carries; GUC left empty = existing
-- policies unaffected for the current master-key paths).
-- Rollback: ALTER ROLE authenticator RESET pgrst.db_pre_request; NOTIFY pgrst,'reload config';
-- ============================================================

CREATE OR REPLACE FUNCTION public.db_pre_request()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claims json;
  v_uid    text;
BEGIN
  -- Defensive: NEVER throw. Any doubt → leave GUC empty (fail-closed = deny).
  BEGIN
    v_claims := current_setting('request.jwt.claims', true)::json;
    v_uid := v_claims ->> 'user_id';
    IF v_uid IS NULL OR v_uid = '' THEN
      v_uid := v_claims ->> 'sub';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_uid := NULL;
  END;

  PERFORM set_config('app.current_user_id', COALESCE(v_uid, ''), true);  -- is_local = true
END $$;

ALTER ROLE authenticator SET pgrst.db_pre_request = 'public.db_pre_request';
NOTIFY pgrst, 'reload config';
```

**Verification points the implementer MUST confirm (do not assume):**
1. **Claim-access path.** Confirm PostgREST exposes verified claims at
   `current_setting('request.jwt.claims', true)::json` on the version Supabase runs.
   This is the documented Supabase/PostgREST GUC. Prove it in the Slice-4 integration
   test (the test fails if the path is wrong), and additionally `SELECT` the claims in
   a scratch query against the preview branch during Render. 🗣 We don't trust the
   docs blind — the integration test is the proof the doorman reads the right field.
2. **Role name.** `authenticator` is the PostgREST connection role on Supabase that
   `SET ROLE`s to `authenticated`/`anon`. The `db_pre_request` attribute lives on
   `authenticator`. Confirm against the preview DB (`\drg` / `pg_roles`) before ship.
3. **`is_local := true`** scopes the GUC to the current transaction — matches how
   existing policies read it and avoids leaking identity across pooled connections.
   🗣 The clipboard is wiped at the end of each request, never carried to the next.

**Why it is genuinely inert for service_role (load-bearing safety argument):**
The hook only ever *writes* `app.current_user_id` from a token's claim. Current
master-key (`service_role`) traffic: (a) bypasses RLS entirely (ENABLE not FORCE), so
the GUC value is irrelevant to it; and (b) carries no `request.jwt.claims.user_id`, so
the hook leaves the GUC empty. Either way no currently-passing route changes behaviour.
The implementer MUST add an integration assertion proving a service-role query still
returns rows after the migration (regression guard — see Step 4.4).

**Step 3.2 (ship-time, NOT now).** At ship, apply to prod via Supabase MCP
`apply_migration` with the 14-digit filename (F-TD-15) — **flag for Hakan/conductor;
the planner/implementer does NOT apply it.** Never `supabase db push`.

### Slice 4 — The end-to-end bridge proof (integration)

**Step 4.1.** Write `tests/integration/adapters/supabase/rls-bridge.test.ts`. It runs
against the booted server's Supabase (local for `npm run test:integration`; the
preview branch in CI). Uses `getServiceClient()` + `setupTestUsers()` from `_setup.ts`
to seed a known user, and the real `createWebCryptoDbTokenMinter` (same pattern as
`session-signing.test.ts` uses the real session adapter) with
`getSecret: () => process.env.SUPABASE_JWT_SECRET`.

Choose a table with an existing GUC `SELECT` policy that returns rows for ANY
authenticated user — **`customers`** is ideal: `customers_select` allows the read iff
`app.current_user_id` is non-empty (baseline line 2449). That isolates "did the bridge
set the GUC" from per-role logic.

**Step 4.2 (deny case).** Build an anon-key client WITHOUT a valid token (or with no
Bearer) and `select` from `customers`. Assert: zero rows / RLS denial. 🗣 No keycard →
the door stays shut.

**Step 4.3 (allow case).** `mint({ userId: seededUser.id })` →
`authenticatedClientForCaller({ token })` → `select` from `customers`. Assert: the
seeded customer row(s) come back. This proves: token verified → PostgREST exposed the
claim → `db_pre_request` wrote `app.current_user_id` → `customers_select` passed. 🗣
Valid keycard → doorman copies your id to the clipboard → the existing rule lets you in.

**Step 4.4 (inert regression).** A `getServiceClient()` (service-role) `select` from
`customers` still returns rows after the migration. 🗣 Proof the master-key path the
83 routes use is untouched.

**This integration test is the load-bearing proof of the unit** (zero prod routes
flip, so this is the only thing that demonstrates the mechanism works). If 4.2/4.3
can't pass on the preview branch, the unit is not done.

### Slice 5 — Lint-mirror guard

**Step 5.1 (RED).** Add cases to `tests/unit/lint/no-adapter-imports.test.ts`
(loads the shipped `.eslintrc.json`):
- `@supabase/supabase-js` imported in `lib/services/Foo.ts` → still 1 error (parity).
- The new authenticated-client module reached directly from `app/**` →
  flagged. **Decision:** forbid importing
  `@/lib/adapters/supabase/authenticatedClient` and reading
  `SUPABASE_JWT_SECRET`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` outside the adapter folder is
  best enforced by the EXISTING patterns rule (`@/lib/adapters/**` already banned in
  services/usecases) plus the existing `@supabase/supabase-js` path rule. **The new
  guard to add:** a `no-restricted-imports` path entry (or a small `no-restricted-syntax`
  rule) is NOT needed for the anon key import because anon-key usage is confined to the
  adapter by the existing `@supabase/supabase-js` ban (the anon client is built with
  `createClient`, which already can't be imported outside the adapter). **Therefore the
  lint-mirror addition is: assert the anon-key authenticated client cannot be
  constructed outside `lib/adapters/supabase/` because `createClient` is already banned
  there — add one pin case proving `createClient` in `app/api/foo/route.ts` is
  rejected.** 🗣 The new client needs no brand-new rule — the existing
  "no `@supabase/supabase-js` outside the adapter" wall already fences it in; we just
  pin a test that proves it.

**Step 5.2 (GREEN).** If Step 5.1 shows a gap (e.g. `SUPABASE_JWT_SECRET` could be read
in a route), add a minimal guard. Otherwise: no `.eslintrc.json` change, only the new
pin assertions. **Decide and record in the PR which way it went.**

**🗣 Why this matters:** F-10/F-12 each added a vendor-import wall and pinned it so the
wall can't be quietly deleted. Here the wall mostly already exists — the value is the
*pin* proving the new minter/secret/anon-client surface stays inside its adapter.

---

## TDD order, commit plan, rollback

**Commit sequence (atomic, each green before the next):**
1. `feat(rls): DbTokenMinter port + web-crypto adapter (F-RLS-03)` — Slice 1 + unit test.
2. `feat(rls): authenticated Supabase client + requireServiceRole (F-RLS-03)` — Slice 2 + unit test.
3. `feat(rls): db-pre-request GUC bridge migration (F-RLS-03)` — Slice 3 (file only; applied at ship).
4. `test(rls): end-to-end bridge proof integration test (F-RLS-03)` — Slice 4.
5. `test(rls): pin authenticated-client adapter confinement (F-RLS-03)` — Slice 5.

Branch off `main` (e.g. `f-rls-03-authenticated-db-client`); open a PR. PR description
MUST state: "no new `package.json` entry" and the dependency-justification line
(reuses existing web-crypto + `@supabase/supabase-js`).

**Rollback story (per artefact):**
- Code (minter, factory, escape hatch, wiring): pure additions importing nothing into
  the existing path → revert the PR, zero production impact (nothing called them).
- Migration: `ALTER ROLE authenticator RESET pgrst.db_pre_request; NOTIFY pgrst, 'reload config';`
  then optionally `DROP FUNCTION public.db_pre_request();`. Instant, no data touched.
  🗣 Unset the doorman and reload — the door config returns to exactly today's.

## Acceptance criteria

1. New files exist at the paths above; `npm run lint` + `tsc` clean.
2. Unit tests green: minter produces a verifiable HS256 JWT with the stated claim
   shape + 60s TTL; factory attaches `Authorization: Bearer`; `requireServiceRole()`
   returns the service client.
3. Integration test green on the preview branch: deny without token (4.2), allow with
   token (4.3), service-role still reads (4.4 — inert proof).
4. `package.json` unchanged (no new dependency). Verified in PR.
5. Zero production routes rewired; `supabaseService` and all 83 call sites untouched;
   no existing migration/policy edited.
6. Migration is additive only (no DROP/TRUNCATE/ALTER TYPE/DROP NOT NULL); rollback
   block present in the migration header.
7. Lint-mirror pin proves the new client surface stays inside `lib/adapters/supabase/`.
8. Ship checklist flags: (a) `SUPABASE_JWT_SECRET` in Vercel Prod + Preview + local;
   (b) migration applied to prod via MCP `apply_migration` (14-digit), by Hakan.

---

## Risk Assessment

### Concurrency / race conditions — **MEDIUM** (mitigated)

The `db-pre-request` hook writes `app.current_user_id` with `set_config(..., is_local := true)`,
which scopes the value to the current transaction. Supabase uses a connection pooler;
without `is_local := true` a GUC could leak from one request to the next on a reused
pooled connection — a cross-user identity bleed. **Mitigation:** `is_local := true` is
mandatory and asserted by the integration test (run two queries with different
seeded users on the same client and confirm each sees only its own GUC effect — add
this as a second allow-case assertion). **Must-fix:** NO for the unit to ship (the
hook is inert until a route flips), but the `is_local := true` flag is **must-have in
the migration** — a non-local `set_config` would be a latent cross-tenant leak the
moment F-RLS-04a flips Orders. Flag prominently for code-critic.
🗣 The clipboard must be per-request, or two users could read each other's id. We pin that.

### Security — **MEDIUM** (mitigated)

- **Throwing hook = global outage.** `db-pre-request` runs on EVERY authenticated-role
  request once set. A hook that raises fails-closed *all* such traffic. **Mitigation:**
  the function body wraps claim parsing in `BEGIN…EXCEPTION WHEN OTHERS` and never
  throws; missing/invalid claim → empty GUC → deny (correct fail-closed). Because the
  unit flips zero routes, even a buggy hook can't take down current traffic — but the
  defensive shape is mandatory before F-RLS-04a. **Must-fix:** the never-throw property
  is a hard requirement on the migration.
- **Secret handling.** `SUPABASE_JWT_SECRET` is server-side only, read in exactly one
  wiring file, never logged (mirror `SessionTokens`' no-log invariant). **Mitigation:**
  lint-mirror pin + code review confirm no `NEXT_PUBLIC_` exposure and no logging.
- **Token lifetime.** 60s TTL minimises replay window; tokens minted per request,
  never persisted, never sent to the browser. 🗣 Short-lived note, server-to-database only.

### Data migration — **LOW**

The migration touches no rows and no schema types: it adds one function and one role
attribute. No backfill, no PITR gate (ADR-0007 §Consequences). Rollback is instant
(`RESET` the attribute). **Must-fix:** NO.

### Business-logic flaws — **MEDIUM** (the inertness claim is the crux)

The entire safety case rests on "the bridge is inert for current service_role
traffic." If that's wrong, this unit silently changes a currently-passing route's
behaviour. **Mitigation:** Step 4.4 integration assertion proves a service-role read
still returns rows post-migration; plus the argument that service_role bypasses RLS
(ENABLE not FORCE) AND carries no claim, so the GUC value can't bite it. **Must-fix:**
the inert-regression assertion (4.4) is required before ship.
🗣 We must *prove* the old path is untouched, not just believe it.

### Launch blockers — **MEDIUM** (prerequisite + verification gating)

- **`SUPABASE_JWT_SECRET` not provisioned** in all three places → integration test
  can't verify → unit can't be proven. **Mitigation:** called out as a Render
  prerequisite above; Hakan provisions before Render.
- **Claim-access path / role name unverified.** If
  `current_setting('request.jwt.claims', true)` isn't how Supabase's PostgREST exposes
  claims, or `authenticator` isn't the role carrying `pgrst.db_pre_request`, the bridge
  silently never sets the GUC and the allow-case (4.3) fails. **Mitigation:** the
  integration test is the verification — it fails loudly if either assumption is wrong;
  plus a scratch claims-`SELECT` during Render. **Must-fix:** NO (the test gates it),
  but it's the most likely cause of a Render-phase surprise — implementer should verify
  these two facts against the preview DB FIRST, before writing the allow-case.

### Must-fix summary (Gate 2 relevant)

No must-fix risk **blocks the plan from proceeding to Order/Render** — the unit is
introduce-only and inert. But three properties are **mandatory in the build** and a
code-critic blocker if absent:
1. `set_config(..., is_local := true)` in the bridge (cross-request leak guard).
2. The hook never throws (defensive `EXCEPTION WHEN OTHERS`).
3. The Step 4.4 inert-regression assertion (proves service-role path untouched).

---

## Hexagonal check (populates Gate 2)

- **Ports used / added:** ADDS `DbTokenMinter` (`lib/ports/DbTokenMinter.ts`) — a
  vendor-free contract for minting a DB identity token. USES existing repository ports
  unchanged. Does NOT add a port that hands out a `SupabaseClient` (that would leak the
  vendor type — correctly kept as an adapter-internal factory).
- **Adapters implementing them:** `lib/adapters/web-crypto/DbTokenMinter.ts` (minter);
  `lib/adapters/supabase/authenticatedClient.ts` (per-request authenticated client +
  `requireServiceRole()`). Both vendor code stays inside adapter folders.
- **New dependencies:** **NONE.** Token minted with the existing Web Crypto HMAC
  primitive; client built with the already-present `@supabase/supabase-js`.
  `package.json` unchanged. (Justification line for PR: "reuses existing
  `lib/adapters/web-crypto` HMAC + existing `@supabase/supabase-js`; no new package.")
  No single-use vendor to wrap.
- **Vendor leak:** none — `SupabaseClient` never crosses the adapter boundary; the
  factory returns it only to other adapter/wiring code, and F-RLS-04a will consume it
  inside a route/use-case via wiring, mapping to domain types as repos already do.
- **Rip-out test:** PASS. Replacing Supabase still costs one new adapter folder
  (`authenticatedClient.ts` + repos) + one wiring line; the new `DbTokenMinter` port is
  vendor-free and its adapter is swappable independently.

**Hexagonal verdict line:** Adds `DbTokenMinter` port → web-crypto adapter; adds
authenticated-client + `requireServiceRole()` Supabase adapter; **zero new deps**;
**rip-out test PASS.** No Gate 2 hexagonal blocker.
