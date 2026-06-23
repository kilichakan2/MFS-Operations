# Code-critic review — F-19 PR3 (Cluster B — assessments & registers)

**Branch:** `feat/f19-pr3-cluster-b-assessments-registers` · **PR:** #70 · **Date:** 2026-06-23
**Phase:** FORGE Guard · **Reviewer:** code-critic subagent (sole review authority for this PR)

## Verdict: CLEAR TO ADVANCE — no blockers. Hand to ANVIL.

No security, correctness, hexagonal, or depth blocker. Byte-identity holds across all 5 routes
against `main`. Two trivial 🟢 notes only.

## Test / lint / typecheck (run during review)
- `npm run typecheck` → clean (tsc --noEmit, 0 errors)
- `npm run lint` → clean (0 ESLint warnings/errors)
- Unit (5 files, **87/87 pass**): `HaccpAssessmentsService.test.ts`, `HaccpAssessmentsRepository.test.ts`,
  `haccpAssessments.test.ts` (wiring), `haccpService.test.ts`, `no-adapter-imports.test.ts`
- Integration: `tests/integration/haccpAssessments.test.ts` → **6/6 pass** against local Supabase (DB was up)

## Byte-identity (per route, vs `git show main:<path>`)
| Route | Verdict | Notes |
|---|---|---|
| `allergen-assessment` GET/POST | PRESERVED | GET select verbatim (`assessor:assessed_by(name)`, `updater:updated_by(name)`); `latest = all[0] ?? null` moved into adapter, same result; POST 400 `"site_status and next_review_date required"` identical; append-only; both timestamps = same `now.toISOString()` |
| `monthly-reviews` GET/POST | PRESERVED | GET `{ reviews }` identical; POST validates month first → 400 `"Invalid month format — expected YYYY-MM"` before any DB call; UPSERT `onConflict: 'month_year'`; `already_existed: false` literal preserved; 201 shape identical |
| `food-defence` GET/POST | PRESERVED | 3 aliased non-inner joins verbatim incl. irregular `creator:created_by   ( name )` spacing; `review_due` `< now` == original `< new Date()`; array-defaulting + 400 strings identical |
| `food-fraud` GET/POST | PRESERVED | `risks` array-guard 400 `"Risks must be an array"` kept; `{ assessments, latest, review_due }` shape kept |
| `product-specs` GET/POST/PATCH | PRESERVED | GET select verbatim, `active=true` + `product_name` order kept; `review_due` 12-month math via `twelveMonthsBefore(now)`; **PATCH `'allergens' in body` nuance kept at the route edge** (service receives ready `updates` map) |

### Constraint checks
- **C1 byte-identical:** PASS
- **C2 three persistence models distinct:** PASS — append-only `insert*`, `upsertMonthlyReview` (onConflict month_year), in-place `updateProductSpec`; Fake models upsert-overwrite honestly; no homogenisation
- **C3 R3 aliased non-inner joins:** PASS — every select string verbatim incl. inconsistent paren whitespace; no `users!inner(name)`; unit test asserts the verbatim strings
- **C4 R5 no ConflictError:** PASS — adapter throws `ServiceError` on every DB error; no 23505/ConflictError mapping; unit test pins "even on 23505 → ServiceError"; 500 stays 500
- **C6 determinism:** PASS — no `new Date()` in the service; `now`/`today` passed as params; routes own `new Date()`
- **C7 no forbidden files:** PASS — no `package.json`, no migration/`.sql`, no `.eslintrc`, no `page.tsx`

## Hexagonal (Layer 3b) — PASS
- Service imports `@/lib/ports` + `@/lib/domain` only; no adapter import (`no-adapter-imports` lint test passed)
- `@supabase/supabase-js` imported only in `lib/adapters/supabase/HaccpAssessmentsRepository.ts`
- `lib/wiring/haccp.ts` adds exactly one service-role singleton; NO `…ForCaller` (deferred to F-RLS-04h)
- Vendor types do not leak; adapter maps to domain `*Row` shapes; `SupabaseClient` stays in the adapter
- 5 routes dropped `@supabase/*` imports and all `haccp_*` table-name references (grep = zero)
- Rip-out test: swap DB = one new adapter + one wiring line. Holds.

