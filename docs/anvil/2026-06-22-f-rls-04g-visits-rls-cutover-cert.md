# ANVIL Clearance Certificate

Date: 2026-06-22
App: MFS-Operations
Branch: f-rls-04g-visits-rls-cutover
PR: #67
Feature: F-RLS-04g — Visits RLS cutover (7th copy of the RLS-cutover pattern)

## Scope — what this certificate covers

| Change / path | Risk tier | Layers required | Layers run |
|---|---|---|---|
| supabase migration 20260622120000 (visit_notes RLS policies) | Critical (RLS) | pgTAP + Integration + E2E | pgTAP ✓ + Integration ✓ + E2E deferred-to-Ship |
| app/api/admin/visits, detail/visit, screen3/visit, screen3/visit/notes routes | High (auth-role cutover) | Unit + Integration + E2E | Unit ✓ + Integration ✓ + E2E deferred-to-Ship |
| lib/wiring/visits.ts (visitsServiceForCaller) | High (per-request auth client) | Unit + Integration | Unit ✓ + Integration ✓ |

Not run under the efficiency dial: none of the required automated layers skipped. E2E deferred to the
FORGE Ship pre-smoke (preview) — no visits-specific @critical spec exists (known gap F-TD-34); covered by
the existing @critical preview smoke against PR #67's Vercel preview.
Baseline characterisation pass? No — diff-driven.

## Test Results

| Layer | Status | Notes |
|---|---|---|
| Unit (Vitest) | ✅ 2128/2128 | 128 files; incl. visitsServiceForCaller (no-memoize R-CONC-1, single port), notes-route + visitsService fixtures |
| Integration (Vitest, local Supabase) | ✅ 351/351 | 24 files; visits.test.ts green: office→307 board, office→404 per-visit read, office POST note→404 (W1 fix), sales-sees-own, admin-sees-all, cross-rep isolation, byte-for-byte error bodies |
| Database (pgTAP) | ✅ 014: 17/17 (plan(17)) | own+admin allow, other-rep DENY, visit_notes parent-visit isolation, author-spoof DENY, empty-GUC fail-closed-by-throw (SQLSTATE 22P02 — asserted as intended, not "fixed" to expect empty); suite total 161 across 15 files |
| Edge Functions (Deno) | n/a | no edge functions touched |
| Local full-stack rung | ✅ | local Docker; db:reset applied migration 20260622120000 + seed |
| E2E (Playwright) | ⏸ deferred to Ship pre-smoke | no visits @critical spec (F-TD-34); @critical preview smoke runs at Ship against PR #67 preview |
| Populated UI smoke | ⏸ deferred to Ship pre-smoke (preview) | data-dependent visit views proven via preview smoke at Ship |

## Warnings (non-blocking)
- pgTAP suite-level `Result: FAIL` is caused solely by `supabase/tests/_helpers.sql` being globbed as a
  test file (0 tests, "No plan found"). Pre-existing, identical on main. The real signal is `014 = ok`.
  Not a blocker.

## Architecture / review follow-ups (from Guard, non-blocking)
- 🔵 visits + visit_notes policies are the only RLS in the repo not using the
  `nullif(current_setting('app.current_user_id', true), '')::uuid` empty-guard (deliberate — guardrail #5,
  dormant visits baseline untouched). Latent inconsistency; safe today. → BACKLOG.
- 🔵 route-level owner filtering kept alongside RLS (belt-and-braces) → BACKLOG F-RLS-04g-thin-route-filters.

## Migration
Additive (DROP POLICY IF EXISTS + CREATE POLICY only) — non-destructive. No DROP TABLE/COLUMN, no
TRUNCATE, no ALTER TYPE, no DROP NOT NULL, no data change. The `visits` baseline policies are
deliberately untouched (dormant; start firing under the authenticated role).
Rollback script: supabase/migrations/rollback/2026-06-22-f-rls-04g-visits-rls-cutover-rollback.sql
(drops the 4 new visit_notes policies; the real lever is the code revert to the singleton import).
PITR confirmed: N/A — additive migration, PITR not required.

## Merge Sequence (ship discipline — conductor + Hakan execute at Gate 4)
1. Apply migration 20260622120000 to PRODUCTION FIRST (Supabase MCP apply_migration), THEN merge PR #67.
   Flipping routes before the visit_notes policies exist = deny-all blanks all notes.
2. Merge PR #67 → Vercel auto-deploys.
3. Post-deploy smoke: @critical paths on the live prod URL. If red → vercel rollback (data untouched → no PITR).

⚠️ R-LAUNCH-1: after cutover the OFFICE visits board goes EMPTY by design (office owns no visits → no rows).
Expected behaviour, spec-locked — not a regression.

## Verdict
CLEARED — all ANVIL-owned automated layers GREEN (unit + integration + pgTAP), no real-code bugs, no FORGE
eject. E2E closes at the Ship pre-smoke against PR #67's preview. Cleared to proceed to the Ship gate.
