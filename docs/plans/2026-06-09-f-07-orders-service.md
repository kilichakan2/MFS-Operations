# F-07 — OrdersService (third hexagonal unit; first service file)

## Goal

F-07 is the **third hexagonal unit** in the strangler-fig migration and the
**first service file in the codebase**. It ships:

- 1 **OrdersService** interface + factory + default singleton
  (`lib/services/OrdersService.ts`) composing three F-05 ports
  (`OrdersRepository`, `CustomersRepository`, `ProductsRepository`)
  via constructor injection. It is the orchestration layer the F-08 routes
  will eventually call.
- 1 **services barrel** (`lib/services/index.ts`) re-exporting the
  interface, the factory, and the default singleton, mirroring the symmetry
  established by `lib/adapters/supabase/index.ts` and `lib/adapters/fake/index.ts`.
- 1 **service-layer unit test file** (`tests/unit/services/OrdersService.test.ts`)
  with ~28 cases — every business-orchestration decision the service
  makes is covered by a case that uses the F-06 Fake factories
  (`createFakeOrdersRepository`, `createFakeCustomersRepository`,
  `createFakeProductsRepository`) to exercise the service without a DB.

F-07 is the **worked example for services + service-layer testing** the way
F-05 was the worked example for ports and F-06 was the worked example for
adapters. Every future service file (`UsersService`, `RoutesService`,
`PricingService`, `CashService`, `ComplaintsService`, `VisitsService`,
`HACCPService`, `AdminService`) copies F-07's interface-plus-hybrid-factory
shape, F-07's "services compose ports, not other services" discipline
(ADR-0002 line 23), and F-07's Fake-factory-driven unit test pattern. Get
this one wrong and every later service PR copies the wrong template. The
plan reads as a worked example for that reason — long, deliberate, and
explicit about why each method has the shape it does.

**What F-07 ships unused.** ADR-0003's strangler-fig sequencing puts ports
in F-05 (shipped), adapters in F-06 (shipped, on main HEAD `3d56b85`),
service in F-07 (this), route rewrites in F-08. F-07 lands a real service
file that no production path imports — the 5 Orders routes
(`app/api/orders/route.ts`, `app/api/orders/[id]/route.ts`,
`app/api/orders/[id]/picking-list/route.ts`, `app/api/kds/orders/route.ts`,
`app/api/kds/lines/[lineId]/done/route.ts`) stay verbatim until F-08. The
default `ordersService` singleton is exported but not imported anywhere
outside the service file's own tests until F-08 wires it.

**What F-07 explicitly does NOT do.**

- NO route migrations of any kind — F-08 territory. The 5 Orders routes are
  read for recon only; not one line changes.
- NO new `package.json` deps. The service is pure TypeScript + Vitest. Both
  already present.
- NO schema changes.
- NO `middleware.ts` edits.
- NO changes to F-05's files (`lib/ports/*.ts`, `lib/domain/*.ts`).
- NO changes to F-06's files (`lib/adapters/supabase/*.ts`,
  `lib/adapters/fake/*.ts`, `lib/ports/__contracts__/*.ts`,
  `tests/integration/adapters/**`, `tests/unit/adapters/**`).
- NO F-04 lint-rule edits — `lib/services/**` does not need an allow-list
  entry because services never import `@supabase/supabase-js` directly.
  The rule does not fire.
- NO new ADR. Gate 1 confirmed F-07 IS the implementation of ADR-0002 line
  23 ("services do not import other services directly") + ADR-0003 line 29
  for the Orders bounded context.
- NO modifications to ADR-0002, ADR-0003, ADR-0004, ADR-0005.
- NO modifications to CLAUDE.md.
- NO modifications to `lib/orders/validation.ts`, `lib/orders/types.ts`, or
  `lib/orders/pickingList.ts` — those are F-08 retirement targets.
- NO modifications to existing test files, INCLUDING the 23 broken
  Orders HTTP integration tests documented as F-TD-03 in
  `docs/anvil/2026-06-09-f-05-cert.md` §F-TD-03. F-08 owns that fix.
- NO `Caller` coupling on the service signature. The service takes
  `callerRole: Role` and `callerUserId: string` as primitives — see §1.5
  and §2.1 for the locked decision.
- NO observability imports inside the service file (`@/lib/observability/*`)
  except the type-only `Role` import (see §1.5 — the only allowable
  exception, with a documented forward-deprecation path).
- NO auth imports inside the service file (`@/lib/auth/*`). Routes do
  auth; services receive primitives.
- NO logging from the service file. Adapters log on DB failures (F-06);
  the service propagates typed errors only.
- NO new use-cases layer (`lib/usecases/`). The conductor brief locks F-07
  as a service file, not a use-case orchestrator. If future units need a
  thin use-case layer above services, that's a separate decision.
- NO retirement of `app/api/kds/orders/route.ts`'s inline KDS query — F-08
  retires it; F-07 only provides `listKdsQueue` as a pass-through method
  so F-08 has a service-level entry point.

---

## Source spec

- **Locked Gate 1 spec — the conductor handoff above.** Frozen. The
  service interface shape (7 methods), the hybrid factory + singleton
  construction pattern, the per-method orchestration (extracted verbatim
  from the current routes), the auth posture (primitives over `Caller`),
  the per-method error contract, the test surface (25–35 cases against
  the F-06 Fake factories), the file inventory (3 new files), the
  hexagonal posture (imports allow-list), the scope discipline, the F-08
  hard prerequisites carry-forward, and the branch + commit + PR title
  conventions are all spec-locked.

- **ADR-0002 hexagonal shape and naming** —
  `docs/adr/0002-hexagonal-shape-and-naming.md`. F-07 implements line 23
  for the Orders bounded context. Cited verbatim throughout:
  - **Line 17** — "A `port` is an interface that the app owns […]." → F-07
    does not define new ports; the service composes the three F-05 ports.
  - **Line 19** — "Services live in `lib/services/`. Each service file
    owns one business domain." → F-07 creates `lib/services/` and the
    `OrdersService.ts` file inside it. The directory does NOT exist on
    main HEAD `3d56b85` — F-07 creates it.
  - **Line 21** — "Vendor SDK imports […] are permitted inside
    `lib/adapters/**` and nowhere else." → F-07's service file imports
    ZERO vendor SDKs. The lint rule at `.eslintrc.json:4-22` does not
    need an edit; the rule simply does not fire on
    `lib/services/OrdersService.ts` because the file does not import
    `@supabase/supabase-js`. **CRITICAL** — verified at recon §1.6.
  - **Line 23** — "Services do not import other services directly. A
    service composes ports; if it needs another domain's business logic,
    it composes that domain's PORT, not its SERVICE." → **The single
    most important rule for F-07.** F-07's `OrdersService` composes
    `OrdersRepository`, `CustomersRepository`, `ProductsRepository`
    — three ports. It does NOT import a `CustomersService` (does not
    exist yet) or a `ProductsService` (does not exist yet). When F-13
    Users + Auth ships `UsersService`, F-07's `OrdersService` will still
    talk to `CustomersRepository`, not `CustomersService`. This keeps
    the service graph acyclic and the dependency direction
    inward-pointing forever. Documented in the service file's header
    comment + in §2.1.
  - **Line 25** (depth rule) — F-07's service methods hide:
    - `placeOrder` hides the customer-existence + active check + product
      verification + the createOrder call — three port calls, one method.
    - `editOrder` hides the order-existence check + state×role gating +
      product verification (if line replacement) + the updateOrder call —
      four port calls, one method.
    - `printOrder` hides the order-existence check + completed-state
      guard + recordPrint call — three port calls, one method.
    - `completeLineDone` hides the markLineDone call + the conditional
      markOrderCompleted call + the race-condition swallow — three port
      calls in two paths, one method.
    - Pass-throughs (`listOrders`, `findOrderById`, `listKdsQueue`) are
      explicit thin delegates that DO NOT hide depth, but they're on the
      service surface so F-08 routes have a single point of contact for
      Orders. Acceptable per Gate 1 — surfaced in §2.1.
  - **Line 27** — "Vendor types never cross the port boundary." → F-07's
    service receives only domain types (Order, Customer, Product,
    CreateOrderInput, OrderPatch, etc.) from the ports. Vendor types
    cannot reach the service. The service in turn returns only domain
    types to its callers (today F-07's tests; tomorrow F-08 routes).
  - **Line 43** — APOSD principles cited by name:
    - **Pull complexity downward (§10)** — the route currently mixes auth
      (cookie reads), validation (zod-equivalent ad-hoc), customer check,
      product verification, two-step insert, rollback — all in one HTTP
      handler. F-07 pulls the business-orchestration part down into the
      service; F-08 will keep auth + validation at the route boundary.
      Today's `app/api/orders/route.ts:83-190` is 107 lines; F-08's
      equivalent will be ~30 lines because `placeOrder` does the work.
    - **Define errors out of existence (§11)** — pass-throughs return
      null on miss for `findOrderById` (port already does); the service
      does NOT re-wrap as NotFoundError. Throw-on-miss is reserved for
      WRITE methods where the next operation requires the row to exist
      (`editOrder`, `printOrder` re-check the order; `placeOrder`
      re-checks the customer).
    - **Information hiding (§4)** — every port call's column projection
      / embed / SQL is invisible to the service; the service only sees
      domain shapes. The service's own decisions (the ROLES_EDIT_PLACED
      / ROLES_EDIT_PRINTED constants, the customer-active check, the
      missing-product extraction) are top-of-file or method-local and
      private to the service.
    - **Design it twice (§12)** — every method's orchestration shape
      was sketched in two forms (the current-route shape vs a
      port-composing shape) and documented in §2.1 as the chosen form
      with rationale.

- **ADR-0003 strangler-fig migration and FREEZE rule** —
  `docs/adr/0003-strangler-fig-migration-and-freeze-rule.md`. F-07 is the
  third port-extraction step named (line 29). Quoted verbatim from line 29:
  _"F-07 ships the OrdersService that composes the three F-06 adapters
  via the F-05 ports; F-08 rewrites the 5 Orders routes to call the
  service."_ → This plan implements that paragraph verbatim.

- **ADR-0004 RLS posture** —
  `docs/adr/0004-rls-vs-service-role-security-model.md`. F-07's service
  is RLS-agnostic. It calls adapters; the adapters wrap whichever client
  the singleton was constructed with (today: `supabaseService`, the
  service-role client). The per-request authenticated Supabase client
  (F-RLS-03) is an independent track that will eventually inject a
  per-request adapter into the service via factory composition. F-07
  does NOT pre-fit for that — when F-RLS-03 lands, the F-RLS-03 PR will
  change how the singleton is wired (one config line), not the service's
  signature. Documented in §5 Risks #5.

- **ADR-0005 F-01 narrowing** — `docs/adr/0005-f01-narrowed-raw-fetch-deferred-to-port-extractions.md`.
  No overlap. F-07 does not touch the 13 raw-fetch sites enumerated.

- **F-04 ESLint FREEZE rule** — `.eslintrc.json`. The rule at line 4-22
  forbids `from '@supabase/supabase-js'` outside three allow-listed
  globs (`lib/supabase.ts`, `lib/adapters/supabase/**/*.ts`, `tests/**`).
  F-07's new files do NOT match any of those globs, **but they also do
  NOT import `@supabase/supabase-js`** — the rule does not fire on a
  file that doesn't violate it. **No edit to `.eslintrc.json` is needed.**
  Verified at recon §1.6.

- **F-INFRA-01 local Supabase stack** — irrelevant to F-07. F-07's tests
  use the F-06 Fake factories, no DB. The `db:up` / `db:reset` /
  `test:integration` commands are not used by F-07's PR.

- **F-FND-02 typed-error contract** — `lib/errors/`. F-07's service
  throws real `NotFoundError`, `ConflictError`, `ForbiddenError`,
  `ValidationError`, `ServiceError` instances. The framework HOF
  (`withErrors` at `lib/errors/withErrors.ts`) at the route layer
  (F-08) will translate these to HTTP responses. F-07's tests assert
  `instanceof` against each typed error so route-layer code (F-08) can
  rely on the error identity.

- **F-FND-03 observability surface** — `lib/observability/log.ts` +
  `lib/observability/Caller.ts`. F-07 imports ONLY `type Role` from
  `@/lib/observability`. It does NOT import `log`, `Caller`,
  `makeCaller`, `getCaller`, or `runWithCaller`. The service receives
  `callerRole: Role` + `callerUserId: string` as primitives, leaving
  the `Caller` plumbing to the route boundary. **CRITICAL FINDING** —
  `Role` is exported from `lib/observability/index.ts:10` (re-export
  of `lib/observability/Caller.ts:26`); it is NOT exported from
  `lib/domain/index.ts`. See §1.5 for the locked decision and §5
  Risk #2 for the F-13 forward path.

- **F-05 plan** — `docs/plans/2026-06-08-f-05-orders-domain-ports.md`.
  Structural template; this plan matches its 9-section shape, comment-
  discipline depth, design-it-twice ethic, and depth.

- **F-06 plan** — `docs/plans/2026-06-09-f-06-orders-supabase-adapters.md`.
  Direct structural template. F-07's plan mirrors F-06's section
  ordering: source spec → branch + base → recon findings → file
  inventory → step ordering → test matrix → risks → acceptance →
  follow-ups. F-06's plan is 2742 lines; F-07's target is ~2200 lines
  (F-07 has 3 new files vs F-06's 17, but the per-method orchestration
  documentation is deeper to set the template).

- **F-05 cert** — `docs/anvil/2026-06-09-f-05-cert.md` §F-TD-03 lines
  274-372. The 23 failing integration tests on main are pre-existing,
  owned by F-08, and unrelated to F-07's ship. F-07's tests do NOT use
  HTTP at all — they call the service factory directly with Fake
  adapters. F-07 ships green regardless of F-TD-03. **F-07's plan
  surfaces the F-08 hard prerequisites carry-forward** (§5 Risk #1 +
  §9 Follow-ups + §10 F-08 hard prerequisites).

- **F-06 cert** — `docs/anvil/2026-06-09-f-06-cert.md`. F-06's
  certificate confirms 43 contract cases pass against both Supabase and
  Fake adapters, that `@supabase/supabase-js` appears in exactly three
  files (all under `lib/adapters/supabase/`), and that zero production
  paths import any `@/lib/adapters` path. F-07 inherits all of that:
  the Fake factories work, the typed errors flow identically, the
  service's contract tests can rely on Fake adapters as drop-in
  substitutes for the real Supabase adapters.

