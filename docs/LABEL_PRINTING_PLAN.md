# MFS Global — Label Printing & Barcode Traceability Plan
**Created:** 2026-04-24
**Last updated:** 2026-04-24 (confirmed decisions from Hakan applied)
**Status:** Stage 1 (Goods In label) — In build
**Owner:** Hakan Kilic

---

## Overview

Three-phase label printing system for batch traceability across Goods In,
Mince/Prep, and production runs. Labels include a Code 128 barcode so scanners
can auto-populate source batch fields — closing the traceability loop from
delivery → production → dispatch.

---

## Hardware Decision

| Phase | Hardware | Cost | Print method |
|---|---|---|---|
| 1 | None | £0 | HTML → Safari AirPrint → any printer |
| 2 | TSC TE310 WiFi | ~£160 | HTML → Safari AirPrint → TSC (dedicated) |
| 3 | Zebra ZD421d WiFi | ~£500 | ZPL → Cloud Connect WebSocket → Zebra |
| 3 | + Zebra DS2278 BT scanner | ~£110 | Bluetooth → iPad keyboard emulation |

**Why Phase 2 stays browser/AirPrint:** Vercel runs in the cloud and cannot
open TCP connections to a printer on the local facility network. AirPrint from
iPad → TSC TE310 WiFi requires no server involvement. Both devices are on the
same facility WiFi.

**Phase 3 (Zebra Cloud Connect):** The printer initiates an outbound WebSocket
to our server. Server keeps the connection open. Print job is pushed down it.
NAT is not an issue because the connection is outbound from the printer.

---

## Label Size — Standard Across All Phases

**100mm × 50mm** (confirmed — works on all three hardware phases)

- Phase 1: Set as custom paper size once in iOS Settings
- Phase 2: TSC TE310 supports up to 104mm width ✓
- Phase 3: Zebra ZD421d supports up to 104mm width ✓
- Standard 100mm rolls are widely available and cheap

---

## Batch Code Format

### Goods In
**Keep existing format** — confirmed by Hakan. No change.
Current format in DB: `2104-GB-10` (date + origin + sequence)

### Mince / Prep
**Keep existing format** — confirmed by Hakan. No change.
Current format: `MINCE-2104-BEEF-4` / `PREP-2104-LAMB-1`

---

## Stage 1 — Goods In Label (confirmed)

**Fields on label (confirmed):**
- MFS Global name
- "GOODS IN" header
- Batch code (large, bold, monospace)
- Code 128 barcode (encodes the batch code)
- Supplier
- Product + Species
- Date received
- Origin: Born in + Slaughter site (when available)

**NOT on label (confirmed):**
- Storage instruction — not an FSA requirement for goods-in, not needed
- Delivery temperature — not needed on the label

**Label layout (100mm × 50mm):**
```
┌──────────────────────────────────────┐
│ MFS GLOBAL                 GOODS IN  │
├──────────────────────────────────────┤
│  2104-GB-10                          │
│  ▐▌▐▐▌▌▐▐▌▐▐▌▌▐▌  (Code 128)       │
├──────────────────────────────────────┤
│ Supplier:  Euro Quality Lambs        │
│ Product:   Lamb carcass (Lamb)       │
│ Date:      21 Apr 2026               │
│ Origin:    UK / Leeds                │
└──────────────────────────────────────┘
```

---

## Stage 2 — Mince / Prep Production Label (confirmed)

**Fields on label (confirmed):**
- MFS Global name
- "PRODUCTION" header + mode (MINCE / PREP + CHILLED / FROZEN)
- Batch code (large, bold, monospace)
- Code 128 barcode
- Product + Species
- Production date
- Kill date + Days from kill
- Source batch numbers

**Use-by date — picked at print time (confirmed):**
Staff select use-by policy when they tap Print. Quick-select buttons:
- Fresh 7 days
- Fresh 10 days
- Fresh 14 days
- Frozen 3 months
- Frozen 6 months

The chosen date is shown on the label but NOT stored in the database record
(FSA requires use-by on the label, not on the system record).

