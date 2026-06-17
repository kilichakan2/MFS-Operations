# FORGE Guard Review — F-14 PR1 (Delivery Routes domain, introduce-only)

- **Date:** 2026-06-17
- **Branch / PR:** `feat/f-14-routes-domain-pr1` / PR #50
- **Plan:** `docs/plans/2026-06-17-f-14-delivery-routes-domain.md` (§6 PR1 table)
- **Reviewer:** code-critic subagent (FORGE Guard)

## Verdict: SHIP (no blockers)

Clean, careful work faithfully copying the proven Orders/Users template. Nothing can break
production because nothing in production calls it yet (introduce-only). The two raised findings
are PR2 carry-forward items, not PR1 defects.

## Introduce-only invariants — all confirmed
- `git diff --name-only main...HEAD`: zero `app/**`, zero `supabase/migrations/**`, zero `package.json`.
- `grep routesService app/ components/`: no production importer.
- `routesServiceForCaller` present, unused, never memoized, commented for F-RLS-04c (`lib/wiring/routes.ts:60-68`).

## Test / lint / typecheck
- `npm run typecheck` — clean.
- `npm run lint` — clean.
- F-14 unit tests (ukDateAndHour + RoutesService + Fake contract + lint-pin) — **63/63**.
- Supabase integration contract (`adapters/supabase/RoutesRepository`) vs local Postgres — **15/15** (ran live, not skipped).

## Depth verdicts (new/touched modules)
- `lib/ports/RoutesRepository.ts` → **DEEP** — 8 methods, each hides real work (embedded join + position sort + vendor→domain map on reads; insert-with-rollback / delete-then-insert replace on writes). 1:1 to PR2 endpoints; none speculative.
- `lib/adapters/supabase/RoutesRepository.ts` → **DEEP** — join collapse, `num()` coercion, embed-shape normalisation, rollback orchestration all behind the port.
- `lib/adapters/fake/RoutesRepository.ts` → **DEEP** — reproduces UNIQUE-constraint + cascade semantics.
- `lib/services/RoutesService.ts` → **DEEP-ENOUGH** — owns 7pm rollover + Mon–Sun week default; other six methods are honest, labelled passthroughs (same posture as OrdersService/UsersService). Not a pass-through-as-the-point.
- `lib/utils/ukDateAndHour.ts` (`getUKWeekBounds`) → **DEEP** — Mon–Sun math behind a one-arg call.
- `lib/wiring/routes.ts` → composition root, correctly the only business-layer importer of `lib/adapters/**`.

**Rip-out test: PASS** — replace Supabase for Routes = one new adapter file + two lines in `lib/wiring/routes.ts`; domain + service untouched.

## The 5 flagged judgement calls — all cleared
1. **BACKLOG ARCH-FU-06** (`docs/plans/BACKLOG.md:210-216`) — correctly formatted/numbered; names the deferred files + the two ports (Geocoder/RouteOptimizer). ✅
2. **`getUKWeekBounds` signature + math** (`lib/utils/ukDateAndHour.ts:55-75`) — correct; `now: Date = new Date()` evaluated per-call (no shared-mutable trap; JS not Python); `(day+6)%7` correct; noon anchor sidesteps DST. ✅
3. **`num()` coercion** (`lib/adapters/supabase/RoutesRepository.ts:91-95`) — null/undefined→null, NaN→null, adapter-only. ✅
4. **`createdAt: ""` on single reads** — see W1 (non-blocking PR2 item).
5. **`replaceRoute` partial-failure strings** (`...RoutesRepository.ts:433,459`) — **byte-identical** to originals (`app/api/routes/[id]/route.ts:140,167`); app-owned ServiceError with vendor error as `cause` is the correct boundary. ✅

## 🟡 Should-fix (PR2, non-blocking for PR1)
- **W1 — `createdAt: ""` empty-string sentinel** (`lib/adapters/supabase/RoutesRepository.ts:201`). `getRouteById`/`getNextRouteForUser` use `SINGLE_COLS` (no `created_at`); domain `Route.createdAt: string` (non-optional, `lib/domain/Route.ts:69`) forces `""`. Harmless in PR1 (no consumer; those endpoints don't carry `created_at` today). **PR2 must NOT echo `createdAt` for `[id]`/`today`.** Cleaner fix: make `Route.createdAt: string | null`, emit `null` here.

## 🔵 Architecture / parity notes (follow-up)
- **N1 — Fake-vs-Supabase divergence on `creator`/`createdBy`/`createdAt` for single reads.** Fake (`lib/adapters/fake/RoutesRepository.ts:139-141`) returns real stored values; Supabase returns `null/null/""` (SINGLE_COLS omits them). Contract never asserts these on single reads → suites stay green but adapters genuinely differ. Tighten by (a) Fake mirrors the omission, or (b) add a contract assertion.
- **N2 — `visited` column parity in GET-one select.** Today's `app/api/routes/[id]/route.ts:36-40` GET omits `visited` on stops; adapter's `SINGLE_COLS` includes it (via `FULL_STOP_COLS`). **PR2 will ADD `visited` to the `[id]` GET response** — almost certainly desirable (`today` already returns it) but PR2 must own this consciously, not inherit silently.

## 🟢 Positives
- Shared contract (`lib/ports/__contracts__/RoutesRepository.contract.ts`) runs the SAME 15 assertions against both Fake and Supabase (verified by running both). Asserts behaviour through the port (position-sorted reads, rollback leaves no header, replace reuses positions, tie-break ordering, idempotent delete) — not internals.
- 7pm rollover tests pin 18:59→today / 19:00→tomorrow by spying the exact `minDate` string (`RoutesService.test.ts:54,67`) + BST trap; week-boundary test pins Sunday→prior Monday (`ukDateAndHour.test.ts:134-140`).
- No `console.log` in new adapter/service code.
- `routesServiceForCaller` parking comment (`lib/wiring/routes.ts:35-59`) explains why unused + why never memoized.

## Loop-back: NONE
Hand to ANVIL. W1/N1/N2 are PR2 carry-forward — record on the cert / PR description so PR2 picks them up.
