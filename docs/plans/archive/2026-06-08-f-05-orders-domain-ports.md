# F-05 — Orders / Customers / Products ports + domain types (first hexagonal unit)

## Goal

F-05 is the **first hexagonal unit in the whole strangler-fig migration**.
It defines, but does not implement, the Lego shape for the Orders bounded
context: three ports (`OrdersRepository`, `CustomersRepository`,
`ProductsRepository`) and three domain types (`Order` + line/state/uom +
input shapes, `Customer`, `Product`), all under `lib/ports/` and
`lib/domain/`. Concretely:

- `lib/domain/Order.ts` (~120 lines) — exports `OrderState`, `OrderUom`,
  `OrderLine`, `Order`, `OrderFilter`, `OrderPatch`, `CreateOrderInput`,
  `CreateOrderLineInput`, all with prose comments above every signature.
- `lib/domain/Customer.ts` (~30 lines) — exports `Customer` (id, name,
  postcode, active), minimal shape Orders needs today; F-20 Admin
  extends later.
- `lib/domain/Product.ts` (~30 lines) — exports `Product` (id, code, name,
  box_size), minimal shape Orders + picking-list rendering need today;
  F-15 Pricing / F-20 Admin extend later.
- `lib/domain/index.ts` (~10 lines) — barrel re-export of the three above.
- `lib/ports/OrdersRepository.ts` (~280 lines including comments) — 7
  methods, each hiding a non-trivial decision per ADR-0002 depth rule
  (line 25). Header comment cites ADR-0002. Each method has its own
  JSDoc comment explaining business meaning, what it hides, what it
  throws, what it returns, and the design-it-twice rationale.
- `lib/ports/CustomersRepository.ts` (~50 lines) — 1 method
  (`findCustomerById`), same comment discipline.
- `lib/ports/ProductsRepository.ts` (~60 lines) — 1 method
  (`findProductsByIds`), same comment discipline.
- `lib/ports/index.ts` (~10 lines) — barrel re-export of the three above.
- `tests/unit/ports/orders-domain.types.test.ts` (~110 lines) — a
  type-pinning fixture. Constructs realistic example values for every
  exported interface and uses TypeScript's `satisfies` operator plus
  explicit annotations to pin field-by-field shape against accidental
  drift (dropped `readonly`, removed field, weakened union literal).
  Does **not** instantiate any concrete adapter — F-06 owns that.
- One edit to `CLAUDE.md` lines 26-50 — the Folder layout + Blockers
  sections currently say `/domain`, `/app`, `/infra/adapters`, `/ui`,
  which contradicts ADR-0002 line 19 (`lib/ports/`, `lib/adapters/<vendor>/`,
  `lib/services/`, `lib/usecases/`, `lib/domain/`). F-05 aligns the
  Folder layout + Blockers list to ADR-0002 verbatim. The rest of
  `CLAUDE.md` is preserved byte-for-byte.

F-05 is the **template every subsequent domain unit copies from** —
F-13 Users, F-14 Routes, F-15 Pricing, F-16 Cash, F-17 Complaints, F-18
Visits, F-19 HACCP, F-20 Admin, F-21 Dashboard. The shape of this plan
(file headers, JSDoc tone, design-it-twice in comments, comments-first
discipline, depth rule applied everywhere, errors-out-of-existence on
reads) is the pattern. Get this one wrong and every later port unit
copies the wrong template. The plan reads as a worked example for that
reason — long, deliberate, and explicit about why each method has the
shape it does.

**What F-05 ships unused.** ADR-0003's strangler-fig sequencing (line 19) puts ports in F-05, adapters in F-06, the service in F-07, route
rewrites in F-08. F-05 lands real interface code that no production
path imports — by design. The 5 Orders routes (`app/api/orders/route.ts`,
`app/api/orders/[id]/route.ts`, `app/api/orders/[id]/picking-list/route.ts`,
`app/api/kds/orders/route.ts`, `app/api/kds/lines/[lineId]/done/route.ts`)
stay verbatim until F-08. F-FND-02's typed errors (`NotFoundError`,
`ConflictError`, `ServiceError`) are referenced in port JSDoc as the
documented contract for write methods, but no port file throws anything
at runtime — there is no runtime in a TypeScript `interface`.

**What F-05 explicitly does NOT do.**

- NO implementations under `lib/adapters/supabase/**` — that is F-06
  territory.
- NO `OrdersService` or use-case — F-07 territory.
- NO route migrations of any kind — F-08 territory.
- NO new `package.json` deps — port code is pure TypeScript, zero
  runtime imports beyond `@/lib/errors` (referenced only in JSDoc,
  not actually imported by the port files).
- NO schema changes.
- NO `middleware.ts` edits.
- NO changes to the 80+/104 hand-rolled role-check sites.
- NO changes to the 13 raw-fetch sites enumerated in ADR-0005's
  Per-Site Map.
- NO F-04 lint-rule edits (the rule already matches ADR-0002 verbatim
  — see Risks §5).
- NO `Caller` move from `lib/observability/Caller.ts` to `lib/domain/`
  — deferred to F-13 per the existing forward-looking comment at
  `Caller.ts:13-16`.
- NO `Customer` or `Product` fields beyond what Orders' methods need
  today. (Customer gains a `name`, `postcode`, `active`; Product gains
  `code`, `name`, `box_size`.)
- NO new ADR. Gate 1 confirmed F-05 IS the implementation of ADR-0002;
  no new architectural decision is being made.

---

## Source spec

- **Locked Gate 1 spec — the conductor handoff above.** Frozen. The
  three port names, the 7+1+1 method count, the seven `OrdersRepository`
  method signatures, the locked design-it-twice picks (with permission
  to overrule if a deeper alternative surfaces), the comments-first
  rule, the null-vs-throw contract on reads, the primitive-string-IDs
  rule (`createdBy`, `printedBy`, `doneBy` — NOT `Caller`), the
  type-pin test layout, and the CLAUDE.md alignment edit are all
  spec-locked. The plan implements them, surfaces one deviation to
  Gate 2 (the KDS queue method — see §5 Risks #1), and confirms the
  `OrderUom` literal set from `lib/orders/types.ts`.

- **ADR-0002 hexagonal shape and naming** —
  `docs/adr/0002-hexagonal-shape-and-naming.md`. F-05 IS the first
  implementation of this ADR. Cited verbatim throughout the plan:
  - **Line 17** — "A `port` is an interface that the app owns,
    defined in terms of business operations. […] A `domain type` is a
    plain TypeScript type owned by the app […] that never carries
    vendor shape." → All F-05 port files define interfaces; all F-05
    domain files define plain TypeScript types with zero vendor
    imports.
  - **Line 19** — "Ports live in `lib/ports/`. […] Domain types live in
    `lib/domain/`." → Folder layout used verbatim.
  - **Line 21** — "Vendor SDK imports […] are permitted inside
    `lib/adapters/**` and nowhere else." → F-05 imports zero vendor
    SDKs in any port or domain file.
  - **Line 23** — "Services do not import other services directly." →
    Not load-bearing for F-05 (no services). Forward context: F-07
    will obey this rule when `OrdersService` is built.
  - **Line 25** — "Every port method must hide at least one
    non-trivial decision — a join, a filter set, a rollback, a
    mapping, a guard. Shallow ports that mirror the vendor surface 1:1
    are rejected in review." → Every F-05 method's JSDoc explicitly
    names what non-trivial decision it hides. Documented per method
    in §2.
  - **Line 27** — "Vendor types never cross the port boundary." → F-05
    types reference no `SupabaseClient`, no `PostgrestResponse`, no
    `Database` row types. Only plain TypeScript.
  - **Line 43** — APOSD principles cited by name in the ADR:
    - **Deep modules (§3)** — ports are deep; the interface is short
      relative to the work hidden behind it. Pre-grilled picks (see
      §2) demonstrate this in the JSDoc for each method.
    - **Information hiding (§4)** — each adapter owns its vendor
      decision; the port is silent on it.
    - **Pull complexity downward (§10)** — the adapter eats the
      mapping; F-05's port methods read clean and require no
      vendor-shape-aware caller.
    - **Define errors out of existence (§11)** — read methods
      (`listOrders`, `findOrderById`, `findCustomerById`,
      `findProductsByIds`) return `Promise<X | null>` /
      `Promise<X[]>` on miss, never throw `NotFoundError`. Write
      methods throw `NotFoundError` because the caller asked to
      mutate a row that does not exist (a real error). This split
      is the APOSD principle made operational; per-method
      rationale lives in the JSDoc.
    - **Design it twice (§12)** — every non-trivial method has two
      sketched alternatives in its JSDoc with written rationale for
      the chosen shape.

- **ADR-0003 strangler-fig migration and FREEZE rule** —
  `docs/adr/0003-strangler-fig-migration-and-freeze-rule.md`. F-05 is
  the first port-extraction unit named (line 19, line 28). The ADR's
  line 19 already specifies that F-05 covers "Orders, Customers, and
  Products ports plus the matching domain types (interface comment
  before the type, depth rule applied, design-it-twice on every port
  shape)". This plan realises that prose verbatim. Routes are NOT
  touched per the strangler-fig discipline.

- **ADR-0004 RLS posture** —
  `docs/adr/0004-rls-vs-service-role-security-model.md`. Not touched.
  Port interfaces do not encode auth posture. The Caller stays at the
  service/route boundary (locked spec point: method identity is
  primitive `string` IDs, not the `Caller` object).

- **ADR-0005 F-01 narrowing** —
  `docs/adr/0005-f01-narrowed-raw-fetch-deferred-to-port-extractions.md`.
  None of the 13 raw-fetch sites are in the Orders domain. F-05 has
  no overlap with the Per-Site Map; the table's entries map to F-15,
  F-16, F-17, F-18, F-20, F-11 — not F-05.

- **Architecture review v1.2 Phase 1** —
  `docs/architecture-review-2026-06-06.md` lines 326-336. F-05 is the
  first entry in Phase 1. Quoted verbatim: _"F-05 Define ports:
  `lib/ports/OrdersRepository.ts`, `lib/ports/CustomersRepository.ts`,
  `lib/ports/ProductsRepository.ts`. Define domain types (`Order`,
  `OrderLine`, `Customer`, `Product`). No implementations yet. **Apply
  the depth rule** — each method exposes a business operation, never a
  1:1 vendor call. **Design-it-twice** — sketch two interface options
  per port, pick the better one. Write the interface comment BEFORE
  the type. (1 PR — types + interface comments only.)"_ This plan
  implements that paragraph.

- **F-FND-02 typed-error contract** — `lib/errors/`. The port JSDoc
  references `NotFoundError`, `ConflictError`, `ServiceError` as the
  documented error contract for write methods. F-05 does NOT import
  the error classes into port files at runtime — JSDoc only. The
  imports become real in F-06 (adapter) and F-07 (service).

- **F-FND-03 observability surface** — `lib/observability/`. Not
  directly imported by F-05 ports. Forward context: F-07 services
  receive a `Caller` and pass `caller.userId` as the `createdBy` /
  `printedBy` / `doneBy` string to the port methods. The port stays
  framework-free; the service does the bridging.

- **F-04 ESLint FREEZE rule** — `.eslintrc.json`. F-05 introduces zero
  Supabase SDK imports anywhere. The rule does not fire on any F-05
  file. The `lib/adapters/supabase/**` allow-list glob in F-04's
  override is forward-looking and matches zero files at F-05 ship
  time — F-06 will populate it.

- **F-INFRA-01 local Supabase stack** — not used. F-05 ships no
  integration test (no adapter exists yet to integrate with). The new
  `tests/unit/ports/orders-domain.types.test.ts` is a Vitest unit test
  with no DB dependency.

- **F-04 plan** —
  `docs/plans/2026-06-08-f-04-eslint-freeze-guard.md`. Structural
  template for F-\* plans; matched here in depth and nine-section shape
  (Goal → Source spec → Compliance → Branch + base → §1 Recon → §2
  Files → §3 Steps → §4 Test matrix → §5 Risks → §6 Rollback → §7 DoD
  → §8 Out of scope → §9 ADR/docs implications).

- **Pre-existing Orders code surface (the rip-out target)** — read
  in full before drafting any port shape:
  - `app/api/orders/route.ts` (190 lines) — GET list + POST create.
    The POST handler at lines 103-183 contains the "verify customer +
    verify products + atomic create with rollback" business logic
    that F-07 will lift behind `OrdersService.createOrder`. F-05's
    `OrdersRepository.createOrder` covers the _atomic create with
    rollback_ part only; customer + product verification stays at the
    service boundary per Gate 1 Q2.5 (the planner confirms this
    decision below in §2).
  - `app/api/orders/[id]/route.ts` (183 lines) — GET single + PUT
    edit. The PUT handler at lines 93-176 contains the
    state-permission gating (placed → sales/office allowed; printed →
    office only; completed → 403) and the orders-patch + delete-lines
    - insert-lines pattern. State-permission gating is a service
      concern (the role check belongs at the route/service boundary
      where the `Caller` is in scope); the orders-patch + line-replace
      is the `OrdersRepository.updateOrder` method.
  - `app/api/orders/[id]/picking-list/route.ts` (245 lines) — GET +
    POST. The POST handler at lines 174-243 contains the placed →
    printed transition logic (line 203-211) and the reprint logic
    (line 212-222), plus the audit-trigger-emits dance. F-05's
    `OrdersRepository.recordPrint` covers both branches in one
    method — see the design-it-twice analysis below.
  - `app/api/kds/orders/route.ts` (90 lines) — GET KDS queue. Reads
    `state='printed' OR (state='completed' AND completed_at >= since)`
    plus audit-log recent-flashes. **This route's query shape is NOT
    covered by the 7 locked methods.** Flagged in §5 Risks #1 as the
    single Gate 2 deviation the planner is surfacing.
  - `app/api/kds/lines/[lineId]/done/route.ts` (173 lines) — POST
    mark line done + auto-complete order. The POST handler at lines
    40-172 contains the butcher validation (Users-domain — F-13), the
    TOCTOU `is('done_at', null)` guard at line 124, the remaining-lines
    count at lines 142-152, and the atomic state transition at lines
    155-160. F-05's `OrdersRepository.markLineDone` returns flags
    (`{ alreadyDone, orderId, allLinesDone }`) so the use-case
    composes; `OrdersRepository.markOrderCompleted` does the final
    state transition.
  - `lib/orders/types.ts` — existing definitions used as source of
    truth for the locked literal sets:
    - `OrderState = 'placed' | 'printed' | 'completed'` (line 15) —
      F-05 re-uses this literal set verbatim (see §2 `OrderState`).
    - `OrderUom = 'kg' | 'unit'` (line 18) — confirms the conductor's
      ask. F-05 re-uses the literal set verbatim (see §2 `OrderUom`).
    - `OrderRow`, `OrderLineRow`, `OrderAuditLogRow` — existing
      DB-row-shape interfaces. F-05's `Order` and `OrderLine` are
      cleaner domain shapes (see §2 design notes).
  - `lib/orders/validation.ts` — existing request body shapes
    (`CreateOrderRequest`, `CreateOrderLineRequest`,
    `UpdateOrderRequest`). F-05's `CreateOrderInput`,
    `CreateOrderLineInput`, `OrderPatch` are the _domain_ shapes that
    sit one layer in; the route's zod-validated request shape (when
    F-08 wires zod) will normalise into these. **F-05 does NOT
    re-use the request shapes verbatim** — they have ergonomic
    differences (e.g. `delivery_notes?: string | null` on the request
    vs the stricter null discipline on the domain shape; see §2 design
    notes). The validation file itself stays untouched in F-05.
  - `lib/orders/pickingList.ts` — existing render function. Informs
    the `Product` minimum field set: `code` (line 25), `name` (line
    27 via description), `box_size` (line 32 via pack). F-05's
    `Product` carries exactly these three plus `id`.
  - `lib/observability/Caller.ts` — confirms `Caller` shape and the
    forward-looking note (lines 13-16) that the canonical `Role` type
    moves to a domain module in F-13. F-05 honours that note — no
    `Caller` or `Role` move happens here.
  - `lib/errors/index.ts` — confirms typed errors available for
    JSDoc references: `NotFoundError`, `ConflictError`, `ServiceError`,
    plus `UnauthorizedError`, `ForbiddenError`, `ValidationError`.
    F-05's write-method JSDoc references the first three only;
    auth-shaped errors live above the port boundary.
  - `lib/supabase.ts` — central client. Not touched by F-05; worth
    noting only as the import path F-06 adapters will use.
  - `tests/unit/observability/Caller.test.ts` — style template for the
    new type-pin fixture. Same imports (`vitest`), same shape (`describe`
    - `it` + `expect`), same `@/lib/...` alias usage.

