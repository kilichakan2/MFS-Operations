## Goal
Add a 58mm label template for the Sunmi V3 built-in printer alongside the
existing 100mm template. When printing on the V3, the 58mm template is used.
The 100mm template continues to work for Zebra ZD420.

## Compliance
Labels must still include all BLS mandatory fields:
  born_in / reared_in / slaughter_site / cut_site
  batch code / date / mfs_plant
  allergen declaration (SALSA 1.4.3)

## Codebase findings (full grill)

### Current print stack
- lib/printing/html.ts: single labelCSS() function, @page{size:100mm 75mm}
  .label width:100mm height:75mm — hardcoded throughout
  barcode SVG: barsWidth=260px (fits 100mm)
  all font sizes scaled for 100mm width
- lib/printing/zpl.ts: W=800 H=600 (100mm × 75mm at 203dpi) — no 58mm version needed yet
- lib/printing/types.ts: PrintFormat = 'html' | 'zpl' — no width/size concept
- lib/printing/index.ts: generateLabel() — calls html or zpl, no size param
- app/api/labels/route.ts: accepts format=html|zpl param — no size param
- Delivery page: hardcoded format=html&copies=1
- Mince page: hardcoded format=html&copies=1&usebydays=N
- LABEL_PRINTING_PLAN.md: 100mm × 75mm confirmed, 58mm not mentioned

### Sunmi V3 printer spec (from datasheet + research)
- 58mm paper, effective print width = 48mm = 384px at 203dpi
- Supports ESC/POS label printing
- window.print() works via SunmiPrinterPlugin (installed on device)
- @page { size: 58mm auto } tells browser to use 58mm paper width

### Delivery label fields (current 100mm)
Mandatory (BLS): batch_code, born_in, reared_in, slaughter_site, cut_site, mfs_plant
Required (HACCP): supplier, date, temp, allergens
Total: 8–10 field rows depending on origin consolidation

### Mince label fields (current 100mm)
Mandatory (BLS): batch_code, origins, slaughtered_in, minced_in
Required (HACCP): species, date, kill_date, source batches, use_by, allergens
Total: 8–10 field rows

## Files to change
- `lib/printing/types.ts` — add LabelWidth = '100mm' | '58mm' + update PrintConfig
- `lib/printing/html.ts` — add 58mm CSS + 58mm label renderers (separate functions)
- `lib/printing/index.ts` — pass width through to renderer
- `app/api/labels/route.ts` — accept width=58mm param
- `app/haccp/delivery/page.tsx` — detect device width, use 58mm on narrow screens
- `app/haccp/mince/page.tsx` — same

## Steps
- [ ] 1. types.ts: add LabelWidth type, add width to PrintConfig
- [ ] 2. html.ts: add labelCSS58() + renderDeliveryHTML58() + renderMinceHTML58()
- [ ] 3. index.ts: route width to correct renderer
- [ ] 4. api/labels/route.ts: accept ?width=58mm param (default: 100mm)
- [ ] 5. delivery/page.tsx: auto-detect device — use 58mm if screen ≤ 480px
- [ ] 6. mince/page.tsx: same auto-detect
- [ ] 7. npm run test — all pass
- [ ] 8. npx tsc --noEmit — clean

## Key design principle (confirmed by Hakan)
The barcode contains the batch code — scanning it retrieves all data from the system.
The label only needs to be human-readable enough to identify the box at a glance.
Full details (BLS, temp records, supplier details) are in the DB, not needed on label.

## Supplier label codes — already seeded in DB
Migration applied: haccp_suppliers.label_code text column added.
All 43 active suppliers seeded with codes. Key meat suppliers:
  CFF, DBF, DUNB, ENDE, FFT, HTM, JBS, KPK, LIFF, PICK, TCM, TMC
  MVF (chicken), VRK, NFF
Fallback for new suppliers: LEFT(name, 4) — applied automatically in template.
Admin tile: label_code field to be added so Emre can set codes for new suppliers.

## Files to change (updated)
- DB migration: haccp_suppliers add label_code text
- `lib/printing/types.ts` — add LabelWidth, update PrintConfig
- `lib/printing/html.ts` — add 58mm CSS + renderers
- `lib/printing/index.ts` — pass width through
- `app/api/labels/route.ts` — accept width param + fetch supplier label_code
- `app/haccp/admin/page.tsx` — add label_code field to supplier edit form
- `app/haccp/delivery/page.tsx` — two print buttons (58mm / 100mm)
- `app/haccp/mince/page.tsx` — two print buttons in use-by dialog

## 58mm delivery label — minimal fields
  Header: MFS · GOODS IN · SPECIES
  Batch code (large, bold)
  Barcode (150px)
  ────────────────
  Supplier: EQL
  Date: 08 May 2026
  Temp: 3.2°C ✓
  Born: GB · Slaught: GB1234
  Cut: UK2946 (MFS plant)
  Allergens: None

## 58mm mince label — minimal fields
  Header: MFS · PRODUCTION · MINCE/CHILLED
  Batch code (large, bold)
  Barcode (150px)
  ────────────────
  Species: LAMB
  Date: 08 May 2026
  Use by: 15 May 2026 (bold)
  Born: GB · Minced: GB
  Allergens: None

## Delivery page print button change
Current: single print icon button → `printLabelInApp(...&format=html&copies=1)`
New: two small buttons side by side:
  [🖨 100mm]  [🖨 58mm]
  58mm button → appends &width=58mm
  100mm button → appends &width=100mm (or omit)
Same placement — right side of each delivery card + detail view

## Mince page print button change
Current: use-by dialog → single Print button
New: use-by dialog → two Print buttons:
  [Print 100mm]  [Print 58mm]
  Same use-by selection, different width param

## Tests
- npm run test 975 must still pass
- No new pure logic to unit test (HTML rendering)
- Type check clean on all touched files

## Manual smoke tests (when V3 arrives)
- [ ] Print on V3 (480px screen) → 58mm template used automatically
- [ ] Print on iPad/desktop → 100mm template used
- [ ] 58mm delivery label: all BLS fields present, barcode scannable
- [ ] 58mm mince label: use-by bold, allergens present
- [ ] 100mm labels unchanged

## Risks
- 58mm is very narrow — all fields must fit. Key risk: long supplier names truncated.
  Mitigation: truncate supplier+product to 28 chars in 58mm template only.
- screen.width 720px on V3 — NOT ≤ 480px. Auto-detect by screen.width won't work.
  Better approach: add explicit ?width= param in URL + manual toggle on print button.
  OR detect via window.screen.width < 768 (catches V3 at 720px).
  Need to decide threshold before implementing.
- height: auto on 58mm means label length varies by content — fine for gap/black mark labels.
  Test with actual label stock to confirm gap detection works.

## Auto-detect decision — Option B: Manual toggle on print button
Two buttons on print: "Print (58mm)" and "Print (100mm)"
  - "Print (58mm)" → appends &width=58mm to URL
  - "Print (100mm)" → appends &width=100mm (or omit, default)
No auto-detection. Daz picks the right one for the device he's on.
On delivery page: both buttons shown alongside existing print button
On mince page: both options in the use-by dialog
