# F-INFRA-03 — Run the @critical preview smoke in GitHub Actions CI

**Date:** 2026-06-27
**Phase:** FORGE Order (plan only — no app code, no yaml authored here)
**Risk tier:** CI/infra-only. NO app code, NO `lib/**`, NO port/adapter, NO migration, NO RLS, NO new runtime dependency. The hexagonal contract is not engaged.

---

## Visual mini-map

```
DOMAIN (the MFS-Operations app — UNTOUCHED by this unit)
  └─ (no port/adapter change — this is CI plumbing, not app code)

CI LAYER (.github/workflows)
  preview-cred-sync.yml  (exists)  → writes creds, fires 2nd deploy
  preview-smoke.yml      (NEW)     → waits for 2nd deploy, runs 75 @critical specs, BLOCKS merge
🗣 We are bolting a robot inspector onto the assembly line — it does not touch the product, only watches it on a real deployed copy and refuses to let a bad one through.
```

---

## Goal

Add a NEW GitHub Actions workflow that automatically runs the 75-spec `@critical`
Playwright preview smoke on every pull request, against that PR's
credential-wired (SECOND) Vercel preview deploy, and makes it a **required,
blocking** status check on `main`. Fail-closed: if the smoke cannot be proven
green (infra unhealthy, readiness never arrives within a timeout), the job goes
RED and blocks the merge. No silent skip-as-green (the F-INFRA-06 bug we are
explicitly avoiding).

**🗣 In plain English:** today a human runs the "click through the app on a real
deployed copy" test by hand before each merge. This makes a robot do it
automatically on every PR, and locks the merge button until the robot says green.
If anything is broken or the test can't even start, the button stays locked — it
never quietly waves a change through.

---

## Domain terms (plain-English bridge)

- **GitHub Actions workflow** — a YAML file under `.github/workflows/` that GitHub
  runs automatically on events (here: a pull request).
  **🗣** A recipe card GitHub follows by itself whenever a PR happens — no human presses go.
- **Required status check** — a named check that GitHub will not let you merge
  without it passing (set in branch protection on `main`).
  **🗣** The lock on the merge button. The check's *name* is the key; if the name doesn't match exactly, the lock silently never engages.
- **`@critical` Playwright suite** — the 75 end-to-end specs tagged `@critical`,
  run via `--project=chromium --grep @critical`.
  **🗣** The 75 most-important robot click-throughs of the live app.
- **Vercel preview deploy** — a throwaway deployed copy of the app for one PR, at
  `mfs-operations-git-<branch>-<scope>.vercel.app`.
  **🗣** A private demo site spun up just for this PR.
- **The two-deploy sequence** — each PR deploys to Vercel TWICE: a first
  credential-less deploy goes green with NO working DB, then
  `preview-cred-sync.yml` writes the DB creds and fires a SECOND deploy that
  actually talks to the database. The smoke must hit the second one.
  **🗣** The demo site comes up empty first, then a robot plugs in the database and rebuilds it. We must test the plugged-in version, not the empty one.
- **Readiness gate** — poll `https://<preview-url>/api/auth/team` until it returns
  HTTP **200** (NOT `/login`, which returns 200 even on the empty pre-cred deploy).
  **🗣** Knock on a door that only opens once the database is actually wired — `/login` opens even when the database is dead, so it's the wrong door.
- **`--unprotected` mode** — Vercel Deployment Protection is OFF this sprint
  (F-INFRA-02), so no bypass secret is sent. Flagged via `E2E_PREVIEW_UNPROTECTED=1`.
  **🗣** The demo site has no password gate right now, so the robot doesn't carry a key. F-INFRA-04 will put the gate back and the robot will carry a key again.
- **Repo secret** — an encrypted value stored in GitHub Settings → Secrets, exposed
  to a workflow via `secrets.NAME`, auto-masked in logs.
  **🗣** A sealed envelope GitHub hands the robot at runtime and blacks out if it ever appears in the logs.

---

## Compliance / safety flags

- **Production-safety is already structurally enforced** and unchanged by this unit:
  `playwright.config.ts` + `scripts/e2e-preview.mjs` + `tests/e2e/_previewProbe.ts`
  refuse any non-preview hostname, plain http, the prod Supabase ref, and any
  `-git-main-` alias — all BEFORE any network call. CI inherits these guards
  verbatim; we add no new bypass path.
  **🗣** The test physically cannot point at the live site or the live database — that wall already exists in code; CI just runs behind it.
- **Fail-closed is mandatory.** Every wait/timeout/probe in this workflow must end
  in a RED job on failure, never a green-skip. This is the explicit anti-pattern of
  BACKLOG F-INFRA-06.
- **No secret is ever echoed.** PINs/passwords flow only through the job `env:`
  block from `secrets.*`; GitHub auto-masks them. No `echo`, no `set -x` over them.

