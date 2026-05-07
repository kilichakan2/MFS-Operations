## Goal
Add Section 3.9 Food Fraud & Food Defence to the annual systems review.
Has a live data panel pulling from the two tiles now built.

## Compliance
BSD 1.6.4 (food fraud) + SALSA 4.2.3 / BSD 4.4 (food defence).

## Codebase findings (full grill)
- /api/haccp/food-fraud GET returns: { assessments, latest, review_due }
  latest: { version, issue_date, next_review_date, ... }
- /api/haccp/food-defence GET returns: { plans, latest, review_due }
  latest: { version, issue_date, next_review_date, ... }
- Both APIs exist, return correct shape, require any HACCP role
- 3.9 items verbatim from MFS-ASR-001 confirmed
- Data is NOT period-filtered — these are standing documents
- Data API currently returns 3.2–3.8, response object needs '3.9' key added
- Render loop currently ends at 3.8 — needs 3.9 wired in

## Section 3.9 items (verbatim from MFS-ASR-001)
1. Food fraud risk assessment completed
2. Food defence plan in place
3. Site security adequate
4. Cyber security measures in place

## hasDataPanel: true
Unlike original assumption (nothing in system), both tiles now exist.
Data panel shows current state of both documents.

## Files to change
- `lib/annualReview/sections.ts` — add section 3.9
- `app/api/haccp/annual-review/data/route.ts` — add 3.9 queries
- `app/haccp/annual-review/page.tsx` — SectionData['3.9'], FoodFraudDefencePanel, render loop
- `tests/unit/annualReview.test.ts` — section 3.9 definition + data logic tests

## Steps
- [ ] 1. Add section 3.9 to REVIEW_SECTIONS
- [ ] 2. Add 3.9 queries to data API — fetch latest from both tables (not period-filtered)
- [ ] 3. SectionData['3.9'] type
- [ ] 4. FoodFraudDefencePanel component — two sub-cards side by side
- [ ] 5. Wire in render loop
- [ ] 6. Tests
- [ ] 7. npm run test + tsc --noEmit

## Data API — 3.9 queries
Two separate queries, both current-state:

Food fraud:
  SELECT version, issue_date, next_review_date FROM haccp_food_fraud_assessments
  ORDER BY created_at DESC LIMIT 1
  → { version, issue_date, next_review_date, review_due (bool), exists (bool) }

Food defence:
  SELECT version, issue_date, next_review_date FROM haccp_food_defence_plans
  ORDER BY created_at DESC LIMIT 1
  → { version, issue_date, next_review_date, review_due (bool), exists (bool) }

## Data panel: FoodFraudDefencePanel
Collapsible, amber badge if either document overdue or missing.
Two sub-cards:
  Food Fraud Assessment (MFS-FFRA-001):
    version, issue_date, next_review_date
    "Review due" amber if overdue, "Current" green if not
    "Not on file" red if doesn't exist
  Food Defence Plan (MFS-FDP-001):
    same structure

## Tests
- 3.9 exists, title = 'Food Fraud & Food Defence', 4 items, hasDataPanel = true
- Items verbatim
- Order: 3.8 before 3.9
- review_due logic: next_review_date < today → true
- exists logic: no record → exists = false, review_due = true
- hasAlerts: either overdue or missing → true
- All clean: both current → no alert

## Manual smoke tests
- [ ] Section 3.9 appears below 3.8
- [ ] Data panel shows food fraud V1.0 current (review 2027)
- [ ] Data panel shows food defence V1.0 current (review 2027)
- [ ] No amber badge (both current)
- [ ] All 4 items tick and persist
