# F-INFRA-01 — Local test infrastructure (Supabase CLI) + Playwright API/UI scaffolding

## Goal
F-INFRA-01 ships **Phase 0b**: the missing connective tissue that lets every later phase (F-05 onward) run real-adapter integration tests against a real local Postgres and route-level HTTP smokes against a real Next.js dev server. Concretely: `npm run db:up` / `db:reset` / `db:down` wrappers around the **Supabase CLI** local stack (already a partial reality — `supabase/config.toml` + migrations + `tests/` are committed; only the npm ergonomic wrappers + the "is it running?" probe in `_setup.ts` are missing); **two named Playwright projects (`api` + `ui`)** alongside the existing `chromium` + `Mobile Safari` projects (preserving all 13 existing E2E specs untouched); **one smoke per new project** proving the seam works end-to-end (`tests/e2e/api/smoke.spec.ts` against the existing public `GET /api/auth/team` route; `tests/e2e/ui/smoke.spec.ts` against the existing public `/login` page); **two new scripts** `test:e2e:api` and `test:e2e:ui`; an extension to `tests/integration/_setup.ts` that detects the local stack and fails with an actionable message before tests run a single query. **Zero application code touched** (`app/**`, `lib/**`, `hooks/**`, `components/**`, `middleware.ts`). No CI. One devDep change (`@playwright/test` is already installed at `^1.58.2`; no version bump; only `npx playwright install --with-deps chromium` is documented as a one-time-per-machine step).

## Source spec
- Architecture review v1.2 (`docs/architecture-review-2026-06-06.md`):
  - Phase 0b section (lines 323–327) — the F-INFRA-01 charter verbatim. Quote: *"Bring up the **Supabase CLI local stack** (`supabase start` — Postgres + Auth + Storage + Studio in one command, matches production Supabase exactly, less drift risk than a hand-rolled `docker-compose.yml`). Add `npm run db:up` / `db:reset` / `db:down` wrappers. Extend `tests/integration/_setup.ts` so adapter tests boot against the local stack. Install **Playwright** with two projects: API (`tests/e2e/api/`) for route-level HTTP tests, UI (`tests/e2e/ui/`) for browser flows; `playwright.config.ts` at root, `npm run test:e2e:api` and `npm run test:e2e:ui` scripts. One smoke test per project to prove the setup works. CI bring-up deferred to a separate unit. (1 PR — infrastructure + scaffolding only, no application code touched.)"*
  - "Tests at the seam" subsection (lines 271–275) — the discipline this unit unlocks: contract tests on every port, services tested with fake adapters, integration tests on real adapters.
- ADR-0002 `docs/adr/0002-hexagonal-shape-and-naming.md` line 21 — dependency rule: vendor SDK imports controlled. `@playwright/test` is a **devDep**, not a runtime dep; the spirit of the rule still applies — one-line justification in the PR body and in `playwright.config.ts` header comment. (Already installed pre-this-PR, so this is a "claim the justification, don't introduce the dep" move.)
- ADR-0003 `docs/adr/0003-strangler-fig-migration-and-freeze-rule.md` — contract-tests-on-every-port discipline. This PR is the infra that makes those contract suites runnable against a real Supabase, the seam the strangler-fig relies on.
- CLAUDE.md (project contract) lines 3–24 — the Lego principle this PR exists to protect. Without seam testing, the rip-out test (line 22) becomes aspirational.
- F-FND-03 plan (`docs/plans/2026-06-07-f-fnd-03-observability.md`) — the structural template this plan mirrors (Goal → Source spec → Compliance → Branch + base → Recon → Design-It-Twice → File-by-file → Steps → ANVIL → Risks → Out of scope).
- Locked Gate 1 spec (conductor handoff above) — frozen; no clarifications taken in planner; ambiguities flagged for Gate 2.

## Compliance
**NO** runtime compliance impact. Zero changes to `app/**`, `lib/**`, `hooks/**`, `components/**`, `middleware.ts`. No auth, payments, RLS, HACCP, financial logic, document control, or food-safety legislation touched. The PR ships test infrastructure only.

- **ADR-0002 dependency-justification rule observed.** `@playwright/test` is already in `devDependencies` at `^1.58.2` (committed in an earlier unrelated UI-overhaul PR). This PR claims the formal justification — one line in the PR body, one line in `playwright.config.ts` header comment — so the project record now has the rationale (*"Cross-browser test runner; only devDep that gives both UI and API smoke testing in one tool; alternative was supertest + a separate browser harness, two tools instead of one."*). No new runtime deps. No version bump.
- **No app-code changes.** The only files this PR writes outside `package.json` + `supabase/` + `tests/` are `playwright.config.ts` (root config, not app code) and optionally `docs/runbooks/local-dev.md` + a CLAUDE.md addendum (docs only).
- **No CI work.** `.github/workflows/` stays empty (deferred per locked spec).
- **No production data touched.** The integration `_setup.ts` already has a production-safety guard (line 38: hardcoded prod project-ref check); this PR extends it with a "is the local stack reachable?" check that runs BEFORE any query is issued.

## Branch + base
- Base: `main` HEAD `0f92122` (F-FND-03 merge commit — `feat(observability): Caller context + correlation IDs + structured log (F-FND-03) (#17)`). Verified via `git rev-parse origin/main`.
- Branch: `forge/f-infra-01-test-infrastructure`.
- PR opened to `main`, **not merged** — Hakan ships via `/ship` after ANVIL gates pass, same flow as F-FND-01/02/03.

---

## 1. Repo recon findings

Captured before writing the plan; reflects what's actually on `main` HEAD `0f92122`. **Significant overlap with spec assumptions** — several deliverables already exist in partial form and the plan adapts rather than re-creating them.

1. **`supabase/` folder — EXISTS and committed.** Path `/Users/hakankilic/MFS-Operations/supabase/`:
   - `config.toml` (15 KB, `project_id = "MFS-Operations"`, API on `54321`, DB on `54322`, Studio on `54323`, Inbucket on `54324`, Postgres major_version 17) — **already aligned with `tests/integration/_setup.ts` and `docs/anvil/run-prompts.md`**, no edit needed.
   - `migrations/` — three migrations: `20260101000000_baseline.sql` (103 KB), `20260530_001_order_pipeline_schema.sql`, `20260601_001_fix_session_var_and_audit_security.sql`. `supabase db reset` re-runs all three.
   - `seed.sql` (1.4 KB) wired via `[db.seed] sql_paths = ["./seed.sql"]`.
   - `tests/` (6 pgTAP files + `_helpers.sql`) — out of scope for this PR; `supabase test db` already works.
   - `.branches/`, `.temp/` — local-only, both gitignored at `supabase/.gitignore`.
   - **Implication:** `supabase init` is **not** part of this PR. The folder is already initialised and live. The plan only adds the npm script wrappers and the "is it running?" probe.
