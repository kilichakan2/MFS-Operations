# Code-critic review — F-19 PR4 — Cluster C "People & training"

**Branch:** `f19-pr4-cluster-c-people-training` · **PR:** #71 · **Date:** 2026-06-23
**Phase:** FORGE Guard · **Reviewer:** code-critic subagent (read-only)

## Verdict: CLEAR — no blockers. Hand to ANVIL.

Condition: ANVIL/conductor must execute unit + integration + lint (sandbox blocked the
runner for code-critic; only `tsc --noEmit` ran → exit 0). R6 500-body shift gets the
one-line Gate-3 sign-off the plan already anticipates.

## Hexagon
```
DOMAIN (core logic — HACCP people & training)
  ├─ HaccpTrainingRepository (port) → [Supabase] (adapter) + [Fake] (test)
  └─ HaccpPeopleRepository   (port) → [Supabase] (adapter) + [Fake] (test)
```

## Byte-identity confirmation (per-quirk, vs `git show origin/main:…` pre-image)

| Quirk | Verdict | Evidence |
|---|---|---|
| Allergen missing `certification_date` → `'Completion date required'` (NOT 'Certification…') | PASS | `HaccpTrainingService.validateAllergenTraining`; integration pins it |
| people-visitor `!manager_signed_by` (whitespace passes) vs kiosk `!manager_signed_by?.trim()` (fails) | PASS | kept at route edge; `validateVisitor` covers only 3 shared fields |
| `fit_for_work` source differs (people `visitor_declaration_confirmed ?? false`; kiosk separate field) | PASS | each route resolves at edge, passes concrete value |
| `health_questions` default RAW (people) vs `?? {}` (kiosk) | PASS | builder assembles only |
| `validateVisitor`/`buildVisitorHealthRecord` cover ONLY the 3 shared fields | PASS | no hidden divergence |
| Two distinct `todayUK()` bodies (people en-CA, kiosk en-GB) | PASS | not unified |
| `VISITOR_KIOSK_USER_ID = '190d6c79-…895ebc'` stays route constant, injected as userId | PASS | not in service/domain |
| illness mapping `gi→gastrointestinal / other→other_illness / serious→serious_illness` + unmapped pass-through | PASS | `mapIllnessType` identical to old |
| inserts return void; training GET `{ staff, allergen }` NO join; people GET `{ records }` WITH `users!submitted_by(name)` limit 50; training lists limit 100 | PASS | adapter col-constants + limits confirmed |
| `start_date` validated (→ 'Start date required') but never written | PASS | build omits it; integration pins not-stored |
| determinism: services take now/today/userId injected, never `new Date()`/cookies | PASS | confirmed both services |
| persist key ORDER byte-identical to old literals | PASS | field-for-field match |
| `HaccpUserRef` barrel collision (R11) | PASS | module-local `HealthRecordUserRef`, not re-exported |

## Accepted, documented behaviour change (R6 — flagged, not a blocker)
- All 3 routes: DB-error 500 **body** changes from raw Postgres message → `'Server error'`
  (adapter throws `ServiceError`, route catch → `'Server error'`). Status code (500) unchanged;
  front-end never surfaces these bodies. Same accepted posture as Clusters A/B.
- Secondary: old training GET only checked `staff.error`, never `allergen.error` — an
  allergen-only DB error would have returned `{ staff, allergen: [] }` at 200. Now any read
  failure throws → 500. Strict correctness improvement on a DB-error edge that can't occur on
  the happy path; acceptable under R6.

## Architecture / hexagonal — all PASS
- domain/ports import nothing from adapters
- 3 routes import wiring singletons only; ZERO `@supabase/*` (only comments mention it)
- vendor types mapped to domain models at adapter; no leak
- service-role wiring only; NO `…ForCaller` (pin-test asserts no ForCaller key)
- no migration, no package.json, no .eslintrc change
- rip-out: DB-vendor swap for Cluster C = 2 adapters + 2 wiring lines, zero app/** change

## Depth verdicts (new/touched only)
- `HaccpTrainingService` → DEEP ✅
- `HaccpPeopleService` → DEEP ✅
- `HaccpPeopleService.buildVisitorHealthRecord` → HONEST LOCALITY ✅ (genuine shared builder; divergences resolved at edge)
- `HaccpTrainingRepository` (4 methods) → REAL SEAM ✅ (Supabase + Fake both implemented)
- `HaccpPeopleRepository` (2 methods) → REAL SEAM ✅
- supabase + fake adapters → DEEP ✅
- 3 route files → thinned to presentation, NOT pass-throughs (own auth gate, clock, todayUK, kiosk id, edge divergences)
- No PASS-THROUGH and no SPECULATIVE SEAM introduced.

## Test quality (all 🟢)
- `HaccpTrainingService.test.ts` / `HaccpPeopleService.test.ts` — behaviour-based; whole-object `toEqual`; validate cascades assert exact strings in order; shared visitor builder tested with BOTH userIds; illness mapping all 3 + unmapped; determinism via injected now/today.
- `haccpPeopleTraining.test.ts` (integration) — pins per-path stored column sets, R5 quirk, RAW vs `?? {}`, kiosk id, `users: null` non-inner join, R4 whitespace-manager parity (people passes / kiosk 400). Comprehensive byte-identity net.
- Modified wiring pin-tests (`haccpService.test.ts`, `haccpAssessments.test.ts`) — mechanical & necessary (`vi.mock` needed the 2 new singletons; export-set assertion needed the 2 new names). Did NOT weaken the no-`…ForCaller` guarantee; export set stays a closed `toEqual(new Set([...]))` requiring exactly the 6 intended exports.

## Suite results
- `tsc --noEmit` — PASS (exit 0)
- Unit / integration / lint — NOT RUN (sandbox blocked the runner). **ANVIL must execute and confirm green before merge.**
