# FORGE Guard review — F-16 PR1 Cash domain foundation (PR #59)

**Date:** 2026-06-22
**Branch:** feat/f-16-pr1-cash-domain
**Reviewer:** code-critic (FORGE Guard)
**Verdict: CLEAR-WITH-NITS — no blockers → hand to ANVIL**

Pure hexagonal extraction of the Cash domain. ZERO behaviour change, introduce-only:
no route edited, no migration, no DB/RLS change. New cash code has no production caller
yet (PR2 wires routes). Mirrors the shipped F-13 (Users) / F-15 PR1 (Pricing) template.

## Priority checklist (explicit yes/no)

1. **Introduce-only contract held? — YES.** `git diff` touches NO `app/**` and NO
   `supabase/migrations/**`. Non-`lib/` additions are only a docs plan + 2 test files.
   All 5 barrel edits are purely additive (appended `export` lines only; nothing
   removed/reordered).
2. **Hexagonal / dependency rules? — YES.** `lib/domain/Cash.ts` + both ports import only
   `@/lib/domain` (zero adapter/vendor imports). `CashService.ts` depends on the two ports
   only, never `@supabase/*`. `@supabase/supabase-js` appears only in the two
   `lib/adapters/supabase/*` files. `lib/wiring/cash.ts` is the sole adapter importer.
   `CashService` exported as factory (`createCashService`); the only pre-wired singleton is
   in wiring. Vendor snake_case never escapes — adapters map every column to camelCase via
   `toMonth`/`toEntry`/`toCheque`. Lint (incl. F-TD-11 no-adapter-imports rule) clean.
3. **Behaviour fidelity? — YES**, cross-checked against all 8 source routes. CSV builders
   character-for-character (CRLF joins, `£${Math.abs(n).toFixed(2)}`, dd/mm/yy +
   dd/mm/yy HH:MM, LOCKED/Open footer, `--------` separators, 8-col cash / 9-col cheque,
   `—` customer fallback). closingBalance / monthSummary / suggested-opening math identical.
   Entry + cheque validation cascades reproduce route order + exact error strings.
   income→null category / expense→null customer shaping preserved in both adapters.
   Local-time `new Date()` calendar check preserved (injected as `now`, NOT `londonToday`).
   Upload mime list + 10MB gate + `${userId}/${Date.now()}.${ext}` path preserved.
   All `.select(...)` projection strings copied verbatim into named constants.
4. **Depth? — YES**, all DEEP / justified (verdicts below).
5. **Test quality? — YES.** Golden CSV tests assert exact strings (not tautologies); every
   validation branch covered in order; upload boundary cases (exactly 10MB, no-dot filename,
   trailing-dot) pinned; deleteEntry remove-before-delete verified via fake's `removed` spy;
   wiring test pins full method surface + per-call distinctness.
6. **Conventions? — YES**, with one 🔵 on `month_`. Naming matches F-13/F-15.

## Test / lint / typecheck

- `tsc --noEmit` — PASS, 0 errors.
- `next lint` (incl. no-adapter-imports rule) — PASS, 0 warnings/errors.
- `vitest run` (full unit suite) — PASS, **1972/1972** across 112 files.
- Targeted CashService + wiring + no-adapter-imports — 93/93.
- No new `package.json` dependency.

## Depth verdicts (new modules)

- `lib/services/CashService.ts` → **DEEP** — two CSV builders, two validation cascades,
  upload policy, deleteEntry two-port composition, balance math behind one object. Deletion
  test concentrates complexity here (not a pass-through like PricingService).
- `lib/ports/CashRepository.ts` → **DEEP** — 18 business-named ops over 3 tables; each maps
  1:1 to a real PR2 route surface. No speculative method.
- `lib/ports/AttachmentStorage.ts` → **DEEP / justified seam** — one real adapter (Supabase
  Storage) + a fake. The app's only file-storage dependency = a proven swap point, not
  speculative. Rubric allows one genuinely-substitutable impl.
- `lib/adapters/supabase/CashRepository.ts` / `AttachmentStorage.ts` → **DEEP** — concentrate
  PostgREST shape-handling, join coercion, error translation.
- Fake adapters → **DEEP** — faithful twins reproducing DB CHECK/UNIQUE/idempotency rules.

## Findings

### 🟡 Warnings (non-blocking; all PR2 carry-forward risks)

- **First-month `opening_balance required` (400) validation not in the service.**
  `app/api/cash/month/route.ts:167` returns 400 `"opening_balance required for first month"`
  when `opening_balance` is null/NaN on the first-ever month. PR1's `CashService` has no
  `validateMonth`; `CashRepository.createMonth` (supabase `:357-358`, fake `:248-249`)
  blindly does `Number(input.openingBalance)` → `Number(null)` = 0, silently inserting
  opening balance 0. Port JSDoc defers this to "caller has validated". **Not a PR1 blocker**
  (no caller). **PR2 must keep this 400 check in the route or add it to the service** — if
  dropped, a first month with no opening balance silently becomes £0.00 instead of a 400.

- **`.single()` → `.maybeSingle()` swap on month/entry lookups.** Routes use `.single()`
  (e.g. `month/route.ts:53`, `entry/route.ts:34`, `export/route.ts:79`) and ignore PGRST116
  on a miss; adapter uses `.maybeSingle()` (`CashRepository.ts:307,323,412,...`) → null + no
  error. On zero rows both yield `data === null` → identical behaviour. Same accepted pattern
  as F-13 PR3 (W1), arguably more correct. **Confirm in PR2 the 404/null branches still fire.**

- **`updateCheque` (edit) and `setMonthLocked` return a mapped domain object where the routes
  return the raw row.** `cheques/[id]/route.ts:65` returns `{ ok:true, record: <raw snake_case
  row> }`; `month/[id]/route.ts:33` returns `{ month: <raw row> }`. Adapters return camelCase
  `ChequeRecord` / `CashMonth`. **PR2 must map domain→response (R-MF style, like F-13)** so the
  wire shape stays identical — otherwise admin edit/lock responses change key casing.

### 🔵 Architecture / convention notes

- **`month_` field name** (`lib/services/CashService.ts:155`, `buildCashBookCsv` args). Renamed
  from `month` to avoid colliding with the `month: number` param. Acceptable — brand-new,
  caller-less interface, trailing-underscore is a recognised disambiguator. Cleaner would be
  `monthRecord` / `cashMonth`. Non-blocking; fix opportunistically in PR2 if it touches this
  signature.

### 🟢 Good

- `createMonth` duplicate handling more robust than the route: route does non-atomic
  check-then-insert (`month/route.ts:146-153`); adapter relies on the real
  `cash_months_year_month_key UNIQUE (year, month)` (`20260101000000_baseline.sql:1353`) →
  `23505` → `ConflictError` → 409. Same wire result, closes a race. (`CashRepository.ts:378-381`.)
- Fake adapters encode DB CHECK/UNIQUE/idempotency rules → genuine parity, not hollow stubs.
- Golden CSV tests build `bankedAt` the same way the code does (`CashService.test.ts:757`) so
  the assertion tracks machine timezone rather than hard-coding a brittle value — correct given
  the deliberate local-time behaviour.

## Handoff

No blockers. Introduce-only contract holds, architecture clean, behaviour faithful, full suite
(1972), lint, typecheck green. **Hand to ANVIL.** Carry the three 🟡 PR2 risks into the F-16 PR2
plan so the wiring step preserves byte-identical responses:
1. first-month opening-balance 400,
2. `.maybeSingle()` miss-branch parity,
3. updateCheque/setMonthLocked response-shape mapping.
