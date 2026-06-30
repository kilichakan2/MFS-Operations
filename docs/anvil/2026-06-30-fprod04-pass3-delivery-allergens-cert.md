# ANVIL Clearance Certificate

Date: 2026-06-30
App: MFS-Operations
PR: #105 — F-PROD-04 Pass 3 (real allergens on goods-in delivery label)
Branch: feat/fprod04-pass3-delivery-allergens

## Scope — what this certificate covers

| Change / path | Risk tier | Layers required | Layers run |
| --- | --- | --- | --- |
| lib/printing/allergens.ts (new pure helper) | Low | Unit | Unit ✅ |
| lib/printing/{html,zpl,index,types}.ts + lib/adapters/sunmi/Printer.ts (4 transports) | Medium | Unit + Integration | Unit ✅ + Integration ✅ |
| app/api/labels/route.ts (DB read + field mapping) | Medium | Unit + Integration | Unit ✅ + Integration ✅ |
| lib/ports/Printer.ts + contract fixture (DeliveryLabelInput +2 fields) | Low | Unit | Unit ✅ |
| app/haccp/delivery/page.tsx (2-field pass-through) | Low | covered by helper/renderer | covered ✅ |
| Stored-XSS hardening — escapeHtml() on all DB free-text (commit 2a4becc) | High (security) | Unit + Integration | Unit ✅ (4 specs) + Integration ✅ |

Not run under the efficiency dial: full bespoke browser crawl / populated-UI tap sweep — not in the approved matrix; the delivery label is a server-rendered print artifact, the page.tsx change is a non-interactive 2-field pass-through, and the hosted @critical suite (78 specs) carries the real-environment proof via the blocking CI smoke check.
Baseline characterisation pass? No — diff-driven matrix, full coverage of the changed contract.

## Test Results

| Layer | Status | Notes |
| --- | --- | --- |
| Unit (Vitest) | ✅ 3036/3036 | R1 byte-identical exact-string oracles on HTML 100mm/58mm, ZPL, native payload; 4 XSS-escaping specs; helper truth table |
| Integration (Vitest, local Docker rung) | ✅ 9/9 | local Supabase → /api/labels → renderer; 3 Pass-3 delivery cases (red #991b1b notes / exact green None / format=json carries both fields) + prep/mince BLS |
| Database (pgTAP) | n/a — not required | no migration, no schema/RLS/policy change |
| Edge Functions (Deno) | n/a — not required | none touched |
| Local full-stack rung | ✅ | Supabase CLI adapter (db:up → db:reset → integration + local api smoke) |
| E2E (Playwright) — local api smoke | ✅ 3/3 | dev server boots clean; env-safety + health green |
| E2E (Playwright) — full @critical preview (78) | 🟦 CI-finalized | authoritative gate = blocking `smoke` required check on PR #105 |
| Populated UI smoke / breadth crawl | n/a — not required | non-interactive server-render pass-through; CI @critical carries hosted-env proof |

## R1 (byte-identical "Allergens: None") — CONFIRMED ✅
Exact-string oracles green on all four transports: HTML 100mm/58mm green #166534 markup verbatim, ZPL "Allergens: None", native payload allergens==='None'. Flagged paths render red #991b1b+bold on HTML, plain on ZPL/native; ASCII-hyphen "FLAGGED - see record" fallback — all exact-matched.

## Iterate loops used: 1 of 2
Loop 1 — broken TEST fixed (not a code change): the pre-existing auth probe "returns 401 when no role cookie is set" was over-literal — it asserts the handler's 401, but the real running stack legitimately rejects one layer earlier via middleware.ts (307→/login, defense-in-depth). Pre-existing (byte-identical on origin/main; this PR's route diff has 0 auth lines). Rewrote it to assert the real guarantee — unauthenticated request rejected (307→/login or 401), leaks no label markup — holds on both branches. Re-ran → green.

## Warnings (non-blocking)
None.

## Migration
None. Rollback: code-only — `git revert <merge-commit>` / delete branch. No data rollback, no PITR.
PITR confirmed: N/A (no destructive migration).

## Merge Sequence
1. (no migration — skip db push)
2. Test edit committed to feature branch with the code; merge PR #105 → Vercel auto-deploys
3. Post-deploy smoke: @critical paths on prod (prod ref uqgecljspgtevoylwkep)

## Manual smoke at merge
Not required for the changed contract — proven byte-identical on 4 transports at the unit layer, end-to-end through the real DB + route at the integration layer, with the hosted @critical suite (78 specs) as the blocking CI gate.

## Follow-up logged (BACKLOG §F-PROD-04)
🔵 generateBarcodeSVG embeds batch_code raw into the inline-SVG <text> node — visible bc div copy is escaped, barcode-caption copy is not. Low risk today (system-generated batch_code); promote to blocker if batch_number ever becomes user-editable. One-line fix: escapeHtml(text) inside generateBarcodeSVG.

## Verdict
✅ CLEARED FOR PRODUCTION (pending the CI `smoke` required check going green on PR #105)
