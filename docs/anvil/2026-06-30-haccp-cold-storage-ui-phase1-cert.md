# ANVIL Clearance Certificate

Date: 2026-06-30
App: MFS-Operations — HACCP cold-storage (CCP-2 temp log)
Branch: feat/haccp-cold-storage-ui-phase1
PR: #108

## Scope — what this certificate covers

| Change / path | Risk tier | Layers required | Layers run |
| --- | --- | --- | --- |
| lib/services/HaccpDailyChecksService.ts (8-cause allow-list + server bound echo) | High (HACCP food-safety save path) | Unit + Integration + E2E | Unit ✅ · Integration ✅ · E2E ✅ |
| lib/domain/coldStorage.ts (shared cause list + entry-bound helper) | Low (pure domain) | Unit | Unit ✅ |
| components/ui/NumberPad.tsx (new kit component) | Low–Med | Unit + component + E2E | Unit ✅ · E2E ✅ |
| app/haccp/cold-storage/page.tsx (kit/token rebuild, dark) | Medium (UI, dark theme) | E2E | E2E ✅ (dark-render + flows) |

No migration / no schema / no RLS / no PITR / no new dependency.

## Test Results

| Layer | Status | Notes |
| --- | --- | --- |
| Unit + component (Vitest) | ✅ 3107/3107 (233 files) | Full-suite regression incl. `coldStorage` (bounds + 8-cause em-dash byte assertion), `NumberPad` (reducer/gating/axe), `HaccpDailyChecksService` (both new causes validate + build a complete CA; junk cause 400; out-of-range 400; de-drift structural), kit guards, the `a0ff7dd` draft-buffer fix |
| Integration (Vitest, live local Supabase) | ✅ 550/550 (43 files) | +8 NEW cold-storage Phase 1 on a fresh `db:reset` seed: **"Defrost cycle" + "High ambient" deviations now SAVE through the live route→service→repo (the bug-fix proof, previously 400)** · out-of-range 300→400 · once-per-session→409 · non-today→400 · clean AM→200/0 CA |
| Database (pgTAP) | n/a — not required | No migration / schema / RLS change |
| Edge Functions (Deno) | n/a | None touched |
| Local full-stack rung | ✅ Supabase CLI (db:up + db:reset) | full suite vs local containers |
| E2E (Playwright @critical, local chromium) | ✅ 5/5 | `13-haccp-cold-storage.spec.ts` (2, regression) + NEW `13z-haccp-cold-storage-phase1.spec.ts` (3: Defrost-saves end-to-end + once-per-session, draft-discard on scrim-dismiss, dark-mode render of screen + 3 Modals) |
| Populated UI smoke | ✅ populated | Defrost deviation drove a real corrective-action submit → "Session submitted"; dark surfaces asserted |
| E2E @critical on Vercel preview (CI `smoke`) | 🔴 FAIL (3 runs, incl. clean-DB) | Reproducibly fails 2 cold-storage specs on the prod-build preview: `13-haccp-cold-storage.spec.ts:74` (regression happy-path submit) + `13-haccp-cold-storage-phase1.spec.ts:168` (Defrost) — 30s `locator.click` timeout on Submit, "Session submitted" never appears. Regression spec is UNCHANGED + passes on `main` → REAL prod-build-only regression from the rebuild. NOT reproducible on local dev OR a local prod build (only on the preview). Root cause NOT yet captured (never traced the actual failing preview). |

## Warnings (non-blocking)
- Local Playwright runs on a dev server (not a prod build) — the prod-build dark render is confirmed by the CI/preview @critical smoke.
- Integration leaves append-only readings on seeded units; always `db:reset` before each local run (a 2nd run without reset 409s by design).
- Guard 🟡 (out-of-range value could reach Submit on scrim-dismiss) FIXED on-branch `a0ff7dd` (draft buffer). 🟢 freezer integer-only entry PRESERVES current behaviour (not a regression).

## Migration
None. Rollback script: N/A. PITR confirmed: N/A (no destructive migration).

## Hexagonal / architecture
No new port/adapter, no new dependency, no vendor import. `lib/domain/coldStorage.ts` is pure (zero imports). `page.tsx` imports only react / `@/components/ui` / `@/lib/domain` — no inward breach. The new `NumberPad` lives in `components/ui/`, barrel-consumed, semantic tokens only (passes `reusable-visual-in-kit` + `semantic-tokens-only`). Rip-out test PASS.

## Merge Sequence
1. (No migration.)
2. Merge PR #108 → Vercel auto-deploys.
3. Post-deploy smoke: @critical paths on the live prod URL (`mfsops.com`).
   → on failure: `vercel rollback` (no PITR — no data touched).

## Verdict
🔴 NOT CLEARED — BLOCKED. Local layers all green (unit/component 3107 · integration 550 +8 LIVE · local @critical 5/5 on both dev and a local prod build), BUT the authoritative prod-build Vercel preview `@critical` smoke reproducibly FAILS 2 cold-storage specs on a Submit-click hang (3 runs incl. a clean-DB reset run). The failure is a REAL prod-build-only regression from the page rebuild (the unchanged regression spec passes on `main`) and has NOT been root-caused — every fix attempt so far (incl. the shared-`Modal` Radix-pointer-events hardening `9103fed`, verified on a LOCAL prod build) failed to change the preview outcome. **The unresolved next step: capture a trace from the actual failing PREVIEW environment (`npm run test:e2e:preview -- <preview-url> --unprotected -g "cold storage"`) and diagnose with evidence, not hypotheses.** No merge until green. Branch `feat/haccp-cold-storage-ui-phase1` HEAD `9103fed`, PR #108 open.
