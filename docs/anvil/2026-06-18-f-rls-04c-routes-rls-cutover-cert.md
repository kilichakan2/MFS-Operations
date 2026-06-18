# ANVIL Clearance Certificate (FINAL — all layers green incl. preview smoke)

Date: 2026-06-18
App: MFS-Operations
Branch: f-rls-04c-routes-rls-cutover
PR: F-RLS-04c — Routes RLS cutover (+ user-directory read fix)

## Scope — what this certificate actually covers

| Change / path | Risk tier | Layers required | Layers run |
| --- | --- | --- | --- |
| 5 Routes API routes flipped service-role → `routesServiceForCaller` (authenticated) — `app/api/routes/route.ts`, `app/api/routes/[id]/route.ts`, `app/api/routes/today/route.ts`, `app/api/admin/runs/route.ts`, `app/api/admin/runs/[id]/route.ts` | Critical (RLS cutover) | Unit + Integration + pgTAP + E2E | Unit ✓ · Integration ✓ · pgTAP ✓ · E2E pending (conductor) |
| `lib/wiring/routes.ts` — per-request authenticated composition (service-role singleton kept as rollback parachute) | Critical (seam) | Integration + pgTAP | ✓ ran |
| Migration `20260618120000_routes_authenticated_rls_policies.sql` — routes/route_stops 7-policy set | Critical (RLS, additive) | pgTAP + Integration | ✓ ran |
| Migration `20260618130000_users_directory_read_for_authenticated.sql` — directory SELECT policy + column REVOKE/GRANT sealing pin_hash/password_hash + `current_user_is_valid()` SECURITY DEFINER helper | Critical (RLS + privilege, additive) | pgTAP + Integration | ✓ ran |

**Not run under the efficiency dial:** None deliberately skipped under the dial. E2E `@critical` preview smoke is PENDING — conductor (the runner has no network egress). High-risk RLS tier = full E2E suite on the preview is required, run by the conductor before finalising this cert.
**Baseline characterisation pass?** No — this is a diff-driven matrix against an existing, well-tested suite.

🗣 In plain English: this change moves the Routes screens from running with a master key (sees everything) to running as the logged-in user (the database itself now enforces who sees what). That is a high-stakes auth/RLS change, so it gets the full ladder — and the browser-in-the-real-deploy check still has to be run by the conductor before this cert is final.

## Test Results

| Layer | Status | Notes |
| --- | --- | --- |
| Unit (Vitest) | ✅ 1860/1860 passed | Full suite incl. `no-adapter-imports` lint pin + migration filename-convention test. Offline, no infra. |
| Integration (Vitest) | ✅ 235/235 passed | Real local Supabase (Docker), no mocked client. Incl. all 4 F-RLS-04c routes cases (populated authenticated GET-by-id, populated list, **non-admin peer-name regression lock**, full authenticated write cycle create→save→setStatus→delete) + users credential reads still return hashes under service-role. |
| Database (pgTAP) | ✅ 10/10 test files `ok` | Per-file breakdown below. Overall harness `Result: FAIL` is the documented `_helpers.sql` cosmetic artifact — NOT a real failure. |
| Edge Functions (Deno) | n/a — not required | No `supabase/functions/` change in this diff. |
| E2E (Playwright) | ✅ 12/12 @critical passed (1 conditional skip) | Conductor-run on the Vercel preview `dpl_F3VUfkycamM9LBpuQUJSqiTQs5XW` (commit `41444bf`) wired to Supabase preview branch `uiwhhuhjkrffyqnbeyma` (parent prod `uqgecljspgtevoylwkep`). `previewProbe`: all 4 DB identity checks passed — confirmed reading a seed-born preview DB, NOT prod. Spec `05-routes-planner-map` drives `/routes` (add stop → save → read back) — exercises the flipped Routes create/read path under the authenticated role + new policies. 1.2m runtime. Log: `/tmp/f-rls-04c-preview-smoke.log`. |

### pgTAP per-file breakdown (judge PER-FILE `ok`)

