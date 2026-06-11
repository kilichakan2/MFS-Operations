## Goal
Add Section 3.8 Incidents & Complaints to the annual systems review with a live
data panel showing corrective actions, returns and complaints for the review period.

## Compliance
YES — touches HACCP corrective action, returns and complaints records.
BSD 3.2 (non-conforming materials), BSD 3.3 (corrective action),
BSD 3.5 (managing incidents), BSD 3.6 (complaint handling).
docs/DOCUMENT_CONTROL.md does not require updating.

## Codebase findings (full grill)

Tables audited:
- haccp_corrective_actions: 29 total CAs, 15 open, 14 resolved across
  calibration, cleaning, cold storage, deliveries, mince, processing, returns, reviews
  Fields: source_table, ccp_ref, deviation_description, action_taken,
  resolved (boolean), management_verification_required, verified_by, verified_at
- haccp_returns: 4 records (RC01 x2, RC02 x1, RC04 x1), all resolved CAs
  Fields: return_code, product, customer, disposition, corrective_action
- complaints (NOT haccp_ prefix — separate app table): 21 records
  5 open (4 quality, 1 delivery), 16 resolved
  Fields: category, status, description, received_via, resolution_note
  Lives at /app/complaints/page.tsx — separate from HACCP

MFS-ASR-001 Section 3.8 items (verbatim from document):
1. Complaint handling procedure in place
2. Complaints investigated and closed out
3. Recall procedure documented and tested
4. No outstanding incidents

BSD additional requirements not in the 4 items:
- BSD 3.2: non-conforming materials + damages + returns — covered by returns data
- BSD 3.5.2: incident procedure tested annually — covered by item 3
- BSD 3.5.3: inform SALSA of any recall — manual awareness item

No new tiles needed — all data sources exist.

## Files to change
- `lib/annualReview/sections.ts` — add section 3.8
- `app/api/haccp/annual-review/data/route.ts` — add 3.8 queries
- `app/haccp/annual-review/page.tsx` — SectionData['3.8'], IncidentsDataPanel, render loop
- `tests/unit/annualReview.test.ts` — section 3.8 definition + data logic tests

## Steps
- [ ] 1. Add section 3.8 to REVIEW_SECTIONS (file: `lib/annualReview/sections.ts`)
- [ ] 2. Add 3.8 queries to data API (file: `app/api/haccp/annual-review/data/route.ts`)

       Sub-panel 1 — Corrective actions (period-filtered by submitted_at):
         Query haccp_corrective_actions WHERE submitted_at >= from AND submitted_at <= to
         Return: { total, open, resolved, by_source: [{source_table, count}] }
         Note: use submitted_at (timestamptz) not a date column — cast to date for comparison

       Sub-panel 2 — Returns (period-filtered by date):
         Query haccp_returns WHERE date >= from AND date <= to
         Return: { total, by_code: [{return_code, count}] }
         Return code labels: RC01=Temperature, RC02=Quality, RC03=Wrong product,
         RC04=Short shelf life, RC05=Packaging, RC06=Quantity, RC07=Cancelled, RC08=Other

       Sub-panel 3 — Complaints (period-filtered by created_at):
         Query complaints WHERE created_at >= from AND created_at <= to
         Return: { total, open, resolved }
         Note: complaints table does NOT have haccp_ prefix

- [ ] 3. Add SectionData['3.8'] type (file: `app/haccp/annual-review/page.tsx`)
- [ ] 4. Add IncidentsDataPanel component:
         Collapsible, three sub-panels
         CAs: total / open (amber if > 0) / resolved
         Returns: total + breakdown by return code label
         Complaints: total / open (amber if > 0) / resolved
         Amber header badge when: any open CAs OR any open complaints
- [ ] 5. Wire '3.8' in render loop
- [ ] 6. Add tests (file: `tests/unit/annualReview.test.ts`)
- [ ] 7. Run `npm run test` — all pass
- [ ] 8. Run `npx tsc --noEmit` — no errors in touched files

## Section 3.8 items (verbatim from MFS-ASR-001)
1. Complaint handling procedure in place
2. Complaints investigated and closed out
3. Recall procedure documented and tested
4. No outstanding incidents

## Tests
- 3.8 exists, title = 'Incidents & Complaints', 4 items, hasDataPanel = true
- All 4 labels verbatim
- buildInitialChecklist includes 3.8, null statuses
- Section order: 3.7 before 3.8
- hasAlerts: open CAs or open complaints → true
- Return code label mapping correct
- Empty period: no crash

## Manual smoke tests
- [ ] Section 3.8 appears below 3.7
- [ ] Amber badge visible (15 open CAs across the system)
- [ ] CAs sub-panel: total, open (amber), resolved, source breakdown
- [ ] Returns sub-panel: 4 returns with code labels
- [ ] Complaints sub-panel: 21 total, 5 open (amber), 16 resolved
- [ ] All 4 items tick with auto-save, persist on reopen

## Risks
- CAs use submitted_at (timestamptz) not a date field — filter with
  submitted_at >= from::date AND submitted_at < (to::date + interval '1 day')
  to avoid timezone edge cases
- complaints table is not prefixed haccp_ — different RLS context.
  supabaseService bypasses RLS so this is fine.
- source_table names are long (e.g. 'haccp_cold_storage_temps') —
  map to short labels in the panel
