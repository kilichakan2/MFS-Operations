# F-19 Cluster D PR6 — re-point the two HACCP reviews routes onto the PR5 hexagons

**Date:** 2026-06-24
**Unit:** F-19 PR6 (Cluster D, roadmap row 6 of the 7-cluster table — Days 13–14)
**Program plan:** `docs/plans/2026-06-12-sixteen-day-roadmap.md`
**Type:** Pure domain re-point (the 2nd step of the PR5→PR6 two-step rhythm). No new migration. Service-role only.
**Branch suggestion:** `f19-pr6-cluster-d-reviews-repoint`

🗣 In plain English: PR5 already built the new "engine room" plumbing (services/ports/adapters) but left it disconnected — dead code. PR6 is the moment we unplug the two web endpoints from talking to the database directly and plug them into that new plumbing instead. The lights must look exactly the same to anyone using the app, with ONE tiny intended change (see Deviation R6 below).

---

## Visual mini-map

```
DOMAIN (HACCP reviews core logic)
  ├─ HaccpReviewsRepository       (port) → [Supabase] (adapter)  ← reviews route
  └─ HaccpAnnualReviewRepository  (port) → [Supabase] (adapter)  ← annual-review route
🗣 two sockets already wired in lib/wiring/haccp.ts; PR6 just moves the two routes' plugs off the wall (direct Supabase) into the sockets
```

---

## Goal

Flip two production HACCP routes from importing `supabaseService` directly to calling the
PR5 wiring singletons, with **byte-identical** observable behaviour EXCEPT one accepted change
(the DB-error 500 body becomes `'Server error'` instead of raw Postgres text).

1. `app/api/haccp/reviews/route.ts` → `haccpReviewsService`
2. `app/api/haccp/annual-review/route.ts` → `haccpAnnualReviewService`

🗣 In plain English: two files change in `app/api/...` (the web endpoints). After this, neither talks to the database vendor directly — they go through the app-owned middle layer. Behaviour stays the same so HACCP records, weekly/monthly reviews, and the annual sign-off all work identically.

---

## Verification done before planning (every claim checked against the code)

All facts in the conductor's brief were verified against the files. Results:

- **Wiring singletons exist & exported** — `lib/wiring/haccp.ts:105` (`haccpReviewsService`) and `:108` (`haccpAnnualReviewService`). CONFIRMED. Service-role only; no `…ForCaller` present. ✓
- **R-B2 join shape** — adapter returns the aliased joins AS-IS (`ANNUAL_LIST_COLS`, `lib/adapters/supabase/HaccpAnnualReviewRepository.ts:45-52`, returned with no remap at `:74`). Domain models the join as `AnnualReviewUserRef | readonly AnnualReviewUserRef[] | null` (`lib/domain/HaccpAnnualReview.ts:33-36`, fields `:54-56`). The route currently reads it AS-IS too (`annual-review/route.ts:48` hands `data` straight to the wire — it does NOT dereference `signer.name` itself; the UI does). CONFIRMED — byte-identity holds. ✓
- **Deviation 1 — inserts RETURN `{id}`** — port `insertWeeklyReview`/`insertMonthlyReview` return `Promise<{ id: string }>` (`lib/ports/HaccpReviewsRepository.ts:42-44`); adapter does `.select('id').single()` and returns `{ id }` (`lib/adapters/supabase/HaccpReviewsRepository.ts:88-120`). CONFIRMED. ✓
- **Deviation 2 — CA writes best-effort (log, never throw, never abort)** — adapter `insertCorrectiveActions` logs on error and RETURNS (no throw), `lib/adapters/supabase/HaccpReviewsRepository.ts:122-136`; service just delegates `:232`; fake adapter never throws (`lib/adapters/fake/HaccpReviewsRepository.ts:84-87`). CONFIRMED. ✓
- **Deviation 3 — annual `23505` → `ConflictError` inside the adapter** — `lib/adapters/supabase/HaccpAnnualReviewRepository.ts:89-93`, exact route message. CONFIRMED. ✓
- **Naming landmine** — barrel exports the Cluster B allergen `MonthlyReviewRow`/`MonthlyReviewPersist` at `lib/domain/index.ts:197,200` AND the Cluster D `ReviewMonthlyRow`/`ReviewMonthlyPersist` (different `Review*` prefix) at `:252,255`. No collision. CONFIRMED. ✓
- **Errors module** — `lib/errors/` (folder, not a file): `ConflictError` (httpStatus 409) and `ServiceError`. Barrel `lib/errors/index.ts`. CONFIRMED.
- **Existing re-point template** — `app/api/haccp/food-fraud/route.ts` (PR3) is the canonical pattern: import the wiring singleton, role-gate + wall-clock stay at the route edge, `validate…` → 400 with `valid.message`/`valid.status`, generic catch → `'Server error'` 500. CONFIRMED.
- **ConflictError → 409 template** — `app/api/admin/users/route.ts:123-127` shows `if (err instanceof ConflictError) return 409`. CONFIRMED — PR6's annual POST mirrors this.
- **Out-of-scope routes untouched** — `app/api/haccp/annual-review/data/route.ts` and `app/api/haccp/overview/route.ts` exist and are NOT part of this PR.