- **`no-restricted-imports` ESLint rule on F-05 files.** Verified at
  `.eslintrc.json:4-22`. The rule forbids `from '@supabase/supabase-js'`
  outside three allow-listed file globs. F-05 introduces zero
  `@supabase/supabase-js` imports in any port or domain file (these
  are pure TypeScript interfaces) — the rule does not fire on any new
  F-05 file.

---

## Compliance

**NO runtime compliance impact.** F-05 is interface-only code that no
production path imports. It does not change any HTTP behaviour, any
database access, any authentication flow, any payment, HACCP,
data-retention, financial, or document-control surface. No row is ever
written by F-05 code; no endpoint is added or modified.

**ADR-0002 hexagonal shape — F-05 IS the first implementation.** F-05
moves the rip-out test answer for Orders from "≈100 files" to
"≈100 files still" — the seam is defined but not yet flipped, so the
practical answer does not change at F-05 ship time. The reduction
begins at F-08 (route rewrites) and completes at F-09 (ANVIL gate).
What F-05 changes is the _availability_ of the seam: from F-05 onward,
any Phase 1 implementer can target the locked port shape with
confidence that the contract is the contract.

**ADR-0002 line 19 folder layout — `CLAUDE.md` realigned.** The
existing `CLAUDE.md` lines 26-50 describe a folder layout (`/domain`,
`/app`, `/infra/adapters`, `/ui`) that pre-dates ADR-0002 line 19's
canonical layout (`lib/ports/`, `lib/adapters/<vendor>/`,
`lib/services/`, `lib/usecases/`, `lib/domain/`). The two have been
out of sync since ADR-0002 was accepted on 2026-06-06; F-04's lint
rule already targets the ADR-0002 layout (allow-list glob
`lib/adapters/supabase/**`). F-05 aligns CLAUDE.md to ADR-0002
verbatim — see §2 for the precise diff. The Lego principle prose
(lines 3-24) and the dependency-justification + acceptance-test
sections stay untouched. **This is the only edit to CLAUDE.md;
everything else is preserved byte-for-byte.**

**ADR-0002 line 25 depth rule — every method hides a decision.** §2
documents what each of the 7 + 1 + 1 methods hides. Shallow methods
(e.g. a hypothetical `OrdersRepository.fetchById()` that maps directly
to `.from('orders').select('*').eq('id', id)`) are explicitly
rejected.

**ADR-0002 line 27 vendor types never cross.** F-05's domain types
declare zero vendor shape. `Order.created_at` is `string` (ISO
timestamp), not `PostgrestResponse<'orders'>['data'][number]['created_at']`.
The mapping from vendor row to domain type lives entirely inside the
F-06 adapter; F-05 does not pre-decide it beyond defining the domain
shape.

**ADR-0002 line 43 APOSD principle 11 (define errors out of existence).**
Read methods (`listOrders`, `findOrderById`, `findCustomerById`,
`findProductsByIds`) return null/empty on miss. They NEVER throw
`NotFoundError` on a "not found" read result. Write methods
(`createOrder`, `updateOrder`, `recordPrint`, `markLineDone`,
`markOrderCompleted`) throw `NotFoundError` when the _target_ row to
mutate is missing — that is a real error because the caller asked to
mutate something. The split is documented method-by-method in §2's
per-method JSDoc skeletons.

**ADR-0002 line 43 APOSD principle 12 (design it twice).** Each
non-trivial method's JSDoc carries the design-it-twice analysis
(two alternatives + chosen + rationale). The four pre-grilled picks
from the conductor handoff are honoured; one additional design-it-twice
is added for `CreateOrderLineInput`'s product/ad-hoc XOR shape (see §2).

**ADR-0003 strangler-fig — F-05 is the first port-extraction.** ADR-0003
line 19 names F-05 by id and content; this plan realises it. The 5
Orders routes stay verbatim until F-08. F-04's FREEZE rule, already
shipped, prevents any new Supabase SDK import in F-05 files (the rule
does not fire because F-05 introduces zero SDK imports).

**ADR-0003 contract tests — NOT F-05's job.** ADR-0003 line 23 requires
"one shared test suite per port lives in `lib/ports/__contracts__/`"
that both adapters and fakes pass. F-05 ships the port interfaces;
the contract test suite is F-06's responsibility (ADR-0003 line 29 —
"F-06 ... plus the shared contract test suite"). F-05 ships only the
type-pin fixture, not a contract suite — the type-pin fixture catches
accidental contract drift in the _interface_ shape; the contract suite
catches behavioural drift in _implementations_. Different concerns,
different units.

**ADR-0004 RLS posture.** No change. F-05 ports do not encode auth.
The Caller stays at the service/route boundary. Per-request
authenticated Supabase clients (F-RLS-03) and table RLS migration
(F-RLS-04..n for Orders) are independent tracks running in parallel.

**ADR-0005 F-01 narrowing.** No overlap. The 13 raw-fetch sites are
in F-15/F-16/F-17/F-18/F-20/F-11 territory; none touch Orders.

**No new ADR required.** Gate 1 confirmed F-05 IS the implementation
of ADR-0002, not a new architectural decision. No ADR is added; the
existing ADR-0002 reference list (line 39-43) already cites every
APOSD principle F-05 applies. The plan cites those principles inline
in §2 for the implementer's benefit.

---

## Branch + base

- **Base:** `main` HEAD `345d654` —
  `feat(lint): activate ADR-0003 Supabase SDK FREEZE (F-04) (#21)`.
  Verified via `git rev-parse main` returns
  `345d654588b3e39e4fae42848bf4860d90d14ada`. All foundations are on
  main: F-FND-01 ADR seeding, F-FND-02 typed errors, F-FND-03
  observability, F-INFRA-01 local stack + Playwright, F-01 narrowed
  road-times consolidation, F-03 requireRole helper, F-04 ESLint
  FREEZE rule.
- **Branch:** `f-05-orders-domain-ports` (matches the conductor brief
  verbatim; mirrors F-01/F-03/F-04's branch convention).
- **PR target:** `main`. **Not auto-merged.** Hakan ships via the same
  squash-merge flow as #15–#21 once ANVIL gates pass.
- **PR title:** `feat(ports): Orders domain ports + types (F-05)`.
- **Commit shape: 3 commits ADOPTED.** Rationale in §3.

---

## 1. Repo recon findings

Captured before planning. Every claim grounded in the actual files on
`main` HEAD `345d654`.

1. **`lib/ports/` does NOT exist on main.** `ls lib/ports` returns
   "No such file or directory". F-05 creates it. F-04's allow-list
   glob `lib/adapters/supabase/**/*.ts` (`.eslintrc.json:18`)
   anticipates the _adapter_ directory; the _ports_ directory has no
   special lint treatment because it should not contain vendor SDK
   imports.
2. **`lib/domain/` does NOT exist on main.** `ls lib/domain` returns
   "No such file or directory". F-05 creates it. The CLAUDE.md
   alignment edit (Folder layout section) is what makes the new
   directory's purpose discoverable from the top-level guidance file.
3. **`lib/orders/` exists today** with seven files:
   `cutoverPhase.ts`, `dashboardFilters.ts`, `featureFlag.ts`,
   `kdsLogic.ts`, `pickingList.ts`, `types.ts`, `validation.ts`.
   None are touched by F-05. They contain pure business logic that
   moves to `lib/services/OrdersService.ts` (F-07) and pure
   render/calculation helpers that stay where they are. The directory
   is NOT renamed; F-05 introduces `lib/domain/` and `lib/ports/`
   alongside it. F-08 will deal with route-layer references to
   `@/lib/orders/...`; F-05 does not.
4. **`OrderUom` literal set verified at `lib/orders/types.ts:18`** —
   `export type OrderUom = 'kg' | 'unit'`. **F-05's domain `OrderUom`
   uses the literal set `'kg' | 'unit'` verbatim.** Two options were
   considered for how to surface this:
   - **(A)** Re-declare the union literally in `lib/domain/Order.ts`
     (with the same string literals).
   - **(B)** `export { type OrderUom } from '@/lib/orders/types'` in
     `lib/domain/Order.ts` to keep one source of truth.
     **Chosen: (A) re-declare with a JSDoc comment pointing at
     `lib/orders/types.ts` as the F-08 deprecation target.** Rationale:
     F-08 will retire `lib/orders/types.ts` (or move what remains
     under `lib/domain/`) when the routes are rewritten. Importing from
     `lib/orders/types.ts` from a `lib/domain/` file would create a
     reverse dependency (`lib/domain/` depending on `lib/orders/` which
     is the soon-to-be-rewritten directory) that F-08 would then have
     to unwind. Cleaner to re-declare in F-05 and let F-08 delete the
     `lib/orders/types.ts` definition once nothing else imports it.
     The JSDoc comment on F-05's `OrderUom` documents this so a future
     reader sees the deprecation path. **Same approach used for
     `OrderState`.**
5. **`OrderState` literal set verified at `lib/orders/types.ts:15`** —
   `export type OrderState = 'placed' | 'printed' | 'completed'`.
   F-05 re-declares verbatim under the same rationale as #4.
6. **Existing route logic for create + verify (POST /api/orders, lines
   103-134)** uses `single()` on customer lookup, treats
   `customer.active === false` as a 400 error, then runs an `IN`
   lookup on product ids and computes the missing-id set. This logic
   moves to `OrdersService.createOrder` (F-07). F-05 surfaces it on
   the port boundary as:
   - `CustomersRepository.findCustomerById(id)` returns `Customer |
null`. Caller checks `customer.active`.
   - `ProductsRepository.findProductsByIds(ids)` returns `Product[]`
     of _matched_ rows only. Caller computes `missing` with one
     filter pass.
     These two methods are the minimum port surface needed for F-07's
     verify-customer + verify-products step. They are NOT 1:1 vendor
     calls (each hides at least one decision: customer-lookup hides the
     "customer column projection" + the `.single()` semantics; product
     lookup hides the bulk `IN` + the empty-array short-circuit).
7. **Existing route logic for atomic create with rollback (POST
   /api/orders, lines 153-183)** uses `insert(...).select(...).single()`
   to get the new order id, then bulk-inserts lines, with manual
   delete-on-failure. This entire flow becomes
   `OrdersRepository.createOrder(input, createdBy)` — one method, one
   atomic boundary, hidden rollback. The depth rule applies: the
   caller sees `createOrder(input, createdBy): Promise<Order>` and
   knows nothing about the two-step + delete-on-failure under the
   hood.
8. **Existing route logic for update + state-permission (PUT
   /api/orders/[id], lines 93-176).** The state-permission check is
   role-based and belongs at the service/route boundary where the
   `Caller` is in scope. The orders-patch + line-replacement is the
   port's `updateOrder(id, patch, lineReplacement?)` method (signature
   from Gate 1 spec). The TOCTOU concern here is mild — placed→printed
   transitions happen in the picking-list endpoint, not the edit
   endpoint — but the port's contract documents that `updateOrder`
   throws `ConflictError` if the underlying DB CHECK constraint
   rejects the patch (e.g. an edit landing the same instant another
   process transitions state to `completed`). Documented in §2.
9. **Existing route logic for picking-list print (POST
   /api/orders/[id]/picking-list, lines 174-243).** Three branches:
   `state='placed'` → transition to `'printed'` with optimistic-lock
   `.eq('state', 'placed')` (line 208); `state='printed'` → reprint,
   bump `printed_at` (line 215-217); `state='completed'` → 403 error
   (line 195-196). F-05's `OrdersRepository.recordPrint(id, printedBy,
when)` hides the state-branching internally. The pre-grilled pick
   ("(A) one method internally branches") is the right pick: a
   two-method split (`markFirstPrint` + `markReprint`) would force the
   caller to read the order state first, then pick a method — which
   means the caller's state-machine knowledge is doubled and the port
   loses depth. Documented in §2 under `recordPrint`.
10. **Existing route logic for line-done + auto-complete (POST
    /api/kds/lines/[lineId]/done, lines 40-172).** The butcher
    identity validation (lines 59-73) is Users-domain (F-13); F-05
    does not encode it on the OrdersRepository port. The line-done
    update (lines 119-124) uses an `is('done_at', null)` TOCTOU guard.
    The remaining-lines count (lines 142-152) uses a head-only count
    query. The auto-complete (lines 155-160) uses an optimistic
    `.eq('state', 'printed')` lock. F-05 surfaces:
    - `OrdersRepository.markLineDone(lineId, doneBy, when)` returns
      `{ alreadyDone, orderId, allLinesDone }`. The flags let the
      use-case decide whether to call `markOrderCompleted` — keeping
      mark-line-done and order-completion as separate concerns
      (pre-grilled pick (A), confirmed).
    - `OrdersRepository.markOrderCompleted(id, when)` does the
      optimistic state transition `printed → completed` with the
      `.eq('state', 'printed')` guard.
      The use-case orchestration (call mark-line, if `allLinesDone`
      then call mark-completed) lives in `lib/usecases/` per ADR-0002
      line 17 — but F-05 does NOT ship a use-case file. F-07 ships
      `OrdersService` (which may itself be the use-case, or which may
      have a sibling under `lib/usecases/`) — the planner for F-07
      decides. F-05 ships the _port_ surface, full stop.
11. **The KDS queue endpoint (`app/api/kds/orders/route.ts`, lines
    36-79)** is the one piece of the 5-route Orders rip-out target
    whose query shape is NOT covered by the 7 locked methods. Its
    SELECT reads `state='printed' OR (state='completed' AND
completed_at >= since)` with embedded customer + lines + product
    name joins (lines 38-54). It also reads `order_audit_log` for
    recent flashes (lines 67-72). **F-05 surfaces this as ONE
    additional method on `OrdersRepository`:** `listKdsQueue(since:
Date): Promise<KdsOrderQueueSnapshot>`, where
    `KdsOrderQueueSnapshot` is a small composite domain shape
    (`{ orders: Order[]; recentFlashes: KdsFlashEvent[]; serverTime:
string }`). **This is the one Gate 2 deviation the planner is
    surfacing.** Full rationale in §5 Risks #1; full signature +
    JSDoc in §2 under `listKdsQueue`. The conductor handoff
    explicitly asked the planner to flag this — done.
12. **`lib/errors/` is complete on main.** Verified at
    `lib/errors/index.ts:8-15`: `AppError`, `NotFoundError`,
    `ConflictError`, `UnauthorizedError`, `ForbiddenError`,
    `ValidationError`, `ServiceError`, plus `withErrors`. F-05's
    port JSDoc references `NotFoundError`, `ConflictError`,
    `ServiceError` only — auth-shaped errors live above the port
    boundary per the spec lock.
13. **`tests/unit/observability/Caller.test.ts` is the style
    template.** Verified at the file: `import { describe, it, expect }
