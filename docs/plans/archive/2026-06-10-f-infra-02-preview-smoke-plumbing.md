# F-INFRA-02 — Per-PR preview smoke plumbing (Supabase preview branches + Vercel bypass)

## Goal (PRD — the destination)

Every pull request can be rehearsed end-to-end before it ships: the three
`@critical` order-pipeline robot tests (place an order, print the picking
list, work it through the kitchen screen) run against that PR's deployed
Vercel preview build, wired to a disposable Supabase preview branch that is
born with migrations + test fixtures and dies when the PR closes — with a
hard, fail-closed guarantee that production data is never touched.

> **🗣 In plain English:** before we merge any change, a robot clicks through
> the three most important business flows on a real deployed copy of the app
> that talks to a throwaway copy of the database. If that throwaway copy
> isn't there or anything smells like production, the check refuses to run
> and the change does not ship.

This is hard prerequisite #3 for F-08 (Orders route rewrites) per
`docs/plans/BACKLOG.md` "F-08 hard prerequisites".

**🗣 In plain English:** F-08 is the first change that alters what users
actually see in the Orders screens — it is not allowed to ship until this
safety net exists.

## Source spec

Locked at FORGE Gate 1 (2026-06-10). All seven decisions are final (per-PR
Supabase branches on the Pro plan; no preview ever carries prod credentials;
smoke is FORGE-run at Gate 4 from the conductor's machine, no CI; seed.sql
gains an ANVIL-TEST block; bypass secret in gitignored `.env.e2e.local`;
local flows byte-identical when `BASE_URL` is unset; the unit proves itself
on its own PR). Do not re-litigate.

**🗣 In plain English:** the what and why were already decided and approved;
this document is only the precise how.

## Domain terms used

From `CONTEXT.md` (all three already defined there — no new terms):

- **Preview branch** — disposable per-PR database copy.
- **Preview smoke** — the three `@critical` robot tests run against the PR's
  deployed preview, fail-closed, before Gate 4.
- **ANVIL-TEST fixtures** — dummy customer/product/staff rows prefixed
  `ANVIL-TEST-`, planted by `supabase/seed.sql`, never in production.

⚠️ NEW TERM (proposed for CONTEXT.md, added in step 6): **Seed sentinel** —
a single fixture row with a fixed, hard-coded ID that can only ever exist in
a database created from this repo's seed file. Its presence proves "this
database was born from seed.sql"; its absence proves the opposite.

**🗣 In plain English:** we plant one uniquely-numbered dummy row in every
throwaway database. If the robot can see that row through the deployed app,
the app is definitely talking to a throwaway database, not the real one.

## Compliance

**YES — auth-adjacent and production-data-safety relevant**, in three ways:

1. `supabase/seed.sql` gains users with real bcrypt PIN hashes (test PINs
   only). The hashes are committed; the PINs themselves stay in gitignored
   `.env.e2e.local`. ADR-0006 already accepted this trade-off.
   **🗣 In plain English:** we commit the scrambled form of the test door
   codes, never the codes themselves — and these codes only open doors in
   throwaway databases.
2. The Vercel Protection Bypass secret is a credential. It lives only in
   `.env.e2e.local` (covered by `.gitignore` line 2, `.env*.local` —
   verified) and is never echoed into logs, docs, or commits.
   **🗣 In plain English:** the skeleton key that lets the robot through
   Vercel's front gate is stored in a file git is already configured to
   never pick up.
3. The hard invariant "no preview carries production Supabase credentials"
   is a data-protection control. CLAUDE.md "Local test infrastructure"
   invariants must not regress; that section is updated (step 6), not
   weakened.
   **🗣 In plain English:** today's local-testing safety rules stay exactly
   as strong; we add a new rule for cloud previews on top.

## ADR conflicts

- **ADR-0006** (per-PR Supabase preview branches) — this plan **implements**
  it. Status is currently `Proposed`; step 6 flips it to `Accepted`
  (ratified by Gate 1 lock + this plan). No conflict.
- **ADR-0002 / ADR-0003** (hexagonal shape, strangler-fig + FREEZE) — not
  touched; no app code under `app/` or `lib/` changes in this unit, so no
  port/adapter boundary is crossed.
- **ADR-0004** (service-role security model) — unaffected; previews get the
  _branch's_ service-role key via the integration, never production's.

**🗣 In plain English:** nothing in this plan fights any past architectural
decision — it is the construction work for the most recent one.

## Ports, adapters, dependencies (hexagonal)

- Ports touched: **None** — test infrastructure + seed + docs only.
- New ports introduced: None.
- Adapters touched / added: None.
- New package dependencies: **None.** Everything needed already exists:
  `@playwright/test`, `dotenv`, `bcryptjs` (for generating PIN hashes
  one-off), Node built-ins for the wrapper script.
- Rip-out test passes? **YES** — Vercel/Supabase platform wiring lives in
  their dashboards + two test-only files; swapping either vendor later means
  redoing dashboard wiring + editing `playwright.config.ts` guards and
  `scripts/e2e-preview.mjs`, with zero app-code changes.

**🗣 In plain English:** no new building blocks enter the app itself and no
new third-party code is installed; this is all scaffolding around the
outside of the building.

## Branch + base

- Branch: `feat/f-infra-02-preview-smoke`
- Base: `main` at `9b4ce69`
- Commit style: `feat(testing): ... (F-INFRA-02)` with trailer
  `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`
