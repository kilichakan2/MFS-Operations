# Code-critic review — F-INFRA-05 (preview credential sync)

- **Date:** 2026-06-15
- **Branch:** feat/f-infra-05-preview-cred-sync
- **HEAD reviewed:** 7cebdf9 (base main @ 855553e)
- **Reviewer:** code-critic subagent (FORGE Guard phase)
- **Plan:** docs/plans/2026-06-15-f-infra-05-preview-cred-sync.md
- **VERDICT: FIX-THEN-SHIP** — loop back to Render for one correctness fix (no security/scope blocker)

## Suite results (run by code-critic)

- `npx vitest run tests/unit/scripts/` → **70/70 passing** (4 files: 3 new F-INFRA-05 + pre-existing e2e-preview-guards)
- `npm run typecheck` (`tsc --noEmit`) → **clean** (.mjs not type-checked by tsc — matches e2e-preview.mjs precedent; JSDoc is editor-only)
- `npm run lint` (`next lint`) → **clean, 0 warnings/0 errors**
- Integration suite: not run (needs local Supabase/Docker not running here; diff touches zero integration files) — noted, not a failure

## 🔴 Blockers

**None.** The two highest-weighted risks were hunted and verified closed:

- **Secret safety — PASS.** All logging routes through `redact.mjs`. The two secret values near a log line (`preview-cred-sync.mjs:137,144`) are `redact(...)`-wrapped. Both I/O clients throw errors carrying only path/label + HTTP status, never the token (`supabase-management-client.mjs:39`, `vercel-env-client.mjs:59`). Top-level catch (`preview-cred-sync.mjs:281`) logs `err.message` only. Workflow passes secrets via `env:` from `secrets.*`, never echoed/output. Asserted by U2, the two "error never includes token" tests (`clients.test.ts:108,226`), and the black-box "never prints a provided token" test (`entrypoint.test.ts:101`). Four independent guards.
- **Scope safety — PASS.** Every env write is built in one place (`core.mjs:136-142`) with `type:'encrypted'`, `target:['preview']` hardcoded, `gitBranch` required — `mapCredsToEnvWrites` throws on empty `gitBranch` (`core.mjs:130`), structurally blocking all-branches Preview vars. No path writes `target:['production']`. `projectId`/`teamId` pinned. Tests `core.test.ts:235,243`.
- **Zero new deps — PASS.** Only a `package.json` script alias (`preview:cred-sync`). All imports are Node built-ins or local `.mjs`.

## 🟡 Warnings (should-fix)

1. **`repoId` never supplied to the redeploy (the real gap).** `preview-cred-sync.mjs:233` reads `repoId` from `VERCEL_GIT_REPO_ID`, but the workflow (`.github/workflows/preview-cred-sync.yml:46-50`) never sets it → always `undefined` → redeploy body (`vercel-env-client.mjs:127-135`) omits it. Vercel `/v13/deployments` with `gitSource.type:'github'` generally **requires** `repoId`; without it the redeploy likely 400s. Fix: set `VERCEL_GIT_REPO_ID` (non-secret numeric GitHub repo id) in workflow `env:` or hardcode in `CONFIG`. *(This is the fix-then-ship item.)*
2. **`EVENT_ACTION` passed but never read.** Workflow sets it (`:50,:65`) but the script dispatches on argv mode + job-level `if:` conditions, never reads `EVENT_ACTION`. Dead config — remove from both env blocks or assert it agrees with the mode.
3. **`concurrency: cancel-in-progress: true` applies to cleanup too** (`:27-29`). A close-then-reopen race could cancel a mid-flight cleanup, leaving some of the 4 vars. Idempotent on re-run but nothing auto-re-triggers. Consider a separate concurrency group or `cancel-in-progress: false` for cleanup. Low likelihood.
4. **Actions pinned to floating major tags** (`actions/checkout@v4`, `actions/setup-node@v4` at `:41,:42,:57,:58`) not commit SHAs. Within plan §11 allowance + first-party, but SHA-pinning is stronger given this job holds two write-scoped tokens. Optional.

## 🔵 Architecture notes (non-blocking)