2. **`playwright.config.ts` — EXISTS at repo root.** Path `/Users/hakankilic/MFS-Operations/playwright.config.ts` (51 lines). Current shape:
   - `testDir: './tests/e2e'`, `timeout: 30_000`, `retries: 1`, `reporter: 'list'`, `workers: 1` (serial — by design, the order-pipeline specs are stateful).
   - `use.baseURL: process.env.BASE_URL ?? 'http://localhost:3000'` (already correct).
   - Two projects defined: `chromium` (Desktop Chrome) and `Mobile Safari` (iPhone 14).
   - Loads `.env.e2e.local` via `dotenv.config(...)`.
   - **No `webServer` block.** Docs comment explicitly says the developer starts `npm run dev` in another terminal.
   - **No `html` reporter** (only `list`). Spec asks for "list + html".
   - **No `api` / `ui` named projects.** Spec asks for these two by name.
   - **Implication:** This file is **edited additively** (add `api` + `ui` projects alongside `chromium` + `Mobile Safari`; add `webServer`; add `html` reporter; add justification comment). The 13 existing specs under `tests/e2e/` continue to be picked up by `chromium` (and `Mobile Safari` if opted-into) using the existing `testDir`. The two new smokes live under `tests/e2e/api/` and `tests/e2e/ui/` and are matched by per-project `testMatch` patterns. **Zero existing specs move or break.**