**Same buttons apply for Prep cuts.**

**NOT on label:**
- Storage instruction — removed per Hakan

**Label layout (100mm × 50mm):**
```
┌──────────────────────────────────────┐
│ MFS GLOBAL              MINCE/CHILLED│
├──────────────────────────────────────┤
│  MINCE-2104-BEEF-4                   │
│  ▐▌▐▐▌▌▐▐▌▐▐▌▌▐▌  (Code 128)       │
├──────────────────────────────────────┤
│ Species:   Beef                      │
│ Prod date: 21 Apr 2026               │
│ Kill date: 17 Apr 2026 (4 days)      │
│ Source:    2104-GB-3, 2104-GB-5      │
│ Use by:    28 Apr 2026               │
└──────────────────────────────────────┘
```

---

## Stage 3 — Print button placement

Location on delivery and mince pages TBC — Hakan to confirm.
Currently added next to batch code in delivery detail and on mince history cards.

---

## Stage 4 — Scanner integration (Phase 3 only)

When Zebra ZD421d + DS2278 BT scanner is live:
- Source batch field in mince/prep form gets scan mode
- Scanner acts as Bluetooth keyboard, types batch code into focused field
- Each scan appends to source_batch_numbers array
- Visual confirmation (green flash) per scan
- Duplicate detection — warns if same batch already added

---

## Architecture

### Files
```
lib/
  printing/
    types.ts    — interfaces (LabelType, LabelData, PrintConfig etc)
    zpl.ts      — ZPL generation for Phase 3
    html.ts     — HTML label renderer for Phase 1/2 browser print
    index.ts    — printLabel() abstraction

app/
  api/
    labels/
      route.ts  — GET /api/labels?type=delivery|mince&id=UUID&format=html|zpl&copies=1
```

### API contract
```
GET /api/labels?type=delivery&id=<UUID>&format=html&copies=1

For mince with use-by:
GET /api/labels?type=mince&id=<UUID>&format=html&copies=1&usebydays=7

Auth:    mfs_role cookie (warehouse | butcher | admin)
Returns: HTML (Phase 1/2) or ZPL text (Phase 3)
Errors:  400 bad params, 401 unauth, 404 not found
```

**`usebydays` param (mince/prep only):**
Passed from the print dialog when staff select a use-by option.
The API calculates the date (production date + N days) and includes it on the label.
Not stored in the database.

---

## DB Changes

### Phase 1 — No DB changes required
All label data comes from existing fields.

### Phase 2+ (future)
```sql
-- Optional: track print count per record
ALTER TABLE haccp_deliveries
  ADD COLUMN IF NOT EXISTS labels_printed integer DEFAULT 0;
ALTER TABLE haccp_mince_log
  ADD COLUMN IF NOT EXISTS labels_printed integer DEFAULT 0;

-- Printer config (when network printing needed)
CREATE TABLE IF NOT EXISTS printer_config (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL,
  method         text NOT NULL DEFAULT 'browser',
  zebra_device_id text,
  active         boolean DEFAULT true,
  updated_at     timestamptz DEFAULT now()
);
```

---

## Self-audit Log

| Date | Issue | Fix |
|---|---|---|
| 2026-04-24 | Phase 2 TCP cloud→local printer impossible | Phase 2 stays AirPrint; TSC → TE310 WiFi |
| 2026-04-24 | Weight field on mince label — column doesn't exist | Removed |
| 2026-04-24 | Use-by dates assumed without asking Hakan | Removed from auto-calc. Staff pick at print time |
| 2026-04-24 | Storage instruction assumed for goods-in | Removed — not FSA required for goods-in |
| 2026-04-24 | Batch code format change proposed unnecessarily | Keep existing formats — confirmed by Hakan |
| 2026-04-24 | Label size assumed | Confirmed 100mm × 50mm — works across all 3 phases |

---

*Stack: Next.js 15, Supabase (uqgecljspgtevoylwkep), Vercel (prj_84NlryZjHcGlA6R2O6zQ57aWkOFZ)*
*See also: docs/DOCUMENT_CONTROL.md*
