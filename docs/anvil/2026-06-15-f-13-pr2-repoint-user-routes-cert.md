# ANVIL Clearance Certificate

Date: 2026-06-15
App: MFS-Operations
Branch: feat/f-13-pr2-repoint-user-routes
PR: #44 — F-13 PR2: re-point the 6 non-login user routes through `usersService` (pure re-pointing, zero behaviour change)

## Scope — what this certificate actually covers

| Change / path                                         | Risk tier | Layers required                | Layers run                          |
| ----------------------------------------------------- | --------- | ------------------------------ | ----------------------------------- |
| `app/api/auth/type/route.ts` (POST)                   | Medium    | Unit + Integration             | Unit ✓ · Integration ✓              |
| `app/api/auth/team/route.ts` (GET)                    | Medium    | Unit + Integration + E2E smoke | Unit ✓ · Integration ✓ · E2E ✓      |
| `app/api/auth/kds-pin/route.ts` (POST, auth-critical) | High      | Unit + Integration             | Unit ✓ · Integration ✓ (R-MF-3 net) |
| `app/api/auth/haccp-team/route.ts` (GET)              | Medium    | Unit + Integration             | Unit ✓ · Integration ✓ (R-MF-2 pin) |
| `app/api/admin/users/route.ts` (GET + POST)           | High      | Unit + Integration             | Unit ✓ · Integration ✓ (R-MF-2 pin) |
| `app/api/admin/users/[id]/route.ts` (PATCH + DELETE)  | High      | Unit + Integration             | Unit ✓ · Integration ✓ (R-MF-1 pin) |
| Regression surface: routes/screens PR2 did NOT touch  | Critical  | E2E @critical smoke            | E2E ✓ (api 3/3 + ui 1/1)            |

**Not run under the efficiency dial:**
- **Docker dev-machine rung** — n/a: no `docker-compose.yml` / `compose.yaml` / `Dockerfile` present. Integration ran against the LOCAL Supabase stack directly (already up), which is the cheapest isolated runtime here.
  🗣 In plain English: there's no Docker container setup in this repo, so the cheapest isolated runtime IS the local Supabase that was already running — that's what every data test ran against.
