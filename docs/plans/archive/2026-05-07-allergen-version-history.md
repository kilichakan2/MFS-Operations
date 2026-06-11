## Goal
Add version history to the allergen assessment page. Every save already creates
a new row in the DB — this just exposes it in the UI. Same pattern as food fraud
but adapted to the allergen page's existing structure.

## Compliance
SALSA 1.4.1 — SALSA auditor may ask to see previous assessments.
No DB changes needed.

## Codebase findings (full grill)
- haccp_allergen_assessment: 1 record (assessed_at 2026-05-01)
  Fields: id, assessed_by, assessed_at, next_review_date, site_status,
          raw_materials (jsonb), cross_contam_risk, procedure_notes,
          updated_by, updated_at
- API GET: returns latest only (limit 1). POST: always inserts (correct).
- Page: 645 lines, dark header style (bg-[#1E293B])
  Three sections: assessment view, inline edit form, monthly reviews
  State: assessment (latest only), editing (bool), monthly reviews
- Monthly reviews: separate API, not version-specific — stays on main view always
- Edit: openEdit() pre-fills from assessment (latest), saves new row via POST

## Key differences from food fraud
- Dark header (bg-[#1E293B]) — allergen page keeps its own style
- No "version" field — assessments are identified by assessed_at date
- Raw materials are dynamic rows (add/remove already exists)
- Monthly reviews section is NOT version-specific — always visible on main view
- "Update" button (not "Edit") — keep existing terminology

## Files to change
- `app/api/haccp/allergen-assessment/route.ts` — GET returns all + latest
- `app/haccp/allergens/page.tsx` — add history list + historical detail view

## API change (backward compatible)
GET now returns:
  { assessment: latest, all_assessments: [...all desc] }
  - assessment: existing field — no existing caller breaks
  - all_assessments: new field for history list

## Page restructure — three views

### View 1: Main view (default — same as now + history section at bottom)
- Everything currently shown: site status, assessment details, raw materials,
  procedure notes, SALSA note
- "Update" button in header → opens edit view (pre-fills from LATEST)
- NEW: Version history section at bottom of page (above monthly reviews)
  Collapsible. Shows list of all past assessments (all except latest):
    Each row: assessed_at date, site_status badge, material count, "View" button
  Tap "View" → detail view for that historical version

### View 2: Historical detail view (read-only, past versions only)
- Back button → main view
- Header: "Previous Assessment · [date]" (dark header, same style)
- Same content layout as main view (status, materials, notes)
- "Update based on this" button (admin) → edit view pre-filled from THIS version
- No "Update" button that pre-fills from latest — that's always in main view

### View 3: Edit view (same as current inline form but full-screen)
- Pre-filled from: latest (when launched from main) OR selected version (from history detail)
- On save: POST new record, navigate back to main view, show flash
- Cancel → back to wherever launched from (main or detail)
- Existing form fields: site_status, next_review_date, cross_contam_risk,
  procedure_notes, raw_materials (add/remove rows)

## State changes
Add to existing state:
  allAssessments: AllergenAssessment[]    — all versions for history list
  selectedHistory: AllergenAssessment | null  — which historical version to show
  editBase: AllergenAssessment | null     — which version edit is based on

Remove:
  editing: boolean → replaced by editBase !== null

## Steps
- [ ] 1. Update API: remove limit(1), add all_assessments to response
- [ ] 2. Page: add allAssessments + selectedHistory + editBase state
- [ ] 3. Page: update loadAssessment to also set allAssessments
- [ ] 4. Page: historical detail view (condition: selectedHistory !== null)
- [ ] 5. Page: edit view (condition: editBase !== null)
         openEdit(base) replaces current openEdit()
         Main "Update" button calls openEdit(assessment) [latest]
         History detail "Update based on this" calls openEdit(selectedHistory)
- [ ] 6. Page: version history section in main view (below notes, above monthly reviews)
- [ ] 7. npm run test — all pass
- [ ] 8. npx tsc --noEmit — clean

## Design notes
- History list: keep compact — date, status badge, material count, view button
- Historical detail view: same dark header style as main page
- "Update based on this" label is clear about what it does
- Monthly reviews stay in main view only — they're aggregate data, not per-version

## Tests
- No new pure logic — existing tests unaffected
- npm run test must still pass (975 tests)

## Manual smoke tests
- [ ] Main view shows current assessment (same as before)
- [ ] Version history section visible below notes (collapsed)
- [ ] Expand history → shows 0 past versions (only 1 record in DB)
- [ ] "Update" button → edit view pre-fills from current
- [ ] Save new version → main view shows new assessment, history shows 1 past version
- [ ] Tap past version → historical detail view, read-only
- [ ] "Update based on this" → edit view pre-fills from historical version
- [ ] Save → new version created, back to main
- [ ] Cancel from edit → back to correct view (main or detail)

## Risks
- allAssessments includes latest — history list must show allAssessments.slice(1)
  (all except index 0 which is latest)
- editBase state: null = not editing, non-null = editing (from which base)
- Back navigation: need to track where edit was launched from to navigate correctly
  Solution: keep a simple "editOrigin" flag: 'main' | 'history'
  Cancel from 'main' origin → main view
  Cancel from 'history' origin → back to selectedHistory detail view
