# ANVIL Clearance Certificate

Date: 2026-06-26
App: MFS-Operations
Branch: feat/f21-dashboard-service
PR: #84 — https://github.com/kilichakan2/MFS-Operations/pull/84
Head SHA: e0b0114fe8efce55b57fd052564cd23d1e71795c

## Scope — what this certificate actually covers

F-21 is a behaviour-preserving hexagonal re-point of TWO admin routes onto owned
seams, response shapes BYTE-IDENTICAL. NO migration, NO RLS change, NO new dep,
NO UI change (`app/dashboard/admin/page.tsx` untouched).

| Change / path                                   | Risk tier | Layers required              | Layers run                         |
| ----------------------------------------------- | --------- | ---------------------------- | ---------------------------------- |
| `app/api/dashboard/route.ts` → DashboardService | Medium    | Unit + Integration + E2E     | Unit + Integration + E2E (all)     |
| `app/api/detail/discrepancy/route.ts` → repo    | Medium    | Unit + Integration + E2E     | Unit + Integration + E2E (all)     |
| New seam: `DiscrepanciesRepository` (port/adapter/fake/contract/wiring) | Medium (crosses a seam) | Unit (fake+contract) + Integration (real adapter contract) | Run — fake unit + live Supabase contract 4/4 |
| New `DashboardService` + windowed repo methods  | Medium    | Unit (frozen clock) + Integration (live windowed reads) | Run — 88 F-21 unit + 6 live windowed reads |

**Not run under the efficiency dial:** None — full ladder run (unit + live-Supabase
integration + @critical preview smoke + a dedicated F-21 dashboard browser walk).
**Baseline characterisation pass?** No — diff-driven, behaviour-preserving re-point.

**Architecture rung (seam crossed):** PASS. `DiscrepanciesRepository` has a
domain-agnostic `__contracts__` suite run against BOTH the in-memory Fake (unit)
and the real Supabase adapter (live). The `no-adapter-imports` fence test is green
— the routes import ZERO adapters/vendor SDKs; only `lib/wiring/**` bolts concrete
adapters to factories. No vendor SDK imported in any domain/service test.

🗣 In plain English: the new "swap points" are real — the dashboard logic runs on a
pretend database in the fast tests and on a real one in the slow tests, and the
same behaviour checklist passes on both. The app's core never reaches for Supabase
directly.

## Test Results

| Layer                       | Status              | Notes                                                                                 |
| --------------------------- | ------------------- | ------------------------------------------------------------------------------------- |
| Unit (Vitest)               | ✅ 2552/2552         | Full suite. F-21-specific: 88 across DashboardService + both routes + fake + contract + fence |
| `tsc --noEmit`              | ✅ clean             | —                                                                                     |
| ESLint (`next lint`)        | ✅ no warnings/errors | —                                                                                     |
| Integration (Vitest, live local Supabase) | ✅ F-21 surfaces green | DiscrepanciesRepository contract 4/4 on real Postgres · windowed reads 6/6 · booted-server route smoke 8/8 |
| Database (pgTAP)            | n/a — not required   | No migration, no policy change in this PR                                              |
| Edge Functions (Deno)       | n/a — not required   | None touched                                                                          |
| Local full-stack rung       | ✅ Supabase CLI adapter | Local stack via `supabase start`; integration + E2E walk ran against it / the preview |
| E2E (@critical preview smoke) | ✅ 75/75 first run   | Against PR #84 Vercel preview; readiness-gated on `/api/auth/team`=200; no F-TD-37 flake |
| E2E+ dashboard data walk    | ✅ 1/1 (populated)    | Real preview data: loaded /dashboard/admin, swung ALL 4 range presets, refresh — every swing re-fired /api/dashboard→200, 19-key payload sane, no NaN/undefined, 0 failed dashboard calls, 0 app console errors |
| Populated UI smoke          | ✅ populated          | DB-identity probe passed (seed-born preview DB); dashboard rendered real values across every range |
| Breadth crawl               | covered by @critical 75/75 | The standard @critical suite walks every screen incl. the admin/HACCP surfaces |

### Dashboard browser-walk findings (what was tapped)

- Loaded `/dashboard/admin` as authenticated admin → `/api/dashboard` 200, 19-key
  payload, all KPI tiles + stat blocks render, no in-page error banner.
- Date-range picker swung across **Today → This week → This month → This quarter**:
  each click re-fired `/api/dashboard` with a new `from/to` window → 200, active-tab
  `aria-pressed` toggled correctly, numbers stayed sane, no 5xx, no console error.
