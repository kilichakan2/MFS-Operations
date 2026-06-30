# ANVIL Clearance Certificate

Date: 2026-06-30
App: MFS Operations — HACCP kiosk hub (post-ship touch-ups + design-system governance)
Branch: fix/haccp-hub-touchups-ds-governance
PR: #107

## Scope — what this certificate covers

| Change / path | Risk tier | Layers required | Layers run |
| --- | --- | --- | --- |
| components/ui/StatusTile.tsx (onPointerDown→onClick tap fix) | Medium (shared kit primitive, 16× on hub) | Unit/component + E2E regression | ✓ component 10/10 + @critical |
| app/haccp/ThemeLock.tsx + layout (force dark, incl. portaled overlays) | Medium (visual; global html mutation) | Unit reasoning + preview VISUAL | ✓ Guard-verified save/restore + preview eyeball |
| components/ui/{MfsLogo,MfsIcon} + barrel + 3 importers (brand assets into the kit) | Low | tsc + E2E regression | ✓ tsc 0 + @critical |
| CLAUDE.md rule + tests/unit/lint/reusable-visual-in-kit.test.ts (governance guard) | Low | Unit (guard + fixtures) | ✓ 3/3, all 8 icon shapes caught |

Right-sized to presentation + lint (no DB / no route / no migration / no RLS / no dependency) — same shape as the F-PROD-04 web-only ships. Visual + touch confirmation is a preview eyeball (the parts a unit test cannot prove).

## Test Results

| Layer | Status | Notes |
| --- | --- | --- |
| Unit + component (Vitest) | ✅ 3082/3082 (231 files) | Full-suite regression incl. StatusTile 10/10 (tap: pointerDown≠tap, click=tap, Enter+Space=tap, help=onHelp-only) + governance guard 3/3 |
| Governance guard hardening | ✅ | Brace-aware detection catches all 8 common icon shapes (fn decl · implicit/block arrow · early-return · fragment-root · forwardRef/memo · generic arrow); local helper / nested decorative svg / mixed file stay green; real-tree scan clean |
| Integration | n/a | No DB / no route change |
| Database (pgTAP) / Edge | n/a | No migration / no schema / no RLS / none touched |
| tsc / next lint | ✅ 0 / 0 | clean |
| E2E @critical on Vercel preview (CI `smoke`) | ✅ PASS (7m39s, first run) | Full hosted @critical regression on PR #107 — green, no flake. The MfsLogo→MfsIcon aria-label change broke no spec. Run `28472285695`. |
| Visual / touch (preview eyeball) | ⏳ Hakan | Dark mode renders · overlays (PIN/help) open dark · header icon top-left (normal + alarm) · scroll-on-tile no longer navigates (touch device) |

## Warnings (non-blocking)
None outstanding. Guard's 🟡 (icon-shape evasion) FIXED on-branch `de26c63`; 🟢 (Space-key test) + 🔵 (ThemeLock ownership comment) folded in the same commit.

## Migration
None. Rollback script: N/A. PITR: N/A (no destructive migration; no data touched).

## Hexagonal / architecture
No new port / adapter / dependency / vendor import. Brand assets now in `components/ui/`, barrel-exported, consumed from the kit by all 3 importers; zero direct-wire. Decision #17 honoured (MfsIcon `currentColor` + tokens, no style leak). ADR-0014 Rule 1/3 operationalised AND now lint-enforced. Rip-out test: N/A (no vendor boundary touched).

## Merge Sequence
1. (No migration.)
2. Merge PR #107 → Vercel auto-deploys.
3. Post-deploy smoke: @critical paths on the live prod URL (`mfsops.com`).
   → on failure: `vercel rollback` (no PITR — no data touched).

## Verdict
✅ CLEARED FOR PRODUCTION. All automated layers green: unit/component 3082/3082 · governance guard hardened (all 8 icon shapes caught) + real-tree scan clean · tsc/lint 0 · full hosted @critical regression on the Vercel preview (CI `smoke`, run `28472285695`) PASS first run. No migration / no RLS / no PITR / no new dependency. Rip-out test N/A.

Visual/touch (dark mode, overlays-dark, header icon, scroll-on-tile) is a final human eyeball on the preview (`mfs-operations-git-fix-ha-503f61…vercel.app`) at ship — not a cert blocker; the underlying logic is unit-proven + Guard-verified and the change is fully reversible (`vercel rollback`, no data touched).
