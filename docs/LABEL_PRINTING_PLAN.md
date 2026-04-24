# MFS Global — Label Printing & Barcode Traceability Plan
**Created:** 2026-04-24  
**Last updated:** 2026-04-24 (self-audit corrections applied)  
**Status:** Phase 1 (Browser Print) — In build  
**Owner:** Hakan Kilic

---

## Overview

Three-phase label printing system for batch traceability across Goods In, Mince/Prep,
and production runs. Labels include a Code 128 barcode so scanners can auto-populate
source batch fields — closing the traceability loop from delivery → production → dispatch.

---

## Hardware Decision

| Phase | Hardware | Cost | Print method | ZPL? |
|---|---|---|---|---|
| 1 | None | £0 | HTML → Safari AirPrint → any printer | HTML render |
| 2 | TSC TE310 WiFi | ~£160 | HTML → Safari AirPrint → TSC (dedicated) | AirPrint |
| 3 | Zebra ZD421d WiFi | ~£500 | ZPL → Cloud Connect WebSocket → Zebra | Native ZPL |
| 3 | + Zebra DS2278 BT scanner | ~£110 | Bluetooth → iPad keyboard emulation | — |

### Why Phase 2 is still browser print (not TCP)

**Important:** Vercel runs in the cloud. A cloud function cannot open a TCP connection
to a printer on your local facility network (private IP 192.168.x.x). NAT/firewall
blocks inbound cloud → local connections. `sendZPLoverTCP` from an API route would
silently fail every time.

Phase 2 is AirPrint from iPad → TSC TE310 WiFi. No server involvement. iPad and printer
are on the same facility WiFi. Works immediately.

**Phase 3 solves this:** Zebra Cloud Connect works because the *printer* initiates an
outbound WebSocket connection to our server. Our server keeps the connection open.
When a print job arrives, ZPL is pushed down the existing connection. NAT is not
an issue because the connection is outbound from the printer.

```
Phase 1/2:  iPad → [HTML] → AirPrint → any/TSC printer
Phase 3:    iPad → [ZPL] → mfsops.com API → Zebra WebSocket → Zebra ZD421d
                                              ↑ printer initiated, stays open
```

### Upgrade path

Phase 1 → Phase 2: Buy TSC TE310, connect to WiFi, staff select it as printer in Safari.
App code unchanged.

Phase 2 → Phase 3: Add Zebra Cloud Connect WebSocket endpoint to API. Add `sendZPL()`
function. Staff tap same button, ZPL goes directly. No HTML render, no print dialog.
ZPL templates were already written in Phase 1 — nothing changes.

---

## Batch Code Format Standards

### Goods In (Deliveries)
Format: `GI-DDMM-SPECIES-NNN`
Example: `GI-2104-LAMB-003`

| Part | Meaning | Example |
|---|---|---|
| `GI` | Goods In prefix | `GI` |
| `DDMM` | Date received | `2104` = 21st April |
| `SPECIES` | Species code | `LAMB` / `BEEF` / `CHICKEN` / `PORK` / `OTHER` |
| `NNN` | Daily sequence | `001`, `002`, `003`... |

**Auto-generation:** Server generates sequence number on delivery submission by querying
`COUNT(*) + 1` of deliveries with same date and species. Shown as read-only preview
on form. User can override if needed.

**Current DB format:** `2104-GB-10` — inconsistent, no prefix, no species. No migration
of old records. New submissions use the standard format going forward.

### Mince / Prep Production
Format: `MINCE-DDMM-SPECIES-NNN` or `PREP-DDMM-SPECIES-NNN`
Example: `MINCE-2104-BEEF-4`

**Status:** Already in use correctly in `haccp_mince_log.batch_code`. No change needed.

---

## Label Designs

All labels: direct thermal, no ink. Code 128 barcode for batch code.

### Label 1 — Goods In
**Size:** 100mm × 60mm  
**Fields from:** `haccp_deliveries`

