# ANVIL Clearance Certificate

Date: 2026-06-15
App: MFS-Operations
Branch: f-13-pr1-users-domain-foundation
PR: #43 — F-13 PR1 Users-domain foundation (hexagonal extraction, zero behaviour change)

## Scope — what this certificate actually covers

| Change / path                                                                 | Risk tier | Layers required                              | Layers run                              |
| ----------------------------------------------------------------------------- | --------- | -------------------------------------------- | --------------------------------------- |
| `lib/adapters/supabase/UsersRepository.ts` (new real adapter)                 | High      | Unit + Integration (real Postgres) + Arch    | Unit ✓ · Integration ✓ · Arch ✓         |
| `lib/adapters/fake/UsersRepository.ts` (new fake adapter)                      | Med       | Unit (shared contract, in-memory)            | Unit ✓                                  |
| `lib/ports/UsersRepository.ts` + `__contracts__/UsersRepository.contract.ts`  | High      | Unit + Integration (both adapters, 1 exam)   | Unit ✓ · Integration ✓                  |
| `lib/services/UsersService.ts` · `lib/wiring/users.ts` · `lib/services/index` | Med       | Unit                                         | Unit ✓                                  |
| `lib/domain/Role.ts` (moved from observability) · `User.ts` · `domain/index`  | Low–Med   | Unit                                         | Unit ✓                                  |
| Absorbed debt: ARCH-FU-03 dead-param · ARCH-FU-04 round-trip · F-TD-05 lint   | Low       | Unit (lint pin + service tests)              | Unit ✓                                  |
| Regression surface: routes/screens PR1 did NOT touch (login, KDS, orders)     | Critical  | E2E @critical (regression-only)              | E2E ✓ 8/8                               |

**Not run under the efficiency dial:**
- **Docker dev-machine rung** — n/a: no `docker-compose.yml` / `compose.yaml` / `Dockerfile` present in the repo. Integration ran against the LOCAL Supabase stack directly (`npm run db:up` + `db:reset`), which is the cheapest isolated runtime here.
- **Vercel preview + Supabase preview branch** — not run by the runner. PR1 is a behaviour-neutral, no-migration, no-route, no-RLS refactor; no new code path is reachable from a production route until PR2/PR3 wire it. The conductor owns any preview smoke / ship steps at the Lock gate.
- **pgTAP / RLS** — n/a: PR1 adds no policy and no migration (see Migration section).

**Baseline characterisation pass?** No — this is a diff-driven pass against the approved F-13 PR1 matrix.

🗣 In plain English: this certificate covers the new Users data-access code, its in-memory twin, and the service/wiring that compose them — plus a re-run of the most important user journeys to prove nothing on screen broke. It deliberately did NOT spin up a cloud preview, because PR1 changes no behaviour and no route calls the new code yet; that is the conductor's call at ship time, not the runner's.

## Test Results

| Layer                 | Status          | Notes                                                                                                  |
| --------------------- | --------------- | ------------------------------------------------------------------------------------------------------ |
| Unit (Vitest)         | ✅ 1712/1712 (90 files) | Exactly on baseline (1712/1712). `tsc --noEmit` 0 errors · `next lint` 0 warnings.              |
| Integration (Vitest)  | ✅ 160/160 (15 files)    | Real local Postgres. UsersRepository contract 22/22 + new `users_auth_check` constraint test 3/3. |
| Database (pgTAP)      | n/a — not required | PR1 adds no RLS policy and no migration.                                                             |
| Edge Functions (Deno) | n/a — not required | No `supabase/functions/` change in diff.                                                             |
| E2E (Playwright)      | ✅ 8/8 @critical + 3 api smoke + 1 ui smoke | Login/PIN + order placement + picking-list print + KDS butcher flow — all routes PR1 did NOT touch. |
| Architecture rung     | ✅ seam holds   | No vendor SDK under `lib/domain/**` or `lib/ports/**`; fake adapter passes the same contract as the real one (Users port is swappable on an in-memory stand-in). |

### Integration proof points (the real new work — what Guard could not run without Docker)

