# ANVIL Clearance Certificate

Date: 2026-06-16
App: MFS-Operations
Branch: feat/f-td-22-unique-usernames
PR: #46 — https://github.com/kilichakan2/MFS-Operations/pull/46
Unit: F-TD-22 — prevent duplicate usernames
Commit verified: `d7e1a64`

## What this change does

A `CREATE UNIQUE INDEX ... ON public.users (lower(name))` migration prevents two
case-insensitively-identical usernames from coexisting (all rows — active AND inactive).
Both adapters' `createUser` trim the name on write; the Supabase adapter maps Postgres
error `23505` (unique-violation) to the app-owned `ConflictError` inside the adapter
boundary, and `POST /api/admin/users` returns HTTP **409** "A user with that name already
exists." Login is unchanged.

**🗣 In plain English:** the database now physically refuses to store a second "hakan"
(any casing) — and when someone tries via the admin screen, they get a friendly "name
already taken" message, not a raw database crash.

## Scope — what this certificate actually covers

| Change / path                                          | Risk tier | Layers required          | Layers run                          |
| ------------------------------------------------------ | --------- | ------------------------ | ----------------------------------- |
| `supabase/migrations/20260616120000_unique_username_lower_index.sql` | High (migration) | pgTAP + Integration + migration apply | migration apply ✓ + Integration ✓ + pgTAP regression ✓ |
| `lib/adapters/supabase/UsersRepository.ts` (23505 → ConflictError) | High | Integration (live DB)    | Integration ✓ (live adapter contract) |
| `lib/adapters/fake/UsersRepository.ts` (in-memory dup reject) | Low–Med  | Unit                     | Unit ✓ (Fake contract)              |
| `lib/ports/__contracts__/UsersRepository.contract.ts` (shared dup case) | — (seam) | Architecture rung — domain-only fake | ✓ runs on Fake (no vendor import) + on Supabase adapter |
| `app/api/admin/users/route.ts` (409 mapping)           | Medium    | Integration              | Integration ✓ (route 409 case)      |
| `tests/integration/admin-users.test.ts` (409 test)     | — (test)  | —                        | runs in Integration ✓               |

**Not run under the efficiency dial:** Vercel preview + Supabase preview-branch E2E
double-run is a Ship-phase step the conductor runs (preview smoke before promote); it is
listed in the merge sequence below, not executed by the runner. Local E2E `@critical`
(api + ui) was run as order-pipeline regression. Full local ladder otherwise run.
**Baseline characterisation pass?** No — diff-driven, full required coverage for this unit.

## Architecture rung (seam crossed)

The diff touches `lib/adapters/**` and `lib/ports/__contracts__/**`. The shared
`UsersRepository` contract case for duplicate rejection runs against the **in-memory Fake**
(unit tier, no vendor SDK import) AND the real Supabase adapter (integration tier). No
`@supabase/*` import appears in any domain/port test. Seam is honest — ✓, not a blocker.

**🗣 In plain English:** the "no duplicate names" rule is proven both on a pretend in-memory
stand-in and on the real database, and the core logic test doesn't secretly reach for the
Supabase SDK — so the swappable-socket design holds.

## Test Results

| Layer                  | Status            | Notes                                                             |
| ---------------------- | ----------------- | ----------------------------------------------------------------- |
| Unit (Vitest)          | ✅ 1722/1722 passed | incl. Fake adapter dup-rejection contract case                    |
| Migration apply        | ✅ pass            | `db:reset` — new index built cleanly + `seed.sql` loaded, **no 23505** (seed names collision-free) |
| Integration (Vitest)   | ✅ 175/175 passed  | incl. **live Supabase `createUser` rejects case-insensitive dup → ConflictError** AND **`POST /api/admin/users` dup → 409 exact body** |
| Database (pgTAP)        | ✅ 66/66 passed    | regression only — no RLS/schema policy changed by this unit (additive index). All 6 test files `ok`. ¹ |
| E2E (Playwright)        | ✅ api 3/3 · ui 1/1 | order-pipeline regression — this change does not touch it          |

