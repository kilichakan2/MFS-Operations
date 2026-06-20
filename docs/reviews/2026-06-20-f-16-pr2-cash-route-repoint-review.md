# F-16 PR2 — Cash route re-point — Guard (code-critic) review

**Date:** 2026-06-20
**PR:** #60 · branch `feat/f-16-pr2-cash-route-repoint` (commits `ee96690`..`50bf9dd`, base `main`)
**Reviewer:** code-critic (FORGE Guard)
**Verdict:** **SHIP-WITH-NITS — no blockers.** Hand to ANVIL once `tsc`/`lint`/unit/integration actually run green (the critic's env blocked execution; the conductor closes this via the Render nit-loop).

---

## Verdict summary
No merge-blocking defect. Wire byte-identity holds for all 8 routes; the two sanctioned micro-changes (D2 500→404, R-WIRE-7 500-body) are correctly and narrowly implemented; hexagonal rules honoured; frozen foundation intact (only the sanctioned `month_`→`monthRecord` rename). Two low-severity warnings + test gaps below.

## 🔴 Blockers
None.

## (a) Byte-identity — HELD for every route
DTO key SET + key ORDER verified against DB column order (baseline `20260101000000_baseline.sql`) and the original route response literals (`git show main:...`):
- `toMonthWireDto` (`lib/api/cash/dto.ts:153`) → `id, year, month, opening_balance, is_locked, created_by, created_at` = `cash_months` column order = original `month: monthRow` (`select('*')`). ✓
- `toEntryListWireDto` (`dto.ts:186`) → original `{ ...e, signed_url, created_by_name, edited_by_name, customer_name }`, vestigial join objects dropped per §15.2. ✓
- `toEntryCreateWireDto` (`dto.ts:213`) → original ENTRY_COLS_CREATE order; correctly omits `edited_at`/`edited_by_name`. ✓
- `toEntryEditWireDto` (`dto.ts:240`) → bare `cash_entries` order; `created_by`/`edited_by` FK ids dropped (D-EDIT-A). ✓
- `toChequeWireDto` (`dto.ts:262`) → original explicit GET/POST literal order. ✓
- `toChequeEditWireDto` (`dto.ts:287`) → bare `cheque_records` order; `driver_id`/`logged_by`/`banked_by` dropped (D-EDIT-A). ✓
- `toSummaryWireDto` (`dto.ts:171`) → `opening, total_income, total_expense, closing`. ✓
- Export CSV (`app/api/cash/export/route.ts`): gates, headers, builders verbatim; customer-cell source matches. ✓

**No wire divergence beyond the two sanctioned micro-changes** (and the one newly-surfaced 🟡 amount-message edge, below).

## (b) Sanctioned micro-changes — correctly scoped
- **D2 (500→404):** fires ONLY on `null` service return at `month/[id]/route.ts:35`, `entry/[id]/route.ts:44`, `cheques/[id]/route.ts:54`, each `404 { error: '<resource> not found' }`. Cheque **bank** keeps its own `404 'Already banked or not found'` (`cheques/[id]/route.ts:36`). ✓
- **R-WIRE-7:** outer `catch` returns `{ error: 'Server error' }` @500; inner vendor `error.message` 500s gone (adapter throws `ServiceError` → outer catch). ✓

## (c) Hexagonal — PASS
- 0 `supabase`/`@/lib/adapters` hits across `app/api/cash/`; all 8 routes import `cashService` from `@/lib/wiring/cash`. ✓
- `package.json` untouched; no `.sql`. ✓
- Frozen foundation: `CashService.ts` diff = ONLY the `month_`→`monthRecord` rename (no logic) + test rename (no new assertions). `lib/domain/Cash.ts`, ports, adapters unmodified. ✓
- `discrepancy/route.ts` untouched; no `cashServiceForCaller` added. ✓
- Rip-out test PASS; coupling improves.

## (d) Depth — DTO seam is DEEP (justified, not pass-through)
`lib/api/cash/dto.ts` concentrates the snake_case + key-order + raw-row-reconstruction contract for 8 routes; deletion smears it back into all 8 routes. Consistent with `lib/api/pricing/dto.ts` / `orders/dto.ts`. ✓

## (e) Test quality — STRONG, with gaps
- `tests/unit/api/cash.dto.test.ts`: populated rows, `Object.keys().toEqual()` key-ORDER on every shape, explicit `in`-checks for dropped keys. ✓
- `tests/integration/cash.test.ts`: exact key SET+ORDER, R-WIRE-1 number types, CSV markers/headers/filenames, 409 dup, first-month 400, null→404s, entry+cheque D2 404s. ✓

---

## 🟡 Warnings (should-fix, non-blocking)
1. **Tests not executed in the critic's env** (`tsc`/`lint`/`vitest` Bash blocked). Manual grep confirmed 0 supabase refs + `ConflictError` exported. **Conductor must run them green before merge** (acceptance #5). → closed by the Render nit-loop re-run.
2. **`amount` validation message divergence** — `entry/route.ts:35`, `cheques/route.ts:58`. Routes now compute `amount: Number(amount)` BEFORE validation; service checks `!input.amount`. Original checked `!amount` on the RAW body then `Number(amount) <= 0`. For raw string `"0"`: original → 400 `"amount must be positive"`; new → 400 `"...required"`. For `"abc"`: original passed the amount gate then hit a DB error; new → 400 `"...required"`. Both stay 4xx but it's an unsanctioned message change. **Disposition: FIX to restore original messages** (user can type 0 → arguably reachable; byte-identity is the promise).

## 🔵 Architecture notes
None.

## 🟢 Test-quality follow-ups
1. **No integration test for month-lock PATCH** (`/api/cash/month/[id]`) — neither the happy `{ month: <lossless row> }` shape (§15.5) nor its D2 404. §15.6 wanted all three D2 404s pinned. **Disposition: ADD** (happy-path key SET/ORDER + missing-id 404 `'Month not found'`).
2. `tests/integration/cash.test.ts:256-288` first-month-400 setup does a global `DELETE` on `cash_months`/`cash_entries`. Fine for serial local runs; consider scoping to a 2099 year-space if it ever runs alongside other cash fixtures. (Optional, not actioned.)
3. DTO unit test has no null-variant case (`customer: null`, `bankedAt: null`); integration partially covers. Optional hardening.

---

## Conductor disposition
No blockers. Looping back to **Render** for two bounded fixes — (🟡#2) restore original amount-validation messages, and (🟢#1) add the month-lock PATCH integration test (happy + D2 404) — then re-run the full suite green (closing 🟡#1). Lightweight conductor verification of the delta (test + localized message), then advance to ANVIL. 🟢#2/#3 left as optional.