Proven against REAL local Postgres, not a mock:
- **Hash-free reads return no hash:** `findUserById` / `findUserByName` / `listUsersByRoles` / `listAllUsers` return `UserSummary` objects with NO `passwordHash` / `pinHash` key (runtime-asserted on every row). ✓
- **Credential reads DO return hashes:** `findCredentialByName` / `listCredentialsByRoles` are the only two methods that surface a hash. ✓
- **Round-trips:** `createUser` → read-back, `updateUser` partial patch → read-back, `deleteUser` → re-read null, `recordLogin` → timestamp readable. ✓
- **Column quarantine (R5):** a valid re-hash sets the role's column and CLEARS the other (pin↔password), no stale credential left behind. ✓
- **`users_auth_check` DB constraint actually FIRES (new test this run):** an admin row with `password_hash NULL` and a non-admin row with `pin_hash NULL` are both rejected by Postgres with code `23514` naming `users_auth_check` — rejected by the DATABASE, not just app code. A correctly-credentialed control row is accepted, isolating the rejection to the credential rule. ✓
- **Fixture hygiene:** all fabricated rows use the `ANVIL-TEST-` prefix and are deleted in cleanup; post-run residue query returned 0 `ANVIL-TEST-authchk%` rows. No leftover fixtures. (LOCAL Supabase only — never prod.) ✓

## Warnings (non-blocking)

- One `[WebServer] [Error: aborted]` line during the KDS @critical run — a dev-server connection teardown artifact. Every spec reported ✓ and the suite ended `8 passed`. Not a test failure; noted for completeness.

## Migration

None. PR1 introduces no migration and no schema change. (`git diff origin/main...HEAD` shows no `*.sql` / migration files.)

Rollback note: PR1 rollback = **revert the PR**. There is no migration to undo, no RLS policy to drop, and no production data touched — reverting the merge commit fully restores the prior state.

PITR confirmed: **N/A** — no destructive migration (no `DROP` / `TRUNCATE` / `ALTER … TYPE` / `DROP NOT NULL`). PITR confirmation not required.

## Merge Sequence

No migration, so the migrations-first step is a no-op:

1. (no `supabase db push` — no migration in this PR)
2. Merge PR #43 → Vercel auto-deploys the code
3. Smoke test: the conductor's @critical preview/prod smoke at the Lock gate (runner ran @critical green locally; no new production route exercises the new code yet)

## Verdict

✅ CLEARED FOR PRODUCTION

Every required layer for the approved F-13 PR1 matrix ran and passed; no required layer produced `0/0`. Zero iteration loops on code (one missing matrix item — the `users_auth_check`-fires negative test — was a coverage gap the runner filled in Nail, not a code bug). No real-code bugs found; no FORGE eject required.

— Draft certificate produced by the ANVIL runner. The conductor owns the Lock gate, the no-PITR confirmation (trivially satisfied here), and the ship decision with Hakan. Do not merge on the basis of this draft alone.

---

## SHIP RECORD (conductor, 2026-06-15)

- **Shipped:** PR #43 squashed to main as **7d482c6**.
- **No migration** → no prod DB push, no PITR.
- **Prod deploy:** `dpl_8E8RXbxMmcY38yHcbTZcyxSWaBNv` (target production, commit 7d482c6) state READY.
- **Production post-deploy @critical smoke: 6/6 expected-status, zero 5xx** —
  `GET /` 307 · `GET /api/auth/team` **200** (users table reads through the new build) ·
  `POST /api/auth/type` 200 · `POST /api/auth/login` (bogus) **401** (PasswordHasher path healthy) ·
  `GET /api/kds/orders` 200 · `GET /api/orders` 307 (fail-closed).
- **Behaviour-change risk:** none realised — PR1 is introduce-only; no production route calls the new
  Users engine yet (PR2/PR3 wire them). Pre-ship preview smoke deliberately skipped (no route/prod-path
  change); deferred to PR2 (first real route re-point) and PR3 (login — the decisive one).
- **Rollback (unused):** revert PR #43; no migration to undo, no prod data touched.