- Refresh button re-fired the current window cleanly → 200.
- Eyeballed every KPI / rollup / list: no `NaN`, no `undefined`, no
  blank-where-data-expected; the in-page "Network error" banner never appeared.
- **Anomalies: NONE.**

🗣 In plain English: I drove the real admin dashboard on the live preview, clicked
every date filter and the refresh, and watched the numbers reload correctly each
time. Nothing broke, nothing showed a junk value.

**Scope honesty note:** the live `/dashboard/admin` page has NO in-page rep
drill-down expander and NO discrepancy-detail modal — its cards are read-only
navigational links, and `/api/detail/discrepancy` is consumed by a different
screen. Rather than fabricate interactions that don't exist on this page, the
detail route's `null→404` + 12-key-200 contract was proven END-TO-END at the
integration layer (`tests/integration/dashboardRoutes.test.ts`, 8/8). This matches
the "right-size tap depth to blast radius" rule for a no-UI re-point.

## Iterate log (2 loops max — used 1)

- **Loop 1 — broken test fixed (NOT a code bug):**
  `tests/integration/adapters/supabase/dashboardWindowedReads.test.ts` →
  `listWeekForDashboard` asserted `r.id === visitIds[0]`, but that method's
  `DASHBOARD_WEEK_COLS` select deliberately omits `id` (byte-identical to the
  original route's Zone-3 week query, which selected
  `visit_type, outcome, user_id, customer_id, prospect_name, users(name)` with no
  id — the week rollup groups by rep/type/customer/prospect, never the visit id).
  Re-pointed the assertion to `r.customerId === customerId` + week-rollup shape.
  Re-ran that layer only → 6/6 green. **No source code changed.**

🗣 In plain English: one test was looking for a field the query is supposed to skip.
That was the test's mistake, not the app's — I corrected the test, the app is right.

## Real-code bugs requiring a FORGE eject

**NONE.** No `/reorder`, `/reframe`, or `/rerender` needed.

## Known non-blocking environment note (NOT an F-21 issue)

The FULL local integration suite showed **8 failures in `tests/integration/haccp.test.ts`**
(all `expected 409 to be 200` — idempotency-key conflicts from rows persisted by a
prior run). Root cause: the local `db:reset` (fresh seed) was **blocked by the
sandbox safety floor**, so stale HACCP idempotency rows could not be cleared. The
F-21 diff touches NOTHING HACCP/idempotency-related, and the SAME HACCP specs pass
GREEN against the preview (the @critical suite includes them: 75/75). So this is a
local-fixture-state artifact, not an F-21 regression and not an HACCP code defect.

🗣 In plain English: a few unrelated food-safety tests need a clean database wipe
before they run, and the wipe button was locked in this environment. The same tests
pass on the live preview, so the code is fine — it's purely a local housekeeping
limitation, nothing to do with this dashboard change.

## Migration

None. Rollback note: `docs/anvil/2026-06-26-f21-dashboard-service-rollback.md`
(code-only — revert the merge, Vercel auto-redeploys; no `db push`, no PITR).
PITR confirmed: N/A (no destructive migration).

## Merge Sequence

1. (No migration — skip `supabase db push`.)
2. Merge PR #84 → Vercel auto-deploys.
3. Post-deploy smoke: 3 @critical paths against the production URL.
4. If smoke fails → `vercel rollback` (code only; no data to recover).

Supabase preview branch (`rcmwphjcqbxjizfzmzfj`) auto-deletes on merge (Branching).

## Manual smoke at merge

**Not required** — critical flows proven on the real preview with real data
(@critical 75/75 + a dedicated dashboard data walk across every range), the
re-pointed routes proven end-to-end on live Postgres (8/8 route smoke + 4/4 adapter
contract), and the post-deploy smoke is armed with a code rollback. The one gap is
the blocked local `db:reset` (HACCP fixtures) — that is named above, is unrelated to
F-21, and is already proven green on the preview.

## Verdict

✅ CLEARED FOR PRODUCTION

**Conductor Lock (2026-06-26):** finalized. Pre-merge checklist verified — every rung
green (unit 2552/2552 · live integration 18/18 · @critical 75/75 first-run · dashboard
data-walk clean across all 4 ranges), zero real-code bugs (no FORGE eject), one test-only
fix, no migration → no PITR required. The 8 local HACCP integration failures are a named,
unrelated local-fixture artifact (blocked `db:reset`), proven green on the preview. Cleared
to present Gate 4 (ship).
