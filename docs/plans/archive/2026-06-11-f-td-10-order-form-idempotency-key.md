# F-TD-10 — Wire `Idempotency-Key` into the order form (activate the F-08 duplicate guard)

- **Date:** 2026-06-11
- **Base:** `main` @ `fd5c558`
- **Spec:** Gate 1 locked spec (FORGE conductor) + BACKLOG.md F-TD-10 (line 106)
- **Size:** deliberately tiny — ~15 lines of app code + 2 tests. This plan is proportionate; no gold-plating.

## Goal (PRD — the destination)

When a sales rep's "Confirm order" tap gets retried (double-tap, flaky wifi, server hiccup), at most **one** order is created — the retry silently gets back the order the first tap made. Editing the form always means a genuinely new order.

> **🗣 In plain English:** today the server already knows how to swallow duplicate taps, but the order screen never tells it "this is the same tap as before". This change makes the screen attach a one-time fingerprint to each order attempt, so a nervous double-tap or a wifi retry can never create two orders.

## Domain terms used

- **Idempotency key** (CONTEXT.md, line 26) — the unique fingerprint the order form sends with each "place order" request. This unit is the one CONTEXT.md already describes; no new terms.

## Compliance

**NO.** No auth, payments, data retention, HACCP, or financial logic touched. The fingerprint is a random UUID containing no personal or business data.

> **🗣 In plain English:** nothing regulated or sensitive is involved — the fingerprint is a meaningless random number.

## ADR conflicts

**None.**

- ADR-0002 (hexagonal shape): not implicated — this is a presentation-layer change plus one pure TypeScript helper. No ports, no adapters, no vendor SDKs.
- ADR-0003 (strangler fig / FREEZE rule): the FREEZE rule forbids new Supabase SDK imports outside adapters — none added. `lib/orders/` remains the live home for client-side order helpers (the page already imports `featureFlag` from there), so adding one pure helper there follows the existing pattern, not the frozen one.
- ADR-0004 (RLS/service-role): untouched; the key ledger table and its security posture shipped in F-08.

> **🗣 In plain English:** none of the standing architecture decisions are contradicted — this change lives entirely in the screen layer and a tiny owned helper file.

## Ports, adapters, dependencies (hexagonal)

- **Ports touched:** None — the server contract (`OrdersRepository.createOrder` with optional key) shipped in F-08 and is unchanged.
- **New ports introduced:** None.
- **Adapters touched / added:** None.
- **New package dependencies:** None. `crypto.randomUUID()` is a built-in browser/Node API — and `app/orders/new/page.tsx` line 48 **already uses it** (`emptyLine()` keys), so the repo has zero polyfill conventions for it and this adds zero new compatibility surface.
- **Rip-out test passes?** YES — nothing vendor-specific is introduced anywhere.

> **🗣 In plain English:** no new building blocks, no new third-party libraries. We reuse a random-number generator the browser ships with and that this exact screen already uses.

## Chosen key-lifecycle mechanism (design decision)

**Chosen:** extract a ~15-line pure helper `createIdempotencyKeySource()` in a new file `lib/orders/idempotencyKey.ts` — a factory returning `{ current(): string, reset(): void }` with an injectable generator defaulting to `() => crypto.randomUUID()`. `current()` lazily creates the key on first call and returns the same value until `reset()`. The page holds one instance via `const [keySource] = useState(createIdempotencyKeySource)` (lazy initializer = created exactly once per mount), and a **single `useEffect` watching the five payload-relevant states** — `[customer, deliveryDate, deliveryNotes, orderNotes, lines]` — calls `keySource.reset()`. `handleSubmit` sends `keySource.current()` as the `Idempotency-Key` header and calls `keySource.reset()` on success before `router.push`.

**Justification (one paragraph):** Of the three options the spec offered, this is the smallest honest one. (a) Per-field-handler resets would touch ~7 call sites (`setCustomer` in the picker, three input `onChange`s, `updateLine`, `addLine`, `removeLine`) and every future field is a new place to forget; the effect's dependency array instead mirrors the payload construction declaratively in one place. (b) A bare `useRef` inside the page with no extraction would leave the lifecycle untestable: this repo has **no React component/hook test harness** (no `@testing-library/*`, no jsdom in `package.json`; everything under `tests/unit/**` tests pure modules), and adding one would violate the no-new-dependencies constraint. (c) A custom hook (`useIdempotencyKey`) would likewise be untestable without `renderHook`. The pure factory is testable today with zero new machinery, and the page-side wiring it leaves behind (one `useState`, one `useEffect`, two call sites) is small enough that the integration test plus Gate-4 preview smoke cover it end-to-end. Retries are safe by construction: the error paths only change `submitting`/`submitError`, which are **not** in the effect's dependency array, so the key survives until the user edits content.

