# Guard review — PR #113 `feat/haccp-mince-unit` (/haccp/mince unit)

**Date:** 2026-07-02 · **Base:** `main` a265579 · **Diff:** 8 commits, 23 files, +3960/−873
**Reviewer:** code-critic subagent (FORGE Guard) — fresh context; implementer ran ~490k tokens so the four long-context governance checks were mandatory.

## VERDICT: NO BLOCKERS — hand to ANVIL

## Spec-critical constraints (all 7 verified HOLD)

1. **Amber = display only** — separate `minceTempStatus` (3-state, colour) vs `minceTempPass` (boolean → persisted flags + CCA popup + CA register) in `lib/domain/mincePrep.ts:100-136`. Pinned at 4 layers: `tests/unit/domain/mincePrep.test.ts:163-188` (7.5 → pass:false), `HaccpDailyChecksService.mincePrep.test.ts:95-193` (amber 400s without CA), `tests/integration/haccp-mince-thresholds.test.ts:202-271` (amber persists `input_temp_pass:false` + CA row), E2E test 2 (warning colour + CCA popup + admin queue).
2. **Fail-closed thresholds** — `resolveMinceThreshold` throws on missing key (domain :86-97); both POST lanes 500 on empty set (`route.ts:101-105, 163-167`); client disables entry + red banner on empty (`page.tsx:536, 977-982`). No `active` column. All 9 keys seeded (`imported_vac` kill-days NULL by Hakan's documented decision); seed completeness enumerated in unit tests. Kill-day rows structurally amber-less via `haccp_mince_thresholds_kill_binary_check` (migration :68-69), pgTAP-proven (020 :60-64).
3. **Admin double-lock** — route `isAdmin` GET+PATCH (`app/api/haccp/admin/mince-thresholds/route.ts:22-24`) + DB `is_admin()` RLS write policies; audit table has NO UPDATE/DELETE policy. pgTAP 020 (17 assertions): non-admin denial, admin update, audit immutable even to admins, both CHECKs. Integration proves 403s + audit row.
4. **KEEP inventory preserved** — full old-vs-new page walk (1404 → 1524 lines): 3 tabs, species picker (input-clear on change), 16-day species-filtered delivery picker (`matchesSpecies` byte-identical incl. legacy red_meat), prep mince-batch picker, kill-date hard block ("DO NOT MINCE… Category 3 ABP"), allergen 14-pick + label-check submit gate, server batch codes untouched, date filter (now on all 3 tabs — plan-stated), printing byte-preserved (`getPrinter().printMinceLabel`, 7/10/14/90/182 options, error → `submitErr`), flash + `ca_write_failed`. One sanctioned narrowing → 🟡 below.
5. **All 4 bug fixes present + correct** — (1) timesep `corrective_action` persisted (`page.tsx:642`) + one MMP-TS register row via new `buildTimeSeparationCorrectiveActions`; `insertTimeSeparation` returns `{id}`. (2) `HistoryHeader` honours `dateFilter` on timesep (:1440). (3) `combinedCauses` (:325-337) first-seen-order dedupe, single "Other" last; E2E asserts an output-only cause offered in dual-channel. (4) duplicate `submitErr` render gone; E2E asserts count === 1.
6. **Hexagonal** — no `package.json` change; no vendor imports outside `lib/adapters/**`; port extension only in `lib/ports/HaccpDailyChecksRepository.ts`, both Supabase+Fake adapters updated in the same slice; rip-out = one adapter + one wiring line.
7. **Kit/tokens** — barrel-only composition (`page.tsx:37-49`); no style-leaking props; `/haccp/mince` in token-purity SCREENS (guard green); green/amber confined to temp tiles/verdicts + badges; chrome danger = Mediterranean Red tokens; migration filename 14-digit, additive.

## Long-context governance checks

- **A. Plan completeness vs diff: PASS** — all 16 steps, all 22 planned files; exactly one extra file (`tests/integration/haccp.test.ts`, the sanctioned `ca_write_failed:false` pin flip); 23-file diff fully accounted for.
- **B. Test-weakening diff: PASS** — pre-existing assertions byte-identical except the two plan-sanctioned pin flips ("timesep has NO CA builder" → inverted; timesep response gains `ca_write_failed:false`, still exact-shape `toEqual`); spec-17 rewrite keeps all 4 original pins as supersets. No other loosened/deleted assertion.
- **C. Behaviour-loss walk: PASS** — KEEP inventory line-by-line; one flagged narrowing (🟡).
- **D. Hard guards: PASS** — no-adapter-imports + reusable-visual-in-kit + filename-convention + token-purity: 75/75; `db:reset` ×2 idempotent.

## Findings

### 🟡 Should-decide (non-blocking, plan-sanctioned) — ✅ RESOLVED
- **RESOLVED 2026-07-02:** Hakan chose "enable minus everywhere" → commit `c8f8533` sets `allowNegative` unconditionally on all four pads + E2E pin (−1 on a chilled tile grades Pass, persists exactly); tsc clean, 163/163 unit, spec-17 10/10. Original finding:
- `app/haccp/mince/page.tsx:711-715` — kit NumberPad `allowNegative` only in frozen output mode. The old pad had a permanent +/− toggle, so sub-zero INPUT readings (e.g. partially frozen delivery at −1°C) or chilled outputs at −0.5°C could be typed; now they can't (would round to 0; anything ≤7 passes regardless). Exactly what plan Step 11 specified — a sanctioned spec decision, but the single capability the rebuild removes and it has no written justification. → put in front of Hakan (fix or BACKLOG), not resolved by silence.

### 🔵 Notes
- `app/api/haccp/mince-prep/route.ts:112-121` — invalid-species crafted POST loses the (wrong-anyway) `kill_date_hard_fail`/`days_from_kill` extras vs main; same 400/message; unreachable from UI; strictly more correct.
- `app/haccp/mince/page.tsx:1458-1460` — timesep history rows now display the persisted CA text; small unplanned but benign addition making bug fix 1 visible. Keep.
- `page.tsx:536` — client fail-closed keys on EMPTY threshold set; a partial set leaves the tile enabled (server 500 backstop; seed-completeness test makes it unreachable).
- pgTAP runner picks up `_helpers.sql` → "No plan found" → summary prints `Result: FAIL` though all 293 assertions pass. Pre-existing harness quirk, present on main.

### 🟢 Good
- R1 amber rule pinned independently at 4 layers; fenceposts both sides of every band; E2E keys on unique per-run markers, no counts; no service-role client in E2E; pgTAP 020 avoids the order-dependent `LIMIT 1` that bit goods-in.
- Supabase adapter audit `summary` lists only fields that actually changed.

### Implementer deviations verified
- (a) invalid-species try/catch: verified vs main — plain 400 kept, decorations dropped (see 🔵).
- (b) CCA protocol/derive texts: word-for-word main's strings with numbers interpolated (frozen renders "-18°C" exactly as before).

## Depth verdicts
- `lib/domain/mincePrep.ts` → DEEP (7 small functions hide the whole grading policy; deletion test: complexity re-smears across page + service).
- `app/haccp/mince/page.tsx` rewrite → DEEP (same interface, behaviour kept, hardcoded rulebook removed).
- Admin `MinceThresholdRow` → deep enough (mirrors proven goods-in row).
- Port additions → not speculative (widening a proven seam, two live implementations).

## Test/lint results (this branch, local Supabase)

| Rung | Result |
|---|---|
| `db:reset` ×2 idempotence | both clean |
| Unit | 3326/3326 (245 files) |
| Hard-guard lint pins | 75/75 |
| pgTAP | 293/293 across 20 files incl. new 020 (runner quirk noted) |
| Integration | 571/571 incl. new 12-test mince-thresholds suite |
| E2E 17-haccp-mince-prep | 10/10 @critical |
| `tsc --noEmit` / `next lint` | clean / clean |
