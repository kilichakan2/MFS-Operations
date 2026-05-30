# Order Pipeline + KDS — Implementation Plan

**Status:** FORGE Phase 2 (Planner) — awaiting Hakan sign-off before any code
**Frame spec:** [`docs/plans/2026-05-30-order-pipeline-kds-frame.md`](2026-05-30-order-pipeline-kds-frame.md) (signed off 2026-05-30)
**Plan size:** XL — 6 sub-branches, ~3–5 weeks of focused work
**Integration branch:** `feat/order-pipeline` (long-lived, off `main`)

---

## Pre-planning findings (empirical verification, done 2026-05-30)

Before writing this plan I checked the Supabase database against assumptions in the Frame spec. All findings positive:

| Check | Result | Impact on plan |
|---|---|---|
| `products` table exists and populated? | ✅ 285 active products, schema matches need (`id`, `code`, `name`, `category`, `box_size`, `active`, sync hooks via `external_system_*`) | No bulk import needed. Catalogue is the SoT as Hakan said. |
| Codes from picking-list photo present? | ✅ 6/6 verified: ACH15, 4010, 4024, 10656, 11182, 11698 all in table with matching names | Confirms catalogue is current as of 27 May 2026. |
| `customers` table ready? | ✅ 107 active customers, with postcode + geocoded lat/lng | Customer picker works out of the box. |
| Roles for visibility model? | ✅ `users.role` already has admin / sales / office / warehouse / butcher / driver | Frame spec's role-based visibility model maps 1:1 onto existing roles. No new roles needed. |
| Label print API? | ✅ `app/api/labels/route.ts` exists, takes `type` param, generates HTML for AirPrint or ZPL for Sunmi | Picking list is a new `type=picking-list` template plugged into existing route. No new API or infrastructure. |
| Realtime infrastructure? | ✅ Supabase project (`uqgecljspgtevoylwkep`) supports Postgres realtime | KDS live updates use Supabase realtime channels — already in the toolkit. |
| Schema gap to flag | ⚠ `products.box_size` is free text ("Kg", "Each (15kg)") not a structured UOM | Schema sub-branch should add a structured `uom` enum to products (or to order lines, to leave products unchanged). Decision in sub-branch 1. |

**Net result:** Plan is smaller than the Frame spec implied. No catalogue import, no role-system rework, no print-API rebuild. The work is genuinely: new tables for orders, new pages for capture / dashboard / KDS, picking-list template, cutover docs.

---

## Sub-branch plan — 6 sub-branches into `feat/order-pipeline`

Each sub-branch is a self-contained PR into the long-lived integration branch. Each ends with green tests, clean tsc, code-critic pass. ANVIL runs once before the integration branch merges to `main` (not per sub-branch — that would be overkill for vertical slices).

### SB1 — Schema (`feat/order-pipeline-schema`)

**Goal:** Land the database structure. No UI. Migrations + types only.

**Tables to create:**
- `orders` — id, reference (`MFS-YYYY-NNNN`), customer_id, delivery_date, delivery_notes, order_notes, created_by, created_at, state (enum: `placed` / `printed` / `completed`), printed_at, printed_by, completed_at
- `order_lines` — id, order_id, line_number, product_id (nullable for ad-hoc), ad_hoc_description (nullable), quantity (numeric), uom (enum: `kg` / `unit`), notes, done_at (nullable), done_by (nullable)
- `order_audit_log` — id, order_id, user_id, action (enum: `created` / `edited` / `printed` / `line_added` / `line_edited` / `line_done` / `completed` / `reprinted`), payload (jsonb), created_at

**Migrations as numbered files** in `supabase/migrations/`. Following existing convention (check repo).

**Tests:** unit tests in `tests/unit/schema.test.ts` covering: order reference generator (`MFS-YYYY-NNNN` format, sequential, year-rollover), state transitions (placed → printed → completed is allowed, reverse isn't), constraints (can't have a line with both product_id and ad_hoc_description).

**RLS policies:**
- All roles can read orders (visibility per Frame spec — all see all)
- Only `sales` / `office` / `admin` can insert orders
- Only `office` / `admin` can edit a `printed` order
- Only `office` / `admin` / `warehouse` can trigger the print state transition
- `butcher` can update `order_lines.done_at`, nothing else
- All writes append to `order_audit_log` via triggers

**Sub-branch acceptance:**
- Migrations apply cleanly to dev branch
- 989 baseline tests pass + new schema tests pass
- Tsc clean
- Eslint clean

**Estimate:** 1 session.

---

### SB2 — Order capture (`feat/order-pipeline-capture`)

**Goal:** Sales-rep order entry on mfsops.com — phone or laptop.

**Routes:**
- `/orders/new` — order capture page
- `/orders/[id]/edit` — edit an existing `placed` order
- `/orders/[id]` — read-only view (used after print)