from 'vitest'`; `@/lib/...` alias usage; `describe` + `it` style.
    F-05's new `tests/unit/ports/orders-domain.types.test.ts` matches
    exactly.
14. **`vitest.config.ts:8`** picks up `tests/unit/**/*.test.ts`
    automatically. The new `tests/unit/ports/` directory needs no
    config edit. (Same situation F-04 handled for `tests/unit/lint/`.)
15. **F-04 lint rule does NOT fire on any F-05 file.** Verified by
    inspection: F-05's port files contain only `interface`, `type`,
    and barrel re-exports — zero vendor SDK imports. The rule
    matches `from '@supabase/supabase-js'` literally; nothing in
    F-05's code matches. The implementer's `npm run lint` after F-05
    lands returns the same calibrated baseline as today.
16. **`lib/observability/Caller.ts:13-16`** explicitly forward-references
    F-13 as the unit that moves `Role` to a domain module. F-05
    honours that note — no `Role` move happens here, no `Caller` move
    happens here. F-05's port methods take primitive `string` IDs
    (`createdBy`, `printedBy`, `doneBy`) — the `Caller` stays in
    `lib/observability/` until F-13.
17. **`package.json`** has no dependency F-05 needs to add. The port
    files are pure TypeScript with zero runtime imports. The test file
    uses Vitest (already at `package.json` devDependencies) and the
    `@/lib/...` alias (already configured via Next.js + tsconfig).
    Zero new deps.
18. **`CLAUDE.md` lines 26-50** require the alignment edit:
    - Lines 26-35 currently describe a `/domain`, `/app`,
      `/infra/adapters`, `/ui` layout.
    - Lines 43-50 list blockers that reference `/domain/**`,
      `/infra/**`, `/ui/**` paths.
    - ADR-0002 line 19 is the canonical layout: `lib/ports/`,
      `lib/adapters/<vendor>/`, `lib/services/`, `lib/usecases/`,
      `lib/domain/`.
    - F-04's allow-list glob (`.eslintrc.json:18`) already uses the
      ADR-0002 paths.
    - The CLAUDE.md prose is therefore the only piece left out of
      sync. F-05 fixes it. See §2 for the precise diff.

---

## 2. File-by-file changes

### New files (8 source + 1 test)

| Path                                           | Purpose                                                                                                                                                                                                                                        |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/domain/Order.ts`                          | Domain types for the Orders bounded context. Exports `Order`, `OrderLine`, `OrderState`, `OrderUom`, `OrderFilter`, `OrderPatch`, `CreateOrderInput`, `CreateOrderLineInput`. All `readonly`. Prose comment above every signature. ~120 lines. |
| `lib/domain/Customer.ts`                       | Minimal `Customer` shape Orders needs today (id, name, postcode, active). F-20 Admin extends. ~30 lines.                                                                                                                                       |
| `lib/domain/Product.ts`                        | Minimal `Product` shape Orders + picking-list needs today (id, code, name, box_size). F-15 / F-20 extend. ~30 lines.                                                                                                                           |
| `lib/domain/index.ts`                          | Barrel re-export of the three above. ~10 lines.                                                                                                                                                                                                |
| `lib/ports/OrdersRepository.ts`                | The 7 + 1 = 8 method port interface. Header comment cites ADR-0002 lines 17, 19, 21, 25, 27, 43. Per-method JSDoc with depth-rule + design-it-twice + null-vs-throw. ~310 lines.                                                               |
| `lib/ports/CustomersRepository.ts`             | 1-method port. ~50 lines.                                                                                                                                                                                                                      |
| `lib/ports/ProductsRepository.ts`              | 1-method port. ~60 lines.                                                                                                                                                                                                                      |
| `lib/ports/index.ts`                           | Barrel re-export of the three above. ~10 lines.                                                                                                                                                                                                |
| `tests/unit/ports/orders-domain.types.test.ts` | Type-pin fixture. Realistic example values + `satisfies` checks. ~110 lines.                                                                                                                                                                   |

### Modified files (1)

| Path        | Edit                                                                                                                                                                                                                        |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CLAUDE.md` | Align the Folder layout (lines 26-35) and Blockers (lines 43-50) sections to ADR-0002 line 19. Preserve the Lego principle + acceptance test + dependency justification + local test infrastructure sections byte-for-byte. |

### `lib/domain/Order.ts` — full skeleton

```ts
/**
 * lib/domain/Order.ts
 *
 * Domain types for the Orders bounded context. These types describe the
 * shape of an order as the app business logic sees it — never the
 * shape any vendor row arrives in. The mapping from a Supabase row
 * (or whatever future adapter wraps) into these shapes lives inside
 * the corresponding adapter file (F-06+), never in business code.
 *
 * ADR-0002 § "Vendor types never cross the port boundary" (line 27)
 * is the reason this file exists. Every field below is plain
 * TypeScript; there is no PostgrestResponse-shaped wrapper, no
 * `Database['public']['Tables']['orders']['Row']` import, no nullable-
 * default-undefined Postgres weirdness. Just the domain.
 *
 * The Orders ports in `lib/ports/` consume only these types. The 5
 * Orders routes (today calling Supabase directly) will be rewritten
 * in F-08 to call OrdersService — which depends on the ports — which
 * depend on these types. The mapping cascades inward; the vendor
 * stops at the adapter.
 *
 * Forward-looking deprecation notes:
 *   - `lib/orders/types.ts` (the existing OrderRow / OrderLineRow /
 *     OrderState / OrderUom file) is retained today because the 5
 *     Orders routes still import from it. F-08 will retire those
 *     imports route by route. When the last route stops importing
 *     from `lib/orders/types.ts`, that file's `OrderRow` /
 *     `OrderLineRow` definitions can be deleted (the `OrderState` /
 *     `OrderUom` literal-set declarations are duplicated below — same
 *     string values, just owned by the domain layer instead of the
 *     route layer). Until then, two definitions co-exist; the domain
 *     definition below is canonical.
 */

// ─── State machine ────────────────────────────────────────────

/**
 * Forward-only state machine for an Order. Three states; two
 * transitions; no backtracking.
 *
 * What this hides from callers: nothing — it is a literal union. The
 * point of declaring it as a domain type rather than scattering string
 * literals through the codebase is to make state-machine queries
 * (`if (order.state === 'placed') ...`) compiler-checked against typos.
 *
 * The transition table is enforced at two layers:
 *   1. Database CHECK constraints on the `orders` row (out of F-05
 *      scope — predates the migration).
 *   2. `OrdersRepository.recordPrint` / `markOrderCompleted` apply
 *      optimistic-lock guards (see those methods' JSDoc).
 *
 * Mirrors `lib/orders/types.ts:15`. Re-declared rather than re-exported
 * because importing from `lib/orders/types.ts` from this file would
 * create a reverse dependency F-08 would have to unwind.
 */
export type OrderState = "placed" | "printed" | "completed";

/**
 * Per-line unit of measure on an order. Distinct from products.box_size
 * (which is a pack-size like "10 kg" — a string, not an enum). UOM is
 * the unit the *quantity* on the line is denominated in.
 *
 * Two literal values today: 'kg' for weighed items, 'unit' for whole
 * pieces. Mirrors `lib/orders/types.ts:18` verbatim — re-declared (not
 * re-exported) to keep the domain layer independent of the
 * soon-to-be-retired `lib/orders/types.ts`.
 */
export type OrderUom = "kg" | "unit";

// ─── Aggregate root ──────────────────────────────────────────

/**
 * A single order line.
 *
 * Exactly one of `productId` or `adHocDescription` is populated; never
 * both, never neither. The DB enforces this with a CHECK constraint;
 * the port contract documents it so the service layer can trust it
 * after a `findOrderById` / `listOrders` return.
 *
 * Why fields are `readonly`: domain values are passed around by
 * value-shape. Code that "edits" an order line constructs a new one
 * — there is no mutate-in-place path. This matches APOSD § "deep
 * immutability" (sect. 4) — surface area for accidental mutation is
 * driven to zero. The same convention used by `Caller`
 * (`lib/observability/Caller.ts:70-74`).
 *
 * Design-it-twice for the productId XOR adHocDescription shape:
 *   (A) Two optional fields with a documented invariant (this).
 *   (B) A discriminated union:
 *         type OrderLineItem =
 *           | { kind: 'catalogue'; productId: string }
 *           | { kind: 'adHoc';     description: string }
 *       with the rest of the line fields siblings.
 *   Chosen: (A). Rationale: the DB schema is two columns, the picking-
 *   list renderer already treats them as two optional fields with a
 *   fallback ("(unknown product)" — `app/api/orders/[id]/picking-list/
 *   route.ts:120`), and the discriminated union forces every consumer
 *   to write a switch — even those that just want to read the
 *   description for display. (B) is *deeper* in the APOSD sense
 *   (impossible states made unrepresentable) but introduces meaningful
 *   ceremony at every read site; for a two-field XOR, the cost outweighs
 *   the safety gain. Re-evaluate at F-15 if a new product-kind appears.
 */
export interface OrderLine {
  readonly id: string;
  readonly orderId: string;
  readonly lineNumber: number;
  readonly productId: string | null;
  readonly adHocDescription: string | null;
  readonly quantity: number;
  readonly uom: OrderUom;
  readonly notes: string | null;
  /** ISO timestamp when the line was marked done; null until then. */
  readonly doneAt: string | null;
  /** User id of the butcher who marked the line done; null until done. */
  readonly doneBy: string | null;
}

/**
 * The Orders aggregate root.
 *
 * Carries enough denormalised data that the typical reader (a list
 * view, a detail page, a picking-list renderer) gets the joins
 * pre-resolved without a second round-trip. The deep decision hidden
 * here is *which joins to inline*: customer, creator, lines. Audit
 * log is NOT inlined (it is a separate concern, queried only by the
 * KDS queue snapshot — see `listKdsQueue`).
 *
 * Why `customer` is a small embedded object rather than a join id +
 * lookup: every existing read path (`app/api/orders/route.ts:55`,
 * `app/api/orders/[id]/route.ts:53`, `app/api/orders/[id]/picking-list/
 * route.ts:67`, `app/api/kds/orders/route.ts:43`) already requests
 * customer.{id, name, postcode} embedded. Mirroring that at the
 * domain level keeps callers from doing a second N+1 lookup.
 *
 * Why `creator` and `printer` are optional embedded objects: the route
 * GET endpoints today inline `creator:created_by(id, name)` and
 * `printer:printed_by(id, name)`. The picking-list endpoint additionally
 * resolves the printer's name. Carrying these on the domain shape
 * preserves the existing read ergonomics without forcing the service
 * layer to do a per-order user lookup.
 *
 * Why ISO strings for timestamps: ADR-0002 line 27 forbids vendor
 * shape on the port. JavaScript `Date` is *not* vendor — but using
 * ISO strings everywhere matches how the routes currently serialise
 * to JSON (`createdAt.slice(0, 10)` at `pickingList/route.ts:108`,
 * `Date.now().toISOString()` at `kds/lines/.../route.ts:119`) and
 * avoids the "is this UTC or local?" Date-object trap. Adapters
 * convert from Postgres timestamps to ISO strings; service code
 * receives ISO strings; UI parses with `new Date(iso)`.
 */
export interface Order {
  readonly id: string;
  /** MFS-YYYY-NNNN reference, e.g. "MFS-2026-0001". */
  readonly reference: string;
  readonly customerId: string;
  /** YYYY-MM-DD, customer's requested delivery date. */
  readonly deliveryDate: string;
  readonly deliveryNotes: string | null;
  readonly orderNotes: string | null;
  readonly state: OrderState;
  readonly createdBy: string;
  /** ISO timestamp. */
  readonly createdAt: string;
  readonly printedBy: string | null;
  readonly printedAt: string | null;
  readonly completedAt: string | null;
  /** Embedded customer projection — minimal shape for list/detail rendering. */
  readonly customer: {
    readonly id: string;
    readonly name: string;
    readonly postcode: string | null;
  } | null;
  /** Embedded creator user projection — name only, for read views. */
  readonly creator: { readonly id: string; readonly name: string } | null;
  /** Embedded printer user projection — populated once the order has been printed. */
  readonly printer: { readonly id: string; readonly name: string } | null;
  /** All lines on the order, ordered by lineNumber. */
  readonly lines: readonly OrderLine[];
}

// ─── Query / filter shapes ───────────────────────────────────

/**
 * Filter shape for `OrdersRepository.listOrders`.
 *
 * Why an object with optional fields rather than a positional argument
 * list: the existing route at `app/api/orders/route.ts:43-49` accepts
 * 4 filter axes (state, deliveryDate, customerId, createdBy) plus a
 * limit. Adding a fifth axis later (e.g. a date range) is a non-breaking
 * additive change with the object shape. With positional arguments the
 * port signature would churn every time a UI filter is added.
 *
 * `limit` defaults to 50 inside the adapter (matches the existing
 * route default — `app/api/orders/route.ts:48`). Maximum 200. The
 * port contract documents the defaults so the service layer is free
 * to omit the field; the adapter clamps.
 */
export interface OrderFilter {
  readonly state?: OrderState;
  readonly deliveryDate?: string;
  readonly customerId?: string;
  readonly createdBy?: string;
  /** Default 50; clamped to [1, 200] inside the adapter. */
  readonly limit?: number;
}

/**
 * Patch shape for `OrdersRepository.updateOrder`. Only the three
 * editable fields are exposed — `customerId`, `state`, `createdBy`,
 * timestamps, and the reference are intentionally not patchable
 * through this method (they are read-only post-creation, or only
 * mutated through state-transition methods).
 *
 * Why `undefined` distinguishes from `null`: `undefined` means "don't
 * touch this field"; `null` means "set this field to NULL". This
 * matches the existing route's discrimination at
 * `app/api/orders/[id]/route.ts:117-119` (`if (update.delivery_date
 * !== undefined) orderPatch.delivery_date = update.delivery_date`).
 */