- **Vercel preview + Supabase preview branch + full 8-path E2E** — NOT run by the runner. The remote preview smoke (Gate 4) and the full deployed-target E2E suite are the conductor's step at the Lock gate. PR2 is the FIRST real route re-point, so the conductor's preview smoke on this PR is meaningful (per PR1's ship record it was deferred from PR1 to here). The runner ran the local @critical smoke (api + ui) green; the cloud-target run is the conductor's call.
  🗣 In plain English: I proved correctness locally against a real database. Proving it survives the real Vercel + cloud-Supabase environment is the conductor's job at ship time — and for this PR it matters, because this is the first PR where live routes actually call the new front desk.

**Baseline characterisation pass?** No — this is a diff-driven pass against the approved F-13 PR2 matrix.

🗣 In plain English: this certificate covers the 6 re-pointed endpoints (each now phoning the shared `usersService` front desk instead of the database directly), plus a re-run of the smoke tests for journeys PR2 didn't touch. The three highest-risk behaviour-drift traps were each pinned with a real test.

## Test Results

| Layer                 | Status                        | Notes                                                                                                                                                                                |
| --------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit (Vitest)         | ✅ 1712/1712 (90 files)       | Exactly on baseline (1712/1712). No new unit tests expected (pure re-pointing). Guard already ran `tsc --noEmit` 0 errors + `lint` 0 warnings on this diff.                          |
| Integration (Vitest)  | ✅ 163/163 (16 files)         | Real local Postgres. Baseline 160 + 3 new PR2 pins in `admin-users.test.ts`. The 6 re-pointed routes vs a REAL Supabase — the load-bearing layer.                                   |
| Database (pgTAP)      | ✅ 66/66 (6 test files)       | Regression-only — PR2 adds NO schema/policy/migration, so NO new RLS tests authored. All 6 `.test.sql` files report `ok`. (See note below on the harness exit code.)                |
| Edge Functions (Deno) | n/a — not required            | No `supabase/functions/` change in diff.                                                                                                                                            |
| E2E (Playwright)      | ✅ api 3/3 + ui 1/1 (local)   | `@critical` smoke against a real booted dev server wired to local Supabase. Includes `GET /api/auth/team → 200 + JSON array` (a re-pointed route, array shape survives).            |
| Architecture rung     | ✅ seam holds — improved      | PR2 crosses no seam (no port/adapter/domain edit); it REMOVES the app→adapter breaches. All 6 routes dropped `@supabase/*` / `@/lib/adapters/**`; rip-out cost strictly improved.    |

### pgTAP harness note (not a failure)
`supabase test db` reports `Result: FAIL` with exit 1, but every one of the 6 real `*.test.sql`
files reports `ok` (66 tests). The sole cause is `supabase/tests/_helpers.sql` — a shared
SQL include (sourced at the top of each test file), NOT a test — being globbed by the runner;
it has no TAP plan by design, producing "No plan found in TAP output". This is a pre-existing
harness quirk on `main`, unrelated to PR2 (which touches zero SQL). All real DB tests pass.
🗣 In plain English: the database-rules runner counts a shared helper file as if it were a test
and complains it has no checklist. It isn't a test — every actual test passed. This quirk exists
on `main` already and has nothing to do with this PR.

### Must-fix risk confirmations (from the Guard review — all SATISFIED and re-proven this run)

- **R-MF-1 — PATCH non-existent id must stay 500 (not 404, not 200).** ✓ Integration test
  `PATCH /api/admin/users/<missing-id> returns 500` PASSED. The route maps the service's
  `null`-on-missing to `500 { error: 'User not found' }`, preserving today's `.single()`-on-
  zero-rows status. Latent-bug follow-up (fix to 404 in a dedicated unit) logged as F-TD-20 in
  `docs/plans/BACKLOG.md`.
  🗣 In plain English: editing a user that doesn't exist still returns the same server-error it
  always did — proven by a test that fails loudly if it ever becomes a 404 or a silent success.
- **R-MF-2 — no camelCase leak on read routes.** ✓ Integration tests
  `GET /api/admin/users returns snake_case keys, no camelCase leak` (asserts `secondary_roles`/
  `last_login_at`/`created_at` present AND `secondaryRoles`/`lastLoginAt`/`createdAt` absent,
  against a non-empty result set) and `GET /api/auth/haccp-team rows carry secondary_roles,
  grouped contiguously by role` both PASSED.
  🗣 In plain English: the front desk speaks tidy English, the screens expect database-ese — the
  tests prove every read endpoint translates back correctly, with no tidy-English field sneaking
  through to blank out a screen.
- **R-MF-3 — kds-pin hash-compare path unchanged (auth-critical).** ✓ Existing regression net
  `tests/integration/kds.test.ts` PASSED UNCHANGED: valid PIN→200 (correct id/role), invalid→401,
  malformed→400. Route reads `pinHash`, keeps `if (!pinHash) continue`, `activeOnly: true`, roles
  `['butcher','warehouse']`.
  🗣 In plain English: the KDS PIN door behaves identically — the same tests that guarded it before
  the re-point still pass, proving the security-sensitive PIN check wasn't disturbed.

## Warnings (non-blocking)

- 🟢 Error-path 500-body text drift (PostgREST raw message → `ServiceError` string / `String(err)`)
  on the failure path of several routes. Accepted/documented in the plan (R-M-1) and Guard review:
  error-path only (never on the happy path), no consumer contract depends on the 500 body string
  (UIs show generic toasts), and all **status codes** are preserved.
- 🔵 Pre-existing, out of scope: `GET /api/admin/users` has no admin-role guard — unchanged from
  `main`. Noted by Guard as a future ticket, not PR2's remit.

## Migration

**None.** PR2 introduces no migration and no schema change (`git diff main...HEAD` shows no `*.sql`
or `supabase/migrations/**` files). It reads/writes the same `users` columns through the same
service-role client — only the call path changes (route → service → port → adapter, instead of
route → adapter).

Rollback: PR2 rollback = **revert the PR**. No migration to undo, no RLS policy to drop, no
production data touched — reverting the merge commit fully restores the prior state. No separate
rollback `.sql` script required (none would have anything to reverse).

PITR confirmed: **N/A** — no destructive migration (no `DROP` / `TRUNCATE` / `ALTER … TYPE` /
`DROP NOT NULL`). PITR confirmation not required.

## Merge Sequence

No migration, so the migrations-first step is a no-op:

1. (no `supabase db push` — no migration in this PR)
2. Merge PR #44 → Vercel auto-deploys the code
3. Smoke test: the conductor's Gate-4 preview smoke + post-deploy prod @critical smoke. **For this
   PR the preview smoke is meaningful** — PR2 is the first PR where live routes call the new Users
   engine. Recommended preview asserts (from plan §9): `GET /api/auth/team` + `GET /api/auth/haccp-team`
   → 200 + arrays carrying `secondary_roles`; `POST /api/auth/type` → `{ authType }`. Do NOT smoke
   admin POST/PATCH/DELETE against prod (writes); kds-pin needs a known PIN — keep it in integration.

## Verdict

✅ CLEARED FOR PRODUCTION

Every required layer for the approved F-13 PR2 matrix ran and passed; no required layer produced
`0/0`. **Zero iteration loops** — all layers green on the first run. No real-code bugs found; no
FORGE eject required. All three Guard must-fix risks (R-MF-1/2/3) independently re-proven green by
the runner's integration layer. Hexagonal compliance is a strict improvement: the 6 routes no longer
import the Supabase adapter, dropping the Users rip-out cost from "6 routes + adapter + wiring" to
"adapter + wiring".

— Draft certificate produced by the ANVIL runner. The conductor owns the Lock gate, the (trivially
satisfied) no-PITR confirmation, the Gate-4 preview smoke (first real route re-point — worth running),
and the ship decision with Hakan.

---

## SHIP RECORD (conductor — 2026-06-15)

**SHIPPED.** PR #44 squash-merged to `main` as `96c8a33`. No migration (code-only). Branch deleted (local + remote).

### Gate-4 preview smoke — PASS (8/8)
Ran `npm run test:e2e:preview -- <PR#44 preview> --unprotected` (Deployment Protection OFF, BACKLOG F-INFRA-04). DB identity probe confirmed a seed-born preview database (4/4 checks). All 8 `@critical` specs green in 51.3s — including the KDS butcher PIN flow (exercises the re-pointed `auth/kds-pin`) and the login → order-place → picking-list-print journeys.

### Post-deploy production smoke — PASS (6/6 non-500)
Production deploy `dpl_EQtg4sVzdEi5otArHbrAGKbka8JE` (commit `96c8a33`) READY on www.mfsops.com. Non-destructive read-only health check (no writes against prod):

| Route | Status | Verdict |
| --- | --- | --- |
| `GET /` | 307 | redirect to login (unauthenticated root) — non-500 ✓ |
| `POST /api/auth/type` (unknown name) | 200 | re-pointed `authTypeForName` reads real prod DB ✓ |
| `GET /api/auth/team` | 200 | re-pointed `listTeam` ✓ |
| `GET /api/auth/haccp-team` | 200 | re-pointed `listTeam` ✓ |
| `POST /api/auth/kds-pin` (wrong PIN) | 401 | re-pointed credential read correctly rejects ✓ |
| `GET /api/admin/users` | 307 | middleware fail-closed without a session — non-500 ✓ |

The three sessionless reads returning 200 prove the re-pointing works live against the production database; admin routes stay gated behind login (the `307` is the sign-in redirect, not an error). Admin write paths (POST/PATCH/DELETE) were deliberately NOT smoked against prod — proven by the 163 integration tests + 8/8 preview smoke instead. No rollback required.

**Final verdict: ✅ CLEARED & SHIPPED — production healthy.**
