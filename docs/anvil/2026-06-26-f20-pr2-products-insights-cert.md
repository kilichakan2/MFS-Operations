# ANVIL Clearance Certificate

Date: 2026-06-26
App: MFS-Operations
Branch: feat/f20-pr2-products-insights
PR: (not yet opened — branch committed locally)

## Scope — what this certificate actually covers

A backend-only, no-UI, no-RLS, behaviour-preserving hexagonal re-point of five
admin API routes onto owned services over their ports. No migration, no schema,
no policy change.

| Change / path                          | Risk tier | Layers required                  | Layers run                          |
| -------------------------------------- | --------- | -------------------------------- | ----------------------------------- |
| GET /api/admin/products (re-point)     | Medium    | Unit + Integration (real DB)     | Unit ✓ + Integration ✓              |
| PATCH /api/admin/products/[id]         | Medium    | Unit + Integration (real DB)     | Unit ✓ + Integration ✓ (incl. 404)  |
| GET /api/admin/prospects (re-point)    | Medium    | Unit + Integration (real DB)     | Unit ✓ + Integration ✓ (R1 live)    |
| GET /api/admin/at-risk (re-point)      | Medium    | Unit + Integration (real DB)     | Unit ✓ + Integration ✓              |
| GET /api/admin/commitments (re-point)  | Medium    | Unit + Integration (real DB)     | Unit ✓ + Integration ✓              |
| ProductsRepository.listAll/setActive   | Medium    | Supabase adapter contract (real) | Integration ✓ (contract, real DB)   |
| VisitsRepository.listProspects/AtRisk/Commitments | Medium | Supabase adapter (real DB) | Integration ✓ (via the 5-route smoke)|

**Not run under the efficiency dial:** Browser E2E tap matrix — NOT run. Per the
approved scoped matrix this is a backend-only, no-UI re-point; the shared
`@critical` Playwright paths cover the rendered surface on the preview, and an
exhaustive every-button sweep is reserved for UI / multi-route auth-RLS cutovers
(per the ops note in MEMORY). DB/RLS/pgTAP — n/a, not required (no migration, no
schema, no policy change confirmed absent from the diff).
**Baseline characterisation pass?** No — this is a diff-driven pass on a fully
tested codebase.

🗣 In plain English: this stamp says we proved the five rewired endpoints behave
identically against the REAL database and the REAL routes, and we deliberately did
NOT run a full click-every-button browser sweep because nothing on screen changed —
only the plumbing behind it.

## Test Results

| Layer                       | Status            | Notes                                                                 |
| --------------------------- | ----------------- | --------------------------------------------------------------------- |
| Unit (Vitest)               | ✅ 2465/2465 passed | Full suite re-run; 159 files. Includes R1 null→null at fake + supabase-mapper + route levels, both route guards (products 403, insights 401), all wire shapes. |
| Integration (Vitest, real DB) | ✅ 14/14 passed  | ProductsRepository supabase contract (7) + new admin-products-insights live smoke (7). Real local Supabase + real booted routes. |
| Database (pgTAP)            | n/a — not required | No migration / schema / RLS / policy change in the diff (confirmed).  |
| Edge Functions (Deno)       | n/a — not required | No edge function touched.                                             |
| Local full-stack rung       | ✅ Supabase CLI adapter | `supabase start` → `db reset` (migrations + seed) → integration suite vs local containers → `supabase stop`. |
| E2E (Playwright)            | n/a (scoped)      | Folded into the integration live smoke (real routes via booted server). Shared `@critical` paths run on the preview by the conductor; no UI changed. |
| Populated UI smoke          | n/a — no UI change | No data-dependent view was modified by this PR.                       |
| Breadth crawl               | n/a — no UI change | Backend-only re-point; no route renders new/changed UI.              |

### Invariants proven (the WHY of this PR)

1. **Byte-identical wire shapes.** Exact key sets asserted on real adapter data:
   - `GET /api/admin/products` → BARE array of 7 keys (id, name, category, code,
     box_size, active, created_at); `box_size` wire key present, `boxSize` absent;
     name-ASC order preserved.
   - `PATCH /api/admin/products/[id]` → 5-key subset (id, name, category, active,
     created_at); NO code, NO box_size; active round-trips.
   - `prospects` / `at-risk` / `commitments` → `{ rows:[...] }` with exact
     camelCase key sets; enum prettify (`new_pitch`→`new pitch`) preserved.
