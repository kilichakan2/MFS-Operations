# ANVIL Clearance Certificate

Date: 2026-07-02
App: MFS-Operations
Branch: feat/goods-in-ccp1-unit
PR: #112 (commits 1ac9ed8..6082204)

## Scope
| Change / path | Risk tier | Layers required | Layers run |
|---|---|---|---|
| /haccp/delivery "Goods In" rebuild + DB-driven CCP-1 thresholds (incl. poultry ≤4 / 4–5 amber / >5 FIX — was ≤8 pass, illegal) | Critical (HACCP path) | Full ladder + preview full E2E + browser-tap | All ran |
| Migration 20260702120000_haccp_goods_in_thresholds.sql (2 new tables, seed all 11 keys, admin-write RLS, immutable audit) | High | pgTAP + integration + idempotence | 276/276 + reset ×2 |
| components/ui/NumberPad both-flags sign-toggle row (Guard 🟡1 fix; disclosed side effect: process-room pad gains the row, healing its own latent minus-drop) | Medium | Unit + E2E + tap (3 screens) | All ran |
| Admin thresholds Goods In section + goods-in-thresholds route | High | Integration + E2E + DB audit proof | All ran |
| DOCUMENT_CONTROL §4 correction + 2 written justifications (red meat >8 vs Reg 853 7°C; poultry 1°C grace band) | Docs | Guard review + render check | Done (Guard 🟡2 fixed) |

Not run under the efficiency dial: None — full ladder, high-risk double-run on preview.
Baseline characterisation pass? No.

## Test Results
| Layer | Status | Notes |
|---|---|---|
| Unit + component (Vitest) | PASS 3266/3266 (242 files) | fence-posts both sides of every band boundary; token-purity (SCREENS + /haccp/delivery); contrast pins; NumberPad both-flags |
| Integration (Vitest, real local DB) | PASS 561/561 (45 files) | db:reset-first wedge rule observed; goods-in thresholds suite incl. 403 denials + audit old→new |
| Database (pgTAP) | PASS 276/276 | incl. 019 RLS denial (42501) + audit immutability (even to admins); _helpers.sql no-plan wart only; 019 assertion made dirty-DB-proof in-loop (test fix, not code) |
| Migration idempotence | PASS | db:reset ×2 clean; additive only (CREATE TABLE ×2 + seed + RLS + grants) |
| E2E local (@critical chromium) | PASS 100 | specs 05/06 = F-TD-41 prod-build gate auto-skip (expected) |
| E2E preview (full @critical) | PASS 100 | Vercel preview + Supabase branch joadvxifyqafvgauhkad; readiness gate /api/auth/team 200 first; 2 pre-agreed signatures WITH evidence: 25-haccp-reviews weekly = F-INFRA-08, SQL-proven slot consumed (week_ending 2026-07-05, 11:26 UTC, E2E payload); 04-kds-line-undo retry-flake (known) |
| Browser-tap walk (preview) | PASS | 39 shots (manifest in session scratchpad anvil-goods-in/); admin edit→audit→restore SQL-proven on preview DB (paired 5.0→5.5/5.5→5.0 rows, final = seed 5.0) |
| Visual law | PASS | green/amber caged to verdict tiles/badges (computed-style, local + preview); bold-navy ScreenHeader; Quick-ref amber explainer boxes + CCA urgent header = recorded EXCEPTION (spec §1, Hakan 2026-07-02) |

## Iterate log
2 loops, both fixes were TESTS (zero product-code bugs, no FORGE eject): pgTAP 019 LIMIT-1-no-ORDER-BY read made fixture-scoped; spec 12 t8 post-save wait gated + self-healing dirty-start restore. Loop 2 was the tap harness only (archived beside the shots, removed from repo).

## Warnings (non-blocking)
- 04-kds-line-undo flaky on preview (passed on retry) — pre-existing, tracked.
- Process-room/cold-storage pad screenshots taken on the local stack (shared preview DB sessions consumed — F-INFRA-07); pad flags are component-level, environment-independent.
- Test-hardening commit 6082204 pushed post-ANVIL (app-code-inert: rollback script + 2 test files — diff-verified); CI smoke on the final head is the pre-ship smoke.

## Migration
Additive. Rollback script: docs/anvil/2026-07-02-goods-in-ccp1-unit-rollback.sql
(primary path: revert merge — no data loss; old code never reads the new tables). PITR confirmed: N/A (no destructive ops).

## Merge Sequence
1. supabase db push --project-ref uqgecljspgtevoylwkep (migration FIRST)
2. Merge PR #112 → Vercel auto-deploys
3. Post-deploy smoke: @critical paths vs production URL; rollback = vercel rollback + revert merge

## Verdict
CLEARED FOR PRODUCTION
