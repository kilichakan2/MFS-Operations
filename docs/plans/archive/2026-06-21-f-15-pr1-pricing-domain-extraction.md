# F-15 PR1 — Pricing domain hexagonal extraction (FORGE execution plan)

- **Date:** 2026-06-21
- **Unit:** F-15 PR1 (Phase 3 domain extraction, ADR-0003 line 33)
- **Spec status:** Gate 1 approved (Frame locked)
- **Kind:** PURE hexagonal extraction — introduce-only, ZERO behaviour change, no route edited, no migration, no RLS
- **Mirrors:** F-13 (Users) PR1 and F-14 (Routes) PR1 exactly

🗣 In plain English: we are building the "clean Lego version" of the Pricing
feature — the socket (port), the plugs (adapters), the business-logic box
(service), and the wiring — but we are NOT plugging it into any live screen or
API yet. Nothing in production changes its behaviour. This is the same move we
already did twice (Users, Routes); we copy that proven shape.

---

## Visual mini-map

```
DOMAIN (core logic) — Pricing
  └─ PricingRepository (port) → [Supabase]  (adapter, real DB)
                              → [Fake]      (adapter, in-memory for tests)
🗣 one new socket + two plugs; PR1 builds them but wires nothing live —
   the 5 pricing routes still run their old direct-to-Supabase code untouched
```

---

## Goal

Introduce the Pricing domain as a hexagonal slice — `lib/domain/Pricing.ts`,
`lib/ports/PricingRepository.ts`, a shared contract suite, `PricingService`,
both adapters (Supabase + Fake), the barrels, and `lib/wiring/pricing.ts` —
**without editing any of the 5 pricing route files, without any migration, and
without changing any behaviour.** PR2 (separate, deferred) re-points the routes.

🗣 In plain English: build the new parts and leave them on the shelf. The goal
of PR1 is "the parts exist, compile, and pass their own tests" — not "the app
uses them." If a single route file changes, PR1 has failed its own contract.

---

## Domain terms (glossary for this plan)

- **Price agreement** — a customer-or-prospect-specific agreed price sheet
  (`price_agreements` table). Has a header (who, validity dates, status) and
  many product lines.
  🗣 A signed price list for one customer, valid for a date range.
- **Price line** — one product row inside an agreement (`price_agreement_lines`
  table): a product (or a free-text product name) at a price per kg or per box.
  🗣 One line item on that price list.
- **Prospect** — an agreement with NO `customer_id`, only a `prospect_name`. The
  header carries an either/or: a real customer OR a free-text prospect name (DB
  CHECK `customer_or_prospect`).
  🗣 A price list for someone who isn't a saved customer yet — you type their
  name instead of picking them.
- **`agreed_by`** — the user id of the sales rep who owns the agreement. This is
  the column the RBAC "sales own-only" rule keys on.
  🗣 The "whose deal is this" stamp. Sales staff can only edit their own.
- **`is_expired`** — a COMPUTED boolean on read, NOT a stored status:
  `status === 'active' && valid_until != null && valid_until < londonToday()`.
  Never written to the DB.
  🗣 "Past its end date" — worked out fresh every time you read, never saved.
- **Atomic replace (RPC)** — `replace_agreement_lines(p_agreement_id, p_lines)`
  is a Postgres function that deletes all old lines and inserts the new set in
  ONE transaction. Backs `POST /api/pricing/[id]/lines/replace`.
  🗣 "Swap the whole list in one go" — either every line changes or none does,
  so a half-saved price sheet can never happen.

---

## Compliance / invariant flags (PR1 hard constraints)

- **No route file edited.** The 5 pricing routes (listed below) are READ-ONLY
  inputs to derive the port; not one byte of them changes.
- **No migration.** No file added under `supabase/migrations/`. No schema, no
  RLS, no RPC change. The existing `replace_agreement_lines` RPC is CALLED by
  the new adapter, not modified.
- **No behaviour change.** Nothing in `app/**` or `components/**` imports the new
  `pricingService` yet. The wiring exports a singleton that simply sits unused.
