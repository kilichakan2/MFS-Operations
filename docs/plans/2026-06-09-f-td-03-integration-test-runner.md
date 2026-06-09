# F-TD-03 — Self-contained, production-safe `npm run test:integration`

## Goal

Make `npm run test:integration` one self-contained command that auto-boots
a Next.js dev server wired **only** to local Supabase (from
`.env.test.local`, never `.env.local`), runs the vitest integration
suite, shuts the server down, and fails fast with actionable messages
when prerequisites are missing — and, with the runner fixed, repair the
failing Orders integration tests (all currently failing because no
server is auto-booted).

## Source spec

Locked at FORGE Gate 1 (2026-06-09). Option A approved: vitest-side
auto-boot mirroring the proven Playwright `webServer` pattern in
`playwright.config.ts`. Scope: test infrastructure + stale test
expectations + missing local seed data only. **Zero production app code
changes.**

## Compliance

**NO** — no auth, payments, data retention, HACCP, legislation, or
financial logic changes. Test infrastructure only. Relevant rules:

- CLAUDE.md "Local test infrastructure" — this plan updates that
  section's command list (section 6 below).
- CLAUDE.md "Dependency justification" — **no new dependencies**.
  Everything needed (`dotenv`, `bcryptjs`, Node `child_process`) is
  already in the tree.
- ADR-0003 (`docs/adr/0003-*`) — the F-04 lint FREEZE allow-lists
  `tests/**` for `@supabase/supabase-js`; all files this plan touches
  live under `tests/integration/` or are config/docs, so no FREEZE
  exemption is needed.
- Production-safety invariant: the spawned dev server must verifiably
  point at localhost Supabase before any test traffic flows (decision
  D4 below).

## Branch + base

- Branch: `fix/f-td-03-integration-test-runner`
- Base: `main` at `c9a997e`
- Commit style: `fix(testing): ... (F-TD-03)`

## Root cause (confirmed 2026-06-09, do not re-investigate)

`vitest.integration.config.ts` requires a server at the integration
base URL but nothing starts one. Observed firsthand on this machine
(local Supabase up, no dev server): **30 failed / 62 passed (92
tests)** — every failure is `ECONNREFUSED :3000` raised from the
`api()` helper at `tests/integration/_setup.ts:235`. Failing files:
`orders-crud.test.ts` (12), `picking-list.test.ts` (8), `kds.test.ts`
(10). All other suites pass (they hit Supabase directly, not the app
server).

The FORGE baseline's different shape (23/49, middleware-only cases
passing) is explained by a dev server happening to be running during
that probe — almost certainly wired to `.env.local` (production), where
cookie-only middleware checks pass but DB-touching cases fail because
the ANVIL fixtures only exist in the local DB. The reported green run
at F-04 ship time is the same coin's other face: a dev server happened
to be running **and** wired to local Supabase. That nondeterminism is
exactly what this unit removes. Do not investigate further.

**Worse than flaky:** the documented manual procedure
(`tests/integration/_setup.ts:9-11`, `vitest.integration.config.ts:10-14`
— "run `npm run dev` in another terminal") boots the server against
`.env.local` = production. The test-side guard at `_setup.ts:38` only
checks the **test process** env, not the server's. This plan deletes
that documented footgun.

## Pre-audit: are the 30 failing tests stale?

Audited every assertion in the three failing files against the current
routes on `main` (the Orders routes are untouched since SB2/SB4 — F-08
route migration has not happened yet). **No stale assertions found.**
Evidence:

| Expectation                                                                                 | Route reality                                                                                                                                                                                                                                                         | Verdict |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| No-cookie `/api/orders` → 307 (`orders-crud.test.ts:34`, `picking-list.test.ts:44`)         | `middleware.ts:106-113` redirects to `/login` (307); `/api/orders` not in `PUBLIC_PATHS`                                                                                                                                                                              | matches |
| Cookied role checks 401 driver/butcher POST (`orders-crud.test.ts:42,56`)                   | `/api/orders` is in `SHARED_API_PATHS` (`middleware.ts:81`) so middleware passes through; `app/api/orders/route.ts:88` returns 401 for roles outside `ROLES_CREATE`                                                                                                   | matches |
| Validation 400s incl. unknown `product_id` (`orders-crud.test.ts:70-105`)                   | `app/api/orders/route.ts:96-99,132`                                                                                                                                                                                                                                   | matches |
| 201 + `reference` `/^MFS-\d{4}-\d{4}$/` (`orders-crud.test.ts:123-126`)                     | `generate_order_reference()` in `supabase/migrations/20260530_001_order_pipeline_schema.sql:52-64` formats `MFS-YYYY-NNNN`                                                                                                                                            | matches |
| Edit-permission matrix 200/403 (`orders-crud.test.ts:152-211`)                              | `app/api/orders/[id]/route.ts:105-113`                                                                                                                                                                                                                                | matches |
| Picking-list: sales 401, HTML + placed→printed, reprint audit, completed 403, GET read-only | `app/api/orders/[id]/picking-list/route.ts` (`ROLES_PRINT = admin/office/warehouse`, line 38)                                                                                                                                                                         | matches |
| KDS: public 200, pin 200/401/400, done 200/400/403/409, `already_done`, auto-`completed`    | `/api/kds` + `/api/auth/kds-pin` in `PUBLIC_PATHS` (`middleware.ts:29`); statuses at `app/api/kds/lines/[lineId]/done/route.ts:48,55,66,69,72,93,109,115,165` and `app/api/auth/kds-pin/route.ts:37,73`; `KDS_ALLOWED_ROLES = ['butcher','warehouse']` so sales → 403 | matches |

Seed note: `supabase/seed.sql` seeds users only — no products or
customers. That is fine: `_setup.ts` fixtures self-create
(`setupTestCustomer`, `getTestProduct` fall back to inserting
`ANVIL-TEST-*` rows). No seed change is expected; only add one if step
7's run proves otherwise.

So the expected outcome is: fix the runner → all 30 pass. Step 7 has
the checklist for any residual failure.

## Design decisions (locked — implementer does not re-litigate)

### D1 — Mechanism: vitest `globalSetup`, dedicated port, never reuse

A new `tests/integration/_globalSetup.ts` wired into
`vitest.integration.config.ts` (`globalSetup` option). It spawns the
project-local Next binary (`node_modules/.bin/next dev -p <port>`) via
Node `child_process.spawn`, polls readiness, returns an async teardown
that kills the process group. Zero new deps.

Why not the alternatives:

- **Reusing Playwright as runner** — would force rewriting 92 vitest
  tests into Playwright specs or running vitest under a Playwright
  wrapper; disproportionate.
- **Wrapper npm script** (bash/concurrently) — shell-level process
  orchestration is fragile (orphaned servers on Ctrl-C), and
  cross-checking readiness/teardown in bash is worse than 60 lines of
  TypeScript that vitest already gives lifecycle hooks for.

**Port: dedicated `3100`** (override via `INTEGRATION_PORT`), not 3000.
Reasoning: an already-running server on 3000 is precisely the dangerous
case (likely wired to `.env.local` = prod), and we cannot introspect a
foreign server's env without adding an app endpoint — which is out of
scope. Playwright's `reuseExistingServer: true` has this hole; we do
not copy it. If port 3100 is already occupied, **fail fast** with:
"Port 3100 is in use. The integration runner always boots its own
server and never reuses one (it cannot verify a foreign server's
Supabase wiring). Free the port or set INTEGRATION_PORT."

**`INTEGRATION_BASE_URL` support is removed** from `_setup.ts` — it was
the second half of the footgun (pointing tests at an arbitrary,
unverifiable server). The base URL is now always
`http://localhost:${INTEGRATION_PORT ?? 3100}`, computed in one shared
module (section 1).

### D2 — Spawned server env: explicit overrides beat `.env.local`

