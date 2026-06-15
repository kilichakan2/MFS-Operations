# F-RLS-04a — Orders-context RLS cutover (expand-contract steps 3–4)

**Date:** 2026-06-15 · **Unit:** F-RLS-04a · **Phase:** FORGE plan (Order)
**Spec locked at:** FORGE Frame/grill 2026-06-15 (do NOT re-litigate scope)
**Depends on:** F-RLS-03 (shipped `e55dcc7`, introduce-only), F-INFRA-05 (shipped `472d3f5`)
**Governing ADRs:** ADR-0004 (posture), ADR-0007 (mechanism), ADR-0002 (hexagonal)

> 🗣 **In plain English:** the Orders front-door API currently reaches the database
> with a master key that ignores all the door locks (RLS). F-RLS-03 already built a
> per-user keycard system and proved it works, but didn't put it on any real door yet.
> This unit puts the keycard on exactly three Orders doors (list orders, one order,
> picking-list) so the locks finally fire for real requests. We keep the master key
> wired up as a one-line parachute, and we leave the kitchen-display (KDS) doors and
> the idempotency-key cupboard on the master key on purpose.

---

## 1. Objective

Flip the three front-door Orders API routes from the **service-role** Supabase client
(bypasses RLS) onto the **per-request authenticated** Supabase client built in F-RLS-03,
so the existing GUC-based RLS policies on `orders` / `order_lines` / `order_audit_log`
are *evaluated* for real user traffic. This is expand-contract **steps 3 (switch reads)
and 4 (switch writes) only**. Steps 5–6 (delete the service-role fallback) are DEFERRED
until KDS is also cut over (`F-RLS-04a-kds`).

> 🗣 **In plain English:** "GUC-based RLS policy" = a door lock that checks a sticky-note
> on the connection saying "the current user is X". F-RLS-03 wired up the machine that
> writes that sticky-note from the keycard. Right now nothing presents a keycard, so the
> note is always blank and the locks just sit there. This unit makes the three Orders
> routes present a real keycard per request.

---

## 2. Scope

### In scope — exactly these three routes (they carry the standard `mfs_session` identity)
- `app/api/orders/route.ts` — `GET` (list), `POST` (create)
- `app/api/orders/[id]/route.ts` — `GET` (read one), `PUT` (edit)
- `app/api/orders/[id]/picking-list/route.ts` — `GET` (preview), `POST` (print)

### Explicitly OUT of scope — keep on service-role, do NOT touch
- **KDS routes** `app/api/kds/orders/route.ts` (public kiosk read) and
  `app/api/kds/lines/[lineId]/done/route.ts` (line-done write). They use a SIDE-DOOR
  identity (public at middleware; `butcher_id` arrives in the request body and is
  validated via the Users port, NOT the `x-mfs-user-*` headers). They STAY service-role
  this unit → follow-up `F-RLS-04a-kds`.
  > 🗣 **In plain English:** the kitchen display is a shared public screen, not a
  > logged-in person — there's no keycard to present, so it keeps the master key for now.
- **`order_idempotency_keys`** stays on the service-role client. It is plumbing, not user
  data; RLS-on-deny-all already shut anon; NO policy is written for it. The createOrder
  flow's idempotency-key reads/inserts/deletes MUST remain service-role even though the
  order/line inserts move to the authenticated client (see §4.3 — split-client createOrder).
  > 🗣 **In plain English:** the idempotency cupboard is internal bookkeeping the user
  > never sees. We deliberately don't give it a lock, so it must keep using the master key.

---

## 3. Domain terms / glossary for this plan

- **service-role client** — Supabase client built with the master server-only service-role key.
  🗣 Master key; ignores every door lock (RLS). Today's `supabaseOrdersRepository` singleton uses it.
- **authenticated client** — `authenticatedClientForCaller({ token })`: anon-key client
  carrying a per-request minted token as `Authorization: Bearer`, runs as Postgres
  `authenticated` role. 🗣 The keycard; the door locks actually check it.
- **minted token** — short-lived HS256 JWT from `dbTokenMinter.mint({ userId })`. 🗣 The
  keycard itself, stamped with who you are and an expiry.
- **GUC** — `app.current_user_id` Postgres session variable the policies read. 🗣 The
  sticky-note on the connection that the `db_pre_request` hook writes from the keycard.