2. **The ONE sanctioned behaviour change** — `PATCH /api/admin/products/<missing
   id>` → 404 `{ error: 'Product not found' }`, proven against the real adapter's
   `maybeSingle` null path (was a 500 pre-PR).
3. **Guards byte-identical** — products `x-mfs-user-role!=='admin'` → 403 'Admin
   only'; insights `x-mfs-user-id` absent → 401 'Unauthenticated'. Proven at the
   UNIT layer (handlers called directly, bypassing middleware). End-to-end, the
   `/api/admin` middleware prefix 307-redirects non-admin + unauthenticated callers
   BEFORE the handler — proven live in the integration smoke (307 on all 5 routes).
4. **R1 — null `pipeline_status` → `stage: null` (not 'Logged').**
   - The null→null half is UNIT-proven: `VisitsRepository.test.ts:660` feeds a
     literal `pipeline_status: null` row through the REAL `toProspectVisit` mapper
     and asserts the domain field stays null; `admin-insights.routes.test.ts:115`
     asserts the route emits `stage: null`.
   - It CANNOT be produced from a seeded integration row: `visits.pipeline_status`
     is `NOT NULL DEFAULT 'Logged'` (baseline migration line 1324) — the DB
     physically rejects a NULL. The integration smoke instead proves the OTHER half
     of the same live code path: a non-null `pipeline_status='In Talks'` round-trips
     to `stage:'In Talks'` (NOT swallowed), confirming the mapper/route path is live.
5. **No vendor SDK leak.** None of the 5 routes import `@/lib/adapters/**` or
   `@supabase/*` — they import only `@/lib/wiring/{products,visits}` and
   `@/lib/domain`. (The only string matches in the routes are JSDoc comments.)
   Lint pin (`no-adapter-imports` / `no-supabase-sdk`) is part of the green unit
   suite.

## Warnings (non-blocking)

None.

## Migration

None. No schema / RLS / policy change in the diff.
Rollback script: docs/anvil/2026-06-26-f20-pr2-products-insights-rollback.sql
(code-only revert — there is no DB rollback because there is no migration)
PITR confirmed: N/A (no destructive migration; no migration at all)

## Merge Sequence

No migration → no Supabase push step. Standing ops (per MEMORY): merge WHILE on
the feature branch so `anvil-migration-lock.sh` matches the cert's BARE Branch line.

1. ✅ All applicable layers passing (ANVIL certified)
2. (no `supabase db push` — no migration)
3. Merge PR → Vercel auto-deploys
4. Smoke test: 3 `@critical` Playwright paths against the production URL post-deploy
5. If smoke fails → `vercel rollback` (code only; no data to recover)

## Manual smoke at merge

**Not required for the re-pointed surface** — the five endpoints' behaviour is
proven byte-identical against the REAL local database and the REAL booted routes
(shapes, guards, the 404 change, and the live R1 stage round-trip). No UI changed,
so no populated-UI smoke or breadth crawl applies. The shared `@critical` preview
paths + the post-deploy production smoke (armed with a one-line Vercel rollback)
carry the real-environment confirmation.

🗣 In plain English: you can merge without hand-clicking these admin screens — we
proved the data coming out of all five rewired endpoints is identical to before
against a real database. The only thing left is the routine post-deploy smoke.

## Verdict

✅ CLEARED FOR PRODUCTION

## Addendum — 2026-06-26 (post-ship): `@critical` preview smoke retroactively run

At ship time the scripted `@critical` Playwright preview smoke did NOT run — it
failed closed on the missing `VERCEL_AUTOMATION_BYPASS_SECRET` and the conductor
substituted a curl reachability+guard smoke (the documented `--unprotected` fix
was not applied; logged as BACKLOG F-INFRA-06). To close that skipped gate, a
throwaway verification branch/PR (`verify/f20-pr2-smoke`, PR #82 — never merged,
identical to shipped `main` HEAD `1bb447d`) regenerated an isolated Vercel preview
+ Supabase preview branch (`nlmgcbgdbnxonspsyemz`), and the full suite was run with
`npm run test:e2e:preview -- <url> --unprotected`:

**@critical preview smoke: 75/75 PASSED (4.9m, 0 flaky, no F-TD-37 recurrence).**

The branch/PR/Supabase preview branch were torn down after. The post-ship gate is
now closed against the exact shipped code; production was never used as a test
target.
🗣 The browser gate we skipped at ship has now been run properly on a throwaway
copy of the exact shipped code — all 75 critical paths green. Nothing outstanding.