3. **`@playwright/test` — ALREADY INSTALLED as devDep.** `package.json` line 42: `"@playwright/test": "^1.58.2"`. No `npm install` needed for the package itself. The browser binary install (`npx playwright install --with-deps chromium`) is a per-machine one-time step documented in `docs/runbooks/local-dev.md` (created by this PR) and already referenced in `docs/anvil/run-prompts.md:27`.
4. **`tests/integration/_setup.ts` — EXISTS** (222 lines). Current behaviour:
   - Reads `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `INTEGRATION_BASE_URL` from env (defaulted via dotenv loader at `tests/integration/_loadEnv.ts:11` which reads `.env.test.local`).
   - **Has a production-safety guard** (lines 38–43): if URL contains the prod project-ref `uqgecljspgtevoylwkep`, throws. This stays untouched.
   - **Does NOT probe whether the local stack is up.** First failure path today: a query times out or returns `ECONNREFUSED`. Confusing for new devs.
   - Exports helpers (`getServiceClient`, `setupTestUsers`, `setupTestCustomer`, `getTestProduct`, `api`, `cleanupTestData`) used by 4 integration specs (`kds.test.ts`, `orders-crud.test.ts`, `picking-list.test.ts`, `observability.test.ts`, `withErrors.test.ts`).
   - **Implication:** the extension this PR adds is purely **additive** — one new exported async function `assertLocalStackReachable()` plus one module-level invocation. The dotenv loader stays. The production-safety guard stays. All existing exports keep their signatures.
5. **`tests/integration/_loadEnv.ts` — EXISTS** (12 lines). Trivial dotenv loader that reads `.env.test.local`. No change.
6. **`.env.test.local` — EXISTS** (159 bytes; gitignored). Per the documented shape (`docs/anvil/run-prompts.md:32–36`):
   ```
   NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
   SUPABASE_SERVICE_ROLE_KEY=<service_role key from supabase start output>
   INTEGRATION_BASE_URL=http://localhost:3000
   ```
   Used by `_loadEnv.ts` → `_setup.ts`. **This PR adds nothing here — same vars suffice for the new smokes.**
7. **`.env.local` — EXISTS** (159 bytes; gitignored). Per `.env.local.example` (which IS committed), points the dev server at **production Supabase** (the `uqgecljspgtevoylwkep` project). **This is the key risk:** running `npm run dev` with `.env.local` present means the dev server talks to prod. The integration `_setup.ts` guard catches it for vitest tests; **Playwright smokes would silently hit prod if the dev server is booted with `.env.local` instead of `.env.test.local` overriding it.** Mitigation strategy in section 2c.
8. **`.env.e2e.local` — EXISTS** (381 bytes; gitignored). Holds `BASE_URL`, `E2E_USER_*`, `E2E_PIN_*` for the existing 13 E2E specs. Loaded by `playwright.config.ts:6`. **No change — the new smokes don't need PINs or user names** (they hit a public endpoint + the public login page).
9. **package.json scripts — current set:**
   ```
   "dev":              "next dev"
   "build":            "next build"
   "start":            "next start"
   "lint":             "next lint"
   "test":             "vitest run"
   "test:watch":       "vitest"
   "test:integration": "vitest run --config vitest.integration.config.ts"
   "test:e2e":         "playwright test"
   "lint:md":          "markdownlint 'docs/adr/**/*.md'"
   ```
   **No collisions** for the new names: `db:up`, `db:reset`, `db:down`, `test:e2e:api`, `test:e2e:ui`. `test:e2e` (general) is preserved — runs all projects per the existing playwright config; the two new scripts are project-scoped (`--project=api`, `--project=ui`).
10. **`npm run dev` — `next dev` on port 3000.** No PORT override in `next.config.ts` or `package.json`. Reads the standard Next.js env precedence: `.env.development.local` > `.env.local` > `.env.development` > `.env`. **Only `.env.local` exists**, so the dev server picks up that file. (See finding #7 — risk that this points at prod.)
11. **Existing GET routes the API smoke could hit.** Grepped all 60+ `app/api/**/route.ts` files. Candidates evaluated:
    - `/api/reference` — requires auth (in `SHARED_API_PATHS`, returns 307 to `/login` without `mfs_session` cookie). **Rejected** — adds auth-state setup to a smoke.
    - `/api/dashboard` — admin-only (in `ROLE_PERMISSIONS['admin']`). **Rejected** — needs admin cookie.
    - `/api/auth/team` — **PUBLIC** (in `middleware.ts:29` `PUBLIC_PATHS`). `GET` handler at `app/api/auth/team/route.ts:12` — returns active PIN users as JSON (`[{id, name, role, secondary_roles}, ...]`), no body required. Talks to Supabase via `supabaseService` — therefore **proves both the dev server AND the local Supabase stack are wired**, matching the spec's preferred Option (A). **CHOSEN.**
    - `/api/auth/type` — POST only (returns auth type for a name); not GET. **Rejected** — spec asks for GET smoke.
12. **Stable existing page for UI smoke.** Evaluated:
    - `/` (`app/page.tsx`) — a 2-line file that immediately calls `redirect('/login')` (server-side). A Playwright `goto('/')` would follow the redirect to `/login` (Playwright follows redirects by default). The asserted selector then lives on `/login`. **Acceptable but indirect.**
    - `/login` — directly visit it. Public path (in `middleware.ts:29`). `app/login/page.tsx` renders the login UI, includes `MfsLogo` and a name input — stable selectors present (the page is mature and has been in 13 existing E2E specs for weeks). **CHOSEN — direct visit, no redirect indirection.** Asserted selector: a name-input field or the MFS logo. The plan picks the **role-or-text-based assertion** `await expect(page.getByRole('textbox', { name: /name/i })).toBeVisible()` if a name input is the first interaction (verified in `app/login/page.tsx`); falls back to `await expect(page.getByAltText(/MFS/i)).toBeVisible()` (the logo) if the input isn't reliably named. Both are stable.
13. **Test artifacts gitignore.** Repo root `.gitignore`:
    - `.env.local`, `.env*.local`, `node_modules/`, `.next/`, `out/`, `.DS_Store`, `*.pem`, `next-env.d.ts`, `*.tsbuildinfo`, Android build dirs — all present.
    - **`test-results/` NOT present** — but the directory exists at repo root (`/Users/hakankilic/MFS-Operations/test-results/`, currently untracked per `git status`). Adding `test-results/` to `.gitignore` is part of this PR.
    - **`playwright-report/` NOT present** in `.gitignore` — adding it now is the right move because this PR introduces the `html` reporter which writes there.
    - **`playwright/.cache/` NOT present** — adding it (Playwright writes browser-binary caches there when `PLAYWRIGHT_BROWSERS_PATH=0`). Belt-and-braces; cost zero.
14. **Node version.** `node --version` on Hakan's devbox: `v24.12.0`. `package.json` has **no `engines` field** and there is **no `.nvmrc`**. Playwright 1.58 supports Node 18+. Vercel Next.js 15 default is Node 20+. **No action needed** — current Node version is well within Playwright's supported range. Plan does not introduce `engines` (out of scope; future hardening unit if desired).
15. **Existing playwright config artefact location.** `test-results/` already exists with content from a previous `chrome-matrix` run. Plan keeps the **default `test-results/` path** (Playwright's default). No `outputDir` override needed.
16. **Existing 13 E2E specs continue to work.** Files in `tests/e2e/`:
    - 01-order-place, 02-picking-list-print, 03-kds-butcher-flow (stateful order-pipeline trio — depends on workers=1)
    - admin-views, chrome-matrix, dashboard-admin-restyle, desktop-chrome, mobile-chrome, redirects, route-manager, url-filter-init
    - Plus helpers `_auth.ts` and `_seedLocalDb.ts`.
    These continue to be picked up by the existing `chromium` and `Mobile Safari` projects via the unchanged `testDir: './tests/e2e'`. The new `api` + `ui` projects use **per-project `testMatch`** to scope to `tests/e2e/api/*.spec.ts` and `tests/e2e/ui/*.spec.ts` respectively — **the existing projects pick up everything UNDER `tests/e2e/` EXCEPT the two new subdirs** via a `testIgnore` carve-out. This is a 4-line config change, zero behaviour change for the existing 13.
17. **Plan filename convention.** Mirrors `docs/plans/2026-06-07-f-fnd-03-observability.md`: `2026-06-07-f-infra-01-test-infrastructure.md`. Same date as F-FND-03 (today). Lowercase + hyphens.
18. **Commit-message convention.** Recent history: `feat(observability):`, `feat(errors):`, `docs(adr):`, `docs(roadmap):`. F-INFRA-01 is genuine new functionality (developer-facing test infra + Playwright projects + smokes), not docs and not a fix. Pick: **`feat(testing): local Supabase wrappers + Playwright api/ui projects + smokes (F-INFRA-01)`**. The `feat(testing):` scope is new but reads naturally and matches the F-FND-02/03 `feat(<area>):` pattern. (`chore(infra):` was considered and rejected — `chore` typically signals no behaviour change; this PR adds runnable scripts + a probe that throws on misconfiguration, which is observable behaviour to developers.)
19. **Co-author trailer.** Matches F-FND-02/03: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.
20. **TypeScript config.** `tsconfig.json` `strict: true`, path alias `@/* → ./*`, `lib: esnext`. `@types/node ^20` already devDep — no new types packages needed. `playwright.config.ts` and the smokes type-check inside the existing project setup.
21. **F-FND-03 baseline.** `lib/observability/` lives on main as of commit `0f92122`. **Not used by anything F-INFRA-01 touches** (smokes use `@playwright/test` only; `_setup.ts` extension is plain Node fetch). No cross-unit risk.

---

## 2. Design-It-Twice analysis

Three decisions weighed per Gate 1 brief. The Supabase-CLI-vs-docker-compose decision is locked at the architecture-review level (Phase 0b mandates Supabase CLI); restated briefly here for the PR body context. The two genuinely open decisions are the **API smoke target** and the **`webServer` boot strategy**.

### 2a. API smoke target

**Option (A) — hit an existing real route.**
- `/api/auth/team` is public, GET-only, returns JSON, queries Supabase via `supabaseService`. Hitting it proves: (1) dev server is up, (2) Next.js compiles the route file, (3) middleware allows the path, (4) Supabase service client connects, (5) at least one query (`SELECT id, name, role, secondary_roles FROM users WHERE role IN (...) AND active = true`) succeeds against the local DB schema.
- **End-to-end coverage** — the smoke is a true seam test. Catches "the dev server is up but the DB connection string is wrong" failures, which is the most common new-machine failure mode.
- **Cost:** the smoke depends on `users` table having ≥1 row matching role IN ('warehouse','office','sales','driver') AND active=true. The local `seed.sql` and the migrations together seed test fixtures, but a fresh `supabase db reset` may leave the table empty. Mitigation: assert on **HTTP 200 + JSON-array-shape**, NOT on a specific row count. An empty array (`[]`) is still a valid response. The smoke proves the seam, not the seed state.

**Option (B) — add a minimal `/api/_healthz` route returning `{ ok: true }`.**
- Decoupled from Supabase. Always green if Next.js compiles. Zero seed dependency.
- **Violates the locked constraint "zero application code touched"** (`app/**` is forbidden territory). This is the disqualifying issue.
- Also: it would prove much less. A health-check that ignores the DB doesn't prove the seam at all; it would just prove Playwright can reach localhost:3000.

**Decision: Option (A) — `/api/auth/team`.**

How the smoke handles "Supabase local stack not running" cleanly: the route returns HTTP 500 with `{ error: <pg message> }`. The smoke asserts `expect(res.status()).toBe(200)` — so a stack-down state produces a clear test failure (`expected 200, received 500`) plus the body string with the underlying Postgres error, plus the Playwright `webServer` boot log if `webServer` is enabled. Combined with the new `assertLocalStackReachable()` probe in `_setup.ts` (which runs separately, before integration tests), the developer experience on "you forgot `npm run db:up`" is:
- **Integration tests** (`npm run test:integration`): fail-fast at module load with `"Supabase local stack unreachable at http://localhost:54321 — run \`npm run db:up\` first."` (clear, actionable).
- **API smoke** (`npm run test:e2e:api`): fail at the smoke assertion with `expected 200, got 500` and the body containing the Postgres connection error.

Both produce diagnosable failures. Neither hangs.

### 2b. Playwright `webServer` boot strategy

**Option (A) — Auto-boot via `playwright.config.ts` `webServer` block.**
- Playwright runs `npm run dev` itself before tests, polls the configured URL with a `webServer.timeout`, kills the process when tests finish.
- **Pros:** zero-friction for new devs (`npm run test:e2e:api` Just Works). Matches how Playwright docs recommend running E2E. CI-friendly later (the same config works in GitHub Actions without changes).
- **Cons:** boot adds ~5–10s startup latency per `playwright test` invocation. During iteration (run a failing smoke five times in two minutes), that's 25–50s wasted. Also: Playwright's `webServer.reuseExistingServer: true` flag mitigates this — if a server is already on port 3000, Playwright doesn't re-spawn it.
- **Critical subtlety:** Playwright spawns the dev server **as a child process**, inheriting the shell environment. The dev server picks up `.env.local` (which today points at **prod Supabase** — see recon finding #7). The smoke would hit prod. **Mitigation:** set `webServer.env` in `playwright.config.ts` to explicitly point at local Supabase (`NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321` + service-role key from a NEW env var the developer sets). But the service-role key for local Supabase is gitignored and per-machine — Playwright config can't know it. The path of least surprise is: **read the local URL from `.env.test.local`** (already gitignored, already holds the correct local URL) — Playwright config does `dotenv.config({ path: '.env.test.local' })` BEFORE building the `webServer.env` object, then passes `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` from process.env into the spawned dev server. This way the dev server **inherits the test env, not `.env.local`**. The existing `.env.e2e.local` load stays for the existing 13 specs.

**Option (B) — Require developer to start `npm run dev` manually.**
- Status quo for the existing 13 specs (see `playwright.config.ts:11–14` doc comment).
- **Pros:** fast inner loop. The developer controls the env the dev server boots with (set `cp .env.test.local .env.local` or use `dotenv -e .env.test.local -- npm run dev`). No `webServer` complexity in the config.
- **Cons:** an extra step. Easy to forget. New-machine onboarding takes longer.
- **No env-confusion risk** — the developer knows what `.env.*` file they sourced before starting `npm run dev`.

**Decision: Hybrid — Option (A) with `reuseExistingServer: true`.**

Justification:
- The `webServer` block makes `npm run test:e2e:api` and `npm run test:e2e:ui` **single-command runnable** for a developer who has Supabase up but no dev server. That's the most common new-machine path. Ergonomic win is real.
- `reuseExistingServer: true` keeps the inner loop fast when a dev server **is** already up (developer is iterating; doesn't pay boot cost twice).
- The env-pollution risk (Option A's main downside) is resolved by `webServer.env` explicitly sourcing `.env.test.local` in `playwright.config.ts`. The spawned dev server is guaranteed to point at local Supabase. The existing `.env.local` (which points at prod) is irrelevant when the spawned process has explicit `env` set — Next.js `process.env` honours the inherited values over file-loaded `.env.local`.
- **Caveat:** the existing 13 specs that talk to PINs and real users still rely on `.env.e2e.local`. They are unchanged — `.env.e2e.local` continues to load via the top-of-config `dotenv.config` call, completely independent of `webServer.env`.

**Edge case considered:** if the developer's terminal had `.env.local` pointing at prod AND no `webServer.env` were specified AND Playwright spawned the dev server, the smoke would hit prod. The plan eliminates this by setting `webServer.env` explicitly. Documented in the `playwright.config.ts` header comment so the reasoning survives reviewer churn.

### 2c. Supabase CLI vs hand-rolled docker-compose (locked — restated briefly)

Decided at the architecture-review level (Phase 0b lines 323–327, paraphrased): Supabase CLI gives Postgres + Auth + Storage + Studio in a single `supabase start` command. The local image versions track production Supabase. Drift between local and prod is minimised because both sides use the same Supabase distribution. A hand-rolled `docker-compose.yml` would require the team to keep Postgres + GoTrue + PostgREST + Storage + Studio versions in sync manually — drift inevitable, debugging time wasted, no operational upside. Already locked; restated here so the PR body has the rationale.

---

## 3. File-by-file changes

### New files (6)

| Path | Purpose |
|---|---|
| `tests/e2e/api/smoke.spec.ts` | One smoke: `GET /api/auth/team`, assert HTTP 200, assert JSON body parses to an array. Uses Playwright's `request` fixture only (no browser context). Justifies the `api` project. |
| `tests/e2e/ui/smoke.spec.ts` | One smoke: `page.goto('/login')`, assert visible. Uses chromium browser context. Justifies the `ui` project. |
| `docs/runbooks/local-dev.md` | Short runbook: prerequisites (Supabase CLI installed, Node 18+), one-time setup (`npx playwright install --with-deps chromium`, copy `.env.local.example` → `.env.local`, populate `.env.test.local` with local service-role key, populate `.env.e2e.local` for the existing 13 specs), daily workflow (`npm run db:up`, `npm run dev`, then test commands). Replaces the dispersed prerequisites currently scattered across `docs/anvil/run-prompts.md`. |
| `docs/anvil/2026-06-07-f-infra-01-cert.md` | ANVIL clearance certificate (written by FORGE during ship). Out of scope for the planner; reserved here for traceability. |

### Modified files (5)

| Path | Edit |
|---|---|
| `package.json` | Add five scripts to the `"scripts"` block: `"db:up": "supabase start"`, `"db:reset": "supabase db reset"`, `"db:down": "supabase stop"`, `"test:e2e:api": "playwright test --project=api"`, `"test:e2e:ui": "playwright test --project=ui"`. No dependency changes; `@playwright/test` already at `^1.58.2`. |
| `playwright.config.ts` | Additive edit: (1) load `.env.test.local` BEFORE building config so `webServer.env` can read it; (2) change reporter to `[['list'], ['html', { open: 'never' }]]`; (3) add two new projects `api` (uses request fixture, `testMatch: 'api/smoke.spec.ts'`) and `ui` (uses Desktop Chrome, `testMatch: 'ui/smoke.spec.ts'`); (4) add `testIgnore: ['api/**', 'ui/**']` to the existing `chromium` and `Mobile Safari` projects so they don't accidentally pick up the new smokes; (5) add `webServer` block that runs `npm run dev`, waits for `http://localhost:3000/login` (HTTP 200), `reuseExistingServer: true`, `timeout: 60_000`, `env: { NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY! }`; (6) header doc comment updated to reflect the new projects + webServer behaviour + the ADR-0002 dependency-justification one-liner. |
| `tests/integration/_setup.ts` | Additive edit: (1) add one new exported async function `assertLocalStackReachable(timeoutMs?: number): Promise<void>` that fetches `${SUPABASE_URL}/auth/v1/health` (Supabase's own healthcheck, returns 200 with `{}` when up) and throws a clear error if the fetch fails or returns non-200; (2) **immediately invoke it as a top-level `await`** inside a new module-level `// First-load probe — fail-fast before any test does work` block, OR (cleaner) export it and call it from a new `tests/integration/_loadEnv.ts`-companion file `_assertStack.ts` listed in `vitest.integration.config.ts`'s `setupFiles`. **Decision in plan:** prefer the `setupFiles` approach because top-level await in `_setup.ts` would change its eager-vs-lazy semantics. Add `tests/integration/_assertStack.ts` (new file — listed as the second new file conceptually, folded under "Modified files" because it's part of the `_setup.ts` extension) which is the entry point Vitest invokes; `_setup.ts` exports stay untouched. The existing production-safety guard (lines 38–43) and the `SERVICE_KEY` empty-check (lines 30–35) keep their current behaviour. **Important:** the new probe fires ONCE per test run (not per spec) because vitest loads `setupFiles` once per worker. |
| `vitest.integration.config.ts` | Add `'./tests/integration/_assertStack.ts'` to `setupFiles` (currently `['./tests/integration/_loadEnv.ts']` → becomes `['./tests/integration/_loadEnv.ts', './tests/integration/_assertStack.ts']`). `_loadEnv.ts` must run first (it populates env vars the stack probe needs). |
| `.gitignore` | Append three entries: `test-results/`, `playwright-report/`, `playwright/.cache/`. The existing `test-results/` directory at repo root is currently untracked but unignored — this PR closes that gap so future runs don't accidentally commit screenshots/videos. |
| `CLAUDE.md` | Append one short section "## Local test infrastructure" (≤10 lines) pointing to `docs/runbooks/local-dev.md`, listing the new five npm scripts, and stating "Playwright runs against your local dev server (auto-booted via `webServer` block) and your local Supabase stack (started with `npm run db:up`). Never against production." Keeps CLAUDE.md the single source of truth for the project contract. |

### `tests/e2e/api/smoke.spec.ts` — skeleton

```ts
/**
 * tests/e2e/api/smoke.spec.ts
 *
 * F-INFRA-01 — Playwright API smoke.
 *
 * Proves the `api` project is wired correctly: Playwright runs the
 * request fixture against the dev server auto-booted by the webServer
 * block, which in turn talks to the local Supabase stack started by
 * `npm run db:up`. If this passes, integration tests for any real
 * adapter are runnable end-to-end on the developer's machine.
 *
 * Why /api/auth/team:
 *   - Public path (middleware.ts:29 PUBLIC_PATHS) — no cookie needed.
 *   - GET handler — no body required.
 *   - Talks to Supabase via `supabaseService` — proves DB connection.
 *   - Returns JSON array — easy to assert shape without coupling to
 *     specific seed rows. An empty array is still success.
 *
 * Failure modes and what they tell you:
 *   - status 500 with body containing "ECONNREFUSED" → local Supabase
 *     not running. Run `npm run db:up`.
 *   - status 500 with body containing "permission denied" → service-role
 *     key in .env.test.local is wrong (refresh via `supabase status`).
 *   - request never resolves → dev server didn't boot. Check the
 *     webServer block timeout and that `npm run dev` works manually.
 *
 * Run: `npm run test:e2e:api`
 */