- **per-request factory** — a function in `lib/wiring/orders.ts` that builds a fresh
  Orders service for one caller. 🗣 Instead of one shared toolbox built at boot, we hand
  each request its own toolbox stamped with that caller's identity.

---

## 4. The central design — per-request authenticated Orders composition

### 4.1 The problem
`lib/wiring/orders.ts` today exports **pre-wired singletons** (`ordersService`,
`pickingListUsecase`) built at module load against the **service-role** repository
singleton `supabaseOrdersRepository` (which is `createSupabaseOrdersRepository(supabaseService)`).
The authenticated client is **per-request** — it needs the caller's `userId` (to mint the
token and build the client), which only exists inside a request. So a boot-time singleton
cannot carry per-caller identity. We need a **per-request factory**.

> 🗣 **In plain English:** the current Orders toolbox is built once when the server starts,
> and it holds the master key. A keycard is personal to one request, so you can't bake it
> into a one-time toolbox. We need a "build me a toolbox for *this* caller" function.

### 4.2 Hexagonal placement (ADR-0002 / CLAUDE.md — non-negotiable)
- Services/use-cases (`lib/services/**`, `lib/usecases/**`) keep importing **ports only**;
  they already take their repos via factories (`createOrdersService`, `createPickingListUsecase`).
  **No change to any service/use-case file** is required — they were built factory-first
  for exactly this (`OrdersService.ts` docstring lines 52–63 anticipate F-RLS-03 passing
  adapters built against a per-request client).
- The **only** place allowed to import `lib/adapters/**` is `lib/wiring/**` (ESLint-enforced,
  pinned by `tests/unit/lint/no-adapter-imports.test.ts`). The per-request factory therefore
  lives in `lib/wiring/orders.ts`.
- The Supabase client is a vendor type and **must not** cross the adapter boundary. The
  factory passes the client into `createSupabaseOrdersRepository(client)` *inside wiring*;
  the route never sees a `SupabaseClient`. Vendor row→domain mapping is already inside
  `OrdersRepository.ts` and is reused verbatim.

> 🗣 **In plain English:** the rule is "only the wiring drawer is allowed to touch vendor
> SDKs". So the new per-caller factory goes in that drawer. The route asks the drawer for a
> ready-to-use Orders service and never sees Supabase at all — that keeps the "swap the
> database = change one drawer file" promise intact.

### 4.3 The factory shape (new code in `lib/wiring/orders.ts`)
Add per-request factories. They compose the F-RLS-03 building blocks
(`dbTokenMinter` from `lib/wiring/dbToken.ts`, `authenticatedClientForCaller` from the
Supabase adapter) and the existing service/use-case factories. The existing pre-wired
singletons **stay** (they remain the rollback parachute and are still used by KDS use-cases
and the cron).

Proposed exports (names are binding for the implementer):

```ts
// lib/wiring/orders.ts  (ADDED — per-request authenticated composition, F-RLS-04a)
import { dbTokenMinter } from "@/lib/wiring/dbToken";
import {
  authenticatedClientForCaller,
  createSupabaseOrdersRepository,
  createSupabaseCustomersRepository,
  createSupabaseProductsRepository,
  createSupabaseUsersRepository,
} from "@/lib/adapters/supabase";

/** Build an OrdersService bound to ONE caller, reaching the DB as the
 *  Postgres `authenticated` role so RLS fires. Per-request — never memoize. */
export async function ordersServiceForCaller(
  callerUserId: string,
): Promise<OrdersService> {
  const token = await dbTokenMinter.mint({ userId: callerUserId });
  const client = authenticatedClientForCaller({ token });
  return createOrdersService({
    orders: createSupabaseOrdersRepository(client),
    customers: createSupabaseCustomersRepository(client),
    products: createSupabaseProductsRepository(client),
  });
}

/** Picking-list use-case bound to ONE caller (composes the authed OrdersService). */
export async function pickingListUsecaseForCaller(
  callerUserId: string,
): Promise<PickingListUsecase> {
  const token = await dbTokenMinter.mint({ userId: callerUserId });
  const client = authenticatedClientForCaller({ token });
  const ordersService = createOrdersService({
    orders: createSupabaseOrdersRepository(client),
    customers: createSupabaseCustomersRepository(client),
    products: createSupabaseProductsRepository(client),
  });
  return createPickingListUsecase({
    ordersService,
    products: createSupabaseProductsRepository(client),
    users: createSupabaseUsersRepository(client),
  });
}
```