export interface OrderPatch {
  readonly deliveryDate?: string;
  readonly deliveryNotes?: string | null;
  readonly orderNotes?: string | null;
}

// ─── Create-order inputs ─────────────────────────────────────

/**
 * Input shape for `OrdersRepository.createOrder`.
 *
 * Domain-shape input, NOT the wire-shape request body. The route layer
 * is responsible for parsing the HTTP request (today: ad-hoc validation
 * at `lib/orders/validation.ts`; F-08: zod). The service layer (F-07)
 * then constructs a `CreateOrderInput` from the validated/normalised
 * data and calls the port.
 *
 * `lines` is required and must have at least one entry — the port
 * contract documents this; the service enforces it via
 * `ValidationError` BEFORE calling the port. The port itself does not
 * re-validate (`ValidationError` is a service-layer concern per the
 * spec lock); a zero-length lines array hitting the port would result
 * in a `ServiceError` from the underlying DB CHECK on `order_lines`.
 */
export interface CreateOrderInput {
  readonly customerId: string;
  readonly deliveryDate: string;
  readonly deliveryNotes: string | null;
  readonly orderNotes: string | null;
  readonly lines: readonly CreateOrderLineInput[];
}

/**
 * Input shape for a single line on `CreateOrderInput`.
 *
 * Exactly one of `productId` or `adHocDescription` must be set (XOR).
 * The same documented invariant as `OrderLine` — see `OrderLine`'s
 * JSDoc for the design-it-twice analysis of why this is two optional
 * fields rather than a discriminated union.
 *
 * `lineNumber` is intentionally NOT on the input — the adapter
 * assigns it based on input array order (matches existing route
 * behaviour at `lib/orders/validation.ts:175` —
 * `lines: body.lines.map((line, i) => ({ line_number: i + 1, ... }))`).
 * Pulls complexity downward (APOSD §10) — the caller does not need to
 * know about line-number assignment.
 */
export interface CreateOrderLineInput {
  readonly productId: string | null;
  readonly adHocDescription: string | null;
  readonly quantity: number;
  readonly uom: OrderUom;
  readonly notes: string | null;
}
```

### `lib/domain/Customer.ts` — full skeleton

```ts
/**
 * lib/domain/Customer.ts
 *
 * Minimal Customer shape the Orders bounded context needs today.
 *
 * Why minimal: ADR-0002 line 25 (depth rule) and APOSD § "design it
 * twice" (principle 12). Two shapes were sketched:
 *   (A) The full Customer aggregate (~14 fields: address lines, phone,
 *       VAT number, payment terms, hub assignment, geocoded lat/lon,
 *       etc.) — the shape that F-20 Admin will eventually own.
 *   (B) The 4 fields Orders' methods need today: id, name, postcode,
 *       active.
 * Chosen (B). Rationale: F-05's job is to define the *Orders* port
 * surface. The customer fields that the 5 Orders routes actually
 * read are `id`, `name`, `postcode` (rendered on picking lists,
 * embedded in list/detail views — `app/api/orders/route.ts:55` and
 * its siblings) and `active` (the verify-customer check at
 * `app/api/orders/route.ts:113-115`). Adding the other 10 fields now
 * would be speculative generality (APOSD § "general-purpose by
 * accident" — section 6); F-20 Admin can extend this shape when it
 * needs to. The forward path is:
 *   - F-05 defines `Customer` with 4 fields here.
 *   - F-13 may add 1-2 fields if Users + Auth needs customer-side
 *     identity surface area (unlikely; flagged for F-13 planner).
 *   - F-20 Admin extends to the full ~14-field shape when the admin
 *     CRUD over Customers gets rewritten.
 * Until F-20, callers who need the bigger shape go through the
 * service layer that owns the full record — they do not pull more
 * fields onto Customer here. This file is the *Orders-view* of a
 * Customer.
 */

/**
 * A customer as the Orders domain sees it.
 *
 * `active` is the on/off flag that POST /api/orders checks at
 * `app/api/orders/route.ts:113-115` ("Customer is inactive" → 400).
 * The check is a service-layer concern, not a port-layer concern; the
 * port just returns the field.
 *
 * `postcode` is nullable because the existing `customers` table has
 * nullable postcode (verified by the route at
 * `app/api/orders/route.ts:55` declaring `customer:customer_id ( id,
 * name, postcode )` as nullable in the embedded projection). The
 * picking list renders "—" when missing
 * (`pickingList.ts:106-107`).
 */
export interface Customer {
  readonly id: string;
  readonly name: string;
  readonly postcode: string | null;
  readonly active: boolean;
}
```

### `lib/domain/Product.ts` — full skeleton

```ts
/**
 * lib/domain/Product.ts
 *
 * Minimal Product shape the Orders bounded context needs today.
 *
 * Same minimalism rationale as `Customer.ts`. The 4 fields here are
 * exactly what `app/api/orders/[id]/picking-list/route.ts:97-101` and
 * the line-verification at `app/api/orders/route.ts:122-134` actually
 * use. F-15 Pricing extends this shape when the pricing domain gets
 * its own port; F-20 Admin extends further for the full product
 * catalogue CRUD.
 */

/**
 * A product as the Orders domain sees it.
 *
 * `code` is the catalogue code (e.g. "BC-001"); `box_size` is the
 * pack-size label (e.g. "10 kg") rendered as the "Pack" column on the
 * picking list (`pickingList.ts:151`). Both are nullable because the
 * existing products table allows nulls (the picking-list renderer
 * defaults to empty string at `pickingList.ts:119`).
 *
 * `name` is the canonical display name; the picking list falls back
 * to it when a line has no `adHocDescription` and the line's
 * `productId` resolves to this row (`pickingList.ts:120`).
 */
export interface Product {
  readonly id: string;
  readonly code: string | null;
  readonly name: string;
  readonly boxSize: string | null;
}
```

### `lib/domain/index.ts` — full skeleton

```ts
/**
 * lib/domain/index.ts
 *
 * Barrel re-export for the domain layer. Import surface for callers:
 *   import { Order, Customer, Product } from '@/lib/domain'
 *
 * Re-exports types only — no runtime values, no factories. The domain
 * layer is pure description.
 */
export type {
  Order,
  OrderLine,
  OrderState,
  OrderUom,
  OrderFilter,
  OrderPatch,
  CreateOrderInput,
  CreateOrderLineInput,
} from "./Order";
export type { Customer } from "./Customer";
export type { Product } from "./Product";
```

### `lib/ports/OrdersRepository.ts` — full skeleton

```ts
/**
 * lib/ports/OrdersRepository.ts
 *
 * The Orders port. This is the interface the Orders service (F-07)
 * depends on. The Supabase implementation arrives in F-06
 * (`lib/adapters/supabase/OrdersRepository.ts`); a `FakeInMemoryOrdersRepository`
 * (also F-06) lets service-layer unit tests run without a DB.
 *
 * ADR-0002 contract this port honours:
 *   - Line 17: "A port is an interface that the app owns, defined in
 *     terms of business operations." Every method below is a business
 *     operation, not a vendor call.
 *   - Line 19: "Ports live in lib/ports/." Yes.
 *   - Line 21: "Vendor SDK imports are permitted inside lib/adapters/**
 *     and nowhere else." This file imports zero vendor SDKs.
 *   - Line 25 (depth rule): "Every port method must hide at least one
 *     non-trivial decision — a join, a filter set, a rollback, a
 *     mapping, a guard." Each method's JSDoc names what it hides.
 *   - Line 27: "Vendor types never cross the port boundary." Every
 *     method below takes/returns only domain types from `lib/domain/`.
 *
 * Method identity convention (locked at Gate 1):
 *   Methods take primitive `string` IDs for the actor (`createdBy`,
 *   `printedBy`, `doneBy`), NOT the `Caller` object. The `Caller`
 *   bundle (`lib/observability/Caller.ts`) is a request-scoped
 *   identity + correlation bundle that lives at the route/service
 *   boundary. Ports are pure of framework coupling — they have no
 *   notion of a request, no notion of a correlation id, no notion of
 *   a role. The service layer (F-07) bridges:
 *     ordersRepo.createOrder(input, caller.userId)
 *   This keeps the port testable with primitive arguments and avoids
 *   coupling F-13's eventual Caller move into `lib/domain/` to F-06's
 *   adapter shape.
 *
 * Error contract (locked at Gate 1):
 *   Read methods return `Promise<X | null>` / `Promise<X[]>` on miss.
 *   They NEVER throw NotFoundError on a not-found read — that is
 *   APOSD § "define errors out of existence" (principle 11) applied
 *   verbatim. Write methods throw typed errors from `lib/errors/`:
 *     - NotFoundError (404) if the target id does not exist.
 *     - ConflictError (409) if a state-transition guard rejects.
 *     - ServiceError (500) for unexpected DB / adapter failure.
 *   Write methods do NOT throw ValidationError — input validation is
 *   the service's job. They do NOT throw UnauthorizedError or
 *   ForbiddenError — auth lives at the route/service boundary.
 */

import type {
  Order,
  CreateOrderInput,
  CreateOrderLineInput,
  OrderFilter,
  OrderPatch,
} from "@/lib/domain";

// ─── KDS queue composite shape ──────────────────────────────

/**
 * Single audit-log "flash" event surfaced by `listKdsQueue`. Maps to
 * one row in `order_audit_log` filtered to the actions that the KDS
 * UI flashes orange for: `edited`, `line_edited`, `reprinted`,
 * `line_added`. See `app/api/kds/orders/route.ts:71`.
 *
 * Why this is a small domain shape rather than the full
 * `OrderAuditLogRow`: the KDS only needs three fields to render the
 * flash. The full audit row (with payload, full action enum) is a
 * Compliance/F-19 concern, not a KDS concern.
 */
export interface KdsFlashEvent {
  readonly orderId: string;
  readonly action: "edited" | "line_edited" | "reprinted" | "line_added";
  readonly createdAt: string;
}

/**
 * Composite snapshot returned by `OrdersRepository.listKdsQueue`. The
 * KDS frontend renders all three fields atomically — fetching orders
 * + flashes in two round-trips guarantees neither a flash for a
 * not-yet-loaded order nor a stale flash for an order whose state
 * has just changed.
 *
 * `serverTime` is captured by the adapter at the moment the snapshot
 * is taken. The frontend uses it as the reference clock for the
 * 60-second flash window and the 90-second "just completed" fade-out
 * (`app/api/kds/orders/route.ts:30, 36`).
 */
export interface KdsOrderQueueSnapshot {
  readonly orders: readonly Order[];
  readonly recentFlashes: readonly KdsFlashEvent[];
  /** ISO timestamp captured at snapshot time. */
  readonly serverTime: string;
}

// ─── The port ────────────────────────────────────────────────

export interface OrdersRepository {
  /**
   * Read a filtered list of orders.
   *
   * What this hides:
   *   - The four-axis filter set (state, deliveryDate, customerId,
   *     createdBy) translates to four optional `.eq()` clauses on the
   *     adapter side. Callers do not write those clauses.
   *   - The multi-table embed (orders + customer + creator + lines)
   *     is resolved server-side in one round-trip via the existing
   *     PostgREST embed syntax. Callers see a flat `Order[]` with
   *     embedded sub-shapes.
   *   - The default sort (`delivery_date ASC, created_at ASC`) and
   *     the limit clamp (`min(200, max(1, limit ?? 50))`) are adapter
   *     responsibilities.
   *
   * Design-it-twice:
   *   (A) Single method with `OrderFilter` (this).
   *   (B) Named methods per filter axis: `listOrdersByState`,
   *       `listOrdersByDeliveryDate`, etc.
   *   Chosen (A). (B) explodes to 2^4 combinations or forces callers
   *   to do their own intersection — both lose on the depth rule.
   *
   * @returns The matched orders. Empty array on no match (never null,
   *   never throws on empty). APOSD § "define errors out of existence".
   * @throws  ServiceError if the underlying DB call fails.
   */
  listOrders(filter: OrderFilter): Promise<readonly Order[]>;

  /**
   * Read a single order by id.
   *
   * What this hides:
   *   - Same multi-table embed as `listOrders` (customer + creator +
   *     printer + lines).
   *   - The `.single()` semantics on the underlying client (returns
   *     domain `null` on no row).
   *
   * Design-it-twice:
   *   (A) Returns `Order | null` on miss (this).
   *   (B) Throws NotFoundError on miss.
   *   Chosen (A). APOSD principle 11 — defines the error out of
   *   existence. Most callers (GET /api/orders/[id], the picking-list
   *   loader, the edit page loader) handle the not-found case as
   *   normal control flow (returning a 404 response), not as an
   *   exception. (B) would force every caller into try/catch.
   *
   * @returns The order if found; `null` if no row matches `id`.
   * @throws  ServiceError if the underlying DB call fails. Does NOT
   *   throw NotFoundError on missing row — null is the documented
   *   not-found signal.
   */
  findOrderById(id: string): Promise<Order | null>;

  /**
   * Create a new order with its lines atomically.
   *
   * What this hides:
   *   - The two-step insert (orders row first to get the generated id,
   *     then `order_lines` rows referencing it).
   *   - The rollback: if line insertion fails, the orders row that
   *     was just created is deleted before the error is thrown. The
   *     caller never sees a half-created order. Today's route does
   *     this manually at `app/api/orders/route.ts:177-183`; the port
   *     contract guarantees it.
   *   - The reference generation (`MFS-YYYY-NNNN`) is a DB trigger
   *     concern; the returned `Order.reference` reflects what the DB
   *     allocated.
   *
   * Customer-existence and product-existence verification are NOT
   * the port's responsibility — those checks live in
   * `OrdersService.createOrder` (F-07), which queries
   * `CustomersRepository` and `ProductsRepository` BEFORE calling
   * this method. The port assumes a valid input and either persists
   * or throws `ServiceError`. (Gate 1 Q2.5 — locked.)
   *
   * Design-it-twice:
   *   (A) One atomic create method (this).
   *   (B) Two methods: `createOrderRow` + `appendOrderLines`, with
   *       the caller orchestrating the rollback.
   *   Chosen (A). (B) duplicates the rollback logic in every caller
   *   and exposes the two-step internal — the depth rule says hide
   *   it.
   *
   * @param input      The validated order shape.
   * @param createdBy  User id of the creator. The service layer
   *                   passes `caller.userId`.
   * @returns The persisted Order with its generated id, reference,
   *   created_at, and the inserted lines (read back from the DB so
   *   the caller sees the assigned line numbers).
   * @throws ServiceError if the order or any line insertion fails
   *   (rollback already attempted by the adapter).
   */
  createOrder(input: CreateOrderInput, createdBy: string): Promise<Order>;

