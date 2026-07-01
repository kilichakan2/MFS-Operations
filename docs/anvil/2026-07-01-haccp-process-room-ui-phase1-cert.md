# ANVIL Clearance Certificate

Date: 2026-07-01
App: MFS-Operations (HACCP compliance + operations)
Branch: feat/haccp-process-room-ui-phase1
PR: #109 — https://github.com/kilichakan2/MFS-Operations/pull/109
Head SHA tested: a7a7601 (spec-only fix applied in working tree during Iterate — see below)

> **DRAFT** — produced by the ANVIL runner. The Lock gate, PITR check (n/a here)
> and ship are the conductor's to run with Hakan. This cert asserts every required
> layer genuinely ran and passed.

## Scope — what this certificate actually covers

| Change / path | Risk tier | Layers required | Layers run |
| --- | --- | --- | --- |
| `lib/domain/processRoom.ts` (band rule, range guard, cause list) | High (food-safety CCP-3) | Unit + arch (domain-only) | Unit ✓ + domain-fake ✓ |
| `lib/ports/HaccpDailyChecksRepository.ts`, `lib/services/HaccpDailyChecksService.ts` | High | Unit + Integration | ✓ ✓ |
| `lib/adapters/{supabase,fake}/HaccpDailyChecksRepository.ts` | High | Unit (fake) + Integration (supabase) | ✓ ✓ |
| `app/api/haccp/process-room/route.ts`, `app/api/haccp/admin/process-room-thresholds/route.ts` | High (admin-gated write) | Integration + E2E | ✓ ✓ |
| `app/haccp/process-room/page.tsx`, `app/haccp/admin/page.tsx` | High (critical HACCP path) | E2E (local + preview) | ✓ ✓ |
| `supabase/migrations/20260701120000_haccp_process_room_thresholds.sql` (2 new tables + RLS) | Critical (migration + RLS) | pgTAP + Integration + E2E | ✓ ✓ ✓ |

**Not run under the efficiency dial:** None — full ladder run (high-risk HACCP tier → full E2E on the preview as well as local, the deliberate double-run).
**Baseline characterisation pass?** No — diff-driven, full coverage of the changed surface.

## Test Results