**Customers/Products/Users repositories also move onto the authenticated client** inside
these factories, because the service composes them and the route's read/write must run
under one identity. Customers and Products have read-all-authenticated GUC policies
(baseline `customers_select` / products policy) that the keycard satisfies; the `users`
read inside the policy subqueries is the caller's own row (`users_select` allows
`id = current_user_id`), so all the EXISTS subqueries resolve. **VERIFY in the read gate
test** that `customers`/`products`/`users` reads succeed through the authenticated client
for an in-role caller (they are exercised by `placeOrder` validation and the picking list).

> 🗣 **In plain English:** when you create an order, the service also checks the customer
> exists and the products are real, and the picking list looks up staff names. Those
> lookups now go through the same keycard, so we must confirm those tables also let the
> keycard read them. They should — their locks already say "any logged-in user can read".

### 4.4 The idempotency split inside createOrder — the one wrinkle
`OrdersRepository.createOrder` does, on ONE injected client:
1. idempotency-key read / delete / insert on `order_idempotency_keys` (OUT of scope — must stay service-role)
2. `orders` insert + `order_lines` insert (IN scope — must move to authenticated client)
3. rollback `orders` DELETE on failure / loser-path (IN scope; **needs a DELETE policy — see §6**)

The repository is constructed with a **single** client. The locked spec requires the
idempotency-key access to stay service-role while the order insert moves to authenticated.
**Two options — the plan adopts Option A:**

- **Option A (ADOPTED) — keep `order_idempotency_keys` reachable under the authenticated
  client by leaving it RLS-deny-all but NOT cutting it over, AND confirming the createOrder
  idempotency access still works.** Concern: with RLS enabled and *no* policy,
  `order_idempotency_keys` denies ALL access to the `authenticated` role (deny-by-default).
  So if the authenticated client runs the idempotency SQL, it gets 0 rows / permission
  denied and idempotency silently breaks. **Therefore the createOrder idempotency-key
  access cannot run on the authenticated client.**

  Resolution: the `POST /api/orders` route, when an `Idempotency-Key` is present, keeps
  using the **service-role** `ordersService` singleton for the *whole* createOrder call
  this unit (idempotency + insert together stay service-role), and only the **non-idempotent**
  createOrder path (no key) moves to the authenticated client — OR (cleaner, ADOPTED below)
  the repository is given a small dependency split. See decision §4.5.

### 4.5 DECISION — minimal, hexagonally-clean idempotency split
Adopt the **route-level identity split that keeps createOrder atomic on one client**, as
follows, to avoid threading two clients into one repository method (which would leak the
service-role concern into the port):

- **`POST /api/orders` stays on the service-role `ordersService` singleton for THIS unit.**
  Rationale: createOrder's order/line inserts and its idempotency-key bookkeeping are one
  atomic dance on one client; splitting them risks an order insert under one identity and a
  rollback DELETE under another. The order-INSERT RLS policy (`orders_insert` admin/sales/office)
  is already enforced at the *route* layer by `requireRole(req, ["admin","sales","office"])`,
  so moving the insert to RLS adds defence-in-depth but is NOT the security-critical surface
  this slice must close first. **`POST /api/orders` create is DEFERRED to a tight follow-up
  (`F-RLS-04a-create`) or folded into steps 5–6**, and called out as such.
  > 🗣 **In plain English:** creating an order is tangled up with the idempotency cupboard,
  > and the cupboard deliberately has no keycard lock. Rather than risk a half-keycard,
  > half-master-key create, we leave *create* on the master key this round and flip the
  > reads + edit + print first. The role check on the route already blocks the wrong people
  > from creating.

  **This is a scope refinement the conductor must confirm at Gate 2** (the locked spec said
  "switch writes" — this defers the *create* write specifically because of the idempotency
  coupling, while still switching the *edit* and *print* writes). If the conductor wants
  create flipped this unit, the idempotency access must itself get a service-role carve-out
  inside the repository, which is a larger change — flag, don't guess.

