# F-INFRA-05 — Own the Supabase→Vercel preview credential sync

**Date:** 2026-06-15
**Unit:** F-INFRA-05
**Status:** Plan locked at Gate 1 (spec approved by Hakan). This is the Order
(plan) artifact for the FORGE Render phase.
**Blocks:** F-RLS-04a (Orders RLS cutover) — NOT inert. F-RLS-04a needs a working
preview smoke + `SUPABASE_JWT_SECRET` present on the preview deploy.

---

## Visual mini-map

```
BUILD-PIPELINE TOOLING (outside the app hexagon)
  scripts/preview-cred-sync.mjs   ← orchestrator (run by CI)
    ├─ pure core: cred mapping · idempotency decision · redeploy decision
    └─ injected I/O: SupabaseManagementClient · VercelEnvClient
  .github/workflows/preview-cred-sync.yml  ← PR trigger (sync + cleanup)
🗣 This is wiring for the build robot, not the app. No lib/ port or adapter — the
   "pure core + injected I/O" split lives INSIDE the script so logic is testable.
```

---

## 1. Objective

Replace the manual per-PR environment bridge with an owned, deterministic
GitHub Action that, on every pull-request event, waits for the PR's Supabase
preview branch to become healthy, reads that branch's four credentials from the
Supabase Management API, writes them into the Vercel **Preview** scope scoped to
the PR's git branch (idempotently), and redeploys the preview so the build comes
up with a live DB connection. On PR close it deletes those branch-scoped Vercel
vars.

**🗣 In plain English:** Today every preview deploy of the app is dead on arrival
— it has no database password, so the first page load crashes (HTTP 500) and the
pre-ship robot test refuses to run. Right now a human pastes the password in by
hand for each pull request. This unit builds a small robot that does that paste
automatically and reliably every time, and tidies up after itself when the
pull request closes. After this, "open a PR → preview just works" with zero
manual steps.

### Acceptance bar (the ANVIL target)

Open a throwaway PR → its preview deploy comes up green with a live DB connection
**with no manual env edits** → `npm run test:e2e:preview -- <branch-alias-url> --unprotected`
passes **8/8 @critical + 4/4 DB-identity probe**. Close the PR → the four
branch-scoped Preview vars are gone from Vercel (`db:branches` already confirms
the Supabase branch is auto-deleted by Supabase).

**🗣 In plain English:** the proof is a live dry run: spin up a junk pull request,
watch the preview come alive on its own, run the 12-check robot suite and see it
pass, then close the pull request and confirm the leftover passwords are wiped
from Vercel.

---

## 2. Domain terms (plain-English bridge)

- **Supabase preview branch** — a disposable throwaway copy of the database that
  Supabase auto-creates per pull request (ADR-0006). 🗣 A scratch copy of the
  database, born fresh for each PR and thrown away when the PR closes — so tests
  never touch the real data.
- **Supabase Management API** — Supabase's admin REST API (not the app's data
  API), authenticated with a Personal Access Token. 🗣 The "settings desk" of
  Supabase: you ask it for a branch's connection details and keys. Different door
  from the one the app uses to read/write rows.
- **`SUPABASE_ACCESS_TOKEN`** — a Personal Access Token (PAT) for the Management
  API; already provisioned by Hakan as a GitHub Actions repo secret. 🗣 The
  master key card that lets the robot ask Supabase admin questions. Never logged.
- **Vercel Preview scope (branch-scoped)** — a Vercel environment variable that
  only applies to deployments built from one specific git branch. 🗣 A
  sticky-note password that only the previews of *this one* pull request can read
  — not production, not other PRs.
- **`VERCEL_API_TOKEN`** — a Vercel REST API token with env-write scope; already
  provisioned as a GitHub Actions repo secret. 🗣 The key card that lets the robot
  write those sticky-notes into Vercel. Never logged.
- **Idempotent** — running it twice produces the same end state, no duplicates,
  no errors. 🗣 Safe to press the button again and again — it never makes a mess
  the second time. Required because Vercel fires a `synchronize` event on every
  push to the PR.
- **Redeploy** — asking Vercel to build the preview again, this time with the env
  vars present. 🗣 The very first build happens *before* the passwords exist, so
  we tell Vercel "build it once more, now that the passwords are in place".

---

## 3. Compliance / architecture flags

- **Hexagonal check: N/A — build-pipeline tooling, outside the app's hexagon.**
  This unit adds NO code under `lib/**`. It lives in `scripts/` (the runner) and
  `.github/workflows/` (the trigger). Per CLAUDE.md, ports/adapters describe the
  *app*; CI tooling is not the app, so no `lib/ports/` or `lib/adapters/` entry is
  required. 🗣 This is the robot that sets up the test rig, not part of the product
  itself — so the Lego-socket rules for the product don't apply here. The
  testability rule (pure core + injected I/O) still applies *inside* the script.
- **ADR-0006 respected, not modified.** The native Supabase↔Vercel integration
  keeps managing the 9 Production-scoped Supabase vars. Our action owns
  **Preview scope only**. We do NOT touch production wiring. 🗣 We're only filling
  in the *preview* passwords; production keeps its own separate setup, untouched.
