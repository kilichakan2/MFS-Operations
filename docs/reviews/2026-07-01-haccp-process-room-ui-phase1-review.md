# Code-critic review — PR #109 `feat/haccp-process-room-ui-phase1`

**Date:** 2026-07-01
**Phase:** FORGE Guard
**Reviewer:** code-critic subagent (sole review authority in-loop)
**Diff:** `/haccp/process-room` design-system rebuild + DB-driven FSA-aligned thresholds + admin editor (10 commits)
**Plan:** `docs/plans/2026-07-01-haccp-process-room-ui-phase1.md`

## Verdict: FIX-THEN-SHIP — no 🔴 blockers; eligible for ANVIL after closing 🟡#1, 🟡#2 + the pinning test

No security, hexagonal, or correctness blockers. Admin-only writes proven at both layers (route `isAdmin` + DB RLS `is_admin()`), band rule single-sourced, shared cause list de-drift complete, whole diff typechecks/lints/tests clean. Two 🟡 gaps around **threshold deactivation** to fix before the cert. No loop-back to Frame/Order.

## Test / lint results (verified by reviewer, not trusted)

| Check | Result |
|---|---|
| `tests/unit/domain/processRoom.test.ts` | ✓ 3/3 |
| `tests/unit/services/HaccpDailyChecksService.processRoom.test.ts` | ✓ 10/10 |
| `tests/unit/services/HaccpDailyChecksService.test.ts` | ✓ 21/21 (no regression) |
| `tests/unit/adapters/fake/HaccpDailyChecksRepository.processRoomThresholds.test.ts` | ✓ 4/4 |
| Arch guards (`no-adapter-imports`, `reusable-visual-in-kit`, `filename-convention`) | ✓ 71/71 |
| `tsc --noEmit` | clean |
| `eslint` (6 changed source files) | clean |
| pgTAP `018-…` | assessed statically (local DB not booted in read-only pass) |

## 🔴 Blockers
None.

## 🟡 Warnings (should fix before cert)