---

## ADR conflicts

None. ADR-0006 (per-PR preview branches) and ADR-0008 (service-role posture) are
unaffected — this is read-only CI orchestration over the existing preview
infrastructure. ADR-0002 (hexagonal shape) is not engaged (no `lib/**`, no
vendor SDK import in app code; the only Vercel API call is in CI shell, which is
the same posture as the already-shipped `preview-cred-sync.mjs`).

---

## Files to change / add

| Path | Action | What |
| ---- | ------ | ---- |
| `.github/workflows/preview-smoke.yml` | **NEW** | The workflow (Step 1). Kebab-case, mirrors `preview-cred-sync.yml` house style. |
| `tests/unit/ci/preview-smoke-workflow.test.ts` | **NEW** | Unit test pinning the workflow's load-bearing invariants (Step 4). New `tests/unit/ci/` dir — first of its kind. |
| `docs/runbooks/preview-smoke.md` | **EDIT** | Add a short "Now also runs automatically in CI" section pointing at the new workflow + how to read a CI failure vs a local run (Step 5). |
| `docs/plans/BACKLOG.md` | **EDIT** | Mark F-INFRA-03 done; add the one-line cross-ref noting F-INFRA-04 will drop `--unprotected` from this workflow (Step 6). |

**Conductor-run, NOT files (Steps 2 & 3):** `gh secret set …` (provision secrets)
and `gh api …` (make the check required). These are operational commands the plan
specifies exactly; they are not committed artifacts.

**🗣 In plain English:** one new recipe card, one little test that checks the recipe
card still says the right things, two doc edits. The two "set a secret" / "lock the
button" actions are commands the conductor types, not files.

---

## The mechanism (the hard part) — decided

### (a) URL discovery + which deploy: trigger on `pull_request`, discover the latest READY preview via the Vercel API, then let the readiness poll pick the cred-wired build

**Decision: `on: pull_request` (opened, synchronize, reopened), NOT `on: deployment_status`.**

Rationale:
- **`deployment_status` is the trap.** It fires once PER deploy. Each PR has TWO
  deploys (empty, then cred-wired). A `deployment_status` trigger would fire first
  on the EMPTY deploy — exactly the one we must not test — and we'd have to filter
  it out anyway. It also fires for the `git-main` production alias. More event
  plumbing, more ways to accidentally test the wrong thing.
  **🗣** "Run when a deploy finishes" sounds right but fires first on the empty demo site — the one guaranteed to fail. We'd be fighting the trigger.
- **`pull_request` fires once per push, deterministically**, the same event
  `preview-cred-sync.yml` already keys off — so both workflows share one mental
  model and one concurrency story.
  **🗣** Same doorbell the existing robot already listens to. One pattern, not two.
- **The readiness poll makes the trigger choice safe regardless.** Whichever deploy
  is current, the job does NOT run specs until `/api/auth/team` returns 200 — and
  that endpoint only returns 200 on the cred-wired SECOND deploy. So even though
  `pull_request` fires "early" (before cred-sync has finished its second deploy),
  the poll absorbs the race: it waits out the empty deploy and the cred-sync run,
  then proceeds on the wired one.
  **🗣** We don't have to guess which demo site is live — we just keep knocking on the database-only door until it opens, which it only does on the right one.

**URL discovery mechanism (inside the job, a small inline Node step using built-in
`fetch` — same Node-20 + global-fetch posture as `scripts/preview-cred-sync.mjs`,
no `npm install` for this step):**

1. Reuse the existing `VERCEL_API_TOKEN` repo secret (already provisioned for
   `preview-cred-sync.yml`) and the same public, non-secret identifiers that
   `scripts/preview-cred-sync.mjs` `CONFIG` already pins:
   - Vercel project id `prj_84NlryZjHcGlA6R2O6zQ57aWkOFZ`
   - Vercel team id `team_WRtx6wNjCoPN95xacOxK6m1e`
   These are public identifiers, not secrets.
   **🗣** Same key and same public address book the existing robot already uses — nothing new to provision for discovery.
