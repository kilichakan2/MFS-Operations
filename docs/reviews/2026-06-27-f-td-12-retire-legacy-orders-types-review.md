# FORGE Guard — Code Review: F-TD-12 (retire legacy `lib/orders/types.ts`)

**Date:** 2026-06-27
**Branch:** `feat/f-td-12-retire-legacy-orders-types` · **PR #90** · **Commit `06fc7d6`** · base `main`
**Reviewer:** code-critic subagent (FORGE Guard phase — sole review authority)
**Plan:** `docs/plans/2026-06-27-f-td-12-retire-legacy-orders-types.md`

## Verdict: NO BLOCKERS — handed to ANVIL

Pure type-rename + dead-file deletion, zero behaviour change. The 4 relocated helpers are byte-for-byte identical to the deleted source, the canonical types now live in one place, nothing references the deleted file, and tsc/lint/tests are green.

## Test / lint / typecheck results (actual)

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | **0 errors** (exit 0) |
| `npx vitest run tests/unit/orders/types.test.ts` | **13/13 passed** |
| `npm run lint` (`next lint`) | **No ESLint warnings or errors** |

## Findings (graded)

1. **Byte-equivalence of relocated helpers — 🟢 GOOD.** `diff` of `lib/domain/orderReference.ts` vs `git show main:lib/orders/types.ts` (helper blocks) = zero differences. Regex `/^MFS-(\d{4})-(\d{4})$/`, `parseInt(...,10)`, `padStart(4,'0')`, and the `isValidStateTransition` table (`placed→printed`, `printed→completed`, `from===to` false, all else false) character-for-character identical.
2. **Domain-layer purity — 🟢 GOOD.** `lib/domain/orderReference.ts:11` has exactly one import: `import type { OrderState } from './Order'` (type-only sibling-domain). No framework/vendor/outward import.
3. **Duplication removed — 🟢 GOOD.** `type OrderState` / `type OrderUom` each return exactly one hit across `lib/ app/ components/`: `lib/domain/Order.ts:44` and `:54`. Deprecation prose describing the old duplication removed.
4. **No stray reference to the deleted file — 🟢 GOOD.** `grep -rn "lib/orders/types"` across app/lib/components/tests = 0 hits. The `'./types'` grep matched only `lib/printing/{zpl,html,index}.ts` → `lib/printing/types.ts` (unrelated label-printing module), not orders.
5. **Name-collision trap respected — 🟢 GOOD.** `lib/adapters/supabase/OrdersRepository.ts` and `lib/ports/OrdersRepository.ts` NOT touched (`git diff --name-only`). The UI-local `OrderRow` in `app/orders/page.tsx:56` intact (only the import line changed). All three same-named-but-unrelated declarations left alone.
6. **Each re-point is type-only — 🟢 GOOD.** All 9 edits are single import-line swaps preserving the `import type` modifier (5 UI pages, `EditLockBanner.tsx`, 3 lib modules). No surrounding runtime code changed.
7. **Test quality — 🟢 GOOD.** `tests/unit/orders/types.test.ts` re-points imports only; all 13 assertions unchanged. Exercises helpers through public exports (regex match/reject, parse valid/null, format padding + round-trip + over-9999 non-truncation, full transition table). Genuine byte-equivalence oracle.

## Architecture depth note
`lib/domain/orderReference.ts` is a thin pure-helper module, but it is a RELOCATION of pre-existing real logic, not a new seam this diff invented, and it is appropriately pure-domain. No PASS-THROUGH / SPECULATIVE-SEAM defect. No depth blocker.

## Severity tally
- 🔴 Blockers: **0**
- 🟡 Warnings: **0**
- 🔵 Architecture notes: **0**
- 🟢 Good: **7**

## Verdict line
No blockers — hand to ANVIL. Byte-equivalence verified by `diff`, domain purity intact, single canonical type declaration, zero dangling references, collision trap respected, all 9 re-points type-only, test oracle preserved; tsc 0 / 13 tests green / lint clean.
