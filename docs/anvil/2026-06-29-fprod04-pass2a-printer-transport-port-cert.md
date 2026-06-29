# ANVIL Clearance Certificate

Date: 2026-06-29
App: MFS-Operations (MFS Global Ltd — internal operations / HACCP app)
Branch: fprod04-pass2a-printer-port
PR: #99 (base `main`)

> Issued by the ANVIL runner; finalized by the conductor at Lock (ran the one
> handed-back static-lint sub-check — `next lint` clean). Ship decision is Hakan's.

## Scope — what this certificate actually covers

F-PROD-04 Pass 2a is a **refactor-only** unit: introduce an owned `Printer` transport
port and relocate the two client-side printing files behind it. Printing behaviour is
byte-identical (locked by the R1 URL byte-identity tests). The native Sunmi code was
MOVED, not changed.

🗣 In plain English: we moved the printing code behind a clean "socket" so the screens no
longer reach straight at the device's printer SDK — but what gets printed, and how, is
character-for-character the same as before.

| Change / path                                   | Risk tier | Layers required                | Layers run                          |
| ----------------------------------------------- | --------- | ------------------------------ | ----------------------------------- |
| `lib/ports/Printer.ts` + contract (new port)    | Med (seam)| Unit + architecture (fake)     | Unit ✓ + domain-fake contract ✓     |
| `lib/adapters/browser/Printer.ts` (relocated)   | Med       | Unit (R1 URL byte-identity)    | Unit ✓ (11/11, incl. 3 byte-ident)  |
| `lib/adapters/sunmi/Printer.ts` (relocated)     | Med       | Unit (helpers + bridge detect) | Unit ✓                              |
| `lib/adapters/fake/Printer.ts` (new test fake)  | Low       | Unit (port contract)           | Unit ✓                              |
| `lib/wiring/printer.ts` (device select+fallback)| Med       | Unit (R2 native→fallback, 5)   | Unit ✓ (6/6)                        |
| `app/haccp/delivery/page.tsx` (re-pointed)      | Med (UI)  | Browser-tap (print flow)       | Preview render ✓ + CI smoke ✓       |
| `app/haccp/mince/page.tsx` (re-pointed)         | Med (UI)  | Browser-tap (print flow)       | Preview render ✓ + CI smoke ✓       |
| `docs/adr/0010-*` (decision record)             | n/a       | none                           | n/a                                 |

**Not run under the efficiency dial:** Integration (Vitest), pgTAP/RLS, Edge (Deno),
local Docker full-stack rung, breadth crawl — **n/a — not required**: zero DB surface
(no migration, no RLS, no API change), no edge functions touched, and the matrix
approved by the conductor at Gate 1 scopes this refactor to Unit + E2E @critical +
focused browser-tap only. No DB layer was invented.

**Baseline characterisation pass?** No — diff-driven matrix on a behaviour-preserving refactor.

## Architecture rung (change crosses a seam)

- New `Printer` port (`lib/ports/Printer.ts`) has a domain-only contract test via an
  in-memory Fake (`lib/adapters/fake/Printer.ts`) — `tests/unit/adapters/fake/Printer.test.ts` ✓.
- No vendor SDK imported in any domain/port test. The native Sunmi bridge
  (`window.MFSSunmiPrint`) is a faked global in the wiring test, not a real SDK import.
- `tests/unit/lint/no-adapter-imports.test.ts` (164 assertions) green — confirms the two
  HACCP screens no longer import a vendor/adapter directly (the breach this unit closes).
🗣 In plain English: the new "socket" was proven swappable — the core was tested against a
pretend printer, no real device SDK leaked into the core, and the screens now go through
the socket instead of grabbing the device directly.

## Test Results

