# ANVIL Clearance Certificate

Date: 2026-06-26
App: MFS-Operations
Branch: feat/f20-pr3-import-map
PR: #83 — https://github.com/kilichakan2/MFS-Operations/pull/83
Head: 646c023ff5fa5117f3caf91dff5f8ef841c7400b

## Scope — what this certificate actually covers

Behaviour-preserving hexagonal re-point of 3 admin/map API routes off the raw
Supabase adapter onto owned ports/services. Backend-only: NO UI change, NO schema
migration, NO RLS change, NO new dependencies.

| Change / path                                | Risk tier | Layers required                  | Layers run                              |
| -------------------------------------------- | --------- | -------------------------------- | --------------------------------------- |
| `app/api/admin/import/manual/route.ts`       | Medium    | Unit + Integration + @critical   | Unit ✓ · Integration ✓ · @critical ✓    |
| `app/api/admin/import/confirm/route.ts`      | Medium    | Unit + Integration + @critical   | Unit ✓ · Integration ✓ · @critical ✓    |
| `app/api/map/data/route.ts`                  | Medium    | Unit + Integration + @critical   | Unit ✓ · Integration ✓ · @critical ✓    |
| New seams: AuditLogRepository (port+supabase+fake+contract+wiring), MapDataService+wiring, InsertOneResult; extended Customers/Products/Visits repos + Customers/Products services | Medium (crosses a seam) | Architecture rung (domain-only fakes; no vendor in domain/ports) | ✓ — static check + contract/fake unit tests green |

**Not run under the efficiency dial:** Full E2E suite re-run on preview was NOT run
(only the `@critical` 75-spec smoke) — correct for a Medium-tier, no-UI/no-RLS/no-auth
re-point; the local rung proved correctness and the critical smoke proved the real
hosted environment. No Docker UI breadth-crawl: this is a backend-only re-point with no
new rendered surface (no UI files in the diff); the @critical preview smoke covers the
admin/map flows that consume these routes.
**Baseline characterisation pass?** No — diff-driven matrix, full required coverage.

## Test Results

| Layer                       | Status          | Notes                                                                 |
| --------------------------- | --------------- | --------------------------------------------------------------------- |
| Unit (Vitest)               | ✅ 2513/2513    | 165 files; incl. lint pin `no-adapter-imports`, R-AUDIT route case, new MapDataService/ProductsService/AuditLog fake tests |
| Typecheck (tsc --noEmit)    | ✅ clean        | exit 0                                                                |
| Lint (eslint, changed files)| ✅ clean        | all 27 changed TS files; adapter-boundary pin satisfied               |
| Integration (Vitest, live local Supabase) | ✅ 489/489 | 33 files; DB-identity sentinel probe passed; +25 new PR3 adapter contract tests (auditLog 2 + customers 13 + products 10) against real Postgres |
| Database (pgTAP)            | n/a — not required | No schema migration / RLS change in diff                           |
| Edge Functions (Deno)       | n/a — not required | No `supabase/functions/` change in diff                            |
| Local full-stack rung       | ✅ Supabase CLI adapter | `npm run db:up` → `db:reset` (seed) → integration → `db:down`  |
| E2E @critical (Playwright)  | ✅ 75/75 passed | PR #83 Vercel preview, first run, no flake/retry (4.8m)               |
| Architecture rung           | ✅              | No vendor SDK imported under `lib/domain/**` or `lib/ports/**`; touched ports have fake-adapter + contract tests running on in-memory fakes |
| Populated UI smoke          | n/a — no UI change | No rendered surface added; admin/map flows exercised via @critical |
| Breadth crawl               | n/a — no UI change | Backend-only re-point                                              |

### Gate-1-approved deviations (NOT regressions — confirmed intact by smoke)
- `map/data` read failure now → **500** (was silent-empty-at-200). Intentional.
- `import/confirm` 500 body is generic `'Server error'`. Intentional.
- All guards (401 on missing `x-mfs-user-id`), response shapes, and the import/confirm
  fire-and-forget geocode + audit + 5s road-time trigger confirmed unchanged.

## Real-code bugs found

None. Every layer passed; no test was modified to make it pass. No FORGE eject required.

## Warnings (non-blocking)

None. The 75-spec @critical smoke passed on the first run with no flake — F-TD-37
recovery (reset_branch + single re-run) was NOT needed.

## Migration

**None** — CODE-ONLY PR, no schema migration, no RLS change.
Rollback: revert the merge (`git revert` / Vercel rollback to the prior production
deployment). No `supabase db push` step. No PITR needed (no destructive DB operation,
no data migration).
PITR confirmed: N/A — no destructive migration.

## Merge Sequence

1. (No migration step — skip `supabase db push`.)
2. Merge PR #83 → Vercel auto-deploys.
3. Post-deploy smoke: 3 `@critical` paths against production URL.
4. If smoke fails → `vercel rollback` (code-only; no PITR needed).

## Manual smoke at merge

**Not required.** Critical admin-import + map flows proven on the real Vercel+Supabase
preview (75/75 @critical, first run); behaviour-preserving backend re-point with no new
rendered surface; post-deploy smoke armed with code-only `vercel rollback`. No UI breadth
gap to flag (no UI in diff).

## Verdict

✅ CLEARED FOR PRODUCTION
