# ANVIL Clearance Certificate

Date: 2026-06-17
App: MFS-Operations
Branch: feat/f-rls-04b-users-rls-cutover
PR: #47

> CLEARED & SHIPPED 2026-06-17 — prod migration applied first (3 policies verified live on
> prod ref `uqgecljspgtevoylwkep`), PR #47 squash-merged to main (`db8d3de`), prod deploy
> `dpl_A3UTJYRXGuxpfHa6eKAv6aBmY8tT` READY, post-deploy prod smoke PASS (0×500). Branch deleted.

## Scope — what this certificate actually covers

F-RLS-04b flips the **4 admin Users routes** onto the per-request **authenticated**
Supabase client so Row Level Security is enforced on writes, and adds **3 additive
`is_admin`-gated write policies** on `public.users`. The 5 public/pre-auth routes
(login, kds-pin, team, haccp-team, auth-type) deliberately stay on the service-role
client (RLS bypassed) and are unchanged.

🗣 In plain English: the 4 admin screens now talk to the database "as the logged-in
admin", so the database itself checks "are you actually an admin?" on every create/
edit/delete — not just the app. The 5 public routes (used before anyone logs in) keep
the old master-key path on purpose.

| Change / path                                          | Risk tier | Layers required                              | Layers run                                        |
| ------------------------------------------------------ | --------- | -------------------------------------------- | ------------------------------------------------- |
| `app/api/admin/users/route.ts` (GET/POST)              | Critical  | Unit + Integration + pgTAP/RLS + E2E + prev. | Unit + Integration + pgTAP + E2E + preview        |
| `app/api/admin/users/[id]/route.ts` (PATCH/DELETE)     | Critical  | Unit + Integration + pgTAP/RLS + E2E + prev. | Unit + Integration + pgTAP + E2E + preview        |
| `lib/wiring/users.ts` (`usersServiceForCaller`)        | High      | Unit + Integration (seam)                    | Unit + Integration                                |
| `supabase/migrations/20260617124846_users_authenticated_write_policies.sql` (RLS, additive) | Critical | pgTAP + Integration + preview policy check | pgTAP 007-rls-users 10/10 + preview policies 4/4 |

**Not run under the efficiency dial:** None. This is a high-risk tier (RLS cutover on
real prod Users traffic) → the FULL ladder ran, and the FULL 8-spec `@critical` E2E
suite was re-run on the deployed Vercel preview (the deliberate high-risk double-run),
not just a single smoke.
**Baseline characterisation pass?** No — diff-driven, full coverage of the changed surface.

**Architecture rung (seam crossed):** `lib/wiring/users.ts` is the composition root and
the only business-layer file that imports `@/lib/adapters/*`; the vendor `SupabaseClient`
is constructed and consumed entirely inside wiring — routes receive a port-built
`UsersService`. `tests/unit/lint/no-adapter-imports.test.ts` (lint pin) is green and the
4 routes carry no direct `@supabase/*` import. No vendor SDK leaks past the boundary. ✅

## Test Results

| Layer                 | Status            | Notes                                                                                                  |
| --------------------- | ----------------- | ------------------------------------------------------------------------------------------------------ |
| Unit (Vitest)         | ✅ 1728/1728       | 93 files; branch tip 14fbd40                                                                            |
| Integration (Vitest)  | ✅ 182/182         | real local Supabase; includes `admin-users.test.ts` (authenticated-client writes + admin-deny paths)   |
| Database (pgTAP)      | ✅ 76 tests, all real files `ok` | `007-rls-users` plan(10) `ok`. Overall harness line reads `Result: FAIL` — PRE-EXISTING cosmetic artifact: `_helpers.sql` is a shared include with no `plan()`, counted as a parse error. Every REAL test file reports `ok`. |
| Edge Functions (Deno) | n/a — not required | no `supabase/functions/` change in this PR                                                             |
| E2E (Playwright)      | ✅ local api 3/3 + ui 1/1 `@critical` | `smoke.spec.ts` (env-safety guard, /api/auth/team 200, cron 401) + login render |
| Preview smoke         | ✅ 8/8 `@critical` on deployed preview | DB identity probe 4/4; full critical suite (order place, picking-list print + lock + reprint, KDS PIN flow). Migration confirmed resynced; 4 policies present on preview branch. |

### Preview environment proof

