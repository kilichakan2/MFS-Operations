## Goal
Add Section 3.10 Premises & Equipment to the annual systems review.
4 items verbatim from MFS-ASR-001. Fully manual — no data panel.

## Compliance
BSD 1.5 (premises and equipment), BSD 1.7 (maintenance).

## Codebase findings (full grill)
- No tables for glass register, equipment maintenance, premises condition
  or water testing exist anywhere in the DB
- Calibration (thermometers) already captured in haccp_calibration_log
  and already shown in 3.6 TempControlDataPanel — not duplicated here
- Daily diary has some equipment checks but no systematic premises condition log
- All 4 items are manual physical verifications — reviewer confirms on-site
- hasDataPanel: false — same pattern as 3.1 and 3.5
- Only sections.ts and tests need changing

## Section 3.10 items (verbatim from MFS-ASR-001)
1. Premises in good repair
2. Equipment maintained and fit for purpose
3. Glass/breakables register up to date
4. Water supply safe (testing current)

## Files to change
- `lib/annualReview/sections.ts` — add section 3.10
- `tests/unit/annualReview.test.ts` — section 3.10 definition tests

## Steps
- [ ] 1. Add section 3.10 to REVIEW_SECTIONS
- [ ] 2. Add tests
- [ ] 3. npm run test — all pass
- [ ] 4. npx tsc --noEmit — clean

## Tests
- 3.10 exists, title = 'Premises & Equipment', 4 items, hasDataPanel = false
- All 4 labels verbatim
- buildInitialChecklist includes 3.10 with 4 items, null statuses
- Section order: 3.9 before 3.10
- REVIEW_SECTIONS.length >= 10
- isChecklistComplete requires 3.10 answered

## Manual smoke tests
- [ ] Section 3.10 appears below 3.9, no data panel
- [ ] All 4 items tick and persist

## Risks
- None. No DB changes, no API changes, purely additive.
