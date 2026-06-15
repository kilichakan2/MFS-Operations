# ANVIL Clearance Certificate

Date: 2026-06-15
App: MFS-Operations
Branch: feat/f-rls-04a-orders-rls-cutover
PR: #42 — https://github.com/kilichakan2/MFS-Operations/pull/42

> **DRAFT — for the conductor's Gate 4 / Lock review.** All required layers ran
> and passed; this cert records the evidence. The conductor owns the Lock gate,
> the PITR safety-net check, and the ship sequence.

## What this unit is

Flips the **front-door Orders read/edit/print routes** from the service-role
Supabase client onto the **per-request authenticated DB client** (F-RLS-03) so the
existing GUC-based row-level-security (RLS) policies evaluate the real caller's
identity:

- `GET /api/orders` — list (authenticated client)
- `GET /api/orders/[id]` — read (authenticated client)
- `PUT /api/orders/[id]` — edit incl. line-replacement DELETE (authenticated client)
- `GET /api/orders/[id]/picking-list` — preview (authenticated client)
- `POST /api/orders/[id]/picking-list` — print + placed→printed transition (authenticated client)

**🗣 In plain English:** until now these screens talked to the database with a
master key that ignores every per-user rule. Now each request carries the actual
logged-in user's "keycard," so the database itself enforces who may see/edit/print
what — defence in depth, not just app-layer checks.

**Deliberately deferred (still service-role this unit):**
- `POST /api/orders` (create) — its inserts are atomically coupled to idempotency
  bookkeeping on `order_idempotency_keys`, which is RLS-deny-all; flipping it would
  silently break idempotency. Tracked as the **F-RLS-04a-create** follow-up.
- All **KDS routes** + the cron — stay service-role by design.

**🗣 In plain English:** two areas keep the master key on purpose — order creation
(because its duplicate-protection bookkeeping lives in a table with no per-user
rule yet) and the kitchen-display + scheduled jobs. Both are logged as follow-ups,
not oversights.

## Scope — what this certificate actually covers

| Change / path                                                        | Risk tier    | Layers required                       | Layers run                                  |
| -------------------------------------------------------------------- | ------------ | ------------------------------------- | ------------------------------------------- |
| `lib/adapters/web-crypto/DbTokenMinter.ts` (clock-skew fix)          | High (auth)  | Unit                                  | Unit ✅                                      |
| `supabase/migrations/20260615173901_…delete_and_print_policies.sql`  | Critical (RLS migration) | pgTAP/RLS + Integration + E2E | Integration (DB-layer RLS) ✅ + E2E ✅       |
| `app/api/orders/route.ts` (GET → authed)                             | High (auth)  | Unit + Integration + E2E (full)       | Unit ✅ + Integration ✅ + E2E + preview ✅  |
| `app/api/orders/[id]/route.ts` (GET+PUT → authed)                    | High (auth)  | Unit + Integration + E2E (full)       | Unit ✅ + Integration ✅ + E2E + preview ✅  |
| `app/api/orders/[id]/picking-list/route.ts` (GET+POST → authed)      | High (auth)  | Unit + Integration + E2E (full)       | Unit ✅ + Integration ✅ + E2E + preview ✅  |
| `lib/wiring/orders.ts` (per-caller authed factories)                 | High (seam)  | Integration (architecture rung)       | Integration ✅                              |

**Not run under the efficiency dial:** None — full ladder run. This is the high-risk
tier (auth + RLS migration + critical path), so the FULL `@critical` E2E suite was
run on the Vercel preview as well as locally (the deliberate high-risk double-run),
not just a single smoke.

**Baseline characterisation pass?** No — diff-driven; the change has dedicated tests.

**Docker rung:** N/A — no `docker-compose.yml` / `Dockerfile` in repo. The Supabase
CLI local stack is the local environment (DB reset applies the migration locally).

