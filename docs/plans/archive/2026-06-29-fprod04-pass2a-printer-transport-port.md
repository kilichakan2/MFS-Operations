# F-PROD-04 Pass 2a — Printer transport port re-architecture (REFACTOR-ONLY)

**Date:** 2026-06-29
**Type:** Pure refactor — hexagonal breach closure, byte-identical printing behaviour
**Branch suggestion:** `fprod04-pass2a-printer-port`
**ADR:** ADR-0010 (`docs/adr/0010-printer-transport-port.md`) — currently *Proposed*; this plan **ratifies it → Accepted** at plan approval.

---

## Visual mini-map

```
DOMAIN (label transport — client-side)
  └─ Printer (NEW port) → [Sunmi]   (adapter — native 58mm delivery only)
                        → [Browser] (adapter — iframe/AirPrint, all else + fallback)
  (renderer generateLabel stays port-less — pure, no vendor to swap)
🗣 one socket "get this label onto paper"; Sunmi tries first for 58mm delivery, Browser does everything else and catches every miss
```

---

## Goal

Close the last hexagonal breach in the label-printing subsystem: two HACCP screens
currently `import` a native device bridge (`@/lib/printing/sunmi`) and a transport
helper (`@/lib/printing/labelFetch`) **directly**. Move the transport behind an
owned `Printer` port with two adapters (Sunmi native + Browser iframe), wired by a
client-side factory. The screens stop knowing *how* a label reaches paper — they
ask the wired printer to print, and it decides.

🗣 In plain English: right now the delivery screen reaches straight into the
Android printer's wiring. We're putting a labelled socket between them so the screen
just says "print this delivery label" and the right printer handles it — and a
future printer (Zebra) becomes a one-file add instead of surgery on the screens.

**This is a pure relocation + one interface extraction.** Zero behaviour change,
zero new dependencies, no DB/RLS/API change. The release-signed APK and on-device
verification are **Pass 2b — OUT OF SCOPE here.**

---

## Domain terms

- **Renderer** — `lib/printing/{index,html,zpl,types}.ts`. Pure server-side
  function: (label type, data, config) → bytes (HTML/ZPL). Runs inside
  `app/api/labels/route.ts`. 🗣 The part that *draws* the label. No vendor, nothing
  to swap — stays exactly where it is (wrapping it would be a fake socket).
- **Transport** — getting those bytes onto paper, on the device. THIS is what the
  new port abstracts. 🗣 The part that *sends the drawing to a printer*. Two real
  ways today: silent native print on the Sunmi V3, and a hidden-iframe browser/AirPrint print.
- **Port** (`lib/ports/Printer.ts`) — the interface the app owns. 🗣 The socket shape.
- **Adapter** (`lib/adapters/{sunmi,browser}/`) — the concrete plugs. 🗣 The actual plugs that fit the socket.
- **Wiring** (`lib/wiring/printer.ts`) — the one file that bolts a chosen adapter to the port at click-time. 🗣 The parts list that picks which plug to use on this device.
- **Sunmi V3 native bridge** — `window.MFSSunmiPrint`, injected by the Android shell (ADR-0001). 🗣 A direct line from the web page to the built-in printer; only exists inside the MFS Android app.
- **Fallback delegation** — the Sunmi adapter, when it can't print natively (100mm, mince, or a native throw), hands off to an *injected* Browser adapter. 🗣 The native printer, when stuck, passes the job to the iframe printer it was handed — it never reaches into the iframe printer's guts.

---

## Compliance flags

- **No-AI-references (HARD):** NO "Co-Authored-By", NO "Claude", NO "🤖", no AI
  mentions in any commit message, PR text, code, or comment. This **overrides** the
  global git-trailer instruction in `~/.claude/CLAUDE.md`. 🗣 Nothing in this repo
  may hint an AI touched it — strip the usual trailers.
- **HACCP-critical screen:** the delivery screen prints food-safety labels (BLS
  traceability, allergens). Behaviour MUST stay byte-identical — a regression here
  is a regulatory + operational risk. 🗣 This screen prints legally-required meat
  labels; if printing breaks or prints the wrong thing, that's a real-world food-safety problem.

---

## ADR conflicts

**None.** This plan *implements* ADR-0010 and is consistent with ADR-0001 (Sunmi
bridge mechanism) and ADR-0002 (hex naming + dependency rule). ADR-0010 status
moves **Proposed → Accepted** as part of Step 9.

🗣 No decision log contradicts this work; one ADR (0010) was written for exactly
this change and gets stamped "accepted" when the plan is approved.

---

## Current state (verified by reading the files)

