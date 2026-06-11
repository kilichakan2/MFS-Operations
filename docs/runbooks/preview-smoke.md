# Runbook — Per-PR preview smoke (FORGE Gate 4)

F-INFRA-02. The pre-ship rehearsal: the three `@critical` order-pipeline
robot tests (01-order-place, 02-picking-list-print, 03-kds-butcher-flow)
run against the PR's deployed Vercel preview build, wired to that PR's
disposable Supabase preview branch. Fail-closed: if the environment is
not provably a seed-born preview database, nothing runs.

**In plain English:** before a change merges, a robot clicks through the
three most important business flows on a real deployed copy of the app
that talks to a throwaway copy of the database. If that throwaway copy
isn't there — or anything smells like production — the check refuses to
run and the change does not ship.

Run from the conductor's machine. One smoke at a time per PR (the three
specs are a relay — 01 creates the order 02 prints and 03 works).

## 1. Preconditions

- The PR is open and its Vercel preview deployment is green.
- The Supabase preview branch for the PR exists and is healthy:

  ```
  npm run db:branches
  ```

  Expect the PR's branch listed with a healthy/ready status (e.g.
  `FUNCTIONS_DEPLOYED`). If the branch is **missing or errored: fail
  closed** — do not proceed; investigate the Supabase GitHub-integration
  / branching wiring (dashboard → Integrations) before trying again.

- `.env.e2e.local` (gitignored) holds the `E2E_PIN_*` test PINs whose
  bcrypt hashes live in `supabase/seed.sql` — plus, in **protected mode
  only**, `VERCEL_AUTOMATION_BYPASS_SECRET` (see "Two modes" below).

## 1a. Two modes: protected (default) vs `--unprotected`

| Mode                                | When                                                                                                                | Secret                                                                       | Headers                                            |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------- |
| **Protected** (default)             | Vercel Deployment Protection is ON and a Protection Bypass for Automation secret exists                             | `VERCEL_AUTOMATION_BYPASS_SECRET` required in `.env.e2e.local` (fail closed) | `x-vercel-protection-bypass` sent on every request |
| **`--unprotected`** (current state) | Deployment Protection is **disabled entirely** on the Vercel project (the plan exposes no usable automation bypass) | No secret required                                                           | No bypass headers sent                             |

```
npm run test:e2e:preview -- https://<preview-url> --unprotected
```

`--unprotected` is temporary and tracked as **BACKLOG F-INFRA-04** —
re-enable protection + the bypass secret after the re-architecture and
drop the flag from this invocation. **Warning:** while protection is
off, preview deployments are publicly reachable by anyone with the URL
(low risk today: previews hold only ANVIL-TEST dummy data from
`supabase/seed.sql`, never production data). The flag changes ONLY the
secret/header logic — every hostname/https/prod-ref guard and all four
DB identity probe checks apply identically in both modes (probe check 1
asserts the deployment is alive without bypass headers; a 401 there
means protection is actually ON and the flag is wrong).

## 2. Find the preview URL

From the PR's Vercel bot comment, or `npx vercel ls`. It must be the
`…-git-<branch>-<scope>.vercel.app` URL. Anything else (production
domain, typo'd host, plain http) is refused automatically.

## 3. Run

Protected mode (default — once Deployment Protection is back on, see
F-INFRA-04):

```
npm run test:e2e:preview -- https://<preview-url>
```

Current state (Deployment Protection OFF):

```
npm run test:e2e:preview -- https://<preview-url> --unprotected
```

Expected: a one-line `--unprotected` warning (current state only), then
the DB identity probe passes (4 checks: gate, seeded users, hash
identity, seed sentinel), then the three `@critical` specs run
(8 tests) and pass.

## 4. Interpret the result

| Outcome       | Meaning                                                                                                                                                                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Probe failure | The **environment** is unsafe or mis-wired — NOT a code failure. Fix the platform wiring (branch missing, integration not synced, stale Preview-scope env vars, PIN-hash drift, bypass secret wrong). **Never bypass or weaken the probe.** |
| Spec failure  | A real regression on a deployed build — back to the implementer. If it passes locally but fails on preview, STOP and report (possible environment-sensitivity bug, e.g. timezone — that is a finding, not a test to fudge).                 |
| All green     | Gate-4 smoke evidence — paste the run output into the ANVIL cert / PR.                                                                                                                                                                      |

## 5. Post-close cleanup verification (ship checklist — mandatory)

After the PR merges or closes:

```
npm run db:branches
```

The PR's branch must be **GONE**. If it lingers (it bills per hour):
delete it via the Supabase dashboard (Branches → delete) or
`supabase branches delete <branch-id>`, then re-list to confirm.
Record "no orphaned branches" in the ship checklist.

## 6. Secret rotation

If the bypass secret is ever exposed (pasted in a log, committed,
screenshared): regenerate it in Vercel → Project → Settings →
Deployment Protection → Protection Bypass for Automation, then update
`VERCEL_AUTOMATION_BYPASS_SECRET` in `.env.e2e.local`. The old secret
dies instantly. The secret only opens the preview gate — it is not a
database credential.

## Troubleshooting

| Symptom                                 | Likely cause + fix                                                                                                                           |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Probe check 1: 401 at /login            | Bypass secret wrong/rotated — update `.env.e2e.local`.                                                                                       |
| Probe check 2: ANVIL-TEST-sales missing | Branch wasn't seeded (seed.sql failed on branch creation) or deployment points at the wrong database.                                        |
| Probe check 3/4: PIN-hash drift         | An `E2E_PIN_*` value in `.env.e2e.local` was rotated without regenerating the matching hash in `supabase/seed.sql` — fix both in one change. |
| Probe check 4: sentinel missing         | The deployment may be reading PRODUCTION or an unseeded database — stop, audit Vercel Preview-scope env vars before anything else.           |
| Guard refusal before any test           | Working as designed — re-read the error; the target URL or secret is unsafe.                                                                 |
