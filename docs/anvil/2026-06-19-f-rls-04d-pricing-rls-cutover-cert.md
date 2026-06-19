# ANVIL Clearance Certificate

Date: 2026-06-19
App: MFS-Operations
Branch: feat/f-rls-04d-pricing-rls-cutover
PR: #58
Status: CLEARED FOR PRODUCTION

## Scope — what this certificate covers

F-RLS-04d — Pricing-context RLS cutover. Flips the pricing API routes from the service-role
(master-key) Supabase client to a per-request **authenticated** (logged-in-user) client so
Postgres RLS enforces access. Byte-identical mirror of shipped F-RLS-04c (Routes cutover).

| Change / path | Risk tier | Layers required | Layers run |
|---|---|---|---|
| Pricing routes service-role → per-request authenticated client (app/api/pricing/**, 10 handlers) | Critical (RLS cutover) | Unit + Integration + pgTAP + E2E | Unit ✓ Integration ✓ pgTAP ✓ E2E(local + preview) ✓ |
| Migration 20260619120000_pricing_authenticated_rls_policies.sql (8 CRUD policies, both pricing tables) | Critical (RLS) | pgTAP + Integration | ✓ |
| lib/wiring/pricing.ts pricingServiceForCaller (per-request wiring, no memoization) | High | Unit | ✓ 3/3 |
| app/api/pricing/[id]/lines/replace/route.ts kept on service-role (RPC authenticated-revoked) | — (no change) | Integration | ✓ (replace = 200) |

**Baseline characterisation pass?** No — diff-driven, byte-identical mirror of shipped F-RLS-04c.

## Test Results

| Layer | Status | Notes |
|---|---|---|
| Unit (Vitest) | ✅ 1928/1928 | incl. pricingServiceForCaller 3/3 (no-memoization + per-caller token isolation) |
| Integration (Vitest) | ✅ 23/23 | authenticated CRUD flow, sales-own RBAC still 403s a peer, rep_name non-blank for non-admin, replace route 200 |
| Database (pgTAP) | ✅ 12/12 | valid-user CRUD both tables, lines UPDATE divergence (R-BIZ-1), empty-GUC fail-closed (SELECT clean zero-rows no 22P02; INSERT 42501 deny), service-role bypass; 8 policies present |
| Edge Functions (Deno) | n/a — not required | no edge function touched |
| E2E local (Playwright) | ✅ 2/2 | pricing UI create→lines→detail→PDF (both render branches) |
| E2E preview @critical | ✅ 12/12 (1 conditional skip) | on PR #58 preview dpl_8N7zCAVsz1sjy1zGXmhLwTTpSUCe; DB identity probe 4/4 (seed-born preview DB) |
| E2E preview pricing (deep verify) | ✅ 2/2 | 07-pricing-export-pdf against the live preview — create→add-lines→detail→export through the flipped handlers under the authenticated client; proves non-blank authenticated reads on the real Vercel + Supabase-preview deploy |

## Guard (code-critic) verdict
CLEAR — no blockers, no warnings. Depth: pricingServiceForCaller = DEEP (not a pass-through).
Hexagonal: PASS (no new port/adapter/dependency; vendor SDK confined to lib/adapters/supabase/;
auth/vendor wiring confined to lib/wiring/pricing.ts). Full review:
docs/reviews/2026-06-19-f-rls-04d-pricing-rls-cutover-review.md

## Warnings (non-blocking)
- pgTAP single-file invocation fails on the `\ir _helpers.sql` relative include (CWD artifact);
  run via directory invocation `supabase test db --local supabase/tests/`. Pre-existing repo-wide.
- The preview @critical set does not exercise pricing (preview seed has no pricing fixtures —
  F-TD-25); closed by the dedicated preview pricing deep verify above.

## Migration
Additive / NON-DESTRUCTIVE (CREATE POLICY only — the DROP POLICY IF EXISTS lines are idempotent
guards that immediately re-create). No DROP TABLE/COLUMN, TRUNCATE, ALTER TYPE, or DROP NOT NULL.
Rollback script: docs/anvil/2026-06-19-f-rls-04d-pricing-rls-cutover-rollback.sql
PITR confirmed: N/A (non-destructive — no PITR gate fires)

## Merge Sequence
1. supabase db push --project-ref uqgecljspgtevoylwkep   (8 additive policies — safe before code)
2. Merge PR #58 → Vercel auto-deploys
3. Post-deploy smoke (PRODUCTION): pricing + app @critical paths on www.mfsops.com
   → if it fails: vercel rollback (no PITR needed — non-destructive migration)

## Verdict
CLEARED FOR PRODUCTION — all required layers green, including the pgTAP RLS suite and a deep
pricing verify on the real preview deploy. Migration non-destructive (no PITR). Apply migration
to prod FIRST, then merge.
