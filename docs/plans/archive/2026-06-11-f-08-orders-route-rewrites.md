# F-08 — Orders route rewrites (thin handlers over OrdersService)

- **Date:** 2026-06-11
- **Unit:** F-08 (ADR-0003 Phase 1, final code unit before the F-09 rip-out audit)
- **Branch base:** main @ `9753da3`
- **Spec:** Gate 1 locked (conductor prompt, 2026-06-11) — this plan implements it, it does not re-litigate it.

**🗣 In plain English:** The five web addresses the app uses for orders (list, create, view/edit, print picking list, kitchen screen) currently talk to the database directly. This plan rewrites them as thin "receptionists" that hand all real work to the order-logic engine we built in the last unit. To the people using the screens, almost nothing changes — but ripping out the database vendor later becomes a one-file job, double-taps on "Place order" can no longer create two orders, and every request is now checked at the door before it reaches the engine.

---

## 1. Goal

Rewrite the five Orders endpoints as handlers of ≤20 lines each that:

1. authenticate via `requireRole` (`lib/auth/session.ts`) where the legacy route checked cookies,
2. validate every inbound body/query/param with zod before anything reaches the service,
3. call `OrdersService` (`lib/services/OrdersService.ts`) or a new `lib/usecases/` use-case,
4. translate domain objects back into the **exact legacy snake_case JSON** the five screens read today,
5. are wrapped `withRequestContext(withErrors(handler))` with **no try/catch inside**.

Plus four locked riders: Idempotency-Key support on `POST /api/orders` (new DB table + migration), a minimal read-only Users port, the F-TD-06 ValidationError shape fix, and the ARCH-FU-05 forbidden-role tests.

**🗣 In plain English:** Five door-handlers get rebuilt so each one only does four small jobs — check who's asking, check the request makes sense, ask the engine to do the work, and word the answer exactly the way the screens already expect. Everything else (one-tap-one-order protection, a small "who is this staff member" lookup, two test-quality fixes) rides along because this is the natural place to do them.

---

## 2. Domain terms used in this plan

- **Port** — an interface in `lib/ports/` the app owns (e.g. `OrdersRepository`). **🗣 In plain English:** a written job description for "whatever stores our data", with no vendor name on it.
- **Adapter** — a concrete implementation in `lib/adapters/<vendor>/`. **🗣 In plain English:** the employee (Supabase today) actually doing that job; swappable without telling the rest of the app.
- **Use-case** (`lib/usecases/`) — composition of a service plus extra ports for one business operation (ADR-0002: services never import services; composition lives here). **🗣 In plain English:** a small coordinator used when one job needs two departments — e.g. "build the picking sheet" needs the orders engine AND the product catalogue AND the staff list.
- **DTO translator** — a pure function mapping a domain object (camelCase) to the legacy wire shape (snake_case). **🗣 In plain English:** a phrasebook that re-words the engine's modern answer into the exact old dialect the screens were built to read, so no screen has to be rewritten.
- **Idempotency key** — per CONTEXT.md: a unique fingerprint sent with "place order"; the same fingerprint twice creates nothing the second time and returns the first order. **🗣 In plain English:** one tap = at most one order, even on flaky warehouse wifi.

---

## 3. ADR review and conflicts

- **ADR-0002 (hexagonal shape):** complied with — routes call services/use-cases, vendor SDK stays in `lib/adapters/supabase/`. The new presentation helpers (zod schemas, DTO mappers) live in `lib/api/orders/` and `lib/api/kds/` — a new, clearly-presentation-layer location (see §5 decision D6). **No conflict.**
- **ADR-0003 (strangler fig / FREEZE):** this unit IS the F-08 named there ("thin rewrites of the 5 Orders route files, with inbound zod validation and idempotency keys on create operations"). **No conflict — direct fulfilment.**
- **ADR-0005 (raw-fetch deferral):** none of the five Orders routes are raw-fetch sites (all use `supabaseService` via the SDK); the Per-Site Map assigns nothing to F-08. **No conflict.**
- **ADR-0006 (preview branches):** this PR carries a migration, so the per-PR Supabase preview branch flow applies; Gate 4 runs the preview smoke against the branch. ADR-0006's addendum: Deployment Protection is OFF, so the smoke runs with `--unprotected`. **No conflict — this is the first PR the ADR was built for.**
- **One flag, not a conflict:** `zod` is not on ADR-0002's vendor-SDK list and is not an external _service_ — it is a pure validation utility with no I/O. The plan treats it like a framework-level library (same class as `next`/`react`): confined by convention to `lib/api/**` (and never imported in `lib/domain`, `lib/ports`, `lib/services`, `lib/adapters`). F-27's lint tightening can codify this. Written dependency justification is in §6 step 0.

**🗣 In plain English:** Nothing in this plan fights any past architectural decision — this unit is the one those decisions were written to enable. The only judgement call worth flagging: the new validation library (zod) isn't an outside service like a database, so it doesn't need the full "hide it behind an interface" treatment; we instead fence it into the door-checking layer only.

---

## 4. Current behaviour = the contract (what was read and verified)

Verified by reading all five routes, all five screens, the service, ports, adapters, errors, auth, observability, tests and migrations. Key facts the design below depends on:

1. **Wire shapes (success paths)** — recorded per endpoint in §5.4. The KDS queue's per-line `product: {id, name}` embed and the list endpoint's _absence_ of a `printer` key are the two easy-to-miss details.
2. **`middleware.ts`** puts `/api/orders` in `SHARED_API_PATHS` (any authenticated user reaches the handlers) and `/api/kds` in `PUBLIC_PATHS` (no session at all). So role gating for orders happens **in the route**, and KDS stays cookie-less. `requireRole` reads the `x-mfs-*` headers middleware sets from the `mfs_session` cookie — the legacy `mfs_role`/`mfs_user_id` cookies become dead for these five routes.
3. **`KdsOrderQueueSnapshot`** (verified in `lib/ports/OrdersRepository.ts:87-92`) already carries `recentFlashes` + `serverTime`, flash window fixed at 60s in the adapter — as the spec said. It does **not** carry per-line product names; §5 D3 closes that gap.
4. **Integration tests** (92 green on main) assert _status codes_, not error-body shapes (`grep` confirmed: no `{error: ...}` body assertions). Three existing status assertions change (§8.3).
5. **Unit test #28 pin** (`tests/unit/services/OrdersService.test.ts:701`) reads only `lib/services/OrdersService.ts` source. This plan adds **no** files to `lib/services/` (use-cases go to `lib/usecases/`) and adds no forbidden imports to `OrdersService.ts`, so the pin stays green untouched — per F-TD-05, its scope is NOT expanded here.
6. **`lib/orders/validation.ts`** is imported only by the two routes being rewritten and its own unit test → safe to **delete** (with the test). `lib/orders/types.ts` is still imported by all five screens, `pickingList.ts` and `EditLockBanner.tsx` → **stays** (deletion is a later cleanup, per the note in `lib/domain/Order.ts:22-32`).