  /**
   * Update an existing order — orders-row patch plus optional full
   * line-replacement.
   *
   * What this hides:
   *   - If `patch` is empty and `lineReplacement` is undefined: no-op,
   *     returns the current Order.
   *   - If `patch` has fields: apply via `.update(patch).eq('id', id)`.
   *   - If `lineReplacement` is provided: delete all existing
   *     `order_lines` rows for this order, then insert the new ones.
   *     The two operations happen within the same adapter call so
   *     they appear atomic to outside readers (today's route at
   *     `app/api/orders/[id]/route.ts:148-175` does the same
   *     two-step but exposes it; the port hides it).
   *
   * State-permission gating (placed → sales/office allowed; printed
   * → office only; completed → 403) is NOT the port's responsibility
   * — that is role-shaped and lives at the route/service boundary.
   * The port does check that the order EXISTS (`NotFoundError`) and
   * that the DB CHECK constraint accepts the patch (`ConflictError`
   * if not — e.g. attempting to edit a completed order at the DB
   * level should rarely happen if the service did its job, but the
   * port surfaces it as Conflict for safety).
   *
   * Design-it-twice:
   *   (A) One method with optional `lineReplacement` (this).
   *   (B) Two methods: `patchOrder` + `replaceOrderLines`.
   *   Chosen (A) per the pre-grilled pick. The two operations are
   *   most naturally atomic-ish for the caller (an edit is one user
   *   action), and splitting them would mean the caller has to
   *   choose the right order and handle partial-success. (A) is
   *   deeper.
   *
   * @param id               The order id to patch.
   * @param patch            Field-level patch (`undefined` means
   *                         "leave field alone"; `null` means "set to
   *                         NULL"; a value means "set to value").
   * @param lineReplacement  If provided, the new full set of lines.
   *                         All existing lines are deleted and replaced.
   *                         Pass `undefined` to leave lines alone.
   * @returns The updated Order with the latest line numbers.
   * @throws NotFoundError if `id` does not exist.
   * @throws ConflictError if the DB CHECK constraint rejects (e.g.
   *   line replacement on a `completed` order).
   * @throws ServiceError on any other DB failure.
   */
  updateOrder(
    id: string,
    patch: OrderPatch,
    lineReplacement?: readonly CreateOrderLineInput[],
  ): Promise<Order>;

  /**
   * Record a picking-list print event. Handles both the first-print
   * transition (placed → printed) and a reprint (printed → printed,
   * with a new `printedAt`).
   *
   * What this hides:
   *   - The state-branching: the method internally inspects the
   *     current state and applies the right SQL.
   *     - From `placed`: update `state` to `printed`, set `printedAt`
   *       and `printedBy`, with an optimistic-lock guard
   *       `.eq('state', 'placed')` so a concurrent transition does
   *       not double-fire.
   *     - From `printed`: bump `printedAt` and `printedBy`, no state
   *       change. The DB audit trigger emits a `reprinted` log row.
   *     - From `completed`: throw `ConflictError` — cannot reprint
   *       a completed order (today's route surfaces this at
   *       `app/api/orders/[id]/picking-list/route.ts:195-196`; the
   *       port surfaces the same as Conflict).
   *
   * Design-it-twice:
   *   (A) One method that internally branches (this).
   *   (B) Two methods: `markFirstPrint` + `markReprint`, with the
   *       caller picking based on state.
   *   Chosen (A) per the pre-grilled pick. The caller's state-machine
   *   knowledge is the thing the port is supposed to hide — exposing
   *   two methods recreates it at every call site. (A) is deeper.
   *
   * @param id          The order id to record the print for.
   * @param printedBy   User id of the office staff doing the print.
   * @param when        The print time. Adapters use ISO-string at
   *                    the storage layer; passing a `Date` here keeps
   *                    callers honest about timezones.
   * @returns The updated Order reflecting the new `printedAt` /
   *   `printedBy` and (if first print) `state='printed'`.
   * @throws NotFoundError if `id` does not exist.
   * @throws ConflictError if current state is `completed`.
   * @throws ServiceError on DB failure.
   */
  recordPrint(id: string, printedBy: string, when: Date): Promise<Order>;

  /**
   * Mark a single order line as done.
   *
   * What this hides:
   *   - The idempotency check: if the line is already `done_at != null`,
   *     return `{ alreadyDone: true, orderId, allLinesDone: <bool> }`
   *     without writing. Today's route handles this manually at
   *     `app/api/kds/lines/[lineId]/done/route.ts:92-94`; the port
   *     contract guarantees it. A second tap from a butcher (or a
   *     network retry) is not an error.
   *   - The TOCTOU guard: the update statement guards on
   *     `.is('done_at', null)` so two concurrent taps from two
   *     butchers cannot both succeed (today at
   *     `app/api/kds/lines/[lineId]/done/route.ts:124`).
   *   - The remaining-lines count: after marking the line, query the
   *     count of `done_at IS NULL` lines for the parent order
   *     (today's route does this via `count: 'exact', head: true` at
   *     `app/api/kds/lines/[lineId]/done/route.ts:142-146`; the
   *     adapter does the same, surfaced as the `allLinesDone` flag).
   *   - The parent order id lookup: the line row carries `order_id`;
   *     the adapter reads it; the method returns it so the caller
   *     does not need a second round-trip to know which order to
   *     auto-complete.
   *
   * What this DOES NOT hide:
   *   - The auto-complete state transition itself is a separate
   *     method (`markOrderCompleted`). The caller (a use-case in
   *     `lib/usecases/` or the F-07 service) calls
   *     `markLineDone` first, then conditionally `markOrderCompleted`
   *     based on the `allLinesDone` flag. Pre-grilled pick (A) chose
   *     this split so that mark-line-done and order-completion are
   *     two clean concerns rather than one mega-method.
   *
   * Design-it-twice (reaffirms pre-grilled pick):
   *   (A) Returns `{ alreadyDone, orderId, allLinesDone }`; caller
   *       composes (this).
   *   (B) `markLineDoneAndCompleteIfReady` auto-completes internally.
   *   Chosen (A). (B) puts two state transitions inside one method
   *   (per-line + per-order), which is the kind of compound effect
   *   the depth rule encourages but APOSD § "modules should be small
   *   and deep" cautions against when the two operations are
   *   logically distinct. The use-case is the right composition
   *   point.
   *
   * Parent-order state guard:
   *   The port checks that the parent order is in state `printed`
   *   before marking the line. If the parent is `placed` (not yet
   *   printed) or `completed`, throw `ConflictError`. This mirrors
   *   today's route logic at `app/api/kds/lines/[lineId]/done/
   *   route.ts:108-116`.
   *
   * @param lineId  The order_lines row id to mark done.
   * @param doneBy  User id of the butcher.
   * @param when    The done time.
   * @returns       `{ alreadyDone: true, orderId, allLinesDone:
   *                   <still-applies-from-prior-state> }` if the
   *                   line was already done; `{ alreadyDone: false,
   *                   orderId, allLinesDone: <true if this tap was
   *                   the last remaining line> }` otherwise.
   * @throws NotFoundError if `lineId` does not exist.
   * @throws ConflictError if the parent order is `placed` or
   *   `completed` (line cannot be marked done in those states).
   * @throws ServiceError on DB failure.
   */
  markLineDone(
    lineId: string,
    doneBy: string,
    when: Date,
  ): Promise<{
    readonly alreadyDone: boolean;
    readonly orderId: string;
    readonly allLinesDone: boolean;
  }>;

  /**
   * Transition an order to `completed`.
   *
   * What this hides:
   *   - The optimistic-lock guard: the update statement requires
   *     `.eq('state', 'printed')`, so an attempt to complete an order
   *     that is not in `printed` state is rejected at the DB level
   *     and surfaced as `ConflictError`. (Today's route does this at
   *     `app/api/kds/lines/[lineId]/done/route.ts:159`.)
   *   - The `completedAt` timestamp write.
   *
   * Composition note:
   *   This method is typically called by the use-case after
   *   `markLineDone` returns `allLinesDone: true`. Calling it when
   *   `allLinesDone` is false will succeed at the DB level but is a
   *   logic bug at the use-case layer — the port does not enforce a
   *   "lines must be done" precondition (the DB schema does not
   *   require it).
   *
   * Design-it-twice:
   *   (A) Separate method (this), composed by the use-case.
   *   (B) Inline this transition inside `markLineDone` when
   *       `allLinesDone` becomes true.
   *   Chosen (A) per the pre-grilled pick for `markLineDone`. The
   *   complement of that decision is having `markOrderCompleted` as
   *   its own port method, callable directly if a future path
   *   (admin override?) needs to force-complete.
   *
   * @param id    The order id to mark completed.
   * @param when  The completion time.
   * @returns     The updated Order with `state='completed'` and
   *              `completedAt` set.
   * @throws NotFoundError if `id` does not exist.
   * @throws ConflictError if current state is not `printed`.
   * @throws ServiceError on DB failure.
   */
  markOrderCompleted(id: string, when: Date): Promise<Order>;

  /**
   * Read the live KDS queue snapshot.
   *
   * What this hides:
   *   - The disjunctive filter: returns orders where `state='printed'`
   *     OR (`state='completed' AND completedAt >= since`). Today's
   *     route encodes this in a PostgREST `.or()` call at
   *     `app/api/kds/orders/route.ts:50`; the adapter hides it.
   *   - The recent-flash join: after fetching the orders, the adapter
   *     queries `order_audit_log` for rows with `action IN ('edited',
   *     'line_edited', 'reprinted', 'line_added')` and `created_at >=
   *     <60 seconds ago>` matching one of the returned order ids.
   *     The KDS UI uses these to flash cards orange for 60s. Today's
   *     route does this manually at `app/api/kds/orders/route.ts:67-79`;
   *     the adapter wraps it.
   *   - The default sort (`delivery_date ASC, printed_at ASC`) and
   *     the limit (100 orders) are adapter responsibilities.
   *
   * Design-it-twice:
   *   (A) Single composite method returning `KdsOrderQueueSnapshot`
   *       (this).
   *   (B) Two methods: `listPrintedOrCompletedSince(since)` returning
   *       `Order[]`, and `listRecentAuditFlashes(orderIds, since)`
   *       returning `KdsFlashEvent[]`, with the use-case composing.
   *   Chosen (A). The two reads always run together on the KDS page;
   *   splitting them forces the caller to do the composition with no
   *   business value (and risks two round-trips when one would
   *   suffice — the adapter can pipeline them). The composite shape
   *   is a *snapshot* — taking the orders and flashes against the
   *   same clock matters for UI consistency.
   *
   * **Note on the audit-log dependency.** This method reads from the
   * `order_audit_log` table, which is conceptually a Compliance / F-19
   * concern, not a pure Orders concern. Two architectural choices
   * were considered:
   *   (i)  This method on `OrdersRepository` (this) — accepting that
   *        the Orders adapter touches one table outside the strict
   *        Orders bounded context.
   *   (ii) A separate `OrdersAuditRepository` port + adapter, with
   *        the use-case composing two ports.
   *   Chosen (i). Rationale: the `order_audit_log` table is named
   *   for orders and exists only for order events; it has no
   *   independent business meaning outside the orders bounded
   *   context. Treating it as a sibling concern adds a port-and-
   *   adapter overhead for a one-method read that no other domain
   *   uses. Flag for F-19 review: if HACCP or Admin ever needs to
   *   query the audit log for non-order purposes, revisit.
   *
   * @param since  The earliest `completedAt` to include for completed
   *               orders. Today's route uses `now - 90 seconds` for
   *               the queue fetch and `now - 60 seconds` for the
   *               flash lookback (`app/api/kds/orders/route.ts:30,
   *               36`); the adapter applies both windows internally
   *               relative to its own `Date.now()` snapshot. The
   *               `since` parameter sets the queue's completed-orders
   *               window; the flash window is fixed at 60 seconds
   *               (matching today's behaviour).
   * @returns The snapshot — orders + recent flashes + the server time
   *   the snapshot was taken at.
   * @throws ServiceError on DB failure.
   */
  listKdsQueue(since: Date): Promise<KdsOrderQueueSnapshot>;
}
```

### `lib/ports/CustomersRepository.ts` — full skeleton

```ts
/**
 * lib/ports/CustomersRepository.ts
 *
 * The Customers port — minimal, Orders-scoped. F-13 (Users + Auth)
 * may extend; F-20 Admin will own the full Customers CRUD when the
 * admin domain gets rewritten.
 *
 * Why only one method:
 *   Orders' use of Customers is read-only and lookup-by-id only. The
 *   route at `app/api/orders/route.ts:104-115` does exactly one
 *   thing: fetch a customer by id, then check `customer.active`.
 *   That is the entire port surface F-05 needs to define. Adding
 *   more methods now (e.g. `listCustomers`, `searchCustomers`) would
 *   be speculative generality (APOSD § "general-purpose by
 *   accident") — F-20 Admin will add them when the admin CRUD over
 *   Customers gets rewritten.
 *
 * ADR-0002 contract honoured: same as OrdersRepository (depth rule,
 * vendor-types-never-cross, define-errors-out-of-existence on reads).
 */

import type { Customer } from "@/lib/domain";

export interface CustomersRepository {
  /**
   * Read a customer by id.
   *
   * What this hides:
   *   - The column projection (id, name, postcode, active) — callers
   *     do not write a SELECT.
   *   - The `.single()` semantics — adapter returns domain `null` on
   *     no match.
   *
   * Caller responsibility:
   *   The caller (today: `app/api/orders/route.ts:113-115`; tomorrow:
   *   `OrdersService.createOrder`) checks `customer.active === false`
   *   and surfaces a `ValidationError` (or domain-specific
   *   `CustomerInactiveError` if F-17 / F-20 ever introduces one).
   *   The port does not pre-filter on `active` because the routes
   *   that *display* a customer (without creating an order) need to
   *   see inactive customers in the list.
   *
   * @returns The customer if found; `null` on no match. APOSD § 11.
   * @throws  ServiceError on DB failure.
   */
  findCustomerById(id: string): Promise<Customer | null>;
}
```

### `lib/ports/ProductsRepository.ts` — full skeleton

```ts
/**
 * lib/ports/ProductsRepository.ts
 *
 * The Products port — minimal, Orders-scoped. F-15 Pricing will
 * extend; F-20 Admin will own the full Products CRUD when the admin
 * domain gets rewritten.
 *
 * Why only one method:
 *   Orders' use of Products is read-only and bulk-lookup-by-ids only.
 *   The verify-products step (`app/api/orders/route.ts:117-134` and
 *   `app/api/orders/[id]/route.ts:133-148`) does the same bulk
 *   `IN`-lookup; the picking-list renderer
 *   (`app/api/orders/[id]/picking-list/route.ts:89-101`) does the
 *   same. One method covers all three call sites.
 *
 * ADR-0002 contract honoured: same as OrdersRepository.
 */

import type { Product } from "@/lib/domain";