2. Query Vercel for deployments on this PR's git branch
   (`github.event.pull_request.head.ref`), filtered to the preview target:
   `GET https://api.vercel.com/v6/deployments?projectId=<id>&teamId=<id>&target=preview&limit=…`,
   then select entries whose `meta.githubCommitRef` (git branch) matches and whose
   `state === 'READY'`. **Prefer the `<branch>` git alias URL** the smoke's host
   regex expects: construct/confirm
   `https://mfs-operations-git-<sanitised-branch>-hakan-kilics-projects-2c54f03f.vercel.app`,
   OR take the deployment's `url` if it already matches
   `playwright.config.ts`'s `PREVIEW_HOST_RE`.
   **🗣** Ask Vercel "what live demo sites exist for this branch?", pick the wired one.
   - **Branch sanitisation note for the implementer:** the git-alias host lowercases
     the branch and replaces `/` and other non-`[a-z0-9-]` chars with `-`. If
     constructing the alias is fiddly for a given branch name, prefer polling the
     `git-<branch>` **alias** form (Vercel auto-maintains it pointing at the latest
     READY preview for the branch) over a per-deployment hash URL — the alias always
     resolves to the newest READY deploy, which after cred-sync is the wired one.
     Verify whichever URL is chosen passes `PREVIEW_HOST_RE` before use (the
     `e2e-preview.mjs` guard will hard-refuse a mismatch anyway = belt-and-braces).
3. If no matching READY preview is found within the discovery window, **fail closed**
   (RED) with a clear message — never proceed with an empty/guessed URL.

> **ANVIL fix (F-INFRA-03, 2026-06-27):** the preview host MUST be **read** from the
> deployment object Vercel returns — prefer `ready.meta.branchAlias` (it auto-follows
> to the newest READY deploy, so it survives the cred-sync second deploy), fall back to
> `ready.url`. Do **NOT** construct the host by gluing the branch name into a
> `mfs-operations-git-<branch>-<scope>.vercel.app` template. Vercel TRUNCATES long git
> aliases; on a long branch (this one) the glued first DNS label was 82 chars — over the
> 63-char DNS limit — so it was never a legal hostname and never resolved. Every readiness
> fetch threw for the full 12-min budget and the gate went permanently RED. The chosen host
> is still validated against `PREVIEW_HOST_RE` (which accepts both the `-git-<branch>-` alias
> and the `-<hash>-` unique form) and fails closed on mismatch.

> **Implementer latitude:** the Vercel deployments endpoint shape (`/v6/deployments`
> vs the alias lookup) should be confirmed against the live API at build time, the
> same way `vercel-env-client.mjs` confirmed its endpoints. The REQUIREMENT is:
> end up with a single `https://…-git-<branch>-<scope>.vercel.app`-shaped URL that
> passes `PREVIEW_HOST_RE`, or fail closed. The exact endpoint is an implementation
> detail; the contract is the URL shape + fail-closed.

### (b) Wait for the cred-synced 2nd deploy via the `/api/auth/team`=200 readiness poll, fail-closed timeout

After URL discovery, poll the readiness endpoint exactly as the runbook prescribes:

```
GET https://<preview-url>/api/auth/team   → wait for HTTP 200
```

- Poll with a fixed interval (e.g. 10s) up to a **total timeout of 12 minutes**.
  Rationale: `preview-cred-sync.mjs` itself waits up to ~10 min for the Supabase
  branch to become healthy (`POLL_DEFAULTS.totalTimeoutMs`) THEN fires the second
  deploy, which then has to build. 12 min gives headroom over cred-sync's own
  10-min ceiling plus a Vercel build, without being unbounded.
  **🗣** We give the database-wiring robot its full 10-minute budget plus a couple of minutes to rebuild before we give up — generous but finite.
- **Treat ONLY 200 as ready.** A 500 means we hit the pre-cred deploy (documented
  in the runbook troubleshooting table). A 200 at `/login` is NOT proof — poll
  `/api/auth/team` specifically.
- **On timeout: fail closed (RED)** with a message that names the URL and says
  "readiness never reached 200 within Ns — the cred-synced deploy may have failed;
  check the preview-cred-sync run for this PR." Never green-skip.
  **🗣** If the door never opens in 12 minutes, the job goes red and tells you to check the database-wiring robot — it does NOT shrug and pass.

The smoke's own `tests/e2e/_previewProbe.ts` globalSetup then runs its 4-check
DB-identity probe (seed sentinel `a417e57e-…0001`) as a second, independent
fail-closed layer before any spec executes.
**🗣** Even after our door-knock, the test does its own ID check on the database before clicking anything — two locks, not one.

### (c) Supabase branch health — do NOT add `npm run db:branches` to this workflow

Argument: the runbook's manual `npm run db:branches` health check is **already
covered transitively** for CI:
1. `preview-cred-sync.yml` already polls the Supabase branch to `ACTIVE_HEALTHY`
   /`FUNCTIONS_DEPLOYED` and FAILS CLOSED if it never gets healthy — so an unhealthy
   branch is already a RED check on the PR, surfaced before the smoke even matters.
2. The `/api/auth/team`=200 readiness poll only returns 200 when the app can read
   the branch DB — an unhealthy branch ⇒ 500 ⇒ our poll times out ⇒ RED.
3. `_previewProbe.ts` then independently asserts the DB is the seed-born branch.