import { test, expect } from '@playwright/test'

test.describe('F-INFRA-01 — api project smoke', () => {
  test('GET /api/auth/team returns 200 with JSON array', async ({ request }) => {
    const res  = await request.get('/api/auth/team')
    expect(res.status(), `body: ${await res.text()}`).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body)).toBe(true)
  })
})
```

### `tests/e2e/ui/smoke.spec.ts` — skeleton

```ts
/**
 * tests/e2e/ui/smoke.spec.ts
 *
 * F-INFRA-01 — Playwright UI smoke.
 *
 * Proves the `ui` project is wired correctly: Playwright launches
 * chromium via the installed browser binary, visits the dev server
 * (auto-booted), and renders the public /login page. If this passes,
 * the developer can write UI E2E specs that target real React state.
 *
 * Why /login:
 *   - Public path (middleware.ts:29 PUBLIC_PATHS) — no session needed.
 *   - Long-standing stable page; 13 existing E2E specs already
 *     interact with it (see tests/e2e/_auth.ts).
 *   - The MFS logo and the name input are both reliable selectors.
 *
 * Failure modes:
 *   - timeout waiting for /login → dev server not up; webServer block
 *     misconfigured or `npm run dev` errored.
 *   - logo/input not found → /login was restyled and selector drifted;
 *     update selector to match.
 *
 * Run: `npm run test:e2e:ui`
 */

