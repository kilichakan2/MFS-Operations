## Goal
Build a Food Fraud Risk Assessment tile (haccp/food-fraud) where admins can create
and update the assessment. Every save creates a new version. All past versions are
viewable. Staff read-only. Feeds into annual review 3.9.

## Compliance
YES — new HACCP compliance record. BSD 1.6.4 (food fraud risk assessment).
Document reference: MFS-FFRA-001. docs/DOCUMENT_CONTROL.md should be updated.

## Note: same version history gap exists in allergen assessment
haccp_allergen_assessment stores rows (audit trail intact) but /haccp/allergens
only shows latest — no UI to view past versions. Logged in BACKLOG.md.
The food fraud tile will implement version history correctly from the start.
The allergen assessment version history UI is a separate backlog item.

## Document audit (MFS_Food_Fraud_Risk_Assesment_.docx)
Doc ref: MFS-FFRA-001, V1.0, issued 12/01/2026, review 12/01/2027
Prepared by: Hakan Kilic. Approved by: Ege Ozmen.
4 risk areas (Likelihood × Impact × Detection = Score):
  1. Species substitution    — L:2, I:4, D:3, score:24 LOW
  2. Origin/provenance fraud — L:2, I:3, D:2, score:12 LOW
  3. Halal certification     — L:1, I:5, D:2, score:10 LOW
  4. Weight/quantity fraud   — L:2, I:3, D:2, score:12 LOW
Supply chain: Lamb (LOW), Beef (LOW), Poultry (LOW), Packaging (LOW)
Risk levels: LOW 1–25, MEDIUM 26–50, HIGH 51–125

## Codebase findings (full grill)
- No food fraud table, API or tile exists
- Pattern: haccp_allergen_assessment — single table, each save = new row
  BUT: allergens UI only shows latest (no history view — this is the gap)
  Food fraud will do it right: list view + history + current version
- SmallTile badge: same pattern as specReviewDue — fetch on load, amber if overdue
- /api/haccp/users returns food safety team (Hakan, Ege, Daz, Adeel)
- No tests needed for pure CRUD — test suite stays green

## Files to change
- DB migration: haccp_food_fraud_assessments
- `app/api/haccp/food-fraud/route.ts` — GET (all versions), POST (new version)
- `app/haccp/food-fraud/page.tsx` — three views: list, detail, edit
- `app/haccp/page.tsx` — SmallTile + live badge

## Steps
- [ ] 1. DB migration: haccp_food_fraud_assessments
- [ ] 2. Seed V1.0 from MFS-FFRA-001 document
- [ ] 3. API: GET all + POST new (file: `app/api/haccp/food-fraud/route.ts`)
- [ ] 4. Page: list view (file: `app/haccp/food-fraud/page.tsx`)
- [ ] 5. Page: detail view — read-only, works for any version (current or past)
- [ ] 6. Page: add/edit form — admin only, always creates new version
- [ ] 7. SmallTile + live badge on homepage (file: `app/haccp/page.tsx`)
- [ ] 8. Run `npm run test` — all pass
- [ ] 9. Run `npx tsc --noEmit` — no errors in touched files

## DB schema: haccp_food_fraud_assessments
Each save inserts a new row. Ordered by created_at DESC. Latest = current.
- id uuid PK
- version text NOT NULL                  -- e.g. 'V1.0', 'V1.1', 'V2.0'
- issue_date date NOT NULL
- next_review_date date NOT NULL
- risks jsonb NOT NULL                   -- array, see below
- supply_chain jsonb NOT NULL            -- array, see below
- mitigation_notes text nullable
- prepared_by uuid FK → users nullable
- approved_by uuid FK → users nullable
- created_by uuid FK → users NOT NULL
- created_at timestamptz DEFAULT now()

risks array item:
  { fraud_type, description, likelihood (1-5), impact (1-5), detection (1-5),
    risk_score (stored = L×I×D), risk_level ('LOW'|'MEDIUM'|'HIGH') }

supply_chain array item:
  { category, supplier_type, fraud_risk, assessment ('LOW'|'MEDIUM'|'HIGH') }

## API: /api/haccp/food-fraud
GET  — returns { assessments: [...all versions desc], latest: assessment|null }
       review_due derived: next_review_date < today on latest record
POST — insert new version (admin only)
       Body: version, issue_date, next_review_date, risks[], supply_chain[],
             mitigation_notes, prepared_by, approved_by

## Page: /haccp/food-fraud — three views

### List view (default)
- Header: "Food Fraud Assessment · MFS-FFRA-001" + "+ New version" (admin only)
- Current version card: version badge, issue date, next review date,
  review due banner if overdue, highest risk level across all risks
- Version history section: list of all past versions (all except latest)
  Each shows version, issue date, "View" button
- Tap current or any past version → detail view

### Detail view (read-only, any version)
- Back button → list
- Header: version, issue date, review date, prepared/approved by
- Review due banner if this is latest AND overdue
- Risk table: fraud type | L | I | D | score | level badge (colour coded)
- Supply chain table: category | supplier type | fraud risk | level badge
- Mitigation notes
- "Edit" button on ANY version's detail view — pre-fills from THAT version, saves as new row
- "+ New version" button on list view — pre-fills from LATEST version, saves as new row
- Saving ALWAYS inserts a new row — historical records are NEVER mutated
- This means: you can base a new version on any past version via Edit,
  or use New version to continue from latest (most common)

### Edit form (admin, creates new version)
- Pre-filled from selected version (typically latest)
- Version text input (admin sets e.g. V1.1)
- Issue date + next review date
- Risk rows: fraud_type, description, L/I/D selects (1-5)
  Risk score auto-calculated display: L × I × D = N (LEVEL)
- Add row / remove row buttons for risks
- Supply chain rows: category, supplier_type, fraud_risk, assessment select
- Add row / remove row for supply chain
- Mitigation notes textarea
- Prepared by / Approved by selectors (/api/haccp/users)
- Save = POST new record. Does NOT overwrite existing.

## Homepage SmallTile
- Label: "Food Fraud" | Sub: "BSD 1.6.4"
- GET /api/haccp/food-fraud on load → check latest.review_due
- Badge: "Review due" (amber/due) OR "Current" (neutral)

## Annual review 3.9 data panel (built after this tile)
GET /api/haccp/food-fraud → latest record
Show: version, issue_date, next_review_date, review_due, risk count by level

## Tests
- npm run test all pass — no new pure logic to unit test
- Type check clean on all touched files

## Manual smoke tests
- [ ] HACCP home → Food Fraud tile visible
- [ ] Badge shows "Current" (V1.0 seeded with future review date 2027)
- [ ] Tap tile → list view with V1.0 as current, no history yet
- [ ] Tap V1.0 → detail view: 4 risk rows, supply chain, all LOW
- [ ] Admin → tap V1.0 → detail view has "Edit" button → opens form pre-filled from V1.0
- [ ] Change version to V1.1, save → list shows V1.1 current, V1.0 in history
- [ ] "+ New version" from list → form pre-filled from V1.1 (latest)
- [ ] Tap V1.0 in history → detail view has "Edit" button (pre-fills from V1.0)
- [ ] Tap V1.1 → detail view has "Edit" button
- [ ] Risk score auto-calculates as L/I/D sliders change
- [ ] Prepared by / Approved by show Hakan, Ege, Daz, Adeel only

## Risks
- Risk rows are dynamic (add/remove) — need careful array state management
- Score is stored not re-calculated to preserve audit integrity
- Version string is free text — admin responsibility to increment correctly
- Seed data must match document exactly — verified against MFS-FFRA-001