- **Vendor boundary (ADR-0002 / FREEZE rule ADR-0003).** `@supabase/*` is
  imported ONLY in `lib/adapters/supabase/PricingRepository.ts`.
  `lib/domain/**` and `lib/ports/**` import NOTHING from `lib/adapters/**`.
- **No reformatting** beyond new/changed lines in the touched barrels.

🗣 In plain English: five guardrails. Don't touch the live routes, don't touch
the database, don't let the new code run in production, keep the vendor SDK in
its one allowed room, and don't reformat existing files. Any of these breaking
is a hard stop.

---

## ADR conflicts

**None.** F-15 Pricing is an explicitly planned Phase-3 domain in ADR-0003
(line 33), to be extracted exactly like F-13/F-14. The FREEZE rule (ADR-0003)
is satisfied because the only new `@supabase/*` import lands inside
`lib/adapters/supabase/`. ADR-0002 naming/dependency rules are followed by the
file layout below. ADR-0004 (RLS vs service-role) is not engaged: PR1 wires the
SERVICE-ROLE singleton only (same posture the 5 routes use today); the
per-caller authenticated variant and RLS are deferred to F-RLS-04d.

🗣 In plain English: nothing here fights an existing decision — this work is
literally on the roadmap those decisions wrote. We stay on the service-role key
(the master key the routes already use); the RLS lockdown is a later, separate
pass.

---

## Real DB shapes (verified against the baseline migration)

From `supabase/migrations/20260101000000_baseline.sql`:

`price_agreements` (lines 1161–1174):
- `id uuid` PK; `reference_number text` (auto `MFS-YYYY-NNNN`, UNIQUE);
  `customer_id uuid` nullable (FK customers, ON DELETE SET NULL);
  `prospect_name text` nullable; `agreed_by uuid NOT NULL` (FK users);
  `status agreement_status NOT NULL DEFAULT 'draft'`;
  `valid_from date NOT NULL DEFAULT CURRENT_DATE`; `valid_until date` nullable;
  `notes text` nullable; `created_at timestamptz NOT NULL`;
  `updated_at timestamptz NOT NULL` (trigger `price_agreements_updated_at`).
- CHECK `customer_or_prospect`: `customer_id IS NOT NULL OR (prospect_name
  trimmed length > 0)`.

`price_agreement_lines` (lines 1140–1152):
- `id uuid` PK; `agreement_id uuid NOT NULL` (FK price_agreements, ON DELETE
  CASCADE); `product_id uuid` nullable (FK products, ON DELETE SET NULL);
  `product_name_override text` nullable; `price numeric NOT NULL` (CHECK
  `price > 0`); `unit price_unit NOT NULL DEFAULT 'per_kg'`; `notes text`
  nullable; `position integer NOT NULL DEFAULT 0`; `created_at timestamptz`.
- CHECK `product_or_override`: `product_id IS NOT NULL OR (product_name_override
  trimmed length > 0)`.

Enums (verified):
- `agreement_status` (line 22) = `'draft' | 'active' | 'cancelled'` — **no
  `'expired'` value exists**; expiry is computed on read.
- `price_unit` (line 107) = `'per_kg' | 'per_box'`.

RPC `replace_agreement_lines(p_agreement_id uuid, p_lines jsonb)` (line 196):
`SECURITY DEFINER`, deletes all lines for the agreement then bulk-inserts the
`p_lines` array; empty array = valid (agreement with no lines). The route passes
each line as `{ agreement_id, product_id, product_name_override, price, unit,
notes, position }`.

PostgREST joins used by the routes (copy VERBATIM into the adapter):
- `customer:customers!price_agreements_customer_id_fkey(id, name)`
- `rep:users!price_agreements_agreed_by_fkey(id, name)`
- `price_agreement_lines(id, product_id, product_name_override, price, unit,
  notes, position, product:products!price_agreement_lines_product_id_fkey(id,
  name, box_size, code))`

