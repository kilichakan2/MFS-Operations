# MFS Global — Label Printing & Barcode Traceability Plan
**Created:** 2026-04-24
**Last updated:** 2026-04-25
**Status:** Phase 1 complete (in-app print in build). ⚠️ **2026-06-27 — REGRESSION: the Sunmi V3 Android APK worked, then stopped ~1 week after install. See the "2026-06-27 status" section below. Owner ticket: BACKLOG F-PROD-04.** 🟢 **2026-06-29 — NOW ACTIVE:** all prerequisites cleared (sprint sealed · UI Phase 0 complete · repo cleanup done). Framed; work starts next session (direction decision = Hakan's, fresh session). See the "2026-06-29 frame" section below.
**Owner:** Hakan Kilic

---

## Summary of current state

Phase 1 is fully built and working. Both label types (Goods In and Mince/Prep)
print correctly. The remaining Phase 1 item is removing the "new tab" step so
staff tap Print and the iOS print sheet appears directly.

---

## 2026-06-27 status — REGRESSION to diagnose + architecture gap (logged during the F-RLS-final session)

**The regression (Hakan's report):** the Sunmi V3 Android label-printing flow WORKED — the APK
was installed and labels printed — then STOPPED working ~1 week later. This is a regression to
diagnose, not new work; the feature is substantially built (Phase 1 + the Sunmi native bridge
added 2026-05-14).

**Leading hypothesis — collateral from the 16-day auth/RLS re-architecture sprint (2026-06-12→27).**
Auth changed hard in that window: signed session cookies (forced a one-time mass re-login),
`x-mfs-user-role` header guards, tightened admin gates, RLS flips. `/api/labels` authorises off
the `x-mfs-user-role` header (roles warehouse | butcher | admin) and is a service-role route
(it reads cross-entity data with the master key). "After a week" also fits a Capacitor/PWA
stale-cached build, a session/token expiry, or APK signing. **Diagnose on-device and trace the
`/api/labels` auth path BEFORE assuming the printer bridge broke.**

**Architecture gap — the last module outside the Lego pattern.** `lib/printing/` is the only
functional module NOT behind a port: there is no `Printer` port (`lib/ports/` has only
`PdfRenderer.ts`), and a UI page (`app/haccp/delivery/page.tsx`) imports `lib/printing/` directly
— the last UI→implementation breach of the hexagonal rule. When labels get expanded across
devices (Sunmi + AirPrint + Zebra), wrap them behind one owned `Printer` port + per-device
adapters (Sunmi / AirPrint-HTML / Zebra-ZPL). If only fixing the regression, the port can be a
fast-follow.

**Sequence:** Hakan's decision 2026-06-27 = seal the re-architecture FIRST (Day-16: F-TD-12,
F-INFRA-03, F-INFRA-04, closing audit), THEN this as the #1 feature target. Tracked as
BACKLOG **F-PROD-04** and memory `project_label_printing_next`.

---

## 2026-06-29 frame (session before printing work begins)

Located the implementation in the repo (confirms the 2026-06-27 hypothesis is the right place to look):
- **Native Sunmi side:** `android/app/src/main/java/com/mfsglobal/ops/SunmiPrintBridge.java` (the `window.MFSSunmiPrint`
  bridge) + `MainActivity.java`. This is a real Capacitor Android project (`capacitor.config.ts` + `android/`).
- **Web side:** `lib/printing/*` → `app/api/labels/route.ts` (auth off `x-mfs-user-role`, service-role) →
  `app/haccp/delivery/page.tsx` + `components/PrintLabelStrip.tsx`.

**Two separable pieces** (decision deferred to next session): ① **diagnose + fix the regression** — leading
suspect is auth-sprint collateral on the `/api/labels` auth path (session cookie / role header / service-role),
NOT the printer bridge; trace the code first, then on-device confirm (needs Hakan's physical Sunmi V3 — the
conductor cannot run the APK). ② **re-architect behind a `Printer` port** (`lib/printing/` is the last module
with no port; `app/haccp/delivery/page.tsx` imports it directly = the last UI→impl Lego breach) — a fast-follow
if we only fix the regression now. **Direction (diagnose-first / port-first / both) is Hakan's call next session.**

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

**100mm × 75mm** — updated for BLS compliance (was 50mm, insufficient for all required fields).
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