**🗣 In plain English:** Before designing anything, I checked how the doors behave today down to the exact wording of their answers — because the screens were built to read those exact answers, and the 92 existing robot tests are the safety net that catches us if we accidentally change one. I also confirmed which old helper files become orphans (one gets deleted) and which must stay (screens still use one of them).

---

## 5. Design decisions

### D1 — Idempotency: table, race handling, TTL

**New migration:** `supabase/migrations/20260611_001_order_idempotency_keys.sql`

```sql
-- One row per Idempotency-Key ever accepted by POST /api/orders.
CREATE TABLE order_idempotency_keys (
  key         text        PRIMARY KEY
                          CHECK (char_length(key) BETWEEN 1 AND 200),
  order_id    uuid        NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  created_by  uuid        NOT NULL REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL DEFAULT (now() + interval '24 hours')
);

-- Deny-all by default; only the service-role client (which bypasses RLS)
-- touches this table. Matches the ADR-0004 posture of the orders tables.
ALTER TABLE order_idempotency_keys ENABLE ROW LEVEL SECURITY;
```

**🗣 In plain English:** A small ledger table: "fingerprint X already created order Y for user Z, and this memory expires after 24 hours." The 24-hour expiry is plenty — the fingerprint exists to absorb double-taps and wifi retries that happen within seconds, not days. Row-level security is switched on with no allowances, meaning nobody can read this table except the server itself.

**Seam (design-it-twice, chosen A):**

- **(A — chosen)** Extend the existing port method: `OrdersRepository.createOrder(input, createdBy, idempotencyKey?)`. The whole claim/replay/race dance hides inside the adapter — one deep method (ADR-0002 depth rule).
- **(B — rejected)** A separate `IdempotencyRepository` port with `find`/`remember` methods. Rejected: the race-correctness dance spans "create order" and "record key" — splitting it across two ports forces the service to orchestrate the race, recreating at the service layer exactly the complexity the depth rule says to bury.

**🗣 In plain English:** The "have I seen this fingerprint before?" logic becomes part of the existing "create an order" job description, not a separate department — because keeping the two steps together is the only way to make the double-tap protection airtight without smearing tricky timing logic across layers.

**Adapter algorithm (Supabase, inside `createOrder` when `idempotencyKey` is present):**

1. `SELECT` the key row.
   - Found, **expired** → `DELETE` it, fall through to create.
   - Found, live, `created_by` ≠ caller → throw `ConflictError("Idempotency-Key already used")` (409). Never reveal the other user's order.
   - Found, live, same caller → `findOrderById(order_id)`; return it (replay, no-op). If the order was meanwhile deleted, delete the stale key row and fall through to create.
2. Create the order via the existing two-step insert + rollback (unchanged code path).
3. `INSERT` the key row. On unique-violation (`23505`) — **the concurrent race, loser path**:
   a. delete the order we just created (CASCADE removes its lines),
   b. re-`SELECT` the winner's row; same caller → fetch + return the **winner's** order; different caller → `ConflictError` as above;
   c. if the winner's row vanished mid-flight (winner expired/rolled back — pathological), retry the insert once, then `ServiceError`.
4. Return the created order.

**🗣 In plain English:** If two identical requests land at the same instant, both briefly create an order, but the database's "this fingerprint can only exist once" rule picks exactly one winner. The loser quietly deletes its own duplicate and hands back the winner's order — so the customer always ends up with exactly one order no matter how unlucky the timing. The brief duplicate is invisible from outside: its order number is never shown to anyone.

**Known acceptable side-effects (documented, not bugs):** the loser path consumes one `MFS-YYYY-NNNN` reference number (gaps in the sequence are already possible via the existing lines-insert rollback) and writes create+delete audit rows. Both are harmless and only occur on a true same-millisecond race.

**TTL / cleanup decision:** expiry enforced at read time (`expires_at` check) and reclaimed opportunistically (expired row deleted when its key is reused). **No scheduled cleanup job in this unit** — at this system's order volume the table grows by a few rows a day. A BACKLOG entry (`F-TD-09`, §6 step 12) tracks a periodic purge.

**🗣 In plain English:** Old fingerprints stop counting after 24 hours and get binned when convenient. A nightly sweeper isn't worth building yet for a table this small — it goes on the to-do list instead.

**Service seam:** `OrdersService.placeOrder(input, callerUserId, idempotencyKey?)` — optional third parameter, pure pass-through to the port. Requests **without** the header take literally the same code path as today. The route reads the `Idempotency-Key` header: absent/blank → `undefined`; longer than 200 chars → 400 `ValidationError`.