export interface ProductsRepository {
  /**
   * Bulk-fetch products by id. Returns only the rows that matched.
   *
   * What this hides:
   *   - The `.in('id', ids)` bulk query — callers pass an array,
   *     adapter does the SQL.
   *   - The empty-input short-circuit: if `ids` is empty, the
   *     adapter returns `[]` immediately without a round-trip
   *     (matches today's behaviour at
   *     `app/api/orders/route.ts:121`).
   *   - The column projection (id, code, name, box_size).
   *
   * Caller responsibility:
   *   The caller computes the "missing" set with a one-line filter:
   *
   *     const found = new Set(products.map(p => p.id))
   *     const missing = requested.filter(id => !found.has(id))
   *
   *   (Same shape as `app/api/orders/route.ts:129-132`.)
   *
   * Design-it-twice:
   *   (A) Returns `Product[]` of matched rows only (this).
   *   (B) Returns `{ found: Map<string, Product>; missing: string[] }`.
   *   Chosen (A) per the pre-grilled pick. (B) is APOSD-deeper but
   *   forces a Map allocation + a missing-list computation for
   *   callers who only want the matches (e.g. the picking-list
   *   renderer doesn't care about missing; it just renders "(unknown
   *   product)" inline). (A) is simpler and the missing-list filter
   *   is one line at the call sites that need it.
   *
   * @returns The matched products. Empty array if `ids` is empty or
   *   no rows match. Never throws on miss.
   * @throws  ServiceError on DB failure.
   */
  findProductsByIds(ids: readonly string[]): Promise<readonly Product[]>;
}
```

### `lib/ports/index.ts` — full skeleton

```ts
/**
 * lib/ports/index.ts
 *
 * Barrel re-export for the ports layer. Import surface for callers:
 *   import { OrdersRepository, CustomersRepository, ProductsRepository } from '@/lib/ports'
 *
 * Re-exports interfaces only — no runtime values. Ports are pure
 * descriptions of how the app talks to the outside world.
 */
export type {
  OrdersRepository,
  KdsOrderQueueSnapshot,
  KdsFlashEvent,
} from "./OrdersRepository";
export type { CustomersRepository } from "./CustomersRepository";
export type { ProductsRepository } from "./ProductsRepository";
```

### `tests/unit/ports/orders-domain.types.test.ts` — full skeleton

```ts
/**
 * tests/unit/ports/orders-domain.types.test.ts
 *
 * F-05 — pins the domain types + port method signatures against
 * accidental contract drift. This is NOT a behavioural test (no
 * adapter exists yet to behave against) — it is a type-shape pin.
 *
 * Failures here mean somebody:
 *   - dropped a `readonly` from an interface field
 *   - removed a required field
 *   - weakened a union literal (e.g. accidentally added `'archived'`
 *     to OrderState)
 *   - changed a method's signature in a way the documented spec
 *     does not allow
 *
 * Match style with `tests/unit/observability/Caller.test.ts`:
 *   - Vitest `describe` + `it` + `expect`.
 *   - `@/lib/...` alias imports.
 *   - `satisfies` operator + explicit annotations to pin shape.
 *
 * The test will never need a Supabase stack; pure TypeScript.
 */

import { describe, it, expect, expectTypeOf } from "vitest";
import type {
  Order,
  OrderLine,
  OrderState,
  OrderUom,
  OrderFilter,
  OrderPatch,
  CreateOrderInput,
  CreateOrderLineInput,
  Customer,
  Product,
} from "@/lib/domain";
import type {
  OrdersRepository,
  CustomersRepository,
  ProductsRepository,
  KdsOrderQueueSnapshot,
  KdsFlashEvent,
} from "@/lib/ports";

// ─── Realistic fixture values ─────────────────────────────────

const exampleOrderLine: OrderLine = {
  id: "line-1",
  orderId: "order-1",
  lineNumber: 1,
  productId: "product-1",
  adHocDescription: null,
  quantity: 2.5,
  uom: "kg",
  notes: null,
  doneAt: null,
  doneBy: null,
};

const exampleOrder: Order = {
  id: "order-1",
  reference: "MFS-2026-0001",
  customerId: "cust-1",
  deliveryDate: "2026-06-09",
  deliveryNotes: null,
  orderNotes: "Please pack chilled.",
  state: "placed",
  createdBy: "user-sales-1",
  createdAt: "2026-06-08T10:00:00.000Z",
  printedBy: null,
  printedAt: null,
  completedAt: null,
  customer: { id: "cust-1", name: "Acme Butchers", postcode: "SW1A 1AA" },
  creator: { id: "user-sales-1", name: "Alice" },
  printer: null,
  lines: [exampleOrderLine],
};

const exampleCustomer: Customer = {
  id: "cust-1",
  name: "Acme Butchers",
  postcode: "SW1A 1AA",
  active: true,
};

const exampleProduct: Product = {
  id: "product-1",
  code: "BC-001",
  name: "Beef carcass — half",
  boxSize: "20 kg",
};

const exampleKdsFlash: KdsFlashEvent = {
  orderId: "order-1",
  action: "reprinted",
  createdAt: "2026-06-08T10:00:00.000Z",
};

const exampleSnapshot: KdsOrderQueueSnapshot = {
  orders: [exampleOrder],
  recentFlashes: [exampleKdsFlash],
  serverTime: "2026-06-08T10:00:00.000Z",
};

// ─── Tests ────────────────────────────────────────────────────

describe("lib/domain — type shapes", () => {
  it("OrderState union admits exactly placed/printed/completed", () => {
    const placed: OrderState = "placed";
    const printed: OrderState = "printed";
    const completed: OrderState = "completed";
    expect([placed, printed, completed]).toEqual([
      "placed",
      "printed",
      "completed",
    ]);
    // @ts-expect-error — 'archived' is not in OrderState
    const bad: OrderState = "archived";
    expect(bad).toBe("archived");
  });

  it("OrderUom union admits exactly kg/unit", () => {
    const kg: OrderUom = "kg";
    const unit: OrderUom = "unit";
    expect([kg, unit]).toEqual(["kg", "unit"]);
    // @ts-expect-error — 'litre' is not in OrderUom
    const bad: OrderUom = "litre";
    expect(bad).toBe("litre");
  });

  it("Order shape pins required fields and embedded sub-shapes", () => {
    expect(exampleOrder.reference).toBe("MFS-2026-0001");
    expect(exampleOrder.state).toBe("placed");
    expect(exampleOrder.lines).toHaveLength(1);
    expect(exampleOrder.customer?.postcode).toBe("SW1A 1AA");
  });

  it("OrderLine pins productId-XOR-adHocDescription field shape", () => {
    expect(exampleOrderLine.productId).toBe("product-1");
    expect(exampleOrderLine.adHocDescription).toBeNull();
  });

  it("Customer carries the four Orders-scoped fields", () => {
    expectTypeOf<keyof Customer>().toEqualTypeOf<
      "id" | "name" | "postcode" | "active"
    >();
    expect(exampleCustomer.active).toBe(true);
  });

  it("Product carries the four Orders-scoped fields", () => {
    expectTypeOf<keyof Product>().toEqualTypeOf<
      "id" | "code" | "name" | "boxSize"
    >();
    expect(exampleProduct.boxSize).toBe("20 kg");
  });

  it("OrderFilter is all-optional", () => {
    const empty: OrderFilter = {};
    const full: OrderFilter = {
      state: "placed",
      deliveryDate: "2026-06-09",
      customerId: "cust-1",
      createdBy: "user-sales-1",
      limit: 25,
    };
    expect(empty).toEqual({});
    expect(full.limit).toBe(25);
  });

  it("OrderPatch is all-optional, all three fields nullable", () => {
    const empty: OrderPatch = {};
    const setNull: OrderPatch = { deliveryNotes: null, orderNotes: null };
    expect(empty).toEqual({});
    expect(setNull.deliveryNotes).toBeNull();
  });

  it("CreateOrderInput requires customerId + deliveryDate + non-empty lines", () => {
    const minimal: CreateOrderInput = {
      customerId: "cust-1",
      deliveryDate: "2026-06-09",
      deliveryNotes: null,
      orderNotes: null,
      lines: [
        {
          productId: "product-1",
          adHocDescription: null,
          quantity: 1,
          uom: "unit",
          notes: null,
        } satisfies CreateOrderLineInput,
      ],
    };
    expect(minimal.lines).toHaveLength(1);
  });
});

describe("lib/ports — port method signatures", () => {
  it("OrdersRepository method names + arity", () => {
    // Type-level assertions: each method's signature is pinned by the
    // Method type extraction. Compilation is the test; the runtime
    // assertion below just exercises the test framework.
    type Methods = keyof OrdersRepository;
    const expected: Methods[] = [
      "listOrders",
      "findOrderById",
      "createOrder",
      "updateOrder",
      "recordPrint",
      "markLineDone",
      "markOrderCompleted",
      "listKdsQueue",
    ];
    // 8 methods (7 locked + 1 KDS queue addition flagged in §5 Risks #1).
    expect(expected).toHaveLength(8);
  });

  it("CustomersRepository has exactly one method", () => {
    type Methods = keyof CustomersRepository;
    const expected: Methods[] = ["findCustomerById"];
    expect(expected).toEqual(["findCustomerById"]);
  });

  it("ProductsRepository has exactly one method", () => {
    type Methods = keyof ProductsRepository;
    const expected: Methods[] = ["findProductsByIds"];
    expect(expected).toEqual(["findProductsByIds"]);
  });

  it("KdsOrderQueueSnapshot composite shape pins three fields", () => {
    expect(Object.keys(exampleSnapshot)).toEqual([
      "orders",
      "recentFlashes",
      "serverTime",
    ]);
    expect(exampleSnapshot.recentFlashes[0].action).toBe("reprinted");
  });

  it("KdsFlashEvent action union admits exactly the four KDS-flash actions", () => {
    const actions: KdsFlashEvent["action"][] = [
      "edited",
      "line_edited",
      "reprinted",
      "line_added",
    ];
    expect(actions).toHaveLength(4);
  });
});
```

### `CLAUDE.md` — diff

**Before (lines 26-50):**

```markdown
### Folder layout

The three layers above live in these paths. Every file belongs to exactly one:

- `/domain` and `/domain/ports` — business logic + the interfaces (**ports**) the app owns. Pure. No framework imports.
- `/app` — use cases / orchestration. The only thing the UI is allowed to call.
- `/infra/adapters` — concrete implementations (**adapters**) of the ports. The only place a vendor SDK is ever imported.
- `/ui` — presentation. Never imports from `/infra` directly.

When skills say "which port?" they mean the interface in `/domain/ports`. When they say "which adapter?" they mean the implementation in `/infra/adapters`.

### Dependency justification

Every new entry in `package.json` needs a one-line written reason — in the PR description, the plan, or a `// reason:` comment next to the import. Silent vendor additions are a code-critic blocker.

Single-use vendor libraries (imported in exactly one file) must sit behind an owned wrapper at `/infra/adapters`. The rest of the app depends on the wrapper, not the library.

### Blockers (code-critic will reject)

- Anything in `/domain/**` importing from `/infra/**`
- Anything in `/ui/**` importing from `/infra/**` directly (must go via `/app`)
- A vendor package (e.g. `@supabase/*`, `stripe`, `@vercel/*`) imported outside `/infra/adapters/`
- A new `package.json` entry with no written justification
- A single-use vendor library not wrapped
- A rip-out test answer that costs more than one adapter + one config line
```

**After (matches ADR-0002 line 19 verbatim):**

```markdown
### Folder layout

The three layers above live in these paths. Every file belongs to exactly one:

- `lib/domain/` — domain types the app owns (`Order`, `Customer`, `Product`, `Role`). Pure TypeScript, no framework imports, no vendor imports.
- `lib/ports/` — the interfaces (**ports**) the app owns, defined in terms of business operations. Pure TypeScript, no framework imports, no vendor imports.
- `lib/services/` — business logic that depends on ports. Never on vendors directly. Services do not import other services (use a `lib/usecases/` use-case to compose).
- `lib/usecases/` — orchestration that composes multiple services or ports for a single business operation.
- `lib/adapters/<vendor>/` — concrete implementations (**adapters**) of the ports. The only place a vendor SDK is ever imported. One sub-folder per vendor (`lib/adapters/supabase/`, `lib/adapters/resend/`, etc.).
- `app/` (Next.js App Router) and `components/` — presentation. Never imports adapters directly; goes via services or use-cases.

When skills say "which port?" they mean the interface in `lib/ports/`. When they say "which adapter?" they mean the implementation in `lib/adapters/<vendor>/`. See ADR-0002 (`docs/adr/0002-hexagonal-shape-and-naming.md` line 19) for the full naming + dependency rule.

### Dependency justification

Every new entry in `package.json` needs a one-line written reason — in the PR description, the plan, or a `// reason:` comment next to the import. Silent vendor additions are a code-critic blocker.

Single-use vendor libraries (imported in exactly one file) must sit behind an owned wrapper at `lib/adapters/<vendor>/`. The rest of the app depends on the wrapper, not the library.

### Blockers (code-critic will reject)

