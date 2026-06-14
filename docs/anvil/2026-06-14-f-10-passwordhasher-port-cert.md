# ANVIL Clearance Certificate

Date: 2026-06-14
App: MFS-Operations
Branch: f-10-passwordhasher-port
PR: #36 — refactor(auth): PasswordHasher port + bcrypt adapter (F-10)

## Scope — what this certificate actually covers

| Change / path                                          | Risk tier | Layers required                  | Layers run                        |
| ------------------------------------------------------ | --------- | -------------------------------- | --------------------------------- |
| `lib/ports/PasswordHasher.ts` (new port)               | High      | Architecture rung + Unit         | Unit (adapter, 9 cases)           |
| `lib/adapters/bcrypt/PasswordHasher.ts` (sole bcrypt)  | High      | Unit (adapter) + Integration     | Unit + Integration                |
| `lib/wiring/password.ts` (singleton wiring)            | Medium    | Integration                      | Integration                       |
| `app/api/auth/login/route.ts`                          | Critical  | Integration + E2E                | Integration + E2E @critical       |
| `app/api/auth/kds-pin/route.ts`                        | Critical  | Integration + E2E                | Integration + E2E @critical       |
| `app/api/admin/users/route.ts` (create)                | High      | Integration                      | Integration                       |
| `app/api/admin/users/[id]/route.ts` (update)           | High      | Integration                      | Integration                       |
| `.eslintrc.json` + lint-mirror tests                   | Low       | Unit                             | Unit (7 lint-mirror cases)        |