> **🗣 In plain English:** the "remember the fingerprint / forget the fingerprint" logic goes in its own tiny file we can test directly, because this project has no tooling to test whole screens in isolation and we refuse to add tooling for a 15-line change. The screen then just says "forget the fingerprint whenever any order detail changes" in one declarative line, rather than sprinkling "forget it" into seven different button handlers where one could be missed.

## Files to change (4 — two are tests)

1. **`lib/orders/idempotencyKey.ts`** (new, ~15 lines) — `createIdempotencyKeySource(generate = () => crypto.randomUUID())` factory described above. Pure TypeScript, no imports.
   > **🗣 In plain English:** the new "fingerprint keeper" — hands out one fingerprint, keeps handing out the same one until told to forget it.
2. **`app/orders/new/page.tsx`** (~10 lines changed) — import the factory; `const [keySource] = useState(createIdempotencyKeySource)` near the other state (~line 96); one `useEffect` with deps `[customer, deliveryDate, deliveryNotes, orderNotes, lines]` calling `keySource.reset()`, carrying a comment binding the dep array to the `payload` object built at ~line 162 ("if you add a field to the payload, add it here"); add `"Idempotency-Key": keySource.current()` to the `fetch` headers (~line 178); call `keySource.reset()` on the success path before `router.push` (~line 197). The two error paths (server error ~line 193, network catch ~line 201) are left untouched — that is what makes the retry reuse the key.
   > **🗣 In plain English:** the order screen now attaches the fingerprint when posting, forgets it after success or after any edit, and deliberately keeps it across "please try again" retries.
3. **`tests/unit/orders/idempotencyKey.test.ts`** (new) — unit tests for the helper (sits beside the other `tests/unit/orders/` suites).
4. **`tests/integration/orders-idempotency.test.ts`** (extend) — generalise the suite's local `postOrder` helper with an optional `body` override (defaulting to the existing `orderBody()`), and add one form-shaped replay test. Do **not** duplicate the five existing F-08 cases.
   > **🗣 In plain English:** one new robot test posts an order shaped exactly like the screen builds it, twice with the same fingerprint, and proves only one order exists.

## Steps (TDD order)

- [ ] 1. **Red:** write `tests/unit/orders/idempotencyKey.test.ts` (file: `tests/unit/orders/idempotencyKey.test.ts`). Cases: (a) `current()` returns the same value across repeated calls; (b) after `reset()`, `current()` returns a different value (prove with an injected counter generator); (c) the key is generated lazily — injected generator not called until first `current()`; (d) default generator yields a UUID-shaped string. Run `npm test` — fails (module missing).
- [ ] 2. **Green:** implement `lib/orders/idempotencyKey.ts` (function: `createIdempotencyKeySource`). `npm test` passes.
- [ ] 3. Add the integration test to `tests/integration/orders-idempotency.test.ts`: extend `postOrder` with `body?: Record<string, unknown>` (default `orderBody()`); new case posts the exact form wire shape — `{customer_id, delivery_date, delivery_notes: "ring bell", order_notes: null, lines: [{product_id, ad_hoc_description: null, quantity, uom, notes: "tied"}]}` — twice with one `crypto.randomUUID()` key; assert both 201, identical `{id, reference}` bodies, and `orders` count for that id === 1 via `getServiceClient()`. **Honesty note:** this test goes green immediately (the F-08 server guard already exists) — its value is pinning the form's exact payload shape and a real-UUID key against the guard, which no existing test covers. Run `npm run test:integration` (after `npm run db:up`).
- [ ] 4. Wire `app/orders/new/page.tsx` as per Files-to-change item 2 (function: `NewOrderPageInner` / `handleSubmit`).
- [ ] 5. Verification gates (below), then hand to implementer's normal PR flow.

> **🗣 In plain English:** test the fingerprint keeper first and watch it fail, build it, prove the server honours a screen-shaped duplicate, then connect the screen — smallest-risk order.

## Test plan (TDD-first)

| #   | Behaviour (plain English)                                                                                                     | File                                           | Notes                                                                                                                        |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 1   | The fingerprint stays the same until told to forget; forgetting produces a fresh one; nothing is generated before it's needed | `tests/unit/orders/idempotencyKey.test.ts`     | Public interface only (`current`/`reset`); injectable generator keeps it deterministic                                       |
| 2   | Posting the exact order shape the screen sends, twice with one fingerprint, yields the same order number once in the database | `tests/integration/orders-idempotency.test.ts` | Reuses suite's users/customer/product fixtures and cleanup; does NOT re-test replay/race/cross-user/expiry (F-08 owns those) |

The page-side `useEffect` wiring has no isolated unit test (no component harness exists — see design decision); it is covered end-to-end by the integration test plus the three `@critical` order-pipeline smokes at Gate 4, one of which places an order through this very form.

