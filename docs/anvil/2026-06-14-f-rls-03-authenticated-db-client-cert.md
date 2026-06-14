# ANVIL Clearance Certificate

Date: 2026-06-14
App: MFS-Operations
Branch: feat/f-rls-03-authenticated-db-client
PR: #38

Status: ✅ CLEARED FOR PRODUCTION — all required layers green, including the E2E
preview smoke (8/8 @critical) after the preview-credential blocker was resolved via a
manual env bridge (see "E2E preview smoke" below). Conductor finalized at Lock.

---

## Production ship record

**SHIPPED 2026-06-14.** Merge sequence executed via MCPs:
1. Migration `20260614210221_db_pre_request_guc_bridge.sql` applied to prod
   (`uqgecljspgtevoylwkep`) via Supabase MCP `apply_migration` → `{success:true}`.
   Verified on prod: hook wired on `authenticator`, runs without error under
   service_role claims (inert), sets `app.current_user_id` correctly for an
   authenticated claim (mechanism).
2. PR #38 squash-merged to `main` → `e55dcc7`. Vercel auto-deployed prod
   `dpl_d9LxXykAGKp5z5vf3FvuCPQ4Et9f` (commit `e55dcc7`) → READY.
3. Prod post-deploy smoke on `https://www.mfsops.com` (non-destructive): `/` → 307,
   `/login` → 200, **`/api/auth/team` → 200 returning 7 REAL users** (service_role reads
   through the live GUC hook → migration confirmed INERT in prod), `/api/reference` → 307,
   `/kds` → 200, cron-unauth → 401. **Zero 500s.**

Rollback target (prior prod): `dpl_BXdMuuvxnq9HQXj1MCDRXFntSHnM` (F-12, `59a5567`).
Migration rollback (if ever needed): `docs/anvil/2026-06-14-f-rls-03-authenticated-db-client-rollback.sql`
(`ALTER ROLE authenticator RESET pgrst.db_pre_request; NOTIFY pgrst, 'reload config';`).

**Post-ship cleanup owed:** (1) remove the 3 manual Preview env vars added to Vercel for
this branch; (2) confirm the Supabase preview branch `oyltgxhwjwyqbrngxnox` is deleted now
the PR is closed (no orphaned branches billing). (3) F-INFRA-05 (broken preview cred-sync)
must land before F-RLS-04a.

---

## Scope — what this certificate actually covers

F-RLS-03 is **INTRODUCE-ONLY**: it builds the per-request authenticated DB client +
token minter + GUC bridge migration beside the live path and flips **zero** production
routes. This ANVIL proves two things only: (a) the mechanism works end-to-end (a minted
token makes the bridge set `app.current_user_id` so an existing GUC policy fires), and
(b) nothing regressed. Full RLS-enforcement testing is DEFERRED to F-RLS-04a (Hakan's
call) — not in scope here.
🗣 We tested that the new keycard reader works and that nothing else broke — not that
every door is now locked. Locking the doors is a later unit.

| Change / path | Risk tier | Layers required | Layers run |
| --- | --- | --- | --- |
| `lib/ports/DbTokenMinter.ts` + web-crypto adapter (token minter) | Med (new seam) | Unit + domain-only | ✅ Unit |
| `lib/adapters/supabase/authenticatedClient.ts` (authed client + `requireServiceRole`) | High (auth/RLS seam) | Unit + Integration | ✅ Unit + Integration |
| `supabase/migrations/20260614210221_db_pre_request_guc_bridge.sql` (GUC bridge) | High (migration + RLS) | DB apply + Integration + E2E regression | ✅ DB apply + Integration + E2E preview smoke 8/8 |
| lint-mirror pins (`.eslintrc.json` unchanged) | Low | Unit (lint pins) | ✅ Unit |

**Not run under the efficiency dial:** None. Full ladder ran. The E2E preview smoke was
initially blocked by preview-environment wiring and then unblocked via a manual env
bridge (see below) and run to a true 8/8 green — never a silent pass.
**Baseline characterisation pass?** No — diff-driven, normal coverage.

---

## Test Results