- **No schema change, no migration.** 🗣 The database structure is not modified at
  all.
- **New ADR?** Optional but recommended: a short **ADR-0008** recording "the
  preview cred sync is owned by us, not the native integration; native owns
  Production scope, our action owns Preview scope." This documents the boundary so
  a future reader does not re-wire it into the native integration. Listed as an
  optional deliverable in §5; not a build blocker.

### ADR conflict scan

- ADR-0006 (per-PR Supabase preview branches): **complementary, no conflict.**
  ADR-0006 explicitly noted "CI execution (GitHub Actions) remains a separate
  future unit" (line 58) — this unit IS that future unit. We honour its hard
  invariant: **no Vercel preview deployment may carry production Supabase
  credentials.** Our sync writes only the *branch's* creds, scoped to the branch.
- ADR-0007 (authenticated DB client / GUC bridge): no overlap; that is runtime
  app code, this is build tooling.
- No other ADR conflicts found.

---

## 4. Files to create / modify

### Create

| Path | Purpose |
| ---- | ------- |
| `.github/workflows/preview-cred-sync.yml` | The GitHub Action: triggers, jobs, steps, secret refs, concurrency control. **First file in `.github/workflows/` in this repo** — set the house style here (kebab-case filename, descriptive `name:`, pinned action SHAs/tags). |
| `scripts/preview-cred-sync.mjs` | The orchestrator entrypoint the workflow runs via `node`. Thin: parses inputs (event name, PR git branch, IDs from env), constructs the two real I/O clients, calls the pure core, exits non-zero on failure. |
| `scripts/preview-cred-sync/core.mjs` | **Pure core** — no network, no `process`. Exported pure functions: cred→env mapping, idempotency decision (create vs update vs noop), redeploy decision, JWT-withheld handling, branch-match-by-name, polling/backoff decision (next delay given attempt + status). Everything decision-shaped is here so vitest can test it with zero mocking. |
| `scripts/preview-cred-sync/supabase-management-client.mjs` | **Injected I/O** — the only place Supabase Management API HTTP calls live. Thin wrapper over global `fetch`: `listBranches(parentRef)`, `getApiKeys(branchRef)`, `getProjectUrl(branchRef)`, `getJwtSecret(branchRef)`. Returns plain mapped objects; never logs secret values. |
| `scripts/preview-cred-sync/vercel-env-client.mjs` | **Injected I/O** — the only place Vercel REST API HTTP calls live: `listBranchEnv(gitBranch)`, `createEnv(...)`, `updateEnv(envId, ...)`, `deleteEnv(envId)`, `createDeployment(gitRef)` (the redeploy). Never logs secret values. |
| `scripts/preview-cred-sync/redact.mjs` | Tiny shared secret-safe logging helper: a `log.info/warn/error` wrapper and a `redact(value)` used so the four secrets + the two tokens are never printed. (Mirrors the spirit of `lib/observability/log.ts` but standalone — script tooling must not import app `lib/`.) |
| `tests/unit/scripts/preview-cred-sync-core.test.ts` | Vitest unit tests for the pure core (imports `scripts/preview-cred-sync/core.mjs`). |
| `tests/unit/scripts/preview-cred-sync-clients.test.ts` | Vitest unit tests for the two I/O clients with `fetch` faked (asserts URL/path/headers/body shape + that secrets are never logged). |
| `docs/runbooks/preview-cred-sync.md` | Operator runbook: what the action does, the secrets it needs, how to debug a failed sync, how to manually re-run, and the rollback (delete the workflow). |

### Modify

| Path | Change |
| ---- | ------ |
| `docs/runbooks/preview-smoke.md` | Add a note: the per-PR Preview env vars are now auto-synced by `.github/workflows/preview-cred-sync.yml`; the manual env bridge is retired. Cross-link the new runbook. |
| `docs/plans/BACKLOG.md` | Move F-INFRA-05 from blocker to "shipped"; note F-RLS-04a is unblocked once this ANVIL-certs. |
| `package.json` (optional) | Add a convenience script `"preview:cred-sync": "node scripts/preview-cred-sync.mjs"` so the sync can be run locally for debugging. No new dependency. |

**🗣 In plain English:** one workflow file (the trigger), one entry script plus
three small helper files (split so the *thinking* part has no network and can be
unit-tested, and all network calls sit in two clearly-labelled "phone the API"
files), a redaction helper so passwords never end up in logs, two test files, and
two docs. No product code changes.

---

## 5. Runtime & dependency decision (ZERO new deps)

**Language/runner decision — important, read this:** the spec said "TypeScript via
the repo's existing TS runner." On inspection, **this repo has NO TypeScript
script runner.** There is no `tsx` and no `ts-node` in `package.json`; the only
non-test script that executes is `scripts/e2e-preview.mjs`, run via plain `node`
(`"test:e2e:preview": "node scripts/e2e-preview.mjs"`). TypeScript exists only for
the Next.js app build and for Vitest tests. Adding `tsx`/`ts-node` would be a NEW
runtime dependency — explicitly discouraged by the spec and a code-critic flag.