- **Pre-existing Orders code surface (the rip-out target).** Read in
  full before drafting any service method shape — every claim in §2
  is grounded in these line numbers:
  - `lib/ports/OrdersRepository.ts` (457 lines) — the port surface F-07
    composes. Every method's JSDoc names what the adapter does and what
    the service is responsible for above the port.
  - `lib/ports/CustomersRepository.ts` (47 lines) — `findCustomerById`.
  - `lib/ports/ProductsRepository.ts` (57 lines) — `findProductsByIds`.
  - `lib/domain/Order.ts` (275 lines) — `Order`, `OrderLine`,
    `OrderState`, `OrderUom`, `OrderFilter`, `OrderPatch`,
    `CreateOrderInput`, `CreateOrderLineInput`.
  - `lib/domain/Customer.ts` (54 lines) — `Customer`.
  - `lib/domain/Product.ts` (33 lines) — `Product`.
  - `lib/domain/index.ts` — confirmed: re-exports `Order`, `OrderLine`,
    `OrderState`, `OrderUom`, `OrderFilter`, `OrderPatch`,
    `CreateOrderInput`, `CreateOrderLineInput` (lines 10-19),
    `Customer` (line 20), `Product` (line 21). **Does NOT re-export
    `Role`.** See §1.5.
  - `lib/observability/Caller.ts` (92 lines): - `Role` union at line 26-32 (`'warehouse' | 'office' | 'sales' |
'admin' | 'driver' | 'butcher'`). - `KNOWN_ROLES` runtime list at line 48-55. - File header comment lines 11-16: "When the Users + Auth migration
    lands (F-13), this canonical type moves to a domain module
    (`lib/domain/Role.ts`)". → **F-07 inherits the F-13 forward path;
    see §1.5 + §5 Risk #2.**
  - `lib/observability/index.ts` line 10: `export { type Caller, type
Role, makeCaller } from './Caller'`. → **`Role` is re-exported from
    `@/lib/observability`.** F-07 imports `type Role` from there.
  - `lib/errors/index.ts` — `NotFoundError`, `ConflictError`,
    `ValidationError`, `ForbiddenError`, `UnauthorizedError`,
    `ServiceError`, `AppError`. F-07 throws the first five; never
    `UnauthorizedError` (route layer; the service trusts the caller is
    authenticated) and never `AppError` directly (abstract).
  - `lib/errors/ValidationError.ts` — the `fields` shape is
    `Record<string, string[]>`. F-07's `placeOrder` and `editOrder`
    throw `ValidationError("Unknown product_id(s)", { fields: {
'lines.products': missing.join(', ') } })` per the locked spec. Confirmed
    via inspection of `ValidationError` constructor (positional
    `(message, fields, options?)` at lines 21-30) — F-07 uses
    `new ValidationError(message, fields)` (two args).
  - `lib/adapters/supabase/index.ts` (34 lines) — confirms
    `supabaseOrdersRepository`, `supabaseCustomersRepository`,
    `supabaseProductsRepository` are exported (the singletons F-07
    wires by default).
  - `lib/adapters/fake/index.ts` (31 lines) — confirms
    `createFakeOrdersRepository`, `createFakeCustomersRepository`,
    `createFakeProductsRepository` are exported (the factories F-07's
    tests use). The constructor-with-seed signature on
    `createFakeCustomersRepository(seed?: readonly Customer[])` and
    `createFakeProductsRepository(seed?: readonly Product[])` is
    verified — see `lib/adapters/fake/CustomersRepository.ts:26-28`
    and `lib/adapters/fake/ProductsRepository.ts:22-24`.
  - `lib/adapters/fake/OrdersRepository.ts` — the Fake doesn't take a
    seed (line 75: `createFakeOrdersRepository(): OrdersRepository`).
    Tests bootstrap orders by calling `repo.createOrder(...)`. F-07's
    tests follow the same pattern.
  - `app/api/orders/route.ts` lines 103-190 — POST `/api/orders`. The
    business logic F-07 absorbs into `placeOrder`:
    - Lines 105-115: customer-existence and active check.
    - Lines 117-134: product-verification (bulk `IN` lookup +
      missing-id surfacing).
    - Lines 153-183: two-step order+lines insert with rollback (port's
      `createOrder` already wraps this — service just calls it).
  - `app/api/orders/[id]/route.ts` lines 90-180 — PUT
    `/api/orders/[id]`. The business logic F-07 absorbs into
    `editOrder`:
    - Lines 94-102: load order by id (port returns null on miss;
      service raises NotFoundError).
    - Lines 104-113: state×role gating — three rules (state=completed
      → 403; state=placed + sales/office/admin allowed; state=printed
      - only admin/office allowed). **F-07 inherits these constants
        verbatim from `app/api/orders/[id]/route.ts:31-32`.**
    - Lines 115-129: orders-row patch (port's `updateOrder` wraps the
      DB call).
    - Lines 133-148: product verification on line replacement (same
      pattern as `placeOrder`).
    - Lines 150-175: delete + insert lines (port's `updateOrder` with
      `lineReplacement` wraps this).
  - `app/api/orders/[id]/picking-list/route.ts` lines 179-225 — POST
    `/api/orders/[id]/picking-list`. The business logic F-07 absorbs
    into `printOrder`:
    - Lines 188-191: load order by id.
    - Lines 195-197: state=completed → 403. **F-07 inherits this
      ConflictError.** (Note: the route returns 403; F-07's service
      throws ConflictError which maps to HTTP 409. Gate 1 locked
      ConflictError on the conductor-confirmed grounds that
      "completed" is a state collision, not an authorization failure.
      Today's route's 403 is a documented mismatch with the rest of
      the typed-error contract — F-08 will normalize when wiring
      the route to the service.) Surfaced as Risk #3.
    - Lines 199-222: state-branching update (port's `recordPrint`
      wraps both first-print and reprint).
  - `app/api/kds/lines/[lineId]/done/route.ts` lines 60-166 — POST
    `/api/kds/lines/[lineId]/done`. The business logic F-07 absorbs
    into `completeLineDone`:
    - Line 80-94: validate butcher + check line idempotency (port's
      `markLineDone` wraps idempotency).
    - Lines 92-94: idempotency short-circuit. **Service mirrors with
      `alreadyDone: true → completed: false` return shape.**
    - Lines 99-116: parent order state check (port's `markLineDone`
      handles `placed`/`completed` → ConflictError).
    - Lines 118-129: mark line done (port wraps).
    - Lines 142-164: count remaining + auto-complete on
      `remainingCount === 0` (service composes
      `markLineDone` → conditional `markOrderCompleted`). **The race
      swallow** (lines 162-163: "completion_failed: true" fallback in
      the route) translates in F-07 to a `try/catch` around
      `markOrderCompleted` that catches `ConflictError` (the
      optimistic-lock guard rejecting a state that's already moved)
      and returns `{ completed: true }` because the order is
      effectively completed even if this caller didn't do it.
  - `docs/plans/2026-06-08-f-05-orders-domain-ports.md` — F-05's
    structural template.
  - `docs/plans/2026-06-09-f-06-orders-supabase-adapters.md` — F-06's
    structural template (the closest match).
  - `docs/anvil/2026-06-09-f-06-cert.md` — F-06's certificate. The
    architectural significance pattern (worked example, future units
    copy it) carries to F-07.

- **`no-restricted-imports` ESLint rule on F-07 files.** Verified at
  `.eslintrc.json:4-22`. The rule forbids `from '@supabase/supabase-js'`
  outside three allow-listed file globs. F-07 introduces NO file that
  imports `@supabase/supabase-js`. The rule does not fire on F-07's
  files; no edit is needed.

---

## Compliance

**NO runtime compliance impact.** F-07 ships a service file that no
production path imports. The 5 Orders routes still go through the
routes' inline Supabase calls (untouched until F-08). No HTTP behaviour
changes, no audit behaviour changes, no auth flow changes. No new schema,
no migration, no row written by F-07 code in production.

**ADR-0002 line 23 services-don't-import-services — F-07 enforces.** The
service file's header comment documents the rule. The service factory
receives three PORTS (`OrdersServiceRepos = { orders: OrdersRepository,
customers: CustomersRepository, products: ProductsRepository }`) — never
a `CustomersService` or `ProductsService` (those don't exist yet, and
will compose their own ports independently when they do). The default
singleton wires Supabase adapters by name from `@/lib/adapters/supabase`
— the only place a future change to wiring lands is one constant in
this file (or the singleton can be regenerated via the factory). F-07
sets the precedent for every future service.

**ADR-0002 line 25 depth rule — F-07 honours on business methods,
acceptable thinness on pass-throughs.** Business methods (`placeOrder`,
`editOrder`, `printOrder`, `completeLineDone`) each hide ≥2 port calls
plus a business decision (customer-active check, state×role gating,
state-completed guard, race swallow). Pass-throughs (`listOrders`,
`findOrderById`, `listKdsQueue`) are explicit one-liner delegates; they
exist on the service so F-08 routes have a single point of contact and
F-07's surface is testable as a unit. Pass-throughs do NOT add depth
but they do not subtract from the deeper methods; documented in §2.1.

**ADR-0002 line 27 vendor-types boundary — F-07 inherits cleanly.** The
service imports only domain types and port types; no vendor types reach
it. The Fake-driven tests confirm this — the Fake adapter does not even
have a row shape, so the service code path is exercised against pure
domain shapes.

**ADR-0002 line 43 APOSD principles — F-07 honours.**

- **Define errors out of existence (§11).** Pass-throughs return null/empty
  on miss (port already does); the service does NOT re-wrap as
  NotFoundError on `findOrderById`. WRITE methods throw NotFoundError
  on miss because the next operation requires the row.
- **Pull complexity downward (§10).** Customer-existence + active check,
  product-existence verification, state×role gating, race swallow — all
  pulled down from the route to the service. F-08 routes will be ~30
  lines each.
- **Information hiding (§4).** ROLES_EDIT_PLACED and ROLES_EDIT_PRINTED
  are module-local constants. The product-id extraction + missing-product
  computation is one inlined helper per call site (not a shared private
  function — it's two lines, inlining beats sharing).
- **Design it twice (§12).** Each method's body was sketched both as
  "lift the route verbatim" and as "shape the service around port
  contracts"; the latter wins per §2.1.

**ADR-0003 strangler-fig — F-07 ships the third step.** The 5 Orders
routes still call `supabaseService` directly. F-08 swaps them out.
F-07's PR does NOT touch any route file; the production-path grep in
§4 confirms this.

**ADR-0004 RLS posture.** F-07's service is RLS-agnostic. It composes
adapters; the adapters wrap whichever Supabase client the singleton was
constructed against. Today (F-06): `supabaseService` (service-role,
bypasses RLS). Tomorrow (F-RLS-03): a per-request authenticated client.
**F-RLS-03 will change one config line** (how the singleton is wired),
not the service signature. F-07 does NOT pre-fit for per-request
authenticated clients (no `Caller`-based per-request factory injection)
— that's a separate decision belonging to F-RLS-03.

**ADR-0005 F-01 narrowing.** No overlap with Per-Site Map.

**No new ADR required.** F-07 IS the implementation of ADR-0002 line 23
for the Orders bounded context. The "services compose ports, not
services" rule is enforced by code review against F-07's three-import
allow-list.

**`SET LOCAL app.current_user_id` deferred (still).** F-07 inherits
F-06's deferral verbatim. The service passes `callerUserId` to
`orders.createOrder(input, callerUserId)`, `orders.recordPrint(id,
callerUserId, when)`, etc. The Supabase adapter persists this to the
`orders.created_by` / `orders.printed_by` columns. The audit log still
gets NULL `user_id` because `SET LOCAL` is not wired. F-07 does not
revisit this; F-13 (Users + Auth) or F-19 (HACCP) owns the eventual
fix via either a Postgres helper RPC or a per-request authenticated
client.

**HACCP / financial / data retention surfaces.** None touched by F-07.
The Orders bounded context is operational data, not HACCP and not
financial (Pricing is F-15, Cash is F-16). The 23-test F-TD-03 carry-
forward is a TESTING concern, not a compliance concern.

---

## Branch + base

- **Base:** `main` HEAD `3d56b85` —
  `feat(adapters): Orders Lego adapters + contract tests (F-06) (#23)`.
  Verified via `git log --oneline -1 main` returns
  `3d56b85 feat(adapters): Orders Lego adapters + contract tests (F-06) (#23)`.
  All F-05 + F-06 prerequisites are on main: `lib/domain/`, `lib/ports/`,
  `lib/ports/__contracts__/`, `lib/adapters/supabase/`, `lib/adapters/fake/`,
  `lib/errors/`, `lib/observability/`. F-INFRA-01's local Supabase stack
  is on main (irrelevant to F-07's tests, which use Fake adapters).
- **Branch:** `f-07-orders-service` (matches the conductor brief verbatim).
- **PR target:** `main`. **Not auto-merged.** Hakan ships via the same
  squash-merge flow as #15–#23 once ANVIL gates pass.
- **PR title:** `feat(services): OrdersService (F-07)`.
- **Co-author trailer:** `Co-Authored-By: Claude Opus 4.7 (1M context)
<noreply@anthropic.com>` on every commit.
- **Commit shape: 2 commits ADOPTED.** Rationale below.

### Commit shape — 2 vs 3 commits — chosen 2

Two shapes were considered:

- **2 commits (CHOSEN):**
  - **Commit 1** — `feat(services): OrdersService composing F-05 ports (F-07)` —
    both source files: `lib/services/OrdersService.ts` (the interface +
    factory + singleton) and `lib/services/index.ts` (the barrel).
  - **Commit 2** — `test(unit): OrdersService unit tests against Fake adapters (F-07)` —
    one test file: `tests/unit/services/OrdersService.test.ts`.

- **3 commits (rejected):**
  - **Commit 1a** — `feat(services): OrdersService interface + factory (F-07)` —
    `lib/services/OrdersService.ts` only.
  - **Commit 1b** — `feat(services): services barrel re-export (F-07)` —
    `lib/services/index.ts` only.
  - **Commit 2** — Unit tests.

**Why 2 over 3.** F-06 used a 3-commit shape because each of its three
commits addressed a different testing pyramid layer (source / integration
tests / unit tests). F-07 has only one test layer (unit) and two source
files where the barrel is a trivial three-line re-export. Splitting the
two source files across commits creates a commit (1b) whose ONLY
content is two lines of `export {} from './OrdersService'` — a commit
nobody would `git bisect` to. The 2-commit shape keeps the source
commit atomic (the OrdersService interface, its factory, its singleton,
and its barrel land as one architectural unit — the way F-05's domain

- ports commit landed as one unit) while keeping the test commit clean
  for the same separation-of-concerns benefit F-05 and F-06 enjoyed
  (`git bisect` can isolate "did the source change break it?" from "did
  the test change break it?").

The 2-commit shape also matches the "two-file source vs one-file test"
arity. F-05's source was 11 files in two commits (`feat(domain)` then
`feat(ports)` + CLAUDE.md) — the second commit lumped CLAUDE.md with
ports because both were "ports-domain wiring." F-06's source was 11
files in one commit (`feat(adapters): supabase + fake + contracts`)
because the three layers landed as ONE architectural concept (the port
contract is realised by two adapters; splitting reads as half-landed).
F-07's source is 2 files in one commit because the barrel is the
service's import surface — it has to land with the service.

**Rejected 3-commit consequence:** if Gate 2 disagrees, the planner has
no objection to splitting Commit 1 into Commit 1a (`OrdersService.ts`)
and Commit 1b (`index.ts`). The PR commit log gets one extra line; no
behavioural difference. Marked as a non-blocking style preference in
§5 Risk #6.

---

## 1. Repo recon findings

Captured before planning. Every claim grounded in the actual files on
`main` HEAD `3d56b85`.

### 1.1 — F-05 + F-06 prerequisites are on main, intact, with the locked surface

`lib/ports/OrdersRepository.ts` (457 lines, on main since F-05) exports
`OrdersRepository` (8 methods), `KdsOrderQueueSnapshot`, and
`KdsFlashEvent`. The 8 methods F-07 composes are: `listOrders`,
`findOrderById`, `createOrder`, `updateOrder`, `recordPrint`,
`markLineDone`, `markOrderCompleted`, `listKdsQueue`. The service uses
all 8.

`lib/ports/CustomersRepository.ts` (47 lines) exports
`CustomersRepository` with `findCustomerById(id): Promise<Customer | null>`.

`lib/ports/ProductsRepository.ts` (57 lines) exports
`ProductsRepository` with `findProductsByIds(ids): Promise<readonly Product[]>`.

`lib/ports/index.ts` re-exports all three port types plus the KDS
composite types. F-07 imports `OrdersRepository`, `CustomersRepository`,
`ProductsRepository`, `KdsOrderQueueSnapshot` from `@/lib/ports`.

`lib/adapters/supabase/index.ts` (on main since F-06) exports the three
default singletons F-07's factory wires: `supabaseOrdersRepository`,
`supabaseCustomersRepository`, `supabaseProductsRepository`. F-07's
default singleton imports these by name. No re-wiring needed.

`lib/adapters/fake/index.ts` (on main since F-06) exports the three
factories F-07's tests use: `createFakeOrdersRepository`,
`createFakeCustomersRepository`, `createFakeProductsRepository`. Verified
by re-reading the barrel — the factories return `OrdersRepository`,
`CustomersRepository`, `ProductsRepository` instances respectively.
F-07's tests compose them by passing the three repos into the service
factory.

**No edits to F-05 or F-06 files in F-07.** The §4 grep confirms.

### 1.2 — F-05 domain types are on main, intact, with the locked shape

`lib/domain/Order.ts` (275 lines) exports `OrderState`, `OrderUom`,
`OrderLine`, `Order`, `OrderFilter`, `OrderPatch`, `CreateOrderInput`,
`CreateOrderLineInput`. F-07 uses all 8. The `Order` shape carries
embedded `customer`, `creator`, `printer` projections plus
`lines: readonly OrderLine[]`. The `CreateOrderInput.lines` is a
required `readonly CreateOrderLineInput[]`; `CreateOrderLineInput`
has `productId: string | null` and `adHocDescription: string | null`
(the XOR invariant documented at lines 256-260; the service trusts
the validation layer — `lib/orders/validation.ts` today; zod in F-08
— to enforce XOR before reaching the service).

`lib/domain/Customer.ts` (54 lines) exports `Customer` with `id: string`,
`name: string`, `postcode: string | null`, `active: boolean`. F-07's
`placeOrder` reads `active`.

`lib/domain/Product.ts` (33 lines) exports `Product` with `id: string`,
`code: string | null`, `name: string`, `boxSize: string | null`. F-07's
`placeOrder` and `editOrder` use only `id` for the product-existence
check.

`lib/domain/index.ts` is the type-only barrel re-export. F-07 imports
`Order`, `CreateOrderInput`, `OrderPatch`, `CreateOrderLineInput`,
`OrderFilter` from `@/lib/domain`.

**Does NOT export `Role`.** Confirmed at `lib/domain/index.ts:10-21`
— the export list is: `Order`, `OrderLine`, `OrderState`, `OrderUom`,
`OrderFilter`, `OrderPatch`, `CreateOrderInput`, `CreateOrderLineInput`,
`Customer`, `Product`. **F-07 has to source `Role` from somewhere else.**
See §1.5 for the locked decision.

### 1.3 — F-06 Fake factories provide a clean test substrate

`lib/adapters/fake/CustomersRepository.ts:26-28`:

```ts
export function createFakeCustomersRepository(
  seed?: readonly Customer[],
): CustomersRepository {
  const store = new Map<string, Customer>();
  for (const c of seed ?? []) store.set(c.id, c);
  return {
    async findCustomerById(id: string): Promise<Customer | null> {
      return store.get(id) ?? null;
    },
  };
}
```

→ F-07's tests pass a seed: `createFakeCustomersRepository([{ id:
CUSTOMER_ID, name: 'Acme', postcode: 'AB1 2CD', active: true }])`.

`lib/adapters/fake/ProductsRepository.ts:22-24`: same shape with a
`seed?: readonly Product[]` parameter. F-07's tests pass a seed:
`createFakeProductsRepository([{ id: PRODUCT_ID, code: 'ALD-30',
name: 'Lamb leg', boxSize: '10 kg' }])`.

`lib/adapters/fake/OrdersRepository.ts:75`: `createFakeOrdersRepository():
OrdersRepository` — **no seed parameter**. F-07's tests bootstrap orders
by calling `repo.createOrder(...)` directly inside the test. This is
identical to the F-06 contract suite's pattern.

The Fake `OrdersRepository.markLineDone` at lines 206-254 already
implements the idempotency-wins-over-state-check semantics F-07 relies
on for `completeLineDone`. The Fake `markOrderCompleted` at lines
256-272 already throws `ConflictError` when the order is not in
state=printed — that's the race the service's `try/catch` swallows.

### 1.4 — Today's route patterns are the rip-out target

**Auth posture today.** All 5 Orders routes read role + userId from
the request — either from cookies (`req.cookies.get('mfs_role')`,
`req.cookies.get('mfs_user_id')`) or from a JSON body (KDS).

- `app/api/orders/route.ts:85-87` — cookie read.
- `app/api/orders/[id]/route.ts:79-80` — cookie read.
- `app/api/orders/[id]/picking-list/route.ts:179-180` — cookie read.
- `app/api/kds/lines/[lineId]/done/route.ts:51-55` — body.butcher_id
  (KDS device has no session cookie; the device passes the butcher id
  in the body).

**F-08 will replace these with `requireRole(req, [...])` from
`lib/auth/session.ts`** (the F-03 helper) — which returns a `Caller`
with `userId` + `role`. The service signature accepts the primitives
the route extracts from the Caller: `caller.role`, `caller.userId`.

**Place-order business logic at `app/api/orders/route.ts:103-190`** —
F-07 absorbs into `placeOrder(input, callerUserId)`:

1. **Customer existence + active check** at lines 105-115:

   ```ts
   const { data: customer, error: custErr } = await supabase
     .from("customers")
     .select("id, active")
     .eq("id", normalised.customer_id)
     .single();
   if (custErr || !customer) {
     return NextResponse.json({ error: "Customer not found" }, { status: 404 });
   }
   if (customer.active === false) {
     return NextResponse.json(
       { error: "Customer is inactive" },
       { status: 400 },
     );
   }
   ```

   → F-07 calls `customers.findCustomerById(input.customerId)` (port
   returns `Customer | null`). If null → `throw new NotFoundError("Customer
not found")`. If `customer.active === false` → `throw new
ConflictError("Customer is inactive")`. **Status code changes from
   400 to 409.** The conductor brief locks this normalisation —
   "Customer is inactive" is a state collision (the customer EXISTS,
   but is in a state that prevents accepting new orders), so the typed-
   error contract maps it to 409, not 400 (which is for malformed
   input). Documented as a route-behaviour difference in §5 Risk #3.

2. **Product verification** at lines 117-134:

   ```ts
   const productIds = normalised.lines
     .map(l => l.product_id)
     .filter((id): id is string => id !== null)
   if (productIds.length > 0) {
     const { data: products, error: prodErr } = await supabase
       .from('products').select('id').in('id', productIds)
     ...
     const foundIds = new Set((products ?? []).map(p => p.id))
     const missing = productIds.filter(id => !foundIds.has(id))
     if (missing.length > 0) {
       return NextResponse.json({ error: `Unknown product_id(s): ${missing.join(', ')}` }, { status: 400 })
     }
   }
   ```

   → F-07 mirrors:

   ```ts
   const productIds = input.lines
     .map((l) => l.productId)
     .filter((id): id is string => id !== null);
   if (productIds.length > 0) {
     const products = await this.products.findProductsByIds(productIds);
     const found = new Set(products.map((p) => p.id));
     const missing = productIds.filter((id) => !found.has(id));
     if (missing.length > 0) {
       throw new ValidationError("Unknown product_id(s)", {
         "lines.products": [missing.join(", ")],
       });
     }
   }
   ```

   Notes:
   - F-07 uses `input.lines` not `normalised.lines` — normalisation is
     a route-layer concern (F-08).
   - F-07 uses `productId` (domain field name) not `product_id`
     (vendor/route field name).
   - `ValidationError` constructor is `(message, fields, options?)` —
     positional, NOT options-bag. Verified at
     `lib/errors/ValidationError.ts:21-30`. The conductor spec says
     `{ fields: { 'lines.products': missing.join(', ') } }` (string
     value); the actual `ValidationError` shape is
     `Record<string, string[]>` so the value must be an array of
     strings. The corrected form: `{ "lines.products":
[missing.join(", ")] }`. **Tension with spec resolved at recon —
     F-07 uses the array form to match the typed-error contract.**
     Documented in §5 Risk #4.

3. **Create order with rollback** at lines 153-183 — the port wraps
   this entirely. F-07 just calls `orders.createOrder(input, callerUserId)`
   and returns the result. No service-layer rollback logic.

**Edit-order business logic at `app/api/orders/[id]/route.ts:90-180`** —
F-07 absorbs into `editOrder(id, patch, lineReplacement, callerRole,
callerUserId)`:

1. **Load order** at lines 94-102:

   ```ts
   const { data: existing, error: loadErr } = await supabase
     .from("orders")
     .select("id, state")
     .eq("id", id)
     .single();
   if (loadErr || !existing) {
     return NextResponse.json({ error: "Order not found" }, { status: 404 });
   }
   ```

   → F-07: `const order = await this.orders.findOrderById(id)` (port
   returns full Order, not just `id, state` — that's fine, the service
   only reads `order.state`). If null → `throw new NotFoundError("Order
not found")`.

2. **State×role gating** at lines 104-113 — three rules:

   ```ts
   if (existing.state === "completed") {
     return NextResponse.json(
       { error: "Order is completed and cannot be edited" },
       { status: 403 },
     );
   }
   if (existing.state === "placed" && !ROLES_EDIT_PLACED.includes(role)) {
     return NextResponse.json(
       { error: "You do not have permission to edit this order" },
       { status: 403 },
     );
   }
   if (existing.state === "printed" && !ROLES_EDIT_PRINTED.includes(role)) {
     return NextResponse.json(
       {
         error:
           "This order is locked. Only office can amend it after printing.",
       },
       { status: 403 },
     );
   }
   ```

   F-07's constants (top of `OrdersService.ts`):

   ```ts
   const ROLES_EDIT_PLACED: readonly Role[] = ["admin", "sales", "office"];
   const ROLES_EDIT_PRINTED: readonly Role[] = ["admin", "office"];
   ```

   F-07's gating:

   ```ts
   if (order.state === "completed") {
     throw new ConflictError("Order is completed and cannot be edited");
   }
   if (order.state === "placed" && !ROLES_EDIT_PLACED.includes(callerRole)) {
     throw new ForbiddenError("You do not have permission to edit this order");
   }
   if (order.state === "printed" && !ROLES_EDIT_PRINTED.includes(callerRole)) {
     throw new ForbiddenError(
       "This order is locked. Only office can amend it after printing.",
     );
   }
   ```
   - State=completed throws `ConflictError` (state collision → 409),
     not `ForbiddenError` (caller-level auth → 403). Today's route
     returns 403; F-07 normalises to 409 per Gate 1. Same rationale
     as the `placeOrder` "Customer is inactive" normalisation. Risk #3.
   - State=placed without permission → `ForbiddenError` (the caller
     EXISTS and is authenticated, but their role doesn't allow this
     action — 403 is correct).
   - State=printed without permission → `ForbiddenError`.

3. **Product verification on line replacement** at lines 133-148 — same
   pattern as `placeOrder`, F-07 inlines a second time (don't share —
   the two call sites read clearer with their own three-line block).

4. **Update + line replacement** at lines 115-175 — port wraps. F-07
   calls `this.orders.updateOrder(id, patch, lineReplacement)` and
   returns.

**Print-order business logic at `app/api/orders/[id]/picking-list/route.ts:179-225`** —
F-07 absorbs into `printOrder(id, callerUserId, when)`. Note: today's
route does TWO things (transitions state + renders HTML); F-07's service
does only the state transition. The HTML rendering stays at the route
layer in F-08 because it's a serialization concern, not business logic.

1. **Load order** at lines 188-191.
2. **State=completed → ConflictError** at lines 195-196:
   ```ts
   if (order.state === "completed") {
     return NextResponse.json(
       { error: "Order is completed — cannot reprint a completed order" },
       { status: 403 },
     );
   }
   ```
   → F-07: `if (order.state === 'completed') throw new
ConflictError("Order is completed — cannot reprint a completed order")`.
   (Same 403→409 normalisation as `editOrder`.)
3. **Record print** at lines 199-222 — port's `recordPrint` wraps both
   first-print and reprint via state-branching. F-07 calls
   `this.orders.recordPrint(id, callerUserId, when)` and returns the
   updated Order.

**Role gating for print is route-layer concern.** Today's route at line
38 reads `const ROLES_PRINT = ['admin', 'office', 'warehouse']` and at
line 181 enforces it via `if (!role || !ROLES_PRINT.includes(role))
return 401`. F-07's `printOrder` does NOT gate on role — the route's
`requireRole` does that BEFORE calling the service. The service trusts
the route to have done auth. This is the standard pattern: routes do
HTTP-level auth, services do domain-state guards.

**Complete-line-done business logic at `app/api/kds/lines/[lineId]/done/route.ts:60-166`** —
F-07 absorbs into `completeLineDone(lineId, doneBy, when)`. The route
also validates the butcher (lines 59-73 — `users.select('id, role,
active').eq('id', butcherId).single()`, role allow-list check, active
check); F-07 does NOT take over butcher validation because there is no
`UsersRepository` port yet (F-13). F-08's route keeps the butcher
validation as-is and passes the validated `butcherId` to
`completeLineDone(lineId, butcherId, when)`.

1. **Mark line done** at lines 118-129 — port wraps idempotency,
   parent-state guard, TOCTOU. F-07 calls `this.orders.markLineDone(lineId,
doneBy, when)` and receives `{ alreadyDone, orderId, allLinesDone }`.

2. **Idempotency short-circuit:**

   ```ts
   if (alreadyDone) return { alreadyDone: true, orderId, completed: false };
   ```

   The route at lines 92-94 returns `{ ok: true, already_done: true }`
   (no `completed` field). F-07's return shape carries `completed`
   uniformly so the caller (F-08 route) has a flat boolean to check.

3. **Auto-complete if all lines done** at lines 154-164:
   ```ts
   if (remainingCount === 0) {
     const { error: completeErr } = await supabase
       .from("orders")
       .update({ state: "completed", completed_at: now })
       .eq("id", orderId)
       .eq("state", "printed");
     if (completeErr) {
       return NextResponse.json({ ok: true, completion_failed: true });
     }
     return NextResponse.json({ ok: true, completed: true });
   }
   ```
   → F-07:
   ```ts
   if (allLinesDone) {
     try {
       await this.orders.markOrderCompleted(orderId, when);
       return { alreadyDone: false, orderId, completed: true };
     } catch (err) {
       if (err instanceof ConflictError) {
         // race: another tap already completed this order. Idempotent.
         return { alreadyDone: false, orderId, completed: true };
       }
       throw err;
     }
   }
   return { alreadyDone: false, orderId, completed: false };
   ```
   The race here is: two butchers tap "done" on the last two lines at
   the same moment; one's `markLineDone` returns `allLinesDone: true`
   and the other's also returns `allLinesDone: true` (because both
   read `count: 0` after marking their own line); both call
   `markOrderCompleted`; one wins (state goes printed→completed), the
   other's optimistic lock `.eq('state', 'printed')` fails because the
   state is now `completed`, the port throws ConflictError. F-07
   swallows that ConflictError because the order IS effectively
   completed — the second tap should return `completed: true` to the
   route, not a 409. The route returns 200 to the KDS device either
   way; the device displays "done."

**Note on the route's `completion_failed: true` fallback** (line 162-163):
the route swallows ANY error from the auto-complete update. F-07
swallows only `ConflictError`. If `markOrderCompleted` throws
`ServiceError` (DB down, network blip, etc.), F-07 lets it propagate
— the route's HOF turns it into a 500. This is a deliberate tightening:
the route's `completion_failed: true` was a debugging convenience but
it masked legitimate errors. F-07 surfaces them. Documented in §5 Risk #5.

### 1.5 — `Role` lives in observability, not in domain. Locked decision: type-only import from `@/lib/observability`.

The conductor brief asked: "confirm whether `Role` is re-exported [from
`@/lib/domain`]. If not, propose handling."