---

## Domain terms (plain-English)

- **Re-point** — swapping which thing the route imports/calls. 🗣 Same room, different wiring behind the wall socket.
- **Service-role client** (`supabaseService`) — the master DB key that bypasses row-level security. 🗣 The skeleton key. Both routes use it today; PR6 keeps it (no RLS).
- **Best-effort write** — a side write that may fail without failing the main request. 🗣 "Post the letter; if the postbox is jammed, log it and move on — don't cancel the whole transaction."
- **`{name}` join object** — Supabase returns a populated to-one foreign key as a single object, not a list. 🗣 "Who signed this?" comes back as one card, not a stack of cards.

---

## Compliance / ADR check

- **ADR-0002 (hexagonal shape & naming)** — PR6 obeys it: routes (presentation) call the wiring singletons (which expose services), never adapters; routes drop their `@supabase/*` import. No conflict.
- **ADR-0003 (strangler-fig migration + freeze rule)** — PR6 IS a strangler step (route delegates to the new hexagon). No conflict.
- **ADR-0004 (RLS vs service-role security model)** — PR6 stays on service-role exactly as today; RLS deferred to F-RLS-04h (Cluster G). No conflict, no policy migration.
- **No other ADR conflicts.**

🗣 In plain English: none of the project's recorded architecture decisions are violated. PR6 is the expected second half of a pattern the codebase already uses 4 times (PR2–PR5).

---

## Files to change (exactly two)

| # | File | Change |
|---|------|--------|
| 1 | `app/api/haccp/reviews/route.ts` | Replace direct Supabase calls with `haccpReviewsService`; drop the `@/lib/adapters/supabase/client` import; route-edge keeps date helpers + role gate. |
| 2 | `app/api/haccp/annual-review/route.ts` | Replace direct Supabase calls with `haccpAnnualReviewService`; drop the `@/lib/adapters/supabase/client` import; add `ConflictError` import for the 409 catch; keep `@/lib/annualReview/sections` only for the types the route still references (see step 2.4 — most pure helpers move to the service). |

**No other files touched.** No `lib/`, no migrations, no `package.json`. (PR5 already created all hexagon files.)

🗣 In plain English: only the two endpoint files change. Everything they now call already exists on disk from PR5.

---

## Step-by-step plan

> Order matters: do route 1 fully (simpler, no ConflictError branch), run its tests, then route 2.

### Step 1 — re-point `app/api/haccp/reviews/route.ts`

**1.1 Imports.** Remove `import { supabaseService } from '@/lib/adapters/supabase/client'` and the `const supabase = supabaseService` line. Add `import { haccpReviewsService } from '@/lib/wiring/haccp'`.

**1.2 Keep at the route edge (unchanged):** the role-gate cookie reads, `todayUK()`, `thisWeekMonday()`, `thisWeekSunday()`, `thisMonthRange()`. These are timezone/wall-clock concerns the service deliberately does NOT own (the service takes computed dates IN — see `HaccpReviewsService` header, determinism constraint 8).

**1.3 GET body.** Replace the two `supabase.from(...)` Promise.all reads + the inline `weekly_done`/`monthly_done` computation with:
```ts
const result = await haccpReviewsService.getReviews({ monday, sunday, mFrom, mTo })
return NextResponse.json(result)
```
`getReviews` returns `{ weekly, monthly, weekly_done, monthly_done }` in that exact key order (`ReviewsListResult`), matching `reviews/route.ts:78-83`.
- **Removed:** the inline `if (weekly.error) return ...error.message...` / `if (monthly.error) ...` 500 branches (lines 69-70). On a DB read failure the adapter now throws `ServiceError`, caught by the generic catch → `'Server error'` 500. **This is Deviation R6** (see below).