**Replay response:** HTTP **201** with the same `{id, reference}` body both times. (Design-it-twice: 200-on-replay was considered and rejected — the screens don't send the header yet, no consumer distinguishes the two, and a single status keeps the handler thinner.)

**🗣 In plain English:** The order form keeps working exactly as today (it doesn't send a fingerprint yet — wiring the form up is a later, separate change). Anything that does send one gets the same "created!" answer whether it was the first tap or an accidental second.

### D2 — Users port (minimal, read-only; F-13 absorbs/expands)

- `lib/domain/User.ts` — `UserSummary { id: string; name: string; role: string; active: boolean }` (readonly fields). `role` is a plain `string`, not the `Role` union — the canonical union still lives in `lib/observability/Caller.ts` (ARCH-FU-01) and importing observability into `lib/domain` would invert the dependency direction. F-13 tightens this to the union when `Role` moves home.
- `lib/ports/UsersRepository.ts` — `findUserById(id: string): Promise<UserSummary | null>` (null on miss per APOSD §11; `ServiceError` on DB failure).
- `lib/adapters/supabase/UsersRepository.ts` — `select('id, name, role, active') … maybeSingle()`, factory `createSupabaseUsersRepository(client)` + singleton `supabaseUsersRepository` (F-06 template).
- `lib/adapters/fake/UsersRepository.ts` — `createFakeUsersRepository(users: UserSummary[])` + singleton.
- `lib/ports/__contracts__/UsersRepository.contract.ts` — shared behavioural suite (found → full shape; miss → null), run by `tests/unit/adapters/fake/UsersRepository.test.ts` and `tests/integration/adapters/supabase/UsersRepository.test.ts`.

Used by: KDS line-done (validate butcher: exists, `active`, role ∈ `['butcher','warehouse']`) and picking-list (printed-by display name). **F-13 (Users + Auth) absorbs and expands this port** — note added to the port JSDoc and BACKLOG.

**🗣 In plain English:** A one-question interface to the staff list: "who is user X — name, job role, still employed?" The kitchen screen needs it to confirm a butcher's tap really came from a butcher, and the picking sheet needs it to print the name of whoever pressed Print. The future Users unit will grow this into the full staff-management interface; today it stays deliberately tiny.

### D3 — Picking-list and KDS data assembly: use-cases (not service growth)

Three new use-cases in `lib/usecases/` (each: factory taking `{ ordersService, …ports }` + pre-wired singleton, matching the F-07 construction template):

1. **`lib/usecases/pickingList.ts`** — `previewPickingList(orderId, callerUserId)` (GET: `findOrderById`, null → `NotFoundError("Order not found")`, `printedAt = now`) and `printPickingList(orderId, callerUserId, when)` (POST: `ordersService.printOrder` does the state transition and supplies `printedAt`). Both then batch-fetch the product map via `ProductsRepository.findProductsByIds` and the printer's name via `UsersRepository.findUserById` (`?? 'unknown'`, matching legacy). Return shape: `{ order, productsById: ReadonlyMap<string, Product>, printedByName: string, printedAt: string }`. The route maps that to `PickingListData` and calls `renderPickingListHtml` (`lib/orders/pickingList.ts` stays where it is — pure presentation, allowed at the route layer per the locked spec).
2. **`lib/usecases/kdsQueue.ts`** — `getKdsQueue(since)`: `ordersService.listKdsQueue(since)`, then one batched `findProductsByIds` over every catalogued line in the snapshot. Returns `{ snapshot, productsById }`. **This closes the verified gap**: the domain `Order` does not carry per-line product names, but the legacy KDS wire shape embeds `product: {id, name}` on every line.
3. **`lib/usecases/kdsLineDone.ts`** — `completeKdsLineDone(lineId, butcherId, when)`: Users-port validation (miss → `NotFoundError("Butcher not found")` 404; inactive → `ForbiddenError("Butcher account inactive")` 403; role ∉ `['butcher','warehouse']` → `ForbiddenError("User cannot mark lines done")` 403 — statuses identical to legacy), then `ordersService.completeLineDone(lineId, butcherId, when)`.

Design-it-twice: extending `OrdersService` with `getPickingListData()` was the alternative. Rejected: the service would need the Users port (premature — F-13's territory) and the Products map for display purposes (presentation data, not order business logic). Use-cases are exactly the composition point ADR-0002 names, and keeping `lib/services/` single-file sidesteps any F-TD-05 pin interaction.

**🗣 In plain English:** Printing a picking sheet needs three departments at once — the orders engine, the product catalogue (for codes and pack sizes), and the staff list (for the printer's name). Rather than bloating the orders engine, three small coordinators each gather what one endpoint needs. The kitchen-screen coordinator also restores one detail the new engine doesn't carry: the product names shown on each line of the kitchen display.

### D4 — Auth per endpoint (requireRole)

| Endpoint                                                   | Legacy check                                       | New                                                                                                                                                                                                                                             |
| ---------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET `/api/orders`                                          | cookie role ∈ admin/sales/office/warehouse/butcher | `requireRole(req, ['admin','sales','office','warehouse','butcher'])`                                                                                                                                                                            |
| POST `/api/orders`                                         | role ∈ admin/sales/office + userId                 | `requireRole(req, ['admin','sales','office'])`                                                                                                                                                                                                  |
| GET `/api/orders/[id]`                                     | role ∈ read list                                   | same as GET list                                                                                                                                                                                                                                |
| PUT `/api/orders/[id]`                                     | any role + userId (state×role done later)          | `requireRole(req, ['admin','sales','office'])` — the union of every role that can edit in any state; service still enforces per-state rules. Net statuses identical (excluded roles got 403-from-state-check before, 403-from-requireRole now). |
| GET picking-list                                           | read list + userId                                 | `requireRole(req, ['admin','sales','office','warehouse','butcher'])`                                                                                                                                                                            |
| POST picking-list                                          | admin/office/warehouse + userId                    | `requireRole(req, ['admin','office','warehouse'])`                                                                                                                                                                                              |
| GET `/api/kds/orders`, POST `/api/kds/lines/[lineId]/done` | **none (public kiosk)**                            | **unchanged — no requireRole**; butcher identity validated from the body via the Users port (D3.3)                                                                                                                                              |

**🗣 In plain English:** Who may do what does not change at all. What changes is the wording of the refusal: today a logged-in driver trying to create an order is told "401 — who are you?"; the standard helper correctly tells them "403 — we know who you are, you're just not allowed." The kitchen kiosk keeps its no-login model exactly as it is — its protection remains the locked production room plus the per-tap butcher check.

### D5 — Error wire shape and the screen edits

All error bodies become `AppError.toJSON()`: `{code, message}` (+ `fields` for validation errors). Production strips `cause`/`stack` (verified in `AppError.toJSON`; Vercel previews build with `NODE_ENV=production`). The five screens read `body?.error` today on their error-display lines only — those exact lines change (inventory in §5.5). Zod failures are mapped to `ValidationError(fields)` by one tiny helper (`lib/api/validate.ts: parseOrThrow(schema, value)`) so clients get the documented `Record<field, string[]>` shape.

**🗣 In plain English:** Error replies switch from a one-word envelope (`{"error": "..."}`) to a structured one (`{"code": "...", "message": "...", "fields": {...}}`). Each screen needs a one-or-two-line tweak so it reads the message from the new envelope — otherwise users would see the generic "Server error (400)" fallback instead of the real explanation.

### D6 — Where the route-layer helpers live

`lib/api/` (new): `lib/api/validate.ts`, `lib/api/orders/schemas.ts`, `lib/api/orders/dto.ts`, `lib/api/kds/schemas.ts`, `lib/api/kds/dto.ts`. Chosen over `app/api/orders/_lib/` because: clean `@/lib/api/...` imports with no `[id]` bracket-path awkwardness, trivially unit-testable, and an unmistakable one-folder home for "presentation boundary" code (zod is allowed here and only here). The ≤20-line target applies to handler bodies; these modules don't count but stay small and dedicated.

**🗣 In plain English:** The door-checking rules and the phrasebooks get their own clearly-labelled drawer (`lib/api/`) instead of being stuffed inside the route files — keeping each route file short enough to read in one glance, and letting the test suite check the phrasebooks word by word.

### 5.4 DTO translator inventory (domain → legacy wire, success paths)

| Translator (in `lib/api/orders/dto.ts` / `kds/dto.ts`) | Used by                    | Exact legacy keys it must emit                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------ | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `toOrderListDto(order)`                                | GET /api/orders            | `id, reference, customer_id, delivery_date, delivery_notes, order_notes, state, created_by, created_at, printed_by, printed_at, completed_at, customer{id,name,postcode}, creator{id,name}, lines[{id, line_number, product_id, ad_hoc_description, quantity, uom, notes, done_at, done_by}]` — **no `printer` key** (the legacy list SELECT omits it)                                                         |
| `toOrderDetailDto(order)`                              | GET /api/orders/[id]       | list shape **plus** `printer{id,name}`                                                                                                                                                                                                                                                                                                                                                                         |
| `toPickingListData(assembly)`                          | both picking-list handlers | `PickingListData` (`lib/orders/pickingList.ts:36`): `reference, customer_name ('—' fallback), customer_postcode, order_date (createdAt.slice(0,10)), delivery_date, sales_rep ('—' fallback), printed_at, printed_by (name), delivery_notes, order_notes, lines[{line_number, product_code ('' fallback), description (ad_hoc ?? product name ?? '(unknown product)'), quantity, uom, pack (boxSize), notes}]` |
| `toKdsOrderDto(order, productsById)`                   | GET /api/kds/orders        | `id, reference, state, delivery_date, delivery_notes, order_notes, printed_at, completed_at, customer{id,name}` (**no postcode**), `lines[{id, line_number, product_id, ad_hoc_description, quantity, uom, notes, done_at, done_by, product{id,name}                                                                                                                                                           | null}]` |
| `toKdsQueueResponse(bundle)`                           | GET /api/kds/orders        | `{ orders: [...], recent_flashes: [{order_id, action, created_at}], server_time }`                                                                                                                                                                                                                                                                                                                             |
| (inline, trivial)                                      | POST /api/orders           | `{ id, reference }`, 201                                                                                                                                                                                                                                                                                                                                                                                       |
| (inline, trivial)                                      | PUT /api/orders/[id]       | `{ ok: true }`, 200 (service's returned Order is discarded — wire compat)                                                                                                                                                                                                                                                                                                                                      |
| (inline, trivial)                                      | POST kds line-done         | `{ok:true, already_done:true}` / `{ok:true, completed:true}` / `{ok:true}`                                                                                                                                                                                                                                                                                                                                     |

Note: JSON **key sets and values** are pinned; key _order_ inside objects may differ (JSON consumers are order-agnostic; no test or screen reads positionally). Line arrays come back sorted by `line_number` (the adapter sorts; legacy embed order was unspecified — strictly an improvement, nothing asserts the raw order).

**🗣 In plain English:** This table is the word-for-word dictionary of what each endpoint must keep saying. The two traps it guards against: the order _list_ never mentioned who printed an order (only the detail view does), and the kitchen screen expects each line to carry its product's name. Both are pinned here so the implementer can't miss them.

### 5.5 Zod schema inventory (in `lib/api/orders/schemas.ts`, `lib/api/kds/schemas.ts`)

| Schema                             | Validates                    | Rules (replicating `lib/orders/validation.ts` semantics) and output                                                                                                                                                                                                                                                                                                  |
| ---------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `listOrdersQuerySchema`            | GET /api/orders query        | `state`: optional enum placed/printed/completed; `delivery_date`: optional real `YYYY-MM-DD`; `customer_id`, `created_by`: optional uuid; `limit`: optional string → `parseInt                                                                                                                                                                                       |     | 50`, clamped 1–200 (legacy clamp preserved — invalid limit silently becomes 50, NOT a 400). Transforms to camelCase `OrderFilter`. |
| `createOrderBodySchema`            | POST /api/orders body        | `customer_id` uuid; `delivery_date` real `YYYY-MM-DD` (same calendar check as legacy `isYmdDate`); `delivery_notes`/`order_notes` optional nullable string → trim → empty becomes null; `lines` non-empty array of `orderLineSchema`. Transforms to domain `CreateOrderInput` (incl. legacy normalisation: when `product_id` set, `ad_hoc_description` forced null). |
| `orderLineSchema`                  | each line                    | XOR: uuid `product_id` vs non-blank `ad_hoc_description` (both → error; neither → error); `quantity` finite > 0; `uom` enum kg/unit; `notes` trim-to-null. Error messages mirror the legacy `Line N: …` texts inside `fields`.                                                                                                                                       |
| `updateOrderBodySchema`            | PUT body                     | all-optional variant: `delivery_date` checked when present; `lines` non-empty when present. Transforms to `{ patch: OrderPatch, lineReplacement?: CreateOrderLineInput[] }` preserving the undefined-vs-null distinction (`undefined` = leave alone).                                                                                                                |
| `orderIdParamSchema`               | `[id]` routes + picking-list | uuid.                                                                                                                                                                                                                                                                                                                                                                |
| `idempotencyKeyHeader` (helper fn) | POST /api/orders header      | trim; blank → undefined; >200 chars → `ValidationError`.                                                                                                                                                                                                                                                                                                             |
| `kdsLineIdParamSchema`             | line-done `[lineId]`         | uuid (legacy regex equivalent).                                                                                                                                                                                                                                                                                                                                      |
| `kdsLineDoneBodySchema`            | line-done body               | `butcher_id` uuid (legacy: trim + regex).                                                                                                                                                                                                                                                                                                                            |

`lib/api/validate.ts: parseOrThrow(schema, value)` converts a `ZodError` to `ValidationError("Invalid request", fields)` where `fields = { '<path.joined>': [messages…] }`.

**🗣 In plain English:** Every box on every incoming request gets checked against a written rulebook before the engine sees it — same rules as the old hand-written checker (a real date, a positive quantity, either a catalogue product or a free-text description but never both/neither), now expressed in a standard library that produces field-by-field error lists the forms can show next to the right input.

### 5.6 Screen error-display edits (minimal, verified line numbers on main)

| File                            | Line(s)                  | Today                                                       | Change                                                                                                                                                                                                                 |
| ------------------------------- | ------------------------ | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/orders/page.tsx`           | 120                      | `setError(body?.error ?? \`Server error (${res.status})\`)` | `body?.message ?? …`                                                                                                                                                                                                   |
| `app/orders/[id]/page.tsx`      | 85, 276                  | same pattern                                                | `body?.message ?? …`                                                                                                                                                                                                   |
| `app/orders/new/page.tsx`       | 171                      | `setSubmitError(body?.error ?? …)`                          | fields-aware: `setSubmitError(body?.fields ? Object.values(body.fields).flat().join('; ') : (body?.message ?? \`Server error (${res.status})\`))` — keeps the "Unknown product id: X" detail the legacy string carried |
| `app/orders/[id]/edit/page.tsx` | 126 (load), 217 (submit) | same pattern                                                | 126 → `body?.message ?? …`; 217 → fields-aware (as new/page)                                                                                                                                                           |
| `app/kds/page.tsx`              | 184, 299                 | `body?.error ?? …`                                          | `body?.message ?? …` (299 keeps its `?? 'Failed to mark done'` fallback)                                                                                                                                               |

No other screen lines change. (The comment at `app/orders/new/page.tsx:114` referencing `lib/orders/validation` is updated to reference `lib/api/orders/schemas.ts` when that file is deleted — comment-only.)

**🗣 In plain English:** Eight small line edits across five screens so error messages keep appearing in plain words. The order form and edit form get a slightly smarter version: when several products are unknown, the user sees each one named instead of one vague sentence.

---

## 6. Implementation steps (TDD, vertical slices — one route at a time, integration suite as the net)

Run protocol per slice: write/adjust the failing test first, implement, `npm test` + `npm run test:integration` green before the next slice. `npm run db:up` once; `npm run db:reset` after step 1.

**🗣 In plain English:** We rebuild one door at a time, always writing the "prove it still answers exactly the same" test before touching the door, so a mistake in door 3 can never hide behind work on door 4.

**Step 0 — Branch + dependency.** Branch `feat/f-08-orders-route-rewrites` off `9753da3`. `npm install zod` (prod dependency). Justification (this line goes in the PR description verbatim): _"zod — declarative inbound request validation at every route boundary, locked by the F-08 spec (ADR-0003: 'inbound zod validation'); replaces the hand-rolled `lib/orders/validation.ts`; confined to `lib/api/**` presentation modules, never imported by domain/ports/services/adapters."_
**🗣 In plain English:** One new library enters the project, with its reason written down as the house rules demand.

**Step 1 — Migration.** Add `supabase/migrations/20260611_001_order_idempotency_keys.sql` (DDL in §5 D1; naming follows the `20260601_001_…` convention). `npm run db:reset`; verify table exists and RLS is enabled (`supabase db diff` clean against the file).
**🗣 In plain English:** Create the fingerprint ledger in the throwaway local database first and prove the recipe is sound.

**Step 2 — Users port (TDD).** Write `lib/ports/__contracts__/UsersRepository.contract.ts` + the two runner tests (red) → implement `lib/domain/User.ts`, `lib/ports/UsersRepository.ts`, fake adapter, Supabase adapter, barrel updates (`lib/domain/index.ts`, `lib/ports/index.ts`, both adapter `index.ts`) → green. JSDoc notes "F-13 absorbs/expands".
**🗣 In plain English:** Build the tiny staff-lookup interface, with the same one-rulebook-two-implementations test pattern every other interface here uses.

**Step 3 — Idempotent create at the port (TDD).** Extend `OrdersRepository.createOrder` signature with optional `idempotencyKey` + JSDoc (claim/replay/race contract from §5 D1). Add contract cases (same key twice → same order id and only one order; different keys → different orders; no key → always new). Implement Fake (a `Map<key, {orderId, createdBy}>`; no TTL modelling). Implement Supabase per the D1 algorithm. Vendor-level tests in `tests/integration/adapters/supabase/OrdersRepository.test.ts`: TTL (insert an expired row directly, then create — new order wins), cross-user replay → `ConflictError`, and the race (`Promise.all` of two identical creates → exactly one surviving order, both calls resolve to the same id).
**🗣 In plain English:** The double-tap protection is built and tortured at the storage layer first — including the deliberate "two requests at the same instant" torture test — before any web endpoint relies on it.

**Step 4 — Service updates (TDD).** In `tests/unit/services/OrdersService.test.ts`: (a) rewrite the two ValidationError-shape tests (lines 155–211) to the F-TD-06 shape `{ "lines.products": ["Unknown product id: <id>", …] }` — one entry per missing id; same for the `editOrder` lineReplacement case; (b) add ARCH-FU-05 `it.each(['warehouse','butcher','driver'])` forbidden-role editOrder tests (placed-state → `ForbiddenError`); (c) add placeOrder idempotency pass-through tests (same key twice via fake → same order). Then: fix `placeOrder`/`editOrder` step-3 to emit per-id entries, and add the optional `idempotencyKey` parameter forwarding to the port. No new imports → pin #28 untouched.
**🗣 In plain English:** Two known test-quality debts get paid: error lists now name each unknown product separately, and we add the missing "prove warehouse/butcher/driver really can't edit orders" checks. The engine also learns to pass the fingerprint through to storage.

**Step 5 — Presentation plumbing (TDD).** `tests/unit/api/` first (schema tests porting every case from `tests/unit/orders/validation.test.ts`, plus DTO tests asserting the exact §5.4 key sets against fixture domain objects) → implement `lib/api/validate.ts`, `lib/api/orders/schemas.ts`, `lib/api/orders/dto.ts`, `lib/api/kds/schemas.ts`, `lib/api/kds/dto.ts`.
**🗣 In plain English:** The rulebooks and phrasebooks are written and word-by-word tested before any door uses them.

**Step 6 — Slice 1: `app/api/orders/route.ts`.** Update `tests/integration/orders-crud.test.ts` (401→403 on lines 53/65; add error-body shape assertions; add inactive-customer → 409 case) and add `tests/integration/orders-idempotency.test.ts` (same key twice → 201/201 same id; no header → distinct orders; concurrent `Promise.all` same key → one order; cross-user same key → 409; >200-char key → 400). Rewrite the route: GET + POST per §5 D4/D6 shapes, `withRequestContext(withErrors(…))`, no try/catch, handler bodies ≤20 lines. Edit `app/orders/page.tsx:120` + `app/orders/new/page.tsx:171`.
**🗣 In plain English:** First door rebuilt: order list + order creation, including the one-tap-one-order guarantee, proven over real HTTP against the local database.

**Step 7 — Slice 2: `app/api/orders/[id]/route.ts`.** Integration additions: completed-order edit → **409** (complete an order via the KDS done flow or direct fixture update, then PUT); GET error-shape assert. Rewrite GET (null → `NotFoundError('Order not found')`) + PUT (returns `{ok:true}`; service result discarded). Edit `app/orders/[id]/page.tsx:85,276` + `edit/page.tsx:126,217`.
**🗣 In plain English:** Second door: viewing and editing one order. The only behaviour shift — editing a finished order is now refused as "this conflicts with the order's state" (409) rather than "you lack permission" (403), which is the honest answer.

**Step 8 — Slice 3: picking-list.** Unit-test + implement `lib/usecases/pickingList.ts` (fakes; butcher of fixture data: order miss → 404, completed print → `ConflictError`). Update `tests/integration/picking-list.test.ts:138` (403 → **409**). Rewrite the route: GET preview + POST print, both ending in `renderPickingListHtml(toPickingListData(assembly))`; the old `fetchOrder`/`toPickingListData` Supabase code in the route is deleted.
**🗣 In plain English:** Third door: the printed A4 picking sheet. Same sheet, same HTML — but the data behind it now flows through the engine and the catalogue/staff interfaces instead of the route quizzing the database itself.

**Step 9 — Slice 4: KDS queue.** Unit-test + implement `lib/usecases/kdsQueue.ts`. Rewrite `app/api/kds/orders/route.ts`: `since = new Date(Date.now() - 90_000)`, use-case, `toKdsQueueResponse`. Integration `tests/integration/kds.test.ts`: add an assertion that a catalogued line carries `product.name` (pins the D3 gap closed). Edit `app/kds/page.tsx:184,299`.
**🗣 In plain English:** Fourth door: the kitchen screen's data feed — still public for the kiosk, still flashing orange on edits, and still showing product names on every line (a detail the new engine alone didn't carry; the coordinator restores it, and a new test pins it forever).

**Step 10 — Slice 5: KDS line-done.** Unit-test + implement `lib/usecases/kdsLineDone.ts` (butcher missing/inactive/wrong-role/happy/auto-complete paths against fakes). Rewrite `app/api/kds/lines/[lineId]/done/route.ts`. `tests/integration/kds.test.ts` statuses are already aligned (400/404/403/409/200 all preserved); add error-shape asserts.
**🗣 In plain English:** Fifth door: the butcher's "Done" tap. Same statuses for every failure case; the one change is buried in disaster handling — if the final "mark whole order complete" write ever fails at the database, the screen now sees an honest 500 instead of a silent "ok, but…" flag nobody was reading.

**Step 11 — Retire the hand-rolled validator.** Delete `lib/orders/validation.ts` + `tests/unit/orders/validation.test.ts` (importers verified: only the two rewritten routes). Update the comment at `app/orders/new/page.tsx:114`. `lib/orders/types.ts` and `lib/orders/pickingList.ts` stay (still imported by screens/renderer).
**🗣 In plain English:** The old hand-written rule-checker is now dead code, so it's removed; its every rule lives on in the step-5 schemas and their ported tests.

**Step 12 — Bookkeeping.** `docs/plans/BACKLOG.md`: mark F-TD-06 and ARCH-FU-05 done (PR ref); add **F-TD-09** "scheduled purge of expired `order_idempotency_keys` rows" (owner: unscheduled, tiny); note under F-13 that `UsersRepository` (this unit) is its absorption seed.
**🗣 In plain English:** The to-do ledger is updated: two items closed, one small new one opened (the fingerprint-table sweeper).

**Step 13 — Full local verification.** `npm test` (unit incl. lint pins) · `npm run test:integration` (target: previous 92 + new, all green) · `npm run test:e2e:api` · `npm run test:e2e:ui` · `npm run lint`. Rip-out spot-check: `grep -rn "supabaseService\|@/lib/supabase" app/api/orders app/api/kds` → must return nothing.
**🗣 In plain English:** Every robot test in the house runs, plus one direct grep proving the five doors no longer mention the database vendor at all.

**Step 14 — PR + Gate 4.** Open the PR normally (Supabase preview branch is created on PR open and runs this PR's migration + `seed.sql` automatically — ADR-0006). Then: `npm run test:e2e:preview -- <preview-url> --unprotected` → **must be 8/8** (the three `@critical` specs; fail-closed). Ship checklist: `npm run db:branches` — no orphaned branches after merge.
**🗣 In plain English:** Before merging, a disposable copy of the database is born with the new fingerprint table already in it, the app is deployed against that copy, and the three end-to-end rehearsals (place an order, print the sheet, work it through the kitchen) must pass 8 of 8 — with zero risk to real data. Since deployment protection is temporarily off, the smoke runs in its documented `--unprotected` mode.

---

## 7. File-by-file change list

**New (17):**
| File | What |
|---|---|
| `supabase/migrations/20260611_001_order_idempotency_keys.sql` | fingerprint table (D1) |
| `lib/domain/User.ts` | `UserSummary` |
| `lib/ports/UsersRepository.ts` | Users port |
| `lib/ports/__contracts__/UsersRepository.contract.ts` | shared contract |
| `lib/adapters/supabase/UsersRepository.ts` | real adapter |
| `lib/adapters/fake/UsersRepository.ts` | fake adapter |
| `lib/usecases/pickingList.ts`, `lib/usecases/kdsQueue.ts`, `lib/usecases/kdsLineDone.ts` | composition (D3) |
| `lib/api/validate.ts`, `lib/api/orders/schemas.ts`, `lib/api/orders/dto.ts`, `lib/api/kds/schemas.ts`, `lib/api/kds/dto.ts` | presentation boundary (D5/D6, §5.4–5.5) |
| `tests/unit/adapters/fake/UsersRepository.test.ts`, `tests/integration/adapters/supabase/UsersRepository.test.ts` | contract runners |
| `tests/integration/orders-idempotency.test.ts` | Idempotency-Key over HTTP |

plus `tests/unit/usecases/` (3 files) and `tests/unit/api/` (schema + DTO tests).

**Modified (18):** the five route files (full rewrites); `lib/ports/OrdersRepository.ts` (createOrder signature + JSDoc); `lib/adapters/supabase/OrdersRepository.ts` + `lib/adapters/fake/OrdersRepository.ts` (idempotent create); `lib/ports/__contracts__/OrdersRepository.contract.ts` (new cases); `lib/services/OrdersService.ts` (placeOrder param + F-TD-06); `lib/domain/index.ts`, `lib/ports/index.ts`, `lib/adapters/supabase/index.ts`, `lib/adapters/fake/index.ts` (barrels); the five screens' error lines (§5.6); `tests/unit/services/OrdersService.test.ts`; `tests/integration/orders-crud.test.ts`, `tests/integration/picking-list.test.ts`, `tests/integration/kds.test.ts`; `tests/integration/adapters/supabase/OrdersRepository.test.ts`; `docs/plans/BACKLOG.md`; `package.json` + lockfile (zod).

**Deleted (2):** `lib/orders/validation.ts`, `tests/unit/orders/validation.test.ts`.

**🗣 In plain English:** Seventeen new files (mostly small interfaces, coordinators, rulebooks and their tests), eighteen touched, two deleted. Nothing outside the Orders/KDS world is touched.

---

## 8. Test plan summary

**🗣 In plain English:** Four layers of safety net, from "does each cog turn" to "does the whole machine work on a deployed copy".

1. **Unit (fakes, no DB):** OrdersService updates (F-TD-06 shapes, ARCH-FU-05 `it.each`, idempotency pass-through); three use-case suites; schema suite (ports every legacy validator case); DTO suite (pins §5.4 key sets — this is the wire-compat tripwire at zero cost).
2. **Contract:** OrdersRepository gains idempotent-create invariants (both adapters); new UsersRepository contract (both adapters).
3. **Integration (HTTP against local stack):** existing 92 stay green except three deliberate status flips — `orders-crud:53,65` 401→403, `picking-list:138` 403→409 — plus additions: inactive-customer 409, completed-edit 409, error-body shapes, KDS line `product.name`, and the new `orders-idempotency.test.ts` (replay, no-header, concurrency race, cross-user 409, oversize key 400).
4. **E2E:** `@critical` 01/02/03 unchanged and must stay green locally (`test:e2e:ui`) and at Gate 4 on the preview deployment (8/8, `--unprotected`).

---

## 9. Migration rollback note

The migration is purely **additive** (one new table; no existing table, column, trigger or policy is touched; no data backfill). Rollback = `DROP TABLE IF EXISTS order_idempotency_keys;` — the only data lost is the dedupe memory, whose worst-case consequence is that a retried request within the window creates a second order, i.e. exactly today's behaviour. Application code degrades gracefully only with the code rolled back too (the adapter queries the table whenever a key is supplied), so the rollback unit is "revert the PR + drop the table"; preview branches make a broken migration unshippable in the first place (fail-closed at Gate 4).

**🗣 In plain English:** Undoing this change is safe and boring: delete one table that only ever held duplicate-protection fingerprints. Nothing about existing orders is altered by the migration, and the rehearsal database catches a bad migration before it could ever reach production.

---

## 10. Visible changes (locked at Gate 1 — listing for sign-off transparency)

**🗣 In plain English — what a user or API caller could actually notice after this ships:**

1. **Wrong-role refusals say 403 instead of 401.** A logged-in driver trying to create an order gets "forbidden" rather than "not authenticated". Screens show their error banner either way.
2. **Error replies are structured.** `{"error":"…"}` becomes `{"code":"…","message":"…","fields":{…}}`. The screens are edited in this same PR to read it; the order form now lists _each_ unknown product separately (F-TD-06).
3. **Inactive customer on create: 400 → 409.** "That customer exists but is switched off" is a conflict, not a malformed request.
4. **Editing a completed order: 403 → 409.** Refused because of the order's state, not the user's permissions.
5. **Printing a completed order: 403 → 409.** Same reasoning.
6. **KDS auto-complete failure is no longer swallowed.** The old reply quietly said `{"ok":true,"completion_failed":true}`; now it is an honest 500 the operator can investigate. (The butcher's tap on the line itself is still recorded first.)
7. **New optional `Idempotency-Key` header on POST /api/orders.** Without it: behaviour identical to today. With it: a repeated identical request returns the original order instead of creating a duplicate; reusing someone else's live key is refused with 409.
8. **Garbage inputs are refused up front with 400** (e.g. an invalid `state` filter, a malformed order id, a malformed date in a query). Legacy behaviour for these was an unhelpful 404/500/empty list. Real screens never send these, so no user-visible flow changes.
9. **Not noticeable but stated:** picking-list HTML, all success-path JSON bodies, the KDS polling shape (including per-line product names, orange flash events and `server_time`), and the kiosk's no-login access model are byte-for-byte / behaviourally unchanged.

---

## 11. Risk Assessment

**Headline:** three risks rated must-fix were identified; **all three are resolved by design inside this plan** (R1 race handling, R2 wire-shape regression tripwires, R3 cross-user key replay). No must-fix risk remains open, so nothing here blocks Gate 2 — but R1 and R2 are the two places an implementer could silently get it wrong, hence the dedicated tests that make each failure loud.

| #   | Category           | Risk                                                                                                                                  | Sev. | Mitigation                                                                                                                                                                                              | Must-fix?                       |
| --- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| R1  | Concurrency / race | Two identical POSTs in the same instant could both create orders (idempotency TOCTOU).                                                | High | D1 design: DB unique PK on `key` is the arbiter; loser deletes its own order and returns the winner's. Pinned by a `Promise.all` adapter test + an HTTP-level integration test.                         | **Yes — resolved in design**    |
| R2  | Business logic     | Any drift in the legacy wire shapes breaks one of the five screens silently (esp. KDS `product` embed, list-vs-detail `printer` key). | High | §5.4 dictionary; DTO unit tests pin exact key sets; 92+ integration tests over real HTTP; Gate-4 preview smoke 8/8 fail-closed.                                                                         | **Yes — resolved by tripwires** |
| R3  | Security           | Idempotency replay across users: a caller replaying another user's key must not receive that user's order data.                       | Med  | `created_by` column + match check; mismatch → 409 with no order details. Integration test included.                                                                                                     | **Yes — resolved in design**    |
| R4  | Security           | KDS endpoints remain cookie-less by locked spec; the mutation's only guard is the butcher-id check.                                   | Med  | Unchanged access model (physical-room control + per-tap Users-port validation, identical rules to today). No regression introduced; broader hardening belongs to F-13.                                  | No                              |
| R5  | Data migration     | Migration fails on the preview branch / drifts from local.                                                                            | Low  | Additive single table; `db:reset` verification in step 1; ADR-0006 branch flow applies migrations from scratch per PR and the smoke fails closed. Rollback note §9.                                     | No                              |
| R6  | Concurrency        | KDS double-tap / simultaneous last-line races.                                                                                        | Low  | Untouched: F-07's documented idempotent-tap + swallowed benign ConflictError semantics are preserved verbatim; existing unit + integration tests still cover them.                                      | No                              |
| R7  | Business logic     | Status-code flips (visible changes 1, 3–6, 8) breaking an unknown consumer.                                                           | Low  | Exhaustive consumer search: only the five screens (branch on `res.ok` only) and the test suites consume these endpoints; tests updated in the same PR.                                                  | No                              |
| R8  | Launch blocker     | `completion_failed` → 500 changes what the KDS screen sees on a rare DB failure.                                                      | Low  | Screen already handles non-ok responses (reverts the tile, shows an error, next poll reconciles) — verified at `app/kds/page.tsx:282-300`. Operator now actually finds out.                             | No                              |
| R9  | Launch blocker     | Hygiene: idempotency rows accumulate forever.                                                                                         | Low  | 24h `expires_at` + opportunistic reclaim now; BACKLOG F-TD-09 sweeper. Table grows by a handful of rows/day at this business's volume.                                                                  | No                              |
| R10 | Launch blocker     | Gate 4 cannot run if the preview-branch/Vercel wiring hiccups.                                                                        | Low  | Fail-closed by ADR-0006 (no fallback to prod, ever); rerun per `docs/runbooks/preview-smoke.md`; `--unprotected` mode is the documented current posture (BACKLOG F-INFRA-04 restores protection later). | No                              |

**🗣 In plain English:** The two genuinely dangerous spots are (1) the split-second double-order race — which the database itself referees, with a torture test to prove it — and (2) accidentally changing one word in the answers the screens depend on — which a word-for-word dictionary plus three layers of robot tests make impossible to miss. A third, sneakier one (someone replaying another person's fingerprint to peek at their order) is closed by recording who owns each fingerprint. Everything else is routine and listed so nothing surprises us at review.

---

## 12. Acceptance criteria

1. All five handlers ≤20 lines each, composed `withRequestContext(withErrors(handler))`, zero try/catch, zero `supabaseService`/vendor imports under `app/api/orders/**` and `app/api/kds/**` (grep clean).
2. Every inbound body/query/param validated by zod before any service call; `zod` imported only under `lib/api/**`.
3. Success-path wire shapes match §5.4 exactly (DTO unit tests + integration suite green).
4. Idempotency: replay returns original order (201, same body); concurrent race yields exactly one order; cross-user replay → 409; no header → today's behaviour bit-for-bit.
5. Users port + both adapters + green shared contract suite; JSDoc carries the F-13 absorption note.
6. F-TD-06 shape shipped (per-id `fields` entries) and ARCH-FU-05 `it.each` tests present; BACKLOG updated; test #28 pin green and unmodified in scope.
7. `lib/orders/validation.ts` deleted with its test; no dangling imports.
8. `npm test`, `npm run test:integration`, `npm run test:e2e:api`, `npm run test:e2e:ui`, `npm run lint` all green locally.
9. Gate 4: `npm run test:e2e:preview -- <preview-url> --unprotected` **8/8** against the PR's preview deployment + Supabase preview branch; no orphaned branches after merge (`npm run db:branches`).

**🗣 In plain English:** The unit is done when the five doors are demonstrably thin, vendor-free and rulebook-guarded; the double-tap protection provably works even under deliberate race conditions; the screens behave exactly as before (plus clearer error messages); every robot test in all four layers is green; and the full dress rehearsal passes 8-for-8 on a deployed preview with its own throwaway database.