- Anything in `lib/domain/**` or `lib/ports/**` importing from `lib/adapters/**` (the dependency rule points inward)
- Anything in `app/**` or `components/**` importing from `lib/adapters/**` directly (must go via `lib/services/` or `lib/usecases/`)
- A vendor package (e.g. `@supabase/*`, `stripe`, `@vercel/*`) imported outside `lib/adapters/<vendor>/` (F-04 enforces this for `@supabase/supabase-js` at lint time; F-27 extends to all vendors)
- A new `package.json` entry with no written justification
- A single-use vendor library not wrapped
- A rip-out test answer that costs more than one adapter + one config line
```

**Key decisions baked into the diff:**

1. **`/domain` and `/domain/ports` is replaced with two separate top-level paths** (`lib/domain/` for types, `lib/ports/` for interfaces). ADR-0002 line 19 names them as siblings, not as a parent + child. The original `CLAUDE.md` framing was looser; the alignment is tighter.
2. **`/app` previously meant "use cases".** ADR-0002 line 17-19 distinguishes `lib/services/` (business logic on ports) from `lib/usecases/` (orchestration of multiple services). The diff exposes both. F-05 does not create either directory; F-07 creates `lib/services/`.
3. **`/ui` previously meant the whole UI layer.** In this repo's actual structure, the UI lives in `app/` (Next.js App Router route + page files) and `components/`. The diff is honest about where the UI actually is.
4. **The Blockers list gains an explicit reference to F-04 + F-27.** This anchors the prose to the actual enforcement mechanism shipping in code.
5. **The Lego principle prose (lines 3-24) and the Local test infrastructure section (lines 52-62) are NOT touched.** Only the Folder layout + Dependency justification + Blockers sections change.

---

## 3. Implementation steps (ordered, atomic)

**Commit shape decision: 3 commits ADOPTED.**

Rationale:

- **Commit 1** carries the domain types alone (`lib/domain/Order.ts`,
  `Customer.ts`, `Product.ts`, `index.ts`). Pure shape file, no
  dependents in this commit. The reviewer reads the domain shapes
  first — what the Orders bounded context thinks an Order, a Customer,
  and a Product look like.
- **Commit 2** carries the port interfaces (`lib/ports/OrdersRepository.ts`,
  `CustomersRepository.ts`, `ProductsRepository.ts`, `index.ts`) plus
  the CLAUDE.md alignment edit. The reviewer reads the contract that
  consumes the domain types from Commit 1, with the CLAUDE.md edit
  immediately adjacent so the reader sees the project-guidance prose
  re-align in the same step the new directories appear. Splitting
  CLAUDE.md into its own commit would create a "ports introduced in
  one commit, documented in the next" gap that adds noise without
  separating any real concern.
- **Commit 3** carries the type-pin fixture
  (`tests/unit/ports/orders-domain.types.test.ts`). The reviewer reads
  the contract (Commit 2), then the proof that the contract is stable
  (Commit 3). Matches the F-04 (feature + test) and F-03 (helper +
  test) pattern.

**Options considered:**

- **2 commits** (merge domain types + ports + CLAUDE.md into one,
  test in the second). Rejected. The domain types are conceptually
  prior to the ports — the ports IMPORT them. Bundling them blurs the
  "types before contracts" reading order.
- **4 commits** (CLAUDE.md alignment as its own commit, then domain,
  ports, test). Rejected. The CLAUDE.md edit makes sense only WITH
  the new directories — reading "CLAUDE.md now says lib/ports/ exists"
  on a commit where lib/ports/ does not yet exist is confusing. The
  CLAUDE.md edit lands with the ports themselves.
- **5 commits** (each port file as its own commit). Rejected. Three
  ports + a barrel = four commits for one cohesive surface. Atomicity
  for atomicity's sake. The reviewer reads the three ports as one
  contract, not as three.

### Step list

1. **Cut the branch.** `git checkout -b f-05-orders-domain-ports`
   off `main` HEAD `345d654`. Confirm
   `git rev-parse main` returns
   `345d654588b3e39e4fae42848bf4860d90d14ada`.

2. **Confirm clean-tree baseline.**
   - `npm test` — all pre-existing Vitest unit suites exit 0.
     Confirms F-FND-02 + F-FND-03 + F-INFRA-01 + F-01 + F-03 + F-04
     baseline is green.
   - `npm run lint` — exits 0 with the F-04 baseline (two allow-listed
     SDK imports).
   - `npx tsc --noEmit` — exits 0 with zero TS errors.
   - `npm run build` — exits 0. The current build is the baseline F-05
     must preserve.
   - If any of the above fail, STOP and report. F-05 does not fix
     orthogonal rot.

3. **Commit 1 — domain types.**
   - Create `lib/domain/`.
   - Write `lib/domain/Order.ts` per §2.
   - Write `lib/domain/Customer.ts` per §2.
   - Write `lib/domain/Product.ts` per §2.
   - Write `lib/domain/index.ts` per §2.
   - `npx tsc --noEmit` — confirm zero TS errors. The new files are
     `interface` + `type` only; tsc must parse them cleanly.
   - `git add lib/domain/`.
   - `git commit -m "$(cat <<'EOF'
     feat(domain): add Order/Customer/Product domain types (F-05)

     First step in the F-05 hexagonal port extraction for the Orders
     bounded context (ADR-0002 + ADR-0003 line 19). Pure-TypeScript
     domain shapes — no vendor imports, no framework imports.

     Includes:
     - lib/domain/Order.ts — Order, OrderLine, OrderState, OrderUom,
       OrderFilter, OrderPatch, CreateOrderInput, CreateOrderLineInput.
     - lib/domain/Customer.ts — minimal Orders-scoped Customer.
     - lib/domain/Product.ts — minimal Orders-scoped Product.
     - lib/domain/index.ts — barrel re-export.

     No production path imports these types yet; F-07 (OrdersService)
     and F-06 (Supabase adapter) will. The 5 Orders routes remain
     untouched per ADR-0003 strangler-fig.

     Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
     EOF
     )"`.

4. **Commit 2 — ports + CLAUDE.md alignment.**
   - Create `lib/ports/`.
   - Write `lib/ports/OrdersRepository.ts` per §2 (the full 8-method
     interface plus `KdsOrderQueueSnapshot` + `KdsFlashEvent`).
   - Write `lib/ports/CustomersRepository.ts` per §2.
   - Write `lib/ports/ProductsRepository.ts` per §2.
   - Write `lib/ports/index.ts` per §2.
   - Edit `CLAUDE.md` per §2 (Folder layout + Dependency justification
     - Blockers sections only — the Lego principle prose and Local
       test infrastructure section stay byte-for-byte).
   - `npx tsc --noEmit` — confirm zero TS errors. The port files
     import from `@/lib/domain` (Commit 1) — confirm the alias
     resolves.
   - `npm run lint` — confirm zero new violations. The new files
     contain no `@supabase/supabase-js` import; the F-04 rule does
     not fire.
   - `git add lib/ports/ CLAUDE.md`.
   - `git commit -m "$(cat <<'EOF'
     feat(ports): add Orders/Customers/Products port interfaces (F-05)

     The Lego contracts the F-06 adapters will implement and the F-07
     OrdersService will depend on. Eight methods on OrdersRepository
     (the seven from the Gate 1 spec plus listKdsQueue for the KDS
     queue endpoint — see plan §5 Risks #1 for the rationale). One
     method each on CustomersRepository and ProductsRepository, both
     Orders-scoped and minimal.

     ADR-0002 contract honoured throughout:
     - Depth rule (line 25): every method hides a non-trivial
       decision (join, filter set, rollback, guard).
     - Vendor types never cross (line 27): port files import only
       from @/lib/domain; zero vendor imports.
     - Define errors out of existence (APOSD principle 11): read
       methods return null/empty on miss; write methods throw
       NotFoundError / ConflictError / ServiceError from @/lib/errors.
     - Design it twice (APOSD principle 12): every non-trivial
       method's JSDoc carries the two-alternative analysis.

     CLAUDE.md Folder layout + Dependency justification + Blockers
     sections realigned to ADR-0002 line 19. The Lego principle prose
     and Local test infrastructure section are preserved verbatim.

     No production path imports these ports yet. F-06 will ship the
     adapters; F-07 will ship OrdersService; F-08 will rewrite the
     five Orders routes.

     Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
     EOF
     )"`.

5. **Commit 3 — type-pin fixture.**
   - Create `tests/unit/ports/`.
   - Write `tests/unit/ports/orders-domain.types.test.ts` per §2.
   - `npx vitest run tests/unit/ports/orders-domain.types.test.ts` —
     confirm the suite passes. The fixture uses `expectTypeOf` from
     Vitest (verified at `vitest.config.ts`); the runtime checks are
     trivial.
   - `git add tests/unit/ports/`.
   - `git commit -m "$(cat <<'EOF'
     test(unit): pin Orders domain + port shapes (F-05)

     Type-pinning fixture for the lib/domain and lib/ports surfaces
     introduced in the previous two commits. Catches accidental
     contract drift — dropped readonly, removed required field,
     weakened union literal, dropped or renamed port method.

     Does NOT instantiate any concrete adapter (F-06 owns that). The
     fixture exists at the type level; runtime assertions exercise
     the example values to keep the test framework happy.

     Style template matches tests/unit/observability/Caller.test.ts.

     Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
     EOF
     )"`.

6. **Whole-tree re-check.**
   - `npm test` — confirm ALL unit suites still green (the new ports
     suite is now in the run; nothing else moved).
   - `npm run lint` — exits 0; the F-04 calibrated baseline holds.
   - `npx tsc --noEmit` — exits 0; no new TS errors.
   - `npm run build` — exits 0. `next build` parses and type-checks
     the new files; the build pipeline must be green.

7. **Push and open PR.** `git push -u origin f-05-orders-domain-ports`.
   Open PR via `gh pr create` with title
   `feat(ports): Orders domain ports + types (F-05)` and the body
   referenced in §7 DoD.

8. **Stop.** Do not run F-06 / F-07 / F-08 work. Do not implement any
   adapter. Do not edit any route. F-05 ends at the PR open.

---

## 4. Test matrix (pre-ANVIL — what each layer will see)

Same calibrated-vs-strict discipline as F-FND-02/03 / F-01 / F-03 /
F-04. ANVIL Gate 3 reads this section verbatim.

| #   | Layer                       | Command                                                                                                      | Pass criterion                                                                                                                                                                                                                                                                  | Calibrated / Strict              |
| --- | --------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| 1   | Vitest unit (new)           | `npx vitest run tests/unit/ports/orders-domain.types.test.ts`                                                | Exit 0. All `describe` blocks pass. Type-level assertions compile cleanly.                                                                                                                                                                                                      | Strict (this is the deliverable) |
| 2   | Vitest unit (baseline)      | `npm test`                                                                                                   | Exit 0. All 35+ pre-existing suites continue to pass unchanged (F-05 modifies no existing source file other than the documentation alignment in CLAUDE.md). The new ports suite is now part of the run and is green.                                                            | Strict (baseline must hold)      |
| 3   | Vitest integration          | n/a                                                                                                          | F-05 adds no integration test and modifies no integration test. **Skipped** as a gating step. The F-INFRA-01 local Supabase stack is not exercised by F-05 because there is no adapter to integrate with yet.                                                                   | Skipped                          |
| 4   | ESLint                      | `npm run lint`                                                                                               | **Calibrated.** Bar: zero NEW violations attributable to F-05 files. The F-04 rule does not fire on any new file (port files contain zero vendor SDK imports). The two allow-listed pre-existing offenders remain unchanged.                                                    | Calibrated                       |
| 5   | TypeScript check            | `npx tsc --noEmit`                                                                                           | **Strict.** Bar: zero TS errors. F-05 introduces 9 new source files (8 source + 1 test) of pure-TypeScript interface code; tsc must parse cleanly. The `@ts-expect-error` marker in the test fixture is the deliberate negative assertion and is expected to satisfy tsc.       | Strict                           |
| 6   | Next.js build               | `npm run build`                                                                                              | Exit 0. `next build` invokes `next lint` inline AND runs the TypeScript compiler on every imported file; this is the **load-bearing end-to-end check** that the F-05 files land cleanly in the real build pipeline. The build is the same baseline as today plus the new files. | Strict                           |
| 7   | Playwright E2E              | n/a                                                                                                          | **No E2E for F-05.** The ports have no HTTP surface, no UI surface, no DB surface. Existing Playwright suites need not be re-run as gating.                                                                                                                                     | Skipped                          |
| 8   | Migration safety            | n/a                                                                                                          | **No migrations, no PITR check at Gate 4.** F-05 changes no schema; the standing Supabase migration-lock hook does not fire.                                                                                                                                                    | Skipped                          |
| 9   | Drift checks                | `git diff main package.json`, `git diff main app/ supabase/ middleware.ts`                                   | All empty. F-05 is purely additive to `lib/domain/`, `lib/ports/`, `tests/unit/ports/`, and CLAUDE.md. Touches zero routes (`app/api/**`), zero migrations (`supabase/**`), zero middleware (`middleware.ts`), zero deps (`package.json`).                                      | Strict                           |
| 10  | Offender grep               | `grep -rn "from ['\"]@supabase/supabase-js['\"]" --include="*.ts" --include="*.tsx" \| grep -v node_modules` | Exactly two lines: `lib/supabase.ts:13` and `tests/integration/_setup.ts:24`. Both pre-existing, both allow-listed by F-04. F-05 introduces ZERO new SDK imports. If more lines appear, STOP — something off-plan landed.                                                       | Strict                           |
| 11  | Production-path check       | `grep -rn "from '@/lib/ports\|from '@/lib/domain" app/ lib/services lib/usecases 2>/dev/null`                | Zero matches. F-05 ships unused. The 5 Orders routes do NOT import the new domain or port types — that wiring lands in F-08. If any match appears, STOP — F-05 has accidentally been wired into a production path.                                                              | Strict                           |
| 12  | CLAUDE.md byte preservation | `diff <(git show main:CLAUDE.md \| sed -n '1,24p') <(sed -n '1,24p' CLAUDE.md)`                              | Empty. The Lego principle prose (lines 1-24) is preserved byte-for-byte. Only the Folder layout + Dependency justification + Blockers sections (lines 26-50) change.                                                                                                            | Strict                           |

**Layer 5 note (Strict, not Calibrated).** F-05 ships pure
TypeScript — `interface`, `type`, and barrel re-exports only. There
is no excuse for a TS error in this PR. The standard "Calibrated"
treatment is reserved for changes that add new strictness to a pre-
existing legacy surface; F-05 adds new files in a clean tree, so
"Strict" is the right bar.

**Layer 6 note.** `next build` is the load-bearing check. `npm run
lint` and `npx vitest run ...` separately verify the rule
configuration and the test logic, but `next build` is what proves the
new types integrate into the actual production build flow. If `next
build` exits non-zero with a TS error or lint violation on F-05 files,
STOP and fix before opening the PR.

**Layer 10 note.** The offender grep is the FREEZE-rule sanity check
inherited from F-04. F-05's job is to NOT add to the count. Adapters
arrive in F-06 — they will add to the count, and the lint rule's
override allow-list (`lib/adapters/supabase/**/*.ts`) covers them.
F-05 has no business adding even one new line.

**Layer 11 note.** This is the strangler-fig discipline made
operational. ADR-0003 is explicit: F-05 ships ports, F-06 ships
adapters, F-07 ships services, F-08 wires routes. If any production
file under `app/`, `lib/services/`, or `lib/usecases/` imports from
`lib/domain/` or `lib/ports/` at the F-05 PR stage, the PR has
overstepped its remit. The check is grep-positive (matches) → STOP.

**Layer 12 note.** This is the safeguard that CLAUDE.md's Lego
principle prose is not accidentally edited. Only the structural
sections (Folder layout / Dependency justification / Blockers) move;
the principle that frames the whole document is untouched.

---

## 5. Risks and open questions

1. **The KDS queue method (`listKdsQueue`) is a one-method
   deviation from the locked 7-method spec.** The conductor handoff's
   locked spec enumerated 7 OrdersRepository methods (listOrders,
   findOrderById, createOrder, updateOrder, recordPrint, markLineDone,
   markOrderCompleted). Tracing the 5 Orders routes through to find
   the rip-out target showed that `app/api/kds/orders/route.ts:32-89`
   issues a disjunctive query (`state='printed' OR (state='completed'
AND completed_at >= since)`) plus a joined audit-log read for
   recent flashes — neither of which fits any of the 7 locked
   methods. Options considered:
   - **(i)** Squeeze the KDS query into `listOrders` by adding a
     `completedSince?: Date` filter and an `includeAuditFlashes?:
boolean` flag. Rejected. This violates the depth rule (the
     method becomes a thin DSL passthrough), and the audit-log read
     is a distinct concern that bloats `OrderFilter`.
   - **(ii)** Add a separate `listKdsQueue(since: Date):
Promise<KdsOrderQueueSnapshot>` method on OrdersRepository
     (this — chosen). Composite snapshot return; one round-trip
     pipeline inside the adapter; clean depth.
   - **(iii)** Skip the KDS endpoint in F-08 and leave it on
     `supabaseService` directly. Rejected. ADR-0003 line 19 explicitly
     lists "all 5 orders routes" as the F-08 target; leaving one
     behind means F-09's ANVIL rip-out test for Orders fails.

   **Recommend Gate 2 approve option (ii).** The composite shape
   (`KdsOrderQueueSnapshot`) is small and named; the depth-rule
   rationale is documented in the method's JSDoc. The `OrdersAuditRepository`
   sibling-port alternative was sketched (option (ii) in the JSDoc
   note) but rejected because the `order_audit_log` table is
   Orders-named and has no independent use today. If F-19 HACCP ever
   needs to query audit data for non-order purposes, revisit.

