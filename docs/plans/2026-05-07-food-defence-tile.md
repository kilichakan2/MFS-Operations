## Goal
Build a Food Defence Plan tile (haccp/food-defence) covering items 2, 3 and 4
of annual review section 3.9. Version history. Admin editable. Staff read-only.
Same pattern as food fraud tile. Feeds into 3.9 annual review.

## Compliance
YES — new HACCP compliance record. SALSA 4.2.3 / BSD 4.4.
Document reference: MFS-FDP-001. docs/DOCUMENT_CONTROL.md to be updated.

## Document audit (MFS_Food_Defence_Plan_.docx)
Doc ref: MFS-FDP-001, V1.0, issued 12/01/2026, review 12/01/2027
Prepared by: Hakan Kilic. Approved by: Ege Ozmen.

Sections:
  3. Food Defence Team — 3 roles (Coordinator, Site Security Lead, IT Security Lead)
  4. Physical Security:
     Perimeter: CCTV, fencing, lighting, locks/access control (4 controls, status each)
     Internal: production access, chemical storage, allergen storage (3 controls, status each)
     Visitor management: handled via People tile (already in system ✅)
  5. Personnel security — free text
  6. Goods receipt & dispatch — free text
  7. Cyber security controls (5 controls, status each)
     Backup & recovery (3 systems: Inventory App, HACCP Records, Supplier Files)
  8. Incident response — fixed procedure (CONTAIN/NOTIFY/PRESERVE/INVESTIGATE/ESCALATE/RECOVER)
     Emergency contacts (Police 101, Police 999, FSA 0330 332 7149, EHO, SALSA)
  9. Review triggers — free text note

Sections 3.9 items covered by this document:
  Item 2: Food defence plan in place → this document exists ✅
  Item 3: Site security adequate → physical security section
  Item 4: Cyber security measures in place → cyber section

## Codebase findings (full grill)
- Exact pattern: haccp_food_fraud_assessments / food-fraud tile
  Same: version, issue_date, next_review_date, jsonb columns, prepared_by, approved_by
  Same API shape: GET all + latest + review_due / POST new version
  Same page: list / detail / edit form
  Same rule: each save = new row, historical records immutable
  Edit on any version = pre-fill from THAT version
  + New version = pre-fill from LATEST version
- Visitor log: already in People tile (haccp_health_records visitor type) — confirmed
  Do NOT duplicate visitor management — reference it in display
- No food-defence table, API or page exists yet

## Files to change
- DB migration: haccp_food_defence_plans
- `app/api/haccp/food-defence/route.ts` — GET + POST
- `app/haccp/food-defence/page.tsx` — list / detail / edit
- `app/haccp/page.tsx` — SmallTile + live badge

## Steps
- [ ] 1. DB migration: haccp_food_defence_plans
- [ ] 2. Seed V1.0 from MFS-FDP-001 document
- [ ] 3. API: GET + POST (file: `app/api/haccp/food-defence/route.ts`)
- [ ] 4. Page: list / detail / edit (file: `app/haccp/food-defence/page.tsx`)
- [ ] 5. SmallTile + live badge (file: `app/haccp/page.tsx`)
- [ ] 6. Run `npm run test` — all pass
- [ ] 7. Run `npx tsc --noEmit` — no errors

## DB schema: haccp_food_defence_plans
- id uuid PK
- version text NOT NULL
- issue_date date NOT NULL
- next_review_date date NOT NULL
- team jsonb NOT NULL                -- [{role, name, responsibility}]
- physical_perimeter jsonb NOT NULL  -- [{control, description, status}]
- physical_internal jsonb NOT NULL   -- [{control, description, status}]
- cyber_controls jsonb NOT NULL      -- [{control, requirement, status}]
- backup_recovery jsonb NOT NULL     -- [{system, method, frequency, recovery_tested bool}]
- emergency_contacts jsonb NOT NULL  -- [{contact, number}]
- personnel_notes text nullable      -- free text section 5
- goods_notes text nullable          -- free text section 6
- incident_notes text nullable       -- any additions to standard procedure
- prepared_by uuid FK → users nullable
- approved_by uuid FK → users nullable
- created_by uuid FK → users NOT NULL
- created_at timestamptz DEFAULT now()

Status options for controls: 'In place' | 'Partial' | 'Not in place'
(Document uses checkboxes — upgrading to 3-state for more useful reporting)

## API: /api/haccp/food-defence
GET  — { plans: [...all desc], latest, review_due }
POST — insert new version (admin only)

## Page: /haccp/food-defence

### List view
- Header + "+ New version" (admin)
- Current version card: version, dates, badge
- Version history list

### Detail view (any version, read-only)
- Header: MFS-FDP-001 · version, current/historical label
- Review due banner if overdue
- Document metadata (dates, prepared by, approved by)
- Food defence team table
- Physical security — perimeter controls (status badge per row)
- Physical security — internal controls (status badge per row)
- Visitor management note + link to People tile (already in system)
- Cyber security controls (status badge per row)
- Backup & recovery table
- Personnel security notes
- Goods receipt & dispatch notes
- Emergency contacts
- Edit button (admin, any version)

### Edit form (admin, always saves new row)
- Version, issue date, next review date
- Team rows: role, name, responsibility (dynamic add/remove)
- Physical perimeter rows: control, description, status select (dynamic)
- Physical internal rows: control, description, status select (dynamic)
- Cyber controls rows: control, requirement, status select (dynamic)
- Backup rows: system, method, frequency, recovery_tested checkbox (dynamic)
- Emergency contacts rows: contact, number (dynamic)
- Personnel notes textarea
- Goods notes textarea
- Incident notes textarea
- Prepared by / Approved by selectors

## Status select options
'In place' | 'Partial' | 'Not in place'
Colour: In place=green, Partial=amber, Not in place=red

## Homepage SmallTile
- Label: "Food Defence" | Sub: "SALSA 4.2.3"
- Badge: "Review due" (amber) or "Current"

## Annual review 3.9 data panel (built after both tiles)
- Food fraud: version, issue_date, next_review_date, review_due
- Food defence: version, issue_date, next_review_date, review_due
- Both must exist and be current for green status

## Tests
- npm run test all pass
- Type check clean on all touched files

## Manual smoke tests
- [ ] HACCP home → Food Defence tile visible, badge "Current"
- [ ] Tap → list view with V1.0 current
- [ ] Tap V1.0 → detail shows team, physical controls, cyber controls, backups
- [ ] Status badges: In place=green
- [ ] Visitor management section shows note linking to People tile
- [ ] Admin → Edit → form pre-fills from V1.0
- [ ] Change a status, save as V1.1 → list shows V1.1 current, V1.0 in history
- [ ] Tap V1.0 → Edit button → pre-fills from V1.0 (not V1.1)
- [ ] "+ New version" from list → pre-fills from V1.1 (latest)

## Risks
- More jsonb columns than food fraud — state management in edit form is heavier
  Use same pattern: updateRow(section, idx, field, value) helper
- visitor management is intentionally NOT editable here — it links to People tile
- Status options: document uses binary checkboxes but 'Partial' is more useful
  for audit purposes — confirmed in plan
- Seed data: some fields in document have placeholder [Name] values for team —
  seed with actual known names where possible, placeholders otherwise