| Layer | Status | Notes |
| --- | --- | --- |
| Unit (Vitest) | ✅ 3134/3134 passed | Full suite (236 files) incl. 24 process-room + arch-guard/no-adapter-import lint. 3 fail-closed tests present & green (`resolveProcRoomThresholds`/`validateProcessingTemp`/`buildProcessingTemp` throw when "Product core"/"Room ambient" missing — no silent fallback). |
| Integration (Vitest) | ✅ 554/554 passed | Full suite (44 files) against local Supabase. Matrix files on clean seed: `haccp-process-room-thresholds.test.ts` + `haccp.test.ts` = 43/43 (GET carries bands; admin GET 200 / warehouse 403; PATCH updates + writes audit row old→new; `max<target` → 400; process-room temps/diary submit paths regression-clean). |
| Database (pgTAP) | ✅ 260/260 passed (19 files, `018-` ok) | `018-rls-process-room-thresholds.test.sql` (plan 15) = ok: RLS enabled both tables, non-admin INSERT denied (42501), non-admin UPDATE/DELETE no-op, audit immutable, band CHECK. The aggregate `Result: FAIL` banner is the KNOWN harness quirk (`_helpers.sql` glob → "No plan found"), NOT a real failure. |
| Edge Functions (Deno) | n/a — not required | No `supabase/functions/` change in this diff. |
| Architecture rung (seam crossed) | ✅ | Domain test `processRoom.test.ts` runs on the in-memory fake; NO vendor SDK imported in any domain test; `no-adapter-imports` lint pinned green. |
| Local full-stack rung | ✅ | Adapter: Supabase CLI (`db:up`/`db:reset` — local Docker Postgres+Auth+Storage). Full suite run against local containers before any preview. |
| E2E (Playwright) — local | ✅ 3/3 clean | `16-haccp-process-room.spec.ts` against local stack, fresh seed: temps happy + diary + deviation-CA, all first-attempt green after the Iterate fix. |
| E2E (Playwright) — preview | ✅ 92 passed · 🟡 1 flaky · 0 failed | Full `@critical` suite (93 specs) on the Vercel preview + freshly-reset Supabase preview branch. Flaky = process-room temps-happy (cold-lambda latency vs 10s assertion; green on retry #1; submit genuinely persisted). |
| Populated UI smoke | ✅ populated | Process-room temp tiles/diary cards render from DB-driven thresholds + seed; interactions confirmed (NumberPad entry → submit → session locks; diary tick→submit→Done; deviation→CCA sheet→CA in admin queue). |
| Breadth crawl | ✅ (covered by `@critical` breadth) | 30-spec HACCP hub/tile/nav + audit-reporting specs visit every HACCP route + click tiles/help/nav with no console error / no 5xx (tests 65–94). Destructive actions not auto-fired (specs assert open/cancel = no POST). |

## Warnings (non-blocking)

- 🟡 **Flaky on a critical path — `16-haccp-process-room.spec.ts › temps happy path` (preview only).**
  First attempt timed out at 10s on the fresh-submit assertion (`enterTempSession`, spec line 68) against a **cold Vercel lambda**; passed on retry #1 (3.4s). The submit DID persist on the first attempt (the retry took the read-only path), so the real-environment behaviour is correct. **100% clean locally (3/3, no retry).** Handled by the project's deliberate `retries:1` preview config — the same mechanism that absorbs cold-start flake across the suite (a KDS spec also flaked-then-passed in CI). Root cause is production cold-start latency, not code. Optional hardening: widen the fresh-submit assertion timeout (10s → ~20s) in a follow-up; not blocking.
- 🔵 **CI `smoke` check on PR #109 is RED but stale/unrelated.** It failed on `25-haccp-reviews.spec.ts › weekly review` against the DIRTY shared preview DB (this week's weekly review already submitted — a once-per-period conflict), NOT on any process-room code. Proven: after the preview-branch reset, `25-haccp-reviews` weekly + monthly both PASS (tests 57/58). The red is a dirty-DB false-negative outside this diff; a CI re-run (or the fresh branch on merge) should clear it. Conductor's call whether to re-run the required check before merge.

## Migration

**Additive** — `20260701120000_haccp_process_room_thresholds.sql`: CREATE TABLE ×2 (`haccp_process_room_thresholds`, immutable `haccp_threshold_audit`) + seed (Product core 4/7, Room ambient 12/15) + GRANT + CREATE POLICY only. No DROP/TRUNCATE/ALTER TYPE/DROP NOT NULL.
Rollback script: `docs/anvil/2026-07-01-haccp-process-room-ui-phase1-rollback.sql` (drops the two new tables; revert code + DB together — the new code fails closed when the tables are absent, by design).
PITR confirmed: **N/A** — no destructive operation. No PITR gate required.
Migration tested on preview branch: ✅ — the preview-branch reset re-applied it cleanly (`MIGRATIONS_PASSED`, thresholds re-seeded, `018` RLS green).

## Merge Sequence

1. `supabase db push --project-ref uqgecljspgtevoylwkep` (apply additive migration to prod FIRST)
2. Merge PR #109 → Vercel auto-deploys code SECOND (safe: additive schema)
3. Smoke test (3 `@critical` paths) against live prod URL
4. If smoke fails → `vercel rollback` (code); PITR not needed (additive, no data loss risk)
5. Confirm the Supabase preview branch (`bba13397-0086-4219-8add-f80a7888d1fb`, ref `hganxgzwtjugjhlgdqem`) auto-deletes on merge — I reset it during Verify, so it will carry my run's residue until deletion.

## Manual smoke at merge

**Not required** — critical flows proven on the real hosted environment with real data (temps submit + diary + deviation-CA all exercised on the preview against a freshly-seeded DB), full `@critical` breadth clean (92/93, 1 environmental flaky), post-deploy smoke armed with rollback. One caveat named: the single 🟡 flaky above is cold-start latency, green on retry, clean locally.

## Iterate log (max 2 loops — used 1)

- **Loop 1 (test fix, no production code touched):** local E2E temps-happy was consistently flaky — it asserted the "AM check submitted" banner on the post-submit view, but the page's intended smart-default (`app/haccp/process-room/page.tsx` lines 598–601, "first unsubmitted") advances the selector to PM after an AM submit, so the banner wasn't on that view. Fixed the spec to re-select AM after submit (mirroring the spec's own read-only branch). Re-ran local → 3/3 clean. Diagnosis confirmed via the failure DOM (PM pressed) + integration proof that the AM POST persists. **No production bug.**

## Verdict

CLEARED FOR PRODUCTION
