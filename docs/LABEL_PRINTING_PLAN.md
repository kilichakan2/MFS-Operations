# MFS Global — Label Printing & Barcode Traceability Plan
**Created:** 2026-04-24  
**Status:** Phase 1 (Browser Print) — In build  
**Owner:** Hakan Kilic

---

## Overview

Three-phase label printing system for batch traceability across Goods In, Mince/Prep, and production runs. Labels include a Code 128 barcode so scanners can auto-populate batch fields — closing the traceability loop from delivery → production → dispatch.

---

## Hardware Decision

**Pilot:** Browser print only (£0 — works from iPad via AirPrint)  
**Budget hardware:** TSC TE210 with Ethernet (~£130) — ZPL-native, plug into network  
**Production:** Zebra ZD421d WiFi 203dpi (~£500) + Zebra DS2278 BT scanner (~£110)

**Why upgrading is trivial:** Both TSC and Zebra accept raw ZPL over TCP port 9100. Same ZPL string, different IP. Upgrade = change one setting in the app.

---

## Batch Code Format Standards

Consistent formats enable clean barcode scanning and meaningful traceability.

### Goods In (Deliveries)
`GI-DDMM-SPECIES-NNN`  
Example: `GI-2104-LAMB-003`  
- `GI` = Goods In prefix
- `DDMM` = date received (2104 = 21st April)
- `SPECIES` = LAMB / BEEF / CHICKEN / PORK / OTHER
- `NNN` = sequence number for that day (001, 002, 003...)

**Current format in DB:** `2104-GB-10` — inconsistent, no GI prefix, no species. Migration needed to encourage new format going forward (old records unchanged).

### Mince / Prep Production
`MINCE-DDMM-SPECIES-NNN` or `PREP-DDMM-SPECIES-NNN`  
Example: `MINCE-2104-BEEF-4`  
**Current format already correct** — already in use in `haccp_mince_log.batch_code`.

### Future (other production runs)
`PROD-DDMM-PRODUCT-NNN`

---

## Label Designs

### Label 1 — Goods In (Delivery)
**Size:** 100mm × 60mm (or 57mm × 32mm for smaller boxes)  
**Contents:**
- MFS Global logo/name (top)
- GOODS IN header
- Batch code (large, bold, monospace)
- Code 128 barcode encoding the batch code
- Supplier name
- Product + Species
- Date received
- Origin (Born in / Slaughter site)
- Delivery temp (°C)
- "Store at ≤4°C / ≤-18°C (frozen)"

### Label 2 — Mince / Meat Prep Production
**Size:** 100mm × 60mm  
**Contents:**
- MFS Global logo/name (top)
- PRODUCTION header + mode (MINCE / PREP / CHILLED / FROZEN)
- Batch code (large, bold, monospace)
- Code 128 barcode
- Product + Species
- Production date
- Kill date + Days from kill
- Source batch numbers
- "Store at ≤4°C" / "Store at ≤-18°C"
- Use-by date (production date + shelf life by mode)

### Label 3 — Generic Production
**Size:** 100mm × 60mm  
**Contents:**
- MFS Global
- Batch code + barcode
- Product description
- Date
- Storage instructions

---

## Architecture — Printer Abstraction Layer

```typescript
// lib/printing/index.ts
type PrintMethod = 'browser' | 'network'

interface PrintConfig {
  method: PrintMethod
  printerIP?: string   // for network printing
  port?: number        // default 9100 (ZPL standard)
}

// Generates ZPL string from label data — same output for all phases
function generateZPL(labelType: LabelType, data: LabelData): string

// Renders ZPL data as styled HTML — for browser print phase
function renderHTMLLabel(labelType: LabelType, data: LabelData): string

// Delivers the label — method switches without changing ZPL
async function printLabel(labelType: LabelType, data: LabelData, config: PrintConfig): Promise<void>
```

The ZPL is generated once. The delivery method is a config switch.

---

## Phase 1 — Browser Print (Build Now)

**Cost:** £0 hardware  
**Works on:** iPad via AirPrint to any printer on WiFi

### What gets built
- `lib/printing/zpl.ts` — ZPL generation for all label types
- `lib/printing/html.ts` — HTML render of same label data
- `lib/printing/index.ts` — abstraction layer
- `app/api/labels/route.ts` — API to generate ZPL or HTML for a given record
- Print button on Delivery records (after submission or from history)
- Print button on Mince/Prep records (after submission or from history)
- Print count selector (how many labels to print — one per box)
- Label preview modal before printing

### Browser print flow
1. Staff submits delivery / mince record
2. "Print label" button appears (or available from history)
3. Staff selects number of labels needed
4. App renders HTML label
5. Safari print sheet opens (AirPrint)
6. Labels print on any AirPrint printer

