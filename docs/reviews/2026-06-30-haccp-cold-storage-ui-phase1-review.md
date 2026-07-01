# Code-critic review — HACCP cold-storage UI Phase 1 rebuild

**Branch:** `feat/haccp-cold-storage-ui-phase1` vs `main` · **Date:** 2026-06-30 · **Phase:** FORGE Guard
**Verdict:** **NO BLOCKERS — hand to ANVIL.** Presentation + one server-validation fix + a domain helper. No migration/RLS/dep.

## Test / lint / type (run by code-critic)
- `tsc --noEmit` clean · `next lint` (6 changed files) clean
- domain + NumberPad + service unit/component: 40/40 · kit guards (`reusable-visual-in-kit` + `semantic-tokens-only`): 5/5
- Deferred to ANVIL (correctly): integration (needs local Supabase) + @critical e2e (needs preview/stack)

## The three confirm-or-refute items
1. **Both new causes file a COMPLETE corrective action — CONFIRMED.** `validateColdStorage:1074` checks the Set built from the shared 8-cause list (`:116`); `buildColdStorageCorrectiveActions:1108` → `deriveColdStorageAction:1132` — the 2 new causes aren't "Equipment failure" so they hit the generic chiller/freezer protocol branch (`:299-301`) = non-empty `action_taken`; `product_disposition` is keyed by **disposition not cause** (`DISPOSITION_MAP`, `:1141`) so no cause-keyed gap. Pinned by a build-emits-CA test (`action_taken.length>0` + `product_disposition==='conditional_accept'`).
2. **Cause list single-source — CONFIRMED.** One definition: `COLD_STORAGE_CAUSES` (`lib/domain/coldStorage.ts:22`); page imports it (`page.tsx:32→142`), server derives its allow-list from it (`:116`); old 6-item Set deleted. Pinned structurally + byte-for-byte (em-dash U+2014).
3. **No hardcoded colour survives — REFUTED (none).** Grep for hex/`bg-[#…]`/`bg-slate-*`/`bg-orange-*`/`text-white`/`bg-black`/numbered palette = zero in `page.tsx` + `NumberPad.tsx`. `semantic-tokens-only` passes.

## Depth verdicts
- `components/ui/NumberPad.tsx` → **DEEP** — semantic-intent interface hides grid, sign-OR-decimal slot logic, leading-zero replacement, confirm-gate-by-bound, out-of-range hint, haptics, a11y, backspace. Pure reducers (`pressNumberPadKey`, `isNumberPadValueConfirmable`) carry real branching. Sibling to PinKeypad. Not a pass-through/speculative seam.
- `lib/domain/coldStorage.ts` → **PASS (intentionally thin, justified)** — shared constant + pure predicate; deletion test = the duplication-bug returns. Concentrates a shared invariant.

## Hexagonal / boundary
`lib/domain/coldStorage.ts` pure TS, zero imports. `page.tsx` imports only react/`@/components/ui`/`@/lib/domain` — no adapter/port import. No new port/adapter, **`package.json` untouched**, rip-out N/A.

## `unit_type` removal — SAFE
Removed from `ColdStorageReadingInput` (request). No server path read it (only `ColdStorageUnit.unit_type` DB row + `worstUnit?.unit_type` from the DB-derived map). tsc clean; fixtures updated.

## Entry bound (−40…+30°C) — correct & placed
Pure shared `isColdStorageTempInRange` used by client Confirm-gate (NumberPad min/max) AND server echo (`Service.ts:1061`), precedence: missing-fields/today → unit-known (`:1051`) → bound (`:1061`) → CA-payload (`:1066`). Doesn't touch pass/amber/critical (DB-driven). Pinned.

## 🟡 Warning (acted on this branch)
**`app/haccp/cold-storage/page.tsx:423` — out-of-range value can reach Submit if the pad is dismissed without Confirm.** Typing writes to `temps` immediately (no draft buffer); Confirm is bound-gated, but dismissing the modal via the scrim (`onOpenChange:610`) leaves an out-of-range value in state → card shows it, Submit enables, only the **server** rejects with a top-level "out of range" banner (defense-in-depth holds — no bad data persists). The added entry-bound feature's intent was "a fat-finger can't be entered/submitted," so this is a real polish. **→ FIXED in this branch: the open pad edits a local DRAFT and only commits to `temps` on Confirm (already range-gated), so an out-of-range/abandoned entry is discarded on dismiss.**

## 🟢 Notes (informational)
- `NumberPad.tsx:156` — the slot between 9 and 0 is decimal OR sign, never both → freezers (`allowNegative`) can't enter decimals (integer-only freezer temps, e.g. no `-18.5`). Accepted design (±1°C bands); flag for product confirmation.
- `NumberPad.tsx:62-68` — `pressNumberPadKey('-0','5')` → `'-05'`; `parseFloat` normalises to `-5` for the card + POST; only the live readout briefly shows the cosmetic leading zero. Negligible.
- Test quality strong — behaviour-through-public-interface, `it.each` for both new causes, negative case (junk cause still rejected), structural de-drift pin, real red-green.

## E2E behaviour-preservation (`tests/e2e/13-haccp-cold-storage.spec.ts`, @critical, CI-blocking) — PRESERVED
Rebuilt markup satisfies every selector: `SegmentedControl` AM/PM real buttons (glyph aria-hidden); `NumberPad` `div.grid.grid-cols-3` with backspace last + Confirm sibling `Confirm <v>°C`; digit `onPointerDown` (Playwright `.click()` dispatches pointerdown); placeholders/labels/`"Session submitted"` preserved. Admin-queue selector targets `/haccp/admin` (not in diff).
