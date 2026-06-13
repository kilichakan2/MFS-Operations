# F-TD-01 — Clear all `tsc` + `next lint` errors on `main`

- **Date:** 2026-06-13
- **Unit:** F-TD-01 (16-day sprint)
- **Author:** forge-planner (FORGE Phase 2 — Order)
- **Spec locked at:** Gate 1
- **Branch:** implementer cuts a feature branch off `main` (e.g. `f-td-01-clear-tsc-lint`)

---

## Goal

Make `npx tsc --noEmit` exit 0 (today: 60 errors) **and** `npx next lint` exit 0
(today: 58 errors/warnings) on `main`, with the integration suite still 115/115
green. Add a runnable `typecheck` npm script so ANVIL can run the gate. After this
lands, ANVIL's typecheck + lint layers run STRICT for every later sprint unit.

🗣 In plain English: the project's two automatic "spell-checkers for code" —
one for types, one for style — currently shout 118 complaints between them. We
silence all 118 by genuinely fixing each, not by taping over the mouth. From then
on, any future work that reintroduces even one complaint gets stopped at the gate.

## Hard constraints (design the plan around these)

1. **ZERO new suppressions.** No `@ts-expect-error`, `// eslint-disable`,
   `// @ts-ignore`, `// eslint-disable-line`. Every error is genuinely resolved.
   🗣 No taping over the mouth. F-27 (Day 16) will add a check that bans exactly
   this, so a taped-over fix would just fail again later.
2. **Behavior-preserving by default.** Mechanical type errors and cosmetic lint
   fixes change types/markup only, never runtime behavior.
3. **The ~10 real-bug-smell errors are the exception.** Each gets a documented
   root cause + fix + before/after. Genuinely ambiguous ones (especially the 2
   `react-hooks/exhaustive-deps`) are flagged **ESCALATE TO HAKAN**, not guessed.
4. **No-reformat rule.** Touch only the lines needed. Any unavoidable reformat is
   declared in this plan (none anticipated — see each step).
5. **Hygiene, not architecture.** Do NOT add ports/adapters or move files between
   layers. Nothing here touches `lib/adapters/**`, `lib/ports/**`, `lib/domain/**`
   structurally. If a fix would, STOP and flag it.

## Pre-existing suppressions — DO NOT TOUCH

`app/haccp/cold-storage/page.tsx:422` already carries an
`// eslint-disable-line react-hooks/exhaustive-deps` on an unrelated `useEffect`
(the "load once on mount" effect). It is **not** in our error inventory (lint
already passes it) and is **out of scope**. Leave it exactly as-is. Removing it
would surface a new warning and break the "zero new suppressions / preserve
behavior" rules.

🗣 There's already one piece of tape on a different line in that file, placed
deliberately before this sprint. We are not here to peel old tape — only to fix
the 118 things currently shouting. Leave that line alone.

---

## Domain terms used in this plan

- **`tsc --noEmit`** — the TypeScript type-checker run in "check only, produce no
  output files" mode. 🗣 The type spell-checker. It reads the code, reports every
  type mismatch, and writes nothing.
- **`next lint` / ESLint** — the style/correctness linter Next.js wraps. 🗣 The
  style spell-checker — catches missing React keys, un-escaped quotes, risky hooks.
- **TS2352 ("`as` cast no overlap")** — you told TypeScript "treat X as type Y" but
  X and Y are too different for that to be safe. 🗣 You slapped a label on a box
  that clearly doesn't match what's inside; TS refuses the lie.
