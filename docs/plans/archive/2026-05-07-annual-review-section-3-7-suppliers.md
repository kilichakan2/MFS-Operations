## Goal
Add Section 3.7 Supplier Control & Traceability to the annual systems review with a
live data panel showing supplier register status and goods-in period activity.

## Compliance
YES — touches HACCP supplier and delivery records.
BSD 1.6.1, 1.6.2, 1.6.3, 3.4.1, 3.4.2, 3.4.3 + EC 853/2004 (BLS)
docs/DOCUMENT_CONTROL.md does not require updating (read-only data panel).

## Codebase findings (full grill)

Tiles audited:
- admin/page.tsx: haccp_suppliers — date_approved, fsa_approval_no, cert_type,
  cert_expiry, categories all exist. date_approved in form but null for all 43 suppliers.
  Admin API at /api/haccp/admin/suppliers selects all fields.
- delivery/page.tsx: MEAT_CATEGORIES = Set(['lamb','beef','red_meat','offal','frozen_beef_lamb'])
  batch_number, born_in, reared_in, slaughter_site, cut_site captured per delivery.
  DB confirms: 17 total deliveries, 17 with batch, 13 meat, 13 BLS complete.
- mince/page.tsx: source_batch_numbers + source_delivery_ids link production to goods-in.
- recall/page.tsx: no traceability exercise log — BSD 3.4.2 mock recall is manual.
- audit/page.tsx: exports BLS fields in CSV — audit trail exists.
- reviews/page.tsx: weekly check has 'supplier_certs' item.
- product-specs: GET returns specs array + review_due_count. Currently 0 specs.
- annual-review data API: 3.6 is the latest section. No 3.7 queries yet.
- SectionData type: no '3.7' key yet.
- Render loop: 3.6 is last wired panel.

DB state:
- 43 active suppliers, 0 date_approved, 2 FSA approved, 0 expired, 1 cert_no_expiry_date
- 17 deliveries all have batch numbers, 13/13 meat deliveries BLS complete

## Files to change
- `lib/annualReview/sections.ts` — add section 3.7
- `app/api/haccp/annual-review/data/route.ts` — add 3.7 queries
- `app/haccp/annual-review/page.tsx` — SectionData['3.7'] type, SupplierDataPanel, render loop
- `tests/unit/annualReview.test.ts` — section 3.7 definition + data logic tests

## Steps
- [ ] 1. Add section 3.7 to REVIEW_SECTIONS (file: `lib/annualReview/sections.ts`)
- [ ] 2. Add 3.7 queries to data API (file: `app/api/haccp/annual-review/data/route.ts`)

       Sub-panel 1 — Supplier register (current state, not period-filtered):
         Query haccp_suppliers WHERE active = true
         Return: {
           total, formally_approved (date_approved IS NOT NULL),
           fsa_approved (fsa_approval_no IS NOT NULL and != ''),
           expired_certs (cert_expiry < today),
           expiring_60_days (cert_expiry BETWEEN today AND today+60),
           product_specs_count, product_specs_review_due
         }
         product_specs_count + review_due: fetch from haccp_product_specs
         (avoids duplicate API call — bundle into 3.7 data)

       Sub-panel 2 — Goods-in period activity (period-filtered):
         Query haccp_deliveries WHERE date >= from AND date <= to
         Return: {
           total, has_batch (batch_number IS NOT NULL),
           meat_total (in MEAT_CATEGORIES),
           meat_bls_complete (born_in + slaughter_site + cut_site all set),
         }
         MEAT_CATEGORIES = ['lamb','beef','red_meat','offal','frozen_beef_lamb']

- [ ] 3. Add SectionData['3.7'] type to page (file: `app/haccp/annual-review/page.tsx`)
- [ ] 4. Add SupplierDataPanel component — collapsible, two sub-panels:
         Supplier register sub-panel:
           - Total active: N
           - Formally approved: N/43 (amber if < total)
           - FSA approved: N
           - Expired certs: N (red if > 0)
           - Expiring within 60 days: N (amber if > 0)
           - Product specs: N on file, N review due (amber if review_due > 0)
         Goods-in sub-panel (period):
           - Total deliveries: N
           - Batch numbers: N/N (should always be 100%)
           - Meat deliveries BLS complete: N/N (red if any incomplete)
         Amber header badge when: any expired certs, any expiring soon,
           formally_approved < total, any BLS incomplete, any spec review due
- [ ] 5. Wire '3.7' in render loop
- [ ] 6. Add tests (file: `tests/unit/annualReview.test.ts`)
- [ ] 7. Run `npm run test` — all pass
- [ ] 8. Run `npx tsc --noEmit` — no errors in touched files

## Section 3.7 items (BSD 1.6 + BSD 3.4 + FSA compliant, confirmed by Hakan)
1. Approved supplier list maintained — all active suppliers risk assessed and date approved recorded
2. Product specifications held for all supplied products and reviewed (BSD 1.6.2)
3. Supplier certificates current — FSA approval numbers and third-party certs on file where applicable
4. Goods-in checks completed at every delivery — temp, condition, batch number and documentation
5. BLS traceability data recorded at intake for all red meat and offal (EC 853/2004)
6. Traceability test conducted — mock recall completed forward and backward (BSD 3.4.2)

## Tests (automated)
- 3.7 exists, title = 'Supplier Control & Traceability', 6 items, hasDataPanel = true
- All 6 labels verbatim
- buildInitialChecklist includes 3.7
- Section order: 3.6 before 3.7
- REVIEW_SECTIONS.length >= 7
- BLS completeness logic: meat_bls_complete < meat_total → incomplete flag
- Formally approved < total → flag

## Manual smoke tests
- [ ] Section 3.7 appears below 3.6
- [ ] Supplier register sub-panel: 43 total, 0/43 formally approved (amber), 2 FSA approved
- [ ] 0 product specs on file (amber until specs added)
- [ ] Goods-in sub-panel: 17 deliveries, 17/17 batch numbers, 13/13 BLS complete (green)
- [ ] Amber header badge visible (0 formally approved)
- [ ] All 6 items tick with auto-save
- [ ] Back to list, re-open — items persist

## Risks
- product_specs data bundled into 3.7 query avoids extra API call but creates coupling
  If product_specs fetch fails, 3.7 still returns partial data — handle gracefully
- formally_approved = 0 for all 43 suppliers — this will always show amber
  until date_approved is populated in Admin. This is intentional — it's a gap to fix.
- MEAT_CATEGORIES must match delivery/page.tsx exactly:
  ['lamb','beef','red_meat','offal','frozen_beef_lamb']
- reared_in is optional for BLS — born_in + slaughter_site + cut_site are the three mandatory fields