| File | Plan | Result |
| --- | --- | --- |
| 001-schema-integrity.test.sql | — | ✅ ok |
| 002-reference-generator.test.sql | — | ✅ ok |
| 003-state-machine.test.sql | — | ✅ ok |
| 004-audit-triggers.test.sql | — | ✅ ok |
| 005-rls-orders.test.sql | — | ✅ ok |
| 006-rls-audit-log.test.sql | — | ✅ ok |
| 007-rls-users.test.sql | — | ✅ ok — 04b users WRITE policies still pass, unbroken by the directory widening |
| 008-kds-undo.test.sql | — | ✅ ok |
| 009-rls-routes.test.sql | plan(11) | ✅ ok — valid-user full CRUD on routes + route_stops; empty-GUC fail-closed (22P02 on SELECT + INSERT); service-role RLS bypass |
| 010-rls-users-directory.test.sql | plan(5) | ✅ ok — (a) non-admin reads PEER id/name/role; (b) non-admin gets genuine `42501` deny on BOTH password_hash AND pin_hash (column-privilege seal); (c) service-role/owner reads both hashes (login + kds-pin intact) |
| _helpers.sql | n/a | ⚠️ COSMETIC ARTIFACT — "No plan found in TAP output". This is a shared `\ir` include scanned as a test file; it declares no plan and runs 0 subtests. It is the SOLE reason the harness prints overall `Result: FAIL`. NOT a test failure. Total real tests across the 10 `.test.sql` files: 104, 0 failed. |

🗣 In plain English: every actual database test passed. The one red-looking line at the bottom (`_helpers.sql` / `Result: FAIL`) is the test runner mistaking a shared helper file for a test — there's nothing to fail in it. All ten real test files said `ok`, including the three new F-RLS-04c ones proving (1) the Routes tables now let a logged-in user read/write through the locked-down role, (2) a non-admin can see colleagues' names on a route, and (3) password/PIN hashes stay invisible to non-admins but readable by the login service.

## Iteration log

No iterations needed. Every layer passed on the first authoritative run. Zero broken tests, zero real code bugs surfaced — no FORGE eject required.

## Architecture rung (seam crossed)

The diff crosses the Routes seam (`lib/wiring/routes.ts` adds the per-request authenticated composition). The RoutesService port is exercised by an in-memory fake in the unit suite and against the real adapter in integration; no vendor SDK is imported outside `lib/adapters/<vendor>/` (pinned by `tests/unit/lint/no-adapter-imports.test.ts`, green in the unit run). Rip-out contract intact: swapping the DB vendor = one new adapter folder + edits to `lib/wiring/routes.ts` only. ✅ No seam breach.

## Migration

Additive (both migrations). No DROP TABLE / TRUNCATE / ALTER TYPE / DROP COLUMN / DROP NOT NULL — policies + privilege-surface reshape only, no data touched. **No PITR gate fires.**

- `20260618120000_routes_authenticated_rls_policies.sql` — 7 CREATE POLICY (routes ×4, route_stops ×3). Table GRANTs pre-exist in baseline.
- `20260618130000_users_directory_read_for_authenticated.sql` — directory SELECT policy + REVOKE blanket SELECT / re-GRANT 8 non-hash columns to `authenticated` + `current_user_is_valid()` SECURITY DEFINER helper (non-recursive, mirrors `is_admin()`).

Rollback script: `docs/anvil/2026-06-18-f-rls-04c-routes-rls-cutover-rollback.sql`
(Layer 1 = one-line-per-route swap back to the `routesService` service-role singleton — already present in `lib/wiring/routes.ts` as the parachute; Layer 2 = DROP the 7 routes policies + the directory policy + restore blanket grant + DROP the helper function, per each migration's inline ROLLBACK block. Revert Layer 1 before Layer 2.)
PITR confirmed: N/A — non-destructive, additive.

## Merge Sequence

1. Apply BOTH migrations to production FIRST via Supabase MCP `apply_migration` (never `supabase db push`) — `20260618120000` then `20260618130000`. Migration-before-code: new authenticated routes need the policies + directory grant to exist or every Routes GET returns nothing.
2. Merge PR → Vercel auto-deploys the route cutover.
3. Smoke test: 3 `@critical` Playwright paths against live production (Route Planner save/load + admin runs status/delete) → rollback trigger if any fail.

## Warnings (non-blocking)

- 🔵 Empty/absent-GUC edge raises `22P02` (cast error) rather than a clean `42501` deny — inherited from F-RLS-04a/04b, FAIL-CLOSED either way (no row read or written) and unreachable on these routes (they always carry a valid token). Deferred clean-deny fix is the existing is-admin/cast-guard follow-up. Documented in the routes-policy migration header; not introduced by this PR.

## Verdict

✅ CLEARED FOR PRODUCTION — all layers green, no outstanding rungs.

Unit 1860/1860, Integration 235/235, pgTAP 10/10 files `ok` (104 tests), E2E 12/12 @critical on the preview (seed-born preview DB confirmed) — zero real code bugs, no destructive migration, no PITR gate. The preview smoke (conductor-run, the runner has no egress) is now GREEN, finalising this verdict. Cleared to ship via the merge sequence above: apply both migrations to prod FIRST, then merge, then prod smoke.
