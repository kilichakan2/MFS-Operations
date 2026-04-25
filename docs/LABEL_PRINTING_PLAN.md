# MFS Global — Label Printing & Barcode Traceability Plan
**Created:** 2026-04-24
**Last updated:** 2026-04-25
**Status:** Phase 1 complete. In-app print (no new tab) in build.
**Owner:** Hakan Kilic

---

## Summary of current state

Phase 1 is fully built and working. Both label types (Goods In and Mince/Prep)
print correctly. The remaining Phase 1 item is removing the "new tab" step so
staff tap Print and the iOS print sheet appears directly.

---

## Hardware Phases

| Phase | Hardware | Cost | Print method | Status |
|---|---|---|---|---|
| 1 | None | £0 | iframe → window.print() → AirPrint | ✅ Complete (in-app print in build) |
| 2 | TSC TE310 WiFi | ~£160 | Same as Phase 1, dedicated label printer | 🔲 Buy hardware |
| 3 | Zebra ZD421d WiFi + DS2278 scanner | ~£610 | ZPL → Cloud Connect WebSocket | 🔲 Future |

**Phase 1 → Phase 2 upgrade:** Buy TSC TE310 WiFi, connect to facility WiFi,
select as AirPrint printer in iOS print sheet. Zero code changes.

**Phase 2 → Phase 3 upgrade:** Add Zebra Cloud Connect WebSocket endpoint.
Change one config. ZPL templates unchanged.

---

## Label Size

**100mm × 50mm** — confirmed, works on all phases.
- TSC TE310 max width: 104mm ✓
- Zebra ZD421d max width: 104mm ✓

---

## Batch Code Formats — unchanged

| Type | Format | Example |
|---|---|---|
| Goods In | `DDMM-ORIGIN-NNN` | `2104-GB-10` |
| Mince | `MINCE-DDMM-SPECIES-NNN` | `MINCE-2104-BEEF-4` |
| Prep | `PREP-DDMM-SPECIES-NNN` | `PREP-2104-LAMB-1` |

---

## Label Designs — confirmed

### Goods In label
Fields: MFS Global · GOODS IN · Batch code · Code 128 barcode (with number) ·
Supplier · Product + Species · Date received · Origin (born/slaughter)

NOT on label: storage instruction, delivery temperature

### Mince / Prep label
Fields: MFS Global · PRODUCTION · MODE (e.g. MINCE/CHILLED) · Batch code ·
Code 128 barcode (with number) · Species · Production date · Kill date + days ·
Source batches · Use-by date

Use-by: staff picks at print time — Fresh 7d / 10d / 14d, Frozen 3mo / 6mo.
Not stored in DB — label only.

NOT on label: storage instruction

---

## In-app Print — Phase 1 (no new tab)

**How it works:**
```
Staff taps Print
  → App fetches /api/labels?... (background fetch, no navigation)
  → Response HTML injected into hidden <iframe>
  → iframe.contentWindow.print() called
  → iOS native AirPrint sheet appears
  → Staff selects printer, prints
  → iframe removed from DOM
```

Works on: desktop browser, iOS Safari, iOS PWA standalone mode.
No new tab. No navigation away from the app.

**Shared utility:** `printLabelInApp(url: string)` in each page — handles
fetch, iframe creation, print trigger, cleanup.

---

## Print Button Placement — confirmed

| Page | Location | Status |
|---|---|---|
| Goods In | Right column of each delivery card in list | ✅ Done |
| Goods In | Also next to batch code in detail view | ✅ Done |
| Mince/Prep | Right column of each run card | ✅ Done — use-by dialog first |

---

## Scanner Integration — Phase 3 only

When Zebra ZD421d + DS2278 BT scanner purchased:
- Source batch field in mince/prep form gets scan mode
- DS2278 pairs to iPad via Bluetooth as keyboard
- Scan barcode on box → batch code typed into field
- Each scan appends to source_batch_numbers array
- Green flash confirmation, duplicate detection

---

## Architecture

```
lib/printing/
  types.ts   — LabelType, DeliveryLabelData, MinceLabelData, PrintConfig
  zpl.ts     — ZPL generation (Phase 3) + calculateUseByFromDays + fmtDisplayDate
  html.ts    — HTML label renderer, Code 128 SVG barcode with human-readable text
  index.ts   — generateLabel() abstraction (html Phase 1/2, zpl Phase 3)

app/api/labels/route.ts
  GET /api/labels?type=delivery|mince&id=UUID&format=html|zpl&copies=1
  Mince only: &usebydays=7|10|14|90|182
  Auth: x-mfs-user-role header (injected by middleware)
  Roles: warehouse | butcher | admin
```

---

## DB Changes

### Phase 1 — none required ✅

### Phase 2+ — optional
```sql
ALTER TABLE haccp_deliveries ADD COLUMN IF NOT EXISTS labels_printed integer DEFAULT 0;
ALTER TABLE haccp_mince_log  ADD COLUMN IF NOT EXISTS labels_printed integer DEFAULT 0;

CREATE TABLE IF NOT EXISTS printer_config (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  method          text NOT NULL DEFAULT 'browser',
  zebra_device_id text,
  active          boolean DEFAULT true,
  updated_at      timestamptz DEFAULT now()
);
```

---

## Avery Berkel Scale — deferred

Revisit after Phase 3. Model number needed from Hakan before any
integration work begins. PLU file export is the likely approach.

---

## Self-audit Log

| Date | Issue | Fix |
|---|---|---|
| 2026-04-24 | Phase 2 TCP cloud→local printer impossible | Phase 2 stays AirPrint |
| 2026-04-24 | Weight field on mince label — column doesn't exist | Removed |
| 2026-04-24 | Use-by dates assumed | Staff picks at print time |
| 2026-04-24 | Storage instruction assumed | Removed — not FSA required |
| 2026-04-24 | Batch code format change proposed | Keep existing — confirmed |
| 2026-04-24 | Label size assumed | Confirmed 100mm × 50mm |
| 2026-04-24 | CHILLED/FROZEN on mince label | Confirmed — in header |
| 2026-04-24 | Label size in CSS was 60mm | Corrected to 50mm |
| 2026-04-24 | window.open() blocked in iOS PWA | Replaced with anchor click |
| 2026-04-24 | /api/labels missing from middleware | Added to SHARED_API_PATHS |
| 2026-04-24 | Auth read mfs_role cookie (wrong) | Fixed to x-mfs-user-role header |
| 2026-04-25 | New tab print — poor UX, blocked in some PWA contexts | iframe in-app print |