**1.4 POST weekly branch (`type === 'weekly'`).** Replace inline validation + insert + CA write with:
```ts
const valid = haccpReviewsService.validateWeekly(body)
if (!valid.ok) return NextResponse.json({ error: valid.message }, { status: valid.status })

const persist = haccpReviewsService.buildWeeklyPersist({ input: body, userId, today: todayUK() })
const inserted = await haccpReviewsService.insertWeeklyReview(persist)

const caRows = haccpReviewsService.buildWeeklyCorrectiveActions({
  input: body, userId, reviewId: inserted.id, weekEnding: body.week_ending,
})
if (caRows.length > 0) await haccpReviewsService.insertCorrectiveActions(caRows)

return NextResponse.json({ ok: true, problems: caRows.length })
```
- `validateWeekly` reproduces the route's two 400 strings IN ORDER ("Week ending date required", then "Assessments required").
- `buildWeeklyCorrectiveActions` filters `state === 'problem'` and maps verbatim. `caRows.length` equals the old `problems.length` → the `{ ok, problems }` reply is identical.
- The `length > 0` guard matches old `reviews/route.ts:118`. CA write is best-effort (never throws) → review success reply preserved even if CA insert fails (Deviation 2).

**1.5 POST monthly branch (`type === 'monthly'`).** Mirror 1.4 with `validateMonthly` (four 400 strings in order), `buildMonthlyPersist({ input: body, userId, today: todayUK() })`, `insertMonthlyReview`, `buildMonthlySystemCorrectiveActions({ input: body, userId, reviewId: inserted.id, monthYear: body.month_year })`. The service applies the `invertFail` flip exactly (`HaccpReviewsService.ts:209-212`). Reply `{ ok: true, problems: caRows.length }`.

**1.6 Invalid-type + generic catch.** Keep the `'Invalid type — must be weekly or monthly'` 400 and the unchanged `catch (err)` → `console.error(...)` + `'Server error'` 500 (these were already `'Server error'`).

### Step 2 — re-point `app/api/haccp/annual-review/route.ts`

**2.1 Imports.** Remove `import { supabaseService } ...` + `const supabase = ...`. Add `import { haccpAnnualReviewService } from '@/lib/wiring/haccp'` and `import { ConflictError } from '@/lib/errors'`. Keep the `@/lib/annualReview/sections` import ONLY for the types still named in the route's body-destructure (`Checklist`, `ActionPlanItem`) — the pure helpers (`buildInitialChecklist`, `buildInitialActionPlan`, `isValidStatus`, `isValidReviewPeriod`, `canSignOff`) are now called inside the service, so drop those five from the import if nothing else in the route uses them.

**2.2 GET body.** Replace the inline select + 500 branch with:
```ts
const result = await haccpAnnualReviewService.getReviews()
return NextResponse.json(result)
```
`getReviews` returns `{ reviews }` (`AnnualReviewListResult`), joins AS-IS (R-B2). The old `if (error) return ...error.message... 500` (line 47) is removed → DB error now throws `ServiceError` → generic catch → `'Server error'` 500 (**Deviation R6**).

**2.3 POST body (create draft).**
```ts
const valid = haccpAnnualReviewService.validateCreate(body)
if (!valid.ok) return NextResponse.json({ error: valid.message }, { status: valid.status })

const review = await haccpAnnualReviewService.createDraft(
  haccpAnnualReviewService.buildCreatePersist({ input: body, userId, now: new Date() }),
)
return NextResponse.json({ review }, { status: 201 })
```
- `validateCreate` reproduces the two 400s in order (year required; invalid period).
- The unique-draft `23505` is mapped to `ConflictError` INSIDE the adapter. The route's catch (step 2.6) turns it into the 409 with the exact message. **The inline `if (error.code === '23505')` block at lines 99-105 is removed** — that logic now lives in the adapter + the catch.