```
┌─────────────────────────────────┐
│ MFS GLOBAL              GOODS IN│
├─────────────────────────────────┤
│  GI-2104-LAMB-003               │
│  ▐▌▐▐▌▌▐▐▌▐▐▌▌▐▌  (Code 128)  │
├─────────────────────────────────┤
│ Supplier:  Euro Quality Lambs   │
│ Product:   Lamb carcass         │
│ Date in:   21 Apr 2026          │
│ Born in:   UK  Slaughter: Leeds │
│ Received at: 3.8°C ✓           │
├─────────────────────────────────┤
│ STORE AT ≤4°C (FRESH)           │
│ STORE AT ≤-18°C (FROZEN)        │
└─────────────────────────────────┘
```

DB fields used: `batch_number`, `supplier`, `product`, `species`, `date`,
`born_in`, `slaughter_site`, `temperature_c`, `temp_status`

### Label 2 — Mince / Meat Prep Production
**Size:** 100mm × 60mm  
**Fields from:** `haccp_mince_log`

```
┌─────────────────────────────────┐
│ MFS GLOBAL          PRODUCTION  │
│                     MINCE/CHILLED│
├─────────────────────────────────┤
│  MINCE-2104-BEEF-4              │
│  ▐▌▐▐▌▌▐▐▌▐▐▌▌▐▌  (Code 128)  │
├─────────────────────────────────┤
│ Species:   Beef                 │
│ Prod date: 21 Apr 2026          │
│ Kill date: 17 Apr 2026 (4 days) │
│ Source:    2104-GB-3            │
│ Use by:    23 Apr 2026          │
├─────────────────────────────────┤
│ STORE AT ≤4°C                   │
└─────────────────────────────────┘
```

DB fields used: `batch_code`, `product_species`, `output_mode`, `date`,
`kill_date`, `days_from_kill`, `source_batch_numbers`

**Use-by date rules (derived, not stored):**
- Chilled mince: production date + 2 days
- Chilled prep: production date + 3 days
- Frozen mince/prep: production date + 90 days

**Note:** No weight field exists in `haccp_mince_log`. Weight not on label.

---

## Architecture

### File structure

```
lib/
  printing/
    types.ts    — LabelType, LabelData, PrintConfig interfaces
    zpl.ts      — ZPL string generation (Phase 3 + tests)
    html.ts     — HTML label renderer (Phase 1/2 browser print)
    index.ts    — printLabel() abstraction (Phase 1: html, Phase 3: zpl)

app/
  api/
    labels/
      route.ts  — GET /api/labels?type=delivery&id=UUID&format=html|zpl
                  Auth: mfs_role cookie required (warehouse or admin)

  haccp/
    delivery/page.tsx   — add Print button after submission + in history
    mince/page.tsx      — add Print button after submission + in history
```

### API contract

```
GET /api/labels?type=delivery&id=<UUID>&format=html&copies=1

Params:
  type:    'delivery' | 'mince'
  id:      UUID of the record
  format:  'html' (default, Phase 1/2) | 'zpl' (Phase 3)
  copies:  1–50 (default 1)

Auth:    mfs_role cookie (warehouse | admin)
Returns: HTML document or ZPL string (Content-Type accordingly)
Errors:  401 (no/invalid cookie), 404 (record not found), 400 (bad params)
```

### Phase 3 — Zebra Cloud Connect endpoint (not built yet)

```
WebSocket: wss://mfsops.com/api/labels/zebra-connect

Zebra printer connects outbound to this endpoint on startup.
Server keeps connection open.
When print job arrives: server pushes ZPL down the WebSocket.
Printer receives and prints immediately.
No print dialog. No NAT issues.
```

---

## DB Changes

### Phase 1 — Optional tracking

```sql
-- Track how many labels have been printed per record
ALTER TABLE haccp_deliveries
  ADD COLUMN IF NOT EXISTS labels_printed integer DEFAULT 0;

ALTER TABLE haccp_mince_log
  ADD COLUMN IF NOT EXISTS labels_printed integer DEFAULT 0;
```

### Phase 2+ — Printer config

```sql
CREATE TABLE IF NOT EXISTS printer_config (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  method      text NOT NULL DEFAULT 'browser',  -- 'browser' | 'airprint' | 'zebra_cloud'
  zebra_device_id text,   -- for Cloud Connect (Phase 3)
  active      boolean DEFAULT true,
  updated_at  timestamptz DEFAULT now()
);
```