- **`PUT /api/orders/[id]` (edit) and `POST .../picking-list` (print) MOVE to the
  per-request authenticated client.** Neither touches `order_idempotency_keys`. Edit does
  an `order_lines` DELETE (line replacement) → needs the DELETE policy (§6).

> 🗣 **In plain English:** we flip the three *reads* and the two *writes that don't touch
> the idempotency cupboard* (editing an order, printing a picking list). Creating an order
> waits one more step because of the cupboard tangle. I'm flagging this for your sign-off
> because it narrows "switch writes" slightly.

---

## 5. Step-by-step ordered build

> Test-first throughout (TDD). Each gate test is written and seen to FAIL (or to pass
> against service-role and then be re-pointed at the authenticated client) before the
> corresponding cutover line lands.

### Step 0 — Clock-skew fix (MUST land first; no route flipped yet)
**File:** `lib/adapters/web-crypto/DbTokenMinter.ts`
- Change the claim window: `iat = now − 30`, `exp = now + 120`. Replace the single
  `TOKEN_TTL_SECONDS = 60` with explicit bounds, e.g.
  `const TOKEN_SKEW_SECONDS = 30; const TOKEN_TTL_SECONDS = 120;` and set
  `iat: now - TOKEN_SKEW_SECONDS, exp: now + TOKEN_TTL_SECONDS`.
- **File:** `tests/unit/adapters/web-crypto/DbTokenMinter.test.ts` — update the existing
  assertion (currently `exp - iat === 60`) to assert `iat === now - 30` and `exp === now + 120`
  (mock/freeze `Date.now()` or assert the 150s span and that `iat < now`). Add a test that
  `iat` is in the past (skew tolerance) and `exp - iat === 150`.
> 🗣 **In plain English:** server clocks drift by a few seconds. The keycard currently says
> "valid from exactly now", so a database whose clock is 2s behind rejects a brand-new
> keycard as "not yet valid". We backdate the keycard 30s and extend it to 2 minutes so
> small clock differences never reject a legitimate request. It's server-only, so the
> longer window is safe.

### Step 1 — Migration: add the missing DELETE policies (REQUIRED — see §6 for why)
**File (new):** `supabase/migrations/<14-digit>_orders_authenticated_delete_policies.sql`
(timestamp generated at implement time, e.g. `20260616HHMMSS_...`). Applied via Supabase
MCP `apply_migration` ONLY (never `db push`). Includes a `-- ROLLBACK` block.
- Add `order_lines_delete` (FOR DELETE) keyed to the same role set as `order_lines_update_full`
  (admin/sales/office), so line-replacement DELETE on edit succeeds in-role and is denied out-of-role.
- Add `orders_delete` (FOR DELETE) keyed to admin/sales/office (needed for the createOrder
  rollback/loser-path DELETE — only relevant once create is flipped; add it now so the
  policy surface is complete and the follow-up needs no migration).
- PITR consideration: this is **additive** (CREATE POLICY only; no DROP/TRUNCATE/ALTER TYPE),
  so no PITR gate is triggered by the migration itself. (PITR is still confirmed at Lock as a
  live-Orders safety net — §9.)

### Step 2 — Read gate test (before flipping any read)
**File (new):** `tests/integration/adapters/supabase/orders-rls.test.ts` (skipIf no JWT/anon
key, same pattern as `rls-bridge.test.ts`). Prove, talking straight to PostgREST via the
authenticated client (NOT through routes):
- in-role user (admin/sales/office/warehouse/butcher) → `orders` / `order_lines` SELECT returns rows;
- a `current_user_id` that maps to NO `users` row → 0 rows (deny);
- the embedded `customers` / `creator` / `printer` joins still resolve (the `ORDER_SELECT`
  embeds), and `customers` / `products` / `users` reads used by the service succeed.
- **Negative T2 test:** raw anon PostgREST request (no token) to `orders` / `order_lines`
  returns 0 rows / permission denied.

### Step 3 — Switch READS (the three GETs)
- `app/api/orders/route.ts` `GET`: replace `import { ordersService }` usage with
  `const ordersService = await ordersServiceForCaller(caller.userId!)`. `requireRole`
  already returns the caller; capture it (currently the GET discards the return — change
  `requireRole(...)` to `const caller = requireRole(...)`).