## Acceptance criteria (PRD — what "done" looks like)

- [ ] A sales rep who double-taps "Confirm order", or whose first attempt dies with "Network error — please try again" and taps again, ends up with exactly **one** order.
- [ ] A sales rep who gets an error, **changes anything** (customer, date, notes, any line), and resubmits gets a genuinely **new** order — never a silent replay of the old content.
- [ ] After a successful order, starting the next order uses a fresh fingerprint (no carry-over).
- [ ] All existing tests stay green; the two new tests pass; the API contract is byte-for-byte unchanged (no server code touched).

> **🗣 In plain English:** one tap = at most one order, always; an edited order is always treated as a new order; nothing about the server changes.

## Risk Assessment

| ID  | Category           | Risk                                                                                                                                                                                                                                              | Severity            | Mitigation                                                                                                                                                                                                                                                                                                                                                    | Must-fix?                                                         |
| --- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| R1  | Business logic     | **Key resets too eagerly → guard never fires.** If submitting itself reset the key, every retry would carry a new fingerprint and duplicates would slip through, exactly as today.                                                                | Medium              | By design the reset effect depends only on the five payload states; the error paths mutate only `submitting`/`submitError`, which are outside the dep array, so the key provably survives retries. Unit test (a) pins "same key across calls".                                                                                                                | No — resolved in design                                           |
| R2  | Business logic     | **Key resets too lazily → a genuinely new order gets swallowed.** F-08 replay is key-based, not content-based: a stale key with edited content would return the OLD order and silently discard the new one.                                       | High if it occurred | Every payload-relevant state is in the effect's dep array, so any edit forgets the key before the user can resubmit. Residual exposure: a future payload field added without updating the dep array — mitigated by the binding comment placed directly on the effect ("payload field ⇒ dep array"), and the payload + effect sit in the same small component. | No — resolved in design; residual risk documented for code-critic |
| R3  | Concurrency / race | Effect timing: `useEffect` flushes after render, so in theory an edit and a Confirm tap inside the same event-loop tick could submit with the stale key.                                                                                          | Low                 | React flushes passive effects before processing the next discrete event; the window is sub-frame and unreachable by human interaction. Double-tap on Confirm itself is the case this unit FIXES (same key → server race logic, F-08 D1, returns one order).                                                                                                   | No                                                                |
| R4  | Security           | None new. The key is a random UUID (no PII); cross-user key reuse already returns 409 with no data leak (F-08, tested). Header length already validated server-side (`idempotencyKeyFromHeader`, max 200 — a 36-char UUID is comfortably inside). | —                   | Existing F-08 coverage.                                                                                                                                                                                                                                                                                                                                       | No                                                                |
| R5  | Data migration     | None — **this PR carries NO migration.**                                                                                                                                                                                                          | —                   | n/a                                                                                                                                                                                                                                                                                                                                                           | No                                                                |
| R6  | Launch blocker     | None identified. Rollback = revert one small PR; behaviour degrades to today's (guard dormant), never worse.                                                                                                                                      | —                   | —                                                                                                                                                                                                                                                                                                                                                             | No                                                                |

**Headline: no must-fix risks.** The two failure modes the spec names (R1 too-eager, R2 too-lazy) are both closed by the chosen design and pinned by tests/comments.

> **🗣 In plain English:** the two ways this could go wrong are forgetting the fingerprint too soon (protection never kicks in) or holding it too long (a changed order gets wrongly treated as a duplicate and vanishes). The design forgets the fingerprint on exactly the right trigger — any edit — and keeps it on exactly the right trigger — a retry of the same content — and tests nail both behaviours down. Nothing here blocks approval.

## Local verification gates

1. `npm test` — unit suite green (includes the new `idempotencyKey.test.ts`).
2. `npm run test:integration` — integration suite green (prereq `npm run db:up`; `npm run db:reset` for a fresh seed).
3. `npx tsc --noEmit` — error count at the recorded baseline (**60**), no new errors.
4. `npm run lint` — warning/error count at the recorded baseline (**58**), no new findings.

> **🗣 In plain English:** all robots green, and the two standing "known noise" counters for the type-checker and the style-checker must not go up by even one.

## PR / ship notes

- **No migration in this PR.** The per-PR Supabase preview-branch flow (ADR-0006) still applies automatically; Gate 4 preview smoke is the standard 8/8 `--unprotected` run (`npm run test:e2e:preview -- <preview-url>`).
- Out of scope (do not creep): the edit-order screen, any API/server change, any E2E spec addition, offline queueing of orders.

> **🗣 In plain English:** the database schema doesn't change, the usual pre-merge rehearsal still runs unchanged, and anything beyond the new-order screen waits for its own ticket.
