# F-19 Cluster D PR5 — Reviews foundation (introduce-only, dead code)

**Date:** 2026-06-23
**Unit:** F-19 PR5 (Cluster D)
**Phase:** Order of FORGE (plan locked at Gate 1)
**Type:** introduce-only / dead code — two new HACCP hexagons, fully UNWIRED.

🗣 **In plain English:** We are building two new self-contained "engines" for the HACCP
reviews screens (weekly/monthly reviews, and the annual SALSA review), wiring them up to
the database, but plugging them into NOTHING. No screen calls them yet. They sit there,
compiled and tested, like a spare engine on a stand. A LATER, separate PR (PR6) drops them
into the running car. This PR cannot change any live behaviour because nothing live touches
the new code.

```
DOMAIN (HACCP core logic)
  ├─ HaccpReviews (port, NEW) → [Supabase] (adapter, NEW) + [Fake] (adapter, NEW)
  └─ HaccpAnnualReview (port, NEW) → [Supabase] (adapter, NEW) + [Fake] (adapter, NEW)
🗣 Two new sockets the app owns; each gets one real plug (Supabase) + one test plug (Fake).
```

---

## 1. Goal

Add two new ports + services + adapters + domain types for the HACCP reviews surface, wire
them as **service-role singletons only** in `lib/wiring/haccp.ts`, and prove zero behaviour
change. This mirrors the F-19 PR1 / PR3 / PR4 introduce-only template **exactly**: PR6 (out
of scope) will re-point `app/api/haccp/reviews/route.ts` and `app/api/haccp/annual-review/route.ts`
to call these singletons byte-identically.

🗣 **In plain English:** Build the engines, bolt them to the database, test them, leave them
unplugged. The whole job is judged on one promise: nothing the user can see changes today.

### Two hexagons

- **HaccpReviews** — weekly + monthly reviews (`haccp_weekly_review`, `haccp_monthly_review`).
  Must MODEL, as dead code, the **corrective-action side-effect**: today's POST auto-creates
  rows in `haccp_corrective_actions` when a check fails (weekly = `state==='problem'` items;
  monthly = HACCP-system-review fails via `invertFail` logic). The service must reproduce the
  route's EXACT CA writes so PR6 re-points byte-identically.
  🗣 When a weekly/monthly review flags a problem, the system today auto-logs a "corrective
  action" ticket. Our new engine has to recreate that ticket-writing behaviour move-for-move,
  even though nothing runs it yet — so PR6 is a like-for-like swap, not a rewrite.

- **HaccpAnnualReview** — annual SALSA 3.1 review (`haccp_annual_reviews` ONLY). Lifecycle:
  GET list, POST create draft (unique-draft constraint → one draft at a time), PATCH update
  checklist/action_plan, PATCH sign-off (sets `locked=true`, `signed_off_by`, `approved_by`,
  `approved_at`).
  🗣 The yearly food-safety review: one draft at a time, you fill it in, then you "sign off"
  which locks it forever. Our engine models that whole draft→edit→lock journey.

---

## 2. Domain terms (glossary for this unit)

- **Hexagon** — one self-contained slice = domain types + a port (interface) + a service
  (logic) + a Supabase adapter (real DB) + a Fake adapter (in-memory test twin) + one wiring
  line. 🗣 One complete "engine on a stand", all five parts.
- **Corrective-action (CA) side-effect** — the auto-creation of `haccp_corrective_actions`
  rows that the reviews POST does after inserting the review, when items failed. 🗣 The
  problem-ticket the system writes for you when a review flags something.
- **`invertFail`** — a per-item flag on the monthly HACCP-system-review JSON: for normal
  items `result === 'NO'` is the problem; for `invertFail` items (`procedures_revise`,
  `equipment_upgrade`) `result === 'YES'` is the problem. 🗣 Some questions are "yes is bad,
  no is good", others are flipped; this flag says which.
- **Unique-draft constraint** — `idx_annual_reviews_one_draft`, a partial UNIQUE index on
  `(locked)` WHERE `locked = false`, so only one unlocked (draft) annual review can exist.
  Inserting a second draft fails with Postgres `23505`. 🗣 You can only have one annual review
  open at a time; the database itself blocks a second.
- **Service-role singleton** — a pre-wired instance using the RLS-bypassing master key,
  exactly the access the routes have today. 🗣 The master-key version, same power the live
  routes already have, so PR6 is a true like-for-like.
- **introduce-only / dead code** — the new files compile and are tested but have ZERO callers
  in `app/**`. 🗣 Installed but unplugged.

---

## 3. Compliance / architecture flags

- **ADR-0002 (hexagonal shape & naming)** — fully respected: domain + ports import no
  adapters; vendor SDK (`@supabase/supabase-js`) only inside `lib/adapters/supabase/`; vendor
  types never leak (rows mapped at the adapter boundary); wiring is the only business-layer
  file importing `lib/adapters/**`.
- **ADR-0003 (strangler-fig / freeze rule)** — introduce-only is the canonical strangler step.
  No route frozen, no behaviour changed.
- **ADR-0004 / ADR-0007 (RLS vs service-role)** — **service-role singletons ONLY**. NO
  `…ForCaller` authenticated factory (deferred to F-RLS-04h, Cluster G), matching PR1/PR3/PR4.
- **No new `package.json` dependency** — reuses `@supabase/supabase-js` (already wrapped),
  `@/lib/errors`, `@/lib/observability/log`, and `@/lib/annualReview/sections` (pure, vendor-free).
- **`lib/annualReview/sections.ts` is NOT modified** — the plan IMPORTS its pure builders
  (`buildInitialChecklist`, `buildInitialActionPlan`, `isValidStatus`, `isValidReviewPeriod`,
  `canSignOff`, and the `Checklist` / `ActionPlanItem` types). Spec bars rewriting it.

🗣 **In plain English:** This change obeys every standing architecture rule and adds no new
vendor library. It re-uses the existing annual-review checklist logic file untouched.

### ADR conflicts: NONE.

---

## 4. Out of scope (do NOT build)

- NO route edits, NO migration, NO behaviour change.
- NO `…ForCaller` / authenticated factory (service-role only).
- NO Cluster E query-services — `app/api/haccp/annual-review/data/route.ts` and
  `app/api/haccp/overview/route.ts` (each reads 10+ tables) are the NEXT cluster. Leave
  untouched; do not model them.
- Do NOT touch `lib/annualReview/sections.ts` behaviour (import only).

---

## 5. Exact file list

### CREATE (12 files)

