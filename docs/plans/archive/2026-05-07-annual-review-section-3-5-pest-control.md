## Goal
Add Section 3.5 Pest Control to the annual systems review.
No data panel — pest control is fully paper/contractor-based at MFS.
6 items covering all BSD 1.9 clauses and FSA Food Hygiene Regulations 2006.

## Compliance
NO — no HACCP data touched, no temperature limits, no legislation references.
docs/DOCUMENT_CONTROL.md does not require updating.

## Codebase findings
- No haccp_pest table in DB — confirmed
- No pest API routes exist
- hasDataPanel: false sections (ref: 3.1) need no data API change and no panel component
- SectionCard with no dataPanelContent renders checklist items only — works as-is
- Only sections.ts and tests need changing

## BSD 1.9 clause coverage (confirmed against BSD Issue 1 document)
1. BSD 1.9.2 — Contract in place and reviewed
2. BSD 1.9.4 — Visit reports reviewed (12-week industry standard)
3. BSD 1.9.3 — Bait plan/site plan up to date
4. BSD 1.9.1 — Site proofed + no evidence of pest activity (combined)
5. Good practice — EFK UV bulbs changed annually
6. BSD 1.9.5 + 1.9.6 — Recommendations actioned and trend analysis completed

## Files to change
- `lib/annualReview/sections.ts` — add section 3.5 to REVIEW_SECTIONS
- `tests/unit/annualReview.test.ts` — add section 3.5 definition tests

## Steps
- [ ] 1. Add section 3.5 to REVIEW_SECTIONS (file: `lib/annualReview/sections.ts`)
- [ ] 2. Add tests (file: `tests/unit/annualReview.test.ts`)
- [ ] 3. Run `npm run test` — all pass
- [ ] 4. Run `npx tsc --noEmit` — no errors in touched files

## Section 3.5 items (BSD-compliant, confirmed by Hakan)
1. Pest control contract in place and service contract reviewed
2. Contractor visit reports reviewed — min every 12 weeks
3. Bait plan/site plan up to date
4. Site adequately proofed — no gaps, doors seal, no evidence of pest activity
5. EFK UV bulbs changed annually
6. Contractor recommendations actioned and trend analysis completed

## Tests
- 3.5 exists, title = 'Pest Control', 6 items, hasDataPanel = false
- All 6 labels match verbatim
- buildInitialChecklist includes 3.5 with 6 items, all null statuses
- Section order: 3.4 before 3.5
- REVIEW_SECTIONS.length >= 5
- isChecklistComplete requires 3.5 answered before sign-off (dynamic — no code change)

## Manual smoke tests
- [ ] Section 3.5 appears below 3.4 in draft review
- [ ] Collapsed by default, tap to expand
- [ ] No data panel — just 6 checklist items
- [ ] All 6 items tick with Saving… visible
- [ ] Back to list, re-open — ticked items persist
- [ ] Progress bar advances when 3.5 items answered

## Risks
- None. No DB changes, no API changes, purely additive.
- Adding 3.5 raises sign-off bar from 4 to 5 sections — automatic via REVIEW_SECTIONS iteration.
