# Unit 1 — Products Data Model Overhaul (marketplace-ready catalog + tiered pricing + stock mapping)

**Status:** Frame-level interrogation COMPLETE (planned in relay terminal T2, 2026-06-30). Ready for T1 to run FORGE from Frame onward — the Frame gate should confirm the decisions below, not re-open them.

**Author of spec:** planning relay (T2) with Hakan. **Builder:** main terminal (T1) via FORGE → ANVIL.

---

## 0. Driver & framing (why this exists)

- MFS is **internal-only today** (staff place every order) but becomes **self-service soon** (a customer-side ordering app where customers log in, browse a catalog, see *their tier's* price, and self-order).
- **MFS is the system of record.** Fresho is a platform we paid for, evaluated, and chose **not** to migrate onto — we are building our own. The attached Fresho CSV is a **reference shape + a real data seed**, never a sync/import target.
- **This unit builds the DATA MODEL only** — the product/pricing/stock-mapping shape that the future customer app and the future stock ledger plug into. We do **not** build customer auth, the customer portal, or live stock counting here.

🗣 Lay the marketplace plumbing in the database now so we don't re-migrate later; the customer login/catalog UI and live stock counts bolt on as their own units.

**Source data:** `mfs-global-ltd_product_list_with_level_prices_20260115-1809.csv` (in repo root at planning time; 372 sellable lines, NOT 372 products — ~50 are box/each/pallet variants of the same product).

---

## 1. Scope

### In scope (Unit 1)
1. New `stock_items` table — the inventory truth (counted in a per-product base unit). On-hand counts deferred, but the table + base-unit live now.
2. Reshape `products` into **sellable pack variants** that hang off a stock item with a conversion factor.
3. New `categories` table (replaces two free-text columns).
4. Structured **allergens** (14 UK named allergens), replacing messy free text.
5. **3-tier pricing** (Tier 1 hand-set, Tier 2 computed −5%, Tier 3 = per-customer overrides).
6. `customers.price_tier` column (default Tier 1).
7. Price-resolution logic: `(customer, sellable product) → price`.
8. Import/onboarding of the CSV: clean load, auto-group variants, quarantine zero-priced rows.
9. Ports/adapters + domain models for all the above (hexagonal, per CLAUDE.md).

### Explicitly OUT of scope (→ BACKLOG, see §8)
- **Unit 2 — live stock ledger**: on-hand counts, **decrement at dispatch** (decided), receiving stock in, adjustments, oversell rules, low-stock alerts.
- **Meat-yield / butchery module**: one input (whole lamb, per kg) → many different cuts at different yields. A separate future module.
- **`each = box + 5%` auto-markup rule** (Hakan wants to eyeball real examples first). For now each pack is priced independently.
- **`on_special` promo behavior** (flag stored, behavior later).
- **Customer portal / auth / catalog UI.**
- `tags` (blank in all rows).

---

## 2. The data model

### 2.1 `stock_items` (NEW) — the thing you HOLD and count
| Field | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `name` | text NOT NULL | e.g. "Anthap Blanched Almond". **Not unique by itself** — see §6 constraint change. |
| `category_id` | uuid FK → categories | replaces free-text category |
| `base_unit` | enum `kg` \| `litre` \| `piece` | **per-product physical measure** — the unit on-hand is counted in |
| `allergens` | allergen set (see §2.4) | structured, product-level |
| `external_system_id` / `external_system_source` | preserve existing | store Fresho `product_id`, source=`fresho` |
| (on-hand qty) | — | **DEFERRED to Unit 2** — not added now |

🗣 `base_unit` is per product: flour counts in **kg** (fractions are real), bottles count in **pieces** (stay whole). This is the correction the data forced — there is no single "each" because one product ships as 150g / 1kg / 5kg.

### 2.2 `products` (RESHAPE) — the thing you SELL and PRICE (a pack variant)
Each CSV line = one sellable variant pointing at a stock item.
| Field | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `stock_item_id` | uuid FK → stock_items | the pool this variant draws from |
| `code` | text **UNIQUE NOT NULL** | the SKU/`product_code` (today nullable — promote it) |
| `pack_label` | text | display, e.g. "Box (8 × 1kg)" / "Each (1kg)" |
| `units_per_base` | numeric NOT NULL | **how many base units this pack is** — 8×1kg box → 8; 1kg each → 1; 8×150g box → 1.2. Drives stock decrement (Unit 2) AND replaces the messy `quantity_type` string |
| `cost` | numeric | buy price, **internal-only, never exposed customer-side** (RBAC) |
| `tier_1_price` | numeric | standard list price, hand-set |
| `tier_2_price` | numeric NULL | **override only**; null ⇒ compute `tier_1 × (1 − global pct)` |
| `tax_applicable` | boolean | UK VAT (35 of 372 are Yes) |
| `visibility` | enum `public` \| `internal` | 5 CSV rows are `internal` |
| `availability` | enum `available` \| `limited` \| `unavailable` \| `hidden` | richer than today's `active` boolean |
| `on_special` | boolean | flag now, behavior deferred |
| `external_system_id` / `_source` | preserve | Fresho mapping |

🗣 Box and each are **separately priced** records sharing one stock pool — a box isn't just 8× an each (you'd discount the box). `units_per_base` is the single number that both decrements stock and encodes the pack size, killing the 135 messy `quantity_type` strings.