- **Hexagonal: correctly N/A.** Build-pipeline tooling in `scripts/` + `.github/workflows/`, not `lib/**` — no port/adapter required per CLAUDE.md + plan §3/§18. Internal pure-core + injected-I/O split is the right testability seam, genuinely applied.
- **Depth — all modules DEEP/appropriate, no pass-throughs introduced:**
  - `core.mjs` — DEEP (8 pure functions, real backoff/idempotency/JWT-plan/scope-guard logic).
  - `redact.mjs` — DEEP enough (concentrates the secret-safety contract).
  - `supabase-management-client.mjs` / `vercel-env-client.mjs` — thin by design (I/O adapters); they map vendor shapes to app shapes, real boundary work, not bare forwards.
  - `getProjectUrl` (`supabase-management-client.mjs:81`) — borderline pass-through, duplicates `core.mjs:deriveSupabaseUrl`, never called. 🔵 follow-up: delete it.

## 🟢 Test quality

- Strong: asserts behaviour through public interface (request shape, idempotency outcomes, scope guard, JWT-withheld warns-not-throws, cleanup deletes only owned keys). Black-box entrypoint tests spawn a real child process, assert fail-closed exit codes + no-secret-leak. Poll tests inject `sleepImpl`/`now` for determinism.
- `entrypoint.test.ts:248-266` ("does NOT redeploy on a pure no-op") — **does not exercise the no-op→no-redeploy path** (own comment admits it); only asserts the redeploy-happens case. False branch is covered by U16 (`core.test.ts:310`), so behaviour is tested but the name overpromises. Rename or feed zero-write creds.
- **Design note (not a defect):** idempotent path always PATCHes existing vars (plan §8 "latest creds win") → `updated>0` on every re-sync → `decideRedeploy` true on essentially every `synchronize`. No loop risk (trigger is `pull_request` only; a Vercel API redeploy emits no `pull_request`), but **every push to an open PR triggers a full preview redeploy** — conscious acceptance per plan.

## Passed checklist

- Tests 70/70 · typecheck clean · lint clean
- Secret safety closed (4 guards) · scope safety closed (structural guard + tests) · zero new deps
- No script injection (no `${{ github.* }}` in any `run:`; untrusted input via `env:` only)
- Least-privilege `permissions: contents: read` · per-PR concurrency guard present

## Loop-back

FIX-THEN-SHIP → **Render**. Fix `repoId` (warning 1) before the live Gate-4 acceptance; fold in `EVENT_ACTION` cleanup (2) + the misleading test name. Cleanup-concurrency (3) and SHA-pinning (4) optional hardening. The `getProjectUrl` dead code (🔵) is tidy-up.

## Re-review (delta `7cebdf9..cccf8a2`) — VERDICT: SHIP

Fix commit **cccf8a2** "fix(ci): wire repoId + cleanup hardening". Focused delta re-review by code-critic:

- **Fix 1 (repoId) — CORRECT.** `CONFIG.githubRepoId: 1182877359` pinned as a number; `readEnv` uses env `VERCEL_GIT_REPO_ID` override (coerced, `Number.isInteger` fail-closed) else the constant; `createDeployment` body now always carries `repoId` as a number (`vercel-env-client.mjs` spread on `repoId !== undefined`). Asserted by `clients.test.ts:208-212`.
- **Fix 2 (EVENT_ACTION) — CORRECT.** Removed from both env blocks; job-level `if:` routing (sync `!= 'closed'` / cleanup `== 'closed'`) unchanged.
- **Fix 3 (misleading test) — CORRECT.** Renamed + honest comment; now asserts `created+updated>0` ∧ redeployed ∧ one createDeployment call.
- **Fix 4 (cleanup concurrency) — CORRECT.** Separate groups: sync `cancel-in-progress:true`, cleanup `cancel-in-progress:false`.
- **Fix 5 (dead getProjectUrl) — CORRECT.** Deleted + fake removed; zero remaining refs.
- **Regression scan:** no new secret-log path, scope hardcoding untouched, zero new deps, idempotency unchanged, no new script-injection surface. The only new interpolation is `${{ github.event.pull_request.number }}` in `concurrency.group` (integer, non-shell, not injectable).
- **Suites (re-run):** tsc 0 · lint 0 · `tests/unit/scripts/` 74/74 · full unit 1654/1654.

Carried 🔵 (optional, not raised against the fix): actions pinned to `@v4` tags not SHAs (plan §11 allowance).

**Cleared to ANVIL.**

## ANVIL live run #1 (PR #39, workflow 27540845218) — FAIL at redeploy only