The child process env is `{ ...process.env, NEXT_PUBLIC_SUPABASE_URL,
SUPABASE_SERVICE_ROLE_KEY, PORT }` where the two Supabase values come
from `.env.test.local` (parsed with `dotenv`, already a devDependency).
Next.js (`@next/env`) **does not overwrite variables already present in
the process environment** — `.env.local` is only consulted for keys not
already set. This is documented Next.js behaviour and is the exact
mechanism the repo's Playwright `webServer` block
(`playwright.config.ts:69-78`) already relies on in anger.
`lib/supabase.ts:16-17` reads exactly these two keys, so nothing else
needs overriding for the Orders routes. The implementer must still
verify the claim end-to-end via the D4 identity probe — belt and
braces, not trust.

### D3 — `db:reset` stays a documented prerequisite, not part of the command

Reasons: (a) reset is slow (~10s+) and would tax every inner-loop run;
(b) it destroys local data a developer may be inspecting — too violent
for an implicit side effect; (c) the fixtures in `_setup.ts` are
self-creating, so a merely-stale DB does not break the suite;
(d) `_assertStack.ts` already fast-fails when the stack is down
entirely. CLAUDE.md documents the prerequisite (section 6).

### D4 — Layered production-safety guards, including a server-side DB identity probe

Four layers, in order:

1. **Env-file guard (before spawn):** `_globalSetup.ts` fails fast if
   `.env.test.local` is missing, or if its `NEXT_PUBLIC_SUPABASE_URL`
   is not `localhost`/`127.0.0.1`, or contains the prod project ref
   `uqgecljspgtevoylwkep`. Message names the file and the fix.
2. **Explicit child env (D2)** — the spawned server never sees a
   Supabase URL we didn't choose.
3. **DB identity probe (after readiness, before any test runs):** prove
   the _running server_ reads the **local** DB, with no app code change:
   - via the local service client, insert a sentinel user
     (`ANVIL-TEST-sentinel-<random>`, role `butcher`, active, with a
     bcrypt hash of a random 8-digit PIN — `bcryptjs` is already a
     dependency and `kds.test.ts:36` uses this exact pattern);
   - `POST <baseUrl>/api/auth/kds-pin` with that PIN (public route, no
     cookies — `middleware.ts:29`);
   - assert HTTP 200 **and** returned `id` equals the sentinel's local
     id; otherwise kill the server and throw: "Spawned dev server is
     not reading the local Supabase database — refusing to run tests.
     Check .env.test.local."
   - delete the sentinel via the service client (also delete in
     teardown and in every failure path).
     The probe direction matters: we write locally and **read** through
     the server. Never probe by writing through the server — if the
     wiring were wrong, that write would land in production.
4. **Existing test-process guard** at `_setup.ts:38` stays untouched.

### D5 — Fast-fail probes, house style

`_assertStack.ts` (Supabase probe) keeps its pattern and gains a
sibling probe of the app server (`GET <baseUrl>/login`, 3s timeout) so
that running `vitest --config vitest.integration.config.ts` in any
unforeseen way still dies with an actionable message rather than 30
`ECONNREFUSED` stack traces. With `globalSetup` booting the server this
probe normally always passes; it is defence in depth.

## Implementation

### 1. Shared config module — `tests/integration/_config.ts` (new, ~20 lines)

- Exports `INTEGRATION_PORT` (`process.env.INTEGRATION_PORT` parsed as
  int, default `3100`) and `INTEGRATION_BASE_URL`
  (`http://localhost:${INTEGRATION_PORT}`).
- Imported by `_globalSetup.ts`, `_setup.ts`, and `_assertStack.ts` —
  single source of truth so the booted server and the tests can never
  disagree on the URL.
- Header comment explains D1's no-reuse decision in two sentences.

Checkpoint: `npx tsc --noEmit` clean.

### 2. Global setup/teardown — `tests/integration/_globalSetup.ts` (new, ~150 lines)

Default-export async function (vitest `globalSetup` contract; return
value is the teardown). Steps inside, in order:

1. Load `.env.test.local` via `dotenv` (`globalSetup` runs in its own
   process — `_loadEnv.ts` only runs in test workers, so load here
   too). Run the D4 layer-1 env-file guard.
2. Probe local Supabase (reuse `assertLocalStackReachable` from
   `_setup.ts` — it is already exported).