### No DB changes needed for Phase 1
All label data comes from existing fields on `haccp_deliveries` and `haccp_mince_log`.

---

## Phase 2 — Network Print via TSC TE210 (Budget Hardware)

**Hardware:** TSC TE210 — Ethernet, 203dpi, ZPL-native, ~£130  
**Connection:** Ethernet cable to facility network router

### What changes vs Phase 1
- Add printer IP to app settings (admin configurable)
- `lib/printing/index.ts` gains `sendZPLoverTCP(zpl, ip, port=9100)` function
- Staff tap "Print label" — ZPL sent directly over TCP to printer
- No browser print dialog — prints immediately
- ZPL templates unchanged from Phase 1

### Setup (one-time, ~10 minutes)
1. Plug TSC TE210 into router via ethernet
2. Print test page to get printer's IP address
3. Enter IP in MFS Ops app settings → Printer IP
4. Test print from a delivery record

---

## Phase 3 — Zebra ZD421d WiFi (Production)

**Hardware:** Zebra ZD421d WiFi 203dpi + ZD421d-WLN module (~£500) + DS2278 BT scanner (~£110)

### What changes vs Phase 2
- Change printer IP in settings to Zebra's IP
- Optionally: migrate from TCP to Zebra Cloud Connect (WebSocket)
- ZPL templates completely unchanged
- Scanner integration: source batch fields become scan-ready

### Scanner integration (Phase 3)
- Source batch number field in Mince/Prep form gets a "scan mode" button
- When active, field listens for keyboard input (scanner = wireless keyboard)
- Staff scans barcode on delivery box → field auto-populates with batch code
- Multiple boxes: scan each one, they append to the source_batch_numbers array
- Visual confirmation with green flash on each scan

### Upgrade from Phase 2 to Phase 3
1. Connect Zebra to facility WiFi
2. Update printer IP in app settings
3. Done — ZPL templates unchanged, scanning adds a new feature

---

## DB Changes Required

### Phase 1
None — all label data from existing fields.

### Before Phase 1 goes live
Add `print_count` tracking (optional — to know how many labels were printed per batch):

```sql
ALTER TABLE haccp_deliveries
  ADD COLUMN IF NOT EXISTS labels_printed integer DEFAULT 0;

ALTER TABLE haccp_mince_log
  ADD COLUMN IF NOT EXISTS labels_printed integer DEFAULT 0;
```

### Phase 2+
```sql
-- Printer config table (admin-managed)
CREATE TABLE IF NOT EXISTS printer_config (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,           -- e.g. "Process Room Printer"
  method      text NOT NULL DEFAULT 'browser', -- 'browser' | 'network'
  ip_address  text,
  port        integer DEFAULT 9100,
  active      boolean DEFAULT true,
  updated_at  timestamptz DEFAULT now()
);
```

---

## Files to Create (Phase 1)

```
lib/
  printing/
    zpl.ts          — ZPL template generation (all label types)
    html.ts         — HTML label render (browser print fallback)
    index.ts        — abstraction layer / printLabel() function
    types.ts        — LabelType, LabelData, PrintConfig interfaces

app/
  api/
    labels/
      route.ts      — GET ?type=delivery&id=UUID → ZPL or HTML

  haccp/
    delivery/
      page.tsx      — add Print button (already has batch_number field)
    mince/
      page.tsx      — add Print button (already has batch_code field)
```

---

## Tests to Write

- `generateZPL('goods_in', data)` produces valid ZPL with correct fields
- `generateZPL` includes `^BC` (Code 128) barcode command
- `renderHTMLLabel` produces HTML with batch code and all required fields
- Batch code format validator: `GI-DDMM-SPECIES-NNN` pattern
- Print count defaults to 1, accepts 1-50
- API returns 401 for non-authenticated users
- API returns correct ZPL when given valid delivery ID
- API returns 404 for unknown ID

---

## Key Constraints

- **No ink ever** — direct thermal only (all three printers)
- **Label size:** 100mm × 60mm primary, 57mm × 32mm secondary (smaller boxes)
- **Barcode:** Code 128 — industry standard, scannable even on slightly damp labels
- **ZPL:** Generated in the app — not dependent on external label design software
- **iPad first** — all print flows work from Safari on iPad
- **Offline resilient** — labels can be printed from history even if currently offline (HTML render)

---

## Avery Berkel Scale (Future)

Not in scope for Phases 1-3. Once Zebra is live, revisit PLU file export option.  
Model needed before integration can be planned. Hakan to confirm model number.

---

*See also: docs/DOCUMENT_CONTROL.md for HACCP document versioning*  
*Stack: Next.js 15, Supabase (uqgecljspgtevoylwkep), Vercel (prj_84NlryZjHcGlA6R2O6zQ57aWkOFZ)*
