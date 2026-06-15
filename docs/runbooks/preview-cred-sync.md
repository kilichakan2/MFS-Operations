# Runbook — Preview credential sync (Supabase → Vercel)

F-INFRA-05. The robot that, on every pull-request event, copies the PR's
Supabase **preview branch** credentials into Vercel **Preview** scope (scoped
to the git branch) and redeploys the preview so it comes up with a live DB —
then deletes those vars when the PR closes.

**In plain English:** before this, every preview deploy was dead on arrival —
no database password, so the first page load 500'd and the Gate-4 robot test
refused to run. A human had to paste the password in by hand per PR. This
action does that paste automatically and tidies up on PR close. After it,
"open a PR → preview just works", zero manual steps.

This replaces the **manual per-PR env bridge** described in BACKLOG F-INFRA-05.

---

## What it does

| PR event                            | Job       | Action |
| ----------------------------------- | --------- | ------ |
| `opened` / `synchronize` / `reopened` | `sync`    | Wait for the branch to be healthy, read its 4 creds, write them to Vercel Preview scope (branch-scoped, idempotent), then conditionally redeploy. |
| `closed`                            | `cleanup` | Delete the 4 branch-scoped Preview vars. |

The four keys written (all `type: encrypted`, `target: ["preview"]`,
`gitBranch: <PR head ref>`):

- `NEXT_PUBLIC_SUPABASE_URL` — derived `https://{branch_ref}.supabase.co`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_JWT_SECRET` — **may be absent** (see "JWT secret" below)

**Boundary (ADR-0006 / ADR-0008):** the native Supabase↔Vercel integration
still owns the 9 **Production**-scoped vars. This action owns **Preview scope
only** and only ever copies the *branch's own* creds — never production creds
onto a preview. That invariant is enforced structurally: every write is
hardcoded `target: ["preview"]` with a non-empty `gitBranch`, and a unit test
blocks any code path that could write a project-wide var.

## Files

| Path | Role |
| ---- | ---- |
| `.github/workflows/preview-cred-sync.yml` | The trigger (PR events, concurrency, secrets). |
| `scripts/preview-cred-sync.mjs` | Orchestrator entrypoint (`node … sync` / `cleanup`). |
| `scripts/preview-cred-sync/core.mjs` | Pure decisions — no network, no `process`. |
| `scripts/preview-cred-sync/supabase-management-client.mjs` | Supabase Management API I/O. |
| `scripts/preview-cred-sync/vercel-env-client.mjs` | Vercel REST API I/O. |
| `scripts/preview-cred-sync/redact.mjs` | Secret-safe logging. |

## Secrets it needs (GitHub Actions repo secrets — already provisioned)

- `SUPABASE_ACCESS_TOKEN` — a Supabase Personal Access Token for the Management
  API. **Sync job only.**
- `VERCEL_API_TOKEN` — a Vercel REST API token with env-write scope. **Both
  jobs.**

Non-secret IDs are hardcoded in `scripts/preview-cred-sync.mjs` (`CONFIG`):
Vercel `projectId` / `teamId`, Supabase parent ref. These are public
identifiers, not passwords.

The branch name comes from `github.event.pull_request.head.ref` — the same git
ref used to match the Supabase branch and to scope the Vercel vars.

## Secret safety

No credential or token value is ever logged. All logging goes through
`redact.mjs` (`<redacted:NN chars>` for any value that must appear in a line).
GitHub Actions also masks `secrets.*` automatically — belt **and** braces,
since the script can be run on a laptop where masking is absent. A unit test
asserts no token leaks into an error message; the repo's secret-scan pre-commit
hook guards the committed files.

---

## Run it manually (local debugging)

```
PR_GIT_BRANCH=<branch> \
VERCEL_API_TOKEN=<token> \
SUPABASE_ACCESS_TOKEN=<token> \
npm run preview:cred-sync -- sync
```

`-- cleanup` runs the delete path (Supabase token not required for cleanup).
Both fail closed with a clear message if a required env var is missing.

## Debugging a failed sync

| Symptom | Likely cause + fix |
| ------- | ------------------ |
| `Timed out … waiting for Supabase preview branch … to become healthy` | The Supabase branch never reached `ACTIVE_HEALTHY` + `FUNCTIONS_DEPLOYED` within 10 min. Check `npm run db:branches` and the Supabase dashboard → Branches. Fail-closed by design — a red CI check, not a silent broken preview. |
| `PR_GIT_BRANCH is required` / `VERCEL_API_TOKEN is required` | A repo secret is missing or the workflow env block was edited. |
| `Supabase Management API … failed: HTTP 401/403` | `SUPABASE_ACCESS_TOKEN` is wrong/expired or lacks scope. Rotate it in the Supabase dashboard and update the GitHub repo secret. |
| `Vercel API … failed: HTTP 401/403` | `VERCEL_API_TOKEN` is wrong/expired or lacks env-write scope. Rotate and update the repo secret. |
| Preview still 500s after the sync | Confirm the redeploy fired (look for "preview redeploy triggered" in the job log). If env vars were already correct (a no-op run) the redeploy is skipped on purpose (loop guard) — push again or redeploy from the Vercel dashboard. |
| Sync ran but no vars in Vercel | Check the job log for "env var created/updated" lines and the `gitBranch` value; confirm it matches the Vercel branch filter. |

## Manual re-run

Re-run the failed job from the GitHub Actions UI (the run is keyed per PR; a
re-run is safe — the sync is idempotent: it converges to exactly four vars, no
duplicates). Or push an empty change to the PR to re-fire `synchronize`.

## JWT secret (`SUPABASE_JWT_SECRET`) — may be absent

Supabase is migrating from a single symmetric `SUPABASE_JWT_SECRET` to
asymmetric signing keys, so the Management API **may not return** a symmetric
JWT secret for a branch. The sync handles this deterministically:

- **Present** → all four keys are written.
- **Absent** → the script logs a **loud warning** ("SUPABASE_JWT_SECRET not
  returned … see F-INFRA-05 §10") and **continues** — url/anon/service-role are
  still written, the job does **not** fail. The 3-key path is independently
  valuable.

> **Status (resolve at first live run / ANVIL Gate 4):** whether the secret is
> returned was not verifiable at build time (no open PR / live branch). Record
> the observed outcome here after the first throwaway-PR run:
>
> - [ ] Secret returned → 4-key path confirmed.
> - [ ] Secret absent but F-RLS-04a does not need it on preview → 3-key path +
>   warning is the steady state.
> - [ ] Secret absent AND F-RLS-04a needs it → escalate (BACKLOG follow-up);
>   does not block the url/anon/service-role sync.

## Rollback

This is **additive CI tooling with no production blast radius**. To roll back:
**delete `.github/workflows/preview-cred-sync.yml`** (optionally the scripts).
The app, database, production wiring, and the native Supabase↔Vercel
integration are all untouched — you simply revert to the manual per-PR env
bridge. No data, schema, or runtime code is affected.

## One-time setup note

Pushing a `.github/workflows/` file may require a token/permission with the
`workflow` scope. The conductor handles this at ship time (BACKLOG F-INFRA-05 /
plan §16 R12).
