# 0012 — Sunmi V3 label mode + 52×38mm die-cut delivery label format

## Status

Accepted (ratified by planner 2026-06-30, F-PROD-04)

## Context

F-PROD-04 Pass 2b put a release-signed APK on the Sunmi V3. On-device testing then revealed
that the silent native delivery print does not fit the physical label stock: **52mm wide ×
38mm high die-cut labels** (individual stickers with gaps on a roll). The print overruns each
label onto the next.

Root cause (verified): `android/app/src/main/java/com/mfsglobal/ops/SunmiPrintBridge.java`
prints in **receipt mode** (`printText(...)` + `lineWrap(3)`), which treats the roll as one
continuous strip and never aligns to the die-cut gap. The Sunmi SDK
(`com.sunmi:printerlibrary:1.0.24`) supports **label mode** (gap-sensor learning +
`labelLocate`/`labelOutput`) that feeds exactly one die-cut label.

Secondly, the current delivery label carries ~11 lines (header, species, batch, barcode,
divider, supplier, date, temp, born/reared, slaughter, cut, allergens) — too tall for 38mm
even aligned, so the field set/layout must be reduced and tightened.

ADR-0001 records the bridge mechanism (`addJavascriptInterface`, print-only methods). This
ADR extends it with the print *mode* and the label *format*. ADR-0010 (Printer transport
port) is unaffected — the Sunmi adapter still implements the existing `printDeliveryLabel`
port method; no new port.

## Decision

1. **Switch the native delivery print from receipt mode to LABEL mode**, sized for
   **52mm × 38mm** die-cut stock. Use the Sunmi SDK label-mode flow (gap learning once +
   per-print locate/output). Printable width on the 58mm head is ~48mm/384px @ 203dpi —
   content is constrained to fit ~48mm.
2. **Reduced delivery label field set / layout** (Hakan, 2026-06-30), to fit 38mm:
   - **Drop** the "MFS GLOBAL / GOODS IN" header line.
   - **Species + batch code** on one row (side-by-side) instead of stacked.
   - **Keep the barcode** (scannable batch) — shrink its height to fit.
   - **Born and Reared as SEPARATE fields** (not the combined "Born/Reared" line).
   - **Temperature: value only** (e.g. `Temp: 4°C`) — drop the PASS/FAIL word entirely,
     even on a failed delivery (fail is captured in the daily diary, not the label).
   - Keep: supplier, date, slaughter site, cut site, allergens.
   - Two-column where it fits; exact spacing fine-tuned by on-device calibration.
3. **Mince is out of scope for this pass** — delivery first. Native mince print is a fast-
   follow that will reuse this same label format + label-mode flow.
4. **Verification is on-device** — no automated test can prove a thermal print. Build signed
   APK → sideload → print on the real 52×38mm roll → measure → adjust → reprint. The
   clearance gate is a correctly-fitted physical label.
5. **Fallback preserved** — the iframe/AirPrint path (Browser adapter) remains for non-Sunmi
   devices and as the native-failure fallback; if label mode misbehaves on the V3, the iframe
   path still works.

## Consequences

### Easier
- Labels align to the die-cut stock; one sticker per print, no overflow.
- A leaner label that fits 38mm and is quicker to read.
- The format + label-mode flow is reusable for the mince fast-follow.

### Harder
- Bridge method signature changes (born/reared separate, temp value-only) — coordinated
  across `SunmiPrintBridge.java` and the TS adapter's `MFSSunmiPrint` interface declaration +
  the `formatTempStatus`/`formatBornLine` helpers in `lib/adapters/sunmi/Printer.ts`.
- Label mode needs gap learning/calibration tied to this specific 52×38mm stock; changing
  stock later needs re-calibration.
- Dropping PASS/FAIL and the header is a deliberate label-content reduction (separate from
  the deferred beef-labelling regulatory review).

### Neutral
- No new dependency (Sunmi SDK already present). No DB/web change. Hexagonal: the Sunmi
  adapter still implements the existing Printer port; rip-out test unaffected.