3. Check port `INTEGRATION_PORT` is free (attempt a `net.createServer`
   listen, or fetch with short timeout); if occupied, throw the D1
   message.
4. Spawn `node_modules/.bin/next dev -p <port>` with `cwd` = repo root,
   the D2 env, `detached: true`, `stdio: 'pipe'`; buffer stdout+stderr
   (ring buffer, last ~100 lines).
5. Poll `GET <baseUrl>/login` every 500 ms until HTTP < 500, timeout
   **90 s** (first dev-mode compile is slow). On timeout or early child
   exit: kill, then throw including the buffered server output so the
   developer sees the real boot error.
6. Run the D4 layer-3 DB identity probe (sentinel kds-pin round-trip).
7. Return teardown: delete sentinel if still present, `process.kill(-child.pid,
'SIGTERM')` (process group — `next dev` spawns children), wait up to
   5 s for exit, then SIGKILL the group. Also register a `SIGINT`/`exit`
   handler that does the same so Ctrl-C never orphans the server.

Every `throw` after step 4 must kill the child first (wrap in
try/catch).

Checkpoints (run each; expect the exact failure mode):

- a. Rename `.env.test.local` → run `npm run test:integration` → clear
  "missing .env.test.local" message, no server spawned. Rename back.
- b. `npm run db:down` → run → clear "Supabase unreachable, run npm run
  db:up" message. `npm run db:up` after.
- c. Occupy port 3100 (`python3 -m http.server 3100`) → run → clear
  port-in-use message. Free it.
- d. Normal run → server boots, identity probe passes, suite executes,
  server is gone afterwards (`lsof -i :3100` empty) and no
  `ANVIL-TEST-sentinel-*` rows remain in the local `users` table.
- e. Ctrl-C mid-run → no orphaned `next dev` on port 3100.

### 3. Wire into config — `vitest.integration.config.ts`

- Add `globalSetup: ['./tests/integration/_globalSetup.ts']`.
- Replace the header comment's prerequisites block (lines 10-14): the
  manual "Next.js dev server running (npm run dev)" instruction is
  **deleted** (it is the production footgun); new prerequisites are
  only (1) local Supabase running, (2) `.env.test.local` present.
- Keep setupFiles, serial single-fork pool, timeouts exactly as they
  are.

### 4. Update `tests/integration/_setup.ts`

- Replace the `BASE_URL` line (line 28) with an import from
  `_config.ts`; **remove** `INTEGRATION_BASE_URL` env support (D1).
- Rewrite the header comment (lines 9-16): remove "npm run dev in one
  terminal", document the self-contained runner, keep the
  never-production warning.
- No change to the prod guard (line 38), fixtures, `api()`, or
  `cleanupTestData()`.

### 5. Extend fast-fail — `tests/integration/_assertStack.ts`

- Add `assertAppServerReachable(timeoutMs = 3_000)` (in `_setup.ts`
  next to `assertLocalStackReachable`, same shape/house style): probe
  `GET ${INTEGRATION_BASE_URL}/login`; on failure throw "App server not
  reachable at <url> — npm run test:integration boots it
  automatically; if you are running vitest directly, don't."
- Call it in `_assertStack.ts` after the Supabase probe.

### 6. Docs — `CLAUDE.md` "Local test infrastructure" section

- Add to the daily-commands list, after the db commands:
  `npm run test:integration` — vitest integration suite
  (auto-boots a dev server on port 3100 wired to local Supabase from
  `.env.test.local`; prerequisites: `npm run db:up` once, and
  `npm run db:reset` if you want a fresh seed).
- Extend the closing safety paragraph to mention the vitest runner now
  shares the same `.env.test.local` invariant **plus** a server-side DB
  identity probe.
- No other CLAUDE.md edits.

### 7. Repair the failing tests

1. Run `npm run test:integration` (now self-contained) against a fresh
   `npm run db:reset`.
