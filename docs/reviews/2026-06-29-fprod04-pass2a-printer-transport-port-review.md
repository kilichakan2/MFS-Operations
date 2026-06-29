# Code review — F-PROD-04 Pass 2a — Printer transport port (refactor-only)

- **Date:** 2026-06-29
- **Branch / PR:** `fprod04-pass2a-printer-port` / PR #99 (base `main`)
- **Reviewer:** code-critic (FORGE Guard)
- **Verdict:** **SHIP — no blockers**

## Summary
A genuine move-the-furniture-only change. Printing behaviour is provably untouched;
the new port/adapter/wiring structure follows the hexagonal contract; every
safety-critical detail (mince use-by date in the URL, jammed-printer fallback) is
pinned by a test. Handed to ANVIL.

## Behaviour-preservation audit (adversarial on the "byte-identical" claim — HOLDS)
- **R1 — URL drift (food-safety): PASS.** Old screen literals vs new `deliveryUrl`/`minceUrl`
  builders (`lib/adapters/browser/Printer.ts:159,168`) are character-for-character identical,
  including param order. Mince `usebydays`: `…&copies=1&usebydays=${opt.days}&width=${target.width}`
  → identical. Pinned by literal-string assertions at
  `tests/unit/adapters/browser/Printer.test.ts:149,162,170`.
- **R2 — native→iframe fallback regression: PASS.** Sunmi adapter
  (`lib/adapters/sunmi/Printer.ts:178`) preserves the exact try-native/`catch`→fallback
  sequence. Pinned by `tests/unit/wiring/printer.test.ts` case 2.
- **Routing preserved: PASS.** 58mm delivery → native only when `isSunmiNative()`; 100mm
  delivery and ALL mince → Browser path even on the V3 (`Printer.ts:166,187`). Wiring test
  cases 1/3/4.
- **`printDeliverySunmi` body:** byte-identical (arg order, `?? ''` defaults, `'None'`
  allergen literal). Only source change = `°C`/`—` → `°C`/`—` (identical runtime
  strings, cosmetic encoding).
- **Classifier oracle:** deleted `tests/unit/printing/labelFetch.test.ts` moved verbatim into
  the browser test, assertions unchanged + additive R1 block. Proof-of-move oracle intact.

## Architecture / hexagonal (all PASS)
- Renderer (`lib/printing/{index,html,zpl,types}.ts`) + `app/api/labels/route.ts`: `git diff`
  empty — port-less renderer honoured per ADR-0010.
- Screens import only the seam: `app/haccp/delivery/page.tsx:21-22`, `app/haccp/mince/page.tsx:10`
  → `@/lib/wiring/printer` (+ type-only `@/lib/ports`). Zero `lib/adapters/**`, zero
  `lib/printing/{sunmi,labelFetch}` imports repo-wide (alias + relative forms grepped).
- No adapter reaches into another: Sunmi fallback arrives by injection via the `Printer` port
  type; `lib/wiring/printer.ts:34` is the only connection point.
- SSR safety: no module-level `window` in wiring; `isSunmiNative()` is inside `getPrinter()`
  (call time). Browser adapter DOM access all inside function bodies.
- Port purity: `lib/ports/Printer.ts` is pure types.
- Zero new deps: `git diff main -- package.json` empty. `no-adapter-imports` lint pin passes.
- **Rip-out test: PASS** — future Zebra = one new `lib/adapters/zebra/Printer.ts` + one wiring line.

## Depth verdicts
- `lib/ports/Printer.ts` — **DEEP (as a seam):** 2-method interface hiding two real transports
  + Fake. Not speculative — two real plugs today.
- `lib/adapters/browser/Printer.ts` — **DEEP:** hides fetch + classify + iframe + print timing;
  sole source of URL strings (locality win).
- `lib/adapters/sunmi/Printer.ts` — **DEEP:** native-eligibility decision + bridge formatting +
  fallback delegation.
- `lib/wiring/printer.ts` — appropriately thin (composition root, by design).
- `lib/adapters/fake/Printer.ts` — correct test double.
- No PASS-THROUGH, no SPECULATIVE SEAM introduced.

## Tests / type / lint
- `npx tsc --noEmit` — clean (exit 0).
- `npx next lint` — clean.
- Affected unit suite — **164/164 passing** (browser/fake/sunmi adapter tests, wiring test,
  re-pointed `labelPrinting.test.ts`, `no-adapter-imports` lint pin).
- No DB surface — no migration/pgTAP/RLS (correct for this unit).

## 🟢 Good
- R1 tests assert literal strings, not a re-derivation — correct way to pin byte-identity.
- Classifier oracle moved assertions-unchanged — real before/after proof.
- Fallback-on-throw now has explicit coverage the old inline `.catch` never had.
- Contract file honestly scopes to shared port guarantees + documents why device-selection
  lives in the wiring test (CI lacks a native bridge / print dialog).

## 🔵 Nice-to-have (non-blocking, follow-up)
- `lib/ports/Printer.ts:33` — `copies` is plumbed but always 1 (kept for URL fidelity). Fine as
  URL parity; if Pass 2b/3 never varies it, drop it then.
- Real native-print + real iframe-print paths remain unit-untestable (no bridge / no print
  dialog in CI) — by design, covered by existing `@critical` Playwright. Recommend a focused
  browser-tap on the delivery + mince print screens during ANVIL (HACCP browser-tap guidance);
  backend shapes byte-identical so it need not be exhaustive — the two print screens only.

## Loop-back
None. No blockers → ANVIL.
