# F-06 — Orders / Customers / Products Supabase + Fake adapters + contract test infrastructure

## Goal

F-06 is the **second hexagonal unit** in the strangler-fig migration and the
first with actual adapter code. It ships:

- 3 **Supabase adapters** (`lib/adapters/supabase/{Orders,Customers,Products}Repository.ts`)
  implementing the F-05 ports against the existing Postgres schema. Each is the
  ONLY place a `@supabase/supabase-js` import is allowed for the Orders
  bounded context (ADR-0003 FREEZE rule — `.eslintrc.json:18` allow-list).
- 3 **Fake in-memory adapters** (`lib/adapters/fake/{Orders,Customers,Products}Repository.ts`)
  implementing the same ports without any vendor SDK. Pure JavaScript Maps;
  enables F-07 to unit-test `OrdersService` without a database.
- 3 **shared contract test suites** (`lib/ports/__contracts__/{Orders,Customers,Products}Repository.contract.ts`)
  — one factory per port, exporting a function that takes a `setup` closure and
  declares the test cases. Both adapters import the same suite. This is the
  **template every future port-extraction unit** (F-13/F-14/F-15/F-16/F-17/F-18/F-19/F-20)
  will copy when shipping its adapters.
- 6 **wrapper test files** that import the contract suite and call it twice:
  once with the Supabase adapter (under `tests/integration/adapters/supabase/`,
  hits the local F-INFRA-01 stack) and once with the Fake adapter (under
  `tests/unit/adapters/fake/`, no DB).
- 2 **barrel re-export files** (`lib/adapters/supabase/index.ts`, `lib/adapters/fake/index.ts`)
  that export both the factory functions AND the pre-wired default singletons.

F-06 is the **worked example for adapters + contract tests** the way F-05 was
the worked example for ports + JSDoc. Get this one wrong and every later
adapter PR copies the wrong template. The plan reads as a worked example for
that reason — long, deliberate, and explicit about why each adapter has the
shape it does.

**What F-06 ships unused.** ADR-0003's strangler-fig sequencing puts ports in
F-05 (shipped), adapters in F-06 (this), service in F-07, route rewrites in
F-08. F-06 lands real adapter code that no production path imports — the 5
Orders routes (`app/api/orders/route.ts`, `app/api/orders/[id]/route.ts`,
`app/api/orders/[id]/picking-list/route.ts`, `app/api/kds/orders/route.ts`,
`app/api/kds/lines/[lineId]/done/route.ts`) stay verbatim until F-08. The
default singletons are exported but not imported anywhere outside the
adapter package + contract wrappers until F-07/F-08 wire them.

**What F-06 explicitly does NOT do.**

- NO `OrdersService` or `lib/services/**` — F-07 territory.
- NO route migrations of any kind — F-08 territory.
- NO new `package.json` deps. Fake adapters are pure JS; Supabase SDK already
  there.
- NO schema changes. The DB-generated `reference` (`MFS-YYYY-NNNN`),
  the audit triggers, and the optimistic-lock CHECK constraints all stay as
  the migration shipped.
- NO `middleware.ts` edits.
- NO changes to F-05's files (`lib/ports/*.ts`, `lib/domain/*.ts`).
- NO F-04 lint-rule edits — `lib/adapters/supabase/**` is already in the
  allow-list (`.eslintrc.json:18`).
- NO modifications to the 6 existing integration test files. The 23/49
  failures documented as F-TD-03 in the F-05 cert
  (`docs/anvil/2026-06-09-f-05-cert.md` §F-TD-03) **stay broken**. F-08 owns
  the fix. F-06's contract tests bypass HTTP entirely and ship green
  regardless of F-TD-03 — see §1 recon for the root-cause finding the
  conductor surfaced.
- NO new ADR. Gate 1 confirmed F-06 IS the implementation of ADR-0002
  (vendor types stop at adapters) and ADR-0003 (one contract suite per port).
- NO modifications to ADR-0002, ADR-0003, ADR-0004, ADR-0005.
- NO modifications to CLAUDE.md (F-05 already aligned the Folder layout to
  ADR-0002).
- NO retirement of `lib/orders/types.ts` or `lib/orders/validation.ts` or
  `lib/orders/pickingList.ts` — F-08 deals with those when the routes are
  rewritten.
- NO `SET LOCAL app.current_user_id` audit wiring. The already-commented-out
  behaviour in `app/api/orders/route.ts:136-148` stays disabled. F-07's
  `OrdersService` or a later unit revisits.

---

## Source spec

- **Locked Gate 1 spec — the conductor handoff above.** Frozen. The
  hybrid factory + singleton pattern, the symmetric Supabase / Fake layout,
  the contract-suite factory signature, the wrapper test file paths, the
  SET LOCAL deferral, the KDS snapshot clock decision, the createOrder
  rollback semantics, the optimistic-lock + `.eq()` / `.is()` patterns,
  the per-method error contract pulled verbatim from F-05's JSDoc, the
  ADR-0002 line 27 vendor-types boundary discipline, the F-TD-03
  carry-forward, the 3-commit shape, and the PR title are all spec-locked.

- **ADR-0002 hexagonal shape and naming** —
  `docs/adr/0002-hexagonal-shape-and-naming.md`. F-06 implements the
  enforcement edge of this ADR. Cited verbatim throughout:
  - **Line 17** — "A `port` is an interface that the app owns […]." → F-06
    does not define new ports; it implements the three F-05 ports.
  - **Line 19** — "Adapters live in `lib/adapters/<vendor>/`. Fake adapters
    live in `lib/adapters/fake/`." → F-06 creates both directories.
  - **Line 21** — "Vendor SDK imports […] are permitted inside
    `lib/adapters/**` and nowhere else." → F-06's three Supabase adapters
    are the ONLY new vendor SDK imports allowed. F-04's allow-list glob
    (`.eslintrc.json:18`) already covers them. The three Fake adapters
    import zero SDKs by construction.
  - **Line 23** — "Services do not import other services directly." → Not
    load-bearing for F-06 (no services).
  - **Line 25** (depth rule) — Already paid by F-05's port definitions.
    F-06's adapters must HONOUR the depth rule by hiding the join /
    rollback / mapping the port JSDoc names — not by re-deciding it.
  - **Line 27** — "Vendor types never cross the port boundary." → **The
    single most important rule for F-06.** Inside each
    `lib/adapters/supabase/<Port>.ts`: `SupabaseClient`,
    `PostgrestResponse`, row shapes that PostgREST returns — all fine.
    Across the port boundary (function returns): ONLY domain types
    (`Order`, `OrderLine`, `Customer`, `Product`,
    `KdsOrderQueueSnapshot`, etc. from `@/lib/domain`). The adapter does
    the row→domain mapping inside its method body. Each adapter's file
    header comment documents this. The Fake adapter's internal `Map`
    types are domain types too (not DB-row shapes) — so the fake does
    not smuggle vendor shape into the contract.
  - **Line 43** — APOSD principles cited by name:
    - **Pull complexity downward (§10)** — the row→domain mapping lives
      inside the adapter; the service (F-07) sees clean domain shapes.
    - **Define errors out of existence (§11)** — reads return null/empty
      on miss, never throw. Adapters MUST honour this from F-05's JSDoc.
    - **Information hiding (§4)** — column projections, PostgREST embed
      syntax, the `.or()` disjunctive filter for KDS, the optimistic-lock
      `.eq()` clauses, the audit-log join — all hidden in adapter
      method bodies.

- **ADR-0003 strangler-fig migration and FREEZE rule** —
  `docs/adr/0003-strangler-fig-migration-and-freeze-rule.md`. F-06 is the
  second port-extraction unit named (line 19). Quoted verbatim from line 23:
  _"one shared test suite per port lives in `lib/ports/__contracts__/`
  that both the real adapter and the fake adapter pass."_ → F-06's contract
  suite files realise this prose. Line 29 — _"F-06 ships the first three
  Supabase adapters plus the matching fake adapters and the shared
  contract test suite that both pass."_ → This plan implements that
  paragraph verbatim.

- **ADR-0004 RLS posture** —
  `docs/adr/0004-rls-vs-service-role-security-model.md`. F-06's Supabase
  adapter uses the service-role client `supabaseService` from
  `@/lib/supabase` (which bypasses RLS). This matches today's route-layer
  behaviour. The per-request authenticated Supabase client (F-RLS-03) and
  the RLS rewrite (F-RLS-04..n) are independent tracks; F-06 ships on the
  current posture so the contract tests against the local stack don't have
  to set up per-test auth contexts. Documented in §5 Risks #5.

- **ADR-0005 F-01 narrowing** — `docs/adr/0005-f01-narrowed-raw-fetch-deferred-to-port-extractions.md`.
  No overlap. The 13 raw-fetch sites enumerated map to F-15/F-16/F-17/F-18/F-20/F-11;
  none are in the Orders domain. F-06 does not touch the Per-Site Map.

- **F-04 ESLint FREEZE rule** — `.eslintrc.json`. The override at line 18
  exempts `lib/supabase.ts`, `lib/adapters/supabase/**/*.ts`, and `tests/**`
  from `no-restricted-imports`. F-06's three Supabase adapter files land
  exactly under `lib/adapters/supabase/`, satisfying the allow-list. F-06's
  three Fake adapter files (`lib/adapters/fake/<Port>.ts`) import zero
  vendor SDKs by construction, so the rule does not fire on them even
  though they are not in the allow-list. **No edit to `.eslintrc.json` is
  needed.** Risk closed at recon.

- **F-INFRA-01 local Supabase stack** — exercised by F-06's three Supabase
  wrapper tests (the integration suite). The contract tests reuse the
  existing helpers from `tests/integration/_setup.ts` —
  `getServiceClient()`, `setupTestUsers()`, `setupTestCustomer()`,
  `getTestProduct()`, `cleanupTestData()`, `TEST_PREFIX`. F-06 introduces
  no new test-harness scaffolding. The `_loadEnv.ts` + `_assertStack.ts`
  setup chain wired by F-INFRA-01 catches "stack not running" failures
  before the adapter tests start.

- **F-FND-02 typed-error contract** — `lib/errors/`. F-06's Supabase
  adapters throw real `NotFoundError`, `ConflictError`, `ServiceError`
  instances. F-06's Fake adapters throw the same classes — same error
  identity, same code path in the consuming service. Type-narrowing
  callers (`if (err instanceof NotFoundError)`) work identically against
  both adapters.

- **F-FND-03 observability surface** — `lib/observability/log.ts`. F-06's
  Supabase adapters call `log.warn(...)` / `log.error(...)` on DB
  failures, matching the road-times pattern at
  `lib/road-times.ts:78-84` (the only adapter-like file on main that
  already speaks to `log`). The Fake adapters never log — there is
  nothing to recover from in-memory.

- **F-05 plan** — `docs/plans/2026-06-08-f-05-orders-domain-ports.md`.
  Structural template; this plan matches its 9-section shape, comment-discipline
  depth, design-it-twice ethic, and ~2500-line depth. F-06's plan extends the
  template with: §2.5 Contract suite case enumeration (the new gold), §3 step
  ordering across 3 commits (vs F-05's 3 commits over 9 files), §4 test
  matrix split between contract-against-Supabase (integration) and
  contract-against-Fake (unit), §5 risks specific to adapter behaviour
  (TOCTOU, query shape, fake-state isolation).

- **F-05 cert** — `docs/anvil/2026-06-09-f-05-cert.md` §F-TD-03 lines
  274-372. The 23/49 failing integration tests on main + branch are
  pre-existing, owned by F-08, and unrelated to F-06's ship. F-06's
  contract tests bypass HTTP entirely (direct-adapter, like
  `road-times.test.ts`) and ship green. **F-06's plan must surface the
  root-cause finding** the conductor articulated (the `api()` helper at
  `tests/integration/_setup.ts:207-246` calls `http://localhost:3000/api/*`
  — requiring `npm run dev` running separately, per the docstring at
  `_setup.ts:9-11`). F-08 will need to (a) auto-start the dev server like
  Playwright's `webServer` block does, (b) switch its route tests to
  direct-adapter (preferred — matches the F-06 pattern), or (c) require
  devs to start `npm run dev` before integration runs. Documented in §1.6
  and §5 Risk #1.

- **Pre-existing Orders code surface (the rip-out target).** Read in full
  before drafting any adapter shape — every claim in §2 is grounded in
  these line numbers:
  - `lib/ports/OrdersRepository.ts` (457 lines) — the contract. Every
    method's JSDoc names what the adapter must do. Read methodically;
    every invariant becomes a contract case in §2.5.
  - `lib/ports/CustomersRepository.ts` (47 lines) — same.
  - `lib/ports/ProductsRepository.ts` (57 lines) — same.
  - `lib/domain/Order.ts`, `lib/domain/Customer.ts`, `lib/domain/Product.ts`
    — the types the adapter maps to. Read in §1.3.
  - `lib/supabase.ts` (19 lines) — `supabaseService` client is the
    default the Supabase singleton uses (`createSupabaseOrdersRepository(supabaseService)`).
  - `lib/errors/index.ts` — `NotFoundError`, `ConflictError`,
    `ServiceError` — F-06's adapter throws.
  - `lib/observability/log.ts` — `log.warn` / `log.error` for adapter
    DB failures.
  - `app/api/orders/route.ts` (190 lines) — current implementation
    patterns:
    - `listOrders` query shape at lines 50-66 (filter axes, embed,
      ordering, limit clamp).
    - `createOrder` two-step insert + rollback at lines 153-183.
  - `app/api/orders/[id]/route.ts` (183 lines):
    - `findOrderById` embed shape at lines 48-59.
    - `updateOrder` patch + line-replace pattern at lines 115-175.
  - `app/api/orders/[id]/picking-list/route.ts` (245 lines):
    - `recordPrint` state-branching at lines 199-222.
  - `app/api/kds/lines/[lineId]/done/route.ts` (173 lines):
    - `markLineDone` idempotency + count + `markOrderCompleted` at
      lines 92-166.
  - `app/api/kds/orders/route.ts` (90 lines):
    - `listKdsQueue` disjunctive query + audit-log join at lines 32-89.
    - The PostgREST `.or()` form at line 50 is the canonical shape
      F-06 inherits.
  - `tests/integration/_setup.ts` — fixture helpers reused by F-06's
    Supabase wrapper tests.
  - `tests/integration/road-times.test.ts` — the direct-adapter test
    pattern (no `api()` helper). F-06's Supabase wrapper tests mirror
    this shape.
  - `tests/integration/orders-crud.test.ts`, `picking-list.test.ts`,
    `kds.test.ts` — **do NOT modify**. Read only to confirm the
    F-TD-03 root cause (all use `api()` HTTP helper).
  - `tests/unit/observability/Caller.test.ts`,
    `tests/unit/auth/session.test.ts` — style template for the
    fake-wrapper unit tests.
  - `tests/unit/ports/orders-domain.types.test.ts` — F-05's type-pin.
    Patterns reference for `describe` block structure + alias imports.
  - `supabase/migrations/20260530_001_order_pipeline_schema.sql` —
    schema source of truth. Confirms:
    - `orders.reference` is `DEFAULT generate_order_reference()` at
      line 71 — DB-generated, not adapter-generated.
    - `orders.state` is `order_state` enum (`'placed' | 'printed' |
'completed'`) at line 22.
    - `order_lines.uom` is `order_uom` enum (`'kg' | 'unit'`) at
      line 39.
    - State-machine CHECK constraints at line 92-96 — enforce
      timestamp-state invariants.
    - `order_lines` UNIQUE `(order_id, line_number)` at line 138.
    - `order_lines.done_at` / `done_by` CHECK at lines 133-136 —
      both NULL or both NOT NULL.
    - `order_audit_log` schema at lines 150-157 with `action`
      `order_audit_action` enum (`'created'|'edited'|'printed'|
'reprinted'|'line_added'|'line_edited'|'line_done'|'completed'`)
      at lines 26-36.
    - Audit triggers at lines 169-270 — fire automatically on any
      INSERT/UPDATE of `orders` / `order_lines`. The Fake adapter
      does NOT replicate the triggers; the contract tests do not
      assert audit-log behaviour against the Fake.

- **`no-restricted-imports` ESLint rule on F-06 files.** Verified at
  `.eslintrc.json:4-22`. The rule forbids `from '@supabase/supabase-js'`
  outside three allow-listed file globs. F-06 introduces three new files
  matching the `lib/adapters/supabase/**/*.ts` glob (override at line 18);
  the rule allows the import. F-06's Fake adapter files do NOT import
  `@supabase/supabase-js`, so the rule does not fire on them.

---

## Compliance

**NO runtime compliance impact.** F-06 ships adapter code that no production
path imports. The 5 Orders routes still go through the routes' inline
Supabase calls (untouched until F-08). No HTTP behaviour changes, no audit
behaviour changes, no auth flow changes. No new schema, no migration, no row
written by F-06 code outside the contract integration tests' fixtures (which
use the existing `TEST_PREFIX` cleanup).