🗣 In plain English: I read the actual database definition so the new code maps
the real columns, not a guess. Two facts matter most: there is no stored
"expired" — it's always calculated — and the "replace all lines" button is
backed by a special database function we must call, not re-implement.

---

## The 5 routes the port is modelled against (READ-ONLY in PR1)

| Route file | Methods | What it does |
|---|---|---|
| `app/api/pricing/route.ts` | GET, POST | list all agreements (computed `is_expired`); create agreement + lines |
| `app/api/pricing/[id]/route.ts` | GET, PATCH, DELETE | get one (with lines + joins); update header/status (+ activation email side-effect); delete (ownership/status RBAC) |
| `app/api/pricing/[id]/lines/route.ts` | POST | add ONE line (computes next position) |
| `app/api/pricing/[id]/lines/replace/route.ts` | POST | atomic replace ALL lines via RPC |
| `app/api/pricing/lines/[lineId]/route.ts` | PATCH, DELETE | edit one line; delete one line |

RBAC observed (stays in the routes for PR1 — the port only needs signatures that
let PR2 pass the right filters):
- Allowed roles for every endpoint: `['sales','office','admin']`.
- Sales = own-only (key on `agreed_by === userId`); office/admin = any.
- DELETE agreement: admin = any; sales/office = own **drafts** only.
- Line-level ownership (PATCH/DELETE line) walks
  `price_agreement_lines → price_agreements.agreed_by`.

🗣 In plain English: these five files are the spec for what the port must be able
to do. I'm reading them, not changing them. The "who's allowed" rules stay in the
routes for now; the port just needs methods shaped so PR2 can hand it the right
"only this rep's agreements" filter without changing behaviour.

---

## Exact file list (create / modify markers)

**CREATE (9 files):**

1. `lib/domain/Pricing.ts` — owned camelCase domain types (CREATE)
2. `lib/ports/PricingRepository.ts` — the port interface (CREATE)
3. `lib/ports/__contracts__/PricingRepository.contract.ts` — shared contract suite (CREATE)
4. `lib/services/PricingService.ts` — `createPricingService({ pricing })` factory (CREATE)
5. `lib/adapters/supabase/PricingRepository.ts` — Supabase adapter, ONLY `@supabase/*` importer (CREATE)
6. `lib/adapters/fake/PricingRepository.ts` — in-memory adapter (CREATE)
7. `lib/wiring/pricing.ts` — composition root, exports `pricingService` service-role singleton (CREATE)
8. `tests/unit/adapters/fake/PricingRepository.test.ts` — runs the contract suite against the Fake (CREATE) *(path mirrors the existing Fake adapter contract-runner location — verify the exact existing pattern dir during Render; place beside the Routes equivalent)*
9. `tests/integration/adapters/supabase/PricingRepository.test.ts` — runs the contract suite against the real Supabase adapter (CREATE) *(mirror the existing Routes Supabase contract-runner location/convention)*

**MODIFY (5 barrels — append-only, no reformat):**

10. `lib/domain/index.ts` — add Pricing type re-exports (MODIFY)
11. `lib/ports/index.ts` — add `PricingRepository` + filter type re-exports (MODIFY)
12. `lib/services/index.ts` — add `createPricingService` + `PricingService` + deps type (MODIFY)
13. `lib/adapters/supabase/index.ts` — add `createSupabasePricingRepository`, `supabasePricingRepository` (MODIFY)
14. `lib/adapters/fake/index.ts` — add `createFakePricingRepository`, `fakePricingRepository` (+ any seed type) (MODIFY)

🗣 In plain English: nine brand-new files plus five small "table of contents"
edits so the rest of the app can find them. No route file, no migration file —
that absence is itself a checked invariant at the end.

> NOTE on test file paths (step 8/9): during Render, the implementer MUST first
> locate where the Routes contract-runner test files actually live
> (`grep -rl "routesRepositoryContract" tests/`) and mirror that EXACT directory
> and naming convention. Do not invent a new test path.

---

## Domain types to define in `lib/domain/Pricing.ts`

Mirror `lib/domain/Route.ts` structure (interface comment before each type, two
read shapes, explicit input types). All camelCase, no vendor/framework import.

