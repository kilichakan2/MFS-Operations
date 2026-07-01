# ANVIL Clearance Certificate

Date: 2026-06-30 (cleared 2026-07-01)
App: MFS-Operations — HACCP cold-storage (CCP-2 temp log)
Branch: feat/haccp-cold-storage-ui-phase1
PR: #108

## Scope — what this certificate covers

| Change / path | Risk tier | Layers required | Layers run |
| --- | --- | --- | --- |
| lib/services/HaccpDailyChecksService.ts (8-cause allow-list + server bound echo) | High (HACCP food-safety save path) | Unit + Integration + E2E | Unit ✅ · Integration ✅ · E2E ✅ |
| lib/domain/coldStorage.ts (shared cause list + entry-bound helper) | Low (pure domain) | Unit | Unit ✅ |
| components/ui/NumberPad.tsx (new kit component) | Low–Med | Unit + component + E2E | Unit ✅ · E2E ✅ |
| components/ui/Modal.tsx (defensive body-pointer-events release, `9103fed`) | Low (kit, additive guard) | Component | Component ✅ |
| app/haccp/cold-storage/page.tsx (kit/token rebuild, dark) | Medium (UI, dark theme) | E2E | E2E ✅ (dark-render + flows) |
| tests/e2e/13-haccp-cold-storage{,-phase1}.spec.ts (race-proof guards, `62ec87b`) | Test-only | E2E | E2E ✅ |

No migration / no schema / no RLS / no PITR / no new dependency.

## Test Results

| Layer | Status | Notes |
| --- | --- | --- |
| Unit + component (Vitest) | ✅ 3107/3107 (233 files) | Full-suite regression incl. `coldStorage` (bounds + 8-cause em-dash byte assertion), `NumberPad` (reducer/gating/axe), `HaccpDailyChecksService` (both new causes validate + build a complete CA; junk cause 400; out-of-range 400; de-drift structural), kit guards, the `a0ff7dd` draft-buffer fix, the `9103fed` Modal guard |
| Integration (Vitest, live local Supabase) | ✅ 550/550 (43 files) | +8 NEW cold-storage Phase 1 on a fresh `db:reset` seed: **"Defrost cycle" + "High ambient" deviations now SAVE through the live route→service→repo (the bug-fix proof, previously 400)** · out-of-range 300→400 · once-per-session→409 · non-today→400 · clean AM→200/0 CA |
| Database (pgTAP) | n/a — not required | No migration / schema / RLS change |
| Edge Functions (Deno) | n/a | None touched |
| Local full-stack rung | ✅ Supabase CLI (db:up + db:reset) | full suite vs local containers |
| E2E (Playwright @critical, local chromium) | ✅ 5/5 | `13-haccp-cold-storage.spec.ts` (2, regression) + NEW `13-haccp-cold-storage-phase1.spec.ts` (3: Defrost-saves end-to-end + once-per-session, draft-discard on scrim-dismiss, dark-mode render of screen + 3 Modals) |
| E2E @critical on Vercel preview (CI `smoke`) | ✅ PASS (run 28511169674, HEAD `62ec87b`) | Full `@critical` suite green on the prod-build preview. Cold-storage specs verified against the LIVE preview both ways: **clean DB → 5/5 with the Defrost submit genuinely exercised end-to-end to "Session submitted"; dirty DB → 5/5 via graceful early-return.** |

## Root-cause of the earlier preview failure (resolved) — NOT a production bug

The prod-build preview `@critical` smoke had been failing 2–3 cold-storage specs
(30s Submit/comments-fill timeouts). Root-caused on 2026-07-01 by tracing the
**actual failing preview** (not hypotheses) + a direct preview-DB query:

- Cold storage is **once-per-session-per-day**; the shared Vercel-preview
  Supabase DB is **never reset between runs**, so after the first run a session
  is already submitted and the screen is read-only (no comments field / no
  Submit button).
- The specs' "already submitted?" guards **raced the client-side `loadReadings`
  fetch** — checked for the read-only banner before it rendered, missed it, and
  drove into the read-only page → timeout. `168` also raced its final
  once-per-session recheck (post-submit `loadReadings` auto-selects the freed
  PM session, overriding the AM click).
- **Proof the prod build is correct:** a clean-DB preview run saved AM Beef
  Chiller 12 °C critical via the "Defrost cycle" cause and reached "Session
  submitted" (confirmed by DB query + the green run). The 8-cause fix works
  end-to-end on the production build.

**Fix (`62ec87b`, test-only):** an `enterSession()` helper waits for the units
to render (load settled) before selecting a session, then reports editable vs
read-only; each spec gracefully early-returns on an already-submitted session
(the route→service→repo save is authoritatively pinned at the integration
layer). No page/service/domain code changed for the smoke fix.

## Warnings (non-blocking)
- On a dirty shared preview DB the cold-storage E2E specs **degrade to a
  read-only-banner assertion** (the full submit is exercised only when a session
  is free — always on a freshly-reset DB, and CI run 28511169674 did exercise
  it). The authoritative save proof is the integration layer (+8 live tests).
  Follow-up idea: reset the preview DB at the start of the smoke so once-per-
  session flows always exercise (BACKLOG).
- The `9103fed` shared-`Modal` body-pointer-events release was added last session
  on a since-disproven hypothesis (it did not change the preview outcome). It is
  a reviewed, tested, no-op-on-happy-path defensive guard — kept as harmless, NOT
  claimed as the fix.
- Guard 🟡 (out-of-range value could reach Submit on scrim-dismiss) FIXED
  on-branch `a0ff7dd` (draft buffer). 🟢 freezer integer-only entry PRESERVES
  current behaviour (not a regression).

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
✅ CLEARED FOR PRODUCTION. All layers green: unit/component 3107 · integration 550 (+8 LIVE
bug-fix proof) · local @critical 5/5 (dev + local prod build) · **prod-build
Vercel preview `@critical` smoke GREEN (run 28511169674)**. The earlier preview
failure was root-caused to a test-harness race against the never-reset shared
preview DB — NOT a production regression; the prod build accepts the writes
(verified by DB query + a clean-DB submit reaching "Session submitted"). Fixed
test-only (`62ec87b`). No merge blockers. Branch `feat/haccp-cold-storage-ui-phase1`
HEAD `62ec87b`, PR #108.
