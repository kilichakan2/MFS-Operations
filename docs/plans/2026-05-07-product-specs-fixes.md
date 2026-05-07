## Goal
Fix three issues in the Product Specifications tile:
1. Reviewed by selector empty — wrong API called
2. Allergens should be clickable tiles (same pattern as delivery page)
3. packaging_type and storage_temp_c should be structured selects, not free text

## Compliance
NO — no HACCP data schema changes to compliance-critical fields.
allergens column type change is additive (text → text[], new allergen_notes column).

## Codebase findings
- product-specs/page.tsx calls `/api/haccp/people` → returns health records not users
- annual-review/page.tsx has the SAME bug (approved_by selector also broken)
- No `/api/haccp/users` endpoint exists — need to create one
- Users: Hakan (admin), Ege (admin), Daz (warehouse), Adeel (butcher), Emre (office) + others
- ALLERGENS constant already defined in delivery/page.tsx — 14 EU/UK allergens
- Allergen tile pattern: flex-wrap toggle buttons, selected=filled, deselected=outline
- packaging_type: free text → select (Vacuum packed, MAP, Tray, Flow wrap, Other)
- storage_temp_c: number input → select with common food safety options

## Files to change
- DB migration: allergens text → text[], add allergen_notes text
- `app/api/haccp/users/route.ts` — NEW: returns all active users (id, name, role)
- `app/api/haccp/product-specs/route.ts` — handle allergens as array, allergen_notes
- `app/haccp/product-specs/page.tsx` — fix user fetch, allergen tiles, selects
- `app/haccp/annual-review/page.tsx` — fix user fetch (same bug)

## Steps
- [ ] 1. DB: allergens text[] + allergen_notes text (migration)
- [ ] 2. Create /api/haccp/users route (file: `app/api/haccp/users/route.ts`)
       Returns all active users ordered: admins first (Hakan, Ege), then by name
- [ ] 3. Update product-specs API — allergens as text[], allergen_notes field
       (file: `app/api/haccp/product-specs/route.ts`)
- [ ] 4. Update product-specs page:
       a. Fetch from /api/haccp/users instead of /api/haccp/people
       b. allergens: string[] in form state + clickable tiles (same 14 as delivery page)
       c. allergen_notes: text field shown below tiles
       d. packaging_type: select (Vacuum packed / MAP / Tray / Flow wrap / Other)
       e. storage_temp_c: select (≤1°C / ≤3°C / ≤5°C / ≤8°C / ≤-18°C / Other(manual))
       f. Display allergens as tags in list + detail view
       (file: `app/haccp/product-specs/page.tsx`)
- [ ] 5. Fix annual-review page — fetch from /api/haccp/users
       (file: `app/haccp/annual-review/page.tsx`)
- [ ] 6. Run `npm run test` — all pass
- [ ] 7. Run `npx tsc --noEmit` — no errors in touched files

## DB migration
ALTER TABLE haccp_product_specs
  ALTER COLUMN allergens TYPE text[] USING
    CASE WHEN allergens IS NULL THEN NULL
    ELSE ARRAY[allergens] END;
ALTER TABLE haccp_product_specs ADD COLUMN allergen_notes text;

## Allergen tiles
Same 14 as delivery page:
Mustard, Celery, Sulphites, Gluten, Milk/Dairy, Soya, Eggs, Peanuts,
Tree nuts, Crustaceans, Molluscs, Fish, Lupin, Sesame
Selected = slate-900 bg white text. Deselected = outline.
(Neutral colours — not red like delivery page which is an alert context)
allergen_notes: free text below tiles for "may contain" declarations

## Packaging type options
Vacuum packed | MAP (Modified Atmosphere) | Tray | Flow wrap | Bulk | Other

## Storage temp select options
≤1°C | ≤3°C | ≤5°C | ≤8°C | ≤-18°C | Other (shows number input)

## Tests
- npm run test all pass (existing 918 tests unaffected — no new pure logic)
- Type check clean on touched files

## Manual smoke tests
- [ ] Product Specs → Add spec → Reviewed by shows Hakan, Ege, Daz + others
- [ ] Annual review sign-off → Approved by shows Hakan, Ege, Daz
- [ ] Add spec → allergen tiles show all 14, tap to select/deselect
- [ ] Selected allergens show as tags in list and detail view
- [ ] packaging_type shows as dropdown with 6 options
- [ ] storage_temp_c shows as dropdown, "Other" reveals number input
- [ ] Save and reopen — all selections persist

## Risks
- allergens type change: no existing data — safe migration
- storage_temp_c "Other" path: if user selects Other, show numeric input.
  Need careful state handling — two form fields for one DB column.
- annual-review users fix is critical — sign-off was silently broken.