**Architecture rung (seam crossed — `lib/wiring/orders.ts`, vendor client):** The
vendor `SupabaseClient` is constructed and consumed entirely inside the wiring file;
routes receive a ready `OrdersService` / `PickingListUsecase` built from ports. No
vendor SDK is imported in `lib/domain/**` or `lib/ports/**`. Rip-out contract intact.
ESLint `no-adapter-imports` pin is green (part of the 1661 unit suite).

**🗣 In plain English:** the database vendor stays sealed behind one swap-point file.
Nothing leaked the Supabase shape into the business logic, so the "replace the DB =
one adapter + one wiring line" promise still holds. The lint guard that enforces this
is green.

## Build vs deployed-preview provenance (read before Lock)

- Local working HEAD: `b13ce4e` (a local commit that ADDS the plan/review/follow-up
  **docs** on top of the code).
- PR #42 deployed HEAD: `989da40` (the clean code-only branch tip; the warehouse-print
  Guard fix).
- **All 8 application/test files in this change are byte-identical between the two
  commits** (verified `git diff b13ce4e 989da40 -- <each file>` = 0 lines). The only
  difference is documentation. The preview smoke therefore tested the exact code under
  certification. The local docs commit is the plan/review the conductor commits at ship.

**🗣 In plain English:** my local copy and the live preview run the same app code and
the same database migration — only some doc files differ. So the live test was a true
test of this change, not a stale build.

## Test Results

| Layer                            | Status            | Notes                                                                                 |
| -------------------------------- | ----------------- | ------------------------------------------------------------------------------------- |
| Unit (Vitest)                    | ✅ 1661/1661      | Full suite. Incl. `DbTokenMinter.test.ts` clock-skew bounds (iat=now−30, exp=now+120, span 150s). |
| Typecheck (`tsc --noEmit`)       | ✅ 0 errors       | Strict-0 maintained.                                                                   |
| Lint (`next lint`)               | ✅ 0/0            | No ESLint warnings or errors.                                                          |
| Integration (Vitest, local DB)   | ✅ 138/138        | Real local Supabase, no client mocking. `db:reset` applied the migration first.       |
| DB / RLS — `orders-rls.test.ts`  | ✅ 12/12 (ran)    | The load-bearing migration proof. Talks straight to PostgREST as authenticated/anon role (pgTAP-equivalent policy proof). Covers: read gate, anon-deny (T2), write gate incl. new DELETE policy, driver deny, audit-log real user_id, **warehouse placed→printed PRINT success** (`orders_print_placed`), driver PRINT deny. Not skipped (env present). |
| E2E `@critical` (Playwright, local) | ✅ 8/8 + 3/3 API | `chromium @critical` 8/8 (order place, picking-list print, KDS) + API smoke 3/3. Hits the flipped authenticated Orders routes after login. |
| ★ PREVIEW SMOKE (REMOTE) ★       | ✅ 8/8            | `@critical` specs vs PR #42 deployed preview (`989da40`, `dpl_8rusEELE…`, READY/preview) wired to its Supabase preview branch. 4-check DB identity probe passed (seed-born preview DB, not prod). |

### What the preview smoke specifically exercised (the JWT-inheritance verdict)

The remote smoke exercised **authenticated-client Orders routes end-to-end on the
real deploy target**, not just the service-role health probe:

- **Spec 01 (sales login):** `/orders` list (`GET /api/orders`) + order detail
  (`GET /api/orders/[id]`) — both on the authenticated client; dashboard returned the
  placed order rows.
- **Spec 02 (office login):** picking-list **print** (`POST /api/orders/[id]/picking-list`)
  → placed→printed transition under the authenticated client + `orders_print_placed`
  RLS policy; lock-banner + reprint-warning confirm the state actually transitioned in
  the preview DB.