- Preview URL: `https://mfs-operations-git-feat-f-2cbda1-hakan-kilics-projects-2c54f03f.vercel.app`
  (Vercel deployment `dpl_4Hxqkz7Xy3WCbPk6TbzF92CeDFUX`, state READY, branch tip SHA `14fbd40`).
- Supabase preview branch `feat/f-rls-04b-users-rls-cutover` (ref `ysyhquwwgzmfhnjxgugh`,
  PR #47), `preview_project_status: ACTIVE_HEALTHY`, non-persistent (auto-deletes on merge).
- Migration resync CONFIRMED: `20260617124846_users_authenticated_write_policies` is the
  last applied migration on the preview branch.
- Policy presence CONFIRMED on the preview DB: `users_select` (pre-existing, unchanged),
  `users_insert`, `users_update`, `users_delete` — all 4 present.

🗣 In plain English: I didn't just trust "the build is green" — I checked the throwaway
preview database directly and confirmed the three new security rules are actually
installed there, then drove the real browser flows against the live preview. Both agree
it works.

## Warnings (non-blocking)

- 🟡 **Transient preview cold-start (loop 1).** The first preview smoke aborted on the
  fail-closed DB identity probe: `GET /api/auth/team` returned HTTP 500 once at 14:14:21,
  ~1 min after the deploy readied and while the Supabase preview branch was still warming.
  Direct investigation showed the DB had its 8 seeded users, all 4 policies present, and
  the route serving HTTP 200 with real data immediately after. The re-run (loop 1, no code
  change) passed probe 4/4 and 8/8 specs. Classified as environment warmup flake, not a
  code or migration fault. (Vercel runtime log message for the 500 was truncated by the MCP
  at `{"level":"error","msg":"Use...` — the route recovered before a second occurrence.)

🗣 In plain English: the preview's database was still booting the first time I knocked, so
one request errored. I confirmed by hand that nothing was actually broken — the data and
rules were all there — and the immediate retry was clean. Worth noting, not worth blocking.

## Real-code bugs found

None. The single 🔴 encountered (probe 500) was a transient environment warmup, proven not
to be a code or migration defect (DB data + policies + route all healthy on direct inspection
and on re-run). No FORGE eject required.

## Migration

Additive — `CREATE POLICY` x3 on `public.users` (`users_insert`/`users_update`/`users_delete`),
all `is_admin`-gated. Drops nothing, deletes no data. The unchanged `users_select` policy
covers reads. Service-role still bypasses RLS (no `FORCE`), so the 5 public routes are
unaffected.

Rollback script: docs/anvil/2026-06-17-f-rls-04b-users-rls-cutover-rollback.sql
(two halves: re-point the 4 admin routes to the service-role `usersService` singleton +
`DROP POLICY IF EXISTS users_insert/users_update/users_delete ON public.users`).

PITR confirmed: N/A — additive migration, no destructive operation.

## Merge Sequence

1. `supabase db push` equivalent via Supabase MCP `apply_migration` to PROD ref
   `uqgecljspgtevoylwkep` FIRST (apply `20260617124846_users_authenticated_write_policies`
   — additive, safe before code).
2. Merge PR #47 → Vercel auto-deploys the route cutover SECOND.
3. Post-deploy smoke: 3 `@critical` paths against the live production URL (non-500 / healthy).
4. If smoke fails → `vercel rollback` (code) + drop the 3 policies (rollback HALF 2); no PITR
   needed (additive).

## Production deploy result (2026-06-17)

1. Migration applied to PROD ref `uqgecljspgtevoylwkep` via Supabase MCP `apply_migration` FIRST.
   Verified: `pg_policy` on `public.users` = `users_select` (unchanged), `users_insert`,
   `users_update`, `users_delete` — all 4 present on prod.
2. PR #47 squash-merged to main (`db8d3de`); Vercel prod deploy `dpl_A3UTJYRXGuxpfHa6eKAv6aBmY8tT`
   (target production) reached READY.
3. Post-deploy prod smoke (read-only, non-mutating) — **PASS, 0×500**:
   `/` 307 · `/login` 200 · `/api/reference` 307 · `/api/auth/team` 200 · `/api/auth/haccp-team` 200 ·
   `/api/admin/users` 307 (auth-gated fail-closed — the cutover route is alive) ·
   `POST /api/auth/login {}` 400 (route alive).
4. No rollback needed. Feature branch `feat/f-rls-04b-users-rls-cutover` deleted (local + remote).

## Verdict

✅ CLEARED FOR PRODUCTION — SHIPPED 2026-06-17. Migration-first apply + merge + prod smoke all green.
