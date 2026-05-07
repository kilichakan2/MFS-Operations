## Goal
Add Section 3.4 Cleaning & Disinfection to the annual systems review with a live
period-filtered data panel sourced from `haccp_cleaning_log`.

## Compliance
YES — touches HACCP cleaning records. No change to temperature limits, legislation
references, or training documents. `docs/DOCUMENT_CONTROL.md` does not require
updating for this read-only data panel addition.

## Codebase findings (from grill search)
- `what_was_cleaned` is a long comma-separated string (up to 200+ chars) — NOT shown
  in the issues list (confirmed). Too noisy, not useful for annual review context.
- `issues` boolean NOT NULL — always present on every record
- `what_did_you_do` nullable — fallback "No action recorded" when null on issues=true
- `sanitiser_temp_c` nullable numeric — actual °C reading, not pass/fail
- `verified_by` text — NOT shown in panel (confirmed). Day-to-day detail, not needed.
- Pattern: SectionData type + panel component + render loop wire → follows 3.3 exactly

## Grill decisions (confirmed)
1. Issues list: show date + action taken (what_did_you_do) only — no what_was_cleaned
2. Sanitiser: show count of readings AND flag below-82°C readings (CCP limit)
3. Below-82°C readings: separate sub-section from boolean issues list
4. verified_by: not shown

## Files to change

- `lib/annualReview/sections.ts` — add section 3.4 to REVIEW_SECTIONS
- `app/api/haccp/annual-review/data/route.ts` — add 3.4 cleaning query
- `app/haccp/annual-review/page.tsx` — CleaningRecord interface, SectionData['3.4'],
  CleaningDataPanel component, render loop wire-up
- `tests/unit/annualReview.test.ts` — section 3.4 definition tests + data logic tests

## Steps

- [ ] 1. Add section 3.4 to REVIEW_SECTIONS (file: `lib/annualReview/sections.ts`)
- [ ] 2. Add 3.4 query to data API (file: `app/api/haccp/annual-review/data/route.ts`)
       SELECT date, issues, what_did_you_do, sanitiser_temp_c
       Filter: date >= from AND date <= to, order date DESC
       Return:
         total — all records in period
         issues_count — records where issues = true
         issues_list — [{date, what_did_you_do}] where issues = true
         sanitiser_checks — count where sanitiser_temp_c IS NOT NULL
         low_temp_list — [{date, sanitiser_temp_c}] where sanitiser_temp_c < 82
         last_log_date — date of most recent record (records[0].date)
- [ ] 3. Add CleaningRecord interface + SectionData['3.4'] to page
       (file: `app/haccp/annual-review/page.tsx`)
- [ ] 4. Add CleaningDataPanel component (file: `app/haccp/annual-review/page.tsx`)
       Collapsible panel with:
       - 3-stat summary grid: total sessions / issues flagged (amber if > 0) / sanitiser checks
       - Last log date
       - Issues sub-section: date + what_did_you_do (fallback "No action recorded")
         only shown when issues_count > 0
       - Low sanitiser temps sub-section: date + temp °C in amber
         only shown when low_temp_list.length > 0
       - Empty state: "No cleaning records in this review period"
       - Amber badge in header when issues_count > 0 OR low_temp_list.length > 0
- [ ] 5. Wire '3.4' in render loop (file: `app/haccp/annual-review/page.tsx`)
- [ ] 6. Add tests (file: `tests/unit/annualReview.test.ts`)
- [ ] 7. Run `npm run test` — all pass
- [ ] 8. Run `npx tsc --noEmit` — no errors in touched files

## Section 3.4 items (verbatim from MFS-ASR-001)
1. Cleaning schedules in place and followed
2. Cleaning chemicals stored safely
3. Cleaning verification conducted (ATP swabs)
4. Equipment sanitisation effective (82C steriliser)

## Tests (automated)
Section definition:
- 3.4 exists, title = 'Cleaning & Disinfection', 4 items, hasDataPanel = true
- All 4 labels match document verbatim
- buildInitialChecklist includes 3.4 with 4 items, null statuses
- Section order: 3.3 before 3.4, REVIEW_SECTIONS.length >= 4

Data logic (pure, no DB):
- issues filter: count of records where issues = true
- sanitiser_checks: count where sanitiser_temp_c !== null
- low_temp_list: records where sanitiser_temp_c < 82 (strict — 82 exactly passes)
- empty period: total=0, issues_count=0, last_log_date=null — no crash
- what_did_you_do null on issues=true: no crash, fallback text

## Manual smoke tests
- [ ] Open draft review — section 3.4 appears below 3.3
- [ ] Tap data panel header — expands and collapses
- [ ] Panel shows 10 sessions, 2 issues, 5 sanitiser checks (April 2026 data)
- [ ] Issues sub-section shows 2 entries with date and action taken
- [ ] Low sanitiser temps sub-section shows the 79°C reading from 2026-04-21
- [ ] Amber badge visible in collapsed header
- [ ] Tick all 4 checklist items — auto-saves (Saving... appears briefly)
- [ ] Back to list, re-open — ticked items still ticked
- [ ] Review period before April 2026 shows empty state

## Risks
- what_did_you_do null on issues=true: handled with "No action recorded" fallback
- No DB migration needed — read-only
- low_temp_list uses strict < 82 — 82°C exactly is a pass