| Concern | File today | Used by |
|---|---|---|
| Native bridge + pure helpers + supplier-code fetch | `lib/printing/sunmi.ts` (`'use client'`) | delivery page only |
| iframe/AirPrint print + classifier | `lib/printing/labelFetch.ts` | delivery + mince pages, all widths |
| Renderer (UNTOUCHED) | `lib/printing/{index,html,zpl,types}.ts` | `app/api/labels/route.ts` |
| Classifier test | `tests/unit/printing/labelFetch.test.ts` | — |

**Delivery page (`app/haccp/delivery/page.tsx`) — exact current call sites:**
- L21: `import { isSunmiNative, printDeliverySunmi, type DeliveryForPrint } from '@/lib/printing/sunmi'`
- L22: `import { printLabelInApp } from '@/lib/printing/labelFetch'`
- L40–62: `handlePrint58(d, onError)` — `if (isSunmiNative())` build `DeliveryForPrint` → `printDeliverySunmi(forPrint).catch(...)` → on throw `printLabelInApp(.../width=58mm, onError)`; `else` `printLabelInApp(.../width=58mm, onError)`.
- L738 (detail header) **and** L1642 (collapsed row): TWO 100mm buttons calling `printLabelInApp(.../width=100mm, onPrintError)` **directly** — these BYPASS Sunmi (100mm always iframe). **PRESERVE.**
- L27–33: `PrintErrorHandler` type + `printErrorMessage(kind)`; L710 + L990 wire `onPrintError`/`submitErr`. These stay in the page (UX), byte-identical.

**Mince page (`app/haccp/mince/page.tsx`) — exact current call site:**
- L10: `import { printLabelInApp } from '@/lib/printing/labelFetch'`
- L15–19: local `printErrorMessage(kind)` (identical text to delivery's). Stays.
- L781–784: `await printLabelInApp(`/api/labels?type=mince&id=${target.id}&format=html&copies=1&usebydays=${opt.days}&width=${target.width}`, (kind) => setSubmitErr(printErrorMessage(kind)))`. Mince is ALWAYS iframe (no native mince).
- `printTarget` shape (L426): `{ id, batchCode, outputMode, width: '100mm' | '58mm' }`.

**`components/PrintLabelStrip.tsx`** — pure presentation, takes `on100mm`/`on58mm`
callbacks as props, imports NO printing module. ✅ No change needed (verified L21–67).

**Precedent for a client-side port (F-26):** `lib/wiring/localCache.ts` is
`'use client'`, constructs the adapter lazily, touches no `window` at import, and
re-exports through the wiring. `lib/adapters/dexie/{index,LocalCache,react}.ts` +
`lib/adapters/fake/LocalCache.ts` + `lib/ports/__contracts__/LocalCache.contract.ts`
are the structural template to mirror.

---

## Target file layout (after this unit)

```
lib/ports/Printer.ts                         NEW  — the port + owned types
lib/ports/index.ts                           EDIT — re-export Printer types
lib/ports/__contracts__/Printer.contract.ts  NEW  — shared behavioural contract
lib/adapters/browser/index.ts                NEW  — barrel
lib/adapters/browser/Printer.ts              NEW  — relocated labelFetch (impl + classifier)
lib/adapters/sunmi/index.ts                  NEW  — barrel
lib/adapters/sunmi/Printer.ts                NEW  — relocated sunmi (impl + pure helpers + bridge)
lib/adapters/fake/Printer.ts                 NEW  — in-memory Fake for the contract
lib/adapters/fake/index.ts                   EDIT — export the Fake (if it has a barrel; verify)
lib/wiring/printer.ts                         NEW  — client-side getPrinter() factory
lib/printing/sunmi.ts                         DELETE (relocated)
lib/printing/labelFetch.ts                    DELETE (relocated)
tests/unit/printing/labelFetch.test.ts        MOVE → tests/unit/adapters/browser/Printer.test.ts (assertions unchanged = oracle)
tests/unit/adapters/sunmi/Printer.test.ts     NEW  — pure-helper coverage (moved/kept green)
tests/unit/adapters/fake/Printer.test.ts      NEW  — runs the contract against the Fake
tests/unit/wiring/printer.test.ts             NEW  — device-selection + fallback delegation
app/haccp/delivery/page.tsx                   EDIT — import wired printer, drop direct imports
app/haccp/mince/page.tsx                      EDIT — import wired printer, drop direct import
docs/adr/0010-printer-transport-port.md       EDIT — status Proposed → Accepted
```

🗣 In plain English: two files move out of `lib/printing/` into proper adapter
folders, a new socket + parts-list join them, and the two screens are re-pointed at
the parts list. The label-drawing code is not touched at all.

---

## The port shape (locked design — implementer follows this exactly)

`lib/ports/Printer.ts` — pure TypeScript, NO vendor import, NO React import, NO
`window` access. Carries enough to build the `/api/labels` URL for both label types
AND the flat-string `DeliveryForPrint` payload the native bridge needs.

```ts
// lib/ports/Printer.ts
export type PrintErrorKind = 'auth-bounce' | 'error'

export type LabelWidth = '58mm' | '100mm'

/** Flat delivery payload — exactly the fields the native bridge formats from.
 *  Moved verbatim from lib/printing/sunmi.ts (DeliveryForPrint). */
export interface DeliveryLabelInput {
  id:               string
  batch_number:     string
  supplier:         string
  product_category: string
  date:             string
  temperature_c:    number | null
  temp_status:      string
  born_in:          string | null
  reared_in:        string | null
  slaughter_site:   string | null
  cut_site:         string | null
  width:            LabelWidth   // 58mm → native eligible; 100mm → always iframe
  copies:           number       // currently always 1; carried for URL fidelity
}

export interface MinceLabelInput {
  id:        string
  usebydays: number
  width:     LabelWidth
  copies:    number              // currently always 1
}

export interface Printer {
  /** Print a delivery label. onError surfaces a dead-session/failure to the caller's submitErr. */
  printDeliveryLabel(input: DeliveryLabelInput, onError: (kind: PrintErrorKind) => void): Promise<void>
  /** Print a mince label. Always the iframe/AirPrint path (no native mince). */
  printMinceLabel(input: MinceLabelInput, onError: (kind: PrintErrorKind) => void): Promise<void>
}
```

🗣 The socket has exactly two jobs: "print a delivery label" and "print a mince
label". Each carries all the info to build the right URL, and delivery also carries
the flat fields the Android printer wants. `width` is what decides native-vs-iframe.

**URL construction is owned by the Browser adapter** (single source of truth for the
`/api/labels` query string), so both adapters build byte-identical URLs. The Sunmi
adapter, on fallback, calls its injected Browser adapter's method (NOT a local URL
build), guaranteeing the same string.

