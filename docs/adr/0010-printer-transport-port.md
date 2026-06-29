# 0010 — Printer port abstracts transport only; renderer stays port-less

## Status

Accepted (ratified by planner 2026-06-29, F-PROD-04 Pass 2a)

## Context

F-PROD-04 Pass 2a introduces the last remaining owned port for the label-printing
subsystem. Before this change, `app/haccp/delivery/page.tsx` imported the native
Sunmi printer bridge directly (`import { printDeliverySunmi } from '@/lib/printing/sunmi'`)
and held the device-selection + fallback logic inline. A screen reaching straight at a
native device SDK is a breach of the project's hexagonal rule (UI must not touch a vendor
SDK directly).

The word "printing" covers two genuinely different jobs in this codebase:

1. **Rendering** — `lib/printing/index.ts` (`generateLabel`), `html.ts`, `zpl.ts`,
   `types.ts`. Runs server-side inside `app/api/labels/route.ts`. A pure function:
   (label type, data, config) → bytes (HTML or ZPL text). No device, no vendor, no I/O.

2. **Transport** — getting the bytes onto paper, client-side. Two live paths:
   - `lib/printing/sunmi.ts` → native Sunmi bridge (`window.MFSSunmiPrint`), silent
     print on the V3, delivery labels only, 58mm only.
   - `lib/printing/labelFetch.ts` → fetch + hidden-iframe + `window.print()`
     (AirPrint / browser), used by both delivery and mince, all widths (F-PROD-04 Pass 1).
   - Zebra-ZPL is **not** a live transport: `generateLabel` can emit ZPL, but nothing
     sends it to a device. It is a dormant render format with no transport behind it.

ADR-0001 already records *how* the native Sunmi bridge is wired (`addJavascriptInterface`).
This ADR records the *port shape* layered on top of it.

## Decision

1. **The `Printer` port abstracts transport only** — the client-side "get this label onto
   paper" seam. Interface lives at `lib/ports/Printer.ts` with methods for printing a
   delivery label and a mince label. Adapters:
   - `lib/adapters/sunmi/` — native bridge; native path for 58mm delivery only; delegates
     100mm, mince, and any native failure to an injected fallback printer.
   - `lib/adapters/browser/` — fetch + iframe + AirPrint (Pass-1 `labelFetch.ts` relocated
     here, tests carried with it). Handles both label types, all widths.
   - `lib/wiring/printer.ts` selects the adapter by device at click-time (mirrors the F-26
     LocalCache/Dexie client-side-port precedent), injecting the browser adapter as the
     Sunmi adapter's fallback so no adapter reaches into another's internals.

2. **The renderer (`generateLabel` and friends) is deliberately left port-less.** It has no
   external dependency to swap — it is a pure, vendor-free function. Wrapping it in a port
   would fail the deletion test (complexity would move to the caller unchanged, not
   concentrate) — a speculative seam, which the architecture contract forbids.

3. **Zebra-ZPL is a named future slot, not built now.** There is no Zebra device to test
   against and the format is dormant. A future `lib/adapters/zebra/` adapter would send ZPL
   over the network; adding it must satisfy the rip-out test (one adapter + one wiring line).

4. **Pass 2a is a pure refactor — byte-identical printing behaviour.** No new native mince
   printing (that needs new Java bridge methods → Pass 2b/APK territory). No new dependencies.

## Consequences

### Easier
- Screens no longer import a native device SDK directly — the hexagonal breach is closed.
- Device-selection + fallback live in one place (`lib/wiring/printer.ts` + the Sunmi adapter)
  instead of inline in the delivery page.
- A future Zebra (or any other) printer is a one-adapter + one-wiring-line change — the
  rip-out test passes.

### Harder
- A client-side port is a less common pattern in this repo than server-side ports; the
  wiring must detect the device at call-time, never at server import (window-touching code
  must not run during SSR). The F-26 Dexie/LocalCache adapter is the precedent to follow.

### Neutral
- The renderer staying in `lib/printing/` means the printing subsystem spans two homes:
  `lib/printing/` (render) and `lib/adapters/{sunmi,browser}/` (transport). This is
  intentional — they are different jobs with different testability and risk profiles.
