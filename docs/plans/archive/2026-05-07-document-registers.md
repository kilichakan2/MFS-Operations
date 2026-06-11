## Goal
1. Split document register into FSA and SALSA views using a register_type tag
2. Add 3 missing documents (MFS-FFRA-001, MFS-FDP-001, MFS-ASR-001)
3. Add 3 new category labels and colours
4. Add water testing static note to annual review section 3.10

## Compliance
SALSA requires a documented document control register.
FSA inspectors need to see HACCP, allergen, training and monitoring records.
Separate views allow the right documents to be shown to each body.

## Codebase findings (full grill)
- haccp_documents: single table, no register_type field
- 11 current documents, all would be FSA + SALSA except:
  FFRA-001, FDP-001, ASR-001 (new) → SALSA only
- documents/page.tsx: single list, no tabs, no filtering
- documents API: returns all, ordered by category then doc_ref
- CATEGORY_LABELS: 8 entries, missing food_fraud, food_defence, haccp_system
- CATEGORY_COLOUR: 8 entries — same gaps
- Annual review render loop: 3.10 currently has no dataPanelContent
  SectionCard accepts dataPanelContent: React.ReactNode — can pass static JSX

## FSA vs SALSA mapping (confirmed)
FSA + SALSA (both): ALL 11 current documents
  HB-001, MF-001, MMP-001, MMP-HA-001, MMP-MF-001,
  HM-001, TRAIN-BP-001, TRAIN-WH-001, ALL-001, ALL-002, CA-001

SALSA only (new documents):
  MFS-FFRA-001: Food Fraud Risk Assessment (BSD 1.6.4)
  MFS-FDP-001:  Food Defence Plan (SALSA 4.2.3)
  MFS-ASR-001:  Annual Systems Review (SALSA 3.1)

## Files to change
- DB migration: add register_type text[] to haccp_documents
- DB: update existing 11 docs, insert 3 new docs
- `app/api/haccp/documents/route.ts` — include register_type in SELECT
- `app/haccp/documents/page.tsx` — tabs + new categories + filter logic
- `app/haccp/annual-review/page.tsx` — static water testing note for 3.10

## Steps
- [ ] 1. DB migration: add register_type text[] NOT NULL DEFAULT '{fsa,salsa}'
- [ ] 2. DB: update all 11 existing docs to register_type = '{fsa,salsa}'
          (migration default handles this — all existing rows get both)
- [ ] 3. DB: insert MFS-FFRA-001, MFS-FDP-001, MFS-ASR-001
          with register_type = '{salsa}'
- [ ] 4. Update API: add register_type to SELECT
- [ ] 5. Update documents page:
          a. Add register_type to HaccpDoc interface
          b. Add 3 new CATEGORY_LABELS entries
          c. Add 3 new CATEGORY_COLOUR entries
          d. Add tab state: 'all' | 'fsa' | 'salsa'
          e. Filter docs by selected tab
          f. Tab bar: All | FSA | SALSA
- [ ] 6. Annual review page: add static water testing note as dataPanelContent for 3.10
- [ ] 7. npm run test — all pass
- [ ] 8. npx tsc --noEmit — clean

## DB migration
ALTER TABLE haccp_documents
  ADD COLUMN register_type text[] NOT NULL DEFAULT '{fsa,salsa}';
-- Existing 11 rows automatically get '{fsa,salsa}' via DEFAULT

## New documents to insert
MFS-FFRA-001:
  title:         'Food Fraud Risk Assessment'
  version:       'V1.0'
  category:      'food_fraud'
  register_type: '{salsa}'
  description:   'Vulnerability assessment covering adulteration and substitution
                  risks for all raw materials including packaging.'
  purpose:       'BSD 1.6.4 / SALSA — documented food fraud vulnerability
                  assessment. Required for SALSA certification.'
  linked_docs:   '{HB-001}'
  status:        'current'
  updated_at:    '2026-01-12'
  review_due:    '2027-01-12'
  owner:         'Hakan Kilic'

MFS-FDP-001:
  title:         'Food Defence Plan'
  version:       'V1.0'
  category:      'food_defence'
  register_type: '{salsa}'
  description:   'Plan covering physical security, personnel security, cyber
                  security and incident response to protect food from
                  intentional adulteration.'
  purpose:       'SALSA 4.2.3 / BSD 4.4 — required for SALSA certification.
                  Covers site security, cyber security and food defence team.'
  linked_docs:   '{HB-001,MFS-FFRA-001}'
  status:        'current'
  updated_at:    '2026-01-12'
  review_due:    '2027-01-12'
  owner:         'Hakan Kilic'

MFS-ASR-001:
  title:         'Annual Food Safety Systems Review'
  version:       'V1.0'
  category:      'haccp_system'
  register_type: '{salsa}'
  description:   'Annual documented review of all food safety management system
                  requirements covering 10 sections including HACCP, training,
                  hygiene, suppliers, food fraud and food defence.'
  purpose:       'SALSA 3.1 — annual systems review required for SALSA
                  certification. Completed annually by HACCP Lead.'
  linked_docs:   '{HB-001,ALL-001,ALL-002,MFS-FFRA-001,MFS-FDP-001}'
  status:        'current'
  updated_at:    '2026-05-07'
  review_due:    '2027-05-07'
  owner:         'Hakan Kilic'

## New category labels and colours
food_fraud:   'Food Fraud'       — bg-orange-50 text-orange-700
food_defence: 'Food Defence'     — bg-red-50 text-red-700
haccp_system: 'HACCP System'     — bg-indigo-50 text-indigo-700

## Documents page tabs
State: activeTab: 'all' | 'fsa' | 'salsa'  (default: 'all')
Filter: docs where register_type includes activeTab
  (for 'all' show everything)
Tab bar: 3 pill buttons below header — All | FSA | SALSA
All is default — shows full picture on load

## Water testing note (section 3.10, annual review)
Pass as dataPanelContent for def.key === '3.10':
  <div className="mb-3 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
    <p className="text-blue-700 text-xs">
      <span className="font-bold">Water testing: </span>
      Paper records maintained on site. Present to auditor on request.
    </p>
  </div>
No sections.ts or hasDataPanel change needed — dataPanelContent is optional prop.

## Tests
- No new pure logic to test
- npm run test 975 must still pass
- Type check clean on touched files

## Manual smoke tests
- [ ] Documents page → SALSA tab (default) → shows 14 docs including FFRA/FDP/ASR
- [ ] FSA tab → shows 11 docs (excludes FFRA, FDP, ASR)
- [ ] All tab → shows all 14 docs
- [ ] Food Fraud, Food Defence, HACCP System categories visible
- [ ] FFRA-001 and FDP-001 link to their respective tiles (docs/[ref] page)
- [ ] Annual review 3.10 → expand → blue note about water testing records

## Risks
- register_type DEFAULT handles existing rows — no UPDATE needed
- SALSA tab as default: change to FSA if FSA inspection is more common use
- linked_docs for new docs uses doc_ref strings — FFRA-001 and FDP-001
  need to match their doc_ref exactly
- docs/[ref] page for MFS-FFRA-001 and MFS-FDP-001:
  Currently docs/[ref]/page.tsx fetches from haccp_sop_content by section_key.
  These new docs won't have SOP content rows — they'll show the live tile link instead.
  Need to add them to FORM_DOCS in docs/[ref]/page.tsx so they redirect to
  /haccp/food-fraud and /haccp/food-defence respectively.