---

## Numbered steps (each step = ONE commit, ordered, atomic)

### Step 1 — Create the `Printer` port
**File:** `lib/ports/Printer.ts` (NEW), `lib/ports/index.ts` (EDIT)
- Write the interface + owned types exactly as in the design block above.
- In `lib/ports/index.ts` add: `export type { Printer, DeliveryLabelInput, MinceLabelInput, LabelWidth, PrintErrorKind } from "./Printer";` (follow the F-26 LocalCache re-export block style, ~L106).
- Pure TS, no imports beyond type-level. `tsc` must pass.

🗣 Define the socket shape first, before any plug — the contract is stable, plugs are interchangeable.

### Step 2 — Relocate the Browser adapter (the iframe/AirPrint path)
**Files:** `lib/adapters/browser/Printer.ts` (NEW), `lib/adapters/browser/index.ts` (NEW), `lib/printing/labelFetch.ts` (DELETE)
- Move `classifyLabelResponse` (pure) **verbatim** into `lib/adapters/browser/Printer.ts`. Keep the exported name `classifyLabelResponse` so the moved test imports it unchanged.
- Move the `printLabelInApp` body **verbatim** (the iframe styling, `iframe.onload`, `setTimeout(...,300)`, `setTimeout(...,2000)`, console.error strings — all byte-identical).
- Wrap it in a factory `createBrowserPrinter(): Printer` implementing both methods:
  - `printDeliveryLabel(input, onError)` → builds `/api/labels?type=delivery&id=${input.id}&format=html&copies=${input.copies}&width=${input.width}` and calls the moved `printLabelInApp(url, onError)`.
  - `printMinceLabel(input, onError)` → builds `/api/labels?type=mince&id=${input.id}&format=html&copies=${input.copies}&usebydays=${input.usebydays}&width=${input.width}` and calls `printLabelInApp(url, onError)`.
  - **CRITICAL URL fidelity:** the param ORDER and exact text must match the current strings character-for-character (delivery: `type,id,format,copies,width`; mince: `type,id,format,copies,usebydays,width`). With `copies=1` this is byte-identical to today.
- Also export the raw `classifyLabelResponse` (for the moved unit test) and keep `printLabelInApp` exported if the test referenced it (it only imports `classifyLabelResponse` — verified).
- `lib/adapters/browser/index.ts`: `export { createBrowserPrinter, classifyLabelResponse } from "./Printer";`
- DELETE `lib/printing/labelFetch.ts`.
- Carry the comment header (the Pass-1 rationale + the middleware/role-gating ASSUMPTION block) into the new file verbatim — it is load-bearing documentation.