**VERDICT — JWT-inheritance bet: CONFIRMED (held).** The authenticated routes mint an
HS256 token signed with the statically-placed Vercel-Preview `SUPABASE_JWT_SECRET`.
The preview DB **accepted** that token (routes returned data and the print transition
committed) — proving the PR #42 Supabase preview branch verifies tokens against the
**parent project's JWT secret**. Had the bet been wrong, the authed routes would have
failed CLOSED (401/empty) — that safe failure did NOT occur.

**🗣 In plain English:** we'd bet that a throwaway copy of the database would trust the
same "signature stamp" as the real one. The robot logged in on the real deployed app,
loaded and printed orders through the new permission-checked path, and it worked — so
the bet was right. If it had been wrong, nothing would have leaked; the screens would
just have shown nothing.

## Warnings (non-blocking)

- 🔵 **Accepted limitation — skip-print looseness (consciously accepted, NOT a failure):**
  warehouse/office/admin can technically drive an order placed→completed at the DB layer
  (the RLS policies are permissive enough to allow it). Low severity; the app layer gates
  the real flows. Logged as **BACKLOG `F-RLS-04a-print-guard`**. No assertion was added
  against it and it is not treated as a blocker, per the approved matrix.
- 🟡 CI note (informational): the F-INFRA-05 cred-sync workflow uses `actions/checkout@v4`
  / `setup-node@v4` (Node 20), which GitHub is deprecating. Unrelated to this change; not
  a blocker.

## Migration

**Additive** (three `CREATE POLICY` only — `orders_delete`, `order_lines_delete`,
`orders_print_placed`; guarded by `DROP POLICY IF EXISTS`). Deletes no data, drops no
column, alters no type. **Not destructive → no PITR gate of its own.**

Rollback script: `docs/anvil/2026-06-15-f-rls-04a-orders-rls-cutover-rollback.sql`
(DROP the three policies; revert the per-handler one-line factory swap first/together).

PITR confirmed: **N/A for this migration (non-destructive).** ⚠️ Cert NOTE for Lock:
confirm PITR is enabled on the production project as a general safety net before the
prod flip (recommended, not gated by this migration).

Applied to: LOCAL (`db:reset`) ✅ and PR #42 Supabase **preview branch** (auto-applied
on provision; branch `ACTIVE_HEALTHY` / `FUNCTIONS_DEPLOYED`) ✅. **NOT applied to prod**
— prod application is the conductor's ship step.

## Pre-flight (preview wiring) — all green

- Supabase preview branch for PR #42: `04b2458b…` (ref `rfofqukjaeswvvedmcmz`),
  parent `uqgecljspgtevoylwkep`, `status=FUNCTIONS_DEPLOYED`, `preview_project_status=ACTIVE_HEALTHY`.
- F-INFRA-05 cred-sync workflow run on `989da40`: `sync` job PASS (37s) — branch creds
  synced to Vercel Preview scope.
- Vercel preview deployment `dpl_8rusEELEKXikYM1wpseKYUBWyB1r` READY, `target=null` (preview).

## Merge Sequence (conductor executes at /ship)

1. Apply the migration to production FIRST (additive — safe ahead of code):
   via Supabase MCP `apply_migration` (project ref `uqgecljspgtevoylwkep`).
2. Merge PR #42 → Vercel auto-deploys the code SECOND.
3. Post-deploy smoke: 3 `@critical` paths against the live production URL.
4. If smoke fails → `vercel rollback` (code) + revert the per-handler factory swap.
   (Data-loss path N/A — migration is additive; PITR is the net for unrelated incidents.)
5. Ship checklist: confirm PR #42 Supabase preview branch is GONE after merge
   (`npm run db:branches`) — it bills per hour.

## Verdict

✅ CLEARED FOR PRODUCTION

All required layers ran and passed (no `0/0` on any required row). No 🔴 blockers.
No real-code bug found — no FORGE eject required. Migration is additive (no PITR gate);
the conductor owns the Lock gate, the PITR safety-net confirmation, and the ship.