**2.4 PATCH body.** This is the most involved branch. Order of operations must match `annual-review/route.ts:118-226`:
```ts
const { id, checklist, action_plan, sign_off } = body
// fetch-before-update (404 decision stays at the route edge)
const current = await haccpAnnualReviewService.findCurrent(id)   // null on miss/error
if (!current) return NextResponse.json({ error: 'Review not found' }, { status: 404 })
if (current.locked) return NextResponse.json({ error: 'This review is locked and cannot be edited' }, { status: 409 })

const valid = haccpAnnualReviewService.validatePatch({ input: body, currentChecklist: current.checklist })
if (!valid.ok) return NextResponse.json({ error: valid.message }, { status: valid.status })

if (sign_off) {
  const signed = await haccpAnnualReviewService.signOff(
    id,
    haccpAnnualReviewService.buildSignOffPersist({ input: body, current, userId, now: new Date() }),
  )
  return NextResponse.json({ review: signed })
}

const updated = await haccpAnnualReviewService.update(
  id,
  haccpAnnualReviewService.buildUpdatePersist({ input: body, now: new Date() }),
)
return NextResponse.json({ review: updated })
```

**⚠ Ordering subtlety — must be preserved exactly.** In the CURRENT route, the order is:
  1. `if (!id) → 400 'Review ID required'` (line 134) — happens BEFORE the DB fetch.
  2. fetch → `fetchErr || !current → 404` (line 145).
  3. `current.locked → 409` (line 148).
  4. checklist-shape validation loop (lines 153-170).
  5. sign-off validation (lines 173-185).

The service's `validatePatch` bundles steps **1, 4, and 5** (id-required, checklist-shape, sign-off) — but NOT 2/3 (those need `findCurrent`'s result and stay route-edge). **`validatePatch` checks `!input.id` FIRST**, BUT in the re-pointed route we call `findCurrent(id)` BEFORE `validatePatch`. If `id` is missing/empty, `findCurrent('')` runs first and returns `null` → the route would return **404 instead of the original 400 'Review ID required'**.

  **→ FIX (must-encode): keep the explicit `if (!id) return 400 'Review ID required'` guard at the route edge, BEFORE the `findCurrent` call.** Then call `validatePatch` after the locked check. The `validatePatch` id-check then becomes a harmless redundant guard (defensive; never reached). This preserves the exact original ordering. **R-D1 risk below.**

**2.5 Removed inline logic.** The `buildInitialChecklist`/`buildInitialActionPlan` in POST and the `canSignOff`/`isValidStatus`/`isValidReviewPeriod` loops in PATCH are all gone from the route (now inside the service). The `new Date().toISOString()` calls move to `new Date()` passed into the `build…Persist` functions (service computes `.toISOString()`).

**2.6 Generic catch + ConflictError branch.** Replace the per-call `error.message` 500s with a single catch:
```ts
} catch (err) {
  if (err instanceof ConflictError) {
    return NextResponse.json({ error: err.message }, { status: 409 })
  }
  console.error('[<METHOD> /api/haccp/annual-review]', err)
  return NextResponse.json({ error: 'Server error' }, { status: 500 })
}
```
- `ConflictError.message` was set by the adapter to the exact route string ("A draft review already exists. Complete or delete it before starting a new one.") → 409 body byte-identical.
- All other DB failures (`ServiceError`) → `'Server error'` 500 (**Deviation R6** — replaces the old `signErr.message`/`updateErr.message`/`error.message` leaks at lines 47, 106, 203, 219).
- Apply this catch shape to GET, POST, and PATCH (GET has no ConflictError path but the uniform catch is harmless and matches the food-fraud template).

---

## The ONE accepted behaviour change — Deviation R6 (DB-error 500 body)

**Every place a raw Postgres/error string currently leaks into a 500 body, it becomes `'Server error'`.** Exact locations changing:

| File | Line(s) today | Old 500 body | New 500 body |
|------|---------------|--------------|--------------|
| reviews/route.ts | 69, 70 | `weekly.error.message` / `monthly.error.message` | `'Server error'` |
| reviews/route.ts | 112, 153 | `error.message` (insert) | `'Server error'` |
| annual-review/route.ts | 47 | `error.message` (GET) | `'Server error'` |
| annual-review/route.ts | 106 | `error.message` (POST non-409) | `'Server error'` |
| annual-review/route.ts | 203, 219 | `signErr.message` / `updateErr.message` | `'Server error'` |

**NOT changing:** all 400/401/403/404/409 bodies (validation, role gates, not-found, locked, duplicate-draft) stay byte-identical. The 200/201 success bodies stay byte-identical. The 409 duplicate-draft message stays exact (carried via `ConflictError.message`).

🗣 In plain English: the only visible difference is that when the database itself errors out, the app now says "Server error" instead of dumping raw database wording to the caller. That's a security improvement (no internal detail leak) and the intended sole deviation. Everything a normal user does looks identical.

