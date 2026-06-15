# ANVIL Clearance Certificate

Date: 2026-06-15
App: MFS-Operations
Branch: feat/f-infra-05-preview-cred-sync
PR: #41 (supersedes #39 — see "PR renumber" below)

Status: ✅ CLEARED FOR PRODUCTION — build-pipeline / CI tooling only (owned GitHub
Action + Node `.mjs` orchestrator), zero app runtime code, zero new dependencies, zero
schema/migration change, no PITR gate. All local layers green (unit/scripts 77, full unit
1657, tsc 0, lint 0) AND the full cloud path proven live end-to-end on a fresh 14-digit
preview branch: branch-health poll → 3 Preview-scoped creds synced (redacted) → JWT
warn-and-continue → conditional redeploy fired and came up `READY` as a Preview deployment.

---

## Scope — what this certificate covers

F-INFRA-05 (**Path B — own the sync**) replaces the missing piece of the native
Supabase↔Vercel integration: that integration injects the 9 **Production-scoped** env vars
but does **not** inject per-PR **Preview-scoped** branch database credentials. This unit adds
an owned GitHub Action (`.github/workflows/preview-cred-sync.yml`) driving a pure-core +
injected-I/O Node orchestrator (`scripts/preview-cred-sync/`), which on each PR event:

- waits (fail-closed) for the PR's Supabase preview branch to become healthy,
- reads the branch's DB creds from the Supabase Management API,
- writes them **Preview-scoped, branch-scoped** to Vercel (`NEXT_PUBLIC_SUPABASE_URL`,
  the public anon key, and the server-only service-role key) idempotently,
- triggers a conditional Vercel preview redeploy so the new vars take effect,
- on PR close, deletes the branch-scoped vars (cleanup job).

The native integration keeps owning Production; this action owns Preview ONLY.

🗣 In plain English: when you open a PR, Vercel spins up a throwaway "preview" copy of the
app, and Supabase spins up a throwaway copy of the database — but nobody was telling the
preview app *where* its throwaway database lives. This is the missing wire: it copies the
three connection keys into the preview app's settings and pokes Vercel to rebuild so they
take. Production is untouched — a different system already wires that, and this tool is
fenced to "preview only" so it can never write a production key.

| Change / path | Risk tier | Layers required | Layers run |
| --- | --- | --- | --- |
| `.github/workflows/preview-cred-sync.yml` (owned Action, 2 jobs) | Med (CI holds 2 write-scoped tokens) | Unit + secret/scope audit + live cloud | ✅ all |
| `scripts/preview-cred-sync/` (pure core + 2 I/O clients + redact) | Med | Unit (black-box + unit) + live cloud | ✅ all |
| `scripts/preview-cred-sync.mjs` (entrypoint) | Med | Unit (spawned child) + live cloud | ✅ all |
| `package.json` `preview:cred-sync` script alias | Low | Build | ✅ (no new dep) |
| docs (runbook, plan, BACKLOG) | Low | — | ✅ |

**Not run (and why):** the app-level `@critical` Playwright preview smoke is **N/A** for this
unit — it changes **zero app runtime code** (the Next.js bundle is byte-identical to `main`),
so the app-behaviour suite would test the same thing already green on `main`. Per the F-TD-15
precedent (same "tooling-only, no runtime path" reasoning), the load-bearing preview proof
here is the live cred-sync run + the redeploy coming up `READY` as Preview (below), not the
app smoke.

---

## Test Results

| Layer | Status | Notes |
| --- | --- | --- |
| Unit — cred-sync (Vitest) | ✅ 77/77 | `tests/unit/scripts/` — pure core (backoff, idempotency, JWT-plan, scope guard), I/O client request-shapes, black-box entrypoint (real child process, fail-closed exit codes, no-secret-leak). |
| Unit — full suite | ✅ 1657/1657 | No regression across the tree. |
| Typecheck (`tsc --noEmit`) | ✅ 0 errors | `.mjs` not type-checked by tsc (JSDoc editor-only) — matches e2e-preview.mjs precedent. |
| Lint (`next lint`) | ✅ 0 warnings/errors | |
| Guard (code-critic) | ✅ SHIP | FIX-THEN-SHIP → fixed → SHIP across 3 deltas; secret-safety PASS (4 guards), scope-safety PASS (structural + tests), zero new deps. Review: `docs/reviews/2026-06-15-f-infra-05-preview-cred-sync-review.md`. |
| **Live cloud — cred sync (run #3)** | ✅ SUCCESS | Run `27555331185` (PR #41, sha `7f4ddec`), `sync` job green in 3m25s. Branch `imrobmcrjicmrgxawlza` healthy after ~3 min poll; all values logged `<redacted:N chars>`; `sync done {created:0, updated:3, redeployed:true}`. |
| **Live cloud — redeploy landed** | ✅ READY / Preview | Vercel `dpl_G1g6G2RKYpjFwcq41K1hTsN8XGtk` (sha `7f4ddec`, 15:02:35 UTC) `state:READY`, `target:null` (= **Preview**, NOT production). Resolves the review's residual 🔵 (confirm preview, not prod). |

🗣 Every rung is green, and the rung that had never worked in the cloud — telling Vercel to
rebuild the preview after writing the keys — finally fired and the rebuild came up live.

---

## Live proof — three runs to green

The redeploy step had never succeeded live before this cert. Its history:

1. **Run #1 (PR #39, `cccf8a2`)** — pipeline worked through cred-write; final redeploy
   `POST /v13/deployments` → **HTTP 400** (body omitted required top-level project `name`,
   sent the `prj_` id instead). → ejected to Render.
2. **Run #2 (PR #39, `b72b37a`)** — redeploy fix in place, but the run hit the **Supabase
   eu-west-2 provisioning outage (~12:00–14:00 UTC 15 Jun)**: the preview branch never became
   healthy, so the script **failed closed** after its 610 s poll budget (`Timed out … waiting
   for … branch … to become healthy`). The redeploy was never reached. Confirmed external (the
   error is a branch-health timeout, not a deploy error; timestamp inside the known outage
   window; the native "Supabase Preview" check went green on the post-outage branch).
3. **Run #3 (PR #41, `7f4ddec`)** — after rebasing onto `main` (`9abdbe7`, F-TD-15's 14-digit
   migrations) and fresh-provisioning the preview branch, the full path ran green: health poll
   → 3 creds synced → JWT warn-and-continue → **redeploy fired** → deployment `READY` as
   Preview. **This is the acceptance.**