## Depth verdicts (new/touched only)
- `HaccpAssessmentsService.ts` → DEEP ✅ (validation cascades, defaulting, monthly-review aggregation, two `review_due` predicates behind a small surface; deletion test pushes it all back to 5 routes)
- `HaccpAssessmentsRepository.ts` (port) → real seam ✅ (genuine DB port, Fake twin in use; not speculative)
- `lib/adapters/supabase/HaccpAssessmentsRepository.ts` → DEEP ✅ (hides all vendor query/error detail)
- `lib/adapters/fake/…` → test double; models upsert-overwrite faithfully
- `lib/domain/HaccpAssessment.ts` → types module; one-file-for-5-groups justified
- No PASS-THROUGH, no SPECULATIVE SEAM. Thin `insert*`/`list*` forwarders are members of a deep
  module (not a pass-through module). Not a blocker.

## 🟢 Minor notes (non-blocking)
- `tests/unit/wiring/haccpAssessments.test.ts:55` — "exposes its full surface" iterates a hardcoded
  19-method list asserting `typeof === 'function'`. Shape assertion, needs hand-edit on new methods.
  Acceptable wiring smoke-pin, mirrors Cluster A; weakest test in the set (real coverage is in
  service/integration tests).
- `HaccpAssessmentsService.ts` interface design — POST routes call three methods in sequence
  (`validate…` → `build…Persist` → `insert…`) vs one `create…`. Deliberate (route owns `new Date()`
  for determinism; build step stays pure/testable; mirrors Cluster A). Future tightening opportunity,
  not a defect for this PR.

## Loop-back routing
No blockers → no loop-back. **Hand to ANVIL.** One thing to watch in ANVIL: confirm a real
product-spec PATCH that omits `allergens` does not null the column (the `'allergens' in body` nuance)
on the deployed preview — integration test covers it locally and passed.

---

## Guard delta — empty-create bug fix (commit 96a6b33, reviewed separately)

ANVIL's exhaustive browser-tap E2E surfaced a PRE-EXISTING bug (NOT a regression from this PR's
route re-point): on an EMPTY food-defence/food-fraud register the "+ New version" button was dead
(`setEditBase(latest=null)` vs guard `editBase !== null` → create form never mounted). Hakan approved
fixing it in-PR (explicit scope expansion beyond byte-identical). Fix mirrors the proven product-specs
`adding`-flag pattern.

**Files (3):** `app/haccp/food-defence/page.tsx`, `app/haccp/food-fraud/page.tsx` (add `creating`
flag, guard → `editBase !== null || creating`, button → `setCreating(true)`, reset both on
onSaved/onCancel); `tests/e2e/21-haccp-product-specs.spec.ts` (determinism: unique-name row locator
instead of `.first()`, wait for detail view before Edit/Delete; `toHaveCount(0)` assertion unchanged).

**Verdict: CLEAR — no blockers.**
- Correctness: OR-guard opens form on both create (creating=true, base=null → blank) and edit
  (base=plan) paths; existing edit wiring untouched. No state leak — flags never set together, both
  reset on save/cancel so the form can't re-open. (food-defence:517/519/520/553, food-fraud:441/445/446/485)
- Null-safety: every EditForm field is `useState(base?.field ?? default)`; no unguarded `base.`
  dereference; passing `base={null}` is safe.
- Pattern consistency: faithful to product-specs (separate flag + OR-guard + both-flags-reset).
- Scope: exactly 3 files; no route/lib/migration/allergens/EditForm-body edits. Presentation-only.
- 🟢 spec 21 determinism sound; `new RegExp(name)` safe (name = `E2E-PS-<digits>`, no metachars).
- typecheck clean · lint clean.

Allergens has the SAME latent empty-create gap (heavier fix; spec 18 green via seed-first) → logged
to BACKLOG as a follow-up, deliberately NOT fixed in this PR.