### 2.3 `categories` (NEW) — replaces free-text `product_group` + `marketplace_category`
The two CSV columns are ~95% identical → collapse into one real table.
| Field | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `name` | text UNIQUE | "Lamb", "Spices", "Pulses, Grains & Flour"… (~23 distinct) |
| `is_meat` | boolean | **set once per category** — Lamb/Beef/Chicken/Meat = true. KDS filters on this. |

🗣 Categories become real rows you can FK to, not typo-prone text. `is_meat` lives here (4 categories), not stamped on 372 products.

### 2.4 Allergens (NEW, structured) — the 14 UK FIC named allergens
Replace the 23 messy free-text variants of `extra_product_details` with a fixed set: celery, cereals-containing-gluten, crustaceans, eggs, fish, lupin, milk, molluscs, mustard, peanuts, sesame, soya, sulphites, tree-nuts. Product carries a **set/array** of these. Onboarding maps the free text → the set (e.g. "Contains Milk" → `milk`; "No Allergens"/blank → empty set; "May contain gluten" → flagged note). Cross-checkable against HACCP later.

🗣 A proper allergen checklist you can show in the catalog and audit, instead of 23 spellings of "contains milk."

### 2.5 `customers` (+1 column)
- `price_tier` enum/int — **Tier 1 (standard)** | Tier 2 (discounted) | Tier 3 (contracted/VIP). **Default Tier 1.**

### 2.6 Global settings
- `tier_2_discount_pct` — single global dial, **default 5%**. (Same machinery will later serve the deferred `each = box + 5%` pack rule.)

---

## 3. Pricing model (the spine)

```
PRICE RESOLUTION  (customer, sellable product) → price
  Tier 1  standard    = product.tier_1_price                      (hand-set)
  Tier 2  discounted  = product.tier_2_price ?? tier_1 × (1 − 5%) (computed dial + optional override)
  Tier 3  contracted  = customer's custom override for THIS product,
                        ELSE fall back to Tier 1                   (decided)
  customer.price_tier defaults to Tier 1
```

- **Tier 3 = reuse, not reinvent.** "Custom price for a specific customer" is exactly what the existing `price_agreement_lines` table already does (customer, product, agreed price). Repurpose that structure as the Tier-3 override store. A Tier-3 customer with no override for a product **falls back to Tier 1**.
- **Existing `price_agreements` data → archive** when the full catalog goes live (archive the *records*; keep the *table shape* as the Tier-3 engine).
- The old `price_unit` enum (`per_kg`/`per_box`) on agreement lines is superseded by the per-variant model — note for reconciliation.

🗣 Tiers 1 & 2 are global price levels on the product (one hand-set, one computed). Tier 3 is a private deal sheet on the customer — and you already built that table, so we reuse the socket and just archive the old contents.

---

## 4. Hexagonal mapping (ports & adapters) — the rip-out test

