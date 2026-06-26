# F-20 Admin PR2/3 — Products + Insights hexagonal re-point

**Date:** 2026-06-26
**Unit:** F-20 Admin PR2 of 3 (follow-on to PR1 Customers re-point, shipped PR #80 `6ec6b93`)
**Type:** Behaviour-preserving hexagonal cutover. Backend-only. No UI, no schema, no new deps.
**Author:** forge-planner (Phase 2, Order)

---

## Visual mini-map

```
DOMAIN (core logic)
  ├─ ProductsRepository (port) → [Supabase] / [Fake]   (+listAll, +setActive)
  ├─ VisitsRepository   (port) → [Supabase] / [Fake]   (+3 admin read methods)
  ├─ ProductsService (NEW, factory) ─ thin over ProductsRepository
  └─ VisitsService   (extend)        ─ thin over VisitsRepository
🗣 two existing sockets gain a few new pin-holes; the 5 admin routes stop touching the wall socket (raw DB) and plug into the labelled service box instead.
```

---

## Goal

Re-point 5 admin API routes off the raw `supabaseService` adapter
(`import { supabaseService } from '@/lib/adapters/supabase/client'`) onto
owned services/ports, so `app/**` depends on `lib/services` + `lib/wiring`,
never on an adapter — exactly as PR1 did for the 3 customer routes.

🗣 **In plain English:** today these 5 admin screens reach straight into the
database vendor's client. We're putting an owned "service" box in between, so
if the database is ever swapped, only one adapter file + one wiring line
change — not these route files. Nothing the admin sees on screen changes.

**The 5 routes:**

| Route | Verb | Current guard | Output shape |
|---|---|---|---|
| `app/api/admin/products/route.ts` | GET | `x-mfs-user-role !== 'admin'` → 403 | bare array (NOT `{rows}`) |
| `app/api/admin/products/[id]/route.ts` | PATCH | same 403 | single row |
| `app/api/admin/prospects/route.ts` | GET | `x-mfs-user-id` absent → 401 | `{rows:[…]}` |
| `app/api/admin/at-risk/route.ts` | GET | same 401 | `{rows:[…]}` |
| `app/api/admin/commitments/route.ts` | GET | same 401 | `{rows:[…]}` |

---

## Locked decisions (from Frame — do NOT re-litigate)

1. **Insights FOLD onto Visits.** Extend the existing `lib/ports/VisitsRepository.ts`
   + `lib/services/VisitsService.ts` with 3 read methods. NO new
   AdminInsightsService / port / adapter / wiring. One table (`visits`), one
   repository (`VisitsRepository` already owns it).
   🗣 The 3 insight screens all read the same `visits` table the Visits port
   already owns — so we add methods to that box, we don't build a second box.

2. **Products EXTENDS the existing port.** `lib/ports/ProductsRepository.ts`
   already exists (Orders-scoped, only `findProductsByIds`). ADD `listAll()` +
   `setActive(id, active)`. Update BOTH adapters + the contract test, then
   BUILD `lib/services/ProductsService.ts` (factory only) + `lib/wiring/products.ts`.

3. **404 deviation (the ONLY behaviour change):** `products/[id]` PATCH on a
   missing id → **404** (today `.single()` on no-match yields a PostgREST error
   → 500). Reuse PR1's typed-null→404 convention: `setActive` returns
   `ProductAdminView | null`; route maps `null` → 404. code-critic endorsed this
   exact ruling for `customers/[id]` in PR1.
   🗣 Today, toggling a product that doesn't exist returns a confusing 500
   (server error). After this it returns a clean 404 (not found) — the same
   fix PR1 made for customers, already blessed by review.

4. **Derivations STAY in the routes** (presentation). `deriveAtRiskReason` /
   `deriveCommitmentStatus` (`lib/adminDerivations.ts`) need `hoursAgo` (computed
   from "now") and stay in the route's row-projection. Repo/service return RAW
   visit rows (domain `Visit[]`); the route does projection + derivation exactly
   as today.

---

## Locked invariants (apply to all 5 routes)

- **Behaviour-preserving re-point ONLY.** Response shapes BYTE-IDENTICAL: same
  keys, same ordering semantics, same wrapping (products GET = bare array;
  insights = `{rows}`).
- **Each guard preserved BYTE-IDENTICAL.** products = `role === 'admin'` 403
  `'Admin only'`; insights = `x-mfs-user-id` presence 401 `'Unauthenticated'`.
  NO guard standardization (that's the SEPARATE unit F-RLS-04i).
- **NO per-user RLS switch-on.** Wiring uses the SERVICE-ROLE singleton, same
  posture as PR1 (`lib/wiring/customers.ts`). For visits, use the EXISTING
  service-role `visitsService` singleton from `lib/wiring/visits.ts` — NOT
  `visitsServiceForCaller` (that exists for the screen3 RLS routes; these admin
  reads stay on the master-key parachute, deferred to F-RLS-04i).
  🗣 The visits wiring file already has two doors: a master-key door and a
  per-user door. The 3 insight routes use the master-key door, same as they do
  today via the raw client — we are not flipping on row-level security here.
- **UI untouched. No new `package.json` deps.** The `?from`/`?to` window parsing
  and the "now" computation STAY in the routes (presentation).

---

## Domain-type decision (planner's call — JUSTIFIED)

### Products → ADD a `ProductAdminView` read-model. (Mirror PR1's `CustomerAdminView`.)

**Decision:** add a new `ProductAdminView` interface to `lib/domain/Product.ts`
(exported via `lib/domain/index.ts`). Do NOT extend the slim `Product` type.

**Why (the PR1 precedent, verified on disk):** `lib/domain/Product.ts:27-32`
defines `Product` as the *Orders-view* — `{ id, code, name, boxSize }` — and its
JSDoc explicitly says "F-20 Admin extends further for the full product catalogue
CRUD." PR1 hit the identical fork for customers and chose a SECOND named type
(`CustomerAdminView`, `lib/domain/Customer.ts:73-83`) rather than bloating the
slim `Customer`, with the rationale "APOSD §'general-purpose by accident'".
The admin Products screen needs `category`, `active`, `created_at` (and `code`,
`box_size` for the GET) — fields the Orders view neither has nor wants. Adding
them to `Product` would force every Orders call site to carry catalogue-admin
fields it never reads.

🗣 **In plain English:** the lean "Product" card that Orders uses stays lean. The
admin screen gets its own fuller card (`ProductAdminView`). Same move PR1 made
for customers — two labelled cards beat one bloated card.

**Shape (`ProductAdminView`):**
```ts
export interface ProductAdminView {
  readonly id: string;
  readonly name: string;
  readonly category: string | null;
  readonly code: string | null;
  readonly boxSize: string | null;     // maps DB box_size
  readonly active: boolean;
  readonly created_at: string;          // snake_case kept (matches PR1's CustomerAdminView.created_at)
}
```
> Note the deliberate naming mix, copied from `CustomerAdminView`: most fields
> are camelCase domain fields, but `created_at` stays snake_case because that is
> the exact wire key the routes emit and PR1 set this precedent
> (`CustomerAdminView.created_at`). The route's hand-projection maps
> `boxSize → box_size` for the GET wire shape (see §Projection mappings).

### Visits read methods → RETURN the existing `Visit[]` domain type. NO new type.

**Decision:** the 3 new `VisitsRepository` reads return `readonly Visit[]` (the
existing rich superset domain type, `lib/domain/Visit.ts:62-78`). The routes
hand-project to their camelCase view shapes.

**Why:** `Visit` is documented as "Rich superset visit shape for list contexts
(today + admin). A given query populates only the columns it selects; PR2 routes
pick the subset they emit." Every field the 3 routes need is already on `Visit`:
`prospectName`, `prospectPostcode`, `outcome` (RAW enum), `visitType` (RAW enum),
`pipelineStatus`, `customerName`, `loggedByName`, `createdAt`, `commitmentMade`,
`commitmentDetail`. The route's existing `.replace(/_/g,' ')` display transform
and the `hoursAgo`/derivation projection stay in the route (they already do).

🗣 **In plain English:** the visits "card" already has every field these 3 screens
read — it was built to be reused this way. The repo hands back full cards; each
route picks the bits it shows and formats them, exactly as it does today.

> **This asymmetry is intentional and matches the task brief:** PR1 returned
> domain types and the route hand-projected to snake_case; here the route
> projects to camelCase view shapes. Products gets a dedicated admin view
> (catalogue fields the slim type lacks); visits reuses the existing rich
> superset (it already has everything). Both follow "repo returns a domain
> type, route hand-projects to the wire shape."

---

## Exact files to change

### NEW files (4)
1. `lib/services/ProductsService.ts` — factory `createProductsService({ products })`, thin pass-through, ports only.
2. `lib/wiring/products.ts` — composition root; the ONLY new file importing `@/lib/adapters/*` (service-role singleton).
3. `tests/unit/wiring/productsService.test.ts` — pins the composition root (mirror `customersService.test.ts`).
4. `tests/unit/api/admin-products.route.test.ts` — route-guard + byte-identical-shape tests for products GET + PATCH.

### NEW test file for insights (1)
5. `tests/unit/api/admin-insights.routes.test.ts` — guard (401) + byte-identical `{rows}` shape for prospects / at-risk / commitments. Mocks `@/lib/wiring/visits`.

### MODIFIED files (12)

| # | File | Change |
|---|---|---|
| M1 | `lib/domain/Product.ts` | ADD `ProductAdminView` interface |
| M2 | `lib/domain/index.ts` | export `ProductAdminView` (line 22 area) |
| M3 | `lib/ports/ProductsRepository.ts` | ADD `listAll()`, `setActive(id, active)` to interface + JSDoc |
| M4 | `lib/ports/VisitsRepository.ts` | ADD `listProspects`, `listAtRisk`, `listCommitments` to interface + JSDoc |
| M5 | `lib/adapters/supabase/ProductsRepository.ts` | implement `listAll`, `setActive` (verbatim selects, `maybeSingle` for null-on-miss) |
| M6 | `lib/adapters/fake/ProductsRepository.ts` | implement `listAll`, `setActive` over the in-memory store |
| M7 | `lib/adapters/supabase/VisitsRepository.ts` | implement 3 reads (verbatim selects copied from the routes) |
| M8 | `lib/adapters/fake/VisitsRepository.ts` | implement 3 reads over the in-memory store |
| M9 | `lib/services/VisitsService.ts` | ADD 3 pass-through methods to interface + factory |
| M10 | `lib/ports/__contracts__/ProductsRepository.contract.ts` | ADD contract cases for `listAll` + `setActive` |
| M11 | `app/api/admin/products/route.ts` + `app/api/admin/products/[id]/route.ts` | re-point onto `productsService`; PATCH null→404 |
| M12 | `app/api/admin/{prospects,at-risk,commitments}/route.ts` | re-point onto `visitsService`; keep projection + derivation |

> **Optional (mirror PR1 — recommended, not blocking):** add a Visits contract
> file. There is currently NO `lib/ports/__contracts__/VisitsRepository.contract.ts`
> (verified — visits is tested via a hand-rolled query-builder stub +
> `VisitsService.test.ts`, not a shared adapter contract). Rather than invent a
> full contract harness for 3 read methods, ADD the 3-read coverage to the
> existing `tests/unit/adapters/supabase/VisitsRepository.test.ts` (verbatim
> select-string + row→domain mapping assertions, the file's established pattern)
> and to a fake-parity case. See §Test matrix.

**File count:** 5 new + 12 modified = **17 files** (PATCH route counts as M11's
second file; the 3 insight routes are M12's three files — literal file edits =
20). New deps: **0**.

---

## Method signatures

### ProductsRepository (M3) — added
```ts
/** Every product, ordered by name asc. The admin `products` GET list. */
listAll(): Promise<readonly ProductAdminView[]>;

/** Flip a product's active flag. Returns the updated row, or null if no row
 *  matched (the 404 branch — uses maybeSingle, never throws on no-match). */
setActive(id: string, active: boolean): Promise<ProductAdminView | null>;
```

### ProductsService (NEW, M-new-1) — full surface
```ts
export interface ProductsServiceDeps { readonly products: ProductsRepository; }
export interface ProductsService {
  findProductsByIds(ids: readonly string[]): Promise<readonly Product[]>; // existing pass-through
  listAll(): Promise<readonly ProductAdminView[]>;
  setActive(id: string, active: boolean): Promise<ProductAdminView | null>;
}
export function createProductsService(deps: ProductsServiceDeps): ProductsService { … }
```
> Keep `findProductsByIds` on the service surface too (it's the same port) so a
> future Orders re-point can also go through the service. Thin pass-through, no
> logic. Methods take primitives, never `Caller`/`request`.

### VisitsRepository (M4) — added 3 reads
```ts
/** Prospects-this-week list: visits with a non-null prospect_name in
 *  [from,to], newest first, rep join resolved. → GET /api/admin/prospects.
 *  Selects: id, created_at, prospect_name, prospect_postcode, outcome,
 *  visit_type, pipeline_status, users!visits_user_id_fkey(name). */
listProspects(window: { from: string; to: string }): Promise<readonly Visit[]>;

/** At-risk list: visits with outcome IN (at_risk, lost) in [from,to], newest
 *  first, customer + rep joins resolved. → GET /api/admin/at-risk.
 *  Selects: id, created_at, outcome, customer_id, prospect_name, user_id,
 *  customers(name), users!visits_user_id_fkey(name). */
listAtRisk(window: { from: string; to: string }): Promise<readonly Visit[]>;

/** Unreviewed-commitments list: visits with commitment_made=true and
 *  created_at < to (optional >= from), OLDEST first, joins resolved.
 *  → GET /api/admin/commitments.
 *  Selects: id, created_at, commitment_detail, customer_id, prospect_name,
 *  user_id, customers(name), users!visits_user_id_fkey(name). */
listCommitments(window: { from: string | null; to: string }): Promise<readonly Visit[]>;
```
> **Window contract note (byte-identity critical):**
> - `listProspects` / `listAtRisk`: `gte('created_at', from)` + `lte('created_at', to)`.
> - `listCommitments`: `lt('created_at', to)` (note: `lt`, NOT `lte`), and
>   `gte('created_at', from)` ONLY when `from` is non-null (the route applies
>   the `from` filter conditionally — `commitments/route.ts:49`). Order ASC.
>
> The `from`/`to` defaults + the `now` computation STAY in the routes (the
> repository takes already-resolved ISO strings). Each route still computes its
> own default window exactly as today (prospects/at-risk: rolling 7-day;
> commitments: `to = now - 24h`).

### VisitsService (M9) — added 3 pass-throughs
```ts
listProspects(window: { from: string; to: string }): Promise<readonly Visit[]>;
listAtRisk(window: { from: string; to: string }): Promise<readonly Visit[]>;
listCommitments(window: { from: string | null; to: string }): Promise<readonly Visit[]>;
```

---

## Byte-identical projection mappings (per route)

These projections must come out **byte-identical**. The repo returns domain
types; the route hand-projects (PR1's `toListRow`/`toAdminView` pattern).

### `products` GET — bare array, 7 keys
Repo `listAll()` → `ProductAdminView[]`. Route maps each row to:
```ts
{ id, name, category, code, box_size: row.boxSize, active, created_at }
```
> Order semantics: `name` ASC (preserved in adapter `.order('name', {ascending:true})`).
> Wire keys: `id, name, category, code, box_size, active, created_at`. The
> domain field is `boxSize`; the route emits `box_size`.

### `products/[id]` PATCH — single row, 5 keys
Repo `setActive(id, active)` → `ProductAdminView | null`. Route:
- `null` → `404 { error: 'Product not found' }` (the ONLY behaviour change).
- else project to: `{ id, name, category, active, created_at }`
  (the SUBSET — no `code`, no `box_size`, matching today's PATCH `.select('id, name, category, active, created_at')`).

### `prospects` GET — `{rows}`, 7 keys per row
Repo `listProspects(window)` → `Visit[]`. Route maps each `v` to:
```ts
{
  id:        v.id,
  name:      String(v.prospectName ?? ''),
  postcode:  String(v.prospectPostcode ?? ''),
  outcome:   String(v.outcome ?? '').replace(/_/g, ' '),
  visitType: String(v.visitType ?? '').replace(/_/g, ' '),
  rep:       v.loggedByName ?? 'Unknown',
  stage:     v.pipelineStatus ? String(v.pipelineStatus) : null,
}
```
> **BYTE-IDENTITY TRAP — `stage`:** today the raw row is `v.pipeline_status`
> with `?? null` only via the ternary, i.e. `stage = v.pipeline_status ? String(...) : null`.
> The domain mapper `toVisit` coerces `pipeline_status ?? 'Logged'` →
> `pipelineStatus` is NEVER null/empty; it defaults to `'Logged'`. **If today's
> data has rows with NULL pipeline_status, the wire `stage` would flip from
> `null` → `'Logged'`.** See §Risk R1 — this is the one shape that is harder to
> preserve than it looks. **Mitigation: `listProspects` must NOT route prospects
> through `toVisit`'s `?? 'Logged'` default for the `stage` field.** Two options,
> decide at Order/code-critic: (a) the prospects adapter read maps to a RAW
> pass-through that preserves null pipeline_status, OR (b) extend `Visit` with a
> nullable raw field. **Recommended: option (a)** — `listProspects` builds its
> rows so `pipelineStatus` carries the raw value (null stays null), so the route's
> `v.pipelineStatus ? ... : null` reproduces today exactly. Document the deviation
> from `toVisit` in the adapter method. The route guard test MUST include a
> null-`pipeline_status` fixture asserting `stage === null`.

### `at-risk` GET — `{rows}`, 6 keys per row
Repo `listAtRisk(window)` → `Visit[]`. Route maps each `v` (with `now` in scope):
```ts
const hoursAgo = Math.round((now.getTime() - new Date(v.createdAt).getTime()) / 3_600_000)
{
  id:       v.id,
  customer: v.customerName ?? v.prospectName ?? 'Unknown',
  outcome:  v.outcome,                          // RAW enum 'at_risk' | 'lost'
  rep:      v.loggedByName ?? 'Unknown',
  hoursAgo,
  reason:   deriveAtRiskReason(v.outcome, hoursAgo),
}
```
> `outcome` here is the RAW enum (NO `.replace`) — matches today
> (`at-risk/route.ts:63` emits the raw `'at_risk'|'lost'`). `deriveAtRiskReason`
> stays in the route.

### `commitments` GET — `{rows}`, 6 keys per row
Repo `listCommitments(window)` → `Visit[]`. Route maps each `v`:
```ts
const hoursAgo = Math.round((now.getTime() - new Date(v.createdAt).getTime()) / 3_600_000)
{
  id:       v.id,
  customer: v.customerName ?? v.prospectName ?? 'Unknown',
  detail:   v.commitmentDetail ?? '',
  rep:      v.loggedByName ?? 'Unknown',
  hoursAgo,
  status:   deriveCommitmentStatus(hoursAgo),
}
```
> `detail` today is `v.commitment_detail as string ?? ''`. `toVisit` maps
> `commitment_detail ?? null` → `commitmentDetail`, so `?? ''` in the route
> preserves the empty-string fallback. `deriveCommitmentStatus` stays in the route.

> **Join-coercion note (adapter side):** the existing `toVisit` mapper already
> handles the PostgREST to-one-join-as-object-or-1-element-array ambiguity via
> the `one()` helper (`VisitsRepository.ts:108-110`) and resolves the rep name
> via `users!visits_user_id_fkey(name)` → `usersJoin?.name`, customer via
> `customers(name)`. The 3 new reads reuse `toVisit` (except the prospects
> `stage` null-preservation per R1). The select strings are copied VERBATIM from
> the routes so the join aliases match exactly.

---

## Ordered steps (TDD: red → green per layer)

> Build inner→outer (domain → port → adapters/contract → service → wiring →
> route), writing the failing test first at each layer. This is the PR1 order.

**Phase A — Products domain + port (types compile, no behaviour yet)**
1. M1: add `ProductAdminView` to `lib/domain/Product.ts`.
2. M2: export it from `lib/domain/index.ts`.
3. M3: add `listAll` + `setActive` to `lib/ports/ProductsRepository.ts` (interface + JSDoc).

**Phase B — Products contract (RED) → adapters (GREEN)**
4. M10: extend `ProductsRepository.contract.ts` with cases:
   `listAll returns rows ordered by name asc / full ProductAdminView shape`;
   `setActive flips active and returns the row`;
   `setActive on an unknown id returns null` (the 404 anchor).
   Update `ProductsContractSetup` to also yield a togglable known product id.
   This is RED against both adapters.
5. M6: implement `listAll` + `setActive` in `lib/adapters/fake/ProductsRepository.ts`
   (store widened from `Map<string, Product>` to hold `ProductAdminView`; seed
   type updated; `findProductsByIds` still returns the slim `Product`). → fake contract GREEN.
6. M5: implement `listAll` + `setActive` in `lib/adapters/supabase/ProductsRepository.ts`.
   `listAll`: `.select('id, name, category, code, box_size, active, created_at').order('name',{ascending:true})`.
   `setActive`: `.update({active}).eq('id',id).select('id, name, category, active, created_at').maybeSingle()`
   → null-on-miss (the deviation from today's `.single()`). Add a `toAdminView`
   mapper. → supabase contract GREEN (needs local DB; see §Test matrix).
   > **Projection asymmetry inside the adapter:** `listAll` selects 7 cols,
   > `setActive` selects 5 (SUBSET — no code/box_size). `setActive`'s
   > `ProductAdminView` will have `code: null, boxSize: null` for the unselected
   > cols; that's fine — the PATCH route projects only `{id,name,category,active,created_at}`,
   > never reads code/boxSize. Document this in the mapper.

**Phase C — ProductsService + wiring**
7. M-new-1: write `lib/services/ProductsService.ts` (factory, ports only).
8. Export from `lib/services/index.ts`.
9. M-new-2: write `lib/wiring/products.ts` (service-role singleton `productsService`).
10. M-new-3: write `tests/unit/wiring/productsService.test.ts` (mirror `customersService.test.ts`:
    defined + exposes surface; `createProductsService` returns distinct objects). GREEN.

**Phase D — Products routes (RED route test → GREEN re-point)**
11. M-new-4: write `tests/unit/api/admin-products.route.test.ts` mocking `@/lib/wiring/products`:
    - GET 403 for non-admin; GET 200 exact 7-key bare array (`Object.keys(body[0]).sort()`).
    - PATCH 403 for non-admin; PATCH 200 exact 5-key row; **PATCH null→404** `{error:'Product not found'}`.
    RED.
12. M11: re-point both products routes onto `productsService`; add `toListRow`/`toRow`
    hand-projections; PATCH null→404. GREEN.

**Phase E — Visits port + adapters (insights)**
13. M4: add `listProspects` / `listAtRisk` / `listCommitments` to `lib/ports/VisitsRepository.ts`.
14. M7: implement the 3 reads in `lib/adapters/supabase/VisitsRepository.ts`. Add 3
    VERBATIM select strings (copied from the routes), reuse `toVisit` (with the R1
    `stage` null-preservation for prospects). Extend the unit test
    `tests/unit/adapters/supabase/VisitsRepository.test.ts` with: verbatim
    select-string assertion per read + row→domain mapping + the null-pipeline_status
    prospects case. RED→GREEN.
15. M8: implement the 3 reads in `lib/adapters/fake/VisitsRepository.ts` over the
    in-memory store (mirror `listAllWithFilters`'s window/filter logic). Add a
    fake-parity unit case.

**Phase F — VisitsService + insight routes**
16. M9: add the 3 pass-throughs to `lib/services/VisitsService.ts` (interface + factory).
17. M-new-5: write `tests/unit/api/admin-insights.routes.test.ts` mocking
    `@/lib/wiring/visits` (the service-role `visitsService` singleton): per route,
    401 when `x-mfs-user-id` absent; 200 exact key-set on `{rows}`
    (`Object.keys(rows[0]).sort()`); the prospects null-`stage` case; the
    at-risk/commitments `hoursAgo` + derivation pass-through. RED.
18. M12: re-point the 3 insight routes onto `visitsService.{listProspects,listAtRisk,listCommitments}`.
    Keep the route's window-default + `now` computation + projection + derivation.
    Each route imports `{ visitsService } from '@/lib/wiring/visits'` (the
    service-role singleton — NOT `visitsServiceForCaller`). GREEN.

**Phase G — green-the-tree**
19. `npm run test:unit` (or vitest unit) — all unit + fake-contract + lint green.
20. `npm run lint` — confirm `no-adapter-imports` still passes (routes import wiring, not adapters).
21. `npm run db:up && npm run db:reset && npm run test:integration -- adapters/supabase` —
    supabase ProductsRepository contract green against local DB.

---

## TDD test plan / matrix

| Layer | Test | DB needed? | Asserts |
|---|---|---|---|
| Unit — domain | (type-level, via compile) | no | `ProductAdminView` shape exists |
| Unit — contract (fake) | `tests/unit/adapters/fake/ProductsRepository.test.ts` (existing, runs extended contract) | no | listAll order+shape, setActive flip, setActive unknown→null |
| Integration — contract (supabase) | `tests/integration/adapters/supabase/ProductsRepository.test.ts` (existing, runs extended contract) | yes (local) | same contract against real PostgREST |
| Unit — fake visits | `tests/unit/adapters/fake/VisitsRepository.test.ts` (add cases) | no | 3 reads window/filter/order parity |
| Unit — supabase visits | `tests/unit/adapters/supabase/VisitsRepository.test.ts` (add cases) | no (query-builder stub) | verbatim select strings + row→domain + null-pipeline_status |
| Unit — service wiring | `tests/unit/wiring/productsService.test.ts` (NEW) | no | singleton defined + distinct-object factory |
| Unit — route (products) | `tests/unit/api/admin-products.route.test.ts` (NEW) | no | 403 guard; bare-array 7 keys; PATCH 5 keys; **PATCH null→404** |
| Unit — route (insights) | `tests/unit/api/admin-insights.routes.test.ts` (NEW) | no | 401 guard; `{rows}` key-sets; null-stage; derivations |

> **ANVIL scope (SCOPED, not a full browser sweep).** This is a backend-only,
> no-UI, no-RLS, behaviour-preserving re-point (the same class as PR1's
> Customers cutover, which earned a scoped tap). Per the MEMORY ops note
> ([[anvil-full-browser-taps]]): right-size browser-tap depth to blast radius — a
> behaviour-preserving re-point does NOT earn the exhaustive every-button sweep.
> ANVIL layers that apply: Unit (full) + DB/contract (supabase ProductsRepository
> contract on local) + a TARGETED E2E API smoke against the 5 routes on the
> prod-build preview (assert the 5 response shapes + the new 404). NO exhaustive
> UI tap matrix.
> 🗣 We only tap as hard as the change can break things. Nothing the user clicks
> changes, so we prove the 5 endpoints still return the same JSON (plus the new
> clean 404) — we don't re-walk every admin screen.

---

## Acceptance criteria

1. All 5 routes import from `lib/wiring/*` (`productsService`, `visitsService`),
   NONE imports `@/lib/adapters/supabase/client`. (`grep` clean.)
2. `lib/services/ProductsService.ts` + `lib/services/VisitsService.ts` import
   ports only — `no-adapter-imports` lint green.
3. `lib/wiring/products.ts` is the only NEW file importing `@/lib/adapters/*`.
4. Response shapes byte-identical for all 5 routes (key-set tests pass), EXCEPT
   `products/[id]` PATCH on a missing id now returns 404 (the one sanctioned change).
5. Guards byte-identical: products 403 `'Admin only'`; insights 401 `'Unauthenticated'`.
6. `prospects.stage` preserves `null` for null `pipeline_status` rows (R1).
7. Both Products adapters satisfy the extended contract (fake unit + supabase integration).
8. No new `package.json` entries.
9. Visits admin reads run through the SERVICE-ROLE `visitsService` singleton (no
   `…ForCaller`, no RLS flip).

---

## Hexagonal self-check (Gate 2 verdict, computed)

- **Ports used/added:**
  - `ProductsRepository` (EXISTING port) — EXTENDED with `listAll` + `setActive`.
  - `VisitsRepository` (EXISTING port) — EXTENDED with 3 admin reads.
  - NO new port created (Insights folds onto Visits — locked decision 1).
- **Adapters implementing them:**
  - `lib/adapters/supabase/ProductsRepository.ts` + `lib/adapters/fake/ProductsRepository.ts`.
  - `lib/adapters/supabase/VisitsRepository.ts` + `lib/adapters/fake/VisitsRepository.ts`.
  - Both ports keep their two-adapter (real + fake) parity — the contract/parity
    tests prove the swap is real, not a guess.
- **New dependencies:** NONE. No `package.json` change. (No new vendor, nothing to wrap.)
- **Single-use vendor wrap:** N/A — no new vendor library introduced.
- **Rip-out test:** "If I replace the database for Products / Insights tomorrow,
  how many files change?" → ONE new adapter (`lib/adapters/<vendor>/ProductsRepository`
  or `VisitsRepository`) + ONE wiring line (`lib/wiring/products.ts` /
  `lib/wiring/visits.ts`). Routes, services, domain, ports unchanged.
  **RIP-OUT TEST: PASS.**
- **Dependency-direction check:** routes (`app/**`) import `lib/wiring/*` only;
  services import `lib/ports/*` only; adapters are the sole vendor-SDK importers
  (allow-listed). Inner layers never import outward. PASS.

🗣 **In plain English:** we're adding pin-holes to two existing sockets and one
new parts-list file — no new vendor, no new socket type. Swap the database later
and you change one plug + one wiring line per domain. The Lego rule holds.

---

## Risk Assessment

### R1 — `prospects.stage` null-flip (BUSINESS-LOGIC / byte-identity) — MUST-FIX
**Severity: HIGH.** The existing prospects route emits
`stage: v.pipeline_status ? String(v.pipeline_status) : null`. The domain mapper
`toVisit` (`VisitsRepository.ts:172`) coerces `pipeline_status ?? 'Logged'`, so a
naive re-point would turn a NULL `pipeline_status` row's wire `stage` from `null`
into `'Logged'` — a silent, real behaviour change on live data.
**Mitigation:** `listProspects` must preserve the raw null `pipeline_status` (do
NOT inherit `toVisit`'s `?? 'Logged'` default for the `stage` path). Recommended:
the adapter's prospects mapping builds rows so `pipelineStatus` carries the raw
value (null stays null); the route test includes a null-`pipeline_status` fixture
asserting `stage === null`. **Must-fix flag: YES** — this is the one shape that is
harder to preserve than it looks, and it's a Gate-2 blocker until the plan's
mitigation is implemented and pinned by a test.
🗣 The visits card "helpfully" fills in a default pipeline stage of 'Logged' when
it's blank. The prospects screen today shows blank as blank. We must stop that
auto-fill for this one screen, or accounts with no stage would suddenly read
'Logged' — a data lie. The test must prove blank stays blank.

### R2 — `commitments` window operator (`lt` vs `lte`, conditional `from`) — MEDIUM
**Severity: MEDIUM.** `listCommitments` uses `lt('created_at', to)` (strictly
less-than), ASC order, and applies `gte('created_at', from)` ONLY when `from` is
non-null — different from prospects/at-risk's `gte`+`lte`. A copy-paste from the
other two reads would change the result set (boundary rows + the no-`from` default).
**Mitigation:** the signature takes `from: string | null`; the adapter applies
`from` conditionally and uses `lt` for `to`. Pinned by the supabase adapter unit
test asserting the exact builder calls. **Must-fix: no** (caught by the unit
select/builder assertion), but call out explicitly to the implementer.

### R3 — Fake-adapter parity drift — MEDIUM
**Severity: MEDIUM.** If the fake `listProspects/listAtRisk/listCommitments`
don't reproduce the supabase window/filter/order semantics, the contract/parity
tests pass while production differs (false-green). **Mitigation:** the fake reads
mirror `listAllWithFilters`'s existing in-memory window/filter pattern; add
explicit fake-parity unit cases for the outcome-filter (at-risk), the
prospect_name-not-null filter (prospects), and the commitment_made filter
(commitments) + order direction. **Must-fix: no.**

### R4 — Products `setActive` `.single()` → `.maybeSingle()` swallowing real errors — LOW
**Severity: LOW.** Switching `.single()` → `.maybeSingle()` for the null→404 path
must not also swallow genuine DB errors as "not found". **Mitigation:** keep the
`if (error) throw new ServiceError(...)` branch BEFORE the null check (the PR1
`setActive` pattern, `CustomersRepository.ts:140-147`); only a clean `data === null`
maps to null→404. **Must-fix: no.**

### Concurrency / race conditions
**No material risks.** All 5 routes are independent reads + one idempotent
single-row `update`. No multi-step transactions, no read-modify-write across
requests introduced. The service is a stateless thin pass-through (the wiring
test pins distinct-object construction, so no shared mutable state).

### Security
**No material risks — but note the posture is unchanged on purpose.** Guards stay
byte-identical (products 403 / insights 401); wiring stays on the SERVICE-ROLE
singleton (RLS bypassed), exactly as today. This is NOT a security improvement and
NOT a regression — the per-user RLS hardening is the separate F-RLS-04i unit.
🗣 We are not touching who-can-see-what here; same locks as today, deliberately.
The real lock upgrade is a later, separate job.

### Data migration
**None.** No schema change, no migration file, no backfill. The
`migration-filename` convention test is not exercised.

### Launch blockers
**One: R1 (the `stage` null-flip) is a launch blocker** until its mitigation +
test ship. Everything else is covered by the unit/contract matrix.

### Risk headline
**1 MUST-FIX (R1 — `prospects.stage` null-flip).** It does not block planning, but
it blocks Gate 2 sign-off until the implementer applies the documented
null-preservation mitigation and pins it with a null-`pipeline_status` route test.
R2–R4 are covered by the test matrix; concurrency/security/migration carry no
material new risk.