**ADR-0002 line 27 vendor-types boundary — F-06 enforces.** Every F-06
Supabase adapter file header comment documents the rule. Every method body
does the row→domain mapping inside the function. No `SupabaseClient`,
`PostgrestResponse`, or `Database['public']['Tables'][...]` type leaks
across the function return. The contract test suite (§2.5) implicitly
verifies this by passing typed domain assertions that would fail if the
adapter returned a vendor-shape.

**ADR-0002 line 25 depth rule — F-06 honours.** F-05's port JSDoc named
the non-trivial decisions each method hides (rollback, optimistic lock,
disjunctive filter, audit-log join, etc.). F-06's adapters realise those
decisions inside the method body — they do not expose them on the
function signature or re-document them on the adapter file. The adapter
files have header comments only; per-method comments live in the port
file.

**ADR-0002 line 43 APOSD principle 11 (define errors out of existence) —
F-06 enforces on reads.** Read methods (`listOrders`, `findOrderById`,
`findCustomerById`, `findProductsByIds`, `listKdsQueue`) return
null/empty on miss across BOTH adapters. Contract tests assert this
verbatim. Write methods (`createOrder`, `updateOrder`, `recordPrint`,
`markLineDone`, `markOrderCompleted`) throw typed errors as documented
in F-05's JSDoc.

**ADR-0003 strangler-fig — F-06 ships the second port-extraction step.**
The 5 Orders routes still call `supabaseService` directly. F-08 swaps
them out. F-06's PR does NOT touch any route file; the production-path
grep in §4 confirms this.

**ADR-0003 contract test infrastructure — F-06 establishes the pattern.**
ADR-0003 line 23 required "one shared test suite per port lives in
`lib/ports/__contracts__/` that both the real adapter and the fake
adapter pass." F-06 realises this. The factory signature
(`<port>Contract(setup): void`) is the template every future
port-extraction unit copies. Documented in §2.4 + §2.5.

**ADR-0004 RLS posture.** F-06 uses `supabaseService` (service-role,
bypasses RLS) — matches today's routes. The contract integration tests
run against the local stack with the same service-role client.
Per-request authenticated client (F-RLS-03) is a separate track. No
edit needed.

**ADR-0005 F-01 narrowing.** No overlap with Per-Site Map.

**No new ADR required.** F-06 IS the implementation of ADR-0002 + ADR-0003
for the Orders bounded context.