### 🟡#1 — Deactivating a required threshold silently mis-grades temperatures (fail-open fallback)
`lib/services/HaccpDailyChecksService.ts:372-379` (`resolveProcRoomThresholds`) + `app/haccp/admin/page.tsx:263` (`Active` Toggle).
Admin editor exposes an `Active` toggle on both threshold rows. Deactivating **"Product core"** → `listActiveProcessRoomThresholds()` returns only `["Room ambient"]` → `resolveProcRoomThresholds` does `byName("Product core") ?? thresholds[0]` → falls back to **Room ambient** (12/15) as the product limits. A 10 °C product reading grades `pass` against room limits instead of `critical` against 4/7. Fails **open** — wrong direction for a CCP.
**Fix:** remove the `Active` toggle for the two fixed measurement points, AND/OR make `resolveProcRoomThresholds` fail **closed** (validation/500 when a named point is missing, mirroring the route's "empty set = 500, never a hardcoded fallback" at `route.ts:77`).

### 🟡#2 — Audit log doesn't capture `active` changes; can record a misleading summary
`supabase/migrations/20260701120000_haccp_process_room_thresholds.sql:59-69` (no `old_active`/`new_active`) + `lib/adapters/supabase/HaccpDailyChecksRepository.ts:615-623`.
A PATCH flipping only `active` still writes an audit row reading `target 4→4, max 7→7` with no evidence the flag changed. Given #1 makes deactivation food-safety-relevant, the immutable trail must record it.
**Fix:** add `old_active`/`new_active` columns (or reflect the flag in `summary`).

## 🔵 Architecture / follow-up notes (non-blocking)

- **🔵#3 — Non-transactional update-then-audit window** (`lib/adapters/supabase/HaccpDailyChecksRepository.ts:596-632`). UPDATE + audit INSERT are two statements; if the audit insert fails, the limit is changed but no audit row exists (route 500s). Plan R-3 explicitly accepts this at admin-edit frequency. Cleaner shape = single Postgres RPC/transaction or write audit-first. → BACKLOG.
- **🔵#4 — Protocol guidance text duplicated (display vs persisted) and already diverges.** `page.tsx:228-257` (`CCP3_PROTOCOL_STEPS`) vs `service:319-348` (`PR_PROTOCOLS`); wording drifted (page "below the target limit" vs server "below 12°C"). Band rule IS correctly shared — this is only the free-text action steps. Mirrors cold-storage precedent (not new debt). → consider sharing text or documenting on-screen copy as indicative.
- **🔵#5 — Seed band values reappear as view-layer fallbacks.** `page.tsx:773, 784, 793, 903-913` use `?? 4 / ?? 7 / ?? 12 / ?? 15`. Display-only (`bandFor` returns `null` without a real threshold → no mis-classification), but hardcodes seed numbers in the UI. Cosmetic; render `—` for zero magic numbers.

## Depth verdicts
- `lib/domain/processRoom.ts` → **DEEP ✅** — small pure surface, real shared behaviour (band + bounds + causes); passes deletion test.
- Port additions (`listActive/AllProcessRoomThresholds`, `updateProcessRoomThreshold`) → **real seam ✅** — genuine DB behaviour, Supabase adapter + faithful Fake twin.
- `HaccpDailyChecksService.updateProcessRoomThreshold` → thin forward but consistent with file convention; not a new pass-through module.
- Admin route + `ThresholdRow` → real behaviour (double auth gate; dirty/valid form logic). ✅
- **No PASS-THROUGH or SPECULATIVE SEAM introduced. No loop-back to Order.**

## 🟢 Test-quality notes
- pgTAP `018-…` is a genuine security proof (`018-rls-process-room-thresholds.test.sql:61-87`): non-admin INSERT denied (`42501`), non-admin UPDATE/DELETE = no-op with row provably unchanged (`:69-79`), audit immutability vs admin UPDATE/DELETE (`:108-117`). Proves DENY, not just ALLOW.
- Integration proves 403-for-warehouse, old→new audit content, `max<target` → 400 (`tests/integration/haccp-process-room-thresholds.test.ts:46-128`).
- E2E spec 16 genuinely ports the race-proof pattern: `enterTempSession`/`enterDiaryPhase` wait for `Product core` tile (proves `loadData` incl. thresholds settled) before selecting, graceful early-return on already-submitted (`tests/e2e/16-…:63-88, 98-101, 149`). Not a naive `isVisible` race.
- **Gap (ties to 🟡#1):** no test exercises deactivate-a-threshold → fallback. Add a unit test asserting `resolveProcRoomThresholds`/POST fails closed when "Product core" inactive, to pin the fix.

## Confirmed clean (focus-area checklist)
- No `@supabase/*` import outside `lib/adapters/supabase/`; domain/ports/services import no adapters (guard green). Admin write runs through `haccpDailyChecksServiceForCaller` → per-caller authenticated client → DB RLS `is_admin()` fires in addition to route `isAdmin`. Real defence-in-depth.
- Shared cause list: old `CCP3_CAUSES`/`VALID_PROC_ROOM_CAUSES` gone; both consume `PROCESS_ROOM_CAUSES` (`page.tsx:35, 373`; `service:129, 1395`).
- Range validation client (NumberPad min/max = shared consts) + server (`isProcessRoomTempInRange`, `service:1369-1373`).
- Migration additive, 14-digit filename, RLS on both new tables, band CHECK, immutable audit (no UPDATE/DELETE policy).
- No `#EB6619` literal in new code; kit `NumberPad`/`Modal`/`Banner`/`TextField`/`Toggle` + semantic tokens; diary tick/cross row page-local (allowed).
- Dead code (`isNeg`, `tempSubmitPending`, unreachable `-` key) removed.
- No AI references introduced.
- Past-dates decision preserved: picker `max=today`, server rejects `date !== today` → past view-only.
- `DOCUMENT_CONTROL.md` §4 updated to three-band model + audit note + revision-history row.