¹ `supabase test db` prints a cosmetic `Result: FAIL` because the shared `_helpers.sql`
include carries no `plan()` ("No plan found in TAP output"). All 66 real tests across the
6 numbered files report `ok`; total matches the F-13 PR2/PR3 known-good baseline of 66/66.

## Warnings (non-blocking)

None.

## Migration

**Additive / non-destructive** — `CREATE UNIQUE INDEX` only. No DROP / TRUNCATE /
ALTER TYPE / DROP NOT NULL.
Rollback script: `docs/anvil/2026-06-16-f-td-22-unique-usernames-rollback.sql`
(`DROP INDEX IF EXISTS public.users_lower_name_unique_idx;`)
**PITR confirmed: N/A — no data destroyed; no PITR gate required for this unit.**

### ⚠️ Ship precondition — VERIFY-FIRST prod dedup (must run before the prod migration)

The unique index will **refuse to build on production if any existing prod row pair
collides on `lower(trim(name))`**. Before `supabase db push` to prod, the conductor MUST
run this READ-ONLY check against production and confirm it returns **zero rows**:

```sql
SELECT lower(trim(name)) AS key, count(*), array_agg(id) AS ids
FROM public.users
GROUP BY lower(trim(name))
HAVING count(*) > 1;
```

If any rows return → STOP, dedup by hand first (per F-TD-22 plan §9), re-verify, then push.

> **Supabase MCP token is currently expired and must be re-authorised** before the
> conductor can run this verify-first query and the prod migration via MCP. The runner did
> **not** touch any remote/prod database — local only, per the ANVIL hard rules.

**🗣 In plain English:** the new rule can only be switched on if prod has no two users
already sharing a name. We must look (read-only) first and clean any clash by hand before
flipping the switch — and the Supabase login that lets us do that has expired, so it needs
re-authorising before Ship.

## Merge Sequence (migration-first — enforced)

1. Re-authorise Supabase MCP, then run the verify-first dedup query above against prod →
   must be **0 rows**.
2. Apply the migration to production FIRST:
   `supabase db push --project-ref uqgecljspgtevoylwkep`
3. Merge PR #46 → Vercel auto-deploys the code SECOND.
4. Pre-ship / post-deploy smoke: `@critical` paths on the preview, then on live prod.
5. If smoke fails → `vercel rollback` (code) + `DROP INDEX` rollback script if the index
   needs reverting (no PITR — non-destructive).

## Verdict

✅ **CLEARED FOR PRODUCTION**

All five required layers ran and passed, including the two live-DB proofs (real adapter
ConflictError + route 409) that code-critic's static review could not execute. Migration is
additive/non-destructive — no PITR gate. One hard ship precondition: the verify-first prod
dedup query must return zero rows before the prod migration (Supabase MCP re-auth required).

— SHIPPED: 2026-06-16 by FORGE conductor.

## Ship record (post-ship)

- **Verify-first prod dedup (read-only):** 0 collisions — 11 users, 11 distinct
  `lower(trim(name))`. Safe to build the unique index.
- **Prod migration applied FIRST** via Supabase MCP `apply_migration`
  (`20260616120000_unique_username_lower_index`) → index confirmed live:
  `CREATE UNIQUE INDEX users_lower_name_unique_idx ON public.users USING btree (lower(name))`.
- **PR #46 squash-merged** to `main` → `1f46857`. Vercel prod deploy
  `dpl_DySmmJnB179wBZpuFt7NhnLTU4xe` READY from `1f46857`.
- **Pre-ship preview smoke:** 8/8 @critical green on `d7e1a64` build
  (DB-identity probe confirmed a seed-born preview DB, not prod).
- **Post-deploy prod smoke:** 5/5 non-500 — `/` 307, `/api/reference` 307,
  `/api/admin/users` (no auth) 307 fail-closed, `/api/auth/login` malformed 400
  (route alive), `/login` 200. No server errors.
- **No PITR** (non-destructive additive index). Rollback if ever needed:
  `DROP INDEX IF EXISTS public.users_lower_name_unique_idx;`
- **code-critic nit folded in pre-ship** (`d7e1a64`): dropped the redundant
  duck-typed `httpStatus === 409` fallback; 409 now gated by `instanceof ConflictError` alone.
