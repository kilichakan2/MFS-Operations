# ANVIL Clearance Certificate

Date: 2026-06-24
App: MFS-Operations (HACCP food-safety reporting)
Branch: feat/f19-pr8-cluster-e-reporting-repoint
PR: #75

> FINALISED by the conductor at the Lock gate. No migration → no PITR check
> required. All rungs green; cleared for production.

## Scope — what this certificate actually covers

This PR flips 6 read-only HACCP reporting routes off direct vendor calls
(`supabaseService` / `import * as XLSX from 'xlsx'`) onto the
`haccpReportingService` wiring singleton built + proved byte-identical in PR7
(#74). Routes become thin doormen. No migration, no new dependency, no RLS/policy
change; wiring stays service-role only. Whole-PR promise: **byte-identical
behaviour** — so any output difference vs `main` would be a real bug, not a test
to relax.

| Change / path                              | Risk tier | Layers required            | Layers run                          |
| ------------------------------------------ | --------- | -------------------------- | ----------------------------------- |
| app/api/haccp/audit/route.ts               | High (HACCP) | Unit + Integration + E2E | Unit ✓ · Integration ✓ · E2E ✓      |
| app/api/haccp/audit/export/route.ts        | High (HACCP) | Unit + Integration + E2E | Unit ✓ · Integration ✓ · E2E ✓      |
| app/api/haccp/audit/heatmap/route.ts       | High (HACCP) | Unit + Integration + E2E | Unit ✓ · Integration ✓ · E2E ✓      |
| app/api/haccp/overview/route.ts            | High (HACCP) | Unit + Integration + E2E | Unit ✓ · Integration ✓ · E2E ✓      |
| app/api/haccp/annual-review/data/route.ts  | High (HACCP) | Unit + Integration + E2E | Unit ✓ · Integration ✓ · E2E ✓      |
| app/api/haccp/today-status/route.ts        | High (HACCP) | Unit + Integration + E2E | Unit ✓ · Integration ✓ · E2E ✓      |
| .eslintrc.json (xlsx import ban armed)     | Low       | Unit (lint pins)           | Unit ✓ (lint suite green)           |

**Not run under the efficiency dial:** None — HACCP is a critical section, so the
FULL ladder ran, including the full `@critical` E2E suite on the prod-build
preview (Hakan's standing rule), not just the smoke.
**Baseline characterisation pass?** No — diff-driven, full coverage of the 6 routes.

🗣 In plain English: every one of the 6 reporting screens was checked at three
levels — the shared logic, the route over real HTTP, and the actual screen with
every button clicked on the deployed prod build. Nothing was skipped.

## Test Results

| Layer                       | Status            | Notes                                                                                          |
| --------------------------- | ----------------- | ---------------------------------------------------------------------------------------------- |
| Unit (Vitest)               | ✅ 2319/2319       | Baseline matched exactly, incl. PR7 parity suite (HaccpReportingService.test.ts) + 8 T1 export cell tests |
| Integration (Vitest)        | ✅ 440/440         | New `tests/integration/haccpReportingRoutes.test.ts` = 14/14; full suite (30 files) green, no regression |
| Database (pgTAP)            | ✅ n/a — not required | No schema/policy change. No-regression check: 161/161 assertions across 14 RLS/schema files `ok` (the `Result: FAIL` line is the planless shared helper `_helpers.sql`, a pre-existing harness artifact, not a test) |
| Edge Functions (Deno)       | n/a — not required | No edge functions touched                                                                      |
| Local full-stack rung       | ✅                 | Supabase CLI adapter (`supabase start` → `db reset` seed → run → `supabase stop`); prod build (`next build`) for E2E |
| E2E (Playwright)            | ✅ 67/67 @critical (0 flaky, 0 retries) | Full `@critical` suite on the **prod-build Vercel preview**, FINAL run on a freshly-RESET preview branch (clean seed). `tests/e2e/26-haccp-audit-reporting.spec.ts` extended from 4 → **8 @critical** (every-button taps on home + annual-review added). See "Clean-sweep re-run" note below. |
| Populated UI smoke          | ✅ populated       | Audit screen: all 11 section selectors tapped, heatmap toggle ×2, all 3 date presets, export download exercised against seeded preview data |
| Breadth crawl               | ✅ EVERY-BUTTON    | /haccp home: all 16 tiles' help panels open/close + nav buttons (Documents/Admin/Sign-out present+enabled). /haccp/audit: 11 section tabs + heatmap toggle + 3 presets + 14-tab export download. /haccp/annual-review: New-review modal open→cancel (non-destructive) + read-only review open + section expand. All with no console error / no 5xx. |

## Architecture rung (seam check)

✅ PASS. The re-point touches only `app/api/**` (presentation → `lib/wiring/haccp`).
The touched ports (`reporting`, `spreadsheet`) already have a domain-only suite
(HaccpReportingService.test.ts) that runs the service against an in-memory fake
repository + the real exporter, with NO vendor SDK imported in the domain test.
The PR additionally ARMS the eslint ban so `xlsx` / `@supabase/*` can only live in
`lib/adapters/<vendor>/`. Rip-out test holds: swapping the DB or the spreadsheet
vendor = one new adapter + one wiring line.

## Real-code bugs

**None.** The only failure encountered was a broken TEST selector (the
annual-review assertion used `.or()` and matched two on-screen elements); the
screen rendered correctly. Fixed in iteration loop 1 (selector tightened to the
unambiguous "+ New review" button) and re-ran green. No application code was
changed by ANVIL. Byte-identical promise held at every layer.

## Export download confirmation

✅ The "Export All (XLSX)" download was triggered as a real browser download on
the prod-build preview and the downloaded file opened as a workbook with **exactly
14 sheets in the documented order**: 01 Deliveries · 02 Cold Storage · 03a Process
Room Temps · 03b Process Room Diary · 04 Cleaning · 05 Calibration · 06 Mince &
Prep · 07 Product Returns · 08 Corrective Actions · 09a Weekly Reviews · 09b
Monthly Reviews · 10 Health & People · 11a Staff Training · 11b Allergen Training.
The same 14-tab order is independently pinned at the integration layer (parsed off
the live HTTP response bytes) and the unit layer (PR7 parity suite).

## Migration

**None.** Zero `supabase/` files changed. No new dependency.
Rollback note: docs/anvil/2026-06-24-f19-pr8-cluster-e-reporting-repoint-rollback.md
PITR confirmed: N/A — no destructive migration, all 6 routes are read-only GETs.

## Merge Sequence

No migration → no migration-first step.

1. ✅ All tests passing (ANVIL certified)
2. Merge PR #75 → Vercel auto-deploys
3. Post-deploy smoke: re-run the 3 HACCP `@critical` reporting paths against prod
   (or the standing post-deploy smoke set)
4. If smoke fails → `vercel rollback` (code only; no data touched)

## Manual smoke at merge

**Not required.** Critical reporting flows proven on the real Vercel preview
environment with real preview-branch data ✓; every interactive element tapped with
no console error / no 5xx ✓; the export download verified end-to-end as a 14-sheet
workbook ✓. No data-dependent view was mount-only — the audit sections, heatmap,
and export all exercised seeded data.

E2E target used: **Vercel preview (prod build)** —
https://mfs-operations-git-feat-f-e33740-hakan-kilics-projects-2c54f03f.vercel.app
(run via `npm run test:e2e:preview -- <url> --unprotected`; Deployment Protection
is OFF — BACKLOG F-INFRA-04). New specs additionally validated against a local
prod build first.

## Clean-sweep re-run (Hakan's call — no-asterisk record)

The every-button extension ran on a SHARED preview branch and surfaced 4 unrelated
`@critical` specs wobbling (`13-haccp-cold-storage`, `16-haccp-process-room`,
`25-haccp-reviews`, `04-kds-line-undo`) — all "submit-once-per-period" mutation
specs colliding with data earlier runs had written, NONE touching the 6 re-pointed
PR8 routes. To remove the ambiguity, the conductor RESET the PR-75 Supabase preview
branch (`bb517b47-…`) to a fresh seed and re-ran the FULL `@critical` suite once:

- **67 passed / 0 failed / 0 flaky — single run, no retries.**
- The 4 previously-wobbling specs all **passed** on the empty slot → the earlier
  reds were confirmed environmental data contention, not defects.
- The fail-closed seed-sentinel probe (`a417e57e-…0001`) confirmed the preview was
  reading the freshly-seeded reset DB before any spec ran.

🗣 In plain English: we wiped the test database and ran every critical journey once
on the clean slate — all 67 passed first time. The handful that wobbled before were
just leftover-data noise, now proven so. No footnote on this ship.

## Verdict

✅ CLEARED FOR PRODUCTION — finalised at Lock gate (no migration → no PITR; all
rungs green; final E2E 67/67 @critical on a freshly-reset preview branch, 0 flaky)