- `AgreementStatus = 'draft' | 'active' | 'cancelled'` (verified enum)
- `PriceUnit = 'per_kg' | 'per_box'` (verified enum)
- `PriceLine` — `{ id, productId: string|null, productNameOverride: string|null,
  price: number, unit: PriceUnit, position: number, notes: string|null }` plus
  the joined product display fields the wire returns:
  `productName: string` (product.name ?? override ?? 'Unknown'),
  `boxSize: string|null`, `code: string|null`, `isFreetext: boolean` (!productId).
  🗣 One price line, with the product's display name/box-size already resolved.
- `PriceAgreement` (header) — `{ id, referenceNumber, status, customerId:
  string|null, prospectName: string|null, agreedBy: string, validFrom,
  validUntil: string|null, notes: string|null, createdAt, updatedAt }` plus the
  computed/joined read fields the wire returns:
  `isExpired: boolean`, `customerName: string` (customer.name ?? prospectName ??
  'Unknown'), `isProspect: boolean` (!customerId), `repId: string|null`,
  `repName: string`.
  🗣 The agreement header in our own clean shape, with the "expired?",
  "who's the customer", and "which rep" already worked out.
- `PriceAgreementWithLines extends PriceAgreement` — `{ lines: readonly
  PriceLine[] }` (sorted by position ascending).
  🗣 The full folder: header plus its ordered lines.