Adding `db:branches` to CI would also require the Supabase CLI + a `SUPABASE_ACCESS_TOKEN`
in this job for a check that the other three layers already enforce — net new
surface for zero new coverage. **Decision: do not add it.**
**🗣** Three other guards already catch a broken database branch; adding a fourth would mean handing this robot the database master-token for no extra safety. Skip it.

---

## Numbered execution steps

### Step 0 — Pre-flight reads (implementer, before writing yaml)
Read, in this order, to mirror house style and confirm contracts:
1. `.github/workflows/preview-cred-sync.yml` — the MANDATORY house-style template.
2. `scripts/preview-cred-sync.mjs` (`CONFIG` block, lines 42–55) — the public
   Vercel project/team ids to reuse for URL discovery.
3. `scripts/e2e-preview.mjs` — the smoke entrypoint contract: it takes
   `<url> --unprotected`, loads `.env.e2e.local` via `dotenv` (NON-override), reads
   `VERCEL_AUTOMATION_BYPASS_SECRET` (not needed in `--unprotected`), spawns
   `playwright test --project=chromium --grep @critical`.
4. `playwright.config.ts` — `PREVIEW_HOST_RE` (the URL shape the smoke will accept),
   remote-mode detection (`BASE_URL` non-localhost), and the `globalSetup` probe.
5. `tests/e2e/_auth.ts` + a grep of `tests/e2e/` — the FULL env-var set the specs
   need (enumerated below in Step 2).

**🗣** Read the existing robot's recipe and the test's rules first, so the new recipe matches and asks for exactly the right sealed envelopes.

### Step 1 — Author `.github/workflows/preview-smoke.yml` (NEW)
Mirror `preview-cred-sync.yml` exactly on house style:

- **Filename:** `.github/workflows/preview-smoke.yml` (kebab-case).
- **`name:`** descriptive, e.g. `Preview smoke (@critical E2E)`.
- **Trigger:** `on: pull_request: types: [opened, synchronize, reopened]`
  (NOT `closed` — nothing to smoke on close).