🗣 The iframe printer moves into its own adapter folder, unchanged inside, now wearing the socket's two methods on the outside. The URL it builds is identical to today's, down to the character.

### Step 3 — Move the Browser adapter's test (oracle)
**Files:** `tests/unit/adapters/browser/Printer.test.ts` (NEW from move), `tests/unit/printing/labelFetch.test.ts` (DELETE)
- Move `tests/unit/printing/labelFetch.test.ts` to `tests/unit/adapters/browser/Printer.test.ts`.
- Change ONLY the import path: `from '@/lib/printing/labelFetch'` → `from '@/lib/adapters/browser/Printer'`. **All assertions unchanged** (they are the oracle that proves the move was behaviour-preserving).
- Run: must be green.

🗣 The existing classifier test rides along to the new location, untouched except for where it points — green proves we didn't change behaviour.

### Step 4 — Relocate the Sunmi adapter (native bridge + pure helpers)
**Files:** `lib/adapters/sunmi/Printer.ts` (NEW), `lib/adapters/sunmi/index.ts` (NEW), `lib/printing/sunmi.ts` (DELETE)
- Move the bridge type declaration (`MFSSunmiPrintBridge`, the `declare global` Window augmentation), `isSunmiNative()`, the pure helpers (`formatBornLine`, `formatTempStatus`, `formatSpecies`), and `getSupplierCode()` **verbatim** into `lib/adapters/sunmi/Printer.ts`. Keep `'use client'`.
- Rename the old `DeliveryForPrint` consumption to the port's `DeliveryLabelInput` (it has the same fields PLUS `width`/`copies`; the native path ignores `width`/`copies`). Map `input.*` into the bridge call exactly as `printDeliverySunmi` does today (same arg order, same `?? ''` defaults, same `'None'` allergens literal).
- Write a factory `createSunmiPrinter(fallback: Printer): Printer`:
  - `printDeliveryLabel(input, onError)`:
    - `if (input.width === '58mm' && isSunmiNative())` → run the native print (the moved `printDeliverySunmi` body). **On throw**, `console.error('[handlePrint58] Sunmi error — falling back', err)` (preserve the exact existing message) then `return fallback.printDeliveryLabel(input, onError)`.
    - **else** (100mm, OR not native) → `return fallback.printDeliveryLabel(input, onError)`.
  - `printMinceLabel(input, onError)` → `return fallback.printMinceLabel(input, onError)` (no native mince, ever).