---

## What stays byte-identical (the contract)

- GET reviews response: `{ weekly, monthly, weekly_done, monthly_done }`, same key order, same limits (10/6), same `users!inner(name)` join, same done-predicates.
- GET annual response: `{ reviews }`, `created_at DESC`, joins returned AS-IS (R-B2 object/array/null union).
- POST reviews replies: `{ ok: true, problems: N }`, N identical, CA rows verbatim (every field + fallback string), best-effort swallow preserved.
- POST/PATCH annual: same 201/200 shapes, same draft/lock/sign-off semantics, same 409 duplicate-draft message, same 404/locked guards, same validation strings + ordering.

---

## TDD / test plan

**Already exists (from PR5 — re-run, must stay green):**
- Unit: `HaccpReviewsService` + `HaccpAnnualReviewService` spec files (validation strings, build…Persist, CA builders, invertFail flip) — these pin the pure logic the route now delegates to.
- Integration: `tests/integration/haccpReviewsFoundation.test.ts` drives the services DIRECTLY against local Supabase and PINS the R-B2 join shape.

**PR6 ADDS:**
1. **Route-level integration** (`tests/integration/` — new file, e.g. `haccpReviewsRoutes.test.ts`) hitting the live HTTP routes on the booted dev server:
   - GET `/api/haccp/reviews` (admin) → shape + done flags; non-admin → 401.
   - POST `/api/haccp/reviews` weekly with a `state:'problem'` item → 200 `{ok,problems:1}` AND a CA row landed (assert the specific `source_id`). Weekly with no problems → `{ok,problems:0}`, no CA row.
   - POST monthly with an `invertFail` item set to trigger → CA created; verify the flip.
   - Validation 400s: missing `week_ending`, missing `assessments`, missing monthly fields — exact strings + order.
   - Annual GET (warehouse/butcher/admin allowed) → `{reviews}`, join shape `{name}`. POST draft → 201; second draft → **409 exact message**. PATCH missing id → **400 'Review ID required'** (R-D1 regression pin). PATCH unknown id → 404. PATCH locked → 409. PATCH sign-off happy path → `locked:true`.
   - **R6 pin:** force a DB error path if feasible → assert body is `'Server error'`, never raw text. (If hard to force in integration, cover via the unit/adapter layer + note as E2E-observed.)
2. **Browser-tap E2E matrix** (Playwright, prod-build preview) for `/haccp/reviews` and `/haccp/annual-review` — every screen/button per the "full browser-tap depth" standard: submit a weekly review (with and without a flagged item), submit a monthly review, view history, create an annual draft, attempt a second draft (expect the 409 toast), edit checklist, sign off, confirm lock. Confirm no console errors and the on-screen signer/approver/creator names render (R-B2 read).

🗣 In plain English: the existing PR5 tests prove the new plumbing works in isolation. PR6 adds tests that drive the REAL web endpoints (and a real browser) end-to-end, so we catch any wiring or ordering mistake before it ships.

---

## Risk Assessment

### R-D1 — PATCH validation ordering: 400-vs-404 regression — **MUST-FIX**
- **Category:** business-logic flaw. **Severity: High** (changes a user-visible status code if mishandled).
- The service's `validatePatch` checks `!id` first, but the re-pointed route must call `findCurrent(id)` before validation (to get `current.checklist` for sign-off validation + the locked/404 guards). A missing `id` would hit `findCurrent('')` → `null` → 404, whereas the original returns **400 'Review ID required'**.
- **Mitigation:** keep an explicit `if (!id) return 400 'Review ID required'` guard at the route edge BEFORE `findCurrent` (step 2.4). Add the integration test "PATCH with no id → 400" as a regression pin.
- **Must-fix:** yes — the plan encodes the fix; implementer must not skip the route-edge id guard.

