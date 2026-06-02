# Order Pipeline — Phase 2 Backlog

**Captured:** 2026-06-01, post-cutover smoke test of the initial order-pipeline feature.
**Context:** The order pipeline went live on `main` at commit `d69b335`. ANVIL clearance cert at `docs/anvil/2026-05-30-order-pipeline-cert.md`. Optimistic-UI fix for KDS Done-tap shipped at `746a8a5`. This doc captures the next round of work — functional behaviour changes Hakan identified during the live smoke test.

These are NOT bugs. They are deliberate scope adjustments to how the feature behaves, plus one data-layer change. Together they represent a coherent direction: **flatter permissions, KDS as the live order board, meat-only product picker for orders**.

---

## Recommended approach

Bundle items 1, 2, and 4 into one FORGE+ANVIL run (~2-3 hrs). They're all permission / visibility / state-machine changes that touch overlapping code (middleware, RLS policies, route handlers, KDS query). Doing them together means one round of pgTAP + integration + E2E updates, not three.

Item 3 (meat-only catalog) is a separate, parallel piece of work. It's a data-layer change, not a permission change. It can ship in its own PR — depends on the architectural decision called out below.

**Do NOT skip ANVIL on the permission changes.** Bug #3 from the first run (middleware never updated for new routes) is exactly the failure mode these changes risk repeating. Manual smoke testing won't catch it because the dev/admin doing the test has wildcard permissions.

---

## Item 1 — KDS shows orders for today + tomorrow regardless of state

**Current behaviour:** KDS queries `/api/kds/orders`, which filters to `state IN ('printed', 'completed-recently')`. Placed orders are invisible to the kitchen until office prints them.

**Desired behaviour:** KDS shows ALL orders for today + tomorrow regardless of state (placed, printed, completed). Butchers see what's coming as soon as orders are placed.

### Choice confirmed — option C from the conversation

The `placed → printed → completed` state machine stays as-is for **edit-locking purposes** (see item 2 — sales can edit while placed, locked after print). But KDS visibility and actionability decouple from state — KDS sees everything within the date range.

### Implementation surface

- `app/api/kds/orders/route.ts` — drop the `state IN (...)` filter; replace with `delivery_date IN (today, tomorrow)` based on a date filter parameter. Default = `today_tomorrow`.
- `app/api/kds/lines/[lineId]/done/route.ts` — remove the `state = 'placed' → 409` guard. Lines on placed orders can be marked done.
- `app/kds/page.tsx` — add filter buttons in the header dock: **Today** / **Tomorrow** / **All** (default: Today + Tomorrow). State badge stays visible on cards so butchers know which orders are still editable.

### Implications

- Butchers may start cutting before the picking sheet is printed. That's fine — print is now just "generate paper for the warehouse pack-up team", not "release to kitchen".
- An order's `state = 'placed'` doesn't auto-transition to anything when lines start getting marked done. It only goes to `completed` when ALL lines are done (already true).
- The `printed` state still happens on print and still locks edits (see item 2).

### Filter buttons

Three options shown in the header: `Today` (default), `Today + Tomorrow`, `All`. Toggle group, not pills. Selected state persists across polling refreshes.

### Tests to add

- Integration: `GET /api/kds/orders` returns placed orders when `state=placed`
- Integration: `POST /api/kds/lines/[id]/done` succeeds on a placed order's line
- Integration: date filter parameter narrows results to today / tomorrow / today+tomorrow correctly
- pgTAP: butcher RLS on `order_lines.update` allows done flag on placed orders too
- E2E: place an order, see it appear on KDS without printing first; tap Done, line goes green
- E2E: filter button "Tomorrow" hides today's orders, shows tomorrow's only

---

## Item 2 — Everyone can print the picking list

**Current behaviour:** Only office / warehouse / admin can print. Sales / butcher / driver get a 403.

**Desired behaviour:** Any active user can print. Print still triggers the `placed → printed` state transition. State transition still locks edits — sales loses edit rights post-print, only office/admin can amend.

### Implementation surface

- `middleware.ts` — `/api/orders/[id]/picking-list` is in `SHARED_API_PATHS`, so it's already gated only by "any authenticated user". No middleware change.
- `app/api/orders/[id]/picking-list/route.ts` — currently has a role check inside the handler that rejects non-office. Remove that check.
- pgTAP RLS — the `orders_update_printed` policy currently allows `admin, office, warehouse`. Print is an UPDATE on orders (`state` and `printed_at`), so the policy needs widening. Two options:
  - **(a)** Add all roles to `orders_update_printed` USING clause (driver/sales/butcher all included)
  - **(b)** Create a new policy `orders_update_print_only` with USING `state = 'placed'` AND any active user, scoped to only the `state`, `printed_at`, `printed_by` columns
  
  (b) is more precise but Postgres column-level WITH CHECK on RLS is awkward. (a) is simpler and the route handler already validates which columns get updated. Recommend (a).

