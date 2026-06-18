# Code review — F-15 PR1: Pricing domain hexagonal extraction

- **Date:** 2026-06-21
- **Branch:** feat/f-15-pr1-pricing-domain (15 files, 5 commits — NOT pushed at review time)
- **Phase:** FORGE Guard
- **Verdict:** ✅ CLEAR — advance to ANVIL (no blockers)

## Review provenance (important — read this)

The delegated `code-critic` Guard subagent **stalled on an infrastructure watchdog**
(no stream progress for 600s, did not recover) partway through its adapter-parity deep-dive.
It had already verified the B1/B2 mapping fixes, the create-line filter parity, and the
position-index parity, and surfaced **one open concern** before dying: a possible adapter
divergence in how the line `unit` is defaulted on create (Supabase `unit: l.unit ?? "per_kg"`
vs Fake `unit: l.unit`). The conductor resolved that concern directly and completed the
remaining mechanical Guard checks (suite run + invariants) in the main session. This review
records the combined result.

## Findings

### 🟢 B1/B2 (FIXED before review, by the implementer) — `lib/adapters/supabase/PricingRepository.ts`
`updateAgreement` / `updateLine` were forwarding camelCase patch keys straight to `.update()`,
sending non-existent column names for the differently-spelled fields (`validFrom`/`validUntil`/
`customerId`/`prospectName`; `productId`/`productNameOverride`). Same-spelled fields (status,
notes, price) were unaffected. Left unfixed this would have silently broken editing those
fields the moment PR2 re-pointed the routes — a behaviour change in a PR sworn to have none.
Fixed with explicit snake_case mapping; **pinned by two new contract cases** ("persists
differently-spelled fields") proven red→green. Verified present and passing this review:
`updateLine persists differently-spelled fields (productId→override)`,
`updateAgreement persists differently-spelled header fields`.

### 🔵 unit-default "divergence" (raised by the stalled Guard) — RESOLVED, non-issue
Supabase create/add/replace paths default `unit: l.unit ?? "per_kg"`; Fake stores `l.unit`.
`CreateLineInput.unit` is **required** (`lib/domain/Pricing.ts:107`, `readonly unit: PriceUnit`),
used by all three create paths. So `l.unit` is always present → the `?? "per_kg"` fallback is
dead-defensive code that never fires → both adapters produce identical results. No divergence.
The only optional `unit?` is `UpdateLineInput.unit` (`Pricing.ts:142`, the patch); the tiny
Fake/Supabase difference there (`patch.unit !== undefined` guard vs `"unit" in patch`) only
manifests on an explicit `{ unit: undefined }`, which no caller sends and supabase-js drops on
serialise anyway. Cosmetic note, not a blocker.

### 🔵 PricingService is a 100% pass-through — `lib/services/PricingService.ts` — ACCEPTABLE
Same plan-declared stepping-stone shape as the already-shipped Routes/Orders services. Pricing
has no header-owned business rule in PR1 (`is_expired` is computed in the adapter to stay
byte-identical for PR2). PR2 gives the service its route-composition role. Consistent seam;
not a pass-through smell to loop back on.

## Invariants (the PR1 contract) — all confirmed

| Invariant | Result |
|---|---|
| 0 route files changed (`app/api/pricing/**`) | ✅ `git diff --name-only main...` → none under `app/api/` |
| 0 migrations added (`supabase/migrations/**`) | ✅ none |
| Service is DARK (nothing live imports it) | ✅ `grep -rn wiring/pricing app components` → none |
| `@supabase/*` only in the adapter | ✅ domain/ports/services/wiring import none; only `lib/adapters/supabase/PricingRepository.ts` |
| domain/ports import no adapters | ✅ (the `lib/adapters` hits in domain/ports are comments in unrelated Orders/Map files) |
| `replaceLines` uses the atomic RPC | ✅ `client.rpc("replace_agreement_lines", …)` at `PricingRepository.ts:423` — one transaction, not delete+insert |
| Fake reproduces customer-OR-prospect CHECK | ✅ `agreementMissingParty` throws if neither customerId nor trimmed prospectName supplied |

## Hexagonal check

- **Port:** `lib/ports/PricingRepository.ts` (new, Pricing-owned) — PASS
- **Adapters:** `supabase/PricingRepository.ts` (only new `@supabase` importer) + `fake/PricingRepository.ts`, both satisfy one shared contract — PASS
- **New deps:** NONE — PASS
- **Rip-out test:** swap DB = one new adapter + edits to `lib/wiring/pricing.ts` only — PASS

## Suite results (independent run at review time)

- `npx tsc --noEmit` → **0 errors**
- `eslint` on the 7 pricing source files → **0** (clean)
- `npx vitest run` (fake adapter + service) → **31 passed / 31**
- Supabase integration contract (28 tests, needs live local DB) → **deferred to ANVIL** (runs the DB/integration layer on the real database; not re-run here to avoid duplication)
- Builder-reported full unit suite: 1891 passing, 0 regressions (to be re-confirmed by ANVIL)

## Loop-back? No.

No 🔴 / 🟡 findings. The one real bug (B1/B2) was fixed in-build and locked by tests before
this review. Advance to ANVIL.
