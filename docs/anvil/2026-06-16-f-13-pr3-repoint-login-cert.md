# ANVIL Clearance Certificate (DRAFT)

Date: 2026-06-16
App: MFS-Operations
Branch: f-13-pr3-repoint-login
PR: #45 — https://github.com/kilichakan2/MFS-Operations/pull/45
HEAD: 79425f0

## Scope — what this certificate actually covers

| Change / path                              | Risk tier | Layers required                          | Layers run                          |
| ------------------------------------------ | --------- | ---------------------------------------- | ----------------------------------- |
| `app/api/auth/login/route.ts` (re-point)   | Critical (auth) | Unit + Integration + lint pins + E2E | Unit, Integration, lint, pgTAP (verify), E2E |
| `tests/integration/auth-login.test.ts` (NEW) | —       | n/a (test asset)                         | ran — 10 passed                     |
| `tests/unit/api/auth-login.route.test.ts` (NEW) | —    | n/a (test asset)                         | ran — within unit 1721              |

**Not run under the efficiency dial:** None — auth is the critical tier, full ladder run. (Docker dev-machine rung: no compose/Dockerfile present → not applicable; local Supabase containers via `supabase start` were used for integration + pgTAP + E2E.)
**Baseline characterisation pass?** No — diff-driven. The new integration suite is itself written as a byte-identical characterisation harness (passes against the pre-PR3 route AND after the re-point), proving the change is plumbing-only.

## Architecture rung (seam crossed: `app/**` → port)

- The login route now reaches the DB ONLY through `usersService` (port-backed wiring singleton `@/lib/wiring/users`) and `passwordHasher` / `sessionTokens` ports — no vendor SDK.
- Lint pin `tests/unit/lint/no-adapter-imports.test.ts` (18/18) + direct grep confirm ZERO `@supabase/*` and ZERO `lib/adapters/**` imports in the route. Rip-out test improved: login no longer carries a direct Supabase dependency.
- No vendor import in any domain/route test. Seam holds — not a blocker.

## Test Results

| Layer                 | Status            | Notes                                                                 |
| --------------------- | ----------------- | --------------------------------------------------------------------- |
| Unit (Vitest)         | ✅ 1721/1721 passed | Includes the 9 new login route-handler tests (incl. no-hash 403 case). |
| Lint pins (Vitest)    | ✅ 18/18 passed    | no-adapter-imports + no-supabase-SDK pins — route is import-clean.     |
| Integration — login   | ✅ 10/10 passed    | Real local Supabase. Success + last_login advance, wrong-cred, R1 unknown-user→429 lockout, inactive 403, missing/malformed body, multi-role picker, invalid role. R2 ('Database error' 500) pinned at unit layer (not triggerable on a live local DB). |
| Integration — regression | ✅ 173/173 total (17 files) | PR2 routes (admin-users, kds, adapters), RLS bridge, users_auth_check constraint all still green. |
| Database (pgTAP)      | ✅ 66/66 passed    | All 6 suites `ok`. No migration in diff → RLS/schema unchanged from shipped baseline. (Harness prints aggregate `Result: FAIL` solely because `_helpers.sql` include has no `plan()` — cosmetic, not a test failure.) |
| Edge Functions (Deno) | n/a — not required | No `supabase/functions/` change in diff.                              |
| E2E (Playwright)      | ✅ 12/12 passed    | @critical chromium 8/8 (real PIN sign-in + wrong-PIN reject + order/print/KDS flows) + api smoke 3/3 + ui smoke 1/1. All against LOCAL Supabase (env guard asserted localhost). |

## Warnings (non-blocking)

- W1 (known, accepted): duplicate-name edge returns 500 instead of 401 — deferred to BACKLOG F-TD-22. Not exercised as a blocker; behaviour unchanged by this PR.
- pgTAP harness aggregate exit code is `FAIL` due to the no-plan `_helpers.sql` include; every real test file reports `ok` (66/66). Cosmetic.

## Migration

None — code-only re-point.
Rollback script: docs/anvil/2026-06-16-f-13-pr3-repoint-login-rollback.sql (code-revert pointer; no SQL to run)
PITR confirmed: N/A — no migration, no schema/RLS change, no data-shape risk.

## Merge Sequence

1. No migration to push — skip `supabase db push`.
2. Merge PR #45 → Vercel auto-deploys.
3. Pre-ship smoke: @critical Playwright paths on the current Vercel preview (real PIN/password login).
4. Post-deploy smoke: 3 @critical paths against live prod URL.
5. If smoke fails → `vercel rollback` (code only — no data to recover).

## Ship record (Lock gate — conductor)

- **Squash-merged:** PR #45 → `main` as `903de69` (2026-06-16 14:45 UTC).
- **Pre-ship smoke (PREVIEW, `mfs-operations-git-f-13-p-af570a…`):** 8/8 @critical green — real password login + real PIN login flowing through `usersService` (the re-pointed credential path, proven end-to-end on the exact build).
- **Prod deploy:** `dpl_4M1KE2…fccqm66du` (commit `903de69`, target production) READY.
- **Post-deploy smoke (PRODUCTION, read-only / non-mutating):** 5/5 non-500 —
  `GET /` 307 (fail-closed), `GET /api/auth/team` 200, `GET /api/auth/type` 405 (POST-only route, alive), `GET /api/auth/haccp-team` 200, `POST /api/auth/login` 400 (route alive + validating input). The login `400` is the input-validation branch (smoke payload field-shape intentionally not matched on prod to avoid firing real failed-login attempts); the re-pointed credential path was proven on the identical preview build, not on prod.
- **Rollback:** not needed — code-only, no data touched.
- **Follow-ups logged to BACKLOG:** F-TD-22 (`users.name` uniqueness guard — committed next unit, dedup-existing-rows first) and F-TD-21 (inactive-account disclosed before credential check).

## Verdict

✅ CLEARED FOR PRODUCTION & SHIPPED (`903de69`)