**Decision: write the script as ES modules (`.mjs`), exactly matching the existing
`scripts/e2e-preview.mjs` precedent, and unit-test it from Vitest `.ts` tests that
import the `.mjs` modules** — the identical pattern already used by
`tests/unit/scripts/e2e-preview-guards.test.ts` testing `scripts/e2e-preview.mjs`.
Vitest resolves and runs `.mjs` natively. The GitHub Actions runner runs the
script with `node scripts/preview-cred-sync.mjs` on Node 20+ using the built-in
global `fetch`.

- **New runtime dependencies: NONE.** Node 20+ global `fetch`, built-in modules
  (`node:process`), and the GitHub Actions runner cover everything.
- **New dev dependencies: NONE.** Vitest (already present) tests the `.mjs`.
- Type-safety: JSDoc `@typedef`/`@param` annotations in the `.mjs` files give
  editor type hints without a compile step; `tsc --noEmit` does not cover `.mjs`,
  which is consistent with the existing `e2e-preview.mjs` (also untyped at build).

**🗣 In plain English:** the spec assumed we had a tool to run TypeScript scripts
— we don't, and adding one would break the "no new dependencies" rule. So we write
the script in the same plain-JavaScript style the repo already uses for its one
existing script, and test it the same way. Nothing new gets installed. If we
*wanted* full type-checking we'd have to add a tool; not worth a new dependency for
a CI helper. **New dependency count: zero.**

---

## 6. Script internal structure (pure core + injected I/O)

The split exists so all judgement lives in pure functions that vitest tests with
no network, and all I/O lives behind two thin clients that the entrypoint injects.

```
scripts/preview-cred-sync.mjs            (entrypoint — impure shell)
  reads: GITHUB event name, PR head git branch, env tokens, hardcoded IDs
  builds: supabaseClient, vercelClient (real I/O)
  calls : runSync({ core, supabaseClient, vercelClient, gitBranch, log })
       or runCleanup({ ... })  depending on the event
  exits : process.exit(0 | 1)

scripts/preview-cred-sync/core.mjs       (PURE — no fetch, no process)
  matchBranchByName(branches, gitBranch)          -> branch | null
  isBranchHealthy(branch)                          -> boolean
  nextPollDelayMs(attempt, opts)                   -> number   (backoff)
  pollDecision(branch | null, attempt, opts)       -> 'ready'|'wait'|'giveup'
  mapCredsToEnvWrites(creds)                        -> EnvWrite[] (the 4 keys)
  decideEnvAction(existingEnvVars, desiredWrite)    -> 'create'|'update'|'noop' (+ envId)
  decideRedeploy(syncResult)                        -> boolean
  jwtPlan(creds)                                    -> { write: bool, warn: bool }

scripts/preview-cred-sync/supabase-management-client.mjs  (I/O — fetch only here)
scripts/preview-cred-sync/vercel-env-client.mjs           (I/O — fetch only here)
scripts/preview-cred-sync/redact.mjs                      (secret-safe logging)
```

### The four env keys written to Vercel Preview scope (branch-scoped)

| Vercel env key | Source (Supabase Management API) | Type |
| -------------- | -------------------------------- | ---- |
| `NEXT_PUBLIC_SUPABASE_URL` | derived `https://{branch_ref}.supabase.co` (verify in Render) | encrypted |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `api-keys?reveal=true` → anon | encrypted |
| `SUPABASE_SERVICE_ROLE_KEY` | `api-keys?reveal=true` → service_role | encrypted |
| `SUPABASE_JWT_SECRET` | branch JWT secret endpoint (verify) — **may be absent** | encrypted |

All four use `type: "encrypted"`, `target: ["preview"]`, `gitBranch: "<head git branch>"`.

**🗣 In plain English:** four passwords get copied from the throwaway database's
admin desk into Vercel, each tagged "preview only, this branch only" and stored
encrypted. The robot's *brain* (which password goes where, create-vs-update, do we
redeploy, is the JWT one missing) is separated from its *hands* (the actual phone
calls to Supabase and Vercel), so we can test the brain without making any real
calls.

### Hardcoded, non-secret config (lives in the script/workflow)

- Vercel `projectId`: `prj_84NlryZjHcGlA6R2O6zQ57aWkOFZ`
- Vercel `teamId`: `team_WRtx6wNjCoPN95xacOxK6m1e`
- Supabase parent project ref: `uqgecljspgtevoylwkep` (the production/parent ref
  whose `/branches` list contains the PR branches — verify this is the correct
  parent for branching in Render).

