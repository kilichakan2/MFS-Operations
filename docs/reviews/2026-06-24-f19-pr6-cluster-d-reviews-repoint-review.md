# Code-critic review — F-19 PR6 Cluster D reviews re-point

- **PR:** #73 · branch `feat/f19-pr6-cluster-d-reviews-repoint` · commit `63476b3`
- **Date:** 2026-06-24
- **Phase:** FORGE Guard
- **Verdict:** ✅ **NO BLOCKERS — advance to ANVIL**

## Scope reviewed
`git diff main...origin/feat/f19-pr6-cluster-d-reviews-repoint` — 3 files:
- `app/api/haccp/reviews/route.ts` (re-pointed onto `haccpReviewsService`)
- `app/api/haccp/annual-review/route.ts` (re-pointed onto `haccpAnnualReviewService`)
- `tests/integration/haccpReviewsRoutes.test.ts` (new, 16 live-HTTP route tests)

Also read for context: both services, both Supabase adapters, both fake adapters, `lib/wiring/haccp.ts`, existing tests.

## Tests / lint run during audit
- **Unit (affected): 102/102 passing** — `HaccpReviewsService` (13), `HaccpAnnualReviewService` (34), wiring pin, `no-adapter-imports` lint all green.
- `no-adapter-imports.test.ts` green → hexagonal boundary holds for the diff.
- **`tsc --noEmit`: NOT run** — denied by sandbox. Not a finding against the code; ANVIL must run it.
- **Integration suite (16 tests): NOT run** — needs local Supabase + booted dev server. Read-reviewed; ANVIL must run it live.

## Contract verification
- **Byte-identical + R6 accepted deviation — CONFIRMED.** All status codes/bodies preserved; DB-error 500s now return `'Server error'` via the route catch instead of raw Postgres text. No other drift. POST reply `{ ok, problems }`: old `problems.length` vs new `caRows.length` are 1:1 equal (CA builder filters-then-maps the same set) — number unchanged. Same for monthly.
- **R-D1 (must-fix) — PASS.** `annual-review/route.ts:88-90` keeps `if (!id) → 400 'Review ID required'` BEFORE `findCurrent(id)` (line 95). Regression test `haccpReviewsRoutes.test.ts:430`.
- **R-D2 (best-effort CA) — PASS structurally.** Route does `await insertCorrectiveActions(caRows)` with no try/catch, but the adapter (`HaccpReviewsRepository.ts:122-136`) logs + returns on error, never throws — a CA failure cannot reach the outer catch or 500 the successful review. Fake mirrors this. (See 🟢 below.)
- **R-D3 / R-B2 (join shape) — PASS.** `HaccpAnnualReviewRepository.ts:45-52` returns the `signer/approver/creator` `{name}` joins verbatim, no remap; test `haccpReviewsRoutes.test.ts:354` asserts `creator` is a `{name}` object.
- **ConflictError → 409 — PASS.** `23505` → `ConflictError` in adapter (`HaccpAnnualReviewRepository.ts:89-93`); both POST + PATCH catches → 409 exact message; test line 379.

## Hexagonal / architecture
- Zero `@supabase/*` / `lib/adapters/**` imports in both routes — CONFIRMED (grep clean + lint green). Routes import only `@/lib/wiring/haccp`, `@/lib/errors`, `@/lib/domain` types.
- No new `package.json` deps, no `lib/` edits — CONFIRMED.
- Service-role only, no `…ForCaller` — CONFIRMED (deferral to F-RLS-04h documented in wiring header).
- Out-of-scope `annual-review/data/route.ts` + `overview/route.ts` — UNTOUCHED.
- Rip-out test — IMPROVED: swap DB = 2 new adapters + 2 wiring lines, routes/services unchanged.

## Depth verdicts (new/touched modules)
- `app/api/haccp/reviews/route.ts` → **DEEP ✅** — owns timezone/wall-clock window computation, role gate, type dispatch, reply shaping; delegates persistence only. Not a pass-through.
- `app/api/haccp/annual-review/route.ts` → **DEEP ✅** — owns the 401/403/400/404/409 lifecycle ordering at the edge; genuine orchestration.
- Services/adapters/ports were introduced in PR5 (shipped) — out of depth scope here. Each port has a real Supabase adapter + a fake = proven seam, not speculative.

## Findings
- 🔴 Blockers: **none**
- 🟡 Should-fix: **none**
- 🔵 Architecture notes: **none new** (RLS deferral is intentional)
- 🟢 Test-quality note: the R-D2 "best-effort" tests (`haccpReviewsFoundation.test.ts:339`, `HaccpReviewsService.test.ts:534`) prove an empty/successful CA write doesn't throw, but neither **forces a CA-insert DB failure** and asserts the parent review still returns 200. The swallow-on-error branch (`HaccpReviewsRepository.ts:131-135`) has no direct negative test. Held structurally (adapter is the only path and cannot throw) → not a blocker. **Suggested ANVIL add:** a fake seeded to fail `insertCorrectiveActions`, asserting the weekly POST still returns `{ ok: true }`.
- 🟢 The 16 new integration tests are genuinely behaviour-based (live HTTP, real status codes + exact body strings, CA rows verified by `source_id`, role gates, validation order). High quality.

## Handoff to ANVIL
- Run `tsc --noEmit` (couldn't run in audit).
- Run the live-Supabase integration suite.
- Add the R-D2 true-failure test (🟢 above).
- Full exhaustive browser-tap E2E on the prod-build preview for `/haccp/reviews` + `/haccp/annual-review` (happy + deviation).