| Layer                       | Status                | Notes                                                                 |
| --------------------------- | --------------------- | --------------------------------------------------------------------- |
| Unit (Vitest)               | ✅ 2973/2973 passed   | Full suite, 226 files. Affected set: 164/164 across the 6 named files. |
| — R1 URL byte-identity      | ✅ 11/11 passed       | browser Printer: 3 byte-identical URL assertions (delivery 58/100 + mince usebydays) + 8 classifier cases. |
| — R2 native→fallback        | ✅ 6/6 passed         | wiring/printer: device selection + 4 delegation cases (native jam → iframe fallback) + no-bridge selection. |
| TypeScript (tsc --noEmit)   | ✅ clean (exit 0)     | Covers unused imports / type errors across touched files.             |
| ESLint (`next lint`)        | ✅ clean              | Run by the conductor (`npx next lint` → "No ESLint warnings or errors") — runner's sandbox had denied ESLint; conductor executed it at Lock. |
| Integration (Vitest)        | n/a — not required    | Zero DB surface.                                                      |
| Database (pgTAP)            | n/a — not required    | No migration, no RLS change.                                         |
| Edge Functions (Deno)       | n/a — not required    | No edge functions touched.                                           |
| Local full-stack rung       | n/a — not required    | No DB/integration surface to run against local containers.           |
| E2E @critical (Playwright)  | ✅ 78/78 passed       | CI `smoke` (run 28400850484), head `c66d1d1` == local HEAD, against the real Vercel preview + Supabase preview branch. Includes print specs 76–78 (dead-session suppress + valid-session real label + mince print). |
| Populated UI smoke          | ✅ both screens 200   | `/haccp/delivery` + `/haccp/mince` render on the preview, serving the relocated page chunks, no error boundary. |
| Browser-tap (focused)       | ✅ print path live    | `/api/labels?type=delivery…` (no session) correctly bounces to `/login` (`x-matched-path: /login`) — the relocated transport's `auth-bounce` classification confirmed on the real preview. Valid-session real-label + mince print proven by CI smoke specs 77/78. |
| Breadth crawl               | n/a — not required    | Refactor confined to two print flows; full-app crawl out of scope per approved matrix. |

## Load-bearing risk results (called out explicitly)

- **R1 (mince `usebydays` URL fidelity — wrong use-by on a meat label = food-safety
  consequence):** ✅ PASS. The 3 byte-identity assertions prove the relocated browser
  adapter builds delivery (58mm + 100mm) and mince URLs character-for-character identical
  to the pre-refactor literals, with `usebydays` and `width` preserved.
- **R2 (native-printer-jam → iframe fallback):** ✅ PASS. 5 cases prove device selection
  (Sunmi bridge present → Sunmi; absent → Browser) and that a thrown native print falls
  through to the browser iframe adapter with the same input + `onError`.

## Out of scope (deliberate, documented deferral — NOT a blocking gap)

- **Physical Sunmi V3 native print path** — needs the device in hand; deferred to
  Pass 2b. The 2a native code was MOVED, not changed; the selection→fallback logic is
  unit-tested against a faked `window.MFSSunmiPrint`. That is the correct 2a proof.
🗣 In plain English: we can't tap the real handheld scanner's built-in printer from a
server — that hands-on check is a separate later pass. We proved the decision logic
around it with a stand-in, which is all this pass claims to cover.

## Warnings (non-blocking)

None.

## Migration

None. Additive code-only refactor, zero DB surface.
Rollback note: docs/anvil/2026-06-29-fprod04-pass2a-printer-transport-port-rollback.md
PITR confirmed: N/A (no migration).

## Merge Sequence

No migration step. Standard:
1. Merge PR #99 → Vercel auto-deploys (no `supabase db push` — nothing to push).
2. Post-deploy smoke: `/haccp/delivery` + `/haccp/mince` load + a label print on a live
   logged-in session (the CI @critical print specs already cover this on the preview).
3. If anything wrong → `git revert -m 1 <merge-sha>` (no DB rollback needed).

## Manual smoke at merge

**Not strictly required for the refactor's correctness** — critical print flows proven
on the real preview environment (CI @critical 78/78, incl. the three print specs), both
screens render, and the auth-bounce guard is confirmed live. The one honest residual is
the **physical Sunmi native print**, which is an explicit Pass-2b deferral, not a gap in
2a's scope.

🗣 In plain English: you don't need to hand-click the web app to be confident this is
safe — the print buttons were exercised against the live preview. The only thing left
un-clicked is the physical handheld printer, which we already agreed is a later pass.

## Lock — conductor confirmation

1. `next lint` run from the conductor shell at Lock → **"No ESLint warnings or errors"**.
   This was the single rung the runner's sandbox could not execute (established
   "sandbox-denied rung → conductor runs it" pattern). Now clean.

## Verdict

✅ CLEARED FOR PRODUCTION

(All rungs passed — every runnable rung green under the runner, plus `next lint`
confirmed clean by the conductor at Lock. No conditional remains.)
