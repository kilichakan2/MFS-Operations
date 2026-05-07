## Goal
Add Section 3.6 Temperature Control to the annual systems review with three live
data sub-panels: calibration (current state), cold storage (current state), and
delivery temps (period-filtered).

## Compliance
YES — touches HACCP temperature records, calibration records.
No change to temperature limits, legislation references, or training documents.
docs/DOCUMENT_CONTROL.md does not require updating (read-only data panel).

## Full tile audit findings
Every HACCP tile audited before this plan was written:

Calibration tile:
- Two modes: manual (monthly, ice 0°C ±1°C, boiling 100°C ±1°C) or
  certified_probe (annual, logs cert_reference — sufficient for BSD 1.5.4)
- Pass logic: ice_water_pass AND boiling_water_pass for manual; cert logged = pass
- 4 thermometers in DB: Probe 1 (pass), Tegsgst (FAIL), Certified probe test (certified), Test probe (pass)

Cold storage tile:
- Chillers: target ≤5°C, max ≤8°C (legal limit). Status: pass/amber/critical from DB thresholds
- Freezer: target ≤-18°C, max ≤-15°C. -15 is the critical action trigger NOT the legal limit
- All 4 units passing, last reading 04 May 2026

Delivery tile:
- Temp thresholds per category: lamb/beef ≤5°C pass, offal ≤3°C, frozen ≤-18°C, poultry/dairy ≤8°C
- corrective_action_required can be true from temp OR contamination — filter by temp_status != pass for temp CAs
- 15 deliveries all pass temp-wise; 2 have CA from contamination not temperature

Process room tile:
- Room ≤12°C, product ≤4°C. Not included in 3.6 data panel — covered operationally in 3.1 HACCP

Mince/prep tile:
- Input ≤7°C, output chilled ≤2°C/≤4°C, frozen ≤-18°C. Operational data — not in 3.6 panel

BSD 1.5.4: certified probe OR manual calibration both satisfy "calibrated at pre-determined frequency"

## Files to change
- `lib/annualReview/sections.ts` — add section 3.6
- `app/api/haccp/annual-review/data/route.ts` — add 3.6 queries (calibration + cold storage + delivery temps)
- `app/haccp/annual-review/page.tsx` — types, TempControlDataPanel component, render loop wire-up
- `tests/unit/annualReview.test.ts` — section 3.6 definition + data logic tests

## Steps
- [ ] 1. Add section 3.6 to REVIEW_SECTIONS (file: `lib/annualReview/sections.ts`)
- [ ] 2. Add 3.6 queries to data API (file: `app/api/haccp/annual-review/data/route.ts`)
       Sub-panel 1 — Calibration (current state, not period-filtered):
         Latest record per thermometer_id (ORDER BY date DESC, submitted_at DESC, DISTINCT ON thermometer_id)
         Return: [{thermometer_id, calibration_mode, date, cert_reference,
                   ice_water_result_c, ice_water_pass, boiling_water_result_c, boiling_water_pass}]
         Derive passed: certified_probe always passes; manual passes if both ice AND boiling pass
       Sub-panel 2 — Cold storage (current state):
         Latest reading per unit via LATERAL join
         Return: [{name, unit_type, target_temp_c, max_temp_c, temperature_c, temp_status, date}]
       Sub-panel 3 — Delivery temps (period-filtered):
         haccp_deliveries in period, exclude dry_goods
         Return: {total, pass, urgent, fail, temp_cas}
         temp_cas = count where temp_status != 'pass' (NOT corrective_action_required — avoids contamination CAs)
- [ ] 3. Add types and TempControlDataPanel to page (file: `app/haccp/annual-review/page.tsx`)
       Three collapsible sub-panels inside one outer collapsible panel:
         Calibration: per thermometer — mode, date, result summary, pass/fail badge
           certified_probe: "Certified — [cert_ref]" ✅
           manual pass: "Ice [x]°C ✓ · Boiling [x]°C ✓" ✅
           manual fail: "Ice [x]°C ✗ · Boiling [x]°C ✗" 🔴
           not checked in >31 days: 🟡 amber warning
         Cold storage: per unit — name, type, last temp, status badge, last date
           Any non-pass → 🔴
         Delivery temps: summary stats — total / pass / urgent / fail / CAs
           Any fail or urgent → amber badge in sub-panel header
       Amber header badge when any calibration failure OR cold storage failure OR delivery deviations
- [ ] 4. Wire '3.6' in render loop (file: `app/haccp/annual-review/page.tsx`)
- [ ] 5. Add tests (file: `tests/unit/annualReview.test.ts`)
- [ ] 6. Run `npm run test` — all pass
- [ ] 7. Run `npx tsc --noEmit` — no errors in touched files

## Section 3.6 items (BSD 1.5.2, 1.5.4, 1.6.3 compliant, confirmed by Hakan)
1. Temperature monitoring records complete and up to date (cold storage, deliveries, process room)
2. Thermometers calibrated — manual monthly or certified probe in use (BSD 1.5.4)
3. Chillers operating ≤8°C and freezer operating ≤-18°C (legal limits)
4. Delivery temperatures checked at goods-in and recorded (BSD 1.6.3)
5. Temperature deviations investigated, corrective actions documented and resolved
6. Calibration records retained (cert reference or manual test results)

## Tests
Section definition:
- 3.6 exists, title = 'Temperature Control', 6 items, hasDataPanel = true
- All 6 labels verbatim
- buildInitialChecklist includes 3.6 with 6 items, null statuses
- Section order: 3.5 before 3.6

Data logic (pure, no DB):
- Calibration pass logic: certified_probe → always pass; manual → both ice AND boiling must pass
- Days since calibration: > 31 days → amber flag
- Cold storage non-pass detection: any temp_status != 'pass' → alert
- Delivery temp CA counting: uses temp_status != 'pass', NOT corrective_action_required
- Empty period: no crash for all three sub-panels

## Manual smoke tests
- [ ] Section 3.6 appears below 3.5
- [ ] Data panel header shows amber badge (Tegsgst probe is failed in DB)
- [ ] Calibration sub-panel: shows 4 probes — Tegsgst flagged 🔴, certified probe shows cert ref
- [ ] Cold storage sub-panel: 4 units all showing pass and last reading
- [ ] Delivery temps sub-panel: 15 total, all pass, 0 temp CAs
- [ ] All 6 items tick with auto-save
- [ ] Back to list, re-open — items persist

## Risks
- DISTINCT ON for calibration: latest per thermometer_id — must ORDER BY thermometer_id, date DESC
- temp_cas must use temp_status != 'pass' not corrective_action_required (2 contamination CAs would wrongly inflate count)
- Days-since-calibration calculated client-side from date field — timezone safe (date not timestamp)
- No new DB migration needed — read-only