Note: No IP address column needed. AirPrint is handled by the OS, not the app.
Zebra Cloud Connect is identified by device ID, not IP.

---

## Tests to Write

### ZPL generation (lib/printing/zpl.ts)
- `generateZPL('delivery', data)` returns string starting with `^XA`
- Output includes `^BCN` (Code 128 barcode) command
- Batch code appears in barcode data field
- Batch code appears as human-readable text
- All required fields present in output
- ZPL ends with `^XZ`
- Frozen mode sets correct use-by date (+90 days)
- Chilled mince sets use-by to +2 days
- Chilled prep sets use-by to +3 days

### HTML render (lib/printing/html.ts)
- `renderHTMLLabel('delivery', data)` returns valid HTML string
- HTML includes batch code text
- HTML includes `<svg>` or canvas element for barcode
- All required fields rendered
- `copies=3` repeats label 3 times (for printing multiple)

### Batch code format
- `formatGoodsInBatchCode('2104', 'LAMB', 3)` → `GI-2104-LAMB-003`
- `formatGoodsInBatchCode('2104', 'BEEF', 10)` → `GI-2104-BEEF-010`
- Sequence padded to 3 digits
- Species always uppercase
- Invalid species falls back to `OTHER`

### API route
- Returns 401 without mfs_role cookie
- Returns 401 with wrong role (should require warehouse or admin)
- Returns 404 for non-existent delivery ID
- Returns 400 for invalid format param
- Returns HTML content-type for format=html
- Returns text/plain for format=zpl
- Returns correct batch code in response body

### Use-by date calculation
- Chilled mince: production 21 Apr → use-by 23 Apr
- Chilled prep: production 21 Apr → use-by 24 Apr
- Frozen: production 21 Apr → use-by 20 Jul
- Edge case: end of month (30 Apr chilled → 2 May)

---

## Key Constraints

- No ink — direct thermal only across all three printers
- Label size: 100mm × 60mm (both label types)
- Barcode: Code 128 — scannable on damp/cold surfaces
- ZPL generated server-side in the app — no external design software dependency
- iPad first — all flows work from Safari on iPad
- Offline resilient — labels printable from history, HTML render needs no live API

---

## Phase 3 Scanner Integration

When Zebra + DS2278 BT scanner is in use:

- Mince/Prep form: "Source batches" field gets a scan icon
- When active (blue highlight), field captures keyboard input
- Scanner emits batch code as keystrokes ending in Enter
- Each scan appends to `source_batch_numbers` array with green flash
- Duplicate scan prevention: if batch code already in array, warn + skip
- Clear all / remove individual button for mistakes

Scanner setup: pair DS2278 to iPad via Bluetooth Settings (same as keyboard).
No driver, no app — it's a Bluetooth HID device.

---

## Avery Berkel Scale (Future — Not in scope)

Revisit after Phase 3. Need Hakan to confirm model number before any integration
work begins. PLU file export is the likely approach for batch code injection.

---

## Self-audit Log

| Date | Issue | Fix applied |
|---|---|---|
| 2026-04-24 | Phase 2 TCP from cloud → local printer architecturally impossible | Phase 2 revised to AirPrint; TCP path removed; TSC changed to TE310 WiFi |
| 2026-04-24 | Weight field referenced but doesn't exist in haccp_mince_log | Removed from label design |
| 2026-04-24 | Use-by date rules not defined | Added shelf life rules by mode |
| 2026-04-24 | API format parameter not specified | Added format=html|zpl param |
| 2026-04-24 | Auth mechanism not specified | Confirmed: mfs_role cookie, warehouse or admin |
| 2026-04-24 | Batch code auto-generation mechanism undefined | Server-side COUNT+1 query on submit |
| 2026-04-24 | printer_config table had IP column (wrong for AirPrint/Cloud Connect) | Removed IP, added method + zebra_device_id |

---

*Stack: Next.js 15, Supabase (uqgecljspgtevoylwkep), Vercel (prj_84NlryZjHcGlA6R2O6zQ57aWkOFZ)*  
*See also: docs/DOCUMENT_CONTROL.md*
