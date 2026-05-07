## Goal
Build a dedicated Product Specifications tile (haccp/product-specs) where staff can
view product specs and admins can add/edit them. Satisfies BSD 1.6.2 requirement for
written product specifications held on file and regularly reviewed.

## Compliance
YES — introduces a new HACCP compliance record type.
docs/DOCUMENT_CONTROL.md should be updated to reference the new spec register.

## Codebase findings
- No haccp_product_specs table exists in the DB
- No product-specs page or API route exists
- Pattern: allergens/page.tsx — staff read-only, admin can edit, isAdmin from cookie
- SmallTile added to haccp/page.tsx small tile grid (currently 7 tiles in 4-col grid)
- API pattern: GET all (any role), POST create (admin), PATCH update (admin)
- All API routes live under app/api/haccp/

## BSD 1.6.2 fields required
Product name, description/intended use, ingredients, allergens,
portion weight, storage temp, shelf life (chilled + frozen),
packaging type, micro limits (optional), version, review date, reviewed_by

## Files to change
- DB migration: create haccp_product_specs table
- `app/api/haccp/product-specs/route.ts` — GET all, POST create, PATCH update
- `app/haccp/product-specs/page.tsx` — list view + add/edit form (admin)
- `app/haccp/page.tsx` — add SmallTile

## Steps
- [ ] 1. DB migration: haccp_product_specs
- [ ] 2. API route: GET / POST / PATCH (file: `app/api/haccp/product-specs/route.ts`)
- [ ] 3. Page: list view (file: `app/haccp/product-specs/page.tsx`)
- [ ] 4. Page: add/edit form — admin only
- [ ] 5. Add SmallTile to HACCP homepage (file: `app/haccp/page.tsx`)
- [ ] 6. Run `npm run test` — all pass
- [ ] 7. Run `npx tsc --noEmit` — no errors in touched files

## DB schema: haccp_product_specs
- id uuid PK
- product_name text NOT NULL
- description text nullable — intended use
- ingredients text nullable — free text list
- allergens text nullable — e.g. "Contains: Milk. May contain: Gluten"
- portion_weight_g numeric nullable
- storage_temp_c numeric nullable — e.g. ≤5
- shelf_life_chilled_days integer nullable
- shelf_life_frozen_days integer nullable
- packaging_type text nullable — e.g. "Vacuum packed"
- micro_limits text nullable — optional, free text
- version text NOT NULL DEFAULT 'V1.0'
- reviewed_at date nullable
- reviewed_by uuid REFERENCES users(id) nullable
- active boolean NOT NULL DEFAULT true
- created_by uuid REFERENCES users(id) NOT NULL
- created_at timestamptz NOT NULL DEFAULT now()
- updated_at timestamptz NOT NULL DEFAULT now()

## API
GET  — return all active specs (any logged-in role)
POST — create new spec (admin only), body: all spec fields
PATCH — update spec (admin only), body: id + changed fields;
  if any field changes, auto-increment version (V1.0 → V1.1 → V2.0 NOT auto — admin sets)

## Page: /haccp/product-specs

List view (all users):
- Header: "Product Specifications · BSD 1.6.2"
- Each spec as a card: product_name, version, allergens, last reviewed date
- Review due badge: reviewed_at > 12 months ago or never reviewed → amber "Review due"
- Tap card → detail view (all fields)
- "+ Add spec" button shown for admin only

Detail view:
- All fields displayed clearly
- Edit button (admin only)

Edit/Add form (admin only):
- All fields as inputs
- Version: text input (admin sets manually e.g. V1.0, V1.1, V2.0)
- Reviewed by: selector from users (Hakan/Ege first)
- Reviewed date: date picker
- Save / Cancel

## Tests
- No pure logic to unit test (CRUD only)
- Verify npm run test still passes (existing tests unaffected)
- Type check clean

## Manual smoke tests
- [ ] HACCP home → Product Specs tile visible
- [ ] Tap tile → list view loads
- [ ] Logged in as admin → "+ Add spec" button visible
- [ ] Add a spec with all fields → saves and appears in list
- [ ] Tap spec card → detail view shows all fields
- [ ] Edit spec → change a field, save → card shows updated data
- [ ] Review due badge shows on specs with no reviewed_at or reviewed_at > 12 months ago
- [ ] Non-admin user: no add/edit buttons visible

## Risks
- version field is free text — admin responsibility to increment correctly
- micro_limits optional — most small producers won't have lab results yet
- No delete — deactivate only (active = false) to preserve audit trail
