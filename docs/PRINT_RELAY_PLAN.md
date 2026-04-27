# MFS Global — ZPL Print Relay Plan
**Created:** 2026-04-27
**Status:** Parked — build when ZD420 arrives
**Owner:** Hakan Kilic

---

## Hardware Purchased

**Zebra ZD420 Refurbished**
- Part: ZD42042-T0EW02EZ
- Connectivity: USB / WiFi (802.11) / Bluetooth
- Resolution: 203dpi
- Print width: 104mm max (our labels: 100mm ✓)
- Speed: 152mm/s
- Emulation: EPL II, ZPL II ✓
- RAM: 256MB, Flash: 512MB
- Mode: Set to **Direct Thermal** (one-time setting on arrival)
- Cost: £245 inc VAT (refurbished)

---

## Why Not Zebra Cloud Connect

Zebra Cloud Connect requires the printer to hold a **permanent WebSocket
connection open** to our server. Vercel serverless functions have a 30-second
timeout — they cannot hold permanent connections.

The relay approach we've built is better:
- No dependency on Zebra's external cloud infrastructure
- Works with ANY ZPL printer (ZD420, ZD421, TSC, anything on port 9100)
- Jobs queue in Supabase if relay is offline — nothing is lost
- Full print job history in the app
- Multi-printer support built in from day one

---

## Architecture

```
Staff taps Print on iPad
        ↓
mfsops.com (Vercel) — POST /api/print
        ↓
Supabase: INSERT into print_jobs (status='pending', zpl=..., printer_id=...)
        ↓ Realtime subscription (outbound from office PC — never blocked)
Office PC relay (Node.js Windows service, auto-starts with PC)
        ↓ TCP port 9100 — raw ZPL
Zebra ZD420 (on facility WiFi — local IP e.g. 192.168.1.45)
        ↓
Label prints — silent, instant (~1 second tap to print)
```

**Key points:**
- Office PC and ZD420 are on the same local WiFi/LAN
- Relay connects to Supabase outbound (never blocked by firewalls)
- Printer receives raw ZPL over TCP — most basic ZPL method, always works
- No Zebra software needed, no QZ Tray, no Cloud Connect

---

## Printer Setup (when ZD420 arrives — ~15 minutes total)

**Step 1 — Set Direct Thermal mode (2 min)**
- Hold feed button on power-on → calibration mode
- Or: connect USB to laptop, open Zebra Setup Utilities (free download)
- Set Media Type = Direct Thermal
- Save to printer

**Step 2 — Join facility WiFi (5 min)**
- Download Zebra Printer Setup app (free, iOS/Android)
- Connect phone to printer via Bluetooth
- Configure WiFi SSID + password
- Printer joins network

**Step 3 — Find printer's IP (1 min)**
- Hold feed button for 2 seconds — printer prints a config label
- IP address shown on the label (e.g. 192.168.1.45)

**Step 4 — Set static IP on router (5 min)**
- Log into router, reserve the printer's MAC address to a fixed IP
- Prevents IP changing after router restart

**Step 5 — Install relay on office PC (2 min)**
- Download relay installer (.exe) from mfsops.com/admin/relay
- Run installer, enter printer IP when prompted
- Done — relay starts automatically

**Step 6 — Test print from app (1 min)**
- Open mfsops.com on iPad
- Go to any delivery record
- Tap Print → label should print within 1 second
- Green dot on print button = relay connected

---

## DB Schema

```sql
-- Print jobs table
CREATE TABLE print_jobs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz DEFAULT now(),
  status          text NOT NULL DEFAULT 'pending',
    -- pending | printing | done | failed
  printer_id      uuid REFERENCES printers(id),
  zpl_content     text NOT NULL,
  record_type     text,   -- 'delivery' | 'mince'
  record_id       uuid,
  copies          integer DEFAULT 1,
  error_message   text,
  completed_at    timestamptz
);

-- Printers table (supports multiple printers)
CREATE TABLE printers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,        -- e.g. "Process Room", "Warehouse"
  ip_address  text NOT NULL,        -- e.g. "192.168.1.45"
  port        integer DEFAULT 9100,
  active      boolean DEFAULT true,
  last_seen   timestamptz,          -- updated by relay on heartbeat
  created_at  timestamptz DEFAULT now()
);
```

---

## What Gets Built (4 components)

### 1 — Supabase schema
`print_jobs` + `printers` tables (above)