- **Supabase embedded relation** — when a query pulls a linked row (e.g. a
  compliment's poster), the Supabase client types that linked data as an **array**
  even when it's really one row. 🗣 The database client hands you a one-item bag
  when you expected the item itself; code that reads `.name` off the bag gets
  nothing unless it opens the bag first.
- **`react/jsx-key`** — React wants a stable `key` on each item in a rendered list
  so it can tell items apart across re-renders. 🗣 Name-tags on a row of identical
  chairs so React doesn't reshuffle the wrong one when the list changes.
- **`react-hooks/exhaustive-deps`** — a hook's "watch list" (dependency array) is
  missing something it actually uses, so it may run with stale data. 🗣 A reminder
  alarm that forgot to watch one of the things it depends on — it might fire with
  yesterday's numbers.

## Compliance / safety flags

- The two `exhaustive-deps` warnings live in **HACCP temperature screens**
  (cold-storage, process-room). These are **food-safety compliance** screens; a
  wrong change could affect whether a temperature deviation submission fires
  correctly. 🗣 These two are on the fridge/room-temperature logging screens the
  law cares about — getting them wrong isn't cosmetic, so they get extra care and
  an escalation rather than a guess.
- `lib/translations.ts` duplicate keys are **user-facing copy** (one value silently
  overrides another). One of them (`logNew`) has a genuine value difference — see
  Step 4d. 🗣 These are the words shown on screen; picking the wrong duplicate
  changes what a user reads.

## ADR review

- **ADR-0002** (hexagonal shape/naming): no conflict. No new ports/adapters; no
  cross-layer moves.
- **ADR-0003** (strangler-fig FREEZE rule): no conflict. The FREEZE rule forbids
  **new** `@supabase/supabase-js` imports outside `lib/adapters/supabase/**`. This
  plan adds **zero** imports and moves nothing; it only edits existing type casts,
  JSX, and tests in place inside already-existing (un-migrated) route files. Editing
  an existing un-migrated route is explicitly allowed; only new SDK imports are
  frozen. 🗣 The rule says "don't plug any NEW wires into the old database the old
  way." We're not plugging anything in — we're fixing labels on wires that already
  exist. No conflict.

---

## Verified inventory (re-run 2026-06-13 — matches the locked spec)

**TSC: 60 errors.** Dominant pattern is **27× TS2352** Supabase-embedded-relation
casts (array typed, cast to single object) across the API routes. Remaining 33 are
arg-type / missing-property / dup-key / dead-code spread across ~15 files.

**LINT: 58 problems** across 15 files: 39× `react/jsx-key`, 16×
`react/no-unescaped-entities`, 2× `react-hooks/exhaustive-deps`, 1×
`jsx-a11y/role-supports-aria-props`.

Full per-file/per-rule breakdown is embedded in the steps below.

---

## Approach (strategy)

Order the work so each commit is independently green-or-greener and atomically
revertable:

1. **Add the `typecheck` script first** — makes the gate runnable; zero risk.
2. **Mechanical type fixes, grouped by file/pattern** — the 27× TS2352 + the rest
   of the pure type-noise errors. Behavior-preserving. One commit per file (or per
   tight pattern group) so a regression bisects cleanly.
3. **Cosmetic lint fixes, grouped by rule** — jsx-key, no-unescaped-entities, the
   one aria fix. Markup/type only.
4. **The ~10 real-bug fixes** — each its own documented sub-step. The 2
   exhaustive-deps + the `logNew` copy difference are **ESCALATE**; the rest are
   fixed in-place with documented before/after.
5. **Final verification** — tsc 0, lint 0, integration 115/115.

TDD note: most of this is type/markup hygiene where a failing test does not pre-exist
(the type-checker _is_ the test). For the **real-bug** sub-steps that touch test
files, the existing test is the harness — the fix must keep the test asserting the
same truth (Step 4 spells out the expected pass/fail per file). No new test files
are required by this unit; the acceptance harness is `tsc` + `lint` + the
integration suite.

---

## Step 1 — Add the `typecheck` npm script

- **File:** `package.json`
- **Change:** add `"typecheck": "tsc --noEmit"` to the `scripts` block. In the PR
  description (and as a `// reason` note in the plan), record: _"reason: ANVIL's
  typecheck gate needs a runnable script; `tsc` is already a transitive dep via
  `typescript` in devDependencies — no new package."_
- **No new dependency.** `typescript` is already installed.
- **Verify:** `npm run typecheck` runs (it will still report the 60 errors at this
  point — that is expected; this step only makes the gate runnable).
- **Commit:** `chore(td-01): add typecheck npm script`

🗣 We give the type spell-checker a one-word command (`npm run typecheck`) so the
robot reviewer can summon it. No new tool is installed — we're just adding the
speed-dial button for one that's already here.

---

## Step 2 — Mechanical type fixes (behavior-preserving)

Group into commits by file. **Nature of change: types/casts only, no runtime logic.**
For the TS2352 cluster, the root pattern is identical everywhere: a Supabase
embedded relation is typed as an **array** (`{id,name}[]`) but the code casts it to
a single object. The behavior-preserving fix is to **make the cast honest about the
shape and read the first element** where the code expects one object — OR, where the
runtime genuinely returns a single object (PostgREST returns an object for a to-one
FK with a single embed), correct the annotation. **The implementer must confirm the
actual runtime shape per query before choosing** (see Risk R1) — picking the wrong
one changes behavior (`.id` on the wrong shape returns `undefined`).

> Verification recipe for each TS2352 site: look at the `.select(...)` string for
> the embedded relation. A to-one embed (FK → single parent) returns one object at
> runtime; the array typing is the known Supabase-types quirk. In that case the fix
> is to take `[0]` of the typed array (or annotate as the single object via
> `unknown` only if the cast is provably safe — but **without** adding a suppression
> comment). Confirm against the existing integration test for that route if one
> exists; if the route has an integration test, it must stay green.

**TS2352 / TS2339 files (mechanical type group):**

- **2a.** `app/api/compliments/route.ts` (10× TS2352) — `c.poster` / `c.recipient`
  embedded relations cast to `{id;name}` (lines 41–44, 87–88, 96–99). Fix the cast
  to match the embedded shape; the code already reads `?.id`/`?.name`, so the
  resolved value must be the single object (take `[0]` if array). Verify the
  `.select` for `poster:` / `recipient:`.
  Commit: `fix(td-01): correct embedded-relation casts in compliments route`
- **2b.** `app/api/pricing/[id]/route.ts` (6×), `app/api/pricing/route.ts` (4×),
  `app/api/pricing/lines/[lineId]/route.ts` (2×), `app/api/pricing/[id]/lines/route.ts`
  (1×) — same embedded-relation pattern (`product`, `agreed_by`, customer `{id,name}`).
  Commit: `fix(td-01): correct embedded-relation casts across pricing routes`
- **2c.** `app/api/screen3/visit/notes/route.ts` (4×) — same pattern.
  Commit: `fix(td-01): correct embedded-relation casts in screen3 visit notes`
- **2d.** `app/api/cash/month/route.ts` (4× TS2339) — `Property 'type' / 'amount'
does not exist`. The mapped/aggregated row type omits `type` and `amount` that the
  reducer reads (lines 109–110). Fix: include those fields in the row type the query
  result is shaped to. Behavior-preserving (the fields are already read at runtime;
  the type just under-declares them). Verify against the cash integration test if one
  covers `/api/cash/month`.
  Commit: `fix(td-01): declare type/amount on cash-month row type`
- **2e.** `app/api/dashboard/route.ts` (1× TS2353) — object literal has
  `pipelineStatus` not present in the declared shape `{id;customer;visitType;outcome}`
  (line 253). Fix: add `pipelineStatus` to the shape (it's being set, so the consumer
  expects it) OR remove the stray property if it's dead. **Check the consumer** before
  deciding — if a reader uses `pipelineStatus`, widen the type; if nothing reads it,
  it's a dead assignment and removing it is the behavior-preserving fix. Document which.
  Commit: `fix(td-01): reconcile dashboard activity-item shape`

**TS2345 (arg-type) files:**

- **2f.** Translation-helper arg mismatch — `app/complaints/page.tsx` (588–589),
  `app/dispatch/page.tsx` (210), `app/visits/page.tsx` (786–787): a `t(key)` helper
  typed with a narrow key union is passed where `(k: string) => string` is expected.
  Fix: align the callback parameter type (widen the local annotation to `string`, or
  pass the correctly-typed helper) so the narrow-union function satisfies the
  `(k: string)` slot. Type-only.
  Commit: `fix(td-01): align translation-helper param types in list pages`
- **2g.** Enum-arg mismatches — `app/complaints/page.tsx:684` (`string` →
  `Category | null`), `:711` (`string` → `ReceivedVia | null`),
  `app/dispatch/page.tsx:518` (`string` → `Reason | null`). Fix: narrow/cast the
  string to the enum type **only where the value is provably one of the enum members**
  (e.g. it came from a typed `<select>` whose options are the enum). If the value
  could be an arbitrary string at runtime, this is a latent validation gap — in that
  case **flag in the PR** rather than blind-cast (see Risk R2). Default expectation:
  these are bound `<select>` values and a narrowing cast is safe and behavior-preserving.
  Commit: `fix(td-01): type complaint/dispatch enum args`

**TS2322 (type mismatch) files:**

- **2h.** Next.js typed-routes string→`Route` — `components/BottomNav.tsx:54`,
  `components/DesktopSidebar.tsx:101`, `components/MoreDrawer.tsx:85`,
  `components/PwaGuard.tsx:66` (TS2345). A plain `string` is passed where Next's typed
  router wants a `Route`/`UrlObject`. Fix: cast the literal href to `Route` via the
  Next `Route` type import (`import type { Route } from 'next'`) **or** type the href
  source as `Route`. Type-only; the URLs don't change.
  Commit: `fix(td-01): satisfy next typed-routes on nav hrefs`
- **2i.** `app/map/page.tsx:97` — `"full"` not assignable to `"lg"|"2xl"|"4xl"`. A
  size prop is given a value outside the component's accepted union. **Investigate:**
  is `"full"` a real supported size the union forgot, or a typo for an existing size?
  If the component renders `"full"` correctly today, widen the prop union to include
  `"full"` (behavior-preserving). If `"full"` was never handled, it's a latent bug —
  pick the intended size and document. Likely the former. Document the decision.
  Commit: `fix(td-01): reconcile map page size prop`
- **2j.** `hooks/usePushNotifications.ts:83` — `Uint8Array<ArrayBufferLike>` not
  assignable to `BufferSource` (the `applicationServerKey` for push subscribe). This
  is the well-known TS 5.7 `ArrayBufferLike` vs `ArrayBuffer` narrowing. Fix: ensure
  the key is a `Uint8Array` backed by a plain `ArrayBuffer` (e.g. construct/copy into
  one, or type-assert to `BufferSource` **without** a suppression comment via a typed
  helper). Behavior-preserving — same bytes. Verify push-subscribe still functions
  in a smoke if feasible; otherwise rely on type correctness.
  Commit: `fix(td-01): type push applicationServerKey as BufferSource`

**TS2304 (cannot find name) file:**

- **2k.** `app/haccp/annual-review/page.tsx:1482–1483` (3× `Cannot find name
'saveTimer'`). A `saveTimer` ref/variable is referenced but never declared (or its
  declaration was removed). **Investigate:** find where `saveTimer` was meant to be
  declared — almost certainly a `useRef`/`let` for a debounce timer. The fix is to
  declare it (restore the intended `const saveTimer = useRef<...>(null)` or equivalent
  at the right scope). This is **behavior-relevant** (a debounce/auto-save timer):
  treat as a **real-bug-adjacent** fix — document root cause + before/after. If the
  intended declaration cannot be determined unambiguously from surrounding code,
  **ESCALATE** rather than guess. See Step 4f.

---

## Step 3 — Cosmetic lint fixes (markup/type only)

**Nature of change: JSX markup and attribute names only. No runtime logic.**

- **3a. `react/jsx-key` (39 across 6 files).** For each missing-key list render, add a
  `key`. **Rule per the spec: use a stable identity (id) where item identity matters;
  array index is acceptable ONLY for a static, never-reordered, never-filtered list.**
  Inspect each list before choosing. Files & counts:
  - `app/admin/at-risk/page.tsx` (5: lines 120,121,126,127,128)
  - `app/admin/commitments/page.tsx` (5: 120–123,128)
  - `app/admin/discrepancies/page.tsx` (8: 196–198, 203–207)
  - `app/admin/prospects/page.tsx` (5: 122,123,127,128,129)
  - `app/admin/visits/page.tsx` (6: 239–242, 247, 250)
  - `app/dashboard/admin/_components/cards.tsx` (10: 120–123, 179,180,183, 392,393,397)

  > Many of these clustered line ranges look like static header/skeleton cells (fixed
  > set of columns) — those can take a stable string key or index safely. Dynamic
  > data rows must take the row's id. Decide per list; note any where index was chosen.

  Commit (one per file, or one for the admin pages + one for cards.tsx):
  `fix(td-01): add list keys in <file>`

- **3b. `react/no-unescaped-entities` (16 across 8 files).** Escape the literal
  `'`/`"` in JSX text with the entity (`&apos;` / `&quot;` etc.). Pure text-render
  fix; the displayed character is identical. Files & lines:
  - `app/haccp/calibration/page.tsx` (536, 724×2)
  - `app/haccp/cleaning/page.tsx` (499)
  - `app/haccp/documents/page.tsx` (182×2)
  - `app/haccp/mince/page.tsx` (1138, 1372)
  - `app/haccp/process-room/page.tsx` (847×2, 905×2)
  - `app/haccp/product-return/page.tsx` (726)
  - `app/pricing/page.tsx` (253×3)

  Commit: `fix(td-01): escape JSX entities in haccp + pricing pages`

- **3c. `jsx-a11y/role-supports-aria-props` (1).**
  `components/BottomSheetSelector.tsx:77` — `aria-selected={isSelected}` on a
  `<button>` (implicit role `button`) is invalid; `aria-selected` belongs to roles
  like `option`/`tab`. **Fix:** change to `aria-pressed={isSelected}` — the correct
  ARIA attribute for a toggle button, which is exactly the toggle-selection semantics
  here. Behavior-preserving for sighted users; **improves** correctness for screen
  readers (same intent, valid attribute).
  Commit: `fix(td-01): use aria-pressed on BottomSheetSelector toggle button`

🗣 Step 3 is the cosmetic batch: give list items name-tags, turn raw quote marks into
their "safe spelling," and swap one accessibility label for the correct one. None of
it changes what the app does — only what the linter and screen readers see.

---

## Step 4 — The ~10 real-bug fixes (each documented; ambiguous ones ESCALATE)

### 4a. `app/cash/page.tsx` — duplicate `recalc` function (TS2393, lines 392 & 674)

- **Root cause:** two byte-identical `recalc(prev, entries)` function declarations
  exist in the same component scope — one at line 392 (sitting among the other
  helpers like `onEntrySaved`), one at line 674 (placed _after_ the component's
  `return` on line 671, with a comment "Nested helper so it has access to summary").
  Function hoisting puts both in scope; two same-named declarations = the duplicate
  error. They are identical, so runtime behavior is the same regardless of which runs.
- **Fix:** delete the post-`return` copy (lines 674–679 + its comment on 673). Keep the
  one at 392, which sits with the other helpers and is unambiguously the live, readable
  one. **No-reformat:** delete only those lines; do not re-indent neighbours.
- **Before/after behavior:** identical. `recalc` still computes the same
  income/expense/closing totals. The dead duplicate is removed.
- **Not ambiguous** (identical bodies) → fix in place, documented.
- Commit: `fix(td-01): remove duplicate recalc in cash page (TS2393)`

### 4b. `lib/translations.ts` — duplicate keys `cancel` (163) & `loading` (165) (TS1117)

- **Root cause:** `cancel` is declared at both line 25 and line 163; `loading` at
  both line 17 and line 165. **Both pairs are byte-identical** (verified: `cancel` =
  `{en:'Cancel', tr:'İptal'}` in both; `loading` = `{en:'Loading…', tr:'Yükleniyor…'}`
  in both).
- **Fix:** delete the later duplicate (lines 163 and 165). The earlier declarations
  (17, 25) remain.
- **Before/after behavior:** identical — same values either way; no user-facing copy
  changes.
- **Not ambiguous** → fix in place, documented.
- Commit: `fix(td-01): remove identical duplicate translation keys (cancel, loading)`

### 4c. `lib/translations.ts` — duplicate key `logNew` (189) (TS1117) — **COPY DECISION → ESCALATE**

- **Root cause:** `logNew` is declared at line 90 (`tr: 'Yeni Kayıt'`) AND line 189
  (`tr: 'Yeni Kaydet'`). **The Turkish values differ.** Because line 189 comes later
  in the object literal, **`'Yeni Kaydet'` is the value live in production today.**
- **The decision:** removing the duplicate forces a choice of which Turkish string
  survives. Deleting line 189 (keep line 90) would silently change the on-screen
  Turkish copy from the current `'Yeni Kaydet'` back to `'Yeni Kayıt'` — a user-facing
  behavior change. Deleting line 90 (keep 189) preserves today's live string.
- **Recommendation:** delete line 90, keep line 189 → preserves the live string
  `'Yeni Kaydet'` (behavior-preserving). **But this is user-facing copy, so flag for
  Hakan to confirm** `'Yeni Kaydet'` is the intended wording before the implementer
  commits. (`'Yeni Kayıt'` = "New Record"; `'Yeni Kaydet'` = "Save New" / "Log New" —
  the latter matches the English `'Log New'`, which supports keeping line 189.)
- **ESCALATE TO HAKAN:** confirm the surviving Turkish value for `logNew`.
- Commit (after confirmation): `fix(td-01): dedupe logNew translation key (keep live value)`

### 4d. `scripts/test-routing-engine.ts:768` — always-falsy expression (TS2873)

- **Root cause:** `routingPreference: (null as string | null) ? 'TRAFFIC_AWARE_OPTIMAL'
: 'TRAFFIC_AWARE'`. The literal `null` cast to `string | null` is statically `null`,
  so the ternary condition is always falsy → TS flags it. This is a **test fixture**
  deliberately exercising the "no departure time → TRAFFIC_AWARE" branch (the test on
  line 771 asserts `'TRAFFIC_AWARE'`). The awkward `(null as string | null)` is what
  trips the checker.
- **Fix:** bind a typed variable and use it as the condition, mirroring how the
  `withFuture` case (line 761) uses `futureISO`:
  `const noDepartureISO: string | null = null` then
  `routingPreference: noDepartureISO ? 'TRAFFIC_AWARE_OPTIMAL' : 'TRAFFIC_AWARE'`.
  TS no longer sees a constant-folded literal in the conditional position.
- **Before/after behavior:** identical — still falsy, still resolves to
  `'TRAFFIC_AWARE'`, the assertion on 771 still passes. The test keeps testing the
  same branch.
- **Not ambiguous** → fix in place, documented.
- Commit: `fix(td-01): clear always-falsy ternary in routing-engine test fixture`

### 4e. `tests/unit/annualReview.test.ts:1351` — always-truthy expression (TS2872)

- **Root cause:** `expect(!"exists" || future < today).toBe(false)`. `"exists"` is a
  non-empty **string literal** → always truthy → `!"exists"` is always `false`, which
  TS flags. The intent mirrors the production `FoodFraudDefencePanel` `review_due`
  logic: `review_due = !exists || next_review < today`, where `exists` is a **boolean**.
  Someone wrote the string `"exists"` where a boolean was meant.
- **Fix:** replace `!"exists"` with the boolean it stands for. This test case is
  "review_due false when next_review in future" with the record existing, so `exists`
  should be `true`: write `const exists = true;` then
  `expect(!exists || future < today).toBe(false)`. (Line 1352 already isolates
  `future < today` → `false`, and with `exists = true`, `!exists` = `false`, so the
  `||` is `false` — assertion still `.toBe(false)`.)
- **Before/after behavior:** the test still asserts `false` and still passes; it now
  genuinely exercises the `!exists || …` shape instead of a constant. **No regression
  to the F-TD-13 midnight-flake fix:** that fix concerned date/`today` handling
  (`today` is already computed from `new Date().toISOString().slice(0,10)` at line
  1346). This change touches only the `!"exists"` operand, not the date logic — verify
  the surrounding `today`/`future`/`past` lines are untouched.
- **Not ambiguous** → fix in place, documented. **Implementer must re-read F-TD-13's
  touch to this file and confirm the date assertions are unchanged before committing.**
- Commit: `fix(td-01): use boolean exists flag in annualReview review_due test`

### 4f. `app/haccp/annual-review/page.tsx:1482–1483` — `saveTimer` undeclared (TS2304)

- **Root cause:** `saveTimer` is referenced (cleared/assigned) at 1482–1483 but has no
  declaration in scope — a debounce/auto-save timer ref whose declaration is missing.
- **Investigation required:** locate the auto-save block and determine the intended
  declaration (almost certainly a `useRef<ReturnType<typeof setTimeout> | null>(null)`
  or a module/component-scoped `let`). Restore the declaration at the correct scope so
  the clear/set at 1482–1483 operate on a real ref.
- **Behavior:** restoring the missing timer ref makes the intended debounce work as
  designed (today this code path would throw a ReferenceError at runtime if reached —
  so this is a genuine latent bug, not noise). Document before (broken/throws) vs after
  (debounce works).
- **ESCALATE-IF-AMBIGUOUS:** if the intended declaration (scope, ref vs let, type)
  cannot be determined unambiguously from the surrounding auto-save code, **ESCALATE
  TO HAKAN** rather than guess — a wrong scope could change auto-save timing on a
  compliance screen. Default expectation: a component-scoped `useRef` is the obvious
  intended shape; if so, fix in place and document.
- Commit: `fix(td-01): restore saveTimer ref in annual-review auto-save (TS2304)`

### 4g. `tests/unit/trainingTile.test.ts:148 & :152` — comparison no overlap (TS2367)

- **Root cause:** **NOT a logic bug — a type-narrowing artifact.** `const CURRENT =
'V2.0'` and `const version = 'V1.0'` are inferred as the **literal types** `'V2.0'`
  / `'V1.0'`, so TS judges `version === CURRENT` (line 148) and `'v2.0' === CURRENT`
  (line 152) as comparisons between non-overlapping literal types and flags them —
  even though the **runtime assertions are exactly correct and intended**: line 148
  asserts `'V1.0' === 'V2.0'` is `false` ("warns when version does not match"); line
  152 asserts case-sensitivity (`'v2.0' === 'V2.0'` is `false`). The passing test at
  line 143 (`version === CURRENT` → `true` with `version = 'V2.0'`) relies on `CURRENT`
  too.
- **Fix:** widen `CURRENT` to `string` so TS stops treating it as a frozen literal:
  `const CURRENT: string = 'V2.0'` (line 139). This clears both 148 and 152 in one
  change, and the true-case at 143 still type-checks as a string comparison. No
  assertion value changes.
- **Before/after behavior:** all three assertions (143 true, 148 false, 152 false)
  unchanged and still pass. The test still verifies "matches", "does-not-match", and
  "case-sensitive". 🗣 The test was right all along; TypeScript was over-thinking two
  fixed strings. We just tell it "treat these as ordinary text," and it stops
  objecting — the test asserts the same three truths.
- **Not ambiguous** → fix in place, documented.
- Commit: `fix(td-01): widen CURRENT to string in trainingTile version test`

### 4h. `app/haccp/cold-storage/page.tsx:465` — exhaustive-deps `doSubmit` — **ESCALATE**

- **Context:** `handleSubmitAttempt = useCallback(() => { …; doSubmit(null) },
[deviations])` omits `doSubmit` from its deps. `doSubmit` is itself a `useCallback`
  with deps `[units, temps, session, date, comments]`, so its identity changes on
  **every temperature keystroke** (`temps` updates). `handleSubmitAttempt`'s own dep
  `[deviations]` also recomputes as temps change, so in practice the captured
  `doSubmit` is _usually_ fresh — but not guaranteed, so there is a latent
  stale-closure risk: a submit could fire against a slightly older snapshot.
- **Why it's an ESCALATE, not a mechanical fix:** the spec mandates escalation for
  exhaustive-deps, and this is a **HACCP food-safety temperature screen**. Adding
  `doSubmit` to the array is the lint-correct fix and is **not** an infinite-loop risk
  (no effect re-triggers off `handleSubmitAttempt`'s identity). But it does change when
  the memoized callback re-creates, and on a compliance submit path Hakan should decide
  whether the dep array was intentionally narrow.
- **Recommendation:** add `doSubmit` to the dependency array — `}, [deviations,
doSubmit])`. This is safe (no loop) and removes the stale-closure risk. **No
  `eslint-disable` permitted** (that would violate constraint 1 and fail F-27).
- **ESCALATE TO HAKAN** before the implementer touches it.

### 4i. `app/haccp/process-room/page.tsx:645` — exhaustive-deps `doTempSubmit` — **ESCALATE**

- **Context:** identical shape — `handleTempSubmit = useCallback(() => { …;
doTempSubmit(null) }, [bothFilled, hasDeviation])` omits `doTempSubmit`, which is a
  `useCallback` with deps `[session, date, productNum, roomNum, loadData]`. Same
  stale-closure risk on a **HACCP temperature submit** path.
- **Recommendation:** add `doTempSubmit` to the array — `}, [bothFilled, hasDeviation,
doTempSubmit])`. No loop risk (no effect re-fires off `handleTempSubmit`'s identity);
  removes the staleness risk. No `eslint-disable` permitted.
- **ESCALATE TO HAKAN** before the implementer touches it.

🗣 4h and 4i are the two "reminder alarm forgot to watch something" cases, on the
fridge/room temperature screens the food-safety law cares about. The safe answer is to
add the missing watch — but because these are compliance screens and the dep array
_could_ have been left narrow on purpose, Hakan signs off before we touch them.

---

## Step 5 — Final verification

Run all three, in order, and require all green:

1. `npm run typecheck` → **exit 0, 0 errors** (was 60).
   🗣 Type spell-checker: silent.
2. `npm run lint` (`next lint`) → **exit 0, 0 problems** (was 58).
   🗣 Style spell-checker: silent.
3. `npm run test:integration` → **115/115 passing** (baseline held).
   🗣 The full robot regression run is still all-green — we changed nothing it cares
   about.

Also re-run `npm run test` (unit suite) since Step 4d/4e/4g edited unit test files —
confirm those specs still pass with the same assertions.

Open a PR (do **not** merge). PR description must include: the `typecheck` script
`// reason` line, the list of real-bug fixes with before/after, and the ESCALATE
outcomes (4c, 4h, 4i, and 4f-if-ambiguous) with Hakan's decisions recorded.

---

## ESCALATE points (surface these at the gate before implementing)

| #   | Location                                            | Question for Hakan                                                                                                                                                            |
| --- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4c  | `lib/translations.ts` `logNew` (90 vs 189)          | Confirm the surviving Turkish value. Live today = `'Yeni Kaydet'` (line 189); recommend keeping it (matches English `'Log New'`). Other option `'Yeni Kayıt'` = "New Record". |
| 4h  | `app/haccp/cold-storage/page.tsx:465`               | OK to add `doSubmit` to the `useCallback` deps on this HACCP temperature screen? (Recommended: yes — safe, no loop, removes stale-closure risk. No `eslint-disable`.)         |
| 4i  | `app/haccp/process-room/page.tsx:645`               | OK to add `doTempSubmit` to the `useCallback` deps on this HACCP temperature screen? (Recommended: yes — same reasoning.)                                                     |
| 4f  | `app/haccp/annual-review/page.tsx:1482` `saveTimer` | Only if the intended declaration is ambiguous from surrounding code. Default: restore a component-scoped `useRef`; escalate only if scope/shape is unclear.                   |

---

## Risk Assessment

Scaled to the change: this is type/lint hygiene, so most categories are genuinely
N/A, but two categories carry real risk and one launch-blocker category applies.

### Concurrency / race conditions

- **R-CONCURRENCY (4h, 4i): MEDIUM — must-fix gating is via ESCALATE, not a code
  guess.** The two exhaustive-deps fixes touch `useCallback` memoization on HACCP
  temperature-submit paths. Adding the dep is the recommended, loop-free fix, but a
  wrong call (e.g. silencing instead of fixing, or a fix that introduces a refetch on
  every keystroke) could affect a food-safety submit. **Mitigation:** ESCALATE to
  Hakan (4h/4i) before touching; verify no effect re-fires off the callback identity;
  manual smoke of a temperature submit + deviation (CCA) flow after the change.
  **Must-fix? The ESCALATE is mandatory** — implementer may NOT resolve 4h/4i by guess
  or by `eslint-disable`. Not a code-architecture blocker, but a process gate.

### Security

- **No material risks in this category.** No auth, RLS, input-trust, or secret-handling
  changes. The enum-arg casts in 2g (`Category`/`ReceivedVia`/`Reason`) touch
  client-side display typing, not server-side validation; if any cast hides a real
  unvalidated-input path, 2g already says to flag rather than blind-cast (Risk R2).

### Data migration

- **No material risks.** No schema, migration, or data-shape persistence changes. The
  Supabase-embedded-relation casts (Step 2) change **types**, not queries or writes.

### Business-logic flaws (latent bugs surfaced by the type-checker)

- **R1 — TS2352 embedded-relation casts (Step 2a–2c): MEDIUM.** If the implementer
  guesses wrong between "take `[0]` of an array" vs "annotate as single object," a
  field read (`.id`/`.name`) could silently become `undefined` at runtime — a behavior
  change on user-facing data (poster/recipient names, pricing product names).
  **Mitigation:** the plan mandates verifying the actual runtime shape per `.select`
  before choosing, and keeping any covering integration test green. **Must-fix? No, but
  high-attention** — note the chosen shape per file in the PR.
- **R2 — enum/size/route casts (2g, 2i): LOW–MEDIUM.** A blind cast of `string` → enum
  (2g) or widening the `map` size union (2i) could mask a genuinely invalid value.
  **Mitigation:** cast only where the value provably comes from a typed source
  (`<select>` options, a fixed prop); otherwise flag. Documented per site.
- **R3 — `saveTimer` restoration (4f): LOW–MEDIUM.** Restoring the wrong timer
  scope/shape could change auto-save timing on the annual-review compliance screen.
  **Mitigation:** ESCALATE if ambiguous; default to the obvious component-scoped
  `useRef`. **Must-fix? No** (ESCALATE-if-ambiguous covers it).
- **R4 — `logNew` copy (4c): LOW (user-facing).** Wrong duplicate kept = wrong Turkish
  word on screen. **Mitigation:** ESCALATE 4c; default to preserving the live value.

### Launch blockers

- **R-GATE: the unit's own acceptance is the gate.** If any of tsc=0, lint=0, or
  integration 115/115 fails at Step 5, the PR does not pass Gate 4 — by design this
  unit _is_ what flips ANVIL's typecheck+lint to STRICT, so partial completion blocks
  later sprint units. **Mitigation:** Step 5 hard-requires all three green before PR.
- **No-suppression compliance:** any `@ts-expect-error` / `eslint-disable` / `@ts-ignore`
  introduced to hit zero is a **launch blocker** (violates constraint 1; F-27 will fail
  it). **Mitigation:** explicit in every step; verify with a grep for new suppression
  comments in the diff before opening the PR.

### Must-fix summary

- **No code-architecture must-fix blockers** (no ports/adapters, no migration, no
  security regression). The mandatory gates are **process gates**: the four ESCALATE
  items (4c, 4h, 4i, and 4f-if-ambiguous) must be resolved by Hakan, NOT by implementer
  guess, and the **zero-new-suppressions** rule must hold (a violation is a hard
  blocker). These are Gate-2 conditions: the plan resolves them by routing the
  ambiguous decisions to Hakan rather than baking in a guess.

---

## Hexagonal / rip-out check

**N/A — this is type/lint hygiene, no new seams.**

- **Port used/added:** none. No interface in `lib/ports/` is created, changed, or
  consumed.
- **Adapter:** none. `lib/adapters/**` is not touched. The TS2352 fixes edit type
  casts inside existing un-migrated API routes (the frozen direct-Supabase surface),
  which is permitted by ADR-0003 (only _new_ SDK imports are frozen).
- **New dependencies:** none. The `typecheck` script uses `tsc`, already installed via
  the existing `typescript` devDependency. No `package.json` dependency entries added.
- **Rip-out test:** **N/A / PASS-by-vacuity** — no new vendor coupling is introduced,
  so the "one adapter + one config line" count is unchanged by this unit.

🗣 In plain English: nothing here adds or moves a "socket." We're fixing labels,
quote marks, and a few genuine bugs inside rooms that already exist. The Lego shape of
the app is exactly the same after this as before — so the rip-out question doesn't
apply, and there are no new wires to justify.