| # | Path | Layer |
|---|------|-------|
| 1 | `lib/domain/HaccpReviews.ts` | domain types (weekly/monthly + CA side-effect) |
| 2 | `lib/domain/HaccpAnnualReview.ts` | domain types (annual lifecycle) |
| 3 | `lib/ports/HaccpReviewsRepository.ts` | port |
| 4 | `lib/ports/HaccpAnnualReviewRepository.ts` | port |
| 5 | `lib/services/HaccpReviewsService.ts` | service |
| 6 | `lib/services/HaccpAnnualReviewService.ts` | service |
| 7 | `lib/adapters/supabase/HaccpReviewsRepository.ts` | Supabase adapter |
| 8 | `lib/adapters/supabase/HaccpAnnualReviewRepository.ts` | Supabase adapter |
| 9 | `lib/adapters/fake/HaccpReviewsRepository.ts` | Fake adapter |
| 10 | `lib/adapters/fake/HaccpAnnualReviewRepository.ts` | Fake adapter |
| 11 | `tests/unit/services/HaccpReviewsService.test.ts` | unit test |
| 12 | `tests/unit/services/HaccpAnnualReviewService.test.ts` | unit test |

### MODIFY (6 barrels + 1 wiring = 7 files)

| # | Path | Change |
|---|------|--------|
| 13 | `lib/domain/index.ts` | re-export the new domain types |
| 14 | `lib/ports/index.ts` | re-export the 2 new port interfaces |
| 15 | `lib/services/index.ts` | re-export the 2 new factories + types |
| 16 | `lib/adapters/supabase/index.ts` | re-export the 2 new factories + singletons |
| 17 | `lib/adapters/fake/index.ts` | re-export the 2 new factories + singletons + Fake types |
| 18 | `lib/wiring/haccp.ts` | add 2 service-role singleton wiring blocks |

**ZERO files in `app/**`. ZERO migrations. ZERO `package.json` changes.**

🗣 **In plain English:** 12 brand-new files (the two engines + their tests) and 7 edits, all
of which are "export the new thing from the index" plus two wiring lines. Nothing under the
`app/` folder (the live screens/routes) is touched at all.

---

## 6. Per-file detail

### 6.1 `lib/domain/HaccpReviews.ts` (CREATE)

Pure TS, no framework/vendor imports. Mirrors `HaccpTraining.ts` / `HaccpPeople.ts` style:
Row types carry the route's verbatim `.select()` columns; Input types carry the POST bodies;
Persist types carry the insert payloads.

**Module-local user-ref (R-collision):** define `ReviewUserRef = { readonly name: string }`
LOCALLY (NOT re-exported from the barrel) to avoid colliding with `HaccpUserRef` /
`HealthRecordUserRef` already in the domain barrel. The weekly/monthly GET joins are
`users!inner(name)` (INNER — a row with null `submitted_by` is dropped).

Types:

- `WeeklyReviewRow` — verbatim from `reviews/route.ts:59`
  `.select('id, week_ending, date, assessments, submitted_at, users!inner(name)')`:
  `id, week_ending, date, assessments: unknown, submitted_at, users: ReviewUserRef`.
- `MonthlyReviewRow` — verbatim from `reviews/route.ts:64`
  `.select('id, month_year, date, equipment_checks, facilities_checks, haccp_system_review, further_notes, submitted_at, users!inner(name)')`:
  `id, month_year, date, equipment_checks: unknown, facilities_checks: unknown,
  haccp_system_review: unknown, further_notes: string | null, submitted_at, users: ReviewUserRef`.
- `WeeklyAssessmentItem` — the assessments array element the route filters on
  (`reviews/route.ts:115`): `id: string, label: string, state: string, action?: string, caHint?: string`.
- `MonthlySystemItem` — the haccp_system_review element (`reviews/route.ts:158`):
  `id: string, label: string, result: string, notes?: string, caHint?: string, invertFail?: boolean`.
- `CreateWeeklyReviewInput` — POST body (`reviews/route.ts:103`):
  `week_ending?: string, assessments?: WeeklyAssessmentItem[]`.
- `CreateMonthlyReviewInput` — POST body (`reviews/route.ts:138`):
  `month_year?: string, equipment_checks?: unknown, facilities_checks?: unknown,
  haccp_system_review?: MonthlySystemItem[], further_notes?: string`.
- `WeeklyReviewPersist` — insert payload (`reviews/route.ts:109`):
  `submitted_by: string, week_ending: string, date: string, assessments: unknown`.
- `MonthlyReviewPersist` — insert payload (`reviews/route.ts:146-150`):
  `submitted_by: string, month_year: string, date: string, equipment_checks: unknown,
  facilities_checks: unknown, haccp_system_review: unknown, further_notes: string | null`.
  ⚠ Name-collision note: `MonthlyReviewPersist` ALREADY exists in `HaccpAssessment.ts`
  (the Cluster B *allergen* monthly review — a DIFFERENT table). To avoid a barrel clash,
  name THESE `WeeklyReviewSubmitPersist` / `MonthlyReviewSubmitPersist`, OR namespace the
  reviews exports. **Decision: prefix this hexagon's types `Review*`** —
  `ReviewWeeklyRow`, `ReviewMonthlyRow`, `ReviewWeeklyPersist`, `ReviewMonthlyPersist`,
  `CreateReviewWeeklyInput`, `CreateReviewMonthlyInput` — so NO existing barrel symbol
  (`MonthlyReviewRow`, `MonthlyReviewPersist` from `HaccpAssessment.ts`) collides. The
  implementer MUST grep `lib/domain/index.ts` for each new exported name before adding it.
