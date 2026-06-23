# ANVIL Clearance Certificate

Date: 2026-06-23
App: MFS-Operations
Branch: f19-pr4-cluster-c-people-training
PR: #71
Feature: F-19 PR4 — Cluster C "People & training" (combined-rhythm hexagonal re-point)

## Scope — what this certificate actually covers

| Change / path | Risk tier | Layers required | Layers run |
|---------------|-----------|-----------------|------------|
| HaccpTraining + HaccpPeople hexagons (domain/port/service/adapters) | High (critical path, HACCP) | Unit + Integration + pgTAP + E2E | all |
| Routes re-pointed: /api/haccp/training, /people, /visitor | High | Unit + Integration + E2E | all |
| /haccp/{training,people,visitor} screens | High | E2E (exhaustive browser-tap) | all |
| supabase/seed.sql (Visitor Kiosk system user) | Low (test fixture) | n/a — local/preview only | applied to local + preview |

Not run under the efficiency dial: None — full ladder run (high-risk HACCP critical path; full E2E re-run on the preview, not just smoke).
Baseline characterisation pass? No — diff-driven, byte-identical re-point.

## Test Results

| Layer | Status | Notes |
|-------|--------|-------|
| Unit (Vitest) | PASS 2238/2238 | incl. 35 new service tests + no-adapter-imports lint pin |
| Integration (Vitest, real DB) | PASS 404/404 | new haccpPeopleTraining.test.ts 15/15; no regression across full suite |
| Database (pgTAP / RLS) | PASS 161/161 | pure regression, no migration |
| Edge Functions (Deno) | n/a — none in this PR | |
| Local full-stack rung | PASS | Supabase CLI (db:up/db:reset) + prod-build preview for E2E |
| E2E (Playwright, prod-build preview) | PASS 52/52 @critical | F-19 PR4 specs 13/13 (22 training 4/4, 23 people 6/6, 24 kiosk 3/3) |
| Populated UI smoke | PASS — populated | training/people history tables + kiosk write-back exercised with real rows |
| Breadth crawl | PASS via @critical depth | 11-21 HACCP + 22-24 Cluster C screens reachable, no throw |

## Byte-identity pins held (no modification needed)
- allergen missing certification_date → 'Completion date required' 400
- people-visitor accepts whitespace manager name / kiosk rejects it → 'Manager sign-off required' 400
- training GET { staff, allergen } no join; people GET { records } users!submitted_by(name) limit 50; lists limit 100
- illness mapping gi→gastrointestinal / other→other_illness / serious→serious_illness
- kiosk submitted_by = fixed VISITOR_KIOSK_USER_ID; record_type 'visitor'; both kiosk outcomes write a row

## Real or pre-existing bugs
None. No behaviour drift; no untouched-code bug surfaced by the exhaustive browser-tap E2E.

## E2E environment
- Preview URL: https://mfs-operations-git-f19-pr-68d78e-hakan-kilics-projects-2c54f03f.vercel.app (branch alias, dpl_3FodeR4y…, commit f027c4d, READY)
- Mode: --unprotected (Vercel Deployment Protection OFF, BACKLOG F-INFRA-04)
- DB-identity probe: 4/4 passed
- Supabase preview branch dtnhjkfcbgdatusqjqux (PR #71) was reset to re-seed; kiosk system user inserted via SQL (seed.sql line committed this run). Branch auto-deletes on merge.

## Warnings (non-blocking)
- F-24 map specs (05/06) RED only under local `next dev` (react-leaflet double-mount); GREEN on the prod-build preview (12 ✓, 13 ✓). Expected, not a regression.

## Migration
None. Rollback (revert-only / code-only): docs/anvil/2026-06-23-f19-pr4-cluster-c-people-training-rollback.sql
PITR confirmed: N/A (no destructive migration, no schema/RLS change, no new dependency)

## Merge Sequence
1. No migration to apply — skip `supabase db push`.
2. Merge PR #71 → Vercel auto-deploys.
3. Post-deploy smoke: @critical HACCP paths against the production URL → if red: vercel rollback (no PITR — no data touched).
   NOTE: production already contains the Visitor Kiosk system user; the seed.sql addition never executes against prod.

## Verdict
CLEARED FOR PRODUCTION