Most of the pipeline proved out live:
- **Branch-health polling works** — waited ~3.5 min, found branch healthy (`branchRef htinhqorvyhajcsvnqgz`).
- **Secret redaction works** — values logged as `<redacted:N chars>`, tokens as `***`.
- **3 core creds written** (URL/anon/service-role) to Vercel Preview, branch-scoped, via idempotent update path.
- **JWT unknown RESOLVED:** Supabase Management API does **NOT** return `SUPABASE_JWT_SECRET` for a branch (asymmetric-key migration) → script warned-and-continued as designed. *(Finding for F-RLS-04a: it needs the JWT secret on preview and must source it another way — see roadmap/BACKLOG.)*
- **FAIL:** final redeploy `POST /v13/deployments` → HTTP 400. Root cause: body omitted required top-level `name` (project name) and set `name` to the prj_ id. Client also threw a bare "HTTP 400" with no detail (diagnostic defect).

→ ANVIL ejected to Render.

## Render fix (b72b37a) + delta re-review — VERDICT: SHIP

**FIX A (the bug):** redeploy body now `{ name: "mfs-operations", gitSource: { type:"github", ref:<branch>, repoId:1182877359 } }` (+ `?forceNew=1`). `name` = project NAME not prj_ id (asserted both ways); redundant `target` removed (gitSource feature-branch deploy infers Preview; no production-deploy path exists).
**FIX B (diagnostics, secret-safe):** new `redact.describeErrorBody(res)` surfaces only vendor `error.code`/`error.message` (or ≤200-char text), never the request. Gated behind `request(..., {safeBody:true})` — opted in ONLY for non-secret calls (listBranchEnv, deleteEnv, createDeployment). The two secret-bearing writes (createEnv/updateEnv) stay status-only; Supabase getApiKeys reveal-body never read on error. Adversarial test plants a fake secret in the vendor error message and asserts absence.

Delta re-review (`cccf8a2..b72b37a`): secret-safety PASS on all 4 sub-questions; FIX-A correct (no prod-deploy path); no regressions (zero deps, scope/idempotency/injection unchanged); fixtures are obvious fakes, rename didn't weaken assertions. Suites: tsc 0 · lint 0 · scripts 77 · full unit 1657.

🔵 residual (non-blocking): preview-vs-prod now relies on Vercel branch-inference rather than an explicit `target` — fine for a feature-branch-only tool; confirm the live deploy registers as Preview.

→ Cleared to re-run live ANVIL.

## ANVIL live run #3 (PR #41, `7f4ddec`, workflow 27555331185) — GREEN (acceptance)

Resumed 2026-06-15 PM after F-TD-15 shipped (`9abdbe7`) unblocked the migration-filename resync. Branch `feat/f-infra-05-preview-cred-sync` rebased onto current `main` (`b72b37a`→`7f4ddec`, 8 commits, clean — BACKLOG auto-merged, scripts/workflow byte-identical; rehearsed on a throwaway branch + `push --dry-run` before the real lease-protected force-push). PR #39 was closed to deprovision its stale pre-rename preview branch; GitHub then refused to reopen #39 (force-push orphaned its recorded head), so **PR #41** was opened from the same branch — its `opened` event first-created a clean 14-digit preview branch (`imrobmcrjicmrgxawlza`), no resync divergence.

Live result (log of job 81452655468):
- Branch healthy after ~3 min poll (no outage this run).
- All cred values + tokens logged `<redacted:N chars>` / `***`.
- 3 Preview-scoped, branch-scoped creds synced (URL/anon/service-role).
- `SUPABASE_JWT_SECRET` absent → warn-and-continue (F-RLS-04a follow-up).
- **Redeploy fired** — `preview redeploy triggered`; `sync done {created:0, updated:3, redeployed:true}`. The `7f4ddec` redeploy fix (project `name` + `repoId` + `gitSource`/`forceNew`) worked — no HTTP 400.
- Vercel `dpl_G1g6G2RKYpjFwcq41K1hTsN8XGtk` (sha `7f4ddec`) `state:READY`, `target:null` = **Preview, not production** → resolves the residual 🔵 above.

🔵 new (non-blocking): `created:0, updated:3` → the #39-close cleanup left branch-name-scoped Preview vars that this run overwrote (latest-creds-win; end state correct). Confirm `closed`-event cleanup fully deletes them.

→ **Cert issued:** `docs/anvil/2026-06-15-f-infra-05-preview-cred-sync-cert.md` (CLEARED FOR PRODUCTION). Awaiting Gate 4 ship.