import { test, expect } from '@playwright/test'

test.describe('F-INFRA-01 — ui project smoke', () => {
  test('GET /login renders the login page', async ({ page }) => {
    await page.goto('/login')
    // Either selector proves the React tree mounted; use the logo
    // because it's framework-routing-agnostic (alt text is server-rendered).
    await expect(page.getByAltText(/MFS/i)).toBeVisible({ timeout: 10_000 })
  })
})
```

### `playwright.config.ts` — final shape (skeleton)

```ts
/**
 * playwright.config.ts
 *
 * F-INFRA-01 update — adds `api` + `ui` projects + auto-boot webServer.
 * The existing `chromium` and `Mobile Safari` projects are preserved
 * intact and continue to run the existing 13 E2E specs under
 * tests/e2e/* — they are testIgnored from the new api/ and ui/ subdirs.
 *
 * Dependency justification (ADR-0002 spirit):
 *   @playwright/test is the only devDep that covers BOTH UI browser
 *   automation AND request-fixture API smokes in one tool. Alternatives
 *   were supertest (API only) + a separate Cypress/Puppeteer setup (UI
 *   only) — two tools, two vocabularies, two CI integrations. One tool
 *   wins on every axis except raw browser-API depth, which this project
 *   doesn't need.
 *
 * webServer env: explicitly sourced from .env.test.local so the spawned
 * dev server points at LOCAL Supabase, never production — even if the
 * developer's .env.local points at prod. This is the production-safety
 * invariant for the Playwright path.
 *
 * Run locally:
 *   npm run db:up                # one terminal (or already up)
 *   npm run test:e2e:api         # auto-boots dev server + runs api smoke
 *   npm run test:e2e:ui          # auto-boots dev server + runs ui smoke
 *   npx playwright test          # all projects (existing 13 + 2 smokes)
 */
import { defineConfig, devices } from '@playwright/test'
import dotenv from 'dotenv'

// Load BOTH env files. .env.e2e.local for the existing 13 specs
// (PINs + user names). .env.test.local for the new api/ui smokes
// (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY) — needed
// so webServer.env can pass them to the spawned dev server.
dotenv.config({ path: '.env.test.local' })
dotenv.config({ path: '.env.e2e.local' })