**UI components (likely new):**
- `<CustomerPicker>` — searchable dropdown from `customers` table
- `<LineItemRow>` — product picker (from `products`), quantity input, UOM switcher (kg/unit), per-line notes field
- `<AdHocLineRow>` — free-text description + qty + UOM switcher + per-line notes
- `<OrderForm>` — composes the above + delivery date + order-level notes + confirm button
- `<EditLockBanner>` — yellow strip shown on edit page if order is in `printed` state, "This order is locked — only office can edit"

**API endpoints:**
- `POST /api/orders` — create new
- `PUT /api/orders/[id]` — edit (RLS handles who can; API just validates state)
- `GET /api/orders/[id]` — read
- `GET /api/customers?search=X` — used by customer picker
- `GET /api/products?search=X` — used by product picker

**Tests:** unit tests for the form's state shape, validation rules (delivery date required, at least 1 line, quantities > 0). Integration test for `POST /api/orders`.

**Sub-branch acceptance:**
- Sales rep can create an order via the form, see it in the database with correct reference
- After print (manually toggled in DB for now since SB4 doesn't exist), edit form shows the EditLockBanner and disables fields
- Tsc / eslint clean, tests green

**Estimate:** 1–2 sessions.

---

### SB3 — Dashboard (`feat/order-pipeline-dashboard`)

**Goal:** Office, warehouse, sales reps, Hakan/Ege all see the order queue. Different filters but same page.

**Route:** `/orders` — list view

**Filters:**
- Date range (default: today + tomorrow)
- State (default: not completed)
- Customer (free search)
- Sales rep (when applicable)

**UI:**
- Table or card grid (mobile-responsive — same code path renders on phone differently from laptop)
- Click a row → opens order detail
- On order detail: **Print picking list** button with inline warning per Frame spec
- After print: edit access changes per role (office can still edit, sales locked out)

**Realtime:** dashboard auto-refreshes when an order changes state (Supabase realtime subscription on `orders` table). Same plumbing reused in SB5 (KDS).

**Tests:** integration test for the role-filter logic (sales sees all, butcher would see nothing — RLS confirms).

**Sub-branch acceptance:**
- Office user can view dashboard, click into an order, see the data they need
- Realtime: change a state in one tab, see another tab refresh
- Tsc / eslint / tests clean

**Estimate:** 1 session.

---

### SB4 — Picking-list print (`feat/order-pipeline-picking-print`)

**Goal:** A4 picking sheet that the office prints. Matches the BarcodeX layout from the photo Hakan sent on 30 May 2026.

**Changes:**
- New `type=picking-list` in `app/api/labels/route.ts`
- New `pickingListHtml()` function in `lib/printing/html.ts` (or new `lib/printing/picking-list.ts` if it grows)
- New `PickingListData` type in `lib/printing/types.ts`
- Print API also performs the state transition `placed → printed` and writes to `order_audit_log` — atomic in a transaction

**Picking sheet layout (per Frame spec):**

Header block (top of page):
```
[Customer Name large]                              PICKING FORM

[Address line 1]                       Order No: MFS-2026-0001
[Address line 2]                       Date:     30/05/2026
[Postcode]                             Account Code: 10332
                                       Sales Rep:    OFK
                                       Delivery:     31/05/2026
```

Table body — columns:
```
Code | UOM | Qty | Description | Per-line notes | Pack |
```

Per-line notes printed below the line in italics if present.

Order-level notes printed at the foot of the table.

Footer:
```
Printed: 30/05/2026 09:14 by Yusuf
No. of pallets: ______
[BARCODE encoding MFS-2026-0001]
```

The barcode is the "future-you will thank me" feature flagged at Gate 1 — Hakan approved it implicitly by saying "looks good".

**Tests:** unit test for `pickingListHtml()` output (snapshot test on a known order). Test that calling `POST /api/labels?type=picking-list&id=X` transitions the order state and creates an audit log entry.

**Sub-branch acceptance:**
- Office user clicks Print → sheet renders correctly with all fields
- Order state goes from `placed` to `printed` atomically
- Audit log row appears
- Reprint works (state stays `printed`, but a new audit entry with action=`reprinted` is added)

**Estimate:** 1 session.

---

### SB5 — KDS production-room display (`feat/order-pipeline-kds`)

**Goal:** The touchscreen in the process room. Live order queue, line-level Done taps, orange flash on amendment.

**Route:** `/kds` — full-screen kiosk mode

**Auth:** No login required to view. The device is in a physical-access-controlled room. Browser pointed at `https://mfsops.com/kds`. RLS on the read side is wide-open via a public anon read policy on `orders` and `order_lines`. Writes (the Done taps) authenticate via a short-lived JWT issued at kiosk setup or pre-shared device token — to detail in this sub-branch.

**UI:**
- Grid of cards, ordered by `delivery_date` then by `printed_at`
- Each card shows: customer name (large), order ref, delivery date, order-level notes, list of line items
- Each line item is its own row with a tappable area; tap → `order_lines.done_at = now()` via API call
- When all lines done → card animates to "completed" state, fades out after 30s (auto-archive — Frame spec O5)
- If an order is edited after print, the card flashes orange for 30s — implemented via realtime subscription to the `order_audit_log` table

**Tests:** integration test for the realtime flash (insert an audit log row, assert the KDS state machine flips to "flashing"). Unit test for the line-Done state transitions.

**Sub-branch acceptance:**
- KDS renders with cards in correct order
- Tap a line → it visually marks done, persists in DB, all other tabs / KDS instances reflect within 2s
- Office amends an order in another tab → card flashes orange in KDS
- Tsc / eslint / tests clean

**Estimate:** 1–2 sessions. Biggest UX work, mostly straightforward.

---

### SB6 — Cutover (`feat/order-pipeline-cutover`)

**Goal:** Documentation + safety. Not code-heavy.

**Deliverables:**
- `docs/runbooks/order-pipeline-cutover.md` — week-by-week instructions for staff during the 4-week parallel-running period
- A feature flag `ORDER_PIPELINE_ENABLED` in env so it can be turned off if something goes wrong on day one
- A read-only "WhatsApp fallback" notice that appears on the dashboard during weeks 3–4
- Training screen recordings (Hakan or office to record after build is done)
- A monitoring dashboard in Supabase: "orders created today via mfsops vs WhatsApp count entered manually" — sales team self-reports the WhatsApp count daily

**Sub-branch acceptance:**
- Cutover runbook reviewed and signed off by Hakan
- Feature flag tested in production (toggle on/off, verify behaviour)

**Estimate:** Half a session.

---

## Integration → ANVIL → merge to main

**Once all 6 sub-branches are merged into `feat/order-pipeline`:**

1. **ANVIL skill runs** — production-readiness testing across the whole pipeline. Unit + integration + database + E2E.
2. Hakan smokes the whole flow in production-mirror or staging environment for 2 days.
3. If ANVIL passes and smoke test passes → single PR from `feat/order-pipeline` to `main`.
4. Vercel auto-deploys.
5. Cutover Week 1 begins.

---

## KDS hardware procurement

Provisional spec from Frame:
- 24" touchscreen monitor (Iiyama T2455MSC-B1 ~£300, IP44 dust/splash resistant on front)
- Mini-PC (Beelink EQ12, N100, 16GB ~£170 — same model proposed for van-tracking server, dual-purpose viable later)
- Articulated wall mount (£40)
- IP-rated enclosure for the mini-PC if mounted in process room (~£50)

**Total provisional:** ~£560

**To do before SB5 lands:**
- Hakan confirms hardware spec or proposes alternative
- Order placed (1–2 week lead time)
- Mounting location agreed and physically prepped (power socket + ethernet drop or strong WiFi)

This procurement can happen in parallel with SB1–SB4 — it doesn't block any sub-branch except SB5 testing on real hardware.

---

## Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Sales reps refuse to double-enter during parallel running | Medium | High | Hakan personally enforces the 2-week parallel period; pull WhatsApp meat-orders rep access at end of week 4 |
| Products table goes stale | Low (in scope of Hakan to maintain) | Medium | Schema makes `products.updated_at` a sortable column; office reviews catalogue weekly during cutover |
| KDS device fails / WiFi drops mid-cut | Medium | Medium | Paper picking sheet is the source of truth for the butcher; KDS is the queue + tap-tracking layer only. Fallback: butcher writes "DONE" on paper, office reconciles end-of-day |
| Realtime subscription falls behind under load | Low at 6 reps + 1 KDS | Medium | Supabase realtime is comfortable up to thousands of clients; not a real risk at this scale |
| Late-edit + reprint workflow confuses butchers | Medium | Medium | The orange flash on KDS card draws attention; office process is "retrieve old paper before reprinting"; runbook documents it; first week of cutover Hakan watches for problems |
| Order-reference numbering collisions across multiple sales reps placing orders simultaneously | Low | High (duplicate refs would break the picking list lookup) | Schema uses Postgres sequence (atomic, never duplicates) |

---

## Open questions resolved during planning (vs Frame spec)

The Frame spec had 7 open questions (O1–O7). Where they land now:

- **O1 (delivery time/slot):** Punted to free-text `delivery_notes` field at order level for MVP. Structured slot booking is a Phase 2 enhancement.
- **O2 (products table populated?):** ✅ Verified — 285 active, no import needed.
- **O3 (audit trail):** ✅ Yes — `order_audit_log` table specified in SB1.
- **O4 (reprint version):** Reprints don't bump a visible version; instead the footer prints the current timestamp ("Printed: 30/05/2026 14:22"), so two paper sheets are visually distinguishable.
- **O5 (KDS auto-archive):** Completed cards fade out 30s after the last line is tapped done. Stays visible long enough for the butcher to confirm, then clears.
- **O6 (realtime transport):** ✅ Supabase realtime channels.
- **O7 (RLS policies):** Drafted in SB1; full policy text in the migration file.

---

## Acceptance criteria for "implementation plan signed off"

Hakan reads this document and says:

- **(a)** "Approved — start SB1"
- **(b)** "Approved with changes" — revise + re-sign
- **(c)** "Park" — no code happens

Once approved: I create the `feat/order-pipeline` long-lived branch off main, then create `feat/order-pipeline-schema` off that, and we begin SB1.
