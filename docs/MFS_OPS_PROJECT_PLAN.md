# MFS Operations App — Project Plan
**App:** mfsops.com
**Stack:** Next.js 15 / Supabase / Vercel
**Last updated:** 2026-04-25

---

## What's built and live

### HACCP Module
| Section | Status |
|---|---|
| Deliveries (Goods In) | ✅ Live |
| Cold Storage temperatures | ✅ Live |
| Process Room temperatures + Daily Diary | ✅ Live |
| Cleaning log | ✅ Live |
| Calibration log (manual + certified probe) | ✅ Live |
| Mince & Prep production log | ✅ Live |
| Product Returns | ✅ Live |
| Corrective Actions | ✅ Live |
| Weekly + Monthly Reviews | ✅ Live |
| Health & People | ✅ Live |
| Staff Training register (3 modules) | ✅ Live |
| Allergen Awareness training | ✅ Live |

### HACCP Audit Page (/haccp/audit)
| Feature | Status |
|---|---|
| Heatmap (all 11 sections, correct gap logic) | ✅ Live |
| All 11 section tabs with expand rows | ✅ Live |
| Per-section CSV export | ✅ Live |
| Export All XLSX (13 sheets) | ✅ Live |
| 7d / 30d / 90d date filter | ✅ Live |

### Label Printing
| Feature | Status |
|---|---|
| Goods In label (batch code + barcode + fields) | ✅ Live |
| Mince/Prep label (batch code + barcode + use-by) | ✅ Live |
| Use-by dialog (5 options, staff picks at print) | ✅ Live |
| Print button on delivery list cards | ✅ Live |
| Print button on mince run cards | ✅ Live |
| In-app print (no new tab, iframe method) | 🔨 In build |

### Other Modules
| Module | Status |
|---|---|
| Customer map + visit tracking | ✅ Live |
| Cash collection log | ✅ Live |
| Compliments & complaints | ✅ Live |
| Dashboard (KPI grid, alerts) | ✅ Live |
| Customer pricing agreements + PDF export | ✅ Live |
| Warehouse role (Daz) — Kudos + Complaints | ✅ Live |
| Customer list (107 active) | ✅ Live |

---

## In build right now

| Item | Notes |
|---|---|
| In-app print (no new tab) | iframe → window.print() → AirPrint sheet |

---

## Before go-live

| Item | Notes |
|---|---|
| **Data wipe** | Clear all test records — held until everything confirmed working |

---

## Next priorities (post go-live)

### Label printing hardware
- Buy TSC TE310 WiFi (~£160) for Phase 2 — zero code changes needed
- Eventually upgrade to Zebra ZD421d WiFi (~£500) + DS2278 scanner (~£110) for Phase 3
- See docs/LABEL_PRINTING_PLAN.md for full detail

### Scanner integration (Phase 3)
- Source batch field scan mode in mince/prep form
- Needs Zebra DS2278 BT scanner

### Avery Berkel scale integration
- Deferred — need model number from Hakan
- Likely PLU file export approach

### Staff training records
- Add real records for Daz and Adeel
- Currently only test data

### Dispatch log UI
- Not yet built

---

## Tests
- **560 tests passing** across 19 test files
- Run with: `npm run test`
- TS check: `npx tsc --noEmit`

---

## Key references

| Item | Value |
|---|---|
| App URL | https://mfsops.com |
| Supabase project | uqgecljspgtevoylwkep (eu-west-2) |
| Vercel project | prj_84NlryZjHcGlA6R2O6zQ57aWkOFZ |
| GitHub | kilichakan2/MFS-Operations |
| Team | team_WRtx6wNjCoPN95xacOxK6m1e |

---

*See also:*
*- docs/LABEL_PRINTING_PLAN.md — label printing phases and hardware*
*- docs/DOCUMENT_CONTROL.md — HACCP document versioning*