export default defineConfig({
  testDir:    './tests/e2e',
  timeout:    30_000,
  retries:    1,
  reporter:   [['list'], ['html', { open: 'never' }]],
  workers:    1,
  use: {
    baseURL:       process.env.BASE_URL ?? 'http://localhost:3000',
    screenshot:    'only-on-failure',
    video:         'retain-on-failure',
    trace:         'on-first-retry',
  },
  webServer: {
    command:             'npm run dev',
    url:                 'http://localhost:3000/login',
    reuseExistingServer: true,
    timeout:             60_000,
    env: {
      // Force the spawned dev server to talk to LOCAL Supabase,
      // overriding whatever .env.local says. Production-safety.
      NEXT_PUBLIC_SUPABASE_URL:  process.env.NEXT_PUBLIC_SUPABASE_URL  ?? 'http://localhost:54321',
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    },
  },
  projects: [
    // F-INFRA-01: API smoke — request fixture only, no browser.
    {
      name:      'api',
      testMatch: 'api/**/*.spec.ts',
      use: {
        baseURL: process.env.BASE_URL ?? 'http://localhost:3000',
      },
    },
    // F-INFRA-01: UI smoke — chromium browser.
    {
      name:      'ui',
      testMatch: 'ui/**/*.spec.ts',
      use:       { ...devices['Desktop Chrome'] },
    },
    // Existing — preserved untouched in behaviour. testIgnore the
    // new api/ + ui/ subdirs so this project doesn't double-run them.
    {
      name:       'chromium',
      testIgnore: ['api/**', 'ui/**'],
      use:        { ...devices['Desktop Chrome'] },
    },
    {
      name:       'Mobile Safari',
      testIgnore: ['api/**', 'ui/**'],
      use:        { ...devices['iPhone 14'] },
    },
  ],
})
```

### `tests/integration/_assertStack.ts` — skeleton (new file)

```ts
/**
 * tests/integration/_assertStack.ts
 *
 * F-INFRA-01 — fail-fast probe for the Supabase local stack.
 *
 * Vitest invokes this AFTER _loadEnv.ts (so process.env is populated)
 * and BEFORE any test file imports _setup.ts. If the local stack is
 * unreachable, throwing here aborts the run with a clear actionable
 * message — much better than the 30s timeout / opaque ECONNREFUSED
 * the developer would otherwise see deep inside a test.
 *
 * Does NOT start the stack — that's an explicit developer action
 * (`npm run db:up`). This probe only DETECTS.
 *
 * Probe endpoint: Supabase's own /auth/v1/health — returns HTTP 200
 * with `{}` when up. Chosen because it's a tiny, stable, no-auth
 * endpoint already present on every Supabase install (local or remote).
 */
import { assertLocalStackReachable } from './_setup'

await assertLocalStackReachable()
```

### `tests/integration/_setup.ts` — additive extension (skeleton, in context)

Add near the top (after the existing `SUPABASE_URL` / `SERVICE_KEY` / `BASE_URL` constants):

```ts
/**
 * Fail-fast probe that the local Supabase stack is reachable.
 *
 * Invoked once per test run via vitest setupFiles
 * (tests/integration/_assertStack.ts). Throws with a clear, actionable
 * message if the stack isn't up so developers don't waste 30s on
 * timeouts deep inside a test.
 */
export async function assertLocalStackReachable(timeoutMs = 3_000): Promise<void> {
  const url = `${SUPABASE_URL}/auth/v1/health`
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) {
      throw new Error(
        `Supabase local stack returned HTTP ${res.status} at ${url}. ` +
        `Run \`npm run db:up\` to start it, or check supabase status.`
      )
    }
  } catch (err: any) {
    if (err?.name === 'AbortError' || err?.code === 'ECONNREFUSED' || /fetch failed/i.test(err?.message ?? '')) {
      throw new Error(
        `Supabase local stack unreachable at ${SUPABASE_URL}. ` +
        `Run \`npm run db:up\` first (this PR's new script wraps \`supabase start\`).`
      )
    }
    throw err
  } finally {
    clearTimeout(t)
  }
}
```

All existing exports (`getServiceClient`, `setupTestUsers`, `setupTestCustomer`, `getTestProduct`, `api`, `cleanupTestData`, `TEST_PREFIX`, `TestUserSet`) keep their current signatures verbatim.

### `package.json` — diff (in context)

The `"scripts"` block becomes:

```json
"scripts": {
  "dev":              "next dev",
  "build":            "next build",
  "start":            "next start",
  "lint":             "next lint",
  "test":             "vitest run",
  "test:watch":       "vitest",
  "test:integration": "vitest run --config vitest.integration.config.ts",
  "test:e2e":         "playwright test",
  "test:e2e:api":     "playwright test --project=api",
  "test:e2e:ui":      "playwright test --project=ui",
  "db:up":            "supabase start",
  "db:reset":         "supabase db reset",
  "db:down":          "supabase stop",
  "lint:md":          "markdownlint 'docs/adr/**/*.md'"
}
```

(`dependencies` and `devDependencies` unchanged.)

### `.gitignore` — append

```
# Playwright (F-INFRA-01)
test-results/
playwright-report/
playwright/.cache/
```

### `docs/runbooks/local-dev.md` — outline

1. **Prerequisites** — Supabase CLI installed (`brew install supabase/tap/supabase`), Node 18+ (devbox on `v24.12.0`).
2. **One-time per machine** — `npm install`, `npx playwright install --with-deps chromium`, populate `.env.test.local` (template provided) and `.env.e2e.local` (template provided).
3. **Daily workflow** — `npm run db:up`, `npm run dev` (or rely on Playwright `webServer`), test commands (`npm test`, `npm run test:integration`, `npm run test:e2e:api`, `npm run test:e2e:ui`, `npm run test:e2e`, `supabase test db`).
4. **Resetting** — `npm run db:reset` (re-runs migrations + seed); `npm run db:down` (stop containers).
5. **Common errors** — copy-paste-ready troubleshooting for the 5 most likely failures (lifted from `docs/anvil/run-prompts.md` lines 110–116, 136–140).

### `CLAUDE.md` — appended section (in context)

```md
## Local test infrastructure

See `docs/runbooks/local-dev.md` for the full setup. Daily commands:

- `npm run db:up`        — start local Supabase (Postgres + Auth + Storage + Studio)
- `npm run db:reset`     — re-run migrations + seed on the local DB
- `npm run db:down`      — stop local Supabase
- `npm test`             — unit tests (fast, no DB)
- `npm run test:integration` — integration tests against local Supabase + dev server
- `npm run test:e2e:api` — Playwright API smoke (auto-boots dev server)
- `npm run test:e2e:ui`  — Playwright UI smoke (auto-boots dev server + chromium)

