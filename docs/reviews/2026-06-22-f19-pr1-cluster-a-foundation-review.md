# Code-critic review — F-19 PR1 (Cluster A daily-check foundation)

> Date: 2026-06-22 · FORGE Guard phase · Reviewer: code-critic subagent (read-only)
> Branch: `feat/f19-pr1-cluster-a-foundation` · PR #68 · base `main`
> Plan reviewed against: `docs/plans/2026-06-22-f19-pr1-cluster-a-foundation.md`

## Verdict: NO BLOCKERS — hand to ANVIL (two 🟡 warnings to fix-now-or-carry-into-PR2)

Nothing here can break the live app (the code is dead/introduce-only), the architecture is
clean, and the database calls were copied faithfully. Two precision gaps should be fixed or
explicitly carried into PR2's plan; neither blocks this dead-code PR.

## Core claims verified TRUE
- **Introduce-only:** `git diff --name-status` = 18 new files + 5 additive barrel edits. NO
  `app/api/haccp/**` route, NO `supabase/migrations/**`, NO `package.json`, NO `.eslintrc.json`.
- **Dead code:** zero `app/**` imports of the new wiring/services/use-case/singletons (grep).
  Only the new unit tests consume them.
- **Service-role only:** `lib/wiring/haccp.ts` exports exactly three singletons; no `…ForCaller`
  factory leaked (only deferral comments). Wiring test pins the export set to exactly three.
- **No vendor leak:** `@supabase/*` imported only in the two `lib/adapters/supabase/Haccp*` files.

## Hexagonal contract: PASS
- domain + ports pure TS, zero adapter/framework imports; ports import `@/lib/domain` only.
- services import ports only, never another service, never adapters; export factories not singletons.
- `lib/wiring/haccp.ts` is the only business-layer file importing `lib/adapters/**`.
- `tests/unit/lint/no-adapter-imports.test.ts` GREEN.
- Rip-out test: swap the DB = two new adapters + two wiring lines. PASS.

## Depth verdicts (the three Ousterhout design calls)
1. **`submitHaccpDailyCheck` use-case → SHALLOW / borderline pass-through (🟡 W1).** Factory
   destructures only `correctiveActions` and never uses its `dailyChecks` dep
   (`lib/usecases/submitHaccpDailyCheck.ts:67`). Only exposes `fileCorrectiveActions(rows,label)`
   — a try/catch around `correctiveActions.insertCorrectiveActions`. Does NOT compose the
   daily-check insert as plan §9 / its own docstring claim. Earns its keep only because it
   concentrates the soft-fail "CA failure must not throw" contract in one tested place. Docstring
   materially overstates it.
2. **One cohesive `lib/domain/HaccpDailyCheck.ts` (634 lines, 7 sub-domains) → DEEP, correct.**
   Pure types sharing one skeleton; splitting would create shallow modules + widen the barrel.
3. **Lifting pure helpers into `HaccpDailyChecksService` → DEEP, correct.** `deriveTempAction`,
   `buildBatchNumber`, `deriveColdStorageAction`, `coldStorageTempStatus`, CCP protocol tables,
   kill-date/temp-pass logic — real behaviour concentrated + unit-tested. Deepest module in the diff.

## Byte-identity spot-check: PASS with one gap (W2)
Verified char-for-char: delivery `.select` + insert + 3 CA rows (`resolved:false`); 409 strings
(delivery, cold-storage, process-room, mince/meatprep); CA queue selects + sign-off; product-return
always-1-CA-row with NO `resolved` key; process-room diary `null` disposition/recurrence; meatprep
CA gate on temperature only; timesep writes NO CA row.

**Gap (W2):** delivery allergen-only CA fan-out. The route gates the ENTIRE CA-insert block on
`(hasDeviationTemp || hasDeviationContam)` (`app/api/haccp/delivery/route.ts:498`) — the allergen
push lives inside that gate. So an allergen-only delivery (temp `pass`, `covered_contaminated:'no'`,
`allergens_identified:true`) writes the delivery row with `corrective_action_required:true` but
**zero CA rows** today. The service's `buildDeliveryCorrectiveActions`
(`lib/services/HaccpDailyChecksService.ts:1005`) emits the allergen CA row on `hasDeviationAllergen`
ALONE, with no reproduction of the outer temp-or-contam gate. If PR2 calls the builder
unconditionally, an allergen-only delivery would gain a CA row it does not get today. Untested
(`tests/unit/services/HaccpDailyChecksService.test.ts:180` only covers the combined 3-row case).

## Findings

### 🔴 Blockers
None.

### 🟡 Warnings (non-blocking for dead-code PR; carry into PR2)
- **W1 — `lib/usecases/submitHaccpDailyCheck.ts:67`** — use-case ignores its `dailyChecks` dep
  (passed by `lib/wiring/haccp.ts:59`) and its docstring overstates it as two-table orchestration.
  Either (a) drop the unused dep + correct the docstring to "owns the CA-filing soft-fail contract,"
  or (b) actually move the insert+fan-out composition here per plan §9. As-is = dead parameter +
  misleading contract. → **Render** (convention/clarity), or **Order** if composition is pulled in.
- **W2 — `lib/services/HaccpDailyChecksService.ts:1005`** — delivery allergen-only CA row diverges
  from the route gate (`app/api/haccp/delivery/route.ts:498`). Add the outer
  `(hasDeviationTemp || hasDeviationContam)` gate to the builder (or have PR2's caller reproduce it)
  AND add an allergen-only test asserting zero CA rows. → **Order** (byte-identity logic this PR
  exists to lock); non-blocking now since dead code.

### 🔵 Architecture notes
- `lib/services/HaccpCorrectiveActionsService.ts:52-56` — thin three-method delegation (SHALLOW but
  accepted): a deliberate staged seam — the CA service must exist standalone for PR2's admin
  queue/sign-off routes. Project's accepted F-16/F-17/F-18 pattern → 🔵, not a loop-back.

### 🟢 Test quality
- Strong overall (86/86 green): exact validation strings, verbatim select-column smoke,
  23505→ConflictError with verbatim 409 text, soft-fail path, 3-row delivery fan-out, always-1-row
  product-return, never-CA timesep, diary null disposition/recurrence, wiring no-`ForCaller` via
  exact Set equality. Behaviour-through-public-interface tests.
- Missing the allergen-only delivery case (ties to W2) — `HaccpDailyChecksService.test.ts:180`.

## Test / typecheck / lint actuals
- Unit (6 new + no-adapter-imports lint test): vitest run → 7 files, 86 tests, all passing.
- `npm run typecheck` (tsc --noEmit): clean, 0 errors.
- `next lint` (10 new source files): no warnings or errors.
- `tests/unit/lint/no-adapter-imports.test.ts`: GREEN.

## Loop-back mapping
No blocker → hand to ANVIL. W1 (→Render, wording/dead-dep) and W2 (→Order, byte-identity gate)
are non-blocking for a dead-code PR but should be folded into PR2's plan as explicit pins so the
re-point stays byte-identical and the use-case contract is honest before any live route calls it.

## Relevant files
- `lib/usecases/submitHaccpDailyCheck.ts` (W1)
- `lib/services/HaccpDailyChecksService.ts` (W2, line 1005; lifted helpers)
- `lib/wiring/haccp.ts` (passes unused dep at line 59)
- `app/api/haccp/delivery/route.ts` (line 498 — the gate W2 must reproduce)
- `tests/unit/services/HaccpDailyChecksService.test.ts` (missing allergen-only case)
- `docs/plans/2026-06-22-f19-pr1-cluster-a-foundation.md` (the contract)