### R-D2 — best-effort CA swallow accidentally made fatal — Medium
- **Category:** business-logic flaw. If the implementer wraps `insertCorrectiveActions` so a failure throws (or forgets it's fire-and-forget), a CA DB hiccup would turn a successful review into a 500 — a behaviour change and a compliance data-loss risk (the review must still record).
- **Mitigation:** the adapter + fake already swallow (verified). The route must NOT add error handling around the CA call beyond the existing generic catch; `insertCorrectiveActions` returns `void` and never throws by contract. Integration test: simulate/observe a CA failure does not 500 the review (at minimum assert the happy path returns 200 with the review persisted independently of CA).
- **Must-fix:** no (the contract is already correct), but called out as a do-not-break invariant.

### R-D3 — R-B2 join shape mis-read — Medium
- **Category:** business-logic / data-shape. If the adapter ever normalised the join (it does NOT — returns AS-IS) or the union type were narrowed, the annual list would mis-render signer/approver/creator names.
- **Mitigation:** adapter returns `data` unremapped (verified `:74`); PR5 integration test pins the shape; PR6 E2E confirms names render in the browser. No code change needed; verify in ANVIL.
- **Must-fix:** no.

### R-D4 — raw-error 500 leak NOT fully closed — Low
- **Category:** security (info disclosure). If any inline `error.message` 500 is left behind, Deviation R6 is incomplete and Postgres internals still leak.
- **Mitigation:** the file table above lists every leak site; reviewer greps both routes post-edit for `.message`/`error.message`/`signErr`/`updateErr` in any `NextResponse` — none should remain except inside `ConflictError` (which is an app-owned message, safe).
- **Must-fix:** no (it's the intended improvement; just verify completeness).

### R-D5 — leftover `@supabase/*` import — Low (rip-out + lint blocker)
- **Category:** launch blocker. If a route keeps the `@/lib/adapters/supabase/client` import, the rip-out test fails and lint (`no-adapter-imports` / vendor-import rule) blocks the PR.
- **Mitigation:** step 1.1 / 2.1 explicitly remove it; ANVIL lint catches any residue.
- **Must-fix:** no (mechanical; enforced by lint).

### Concurrency / race conditions
- No new concurrency surface. The unique-draft race (two simultaneous POSTs) is handled by the DB unique index → `23505` → `ConflictError` → 409, unchanged from today. **No material new risk.**

### Security
- Service-role only, unchanged (ADR-0004 honoured). Role gates stay at the route edge, byte-identical. The ONLY security-relevant change is the *positive* R6 (stop leaking raw DB errors). **No new risk; one improvement.**

### Data migration
- **None.** No schema change, no migration file. **No risk.**

### Launch blockers
- R-D1 is the one must-fix (status-code regression) — resolved by the plan's route-edge id guard. R-D5 is lint-enforced. **One must-fix, mitigated in-plan.**

---

## Hexagonal verdict (computed — populates Gate 2)

- **Port(s) used:** `HaccpReviewsRepository`, `HaccpAnnualReviewRepository` (both already exist, `lib/ports/`). No new port. The routes now depend on the services that depend on these ports.
- **Adapter(s):** `lib/adapters/supabase/HaccpReviewsRepository.ts`, `lib/adapters/supabase/HaccpAnnualReviewRepository.ts` (both already exist; wired in `lib/wiring/haccp.ts`). No adapter change.
- **New dependencies:** **none.** No `package.json` entry added or expected.
- **Single-use vendor wrapping:** N/A — no new vendor; Supabase already wrapped behind the adapters.
- **Rip-out test:** after PR6, replacing Supabase for Cluster D reviews = write one new adapter per port + change the two wiring lines in `lib/wiring/haccp.ts`. The two routes (now vendor-free) do not change. **PASS.** (PR6 strictly *improves* the rip-out: it removes the last two direct `@supabase/*` route imports for this cluster.)

🗣 In plain English: PR6 uses sockets and plugs that already exist — it just connects them. Swapping the database vendor tomorrow would touch one adapter per port plus two wiring lines, nothing in the endpoints. That's the Lego rule, passed.

---

## Acceptance criteria

1. Both routes import `haccpReviewsService` / `haccpAnnualReviewService` from `@/lib/wiring/haccp` and contain ZERO `@supabase/*` / `@/lib/adapters/*` imports.
2. All non-500 response bodies (200/201/400/401/403/404/409) byte-identical to pre-PR6, including exact validation strings, ordering, and the 409 duplicate-draft message.
3. DB-error 500 bodies are `'Server error'` (Deviation R6), no raw Postgres text anywhere.
4. PATCH with missing `id` returns 400 'Review ID required' (R-D1 pin).
5. CA writes remain best-effort: a CA failure never 500s nor blocks a successful review insert.
6. Existing PR5 unit + `haccpReviewsFoundation.test.ts` integration stay green; new route-level integration + the full browser-tap E2E matrix pass on the prod-build preview.
7. No migration, no `package.json` change.
8. Rip-out test = PASS (one adapter per port + two wiring lines).
