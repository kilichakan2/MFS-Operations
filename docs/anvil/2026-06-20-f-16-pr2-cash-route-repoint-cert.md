# ANVIL Clearance Certificate — F-16 PR2: Cash route re-point

**Status:** CLEARED FOR PRODUCTION

Branch: feat/f-16-pr2-cash-route-repoint
PR: #60
Tip: 71a7e83
Base: main
Date: 2026-06-20
Runner context: clean (independent re-run of the FORGE-Guard-approved matrix)

> 🗣 In plain English: this PR rewires 8 cash endpoints to call the shared `cashService`
> instead of each one talking to the Supabase database directly. I re-ran every applicable
> test layer myself in a fresh context, and they all passed — so it is safe to ship.

---

## What this PR is

Re-points 8 cash routes off direct `@supabase/*` calls onto the shipped `cashService`
singleton:

- `app/api/cash/month/route.ts`
- `app/api/cash/month/[id]/route.ts`
- `app/api/cash/entry/route.ts`
- `app/api/cash/entry/[id]/route.ts`
- `app/api/cash/cheques/route.ts`
- `app/api/cash/cheques/[id]/route.ts`
- `app/api/cash/export/route.ts`
- `app/api/cash/upload/route.ts`

Plus a NEW translation seam `lib/api/cash/dto.ts` and one sanctioned frozen-service edit
in `lib/services/CashService.ts` (a `month_` → `monthRecord` rename).

> 🗣 In plain English: the route files used to plug straight into the database vendor.
> Now they go through the cash "service" (the business-logic layer the app owns), and a
> small new `dto.ts` file is the translator that keeps the JSON the browser sees
> byte-for-byte identical. The vendor plug now lives in one place, not eight.

### Sanctioned micro-changes (the only intended behaviour deltas)

1. **D2 — missing-id PATCH → explicit 404.** On `month/[id]` (lock), `entry/[id]` (edit)
   and `cheques/[id]` (edit), a PATCH against an unknown id now returns an explicit
   `404 'not found'` instead of accidentally bubbling to a `500`.
   > 🗣 In plain English: ask to edit a record that doesn't exist and you now get a clean
   > "not found" instead of a server crash. Strictly an improvement; verified by 3 tests.
2. **R-WIRE-7 — DB-failure 500 body normalised** to `{ error: 'Server error' }`.
   > 🗣 In plain English: when the database genuinely errors, the error message the client
   > sees is now a consistent, non-leaky shape.

Discrepancy route deliberately dropped — tracked as ARCH-FU-08 (out of scope for PR2).

---

## Per-layer results

| Layer | Status | Observed | Notes |
|---|---|---|---|
| Unit (`npx vitest run`) | ✅ PASS | 1981/1981 passed, 113 files | Incl. `tests/unit/api/cash.dto.test.ts` + renamed `tests/unit/services/CashService.test.ts` (51 between them, key-order + populated rows + deleteEntry composition) |
| Integration (real local Supabase, `vitest.integration.config.ts tests/integration/cash.test.ts`) | ✅ PASS | 23/23 passed | All 8 routes byte-identical (JSON key SET+ORDER, CSV bytes+headers); carry-forwards (first-month 400, 409 dup, null→404s); all 3 D2 404s; amount-message parity (entry+cheque "required" vs "amount must be positive") |
| Typecheck (`npx tsc --noEmit`) | ✅ PASS | exit 0, no output | Clean |
| Lint (`npx next lint`) | ✅ PASS | "No ESLint warnings or errors" | `no-adapter-imports` rule green; grep of `app/api/cash/` for `supabase` / `@/lib/adapters` / `@supabase` → **0 hits** |
| DB / pgTAP / RLS | ⏭️ N/A | not run | No migration, no `.sql` in the diff, no policy/RLS/auth change. Deliberately not run. |
| Edge functions | ⏭️ N/A | not run | None touched. |
| E2E @critical (Playwright) | ⏭️ N/A | not run here | Cash is not in the `@critical` suite (orders/KDS/routes/map). The Gate-4 PREVIEW smoke run by the conductor later covers the 3 `@critical` specs as a regression guard, with cash as a non-500 ride-along. |

> 🗣 In plain English: every test that matters for this change passed. The three "N/A"
> rows aren't skipped corners — there's genuinely nothing in this change for those layers
> to test (no database change, no edge function, and cash isn't part of the critical-path
> browser suite).

---

## Pre-merge checklist

- **No `.sql` in the diff at all** — `git diff --name-only main...HEAD | grep -E '\.sql$'`
  returned empty. No migration.
- **No destructive migration** (no DROP / TRUNCATE / ALTER TYPE / DROP NOT NULL) →
  **no PITR gate required.**
  > 🗣 In plain English: nothing touches the database's structure, so there's no risk of
  > data loss and no "take a backup first" gate needed.
- **No `package.json` change** in the diff.
- **Expected files only.** Source/test diff matches exactly the approved set: 8 cash routes
  + `lib/api/cash/dto.ts` + `tests/unit/api/cash.dto.test.ts` + `lib/services/CashService.ts`
  (rename) + `tests/unit/services/CashService.test.ts` + `tests/integration/cash.test.ts`.
  Two additional files in the diff are **docs-only, not source**:
  `docs/architecture-review-2026-06-06.md` and `docs/plans/BACKLOG.md` — noted, no flag.
- **Rollback = code-only revert** (revert the PR commit). No migration, so **no `.sql`
  rollback script needed.**

---

## Iterations

None. Every layer passed on the first run; no test was fixed, no source was touched.

## Root verdict

All applicable layers green; no real-code bug surfaced; no infra failure. No FORGE eject
required.

**CLEARED FOR PRODUCTION** — conductor owns the Lock gate and ship with Hakan.