Playwright runs against your local dev server and your local Supabase stack — never against production. The integration suite and the Playwright `webServer` block both source the local Supabase URL from `.env.test.local`, overriding `.env.local`.
```

---

## 4. Implementation steps (ordered)

1. **Cut the branch.** `git checkout -b forge/f-infra-01-test-infrastructure` off `main` HEAD `0f92122`. Confirm `git rev-parse origin/main` matches `0f92122f686ce09020e465d57f9d3dc16c12eb51`.
2. **Confirm clean-tree baseline.** Run `npm test` (must exit 0 — 1320 passing per F-FND-03 cert) and `npm run test:integration` (must exit 0 against the developer's already-running local Supabase). If either fails, STOP and report — F-INFRA-01 is not a fix-orthogonal-rot PR.
3. **Confirm `@playwright/test` is installed.** `npm ls @playwright/test` returns `^1.58.2`. Confirm `npx playwright --version` returns `1.58.x`. If the browser binary isn't installed (`npx playwright install --dry-run chromium` indicates missing), run `npx playwright install --with-deps chromium` once. (One-time per machine; not committed.)
4. **Edit `package.json`** — add five scripts: `db:up`, `db:reset`, `db:down`, `test:e2e:api`, `test:e2e:ui`. Confirm `node -e "console.log(Object.keys(require('./package.json').scripts).length)"` shows the new count.
5. **Create `tests/e2e/api/` directory + `smoke.spec.ts`** per skeleton. Single test asserting 200 + JSON array shape against `/api/auth/team`.
6. **Create `tests/e2e/ui/` directory + `smoke.spec.ts`** per skeleton. Single test asserting visible MFS logo on `/login`.
7. **Edit `playwright.config.ts`** — additive only: load `.env.test.local`; add `[['list'], ['html', { open: 'never' }]]` reporter; add `webServer` block with `reuseExistingServer: true` and explicit env; add `api` + `ui` projects with `testMatch`; add `testIgnore: ['api/**', 'ui/**']` to existing `chromium` and `Mobile Safari` projects. Update header doc comment.
8. **Edit `tests/integration/_setup.ts`** — append the `assertLocalStackReachable()` export per skeleton. Existing exports untouched.
9. **Create `tests/integration/_assertStack.ts`** per skeleton — one-line module that awaits `assertLocalStackReachable()`.
10. **Edit `vitest.integration.config.ts`** — extend `setupFiles` to `['./tests/integration/_loadEnv.ts', './tests/integration/_assertStack.ts']`. Order matters: env first, then probe.
11. **Edit `.gitignore`** — append the three Playwright artifact paths.
12. **Create `docs/runbooks/local-dev.md`** per outline.
13. **Edit `CLAUDE.md`** — append the "Local test infrastructure" section per skeleton.
14. **Verify locally** — run each in order, paste output for the PR body:
    - `npm test` → 1320 passed (no change — this PR doesn't touch unit suites).
    - `npm run test:integration` (with local stack up) → existing 5 integration suites all pass. The new `assertLocalStackReachable()` probe runs first and is silent on success.
    - `npm run test:integration` (with local stack DOWN — test ONCE during planning to confirm the failure mode) → fails at probe with the clear actionable message. **Then bring the stack back up.**
    - `npm run lint` → calibrated: zero new violations attributable to F-INFRA-01 files (grep section 5).
    - `npx tsc --noEmit` → calibrated: zero new errors in F-INFRA-01 files (grep section 5).
    - `npm run build` → exits 0 (no app changes, build path identical).
    - `npm run test:e2e:api` → 1 passed.
    - `npm run test:e2e:ui` → 1 passed.
    - `npx playwright test` (all projects, sanity) → 1 (api) + 1 (ui) + N (existing chromium specs) + 0 (Mobile Safari — opt-in) passing. If any of the existing 13 chromium specs newly fail, STOP and report — the `testIgnore` carve-out is either wrong or those specs were already flaky against the local stack.
15. **Single commit** with conventional message:
    ```
    feat(testing): local Supabase wrappers + Playwright api/ui projects + smokes (F-INFRA-01)
    ```
    Body: lists all 6 new files + 5 modified files, summarises the two design-it-twice outcomes (Option A smoke + Option A hybrid webServer with reuseExistingServer), notes the ADR-0002 dependency-justification one-liner for `@playwright/test`, pastes ANVIL results from step 14, references `docs/architecture-review-2026-06-06.md` Phase 0b. Ends with the standard co-author trailer.
16. **Push the branch.** `git push -u origin forge/f-infra-01-test-infrastructure`.
17. **Open PR to `main`** via `gh pr create`. Title: `feat(testing): local Supabase wrappers + Playwright api/ui projects + smokes (F-INFRA-01)`. Body explicitly states: zero app code touched, no CI work, no new runtime deps; existing 13 E2E specs unchanged; new scripts + projects + smokes documented; ADR-0002 dependency-justification for `@playwright/test` included.

---

## 5. ANVIL strategy

Same pre-ship discipline as F-FND-02/03. All commands run locally; output pasted into the PR body as evidence. The pyramid (Vitest unit + integration + lint + tsc + build) must still pass; the two new Playwright smokes are added on top.

| # | Layer | Command | Pass criterion |
|---|---|---|---|
| 1 | Vitest unit | `npm test` | Exit 0. Expected 1320 passed (no change — F-INFRA-01 touches no unit-test surface). |
| 2 | Vitest integration | `npm run test:integration` | Exit 0. Expected 5 suites pass + new `assertLocalStackReachable` probe runs silently in setup. Requires local Supabase up via `npm run db:up`. **Bonus check, run once during planning:** stop the stack, re-run, confirm the probe throws with the new actionable message; restart the stack. |
| 3 | ESLint | `npm run lint` | **Calibrated.** Bar: zero NEW violations originating in F-INFRA-01 files. Verify: `npm run lint 2>&1 \| grep -E "(tests/e2e/(api\|ui)/\|playwright\.config\.ts\|_assertStack\.ts)"` returns empty. Pre-existing nits stay F-TD-01 territory. (Note: `npm run lint` exits 1 on `main` per F-FND-03 cert; this is the established baseline.) |
| 4 | TypeScript check | `npx tsc --noEmit` | **Calibrated.** Bar: zero NEW errors in F-INFRA-01 files. Verify: `npx tsc --noEmit 2>&1 \| grep -E "(tests/e2e/(api\|ui)/\|playwright\.config\.ts\|_assertStack\.ts\|tests/integration/_setup\.ts)" \| wc -l` returns `0`. Pre-existing ~60 errors are F-TD-01. |
| 5 | Next.js build | `npm run build` | Exit 0. Sanity check the route graph still compiles (no app changes, so this is fast and definitionally green unless something orthogonal broke). |
| 6 | Playwright API smoke | `npm run test:e2e:api` | Exit 0. 1 passed. Auto-boots dev server via webServer block (or reuses existing). |
| 7 | Playwright UI smoke | `npm run test:e2e:ui` | Exit 0. 1 passed. Same auto-boot. |
| 8 | Playwright regression sanity | `npx playwright test --project=chromium` | Existing 13 specs run as before. **Calibrated:** zero NEW failures vs main baseline. Pre-existing flakes in the order-pipeline trio are documented in `docs/anvil/2026-05-30-order-pipeline-cert.md`; not this PR's responsibility to fix. |

Same calibrated-vs-strict methodology as F-FND-02/03. The smokes (layers 6 + 7) are STRICT (must pass — they are the deliverable). Layers 3 + 4 + 8 are CALIBRATED — zero NEW issues, pre-existing rot bracketed.

The certificate at `docs/anvil/2026-06-07-f-infra-01-cert.md` is written by FORGE after Hakan approves Gate 3.

---

## 6. Risks and open questions

1. **`.env.local` points at production Supabase by default.** The biggest land-mine in this PR. Mitigation: `playwright.config.ts` `webServer.env` explicitly passes `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` from `process.env` (sourced from `.env.test.local` via the top-of-config `dotenv.config` call). The spawned dev server inherits this and Next.js honours process.env over file-loaded `.env.local`. **Flag for Gate 2:** confirm the conductor accepts this as the production-safety boundary. A belt-and-braces alternative is a runtime assertion inside the smoke spec (`expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toMatch(/localhost|127\.0\.0\.1/)`) — would catch the case where `webServer.env` somehow isn't passed through. Plan includes the assertion in the api smoke; cost is one line.
2. **The existing 13 E2E specs run against the order-pipeline schema and PIN-authenticated users.** They are entirely separate from the smokes (different projects, different `testMatch`). But: if Hakan ever runs `npx playwright test` (no project filter) WITHOUT `.env.e2e.local` populated, the chromium project's specs fail at `loginAs(page, 'sales')` because there's no PIN. **Not this PR's responsibility** (status quo). But the new `docs/runbooks/local-dev.md` documents the requirement clearly.
3. **`reuseExistingServer: true` semantics on port-collision.** If port 3000 is in use by something OTHER than `next dev` (e.g. a different project's dev server), Playwright will happily talk to it and the smoke will fail in confusing ways. Mitigation: the webServer block waits for `http://localhost:3000/login` to return HTTP 200 — that's a route only this app serves, so a foreign process on 3000 would fail the wait. Acceptable.
4. **Restructuring playwright projects without breaking the 13 existing specs.** Mitigated by the `testMatch` + `testIgnore` carve-out. Validated by step-14 layer 8 ("zero new failures vs main baseline"). **Flag for Gate 2:** if the conductor is willing to accept a single PR that adds 2 projects and lightly modifies the existing 2 (the `testIgnore` line), this risk is closed. If the conductor wants the existing projects truly untouched, the alternative is to move the existing specs to `tests/e2e/legacy/*.spec.ts` and add `testMatch: 'legacy/**/*.spec.ts'` on `chromium` — bigger move, breaks `git blame` continuity for 13 files, recommended AGAINST.
5. **Top-level await in `_assertStack.ts`.** Requires `module: ESNext` or `module: NodeNext` semantics. Vitest's loader handles this transparently in its setupFiles (it bundles them with esbuild before invocation). Confirmed by existing `_loadEnv.ts` which uses `import` syntax and works. Low risk.
6. **The Supabase `/auth/v1/health` endpoint may change format in a future CLI version.** Currently returns HTTP 200 + `{}`. The probe only asserts `res.ok` (status 2xx), not body shape — robust to format drift. If the endpoint is ever renamed, the failure mode is a 404 with a clear "Supabase local stack returned HTTP 404" message pointing at the URL — the developer would notice and update the probe in a one-line edit.
7. **ADR-0005 conditional deliverable — recommend DEFER.** The Design-It-Twice analysis above already captures the rationale (Supabase CLI vs docker-compose; Playwright api vs supertest; chromium-only first; webServer auto-boot). An ADR would restate this in 1 page of formal prose. Recommendation: **defer the ADR to a follow-up "ADR backfill" unit** because (a) the architecture-review v1.2 Phase 0b section already records the Supabase-CLI decision authoritatively; (b) the other three decisions are tactical/implementation-level rather than architectural; (c) the PR body + this plan are sufficient written record for the team; (d) ADR sprawl has its own cost. **Flag for Gate 2:** if the conductor disagrees, the ADR adds ~150 lines and one new file; trivial to ship in this PR.
8. **`docs/anvil/run-prompts.md` overlaps with the new `docs/runbooks/local-dev.md`.** The run-prompts doc was written for the original ANVIL pyramid runs (order-pipeline cert). The new runbook is the daily-dev companion. **Plan choice:** leave `run-prompts.md` untouched; the new file references it for the ANVIL-specific layered run flow. A future docs-tidy pass can consolidate. Out of scope here.
9. **`@playwright/test` already on `^1.58.2`.** The PR doesn't INSTALL it (already there) but DOES write the dependency-justification one-line per ADR-0002 spirit. **Flag for Gate 2:** confirm the conductor accepts a justification-only claim (no version bump, no install) as ADR-0002-compliant for a devDep that pre-existed the PR. The alternative is to note the historical install in the PR body and skip the justification (lighter-touch). Plan recommends the explicit justification — it puts the rationale on the record for the first time.
10. **CLAUDE.md edit.** A 10-line append is a tiny scope creep BUT it puts the new daily commands in the project contract — high signal-to-noise. **Flag for Gate 2:** confirm acceptable. Alternative: skip CLAUDE.md and rely solely on the runbook. Plan recommends including CLAUDE.md because the daily commands are the first thing a new dev runs.