| Layer | Status | Notes |
| --- | --- | --- |
| Unit (Vitest) | ✅ 1595/1595 passed | Full suite; incl. 11 new F-RLS-03 tests + 18 lint pins. Matches expected count. |
| Integration (Vitest, LOCAL Supabase) | ✅ 126/126 passed | 122 existing + 4 new `rls-bridge` assertions. The load-bearing test **ACTUALLY RAN** (CAN_RUN=true), did not skip. |
| └─ rls-bridge 4.2 DENY | ✅ pass | anon client, no token → 0 customer rows (RLS denies). |
| └─ rls-bridge 4.3 ALLOW | ✅ pass | minted token → authenticated client → customer rows returned (full chain proven). |
| └─ rls-bridge 4.3b ISOLATION | ✅ pass | two minted users read independently → `is_local := true` proven, no GUC bleed. |
| └─ rls-bridge 4.4 INERT | ✅ pass | service_role read still returns rows after the migration (master-key path untouched). |
| DB / RLS (migration apply) | ✅ pass | `db:reset` applied `20260614210221_…` cleanly; `db_pre_request` fn present (SECURITY DEFINER); `pgrst.db_pre_request=public.db_pre_request` confirmed set on `authenticator` (verified locally AND on the PR's live preview branch `oyltgxhwjwyqbrngxnox`). The integration ALLOW case is the runtime proof the hook fires. |
| Typecheck (`tsc --noEmit`) | ✅ 0 errors | Matches main baseline. |
| Lint (`next lint`) | ✅ 0 warnings/errors | Matches main baseline. |
| E2E preview smoke (@critical) | ✅ 8/8 passed | After the manual env bridge (below), DB-identity probe 4/4 passed (seed-born preview DB confirmed) and all 8 `@critical` specs (01-order-place, 02-picking-list-print, 03-kds-butcher-flow) passed against branch alias `mfs-operations-git-feat-f-cdd8c7-…vercel.app` in `--unprotected` mode. Run from conductor at Lock. |

🗣 Every rung is green — including the "does it survive a real Vercel/Supabase deploy"
smoke, once the preview app was handed its throwaway database's keys.

---

## E2E preview smoke — blocker + resolution

**RESOLVED (2026-06-14, conductor at Lock).** Root cause: the Supabase→Vercel integration
is connected but **not injecting any preview-branch Supabase credentials** into the Vercel
Preview scope (a clean redeploy after the branch existed still 500'd — the timing-race
hypothesis was ruled out). All prod Supabase vars are deliberately scoped Production-only
(per ADR-0006's "no preview carries prod creds" invariant), so the preview deploy had no
DB credentials at all → `createClient` threw → `/api/auth/team` 500.

Fix applied (manual env bridge, ADR-0006-compliant): the PR's own preview-branch keys
(`oyltgxhwjwyqbrngxnox`) were added to Vercel **Preview** scope, restricted to this git
branch — `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY` (branch keys, never prod). After redeploy: `/api/auth/team`
→ 200 returning `ANVIL-TEST-*` seed users (throwaway DB confirmed), DB-identity probe 4/4,
smoke 8/8. **The broken integration itself is logged as a dedicated infra fix (BACKLOG
F-INFRA-05) and must land before F-RLS-04a** — the manual bridge is a per-PR stopgap.

Cleanup owed at PR close: remove the 3 manual Preview env vars and delete the preview
branch (ship-checklist "no orphaned branches").

### Original diagnosis (retained for the record)

- Preview deploy `dpl_2adAQ9NWPqkVaDUr5uBzJbRqQUqb` (commit `e80e3c8`, branch HEAD) was
  `readyState: READY`. The smoke's globalSetup DB-identity probe failed at check 2:
  `GET /api/auth/team` returned HTTP 500. By design the probe aborts the whole smoke and
  runs zero specs (correct fail-closed behaviour — it must never be weakened).
- The 500 route `/api/auth/team` uses the **untouched** `supabaseService` master-key
  client and is **not part of the F-RLS-03 diff**. It fails in its outer catch
  ("Unhandled error") — the construction/connection path, not a query/RLS error.
- I inspected the PR's live Supabase preview branch (`oyltgxhwjwyqbrngxnox`, PR #38)
  directly (read-only): **12 users, 8 PIN users, 2 customers** present; the bridge
  function applied; `pgrst.db_pre_request` set on `authenticator`. So the branch DB is
  healthy, migrated, and seeded.
- Conclusion: the data and migration on the preview branch are correct. The 500 is the
  **Vercel preview → Supabase branch credential wiring** not being connected for this
  deploy (probe's documented cause: "Supabase-Vercel integration not wired / preview
  pointing at wrong credentials"). This is infrastructure outside this PR's diff.
  🗣 The database the preview points at is fine; the preview app just isn't holding the
  right key to reach it. That is a plug-in-the-wall problem, not a problem with the code
  in this PR.

---

## Real-code bugs found

**None.** No source bug and no test-file bug. The single integration failure during the
run was a runner-side `.env.test.local` setup gap (missing `SUPABASE_JWT_SECRET` +
`NEXT_PUBLIC_SUPABASE_ANON_KEY`), which I provisioned with the well-known local-dev
values; the suite then went green. The migration, minter, authenticated client, and
`requireServiceRole()` all behave exactly as specified.

---

## Migration

Additive / non-destructive (function + role attribute + config reload; no
DROP/TRUNCATE/ALTER TYPE/DROP NOT NULL).
Rollback script: docs/anvil/2026-06-14-f-rls-03-authenticated-db-client-rollback.sql
PITR confirmed: N/A — non-destructive, no PITR gate (ADR-0007 §Consequences).

Ship-time note: the migration is applied to prod via Supabase MCP `apply_migration`
(14-digit `20260614210221`), by Hakan/conductor — NOT by the runner. Migrations-first,
then code deploy.

---

## Merge Sequence (for the conductor at Lock)

1. Apply migration to production FIRST via Supabase MCP `apply_migration`
   (`20260614210221_db_pre_request_guc_bridge.sql`).
2. Merge PR #38 → Vercel auto-deploys.
3. Smoke: 3 @critical paths against the production URL post-deploy.

(The bridge is inert for current service_role traffic, so step 1 changes zero behaviour
on the live routes — proven by integration 4.4.)

---

## Verdict

✅ **CLEARED FOR PRODUCTION.** All required layers green: unit 1595/1595, integration
126/126 (rls-bridge 4/4 ran), DB migration applies clean, tsc 0 / lint 0, and the E2E
preview smoke 8/8 @critical (DB-identity probe 4/4) on the real preview deploy after the
preview-credential blocker was resolved via a manual env bridge.

The blocker was **preview-environment wiring (Supabase→Vercel integration not injecting
preview-branch credentials)**, not the F-RLS-03 code or migration — both proven green
throughout. Resolved at Lock; the underlying integration fix is tracked as **BACKLOG
F-INFRA-05** (must land before F-RLS-04a; the manual bridge is a stopgap).

Migration is non-destructive + inert for current service_role traffic → no PITR gate.
Ready for the Gate 4 ship sequence (migration-first via Supabase MCP, then merge, then
prod smoke).