- **CA side-effect types (module-local CA insert — the dead-code modelling):**
  - `ReviewCorrectiveActionInsert` — the EXACT insert object the route builds
    (`reviews/route.ts:119-129` weekly, `:163-173` monthly). Keys verbatim:
    `actioned_by: string, source_table: 'haccp_weekly_review' | 'haccp_monthly_review',
    source_id: string, ccp_ref: string, deviation_description: string, action_taken: string,
    product_disposition: 'assess', recurrence_prevention: string,
    management_verification_required: true`.
    ⚠ Do NOT reuse `CorrectiveActionInsert` from `HaccpCorrectiveAction.ts`: its
    `HaccpCASourceTable` union does NOT contain `haccp_weekly_review` /
    `haccp_monthly_review`. The reviews CA writer is a DIFFERENT writer over the SAME table
    with two NEW source-table literals. Keep this type module-local (do not widen the shared
    union — that would touch Cluster A's domain).
- `ReviewsListResult` — the EXACT GET response shape (`reviews/route.ts:78-83`), key order
  `weekly, monthly, weekly_done, monthly_done`:
  `weekly: readonly ReviewWeeklyRow[], monthly: readonly ReviewMonthlyRow[],
  weekly_done: boolean, monthly_done: boolean`.

🗣 **In plain English:** This file is the dictionary of shapes for weekly/monthly reviews,
copied column-for-column from what the live route reads and writes, including the exact shape
of the "problem ticket" the route auto-creates. The tricky bit: an existing file already uses
some of these names for a *different* table, so we prefix ours with `Review` to avoid a clash.

### 6.2 `lib/domain/HaccpAnnualReview.ts` (CREATE)

Pure TS. Re-uses `Checklist` / `ActionPlanItem` types by IMPORTING them from
`@/lib/annualReview/sections` (allowed — it is a pure, vendor-free module). Module-local
`AnnualReviewUserRef = { readonly name: string }` for the aliased joins.

Types:

- `AnnualReviewRow` — verbatim from `annual-review/route.ts:37-44` GET select. Carries the
  ALIASED joins `signer:signed_off_by(name)`, `approver:approved_by(name)`,
  `creator:created_by(name)`:
  `id, review_year, review_period_from, review_period_to, checklist: Checklist,
  action_plan: ActionPlanItem[], locked: boolean, signed_off_at: string | null,
  approved_at: string | null, updated_at: string, created_at: string,
  signer: AnnualReviewUserRef | null, approver: AnnualReviewUserRef | null,
  creator: AnnualReviewUserRef | null`.
  ⚠ Supabase returns aliased single-row joins as `{ name } | null` OR `{ name }[]` depending
  on FK cardinality. The route returns `data` AS-IS to the wire (no remap), so the Row type
  should carry the join shape AS SUPABASE RETURNS IT and the adapter must NOT normalise it —
  byte-identity. Model as `AnnualReviewUserRef | AnnualReviewUserRef[] | null` to be safe
  (mirrors `CorrectiveActionQueueRow.users` in `HaccpCorrectiveAction.ts`). The implementer
  MUST confirm the actual returned shape against a live/seeded read during ANVIL and pin it.
- `CreateAnnualReviewInput` — POST body (`annual-review/route.ts:66-70`):
  `review_year?: string, review_period_from?: string, review_period_to?: string`.
- `AnnualReviewCreatePersist` — insert payload (`annual-review/route.ts:85-93`):
  `review_year: string, review_period_from: string, review_period_to: string,
  checklist: Checklist, action_plan: ActionPlanItem[], locked: false, created_by: string,
  updated_at: string`.
- `UpdateAnnualReviewInput` — PATCH body (`annual-review/route.ts:127-132`):
  `id: string, checklist?: Checklist, action_plan?: ActionPlanItem[],
  sign_off?: { approved_by: string; approved_at: string }`.
- `AnnualReviewCurrent` — the fetch-before-update read (`annual-review/route.ts:141`):
  `.select('id, locked, checklist')` → `id: string, locked: boolean, checklist: Checklist`.
- `AnnualReviewSignOffPersist` — the sign-off UPDATE payload (`annual-review/route.ts:189-198`):
  `checklist: Checklist, action_plan?: ActionPlanItem[] | undefined, signed_off_by: string,
  signed_off_at: string, approved_by: string, approved_at: string, locked: true,
  updated_at: string`.
- `AnnualReviewUpdatePersist` — the regular UPDATE payload (`annual-review/route.ts:208-210`),
  built conditionally: `{ updated_at: string; checklist?: Checklist; action_plan?: ActionPlanItem[] }`.
- `AnnualReviewListResult` — `{ reviews: readonly AnnualReviewRow[] }` (`route.ts:48`).

🗣 **In plain English:** The dictionary of shapes for the annual review, copied exactly from
the live route. Crucially, the route hands the database's raw join output straight to the
screen without reshaping it, so our types and adapter must NOT tidy it up — tidying would
change the bytes on the wire and break the "no behaviour change" promise.

### 6.3 `lib/ports/HaccpReviewsRepository.ts` (CREATE)

Imports domain types only. Mirrors `HaccpTrainingRepository`/`HaccpPeopleRepository`.

```
listWeeklyReviews(): Promise<readonly ReviewWeeklyRow[]>     // submitted_at DESC, limit 10
listMonthlyReviews(): Promise<readonly ReviewMonthlyRow[]>   // submitted_at DESC, limit 6
insertWeeklyReview(payload: ReviewWeeklyPersist): Promise<{ id: string }>
insertMonthlyReview(payload: ReviewMonthlyPersist): Promise<{ id: string }>
insertCorrectiveActions(rows: readonly ReviewCorrectiveActionInsert[]): Promise<void>
```

**Why the inserts return `{ id: string }` (NOT void):** the route does
`.insert(...).select('id').single()` and then uses `inserted.id` as the CA `source_id`
(`reviews/route.ts:110, 123, 151, 167`). So unlike Cluster C (void inserts), this port MUST
return the inserted id. The `{ id }` is the minimal shape the CA writer needs — matches the
route's `.select('id')`.

**`insertCorrectiveActions` is best-effort by contract (⚠ byte-exact nuance):** in the route,
a CA-insert failure is SWALLOWED — `console.error(...)`, NO throw, NO non-200 (`reviews/route.ts:131, 175`).
So the CA write is FIRE-AND-FORGET: it must NEVER throw out of the port in a way that changes
the route's reply. **Decision:** the adapter's `insertCorrectiveActions` catches its own DB
error, logs via `log.error`, and RETURNS (does not throw), preserving the route's
"review still succeeds even if CA write fails" semantics. Document this loudly in the port +
adapter doc-comments; pin it with a Fake test (a CA write does not throw).

🗣 **In plain English:** This is the contract for the weekly/monthly engine. Two reads, two
review-inserts (which must hand back the new row's id so we can attach problem-tickets to it),
and a problem-ticket writer. The subtle rule: today if writing a problem-ticket fails, the
review STILL succeeds and the error is just logged. Our contract has to keep that "tickets are
best-effort" behaviour exactly, or PR6 would change how failures surface.

### 6.4 `lib/ports/HaccpAnnualReviewRepository.ts` (CREATE)

```
listReviews(): Promise<readonly AnnualReviewRow[]>           // created_at DESC
createDraft(payload: AnnualReviewCreatePersist): Promise<AnnualReviewRow>   // throws ConflictError on 23505
findCurrent(id: string): Promise<AnnualReviewCurrent | null>               // null on miss
signOff(id: string, payload: AnnualReviewSignOffPersist): Promise<AnnualReviewRow>
update(id: string, payload: AnnualReviewUpdatePersist): Promise<AnnualReviewRow>
```

**`createDraft` is the ONE clean 409 in this whole PR.** The route maps Postgres `23505`
(unique-draft index violation) to a 409 with the EXACT message
`'A draft review already exists. Complete or delete it before starting a new one.'`
(`annual-review/route.ts:100-105`). The adapter maps `23505` → `ConflictError` with that exact
message INSIDE the adapter (mirroring `UsersRepository.createUser`'s 23505→ConflictError at
`UsersRepository.ts:229-233`), so the raw code never crosses the port boundary (ADR-0002).
PR6's route catch turns `ConflictError` into the 409. Every other DB error → `ServiceError`
(500).

**`findCurrent` returns null on miss** (route treats `fetchErr || !current` as a 404, message
`'Review not found'` — that 404 logic stays at the PR6 route edge, the port just returns null).

🗣 **In plain English:** The annual-review engine's contract. The interesting method is
"create a draft": the database refuses a second draft, and we translate that refusal into our
own app-language "conflict" so a vendor swap wouldn't leak Postgres error codes. Everything
else (locking on sign-off, editing) is plain reads and writes.

### 6.5 `lib/services/HaccpReviewsService.ts` (CREATE)

Factory `createHaccpReviewsService(deps: { reviews: HaccpReviewsRepository })`. Mirrors
`HaccpTrainingService` / `HaccpPeopleService`. Determinism: every `now`/`today` passed IN
(the route's `todayUK()` EN-CA result is computed at the route edge and passed as `today`).
Validation uses the `{ ok } | { ok:false; status; message }` result helper with EXACT 400
strings IN ORDER.

Methods:

- `getReviews(args: { monday: string; sunday: string; mFrom: string; mTo: string }): Promise<ReviewsListResult>`
  — reads both lists via `Promise.all`, computes `weekly_done` / `monthly_done` with the
  route's EXACT predicates (`reviews/route.ts:75-76`):
  `weekly_done = rows.some(r => r.week_ending >= monday && r.week_ending <= sunday)`,
  `monthly_done = rows.some(r => r.month_year >= mFrom && r.month_year <= mTo)`.
  The date-window helpers (`thisWeekMonday/Sunday/thisMonthRange`) STAY at the route edge
  (timezone-dependent, `new Date()`-based) and are passed IN — the service stays deterministic.
- `validateWeekly(input): ValidationResult` — strings IN ORDER (`reviews/route.ts:104-105`):
  1. `'Week ending date required'` (missing `week_ending`)
  2. `'Assessments required'` (missing OR non-array `assessments`)
- `buildWeeklyPersist({ input, userId, today }): ReviewWeeklyPersist` — `reviews/route.ts:109`:
  `{ submitted_by: userId, week_ending: input.week_ending!, date: today, assessments: input.assessments }`.
- `buildWeeklyCorrectiveActions({ input, userId, reviewId, weekEnding }): readonly ReviewCorrectiveActionInsert[]`
  — the dead-code CA modelling, EXACT from `reviews/route.ts:115-129`:
  filter `assessments` to `i.state === 'problem'`; map each to:
  ```
  { actioned_by: userId,
    source_table: 'haccp_weekly_review',
    source_id: reviewId,
    ccp_ref: 'WEEKLY-REVIEW',
    deviation_description: `Weekly review — ${i.label}`,
    action_taken: i.action?.trim() || `No action notes recorded at time of review — refer to weekly review record (week ending ${weekEnding})`,
    product_disposition: 'assess',
    recurrence_prevention: i.caHint || 'Review procedures',
    management_verification_required: true }
  ```
  Returns `[]` when no problems (so PR6 only calls `insertCorrectiveActions` when length > 0,
  matching `reviews/route.ts:118`).
- `validateMonthly(input): ValidationResult` — strings IN ORDER (`reviews/route.ts:139-142`):
  1. `'Month/year required'`
  2. `'Equipment checks required'`
  3. `'Facilities checks required'`
  4. `'HACCP system review required'`
- `buildMonthlyPersist({ input, userId, today }): ReviewMonthlyPersist` — `reviews/route.ts:146-150`:
  `further_notes: input.further_notes?.trim() || null` (the rest verbatim).
- `buildMonthlySystemCorrectiveActions({ input, userId, reviewId, monthYear }): readonly ReviewCorrectiveActionInsert[]`
  — the dead-code CA modelling, EXACT from `reviews/route.ts:158-173`:
  filter `haccp_system_review` to **`i.invertFail ? i.result === 'YES' : i.result === 'NO'`**
  (the `invertFail` logic); map each to:
  ```
  { actioned_by: userId,
    source_table: 'haccp_monthly_review',
    source_id: reviewId,
    ccp_ref: 'MONTHLY-REVIEW',
    deviation_description: `Monthly HACCP review — ${i.label}`,
    action_taken: i.notes?.trim() || `No action notes recorded at time of review — refer to monthly review record (${monthYear})`,
    product_disposition: 'assess',
    recurrence_prevention: i.caHint || 'Review procedures and update HACCP plan',
    management_verification_required: true }
  ```
- Pass-through delegators: `insertWeeklyReview`, `insertMonthlyReview`,
  `insertCorrectiveActions` → the port.

🗣 **In plain English:** This is the brain of the weekly/monthly engine. It checks the form
fields in the exact order and with the exact wording the live route uses, builds the database
rows exactly, and — the headline feature — rebuilds the auto-generated "problem tickets"
move-for-move, including the flipped-question (`invertFail`) logic for the monthly review.
Anything that depends on the clock or timezone stays at the route's edge and is handed in, so
this brain is fully predictable and testable.

### 6.6 `lib/services/HaccpAnnualReviewService.ts` (CREATE)

Factory `createHaccpAnnualReviewService(deps: { annualReview: HaccpAnnualReviewRepository })`.
Determinism: `now: Date` passed IN for `updated_at` / `signed_off_at`. IMPORTS the pure
helpers from `@/lib/annualReview/sections` (`buildInitialChecklist`, `buildInitialActionPlan`,
`isValidStatus`, `isValidReviewPeriod`, `canSignOff`) — does NOT reimplement them.

Methods:

- `getReviews(): Promise<AnnualReviewListResult>` → `{ reviews: await annualReview.listReviews() }`.
- `validateCreate(input): ValidationResult` — IN ORDER (`annual-review/route.ts:72-80`):
  1. `'Review year label is required'` (missing/blank `review_year`)
  2. `'Invalid review period — from must be before to, and to cannot be in the future'`
     (when `!isValidReviewPeriod(from, to)`)
- `buildCreatePersist({ input, userId, now }): AnnualReviewCreatePersist` — `route.ts:85-93`:
  `review_year: input.review_year!.trim()`, `checklist: buildInitialChecklist()`,
  `action_plan: buildInitialActionPlan()`, `locked: false`, `created_by: userId`,
  `updated_at: now.toISOString()`.
- `createDraft(payload)` → `annualReview.createDraft(payload)` (ConflictError surfaces).
- `validatePatch(input): ValidationResult` — `'Review ID required'` (missing `id`),
  then the checklist-shape validation loop (`route.ts:153-170`): for each section,
  `items` must be an array (`'Section ${key}: items must be an array'`), each item's status
  must pass `isValidStatus` (`'Section ${key}: invalid status "${status}" — must be ok, na,
  action, or null'`). For sign-off: `'approved_by and approved_at required for sign-off'`
  (missing either), and `'Cannot sign off — not all checklist sections are complete'` when
  `!canSignOff(false, checklistToUse)`.
- `buildSignOffPersist({ input, current, userId, now }): AnnualReviewSignOffPersist` —
  `route.ts:179, 189-198`: `checklist: input.checklist ?? current.checklist`,
  `action_plan: input.action_plan ?? undefined`, `signed_off_by: userId`,
  `signed_off_at: now.toISOString()`, `approved_by`, `approved_at`, `locked: true`,
  `updated_at: now.toISOString()`.
- `buildUpdatePersist({ input, now }): AnnualReviewUpdatePersist` — `route.ts:208-210`:
  start `{ updated_at: now.toISOString() }`, conditionally add `checklist` / `action_plan`
  ONLY when truthy (matches `if (checklist)` / `if (action_plan)`).
- `findCurrent(id)`, `signOff(id, payload)`, `update(id, payload)` → port delegators.

**Lifecycle modelling (draft / lock / sign-off):** the locked-record guard
(`current.locked` → 409 `'This review is locked and cannot be edited'`, `route.ts:148-150`)
and the not-found guard (`route.ts:145-147`) are ROUTE-EDGE branch decisions in PR6 that
consume `findCurrent`'s result — the service exposes `findCurrent` and the validators so PR6
re-points byte-identically. The sign-off mutation (sets `locked=true` + signer/approver) is
fully modelled in `buildSignOffPersist` + `signOff`.

🗣 **In plain English:** The brain of the annual-review engine. It re-uses the existing
checklist-completeness logic (we do not rewrite it), validates the form in the live order, and
models the whole life of a review: create a blank draft, edit it, and finally sign it off —
which stamps the approver and locks it. The "is it locked?" and "does it exist?" gate
decisions stay at the route edge for PR6 to re-wire identically.

### 6.7 `lib/adapters/supabase/HaccpReviewsRepository.ts` (CREATE)

The ONLY file importing `@supabase/supabase-js` for these two tables. `createSupabaseHaccpReviewsRepository(client)`
factory + `supabaseHaccpReviewsRepository` singleton (wired to `supabaseService`). Mirrors
`HaccpTrainingRepository` adapter.

- **Verbatim select constants (byte-identity anchor):**
  - `WEEKLY_COLS = 'id, week_ending, date, assessments, submitted_at, users!inner(name)'`
    (from `reviews/route.ts:59`)
  - `MONTHLY_COLS = 'id, month_year, date, equipment_checks, facilities_checks, haccp_system_review, further_notes, submitted_at, users!inner(name)'`
    (from `reviews/route.ts:64`)
- `listWeeklyReviews` → `.from('haccp_weekly_review').select(WEEKLY_COLS).order('submitted_at', { ascending: false }).limit(10)`;
  `[]` on miss; `ServiceError` on DB error.
- `listMonthlyReviews` → `.from('haccp_monthly_review').select(MONTHLY_COLS).order('submitted_at', { ascending: false }).limit(6)`.
- `insertWeeklyReview` → `.insert(payload).select('id').single()`; return `{ id: data.id }`;
  `ServiceError` on error/no-row.
- `insertMonthlyReview` → same against `haccp_monthly_review`.
- `insertCorrectiveActions(rows)` → `.from('haccp_corrective_actions').insert(rows)`; on error,
  `log.error(...)` and RETURN (do NOT throw) — preserving the route's swallow-and-continue
  (`reviews/route.ts:131, 175`). Map vendor row→nothing (insert only).

Vendor types stop here: rows returned `as unknown as ReviewWeeklyRow[]` etc.

🗣 **In plain English:** The real-database plug for weekly/monthly. The column lists are
copied character-for-character from the live route so the data on the wire is identical. The
problem-ticket writer deliberately does NOT crash if it fails — it logs and moves on — because
that is exactly what the live route does today.

### 6.8 `lib/adapters/supabase/HaccpAnnualReviewRepository.ts` (CREATE)

`createSupabaseHaccpAnnualReviewRepository(client)` + `supabaseHaccpAnnualReviewRepository`
singleton.

- **Verbatim select constants:**
  - `ANNUAL_LIST_COLS` = the multi-line select from `annual-review/route.ts:37-44` (with the
    `signer:`/`approver:`/`creator:` aliased joins) copied EXACTLY (including formatting that
    affects nothing, but the column+alias set must match).
  - `ANNUAL_CURRENT_COLS = 'id, locked, checklist'` (from `route.ts:141`).
- `listReviews` → `.select(ANNUAL_LIST_COLS).order('created_at', { ascending: false })`;
  return `data ?? []`; `ServiceError` on error.
- `createDraft(payload)` → `.insert(payload).select().single()`; on error: if `error.code ===
  '23505'` → `ConflictError('A draft review already exists. Complete or delete it before
  starting a new one.')`, else `ServiceError`; return `data as AnnualReviewRow`.
- `findCurrent(id)` → `.select(ANNUAL_CURRENT_COLS).eq('id', id).single()`; on `error || !data`
  return `null` (the route's 404 is decided downstream from null); else return mapped current.
  ⚠ The route uses `.single()` which errors when 0 rows — the adapter must treat that as
  `null` (not a thrown ServiceError), so PR6's `fetchErr || !current` → 404 path is preserved.
- `signOff(id, payload)` → `.update(payload).eq('id', id).select().single()`; `ServiceError`
  on error; return row.
- `update(id, payload)` → `.update(payload).eq('id', id).select().single()`; `ServiceError`
  on error; return row.

🗣 **In plain English:** The real-database plug for the annual review. The headline detail:
when the database blocks a second draft, this plug raises our own "conflict" signal (not a raw
Postgres code), exactly matching the live route's 409 message. And the "fetch before edit" read
returns "nothing found" rather than crashing, so the route's existing not-found behaviour is
preserved.

### 6.9 `lib/adapters/fake/HaccpReviewsRepository.ts` (CREATE)

No SDK import. `createFakeHaccpReviewsRepository(seed?)` + `fakeHaccpReviewsRepository`
singleton (empty). `FakeHaccpReviewsRepository` interface exposes recorded writes for tests.

- `FakeHaccpReviewsSeed` — `{ weekly?: readonly ReviewWeeklyRow[]; monthly?: readonly ReviewMonthlyRow[];
  weeklyInsertId?: string; monthlyInsertId?: string }` (the ids the fake hands back).
- Recorded writes: `insertedWeekly: ReviewWeeklyPersist[]`, `insertedMonthly: ReviewMonthlyPersist[]`,
  `insertedCorrectiveActions: ReviewCorrectiveActionInsert[]`.
- `insertWeeklyReview` → records payload, returns `{ id: seed?.weeklyInsertId ?? 'fake-weekly-id' }`.
- `insertMonthlyReview` → records, returns `{ id: seed?.monthlyInsertId ?? 'fake-monthly-id' }`.
- `insertCorrectiveActions(rows)` → pushes rows; NEVER throws (parity with the swallow contract).

### 6.10 `lib/adapters/fake/HaccpAnnualReviewRepository.ts` (CREATE)

`createFakeHaccpAnnualReviewRepository(seed?)` + singleton. `FakeHaccpAnnualReviewRepository`
exposes recorded writes.

- `FakeHaccpAnnualReviewSeed` — `{ reviews?: readonly AnnualReviewRow[]; current?: AnnualReviewCurrent | null;
  createdRow?: AnnualReviewRow; signedRow?: AnnualReviewRow; updatedRow?: AnnualReviewRow;
  conflictOnCreate?: boolean }`.
- `createDraft` → if `seed.conflictOnCreate`, throw `ConflictError` (same message); else record
  payload and return `seed.createdRow ?? <echo>`.
- `findCurrent(id)` → returns `seed.current ?? null`.
- `signOff` / `update` → record payloads; return the seeded rows.

🗣 **In plain English:** The in-memory test twins. They mimic the real plugs — including
handing back a fake new-row id (so the problem-ticket linking can be tested) and being able to
simulate the "draft already exists" conflict — but touch no real database, so the unit tests
run instantly and deterministically.

### 6.11 Barrels (MODIFY 13-17)

- `lib/domain/index.ts` — add a `// F-19 PR5 — Cluster D reviews + annual-review hexagons`
  block re-exporting the new types. **Grep each name first** to avoid the
  `MonthlyReviewRow`/`MonthlyReviewPersist` collision (resolved by the `Review*` prefix).
- `lib/ports/index.ts` — `export type { HaccpReviewsRepository } from './HaccpReviewsRepository'`
  and `export type { HaccpAnnualReviewRepository } from './HaccpAnnualReviewRepository'`.
- `lib/services/index.ts` — export the 2 factories + service/deps types.
- `lib/adapters/supabase/index.ts` — export the 2 factories + 2 singletons.
- `lib/adapters/fake/index.ts` — export the 2 factories + 2 singletons + the 2 Fake interface
  types + the 2 Seed types.

### 6.12 `lib/wiring/haccp.ts` (MODIFY 18)

Add, after the Cluster C block, a Cluster D block (service-role singletons ONLY, NO
`…ForCaller`):

```ts
// F-19 PR5 — Cluster D "reviews" (weekly + monthly reviews with the auto
// corrective-action side-effect) + the annual SALSA review (draft/lock/sign-off).
// Service-role singletons ONLY — exactly the access the 2 routes have today, so
// the PR6 re-point is byte-identical. NO `…ForCaller` (per-caller RLS deferred
// to F-RLS-04h, Cluster G). INTRODUCE-ONLY: no caller yet.
export const haccpReviewsService: HaccpReviewsService =
  createHaccpReviewsService({ reviews: supabaseHaccpReviewsRepository });

export const haccpAnnualReviewService: HaccpAnnualReviewService =
  createHaccpAnnualReviewService({ annualReview: supabaseHaccpAnnualReviewRepository });
```

Update the three import groups at the top (services, adapters/supabase) accordingly.

🗣 **In plain English:** Two lines that bolt each engine to the real database using the same
master-key access the live routes already use — and nothing else. No screen imports these, so
they are installed-but-unplugged. PR6 throws the switch.

---

## 7. Corrective-action side-effect modelling (HaccpReviews) — summary

The CA side-effect is modelled across three layers as DEAD CODE that PR6 will call:

1. **Domain** — `ReviewCorrectiveActionInsert` (module-local; two NEW `source_table` literals
   `haccp_weekly_review` / `haccp_monthly_review` that the shared `HaccpCASourceTable` union
   does NOT carry — kept separate so Cluster A's domain is untouched).
2. **Service** — `buildWeeklyCorrectiveActions` (filter `state === 'problem'`) and
   `buildMonthlySystemCorrectiveActions` (filter `invertFail ? result==='YES' : result==='NO'`)
   reproduce the route's mapping EXACTLY (every field, every fallback string verbatim). They
   return `[]` when no problems, so PR6 calls the port only when `length > 0` (matching the
   route's guard).
3. **Adapter/port** — `insertCorrectiveActions(rows)` writes to `haccp_corrective_actions` and
   is **best-effort: it logs and does NOT throw on failure**, exactly reproducing the route's
   `console.error(...)`-and-continue behaviour, so the review's success reply is unchanged even
   if the CA write fails.

🗣 **In plain English:** The "problem ticket" behaviour is rebuilt in three exact pieces — the
ticket shape, the rules for when a ticket is created (including the flipped-question monthly
logic), and the writer that logs-but-never-crashes if ticket-writing fails. All copied
move-for-move so PR6 is a pure swap.

---

## 8. Annual-review lifecycle modelling (HaccpAnnualReview) — summary

- **Create draft** — `buildCreatePersist` (blank checklist/action-plan via the imported
  builders, `locked:false`) + `createDraft` (23505 → ConflictError 409 with the exact message).
  The unique-draft index enforces "one draft at a time".
- **Update** — `buildUpdatePersist` (conditional checklist/action_plan, always `updated_at`)
  + `update`. The locked-record + not-found gates are route-edge decisions consuming
  `findCurrent`.
- **Sign-off** — `buildSignOffPersist` sets `locked:true`, `signed_off_by`, `signed_off_at`,
  `approved_by`, `approved_at`, plus the `canSignOff` completeness gate (imported). `signOff`
  performs the UPDATE.

🗣 **In plain English:** The full life of an annual review — start one blank draft (DB blocks a
second), edit it, then sign-off which stamps who approved it and freezes it — is modelled
exactly, re-using the existing completeness rules rather than rewriting them.

---

## 9. Introduce-only proof (zero behaviour change)

The PR is correct if and only if ALL of these hold:

1. **Zero `app/**` diff** — `git diff --stat origin/main -- app/` is empty. No route, page, or
   component changed.
2. **Zero migration** — `git diff --stat origin/main -- supabase/` is empty.
3. **Zero `package.json` diff** — no new dependency.
4. **No caller** — `grep -rn "haccpReviewsService\|haccpAnnualReviewService\|createHaccpReviewsService\|createHaccpAnnualReviewService" app/`
   returns nothing. The new singletons are referenced ONLY from `lib/wiring/haccp.ts` (their
   construction site) and the new unit tests.
5. **Build compiles** — `npm run build` (tsc) green; the new types/factories typecheck,
   barrels resolve, no unused-export or circular-import errors.
6. **Existing suite green** — the full pre-existing unit + integration + pgTAP suites pass
   UNCHANGED (no existing test edited). New tests are additive.
7. **Lint green** — `tests/unit/lint/no-adapter-imports.test.ts` still passes: services import
   ports only; only `lib/wiring/haccp.ts` imports `lib/adapters/**`; vendor SDK only in the
   two new `lib/adapters/supabase/` files.
8. **Reviews/annual-review routes byte-identical** — the two route files are NOT in the diff;
   their wire output is unchanged by construction (nothing they import changed).

🗣 **In plain English:** The proof of "no behaviour change" is mechanical: nothing under
`app/`, no migration, no new library, and a search confirms no screen calls the new engines.
The project still builds and every existing test still passes untouched. If any of those is
false, the introduce-only promise is broken.

---

## 10. Test hooks (for the anvil-runner)

Two new unit test files, mirroring `HaccpTrainingService.test.ts` (Fake-adapter-driven,
fixed `NOW`, validate-strings-in-order, build-payload exactness, insert-delegation).

### `tests/unit/services/HaccpReviewsService.test.ts`

Fixtures: `createFakeHaccpReviewsRepository({ weekly, monthly, weeklyInsertId, monthlyInsertId })`.
Assert:

- `getReviews` returns `{ weekly, monthly, weekly_done, monthly_done }` in that KEY ORDER from
  seeded reads; `weekly_done`/`monthly_done` computed from the passed-in `monday/sunday/mFrom/mTo`
  windows (boundary cases: equal to monday, equal to sunday, outside).
- `validateWeekly` — 2 strings IN ORDER ('Week ending date required', 'Assessments required'),
  incl. the non-array `assessments` branch → 'Assessments required'.
- `validateMonthly` — 4 strings IN ORDER.
- `buildWeeklyPersist` / `buildMonthlyPersist` — exact payloads incl. `date: today` (injected),
  `further_notes` trim-or-null.
- `buildWeeklyCorrectiveActions` — **the CA side-effect:** filters `state==='problem'`; builds
  the exact row incl. the `action_taken` fallback string with the week-ending interpolation,
  `ccp_ref:'WEEKLY-REVIEW'`, `product_disposition:'assess'`, `recurrence_prevention` fallback
  `'Review procedures'`, `source_id` = passed reviewId; returns `[]` when no problems.
- `buildMonthlySystemCorrectiveActions` — **the `invertFail` logic:** a normal item with
  `result:'NO'` → problem; `result:'YES'` → not; an `invertFail:true` item with `result:'YES'`
  → problem; `result:'NO'` → not. Exact CA row incl. `'Monthly HACCP review — '` prefix,
  `'Review procedures and update HACCP plan'` fallback, monthYear interpolation.
- insert delegation: `insertWeeklyReview`/`insertMonthlyReview` return the seeded id and record
  the payload; `insertCorrectiveActions` records rows AND does not throw.

### `tests/unit/services/HaccpAnnualReviewService.test.ts`

Fixtures: `createFakeHaccpAnnualReviewRepository({ reviews, current, createdRow, signedRow,
updatedRow, conflictOnCreate })`. Assert:

- `getReviews` returns `{ reviews }` from seed.
- `validateCreate` — 'Review year label is required' (blank), then the period-invalid string.
- `buildCreatePersist` — blank checklist (via `buildInitialChecklist`), action plan (via
  `buildInitialActionPlan`), `locked:false`, `created_by`, `updated_at` = injected now.
- `createDraft` — happy path returns `createdRow`; `conflictOnCreate` → `ConflictError` thrown
  with the EXACT message.
- `validatePatch` — 'Review ID required'; the per-section 'items must be an array' string; the
  'invalid status "x"' string (driven by `isValidStatus`); sign-off missing-field string; the
  'Cannot sign off — not all checklist sections are complete' string (driven by `canSignOff`
  on an incomplete checklist).
- `buildSignOffPersist` — `locked:true`, signer/approver fields, `signed_off_at`/`updated_at`
  = injected now, `checklist` falls back to `current.checklist` when input omits it.
- `buildUpdatePersist` — always `updated_at`; conditionally includes checklist/action_plan.
- `findCurrent` returns seeded current or null.

**Determinism:** both suites inject a fixed `NOW`; assert no `new Date()` inside the services
(the build payloads must equal the fixed-now expectation byte-for-byte).

🗣 **In plain English:** The tests drive each engine with the fast in-memory twin, pin every
validation message in the exact order, prove the database payloads are built exactly, and —
the important bit — prove the problem-ticket logic (including the flipped monthly questions)
and the draft-conflict behaviour are reproduced precisely.

---

## 11. Acceptance criteria

1. 12 new files + 7 modified files; ZERO `app/**`, ZERO migration, ZERO `package.json` change.
2. `npm run build` green; full existing unit + integration + pgTAP suites green UNCHANGED.
3. The 2 new unit suites pass and cover every validate string, every build payload, the CA
   side-effect (both paths incl. `invertFail`), the best-effort CA swallow, and the draft 409.
4. `no-adapter-imports` lint test green; vendor SDK only in the 2 new supabase adapters.
5. Introduce-only proof (§9) all true — including the grep showing no `app/**` caller.
6. Rip-out test PASSES (see §13).

---

## 12. Risk Assessment

### Concurrency / race conditions
- **R-C1 (low, no must-fix):** the unique-draft index allows a race where two simultaneous
  POSTs both pass an app-level "no draft" check — but there is NO app-level pre-check here; the
  index is the sole arbiter and the second insert gets `23505` → 409. This is the EXISTING
  route behaviour, modelled faithfully. **Mitigation:** none needed; the DB constraint is the
  serialization point. Dead code in this PR regardless.
- **R-C2 (low):** the CA writer is best-effort and non-transactional with the review insert
  (review can succeed while CA write fails) — this is a PRE-EXISTING property of the route, not
  introduced here. Modelled faithfully. No must-fix.

### Security
- **R-S1 (low):** service-role singletons bypass RLS — but that is EXACTLY today's route access
  and the deliberate Cluster-D scope (per-caller RLS deferred to F-RLS-04h). Adding a
  `…ForCaller` factory now would be OUT of scope and a Gate-2 blocker. **Mitigation:** wiring
  test must pin that NO `…ForCaller` leaked early (mirror the PR1 wiring assertion).
- **R-S2 (low):** vendor error codes (`23505`) must not cross the port boundary. **Mitigation:**
  the adapter maps `23505`→`ConflictError` internally (ADR-0002). Pinned by the create-conflict
  test. No must-fix.

### Data migration
- **R-D1 (none):** NO migration in this PR. The unique-draft index + all tables already exist
  in baseline. No must-fix.

### Business-logic flaws
- **R-B1 (MEDIUM — must verify, not must-fix-blocker):** the CA mapping MUST be byte-exact or
  PR6 silently changes what problem-tickets get written. Highest-value correctness risk. The
  `invertFail` flip, the `action_taken` fallback strings (with week-ending / month-year
  interpolation), `ccp_ref`, `product_disposition:'assess'`, and `recurrence_prevention`
  fallbacks are easy to get subtly wrong. **Mitigation:** the unit tests pin every field and
  both filter predicates against the route lines cited in §6.5; ANVIL diffs the built CA rows
  against the route's literal objects. This is a verification gate, not a code-blocker.
- **R-B2 (MEDIUM — must verify):** the annual GET join shape (`signer`/`approver`/`creator` as
  `{name}` vs `{name}[]` vs `null`) is returned to the wire AS-IS; the Row type + adapter must
  NOT normalise it. **Mitigation:** model the union shape; confirm the real returned shape
  during ANVIL against a seeded read and pin it; adapter does a bare `as` cast (no remap).
- **R-B3 (low):** the `weekly_done`/`monthly_done` predicates and the date windows must stay at
  the route edge (timezone-dependent). **Mitigation:** the service takes the windows IN; the
  helpers stay in the route. No must-fix.
- **R-B4 (low, naming):** `MonthlyReviewRow`/`MonthlyReviewPersist` already exist in the domain
  barrel for the *allergen* monthly review (different table). A clash would be a compile error.
  **Mitigation:** the `Review*` prefix decision (§6.1) + the "grep before export" step in §6.11.

### Launch blockers
- **R-L1 (none):** introduce-only, no caller, no migration, no behaviour change → nothing can
  break in production. The ONLY way this PR ships a regression is if it accidentally edits a
  route/migration — caught by the §9 zero-diff checks. No must-fix.

**Risk headline:** NO must-fix blockers. Two MEDIUM *verification* risks (R-B1 the CA byte-
exactness, R-B2 the annual join shape) — both are dead code in this PR and are resolved by the
unit tests + ANVIL diffing, not by blocking the plan. The plan is Gate-2 clear.

🗣 **In plain English:** Nothing here can break production, because nothing live runs the new
code. The two things to watch are getting the auto-ticket logic and the annual-review join
shape copied *exactly* — but those are caught by tests now and a careful diff in ANVIL, so they
don't block the plan. There are no must-fix blockers.

---

## 13. Hexagonal verdict (populates Gate 2)

- **Ports used/added:** TWO NEW ports — `HaccpReviewsRepository` (`lib/ports/HaccpReviewsRepository.ts`)
  and `HaccpAnnualReviewRepository` (`lib/ports/HaccpAnnualReviewRepository.ts`). Owned by the
  domain; describe business operations (list/insert reviews + best-effort CA write; annual
  list/createDraft/findCurrent/signOff/update).
- **Adapters:** FOUR NEW adapters — `lib/adapters/supabase/HaccpReviewsRepository.ts`,
  `lib/adapters/supabase/HaccpAnnualReviewRepository.ts` (real DB), and
  `lib/adapters/fake/HaccpReviewsRepository.ts`, `lib/adapters/fake/HaccpAnnualReviewRepository.ts`
  (test twins). Vendor SDK confined to the two supabase files.
- **New dependencies:** **NONE.** Reuses `@supabase/supabase-js` (already wrapped at
  `lib/adapters/supabase/`), `@/lib/errors` (`ServiceError`, `ConflictError`),
  `@/lib/observability/log`, `@/lib/annualReview/sections` (pure, vendor-free). No
  `package.json` entry added → no justification required; no single-use unwrapped vendor.
- **Rip-out test: PASS.** Swapping the DB vendor for Cluster D = write one new adapter per port
  (`lib/adapters/<vendor>/HaccpReviewsRepository` + `…/HaccpAnnualReviewRepository`) + change
  the two wiring lines in `lib/wiring/haccp.ts`. Domain, ports, services, and the routes (PR6)
  are untouched. The vendor `23505` code is mapped to `ConflictError` INSIDE the adapter, so no
  vendor type leaks past the boundary.

🗣 **In plain English:** Two new sockets, four new plugs (a real one and a test one each).
Swapping the database later means writing two new plugs and changing two wiring lines —
nothing else. No new third-party library is introduced. Rip-out test: PASS.

---

## 14. Conductor summary line

**Gate 2 status: CLEAR.** Two new hexagons, introduce-only/dead code, service-role singletons
only. 12 files created, 7 modified, zero `app/**`, zero migration, zero new deps. Rip-out test
PASS. No must-fix risks — two MEDIUM verification risks (CA byte-exactness, annual join shape)
handled by unit tests + ANVIL diff.
