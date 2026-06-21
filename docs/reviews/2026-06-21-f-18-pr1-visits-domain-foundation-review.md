# FORGE Guard — Code review: F-18 PR1 Visits domain foundation

**PR:** #65 · **Branch:** `feat/f-18-pr1-visits-domain-foundation` · **Date:** 2026-06-21
**Reviewer:** code-critic subagent (FORGE Guard) · **Verdict:** **SHIP — no blockers, hand to ANVIL**

Diff: `git diff main...` = 15 files (9 created + 5 additive barrels + 1 plan), 2715 insertions, 0 deletions.

## Verdict

**SHIP.** Every claim in the brief verified: byte-identical selects (all six routes), W1 `maybeSingle`, validation message parity, mapping discipline, dead-code/introduce-only confirmed, zero new deps, hexagonal rules intact, `visitsServiceForCaller` correctly absent. The one architecture note is a deliberate, documented Strangler-Fig seam (🔵, non-blocking), consistent with shipped F-17/F-13 precedents. Real risk lives in PR2 (the re-point) where R-B1 snake/camel remapping must be enforced — correctly out of scope here.

## Claim verification

1. **Hexagonal compliance — PASS.** domain + port import only `@/lib/domain`; Supabase adapter (`lib/adapters/supabase/VisitsRepository.ts:35`) is the only `@supabase/*` importer; service (`lib/services/VisitsService.ts:102`) exports a factory only; `lib/wiring/visits.ts` exports `visitsService` only — `visitsServiceForCaller` confirmed absent (wiring test:50-55 pins absence); `no-adapter-imports.test.ts` green.
2. **Byte-identity of `.select()` strings — PASS, all six verified against live routes.** `TODAY_COLS` (adapter:60-74) == `screen3/today/route.ts:50-54` incl. `customers!visits_customer_id_fkey(name)` + `rep:users!visits_user_id_fkey(id,name)`; `DETAIL_COLS` (77-90) == `detail/visit/route.ts:18-22`; `ADMIN_COLS` (94) == `admin/visits/route.ts:68` (spaced single-line); `NOTE_COLS` (97-100) == GET route:52-55 + POST route:113-116 (same indentation); `NOTE_UPDATE_COLS` "id, body, updated_at" (103) == PATCH route:160. Adapter test hard-codes identical strings as a regression guard.
3. **W1 (`updateNote` no-match → null, not 500) — PASS.** Adapter uses `.maybeSingle()` (391), returns null on `data === null` (399). Test:455-465 pins it.
4. **Mapping correctness — PASS.** snake→camel confined to `toVisit`/`toNote`; enums RAW (no `replace(/_/g,' ')`); 23505 → `{ duplicate: true }` (224, test:139); null-on-miss for `findDetailById` (425), `updatePipelineStatus` (320), `updateNote` (399).
4b. **Validation parity — PASS.** `validateCreate` (service:106-128) == `sync/route.ts:82-91`; `validatePipelineStatus` (130-150) == `visit/route.ts:61-70` incl. "Invalid status. Must be one of: …"; `validateNote`/`validateUpdateNote` (152-172) == `visit/notes/route.ts` messages. Same order, status, strings.
5. **Dead-code / no-behaviour-change — PASS.** grep across `app/` + `components/` finds zero imports of `visitsService`/`wiring/visits`/`createVisitsService`/`supabaseVisitsRepository`.
6. **Test quality — strong.** Real behavioural assertions through public surface; verbatim selects, W1, duplicate, owner-filter, manager-bypass, wiring-singleton-only all pinned; no tautologies.
7. **No new deps / no reformat / no secrets — PASS.** No `package.json` change; barrels append-only; no secret-scan triggers in the diff.

## Depth verdicts

- `lib/ports/VisitsRepository.ts` — **DEEP** (11 methods, all 1:1 with real PR2 ops, none speculative).
- `lib/adapters/supabase/VisitsRepository.ts` — **DEEP** (join coercion, snake↔camel, 23505, best-effort geocode, maybeSingle W1).
- `lib/services/VisitsService.ts` — **borderline / acceptable SEAM (🔵)**. Non-validating methods (174-185) are thin passthroughs, but the service carries the four validation cascades (exact message parity) and is the declared F-RLS-04g injection point (`visitsServiceForCaller` lands here) — same staged Strangler-Fig shape as F-17/F-13. Kept 🔵, not a blocker.
- `lib/wiring/visits.ts` — **DEEP/correct** (two-line composition root = the rip-out seam).

## Findings

- **🔴 Blockers:** none.
- **🟡 Warnings:** none.
- **🔵 Architecture note (non-blocking):** `lib/services/VisitsService.ts:174-185` passthrough-heavy body — acceptable as the documented F-RLS-04g injection seam. Revisit only if F-RLS-04g is ever cancelled.
- **🟢 Test quality:** adapter test's PostgREST stub is a legitimate seam-level fake; verbatim-select assertions double as the byte-identity regression guard; Fake adapter's `updateNote` blanked-field shape mirrors the Supabase adapter and the service test doesn't over-assert on it. All fine.

## Test / lint results

```
Unit:       2114/2114 passing (125 files) — matches implementer's report
Typecheck:  tsc --noEmit — clean (exit 0)
Lint:       eslint on 6 new lib files — clean; no-adapter-imports pin green
Integration / E2E / RLS: not run — out of scope for unit-level introduce-only PR (ANVIL owns the ladder)
```