2. **Expected: 92/92 pass** — the pre-audit found no stale assertions.
3. For each residual failure, apply this checklist in order:
   - (a) Read the failure; is it environmental (timeout, missing
     fixture)? → fix the fixture/seed in `tests/integration/_setup.ts`
     or `supabase/seed.sql` (seed changes are in scope per the locked
     spec).
   - (b) Compare the assertion against the route source (table in the
     pre-audit section gives file:line for every case). Test
     expectation contradicts route code that is **correct per its plan**
     (`docs/plans/2026-05-30-order-pipeline-kds-implementation.md`)? →
     fix the test, cite the route line in the commit message.
   - (c) Route behaviour contradicts its own plan/spec — i.e. a **real
     app bug**? → **STOP. Do not fix it. Do not continue to other
     repairs that depend on it.** Report the bug (file, line, expected
     vs actual, which test exposed it) back to Hakan; he decides
     whether the fix lands in its own unit or in F-08.
4. Run the full suite **twice in a row** (state-leak check — the suite
   shares DB state by design) and once with `npm run db:reset` between.

### 8. Backlog entry — `docs/plans/BACKLOG.md`

Add one deferred line (F-PROD-): "One-off production hygiene check:
query prod `users`/`customers`/`orders` for `ANVIL-TEST-*` rows that
earlier mis-wired integration runs may have left; delete if found."
This plan must NOT touch production — record it and move on.

### Suggested commits

1. `fix(testing): shared integration config + global setup boots dev server on local Supabase (F-TD-03)` — sections 1-3
2. `fix(testing): app-server fast-fail probe + remove manual dev-server footgun docs (F-TD-03)` — sections 4-5
3. `fix(testing): CLAUDE.md test commands + BACKLOG prod-hygiene entry (F-TD-03)` — sections 6, 8
4. (only if step 7 finds stale tests/seed gaps) `fix(testing): repair <area> integration expectations (F-TD-03)`

## Test plan

- The integration suite itself is the test: `npm run test:integration`
  goes from 30 failed / 62 passed to **92 / 92 green**, twice in a row,
  with no manually started server anywhere.
- Negative-path checkpoints in section 2 (missing env file, stack down,
  port occupied, Ctrl-C) each produce their specific actionable message
  and leave no orphan process and no sentinel rows.
- Regression: `npm run test` (unit) and `npm run test:e2e:api` still
  pass unchanged; `npx tsc --noEmit` and `npm run lint` clean.
- No new test files are required beyond the suite that already exists —
  the deliverable is the runner; its acceptance is behavioural
  (checkpoints above). Pure-function extraction for unit-testing the
  guards was considered and rejected as over-engineering for ~30 lines
  of guard logic exercised directly by checkpoints a-d.

## Risks and open questions

- **Two `next dev` instances sharing `.next/`** — if a developer's own
  dev server (port 3000) is running, the spawned 3100 instance shares
  the `.next` build dir; Next 15 dev mode generally tolerates this but
  lock contention is possible. If the implementer observes corruption
  or flaky boots, fail fast when port 3000 is also serving this app and
  say "stop your dev server first" — do NOT add a `distDir` switch
  (that's `next.config` = app config, out of scope). Note whichever
  behaviour was observed in the PR description.
- **Env precedence assumption (D2)** — documented Next.js behaviour and
  proven by the repo's Playwright path, but the D4 identity probe is
  the hard guarantee; if the probe ever fails on a correct
  `.env.test.local`, suspect a Next version change in env loading and
  STOP/report.
- **90 s readiness budget** — first-compile on a cold cache may exceed
  it on slow machines; the timeout is a named constant, bump to 120 s
  if checkpoint d flakes.
- **Baked-in assumption:** the 30 failures are purely environmental
  (strong evidence: every failure is `ECONNREFUSED`; pre-audit found
  zero assertion drift). If reality disagrees after the runner works,
  step 7's checklist governs — including the hard STOP on real app
  bugs.
- **Out of scope, explicitly:** any change under `app/`, `components/`,
  `lib/` (except nothing — no lib changes are planned at all),
  `middleware.ts`, `next.config.*`, or `supabase/migrations/`. Seed
  (`supabase/seed.sql`) only if step 7 proves a gap. No port/adapter
  work. No production cleanup (section 8 defers it).