### PR renumber (#39 → #41)

#39 was closed to deprovision its stale (pre-rename) preview branch, then the rebased branch
was force-pushed. GitHub then refused to **reopen** #39 because the force-push orphaned #39's
recorded head commit. A fresh PR (**#41**) was opened from the same branch at `7f4ddec` — its
`opened` event first-created a clean 14-digit preview branch (no resync divergence). #41 is the
live-equivalent of #39 with identical commits; #39 remains closed. `main` was untouched
throughout (frozen at `9abdbe7`).

🗣 In plain English: we had to throw away the old preview database (it remembered the old
filenames) and rebuild a clean one. The cleanest way left us unable to reopen the old PR, so we
opened a new one (#41) holding the exact same work. Nothing about the code changed — only the
ticket number.

---

## Migration / production impact

**No production migration. No schema change.** This unit ships only CI workflow + Node
scripts + a `package.json` script alias. Nothing is applied to prod (`uqgecljspgtevoylwkep`).

PITR confirmed: **N/A** — no destructive op, no DDL, nothing applied to prod.

**Secret/scope safety (the two highest risks for a credential-syncing job):**
- All logging routes through `redact.mjs`; every cred value and token appears only as
  `<redacted:N chars>` / `***`. Verified in the live log.
- Every env write is built in one place with `type:'encrypted'`, `target:['preview']`
  hardcoded, `gitBranch` required (throws on empty) — structurally cannot write an
  all-branches or Production var. No path writes `target:['production']`.
- Zero new dependencies (Node built-in `fetch` only).

**Rollback** = revert the merge (or close the PR, which fires the cleanup job that deletes the
4 branch-scoped Preview vars). No prod blast radius — the action only ever touches Preview
scope.

---

## Known follow-ups (non-blocking)

- 🟡 **`SUPABASE_JWT_SECRET` not injectable on preview** — the Supabase Management API does
  NOT return the JWT secret for a branch (asymmetric-key migration). The script warns and
  continues; url/anon/service-role are synced. **F-RLS-04a needs the JWT secret on preview and
  must source it another way** (mechanism undecided). Logged on the roadmap/BACKLOG.
- 🔵 **Cleanup-on-close completeness** — run #3 reported `created:0, updated:3`, i.e. the three
  Preview vars pre-existed (the #39-close cleanup left branch-name-scoped vars, which this run
  overwrote — latest-creds-win, end state correct). Confirm the `closed`-event cleanup fully
  deletes them. Benign (idempotent overwrite), but worth a follow-up check.
- 🔵 **Actions pinned to floating major tags** (`actions/checkout@v4`, `setup-node@v4`) rather
  than commit SHAs — within plan §11 allowance + first-party; SHA-pinning is optional hardening
  given the job holds two write-scoped tokens.

---

## Merge Sequence (Gate 4 — ship)

1. **No migration step** — nothing to apply to prod.
2. Squash-merge PR #41 → `main`. Vercel auto-deploys `main` (the workflow + scripts are inert
   on `main`'s runtime; the Next.js bundle is unchanged → behavioural no-op).
3. Post-merge: confirm the PR #41 preview branch (`imrobmcrjicmrgxawlza`) tears down with the PR
   (no orphaned branch — `npm run db:branches`), and that the workflow is present on `main` for
   future PRs.

---

## Verdict

✅ **CLEARED FOR PRODUCTION.** All required layers green — unit/scripts 77, full unit
1657/1657, tsc 0 / lint 0, code-critic SHIP — and the load-bearing proof for this unit, the
full Supabase→Vercel preview credential sync, verified live end-to-end on a fresh 14-digit
preview branch: branch-health poll → 3 Preview-scoped creds synced (redacted) → JWT
warn-and-continue → redeploy fired → deployment `READY` as Preview (never production).

CI tooling only: no app runtime code, no new deps, no schema/migration, no PITR gate. Ready for
the Gate 4 ship (squash-merge; no migration-first step). Two non-blocking follow-ups carried
(JWT-on-preview → F-RLS-04a; cleanup-on-close confirm).