- Export the pure helpers + `isSunmiNative` so their tests can import them.
- `lib/adapters/sunmi/index.ts`: `export { createSunmiPrinter, isSunmiNative, formatBornLine, formatTempStatus, formatSpecies } from "./Printer";`
- **Fallback is INJECTED** (the `fallback: Printer` param) — the Sunmi adapter NEVER imports `lib/adapters/browser` directly (no adapter reaches into another's internals). The wiring connects them.
- DELETE `lib/printing/sunmi.ts`.

🗣 The native printer moves into its own adapter, keeps the exact native-print logic, and when it can't print (wrong size, no native bridge, or a crash) it hands the job to whatever fallback printer it was given — it doesn't know or care that the fallback is the iframe one.

### Step 5 — Sunmi adapter unit test (pure helpers stay covered)
**File:** `tests/unit/adapters/sunmi/Printer.test.ts` (NEW)
- Cover the pure helpers verbatim: `formatBornLine` (both-null→null, same→combined, different→two-space join, one-present), `formatTempStatus` (pass/conditional→PASS, else FAIL, null temp→`—`), `formatSpecies` (underscore→space, uppercase). If a prior test existed for these, port its cases; otherwise write from the documented behaviour in the source comments.
- These are the only unit-testable pieces of the Sunmi adapter (native bridge + supplier-code fetch are not).

🗣 The little formatting functions that build the label text get their own tests so a future edit can't silently change what prints.

### Step 6 — Fake Printer + shared contract
**Files:** `lib/ports/__contracts__/Printer.contract.ts` (NEW), `lib/adapters/fake/Printer.ts` (NEW), `lib/adapters/fake/index.ts` (EDIT if a barrel exists — verify), `tests/unit/adapters/fake/Printer.test.ts` (NEW)
- `lib/adapters/fake/Printer.ts`: an in-memory `createFakePrinter()` that records calls (e.g. `{ deliveryCalls: DeliveryLabelInput[], minceCalls: MinceLabelInput[] }`) and lets a test script an error to assert `onError` is invoked. Mirror the F-25/F-26 Fake style.
- `lib/ports/__contracts__/Printer.contract.ts`: follow the `PushSender.contract.ts` shape exactly — a `printerContract(setup: () => Promise<{ printer: Printer; ... }>)` exporting `describe(...)` blocks asserting the port-level guarantees both adapters must honour:
  - `printDeliveryLabel` resolves and (on a scripted-success setup) does not call `onError`.
  - `printMinceLabel` resolves and (on a scripted-success setup) does not call `onError`.
  - on a scripted auth-bounce/error, `onError(kind)` is called and no throw escapes.
  - Keep the contract minimal — the device-specific selection logic is NOT a port guarantee (it's wiring); it is tested in Step 8.
- `tests/unit/adapters/fake/Printer.test.ts`: `printerContract(async () => ({ printer: createFakePrinter(...), ... }))`.

🗣 A pretend printer + a shared rule-book so any future printer (Zebra) can be checked against the same promises without a real device.

### Step 7 — Client-side wiring factory
**File:** `lib/wiring/printer.ts` (NEW)
- `'use client'` (mirror `lib/wiring/localCache.ts`).
- Import `createSunmiPrinter` from `@/lib/adapters/sunmi`, `createBrowserPrinter` from `@/lib/adapters/browser`, `isSunmiNative` from `@/lib/adapters/sunmi`, and `type { Printer } from "@/lib/ports"`.
- **NO `window` access at module load.** Export a factory:
  ```ts
  export function getPrinter(): Printer {
    const browser = createBrowserPrinter()
    if (isSunmiNative()) return createSunmiPrinter(browser)  // device check at CALL time
    return browser
  }
  ```
  - `isSunmiNative()` is itself SSR-safe (`typeof window === 'undefined'` guard, verified in source) — but it must only be invoked from `getPrinter()` (call-time), never at import.
- This is the ONLY business-layer file allowed to import `lib/adapters/**` (F-TD-11 / `no-adapter-imports` rule — wiring is the composition root). The Sunmi adapter gets the Browser adapter injected as fallback HERE.
- Header comment: state the rip-out contract (adding Zebra = new `lib/adapters/zebra/` + one line here) and the SSR-safety invariant, mirroring `localCache.ts`'s header.

🗣 The parts list: build the iframe printer, and if we're inside the Android app build the native printer with the iframe one as its backup; otherwise just use the iframe printer. The device check happens when a button is tapped, never when the page loads on the server.

### Step 8 — Wiring device-selection + fallback test
**File:** `tests/unit/wiring/printer.test.ts` (NEW)
- Fake `window.MFSSunmiPrint` (set/delete on `globalThis`/`window`) and assert `getPrinter()` returns the right shape, plus drive the chosen printer's methods with a stubbed native bridge + a fake fallback to assert the SELECTION + DELEGATION:
  - **V3 + 58mm delivery** → native bridge `printDeliveryLabel` is called; fallback NOT called.
  - **V3 + native throws** → fallback `printDeliveryLabel` IS called (with the same input + onError).
  - **V3 + 100mm delivery** → fallback called directly, native NOT called.
  - **V3 + mince** → fallback called, native NOT called.
  - **Browser device (no `window.MFSSunmiPrint`)** → `getPrinter()` returns the Browser adapter; all calls go straight to iframe path.
- Since native print and real iframe print are not unit-testable (no native bridge / jsdom limits), this test pins the *decision tree*, not the physical print. State that scoping in the test header.

🗣 The one genuinely new logic in this unit — "which printer, and does the backup kick in?" — gets fully tested by faking the Android bridge. The actual paper-printing is proven by the existing end-to-end browser test, not unit tests.

### Step 9 — Re-point the callers + ratify ADR
**Files:** `app/haccp/delivery/page.tsx` (EDIT), `app/haccp/mince/page.tsx` (EDIT), `docs/adr/0010-printer-transport-port.md` (EDIT)

**Delivery page:**
- Remove L21 (`@/lib/printing/sunmi`) and L22 (`@/lib/printing/labelFetch`) imports.
- Add `import { getPrinter } from '@/lib/wiring/printer'`.
- Replace `handlePrint58(d, onError)` (L40–62) so it builds the port's `DeliveryLabelInput` (the existing `forPrint` field mapping + `width: '58mm'`, `copies: 1`) and calls `getPrinter().printDeliveryLabel(input, onError)`. The native-vs-iframe + fallback decision now lives in the adapters — `handlePrint58` becomes a thin input-builder. (Keep the function name + signature so the two `on58mm={() => handlePrint58(d, onPrintError)}` call sites at L739 + L1643 are unchanged.)
- Replace the TWO direct 100mm calls (L738, L1642) `printLabelInApp(.../width=100mm, onPrintError)` with `getPrinter().printDeliveryLabel({ ...buildInput(d), width: '100mm', copies: 1 }, onPrintError)`. **Result is identical**: 100mm → Sunmi adapter sees `width !== '58mm'` → delegates to Browser → same URL. (Or, equivalently, keep these as thin calls through `getPrinter()`; do NOT call the Browser adapter directly from the page — go via the wired printer so the page imports zero adapters.)
- Keep `PrintErrorHandler`, `printErrorMessage`, `onPrintError`, `submitErr` byte-identical.
- `DeliveryForPrint` type import is gone — replace any in-page type reference with the port's `DeliveryLabelInput` (imported type-only from `@/lib/ports` if needed; the in-page mapping object is the only user).

**Mince page:**
- Remove L10 (`@/lib/printing/labelFetch`) import.
- Add `import { getPrinter } from '@/lib/wiring/printer'`.
- Replace the L781 call with `await getPrinter().printMinceLabel({ id: target.id, usebydays: opt.days, width: target.width, copies: 1 }, (kind) => setSubmitErr(printErrorMessage(kind)))`.
- Keep local `printErrorMessage` + `submitErr` byte-identical.

**ADR:** change `docs/adr/0010-printer-transport-port.md` Status from
`Proposed (...)` to `Accepted (ratified by planner 2026-06-29, F-PROD-04 Pass 2a)`.

🗣 The two screens swap their direct printer imports for the parts list and ask it
to print. Their error messages and red-text UX are untouched. The decision log gets stamped "accepted".

### Step 10 — Full verification sweep (no code, gate before ANVIL)
- `tsc` clean, `next lint` clean (confirm NO `app/**`/`components/**` → `lib/adapters/**` import remains; confirm wiring is the only adapter importer).
- Full unit suite green (the moved oracle test + new tests + the existing `no-adapter-imports` pin still passes — wiring importing adapters is allowed; pages importing them would now FAIL the suite, which is the proof the breach is closed).
- Grep proof: `grep -rn "lib/printing/sunmi\|lib/printing/labelFetch" app/ components/ lib/` returns NOTHING (both files deleted, no stragglers). **Grep BOTH alias and relative forms** (`@/lib/printing/...` AND any `../printing/...`) — lesson from F-TD-12 where a relative import slipped past the alias-only grep; trust `tsc` as the backstop.

🗣 Final check: the compiler and linter are happy, every test passes, and a search
proves no screen still reaches at the old printer files.

---

## TDD test plan (matrix — ANVIL writes/runs; this scopes it)

| Layer | What | How | Status target |
|---|---|---|---|
| Unit — Browser classifier | `classifyLabelResponse` all shapes | MOVED oracle test, assertions unchanged | green (oracle proves no behaviour change) |
| Unit — Sunmi pure helpers | `formatBornLine` / `formatTempStatus` / `formatSpecies` | direct unit tests | green |
| Unit — Fake + contract | port-level guarantees (resolves, onError on failure, no throw) | `printerContract` against Fake (PushSender.contract pattern) | green |
| Unit — Wiring selection | V3-58mm-delivery→native · native-throws→fallback · V3-100mm→browser · V3-mince→browser · browser-device→browser | fake `window.MFSSunmiPrint` + stub bridge + fake fallback | green (this is the only NEW logic) |
| Lint pin | `no-adapter-imports` still green; pages no longer import adapters | existing suite | green |
| E2E (existing, NOT new) | iframe print path on delivery + mince | existing `@critical` Playwright | green, unchanged |

**Explicit ANVIL scoping (right-size — precedent F-26):**
- The **native print** (real `window.MFSSunmiPrint.printDeliveryLabel`) and the
  **real iframe print** (`window.print()` dialog) are NOT unit-testable (no native
  bridge in CI; jsdom can't drive a print dialog). Because the bridge + iframe code
  is **MOVED not changed** and behaviour is byte-identical, the existing `@critical`
  E2E covers the iframe path and **NO NEW on-device test is required for Pass 2a**
  (on-device verification is Pass 2b/APK territory).
- This mirrors F-26: structural mitigation (verbatim move + real reads under fakes)
  + existing E2E, rather than buying a new test stack.
- **NO DB migration, NO RLS, NO pgTAP, NO integration-DB run, NO PITR gate** — this
  unit touches zero database/API surface. ANVIL right-sizes to **unit + tsc + lint +
  existing E2E**. A one-off browser tap of the delivery 58mm/100mm + mince buttons on
  a preview is a reasonable confidence extra (not mandatory) — it is NOT the
  exhaustive every-button sweep (no UI/RLS/auth change).

🗣 In plain English: test the parts we *can* test (the picking logic, the formatters,
the classifier) hard; for the actual physical printing — which we only moved, didn't
change — lean on the test that already exists. Don't build an Android-printer test rig
for a unit that ships no APK.

---

## Acceptance criteria

1. `app/haccp/delivery/page.tsx` and `app/haccp/mince/page.tsx` import ZERO
   `lib/adapters/**` and ZERO `lib/printing/{sunmi,labelFetch}` — they go through
   `lib/wiring/printer.ts` only. (grep + lint proof.)
2. `lib/printing/sunmi.ts` and `lib/printing/labelFetch.ts` are DELETED; the
   renderer files (`index/html/zpl/types.ts`) and `app/api/labels/route.ts` are
   UNTOUCHED (`git diff` shows no change to them).
3. The `/api/labels` URLs (delivery + mince, both widths) are byte-identical to
   today: `copies=1`, same param order, same `usebydays`/`width` values.
4. Printing behaviour byte-identical: V3-58mm-delivery→native silent (fallback on
   throw); V3-100mm→iframe; V3-mince→iframe; iPad/browser→iframe; onError→submitErr
   messages unchanged.
5. The moved classifier oracle test passes with assertions unchanged.
6. The wiring selection/fallback test passes all five cases.
7. `tsc`, `next lint`, full unit suite, and the existing `@critical` E2E all green.
8. ZERO new `package.json` entries (`git diff package.json` empty).
9. ADR-0010 status = Accepted.
10. No AI references anywhere in the diff, commits, or PR.

🗣 In plain English: the screens no longer touch printers directly, the old files
are gone, nothing about *what prints* changed, the label-drawing code is untouched,
no new libraries, and the decision log is stamped.

---

## Risk Assessment (MANDATORY)

### Concurrency / race conditions
- **No new concurrency.** The print flow is the same single-shot user-tap → fetch →
  iframe/native as today. The only ordering change is the native→fallback handoff,
  which is the same `.catch(...)→printLabelInApp(...)` sequence as today, just moved
  inside the Sunmi adapter. **Severity: none. Must-fix: no.**
  🗣 Nothing runs in parallel that didn't before; the "try native then fall back"
  order is preserved exactly.

### Security
- **No new attack surface.** No new dependency, no new network call, no new env var,
  no auth/RLS change. `/api/labels` is unchanged and still middleware-gated; the
  Pass-1 auth-bounce classifier (the load-bearing "don't print the login page"
  guard) moves **verbatim** and is pinned by the moved oracle test.
  **Severity: none. Must-fix: no.**
  🗣 We're shuffling files, not opening doors; the "never print the login page" safety
  check moves untouched and stays tested.
- **Watch item (LOW, not must-fix):** the classifier's documented ASSUMPTION —
  that `/api/labels` lives in `SHARED_API_PATHS` so a dead session bounces to
  `/login` — must be carried into the new file's comment verbatim. If a future unit
  role-gates `/api/labels`, the bounce detection needs extending. This is unchanged
  from Pass 1; just don't drop the comment in the move. **Severity: low. Must-fix: no.**

### Data migration
- **None.** No DB, no schema, no migration file. **Severity: none. Must-fix: no.**
  🗣 The database is not touched at all.

### Business-logic flaws (the real risk area for a refactor)
- **R1 — URL drift (MEDIUM).** If the relocated Browser adapter builds the
  `/api/labels` query string with a different param order or omits `copies`, the
  server still renders (params are read by name) BUT the change is no longer
  byte-identical and a future diff/regression check could mislead — and a subtle
  typo (`usebydays` vs `use_by_days`) would silently change the printed use-by date,
  a **food-safety** consequence on the mince label. **Mitigation:** Step 2 pins the
  exact strings; acceptance criterion 3 + a focused assertion that the constructed
  URL equals the literal current string. **Severity: medium. Must-fix: NO** (mitigated
  by the explicit byte-for-byte step + criterion), **but flag to implementer as the #1
  thing to get exactly right.**
  🗣 The riskiest part of a "move, don't change" job is fumbling the printed-label web
  address — especially the use-by-days number on the mince label. The plan nails the
  exact text and the test checks it.
- **R2 — fallback path regression (MEDIUM).** The native→fallback handoff is the most
  intricate moved logic (today: `printDeliverySunmi(...).catch(() => printLabelInApp(58mm))`).
  If the relocated Sunmi adapter forgets the `.catch`, a native printer fault would
  no longer fall back to iframe — staff lose printing on a real device with no error.
  **Mitigation:** Step 4 specifies the exact catch+delegate; Step 8 test case
  "native throws → fallback called" pins it. **Severity: medium. Must-fix: NO** (test
  pins it), **flag to implementer.**
  🗣 If the native printer jams, today it quietly switches to the browser printer. We
  must keep that catch-and-retry; there's a test that fails if it's lost.
- **R3 — 100mm accidentally routed to native (LOW).** If the width gate
  (`width === '58mm'`) is fumbled, a 100mm delivery could hit the native 58mm bridge
  → wrong-size/garbled label. **Mitigation:** the gate is explicit in Step 4; Step 8
  case "V3-100mm→browser" pins it. **Severity: low. Must-fix: no.**
  🗣 Big labels must never go to the small native printer; the size check and a test
  enforce that.

### Launch blockers
- **SSR safety (LOW, but a real Next.js footgun).** `lib/wiring/printer.ts` is
  imported by client pages; if it touched `window` at module load it would crash SSR.
  **Mitigation:** the factory defers `isSunmiNative()` to call-time (Step 7), exactly
  mirroring the F-26 `localCache.ts` precedent; `'use client'` + lazy construction.
  `tsc` + the existing E2E (which renders the pages) catch a regression. **Severity:
  low. Must-fix: no** (designed out).
  🗣 The parts list must not poke at the browser when the page is built on the server,
  or the page white-screens. We copy the proven F-26 pattern that already avoids this.

### Risk headline
**NO must-fix (Gate-2-blocking) risks.** The two MEDIUM business-logic risks (URL
drift R1, fallback regression R2) are mitigated by explicit byte-for-byte steps and
named test cases, not left to implementer judgment. Implementer must treat R1 and R2
as the two "get this exactly right" items.

🗣 In plain English: nothing here blocks the gate. The two things most likely to bite
a refactor — fumbling the label's web address (incl. the food-safety use-by number)
and dropping the native-printer fallback — are spelled out step-by-step and each has
a test that fails if it's wrong.

---

## Hexagonal verdict (computed — populates Gate 2)

- **Port used/added:** NEW port `Printer` (`lib/ports/Printer.ts`) — the client-side
  "get a label onto paper" transport seam. The renderer stays deliberately port-less
  (pure, no vendor — per ADR-0010 §2; wrapping it would fail the deletion test).
- **Adapters implementing it:**
  - `lib/adapters/sunmi/Printer.ts` — native `window.MFSSunmiPrint` bridge; native
    path for 58mm delivery only; delegates everything else + any native throw to an
    **injected** fallback printer.
  - `lib/adapters/browser/Printer.ts` — fetch + hidden-iframe + `window.print()`
    (AirPrint/browser); both label types, all widths; the universal fallback.
  - `lib/adapters/fake/Printer.ts` — in-memory Fake for the shared contract.
- **Wiring:** `lib/wiring/printer.ts` `getPrinter()` — the sole adapter-importing
  business file (F-TD-11 composition root), device-selected at call-time, injecting
  Browser as Sunmi's fallback (no adapter-to-adapter import).
- **New dependencies:** **ZERO.** `package.json` unchanged. No vendor added; both
  "vendors" (the native bridge and the browser print API) are platform APIs already
  used, now wrapped behind owned adapters. **Wrapping requirement: satisfied** — the
  native bridge (`window.MFSSunmiPrint`, single-use) sits behind `lib/adapters/sunmi/`,
  exactly as the single-use-vendor rule requires.
- **Rip-out test:** **PASS.** Adding a future Zebra printer = one new
  `lib/adapters/zebra/Printer.ts` + one line in `lib/wiring/printer.ts`. The port, the
  two existing adapters, both screens, and the renderer do not change. (Zebra is NOT
  built in this unit.)
- **Breach closed:** after this unit, `app/**`/`components/**` import ZERO
  `lib/adapters/**` and ZERO `lib/printing/{sunmi,labelFetch}` — the direct
  native-SDK-from-UI breach (ADR-0010 Context) is gone.

🗣 In plain English: one new socket "print a label," two plugs (native Android +
browser iframe) plus a pretend plug for testing, one parts list that picks the right
plug per device. No new libraries. A future printer is a one-file-plus-one-line add —
the rip-out test passes. And the screens stop reaching into the printer's wiring,
which was the whole point.

---

## Rollback note

Pure refactor on its own branch — rollback is `git revert` of the squash-merge (or
delete the branch pre-merge). No DB migration, no data change, no config/env change,
no `package.json` change → nothing to un-migrate or re-provision. Because behaviour
is byte-identical, a revert restores the exact prior printing paths. If a regression
surfaces post-merge on-device (native print), the device-level band-aid is unchanged
from Pass 1 (re-login), and the revert fully restores `lib/printing/{sunmi,labelFetch}.ts`.

🗣 In plain English: if anything's wrong, undo the one merge — there's no database or
config to unwind, and undoing it puts the old printer files back exactly as they were.