2. **`CreateOrderLineInput`'s product-vs-ad-hoc shape.** The
   pre-grilled picks did not address this; the planner sketched it
   and settled on two optional fields with a documented XOR invariant
   (matching `OrderLine`'s shape). The discriminated-union alternative
   (`{ kind: 'catalogue'; productId } | { kind: 'adHoc'; description }`)
   is APOSD-deeper (impossible states made unrepresentable) but
   introduces switch ceremony at every read site, including read-only
   paths that just want the description for display. Recommended pick:
   **two optional fields with documented invariant.** Re-evaluate at
   F-15 if a new product-kind appears (e.g. "catalogue with custom
   weight"). Surfaced for Gate 2 because the pre-grilled picks left
   this open.

3. **Re-declaring `OrderState` and `OrderUom` rather than re-exporting
   from `lib/orders/types.ts`.** Two literal sets, identical to the
   existing `lib/orders/types.ts:15-18` definitions. The planner
   considered re-exporting (`export { type OrderState, type OrderUom }
from '@/lib/orders/types'`) but rejected it because it creates a
   reverse dependency (`lib/domain/` → `lib/orders/`) that F-08 would
   have to unwind. The cost is duplication: two files declare the
   same union. The mitigation is the type-pin fixture (case "OrderState
   union admits exactly placed/printed/completed" — assertions match
   `lib/orders/types.ts`) plus a forward-looking comment in
   `lib/domain/Order.ts` documenting the F-08 deprecation path.
   **Risk:** if `lib/orders/types.ts:15` ever drifts (e.g. a new
   `'archived'` state added), the two declarations diverge and the
   type-pin fixture in F-05 fails. **Mitigation accepted as feature**
   — drift detection is exactly what the fixture is for. Surfaced
   for Gate 2 in case the reviewer prefers the re-export path; the
   planner recommends the re-declare path.

4. **`Order.creator` and `Order.printer` are embedded user
   projections.** Today's routes embed `creator:created_by(id, name)`
   and `printer:printed_by(id, name)` (e.g. `app/api/orders/[id]/
route.ts:54-55`). F-05's `Order` shape carries these as embedded
   `{ id, name }` sub-shapes. Two alternatives were considered:
   - **(A)** Embedded sub-shapes (this) — caller gets the names in
     one round-trip.
   - **(B)** Return only `createdBy` / `printedBy` ids; let the
     service compose a user-lookup via a future `UsersRepository`
     (F-13).

   Chosen (A). Rationale: the routes today already pay for the embed
   server-side (PostgREST's join is one round-trip); F-13 would need
   either an N+1 lookup or a batch-resolve to match today's behaviour
   if we strip the embeds at F-05. (A) preserves today's read
   ergonomics. (B) is more architecturally pure but pays a runtime
   cost. **Gate 2 input welcome.** If Gate 2 prefers (B), the F-13
   planner inherits the lookup cost; flag for that planner's
   attention. Planner recommendation: (A).

5. **F-04's lint rule already matches ADR-0002 line 19.** Verified at
   `.eslintrc.json:18`: the allow-list glob includes
   `lib/adapters/supabase/**/*.ts`, which is the ADR-0002 path.
   **No edit to F-04's rule needed.** This is the conductor's brief
   ("F-04's lint rule already matches ADR-0002 — no lint edit
   needed") confirmed by inspection. Risk closed.

6. **`expectTypeOf` from Vitest is the type-pin assertion API.**
   Verified at `node_modules/vitest/dist/index.d.ts` (the `vitest`
   package re-exports `expectTypeOf`). The test fixture uses it for
   `keyof X` cardinality checks. If a future Vitest upgrade renames
   or removes `expectTypeOf`, the fixture needs adjustment.
   Mitigation accepted; surface low.

7. **Re-running `npm test` adds the new ports suite to the run.**
   Expected. The new suite is ~110 lines, runs in <100ms, and adds
   no DB dependency. No CI configuration change needed.

8. **`tsc` strict mode.** Verified at `tsconfig.json` (not re-read in
   recon — flagged for the implementer to confirm). F-05 files use
   `readonly` everywhere and explicit `null` over `undefined` where
   semantically meaningful. If `tsconfig.json` has `strict: false`,
   the `readonly` modifiers are silently weakened but still valid;
   the type-pin fixture's `expectTypeOf` checks would still pass.
   Recommend the implementer confirm strict-mode posture during step
   2 (clean-tree baseline).

9. **Service-layer error contract is documented but not testable
   here.** The port JSDoc names `NotFoundError`, `ConflictError`,
   `ServiceError` as the documented throwables. There is no F-05
   test that an adapter actually throws these — that is F-06's
   contract-test suite (ADR-0003 line 23). F-05's type-pin fixture
   does NOT exercise error behaviour; it exercises type shape only.
   This is the right split — different concerns, different units.

10. **The `Promise<readonly X[]>` return shape is uncommon.** Vitest
    type assertions handle `readonly` arrays fine. The implementer
    may see TypeScript widen the array literal in `await
repo.listOrders({})` calls when consumers come online (F-06+) —
    that is expected behaviour and not a port-shape problem.

11. **Forward dependency: F-06 must keep the `KdsOrderQueueSnapshot`
    composite name.** F-06's adapter file will have a function named
    `listKdsQueue` returning this shape. If F-06 wants a different
    name, the port name has to change too — synchronised rename, no
    free lunch. Flag for the F-06 planner: do not rename without
    re-running the type-pin fixture.

12. **CLAUDE.md alignment is a documentation edit, not a behavioural
    change.** Risk that a future reader of CLAUDE.md interprets the
    realigned Blockers list as new policy. Mitigation: the diff
    references ADR-0002 explicitly, and the prose says "see ADR-0002
    for the full naming + dependency rule". The principle (Lego, rip-
    out test, dependency points inward) is the same; only the path
    names changed.

13. **The two `// @ts-expect-error` markers in the type-pin fixture**
    (one for `OrderState = 'archived'`, one for `OrderUom = 'litre'`)
    fail at the type level when the union literal expands beyond the
    expected set. This is intentional drift detection. If a future
    PR expands `OrderState` to include `'archived'`, the
    `@ts-expect-error` marker becomes a real error and the F-05 test
    fails — at which point the test must be updated AND ADR-0002 /
    ADR-0003 review whether the state-machine expansion is approved.
    Acceptable; the drift detection is the point.

14. **F-07 (next unit) is unblocked by F-05.** Once F-05 ships, the
    F-07 planner can start with the port contract in hand. F-06
    (adapters) and F-07 (service) can in principle proceed in
    parallel — F-07 unit-tests against a fake adapter (`FakeInMemoryOrdersRepository`
    — F-06 territory). Coordination: the F-07 planner should target
    the F-05 port shapes verbatim; if F-07 needs a method shape
    change, it goes back through Gate 2 against this plan, not as a
    silent F-07 edit.

15. **F-08 (route rewrites) inherits the KDS queue method from §5
    Risks #1.** The KDS endpoint at `app/api/kds/orders/route.ts`
    will, in F-08, become a 20-line handler that calls
    `ordersService.getKdsQueue(since)` (or the equivalent use-case)
    and returns `{ orders, recentFlashes, serverTime }` as JSON.
    Flag for the F-08 planner.

---

## 6. Rollback

Straightforward. F-05 squash-merges into `main` as a single commit
(matching #15–#21 and the F-04 squash pattern). To roll back:

```bash
git revert <merge-commit-sha>
git push origin main
```

**No data implications.** F-05 makes no schema changes, no data
migrations, no row inserts/updates/deletes, no runtime behaviour
changes. The unit tests don't touch any DB. A revert reinstates the
previous state byte-for-byte: `lib/domain/`, `lib/ports/`,
`tests/unit/ports/` vanish; CLAUDE.md returns to its pre-F-05 lines
26-50.

**Implication for F-06+.** A revert of F-05 cancels F-06's
prerequisite — F-06's adapters import from `@/lib/domain` and
`@/lib/ports`, both of which would no longer exist. Mitigation: do
not revert F-05 unless F-06 has not yet shipped. If F-06 is on `main`
when F-05 needs to be reverted, revert both together (revert F-06
first, then F-05).

**If revert is needed mid-PR-cycle** (e.g. Gate 2 rejects the KDS
method addition): no revert needed because the PR has not yet
merged. Simply close the PR, revise the plan, re-open with the
correction. The branch is throwaway.

---

## 7. Definition of done

- [ ] Branch `f-05-orders-domain-ports` exists, based on `main` HEAD
      `345d654`.
- [ ] Commit 1 carries the four `lib/domain/` files (Order, Customer,
      Product, index). Co-author trailer present.
- [ ] Commit 2 carries the four `lib/ports/` files (OrdersRepository,
      CustomersRepository, ProductsRepository, index) AND the CLAUDE.md
      alignment edit. Co-author trailer present.
- [ ] Commit 3 carries `tests/unit/ports/orders-domain.types.test.ts`.
      Co-author trailer present.
- [ ] `npm test` exit 0; new ports suite is part of the run and green.
- [ ] `npm run lint` exit 0; F-04 calibrated baseline holds.
- [ ] `npx tsc --noEmit` exit 0; zero TS errors on new files.
- [ ] `npm run build` exit 0.
- [ ] `git diff main package.json` empty (no new deps).
- [ ] `git diff main app/ supabase/ middleware.ts` empty (no route /
      schema / middleware edits).
- [ ] Production-path grep (`@/lib/ports` / `@/lib/domain` in `app/`,
      `lib/services`, `lib/usecases`) returns zero matches.
- [ ] CLAUDE.md byte-preservation check (lines 1-24 unchanged) passes.
- [ ] PR opened against `main` with title `feat(ports): Orders domain
    ports + types (F-05)` and a body that:
  - References ADR-0002 + ADR-0003 by path + line.
  - References this plan path.
  - References F-04's lint rule and confirms F-05 introduces zero new
    SDK imports.
  - Lists the three commits with their commit messages.
  - Calls out the §5 Risks #1 KDS queue method addition for the
    reviewer's attention.
  - Confirms the four pre-grilled design-it-twice picks were honoured
    (with rationale links to §2 JSDoc per method).
- [ ] PR NOT auto-merged. Hakan squash-merges after ANVIL gates pass.

---

## 8. Out of scope (DO NOT touch in this PR)

- **NO** implementations under `lib/adapters/supabase/**` — F-06
  territory.
- **NO** `OrdersService` or `lib/services/**` — F-07 territory.
- **NO** route migrations of any kind — F-08 territory.
- **NO** new `package.json` deps. Port code is pure TypeScript.
- **NO** schema changes; the standing Supabase migration-lock hook
  must not fire.
- **NO** `middleware.ts` edits.
- **NO** changes to the 80+/104 hand-rolled role-check sites.
- **NO** changes to the 13 raw-fetch sites enumerated in ADR-0005's
  Per-Site Map.
- **NO** F-04 lint-rule edits — the rule already matches ADR-0002
  line 19.
- **NO** `Caller` move from `lib/observability/Caller.ts` to
  `lib/domain/` — deferred to F-13 per the existing forward-looking
  comment at `Caller.ts:13-16`.
- **NO** `Role` move to a domain module — deferred to F-13 (same
  forward-looking comment).
- **NO** `Customer` or `Product` fields beyond what Orders' methods
  need today. Customer carries `id, name, postcode, active`. Product
  carries `id, code, name, boxSize`. F-15 / F-20 extend.
- **NO** retirement of `lib/orders/types.ts` or `lib/orders/validation.ts`
  or `lib/orders/pickingList.ts` — F-08 deals with those when the
  routes are rewritten.
- **NO** contract-test suite in `lib/ports/__contracts__/` — F-06
  territory per ADR-0003 line 23.
- **NO** new ADR. Gate 1 confirmed F-05 IS the implementation of
  ADR-0002.
- **NO** edits to `lib/observability/` — F-05 does not consume
  the observability surface (port methods do not log; logging happens
  at the service and adapter layers in F-06 / F-07).
- **NO** Playwright tests.

---

## 9. ADR / docs implications

- **ADR-0002** — no ADR edit needed. F-05 IS the first implementation
  of this ADR. The ADR's "Consequences" section already anticipates
  F-05's effect on the rip-out test (line 35 — "No immediate shift on
  the day this ADR lands — the model is recorded, not enforced.
  Enforcement arrives via F-04 ... and is completed in F-27"). F-05
  continues to be "model recorded, not enforced" for Orders; F-08
  begins the actual rip-out, F-09 closes Orders' rip-out test, F-27
  closes the rip-out test for every vendor.

- **ADR-0003** — no ADR edit needed. F-05 implements line 19 of this
  ADR verbatim. The ADR's "Dependent units" list (line 27) names
  F-05 as a known prerequisite for F-06+; nothing in the ADR's prose
  needs to change.

- **ADR-0004** — no ADR edit needed. F-05 does not touch RLS.

- **ADR-0005** — no ADR edit needed. F-05 does not overlap with the
  Per-Site Map.

- **`docs/architecture-review-2026-06-06.md`** — no edit needed. F-05
  realises Phase 1's first paragraph (lines 326-328) verbatim. The
  review document's other sections are unaffected. The "Addendum
  2026-06-07" appended by ADR-0005 is also unaffected.

- **`CLAUDE.md`** — edited as part of Commit 2. Folder layout +
  Dependency justification + Blockers sections realigned to ADR-0002
  line 19. The Lego principle prose (lines 1-24) and the Local test
  infrastructure section (lines 52-62) are preserved byte-for-byte.
  The edit is documentation, not policy — the underlying principle
  (Lego, rip-out test, dependency points inward) is unchanged.

- **`docs/plans/2026-06-08-f-05-orders-domain-ports.md`** — this plan.
  Future planners for F-06, F-07, F-08, F-13, F-14, F-15, F-16, F-17,
  F-18, F-19, F-20, F-21 will use this plan's structure and depth as
  the template for their own port-extraction units. The depth (~1500
  lines), the design-it-twice-in-JSDoc discipline, the null-vs-throw
  contract per method, the comments-first rule, the type-pin fixture
  shape, the CLAUDE.md alignment posture (if their unit needs one),
  and the strangler-fig discipline (ports ship unused; services and
  routes follow in later PRs) are the template. If a later planner
  diverges from this template, the divergence requires its own Gate 2
  rationale — the template is intentional.

- **F-04 ESLint configuration** — no edit. The rule already covers
  ADR-0002 line 19's allow-list paths verbatim. The F-04 calibrated
  baseline is unchanged.

- **No new ADR.** Confirmed at Gate 1 and re-confirmed by the planner
  after reading the locked spec + Phase 1 sequencing + the existing
  ADR set. F-05 makes no architectural decision; it implements three
  ADRs (0002, 0003, and indirectly 0005's strangler-fig discipline).
