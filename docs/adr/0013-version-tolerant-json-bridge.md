# 0013 — Version-tolerant JSON bridge for the Sunmi native print contract

## Status

Proposed (2026-06-30, F-PROD-04)

Governs the **shape** of `MFSSunmiPrint` print methods. ADR-0012 still governs **label
mode + layout**; ADR-0001 still governs the **bridge mechanism** + print-only rule. To be
ratified to Accepted at ship.

## Context

The MFS Android app is a **remote-URL Capacitor shell**: the APK is a thin wrapper that
loads the live website `https://mfsops.com` (`capacitor.config.ts` → `server.url`). The
print "doorway" therefore has two halves that ship **independently**:

- The **JavaScript half** (`lib/adapters/sunmi/Printer.ts`) is served from the deployed
  website.
- The **Java half** (`SunmiPrintBridge.java`) ships inside the APK installed on the device.

These two halves can be different versions at the same time (web deploys without an APK
reinstall, and vice versa).

The previous bridge was **positional**: arguments matched by order and count. Android's
`@JavascriptInterface` resolves a call to a Java method **by exact name + argument count**.
When the prior pass changed the Java method from 9 to 10 positional arguments while the
deployed web still called the 9-argument form, Android found **no matching method** — the
call **silently did nothing**: no print, no JavaScript error. The mince and real-allergens
passes would each add fields and re-trigger this exact trap.

## Decision

Native print methods on `MFSSunmiPrint` take a **single JSON string** payload
(`printLabel(String json)`), parsed by name with `org.json` (part of the Android platform —
no new dependency). The JavaScript builds the JSON; Java reads each field by name with a
default for missing keys (`optString(key, "")`) and ignores unknown keys. A field
**add/remove** changes JSON **keys only** — never the method signature — so a website/APK
version skew degrades gracefully instead of silently no-printing.

A new, distinctly-named method (`printLabel`) is used rather than a JSON overload of
`printDeliveryLabel`, so the web can **feature-detect** it (`typeof bridge.printLabel ===
'function'`) before calling; a generic `printLabel` also serves the future mince label (a
`type` key selects the layout).

## Backward-compatibility clause

During switchover the APK **keeps the old positional `printDeliveryLabel(...9 args...)`
working**, delegating to the same shared renderer, so the currently-deployed (old) web still
prints against the new APK. The new web **feature-detects** `printLabel` and calls it; it
falls back to the old positional method if `printLabel` is absent (old APK + new web), and
falls back to the iframe Browser adapter only if neither method exists. All four old/new
combinations of web × APK still print — no silent dead window.

## Consequences

**Easier:**
- Future fields are JSON-key edits, never method-signature changes.
- APK↔web version skew no longer silently kills printing.
- One method serves delivery now and mince later.

**Harder:**
- Java now parses JSON (small, platform-standard).
- The contract's "shape" lives in two places (a JSON key list in TypeScript +
  the `optString` parse in Java) with no compile-time link — mitigated by a missing-key /
  unknown-key-tolerant parser, a unit test pinning the TypeScript key set
  (`buildDeliveryPayload`), and an on-device field-by-field round-trip check.

## Print-only invariant preserved (ADR-0001)

`printLabel` is a print method; it adds **no** filesystem, credential, network, or user-data
capability. ADR-0001 §"Future Java methods" forbids only non-print capabilities — a
JSON-payload print method is print-related, so no superseding of ADR-0001 is needed.