**`SET LOCAL app.current_user_id` deferred.** The Orders routes today
contain a comment block at `app/api/orders/route.ts:136-148` explaining
why audit-trigger user-attribution is currently NULL (the supabase-js
client doesn't expose SET LOCAL through `.from()`). F-06 inherits this
deferral verbatim. The Supabase adapter does NOT call SET LOCAL; the
audit trigger reads `current_setting('app.current_user_id', true)`
which evaluates to empty → trigger writes NULL `user_id` to the audit
row. **This is identical to today's production behaviour.** F-07's
service or a later unit (F-19 HACCP / F-RLS-03) can revisit by
introducing a Postgres helper RPC or by using a per-request
authenticated client that surfaces the user via JWT claims.

---

## Branch + base

- **Base:** `main` HEAD `1de0fdc` —
  `feat(ports): Orders domain ports + types (F-05) (#22)`. Verified via
  `git log --oneline -1 main` returns
  `1de0fdc feat(ports): Orders domain ports + types (F-05) (#22)`. All
  F-05 prerequisites are on main: `lib/domain/`, `lib/ports/`,
  `tests/unit/ports/orders-domain.types.test.ts`. F-04's lint rule and
  F-INFRA-01's local stack are on main.
- **Branch:** `f-06-orders-supabase-adapters` (matches the conductor
  brief verbatim).
- **PR target:** `main`. **Not auto-merged.** Hakan ships via the same
  squash-merge flow as #15–#22 once ANVIL gates pass.
- **PR title:** `feat(adapters): Orders Lego adapters + contract tests (F-06)`.
- **Commit shape: 3 commits ADOPTED.** Rationale below.

### Commit shape — 3 vs 4 commits — chosen 3

Two shapes were considered:

- **3 commits (CHOSEN):**
  - **Commit 1** — `feat(adapters): supabase + fake + contracts (F-06)` —
    all 13 source files: 4 Supabase files (3 adapters + barrel), 4 Fake
    files (3 adapters + barrel), 3 contract suites + 1 contract barrel
    (no — `__contracts__/` does NOT get a barrel per the directory's
    purpose; contracts are imported by file name, not aggregated).
    Revise: 11 source files in Commit 1: 4 + 4 + 3.
  - **Commit 2** — `test(integration): contract tests against Supabase adapter (F-06)` —
    3 wrapper test files at `tests/integration/adapters/supabase/`.
  - **Commit 3** — `test(unit): contract tests against fake adapter (F-06)` —
    3 wrapper test files at `tests/unit/adapters/fake/`.

- **4 commits (rejected):**
  - **Commit 1a** — `feat(adapters): contract suites + fake adapters (F-06)` —
    contracts + fakes only (no SDK imports).
  - **Commit 1b** — `feat(adapters): Supabase adapters (F-06)` — three
    Supabase files (the SDK imports).
  - **Commit 2** — Supabase wrapper tests.
  - **Commit 3** — Fake wrapper tests.

**Why 3 over 4.** The 4-commit shape splits the source commit into "no-SDK
files" (contracts + fakes) and "SDK files" (Supabase adapters). This is
tighter for `no-restricted-imports` review — Commit 1a would be SDK-free
and Commit 1b would be the FREEZE-rule-exempt commit. The split has real
appeal: the contract files and Fake adapters are pure JavaScript, and the
Supabase adapters are the only SDK-using files in F-06.

But the contract suites are not behaviourally independent of the adapters —
they describe shared behaviour both must satisfy. Splitting them means
Commit 1a's `lib/ports/__contracts__/` files describe behaviour that
nothing implements yet (the Supabase adapters haven't landed), and Commit
1b's Supabase adapters introduce a barrel re-export that includes the
type aliases declared in Commit 1a. The git history reads cleaner when
both directions of the contract are introduced together: "the suites and
both implementations land as one architectural unit." `git bisect` on
Commit 1 either tells you "the unit is broken" or "the unit is fine" —
it never tells you "the unit half-landed." That is the bisect property
ATOMIC commits buy.

The 3-commit shape also matches F-05's 3-commit shape (`feat(domain)`,
`feat(ports)` + CLAUDE.md, `test(types)`) — same arity, same ordering
discipline (source → integration tests → unit tests). Subsequent
port-extraction units copy F-06's commit shape; consistency with F-05
matters for that.

**Rejected 4-commit consequence:** if Gate 2 disagrees, the planner has
no objection — the 4-commit shape is equally defensible. The PR commit
log just gets one extra line. Marked as a non-blocking style preference
in §5 Risk #6.

---

## 1. Repo recon findings

Captured before planning. Every claim grounded in the actual files on
`main` HEAD `1de0fdc`.

### 1.1 — F-05 ports are on main, intact, with the locked method count

`lib/ports/OrdersRepository.ts` is **457 lines**, exports
`OrdersRepository` (8 methods), `KdsOrderQueueSnapshot`, and
`KdsFlashEvent`. The 8 methods are: `listOrders`, `findOrderById`,
`createOrder`, `updateOrder`, `recordPrint`, `markLineDone`,
`markOrderCompleted`, `listKdsQueue`. The conductor handoff's "10
methods" count (referenced in the spec's "10 methods × ≥3 cases =
~30+") is 8 OrdersRepository + 1 CustomersRepository + 1
ProductsRepository = 10 total port methods across the three ports. Both
counts converge on the same total. **F-06's contract suites cover all 10.**

`lib/ports/CustomersRepository.ts` is **47 lines**, exports
`CustomersRepository` with the single method `findCustomerById(id):
Promise<Customer | null>`.

`lib/ports/ProductsRepository.ts` is **57 lines**, exports
`ProductsRepository` with the single method `findProductsByIds(ids):
Promise<readonly Product[]>`.

`lib/ports/index.ts` re-exports all three port types plus the two KDS
composite types. Nothing else.

### 1.2 — F-05 domain types are on main, intact, with the locked shape

`lib/domain/Order.ts` (275 lines) exports `OrderState`, `OrderUom`,
`OrderLine`, `Order`, `OrderFilter`, `OrderPatch`, `CreateOrderInput`,
`CreateOrderLineInput`. The `Order` shape carries embedded
`customer`, `creator`, `printer` projections plus `lines: readonly
OrderLine[]`. The `Order.reference` field is documented as the
DB-generated `MFS-YYYY-NNNN` string.

`lib/domain/Customer.ts` (54 lines) exports `Customer` with `id`,
`name`, `postcode: string | null`, `active: boolean`.

`lib/domain/Product.ts` (33 lines) exports `Product` with `id`, `code:
string | null`, `name`, `boxSize: string | null`.

`lib/domain/index.ts` is the type-only barrel re-export.

**No edits to these files in F-06.** The plan §2 confirms.

### 1.3 — The schema source of truth and the DB-generated reference

`supabase/migrations/20260530_001_order_pipeline_schema.sql` defines:

- **Line 50** — `CREATE SEQUENCE order_reference_seq`.
- **Lines 52-65** — `generate_order_reference()` function returning
  `format('MFS-%s-%s', v_year, lpad(v_seq::text, 4, '0'))`.
- **Line 71** — `orders.reference text NOT NULL UNIQUE DEFAULT
generate_order_reference()`. → **DB-generated.** The Supabase adapter's
  `createOrder` does NOT pass a `reference` field; it reads back the
  one Postgres assigned via `.select('id, reference, created_at,
...').single()`.
- **Lines 22, 39** — `order_state` enum (`placed/printed/completed`) and
  `order_uom` enum (`kg/unit`). These match F-05's `OrderState` and
  `OrderUom` literal unions verbatim. **Type-pin fixture at
  `tests/unit/ports/orders-domain.types.test.ts` enforces this.**
- **Lines 92-96** — orders state-machine CHECK constraint enforces the
  timestamp invariants:
  - `state='placed'` ⟺ `printed_at IS NULL AND completed_at IS NULL`
  - `state='printed'` ⟺ `printed_at IS NOT NULL AND completed_at IS NULL`
  - `state='completed'` ⟺ `printed_at IS NOT NULL AND completed_at IS NOT NULL`
    → **The Supabase adapter's `recordPrint` and `markOrderCompleted`
    always set the timestamp when transitioning state.** Documented in
    §2.1 and asserted in the contract suite §2.5.
- **Lines 128-131** — `order_lines` `(product_id, ad_hoc_description)`
  XOR CHECK. Adapter does not need to enforce; the schema does.
  Contract test will assert that violating the XOR raises
  `ServiceError`.
- **Lines 132-136** — `(done_at, done_by)` both-or-neither CHECK.
  Adapter's `markLineDone` always sets both together.
- **Line 138** — `UNIQUE (order_id, line_number)`. Adapter's
  `createOrder` and `updateOrder` (line replacement) assign
  `line_number = i + 1` from the input array order, matching the
  current route at `app/api/orders/[id]/route.ts:160-168`.
- **Lines 26-36** — `order_audit_action` enum:
  `'created'|'edited'|'printed'|'reprinted'|'line_added'|'line_edited'|
'line_done'|'completed'`. The KDS snapshot's `KdsFlashEvent.action`
  union (`'edited'|'line_edited'|'reprinted'|'line_added'`) is a
  strict subset. **The adapter's `listKdsQueue` filters
  `.in('action', ['edited', 'line_edited', 'reprinted', 'line_added'])`
  matching today's route at `app/api/kds/orders/route.ts:71`.**
- **Lines 169-270** — audit triggers. Fire automatically on every
  INSERT/UPDATE. **The Supabase adapter does nothing special** — the
  triggers are transparent at the SDK level. The Fake adapter does
  NOT replicate the triggers; the contract suite's audit-related
  cases (the `listKdsQueue` flash assertions) are Supabase-only and
  must be conditionally skipped for the Fake adapter wrapper (see §2.5).

### 1.4 — Today's route patterns are the rip-out target

The 5 Orders routes contain the patterns the adapter inherits:

- `app/api/orders/route.ts` lines 50-66 (`listOrders`) — exact embed:

  ```
  id, reference, customer_id, delivery_date, delivery_notes, order_notes,
  state, created_by, created_at, printed_by, printed_at, completed_at,
  customer:customer_id ( id, name, postcode ),
  creator:created_by   ( id, name ),
  lines:order_lines ( id, line_number, product_id, ad_hoc_description, quantity, uom, notes, done_at, done_by )
  ```

  Ordering: `delivery_date ASC`, `created_at ASC`. Limit clamp:
  `Math.min(200, Math.max(1, parseInt(limit, 10) || 50))`. F-06
  inherits both verbatim.
  **Important difference:** today's route does NOT embed `printer`.
  The Supabase adapter for `listOrders` SHOULD embed `printer:printed_by
( id, name )` to match the F-05 `Order.printer` shape. F-05's port
  JSDoc at `OrdersRepository.ts:128-130` says the embed is "customer +
  creator + printer + lines" for both `listOrders` and `findOrderById`.
  Documented in §2.1.

- `app/api/orders/[id]/route.ts` lines 48-59 (`findOrderById`) — embed
  includes `printer:printed_by ( id, name )`. F-06's adapter uses this
  exact shape for both `listOrders` AND `findOrderById`.

- `app/api/orders/route.ts` lines 153-183 (`createOrder`) — two-step
  insert + rollback:
  1. `INSERT INTO orders (...) RETURNING id, reference`.
  2. `INSERT INTO order_lines (...) WHERE order_id = <new>` with
     `line_number = i + 1` per line.
  3. If lines INSERT fails: `DELETE FROM orders WHERE id = <new>`
     (CASCADE handles any partial lines), then throw.
     F-06's adapter wraps this. Additionally, the F-05 contract says the
     adapter returns the **persisted Order** — so after the two-step
     insert, the adapter does a third `.select(...).single()` round-trip
     to read back the full Order shape with embedded customer + creator
  - (null) printer + lines. Three round-trips total for happy-path
    createOrder. (Today's route returns `{ id, reference }` only — the
    service or caller calls `findOrderById` separately. F-06's port
    contract requires the full Order at line 184 of F-05's JSDoc — the
    adapter pays the read-back cost.)

- `app/api/orders/[id]/route.ts` lines 115-175 (`updateOrder`) —
  orders-row patch + optional line replacement:
  1. `UPDATE orders SET ... WHERE id = <id>` if `patch` non-empty.
  2. If `lineReplacement !== undefined`:
     a. `DELETE FROM order_lines WHERE order_id = <id>`.
     b. `INSERT INTO order_lines ...` with `line_number = i + 1` per line.
  3. Read back the order via the same embed as `findOrderById` and
     return the full Order.
     F-06's adapter wraps this. **Note:** F-05's JSDoc at
     `OrdersRepository.ts:208-210` clarifies the port checks that the
     order exists (NotFoundError) but does NOT enforce state-permission
     (role-based — service layer's job). The state-machine CHECK
     constraint on the DB still bites if a patch tries to violate it →
     ConflictError. F-06 surfaces this.

- `app/api/orders/[id]/picking-list/route.ts` lines 199-222
  (`recordPrint`) — state-branching:
  - `state='placed'`: `UPDATE orders SET state='printed', printed_at=?,
printed_by=? WHERE id=? AND state='placed'` (optimistic lock).
  - `state='printed'`: `UPDATE orders SET printed_at=?, printed_by=?
WHERE id=?` (no state change, no extra .eq guard — reprint).
  - `state='completed'`: today's route at line 195-196 throws 403
    BEFORE the update. F-06 surfaces this as ConflictError.
    After the state-determining read + update, the adapter reads back
    the order via the embed shape and returns the full Order.
    **Three round-trips for `recordPrint`:** read state, update,
    read back.

- `app/api/kds/lines/[lineId]/done/route.ts` lines 92-166
  (`markLineDone`):
  1. Read the line by id (id, order_id, done_at).
  2. If `done_at !== null` → return `{ alreadyDone: true, orderId,
allLinesDone: <compute> }`. Idempotent path.
  3. Read parent order state. If `placed` → throw ConflictError. If
     `completed` → throw ConflictError. (Both: today's route returns
     409 at lines 109 and 115).
  4. `UPDATE order_lines SET done_at=?, done_by=? WHERE id=? AND
done_at IS NULL` (TOCTOU guard via `.is('done_at', null)` at
     today's route line 124).
  5. Count remaining lines: `SELECT count FROM order_lines WHERE
order_id=? AND done_at IS NULL` (head-only `count: 'exact', head:
     true` at today's route line 142-146).
  6. Return `{ alreadyDone: false, orderId, allLinesDone: count === 0 }`.
     **The adapter does NOT call `markOrderCompleted`** — the caller
     (F-07 service / use-case) does, conditional on `allLinesDone`.

  **Idempotent path's `allLinesDone` value.** When the line was
  already done, what does `allLinesDone` mean? The conductor's locked
  spec says: "If `done_at` already set → returns `{ alreadyDone:
true, orderId, allLinesDone: <count==0> }`." → The adapter still
  performs the remaining-lines count in the idempotent path, returning
  the current truth at the moment of the call. This matches the
  practical behaviour today's route at line 92-94 — it short-circuits
  before re-marking but the caller doesn't get a stale `allLinesDone`
  flag (today's route doesn't even expose one; F-06 introduces it).
  Two round-trips on the idempotent path: read line + read count.
  Five round-trips total on the happy path: read line, read parent
  state, update line, count remaining, read back (no — F-05's port
  JSDoc returns `{ alreadyDone, orderId, allLinesDone }`, NOT an
  Order, so no read-back). Four round-trips on the happy path.

- `app/api/kds/lines/[lineId]/done/route.ts` lines 155-160
  (`markOrderCompleted`, separated method in F-05):
  1. `UPDATE orders SET state='completed', completed_at=? WHERE
id=? AND state='printed'` (optimistic lock).
  2. If zero rows affected → throw ConflictError.
  3. Read back the order via the embed shape and return the full
     Order.
     **Two round-trips: update + read back.**

  **How does the Supabase adapter know "zero rows affected"?**
  PostgREST's `.update(...).select()` returns `data.length === 0`
  when no row matched. Today's route at line 159 uses `.eq('state',
'printed')` without checking the return shape; F-06's adapter
  must check. Documented in §2.1.

- `app/api/kds/orders/route.ts` lines 38-79 (`listKdsQueue`) — the
  composite snapshot:
  1. Capture `const serverTime = new Date()` ONCE at method entry.
  2. Compute `since = new Date(serverTime.getTime() - <since param ms>)`
     ISO. The `since` parameter from F-05's JSDoc is the
     completed-orders window — today's route hardcodes 90 seconds at
     line 36. F-06's adapter accepts the param.
  3. Query orders with the **exact PostgREST `.or()` form** at line
     50: `.or(\`state.eq.printed,and(state.eq.completed,
     completed_at.gte.${sinceIso})\`)`. **Confirmed.**
  4. Order by `delivery_date ASC`, `printed_at ASC`. Limit 100.
  5. If `orders.length > 0`: query `order_audit_log` for `order_id
IN (<ids>) AND action IN ('edited', 'line_edited', 'reprinted',
'line_added') AND created_at >= <serverTime - 60s>` (flash
     lookback hard-coded at 60 seconds per F-05's JSDoc line
     449-451).
  6. Build and return `KdsOrderQueueSnapshot` with `orders`,
     `recentFlashes`, `serverTime: serverTime.toISOString()`.
     **The snapshot clock is `serverTime`, captured at step 1.**
     Documented in §2.1 and asserted in contract suite §2.5.

### 1.5 — The lint rule already covers the Supabase adapter path

`.eslintrc.json:18` lists `lib/adapters/supabase/**/*.ts` in the
override allow-list. F-06's three new files at this path are exempted
from `no-restricted-imports`. **No edit to `.eslintrc.json` is needed
for F-06.** Confirmed by inspection.

The Fake adapter files (`lib/adapters/fake/<Port>.ts`) are NOT in the
allow-list. **They do not need to be** — they import zero vendor SDKs
by construction. The rule does not fire on them.

The contract suite files (`lib/ports/__contracts__/<Port>.contract.ts`)
are NOT in the allow-list. **They do not need to be** — they import only
domain types and the port type. They do NOT import Vitest at module
load (the `setup` parameter is the only Vitest-aware code path); the
factory function calls `describe`/`it`/`beforeEach` from Vitest. Since
the contracts files live under `lib/` not `tests/`, they need an
import of `vitest`. Vitest does NOT match the `tests/**` override
glob at .eslintrc.json:18. **But Vitest is not `@supabase/supabase-js`** —
the FREEZE rule only restricts that one module. `import { describe, it,
expect, beforeEach } from 'vitest'` is allowed under any path. Lint
risk closed.

### 1.6 — F-TD-03 root cause confirmed; F-06 ships green

The conductor's spec correctly identifies the root cause: the failing
tests in `orders-crud.test.ts`, `picking-list.test.ts`, `kds.test.ts`
all use the `api()` helper at `tests/integration/_setup.ts:207-246`,
which `fetch(\`${BASE_URL}${path}\`)`where`BASE_URL =
process.env.INTEGRATION_BASE_URL ?? 'http://localhost:3000'`. The
docstring at `\_setup.ts:9-11`explicitly says "Run with the Next.js dev
server already running locally: npm run dev (in one terminal) npm run
test:integration (in another)". Without`npm run dev`running, every`fetch`resolves with a connection error or — under the F-INFRA-01
config — to a dev-server that boots inside the test runner via the`webServer`Playwright equivalent (no — Playwright has`webServer`;
Vitest does NOT have an equivalent, confirmed at
`vitest.integration.config.ts`which has no`webServer` config). So
the integration tests' shared dev-server runs as a separate process.
The 500s the cert documents are the dev server boot races
described in §F-TD-03 hypotheses 1+4.

`tests/integration/road-times.test.ts` does NOT use `api()`. It
imports `loadRoadTimes()` from `@/lib/road-times` and calls it directly
in-process, with `getServiceClient()` for fixture seeding. **This is
the pattern F-06's three Supabase wrapper tests follow.** The adapter
methods are called directly (`repo.createOrder(...)`, `repo.listOrders({})`),
no HTTP, no dev server.

**Forward implication for F-08.** F-08's planner inherits the F-TD-03
fix decision. Three paths:

- **(a)** Auto-start the dev server inside `vitest.integration.config.ts`
  (mimicking Playwright's `webServer` block). Requires Vitest's `globalSetup`
  hook + a process spawn that boots `next dev`, waits for ready, then
  tears down.
- **(b)** Switch the route tests to **direct-adapter** testing —
  i.e. the new F-08 route handlers will be thin shims over
  `OrdersService`, and the integration tests can call the service
  directly without going through HTTP. This matches the F-06 pattern
  exactly. **Preferred** — it's already proven by F-06.
- **(c)** Document the dev-server requirement in the cert and require
  developers to start `npm run dev` manually. **Status quo, not a
  fix.**

§5 Risk #1 surfaces these for F-08's planner.

### 1.7 — Test wrapper helpers ready for reuse

`tests/integration/_setup.ts` exposes:

- `getServiceClient()` — direct Supabase service-role client. F-06's
  Supabase wrapper tests use this in `setup()` to build a fresh
  adapter via `createSupabaseOrdersRepository(getServiceClient())`.
- `setupTestUsers()` — returns one user per role with `TEST_PREFIX`
  names. F-06's contract suite uses `.admin.id` as `createdBy` /
  `printedBy`, `.butcher.id` as `doneBy`. Idempotent — handles
  existing fixture rows.
- `setupTestCustomer()` — returns one `{ id, name }`. Idempotent.
- `getTestProduct()` — returns one `{ id, name, code }`. Falls back to
  any active product if no test product exists. Idempotent.
- `cleanupTestData()` — `DELETE FROM orders WHERE customer_id =
<test_customer_id>`. ON CASCADE deletes lines + audit log.
- `TEST_PREFIX = 'ANVIL-TEST-'` — used by the helpers.

F-06's Supabase contract wrapper test uses these in `beforeAll` /
`afterAll`. The contract suite uses `beforeEach` / `afterEach` for
per-case isolation (each case creates its own order and tears it down).

**No new setup helpers needed in F-06.** Confirmed at recon.

### 1.8 — The Fake adapter's `Map` types must be domain types

The conductor's critical question 4 asks: confirm the row → domain
mapping is symmetric across both adapters, and the Fake adapter's
internal Map types are NOT DB row shapes — they are domain types.
**Confirmed.** F-06's Fake adapter stores `Map<string, Order>` (full
domain shape), not `Map<string, OrderRow>`. The mutations operate on
domain types directly: `map.set(id, { ...order, state: 'printed',
printedAt: when.toISOString() })`. This keeps the Fake free of any
implicit "this is what a row looks like" assumption. The contract
suite then never needs to mock vendor shapes anywhere.

The conductor's critical question 5 asks: how does the Fake generate
references? The DB does it for Supabase; the Fake has to do it itself.
**Confirmed:** Fake's reference shape is `FAKE-YYYY-NNNN` (FAKE prefix
to distinguish from real, year + 4-digit zero-padded sequence
incrementing inside the Fake's module-singleton scope). The contract
suite does NOT assert the prefix — it asserts the shape is a non-empty
string that the Fake assigns deterministically. The Supabase adapter
asserts the prefix is `MFS-`. Documented in §2.2 and §2.5.

### 1.9 — Production-path importers must remain at zero after F-06

F-05's plan §4 layer 11 introduced the grep
`grep -rn "from ['\"]@/lib/ports\|from ['\"]@/lib/domain" app/
lib/services lib/usecases 2>/dev/null` to confirm zero production-path
imports. F-06 introduces ONE additional production-path concern:
`grep -rn "from ['\"]@/lib/adapters" app/ lib/services lib/usecases
2>/dev/null` MUST also return zero. The 5 Orders routes still call
`supabaseService` directly — they do NOT import any adapter. F-08
flips this.

---

## 2. Files to add (the file inventory)

17 new files. No file is edited (CLAUDE.md was already aligned by F-05).
Every file gets a header comment that follows the F-05 convention:
path, purpose, what it hides, what it does NOT hide, ADR references.
Per-method comments stay on the PORT file (F-05); adapters get one
file-level comment and rely on the port for method-level intent.

### 2.0 — Directory structure created

```
lib/adapters/
  supabase/
    OrdersRepository.ts
    CustomersRepository.ts
    ProductsRepository.ts
    index.ts
  fake/
    OrdersRepository.ts
    CustomersRepository.ts
    ProductsRepository.ts
    index.ts

lib/ports/__contracts__/
  OrdersRepository.contract.ts
  CustomersRepository.contract.ts
  ProductsRepository.contract.ts

tests/integration/adapters/supabase/
  OrdersRepository.test.ts
  CustomersRepository.test.ts
  ProductsRepository.test.ts

tests/unit/adapters/fake/
  OrdersRepository.test.ts
  CustomersRepository.test.ts
  ProductsRepository.test.ts
```

`lib/adapters/` does NOT exist on main; F-06 creates it. `lib/ports/__contracts__/`
does NOT exist on main; F-06 creates it. The `tests/integration/adapters/`
and `tests/unit/adapters/` subtrees do NOT exist on main; F-06 creates them.

### 2.1 — `lib/adapters/supabase/OrdersRepository.ts`

**Header (50 lines)** — file purpose, the ADR-0002 line 27 boundary
discipline, references to the port file as the spec.

```ts
/**
 * lib/adapters/supabase/OrdersRepository.ts
 *
 * Supabase implementation of `OrdersRepository` (lib/ports/OrdersRepository.ts).
 * This is the ONLY place in the Orders bounded context where
 * `@supabase/supabase-js` may be imported (ADR-0003 FREEZE rule,
 * .eslintrc.json:18 allow-list).
 *
 * Boundary discipline (ADR-0002 line 27 — mandatory):
 *   Vendor shapes (SupabaseClient, PostgrestResponse, the row shapes
 *   PostgREST returns) live INSIDE this file. They never cross the
 *   port boundary. Every method:
 *     1. Queries Supabase using vendor shapes.
 *     2. Maps the row→domain inside the function body via private
 *        helpers (rowToOrder, rowToOrderLine).
 *     3. Returns ONLY domain types (`Order`, `OrderLine`, etc. from
 *        `@/lib/domain`).
 *
 * Construction (hybrid factory + singleton):
 *   - `createSupabaseOrdersRepository(client)` factory — tests pass
 *     `getServiceClient()` to get a fresh adapter against a
 *     test-scoped client.
 *   - `supabaseOrdersRepository` singleton — pre-wired against
 *     `supabaseService` from `@/lib/supabase`. App code (F-07
 *     OrdersService, F-08 routes) imports this.
 *
 * Error contract (per F-05 OrdersRepository JSDoc, verbatim):
 *   listOrders         → ServiceError only
 *   findOrderById      → ServiceError only (returns null on miss)
 *   findProductsByIds  → n/a (different port)
 *   createOrder        → ServiceError (rollback attempted)
 *   updateOrder        → NotFoundError / ConflictError / ServiceError
 *   recordPrint        → NotFoundError / ConflictError / ServiceError
 *   markLineDone       → NotFoundError / ConflictError / ServiceError
 *   markOrderCompleted → NotFoundError / ConflictError / ServiceError
 *   listKdsQueue       → ServiceError only
 *
 * Audit user-attribution (SET LOCAL) deferred:
 *   The audit triggers (supabase/migrations/20260530_001:170-218) read
 *   `current_setting('app.current_user_id', true)`. The supabase-js
 *   client doesn't expose SET LOCAL through `.from()`. F-06 inherits
 *   today's route behaviour: the trigger writes NULL user_id to the
 *   audit row. F-07 or a later unit revisits via a Postgres helper RPC
 *   or per-request authenticated client.
 *   See `app/api/orders/route.ts:136-148` for the original deferral.
 *
 * On every DB failure path: `log.warn` or `log.error` is called with
 * the structured payload (method, args summary, error.message), then
 * the appropriate typed error is thrown.
 */
```

**Imports (10 lines):**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseService } from "@/lib/supabase";
import { NotFoundError, ConflictError, ServiceError } from "@/lib/errors";
import { log } from "@/lib/observability/log";
import type {
  Order,
  OrderLine,
  OrderFilter,
  OrderPatch,
  CreateOrderInput,
  CreateOrderLineInput,
} from "@/lib/domain";
import type {
  OrdersRepository,
  KdsOrderQueueSnapshot,
  KdsFlashEvent,
} from "@/lib/ports";
```

**Row shape types (internal, ~30 lines):**

```ts
// Internal row shapes — these are VENDOR-shaped and NEVER leave this
// file. Each method's mapping function converts to the domain shape
// before returning.
type OrderRow = {
  id: string;
  reference: string;
  customer_id: string;
  delivery_date: string;
  delivery_notes: string | null;
  order_notes: string | null;
  state: "placed" | "printed" | "completed";
  created_by: string;
  created_at: string;
  printed_by: string | null;
  printed_at: string | null;
  completed_at: string | null;
  customer: { id: string; name: string; postcode: string | null } | null;
  creator: { id: string; name: string } | null;
  printer: { id: string; name: string } | null;
  lines: OrderLineRow[];
};
type OrderLineRow = {
  id: string;
  line_number: number;
  product_id: string | null;
  ad_hoc_description: string | null;
  quantity: number;
  uom: "kg" | "unit";
  notes: string | null;
  done_at: string | null;
  done_by: string | null;
  order_id?: string;
};
```

**Single canonical SELECT clause (~10 lines), defined once at module
scope:**

```ts
const ORDER_SELECT = `
  id, reference, customer_id, delivery_date, delivery_notes, order_notes,
  state, created_by, created_at, printed_by, printed_at, completed_at,
  customer:customer_id ( id, name, postcode ),
  creator:created_by   ( id, name ),
  printer:printed_by   ( id, name ),
  lines:order_lines ( id, line_number, product_id, ad_hoc_description, quantity, uom, notes, done_at, done_by )
`;
```

This is used by `listOrders`, `findOrderById`, `createOrder` (read-back),
`updateOrder` (read-back), `recordPrint` (read-back), `markOrderCompleted`
(read-back). Defining once removes duplication and ensures the
`printer` embed is consistent everywhere.

**Two pure mapping functions (~30 lines):**

```ts
function rowToOrderLine(r: OrderLineRow, orderId: string): OrderLine {
  return {
    id: r.id,
    orderId,
    lineNumber: r.line_number,
    productId: r.product_id,
    adHocDescription: r.ad_hoc_description,
    quantity: r.quantity,
    uom: r.uom,
    notes: r.notes,
    doneAt: r.done_at,
    doneBy: r.done_by,
  };
}
function rowToOrder(r: OrderRow): Order {
  const lines = (r.lines ?? [])
    .slice()
    .sort((a, b) => a.line_number - b.line_number)
    .map((l) => rowToOrderLine(l, r.id));
  return {
    id: r.id,
    reference: r.reference,
    customerId: r.customer_id,
    deliveryDate: r.delivery_date,
    deliveryNotes: r.delivery_notes,
    orderNotes: r.order_notes,
    state: r.state,
    createdBy: r.created_by,
    createdAt: r.created_at,
    printedBy: r.printed_by,
    printedAt: r.printed_at,
    completedAt: r.completed_at,
    customer: r.customer
      ? {
          id: r.customer.id,
          name: r.customer.name,
          postcode: r.customer.postcode,
        }
      : null,
    creator: r.creator ? { id: r.creator.id, name: r.creator.name } : null,
    printer: r.printer ? { id: r.printer.id, name: r.printer.name } : null,
    lines,
  };
}
```

**Factory function (~200 lines for all 8 method bodies):**

```ts
export function createSupabaseOrdersRepository(client: SupabaseClient): OrdersRepository {
  return {
    async listOrders(filter: OrderFilter): Promise<readonly Order[]> { … },
    async findOrderById(id: string): Promise<Order | null> { … },
    async createOrder(input: CreateOrderInput, createdBy: string): Promise<Order> { … },
    async updateOrder(id: string, patch: OrderPatch, lineReplacement?: readonly CreateOrderLineInput[]): Promise<Order> { … },
    async recordPrint(id: string, printedBy: string, when: Date): Promise<Order> { … },
    async markLineDone(lineId: string, doneBy: string, when: Date): Promise<{ alreadyDone: boolean; orderId: string; allLinesDone: boolean }> { … },
    async markOrderCompleted(id: string, when: Date): Promise<Order> { … },
    async listKdsQueue(since: Date): Promise<KdsOrderQueueSnapshot> { … },
  }
}
```

**Per-method body sketches (key behaviour):**

- **`listOrders(filter)`** — Apply optional `.eq()` per filter field
  (state, deliveryDate, customerId, createdBy). Clamp `limit` to
  `min(200, max(1, filter.limit ?? 50))`. Order by
  `delivery_date ASC, created_at ASC`. If `error` → log.error +
  throw ServiceError. Else return `(data ?? []).map(rowToOrder)`.

- **`findOrderById(id)`** — `.select(ORDER_SELECT).eq('id', id)
.maybeSingle()`. If `error` (and not the "no rows" code) → log.error +
  throw ServiceError. If `data === null` → return null. Else
  `rowToOrder(data)`.

- **`createOrder(input, createdBy)`** — Three round-trips:
  1. INSERT orders row with `{ customer_id, delivery_date,
delivery_notes, order_notes, created_by }`. RETURN `id, reference,
created_at`. If error → log.error + throw ServiceError.
  2. INSERT order_lines rows with `{ order_id, line_number: i+1,
... }`. If error → DELETE FROM orders WHERE id = <new>;
     log.error("rollback succeeded" or "rollback also failed") + throw
     ServiceError.
  3. `findOrderById(newId)` → return.

- **`updateOrder(id, patch, lineReplacement?)`** — Five-round-trip-max:
  1. Read current state via `.select('state').eq('id', id).maybeSingle()`.
     If null → throw NotFoundError. If error → log + throw ServiceError.
  2. If `patch` non-empty: UPDATE orders. If state-machine CHECK violates
     → throw ConflictError. If other DB error → log + throw ServiceError.
  3. If `lineReplacement !== undefined`: DELETE lines, then INSERT new
     lines with assigned `line_number = i+1`.
  4. Read back via `findOrderById(id)` — must be non-null (we already
     confirmed exists at step 1). If somehow null (raced delete) →
     throw NotFoundError.

- **`recordPrint(id, printedBy, when)`** — Three round-trips:
  1. Read current state via `.select('state').eq('id', id).maybeSingle()`.
     If null → throw NotFoundError. If state === 'completed' → throw
     ConflictError (per F-05 JSDoc line 278).
  2. If state === 'placed': UPDATE with `.eq('state', 'placed')`
     optimistic lock; set state='printed', printed_at=when.toISOString(),
     printed_by=printedBy. If error → log + throw ServiceError. If zero
     rows → throw ConflictError (race with concurrent print).
     If state === 'printed': UPDATE printed_at=when.toISOString(),
     printed_by=printedBy. NO state change. NO `.eq('state', 'printed')`
     guard — reprint is idempotent against concurrent reprints; the
     audit trigger always emits a 'reprinted' row.
  3. `findOrderById(id)` → return.

- **`markLineDone(lineId, doneBy, when)`** — Four-round-trip happy
  path, two-round-trip idempotent path:
  1. Read line `{ id, order_id, done_at }` via `.select('id, order_id,
done_at').eq('id', lineId).maybeSingle()`. If null → throw
     NotFoundError. If error → log + throw ServiceError.
  2. If `done_at !== null` (idempotent path): count remaining lines via
     `.select('id', { count: 'exact', head: true }).eq('order_id',
orderId).is('done_at', null)`. Return `{ alreadyDone: true, orderId,
allLinesDone: count === 0 }`.
  3. Read parent order state via `.select('state').eq('id', orderId)
.maybeSingle()`. If null → throw NotFoundError. If state === 'placed'
     → throw ConflictError. If state === 'completed' → throw
     ConflictError.
  4. UPDATE line: `.update({ done_at: when.toISOString(), done_by:
doneBy }).eq('id', lineId).is('done_at', null)`. TOCTOU guard via
     `.is('done_at', null)`. If error → log + throw ServiceError.
  5. Count remaining lines: `.select('id', { count: 'exact', head: true })
.eq('order_id', orderId).is('done_at', null)`. If error → log
     warn + return `{ alreadyDone: false, orderId, allLinesDone:
false }` (degraded — line was marked, count failed; matches today's
     route fallback at line 148-152).
  6. Return `{ alreadyDone: false, orderId, allLinesDone: count === 0 }`.

- **`markOrderCompleted(id, when)`** — Three round-trips:
  1. UPDATE with `.eq('state', 'printed')` optimistic lock; set
     state='completed', completed_at=when.toISOString(). Use
     `.select('id')` so we can inspect data.length. If error → log +
     throw ServiceError. If `data.length === 0`: - 1a. Read current state via `.select('state').eq('id', id)
.maybeSingle()`. If null → throw NotFoundError. Else (state was
     NOT 'printed', so the lock missed) → throw ConflictError.
  2. `findOrderById(id)` → return.

- **`listKdsQueue(since)`** — Composite snapshot, two main queries +
  one clock:
  1. `const serverTime = new Date()` (captured ONCE at method entry).
  2. `const sinceIso = since.toISOString()` (the param; today's route
     uses `serverTime - 90s` but F-06's port accepts it from the
     caller).
  3. Query orders with the exact `.or()` form from
     `app/api/kds/orders/route.ts:50`:
     ``      .or(`state.eq.printed,and(state.eq.completed,completed_at.gte.${sinceIso})`)
     ``
     Order by `delivery_date ASC, printed_at ASC`. Limit 100. Embed
     `customer:customer_id ( id, name, postcode )`, `creator:created_by
( id, name )`, `printer:printed_by ( id, name )` (note: today's
     KDS route does NOT embed creator/printer — F-06's adapter does
     because the `Order` shape requires them, even if null). Embed
     lines via the same shape. If error → log.error + throw
     ServiceError.
  4. If `orders.length > 0`: - `const flashSince = new Date(serverTime.getTime() - 60_000).toISOString()`. - Query `order_audit_log`: `.select('order_id, action,
created_at').in('order_id', <ids>).in('action', ['edited',
'line_edited', 'reprinted', 'line_added']).gte('created_at',
flashSince)`. If error → log.warn + treat as empty (degraded —
     orders still returned).
  5. Return `{ orders: mapped, recentFlashes: mapped, serverTime:
serverTime.toISOString() }`.

**Confirmation of conductor's critical question 3 (PostgREST query
shape for listKdsQueue):** the adapter uses the exact form from
`app/api/kds/orders/route.ts:50` —

```
.or(`state.eq.printed,and(state.eq.completed,completed_at.gte.${sinceIso})`)
```

No "cleaner shape" is proposed because (a) the existing form is the
documented PostgREST way to express OR with a nested AND, (b) any
alternative (two separate queries unioned in JS) costs an extra
round-trip, and (c) future readers cross-referencing the F-06
adapter against the original route will recognise the form. Documented
as Risk #3 in §5 in case Gate 2 prefers an explicit two-query shape.

**Default singleton at file end:**

```ts
export const supabaseOrdersRepository: OrdersRepository =
  createSupabaseOrdersRepository(supabaseService);
```

### 2.2 — `lib/adapters/supabase/CustomersRepository.ts`

**Header (~20 lines)** — same boundary discipline as Orders.

**Factory:**

```ts
export function createSupabaseCustomersRepository(
  client: SupabaseClient,
): CustomersRepository {
  return {
    async findCustomerById(id: string): Promise<Customer | null> {
      const { data, error } = await client
        .from("customers")
        .select("id, name, postcode, active")
        .eq("id", id)
        .maybeSingle();
      if (error) {
        log.error("CustomersRepository.findCustomerById DB error", {
          id,
          error: error.message,
        });
        throw new ServiceError("Customer lookup failed", { cause: error });
      }
      if (data === null) return null;
      return {
        id: data.id,
        name: data.name,
        postcode: data.postcode,
        active: data.active,
      };
    },
  };
}
export const supabaseCustomersRepository: CustomersRepository =
  createSupabaseCustomersRepository(supabaseService);
```

### 2.3 — `lib/adapters/supabase/ProductsRepository.ts`

**Header (~20 lines)** — same.

**Factory:**

```ts
export function createSupabaseProductsRepository(
  client: SupabaseClient,
): ProductsRepository {
  return {
    async findProductsByIds(
      ids: readonly string[],
    ): Promise<readonly Product[]> {
      if (ids.length === 0) return []; // short-circuit, no round-trip
      const { data, error } = await client
        .from("products")
        .select("id, code, name, box_size")
        .in("id", ids as string[]);
      if (error) {
        log.error("ProductsRepository.findProductsByIds DB error", {
          ids: ids.length,
          error: error.message,
        });
        throw new ServiceError("Product lookup failed", { cause: error });
      }
      return (data ?? []).map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        boxSize: r.box_size,
      }));
    },
  };
}
export const supabaseProductsRepository: ProductsRepository =
  createSupabaseProductsRepository(supabaseService);
```

### 2.4 — `lib/adapters/supabase/index.ts` — barrel re-export

```ts
/**
 * lib/adapters/supabase/index.ts
 *
 * Barrel re-export for the Supabase adapter package. Import surface:
 *   import {
 *     supabaseOrdersRepository,
 *     supabaseCustomersRepository,
 *     supabaseProductsRepository,
 *     createSupabaseOrdersRepository,
 *     createSupabaseCustomersRepository,
 *     createSupabaseProductsRepository,
 *   } from '@/lib/adapters/supabase'
 *
 * Both factories and pre-wired singletons are exported. App code (F-07
 * service, F-08 routes) imports the singletons. Tests import the
 * factories with a test-scoped client.
 */
export {
  createSupabaseOrdersRepository,
  supabaseOrdersRepository,
} from "./OrdersRepository";
export {
  createSupabaseCustomersRepository,
  supabaseCustomersRepository,
} from "./CustomersRepository";
export {
  createSupabaseProductsRepository,
  supabaseProductsRepository,
} from "./ProductsRepository";
```

### 2.5 — `lib/adapters/fake/OrdersRepository.ts`

**Header (~40 lines)** — same boundary discipline as Supabase but
inverted: the Fake stores DOMAIN types in its Maps; there is no row
shape anywhere.

**Imports:**

```ts
import { NotFoundError, ConflictError } from "@/lib/errors";
import type {
  Order,
  OrderLine,
  OrderFilter,
  OrderPatch,
  CreateOrderInput,
  CreateOrderLineInput,
} from "@/lib/domain";
import type { OrdersRepository, KdsOrderQueueSnapshot } from "@/lib/ports";
```

**Factory state model:**

```ts
interface FakeState {
  orders: Map<string, Order>; // id → Order (domain shape)
  // The fake does NOT model order_audit_log. listKdsQueue returns
  // empty recentFlashes always. Documented in §2.5 contract suite —
  // audit-related cases are Supabase-only.
  nextOrderSeq: number; // for FAKE-YYYY-NNNN reference
}
```

**Reference generator (`FAKE-` prefix):**

```ts
function nextFakeReference(state: FakeState): string {
  const year = new Date().getUTCFullYear();
  const seq = String(state.nextOrderSeq++).padStart(4, "0");
  return `FAKE-${year}-${seq}`;
}
```

**Factory:**

```ts
export function createFakeOrdersRepository(): OrdersRepository {
  const state: FakeState = { orders: new Map(), nextOrderSeq: 1 };

  return {
    async listOrders(filter: OrderFilter): Promise<readonly Order[]> {
      let out = Array.from(state.orders.values());
      if (filter.state) out = out.filter((o) => o.state === filter.state);
      if (filter.deliveryDate)
        out = out.filter((o) => o.deliveryDate === filter.deliveryDate);
      if (filter.customerId)
        out = out.filter((o) => o.customerId === filter.customerId);
      if (filter.createdBy)
        out = out.filter((o) => o.createdBy === filter.createdBy);
      out.sort((a, b) => {
        if (a.deliveryDate !== b.deliveryDate)
          return a.deliveryDate < b.deliveryDate ? -1 : 1;
        return a.createdAt < b.createdAt ? -1 : 1;
      });
      const limit = Math.min(200, Math.max(1, filter.limit ?? 50));
      return out.slice(0, limit);
    },

    async findOrderById(id: string): Promise<Order | null> {
      return state.orders.get(id) ?? null;
    },

    async createOrder(input, createdBy): Promise<Order> {
      const id = crypto.randomUUID();
      const reference = nextFakeReference(state);
      const createdAt = new Date().toISOString();
      const lines: OrderLine[] = input.lines.map((l, i) => ({
        id: crypto.randomUUID(),
        orderId: id,
        lineNumber: i + 1,
        productId: l.productId,
        adHocDescription: l.adHocDescription,
        quantity: l.quantity,
        uom: l.uom,
        notes: l.notes,
        doneAt: null,
        doneBy: null,
      }));
      const order: Order = {
        id,
        reference,
        customerId: input.customerId,
        deliveryDate: input.deliveryDate,
        deliveryNotes: input.deliveryNotes,
        orderNotes: input.orderNotes,
        state: "placed",
        createdBy,
        createdAt,
        printedBy: null,
        printedAt: null,
        completedAt: null,
        customer: null,
        creator: null,
        printer: null,
        lines,
      };
      state.orders.set(id, order);
      return order;
    },

    async updateOrder(id, patch, lineReplacement) {
      const existing = state.orders.get(id);
      if (!existing) throw new NotFoundError(`Order ${id} not found`);
      const lines = lineReplacement
        ? lineReplacement.map((l, i) => ({
            id: crypto.randomUUID(),
            orderId: id,
            lineNumber: i + 1,
            productId: l.productId,
            adHocDescription: l.adHocDescription,
            quantity: l.quantity,
            uom: l.uom,
            notes: l.notes,
            doneAt: null,
            doneBy: null,
          }))
        : existing.lines;
      const next: Order = {
        ...existing,
        deliveryDate:
          patch.deliveryDate !== undefined
            ? patch.deliveryDate
            : existing.deliveryDate,
        deliveryNotes:
          patch.deliveryNotes !== undefined
            ? patch.deliveryNotes
            : existing.deliveryNotes,
        orderNotes:
          patch.orderNotes !== undefined
            ? patch.orderNotes
            : existing.orderNotes,
        lines,
      };
      state.orders.set(id, next);
      return next;
    },

    async recordPrint(id, printedBy, when) {
      const existing = state.orders.get(id);
      if (!existing) throw new NotFoundError(`Order ${id} not found`);
      if (existing.state === "completed") {
        throw new ConflictError(`Order ${id} is completed; cannot reprint`);
      }
      const whenIso = when.toISOString();
      const next: Order = {
        ...existing,
        state: "printed",
        printedAt: whenIso,
        printedBy,
      };
      state.orders.set(id, next);
      return next;
    },

    async markLineDone(lineId, doneBy, when) {
      // Find the line and its parent order
      for (const order of state.orders.values()) {
        const line = order.lines.find((l) => l.id === lineId);
        if (!line) continue;
        if (line.doneAt !== null) {
          // Idempotent path — still compute allLinesDone
          const remaining = order.lines.filter((l) => l.doneAt === null).length;
          return {
            alreadyDone: true,
            orderId: order.id,
            allLinesDone: remaining === 0,
          };
        }
        if (order.state === "placed")
          throw new ConflictError(`Order ${order.id} not printed yet`);
        if (order.state === "completed")
          throw new ConflictError(`Order ${order.id} already completed`);
        const whenIso = when.toISOString();
        const nextLines = order.lines.map((l) =>
          l.id === lineId ? { ...l, doneAt: whenIso, doneBy } : l,
        );
        const remaining = nextLines.filter((l) => l.doneAt === null).length;
        state.orders.set(order.id, { ...order, lines: nextLines });
        return {
          alreadyDone: false,
          orderId: order.id,
          allLinesDone: remaining === 0,
        };
      }
      throw new NotFoundError(`Order line ${lineId} not found`);
    },

    async markOrderCompleted(id, when) {
      const existing = state.orders.get(id);
      if (!existing) throw new NotFoundError(`Order ${id} not found`);
      if (existing.state !== "printed") {
        throw new ConflictError(
          `Order ${id} state is ${existing.state}; expected 'printed'`,
        );
      }
      const whenIso = when.toISOString();
      const next: Order = {
        ...existing,
        state: "completed",
        completedAt: whenIso,
      };
      state.orders.set(id, next);
      return next;
    },

    async listKdsQueue(since): Promise<KdsOrderQueueSnapshot> {
      const serverTime = new Date();
      const sinceIso = since.toISOString();
      const orders = Array.from(state.orders.values())
        .filter(
          (o) =>
            o.state === "printed" ||
            (o.state === "completed" &&
              o.completedAt !== null &&
              o.completedAt >= sinceIso),
        )
        .sort((a, b) => {
          if (a.deliveryDate !== b.deliveryDate)
            return a.deliveryDate < b.deliveryDate ? -1 : 1;
          const aPrint = a.printedAt ?? "";
          const bPrint = b.printedAt ?? "";
          return aPrint < bPrint ? -1 : 1;
        })
        .slice(0, 100);
      // Fake does not model audit log — recentFlashes is always empty.
      return {
        orders,
        recentFlashes: [],
        serverTime: serverTime.toISOString(),
      };
    },
  };
}

export const fakeOrdersRepository: OrdersRepository =
  createFakeOrdersRepository();
```

### 2.6 — `lib/adapters/fake/CustomersRepository.ts`

```ts
export function createFakeCustomersRepository(
  seed?: readonly Customer[],
): CustomersRepository {
  const store = new Map<string, Customer>();
  for (const c of seed ?? []) store.set(c.id, c);
  return {
    async findCustomerById(id) {
      return store.get(id) ?? null;
    },
  };
}
export const fakeCustomersRepository: CustomersRepository =
  createFakeCustomersRepository();
```

Optional `seed` parameter lets tests pre-populate. The singleton starts
empty.

### 2.7 — `lib/adapters/fake/ProductsRepository.ts`

```ts
export function createFakeProductsRepository(
  seed?: readonly Product[],
): ProductsRepository {
  const store = new Map<string, Product>();
  for (const p of seed ?? []) store.set(p.id, p);
  return {
    async findProductsByIds(ids) {
      const out: Product[] = [];
      for (const id of ids) {
        const p = store.get(id);
        if (p) out.push(p);
      }
      return out;
    },
  };
}
export const fakeProductsRepository: ProductsRepository =
  createFakeProductsRepository();
```

### 2.8 — `lib/adapters/fake/index.ts` — barrel

```ts
export {
  createFakeOrdersRepository,
  fakeOrdersRepository,
} from "./OrdersRepository";
export {
  createFakeCustomersRepository,
  fakeCustomersRepository,
} from "./CustomersRepository";
export {
  createFakeProductsRepository,
  fakeProductsRepository,
} from "./ProductsRepository";
```

### 2.9 — `lib/ports/__contracts__/OrdersRepository.contract.ts` — the gold

**Header (~40 lines):**

```ts
/**
 * lib/ports/__contracts__/OrdersRepository.contract.ts
 *
 * Shared behavioural contract for OrdersRepository. Both adapters —
 * the Supabase real implementation and the Fake in-memory
 * implementation — pass the SAME suite. This file is the BEHAVIOURAL
 * contract; the port (lib/ports/OrdersRepository.ts) is the
 * STRUCTURAL contract.
 *
 * Pattern (locked at Gate 1 — F-06 establishes the template):
 *   Export a single function:
 *     ordersRepositoryContract(setup: () => Promise<{
 *       repo: OrdersRepository
 *       customerId: string       // valid customer id the repo can use
 *       userId: string           // valid user id (createdBy/printedBy/doneBy)
 *       butcherId: string        // valid butcher user id for line-done
 *       productId: string        // valid product id for catalogued lines
 *       supportsAuditLog: boolean // Supabase: true; Fake: false
 *       cleanup: () => Promise<void>
 *     }>): void
 *
 * The suite declares a top-level describe('OrdersRepository contract', ...)
 * with beforeEach() calling setup() and afterEach() calling cleanup().
 * Each test case gets a fresh repo + fresh fixtures.
 *
 * Why supportsAuditLog as a capability flag rather than two separate
 * suites: the audit-driven cases (listKdsQueue recent flashes) are the
 * ONLY cases that differ between Supabase and Fake. Splitting into two
 * suites duplicates 30+ cases for the sake of 2-3 audit-specific
 * assertions. The flag is a pragmatic accommodation; documented and
 * confined to those cases.
 *
 * Every case here corresponds to an invariant documented in F-05's
 * port JSDoc. The case names reference the JSDoc line where the
 * invariant is documented (e.g. "OrdersRepository.ts:148 — returns
 * null on findById miss"). This makes the contract auditable against
 * the port spec.
 */
```

**Function shape:**

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NotFoundError, ConflictError } from "@/lib/errors";
import type { OrdersRepository } from "@/lib/ports";

export interface OrdersContractSetup {
  repo: OrdersRepository;
  customerId: string;
  userId: string;
  butcherId: string;
  productId: string;
  supportsAuditLog: boolean;
  cleanup: () => Promise<void>;
}

export function ordersRepositoryContract(
  setup: () => Promise<OrdersContractSetup>,
): void {
  describe("OrdersRepository contract", () => {
    let ctx: OrdersContractSetup;
    beforeEach(async () => {
      ctx = await setup();
    });
    afterEach(async () => {
      await ctx.cleanup();
    });
    // ... case blocks below ...
  });
}
```

**Case enumeration (the gold).** Below is the per-method case list.
Each case name references the port JSDoc line documenting the
invariant. F-06 ships approximately **34 contract cases** for
OrdersRepository (≥3 per method × 8 methods = 24 minimum; F-06 lands
~34 to cover the edge cases the port JSDoc spells out).

Each case is independently runnable — no test depends on another's
side effects (beforeEach/afterEach reset state).

#### `listOrders` — 4 cases (port file lines 96-123)

1. **"returns empty array when no orders match"** — port JSDoc line
   119-120 ("Empty array on no match"). Verifies: `await repo.listOrders({
state: 'completed' })` (no completed orders seeded) returns `[]`.
2. **"applies the state filter exactly"** — Seed three orders in
   `placed`, two in `printed`. `repo.listOrders({ state: 'placed' })`
   returns 3.
3. **"clamps limit to [1, 200] (default 50)"** — Seed 250 orders.
   `repo.listOrders({})` returns 50. `repo.listOrders({ limit: 1000 })`
   returns 200. `repo.listOrders({ limit: 0 })` returns 1.
4. **"orders by deliveryDate ASC then createdAt ASC"** — Seed 4 orders
   with mixed dates + created_at; assert returned order.

#### `findOrderById` — 3 cases (port file lines 125-148)

1. **"returns the order with embedded customer + creator + lines"** —
   Create an order; assert `findOrderById(id)` returns Order with
   `customer.id === customerId`, `creator.id === userId`,
   `lines.length === input.lines.length`, lines sorted by
   `lineNumber` ascending. Port JSDoc line 128-130 (embed) + line 179
   (lines sorted).
2. **"returns null on miss (does NOT throw NotFoundError)"** — port
   JSDoc line 143-146. `await repo.findOrderById('00000000-0000-0000-
0000-000000000000')` resolves to `null`.
3. **"embedded printer is null when state is placed"** — Create order
   (defaults to placed); assert `order.printer === null`. Port JSDoc
   line 177 ("printed_by(id, name) — populated once the order has
   been printed").

#### `createOrder` — 4 cases (port file lines 150-189)

1. **"persists the order with all lines and assigns lineNumber by
   index"** — Create with 3 lines. Verify each line's `lineNumber ===
i + 1`. Verify `order.id` is a UUID string, `order.reference` is
   non-empty (per-adapter prefix: Supabase `MFS-`, Fake `FAKE-`).
2. **"returns the persisted Order with generated id + reference +
   createdAt + lines"** — Verify the returned Order has populated
   `id`, `reference`, `createdAt`. Verify the embedded `lines.length`
   matches input.
3. **"rolls back the orders row if line insertion fails (no orphan)"**
   — Construct an input with one valid line and one line with an
   invalid `productId` (random UUID that does not exist; Postgres FK
   violates). Call `repo.createOrder(input, userId)` — assert it
   throws (ServiceError for Supabase; on the Fake there's no FK so
   this case is **Supabase-only** — see note below). Then assert
   `repo.listOrders({ customerId })` does NOT contain any order with
   the would-be order id. **The Fake skips this case** — there's no FK,
   so the failure mode doesn't exist. Documented inline:
   `it.skipIf(!ctx.supportsAuditLog)` — no, wait, supportsAuditLog is
   about audit log. We need a separate `supportsFkValidation` flag.
   **Revise:** the contract setup carries `supportsFkValidation:
boolean` too. Supabase: true (FKs enforce). Fake: false (no FK
   model). Documented in §2.5 setup interface.
4. **"sets state='placed' by default"** — `order.state === 'placed'`.

#### `updateOrder` — 5 cases (port file lines 191-241)

1. **"throws NotFoundError when id does not exist"** — `await
expect(repo.updateOrder('00000000-...', {})).rejects.toThrow(NotFoundError)`.
2. **"applies the orders-row patch"** — Create, then update with
   `{ deliveryNotes: 'urgent' }`. Verify the returned Order has
   `deliveryNotes === 'urgent'` and other fields unchanged.
3. **"undefined patch field means don't touch; null means set to NULL"**
   — Create with `deliveryNotes: 'original'`. Update with
   `{ orderNotes: 'added' }` (deliveryNotes absent). Verify
   `deliveryNotes === 'original'`. Update with `{ deliveryNotes: null }`.
   Verify `deliveryNotes === null`. (Port JSDoc line 226-228.)
4. **"replaces lines fully when lineReplacement is provided"** — Create
   with 2 lines. Update with `lineReplacement` of 3 different lines.
   Verify `order.lines.length === 3`, line numbers are 1/2/3.
5. **"no-op when patch is empty and lineReplacement is undefined"** —
   Create, then update with `{}` (no fields, no lines). Verify the
   returned Order equals the original (modulo any update timestamp,
   which the schema doesn't track). Port JSDoc line 197.

#### `recordPrint` — 5 cases (port file lines 243-281)

1. **"throws NotFoundError when id does not exist"** — `await
expect(repo.recordPrint('00000000-...', userId, new Date())).rejects.
toThrow(NotFoundError)`.
2. **"transitions placed → printed and sets printedAt + printedBy"** —
   Create (state='placed'). Call `recordPrint`. Verify
   `order.state === 'printed'`, `order.printedBy === userId`,
   `order.printedAt === when.toISOString()`. Verify
   `order.completedAt === null`.
3. **"reprint on printed state bumps printedAt without changing state"**
   — Create + recordPrint with `when=t1`. Call recordPrint with
   `when=t2`. Verify `state === 'printed'`, `printedAt === t2.toISOString()`,
   `printedBy === userId` (the second call's userId).
4. **"throws ConflictError when state is completed"** — Create +
   recordPrint + (force completion: call `markOrderCompleted` if all
   lines done, else use the test helper to set state — actually the
   contract suite can't easily complete an order without all lines
   done; revise: use `repo.markLineDone` to mark all lines done,
   then `repo.markOrderCompleted`, then assert `recordPrint` throws
   ConflictError). Port JSDoc line 278.
5. **"first-print optimistic-lock race rejects second concurrent
   first-print"** — **SKIP for Fake** (no concurrency).
   `supportsConcurrency: boolean` flag in setup. Supabase: true.
   Fake: false. The case fires only on Supabase: spawn two
   concurrent `recordPrint` calls on the same `placed` order; one
   wins (returns state=printed), the other either also returns
   state=printed with bumped printedAt (reprint path because between
   the read-current-state and the update the state changed to
   printed) OR throws (race in the read+conditional update). The
   contract: at most one of the two ever sets the FIRST `printedBy`;
   the order ends in `printed` state regardless. **Optional case** —
   marked as `it.skipIf(!ctx.supportsConcurrency)` and not counted in
   the 34. Surfaced in §5 Risk #4.

#### `markLineDone` — 6 cases (port file lines 283-355)

1. **"throws NotFoundError when lineId does not exist"** — `await
expect(repo.markLineDone('00000000-...', butcherId, new
Date())).rejects.toThrow(NotFoundError)`.
2. **"throws ConflictError when parent state is placed"** — Create.
   Get first line's id. Call `markLineDone`. Assert ConflictError.
   Port JSDoc line 327-332.
3. **"throws ConflictError when parent state is completed"** — Create
   - recordPrint + mark all lines done + markOrderCompleted. Try
     marking another line done (won't exist because all marked) — use
     a different idempotency assertion: actually we already marked the
     last line in the markAllLines step; reformulate: after order
     completes, repeated `markLineDone` on a line that's already
     `doneAt != null` returns `{ alreadyDone: true, ... }` (the
     idempotency path WINS over the state-completed check). This
     matches today's route at `kds/lines/.../route.ts:92-94`. **Revise
     this case** to: "returns alreadyDone:true even if parent state is
     completed (idempotency wins over state check)". Port JSDoc line
     289-292 + line 327 are in tension — the JSDoc says ConflictError
     if parent state is `placed` OR `completed`, but the idempotency
     check happens FIRST. Today's route at line 92 explicitly: "Must
     come BEFORE the order-state check". The port JSDoc was tightened
     at Gate 1 — re-read: line 343 says "ConflictError if the parent
     order is `placed` or `completed` (line cannot be marked done in
     those states)" but line 291-293 says "if the line is already
     `done_at != null`, return ... without writing". The two co-exist:
     the idempotency check is structural (the LINE is done), and the
     state check is for un-done lines on a non-printed parent. Both
     conditions can be true simultaneously only if the system reached
     an inconsistent state (a line was done but the parent transitioned
     back to placed — impossible per the state machine, or the parent
     completed and there's a remaining un-done line — also impossible
     per design). The contract suite asserts BOTH:
   * 3a. "ConflictError on a placed parent with no done lines"
   * 3b. "alreadyDone:true on a completed parent with a done line" —
     which is the normal completion flow.
4. **"marks a line done; returns allLinesDone=true when it was the last
   un-done line"** — Create with 1 line. recordPrint. Call
   `markLineDone` on that line. Assert `{ alreadyDone: false, orderId,
allLinesDone: true }`.
5. **"marks a line done; returns allLinesDone=false when other un-done
   lines remain"** — Create with 3 lines. recordPrint. Call
   `markLineDone` on line 1. Assert `{ alreadyDone: false, orderId,
allLinesDone: false }`.
6. **"idempotent: second call on already-done line returns
   alreadyDone=true with current allLinesDone"** — Create + recordPrint
   - markLineDone twice on the same line. Second call:
     `{ alreadyDone: true, orderId, allLinesDone: (count == 0) }`. Port
     JSDoc line 289-292.

#### `markOrderCompleted` — 4 cases (port file lines 357-393)

1. **"throws NotFoundError when id does not exist"** — `await
expect(repo.markOrderCompleted('00000000-...', new Date())).rejects.
toThrow(NotFoundError)`.
2. **"throws ConflictError when current state is placed"** — Create
   (placed). Call `markOrderCompleted`. Assert ConflictError. Port
   JSDoc line 390.
3. **"throws ConflictError when current state is already completed"** —
   Create + recordPrint + mark lines done + markOrderCompleted.
   Second call to `markOrderCompleted`. Assert ConflictError.
4. **"transitions printed → completed and sets completedAt"** — Create
   - recordPrint + markOrderCompleted. Assert `state === 'completed'`,
     `completedAt === when.toISOString()`.

#### `listKdsQueue` — 6 cases (port file lines 395-456)

1. **"returns empty arrays + serverTime when nothing matches"** — Run
   without seeding. Assert `orders === []`, `recentFlashes === []`,
   `serverTime` is a valid ISO string between the call's start and
   end timestamps.
2. **"serverTime is captured between call start and return"** —
   Sandwich the call: `const t0 = new Date(); const snap = await
repo.listKdsQueue(new Date(t0.getTime() - 60_000)); const t1 = new
Date()`. Assert `t0 <= new Date(snap.serverTime) <= t1`. **The
   conductor's critical question.** Port JSDoc line 446-449.
3. **"includes orders where state='printed'"** — Create + recordPrint.
   `listKdsQueue(new Date(0))` (very old since). Assert the order is
   in `orders`.
4. **"includes orders where state='completed' AND completedAt >=
   since"** — Create + recordPrint + complete. `listKdsQueue(new
Date(0))`. Assert the order is in `orders`.
5. **"excludes completed orders older than since"** — Create +
   recordPrint + complete with completedAt < since. `listKdsQueue(now)`.
   Assert the order is NOT in `orders`.
6. **"recentFlashes contains audit events within the last 60s"** —
   **Supabase-only** (`it.skipIf(!ctx.supportsAuditLog)`). Create +
   recordPrint (triggers a 'printed' audit row — but 'printed' is
   NOT in the flash set). recordPrint a SECOND time (triggers
   'reprinted', WHICH IS in the flash set). `listKdsQueue(new Date(0))`.
   Assert `recentFlashes.find(e => e.orderId === order.id && e.action
=== 'reprinted')` is present.

**Total OrdersRepository cases:** 4 + 3 + 4 + 5 + 5 + 6 + 4 + 6 = **37
cases** (counting all the planned cases including the corrected
markLineDone 3a/3b split as 2 cases instead of 1; minus the optional
concurrency case at recordPrint #5).

#### `CustomersRepository` contract — 3 cases

`lib/ports/__contracts__/CustomersRepository.contract.ts`:

```ts
export interface CustomersContractSetup {
  repo: CustomersRepository;
  knownCustomerId: string; // a customer seeded by the wrapper
  cleanup: () => Promise<void>;
}

export function customersRepositoryContract(
  setup: () => Promise<CustomersContractSetup>,
): void {
  describe("CustomersRepository contract", () => {
    let ctx: CustomersContractSetup;
    beforeEach(async () => {
      ctx = await setup();
    });
    afterEach(async () => {
      await ctx.cleanup();
    });

    // 1. "returns the customer with id, name, postcode, active"
    // 2. "returns null on miss (does NOT throw NotFoundError)"
    // 3. "returns the active flag verbatim (does NOT pre-filter on active)"
  });
}
```

#### `ProductsRepository` contract — 4 cases

```ts
// 1. "returns empty array when ids is empty (no round-trip implied)"
// 2. "returns only the matched rows; ignores unknown ids"
// 3. "returns full domain shape (id, code, name, boxSize)"
// 4. "preserves caller-passed id order? — NO. The contract does NOT guarantee order; callers compute their own map. Port JSDoc line 56-57."
```

**Total contract cases across all 3 ports:** 37 + 3 + 4 = **44 cases**.
Run against 2 adapters = ~88 test executions for F-06. (Within the 60-72
the conductor estimated; the planner overcounted slightly because of
the markLineDone case split and a 6th `listKdsQueue` case.) Documented
in §4 as the test-matrix expectation.

### 2.10 — `tests/integration/adapters/supabase/OrdersRepository.test.ts`

**~60 lines.** Imports the contract suite + wraps with Supabase setup.

```ts
/**
 * tests/integration/adapters/supabase/OrdersRepository.test.ts
 *
 * F-06 — runs the shared OrdersRepository contract against the Supabase
 * adapter wired to the local Supabase stack (F-INFRA-01).
 *
 * Prerequisites:
 *   npm run db:up          (one terminal)
 *   npm run test:integration -- adapters/supabase/Orders   (another)
 *
 * No npm run dev required — this test calls the adapter directly,
 * bypassing the Next.js routes entirely (matches the F-06 direct-
 * adapter pattern; sister to road-times.test.ts).
 */
import { ordersRepositoryContract } from "@/lib/ports/__contracts__/OrdersRepository.contract";
import { createSupabaseOrdersRepository } from "@/lib/adapters/supabase";
import {
  getServiceClient,
  setupTestUsers,
  setupTestCustomer,
  getTestProduct,
  cleanupTestData,
  TEST_PREFIX,
} from "../../_setup";

ordersRepositoryContract(async () => {
  const client = getServiceClient();
  const repo = createSupabaseOrdersRepository(client);
  const users = await setupTestUsers();
  const cust = await setupTestCustomer();
  const prod = await getTestProduct();
  return {
    repo,
    customerId: cust.id,
    userId: users.admin.id,
    butcherId: users.butcher.id,
    productId: prod.id,
    supportsAuditLog: true,
    supportsFkValidation: true,
    supportsConcurrency: true,
    cleanup: async () => {
      await cleanupTestData();
    },
  };
});
```

### 2.11 — `tests/integration/adapters/supabase/CustomersRepository.test.ts`

```ts
import { customersRepositoryContract } from "@/lib/ports/__contracts__/CustomersRepository.contract";
import { createSupabaseCustomersRepository } from "@/lib/adapters/supabase";
import { getServiceClient, setupTestCustomer } from "../../_setup";

customersRepositoryContract(async () => {
  const client = getServiceClient();
  const repo = createSupabaseCustomersRepository(client);
  const cust = await setupTestCustomer();
  return {
    repo,
    knownCustomerId: cust.id,
    cleanup: async () => {}, // setupTestCustomer is idempotent; no per-case row creation
  };
});
```

### 2.12 — `tests/integration/adapters/supabase/ProductsRepository.test.ts`

```ts
import { productsRepositoryContract } from "@/lib/ports/__contracts__/ProductsRepository.contract";
import { createSupabaseProductsRepository } from "@/lib/adapters/supabase";
import { getServiceClient, getTestProduct } from "../../_setup";

productsRepositoryContract(async () => {
  const client = getServiceClient();
  const repo = createSupabaseProductsRepository(client);
  const prod = await getTestProduct();
  return { repo, knownProductId: prod.id, cleanup: async () => {} };
});
```

### 2.13 — `tests/unit/adapters/fake/OrdersRepository.test.ts`

```ts
/**
 * tests/unit/adapters/fake/OrdersRepository.test.ts
 *
 * F-06 — runs the shared OrdersRepository contract against the Fake
 * in-memory adapter. No DB. No network. No Supabase stack required.
 *
 * The Fake passes a STRICT SUBSET of the contract:
 *   - audit-log cases skip (supportsAuditLog=false)
 *   - FK-violation rollback case skips (supportsFkValidation=false)
 *   - optimistic-lock concurrency case skips (supportsConcurrency=false)
 */
import { ordersRepositoryContract } from "@/lib/ports/__contracts__/OrdersRepository.contract";
import { createFakeOrdersRepository } from "@/lib/adapters/fake";

// Stable test UUIDs — the fake doesn't enforce anything, but the
// contract suite's id parameters need to be plausible strings.
const CUSTOMER_ID = "00000000-0000-0000-0000-000000000c01";
const USER_ID = "00000000-0000-0000-0000-000000000a01";
const BUTCHER_ID = "00000000-0000-0000-0000-000000000b01";
const PRODUCT_ID = "00000000-0000-0000-0000-000000000p01";

ordersRepositoryContract(async () => {
  const repo = createFakeOrdersRepository();
  return {
    repo,
    customerId: CUSTOMER_ID,
    userId: USER_ID,
    butcherId: BUTCHER_ID,
    productId: PRODUCT_ID,
    supportsAuditLog: false,
    supportsFkValidation: false,
    supportsConcurrency: false,
    cleanup: async () => {}, // fresh repo per case via beforeEach
  };
});
```

### 2.14 — `tests/unit/adapters/fake/CustomersRepository.test.ts`

```ts
import { customersRepositoryContract } from "@/lib/ports/__contracts__/CustomersRepository.contract";
import { createFakeCustomersRepository } from "@/lib/adapters/fake";

const KNOWN_ID = "00000000-0000-0000-0000-000000000c01";

customersRepositoryContract(async () => {
  const repo = createFakeCustomersRepository([
    { id: KNOWN_ID, name: "Fake Customer", postcode: "XX1 1XX", active: true },
  ]);
  return { repo, knownCustomerId: KNOWN_ID, cleanup: async () => {} };
});
```

### 2.15 — `tests/unit/adapters/fake/ProductsRepository.test.ts`

```ts
import { productsRepositoryContract } from "@/lib/ports/__contracts__/ProductsRepository.contract";
import { createFakeProductsRepository } from "@/lib/adapters/fake";

const KNOWN_ID = "00000000-0000-0000-0000-000000000p01";

productsRepositoryContract(async () => {
  const repo = createFakeProductsRepository([
    { id: KNOWN_ID, code: "BC-001", name: "Fake Product", boxSize: "10 kg" },
  ]);
  return { repo, knownProductId: KNOWN_ID, cleanup: async () => {} };
});
```

---

## 3. Steps (implementer's instruction set)

The plan is committed across **3 commits** in this exact order. The
implementer follows TDD red-green-refactor inside each commit's slice.

### Step 0 — Setup (no commits)

1. From `main` HEAD `1de0fdc`, cut a new branch:
   `git switch -c f-06-orders-supabase-adapters`.
2. Confirm clean tree: `git status` shows zero uncommitted files.
3. Confirm preconditions exist:
   - `ls lib/ports/OrdersRepository.ts` — exists (F-05).
   - `ls lib/domain/Order.ts` — exists (F-05).
   - `ls lib/adapters/` — does NOT exist (F-06 creates).
   - `ls lib/ports/__contracts__/` — does NOT exist (F-06 creates).
4. Confirm local stack: `supabase status` shows a running stack OR run
   `npm run db:up`. If stack is up but seed is stale, `npm run db:reset`.
   The new integration tests depend on the seed for the test
   customer + test product.

### Step 1 — Commit 1: source files

Create all 11 source files in this order (each TDD'd against the
contract suite that lands in the same commit):

1. **Contract suites first.** Create
   `lib/ports/__contracts__/CustomersRepository.contract.ts`,
   `ProductsRepository.contract.ts`, `OrdersRepository.contract.ts`
   in that order (smallest first; same pattern). Define the setup
   interfaces and the factory functions. Write all case blocks. **At
   this point no adapter exists, so the suites cannot run yet — that
   is correct.**
2. **Fake adapters second.** Create
   `lib/adapters/fake/CustomersRepository.ts`, `ProductsRepository.ts`,
   `OrdersRepository.ts`, `index.ts`. Each follows the §2 sketches.
3. **Local sanity check (no test file yet).** Build a temp test file
   `/tmp/sanity.test.ts` that imports the Fake + contract and runs
   it; confirm it compiles and the contract executes against the
   fake. (This is a temporary check during development; the file is
   discarded before commit.) Alternatively, copy
   `tests/unit/adapters/fake/CustomersRepository.test.ts` from §2.14
   into the working tree (it will land in Commit 3) and run just
   that one file to validate. If running it before Commit 3 is too
   ahead-of-itself, skip — the build/lint/tsc in Step 6 will catch
   compilation failures.
4. **Supabase adapters third.** Create
   `lib/adapters/supabase/CustomersRepository.ts`,
   `ProductsRepository.ts`, `OrdersRepository.ts`, `index.ts`.
   Each follows the §2 sketches. **Pay deliberate attention to the
   ORDER_SELECT clause definition** — define once at module scope in
   `OrdersRepository.ts`; the 6 methods that read back use it.
5. **Type-check the package locally.** `npx tsc --noEmit
lib/adapters/supabase/*.ts lib/adapters/fake/*.ts lib/ports/__contracts__/*.ts`
   — must exit 0. If errors, fix in this commit. The type-pin fixture
   at `tests/unit/ports/orders-domain.types.test.ts` is unchanged.
6. **Lint check.** `npm run lint` — exit 0. F-04's rule allows the
   Supabase SDK imports in `lib/adapters/supabase/**/*.ts` per the
   override allow-list. The Fake adapter files have no SDK imports.
   The contract files have no SDK imports. NEW violations attributable
   to F-06 MUST be zero.
7. **Stage and commit.**

   ```
   git add lib/adapters/ lib/ports/__contracts__/
   git commit -m "$(cat <<'EOF'
   feat(adapters): supabase + fake + contracts (F-06)

   Implements ADR-0002 + ADR-0003 for the Orders bounded context:

   - lib/adapters/supabase/{Orders,Customers,Products}Repository.ts —
     Supabase implementations of the F-05 ports. Hybrid construction:
     factory function for tests + pre-wired singleton for app code.
     Vendor types confined inside the file; row→domain mapping at the
     boundary. Throws typed errors from @/lib/errors.
   - lib/adapters/fake/{Orders,Customers,Products}Repository.ts —
     In-memory implementations with no Supabase SDK import. Stores
     domain types directly (no row shapes). Generates FAKE-YYYY-NNNN
     references to distinguish from DB-generated MFS-YYYY-NNNN.
   - lib/ports/__contracts__/{Orders,Customers,Products}Repository.contract.ts —
     Shared behavioural test suites. Each exports a factory function
     taking a setup() closure. Both adapters pass the same suite.
     Capability flags (supportsAuditLog, supportsFkValidation,
     supportsConcurrency) gate cases that only apply to one adapter.

   No production path imports any of these yet (strangler-fig F-06).
   F-07 wires OrdersService against the ports; F-08 wires the routes.

   Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
   EOF
   )"
   ```

### Step 2 — Commit 2: Supabase wrapper tests

1. Create
   `tests/integration/adapters/supabase/CustomersRepository.test.ts`,
   `ProductsRepository.test.ts`, `OrdersRepository.test.ts`. The
   directory `tests/integration/adapters/supabase/` does NOT exist on
   main; the implementer creates it.
2. **Run the new tests against the local stack.**
   `npm run test:integration -- adapters/supabase` — must exit 0.
   All ~44 contract cases (minus Fake-only skips, plus the
   audit/concurrency Supabase-only cases) must pass. Approximately 40
   passing cases on the Supabase side.
3. **Confirm the pre-existing F-TD-03 failures are unchanged.**
   `npm run test:integration` — full suite. The 23/49 documented
   failures in `orders-crud.test.ts`, `picking-list.test.ts`,
   `kds.test.ts` remain. F-06's new files add ~40 passing cases on
   top. The "calibrated" bar is: F-06's new files do not introduce
   new failures; the pre-existing failure count stays at 23.
4. **Stage and commit.**

   ```
   git add tests/integration/adapters/supabase/
   git commit -m "$(cat <<'EOF'
   test(integration): contract tests against Supabase adapter (F-06)

   Three wrapper files at tests/integration/adapters/supabase/ call the
   shared contract suites against the live Supabase stack:
   - OrdersRepository.test.ts — ~37 cases minus Fake-only skips
   - CustomersRepository.test.ts — 3 cases
   - ProductsRepository.test.ts — 4 cases

   Tests call the adapter directly (no HTTP, no Next.js dev server).
   Matches the road-times.test.ts pattern. Uses existing
   tests/integration/_setup.ts helpers: setupTestUsers,
   setupTestCustomer, getTestProduct, cleanupTestData.

   Prerequisite: npm run db:up. No npm run dev required.

   Pre-existing F-TD-03 failures (orders-crud.test.ts,
   picking-list.test.ts, kds.test.ts — 23/49) remain unchanged. F-06
   introduces zero new integration failures.

   Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
   EOF
   )"
   ```

### Step 3 — Commit 3: Fake wrapper tests

1. Create
   `tests/unit/adapters/fake/CustomersRepository.test.ts`,
   `ProductsRepository.test.ts`, `OrdersRepository.test.ts`. The
   directory `tests/unit/adapters/fake/` does NOT exist on main;
   the implementer creates it.
2. **Run the new tests.** `npm test -- adapters/fake` (Vitest runs
   only matching files). Must exit 0. ~30 passing cases (~37 - 3
   Supabase-only skips - 0 customers - 0 products skips = ~34 on
   the Orders side; plus 3 + 4 for the other two).
3. **Run the full unit suite.** `npm test` — must exit 0. Existing
   suites (35+ files) all pass; the 3 new fake adapter test files
   add to the run.
4. **Final whole-tree checks.**
   - `npm run lint` exit 0.
   - `npx tsc --noEmit` exit 0.
   - `npm run build` exit 0.
   - `git diff main package.json` empty.
   - `git diff main app/ supabase/ middleware.ts CLAUDE.md` empty.
   - Production-path grep:
     `grep -rn "from ['\"]@/lib/adapters" app/ lib/services lib/usecases 2>/dev/null`
     returns zero matches.
5. **Stage and commit.**

   ```
   git add tests/unit/adapters/fake/
   git commit -m "$(cat <<'EOF'
   test(unit): contract tests against fake adapter (F-06)

   Three wrapper files at tests/unit/adapters/fake/ call the shared
   contract suites against the in-memory Fake adapter. No DB. No
   network. Pure node.

   The Fake passes a strict subset of the contract:
   - supportsAuditLog=false skips listKdsQueue recent-flashes case
   - supportsFkValidation=false skips createOrder rollback-on-FK case
   - supportsConcurrency=false skips recordPrint optimistic-lock case

   Acts as the unit-test substrate F-07 OrdersService uses.

   Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
   EOF
   )"
   ```

### Step 4 — Push and PR

1. `git push -u origin f-06-orders-supabase-adapters`.
2. Open PR via `gh pr create` with title
   `feat(adapters): Orders Lego adapters + contract tests (F-06)`
   and the body referenced in §7 DoD.

### Step 5 — Stop

Do not run F-07 / F-08 work. Do not implement any service. Do not edit
any route. Do not wire any adapter into any production path. F-06 ends
at the PR open.

---

## 4. Test matrix (pre-ANVIL — what each layer will see)

Same calibrated-vs-strict discipline as F-FND-02/03 / F-01 / F-03 /
F-04 / F-05. ANVIL Gate 3 reads this section verbatim.

| #   | Layer                          | Command                                                                                                                                        | Pass criterion                                                                                                                                                                                                                                                                                                                                                                               | Calibrated / Strict              |
| --- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| 1   | Vitest unit (Fake contracts)   | `npx vitest run tests/unit/adapters/fake`                                                                                                      | Exit 0. ~30 cases pass across 3 files (CustomersRepository 3 + ProductsRepository 4 + OrdersRepository 34 minus the 3 Supabase-only skips). Skipped cases display as `skip` not `fail`.                                                                                                                                                                                                      | Strict (this is the deliverable) |
| 2   | Vitest unit (baseline)         | `npm test`                                                                                                                                     | Exit 0. All 35+ pre-existing unit suites continue to pass unchanged. The 3 new fake-adapter suites are now part of the run and are green. F-05's type-pin fixture (`tests/unit/ports/orders-domain.types.test.ts`) is unchanged.                                                                                                                                                             | Strict (baseline must hold)      |
| 3   | Vitest integration (new)       | `npx vitest run --config vitest.integration.config.ts tests/integration/adapters/supabase`                                                     | Exit 0. ~40 cases pass across 3 files (CustomersRepository 3 + ProductsRepository 4 + OrdersRepository 34 + audit-only/FK-only/concurrency-only cases that ONLY Supabase runs). Prerequisite: local stack up (`npm run db:up`). No dev server needed.                                                                                                                                        | Strict                           |
| 4   | Vitest integration (baseline)  | `npm run test:integration`                                                                                                                     | **CALIBRATED.** Bar: the 23/49 pre-existing failures (F-TD-03) remain at 23 — F-06 introduces ZERO new integration failures. The new suite adds ~40 passing cases to the total. New baseline: ~89/89 across the 9 file types — minus the 23 F-TD-03 failures = 66/89. (Or however the math works after the new files; the load-bearing assertion is "no NEW failures attributable to F-06".) | Calibrated                       |
| 5   | ESLint                         | `npm run lint`                                                                                                                                 | **Calibrated.** Bar: zero NEW violations attributable to F-06 files. The F-04 rule allows `@supabase/supabase-js` imports in `lib/adapters/supabase/**/*.ts` (override at `.eslintrc.json:18`). The Fake adapter and contract files have zero SDK imports.                                                                                                                                   | Calibrated                       |
| 6   | TypeScript check               | `npx tsc --noEmit`                                                                                                                             | **Strict.** Bar: zero TS errors. F-06 introduces 17 new source/test files; tsc must parse cleanly. `tsconfig.json:10` confirms `strict: true`.                                                                                                                                                                                                                                               | Strict                           |
| 7   | Next.js build                  | `npm run build`                                                                                                                                | Exit 0. `next build` invokes `next lint` inline AND runs the TypeScript compiler on every imported file. **Load-bearing end-to-end check** that the F-06 files land cleanly in the real build pipeline.                                                                                                                                                                                      | Strict                           |
| 8   | Playwright E2E                 | n/a                                                                                                                                            | **No E2E for F-06.** No HTTP surface, no UI surface, no route file edited. Existing Playwright suites need not be re-run as gating.                                                                                                                                                                                                                                                          | Skipped                          |
| 9   | Migration safety               | n/a                                                                                                                                            | **No migrations, no PITR check at Gate 4.** F-06 changes no schema.                                                                                                                                                                                                                                                                                                                          | Skipped                          |
| 10  | Drift checks                   | `git diff main package.json`, `git diff main app/ supabase/ middleware.ts CLAUDE.md`                                                           | All empty. F-06 is purely additive to `lib/adapters/`, `lib/ports/__contracts__/`, `tests/integration/adapters/`, `tests/unit/adapters/`. Touches zero routes, zero migrations, zero middleware, zero deps, zero CLAUDE.md.                                                                                                                                                                  | Strict                           |
| 11  | Offender grep (FREEZE-rule)    | `grep -rn "from ['\"]@supabase/supabase-js['\"]" --include="*.ts" --include="*.tsx" \| grep -v node_modules`                                   | Exactly five lines: `lib/supabase.ts:13`, `tests/integration/_setup.ts:24`, AND THREE NEW LINES in `lib/adapters/supabase/{Orders,Customers,Products}Repository.ts`. All five are allow-listed by F-04. If MORE lines appear (e.g., a route accidentally re-introduced an SDK import), STOP — something off-plan landed.                                                                     | Strict                           |
| 12  | Production-path adapter grep   | `grep -rn "from ['\"]@/lib/adapters" app/ lib/services lib/usecases 2>/dev/null`                                                               | Zero matches. F-06 ships unused. The 5 Orders routes do NOT import any new adapter. F-07/F-08 will. If any match appears, STOP — F-06 accidentally wired into production.                                                                                                                                                                                                                    | Strict                           |
| 13  | Production-path port grep      | `grep -rn "from ['\"]@/lib/ports\|from ['\"]@/lib/domain" app/ lib/services lib/usecases 2>/dev/null`                                          | Zero matches. (Same as F-05 layer 11.) F-07 will introduce these.                                                                                                                                                                                                                                                                                                                            | Strict                           |
| 14  | Fake-adapter SDK-free check    | `grep -rn "from ['\"]@supabase/supabase-js['\"]" lib/adapters/fake/ lib/ports/__contracts__/ 2>/dev/null`                                      | Zero matches. The Fake adapters MUST NOT import the SDK. The contract suites MUST NOT either. If any match → STOP.                                                                                                                                                                                                                                                                           | Strict                           |
| 15  | Contract-suite singleton check | `grep -rn "supabaseOrders\|supabaseCustomers\|supabaseProducts\|fakeOrders\|fakeCustomers\|fakeProducts" lib/ports/__contracts__/ 2>/dev/null` | Zero matches. The contract suite MUST be adapter-agnostic. It only receives the repo via the setup closure. If it imports a concrete singleton, STOP.                                                                                                                                                                                                                                        | Strict                           |

**Layer 4 note (Calibrated, not Strict).** F-06 cannot fix F-TD-03 —
that fix belongs to F-08 per the F-05 cert's load-bearing contract.
F-06's calibrated bar is "no new failures attributable to F-06";
strict would require also fixing the 23 pre-existing failures which is
out of scope. ANVIL Gate 3 reads this calibration verbatim.

**Layer 11 note.** The FREEZE-rule offender count rises from 2 → 5 in
F-06. All three new offenders are in the allow-list path
`lib/adapters/supabase/**/*.ts`. F-04's override fires. F-06's job is
to add exactly 3 SDK imports — no more, no less. If F-06 accidentally
imports `@supabase/supabase-js` from anywhere else (a contract file, a
fake file, a barrel that re-exports the SDK type), the count rises
beyond 5 and Gate 3 fails the check.

**Layer 14 note.** This is the structural enforcement of ADR-0002 line
27 (vendor types never cross the port boundary). The Fake adapter
MUST be vendor-free. The contract suite MUST be vendor-free. Both are
load-bearing for the eventual rip-out test ("how many files change if
Supabase is replaced?"). If a future maintainer accidentally imports
`SupabaseClient` into a fake or contract file for "convenience", the
rip-out answer balloons. This grep catches it.

**Layer 15 note.** Adapter-agnostic contract suites are the WHOLE
POINT. If the contract file imports a concrete singleton, the file is
no longer testing the contract — it is testing one specific adapter.
The grep guarantees the contract stays pure.

---

## 5. Risks and open questions

1. **F-TD-03 root cause is well-understood; F-08 owns the fix.**
   Recon §1.6 confirmed: the 23/49 failing integration tests use the
   `api()` helper at `tests/integration/_setup.ts:207-246`, which
   fetches `http://localhost:3000/api/*` and requires `npm run dev`
   in a separate terminal (per the docstring at `_setup.ts:9-11`).
   Vitest's `vitest.integration.config.ts` does NOT have a Playwright
   `webServer` equivalent — it does not auto-start the dev server.
   F-06's contract tests use the **direct-adapter pattern**
   (mirroring `road-times.test.ts:46-130`) — no `api()`, no HTTP, no
   dev server needed. F-06's tests pass without `npm run dev`
   running. F-08's planner inherits the F-TD-03 fix decision; three
   paths are sketched in §1.6: auto-start (Playwright-style),
   direct-adapter rewrite of route tests (preferred; matches F-06),
   or status-quo manual `npm run dev`. **Recommend F-08 take the
   direct-adapter path** — once F-08's routes are thin shims over
   `OrdersService`, testing the service directly subsumes the route
   test value. Surfaced for F-08 planner.

2. **Audit-log assertion is Supabase-only.** The Fake adapter doesn't
   model the `order_audit_log` table. The contract suite's
   `listKdsQueue` case "recentFlashes contains audit events within
   the last 60s" is gated on `supportsAuditLog: boolean` in the
   setup. Supabase wrapper sets `true`; Fake wrapper sets `false`.
   The case uses `it.skipIf(!ctx.supportsAuditLog)` or equivalent
   Vitest conditional. **Risk:** if a future fake-adapter user
   genuinely needs audit-log semantics (unlikely — fakes are for
   unit tests of services that don't care about audit semantics),
   the fake can be extended to emit synthetic flash events. Marked
   for future review.

3. **The `.or()` query shape for `listKdsQueue` is verbose but matches
   the existing route.** The adapter uses:

   ```
   .or(`state.eq.printed,and(state.eq.completed,completed_at.gte.${sinceIso})`)
   ```

   Alternative considered: two separate queries (one for
   `state=printed`, one for `state=completed AND completed_at >=
since`), unioned in JS. Cleaner-looking but costs an extra
   round-trip. Rejected per recon §1.4. **Recommend Gate 2 approve
   the existing form.** If Gate 2 prefers the two-query shape, the
   implementer can swap; the contract test asserts behaviour
   (snapshot contents), not query shape, so either implementation
   passes.

4. **Optimistic-lock concurrency case is Supabase-only and OPTIONAL.**
   The recordPrint "first-print optimistic-lock race rejects second
   concurrent first-print" case requires actually firing two
   in-flight requests. Vitest's default serial execution makes this
   awkward to write; the case relies on `Promise.all([call1, call2])`
   and is non-deterministic about which side wins (which is the
   point of optimistic locking). **The planner recommends marking
   this case as OPTIONAL** — gated on `supportsConcurrency` flag —
   and not counting it in the 34. If Gate 2 wants it gated as a
   firm case, the implementer adds an `it.if(supportsConcurrency)`
   block; if Gate 2 wants it dropped entirely, the implementer
   removes the case. Recommend OPTIONAL.

5. **RLS posture stays on service-role.** F-06 uses
   `supabaseService` (which bypasses RLS) for both the singleton
   default and the test setup's `getServiceClient()`. ADR-0004
   describes RLS as a parallel track (F-RLS-03 introduces the
   per-request authenticated client; F-RLS-04..n migrates tables).
   F-06 does not anticipate that work. **Risk:** when F-RLS-03
   lands, the F-06 singleton may need a refactor (or F-RLS-03's
   plan introduces a per-request adapter factory that wraps F-06's).
   The hybrid factory + singleton pattern is friendly to that
   change — the factory accepts any `SupabaseClient`, so a future
   per-request wrapper can call `createSupabaseOrdersRepository(authClient)`
   on demand. Risk closed at the design level; flagged for F-RLS-03
   planner.

6. **3-commit vs 4-commit shape.** Planner chose 3 commits (source,
   integration tests, unit tests). Rationale in "Branch + base"
   section: bisect property of atomic commits, consistency with
   F-05. If Gate 2 prefers 4 commits (splitting source into
   contracts+fakes / Supabase adapters), the implementer can split
   trivially — the file count per commit is what changes; the
   total file set is unchanged. **Non-blocking style preference.**

7. **The Supabase adapter does THREE round-trips on `createOrder`.**
   Today's route does TWO: insert orders → insert lines → return
   `{ id, reference }`. F-06's adapter does insert orders → insert
   lines → SELECT (read back the full Order) → return Order. The
   third round-trip is required by F-05's port contract (line 184:
   "returns the persisted Order with its generated id, reference,
   created_at, and the inserted lines"). The cost is one extra
   round-trip per createOrder; on the local stack this is ~20ms;
   on production Vercel→Supabase it's ~50ms. **Mitigation:** the
   read-back uses the same `ORDER_SELECT` clause as `findOrderById`,
   so the embed cost is the same as a regular fetch. F-07's
   service code is freed from a separate `findOrderById` call after
   `createOrder`. Net: the cost moves from service to adapter; the
   total request latency is comparable.

8. **The Fake's `crypto.randomUUID()` requires Node 19+.** Node 16
   shipped `crypto.randomUUID` behind a flag; Node 18 made it stable.
   The project's Node version is set in `package.json` engines (need
   to verify) or `.nvmrc`. If the runtime is < 18.0, the fake breaks.
   **Mitigation:** verify at implementation time; if Node version is
   too low, swap to a simple counter `${state.nextOrderSeq}` for
   the id (the Fake doesn't need a real UUID — it just needs a
   unique string). Surfaced as Risk #8 for the implementer.

9. **The contract suite uses Vitest's `beforeEach`/`afterEach` per
   case.** Per-case isolation is the right call (one test creates
   fixtures, another shouldn't see them). But on the Supabase side
   this means ~40 round-trip-heavy setup/teardown cycles per run.
   Total test time estimate: ~10-15 seconds on the local stack
   (well within the 30s testTimeout configured at
   `vitest.integration.config.ts:24`). If timing degrades on slower
   machines, the implementer can switch to `beforeAll` + manual
   cleanup per case (still isolated logically, more performant in
   wall-clock). Defer the decision to implementation; flagged for
   visibility.

10. **The contract suite imports Vitest at module load.** Files under
    `lib/` typically don't depend on test frameworks. The contract
    files break this convention: they `import { describe, it, expect,
beforeEach, afterEach } from 'vitest'`. This is intentional — the
    contract suite IS a test artefact, just shared between two
    locations. ADR-0003 line 23 explicitly puts contract suites
    under `lib/ports/__contracts__/`, so they live alongside ports
    rather than under `tests/`. The `vitest` import does NOT make
    `lib/` runtime-test-dependent — the contract files are never
    imported at runtime; they're only imported by test wrapper files
    under `tests/`. **The risk:** a future code-import audit might
    flag `lib/` files importing Vitest. **Mitigation:** the file
    header comment explicitly documents the test-artefact nature.
    Flag for code review.

11. **The Fake adapter's reference generator increments a module-singleton
    counter.** `const fakeOrdersRepository = createFakeOrdersRepository()`
    runs at module load; the closure's `state.nextOrderSeq` is
    shared across all uses of the singleton. Tests that use the
    factory directly (`createFakeOrdersRepository()` per test) get
    fresh counters. Tests that import the singleton (e.g. F-07
    will) share the counter — sequential `createOrder` calls in a
    test suite get `FAKE-2026-0001`, `FAKE-2026-0002`, etc. This is
    a feature (predictable test outputs) and a risk (test order
    matters if any test asserts the exact reference). **The
    contract suite asserts the reference shape (non-empty string,
    matches a pattern) but NEVER the exact value.** Risk closed at
    the design level.

12. **The Supabase adapter's `markLineDone` makes 4 round-trips on
    the happy path.** Read line, read parent state, update line,
    count remaining. Today's route does the same (lines 75-152 of
    `app/api/kds/lines/[lineId]/done/route.ts`). The adapter
    inherits the cost. The KDS terminal is on the production floor
    where butchers tap "Done" maybe once every 30 seconds — 4
    round-trips at ~100ms is well within the human-perceptible
    threshold. No optimisation needed for F-06.

13. **The contract suite's `setup()` for the Supabase wrapper calls
    `setupTestUsers()` + `setupTestCustomer()` + `getTestProduct()`
    on EVERY case via `beforeEach`.** All three helpers are
    idempotent (they look up existing fixtures first), so the cost
    is one round-trip per helper per case = 3 round-trips per case
    setup × 40 cases = 120 lookup round-trips. At ~10ms each on the
    local stack = ~1.2s of total setup overhead. Acceptable.
    Mitigation if needed: cache the setup result outside
    `beforeEach` (compute once per file in a `beforeAll`, then per
    case just refresh the adapter). Defer to implementation.

14. **The Fake adapter does NOT enforce database-level invariants**
    that the Supabase adapter inherits from the DB. Examples:
    - The product/ad-hoc XOR CHECK on `order_lines`
      (migration:128-131) — Supabase rejects; the Fake accepts both
      set or both null.
    - The `(done_at, done_by)` both-or-neither CHECK
      (migration:132-136) — Supabase rejects; the Fake doesn't
      validate.
    - The state-machine timestamp invariants (migration:92-96) —
      Supabase rejects; the Fake follows the invariant by
      construction (recordPrint always sets printedAt; markOrderCompleted
      always sets completedAt) but doesn't reject invalid direct
      mutations.
      These mean a service-layer bug that produces a malformed input
      might pass against the Fake (in F-07's unit tests) but fail in
      integration. **Mitigation:** the contract suite asserts the
      invariants that ARE shared (state transitions, idempotency,
      line numbering). The DB-only invariants (XOR CHECK, etc.) are
      asserted as Supabase-only cases (`supportsFkValidation` /
      `supportsCheckConstraints`). The Fake-side test coverage for
      F-07 is intentionally incomplete; F-07's plan should note that
      integration tests still need to run on real Supabase for full
      coverage of DB-enforced invariants. **Surfaced for F-07
      planner.**

15. **The KDS snapshot `serverTime` assertion needs windowed
    comparison.** Test 2 of `listKdsQueue` ("serverTime is captured
    between call start and return") does:

    ```
    const t0 = new Date()
    const snap = await repo.listKdsQueue(...)
    const t1 = new Date()
    expect(new Date(snap.serverTime).getTime()).toBeGreaterThanOrEqual(t0.getTime())
    expect(new Date(snap.serverTime).getTime()).toBeLessThanOrEqual(t1.getTime())
    ```

    This is the locked invariant from the conductor's spec. The
    assertion is unambiguous and adapter-agnostic. **Confirmed
    correct.**

16. **F-07 (next unit) is unblocked by F-06.** Once F-06 ships, the
    F-07 planner has both ports (F-05) and adapters (F-06)
    available. F-07 will import the Fake adapters for unit testing
    (`createFakeOrdersRepository()` per test) and the Supabase
    singletons for integration testing (and for production wiring).
    Coordination: the F-07 planner targets the F-05 port shapes
    verbatim; the F-06 adapter factories are the substrate.

17. **F-08 (route rewrites) inherits the singletons.** The 5 Orders
    routes will, in F-08, become thin shims over the F-07 service,
    which depends on the F-06 singletons. The route file imports
    drop from `import { supabaseService } from '@/lib/supabase'` to
    `import { ordersService } from '@/lib/services'`. Flag for the
    F-08 planner.

18. **CLAUDE.md unchanged in F-06.** F-05 already aligned the
    Folder layout to ADR-0002. F-06 introduces `lib/adapters/` and
    `lib/ports/__contracts__/` paths which were named in F-05's
    edit. No new edit needed. Layer 10 of §4 verifies via
    `git diff main CLAUDE.md` being empty.

---

## 6. Rollback

Straightforward. F-06 squash-merges into `main` as a single commit
(matching #15–#22). To roll back:

```
git revert <merge-commit-sha>
git push origin main
```

**No data implications.** F-06 makes no schema changes, no data
migrations. The contract integration tests use the existing
`TEST_PREFIX`-scoped fixtures + `cleanupTestData()` — they create
and clean up `ANVIL-TEST-` rows only. Cleanup is idempotent across
runs.

**Implication for F-07+.** A revert of F-06 cancels F-07's
prerequisite — F-07's `OrdersService` imports from
`@/lib/adapters/supabase` and `@/lib/adapters/fake`, both of which
would no longer exist. Mitigation: do not revert F-06 unless F-07
has not yet shipped. If F-07 is on `main` when F-06 needs to be
reverted, revert both together (F-07 first, then F-06).

**If revert is needed mid-PR-cycle** (e.g. Gate 2 rejects the contract
suite shape): no revert needed because the PR has not merged. Close
the PR, revise the plan, re-open. Branch is throwaway.

---

## 7. Definition of done

- [ ] Branch `f-06-orders-supabase-adapters` exists, based on `main`
      HEAD `1de0fdc`.
- [ ] Commit 1 carries the 11 source files: 4
      `lib/adapters/supabase/`, 4 `lib/adapters/fake/`, 3
      `lib/ports/__contracts__/`. Co-author trailer present.
- [ ] Commit 2 carries the 3 Supabase wrapper integration tests at
      `tests/integration/adapters/supabase/`. Co-author trailer
      present.
- [ ] Commit 3 carries the 3 Fake wrapper unit tests at
      `tests/unit/adapters/fake/`. Co-author trailer present.
- [ ] `npm test` exit 0; new fake-adapter suites part of the run.
- [ ] `npm run test:integration -- adapters/supabase` exit 0; new
      Supabase-adapter suites pass.
- [ ] `npm run test:integration` (full suite) shows 23 pre-existing
      failures (F-TD-03 carry-forward) unchanged; F-06 adds ~40 new
      passing cases.
- [ ] `npm run lint` exit 0; F-04 calibrated baseline holds; the 3
      new SDK imports are in the allow-list path.
- [ ] `npx tsc --noEmit` exit 0.
- [ ] `npm run build` exit 0.
- [ ] `git diff main package.json` empty.
- [ ] `git diff main app/ supabase/ middleware.ts CLAUDE.md` empty.
- [ ] Production-path adapter grep
      (`@/lib/adapters` in `app/`, `lib/services`, `lib/usecases`)
      returns zero matches.
- [ ] Production-path port grep
      (`@/lib/ports`, `@/lib/domain` in production paths) returns
      zero matches.
- [ ] Fake-adapter SDK-free check returns zero matches.
- [ ] Contract-suite singleton check returns zero matches.
- [ ] FREEZE-rule offender count is exactly 5 (was 2; F-06 adds 3
      Supabase adapter files; all 5 are in the allow-list).
- [ ] PR opened against `main` with title
      `feat(adapters): Orders Lego adapters + contract tests (F-06)`
      and a body that:
  - References ADR-0002, ADR-0003, ADR-0004 by path + line.
  - References this plan path.
  - References F-04's lint rule and confirms F-06 introduces 3 new
    SDK imports, all in the `lib/adapters/supabase/**` allow-list.
  - Lists the three commits with their commit messages.
  - Calls out the F-TD-03 carry-forward and the F-06 direct-adapter
    pattern as the F-08 fix recommendation.
  - Calls out the SET LOCAL deferral and its parity with today's
    route behaviour.
  - Confirms the contract suite is the template for F-13/F-14/F-15/
    F-16/F-17/F-18/F-19/F-20 adapter PRs.
- [ ] PR NOT auto-merged. Hakan squash-merges after ANVIL gates pass.

---

## 8. Out of scope (DO NOT touch in this PR)

- **NO** `OrdersService` or `lib/services/**` — F-07 territory.
- **NO** route migrations of any kind — F-08 territory. The 5 Orders
  routes stay verbatim.
- **NO** new `package.json` deps. Supabase SDK already there; Fake
  adapters are pure JS.
- **NO** schema changes; the standing Supabase migration-lock hook
  must not fire.
- **NO** `middleware.ts` edits.
- **NO** changes to F-05's files (`lib/ports/*.ts`, `lib/domain/*.ts`,
  `tests/unit/ports/orders-domain.types.test.ts`).
- **NO** edits to existing integration test files
  (`tests/integration/orders-crud.test.ts`, `picking-list.test.ts`,
  `kds.test.ts`, `road-times.test.ts`, `observability.test.ts`,
  `withErrors.test.ts`). The 23/49 F-TD-03 failures stay; F-08 owns
  the fix.
- **NO** F-04 lint-rule edits — `lib/adapters/supabase/**` is already
  in the allow-list at `.eslintrc.json:18`.
- **NO** edits to `.eslintrc.json` for any reason.
- **NO** CLAUDE.md edits. F-05 aligned it; F-06 doesn't.
- **NO** modifications to ADR-0002, ADR-0003, ADR-0004, ADR-0005.
- **NO** new ADR.
- **NO** retirement of `lib/orders/types.ts`, `lib/orders/validation.ts`,
  `lib/orders/pickingList.ts` — F-08 deals with those.
- **NO** SET LOCAL audit-user-attribution wiring. The behaviour stays
  identical to today's routes; F-07 or later revisits.
- **NO** `Caller` import in any adapter file. Adapters take primitive
  string IDs per F-05's port contract (lines 22-33). The bridging
  from `Caller` to primitive ID happens in F-07's service.
- **NO** edits to `lib/observability/` — F-06 only USES `log` from
  this surface.
- **NO** Playwright tests.
- **NO** changes to `vitest.config.ts` or `vitest.integration.config.ts`.

---

## 9. ADR / docs implications

- **ADR-0002** — no ADR edit needed. F-06 IS the first enforcement
  edge of this ADR (the first vendor-boundary file). The ADR's
  "Consequences" section already anticipates F-06's effect ("the
  model is recorded, not enforced. Enforcement arrives via F-04 ...
  and is completed in F-27"). F-06 continues the "model recorded,
  not enforced" stance for production paths; the actual rip-out
  begins at F-08, completes at F-09 (ANVIL gate for Orders), and
  fully closes at F-27 for every vendor.

- **ADR-0003** — no ADR edit needed. F-06 implements ADR-0003 line
  29 verbatim ("F-06 ships the first three Supabase adapters plus
  the matching fake adapters and the shared contract test suite
  that both pass"). The ADR's "Dependent units" list (line 27)
  already names F-06 as the unit that lands these files.

- **ADR-0004** — no ADR edit needed. F-06 does not touch RLS
  posture.

- **ADR-0005** — no ADR edit needed. F-06 does not overlap with
  the Per-Site Map.

- **`docs/architecture-review-2026-06-06.md`** — no edit needed.
  F-06 realises Phase 1's second paragraph (around lines 326-336)
  verbatim. The Addendum 2026-06-07 (ADR-0005 source) is also
  unaffected.

- **`CLAUDE.md`** — unchanged in F-06. The Folder layout F-05
  edited already names `lib/adapters/<vendor>/` and the file
  inventory anticipates `lib/adapters/fake/`. Plan Layer 10 of §4
  verifies via `git diff main CLAUDE.md` being empty.

- **`docs/plans/2026-06-09-f-06-orders-supabase-adapters.md`** —
  this plan. Future planners for F-13/F-14/F-15/F-16/F-17/F-18/F-19/F-20
  will use this plan's structure as the template for their
  adapter PRs. Specifically:
  - The 17-file inventory shape (3 Supabase + 3 Fake + 3 contracts +
    2 barrels + 3 Supabase wrappers + 3 Fake wrappers = 17 per
    bounded context) is the template.
  - The hybrid factory + singleton pattern is the template.
  - The `<port>Contract(setup): void` factory signature is the
    template.
  - The `supportsAuditLog` / `supportsFkValidation` / `supportsConcurrency`
    capability flags are the template.
  - The 3-commit split (source / Supabase tests / Fake tests) is
    the template.
  - The depth-of-plan (~2500 lines) is the template (smaller domains
    like F-13's UsersRepository will plausibly run shorter).
    If a later planner diverges, the divergence requires its own
    Gate 2 rationale.

- **F-04 ESLint configuration** — no edit. The rule already
  exempts `lib/adapters/supabase/**` and the F-06 SDK imports
  land in that path.

- **No new ADR.** F-06 makes no architectural decision; it
  implements ADRs 0002 + 0003 for the Orders bounded context.

- **F-05 cert F-TD-03 carry-forward** — referenced in §1.6, §5
  Risk #1. F-06's own cert (forthcoming) will reaffirm the
  carry-forward with the new integration baseline: F-TD-03's
  23/49 failures stay; F-06 adds ~40 new passing cases.

---
