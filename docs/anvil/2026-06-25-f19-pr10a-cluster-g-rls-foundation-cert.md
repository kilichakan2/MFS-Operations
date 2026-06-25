# ANVIL Clearance Certificate

Date: 2026-06-25
App: MFS-Operations
Branch: feat/f19-pr10a-cluster-g-rls-foundation
PR: #78 — F-19 Cluster G / F-RLS-04h PR10a (HACCP RLS foundation, introduce-only & INERT)

> STATUS: CLEARED — conductor finalised at the Lock gate (2026-06-25). PITR check: N/A
> (additive migration, no destructive verb). Pre-ship smoke satisfied by the E2E @critical
> 73/73 run on preview `mfs-operations-nqv0fuvia` (commit bdd4806) recorded below. Guard
> (code-critic) verdict CLEAR — review at `docs/reviews/2026-06-25-f19-pr10a-cluster-g-rls-foundation-review.md`.

## What this PR is (inert-ness statement)

Introduce-only and INERT in production. It adds:
- an ADDITIVE RLS migration `supabase/migrations/20260625120000_haccp_authenticated_rls_policies.sql`
  — a new `public.current_user_is_active()` SECURITY DEFINER helper + the full
  4-command policy family (SELECT/INSERT/UPDATE/DELETE) on all 30 `haccp_*` tables
  (120 policies), predicate = active-user-only; and
- 12 INERT `…ForCaller` factories in `lib/wiring/haccp.ts` that have NO caller yet.

NO route under `app/api/haccp/**` is touched. The live HACCP routes still use the
service-role master-key singletons, and service-role BYPASSES RLS (tables are ENABLE,
never FORCE). So these policies are NEVER evaluated on any live request until PR10b flips
routes onto the `…ForCaller` authenticated clients. ZERO production behaviour change.

**🗣 In plain English:** this PR installs the locks on all 30 HACCP filing cabinets and
hands out keys, but no door is wired to use them yet — today's traffic still goes through
the master key that ignores the locks. Nothing a user does changes until the next PR.

## Scope — what this certificate covers

| Change / path                                         | Risk tier | Layers required                  | Layers run                                  |
| ----------------------------------------------------- | --------- | -------------------------------- | ------------------------------------------- |
| Migration: 30-table HACCP RLS policy family + helper  | Critical  | pgTAP + completeness + regression| pgTAP 55/55 · completeness 30/30 · all run  |
| `lib/wiring/haccp.ts` inert `…ForCaller` factories     | Low (inert)| Unit                             | Unit 2351/2351                              |
| Regression (no route touched)                          | —         | Unit + Integration + E2E @critical| all run, all green                          |

**Not run under the efficiency dial:** None deliberately skipped. Full ladder run except
the breadth crawl + populated-UI smoke, which are N/A here — no UI/route changed (the
`@critical` E2E suite already exercises the HACCP screens as regression on the real preview).
**Baseline characterisation pass?** No — diff-driven.

## Test Results

| Layer                  | Status            | Notes                                                                 |
| ---------------------- | ----------------- | --------------------------------------------------------------------- |
| Unit (Vitest)          | ✅ 2351/2351 (147) | re-confirmed green; matches implementer + code-critic                 |
| Typecheck (tsc --noEmit)| ✅ clean           | ran live in sandbox                                                   |
| Database (pgTAP)       | ✅ 55/55           | `015-rls-haccp.test.sql` — 20 active-CRUD · 10 empty-GUC · 10 non-existent · 10 inactive · 5 master-key-bypass. 42501 (deny) discriminated from 22P02 (cast) on writes — fail-CLOSED confirmed. Sanctioned runner `supabase test db` marked file `ok` (pg_prove → emitted == planned(55), 0 fail). |
| Completeness assertion | ✅ 30/30 tables     | live-DB query: exactly 30 `haccp_*` tables carry SELECT+INSERT+UPDATE+DELETE under `current_user_is_active()`, AND zero `haccp_*` base tables missing the family. No silently-missed table. |
| Integration (Vitest)   | ✅ 464/464 (31)    | against local Supabase with the migration applied; regression byte-identical (RLS dormant under service-role) |
| Local full-stack rung  | ✅                | Supabase CLI adapter (`db:up` → `db:reset` → suite → `db:down`)       |
| E2E (Playwright @critical)| ✅ 73/73 (4.7m) | against PR preview `mfs-operations-nqv0fuvia` (commit bdd4806); no F-TD-37 flake — clean first run |
| Populated UI smoke     | n/a — not required | no UI/route changed; HACCP screens covered by the @critical regression |
| Breadth crawl          | n/a — not required | no UI/route changed                                                   |

## Architecture rung

The diff touches `lib/wiring/haccp.ts` (composition root — the one place allowed to import
adapters) but adds INERT factories only; no port/service/domain contract changed and no
vendor SDK leaked into domain/ports. Wiring-test pins (`tests/unit/wiring/*`) green within
the 2351 unit pass. No seam crossing requiring a new domain-only fake-adapter suite.

## Warnings (non-blocking)

- 🟡 `supabase test db` reports an overall "Result: FAIL" / "No plan found" ONLY because the
  runner globs the include-only `_helpers.sql` (no `plan()`). Harness artifact, NOT a test
  failure — all 15 real `.test.sql` files (incl. 015 + completeness) reported `ok`.
- 🔵 Matrix note said integration ~163; suite has since grown to 464 — all green.

## Real-code bugs / eject findings

None. Migration enumerates all 30 tables correctly; pgTAP grant/deny matrix + completeness
both pass against a real Postgres; helper fails closed on empty/absent GUC.

## Migration

Additive (CREATE FUNCTION + CREATE POLICY + GRANT only — no DROP/TRUNCATE/ALTER TYPE/DROP
NOT NULL). NON-DESTRUCTIVE → **no PITR gate fires.**
Rollback script: `supabase/migrations/rollback/2026-06-25-f-rls-04h-haccp-rls-foundation-rollback.sql`
(drops the 120 policies + the helper; verified to mirror the migration; safe/inert because
service-role bypasses RLS). PITR confirmed: N/A (additive).

## Merge Sequence (conductor executes at /ship)

1. Apply migration to PROD FIRST (prod-ref `uqgecljspgtevoylwkep`) — safe pre-merge because
   policies are dormant under service-role (the 04a–04g prod-first ordering).
2. Merge PR #78 → Vercel auto-deploys.
3. Post-deploy smoke: @critical paths against prod URL.

## Manual smoke at merge

**Not required** — critical flows proven on the real preview environment (73/73), the
security foundation proven on a real Postgres (pgTAP 55/55 + completeness 30/30), and the
change is inert in production (no live path evaluates the new policies). No UI/route changed,
so breadth crawl + populated-UI smoke are N/A.

## Verdict

✅ CLEARED FOR PRODUCTION — conductor confirmed at Lock (2026-06-25). All five rungs green
on the first loop, no eject, no PITR gate (additive). Cleared to ship via the prod-first
merge sequence below.