**Not run under the efficiency dial:** pgTAP (DB/RLS) and Deno (Edge Functions) — n/a, not required: this PR has NO migration, NO schema change, NO RLS/policy change, and touches NO edge function. Full E2E preview double-run not yet executed (Docker/local + chromium @critical proved correctness; preview smoke is the conductor's pre-ship step).
**Baseline characterisation pass?** No — this is a diff-driven matrix on a behaviour-preserving refactor.

🗣 In plain English: this certificate covers the four sign-in/admin routes and the new hashing
"socket + plug", proven by unit + integration + the critical browser flows. The database-policy
and edge-function rungs were correctly skipped because nothing in those areas changed.

## Architecture rung (seam crossed: lib/ports + lib/adapters)

- `bcryptjs` is now imported in exactly ONE file (`lib/adapters/bcrypt/PasswordHasher.ts`); no
  stray vendor import anywhere else in `app/` or `lib/` (grep-confirmed).
- The four routes call the `passwordHasher` singleton from `lib/wiring/password.ts` — none import
  bcrypt directly.
- The adapter has a dedicated bench test (`tests/unit/adapters/bcrypt/PasswordHasher.test.ts`)
  running on the real bcrypt with NO DB and NO network — the vendor boundary is verified, not faked.
- Verdict: seam holds. Rip-out cost = one new adapter folder + one line in `lib/wiring/password.ts`.

🗣 In plain English: the hashing library is sealed inside one swappable plug. Swapping bcrypt for
argon2 later = write one new plug + change one wiring line; the four routes never change.

## Test Results

| Layer                 | Status            | Notes                                                                 |
| --------------------- | ----------------- | --------------------------------------------------------------------- |
| Unit (Vitest)         | ✅ 1552/1552 passed | 1536 prior + 16 new (9 bcrypt adapter + 7 lint-mirror). Exact match.   |
| Integration (Vitest)  | ✅ 122/122 passed   | Real local Supabase, booted server. DB-identity sentinel probe passed. |
| Database (pgTAP)      | n/a — not required | No migration, no schema change, no RLS/policy change.                  |
| Edge Functions (Deno) | n/a — not required | No edge function touched.                                              |
| E2E (Playwright)      | ✅ 8/8 @critical chromium | login + KDS PIN sign-in + wrong-PIN reject + order/picking flows. |

### Behaviour-preservation linchpin — PASSED

The cost-10 → cost-12 cross-cost proof passed at TWO layers:

1. **Unit** — `tests/unit/adapters/bcrypt/PasswordHasher.test.ts` case "verifies a hash made at
   cost 10": plants `bcrypt.hash("legacy-pin", 10)` and confirms the cost-12 adapter's `compare`
   returns true (right) / false (wrong).
2. **Integration (the real proof)** — `tests/integration/kds.test.ts` plants a PIN hashed at
   **cost 10** (`bcrypt.hash(TEST_PIN, 10)`) into `pin_hash`, then POSTs to the real
   `/api/auth/kds-pin` route on the booted server → **200 OK**. The globalSetup identity probe
   does the same (cost-10 PIN → `/api/auth/kds-pin`) as an abort-on-fail gate. Both green.

🗣 In plain English: credentials already saved in the database (made by the OLD code at the
cheaper cost-10 setting) still let staff log in through the NEW cost-12 code. No one gets locked
out by this change. This is the single most important thing this refactor had to not break, and
it didn't.

## Iteration log

Zero loops. All required layers passed on the first Verify pass. No test was broken, no test was
fixed, no app-code bug was found — consistent with a behaviour-preserving refactor that the
code-critic had already cleared.

## Warnings (non-blocking)

- F-TD-17 (BACKLOG): WebKit/Mobile-Safari shows a KNOWN harness-only flake on 2 @critical specs.
  Not an app bug. WebKit was NOT run; chromium is the ANVIL default. No bearing on this PR.

## Migration

None. This is a code-only refactor — no migration, no schema change, no DB write-path change.

**Rollback note (code-only):** revert is a pure code rollback — `git revert` the squash-merge
commit (or Vercel "promote previous deployment"). NO database rollback needed because there is no
migration and no data shape changed. Existing stored hashes are untouched and remain valid both
before and after (cost-agnostic compare). No rollback SQL script required.

PITR confirmed: N/A — no destructive migration (none at all).

## Merge Sequence

1. No `supabase db push` — no migration in this PR.
2. Merge PR #36 → Vercel auto-deploys the code.
3. Pre-ship smoke (conductor): @critical Playwright paths on the current Vercel preview.
4. Post-deploy smoke (conductor): 3 @critical paths against live prod; rollback = revert + redeploy.

## Production ship record (conductor — Lock + Ship completed)

- **Merged:** PR #36 squash-merged to `main` as `684a94f` (fast-forward; branch deleted).
- **Prod deploy:** `dpl_6Q68FG91gePqJhdyMSoWyTAVvzSk` (commit `684a94f`) → READY, aliased to www.mfsops.com + mfsops.com (~45s build).
- **Pre-ship smoke (PREVIEW):** 8/8 @critical green on `mfs-operations-dsdy9q0f7-…vercel.app` (commit `6c62cf8`); previewProbe DB-identity 4/4 passed.
- **Post-deploy smoke (PRODUCTION) — 4/4 non-500 on www.mfsops.com:**
  - `GET /api/kds/orders` → **200** (app healthy, real data served)
  - `POST /api/auth/login` bogus creds → **401** (the linchpin: `PasswordHasher.compare` executes live against a real user lookup and cleanly rejects — not a 500)
  - `POST /api/auth/kds-pin` bogus PIN → **401** (per-user compare loop path healthy)
  - `GET /` → **307** (app boots, redirect to login)
- **No migration → no PITR, no DB rollback.** Rollback = `git revert 684a94f` + redeploy.

### Documented behaviour change (intended, non-defect)
A corrupt stored hash now reads as **401 + rate-limit tick** instead of **500**, because `compare` is TOTAL. Net real-world change ≈ zero — the old login already `String()`-cast the stored hash, so a corrupt-but-string hash already returned 401; the difference only manifests on a non-string-convertible hash that cannot arise from real DB+JSON data. Safer behaviour (broken hash = wrong credential + counts toward lockout). Code-critic graded this 🟡-documented, NOT a blocker.

## Verdict

✅ CLEARED FOR PRODUCTION — SHIPPED 2026-06-14 (merged `684a94f`, prod smoke 4/4 non-500).