New/changed seams (the app owns the interface; Supabase is one adapter behind it):
- **`StockItemsRepository`** (port) → `lib/adapters/supabase/StockItemsRepository.ts` + fake + contract.
- **`CategoriesRepository`** (port) → supabase adapter + fake + contract.
- **`ProductsRepository`** — extend for the new variant shape (cost/tiers/factor/stock_item_id/visibility/availability).
- **`PricingRepository`** — repurpose for Tier-3 overrides + the price-resolution read.
- **Settings** (`tier_2_discount_pct`) behind a small owned interface (don't scatter the literal 5%).
- Domain models in `lib/domain/`: `StockItem`, `Product` (sellable variant), `Category`, `Allergen`, `PriceTier`. **No vendor types leak past the adapter.**
- Price resolution = a `lib/services` / `lib/usecases` operation depending on ports only; wired in `lib/wiring/`.

**Rip-out test:** swapping Supabase = one new adapter per repository + one wiring line each. Nothing in services/UI changes. (Per CLAUDE.md "build it like Lego".)

🗣 Every new table gets an owned socket; Supabase is just the plug. The global 5% sits behind its own socket too, so changing it is one place, not a find-and-replace.

---

## 5. Import / onboarding plan

- **Clean load** (no order history to preserve — current orders are throwaway tests).
- **Auto-group variants** into stock items by shared Fresho `product_id` (≈50 multi-variant groups; rest are single-variant). Present the ~50 groups for a **human confirm/split** — because the CSV lumps different pack-sizes (150g + 1kg + 5kg) under one id and the machine can't know which truly share one physical pool. Only ~50 need a glance (an afternoon).
- **Parse `quantity_type`** (135 distinct: `Box (8 × 1kg)`, `Each (1kg)`, `Kg`, `Pallet (100)`, `Box (12 × 500ml)`) → `(pack_type, units_per_base in the product's base_unit)`. Note the **`Pallet`** pack type exists alongside Box/Each/Kg.
- **Quarantine bad rows:** the **44 zero/blank-cost** and **19 zero/blank-price** rows import with `availability = hidden` so nothing can be sold at £0 until a price is filled in.
- **Allergen mapping** free-text → the 14-allergen set (small mapping pass; flag ambiguous "may contain").
- Store Fresho `product_id` in `external_system_id` (source=`fresho`).

🗣 Best-guess the variant groupings, quarantine the half-priced ones, and only ask Hakan to eyeball the ~50 the importer is unsure about. Better a 30-second confirm than silently merging stock that shouldn't merge.

---

## 6. Edge cases & migration gotchas T1 must handle

- **`products.name` is UNIQUE today** (`products_name_key`) — but **box and each variants share a name**. This constraint **must be dropped/reworked**; uniqueness moves to `code` (SKU). This is a concrete schema blocker, not optional.
- **Multi-size-under-one-name** (almonds = 150g + 1kg boxes + 1kg each; tahini = 4kg + 15kg eaches + 4×4kg box) — handled by per-product `base_unit` + `units_per_base`, but the *grouping* needs the confirm step (§5).
- **Fractional on-hand is correct** for kg/litre base units; only `piece` stays integer. (Unit 2 concern, but base_unit choice now must allow it.)
- **`external_system_id` + `external_system_source` UNIQUE-together** dedup key must be preserved.
- **Free-text escape hatches** elsewhere (`order_lines.ad_hoc_description`, `price_agreement_lines.product_name_override`) must keep working.
- **VAT**: boolean is enough for now (no multi-rate). Revisit if multiple rates appear.
- **Cost confidentiality**: `cost` is internal-only — ensure it is never returned on any customer-facing read path (matters once the portal exists; bake the boundary in now).

---

## 7. Suggested PR breakdown (for T1's forge-planner to sequence)

This is large for one FORGE unit. Likely PRs (T1 decides final cut):
1. **Schema + domain + ports/adapters** — `stock_items`, `categories`, `products` reshape, `customers.price_tier`, settings; migration incl. dropping `products_name_key`. Fakes + contracts.
2. **Tier pricing resolution** — Tier 1/2/3 service+usecase, global discount dial, Tier-3 = repurposed agreement lines, fallback-to-Tier-1.
3. **Categories + allergens reference data** + `is_meat` on category (+ optional product override) + KDS meat-filter read.
4. **Import/onboarding tool** — CSV load, variant auto-group + confirm UI, quarantine, allergen mapping, Fresho id mapping.

Each PR: FORGE Guard (code-critic) + ANVIL right-sized (schema/migration PRs → pgTAP + PITR gate where a migration is destructive, e.g. dropping the name unique).

---

## 8. Deferred → add to `docs/plans/BACKLOG.md`

- **F-STOCK-01 — Unit 2 live stock ledger**: on-hand counts, **decrement at dispatch**, receiving-in, adjustments, oversell rules, low-stock alerts. Builds directly on Unit 1's `stock_items.base_unit` + `units_per_base`.
- **F-MEAT-01 — meat-yield / butchery module**: one input (whole lamb per kg) → many cuts at different yields/prices. Separate model.
- **F-PRICE-PACK-01 — `each = box + 5%` auto-markup**: reuse the Tier-2 global-dial machinery; Hakan wants real examples first.
- **F-PROMO-01 — `on_special` behavior**: flag exists; promo logic later.
- **Customer portal / auth / catalog UI** — the self-service front end this data model feeds.

---

## 9. Frame gate — decisions already made (T1 confirms, doesn't re-open)
- Internal-now / self-service-soon; MFS = system of record; CSV = seed + reference. ✅
- Data model only this unit; stock ledger + portal deferred. ✅
- 3 tiers; Tier 2 = global −5% dial + nullable override; Tier 3 = per-customer overrides reusing agreement lines, fallback to Tier 1; customer default Tier 1. ✅
- Stock item ↔ sellable variants; **base_unit = physical measure (kg/litre/piece)**; `units_per_base` factor. ✅
- One real `categories` table; structured 14-allergen set. ✅
- `is_meat` on category (+ optional product override), not a raw per-product boolean. ✅
- Clean import; auto-group by Fresho id + confirm ~50; quarantine zero-priced as hidden. ✅
- Drop `products.name` UNIQUE; SKU `code` becomes the unique key. ✅