- `app/api/orders/[id]/route.ts` `GET`: same — build `ordersServiceForCaller(caller.userId!)`.
- `app/api/orders/[id]/picking-list/route.ts` `GET`: build
  `pickingListUsecaseForCaller(caller.userId!)` and call `.previewPickingList(...)`.
- Run the Step-2 read gate green against local Supabase, then run the integration suite.

### Step 4 — Write gate test (before flipping writes)
Extend `orders-rls.test.ts`: prove, through the authenticated client at the DB layer:
- `orders` UPDATE succeeds in-role (admin/office for printed; admin/sales/office for placed),
  denied out-of-role;
- `order_lines` INSERT + DELETE (line replacement) succeed in-role, denied out-of-role;
- the `order_audit_log` row written by the trigger now carries the REAL `user_id` (not NULL)
  — read it back as service-role and assert `user_id = caller`. (Decision #4 proof.)

### Step 5 — Switch WRITES (edit + print only; create deferred per §4.5)
- `app/api/orders/[id]/route.ts` `PUT`: `const ordersService = await ordersServiceForCaller(caller.userId!)`.
- `app/api/orders/[id]/picking-list/route.ts` `POST`: `await pickingListUsecaseForCaller(caller.userId!)`.
- `app/api/orders/route.ts` `POST` (create): **unchanged** — stays on the service-role
  singleton this unit (§4.5). Add a `// reason:` comment noting the idempotency carve-out
  and the `F-RLS-04a-create` follow-up.
- Re-run write gate + full integration suite.

### Step 6 — Verify rollback is one line (§8) and run the full ANVIL ladder (§7).

---

## 6. Migration decision — IS a migration needed? YES (one additive migration)

**Default expectation was zero DDL. Investigation found a genuine gap → ONE additive migration.**

The existing Orders policies (in `20260530000000_...` superseded by `20260601000000_...`)
provide SELECT / INSERT / UPDATE policies for `orders` and `order_lines`, plus the
`order_audit_log` insert (`WITH CHECK(false)`, trigger-only) and read. **They provide NO
`FOR DELETE` policy on `orders` or `order_lines`.** Confirmed by grep across all migrations:
the only DELETE policies in the schema are `customers_delete` and `visits_delete`.

With RLS enabled and **no FORCE** (service-role still bypasses), DELETE under the
`authenticated` role is **denied by default**. Two in-scope write paths issue DELETEs:
- `updateOrder` line-replacement: `client.from("order_lines").delete().eq("order_id", id)`
  — **this is on the edit path being flipped in Step 5 → would break in-role edits that
  replace lines.** MUST be fixed before Step 5.
- `createOrder` rollback / idempotency loser-path: `client.from("orders").delete()` — only
  relevant once create is flipped (deferred), but added now to complete the policy surface.

> 🗣 **In plain English:** editing an order that changes its line items deletes the old lines
> and re-inserts them. The door locks were written with no "delete" rule, so under the keycard
> a delete is refused — which would break every edit that touches line items. We add the two
> missing delete rules (matching the same who-can-edit roles) in one small, additive migration.

This is the **one must-fix finding** that the locked spec's "no migration expected" did not
anticipate. It is additive (CREATE POLICY only) and reversible (DROP POLICY in the rollback
block), so it carries no PITR gate of its own.

### Policy-coverage cross-check (service gating vs RLS policy — must be a SUPERSET)
RLS must never be MORE restrictive than the service's own gating, or valid writes break:
- **Edit placed:** service allows admin/sales/office; `orders_update_placed` USING
  `state='placed' AND role IN (admin,sales,office)` ✓ match.
- **Edit printed:** service allows admin/office; `orders_update_printed` USING
  `state IN ('printed','completed') AND role IN (admin,office,warehouse)` — policy is a
  **superset** (also allows warehouse), so every service-permitted edit passes. ✓ safe.
- **`order_lines` UPDATE (edit):** `order_lines_update_full` role IN (admin,sales,office) ✓.
- **`order_lines` UPDATE done (KDS):** `order_lines_update_done` role=butcher — KDS is OUT
  of scope (service-role), not exercised here. ✓ untouched.
- **Print transition:** UPDATE orders placed→printed via `orders_update_placed`;
  reprint printed→printed and completed-guard via `orders_update_printed` (allows
  admin/office/warehouse). Print route role gate is admin/office/warehouse ✓ match.
- **DELETE order_lines (edit line replacement):** NO policy today → **ADD** `order_lines_delete`
  role IN (admin,sales,office). ✓ after migration.
- **DELETE orders (create rollback):** NO policy today → **ADD** `orders_delete`
  role IN (admin,sales,office) (only needed once create is flipped). ✓ after migration.

---

## 7. Test matrix per ANVIL layer

| Layer | What it proves | Notes |
| --- | --- | --- |
| **Unit (Vitest)** | Clock-skew bounds (`iat = now−30`, `exp = now+120`, span 150s); fail-closed when secret missing (existing). Lint pins still green. | `DbTokenMinter.test.ts`. |
| **Integration (local Supabase)** | Read gate (Step 2) + write gate (Step 4) through the authenticated client at the DB layer; audit `user_id` now real; T2 negative (anon → 0 rows). Existing rls-bridge 4/4 still green. | New `orders-rls.test.ts`, skipIf no JWT/anon key (runs on preview + local with secret). Also exercise the route handlers via the app server where the existing Orders integration tests live. |
| **DB / RLS (migration apply)** | `db:reset` applies the new DELETE-policies migration cleanly; policies present; `get_advisors(security)` shows no new ERROR lints. | Migration via `apply_migration` at ship; locally via `db:reset`. |
| **E2E preview smoke (@critical)** | The three @critical specs (order place, picking-list print, KDS butcher flow) pass against the PR's Vercel preview wired to its Supabase preview branch. **This is where the `SUPABASE_JWT_SECRET`-on-preview assumption is proven LIVE** — if the secret is wrong/absent, the authenticated client fails CLOSED (deny) and the smoke goes red = safe. | F-INFRA-05 cred-sync provides the branch DB creds; the JWT secret is the statically-set parent secret (Decision #2). |
| **Typecheck / Lint** | `tsc --noEmit` 0, `next lint` 0 (main baseline; STRICT since F-TD-01). | |

> 🗣 **In plain English:** we test the locks directly against a real local database (does the
> keycard open the right doors and refuse the wrong ones), test the keycard's expiry math,
> then run the full app against a throwaway cloud database to prove it survives a real deploy
> — which is also the moment we find out for sure the cloud has the right signing secret. If
> it doesn't, requests are refused rather than wrongly allowed, so a wrong guess fails safe.

---

## 8. The cutover line(s) + the one-line rollback

**Cutover (per route, Steps 3 & 5):** each in-scope handler changes from
`ordersService.<method>(...)` (the service-role singleton) to
`(await ordersServiceForCaller(caller.userId!)).<method>(...)` (or the picking-list factory).
Functionally each route gains: capture the caller, build the per-caller service, call it.

**Rollback = revert the wiring usage back to the singleton.** Because the pre-wired
service-role singletons (`ordersService`, `pickingListUsecase`) are LEFT in place, rolling
back any single route is changing that route's one line back from
`ordersServiceForCaller(caller.userId!)` to the imported `ordersService`. RLS stays ON; the
app returns to the service-role (bypass) path = safe resting state (matches expand-contract
§5 "revert the single wiring line"). `git revert` of the PR restores all routes at once.

> 🗣 **In plain English:** the master-key toolbox is still on the shelf. To undo, each route
> just goes back to grabbing the shelf toolbox instead of building a keycard one — one line per
> route, and a whole-PR revert is one command. The locks stay on; the app just goes back to
> the master key, which is exactly the safe state we started from.

**One-line check:** confirm the singletons remain exported and unused-by-lint-suppression is
not needed (they're still used by the KDS use-cases and cron, so they stay live imports).

---

## 9. PITR

No destructive DDL (the migration is CREATE POLICY only). The migration itself triggers no
PITR gate. **However**, because this unit flips LIVE Orders reads/writes onto a new
enforcement path, **confirm PITR is enabled at ANVIL Lock (`/pitr-confirmed`)** as a safety
net before the prod cutover. Rollback remains the one-line wiring revert, not a data restore.

> 🗣 **In plain English:** PITR = a database time-machine you can rewind to. We're not deleting
> or reshaping any data, so we don't strictly need it for the migration — but since we're
> changing how live orders are read and written, we double-check the time-machine is on before
> shipping, just in case.

---

## 10. Hexagonal check (Gate 2 verdict inputs)

- **Port used:** existing `OrdersRepository`, `CustomersRepository`, `ProductsRepository`,
  `UsersRepository`, `DbTokenMinter` ports — **no new port**.
- **Adapter:** existing `lib/adapters/supabase/*Repository.ts` (reused via their existing
  factories) + `authenticatedClientForCaller` + `requireServiceRole` (existing). The new code
  is **wiring only** (`lib/wiring/orders.ts` per-request factories) + a DB migration.
- **New dependencies:** **NONE.** No `package.json` entry added.
- **Rip-out test:** swap the DB vendor for Orders = one new adapter folder + edits to
  `lib/wiring/orders.ts`. The per-request factories live in `lib/wiring/orders.ts`; routes
  call wiring exports, never adapters; vendor `SupabaseClient` stays inside wiring/adapter.
  **PASS.**
- **Layering:** `app/**` imports only `lib/wiring/orders.ts` exports (services/use-cases),
  never `lib/adapters/**`. ✓. Services/use-cases unchanged (ports only). ✓.

---

## 11. Risk Assessment (mandatory)

| # | Category | Risk | Severity | Must-fix? | Mitigation |
| --- | --- | --- | --- | --- | --- |
| R1 | **Business-logic / launch blocker** | **Missing `FOR DELETE` policy on `order_lines` (and `orders`)** → in-role order EDITS that replace line items fail at the DB under the authenticated client. | **High** | **YES** | Additive migration §6 adding `order_lines_delete` + `orders_delete` (role-matched). Write gate (Step 4) proves DELETE succeeds in-role / denied out-of-role BEFORE Step 5 flips edit. |
| R2 | **Security / launch blocker** | `SUPABASE_JWT_SECRET` on preview/prod is wrong or absent → minted token unverifiable → authenticated client denied. | Med | No (fails safe) | Fails CLOSED (deny, not allow). Proven live in preview smoke (Decision #2). If smoke red → halt at Gate 4, do not ship. Note the F-INFRA-05 residual (Mgmt API withholds the JWT secret) was sidestepped by setting the parent secret statically — **ANVIL must confirm the preview smoke actually exercises an authenticated-client route, not just service-role routes.** |
| R3 | **Business-logic** | Idempotency-key access denied if createOrder runs on the authenticated client (`order_idempotency_keys` is RLS-deny-all, no policy). | High | YES (avoided) | Create is NOT flipped this unit (§4.5); idempotency stays service-role. Conductor must confirm this scope refinement at Gate 2. |
| R4 | **Concurrency / race** | Per-request client built fresh per call (no memoization) — correct. A memoized client would leak one caller's token to another. | Med | YES (designed out) | Factory mints + builds per call; the `db_pre_request` hook uses `is_local := true` (transaction-scoped GUC, no cross-connection bleed — proven by rls-bridge 4.3b). Add an explicit "do NOT memoize" comment on the factory. |
| R5 | **Data migration** | New migration mis-applied / drift. | Low | No | Additive CREATE POLICY only; `apply_migration` (not `db push`); rollback block (DROP POLICY); `db:reset` proves clean local apply; advisors re-run at slice exit. |
| R6 | **Performance** | Per-request token mint (HMAC) + new client per request adds latency vs the shared singleton. | Low | No | HMAC sign is sub-millisecond (same primitive as `mfs_session`, minted on every request already in spirit). `createClient` is cheap (no network at construction). Acceptable for the Orders front-door volume. |
| R7 | **Business-logic** | Policy is MORE restrictive than service gating → valid write rejected. | Low | No | Cross-checked in §6: every service-permitted write maps to a policy that is an equal-or-superset role set. Write gate confirms in-role success. |
| R8 | **Launch blocker** | Customers/Products/Users reads (used by service/usecase) denied under the authenticated client. | Med | No | Their GUC policies are read-all-authenticated / own-row; the keycard satisfies them. Read gate (Step 2) explicitly exercises these. If a gap is found, it converts to a must-fix and loops back to Order. |

**Must-fix risks (Gate 2 blockers until resolved in the plan):** R1 (DELETE-policy migration —
**resolved in this plan via §6 + Step 1**), R3 (idempotency — **resolved by deferring create,
§4.5, pending conductor confirmation**), R4 (no-memoize — **designed out**). R1 is the headline:
the locked spec's "no migration expected" is **incorrect** — one additive migration IS required.

---

## 12. ADR conflicts / open questions

- **No ADR conflict.** The plan is faithful to ADR-0004 (posture), ADR-0007 (mechanism —
  GUC bridge, app-minted token, fail-closed), and ADR-0002 (per-request factory in wiring,
  no vendor leak, no new dep, rip-out PASS).
- **Open question 1 (scope refinement — NEEDS conductor confirmation):** the locked spec
  says "switch writes". This plan switches the **edit** and **print** writes but DEFERS the
  **create** write because createOrder is atomically coupled to the RLS-deny-all
  `order_idempotency_keys` table (§4.5). Confirm this narrowing, or accept a larger change
  (a service-role carve-out inside the repository for idempotency-key access only).
- **Open question 2 (must verify, not block):** Decision #2 states `SUPABASE_JWT_SECRET`
  is set statically on Preview+Prod = parent secret, sidestepping the F-INFRA-05 residual
  (roadmap line 113: "Mgmt API withholds `SUPABASE_JWT_SECRET` (asymmetric-key migration) →
  preview JWT must be sourced another way"). The plan TRUSTS this per the locked spec and
  proves it fail-closed in the preview smoke — but ANVIL must ensure the preview smoke
  actually exercises an **authenticated-client** Orders route (e.g. an edit or a read that
  now runs under RLS), not only the service-role `/api/auth/team` probe, or the secret
  assumption goes unproven.
- **Confirmed untouched:** KDS routes (`/api/kds/orders`, `/api/kds/lines/[lineId]/done`)
  stay service-role; `order_idempotency_keys` stays service-role (no policy). Both verified
  in this plan and re-asserted in the cert at Ship.

---

## Guard loop-back fix (2026-06-15) — warehouse first-print

**Guard (code-critic, PR #42) found a 🔴 correctness blocker, proven via psql:** a warehouse
user printing a *placed* (brand-new) order is denied by RLS → `recordPrint` sees `UPDATE 0`
→ throws a spurious `ConflictError`. Root cause: `orders_update_placed` (the policy governing
a pre-update `state='placed'` row) lists admin/sales/office — **not warehouse**; the only
warehouse-inclusive policy (`orders_update_printed`) doesn't apply to a placed row. The
picking-list POST route *does* authorize warehouse, so the DB policy was simply too narrow.

**Decision (Hakan, 2026-06-15): warehouse CAN print — approved. Fix = Option A (narrow policy widen).**

Add a dedicated, **narrowly-scoped** additive policy so warehouse can perform ONLY the
print transition (placed → printed), not gain full edit rights on placed orders:

```sql
CREATE POLICY orders_print_placed ON orders FOR UPDATE
  USING ( state = 'placed' AND EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = nullif(current_setting('app.current_user_id', true), '')::uuid
      AND u.role = ANY (ARRAY['admin','office','warehouse']) ) )
  WITH CHECK ( state = 'printed' AND EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = nullif(current_setting('app.current_user_id', true), '')::uuid
      AND u.role = ANY (ARRAY['admin','office','warehouse']) ) );
```

- Permissive policies are OR'd, so this only **adds** the warehouse print path; nothing is
  removed. `WITH CHECK (state='printed')` constrains warehouse to the print transition only.
- Implementer's choice: fold into the existing (prod-unapplied) migration
  `20260615173901_orders_authenticated_delete_policies.sql` with an accurate name, OR add a
  new 14-digit migration. Include a `-- ROLLBACK` (`DROP POLICY orders_print_placed`).
- **Test (required):** add a warehouse-first-print case to
  `tests/integration/adapters/supabase/orders-rls.test.ts` — warehouse keycard, placed order,
  attempt placed→printed: denied BEFORE the new policy, succeeds AFTER. This closes the blind
  spot (every existing print test used admin/office, both already in-policy).