🗣 These are public identifiers (like a shop's address), not passwords — safe to
write in the file.

---

## 7. Endpoints (verify exact paths/shapes against current Supabase + Vercel docs in Render)

**Supabase Management API** (auth: `Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}`):
1. List branches: `GET /v1/projects/{parent_ref}/branches` → find element where
   `name === gitBranch` → take its `project_ref` (the branch's own ref). Observed
   shape includes `status: "FUNCTIONS_DEPLOYED"` and
   `preview_project_status: "ACTIVE_HEALTHY"`.
2. API keys (service-role): `GET /v1/projects/{branch_ref}/api-keys?reveal=true`
   → `anon` + `service_role`.
3. Project URL: derive `https://{branch_ref}.supabase.co` (verify against a
   project-details endpoint in Render).
4. JWT secret: verify the current endpoint (likely
   `GET /v1/projects/{branch_ref}/config/auth` or a postgrest/jwt config endpoint).
   **Feasibility UNKNOWN** — see §10.

**Vercel REST API** (auth: `Authorization: Bearer ${VERCEL_API_TOKEN}`, query
`?teamId=team_...`):
- List branch env: `GET /v9/projects/{projectId}/env?gitBranch=<branch>&decrypt=false`
  → existing var ids for the create/update decision.
- Create: `POST /v10/projects/{projectId}/env` body
  `{ key, value, type:"encrypted", target:["preview"], gitBranch:"<branch>" }`.
- Update (idempotency): `PATCH /v10/projects/{projectId}/env/{envId}` with the new value.
- Delete (cleanup): `DELETE /v9/projects/{projectId}/env/{envId}`.
- Redeploy: `POST /v13/deployments?teamId=...` (see §9).

🗣 All exact URLs are "verify in Render" — the spec flagged the API is moving; we
pin them against the live docs while building, not from memory.

### Health-poll definition (the wait)

`isBranchHealthy(branch)` returns true when
`branch.preview_project_status === "ACTIVE_HEALTHY"` **and**
`branch.status === "FUNCTIONS_DEPLOYED"` (verify both are required; if the docs say
either suffices, relax to OR — decide in Render against a real branch). Poll loop:
bounded total timeout (default **10 minutes**), exponential-ish backoff capped at
~20s between polls (e.g. 5s, 5s, 10s, 10s, 15s, 20s, 20s…), driven by the pure
`nextPollDelayMs`/`pollDecision`. On timeout → fail the job loudly (fail-closed:
better a red CI check than a silently-broken preview).

---

## 8. Idempotency strategy (Vercel env writes)

`synchronize` fires on every push to an open PR, so the sync re-runs constantly. It
must converge, never duplicate. Strategy (pure `decideEnvAction`):

1. `GET /v9/projects/{projectId}/env?gitBranch=<branch>` → list of existing
   branch-scoped vars (id + key, value not needed/decrypted).
2. For each of the 4 desired keys:
   - if no existing var with that key+gitBranch → **create** (POST v10).
   - if one exists → **update** its value via **PATCH v10 /env/{envId}** (Vercel
     returns 409 on a duplicate create, so we never blind-POST an existing key).
   - if it exists and we cannot detect a value change → still PATCH (cheap;
     guarantees the latest branch creds win after a re-seed/branch recreate).
3. Never delete-then-create on the sync path (avoids a window where the var is
   absent during a concurrent build).

**🗣 In plain English:** before writing, the robot asks Vercel "do you already have
this sticky-note for this branch?" If no, it adds one; if yes, it overwrites it.
That way pressing the button ten times leaves exactly four notes, never forty, and
the freshest password always wins.

---

## 9. Redeploy mechanism (decision)

**Chosen: trigger a fresh Vercel deployment via the Vercel REST API for the PR's
git ref** — `POST /v13/deployments?teamId=...&forceNew=1` with a body that points
Vercel at the project + git branch (using `gitSource` for the PR branch, or
`{ deploymentId, ... }` to redeploy the latest preview build of that branch —
verify the exact body in Render; both are documented routes).

- **Why not a deploy hook:** deploy hooks build from the production branch/default
  config and are awkward to scope to an arbitrary PR branch; the API redeploy is
  branch-precise.
- **Why not an empty commit:** pollutes git history, racey with `synchronize`
  re-triggering, least preferred (spec agrees).

The redeploy is **conditional** (pure `decideRedeploy`): only redeploy if env vars
were actually created/updated this run (i.e. the first build that lacked them).
If a run is a pure no-op (vars already correct), skip the redeploy to avoid an
infinite redeploy→synchronize loop.

> **Loop guard (must-think-about):** a redeploy can itself produce a new
> deployment event. We avoid a loop because (a) the workflow triggers on
> `pull_request`, not on `deployment`/`deployment_status`, and the API redeploy
> does not create a `pull_request` event; and (b) `decideRedeploy` returns false on
> a no-op run. Confirm in Render that the API redeploy does not re-fire the
> `pull_request: synchronize` trigger.

**🗣 In plain English:** the very first preview build happens before the passwords
exist, so it crashes. After we add the passwords, we phone Vercel and say "build
this branch's preview again." We only do that when we actually changed something,
so the robot can't get stuck rebuilding forever.

---

## 10. JWT-secret unknown — handling + how Render resolves it

Supabase is migrating from a single symmetric `SUPABASE_JWT_SECRET` to asymmetric
signing keys. The Management API **may not return** a symmetric JWT secret for a
branch.

**Handling (locked):**
- `jwtPlan(creds)` in the pure core: if a JWT secret is present →
  `{ write: true, warn: false }`; if absent → `{ write: false, warn: true }`.
- On absent: log a **LOUD warning** ("SUPABASE_JWT_SECRET not returned by the
  Management API for branch X — continuing; url/anon/service-role were synced. If
  the preview needs the JWT secret, this is a known gap, see F-INFRA-05 §10") and
  **continue** — do NOT fail the url/anon/service-role write path.
- The other three keys are always written regardless.

**How Render resolves the unknown:** during the Render phase, run the sync against
a REAL Supabase preview branch and observe whether the JWT secret endpoint returns
a value. Three outcomes, all acceptable plan exits:
1. Secret returned → write all four keys; done.
2. Secret absent but F-RLS-04a does NOT need it on preview (app verifies tokens
   another way) → ship with the 3-key path + loud warning; record in the runbook.
3. Secret absent AND F-RLS-04a DOES need it → escalate to the conductor: this
   becomes a follow-up (e.g. mint/derive the JWT secret another way) and is logged
   in BACKLOG; it does NOT block shipping the url/anon/service-role sync, which is
   independently valuable.

**🗣 In plain English:** one of the four passwords might not be handed out anymore
because Supabase is changing how it does logins. The robot copies the other three
no matter what, and if the fourth is missing it shouts a clear warning instead of
crashing. We find out for real by running it against a live throwaway branch during
the build phase; whichever way it lands, we have a defined, safe response.

---

## 11. GitHub Actions workflow shape (`.github/workflows/preview-cred-sync.yml`)

```yaml
name: Preview cred sync (Supabase → Vercel)

on:
  pull_request:
    types: [opened, synchronize, reopened, closed]

# One run per PR; a new push cancels the in-flight sync so two runs never race
# on the same branch's Vercel env vars.
concurrency:
  group: preview-cred-sync-${{ github.event.pull_request.number }}
  cancel-in-progress: true

permissions:
  contents: read           # checkout only; no write to the repo

jobs:
  sync:
    if: github.event.action != 'closed'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<pinned>
      - uses: actions/setup-node@<pinned>   # node-version: 20
      - name: Sync preview creds
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
          VERCEL_API_TOKEN:      ${{ secrets.VERCEL_API_TOKEN }}
          PR_GIT_BRANCH:         ${{ github.event.pull_request.head.ref }}
          EVENT_ACTION:          ${{ github.event.action }}
        run: node scripts/preview-cred-sync.mjs sync

  cleanup:
    if: github.event.action == 'closed'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<pinned>
      - uses: actions/setup-node@<pinned>   # node-version: 20
      - name: Remove branch-scoped preview creds
        env:
          VERCEL_API_TOKEN: ${{ secrets.VERCEL_API_TOKEN }}
          PR_GIT_BRANCH:    ${{ github.event.pull_request.head.ref }}
          EVENT_ACTION:     ${{ github.event.action }}
        run: node scripts/preview-cred-sync.mjs cleanup
```

Notes:
- **Concurrency** keyed on the PR number with `cancel-in-progress: true` is the
  race guard the spec demands — a second push cancels the first sync mid-flight so
  two runs can't both be PATCHing the same env var.
- **`permissions: contents: read`** only — the job needs no repo-write scope; least
  privilege. (No `pull-requests: write` etc.)
- **Pin actions to a SHA or major tag** (`actions/checkout`, `actions/setup-node`).
  No third-party marketplace actions — checkout + setup-node are first-party
  GitHub. Zero new supply-chain surface beyond GitHub's own.
- The branch name comes from `github.event.pull_request.head.ref` — the same git
  branch name used to match the Supabase branch and to scope the Vercel vars.
- Secrets are passed via `env:` from `secrets.*`; never echoed.

**🗣 In plain English:** the trigger fires on the four pull-request moments (opened,
new push, reopened, closed). Closing runs the cleanup job; the rest run the sync
job. "Concurrency" means if you push twice fast, the older run is cancelled so the
two robots don't fight over the same sticky-note. The job is given the absolute
minimum permissions and only uses GitHub's own building-block actions.

---

## 12. Secret-safe logging rule

- The script NEVER logs values of: `SUPABASE_SERVICE_ROLE_KEY`,
  `SUPABASE_JWT_SECRET`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (anon is publishable but
  still treat as opaque), `SUPABASE_ACCESS_TOKEN`, `VERCEL_API_TOKEN`.
- Log only: key NAMES, the action taken (`created`/`updated`/`noop`/`deleted`),
  the git branch, the branch ref, env-var ids, HTTP status codes, and counts.
- `redact.mjs` provides `redact(v)` → `"<redacted:NN chars>"` for any value that
  must appear in a debug line, and a `log.{info,warn,error}` that the script uses
  exclusively (no raw `console.log` of objects that might contain a secret).
- A unit test asserts that mapping/logging code paths never emit a known secret
  literal (mirrors the `e2e-preview-guards` "never prints the bypass secret" test).
- GitHub Actions also masks `secrets.*` in logs automatically; this is belt **and**
  braces — the script must be safe even when run locally where masking is absent.
- The repo's secret-scan pre-commit hook guards the committed files.

**🗣 In plain English:** the robot is forbidden from printing any password in its
logs — it only ever says things like "updated NEXT_PUBLIC_SUPABASE_URL (created)"
or "service-role key: <redacted:219 chars>". GitHub also hides secrets in its logs,
but we don't rely on that alone, since the script can be run on a laptop too.

---

## 13. Build order (TDD-friendly)

Write tests first for each pure unit, then the I/O clients, then wire the
entrypoint, then the workflow, then the live E2E acceptance.

1. **Scaffold + redact helper.** Create `scripts/preview-cred-sync/redact.mjs`.
   Test: `redact` masks length only; `log.*` never emits the raw value. (RED→GREEN)
2. **Pure core: branch matching + health.** Test `matchBranchByName` (exact name,
   not found, multiple branches) and `isBranchHealthy` (ACTIVE_HEALTHY +
   FUNCTIONS_DEPLOYED true; any other status false). Implement.
3. **Pure core: polling decision.** Test `nextPollDelayMs` (backoff shape, cap) and
   `pollDecision` (`wait` while unhealthy under timeout, `ready` when healthy,
   `giveup` past timeout). Implement.
4. **Pure core: cred→env mapping.** Test `mapCredsToEnvWrites` produces exactly the
   4 keys with `type:encrypted`, `target:["preview"]`, correct `gitBranch`, correct
   value sources; and the URL-derivation rule. Implement.
5. **Pure core: idempotency decision.** Test `decideEnvAction`: create when absent,
   update (with the right envId) when present, the 4-key set converges. Implement.
6. **Pure core: JWT plan + redeploy decision.** Test `jwtPlan` (present→write,
   absent→warn-not-throw) and `decideRedeploy` (true when any create/update, false
   on full no-op). Implement.
7. **I/O clients (faked fetch).** Test `supabase-management-client.mjs` and
   `vercel-env-client.mjs`: each method calls the right METHOD + URL + headers +
   body shape; auth header present; secrets never logged; non-2xx → typed error.
   Inject a fake `fetch`. Implement.
8. **Entrypoint wiring.** `scripts/preview-cred-sync.mjs` — dispatch on
   `sync`/`cleanup` arg + `EVENT_ACTION`, build real clients, call core, exit
   codes. (Covered by the live E2E; optional thin black-box test like
   `e2e-preview-guards` for the arg/dispatch + missing-env fail-closed paths.)
9. **Workflow file.** Write `.github/workflows/preview-cred-sync.yml` per §11.
10. **Docs.** Write `docs/runbooks/preview-cred-sync.md`; update
    `docs/runbooks/preview-smoke.md` + `BACKLOG.md`.
11. **Live acceptance (Render/ANVIL Gate 4).** Open a throwaway PR; confirm the
    sync runs, preview comes up green with a live DB, run the preview smoke
    (8/8 + 4/4), close the PR, confirm Vercel vars gone. **Resolve the JWT unknown
    here (§10).**

**🗣 In plain English:** build the brain piece by piece with a failing test first
each time, then the two "phone the API" files with a fake phone so no real calls
happen in tests, then bolt them together, then the trigger and the docs, and
finally prove the whole thing on a real junk pull request.

---

## 14. Test matrix

### Unit (Vitest, `tests/unit/scripts/`)

| # | Test | Asserts |
| - | ---- | ------- |
| U1 | `redact` masks value, reports length only | no raw secret in output |
| U2 | `log.*` never emits a known secret literal | secret-safe logging |
| U3 | `matchBranchByName` exact-match | returns the branch |
| U4 | `matchBranchByName` not-found / multiple | null / correct pick |
| U5 | `isBranchHealthy` healthy vs each unhealthy status | true / false |
| U6 | `nextPollDelayMs` backoff + cap | monotonic, capped |
| U7 | `pollDecision` wait/ready/giveup | correct transitions incl. timeout |
| U8 | `mapCredsToEnvWrites` shape | exactly 4 keys, type/target/gitBranch correct |
| U9 | URL derivation rule | `https://{branch_ref}.supabase.co` |
| U10 | `decideEnvAction` create (absent) | `create` |
| U11 | `decideEnvAction` update (present) | `update` + correct envId |
| U12 | `decideEnvAction` convergence over 4 keys | no duplicates |
| U13 | `jwtPlan` present | `{write:true, warn:false}` |
| U14 | `jwtPlan` absent | `{write:false, warn:true}` and **does not throw** |
| U15 | `decideRedeploy` after a write | true |
| U16 | `decideRedeploy` on full no-op | false |
| U17 | Supabase client methods (faked fetch) | method/URL/headers/body shape |
| U18 | Vercel client create/list/patch/delete (faked fetch) | method/URL/body shape |
| U19 | Vercel client 409/non-2xx | typed error, no crash |
| U20 | Supabase missing-branch / API error | typed error surfaced |
| U21 | redeploy call shape (faked fetch) | correct POST /deployments |

### Live E2E acceptance (ANVIL Gate 4 — the bar)

- Open throwaway PR → sync action runs green; preview deploy comes up with a live
  DB connection, **no manual env edits**.
- `npm run test:e2e:preview -- <branch-alias-url> --unprotected` → **8/8 @critical
  + 4/4 DB-identity probe**.
- Close PR → the four branch-scoped Preview vars are **gone** from Vercel
  (verify via `GET /v9/.../env?gitBranch=...` or the Vercel dashboard); `db:branches`
  confirms the Supabase branch is auto-deleted.
- JWT unknown resolved per §10 and recorded.

**🗣 In plain English:** the small tests prove the brain and the (faked) phone
calls are correct without touching real systems; the big live test proves the whole
robot works end-to-end on a real junk pull request and cleans up after itself.

---

## 15. Acceptance criteria (Definition of Done)

1. `.github/workflows/preview-cred-sync.yml` triggers on the four PR events with
   per-PR concurrency + `cancel-in-progress`, least-privilege permissions, pinned
   first-party actions, secrets via `secrets.*`.
2. Sync path: waits for branch health (bounded), reads the 4 creds, writes them to
   Vercel Preview scope branch-scoped, idempotently, then conditionally redeploys.
3. Cleanup path: deletes the 4 branch-scoped Preview vars on PR close.
4. Pure core has NO network/`process` deps and is fully unit-tested (U1–U16);
   I/O clients tested with faked fetch (U17–U21). All unit tests green.
5. No secret value is ever logged (U2 + manual review + secret-scan hook).
6. **Zero** new `package.json` runtime/dev dependencies.
7. JWT-secret unknown handled (present→write; absent→loud warn, no throw) and
   resolved against a real branch in Render.
8. Live acceptance passes: throwaway PR → green preview + 8/8 + 4/4 → close → vars
   gone.
9. Runbook written; `preview-smoke.md` + `BACKLOG.md` updated; manual env bridge
   retired.

---

## 16. Risk Assessment (MANDATORY)

> Severity scale: LOW / MEDIUM / HIGH. **must-fix** = a Gate-2 blocker that must be
> resolved in the plan or build before ANVIL.

### Concurrency / race conditions

- **R1 — Two sync runs racing on the same branch's Vercel env vars** (push twice
  quickly). Severity: MEDIUM. *Mitigation:* `concurrency` group keyed on PR number
  with `cancel-in-progress: true` (§11) so the older run is cancelled; plus the
  create-vs-update idempotency (§8) converges even if a stale write lands. **Not
  must-fix** — mitigated in plan. 🗣 If you push twice fast, the first robot is
  cancelled and the second wins; even if both ran, they'd write the same notes.
- **R2 — First-build-before-vars race** (the known ~25s gap; build runs before the
  branch + vars exist). Severity: MEDIUM. *Mitigation:* the whole unit exists to
  fix this — wait-for-health poll + conditional redeploy after vars are written
  (§7, §9). **Not must-fix** (it is the unit's purpose). 🗣 This is the bug we're
  fixing: build first, add passwords, build again.
- **R3 — Redeploy loop** (redeploy re-fires a trigger). Severity: MEDIUM.
  *Mitigation:* trigger is `pull_request` only (not `deployment`); `decideRedeploy`
  returns false on no-op (§9). **Must confirm in Render** that the API redeploy
  does not emit `pull_request: synchronize`. Flagged, mitigated. 🗣 We made sure
  the "rebuild" can't make the robot rebuild forever; we double-check this live.

### Security

- **R4 — Secret leakage in logs.** Severity: HIGH if it happened. *Mitigation:*
  hard no-log rule + `redact.mjs` + unit test U2 + GitHub auto-mask + secret-scan
  hook (§12). **Not must-fix** — fully mitigated in plan; but the no-secret-log
  test (U2) is itself a **must-pass gate** in ANVIL. 🗣 The one thing that would be
  bad is printing a password; we have four independent guards against it.
- **R5 — Over-broad token / writing to wrong scope** (accidentally writing to
  Production scope or another project). Severity: HIGH. *Mitigation:* `target` is
  hardcoded `["preview"]` and `gitBranch` is always set (never a global var);
  `projectId`/`teamId` are pinned constants; ADR-0006's "no prod creds on preview"
  invariant is preserved because we only ever copy the *branch's* creds. **Must-fix
  guard:** a unit test (U8) must assert every write carries `target:["preview"]`
  AND a non-empty `gitBranch` — block any code path that could write a
  project-wide var. 🗣 The robot is physically prevented from touching production —
  every note is stamped "preview + this branch only", and a test enforces it.
- **R6 — `permissions` too broad.** Severity: LOW. *Mitigation:* `contents: read`
  only (§11). 🗣 The job can read the repo and nothing else.

### Data migration

- **R7 — N/A.** No schema change, no migration, no data movement. Severity: NONE.
  🗣 The database structure isn't touched at all.

### Business-logic flaws

- **R8 — Branch-name mismatch** (Supabase branch `name` ≠ Vercel `gitBranch` ≠
  `head.ref`, e.g. slug/normalization differences). Severity: MEDIUM.
  *Mitigation:* match on the raw `head.ref` consistently for both Supabase lookup
  and Vercel scoping; unit-test `matchBranchByName`; **verify in Render against a
  real branch** that Supabase's branch `name` equals the git head ref (Supabase
  may transform names). If they differ, the matching rule must normalize — resolve
  in Render. Flagged. 🗣 The robot finds the right database copy by branch name; if
  Supabase renames branches we adjust the matcher — we confirm this on a live run.
- **R9 — Wrong/withheld JWT secret breaks F-RLS-04a.** Severity: MEDIUM.
  *Mitigation:* §10 handling (write-if-present, loud-warn-if-absent, resolve in
  Render). The 3-key path is independently valuable, so this never blocks shipping
  the core sync. Flagged, with a defined escalation. 🗣 If the login password isn't
  handed out, we still fix the main problem and shout a warning, then decide what
  the next RLS unit needs.
- **R10 — Vercel/Supabase API shape drift** (endpoints/fields changed since the
  spec was written; Supabase is mid-migration). Severity: MEDIUM. *Mitigation:*
  every endpoint is marked "verify in Render against current docs" (§7); the I/O
  clients isolate all shape assumptions in two files; live E2E catches a wrong
  shape immediately. Flagged. 🗣 The APIs may have moved; we pin them against the
  live docs while building, and the real-PR test catches any mismatch.

### Launch blockers

- **R11 — Action does not run / runs but preview still 500s** (this unit gates
  F-RLS-04a). Severity: HIGH to the schedule. *Mitigation:* the live acceptance
  (§14) is the gate — F-RLS-04a does not start until this certs green. Fail-closed
  on health-poll timeout means a broken sync shows as a red CI check, not a silent
  bad preview. **Not must-fix in the plan** (it's the acceptance bar itself). 🗣 If
  this doesn't actually work, the next big unit can't start — so the live dry run
  is the hard gate.
- **R12 — `git push` of `.github/workflows/` requires `workflow` token scope.**
  Severity: LOW (process). *Mitigation:* note in the runbook that pushing the
  workflow file may require a token/permission with `workflow` scope; the conductor
  handles at ship time. 🗣 GitHub sometimes needs extra permission to add an
  automation file — a one-time setup note, not a code issue.

### must-fix summary

**No plan-level must-fix blockers remain** — every HIGH-severity risk is mitigated
in the plan. Two items are **must-PASS gates inside ANVIL** (not plan blockers):
- U2 (no secret ever logged) must be green.
- U8 (every Vercel write carries `target:["preview"]` + non-empty `gitBranch`)
  must be green — the structural guard against ever writing a production-scoped var.

Three items are **must-resolve-in-Render** (live verification, not plan gaps):
the JWT-secret feasibility (§10/R9), the branch-name match rule (R8), and the
redeploy-loop / API-shape confirmations (R3/R10).

**🗣 In plain English:** nothing in the plan blocks the next gate. Two automated
safety tests must pass before shipping (never log a password; never write outside
preview). Three things can only be confirmed by running it for real against a live
throwaway pull request — chiefly whether Supabase still hands out the login
password — and the plan says exactly what to do for each possible outcome.

---

## 17. Rollback note

This unit is **additive CI tooling with no production blast radius.** Rollback =
**delete `.github/workflows/preview-cred-sync.yml`** (and optionally the scripts).
The app, the database, production wiring, and the native Supabase↔Vercel
integration are all untouched. The only consequence of rolling back is reverting to
the manual per-PR env bridge. No data, no schema, no runtime code is affected.

**🗣 In plain English:** if it misbehaves, delete one file and we're exactly back
to where we are today (manual paste). There is nothing in production to break.

---

## 18. Hexagonal verdict (for Gate 2)

- **Port used/added:** NONE. 🗣 No new socket on the product.
- **Adapter:** NONE. 🗣 No new plug.
- **New dependencies:** NONE (zero new `package.json` entries; Node 20 global
  `fetch` + GitHub runner + existing Vitest). 🗣 Nothing installed.
- **Rip-out test:** **N/A — build-pipeline tooling outside the app hexagon.** No
  `lib/**` changes; the unit lives entirely in `scripts/` + `.github/workflows/`.
  If we ripped out this tooling tomorrow, ZERO app files change (we'd revert to the
  manual env bridge). 🗣 This robot isn't part of the product's Lego — pulling it
  out doesn't move a single product brick.
- **Internal testability split applied:** YES — pure core (no I/O) + two injected
  I/O clients, exactly the spec's requirement, even though no `lib/` port is needed.

**Verdict line:** Port: N/A · Adapter: N/A · New deps: none · Rip-out test:
N/A (CI tooling, outside the hexagon, zero app-file impact) → **PASS.**