- **`permissions:`** least privilege — `contents: read` only (the job checks out the
  repo and calls external APIs; it needs no repo-write scope, no `statuses: write`
  — GitHub auto-reports the job's own status as the required check).
- **`concurrency:`** PER JOB, keyed on the PR number, `cancel-in-progress: true`
  (a new push supersedes the in-flight smoke; latest commit wins — mirrors the
  cred-sync `sync` job's rationale).
  ```
  concurrency:
    group: preview-smoke-${{ github.event.pull_request.number }}
    cancel-in-progress: true
  ```
- **`jobs:`** ONE job. **The job's `name:` (or the implicit job key) is the
  required-check context — pin it deliberately and document it** (see Step 3).
  Recommend an explicit job key `smoke` with NO custom `name:` override so the
  reported context is the stable, predictable string (see Step 3 for the exact
  resulting context name and how to confirm it).
- **`runs-on: ubuntu-latest`**.
- **Steps (all first-party `actions/*`, pinned at major tag — NO third-party
  marketplace actions):**
  1. `uses: actions/checkout@v4`
  2. `uses: actions/setup-node@v4` with `node-version: 20` (matches cred-sync;
     and `scripts/*` are Node-20 + global-fetch).
  3. `run: npm ci` — install deps (the smoke DOES need the full install, unlike
     cred-sync's no-install script).
  4. `run: npx playwright install --with-deps chromium` — install ONLY chromium
     (the `@critical` specs run `--project=chromium`; webkit/Mobile-Safari is not
     used by the smoke). `--with-deps` pulls the OS libs the browser needs on the
     runner.
     **🗣** Install just the one browser the test actually uses — not all three — to keep the job lean.
  5. **Discover the preview URL** (inline Node step, built-in fetch — see Mechanism
     (a)). Export the resolved URL to `$GITHUB_OUTPUT` / `$GITHUB_ENV` as e.g.
     `PREVIEW_URL`. Fail closed if none found.
     - `env: VERCEL_API_TOKEN: ${{ secrets.VERCEL_API_TOKEN }}`
     - `PR_GIT_BRANCH: ${{ github.event.pull_request.head.ref }}`
  6. **Readiness poll** (inline shell or Node — see Mechanism (b)): poll
     `${PREVIEW_URL}/api/auth/team` until 200, 12-min fail-closed timeout.
  7. **Run the smoke:**
     ```
     run: npm run test:e2e:preview -- "$PREVIEW_URL" --unprotected
     ```
     `--unprotected` is THE line F-INFRA-04 will later remove (see follow-up note).
     `env:` block supplies the test login secrets (Step 2 names).
- **Secret hygiene:** every secret arrives via `env:` from `secrets.*`; nothing is
  `echo`ed; no `set -x` over secret-bearing lines. `dotenv` in `e2e-preview.mjs`
  will find no `.env.e2e.local` in CI and (being NON-override) will leave the
  job-supplied env vars intact — this is the clean injection path, VERIFIED:
  `dotenv.config()` is called without `override:true`, so pre-set process.env wins.
  **🗣** We hand the secrets straight to the test through GitHub's sealed-envelope mechanism; the local-file loader simply finds no file in CI and steps aside.

### Step 2 — Provision the test-login secrets (conductor runs `gh secret set`)
The smoke logs in as multiple roles. The FULL set of env vars the `@critical`
specs + `_previewProbe.ts` read (confirmed by grep of `tests/e2e/`) — provision
EACH as a GitHub Actions **repo** secret:

PINs (6):
- `E2E_PIN_ADMIN`
- `E2E_PIN_SALES`
- `E2E_PIN_OFFICE`
- `E2E_PIN_WAREHOUSE`
- `E2E_PIN_BUTCHER`
- `E2E_PIN_DRIVER`

User identifiers (5 — admin uses password not PIN-name, and `_auth.ts` treats the
admin user as optional, but the haccp specs DO read `E2E_USER_ADMIN`, so include it):
- `E2E_USER_ADMIN`
- `E2E_USER_SALES`
- `E2E_USER_OFFICE`
- `E2E_USER_WAREHOUSE`
- `E2E_USER_BUTCHER`
- `E2E_USER_DRIVER`

Admin password (1):
- `E2E_PASSWORD_ADMIN`

> **NOT needed:** `VERCEL_AUTOMATION_BYPASS_SECRET` (we run `--unprotected`).
> `SESSION_SECRET` / `SUPABASE_SERVICE_ROLE_KEY` / `NEXT_PUBLIC_SUPABASE_URL` are
> only consumed by the LOCAL `webServer` block in `playwright.config.ts`, which
> does NOT run in remote/preview mode — so they are NOT required in CI.
> `VERCEL_API_TOKEN` is ALREADY provisioned (cred-sync uses it) — reuse, don't
> re-create.

**Source of the values:** the conductor's `.env.e2e.local` (gitignored). These
PINs' bcrypt hashes live in `supabase/seed.sql`; the seed is what every Supabase
preview branch is born with, so the same PINs authenticate on every preview.

**Conductor command shape (one per secret), run from the repo root:**
```
gh secret set E2E_PIN_ADMIN     --body "<value-from-.env.e2e.local>"
gh secret set E2E_PIN_SALES     --body "<value>"
…  (repeat for all 13 names above)
```
(Or pipe from a file: `gh secret set E2E_PIN_ADMIN < <(…)` — but `--body` keeps the
value off the process list cleanly; the conductor decides.)

**🗣** Thirteen sealed envelopes (six PINs, six usernames, one admin password) get
stored in GitHub so the robot can log in as each role. The Vercel key envelope and
the "no password gate" mean we do NOT need a bypass envelope.

### Step 3 — Make the check required on `main` (conductor runs `gh api`)
The required-check **context name must EXACTLY match the job status GitHub reports.**
For a single-job workflow with job key `smoke` and no `name:` override, GitHub
reports the check context as the **job name**, which defaults to the job key:
`smoke`.

> **CRITICAL verification step before requiring it:** open ONE real PR that triggers
> the new workflow, let it run, then read the EXACT context string GitHub recorded:
> ```
> gh api repos/:owner/:repo/commits/<pr-head-sha>/check-runs --jq '.check_runs[].name'
> ```
> Use the string it prints VERBATIM as the required-check context. Do NOT guess —
> a mismatch means the check is required-but-never-reported, which GitHub treats as
> "pending forever" (blocks all merges) OR, depending on settings, silently never
> blocks. Either way it's wrong; confirm the literal string first.
> **🗣** GitHub's lock only engages if the lock's name letter-for-letter matches what the robot stamps. So we run it once, copy the exact stamp, then set the lock to that — never a guess.

**`gh api` shape to ADD it as a required check (merging, not replacing, existing
checks):**
```
# 1. Read current required checks (don't clobber preview-cred-sync if it's required):
gh api repos/:owner/:repo/branches/main/protection/required_status_checks

# 2. Add the new context (PATCH preserves others; use the 'checks' array form):
gh api -X PATCH repos/:owner/:repo/branches/main/protection/required_status_checks \
  -F strict=true \
  -f 'checks[][context]=<exact-context-string-from-verification>'
```
> Implementer/conductor note: the modern branch-protection API takes a `checks`
> array (`{context, app_id}`) rather than the legacy `contexts` string array;
> include any already-required contexts so the PATCH does not drop them. Confirm the
> current shape with the GET in step 1 first.

**🗣** First read what's already locked so we don't accidentally unlock it, then add
our new check to the lock list using the exact name we copied.

### Step 4 — Add the pinning unit test (NEW `tests/unit/ci/preview-smoke-workflow.test.ts`)
There is NO existing pattern for asserting CI yaml in `tests/unit/` (grep
confirmed: the only script test is `tests/unit/scripts/preview-cred-sync-entrypoint.test.ts`,
which spawns the script — it does not parse yaml). So this is a NEW lightweight
pattern: read the workflow file as text/parsed yaml and assert its load-bearing
invariants, mirroring how F-27/F-RLS-final pinned guards with `tests/unit/lint/*.test.ts`.

Assert (each = a way the gate could silently rot):
1. **The file exists** at `.github/workflows/preview-smoke.yml`.
2. **It triggers on `pull_request`** (opened/synchronize/reopened).
3. **It runs the smoke with `--unprotected`** — assert the run line contains
   `test:e2e:preview` AND `--unprotected` (so a future edit that drops the flag
   without re-enabling protection is caught; this also marks the EXACT spot
   F-INFRA-04 will touch).
4. **It is fail-closed on readiness** — assert the readiness step references
   `/api/auth/team` and a finite timeout (not an unbounded/`|| true` swallow).
5. **No `|| true` / `continue-on-error: true` on the smoke or readiness steps**
   (the F-INFRA-06 anti-pattern: a swallowed failure that green-skips). Grep the
   file for `continue-on-error` near those steps and assert absent/false.
6. **Permissions are least-privilege** (`contents: read`, no write scopes).
7. **Only first-party `actions/*` actions** — assert every `uses:` starts with
   `actions/` (no third-party marketplace action sneaks in).
8. **The job key/context matches the documented required-check name** — assert the
   job key is `smoke` (so if someone renames the job, this test fails LOUD,
   reminding them the required-check context in branch protection must be updated in
   lockstep — guards against the silent-never-blocks failure mode).

Use a yaml parser already in the dep tree if present; otherwise assert on the raw
file text (string `.includes` / regex), which needs no new dep. **Do NOT add a yaml
parser dependency for this** — raw-text assertions are sufficient and keep the
no-new-dep promise.

**🗣** A tiny test that reads the recipe card and checks it still says the load-bearing
things: runs on PRs, uses the no-key mode, has a real timeout, never swallows a
failure, only uses GitHub's own building blocks, and its name still matches the lock.
If anyone edits the recipe in a way that would quietly break the gate, this test goes red.

### Step 5 — Update `docs/runbooks/preview-smoke.md` (EDIT)
Add a short section near the top: "**Now also runs automatically in CI**
(F-INFRA-03) via `.github/workflows/preview-smoke.yml` — a required, blocking check
on `main`. The manual `npm run test:e2e:preview -- <url> --unprotected` invocation
below stays valid for local debugging / re-runs." Note: a CI smoke failure is read
with the SAME table in §4 (probe failure = environment; spec failure = regression).
Cross-reference that F-INFRA-04 will re-enable protection and drop `--unprotected`
from BOTH the runbook command and the workflow.

**🗣** Tell the runbook the robot now does this on every PR, and the human command
still works for poking at failures by hand.

### Step 6 — Update `docs/plans/BACKLOG.md` (EDIT)
Mark F-INFRA-03 status done with the ship cross-ref (PR + commit, filled at ship).
In the F-INFRA-04 entry, add: "When this lands, drop `--unprotected` from the
single run line in `.github/workflows/preview-smoke.yml` AND provision the
`VERCEL_AUTOMATION_BYPASS_SECRET` repo secret + add it to the smoke job's `env:`."
This makes F-INFRA-04 a precise one-liner-plus-one-secret.

**🗣** Cross off this task in the master list and leave F-INFRA-04 a sticky note saying
exactly the one line to change and the one envelope to add when protection comes back.

---

## TDD test plan

This change produces NO unit/integration/pgTAP-testable APP behaviour — it is a CI
config file. The honest test ladder:

1. **Unit (red-first):** before writing the workflow, write
   `tests/unit/ci/preview-smoke-workflow.test.ts` (Step 4). It fails (file
   missing) → write the workflow → it passes. Each assertion has a clear failure
   mode it guards (see Step 4 list). Run `npm test`.
2. **YAML validity / static check:** confirm the workflow parses. GitHub itself
   rejects malformed workflow yaml on push; additionally the unit test's parse (if
   using a parser) or `actionlint` (if available locally — do NOT add it as a
   dep) catches structural errors. Lightest honest option: rely on GitHub's own
   parse-on-push + the unit test's read.
3. **Live verification (the REAL test — this is how a CI gate is proven):** the
   FORGE PR for F-INFRA-03 ITSELF triggers `preview-smoke.yml` once pushed.
   Observe on that PR:
   - the workflow appears and runs,
   - URL discovery resolves the right `-git-<branch>-<scope>` preview,
   - the readiness poll waits then proceeds on 200,
   - the 75 `@critical` specs run and pass (or fail loudly),
   - a deliberately-broken probe scenario (e.g. before cred-sync finishes) shows
     the job WAITING/RED, never green-skipping.
   Then verify the required-check context name (Step 3) and that the merge button
   is genuinely blocked until the smoke is green.
   **🗣** The only true proof a gate works is watching it gate a real PR — the
   F-INFRA-03 PR is its own first guinea pig.
4. **NO new app tests, NO pgTAP, NO integration, NO PITR** — there is no schema,
   no RLS, no migration, no runtime code. (Same right-sizing as F-27 / F-RLS-final,
   which were config/test/docs-only.)

**ANVIL foresight headline for the runner:** add ONLY the Step-4 unit test file;
land it WITH the workflow on the feature branch (commit+push BEFORE the squash so
the test ships alongside the thing it pins — per the standing ops gotcha). The
"browser sweep" rung is N/A; the live-PR observation above IS the E2E evidence and
should be pasted into the cert.

---

## Acceptance criteria

1. `.github/workflows/preview-smoke.yml` exists, kebab-case, mirrors
   `preview-cred-sync.yml` house style (descriptive name, least-priv `permissions`,
   per-job concurrency, first-party pinned actions only, no echoed secrets).
2. On a real PR it discovers the PR's cred-wired preview URL, waits for
   `/api/auth/team`=200 (fail-closed 12-min timeout), and runs
   `npm run test:e2e:preview -- <url> --unprotected` → 75/75 `@critical` green.
3. The job FAILS CLOSED (RED) — never green-skips — when: no preview URL found,
   readiness never reaches 200, or any spec fails.
4. The 13 `E2E_*` secrets are provisioned; `VERCEL_API_TOKEN` reused.
5. The required-check context name is verified VERBATIM from a real run and added
   to `main` branch protection (merge blocked until green) WITHOUT dropping any
   existing required check.
6. `tests/unit/ci/preview-smoke-workflow.test.ts` passes and pins all 8 invariants.
7. Runbook + BACKLOG updated; F-INFRA-04's future one-line change is documented.
8. NO `lib/**` change, NO new runtime dep, NO migration, NO RLS.

---

## Risk Assessment

### R1 — Two-deploy race / readiness (TOP risk) — Severity: HIGH — must-fix mitigation
**Concurrency/timing.** The PR has two deploys; testing the empty first one yields
500s and a false RED (or worse, flaky behaviour). `pull_request` fires before
cred-sync's second deploy is ready.
- **Mitigation (must be in the workflow):** gate ALL spec execution behind the
  `/api/auth/team`=200 poll with a finite (12-min) fail-closed timeout. 200 there
  is only reachable on the cred-wired deploy. Plus `_previewProbe.ts`'s independent
  DB-identity probe. Concurrency `cancel-in-progress: true` so a new push doesn't
  leave a stale smoke racing a newer deploy.
- **Residual:** if cred-sync itself fails (its own RED check), the smoke times out
  RED with a message pointing at the cred-sync run — correct fail-closed behaviour,
  not a smoke bug. Acceptable.
- **Must-fix flag:** the readiness poll + fail-closed timeout is NON-NEGOTIABLE; a
  workflow that runs specs without it would be the F-INFRA-06 bug reborn. (This is a
  design requirement of the plan, already specified — so it is RESOLVED in-plan, not
  an open blocker.)

### R2 — Required-check context-name mismatch silently never blocks — Severity: HIGH — must-fix mitigation
**Launch blocker.** If the context string set in branch protection doesn't match
the job's reported name EXACTLY, the "blocking gate" silently never blocks (or
blocks forever). The whole point of the unit is lost without anyone noticing.
- **Mitigation (must-do, in Step 3):** require the context name be read VERBATIM
  from a real run (`gh api …/check-runs --jq '.check_runs[].name'`) BEFORE setting
  branch protection — never guessed. Step-4 unit test pins the job key so a later
  rename fails loudly. Verify the merge button is actually blocked on a test PR.
- **Must-fix flag:** YES — verifying the live context name + confirming the merge
  button blocks is a Gate-2/ship acceptance gate. The plan specifies the exact
  verification command; the CONDUCTOR must execute it and not skip to a guessed name.

### R3 — CI cost / runtime of 75 specs — Severity: MEDIUM
**Resource/business.** 75 chromium specs + `npm ci` + `playwright install` on every
PR push costs runner minutes and adds latency to the merge loop. `cancel-in-progress`
mitigates wasted parallel runs; `--with-deps chromium` (one browser) keeps install
lean. The suite is ~the same one the conductor already runs manually (workers=1,
serial). Acceptable for a blocking gate on a low-PR-volume solo project; revisit
only if PR volume grows. **Not a must-fix.**
- **Note:** `workers: 1` (serial, in `playwright.config.ts`) makes the run slower
  but deterministic — do NOT change it for CI; the order-pipeline specs share state.

### R4 — Secret leakage in CI logs — Severity: MEDIUM
**Security.** PINs/passwords could leak if echoed or if a step runs `set -x` over
the env block.
- **Mitigation:** secrets flow ONLY via `env:` from `secrets.*` (GitHub auto-masks);
  the smoke scripts already never print PINs; no `echo`/`set -x` over secret lines.
  Values are test-only PINs against throwaway preview branches with ANVIL-TEST seed
  data (never production), so blast radius is low even in the worst case. **Not a
  must-fix**, but the no-echo discipline is required (and pinned by Step-4 test
  #5's no-`continue-on-error`/no-swallow spirit + review).

### R5 — Vercel API discovery brittleness — Severity: MEDIUM
**Business-logic/integration.** The deployment-discovery call could return the wrong
deploy (a stale/branch-mismatched one) or the endpoint shape could differ from
assumption.
- **Mitigation:** filter by `meta.githubCommitRef` + `state === 'READY'` + require
  the URL pass `PREVIEW_HOST_RE`; the readiness poll then absorbs "picked a deploy
  that isn't wired yet" by waiting for 200; `e2e-preview.mjs` hard-refuses any
  non-matching host. Prefer the auto-maintained `git-<branch>` alias (always newest
  READY) over a hash URL. Confirm the endpoint against the live API at build time
  (same as `vercel-env-client.mjs` did). Fail closed if no match. **Not a must-fix**
  — multiple downstream guards catch a wrong URL.

### R6 — Migration safety / data — Severity: NONE
No schema, no migration, no data movement. Previews use throwaway seed-born branches.
**No material risk in this category.**

### R7 — Hexagonal / dependency — Severity: NONE
No `lib/**` change, no port/adapter, no new runtime dependency, no vendor SDK in app
code. The inline Vercel API call lives in CI shell (same posture as the shipped
`preview-cred-sync.mjs`), not in `app/**` or `lib/**`. **No material risk; contract
not engaged.**

### Must-fix summary for Gate 2
- **R1 (readiness/two-deploy)** — RESOLVED in-plan by the mandatory fail-closed
  `/api/auth/team`=200 poll. The implementer MUST include it; a workflow without it
  is rejected.
- **R2 (required-check name)** — must be verified VERBATIM from a live run before
  branch protection is set, and the merge-button-blocks check confirmed. This is an
  operational must-do for the conductor at ship.

No must-fix risk BLOCKS planning — both are addressed by following the plan's
specified steps. There are no unresolved must-fix blockers that loop back to Order.

---

## Hexagonal verdict (for Gate 2)

- **Port used/added:** NONE. This unit adds no port and touches no existing port —
  it is CI orchestration over already-shipped infrastructure.
- **Adapter:** NONE added/changed. The only external API call (Vercel deployments
  lookup) is inline CI shell, the same posture as the already-shipped
  `scripts/preview-cred-sync.mjs` (CI tooling, not app `lib/**`).
- **New dependencies:** NONE. No `package.json` change. `npm ci` +
  `npx playwright install chromium` use existing devDeps (`@playwright/test`
  already present). No yaml-parser dep added (Step-4 test uses raw-text assertions).
- **Wrapped?** N/A — no new vendor library introduced.
- **Rip-out test:** **PASS** (vacuous — nothing to rip out; no vendor coupling
  added to app code). Removing this unit = delete one yaml file + one unit test +
  drop one required-check context. Zero app/`lib`/data impact.

**Verdict line:** No port, no adapter, no new dependency, rip-out **PASS**. Not a
Gate-2 hexagonal blocker.

---

## Rollback

Pure additive CI config — zero production blast radius.
1. Delete `.github/workflows/preview-smoke.yml`.
2. Remove the required-check context from `main` branch protection
   (`gh api -X PATCH …/required_status_checks` dropping the `smoke` context).
3. (Optional) delete `tests/unit/ci/preview-smoke-workflow.test.ts` and revert the
   runbook/BACKLOG edits.
The app, database, production wiring, the native Supabase↔Vercel integration, and
`preview-cred-sync.yml` are all untouched. The conductor reverts to running the
smoke by hand (`npm run test:e2e:preview -- <url> --unprotected`).

**🗣** If it misbehaves: delete the recipe card and unlock the button — nothing about
the live app, the database, or the existing robots changes; you just go back to the
human running the test by hand.

---

## One-time setup note
Pushing a `.github/workflows/` file may require a token/permission with the
`workflow` scope (same gotcha logged for F-INFRA-05). The conductor handles this at
ship time.
