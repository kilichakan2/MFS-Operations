# ANVIL Clearance Certificate — F-18 PR2

**Unit:** F-18 PR2 — re-point the 6 Visits routes onto `visitsService`
Branch: feat/f-18-pr2-visits-route-repoint
**PR:** #66 · **Date:** 2026-06-22 · **HEAD:** bc5226d (+ this cert)
**Migration:** NONE · **PITR:** N/A (no destructive migration; no migration at all)

## Verdict: CLEARED FOR PRODUCTION

Every test layer is green for this PR's scope. The only red specs are pre-existing
(proven identical on `main`) or flaky (cleared on isolated re-run) — none introduced by
this diff. The authoritative preview `@critical` smoke is 15/15 on the real Vercel preview
+ Supabase preview branch.

## Per-layer results

| Layer | Result | Notes |
|---|---|---|
| Unit (Vitest) | ✓ 2125/2125 | incl. 9 dto key-order tripwires + 2 W1 route tests |
| Integration (Vitest, local Supabase) | ✓ 336/336 (23 files) | no visits integration spec exists — visits proven server-side by unit dto + W1; all other domains green |
| Production build | ✓ 114/114 static pages | clean; the earlier `/admin/prospects`+`/admin/at-risk` errors were a `.next` collision artifact (build run concurrently with a dev server), not a regression — gone on a serial build |
| Full E2E (Docker rung, prod build) | ✓ for scope | every visits-touching spec green: all `@critical` (01–09), `admin-views` (/admin/visits), `05`/`06` map (pass on a production build), `/visits` url-filter specs |
| Preview `@critical` smoke (PR #66) | ✓ 15/15 | DB identity probe 4/4 (seed-born preview DB); `--unprotected` mode (Deployment Protection OFF, F-INFRA-04) |

## E2E reds — fully accounted for, none from this diff

- **10 pre-existing failures** — `route-manager` (/routes planner, 6), `desktop-chrome` (2),
  `mobile-chrome` (2). Rebuilt `main` and ran the same spec files on a production build:
  **identical 10 failures**. Local full-suite env gaps in non-`@critical` admin/layout specs
  the routine `@critical` relay never exercises. Pre-existing debt, out of scope per the
  diff-scope rule. (Candidate backlog item: local full-suite env for non-`@critical` specs.)
- **3 flakes** — 1 `dashboard-admin-restyle` + 2 `url-filter-init` (`/complaints`, `/pricing`)
  cases. Failed once under full-suite load; **passed 27/27 on isolated re-run** on the branch
  and pass on `main`. Timing-sensitive, not code.

## Guard (code-critic) — CLEAN, no blockers

R-B1 byte-identity PASS on all 6 routes; W1 PASS; hexagonal PASS; depth verdict on
`lib/api/visits/dto.ts` = DEEP/earns its place. Full review: `docs/reviews/2026-06-22-f-18-pr2-visits-route-repoint-review.md`.

**Two 🟡 warnings — ACCEPTED by Hakan at Gate 3 (both plan-consistent, non-blocking):**
1. Non-duplicate insert failure → generic `{error:'Server error'}` 500 (was `'Insert failed: <raw pg text>'`); same status code, stops leaking raw DB text.
2. `screen3/sync` duplicate-detection narrowed to Postgres `23505` only (was `23505` OR bare HTTP-409); theoretical — Supabase always sets `23505`.

## W1 — the one deliberate behaviour change

`PATCH /api/screen3/visit/notes` on a non-existent/unowned note now returns **404** (was a
latent **500**). Pinned by `tests/unit/api/visit-notes.route.test.ts` (404 + 200 cases) and
green on the preview smoke chain.

## Hexagonal / rip-out

Port: USES existing `VisitsRepository` (none added). Adapter: none added/changed. New deps:
NONE (no `package.json` change). Rip-out: PASS — swap DB vendor for Visits = one new adapter
+ one wiring line. F-TD-31 audit-raw-REST + postcodes.io geocode stay in `screen3/sync`
(documented, unchanged debt).

## Pre-merge checklist
- [x] Unit / integration / build / E2E green for scope
- [x] Preview `@critical` smoke green (15/15) + identity probe (4/4)
- [x] Guard review on disk, no blockers
- [x] No migration → no PITR required
- [x] No new dependency
- [x] Branch pushed, PR #66 open

## Merge sequence (Gate 4)
1. No migration step — skip `supabase db push`.
2. Merge PR #66 → Vercel auto-deploys production.
3. Post-deploy smoke (PRODUCTION, read-only by conductor): `@critical` reachability on the
   live prod URL → rollback trigger if red. Hakan does the manual write-path spot-check
   (create / edit / note / pipeline-status / delete on a real visit).
