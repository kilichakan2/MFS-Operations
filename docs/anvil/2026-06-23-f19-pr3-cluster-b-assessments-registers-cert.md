# ANVIL Clearance Certificate

Date: 2026-06-23
App: MFS-Operations
Branch: feat/f19-pr3-cluster-b-assessments-registers
PR: #70

## Scope — what this certificate covers

| Change / path | Risk tier | Layers required | Layers run |
| --- | --- | --- | --- |
| 5 HACCP Cluster B routes re-pointed onto HaccpAssessmentsService (allergen-assessment, monthly-reviews, food-defence, food-fraud, product-specs) | High (critical-path HACCP, live behaviour) | Unit + Integration + pgTAP + E2E (full ladder) | All ran |
| Hexagonal extraction: lib/domain/HaccpAssessment, lib/ports/HaccpAssessmentsRepository, lib/services/HaccpAssessmentsService, lib/adapters/{supabase,fake}, lib/wiring/haccp | Architecture rung (crosses a seam) | Domain-only fake-adapter test + no vendor import past adapter | Carried green (unit incl. service/wiring/fake suites; no-adapter-imports lint) |
| food-defence + food-fraud page.tsx empty-state "+ New version" fix (Hakan-approved in-PR scope add) | Med (presentation) | Unit (carried) + E2E | Ran (E2E via the real button) |

**Not run under the efficiency dial:** None — full ladder run (high-risk HACCP critical path).
**Baseline characterisation pass?** No — diff-driven.

## Test Results

| Layer | Status | Notes |
| --- | --- | --- |
| Unit (Vitest) | PASS 2202/2202 | incl. 87 new Cluster B tests (service / supabase adapter verbatim-joins / wiring surface) |
| Integration (Vitest) | PASS 389/389 | real local DB; Cluster B 6/6 — 3 persistence models + R3 null-user-ref + PATCH-omits-allergens pinned |
| Database (pgTAP) | PASS 161/161 | RLS/schema regression; `_helpers.sql` "no plan" = known harness artifact |
| Production build | PASS | `next build` clean, all 5 routes |
| E2E (Playwright) | PASS 39/39 @critical | clean branch, 0 retries; preview commit 96a6b33 |
| Populated UI smoke | PASS | Cluster B screens rendered + create/edit/soft-delete confirmed on seeded preview |

### E2E run detail
- Commit: `96a6b33` · Preview: `https://mfs-operations-git-feat-f-089f76-hakan-kilics-projects-2c54f03f.vercel.app` (branch alias, `--unprotected`)
- Vercel deployment `dpl_dvdhz9Mo9MKqkrn5StvQEbrGgtqb` READY · Supabase preview branch ref `zzzroqcanwuiwkauljyw` ACTIVE_HEALTHY
- DB identity probe: 4/4 passed (seed-born preview DB, never prod)
- Cluster B specs 18–21 all green first-try; 19 & 20 create via the real fixed "+ New version" button; 21 deterministic `E2E-PS-<ts>` row.

## Warnings (non-blocking)
- First E2E pass: specs 04 (KDS line-undo), 13 (cold-storage), 16 (process-room) flaked on leftover seed state on the re-used preview branch — cleared by `reset_branch`, all green on the clean re-run (39/39, 0 retries). Documented environmental non-blockers, NOT PR3 regressions.
- Accepted item (pre-agreed, not a finding): Cluster B has no 409/ConflictError path — every DB error stays 500, body text 'Server error' (same posture as Cluster A R6 / F-18 R3).
- Allergens has the same latent empty-state create gap (heavier fix; spec 18 green via seed-first) — logged to BACKLOG as a follow-up, deliberately NOT fixed in this PR.

## Migration
None. No schema change. Rollback script: N/A. PITR confirmed: N/A (no destructive migration).

## Merge Sequence
1. No migration → skip db push
2. Merge PR #70 → Vercel auto-deploys
3. Post-deploy smoke: @critical paths against the live prod URL → on failure, `vercel rollback`

## Manual smoke at merge
Not required — critical Cluster B flows proven on the real preview env with seeded data (create / edit / soft-delete confirmed), full @critical suite green 0-retry, post-deploy smoke armed.

## Verdict
CLEARED FOR PRODUCTION
