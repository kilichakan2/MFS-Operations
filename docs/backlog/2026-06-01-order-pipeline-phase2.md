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

### Architectural decision — LOCKED: one table with `is_meat` flag

Hakan confirmed 2026-06-01: meat is just a category filter, not a structurally different shape of data. Going with the simpler one-table approach.

**Add `is_meat boolean NOT NULL DEFAULT false` to `products`.** Orders and KDS query `products WHERE is_meat = true AND active = true`. The existing `category` column keeps doing whatever it does (likely finer-grained classification: lamb, beef, offal, etc.) — `is_meat` is purely a binary "is this in the meat catalog" gate, independent of category values.

**Why this over two tables:**

- Single source of truth — no sync logic, no drift risk
- Toggling a product in/out of the meat catalog is one click
- All existing product admin UI continues working unchanged
- If meat needs its own columns later (cut, primal, halal cert), we can split tables then with a clean migration — `is_meat` rows copy to the new table, flag column drops. No bridges burned.

**Migration**:

```sql
ALTER TABLE products ADD COLUMN is_meat boolean NOT NULL DEFAULT false;

-- Seed: mark existing meat products. Likely query is something like:
UPDATE products SET is_meat = true WHERE category IN ('lamb','beef','offal', ...);
-- (final list depends on what category values exist — query the DB first)

CREATE INDEX products_is_meat_active_idx ON products (is_meat, active) WHERE is_meat = true AND active = true;
```

### Implementation surface

- **Migration** (above) — adds column, seeds existing rows, indexes the common query
- **Order capture** (`app/orders/new/page.tsx`) — product picker query updated to filter `is_meat = true`. Likely via the `useProductsWithDetail` hook in `hooks/useReferenceData.ts`.
- **Reference sync** (`/api/reference` endpoint + `lib/localDb.ts` Dexie sync) — when syncing products into IndexedDB, only sync `is_meat = true` products (avoids the kiosk pulling down olive oil and paper goods it'll never use). Alternative: sync everything but filter on the client. Cleaner to filter at the API.
- **KDS API** (`app/api/kds/orders/route.ts`) — already returns line.product names embedded; no change needed since lines reference products by ID. But: if a non-meat product somehow ended up on an order line (shouldn't be possible after this lands, but defensive), the KDS should render gracefully (it does — `line.product?.name ?? '(unknown product)'`).
- **Admin UI** — wherever products are managed (likely an internal admin page), add an `is meat?` toggle on the product form. Existing list / detail / edit UIs stay the same otherwise.

### Tests to add

- pgTAP: `is_meat` column exists with correct default, NOT NULL, index present
- Integration: `/api/reference` returns only `is_meat = true` products
- Integration: order capture's `POST /api/orders` accepts a meat `product_id` (existing test); add a test asserting it would also accept a non-meat one (RLS doesn't block it — the UI just doesn't surface them)
- E2E: order capture product picker shows meat products only, doesn't show non-meat
- E2E: after admin toggles a product to `is_meat = false`, that product no longer appears in the order picker (after next reference sync)

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

## Status

All four items are clear and ready to be picked up. Each gets its own FORGE plan + ANVIL run when work starts. Recommended sequence above (4 → 2 → 1 → 3).