**Confirmed: `Role` is NOT exported from `@/lib/domain`.** Verified at
`lib/domain/index.ts:10-21` (the export list does not include `Role`).
`Role` is defined at `lib/observability/Caller.ts:26-32` and re-exported
from `lib/observability/index.ts:10`.

Three options were considered:

- **(A) Type-only import from `@/lib/observability` (CHOSEN).**

  ```ts
  import type { Role } from "@/lib/observability";
  ```

  This is the option the F-06 cert's "production-path importers" grep
  treats as acceptable: a `type Role` import is erased at compile time;
  no runtime dependency on observability is created. The service file
  does NOT import `Caller`, `makeCaller`, or `log` — those are runtime
  observability surfaces and would be a real coupling.

- **(B) Re-export `Role` from `@/lib/domain` in F-07.** Add `export
type { Role } from "@/lib/observability/Caller"` to
  `lib/domain/index.ts`. This puts `Role` in the right architectural
  place (domain) before F-13 retires the observability-side definition.
  **REJECTED** for scope discipline — F-07's brief explicitly says NO
  edits to F-05 files (`lib/domain/index.ts` is F-05's). The forward
  plan in `lib/observability/Caller.ts:11-16` already says F-13 will
  move `Role` to `lib/domain/Role.ts`; doing it pre-emptively in F-07
  is a scope creep and forces a `lib/domain/index.ts` edit that breaks
  the "do not edit F-05" rule.

- **(C) Accept the spec's allowance for "temporary observability
  coupling and document".** Same as (A) in practice — the only
  observability surface the service touches is the `Role` TYPE
  (erased), and the header comment documents the F-13 forward
  deprecation.

**Chosen: (A).** F-07's service file header comment documents the
F-13 forward plan: "When F-13 (Users + Auth) lands and moves `Role`
to `lib/domain/Role.ts`, this import becomes `import type { Role }
from '@/lib/domain'` — one line change, no behavioural impact."

**The hexagonal posture is preserved.** Type-only imports across
package boundaries do not count as runtime coupling under TypeScript's
`isolatedModules` mode (which Next.js + tsc compile under for this
project). The service file's compiled JavaScript will have ZERO
references to `@/lib/observability`. Confirmed acceptable at recon —
no ADR amendment needed.

**Lint check.** No ESLint rule on this repo restricts cross-package
type imports. The `no-restricted-imports` rule is path-scoped to
`@supabase/supabase-js`. The `eslint-plugin-import` rules (if any)
allow type-only imports anywhere by default. No lint violation
expected; verified by re-reading `.eslintrc.json`.

### 1.6 — Lint posture: no edit needed

`.eslintrc.json:4-22` forbids `@supabase/supabase-js` outside
`lib/supabase.ts`, `lib/adapters/supabase/**/*.ts`, and `tests/**`.
F-07's new files are at `lib/services/OrdersService.ts`,
`lib/services/index.ts`, and `tests/unit/services/OrdersService.test.ts`.

- `lib/services/OrdersService.ts` — does NOT import
  `@supabase/supabase-js`. The rule does not fire. **No lint edit
  needed.**
- `lib/services/index.ts` — does NOT import
  `@supabase/supabase-js`. The rule does not fire.
- `tests/unit/services/OrdersService.test.ts` — matches the
  `tests/**` allow-list override. Even if it tried to import Supabase
  (it does not), the rule would allow it.

**Lint risk closed at recon.** Documented in §5 (no risk surfaced —
this is a non-issue).

### 1.7 — Test-substrate readiness: F-06 Fakes work as drop-in

The F-06 cert (`docs/anvil/2026-06-09-f-06-cert.md`) confirms 43
contract cases pass against both Supabase and Fake adapters. The Fake
adapters are therefore a verified substrate for F-07's service tests.

F-07's tests will:

1. Construct fresh Fake adapters per test (via `beforeEach`).
2. Optionally seed the Fake Customers and Fake Products with deterministic
   IDs (the Fake Orders adapter does not take a seed — orders are
   bootstrapped by calling `service.placeOrder(...)` inside the test).
3. Construct the service: `const service = createOrdersService({ orders:
fakeOrders, customers: fakeCustomers, products: fakeProducts })`.
4. Exercise the service method under test and assert on the return value
   and/or thrown error type.

No `vi.mock`, no Supabase test client, no DB. The Fake adapters are
sufficient because:

- The Fake `OrdersRepository.createOrder` is atomic and returns a full
  Order (matching the port contract).
- The Fake `OrdersRepository.findOrderById` returns Order or null
  (matching contract).
- The Fake `OrdersRepository.updateOrder` applies the patch and
  optional line replacement (matching contract).
- The Fake `OrdersRepository.recordPrint` transitions placed→printed
  and bumps printedAt on reprint, throws ConflictError on completed
  (matching contract).
- The Fake `OrdersRepository.markLineDone` implements idempotency-
  wins-over-state-check (per `lib/adapters/fake/OrdersRepository.ts:221-230`)
  and the all-lines-done count (matching contract).
- The Fake `OrdersRepository.markOrderCompleted` throws ConflictError
  if the order is not in state=printed (per
  `lib/adapters/fake/OrdersRepository.ts:259-263`) — exactly the race
  F-07's `completeLineDone` swallows.
- The Fake `CustomersRepository.findCustomerById` returns from a
  seedable Map.
- The Fake `ProductsRepository.findProductsByIds` filters from a
  seedable Map and returns only matched rows (the empty-array on
  no-match semantics matches the port contract).

**No new test scaffolding needed.** Confirmed at recon §1.7.

### 1.8 — Service surface vs route surface: confirmed mismatch on a couple of fields

The route returns shape and the service return shape MUST differ in some
cases because the service signature is a clean domain shape:

- **`placeOrder`** returns the full persisted `Order`. The route today
  returns `{ id, reference }` only. F-08's route will read `order.id`
  - `order.reference` from the service's return and serialize that to
    the existing client contract.
- **`editOrder`** returns the full updated `Order`. The route today
  returns `{ ok: true }`. F-08's route can either keep `{ ok: true }`
  or upgrade to returning the full updated Order (a behavioural choice
  for F-08, not F-07).
- **`printOrder`** returns the full updated `Order`. The route today
  returns RENDERED HTML (the picking list). F-08's route will call
  `printOrder` to do the state transition, then call the existing
  `renderPickingListHtml(toPickingListData(order, printerName))`
  helper (which lives outside F-07's scope) to produce the HTML.
- **`completeLineDone`** returns `{ alreadyDone, orderId, completed }`.
  The route today returns `{ ok: true, already_done?, completed?,
completion_failed? }`. F-08's route will map: `completed ?? false`
  to `completed: true` (if true) and drop `completion_failed` (the
  route was masking the auto-complete failure mode — F-07 surfaces it
  via the thrown ServiceError; F-08 either propagates it as 500 or
  catches and degrades; that's F-08's call).

**Pass-throughs (`listOrders`, `findOrderById`, `listKdsQueue`)**
return what the port returns — no shape mismatch.

**Documented in §5 Risk #5 (the `completion_failed` route-behaviour
narrowing) — Hakan should be aware F-08's `completeLineDone` route will
behave slightly differently than today's, surfacing legitimate errors
the old route swallowed.**

### 1.9 — Production-path importers must remain at zero after F-07

F-05's plan §4 layer 11 introduced the grep
`grep -rn "from ['\"]@/lib/ports\|from ['\"]@/lib/domain" app/
lib/services lib/usecases 2>/dev/null` to confirm zero production-path
imports.

F-06's plan extended this to `grep -rn "from ['\"]@/lib/adapters" app/
lib/services lib/usecases 2>/dev/null` — also zero.

F-07 extends to a THIRD grep:

```
grep -rn "from ['\"]@/lib/services" app/ 2>/dev/null
```

This MUST return zero after F-07's PR is merged. The 5 Orders routes
still call `supabaseService` directly — they do NOT import
`OrdersService`. F-08 flips this. The grep is the production-path
guard.

F-07's OWN tests are not production paths (`tests/**`) and DO import
`@/lib/services` — but the grep above excludes `tests/`. The grep
target is the deployable `app/` tree.

### 1.10 — Validation layer is NOT in F-07 scope

Today's POST `/api/orders` calls `validateCreateOrderRequest(body)` at
`app/api/orders/route.ts:96` before reaching the business logic F-07
absorbs. Today's PUT `/api/orders/[id]` calls
`validateUpdateOrderRequest(body)` at line 87.

F-07's service does NOT call validation. The route is responsible for
validation BEFORE constructing the `CreateOrderInput` / `OrderPatch`
that gets passed to the service. F-08 will switch this from
`lib/orders/validation.ts` (ad-hoc) to zod (per the F-08 plan), but
F-07 does not pre-fit for that — the service accepts already-validated
domain shapes and TRUSTS them.

**However:** F-07 DOES surface ValidationError for the
unknown-product-id case in `placeOrder` and `editOrder`. This is a
business-rule validation (the products listed must exist in the
catalogue), which is distinct from schema validation (the input has
the right shape). Business-rule validation runs at the service layer
because it requires a port call to verify. Schema validation runs at
the route layer.

**Documented in §2.1.** The service's ValidationError surface is for
business rules only; schema validation stays at the route layer.

### 1.11 — Recent git history confirms the unit ordering is on track

```
3d56b85 feat(adapters): Orders Lego adapters + contract tests (F-06) (#23)
1de0fdc feat(ports): Orders domain ports + types (F-05) (#22)
345d654 feat(lint): activate ADR-0003 Supabase SDK FREEZE (F-04) (#21)
bb5180e feat(auth): requireRole helper + UnauthorizedError + ForbiddenError (F-03) (#20)
c257101 refactor(road-times): consolidate onto supabaseService (F-01 narrowed) (#19)
9c25a37 feat(testing): local Supabase stack + Playwright API/UI scaffolding (F-INFRA-01) (#18)
0f92122 feat(observability): Caller context + correlation IDs + structured log (F-FND-03) (#17)
631209d docs(roadmap): add Phase 0b (test infra) + tech debt cleanup track (v1.2)
```

F-07 follows F-06 in the strangler-fig sequence. F-08 follows F-07.

### 1.12 — `lib/services/` does not exist on main

Verified at recon: `ls lib/services` returns "No such file or
directory". F-07's first commit creates the directory implicitly via
adding `lib/services/OrdersService.ts` and `lib/services/index.ts`.

Verified similarly: `tests/unit/services/` does not exist. F-07's
test commit creates it implicitly.

---

## 2. Files to add (the file inventory)

3 new files. No file is edited.

### 2.0 — Directory structure created

```
lib/services/
  OrdersService.ts
  index.ts

tests/unit/services/
  OrdersService.test.ts
```

`lib/services/` does NOT exist on main; F-07 creates it.
`tests/unit/services/` does NOT exist on main; F-07 creates it.

### 2.1 — `lib/services/OrdersService.ts` — the worked example for services

**Header (~50 lines)** — file purpose, ADR references, the
"services don't import services" rule, the type-only `Role` import
forward path, the per-method error contract.

```ts
/**
 * lib/services/OrdersService.ts
 *
 * The Orders service. The first service file in the codebase, and the
 * worked example for every future service (UsersService, RoutesService,
 * PricingService, CashService, ComplaintsService, VisitsService,
 * HACCPService, AdminService).
 *
 * What this file is.
 *   - The orchestration layer between F-08's Orders routes and F-06's
 *     three Orders-domain adapters (Orders, Customers, Products). It
 *     composes those adapters via the F-05 ports — never via the
 *     adapters directly, never via other services.
 *   - The home of business decisions that span more than one port call:
 *     "is the customer active?", "are all the products in the catalogue?",
 *     "is this role allowed to edit this order in this state?", "did
 *     this tap auto-complete the order, and if a race lost, swallow
 *     the conflict".
 *   - The single layer the F-08 route handlers will call. Routes do
 *     auth + schema validation; services do business orchestration.
 *
 * Hexagonal posture (ADR-0002).
 *   - Line 19 — "Services live in `lib/services/`." Yes.
 *   - Line 23 — "Services do not import other services directly."
 *     This service composes THREE PORT INTERFACES:
 *       OrdersRepository (8 methods)
 *       CustomersRepository (1 method)
 *       ProductsRepository (1 method)
 *     It does NOT import any *Service file. When UsersService /
 *     CustomersService / ProductsService exist in future units, this
 *     service still talks to their PORTS, not their services. This
 *     keeps the service graph acyclic and the dependency direction
 *     inward-pointing.
 *   - Line 25 (depth rule) — business methods (placeOrder, editOrder,
 *     printOrder, completeLineDone) each hide 2+ port calls plus a
 *     business decision. Pass-throughs (listOrders, findOrderById,
 *     listKdsQueue) are explicit thin delegates; they exist so the
 *     F-08 route layer has a single point of contact for Orders.
 *   - Line 27 — only domain types cross the function boundary; the
 *     service receives only domain types from ports and returns only
 *     domain types to callers.
 *   - Line 43 (APOSD) — "pull complexity downward" (§10): the
 *     business orchestration that today is inline in each Orders route
 *     lives here in F-07 so F-08 routes can be ~30 lines each.
 *     "Define errors out of existence" (§11): pass-throughs return
 *     null/empty on miss; only WRITE methods that need the row throw
 *     NotFoundError on miss. "Information hiding" (§4): the
 *     state×role gating constants are module-local; the
 *     extract-product-ids + missing-products computation is inlined
 *     at the two call sites.
 *
 * Construction (hybrid factory + singleton, matching F-06's
 * `createSupabase…Repository` pattern).
 *   - `createOrdersService(repos)` factory — tests pass Fake repos
 *     for unit testing; alternative production wirings (e.g. a
 *     per-request authenticated client under F-RLS-03) pass adapters
 *     constructed against that client.
 *   - `ordersService` singleton — pre-wired against the default
 *     Supabase adapters from `@/lib/adapters/supabase`. F-08 routes
 *     import this. App code never imports `createOrdersService`
 *     directly outside tests.
 *
 * Auth posture (Gate 1 locked).
 *   - Service methods take primitives: `callerRole: Role` and
 *     `callerUserId: string`. Never `Caller`. Never `request`. Never
 *     a cookie / header read.
 *   - The route layer (F-08) does `requireRole(req, [allowed])` from
 *     `@/lib/auth/session`, gets back a `Caller`, then passes
 *     `caller.role!` and `caller.userId!` to the service. The `!`
 *     non-null assertion is the route's responsibility — `requireRole`
 *     throws `UnauthorizedError` if either is missing, so by the time
 *     the service is called both are populated.
 *   - Why primitives, not `Caller`. The `Caller` is a request-scoped
 *     identity + correlation bundle. It belongs at the framework /
 *     observability boundary, not at the service. Coupling
 *     OrdersService to `Caller` would mean every test has to
 *     construct a `Caller`, every future cron / worker entry point
 *     has to construct a `Caller`, and the service's signature
 *     bleeds with F-FND-03's observability shape. Primitives are
 *     simpler and have the same expressive power.
 *
 * `Role` import forward path (F-13).
 *   - Today: `import type { Role } from '@/lib/observability'`. The
 *     `Role` union currently lives at `lib/observability/Caller.ts:26-32`
 *     because that file's docstring (lines 11-16) records that "When
 *     the Users + Auth migration lands (F-13), this canonical type
 *     moves to a domain module (`lib/domain/Role.ts`)."
 *   - F-13: this import becomes `import type { Role } from '@/lib/domain'`.
 *     One line change, no behavioural impact. The TYPE-ONLY import
 *     today is erased at compile time, so the service file's compiled
 *     JavaScript has zero references to `@/lib/observability` —
 *     no runtime coupling to break.
 *
 * Error contract per method (cited verbatim from F-05's port JSDoc
 * + the locked Gate 1 spec).
 *   listOrders       → ServiceError only (propagated from port)
 *   findOrderById    → ServiceError only (returns null on miss)
 *   listKdsQueue     → ServiceError only (propagated from port)
 *   placeOrder       → NotFoundError | ConflictError | ValidationError | ServiceError
 *   editOrder        → NotFoundError | ConflictError | ForbiddenError | ValidationError | ServiceError
 *   printOrder       → NotFoundError | ConflictError | ServiceError
 *   completeLineDone → NotFoundError | ConflictError | ServiceError
 *                      (`markOrderCompleted` ConflictError swallowed for race-safety)
 *
 * Scope discipline.
 *   - Schema validation (input shape) stays at the route layer (F-08).
 *     The service trusts that `CreateOrderInput` / `OrderPatch` are
 *     well-formed.
 *   - The service surfaces VALIDATION errors only for business-rule
 *     validation (unknown product IDs). Routes surface validation
 *     errors for shape/type/missing-field issues.
 *   - Logging stays at the adapter layer (F-06). The service throws
 *     typed errors; no `log.warn` / `log.error` here.
 *   - Picking-list HTML rendering stays at the route layer (F-08).
 *     `printOrder` does only the state transition.
 *   - `SET LOCAL app.current_user_id` audit wiring stays deferred (per
 *     F-06's documented deferral). The `callerUserId` reaches
 *     `orders.created_by` / `orders.printed_by` / `order_lines.done_by`
 *     directly; the audit log still gets NULL user_id until F-13 or
 *     F-19 revisits.
 */
```

**Imports (clean allow-list).**

```ts
import type { Role } from "@/lib/observability";
import {
  NotFoundError,
  ConflictError,
  ForbiddenError,
  ValidationError,
} from "@/lib/errors";
import type {
  Order,
  OrderFilter,
  OrderPatch,
  CreateOrderInput,
  CreateOrderLineInput,
} from "@/lib/domain";
import type {
  OrdersRepository,
  CustomersRepository,
  ProductsRepository,
  KdsOrderQueueSnapshot,
} from "@/lib/ports";
import {
  supabaseOrdersRepository,
  supabaseCustomersRepository,
  supabaseProductsRepository,
} from "@/lib/adapters/supabase";
```

**Allow-list audit (matches header's hexagonal posture):**

- `@/lib/observability` — type-only `Role`. Erased at compile time;
  no runtime coupling. F-13 will move this to `@/lib/domain`.
- `@/lib/errors` — value imports for the typed errors the service
  throws. ServiceError is not imported because the service never throws
  it itself; ServiceError flows through from port adapters.
- `@/lib/domain` — type-only imports for all input/output shapes.
- `@/lib/ports` — type-only imports for the three port interfaces and
  `KdsOrderQueueSnapshot` (used as return type of `listKdsQueue`).
- `@/lib/adapters/supabase` — VALUE imports of the three default
  singletons, used ONLY in the default singleton body. The factory
  function does NOT touch these.

**What the imports allow-list FORBIDS** (and the §4 lint discipline
catches):

- `@supabase/supabase-js` — never. The service has zero awareness of
  the vendor SDK.
- `@/lib/supabase` — never. The default singleton wires
  `supabaseOrdersRepository` etc., which are already pre-wired against
  `supabaseService`.
- `@/lib/observability/log` — never. Logging stays at the adapter.
- `@/lib/observability/Caller` — never directly; only the re-exported
  `Role` type, via the barrel.
- `@/lib/observability/context` (`getCaller`, `runWithCaller`) —
  never. Services do not read from `Caller` context.
- `@/lib/auth/*` — never. Auth is a route concern.
- Any other `@/lib/services/*` file — never. ADR-0002 line 23.
- `next/*` — never. Services are framework-agnostic.

**State×role gating constants (module scope, top of file).**

```ts
/**
 * Roles permitted to EDIT an order while it is still in state='placed'.
 * Matches `app/api/orders/[id]/route.ts:31` verbatim — sales reps can
 * still edit unprinted orders. Office and admin always can.
 */
const ROLES_EDIT_PLACED: readonly Role[] = ["admin", "sales", "office"];

/**
 * Roles permitted to EDIT an order while it is in state='printed'.
 * Matches `app/api/orders/[id]/route.ts:32` verbatim — sales reps
 * are locked out after print; only office and admin can amend a
 * printed order. The picking list is already on the shop floor at
 * this point and the warehouse needs a single source of truth.
 */
const ROLES_EDIT_PRINTED: readonly Role[] = ["admin", "office"];
```

**The `OrdersServiceRepos` shape.**

```ts
/**
 * Repository bundle accepted by `createOrdersService`. The factory takes
 * the three ports as a single object so the call site is named:
 *
 *   createOrdersService({ orders, customers, products })
 *
 * vs positional arguments (`createOrdersService(orders, customers,
 * products)`), which would invite swap bugs when a fourth port joins
 * (none are planned, but the named-object shape is the safer default).
 */
export interface OrdersServiceRepos {
  readonly orders: OrdersRepository;
  readonly customers: CustomersRepository;
  readonly products: ProductsRepository;
}
```

**The `OrdersService` interface.**

```ts
export interface OrdersService {
  // ─── Pass-throughs ───────────────────────────────────────────

  /**
   * Read a filtered list of orders. Pass-through to `OrdersRepository.listOrders`.
   * The route layer (F-08 GET /api/orders) translates query params into
   * the filter object and forwards.
   *
   * Throws: ServiceError (propagated from port).
   */
  listOrders(filter: OrderFilter): Promise<readonly Order[]>;

  /**
   * Read a single order by id. Pass-through. Returns null on miss
   * (APOSD §11 — define errors out of existence).
   *
   * The route layer (F-08 GET /api/orders/[id]) wraps null → 404.
   * The service does NOT throw NotFoundError here because most callers
   * (GET endpoints) handle not-found as normal control flow.
   *
   * Throws: ServiceError (propagated from port).
   */
  findOrderById(id: string): Promise<Order | null>;

  /**
   * Read the live KDS queue snapshot. Pass-through.
   *
   * The route layer (F-08 GET /api/kds/orders) supplies the `since`
   * cutoff (today's route uses `now - 90s` for the completed-orders
   * window). The flash window is fixed at 60s inside the port.
   *
   * Throws: ServiceError (propagated from port).
   */
  listKdsQueue(since: Date): Promise<KdsOrderQueueSnapshot>;

  // ─── Business orchestration ──────────────────────────────────

  /**
   * Create a new order on behalf of `callerUserId`. Verifies the
   * customer exists + is active, verifies every catalogued product
   * exists, then persists the order with its lines atomically.
   *
   * Orchestration:
   *   1. customers.findCustomerById(input.customerId).
   *      - null → NotFoundError("Customer not found").
   *   2. If customer.active === false → ConflictError("Customer is inactive").
   *      Today's route returns 400; F-07 normalises to 409 (the
   *      customer exists, the state collides with creating a new order).
   *   3. Extract non-null productIds from input.lines.
   *      If non-empty:
   *        products.findProductsByIds(productIds).
   *        Compute missing = requested - returned.
   *        If missing.length > 0 → ValidationError("Unknown product_id(s)",
   *          { "lines.products": [missing.join(", ")] }).
   *   4. orders.createOrder(input, callerUserId). The port handles the
   *      atomic two-step insert + rollback. Returns the persisted Order.
   *
   * Throws: NotFoundError | ConflictError | ValidationError | ServiceError.
   */
  placeOrder(input: CreateOrderInput, callerUserId: string): Promise<Order>;

  /**
   * Edit an existing order. Patches the orders row (delivery date /
   * notes / order notes) and optionally replaces all lines. Enforces
   * the state×role rules that govern who may edit at each state.
   *
   * Orchestration:
   *   1. orders.findOrderById(id).
   *      - null → NotFoundError("Order not found").
   *   2. State×role gating (matches `app/api/orders/[id]/route.ts:104-113`):
   *      - state === 'completed' → ConflictError (order is finalised;
   *        a state collision, not a permission failure).
   *      - state === 'placed' AND callerRole NOT IN ROLES_EDIT_PLACED →
   *        ForbiddenError.
   *      - state === 'printed' AND callerRole NOT IN ROLES_EDIT_PRINTED →
   *        ForbiddenError.
   *   3. If lineReplacement provided: extract productIds, verify, throw
   *      ValidationError on missing — same pattern as placeOrder step 3.
   *   4. orders.updateOrder(id, patch, lineReplacement). Returns the
   *      updated Order.
   *
   * Note: `callerUserId` is currently unused by the service body — the
   * port's updateOrder does not record who edited an order (only the
   * audit log does). The parameter is on the signature for forward
   * compatibility (F-13 / F-19 may persist an `edited_by` per audit
   * row) and for symmetry with the other write methods.
   *
   * Throws: NotFoundError | ConflictError | ForbiddenError | ValidationError | ServiceError.
   */
  editOrder(
    id: string,
    patch: OrderPatch,
    lineReplacement: readonly CreateOrderLineInput[] | undefined,
    callerRole: Role,
    callerUserId: string,
  ): Promise<Order>;

  /**
   * Record a picking-list print event. Handles both first-print
   * (placed → printed) and reprint (printed → printed). Throws if
   * the order is completed (cannot reprint a completed order).
   *
   * Orchestration:
   *   1. orders.findOrderById(id).
   *      - null → NotFoundError("Order not found").
   *   2. state === 'completed' → ConflictError("Order is completed —
   *      cannot reprint a completed order"). Today's route returns 403;
   *      F-07 normalises to 409 (state collision).
   *   3. orders.recordPrint(id, callerUserId, when). The port wraps
   *      both first-print and reprint via state-branching. Returns
   *      the updated Order.
   *
   * Role gating (admin / office / warehouse only) is NOT done here —
   * it is the route's responsibility (F-08 calls
   * `requireRole(req, ['admin', 'office', 'warehouse'])` BEFORE
   * calling `printOrder`).
   *
   * `when` is the print timestamp. F-08 routes use `new Date()` at
   * the request boundary. Tests use a fixed Date for determinism.
   *
   * Throws: NotFoundError | ConflictError | ServiceError.
   */
  printOrder(id: string, callerUserId: string, when: Date): Promise<Order>;

  /**
   * Mark a single order line as done. If this tap clears the last
   * un-done line, transitions the parent order to 'completed'
   * (race-safe).
   *
   * Orchestration:
   *   1. orders.markLineDone(lineId, doneBy, when). The port handles:
   *      - line-existence check (throws NotFoundError on miss).
   *      - idempotency (returns { alreadyDone: true } if the line is
   *        already done; the parent-state guard does NOT run in the
   *        idempotent path, by design — matches the locked spec).
   *      - parent-state guard (throws ConflictError if parent state is
   *        placed or completed, in the non-idempotent path).
   *      - TOCTOU guard (.is('done_at', null) on the UPDATE).
   *      - count of remaining un-done lines, exposed as allLinesDone.
   *   2. If alreadyDone → return { alreadyDone: true, orderId,
   *      completed: false }. (The route returns 200 to the KDS device;
   *      the device displays "done".)
   *   3. If allLinesDone:
   *      try {
   *        orders.markOrderCompleted(orderId, when).
   *      } catch (err) {
   *        if (err instanceof ConflictError) {
   *          // race: another tap completed it first. Idempotent.
   *          // Return completed: true regardless.
   *        } else { throw err }
   *      }
   *      return { alreadyDone: false, orderId, completed: true }.
   *   4. Else return { alreadyDone: false, orderId, completed: false }.
   *
   * The race swallow in step 3 is the only ConflictError the service
   * catches. Every other ConflictError (from markLineDone) flows
   * through as-is. The race here is benign: two butchers tap the last
   * two lines at the same moment; both `markLineDone` return
   * allLinesDone=true; both call markOrderCompleted; the second one's
   * `.eq('state', 'printed')` optimistic lock fails because state is
   * now 'completed'; the port throws ConflictError. The order IS
   * effectively completed — telling the second caller "no it isn't"
   * would be wrong. So we swallow.
   *
   * What we do NOT swallow:
   *   - NotFoundError from `markOrderCompleted`. If the order was
   *     deleted between markLineDone and markOrderCompleted, that's
   *     a real bug; propagate.
   *   - ServiceError from `markOrderCompleted`. If the auto-complete
   *     update failed due to a DB error, the order is in an
   *     inconsistent state (lines all done, state still 'printed').
   *     Today's route swallowed this as `completion_failed: true`;
   *     F-07 surfaces the ServiceError so F-08's HOF turns it into
   *     a 500 the operator can investigate. Documented in §5 Risk #5.
   *
   * Throws: NotFoundError | ConflictError | ServiceError.
   */
  completeLineDone(
    lineId: string,
    doneBy: string,
    when: Date,
  ): Promise<{
    readonly alreadyDone: boolean;
    readonly orderId: string;
    readonly completed: boolean;
  }>;
}
```

**The factory function (~110 lines for all 7 method bodies).**

```ts
export function createOrdersService(repos: OrdersServiceRepos): OrdersService {
  const { orders, customers, products } = repos;

  return {
    // ─── Pass-throughs ─────────────────────────────────────────

    listOrders: (filter) => orders.listOrders(filter),
    findOrderById: (id) => orders.findOrderById(id),
    listKdsQueue: (since) => orders.listKdsQueue(since),

    // ─── placeOrder ────────────────────────────────────────────

    async placeOrder(input, callerUserId) {
      const customer = await customers.findCustomerById(input.customerId);
      if (customer === null) {
        throw new NotFoundError("Customer not found");
      }
      if (customer.active === false) {
        throw new ConflictError("Customer is inactive");
      }

      const productIds = input.lines
        .map((l) => l.productId)
        .filter((id): id is string => id !== null);
      if (productIds.length > 0) {
        const found = await products.findProductsByIds(productIds);
        const foundSet = new Set(found.map((p) => p.id));
        const missing = productIds.filter((id) => !foundSet.has(id));
        if (missing.length > 0) {
          throw new ValidationError("Unknown product_id(s)", {
            "lines.products": [missing.join(", ")],
          });
        }
      }

      return orders.createOrder(input, callerUserId);
    },

    // ─── editOrder ─────────────────────────────────────────────

    async editOrder(id, patch, lineReplacement, callerRole, _callerUserId) {
      const order = await orders.findOrderById(id);
      if (order === null) {
        throw new NotFoundError("Order not found");
      }

      if (order.state === "completed") {
        throw new ConflictError("Order is completed and cannot be edited");
      }
      if (order.state === "placed" && !ROLES_EDIT_PLACED.includes(callerRole)) {
        throw new ForbiddenError(
          "You do not have permission to edit this order",
        );
      }
      if (
        order.state === "printed" &&
        !ROLES_EDIT_PRINTED.includes(callerRole)
      ) {
        throw new ForbiddenError(
          "This order is locked. Only office can amend it after printing.",
        );
      }

      if (lineReplacement !== undefined) {
        const productIds = lineReplacement
          .map((l) => l.productId)
          .filter((id): id is string => id !== null);
        if (productIds.length > 0) {
          const found = await products.findProductsByIds(productIds);
          const foundSet = new Set(found.map((p) => p.id));
          const missing = productIds.filter((id) => !foundSet.has(id));
          if (missing.length > 0) {
            throw new ValidationError("Unknown product_id(s)", {
              "lines.products": [missing.join(", ")],
            });
          }
        }
      }

      return orders.updateOrder(id, patch, lineReplacement);
    },

    // ─── printOrder ────────────────────────────────────────────

    async printOrder(id, callerUserId, when) {
      const order = await orders.findOrderById(id);
      if (order === null) {
        throw new NotFoundError("Order not found");
      }
      if (order.state === "completed") {
        throw new ConflictError(
          "Order is completed — cannot reprint a completed order",
        );
      }
      return orders.recordPrint(id, callerUserId, when);
    },

    // ─── completeLineDone ──────────────────────────────────────

    async completeLineDone(lineId, doneBy, when) {
      const result = await orders.markLineDone(lineId, doneBy, when);
      if (result.alreadyDone) {
        return {
          alreadyDone: true,
          orderId: result.orderId,
          completed: false,
        };
      }
      if (result.allLinesDone) {
        try {
          await orders.markOrderCompleted(result.orderId, when);
        } catch (err) {
          if (err instanceof ConflictError) {
            // Race: another concurrent tap completed the order between
            // our markLineDone and our markOrderCompleted. The order
            // IS completed; report it as such.
          } else {
            throw err;
          }
        }
        return {
          alreadyDone: false,
          orderId: result.orderId,
          completed: true,
        };
      }
      return {
        alreadyDone: false,
        orderId: result.orderId,
        completed: false,
      };
    },
  };
}
```

**Note on the `_callerUserId` underscore prefix in `editOrder`:** TypeScript

- Vitest do not warn about unused parameters in object methods, but
  the underscore prefix is a convention the codebase uses (see e.g.
  `lib/auth/session.ts`) to signal "intentionally unused, kept for
  signature compatibility." F-13 / F-19 may put it to use; the
  signature stays stable.

**The default singleton.**

```ts
/**
 * Default singleton wired against the production Supabase adapters
 * (which themselves wrap `supabaseService` from `@/lib/supabase`).
 * F-08 routes import this. Tests construct their own service via
 * `createOrdersService({ orders, customers, products })` with Fake
 * adapters.
 */
export const ordersService: OrdersService = createOrdersService({
  orders: supabaseOrdersRepository,
  customers: supabaseCustomersRepository,
  products: supabaseProductsRepository,
});
```

### 2.2 — `lib/services/index.ts` — barrel re-export

```ts
/**
 * lib/services/index.ts
 *
 * Barrel re-export for the services package. Import surface:
 *   import { ordersService, createOrdersService, type OrdersService }
 *     from '@/lib/services'
 *
 * Both the factory and the pre-wired singleton are exported. F-08
 * routes import the singleton. Tests import the factory.
 *
 * This file mirrors `lib/adapters/supabase/index.ts` and
 * `lib/adapters/fake/index.ts` for symmetry — services have the same
 * "factory + singleton" surface that adapters do (one place the
 * default wiring lives, easy to override in tests / future
 * per-request scenarios).
 */
export {
  createOrdersService,
  ordersService,
  type OrdersService,
  type OrdersServiceRepos,
} from "./OrdersService";
```

The `type OrdersService` re-export is important — F-08 routes need it
to declare typed locals; future services may need it to compose (e.g.
if a future Compliance use-case takes an `OrdersService` parameter,
the type lives here).

### 2.3 — `tests/unit/services/OrdersService.test.ts` — the worked example for service tests

**Header (~30 lines)** — purpose, the F-06 Fake substrate, the
"no DB, no HTTP, no vendor SDK" purity, the per-method coverage breakdown.

```ts
/**
 * tests/unit/services/OrdersService.test.ts
 *
 * F-07 — unit tests for OrdersService composed against the F-06 Fake
 * adapters. No DB. No HTTP. No Supabase SDK. Pure-JS Maps under the
 * hood; the adapters land in <2ms per test.
 *
 * Coverage shape (~28 cases):
 *   - placeOrder: 6 cases (customer not found, customer inactive,
 *     products missing 1, products missing many, happy with all
 *     catalogued lines, happy with all ad-hoc lines)
 *   - editOrder: 6 cases (order not found, state=completed, sales
 *     forbidden on printed, sales allowed on placed, office allowed
 *     on printed, products missing on lineReplacement)
 *   - printOrder: 4 cases (order not found, state=completed conflict,
 *     placed→printed happy, reprint on printed)
 *   - completeLineDone: 5 cases (line not found, idempotency, middle
 *     line no-cascade, last line cascade, race swallow)
 *   - Pass-throughs: 3 cases (listOrders, findOrderById null,
 *     listKdsQueue)
 *   - Architecture pin: 4 cases (service composes ports not services
 *     — proven by the fact that the test imports only port factories;
 *     instanceof checks on each thrown error type; pass-through
 *     wiring; default singleton type identity)
 *
 * Construction pattern (template for all future *Service unit tests):
 *
 *   import { createOrdersService } from '@/lib/services'
 *   import {
 *     createFakeOrdersRepository,
 *     createFakeCustomersRepository,
 *     createFakeProductsRepository,
 *   } from '@/lib/adapters/fake'
 *
 *   const make = (opts) => {
 *     const customers = createFakeCustomersRepository(opts.customers ?? [])
 *     const products  = createFakeProductsRepository(opts.products ?? [])
 *     const orders    = createFakeOrdersRepository()
 *     const service   = createOrdersService({ orders, customers, products })
 *     return { service, orders, customers, products }
 *   }
 *
 * Each test gets a fresh trio via `make()` so cases are independent.
 * No beforeEach reset needed (the factories are pure constructors).
 *
 * Determinism:
 *   - `when` arguments are fixed Date instances: `const T = new Date('2026-06-09T10:00:00Z')`.
 *   - Customer / product IDs are stable UUIDs as strings.
 *   - The Fake's reference generator increments inside the factory's
 *     closure, so the first order from a fresh adapter is FAKE-2026-0001;
 *     tests do not assert the exact reference (per the F-06 contract
 *     suite's convention).
 */
```

**Imports.**

```ts
import { describe, it, expect } from "vitest";
import { createOrdersService, ordersService } from "@/lib/services";
import {
  createFakeOrdersRepository,
  createFakeCustomersRepository,
  createFakeProductsRepository,
} from "@/lib/adapters/fake";
import {
  NotFoundError,
  ConflictError,
  ForbiddenError,
  ValidationError,
} from "@/lib/errors";
import type { Customer, Product, CreateOrderInput } from "@/lib/domain";
```

**Stable fixture IDs.**

```ts
const CUSTOMER_ID = "00000000-0000-0000-0000-000000000c01";
const INACTIVE_ID = "00000000-0000-0000-0000-000000000c02";
const USER_ID = "00000000-0000-0000-0000-000000000a01";
const BUTCHER_ID = "00000000-0000-0000-0000-000000000b01";
const PRODUCT_ID = "00000000-0000-0000-0000-000000000d01";
const PRODUCT_ID_2 = "00000000-0000-0000-0000-000000000d02";
const UNKNOWN_ID = "00000000-0000-0000-0000-000000000fff";
const T = new Date("2026-06-09T10:00:00Z");
```

**The `make()` helper.**

```ts
function make(
  opts: {
    customers?: readonly Customer[];
    products?: readonly Product[];
  } = {},
) {
  const customers = createFakeCustomersRepository(
    opts.customers ?? [
      { id: CUSTOMER_ID, name: "Acme", postcode: "AB1 2CD", active: true },
    ],
  );
  const products = createFakeProductsRepository(
    opts.products ?? [
      { id: PRODUCT_ID, code: "LMB-LEG", name: "Lamb leg", boxSize: "10 kg" },
      {
        id: PRODUCT_ID_2,
        code: "LMB-SHL",
        name: "Lamb shoulder",
        boxSize: "10 kg",
      },
    ],
  );
  const orders = createFakeOrdersRepository();
  const service = createOrdersService({ orders, customers, products });
  return { service, orders, customers, products };
}

function buildInput(
  overrides: Partial<CreateOrderInput> = {},
): CreateOrderInput {
  return {
    customerId: CUSTOMER_ID,
    deliveryDate: "2026-06-10",
    deliveryNotes: null,
    orderNotes: null,
    lines: [
      {
        productId: PRODUCT_ID,
        adHocDescription: null,
        quantity: 2,
        uom: "kg",
        notes: null,
      },
    ],
    ...overrides,
  };
}
```

**The case enumeration.** Each case is independently runnable; no
case depends on side effects of another. Total = **28 cases**.

#### `placeOrder` — 6 cases

1. **"throws NotFoundError when the customer does not exist"** —
   `make()`. `await expect(service.placeOrder(buildInput({ customerId:
UNKNOWN_ID }), USER_ID)).rejects.toBeInstanceOf(NotFoundError)`. Assert
   the message is exactly `"Customer not found"`.

2. **"throws ConflictError when the customer is inactive"** —
   `make({ customers: [{ id: INACTIVE_ID, name: "Old Co", postcode:
null, active: false }] })`. `await expect(service.placeOrder(buildInput({
customerId: INACTIVE_ID }), USER_ID)).rejects.toBeInstanceOf(ConflictError)`.
   Assert the message is exactly `"Customer is inactive"`.

3. **"throws ValidationError listing one missing product id"** —
   `make()` (no products seeded for `UNKNOWN_ID`). Build input with one
   line whose `productId === UNKNOWN_ID`. `await
expect(service.placeOrder(input, USER_ID)).rejects.toBeInstanceOf(ValidationError)`.
   Assert `err.message === "Unknown product_id(s)"`. Assert `err.fields
=== { "lines.products": [UNKNOWN_ID] }`.

4. **"throws ValidationError listing all missing product ids"** —
   `make()`. Build input with two lines, both with unknown productIds.
   Assert the ValidationError's `fields["lines.products"][0]` contains
   both IDs separated by `", "`.

5. **"persists an order with all catalogued lines and returns the
   full Order"** — `make()`. Build input with one catalogued line.
   `const result = await service.placeOrder(input, USER_ID)`. Assert
   `result.id` is a non-empty string. Assert `result.reference` is a
   non-empty string. Assert `result.customerId === CUSTOMER_ID`.
   Assert `result.state === "placed"`. Assert `result.createdBy ===
USER_ID`. Assert `result.lines.length === 1`. Assert
   `result.lines[0].productId === PRODUCT_ID`. Assert
   `result.lines[0].lineNumber === 1`.

6. **"persists an order with all ad-hoc lines (no product lookup)"** —
   `make({ products: [] })` (no products seeded). Build input with one
   ad-hoc line: `{ productId: null, adHocDescription: "Special cut",
quantity: 1, uom: "unit", notes: null }`. `const result = await
service.placeOrder(input, USER_ID)`. Assert succeeds — the product-
   verification step is skipped because `productIds.length === 0`.
   Assert `result.lines[0].adHocDescription === "Special cut"`.
   Assert `result.lines[0].productId === null`.

#### `editOrder` — 6 cases

7. **"throws NotFoundError when the order does not exist"** — `make()`.
   `await expect(service.editOrder(UNKNOWN_ID, {}, undefined, "admin",
USER_ID)).rejects.toBeInstanceOf(NotFoundError)`.

8. **"throws ConflictError when the order is completed"** — `make()`.
   Place an order, print it, mark its lines done (cascades to completed).
   Then `await expect(service.editOrder(placed.id, { deliveryNotes:
"x" }, undefined, "admin", USER_ID)).rejects.toBeInstanceOf(ConflictError)`.
   Assert message is `"Order is completed and cannot be edited"`.

9. **"throws ForbiddenError when sales tries to edit a printed order"** —
   `make()`. Place an order, print it (state='printed'). Then `await
expect(service.editOrder(placed.id, { deliveryNotes: "x" },
undefined, "sales", USER_ID)).rejects.toBeInstanceOf(ForbiddenError)`.
   Assert message is `"This order is locked. Only office can amend it
after printing."`.

10. **"allows sales to edit a placed order"** — `make()`. Place an
    order (state='placed'). `const updated = await
service.editOrder(placed.id, { deliveryNotes: "urgent" }, undefined,
"sales", USER_ID)`. Assert `updated.deliveryNotes === "urgent"`.

11. **"allows office to edit a printed order"** — `make()`. Place +
    print. `const updated = await service.editOrder(placed.id, {
deliveryNotes: "fast track" }, undefined, "office", USER_ID)`.
    Assert `updated.deliveryNotes === "fast track"`.

12. **"throws ValidationError when lineReplacement references an
    unknown product"** — `make()`. Place an order. Try to replace with
    one line whose productId is UNKNOWN_ID. `await
expect(service.editOrder(placed.id, {}, [{ productId: UNKNOWN_ID,
adHocDescription: null, quantity: 1, uom: "kg", notes: null }],
"admin", USER_ID)).rejects.toBeInstanceOf(ValidationError)`.

#### `printOrder` — 4 cases

13. **"throws NotFoundError when the order does not exist"** —
    `make()`. `await expect(service.printOrder(UNKNOWN_ID, USER_ID,
T)).rejects.toBeInstanceOf(NotFoundError)`.

14. **"throws ConflictError when the order is completed"** — `make()`.
    Place + print + mark lines done (cascade to completed). `await
expect(service.printOrder(placed.id, USER_ID,
T)).rejects.toBeInstanceOf(ConflictError)`. Assert message is
    `"Order is completed — cannot reprint a completed order"`.

15. **"transitions placed → printed and records printedAt + printedBy"** —
    `make()`. Place. `const printed = await service.printOrder(placed.id,
USER_ID, T)`. Assert `printed.state === "printed"`. Assert
    `printed.printedBy === USER_ID`. Assert `printed.printedAt ===
T.toISOString()`.

16. **"reprint on printed bumps printedAt without changing state"** —
    `make()`. Place + print (at T). Reprint at `T2 = new
Date('2026-06-09T11:00:00Z')` with a different user. `const result
= await service.printOrder(placed.id, "another-user", T2)`. Assert
    `result.state === "printed"`. Assert `result.printedAt ===
T2.toISOString()`. Assert `result.printedBy === "another-user"`.

#### `completeLineDone` — 5 cases

17. **"throws NotFoundError when the line does not exist"** — `make()`.
    `await expect(service.completeLineDone(UNKNOWN_ID, BUTCHER_ID,
T)).rejects.toBeInstanceOf(NotFoundError)`.

18. **"returns alreadyDone:true on a second call against the same line"** —
    `make()`. Place + print. Mark a line done. Mark the SAME line done
    again. Assert the second call returns `{ alreadyDone: true, orderId:
placed.id, completed: false }`.

19. **"middle line done does not cascade to completed"** — `make()`.
    Place with 3 lines + print. Mark line 1 done. `const result = await
service.completeLineDone(line1.id, BUTCHER_ID, T)`. Assert
    `{ alreadyDone: false, orderId: placed.id, completed: false }`.
    Assert via `service.findOrderById(placed.id)` that
    `order.state === "printed"`.

20. **"last line done cascades to completed"** — `make()`. Place with
    1 line + print. Mark the single line done. Assert
    `{ alreadyDone: false, orderId: placed.id, completed: true }`.
    Assert via `service.findOrderById(placed.id)` that
    `order.state === "completed"` and `order.completedAt ===
T.toISOString()`.

21. **"swallows ConflictError from markOrderCompleted (race-safe)"** —
    `make()`. Place with 2 lines + print + mark line 1 done. To
    simulate the race, mark order completed manually via the Fake's
    `markOrderCompleted` (this is allowed — the Fake's
    `markOrderCompleted` only requires state='printed', not that all
    lines are done): `await orders.markOrderCompleted(placed.id, T)`.
    Now the order is in state='completed' with line 2 still un-done.
    Mark line 2 done via the SERVICE: `const result = await
service.completeLineDone(line2.id, BUTCHER_ID, T)`. The Fake's
    `markLineDone` will see `line2.doneAt === null` and the parent
    `state === 'completed'` and throw ConflictError BEFORE reaching
    the cascade.

        **Revise the case:** the Fake's `markLineDone` at lines 233-238
        throws ConflictError on `state === 'completed'`, but only AFTER
        the idempotency check (`line.doneAt !== null`). To exercise the
        cascade-race swallow we need to engineer the situation where:
        - the line gets marked done (so the port returns `allLinesDone:

    true`),
    - then the service calls `markOrderCompleted`, - and that throws ConflictError because between markLineDone and
    markOrderCompleted the order's state has changed away from
    printed.

        The Fake doesn't model concurrency, so we cannot interleave. But
        we can stub the Fake's `markOrderCompleted` for ONE test:

        ```ts
        // Race swallow test: replace the orders adapter's markOrderCompleted
        // with one that throws ConflictError, simulating a concurrent
        // completion that won the optimistic lock.
        const orders = createFakeOrdersRepository();
        const customers = createFakeCustomersRepository([
          { id: CUSTOMER_ID, name: "Acme", postcode: null, active: true },
        ]);
        const products = createFakeProductsRepository([
          { id: PRODUCT_ID, code: "X", name: "X", boxSize: null },
        ]);
        const service = createOrdersService({ orders, customers, products });

        const placed = await service.placeOrder(buildInput(), USER_ID);
        await service.printOrder(placed.id, USER_ID, T);

        // Replace markOrderCompleted with one that throws ConflictError
        const realMarkOrderCompleted = orders.markOrderCompleted.bind(orders);
        orders.markOrderCompleted = async () => {
          throw new ConflictError("Order state is completed; expected 'printed'");
        };

        // Mark the single line done — completeLineDone should swallow the
        // ConflictError and return completed: true.
        const lineId = placed.lines[0].id;
        const result = await service.completeLineDone(lineId, BUTCHER_ID, T);
        expect(result).toEqual({
          alreadyDone: false,
          orderId: placed.id,
          completed: true,
        });
        ```

        The bind-and-replace pattern is acceptable for this single race-
        simulation test. It is the ONLY place in the F-07 test suite where
        we step outside the pure Fake substrate; the deviation is
        documented inline in the test comment.

        **Alternative considered:** use `vi.spyOn`. Rejected — `vi.spyOn`
        on a method of a closure-returned object is awkward and not
        fundamentally different from the bind-and-replace. The bind +
        monkey-patch is more explicit about what is being simulated.

#### Pass-throughs — 3 cases

22. **"listOrders returns whatever the port returns"** — `make()`.
    Place 3 orders. `const all = await service.listOrders({})`. Assert
    `all.length === 3`. Assert each item is the full Order shape.

23. **"findOrderById returns null on miss (does NOT throw)"** —
    `make()`. `const result = await service.findOrderById(UNKNOWN_ID)`.
    Assert `result === null`. **No try/catch.** Confirms the APOSD §11
    discipline.

24. **"listKdsQueue forwards the since cutoff"** — `make()`. Place +
    print one order. `const snap = await service.listKdsQueue(new
Date(0))` (very old since — anything completed since 1970 matches).
    Assert `snap.orders.length === 1`. Assert
    `snap.recentFlashes.length === 0` (Fake doesn't model audit log —
    matches the F-06 cert's documented behaviour). Assert
    `typeof snap.serverTime === "string"`.

#### Architecture pin — 4 cases

25. **"service composes ports, not services (import-allow-list pin)"** —
    Pure type-level assertion + a hard sanity check that the service's
    `createOrdersService` accepts an `OrdersServiceRepos` containing
    only port-shaped repos. The test reads:

    ```ts
    it("service composes ports, not services", () => {
      // This test cannot fail at runtime — it pins the public
      // signature at compile time. If F-07's interface ever grows
      // to accept a `*Service` parameter, the test file's `import`
      // statement at the top would need a new import; that diff
      // would surface in code review. The body asserts the factory
      // is callable with three port instances.
      const customers = createFakeCustomersRepository([]);
      const products = createFakeProductsRepository([]);
      const orders = createFakeOrdersRepository();
      const service = createOrdersService({ orders, customers, products });
      expect(service).toBeDefined();
      expect(typeof service.placeOrder).toBe("function");
      expect(typeof service.editOrder).toBe("function");
      expect(typeof service.printOrder).toBe("function");
      expect(typeof service.completeLineDone).toBe("function");
      expect(typeof service.listOrders).toBe("function");
      expect(typeof service.findOrderById).toBe("function");
      expect(typeof service.listKdsQueue).toBe("function");
    });
    ```

26. **"every typed error thrown by the service is instanceof its class"** —
    `make()`. Drive each error-throwing path and assert
    `instanceof NotFoundError`, `instanceof ConflictError`, `instanceof
ForbiddenError`, `instanceof ValidationError` respectively. The
    test consolidates four sub-assertions; it could be split into the
    method-level cases above but keeping it together pins the error-
    identity preservation across the service.

27. **"default singleton is the expected OrdersService shape"** —
    `expect(typeof ordersService.placeOrder).toBe("function")` etc.
    This pins the import surface — if F-08 imports `ordersService`
    from `@/lib/services`, the surface it gets is the same as the
    one tested above. Cheap, but stops the singleton's wiring from
    silently breaking the public API.

28. **"the service does not import any sibling service"** —
    Architecture pin via a static-text grep on the service file. This
    is the only test that asserts on file content rather than runtime
    behaviour, and it's the test that protects ADR-0002 line 23 from
    drift:

        ```ts
        import { readFileSync } from "node:fs";
        import { resolve } from "node:path";

        it("the service does not import any sibling service file", () => {
          const src = readFileSync(
            resolve(__dirname, "../../../lib/services/OrdersService.ts"),
            "utf8",
          );
          // No relative or absolute imports of any other *Service file.
          // F-07 is the first service; today this is trivially true, but
          // the assertion catches drift when F-13 / F-14 / etc. land.
          expect(src).not.toMatch(/from ['"][^'"]*Service['"]/);
          // Also forbid runtime observability coupling — only the
          // type-only `Role` import is allowed.
          expect(src).not.toMatch(
            /import \{ [^}]* \} from ['"]@\/lib\/observability/,
          );
          // No auth coupling.
          expect(src).not.toMatch(/from ['"]@\/lib\/auth/);
          // No log coupling.
          expect(src).not.toMatch(/from ['"]@\/lib\/observability\/log/);
        });
        ```

        The regex shape is narrow and matches the actual file. If a
        future maintainer adds `import { … } from

    "@/lib/services/CustomersService"`, the first assertion fires.
    If they add `import { log } from "@/lib/observability"`, the
    second assertion fires (the value-import form is the one that
    couples runtime; the type-only import form `import type { Role }
    from "@/lib/observability"` does not match because there are no
    braces around runtime exports).

        **Caveat:** static-text grep is brittle if someone renames the
        file. F-13 / F-14 should add a similar grep to their own service
        tests; this pattern becomes the architecture-pin template.

**Total: 28 cases.** Within the conductor brief's 25-35 envelope.

---

## 3. Steps (the build order)

Each step is one Conventional Commit. Commit messages match the
project's existing style (lowercase verb in parens, kebab-noun, F-07
trailer). The trailer co-author line is fixed.

### Step 1 — `feat(services): OrdersService composing F-05 ports (F-07)`

**Files added:**

- `lib/services/OrdersService.ts` (~430 lines).
- `lib/services/index.ts` (~25 lines including the file header).

**TDD discipline.** This is a source-only commit. The tests in Step 2
were drafted in §2.3 but NOT written yet — Step 1 makes the source
type-check and pass a manual smoke ("npx tsc --noEmit" — see §4 Layer 0).
Step 2 then writes the cases and asserts the green.

This matches F-06's step ordering (source first, then tests), which in
turn matched F-05's ordering. It deliberately diverges from strict TDD
(write failing test first, then make it pass) because the service
INTERFACE was locked at Gate 1; the test cases verify the locked
interface; there is no "design discovery" loop in F-07 where the test
informs the interface.

**Acceptance for Step 1:**

- `npx tsc --noEmit` exits 0.
- `lib/services/OrdersService.ts` contains exactly the imports listed
  in §2.1 and no others (grep check: §4 Layer 3).
- `lib/services/index.ts` re-exports `createOrdersService`,
  `ordersService`, `type OrdersService`, `type OrdersServiceRepos`.

### Step 2 — `test(unit): OrdersService unit tests against Fake adapters (F-07)`

**Files added:**

- `tests/unit/services/OrdersService.test.ts` (~480 lines including the
  per-case assertions).

**Acceptance for Step 2:**

- `npx vitest run tests/unit/services/OrdersService.test.ts` exits 0.
- 28 cases pass.
- No `skip` / `todo` / `it.only` in the file.

---

## 4. Test matrix (the green-light criteria)

Every layer in this matrix must pass before declaring the PR ready
for ANVIL.

### Layer 0 — TypeScript compiles

`npx tsc --noEmit` from repo root exits 0. F-07's two new source files
type-check against F-05 ports + F-06 adapters + the typed-error
contract.

### Layer 1 — F-07 unit tests pass

`npx vitest run tests/unit/services/OrdersService.test.ts`:

- 28 cases pass.
- 0 fail / 0 skip.

### Layer 2 — No existing test regresses

`npx vitest run tests/unit` from repo root: all pre-existing unit
tests still pass. F-07 does NOT touch any other source file, so the
pre-existing unit-test green baseline (~per F-06 cert) carries.

The 23 broken HTTP integration tests (F-TD-03) stay broken — they are
not run by `tests/unit`. The Fake adapter tests at
`tests/unit/adapters/fake/*.test.ts` are run; they still pass because
F-07 does not touch the Fake adapters.

### Layer 3 — Lint passes

`npm run lint` from repo root: 0 errors, 0 warnings on F-07's files.

Specifically:

- `lib/services/OrdersService.ts`: no
  `import * from '@supabase/supabase-js'`. The
  `no-restricted-imports` rule passes by not firing.
- `lib/services/index.ts`: trivial; lint passes.
- `tests/unit/services/OrdersService.test.ts`: under the `tests/**`
  override; lint passes.

### Layer 4 — Production-path importers stay at zero

The §1.9 grep run from repo root:

```
grep -rn "from ['\"]@/lib/services" app/ 2>/dev/null
```

MUST return 0 lines. F-07 ships the service file unused; F-08 will
flip this.

The F-05 and F-06 grep checks also run:

```
grep -rn "from ['\"]@/lib/ports\|from ['\"]@/lib/domain" app/ lib/services 2>/dev/null
grep -rn "from ['\"]@/lib/adapters" app/ lib/usecases 2>/dev/null
```

The first now returns the `lib/services/OrdersService.ts` lines (good —
the service imports ports + domain). The second still returns 0 lines
(the service imports adapters via the singleton-builder body; `lib/usecases`
does not exist).

### Layer 5 — Pre-existing HTTP integration tests stay broken (F-TD-03 carry-forward)

`npx vitest run tests/integration` (with `npm run dev` in another
terminal — per the F-05 cert §F-TD-03 hypothesis): the same 23
failing tests fail. F-07 does NOT change this; it is documented as
F-08's prerequisite (§9 + §10).

### Layer 6 — Vendor-types-don't-cross-port-boundary discipline

Spot-check via reading the service file: zero references to
`SupabaseClient`, `PostgrestResponse`, `Database`,
`@supabase/supabase-js`. The grep `grep -rn "SupabaseClient\|PostgrestResponse\|supabase-js"
lib/services/` returns 0 lines.

### Layer 7 — ADR-0002 line 23 enforcement (the architecture pin)

The grep `grep -rn "from ['\"][^'\"]*Service['\"]\|from ['\"]@/lib/services/[A-Z]" lib/services/`
returns 0 lines. No service file imports another service file (today
trivially true; in F-13+ this matters).

Also: `grep -rn "import type \{ Role \}" lib/services/OrdersService.ts`
returns exactly 1 line (the locked `import type { Role } from
"@/lib/observability"`).

### Layer 8 — Default singleton works at construction time

A one-line sanity check baked into the test suite (test case 27):
`import { ordersService } from "@/lib/services"` and assert
`typeof ordersService.placeOrder === "function"`. The singleton's
factory body runs at module load, instantiating real Supabase adapters
under the hood. If any of `supabaseOrdersRepository`,
`supabaseCustomersRepository`, `supabaseProductsRepository` fail to
construct (they read env via `lib/supabase.ts`), the import throws
at test time. **Note:** if the env vars `NEXT_PUBLIC_SUPABASE_URL` /
`SUPABASE_SERVICE_ROLE_KEY` are not set in the test environment, the
import will throw. `lib/supabase.ts:5-7` validates these env vars at
import time. The test environment via `.env.test.local` (set up by
F-INFRA-01) provides them. Verified at recon by reading
`tests/integration/_loadEnv.ts` (loads `.env.test.local` for the
integration suite). Vitest's unit run loads `.env.test.local`
through the same setup chain — verified at recon.

If the env vars are NOT set (e.g. a contributor runs the suite without
having booted F-INFRA-01), test 27 fails with the Supabase env-validation
error message — which is a sensible failure (tells the user to set up
their env). Documented in §5 Risk #7.

### Layer 9 — Coverage shape (informational)

Run `npx vitest run --coverage tests/unit/services/`. Targets:

- `lib/services/OrdersService.ts`: ≥95% statement coverage, ≥95%
  branch coverage. (The race-swallow non-Conflict branch may not be
  covered without an additional test; documented as acceptable.)
- `lib/services/index.ts`: 100% (it is three re-exports).

This is informational. F-07 does not require coverage thresholds in CI
(no such infrastructure today); the planner reports the numbers in
the FORGE Guard cert.

### Test matrix summary

| Layer | Command                                                    | Pass criterion                        | Notes                            |
| ----- | ---------------------------------------------------------- | ------------------------------------- | -------------------------------- |
| 0     | `npx tsc --noEmit`                                         | exit 0                                | type-check                       |
| 1     | `npx vitest run tests/unit/services/OrdersService.test.ts` | 28/28 pass                            | F-07's own tests                 |
| 2     | `npx vitest run tests/unit`                                | pre-existing green stays              | no regression                    |
| 3     | `npm run lint`                                             | 0 errors / 0 warnings on F-07's files | FREEZE rule passes by not firing |
| 4     | grep `@/lib/services` in `app/`                            | 0 lines                               | production-path zero             |
| 5     | `npx vitest run tests/integration` (with `npm run dev`)    | 23 broken stay broken                 | F-TD-03 carry-forward            |
| 6     | grep vendor types in `lib/services/`                       | 0 lines                               | ADR-0002 line 27                 |
| 7     | grep cross-service imports in `lib/services/`              | 0 lines                               | ADR-0002 line 23                 |
| 8     | test case 27                                               | passes                                | singleton constructs             |
| 9     | `npx vitest run --coverage tests/unit/services/`           | ≥95%                                  | informational                    |

---

## 5. Risks and open questions

### Risk 1 — F-08 hard prerequisites carry-forward (F-TD-03)

**The problem.** Three F-08 prerequisites are documented in memory but
not in code:

1. **F-TD-03 fixed.** The 23 broken Orders HTTP integration tests
   (`tests/integration/orders-crud.test.ts`,
   `tests/integration/picking-list.test.ts`,
   `tests/integration/kds.test.ts`) must pass before F-08's PR is
   considered ready. They are broken today because they use the
   `api()` HTTP helper at `tests/integration/_setup.ts:207-246` which
   `fetch`es `http://localhost:3000/api/*` — requiring `npm run dev`
   running separately. Three paths to fix:
   - (a) Auto-start the dev server inside
     `vitest.integration.config.ts` (mimicking Playwright's
     `webServer` block). Requires Vitest's `globalSetup` hook + a
     process spawn that boots `next dev`, waits for ready, then
     tears down.
   - (b) Switch the route tests to direct-adapter testing — i.e. the
     new F-08 route handlers will be thin shims over `OrdersService`,
     and the integration tests can call the service directly without
     going through HTTP. This matches the F-06 pattern. **Preferred**
     per F-06's cert.
   - (c) Document the dev-server requirement and require developers
     to start `npm run dev` manually. Status quo, not a fix.

2. **Playwright `@critical` suite must PASS at Gate 3 for F-08.** Today
   the Playwright suite can be skipped if F-INFRA-02 (the Playwright
   harness wired into the dev server) is not ready. F-08's spec lock
   says the `@critical` suite must PASS, not be SKIPPED, for F-08's
   Gate 3. F-08's planner inherits this constraint.

3. **F-INFRA-02 OR manual smoke procedure.** F-INFRA-02 wires the
   Playwright harness into the dev server via `webServer` (already in
   `playwright.config.ts` per memory's note on F-INFRA-01). If
   F-INFRA-02 is not ready by F-08, F-08 must include a manual smoke
   procedure (a documented click-through path with checkboxes) as a
   compensating control.

**F-07 impact:** none. F-07's tests are pure unit, no HTTP, no
Playwright. F-07's PR ships green regardless. **But the F-07 plan
must surface these for F-08's planner.** Documented here +
in §9 + §10.

### Risk 2 — `Role` lives in `@/lib/observability` (not domain)

**The problem.** F-07's service file imports `type Role` from
`@/lib/observability`. The architecturally correct home for `Role` is
`@/lib/domain` — but moving it there is F-13's job. F-07 is borrowing
from observability with a documented forward-deprecation path.

**Why this is acceptable.** TypeScript's type-only imports
(`import type { Role } …`) are erased at compile time. The compiled
JavaScript output of `lib/services/OrdersService.ts` will have ZERO
references to `@/lib/observability`. The "coupling" is purely a
compile-time fiction; no runtime dependency exists.

**Forward path.** When F-13 lands and moves `Role` to
`lib/domain/Role.ts`, the F-07 service file changes ONE line:

```ts
- import type { Role } from "@/lib/observability"
+ import type { Role } from "@/lib/domain"
```

No other change. No re-test. F-13's PR can include this one-line
diff atomically with the `Role` move.

**Mitigation today.** Document in the service file header (§2.1).
Document in this plan (§1.5). Pin via test case 28 (the architecture
pin grep restricts which observability surface is acceptable to import).

### Risk 3 — HTTP status code normalisation differences from today's routes

**The problem.** F-07 normalises three error states from the existing
routes' status codes to the typed-error contract's status codes:

| Service-thrown error                                                     | F-07's HTTP via withErrors | Today's route status | Mismatch                           |
| ------------------------------------------------------------------------ | -------------------------- | -------------------- | ---------------------------------- |
| `ConflictError("Customer is inactive")`                                  | 409                        | 400                  | yes — F-07 changes from 400 to 409 |
| `ConflictError("Order is completed and cannot be edited")`               | 409                        | 403                  | yes — 403 to 409                   |
| `ConflictError("Order is completed — cannot reprint a completed order")` | 409                        | 403                  | yes — 403 to 409                   |

**Why the change is correct.** The typed-error contract (`AppError`

- `ConflictError` at `lib/errors/ConflictError.ts`) maps `ConflictError`
  to 409. The semantic meaning of "the resource is in a state that
  prevents this operation" is 409, not 400 (which is for malformed input)
  or 403 (which is for "you don't have permission"). Today's routes
  predate the typed-error contract; they used 403 / 400 ad-hoc.

**Risk to clients.** None today, because F-07 ships unused. F-08 will
flip the routes to call the service; at that point the new HTTP
behaviour ships. F-08's planner needs to:

- Audit clients (the office Orders UI, the KDS app, any external
  consumer) for code that checks for `response.status === 403` /
  `=== 400` on these specific endpoints. Update the client to handle
  409 (the new shape).
- Document the change in the F-08 cert.
- (Optional) Add a CHANGELOG entry.

**Mitigation today.** Document the mismatch (this risk + §1.4). Pin
via F-07's tests: test cases 2, 8, 11, 14 assert
`instanceof ConflictError` — when F-08's routes go through the HOF
the status code will be 409. F-08's planner cannot accidentally
preserve the old 403/400 because there is no path to do so without
explicitly catching and re-throwing.

### Risk 4 — `ValidationError` constructor shape mismatch with spec

**The problem.** The conductor brief proposed:

```ts
throw new ValidationError("Unknown product_id(s)", {
  fields: { "lines.products": missing.join(", ") },
});
```

The actual `ValidationError` constructor at
`lib/errors/ValidationError.ts:21-30` is:

```ts
constructor(
  message: string,
  fields: Record<string, string[]>,
  options?: { cause?: unknown; context?: Record<string, unknown> }
)
```

The brief's shape is wrong on two axes:

1. `fields` is a POSITIONAL second arg, not nested inside an options
   bag.
2. The values in `fields` are `string[]`, not `string`.

**F-07 corrects to:**

```ts
throw new ValidationError("Unknown product_id(s)", {
  "lines.products": [missing.join(", ")],
});
```

**Tension noted; spec corrected at recon.** The conductor's intent
("surface the missing IDs in a typed shape") is honoured; the actual
constructor shape is followed.

**Documented in §2.1 (the service body) + here.** If Gate 2 prefers
a different shape (e.g. one entry per missing ID: `{ "lines.products":
missing }`), the planner has no objection — the choice between
"comma-joined single string" vs "array of IDs" is cosmetic and the
test case 4 can be adjusted accordingly. Marked as a non-blocking
style preference.

### Risk 5 — F-07's `completeLineDone` tightens error-swallowing vs today's route

**The problem.** Today's route at
`app/api/kds/lines/[lineId]/done/route.ts:160-163` swallows ANY error
from the auto-complete update:

```ts
if (completeErr) {
  console.error("[POST kds/lines/done] auto-complete failed", completeErr);
  return NextResponse.json({ ok: true, completion_failed: true });
}
```

F-07 swallows ONLY `ConflictError` (the race). `ServiceError`
(unexpected DB failure during auto-complete) propagates. The route
(F-08) will turn it into a 500.

**Why the change is correct.** Today's `completion_failed: true`
masked a legitimate error condition — the line was marked done, but
the order ended up in a stuck state (lines all done, state still
'printed'). The operator had no visibility because the API returned 200. F-07's surfacing means the operator sees a 500 and can
investigate.

**Risk to operations.** A DB error during auto-complete (rare —
the underlying optimistic-lock update is the same operation that
worked for the line-done update milliseconds earlier) will now show
as a 500 to the KDS device. The device's display behaviour on a 500
is currently "show error toast and stop". F-08's KDS app may want to
add a retry-with-backoff or a "the line was marked done but
completion is pending" status. **Flagged for F-08's planner.**

**Mitigation today.** Document the tightening (here + §1.4 + §1.8 +
§2.1's `completeLineDone` JSDoc). F-08 owns the operational fix.

### Risk 6 — Commit-shape preference (2 vs 3 commits)

**The problem.** F-07's spec proposed picking 2 or 3 commits. Planner
chose 2 (§Branch + base). Gate 2 may prefer 3.

**Why 2 is chosen.** §Branch + base rationale: the barrel is two
lines of re-export; splitting it across commits produces a commit
nobody would `git bisect` to. F-05 and F-06 both kept tightly-coupled
source files in one commit and separated source from tests; F-07
mirrors that.

**Risk.** None — both shapes are correct. If Gate 2 disagrees, the
planner re-shapes Step 1 into two sub-steps (1a = OrdersService.ts,
1b = index.ts). No behavioural impact.

### Risk 7 — Singleton wiring at module load

**The problem.** The default `ordersService` singleton calls
`createOrdersService({ orders: supabaseOrdersRepository, … })` at
module load. `supabaseOrdersRepository` is itself wired against
`supabaseService` from `@/lib/supabase`, which validates env vars at
its OWN module load (`lib/supabase.ts:5-7`).

If a test environment does not set `NEXT_PUBLIC_SUPABASE_URL` or
`SUPABASE_SERVICE_ROLE_KEY`, importing `@/lib/services` throws at
module load. F-07's unit test file at
`tests/unit/services/OrdersService.test.ts` imports `ordersService`
(for the singleton sanity check at case 27).

**Mitigation today.** F-INFRA-01's setup chain (`tests/integration/_loadEnv.ts`
loads `.env.test.local`) provides the env vars. The unit test suite
loads the same env via Vitest's config — verified at recon. If a
contributor runs `npx vitest run tests/unit/services` without booting
F-INFRA-01, the test will fail with the Supabase env-validation
error.

**Documented as expected behaviour.** The error message from
`lib/supabase.ts` is clear ("Missing NEXT_PUBLIC_SUPABASE_URL").
Contributors know to run `npm run db:up` (or `cp .env.example
.env.test.local` if they don't want the full stack).

**Alternative considered:** make the singleton lazy. Rejected —
matches the F-06 cert's "pre-wired default singleton" pattern,
and the lazy variant adds proxy boilerplate for no behavioural gain.

### Risk 8 — Test case 21 (race swallow) requires monkey-patching the Fake

**The problem.** Test case 21 simulates the race where
`markOrderCompleted` throws `ConflictError` because between
`markLineDone` and `markOrderCompleted` the order state moved. The
Fake doesn't model concurrency, so the test stubs
`orders.markOrderCompleted` with a function that throws
`ConflictError`.

**Why this is acceptable.** The race-swallow is a real path in the
service code; not testing it leaves a branch uncovered. The
monkey-patch is a deliberate single-method stub, not a full mock
graph. The test comment explicitly calls out that this is the ONLY
deviation from the pure Fake substrate.

**Alternative considered:** add a `forceConflictNext: boolean` flag
to the Fake's factory. Rejected — it changes the Fake's signature
for one test case, and the Fake's signature is the F-06 cert's
locked surface. The monkey-patch is contained in one F-07 test and
doesn't touch the Fake's file.

**Alternative considered:** test the race via Supabase contract (have
F-06 add a race case). Rejected — F-06 is shipped; out of scope. The
race-swallow is F-07's logic, not the port's, so F-07 owns the test.

### Risk 9 — Type-only `Role` import may break under tsc's `--isolatedModules` if barrel-reexport is wrong

**The problem.** `lib/observability/index.ts:10` re-exports
`type Role` via:

```ts
export { type Caller, type Role, makeCaller } from "./Caller";
```

This is TypeScript's `type` keyword in the `export` clause — supported
under `isolatedModules`. F-07's import `import type { Role } from
"@/lib/observability"` should compile.

**Verification at recon:** the F-06 plan confirms the local repo uses
`isolatedModules: true` (mention via package.json + Next.js default).
The same import pattern is used by other files in the repo (e.g.
`lib/auth/session.ts:70: type Role,`).

**Risk.** None expected; verified at recon.

### Risk 10 — Pass-through methods are thin (depth-rule concern)

**The problem.** ADR-0002 line 25's depth rule says every service
method should hide a non-trivial decision. The three pass-throughs
(`listOrders`, `findOrderById`, `listKdsQueue`) are arrow-function
one-liners.

**Why this is acceptable.** Pass-throughs exist for surface
consistency — F-08 routes call ONE service for Orders. If
`listOrders` had to go directly to the port, the route file would
need a separate import + a separate "this isn't part of the service"
mental model. The cost (3 lines of pass-through) is much lower than
the cost (mixed coupling) of skipping them.

**Documented.** §2.1's service interface JSDoc names each pass-through
as a "Pass-through to ports — exists for surface consistency."

**Alternative considered:** omit pass-throughs and have F-08 routes
import the adapters directly for reads. Rejected — F-08 routes
should have ONE Orders entry point. Mixed coupling is worse than
thin pass-throughs.

---

## 6. Acceptance criteria

The PR is considered ready for ANVIL when ALL of the following are
true:

### Source

- [ ] `lib/services/OrdersService.ts` exists with the interface +
      factory + singleton + state×role constants (~430 lines).
- [ ] `lib/services/index.ts` exists with the barrel re-exports
      (~25 lines).
- [ ] The service file's imports match §2.1's allow-list exactly:
      `Role` (type-only) from `@/lib/observability`; typed errors from
      `@/lib/errors`; domain types from `@/lib/domain`; port types from
      `@/lib/ports`; default singletons from `@/lib/adapters/supabase`.
- [ ] The service file does NOT import:
      `@supabase/supabase-js`, `@/lib/supabase`, `@/lib/observability/log`,
      `@/lib/observability/context`, `@/lib/observability/Caller`,
      `@/lib/auth/*`, any other `*Service`, or `next/*`.
- [ ] The service file's header comment documents ADR-0002 line 23
      (services don't import services), the `Role` F-13 forward path, and
      the per-method error contract.

### Tests

- [ ] `tests/unit/services/OrdersService.test.ts` exists with 28
      cases.
- [ ] The test file uses ONLY the F-06 Fake adapters; zero Supabase
      client / DB imports.
- [ ] All 28 cases pass: `npx vitest run
tests/unit/services/OrdersService.test.ts` exits 0.
- [ ] Pre-existing tests (excluding F-TD-03's 23 broken) still pass:
      `npx vitest run tests/unit` is green.
- [ ] `npx tsc --noEmit` exits 0.
- [ ] `npm run lint` is 0 errors / 0 warnings on F-07's files.

### Architecture pins

- [ ] `grep -rn "from ['\"]@/lib/services" app/` returns 0 lines
      (production-path zero).
- [ ] `grep -rn "supabase-js\|SupabaseClient\|PostgrestResponse"
lib/services/` returns 0 lines (vendor types stop at adapters).
- [ ] `grep -rn "from ['\"][^'\"]*Service['\"]" lib/services/` returns
      0 lines (services don't import services).
- [ ] Test case 28 (the architecture-pin grep test) passes.
- [ ] Test case 25 (the public-signature pin) passes.

### Branch + commit

- [ ] Branch is `f-07-orders-service`, off `main` HEAD `3d56b85`.
- [ ] Two commits in this order:
  1. `feat(services): OrdersService composing F-05 ports (F-07)` —
     `lib/services/OrdersService.ts` + `lib/services/index.ts`.
  2. `test(unit): OrdersService unit tests against Fake adapters (F-07)` —
     `tests/unit/services/OrdersService.test.ts`.
- [ ] Each commit ends with the trailer:
      `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.
- [ ] PR title is `feat(services): OrdersService (F-07)`.
- [ ] PR is opened against `main`, not auto-merged.

### Coverage (informational)

- [ ] `lib/services/OrdersService.ts` has ≥95% statement coverage and
      ≥95% branch coverage in the F-07 test run. Cert reports the
      numbers; F-07 does not fail on coverage thresholds (no CI rule).

---

## 7. What ANVIL checks (the future-cert preview)

ANVIL's cert will assert:

### Layer 1 — Adapter purity (carry from F-06)

Spot-check: `@supabase/supabase-js` appears in exactly three files,
unchanged from F-06 cert.

### Layer 2 — Service purity (NEW, F-07's pin)

Spot-check: zero files under `lib/services/` import
`@supabase/supabase-js` (the new pin). The service composes ports,
not vendor SDKs.

### Layer 3 — Service-doesn't-import-service (NEW, F-07's pin)

The grep `grep -rn "from ['\"][^'\"]*Service['\"]" lib/services/`
returns 0 lines. The only service file today is `OrdersService.ts`;
nothing to import. The grep stays at 0 lines for all future
service-extraction PRs (F-13, F-14, etc.) — when this grep starts
returning lines, ADR-0002 line 23 is violated.

### Layer 4 — Test substitutability (carry from F-06)

The same OrdersService passes its 28 cases against Fake adapters.
F-07 cannot prove "same service passes against Supabase adapter" the
way F-06's contract tests do — because F-07's tests are unit-level
(no DB). However, F-08's eventual integration tests will exercise
the service against Supabase adapters via HTTP.

### Layer 5 — Type compilation under strict mode

`npx tsc --noEmit` returns 0. The interface, factory, singleton,
and tests all type-check.

### Layer 6 — Production-path zero (carry forward)

The §1.9 grep returns 0 lines. F-07 ships unused.

### Layer 7 — F-08 prerequisite carry-forward (§9)

Cert documents the three F-08 hard prerequisites (F-TD-03 fixed,
Playwright `@critical` must PASS, F-INFRA-02 or manual smoke). F-07's
PR does not fix them; the cert names them for F-08's planner.

---

## 8. Production-path importer grep — the trip-wire

The §1.9 grep is documented here as a CI sanity check (the cert
preview):

```sh
grep -rn "from ['\"]@/lib/services" app/ 2>/dev/null
```

Expected: 0 lines.

If this grep ever returns ≥1 line BEFORE F-08 ships, it means a route
has started importing the service early — out of order, ADR-0003
strangler-fig violated. The cert calls this out as an architectural
breach.

If this grep returns ≥1 line AFTER F-08 ships, that is the desired
state — F-08 wires routes to the service.

---

## 9. Follow-ups (out of F-07 scope)

> **Index:** every item below is also indexed in `docs/plans/BACKLOG.md` — the single living backlog for all deferreds (tech debt, product features, architecture follow-ups). When you close one of these, update BACKLOG.md status, don't just delete it from here.

These are surfaced for downstream planners. F-07's PR does not own
them; the cert names them in its Follow-ups section.

### Follow-up F-08-PRE-1 — F-TD-03 fix path (decision-only, not implementation)

F-08's planner decides between three paths to fix the 23 broken Orders
HTTP integration tests (per §5 Risk #1). **Preferred per F-06 cert:**
switch to direct-adapter integration testing — F-08 route tests call
the service directly via Fake adapters, bypassing HTTP entirely. The
HTTP layer gets thinner Playwright coverage (the new F-INFRA-02 work).

### Follow-up F-08-PRE-2 — Playwright `@critical` suite must PASS

F-08 cannot SKIP the Playwright `@critical` suite at Gate 3. F-INFRA-02
(the harness wiring) must be ready, OR F-08 includes a documented
manual-smoke checklist as a compensating control.

### Follow-up F-08-1 — Wire routes to OrdersService

The 5 Orders routes (`app/api/orders/route.ts`,
`app/api/orders/[id]/route.ts`,
`app/api/orders/[id]/picking-list/route.ts`,
`app/api/kds/orders/route.ts`,
`app/api/kds/lines/[lineId]/done/route.ts`) start calling
`ordersService` instead of `supabaseService` directly. F-08 replaces
the inline business logic with one-line service calls + auth + HTTP
serialization.

### Follow-up F-08-2 — Switch validation to zod

F-08 replaces `lib/orders/validation.ts` (ad-hoc validation) with zod
schemas at the route boundary. F-07's service trusts the validated
input; F-08's zod adapter produces it.

### Follow-up F-08-3 — Document HTTP status code changes

F-08 documents the three 403→409 / 400→409 status code changes (per
§5 Risk #3) in the F-08 cert and updates client code (office Orders
UI, KDS app) to handle the new status codes.

### Follow-up F-08-4 — Decide on completion_failed surfacing

F-08 decides whether the KDS device gets a 500 or a degraded "line
done, completion pending" status when `markOrderCompleted` fails with
a non-Conflict error (per §5 Risk #5). Operational decision; F-07
surfaces, F-08 routes.

### Follow-up F-13-1 — Move `Role` to `lib/domain/Role.ts`

F-13 (Users + Auth) extracts the `Role` union from
`lib/observability/Caller.ts` to `lib/domain/Role.ts` and updates the
F-07 import (per §5 Risk #2). One-line diff in
`lib/services/OrdersService.ts`.

### Follow-up F-13-2 — Wire `SET LOCAL app.current_user_id`

F-13 or F-19 introduces a Postgres helper RPC (or a per-request
authenticated client) that propagates the caller's user id to the
audit triggers. F-07 already plumbs `callerUserId` through to
`orders.createOrder`, `orders.recordPrint`, etc.; the missing piece
is the SET LOCAL call inside the Supabase adapter.

### Follow-up F-RLS-03 — Per-request authenticated client

F-RLS-03 introduces a per-request authenticated Supabase client. F-07's
factory + singleton pattern accommodates this: F-RLS-03 will introduce
a `getRequestScopedOrdersService(req)` helper that calls
`createOrdersService({ orders: makeSupabaseOrdersRepository(reqClient),
… })` per request. The interface does not change.

### Follow-up F-15+ services

Future services (`UsersService`, `RoutesService`, `PricingService`,
etc.) copy F-07's:

- Interface + hybrid factory + singleton pattern.
- Repository bundle (`*ServiceRepos` named-object input).
- Type-only `Role` import (or `@/lib/domain` once F-13 lands).
- The architecture-pin test (case 28's grep).
- The Fake-substrate unit test pattern.
- The "no logging from the service; throw typed errors" discipline.

---

## 10. F-08 hard prerequisites (carried forward from memory)

This section exists because memory has three explicit prerequisites
Hakan added for F-08. F-07 does not fix them; F-08 cannot ship
without them. Surfacing here ensures the F-08 planner does not miss
them in the relay.

1. **F-TD-03 fixed.** The 23 broken Orders HTTP integration tests must
   pass before F-08 is considered shippable. See §5 Risk #1 and §9
   Follow-up F-08-PRE-1.

2. **Playwright `@critical` suite must PASS at Gate 3.** Not skipped.
   Not deferred. See §9 Follow-up F-08-PRE-2.

3. **F-INFRA-02 OR manual smoke procedure.** F-INFRA-02 wires the
   Playwright harness into the dev server via `webServer`. If
   F-INFRA-02 is not ready by F-08, F-08 must include a manual smoke
   procedure (documented click-through path with checkboxes) as a
   compensating control.

**F-07's contribution to these prerequisites:** none. F-07 ships green
regardless. F-07's only obligation is to surface them visibly so the
F-08 planner sees them.

---

## 11. What I need back from Gate 2

Gate 2 is the grill stage. Before stress-testing, the planner notes
the following decisions for explicit confirmation:

1. **`Role` type-only import from `@/lib/observability`.** Confirmed
   the cleanest path (§1.5) given F-07's scope discipline rule against
   editing F-05 files. Gate 2: confirm acceptable, or propose moving
   `Role` to `lib/domain` as part of F-07 (would require scope
   expansion).

2. **Commit shape — 2 commits.** Argued for in §Branch + base. Gate 2:
   confirm acceptable, or prefer 3 commits (one extra split between
   `OrdersService.ts` and `index.ts`).

3. **`ConflictError` normalisation (409, not 403/400)** for the three
   "Customer is inactive" / "Order is completed and cannot be edited"
   / "Order is completed — cannot reprint a completed order" cases.
   Argued for in §1.4 + §5 Risk #3. Gate 2: confirm acceptable
   (recommended), or propose keeping today's mixed status codes
   (requires the service to throw a different error type — would mean
   inventing a new typed error like `CustomerInactiveError` or
   `OrderFrozenError`).

4. **`ValidationError` shape correction.** The spec's nested-options
   shape was wrong; F-07 uses positional `(message, fields,
options?)` with `fields` as `Record<string, string[]>`. Argued
   for in §5 Risk #4. Gate 2: confirm acceptable, or propose
   `missing` as an array rather than a comma-joined single string.

5. **Tightened `completion_failed` swallowing.** F-07 swallows only
   `ConflictError` from `markOrderCompleted`; today's route swallowed
   all errors. Argued for in §5 Risk #5. Gate 2: confirm acceptable
   (recommended for operational visibility), or propose keeping the
   broader swallow (matches today's route; requires the F-08 cert to
   document the masked errors).

6. **Test case 21 monkey-patches the Fake** for the race swallow. The
   only deviation from pure Fake substrate. Argued for in §5 Risk #8.
   Gate 2: confirm acceptable, or propose moving the race-swallow
   test to a future Supabase contract case (would mean F-07 ships
   without that branch covered).

7. **Test case 28's static-text grep on the service file** as the
   ADR-0002 line 23 architecture pin. The only assertion on file
   content rather than runtime. Argued for in §5 Risk #10. Gate 2:
   confirm acceptable as the template all future \*Service tests
   copy, or propose a different pin mechanism (e.g. an ESLint custom
   rule — would require F-04 lint edits which are out of scope).

---

## 12. Done definition

F-07 is done when:

- [x] (Met by planner) The plan exists at
      `docs/plans/2026-06-09-f-07-orders-service.md` and is reviewed by
      Gate 2 (grill).
- [ ] (For implementer) Branch `f-07-orders-service` is cut off `main`
      HEAD `3d56b85`.
- [ ] (For implementer) Step 1 commits land: `lib/services/OrdersService.ts`
  - `lib/services/index.ts` with the locked shapes.
- [ ] (For implementer) Step 2 commits land: 28 passing unit tests at
      `tests/unit/services/OrdersService.test.ts`.
- [ ] (For implementer) §4 test matrix all-green.
- [ ] (For implementer) §6 acceptance criteria all-checked.
- [ ] (For ANVIL) The cert at `docs/anvil/2026-06-09-f-07-cert.md`
      documents the architectural significance, the production-path zero,
      the architecture pins, and the F-08 prerequisites carry-forward
      (§10).
- [ ] (For Hakan) Squash-merge to `main` once Gate 3 clears.

The branch `f-07-orders-service` then goes away. The cert lives at
`docs/anvil/2026-06-09-f-07-cert.md`. The plan lives at
`docs/plans/2026-06-09-f-07-orders-service.md`. The unit number
F-07 lives in the next strangler-fig sequence step's prerequisites
(F-08, in this case).