### 2 — API: POST /api/print
Replaces the current `printLabelInApp()` HTML/iframe approach.

```
POST /api/print
Body: { type: 'delivery'|'mince', id: UUID, copies: 1, usebydays?: 7 }
Auth: x-mfs-user-role header (warehouse | butcher | admin)

Flow:
  1. Fetch record from DB (same as current /api/labels)
  2. Generate ZPL (same ZPL templates already written)
  3. INSERT into print_jobs (status='pending')
  4. Return { job_id, status: 'queued' }

Response is immediate — no waiting for printer
```

### 3 — Print status in app
- Print button shows spinner while waiting for status
- Subscribes to `print_jobs` row via Supabase Realtime
- Green flash when status = 'done'
- Red flash + error if status = 'failed'
- Timeout fallback to iframe print after 10 seconds if relay offline

### 4 — Windows relay app (Node.js)
~150 lines of Node.js, packaged as a Windows .exe installer.

```
relay/
  index.js        — main loop
  printer.js      — TCP socket to ZPL printer (port 9100)
  config.json     — { printers: [{ id, name, ip, port }] }
  package.json

Behaviour:
  - Connects to Supabase Realtime on startup
  - Subscribes to print_jobs WHERE status = 'pending'
  - On new job: marks as 'printing', opens TCP socket to printer IP:9100
  - Writes ZPL bytes, closes socket
  - Marks as 'done' or 'failed' with error_message
  - Sends heartbeat to printers.last_seen every 30 seconds
  - Reconnects automatically if Supabase or printer connection drops

Packaging:
  - pkg (npm) bundles to single .exe — no Node.js install needed
  - node-windows registers as Windows service
  - Auto-starts on PC boot
  - Installer downloads from mfsops.com/admin/relay/download
```

---

## Current Print Flow (fallback — stays in place)

The current `printLabelInApp()` iframe method stays as fallback.

```typescript
// lib/printing/index.ts — updated flow
async function printLabel(url: string): Promise<void> {
  // 1. Try relay (ZPL)
  const relayStatus = await checkRelayStatus()
  if (relayStatus === 'online') {
    await sendToRelay(url) // POST /api/print
    return
  }
  // 2. Fallback — iframe AirPrint (current method)
  await printLabelInApp(url)
}
```

Staff never see this logic — the right method is chosen automatically.

---

## Status Indicator

On delivery and mince print buttons:

```
🟢 Print  — relay connected, printer reachable
🟡 Print  — relay connected, printer not responding (check printer is on)
⚫ Print  — relay offline (will use AirPrint fallback)
```

Status is polled from `printers.last_seen` — if last heartbeat > 60 seconds ago, relay is considered offline.

---

## Multi-Printer Support (built in from day one)

The `printers` table supports multiple printers. When printing, if multiple printers are active, staff see a selector:

```
Print to:  ● Process Room   ○ Warehouse
```

First printer is the default. Staff can tap to switch. Selection is remembered per device.

---

## Files to Create (when building)

```
relay/                          — new directory in repo root
  index.js                      — relay main loop
  printer.js                    — ZPL TCP sender
  config.json                   — printer config template
  package.json                  — pkg + node-windows deps
  install.bat                   — Windows service installer script
  README.md                     — setup guide for Hakan

app/
  api/
    print/
      route.ts                  — POST /api/print endpoint
    print-relay/
      status/
        route.ts                — GET relay + printer status
      download/
        route.ts                — serves relay installer .exe

  admin/
    relay/
      page.tsx                  — admin UI: printer config, relay status, test print
```

---

## Questions to Confirm Before Building

- [ ] Is the office PC Windows? (confirmed: affects packaging)
- [ ] One printer or two from day one?
- [ ] Should the use-by dialog still appear for mince before print,
      or should it be part of the print job creation flow?

---

## Self-audit Log

| Date | Issue | Fix |
|---|---|---|
| 2026-04-27 | Zebra Cloud Connect incompatible with Vercel serverless | Replaced with Supabase Realtime relay pattern |
| 2026-04-27 | ZD420 is thermal transfer model | Set to Direct Thermal mode on setup — no impact on labels |

---

*ZPL templates: already written in lib/printing/zpl.ts — no changes needed*
*Label designs: confirmed and live — no changes needed*
*Hardware: ZD42042-T0EW02EZ purchased, arriving soon*