- Input types (derive from the real POST/PATCH bodies):
  - `CreateAgreementInput` — `{ customerId: string|null, prospectName:
    string|null, agreedBy: string, validFrom: string, validUntil: string|null,
    notes: string|null, lines: readonly CreateLineInput[] }`
  - `CreateLineInput` — `{ productId: string|null, productNameOverride:
    string|null, price: number, unit: PriceUnit, notes: string|null, position:
    number|null }` (position nullable → adapter defaults to array index, matching
    `l.position ?? i`)
  - `UpdateAgreementInput` — partial header patch: `{ status?, validFrom?,
    validUntil?, notes?, customerId?, prospectName? }` (the 6 PATCH-able fields;
    `'' → null` normalisation happens in the route today — keep it there for PR1,
    or document it as the adapter's job for PR2; PR1 only needs the type)
  - `UpdateLineInput` — `{ productId?, productNameOverride?, price?, unit?,
    notes?, position? }` (the 6 PATCH-able line fields)
  - `CreatedAgreement` — the exact POST echo: `{ id, referenceNumber }` only.
  - `PatchedAgreement` — the exact PATCH echo: `{ id, referenceNumber, status,
    updatedAt }` (route selects `id, reference_number, status, updated_at`).

🗣 In plain English: I'm deriving every type from what the routes actually send
and return today, so PR2 can swap them in and the JSON on the wire stays
byte-for-byte identical.

> **Mirror-divergence flag #1 — the customer-or-prospect either/or.** Unlike
> Routes (single required `assignedTo`), the Pricing header carries an XOR:
> `customerId` OR `prospectName`, enforced by a DB CHECK. The domain types use
> `string|null` for both; the Fake adapter must reproduce the CHECK (throw if
> both are null/blank) so it can't drift from the real DB. Capture this in the
> contract suite.

---

## Port surface — `lib/ports/PricingRepository.ts`

Business-language methods, each mapping 1:1 to a PR2 endpoint operation. Imports
domain types only. Mirror `RoutesRepository`'s JSDoc-per-method discipline.

| Method | Signature (sketch) | Backs |
|---|---|---|
| `listAgreements` | `(filter: ListAgreementsFilter) => Promise<readonly PriceAgreement[]>` | GET `/api/pricing` |
| `getAgreementById` | `(id: string) => Promise<PriceAgreementWithLines \| null>` | GET `/api/pricing/[id]` |
| `createAgreement` | `(input: CreateAgreementInput) => Promise<CreatedAgreement>` | POST `/api/pricing` |
| `updateAgreement` | `(id: string, patch: UpdateAgreementInput) => Promise<PatchedAgreement \| null>` | PATCH `/api/pricing/[id]` |
| `deleteAgreement` | `(id: string) => Promise<void>` | DELETE `/api/pricing/[id]` |
| `getAgreementForEmail` | `(id: string) => Promise<PriceAgreementWithLines \| null>` | the PATCH email re-fetch (see flag #3) |
| `addLine` | `(agreementId: string, input: CreateLineInput) => Promise<PriceLine>` | POST `/api/pricing/[id]/lines` |
| `replaceLines` | `(agreementId: string, lines: readonly CreateLineInput[]) => Promise<number>` (returns count) | POST `/api/pricing/[id]/lines/replace` (RPC) |
| `updateLine` | `(lineId: string, patch: UpdateLineInput) => Promise<PriceLine \| null>` | PATCH `/api/pricing/lines/[lineId]` |
| `deleteLine` | `(lineId: string) => Promise<void>` | DELETE `/api/pricing/lines/[lineId]` |
| `getAgreementOwner` | `(id: string) => Promise<{ agreedBy: string, status: AgreementStatus } \| null>` | the RBAC ownership pre-check the routes do (`select('agreed_by')` / `select('agreed_by, status')`) |
| `getLineOwner` | `(lineId: string) => Promise<{ agreedBy: string } \| null>` | the line-level RBAC walk (`price_agreement_lines → price_agreements.agreed_by`) |

`ListAgreementsFilter` — for PR1, GET lists ALL agreements (no server-side
owner filter; sales "see all, edit own"), so the filter is minimal:
`{}` or a future-proof `{ agreedBy?: string }`. **Design call:** define
`ListAgreementsFilter` with an optional `agreedBy?` so PR2 *could* push the
own-only filter into the port later, but PR1's adapter ignores it / lists all to
stay byte-identical with today's GET. Document that today's GET applies NO
agreed_by filter.

🗣 In plain English: twelve methods that name every database thing the five
routes do today, in plain business words ("add a line", "replace all lines",
"who owns this") instead of SQL. The two `...Owner` methods exist purely so PR2
can reproduce the current "is this your deal?" permission check without changing
behaviour. If any method ends up unused after PR2, delete it — same discipline
as Routes.

> **Mirror-divergence flag #2 — the atomic-replace RPC.** Routes' `replaceRoute`
> does delete-then-insert as two adapter calls. Pricing's `replaceLines` must
> call the existing `replace_agreement_lines` RPC (one Postgres transaction), NOT
> re-implement delete+insert in the adapter — the transactional guarantee lives
> in the DB function and PR1 must preserve it. The Fake adapter reproduces the
> same all-or-nothing semantics in memory (delete all for agreement, then insert
> the new set; empty array allowed). Capture in the contract suite.

> **Mirror-divergence flag #3 — the PATCH email side-effect.** `PATCH
> /api/pricing/[id]` fires `sendPricingEmail` when the new status is `active`,
> after re-fetching the full agreement. PR1 does NOT model the email send in the
> port — `sendPricingEmail` and its raw-fetch recipient lookup are explicitly
> PR2 work (the recipient read routes through the F-13 `UsersRepository`, NOT a
> pricing method). PR1's port DOES expose `getAgreementForEmail` (the re-fetch
> read) so PR2's route can compose: update → if active, getAgreementForEmail →
> sendPricingEmail. Keeping the email OUT of the service keeps the port a pure
> persistence boundary.

---

## Service — `lib/services/PricingService.ts`

Mirror `RoutesService` posture exactly: factory here, wiring in
`lib/wiring/pricing.ts`; ONE port (`pricing`), never another service.

- `interface PricingServiceDeps { readonly pricing: PricingRepository }`
- `createPricingService({ pricing }): PricingService`
- Methods: mostly pure passthroughs to the port (the depth — joins, mapping,
  RPC, rollback — lives in the adapter, exactly like Routes). Unlike Routes,
  Pricing has **no date-rollover business rule** to own (the `is_expired`
  computation is a read-time mapping done in the adapter against `londonToday()`,
  matching the routes today). So `PricingService` is a thin passthrough layer.

🗣 In plain English: the service is the "business box," but Pricing has almost no
business logic to hide right now — it just forwards calls to the port, like
Routes does for its simple operations. The clever bits (joins, the atomic swap)
all live in the adapter where the vendor SDK is allowed.

> **Design note:** Routes' service owns the 7pm rollover + week bounds. Pricing's
> `is_expired` is computed in the ADAPTER's read mapping (the route computes it
> inline at read with `londonToday()`). Keep it there to stay byte-identical.
> The Fake adapter must compute `isExpired` the same way (inject a "today" or use
> the same `londonToday` source) so both adapters answer the contract identically
> — capture an `is_expired` case in the contract (active + past valid_until =
> true; draft + past = false; active + null valid_until = false).

---

## Adapters

**`lib/adapters/supabase/PricingRepository.ts`** (CREATE) — the ONLY `@supabase/*`
importer for Pricing. Mirror `lib/adapters/supabase/RoutesRepository.ts`:
- `import type { SupabaseClient } from "@supabase/supabase-js"` + `supabaseService`
  from `@/lib/adapters/supabase/client` + `ServiceError` from `@/lib/errors` +
  `log` from `@/lib/observability/log`.
- Const select strings copied VERBATIM from the routes (the join syntax above) so
  the wire stays byte-identical.
- All snake_case↔camelCase mapping + `Number(price)` coercion + `isFreetext` /
  `isProspect` / `isExpired` / `customerName` / `repName` derivation live here.
- `replaceLines` calls `client.rpc('replace_agreement_lines', { p_agreement_id,
  p_lines })` (mirror the OrdersRepository `.rpc(...)` pattern).
- `addLine` reproduces the "max position + 1" computation the route does today.
- Error contract: reads return null/empty on miss; every DB failure throws
  `ServiceError`. (No ConflictError path needed — Pricing has no idempotency key
  or unique-name collision in these routes.)
- `createSupabasePricingRepository(client)` factory + `supabasePricingRepository`
  service-role singleton at file end (mirror Routes).

**`lib/adapters/fake/PricingRepository.ts`** (CREATE) — in-memory, no SDK import,
Maps of DOMAIN types. Mirror `lib/adapters/fake/RoutesRepository.ts`:
- Reproduce the DB's hard rules so both adapters answer the contract identically:
  the `customer_or_prospect` CHECK, the `product_or_override` CHECK, the
  `price > 0` CHECK, the agreement CASCADE on delete, and the atomic
  `replaceLines` (delete-all-then-insert, empty allowed).
- Inject people/customers/products the joins resolve against (so
  `getAgreementById` can populate `customerName`/`repName`/`productName`), like
  the Fake Routes seed.
- `createFakePricingRepository(opts?)` factory + `fakePricingRepository` empty
  singleton for barrel symmetry.

🗣 In plain English: the real adapter is the one room where Supabase code lives —
it does all the column-name translation and calls the special "swap all lines"
database function. The fake adapter is a pretend in-memory version that obeys the
exact same rules, so the tests we write once prove BOTH behave the same. That's
the safety net that lets us trust the fake in fast unit tests.

---

## Wiring — `lib/wiring/pricing.ts`

Mirror `lib/wiring/routes.ts` (the service-role half ONLY for PR1):
```
export const pricingService: PricingService = createPricingService({
  pricing: supabasePricingRepository,
});
```
- Service-role singleton only — same posture the 5 routes use today.
- PR1 is introduce-only: **nothing imports `pricingService` in production yet.**
- DO NOT add a `pricingServiceForCaller` per-request authenticated variant in PR1
  — that belongs with RLS (F-RLS-04d), exactly as Routes added
  `routesServiceForCaller` only at its RLS cutover (F-RLS-04c).

🗣 In plain English: one tiny "parts list" file that bolts the Supabase plug into
the Pricing socket using the master key — the same key the routes use now. It
exports a ready-to-use object that, in PR1, literally nobody calls. The
per-customer-identity version is a later RLS job, not now.

---

## TDD plan — vertical slice, ONE method at a time

Follow the F-14 order: contract test for a method → Fake green → Supabase green →
service passthrough → wiring. NEVER write all tests upfront. Recommended method
order (simplest read first, RPC + email-refetch last):

1. **`createAgreement` + `getAgreementById`** (need create to have data to read).
   Contract case: create with lines → read back, lines position-sorted, joins
   populated, `isExpired`/`isProspect`/`customerName`/`repName` correct. Then the
   `customer_or_prospect` XOR case (flag #1). Fake green → Supabase green.
2. **`listAgreements`** — created-at desc order; computed `is_expired` per row.
3. **`addLine`** — next-position computation; `product_or_override` + `price > 0`
   CHECK cases.
4. **`updateLine` / `deleteLine`** — patch echo shape; cascade-independent delete.
5. **`replaceLines` (RPC)** — atomic swap, empty-array-allowed, all-or-nothing
   (flag #2). Real adapter hits the RPC; Fake reproduces the semantics.
6. **`updateAgreement`** — the `PatchedAgreement` echo shape; status enum guard.
7. **`deleteAgreement`** + **`getAgreementOwner` / `getLineOwner`** — RBAC
   pre-check reads (return null on miss).
8. **`getAgreementForEmail`** — the full re-fetch read shape (flag #3).
9. **`PricingService`** passthrough — unit tests against the Fake via
   `createPricingService({ pricing: createFakePricingRepository(...) })`.
10. **Wiring** — `lib/wiring/pricing.ts` compiles; barrels updated.

🗣 In plain English: build it like climbing a ladder — write one small test,
make the fake pass it, make the real database pass the same test, move to the
next rung. The trickiest rungs (the atomic line-swap and the email re-fetch) come
last, once the simple reads/writes are proven. We never write a wall of tests
before any code exists.

---

## Acceptance criteria (Gate / ANVIL)

1. `npx tsc --noEmit` → **0 errors**.
2. `npm run lint` → **0 errors** (especially: no `@supabase/*` import outside
   `lib/adapters/supabase/`; the lint pin
   `tests/unit/lint/no-adapter-imports.test.ts` stays green).
3. The new contract suite passes against **both** adapters (Fake unit + Supabase
   integration).
4. `PricingService` unit tests green against the Fake.
5. Full existing unit + integration + pgTAP suites stay green (no regressions).

🗣 In plain English: it compiles cleanly, the linter is happy (vendor SDK stayed
in its room), the one shared test suite passes on both the fake and the real DB,
the service tests pass, and nothing else broke.

---

## Verification — PR1 invariants (must all hold)

- **No route file changed:** `git diff --name-only main | grep '^app/api/pricing/'`
  → **empty**.
- **No migration added:** `git diff --name-only main | grep '^supabase/migrations/'`
  → **empty**.
- **Nothing live imports the service:**
  `grep -rl "wiring/pricing" app components` → **empty** (only the new
  `lib/wiring/pricing.ts` and possibly test files reference `pricingService`).
- **Vendor boundary:** `grep -rl "@supabase/" lib/domain lib/ports` → **empty**;
  the only new `@supabase/*` importer is
  `lib/adapters/supabase/PricingRepository.ts`.
- **Rip-out test:** replacing the DB vendor for Pricing = one new adapter folder
  + edits to `lib/wiring/pricing.ts` only. `PricingService` and `lib/domain` are
  untouched → **PASS**.

🗣 In plain English: five mechanical checks anyone can run to PROVE PR1 kept its
promises — no routes touched, no DB touched, the new code is dark in production,
the vendor SDK stayed contained, and swapping databases later would still cost
just one adapter + one wiring line.

---

## Out of scope — DO NOT do in PR1 (deferred, to prevent drift)

- **PR2** — re-point the 5 routes through `pricingService`; absorb
  `lib/pricing-email.ts`'s raw `fetch` recipient lookup. Hakan decided THIS
  session: the recipient read goes through the **F-13 `UsersRepository`**
  (extend it with a "notifiable users by role" method) — **NOT** a new pricing
  method. The email side-effect is composed in the route (update →
  getAgreementForEmail → sendPricingEmail), not inside `PricingService`.
- **F-22** — `PdfRenderer` port + jsPDF adapter. Separate pass.
- **F-RLS-04d** — Pricing RLS + the `pricingServiceForCaller` per-request
  authenticated wiring variant. Separate pass. PR1 wires service-role only.

🗣 In plain English: things that look tempting but belong to later PRs — wiring
the routes, the email recipient lookup (which reuses the Users port, not a new
pricing one), the PDF feature, and the security lockdown. Listed here so the
implementer doesn't wander into them.

---

## Risk Assessment

Scope reminder: PR1 is introduce-only, no live wiring, no DB change. That bounds
most risk categories to near-zero — but each is assessed explicitly below.

### Concurrency / race conditions — LOW (no must-fix)
PR1 adds no live execution path, so no new runtime race is introduced. The one
concurrency-sensitive operation — the atomic `replaceLines` — is preserved by
*calling the existing `replace_agreement_lines` RPC* rather than re-implementing
delete+insert in the adapter. **Mitigation / must-fix-for-correctness:** the
adapter MUST use the RPC, not two separate calls (flag #2); re-implementing it as
adapter-side delete-then-insert would silently drop the transactional guarantee.
This is a correctness requirement of the design, enforced by a contract test, but
NOT a Gate-2 launch blocker because nothing calls it in PR1.

### Security — LOW (no must-fix)
No RLS change, no auth change, service-role singleton only (same key the routes
use today). RBAC enforcement stays in the routes for PR1. The port exposes
`getAgreementOwner`/`getLineOwner` so PR2 can reproduce the own-only checks
byte-identically — *no enforcement moves in PR1*. **Mitigation:** the
verification step proves `lib/wiring/pricing` is imported by nothing in
`app/`/`components/`, so the unsecured-by-RLS service-role path cannot be reached.
RLS is the explicit F-RLS-04d follow-up.

### Data migration — NONE
No migration file is added; the existing `replace_agreement_lines` RPC and both
tables are unchanged. Verified by the "no migration added" invariant check.

### Business-logic flaws — LOW (correctness-must-fix, not launch-blocking)
The dangerous-to-get-wrong mappings: `is_expired` (computed, never stored — must
match `status === 'active' && valid_until != null && valid_until < londonToday()`
in BOTH adapters), the `customerName`/`productName` `?? prospectName/override ??
'Unknown'` fallbacks, `Number(price)` numeric coercion, and `position` ordering.
**Mitigation:** copy the route mapping verbatim into the adapter; the shared
contract suite (run against both adapters) pins each of these so the Fake can't
drift from the real DB. If `is_expired` or the fallbacks are mapped wrong, PR2
would change the wire output — caught here by the contract, before any route is
re-pointed. Correctness-critical, but not a launch blocker since PR1 ships dark.

### Launch blockers — NONE for PR1
PR1 introduces no live behaviour. The only way PR1 breaks production is by
violating an invariant (touching a route, adding a migration, leaking the vendor
import, or accidentally importing `pricingService` in `app/`). All four are
covered by the explicit verification checks above. As long as those pass, there
is no launch risk.

### Headline
**No must-fix Gate-2 blockers.** Two correctness-critical (not launch-blocking)
requirements to enforce via the contract suite: (1) `replaceLines` MUST use the
RPC, not adapter-side delete+insert; (2) `is_expired` + display-name fallbacks
MUST be mapped byte-identically in both adapters. Both are pinned by tests in the
plan, so neither blocks Gate 2 — they are build-time requirements, not open risks.

🗣 In plain English: because PR1 doesn't switch anything on, there's almost no
way to hurt production — the only real dangers are (a) cheating the "swap all
lines" function instead of calling the real one, and (b) computing "expired" or
the display names slightly differently from today. Both are caught by the shared
tests before PR2 ever flips the switch. Nothing here blocks the build from
proceeding.