### Edge case: who is "printed_by"?

The route currently writes `printed_by = req.session.user_id`. Keep this. Now a sales user could be `printed_by`. The picking-list output should reflect that — print sheet says "printed by [name]" not "printed by office".

### Tests to add

- Integration: sales user can `POST /api/orders/[id]/picking-list` and gets 200
- Integration: butcher user can also print
- Integration: print STILL flips state to printed (not just generates a PDF)
- Integration: after print by sales, sales can no longer `PATCH /api/orders/[id]` — gets 403 from the existing edit lock (this is the regression-prevention check)
- pgTAP: `orders_update_printed` policy USING clause now matches any active role

---

## Item 3 — Meat-only product catalog for orders/KDS

**Current behaviour:** `products` table contains the entire MFS supplier catalog — meat, dairy, spices, oils, paper goods, the lot. The order capture screen's product picker queries `products WHERE active = true` and lists everything.

**Desired behaviour:** Orders and KDS only deal with meat products. Non-meat items are bloat in that context.

### Open architectural decision — TWO OPTIONS

#### Option A — Two tables (Hakan's first instinct, raised in conversation)

Create a new `meat_products` table containing only the meat subset. Orders/KDS query `meat_products`. Both tables must stay in sync when the catalog changes.

**Pros:**
- Strong data isolation (orders code physically can't see non-meat products)
- Allows `meat_products` to grow its own columns over time (cut, primal, species, halal cert, etc.) without polluting the main catalog

**Cons:**
- Sync logic is non-trivial. Either:
  - DB triggers on `products` insert/update/delete to mirror rows where `category = 'meat'` (fragile — trigger logic is hard to test)
  - Application-level sync (Edge Function on changes — adds complexity)
  - Manual sync via admin UI (error-prone, easy to drift)
- Two sources of truth = inevitable drift unless sync is bulletproof
- Adding a meat product = two writes; deleting = two deletes; risk of partial failure

#### Option B — One table, flag column

Add `is_meat boolean DEFAULT false` to `products` (or use the existing `category` column if it's structured enough). Orders/KDS query `products WHERE is_meat = true AND active = true`.

**Pros:**
- Single source of truth — no sync logic, no drift risk
- Toggling a product in/out of the meat catalog is a single update
- No migration of existing data needed beyond setting the flag
- All product editing UI continues working unchanged

**Cons:**
- Orders code technically has visibility into non-meat products (mitigated by always filtering)
- If meat products eventually need their own columns (cut, primal, species), those columns sit on `products` even though only meat rows use them. Nullable columns = data smell.

#### Recommendation

**Start with option B if the meat product schema is the same shape as non-meat (just name, code, box_size, category — which is the current shape).** Add the flag, ship the filter, move on.

**Move to option A if/when meat-specific columns become real needs.** At that point the migration is: create `meat_products` with the extra columns, copy meat rows over with a one-time migration, switch the orders/KDS query, drop `is_meat` from `products`.

This is the YAGNI principle — don't build the sync machinery until the schemas actually need to diverge.

**HAKAN'S DECISION NEEDED:** Does meat need different columns than non-meat? If yes → Option A. If "meat is just a filter on the existing data" → Option B.

### Implementation surface (regardless of option)

- Order capture (`app/orders/new/page.tsx`) — product picker query updated to meat-only
- KDS (`/api/kds/orders/route.ts`) — already shows whatever lines exist; no change here unless the embed needs adjusting
- Admin UI — needs a "is meat?" toggle on each product (option B) or a separate "meat catalog" section (option A)
- Reference sync (`/api/reference`) — orders' IndexedDB sync needs to know which products to pull. Could split into two endpoints (`/api/reference/orders` returns meat-only) or just expose the flag and let the client filter

### Tests to add

- Integration: order capture product picker returns only meat products
- Integration: KDS line for a non-meat product (would never happen in practice but defensive) renders gracefully
- pgTAP (option A): meat_products sync trigger fires on products insert/update/delete with category='meat'
- pgTAP (option B): `is_meat` column constraint correct

---

## Item 4 — Anyone can place an order

**Current behaviour:** Sales / office / admin can create. Warehouse / butcher / driver blocked at middleware + RLS.

**Desired behaviour:** All active users can place orders. Use case: driver gets a phone call mid-route and adds the order on the spot; butcher takes a walk-in.

### Implementation surface

- `middleware.ts` — `/orders` is already in role permissions for sales/office/warehouse/admin. Add driver and butcher. (Or move `/orders` to `SHARED_API_PATHS` — but per-role permissions documents intent better.)
- `app/api/orders/route.ts` — currently has a role check inside the POST handler. Remove or relax.
- pgTAP RLS — `orders_insert` policy currently checks `role IN ('admin', 'sales', 'office')`. Widen to include all active roles.
- `order_lines_insert` policy — same widening.
- `created_by` column — already gets `req.session.user_id` regardless of role. No change.

### Edge case: order capture UI

The `/orders/new` page assumes the user has access to the IndexedDB-synced customer and product reference data. Drivers and butchers may not have synced reference data on their devices. Two paths:

- **(a)** Make sure the reference sync happens for all roles on first login. Probably the right thing.
- **(b)** Fall back to an API call when local data is empty (matches what E2E tests do via `_seedLocalDb.ts`).

### Tests to add

- Integration: driver user can `POST /api/orders` and gets 201
- Integration: butcher user can place an order
- Integration: warehouse user can place an order
- pgTAP: `orders_insert` policy USING clause matches all active roles
- E2E: log in as driver, navigate to `/orders/new`, place an order (catches the IndexedDB sync question — if drivers don't sync, the test fails on empty picker)

---

## Cross-cutting work

### Reference sync for non-sales-office roles

Currently the IndexedDB sync of `customers` and `products` is triggered on `/orders/new` page mount via `useReferenceData`. If drivers and butchers can now place orders, they need this data synced too. Verify the sync trigger fires for them.

### Audit log impact

Every change in this phase affects audit-log entries. Worth confirming:
- `created_by` reflects the actual role that created (driver, butcher, etc.)
- `printed_by` likewise (now includes sales)
- The audit log UI (if any) shows role-appropriate filtering

### Regression risk: edit lock

The edit lock policy (`orders_update_placed` for `placed` state, `orders_update_printed` for `printed`) is the existing protection against sales editing a printed order. The widening in item 2 must not break this. Specifically:
- **Allowed:** sales can call print (transition placed→printed)
- **Forbidden:** sales can still NOT edit fields on an order with `state = printed`

Two policies enforce this — `orders_update_placed` and `orders_update_printed`. Print is a state transition, which involves updating `state`. The transition itself happens via `orders_update_placed` (USING `state = 'placed'`). After the row's `state` becomes `'printed'`, subsequent UPDATEs fall under `orders_update_printed` which still excludes sales. So the lock holds. Worth a pgTAP test to lock it down.

---

## Suggested order of execution

1. **Item 4** first — anyone can place. Smallest, cleanest, least risky. One PR.
2. **Item 2** — anyone can print. Slightly bigger because of the edit-lock regression check. One PR.
3. **Item 1** — KDS shows everything + filter buttons. Biggest UI change in this set. One PR.
4. **Item 3** — meat catalog. Architectural decision needed first (option A vs B). Standalone PR.

Each PR gets its own FORGE plan + ANVIL run. Don't compress this into one massive PR — the bugs found last time were largely because too much landed at once and middleware/RLS coverage didn't keep pace.

---

## Related work (NOT in this phase)

The UI overhaul Hakan mentioned (Claude Design + FORGE + ANVIL for the full mfsops.com app) is its own project. Likely depends on these items landing first — the new permissions and visibility rules shape what surfaces the new UI needs to expose.

Other follow-ups from the original ANVIL cert (`docs/anvil/2026-05-30-order-pipeline-cert.md`):
- Add nav links to `/orders` + `/kds` (will be part of the UI overhaul)
- Print a real picking sheet on A4 (Hakan task)
- Visit `/kds` on the production-room screen (Hakan task)
- `UNIQUE` constraint on `users.pin_hash` for kds-eligible roles
- Fix `annualReview.test.ts` date-stale assertions
- Apply heading→URL fix pattern to `route-manager.spec.ts`
- Remove accidentally-committed `scripts/baseline-pre-strip.sql.bak`

---

## Open questions still requiring Hakan's input

| # | Question | Where it blocks |
|---|---|---|
| 3 | Two tables vs one-table-flag for meat catalog | Cannot start item 3 without answer |

The other items are clear enough to start FORGE planning on whenever Hakan greenlights.