- ANVIL cert will land at `docs/anvil/2026-06-10-f-infra-02-cert.md`
  (referenced only — not written by this unit's implementer).

**🗣 In plain English:** the work happens on its own side-branch of the code
and is reviewed and certified before joining the main line.

## What the three @critical specs actually need (read from source — binding)

| Spec                                      | Logs in as                                                     | Fixtures required                                                                              |
| ----------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `tests/e2e/01-order-place.spec.ts`        | `ANVIL-TEST-sales` via team PIN (`E2E_PIN_SALES`)              | customer `ANVIL-TEST-customer`, product `ANVIL-TEST-product`                                   |
| `tests/e2e/02-picking-list-print.spec.ts` | `ANVIL-TEST-office` (`E2E_PIN_OFFICE`) then `ANVIL-TEST-sales` | the order created by spec 01                                                                   |
| `tests/e2e/03-kds-butcher-flow.spec.ts`   | `ANVIL-TEST-butcher` via KDS PIN modal (`E2E_PIN_BUTCHER`)     | the order printed by spec 02; butcher PIN must not be `0000` (the wrong-PIN test types `0000`) |

Spec order is enforced by `workers: 1` + alphabetical filenames in
`playwright.config.ts` — 01 creates what 02 needs, 02 prints what 03 needs.
Remote mode must preserve this (it does: we change no `workers` or project
settings).

**🗣 In plain English:** the three robot tests are a relay race — order
placed, then printed, then cooked — so they must run one after another in
that order, and the throwaway database must already contain the dummy
salesperson, office worker, butcher, customer and product they use.

Auth facts (from `app/api/auth/*` + `middleware.ts`, binding for the probe):

- `GET /api/auth/team` is a **public** route returning active
  warehouse/office/sales/driver users (`id, name, role` — no hashes).
- `POST /api/auth/kds-pin` is a **public** route; body `{ pin }`; 200 with
  `{ id, name, role }` when the PIN bcrypt-matches an active
  butcher/warehouse user, 401 otherwise.
- `users_auth_check` DB constraint: admin rows need `password_hash`,
  non-admin rows need `pin_hash`.
- `customers` and `products` have UNIQUE(name) constraints; `users` does not.

**🗣 In plain English:** two doors of the app are open without login — one
lists the team names, one checks a butcher's PIN — and we can use them to
safely interrogate a deployed preview about which database it is reading.

## Files to change

| File                                         | Change                                                                                                            |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `supabase/seed.sql`                          | APPEND clearly-marked ANVIL-TEST fixtures block (existing 39 lines untouched)                                     |
| `playwright.config.ts`                       | Remote-mode detection; skip `webServer`; bypass headers; fail-closed URL/secret guards; conditional `globalSetup` |
| `tests/e2e/_previewProbe.ts`                 | **New** — remote-only globalSetup: DB identity probe (fail closed)                                                |
| `scripts/e2e-preview.mjs`                    | **New** — env-plumbing wrapper for the Gate-4 smoke                                                               |
| `package.json`                               | Two script entries: `test:e2e:preview`, `db:branches` (no new deps)                                               |
| `docs/runbooks/preview-smoke.md`             | **New** — Gate-4 runbook incl. branch-cleanup verification                                                        |
| `CLAUDE.md`                                  | Extend "Local test infrastructure" with the preview-smoke commands + invariant                                    |
| `docs/adr/0006-...md`                        | Status `Proposed` → `Accepted (2026-06-10, F-INFRA-02)`                                                           |
| `docs/plans/BACKLOG.md`                      | Add deferred unit: CI execution of the preview smoke (GitHub Actions)                                             |
| `CONTEXT.md`                                 | Add **Seed sentinel** glossary entry                                                                              |
| `.env.e2e.local` (gitignored, not committed) | Add `VERCEL_AUTOMATION_BYPASS_SECRET`                                                                             |

Explicitly **not** changed: anything under `app/`, `lib/`, `components/`,
`middleware.ts`, `next.config.ts`, `supabase/migrations/`,
`vitest.integration.config.ts`, `.github/workflows/` (stays empty — no CI),
production Vercel env vars, production Supabase. No probe endpoint is added
to the app — the existing public routes (`/api/auth/team`,
`/api/auth/kds-pin`) plus authenticated `/api/reference` are sufficient, so
the "tiny read-only probe endpoint" escape hatch in the spec is **not
needed**.

**🗣 In plain English:** we touch test scaffolding, the database starter
file, and documentation — never the app the business runs on, and never the
production environment.

---

## Step 0 — Platform wiring (MANUAL — Hakan/conductor performs; implementer documents & verifies, changes nothing)

Observed state on this machine (read-only, 2026-06-10): `vercel` CLI not
installed; `supabase` CLI installed but not logged in (`supabase branches
list` → "Access token not provided"); `.vercel/project.json` exists
(project `prj_84NlryZjHcGlA6R2O6zQ57aWkOFZ`, team
`team_WRtx6wNjCoPN95xacOxK6m1e`) — so the repo is linked to Vercel, but
platform state could not be inspected from here. Step 0 therefore lists the
wiring as explicit dashboard actions with verification commands the
conductor runs after `supabase login` (and optionally `npx vercel` — no
global install needed, no new repo dependency).

**🗣 In plain English:** I could see that this computer is connected to the
Vercel project but isn't logged in to the control panels, so the switches
below have to be flipped by Hakan in the web dashboards, then checked from
the terminal.

Sub-steps, in order (all platform-side; nothing here is a code commit):

- [ ] **0.1 Supabase GitHub integration + branching.** In the Supabase
      dashboard for the production project (ref `uqgecljspgtevoylwkep`):
      Settings → Integrations → connect the GitHub repo
      `MFS-Operations`; enable **Branching** with "create a preview branch
      per pull request" and **automatic branch deletion when the PR
      closes/merges**. Supabase branch creation runs
      `supabase/migrations/*` then `supabase/seed.sql` (seed is enabled via
      `[db.seed]` in `supabase/config.toml`, `sql_paths = ["./seed.sql"]`).
      **🗣 In plain English:** tell Supabase to watch our GitHub project and
      automatically build a throwaway database for every pull request —
      pre-loaded with our table structure and dummy data — and to bin it
      when the pull request is finished, so it never keeps costing money.
- [ ] **0.2 Supabase ↔ Vercel integration.** Install/confirm the official
      Supabase integration on the Vercel project, with **Preview
      environment sync enabled**, so each preview deployment receives the
      matching branch's `NEXT_PUBLIC_SUPABASE_URL`, anon key, and
      `SUPABASE_SERVICE_ROLE_KEY`. Verify the injected variable **names**
      match exactly what `lib/supabase.ts` reads
      (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) — if the
      integration uses different names, add Vercel env _mappings_ for the
      Preview environment only; do not touch Production scope.
      **🗣 In plain English:** wire Supabase and Vercel together so each
      preview build automatically gets the keys to its own throwaway
      database — and double-check the key labels match the ones the app
      actually looks for.
- [ ] **0.3 PURGE prod credentials from the Preview scope (the critical
      one).** In Vercel → Project → Settings → Environment Variables:
      list every variable scoped to **Preview**. Any
      `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` (or anon
      key) carrying **production** values in Preview scope must be
      **removed** (Vercel precedence pitfall: manually-set Preview-scope
      vars can shadow integration-injected branch values, silently keeping
      previews on prod). Production-scoped variables are left strictly
      alone.
      **🗣 In plain English:** today, preview builds are handed the real
      database keys — that is the exact hole this unit closes. Delete those
      keys from the preview drawer so the only keys a preview can ever get
      are the throwaway-database ones.
- [ ] **0.4 Vercel Deployment Protection + bypass secret.** Enable
      Deployment Protection (Standard Protection) for the project; under
      "Protection Bypass for Automation" generate the secret and paste it
      into `.env.e2e.local` as `VERCEL_AUTOMATION_BYPASS_SECRET=<value>`
      on the conductor's machine. Never commit it, never echo it.
      **🗣 In plain English:** lock preview builds behind Vercel's gate so
      strangers can't reach them, and give our robot one secret key —
      stored in a file git ignores — to let itself in.
- [ ] **0.5 Record the production hostnames.** From Vercel → Project →
      Domains, note the production domain(s) (custom domain if any, plus
      `<project>.vercel.app`). These exact strings are hard-coded into the
      step-2 deny-list guard. Also note the team/scope slug used in preview
      URLs (`<project>-git-<branch>-<scope>.vercel.app`) for the allow-list
      pattern.
      **🗣 In plain English:** write down the real site's web addresses so
      the robot can be programmed to flatly refuse to test against them.
- [ ] **0.6 Verification (read-only):** `supabase login` once, then
      `supabase branches list` (expect: succeeds, empty or no orphans);
      `npx vercel env ls` (expect: no prod Supabase values in Preview
      scope); open a scratch draft PR _or_ wait for this unit's own PR
      (step 8) to confirm a branch is created and the preview deployment
      receives branch credentials.
      **🗣 In plain English:** prove the switches actually took effect by
      listing what the platforms now believe, before trusting any of it.

Gate: steps 1–8 may be implemented in parallel with 0, but **step 8
(self-proof) cannot run until 0 is complete**, and 0.3 is a **must-fix
launch blocker** (see Risk Assessment).

## Step 1 — `supabase/seed.sql`: append the ANVIL-TEST fixtures block

Files: `supabase/seed.sql` (append only — existing 39 lines, including the
real admin hashes and Emre/Daz/Omer/Mehmet placeholders, are untouched).

Append, under a loud header:

```sql
-- ============================================================
-- TEST FIXTURES (ANVIL-TEST) — MUST NEVER REACH PRODUCTION
-- This file runs ONLY on local `supabase db reset` and on
-- Supabase preview-branch creation. It is never executed
-- against the production project. F-TD-07 audits production
-- for any historical ANVIL-TEST leakage.
-- Shapes mirror tests/integration/_setup.ts (TEST_PREFIX etc.)
-- and the PIN hashes must bcrypt-match the E2E_PIN_* values in
-- the conductor's gitignored .env.e2e.local. (F-INFRA-02)
-- ============================================================
```

Rows (exact content; hashes generated in 1a below):

1. **Seed sentinel customer** — fixed UUID, the load-bearing identity row:
   `INSERT INTO customers (id, name, active, postcode) VALUES
('a417e57e-0000-4e2e-a000-000000000001', 'ANVIL-TEST-SEED-SENTINEL',
true, 'XX1 1XX') ON CONFLICT (name) DO NOTHING;`
   The UUID is a constant — it can only exist in a database this file
   created. `active = true` is required because `/api/reference` filters
   `active = true`.
   **🗣 In plain English:** the uniquely-numbered dummy row whose presence
   proves "this is a throwaway database". It has to be marked active or the
   app's reference list would hide it from the probe.
2. **Test customer** — `INSERT INTO customers (name, active, postcode)
VALUES ('ANVIL-TEST-customer', true, 'XX1 1XX') ON CONFLICT (name) DO
NOTHING;` (same shape `setupTestCustomer()` creates).
3. **Test product** — `INSERT INTO products (name, code, active) VALUES
('ANVIL-TEST-product', 'ANVIL-TEST-001', true) ON CONFLICT (name) DO
NOTHING;` (same shape `getTestProduct()` creates).
4. **Test users, one per role**, matching `tests/integration/_setup.ts`
   `TestUserSet` names exactly:
   `ANVIL-TEST-admin` (role `admin`, `password_hash` = bcrypt of
   `E2E_PASSWORD_ADMIN`, `pin_hash` NULL) and `ANVIL-TEST-sales/-office/
-warehouse/-butcher/-driver` (each role, `pin_hash` = bcrypt of the
   matching `E2E_PIN_*`, `password_hash` NULL), all `active = true`. This
   satisfies `users_auth_check` (admin → password_hash, others → pin_hash).
   **🗣 In plain English:** one dummy staff member per job role, each with
   the scrambled form of the test PIN the robot will type. The names must
   match what the tests already search for, letter for letter.

Sub-step **1a — generate the hashes (one-off, not committed as a script):**
run a throwaway node one-liner with the already-installed `bcryptjs`,
reading PINs from `.env.e2e.local` (e.g.
`node -e "const b=require('bcryptjs');require('dotenv').config({path:'.env.e2e.local'});for(const k of ['E2E_PIN_SALES','E2E_PIN_OFFICE','E2E_PIN_WAREHOUSE','E2E_PIN_BUTCHER','E2E_PIN_DRIVER','E2E_PASSWORD_ADMIN'])console.log(k, b.hashSync(process.env[k],10))"`).
Paste only the **hashes** into seed.sql. If any of those env keys is
missing on the conductor's machine, **STOP and ask Hakan** — do not invent
PINs. Constraint check: no PIN may be `0000` (spec 03's wrong-PIN case) and
all must be 3–8 digits (kds-pin route regex).
**🗣 In plain English:** scramble each test PIN into its committed-safe
form using the tool the app itself uses; if a PIN is missing, ask rather
than guess.

Test for this step: `npm run db:reset` succeeds; then locally verify
`bcrypt.compare(E2E_PIN_BUTCHER, seeded hash)` via the running app:
`npm run db:up` + boot dev server against local Supabase and `curl -s
localhost:3000/api/auth/kds-pin -d '{"pin":"<E2E_PIN_BUTCHER>"}'` returns
`ANVIL-TEST-butcher` (the conductor runs this; the PIN value never enters
the repo). Also confirm `/api/auth/team` lists `ANVIL-TEST-sales` and the
sentinel row exists (`select id from customers where id =
'a417e57e-0000-4e2e-a000-000000000001'` via local Studio).
**🗣 In plain English:** rebuild the local throwaway database and prove the
dummy logins and the sentinel row actually work before trusting them in the
cloud.

Commit: `feat(testing): seed ANVIL-TEST fixtures + seed sentinel for preview branches (F-INFRA-02)`

## Step 2 — `playwright.config.ts`: remote mode, fail-closed guards, local byte-identity

Files: `playwright.config.ts` only.

Exact changes (top of file, after the existing dotenv loads):

```ts
const RAW_BASE = process.env.BASE_URL;
const baseUrl = RAW_BASE ? new URL(RAW_BASE) : null; // throws on malformed → fail closed
const REMOTE =
  !!baseUrl && !["localhost", "127.0.0.1"].includes(baseUrl.hostname);
```

Guards executed at module scope **only when `REMOTE`** (so local runs never
even evaluate them):

1. `baseUrl.protocol === 'https:'` — refuse plain-http remote targets.
2. **Production deny-list** (hard-coded from step 0.5): refuse if hostname
   equals any production domain (custom domain(s) and
   `mfs-operations.vercel.app` — exact strings confirmed in 0.5) **or**
   contains the prod Supabase ref `uqgecljspgtevoylwkep` anywhere in the
   URL. Error message: "Refusing to run @critical specs against a
   production-looking URL — preview smokes target _-git-_.vercel.app
   preview deployments only."
3. **Preview allow-list**: hostname must match
   `/^mfs-operations(-git-[a-z0-9-]+|-[a-z0-9]{9})-[a-z0-9-]+\.vercel\.app$/`
   (exact project/scope slugs confirmed in step 0.5). Anything else —
   including a typo'd domain — fails closed.
4. `process.env.VERCEL_AUTOMATION_BYPASS_SECRET` must be present, length
   ≥ 20, no whitespace. Missing/malformed → throw "bypass secret missing —
   set VERCEL_AUTOMATION_BYPASS_SECRET in .env.e2e.local; the smoke fails
   closed without it."

**🗣 In plain English:** when the robot is pointed at a web address, it
first checks: is it encrypted, is it definitely a preview address shape, is
it definitely NOT the real site, and do I hold the gate key? Any "no" and
it refuses to start at all.

Config object changes (conditional spreads keep the local object literally
identical to today):

- `use`: add `...(REMOTE ? { extraHTTPHeaders: {
'x-vercel-protection-bypass': SECRET,
'x-vercel-set-bypass-cookie': 'true' } } : {})`. The header authorizes
  every context request (Playwright applies context headers to navigations
  and in-page fetches); `set-bypass-cookie` makes Vercel also set the
  `_vercel_jwt` cookie so any request path that misses the header (e.g.
  service-worker fetches) stays authorized.
  **🗣 In plain English:** the robot shows its gate pass on every request
  AND asks the gate to stamp its hand, so even side-door requests get
  through.
- `webServer`: `...(REMOTE ? {} : { webServer: { ...exact existing block
unchanged... } })` — remote mode never boots a local dev server; local
  mode keeps the existing block byte-for-byte, including the
  `.env.test.local`-sourced `env` production-safety boundary.
  **🗣 In plain English:** locally nothing changes at all; remotely we test
  the deployed build, so no local server is started.
- `globalSetup`: `...(REMOTE ? { globalSetup:
'./tests/e2e/_previewProbe.ts' } : {})` — the step-3 probe runs before
  any spec, remote mode only. Local runs have no globalSetup, exactly as
  today.
- `workers: 1`, projects, retries, timeouts: **untouched** (preserves the
  01→02→03 relay ordering in both modes).

Test for this step: `npx tsc --noEmit` clean; `BASE_URL` unset →
`npm run test:e2e:api` and `npm run test:e2e:ui` behave exactly as on
`main`; `BASE_URL=http://localhost:3000 npx playwright test --grep
@critical` still works (localhost is non-remote by definition); each guard
exercised negatively: `BASE_URL=https://mfs-operations.vercel.app …` →
refused; `BASE_URL=https://evil.example.com …` → refused;
`BASE_URL=https://mfs-operations-git-x-team.vercel.app` with no secret →
refused. (Negative tests need no network — guards throw before any request.)
**🗣 In plain English:** prove the local commands behave identically to
yesterday, and prove each refusal actually refuses.

Commit: `feat(testing): remote preview mode + fail-closed guards in playwright config (F-INFRA-02)`

## Step 3 — `tests/e2e/_previewProbe.ts` (new): the DB identity probe

The load-bearing fail-closed check, modelled on F-TD-03's D4 sentinel probe
direction rule: **read through the deployed server, never write**. Runs as
Playwright `globalSetup` in remote mode only; throws (aborting the entire
run before any spec) unless ALL of the following hold. All requests carry
the bypass headers.

1. **Gate check:** `GET {BASE_URL}/login` returns < 500 (deployment alive,
   bypass accepted; a 401 HTML "Authentication Required" page means the
   bypass secret is wrong → distinct error message).
2. **Seeded-users check:** `GET {BASE_URL}/api/auth/team` (public route per
   `middleware.ts` PUBLIC_PATHS) returns 200 with a JSON array containing a
   user whose `name === 'ANVIL-TEST-sales'`.
3. **Hash-identity check:** `POST {BASE_URL}/api/auth/kds-pin` with
   `{ pin: process.env.E2E_PIN_BUTCHER }` returns 200 and
   `name === 'ANVIL-TEST-butcher'` — proves the database the deployed
   server reads contains the exact bcrypt hash this repo's seed.sql plants
   (read-only: kds-pin sets no cookies, writes nothing).
4. **Seed-sentinel check (strongest):** `POST {BASE_URL}/api/auth/login`
   with `{ name: 'ANVIL-TEST-sales', credential: E2E_PIN_SALES }`, capture
   the `mfs_*` cookies from the response, then `GET {BASE_URL}/api/reference`
   with those cookies → assert the customers array contains the row with
   **id `a417e57e-0000-4e2e-a000-000000000001`** and name
   `ANVIL-TEST-SEED-SENTINEL`. Production can never contain this fixed ID:
   seed.sql never runs on prod, and (unlike `ANVIL-TEST-customer`, which a
   historically mis-wired integration run could have leaked — see BACKLOG
   F-PROD entry) no test code anywhere creates this row — only seed.sql
   does.
5. On ANY failure: throw with a plain, specific message naming which check
   failed and the most likely cause ("branch missing / integration not
   wired / preview still on prod / PIN-hash drift / bypass secret wrong").
   No fallback, no retry-into-prod, no spec runs.

**🗣 In plain English:** before touching anything, the robot asks the
deployed app four escalating questions only a throwaway, freshly-seeded
database can answer — ending with "show me the uniquely-numbered sentinel
row". One wrong answer and the whole rehearsal is called off with a clear
explanation, because a wrong answer could mean it is looking at the real
database.

Implementation notes: plain `fetch` (Node 20 built-in) — no browser needed;
~120 lines; reads `E2E_PIN_SALES`/`E2E_PIN_BUTCHER` from env (already
loaded by the config's dotenv calls); never logs PIN or secret values
(redact in error output). Login in check 4 creates a session row? No —
`/api/auth/login` only sets cookies and updates `last_login_at` on the
ANVIL-TEST user (an acceptable, fixture-scoped write; the probe makes no
business-data writes).

Test for this step: `npx tsc --noEmit` clean; unit-style dry runs against
the **local** stack by temporarily invoking the probe function directly with
`http://localhost:3000` (probe logic is exported as a function taking a
base URL so it can be exercised without faking remote mode); negative case:
point it at a fresh local DB with seed deliberately not run (`supabase db
reset` with seed disabled is destructive — instead assert failure message
by querying for a nonexistent sentinel id constant in a copy of the
function, or simply rename the sentinel constant in a scratch run). Keep
this pragmatic: the decisive proof is step 8 (its own PR).
**🗣 In plain English:** check the probe compiles and behaves sensibly
against the local throwaway database; its real exam is the live self-proof
at the end.

Commit: `feat(testing): preview DB identity probe — fail-closed globalSetup (F-INFRA-02)`

## Step 4 — `scripts/e2e-preview.mjs` (new) + `package.json` scripts

Files: `scripts/e2e-preview.mjs`, `package.json` (scripts block only — no
dependency changes).

`scripts/e2e-preview.mjs` (~60 lines, Node built-ins + existing `dotenv`):

1. Loads `.env.e2e.local` and `.env.test.local` is **not** loaded (remote
   mode has no local Supabase role).
2. Takes the preview URL from `process.argv[2]` or `process.env.BASE_URL`;
   if absent prints usage: `npm run test:e2e:preview -- <preview-url>`.
3. Pre-validates the same rules as the step-2 guards (duplicated cheaply on
   purpose — defence in depth, and a friendlier error before Playwright
   spins up).
4. Spawns `npx playwright test --project=chromium --grep @critical` with
   `BASE_URL` + `VERCEL_AUTOMATION_BYPASS_SECRET` in env; exits with
   Playwright's exit code.

`package.json` additions:

- `"test:e2e:preview": "node scripts/e2e-preview.mjs"`
- `"db:branches": "supabase branches list"` (the ship-checklist
  no-orphans verification, one memorable command).

**🗣 In plain English:** one command — `npm run test:e2e:preview --
<preview address>` — does all the plumbing: loads the gate key, sanity-checks
the address, and runs exactly the three critical robot tests against it.
A second command lists the throwaway databases so we can confirm none are
left behind billing us.

Test for this step: running with no args prints usage and exits non-zero;
with a prod-looking URL refuses; with a well-formed preview URL it reaches
Playwright (which then runs the probe). `npm run lint` unaffected.

Commit: `feat(testing): test:e2e:preview wrapper + db:branches script (F-INFRA-02)`

## Step 5 — `docs/runbooks/preview-smoke.md` (new): the Gate-4 runbook

The FORGE conductor's exact sequence (also summarized in CLAUDE.md by step
6). Content outline (write it fully in the file):

1. **Preconditions:** PR open; Vercel preview deployment green; Supabase
   branch for the PR exists (`npm run db:branches` shows it — status
   healthy/`FUNCTIONS_DEPLOYED`/ready; if missing or errored → fail closed,
   investigate 0.1/0.2 wiring, do not proceed).
2. **Find the preview URL:** from the PR's Vercel bot comment or
   `npx vercel ls` — must be the `…-git-<branch>-<scope>.vercel.app` URL.
3. **Run:** `npm run test:e2e:preview -- https://<preview-url>` — expect
   probe pass + 3 specs (6 tests) green.
4. **Interpret:** probe failure = environment unsafe (NOT a code failure —
   fix wiring, never bypass); spec failure = real regression → back to
   implementer; pass = Gate 4 smoke evidence (paste output into ANVIL
   cert).
5. **Post-close cleanup verification (ship checklist — mandatory):** after
   merge/close, `npm run db:branches` → the PR's branch must be GONE. If it
   lingers: delete via Supabase dashboard (Branches → delete) or
   `supabase branches delete <branch-id>`, then re-list to confirm. Record
   "no orphaned branches" in the ship checklist.
6. **Secret rotation note:** if the bypass secret is ever exposed,
   regenerate in Vercel → update `.env.e2e.local`; old secret dies
   instantly.

**🗣 In plain English:** a step-by-step checklist for the person running the
pre-ship rehearsal: find the preview's address, run one command, read the
verdict, and — after the pull request closes — confirm its throwaway
database was actually binned so it isn't quietly costing money.

Test: `npm run lint:md` only covers `docs/adr/` — proofread manually.

Commit: `docs(testing): Gate-4 preview smoke runbook (F-INFRA-02)`

## Step 6 — Docs ratification: CLAUDE.md, ADR-0006, BACKLOG, CONTEXT.md

Files: `CLAUDE.md`, `docs/adr/0006-per-pr-supabase-preview-branches-for-pre-ship-smokes.md`,
`docs/plans/BACKLOG.md`, `CONTEXT.md`.

- **CLAUDE.md** — "Local test infrastructure" section: append two command
  lines (`npm run test:e2e:preview -- <preview-url>` — Gate-4 preview
  smoke, remote-only, fail-closed; `npm run db:branches` — list Supabase
  preview branches, ship-checklist no-orphans check) and one closing
  sentence: "Remote preview smokes never run against production: the
  Playwright config refuses non-preview hostnames and a globalSetup DB
  identity probe (seed sentinel `a417e57e-…0001` via `/api/reference`)
  must pass before any spec executes. When `BASE_URL` is unset, all local
  flows are unchanged." No other CLAUDE.md edits.
- **ADR-0006** — Status: `Proposed (…)` → `Accepted (2026-06-10 — Gate 1
lock + plan docs/plans/2026-06-10-f-infra-02-preview-smoke-plumbing.md)`.
- **BACKLOG.md** — (a) under F-08 hard prerequisites, update pointer #3 to
  "F-INFRA-02 shipped — preview smoke is live; manual click-through
  compensating control no longer required"; (b) add a deferred entry
  `F-INFRA-03` (or next free F-INFRA number): "Run the preview smoke in CI
  (GitHub Actions) instead of/in addition to conductor-run — bypass secret
  moves to repo secrets; `.github/workflows/` currently intentionally
  empty."
- **CONTEXT.md** — add the **Seed sentinel** glossary entry (plain-language
  definition as in "Domain terms used" above).

**🗣 In plain English:** update the house rulebook, mark the architectural
decision as formally adopted, record the follow-up idea (have GitHub run
the rehearsal automatically later), and add the new word to the project
dictionary.

Test: `npm run lint:md` clean (ADR file is covered by it).

Commit: `docs: ratify ADR-0006, CLAUDE.md preview-smoke commands, BACKLOG CI deferral (F-INFRA-02)`

## Step 7 — Local regression sweep (byte-identity proof)

No files. With `BASE_URL` unset, on the feature branch, run and record:

- `npm run test` (unit) — green, unchanged.
- `npm run db:reset` then `npm run test:integration` — 92/92, twice in a
  row (the new seed rows must not break `setupTestUsers`' name lookups —
  they won't: it reuses existing rows found by name, and `db:reset` wipes
  any duplicates; `maybeSingle()` would only break on duplicate names,
  which cannot occur post-reset).
- `npm run test:e2e:api`, `npm run test:e2e:ui` — green, auto-boot
  behaviour identical.
- `npx playwright test --project=chromium --grep @critical` against
  localhost — green (now satisfiable from seed alone on a fresh reset,
  which is itself a small win: the local @critical run no longer depends on
  leftover integration fixtures).
- `npx tsc --noEmit`, `npm run lint` — clean.

**🗣 In plain English:** prove every existing local test command works
exactly as before — and that a freshly rebuilt local database now contains
everything the robots need out of the box.

Commit: none (evidence goes in the PR description).

## Step 8 — Self-proof on this unit's own PR (acceptance test, locked)

Sequence (conductor + implementer together; requires step 0 complete):

1. Push `feat/f-infra-02-preview-smoke`, open the PR.
2. Confirm Supabase created a preview branch for the PR
   (`npm run db:branches`) and Vercel built a preview wired to it.
3. `npm run test:e2e:preview -- https://<this-PRs-preview-url>` →
   probe passes (all four checks) and the three `@critical` specs pass.
4. Paste the run output into the PR description as Gate-4 evidence
   (referenced by the ANVIL cert at `docs/anvil/2026-06-10-f-infra-02-cert.md`).
5. After squash-merge: `npm run db:branches` → branch gone (or deleted +
   confirmed), recorded in the ship checklist.

If step 3's probe fails: that is the system working — fix the platform
wiring (step 0), never weaken the probe. If a spec fails for app reasons on
preview but passes locally, STOP and report to Hakan (likely a genuine
environment-sensitivity bug — e.g. timezone; see risks).

**🗣 In plain English:** the safety net must catch its own pull request:
this very change gets a throwaway database and must pass its own rehearsal
on a real deployed preview before it is allowed to merge. If the rehearsal
refuses to run, we fix the wiring — we never loosen the safety check.

## Test plan (TDD-first — vertical slices)

Tests here are behavioural checkpoints per step rather than new unit-test
files — the deliverable IS test infrastructure, and its public interface is
"the commands behave as documented". One new automated artifact (the probe)
is exercised against the local stack (step 3) and decisively at step 8.

- **Behaviour: local commands unchanged when BASE_URL unset** — step 7
  sweep (existing suites are the tests). Public interface: npm scripts.
- **Behaviour: remote mode refuses unsafe targets** — step 2 negative
  matrix (prod hostname / unknown hostname / http / missing secret →
  refusal before any network call).
- **Behaviour: probe fails closed on a non-seeded DB and passes on a seeded
  one** — step 3 local dry runs + step 8 live run.
- **Behaviour: seed gives a fresh DB everything the @critical relay needs**
  — step 7's localhost @critical run on a fresh `db:reset`.
- **Behaviour: the whole pipeline ships itself** — step 8 (the locked
  acceptance test).

No new vitest/playwright spec files are added; a remote-only spec file was
considered and rejected because globalSetup gives a stronger guarantee
(aborts before ANY spec) with zero change to local test output.

**🗣 In plain English:** each step has a concrete "prove it" action, the
old test commands themselves prove nothing regressed, and the final exam is
the system shipping itself through its own safety net.

## Acceptance criteria (PRD — what "done" looks like)

- [ ] This unit's own PR received a Supabase preview branch automatically,
      and `npm run test:e2e:preview -- <its-preview-url>` passed: probe
      green + 01-order-place, 02-picking-list-print, 03-kds-butcher-flow
      all green against the deployed preview.
- [ ] Pointing the smoke at a production-looking or malformed URL, or
      running without the bypass secret, refuses to execute any test
      (fail closed) with a plain-English reason.
- [ ] A preview whose database is missing the seed fixtures (wiring broken
      or branch absent) aborts at the probe — zero specs run, nothing is
      written anywhere.
- [ ] With `BASE_URL` unset: `npm run test`, `npm run test:integration`,
      `npm run test:e2e:api`, `npm run test:e2e:ui`, and localhost
      `@critical` runs behave exactly as on `main`.
- [ ] After the PR closes, `npm run db:branches` shows no branch for it —
      "no orphaned branches" recorded in the ship checklist.
- [ ] `.env.e2e.local` holds the bypass secret; `git log -p` and the diff
      contain no secret and no plaintext PIN.
- [ ] CLAUDE.md, the runbook, ADR-0006 (Accepted), BACKLOG (CI deferral),
      and CONTEXT.md (Seed sentinel) are updated.

> **🗣 In plain English:** what is now true that wasn't before — every pull
> request can be safely rehearsed end-to-end on a real deployed copy with a
> throwaway database, the rehearsal physically cannot touch production, it
> cleans up after itself, and all the old local workflows are untouched.

## Risk Assessment

### Concurrency / race conditions

- **Preview deployment ready before the Supabase branch is** (branch
  creation latency — typically minutes; the Vercel build can finish first
  and boot with incomplete env). Severity: **medium**. Mitigation: runbook
  step 1 explicitly checks branch health before running the smoke; the
  probe fails closed if the deployment can't answer the fixture checks.
  Must-fix: no (handled by plan as designed).
  **🗣 In plain English:** if the app copy is ready before its database
  copy, the rehearsal politely refuses until both are.
- **Spec relay ordering on remote runs** (01→02→03 share state). Severity:
  low. Mitigation: `workers: 1` + project settings untouched in remote
  mode (step 2 explicitly preserves them). Must-fix: no.
- **Two people smoking the same preview simultaneously** could interleave
  orders. Severity: low (single conductor by process). Mitigation: runbook
  notes one smoke at a time per PR. Must-fix: no.

### Security

- **Vercel env precedence: stale Preview-scoped prod credentials shadow the
  integration's branch credentials → preview silently runs on prod.**
  Severity: **critical** — this is the live hazard today (per ADR-0006
  context, previews currently inherit prod credentials). Mitigation:
  step 0.3 purges Preview-scope prod vars; the step-3 probe is the
  enforcement that survives future misconfiguration (sentinel can never
  exist in prod). **Must-fix: YES — Gate 2 blocker until the plan's step
  0.3 + step 3 are accepted as the resolution; step 8 may not run before
  0.3 is done.**
  **🗣 In plain English:** right now, preview builds still hold the real
  database keys. Removing them is non-negotiable, and the sentinel probe is
  the alarm that keeps ringing if anyone ever puts them back.
- **Bypass secret leakage** (committed file, log echo, PR paste).
  Severity: high. Mitigation: lives only in `.env.e2e.local` (already
  gitignored via `.env*.local`); probe/wrapper redact it from all output;
  runbook has a rotation procedure; it bypasses _preview gate_ only — it is
  not a database credential. Must-fix: no (controls in steps 3–5).
- **Committed bcrypt PIN hashes** enable offline brute-force of 3–8 digit
  test PINs. Severity: low-by-design — accepted in ADR-0006; these PINs
  open nothing in production (F-TD-07 audits that no ANVIL-TEST users exist
  there). Mitigation: header comment forbids reuse of real staff PINs as
  test PINs — implementer must confirm with Hakan that no `E2E_PIN_*`
  equals a real production PIN before committing hashes. **Must-fix: YES
  (one confirmation question to Hakan at implementation start).**
  **🗣 In plain English:** someone could eventually crack the scrambled test
  PINs from the public repo — fine, unless a test PIN happens to equal a
  real staff PIN. Hakan must confirm they don't overlap.
- **Public probe endpoints** (`/api/auth/team`, `/api/auth/kds-pin`) are
  pre-existing surface, unchanged here; Deployment Protection (step 0.4)
  actually _reduces_ preview exposure vs today. Must-fix: no.

### Data migration

- **seed.sql failure on branch creation can be silent-ish** (branch reports
  unhealthy/failed in the dashboard, but nothing pings the PR). A failed
  seed = missing fixtures. Severity: medium. Mitigation: probe checks 2–4
  fail closed precisely on missing fixtures; runbook step 1 checks branch
  status first. Must-fix: no.
  **🗣 In plain English:** if the dummy data didn't load, the rehearsal
  refuses to start — it can't be fooled by a half-built database.
- **Migration history drift between repo and prod project** could make
  branch creation fail or diverge from prod's real schema (branch is built
  from repo migrations, which is also what makes per-PR schema testing
  trustworthy). Severity: medium. Mitigation: local `db:reset` (step 7)
  proves repo migrations apply cleanly; any branch-creation failure
  surfaces in step 8 before merge. Must-fix: no.
- **No production data is migrated, copied, or touched anywhere in this
  unit** — previews use seed-born branches only (data-less branching).
  Real customer data never reaches a preview. Must-fix: n/a.

### Business-logic flaws

- **PIN-hash drift**: Hakan rotates a value in `.env.e2e.local` → committed
  seed hashes stop matching → probe check 3 / logins fail on every future
  branch. Severity: medium (annoying, fail-closed, never dangerous).
  Mitigation: invariant documented in seed.sql header + runbook
  troubleshooting row ("PIN-hash drift" named explicitly in the probe's
  error message). Must-fix: no.
- **Timezone sensitivity**: Vercel runs UTC; spec 01's "Today + tomorrow"
  dashboard assertion could straddle midnight differently than on the
  conductor's machine (a timezone hotfix shipped previously in this repo —
  history of sensitivity). Severity: medium. Mitigation: if step 8 fails
  here while localhost passes, STOP and report (could be a real prod-facing
  bug, which is exactly what preview smokes exist to catch) — do not patch
  the spec to paper over it. Must-fix: no (procedural stop rule).
  **🗣 In plain English:** the deployed server's clock is set to London-less
  universal time; if "today's orders" behaves differently there, that is a
  finding to report, not a test to fudge.
- **`_seedLocalDb` against a remote preview**: it fetches `/api/reference`
  from the page (bypass cookie/headers cover it) and imports Dexie from
  `esm.sh` inside the browser — works (no CSP headers configured in
  `next.config.ts`/`vercel.json`, verified), but adds an external-CDN
  availability dependency to remote runs. Severity: low (flake source).
  Mitigation: accept for now; if it flakes at step 8, note it in the PR and
  add a BACKLOG entry to vendor the Dexie snippet. Must-fix: no.

### Launch blockers / cost

- **Step 0 not done → unit cannot prove itself** (acceptance criterion 1
  unmeetable). Severity: blocker by definition. Mitigation: step 0 is first
  and assigned to Hakan with exact dashboard paths; everything else can be
  built in parallel. **Must-fix: YES — but it is a scheduled plan step
  (0.1–0.5), not an unresolved design gap.**
- **Orphaned branches billing silently** (Hakan's explicit constraint).
  Severity: medium, cost-only. Mitigation: auto-delete-on-close enabled at
  0.1, `npm run db:branches` + mandatory ship-checklist verification in the
  runbook (step 5.5), acceptance criterion 5. Must-fix: no (control is in
  the plan).
  **🗣 In plain English:** throwaway databases cost pennies per hour while
  alive — so deleting them is automated AND double-checked by a human at
  every ship.
- **Cookie behaviour on `*.vercel.app`**: previews run `NODE_ENV=production`
  → `secure` cookies over https (fine); cookies are host-only (no `domain`
  attribute set by the app) and `vercel.app` is on the Public Suffix List —
  also fine for a single preview host. Severity: low. Verified against
  `app/api/auth/login/route.ts` cookie options. Must-fix: no.

### Risk headline

Two must-fix items, both resolved _within_ this plan rather than open
questions: (1) purge prod Supabase credentials from Vercel's Preview scope
(step 0.3) with the seed-sentinel probe as the permanent enforcement —
until then the pre-existing hazard stands; (2) Hakan confirms no `E2E_PIN_*`
test PIN equals a real staff PIN before the hashes are committed. No
material concurrency or data-migration risks beyond the mitigations above.

**🗣 In plain English:** the two things that genuinely must happen are:
take the real database keys out of the preview drawer, and confirm the test
door-codes aren't reused real door-codes. Everything else is engineered to
fail safely.

## Open questions for Hakan (non-blocking for Gate 2, blocking for the steps named)

1. (Blocks step 1a) Confirm no `E2E_PIN_*` value in `.env.e2e.local` equals
   any real staff PIN in production. **🗣 In plain English:** are the test
   PINs invented numbers, not anyone's actual PIN?
2. (Blocks step 2 guard #2) Confirm the production domain list from step
   0.5 (custom domain(s) + `mfs-operations.vercel.app` exact spelling).
   **🗣 In plain English:** the exact addresses of the real site, so the
   robot can be told "never these".

## Follow-ups (out of scope, recorded)

- CI execution of the preview smoke (GitHub Actions) — BACKLOG entry added
  in step 6.
- Vendor the Dexie snippet used by `_seedLocalDb` if esm.sh flakes.
- F-TD-07 / F-PROD production hygiene audit for historical ANVIL-TEST rows
  (already in BACKLOG; the seed sentinel makes the probe independent of its
  completion).