---

## 7. Out of scope (DO NOT touch in this PR)

- **Phase 0 refactors (F-01..F-04).** Inline Supabase client consolidation, road-times.ts fix, `requireRole` helper, ESLint Supabase boundary guard. Separate units.
- **Phase 0.5 RLS work.** F-RLS-01 through F-RLS-final. Separate track.
- **Any UI changes.** Zero edits under `app/**`, `components/**`, `hooks/**`. No exceptions.
- **CI / GitHub Actions.** `.github/workflows/` stays empty (locked).
- **F-TD-01 / F-TD-02 cleanup.** Pre-existing ~60 tsc errors + ESLint nits. Side-track.
- **Wiring F-FND-03 observability into the Playwright smoke.** The smokes don't need correlation IDs — they are infra proofs, not route verifications. F-08+ will retroactively verify observability as routes get migrated.
- **Migrating any of the 13 existing E2E specs into the new `api/` or `ui/` subdirs.** They stay where they are. Future units can refactor if needed.
- **Adding Firefox or WebKit browsers.** Chromium-only per locked spec. The existing `Mobile Safari` project requires `npx playwright install webkit` (per `playwright.config.ts:46–48` doc); unchanged.
- **Exporting a `setSink`-style hook on `_setup.ts`.** YAGNI.
- **Consolidating `docs/anvil/run-prompts.md` and the new `docs/runbooks/local-dev.md`.** Future docs-tidy.
- **ADR-0005.** Recommended DEFER (see risk #7). If the conductor reverses at Gate 2, add as a new file `docs/adr/0005-test-infrastructure-choices.md` + reference in PR body.
- **`engines` field in package.json or `.nvmrc`.** Future hardening; not needed for this PR (Node 24.12.0 well within Playwright/Next.js support).
- **Adding `setSink` / Sentry / observability transport to the logger.** F-FND-03 territory.
- **Lint rule banning `process.env.NEXT_PUBLIC_SUPABASE_URL.includes('production-ref')` in test code.** Belt-and-braces idea, not in scope.

---

## 8. ADR-0005 recommendation

**DEFER.** The architecture-review v1.2 Phase 0b section already records the Supabase-CLI-vs-docker-compose decision authoritatively (it's the source-of-truth document this plan cites). The other three decisions (Playwright vs supertest; chromium-only first; webServer auto-boot) are tactical implementation choices rather than load-bearing architectural commitments — they live well in the plan body + the PR description + the playwright.config.ts header comment, and any of them is reversible in a one-file edit if the project's needs change. Spending a PR slot on a formal ADR for tactical infra choices risks ADR sprawl without commensurate clarity gain. If/when one of these decisions is reversed (e.g. swapping Playwright out for Cypress in 2027), THAT is the moment an ADR is worth the cost — it would record the reversal, the new rationale, and the migration path. Today, the existing documentation surface is sufficient. **One-line recommendation to surface at Gate 2:** "Defer ADR-0005; the architectural decision (Supabase CLI) is recorded in the architecture review and the tactical decisions are recorded in the PR + plan + config comments."
