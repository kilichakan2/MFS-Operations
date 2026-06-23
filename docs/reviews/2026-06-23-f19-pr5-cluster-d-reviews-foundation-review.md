# Guard review — F-19 PR5 · Cluster D Reviews foundation (PR #72)

**Date:** 2026-06-23
**Branch:** feat/f19-pr5-cluster-d-reviews-foundation
**Reviewer:** code-critic (FORGE Guard)
**Verdict:** ✅ CLEAR — no blockers, hand to ANVIL.

## Scope
F-19 Cluster D PR5 — Reviews foundation, introduce-only / dead code. Two new HACCP
hexagons (HaccpReviews = weekly/monthly; HaccpAnnualReview = annual lifecycle), fully
unwired. Nothing live calls the code → nothing can regress production. Review weighted
toward (a) hexagonal correctness, (b) byte-faithfulness to source routes, (c) test quality.

## Introduce-only invariants (plan §9) — all hold
- Zero `app/**` diff, zero `supabase/**` (migration) diff, zero `package.json`/lock diff.
- No `app/` caller of the new singletons (grep clean).
- `npx tsc --noEmit` exits 0; barrels resolve, no circular imports.
- Affected unit + lint suites: 105/105 pass (2 new service suites + 2 wiring-pin tests + no-adapter-imports).

## Hexagonal boundary — PASS
- `lib/domain/**` and `lib/ports/**` import no adapters (grep-verified).
- Vendor SDK `@supabase/supabase-js` only in the two `lib/adapters/supabase/` files (as `type SupabaseClient` + wrapped `supabaseService`). Fakes import no SDK.
- `23505` → `ConflictError` mapped inside `lib/adapters/supabase/HaccpAnnualReviewRepository.ts:89-93` — no vendor type leaks (deviation #3 correct).
- Wiring `lib/wiring/haccp.ts:105-111` — service-role singletons only, no `…ForCaller`; wiring test asserts exact export set + no `/ForCaller/` match (F-RLS-04h deferral honoured).
- Rip-out test: swap DB vendor = 2 new adapters + 2 wiring lines. PASS.

## Depth verdicts (new/touched only)
- `lib/services/HaccpReviewsService.ts` → DEEP ✅ (hides ordered 400 cascades, `state==='problem'`/`invertFail` CA filters, verbatim CA mapping; one-line delegators sit alongside real logic — deletion concentrates, not moves).
- `lib/services/HaccpAnnualReviewService.ts` → DEEP ✅ (validateCreate/validatePatch cascades, canSignOff gate, conditional buildSignOff/buildUpdate persist).
- Both ports → real seams (Supabase + Fake, Fake load-bearing in tests) — not SPECULATIVE SEAM.
- Both Supabase + both Fake adapters → DEEP ✅.
- **No PASS-THROUGH or SPECULATIVE SEAM introduced. No depth blocker.**

## Byte-faithfulness vs source routes — verified
Deviations (all approved, all correct):
1. Inserts RETURN `{id}`, threaded into CA `source_id` (`HaccpReviewsRepository.ts:88-103` vs `reviews/route.ts:122,166`).
2. CA writes best-effort — log on error, no throw, review insert never aborted (`HaccpReviewsRepository.ts:122-136` vs `reviews/route.ts:131,175`).
3. `23505` → `ConflictError` with exact route message inside the adapter.

R-B1 field-level (verbatim vs `reviews/route.ts:119-129,160-171`):
- Weekly: `state==='problem'`, `ccp_ref:'WEEKLY-REVIEW'`, `Weekly review — ${label}`, `week ending ${weekEnding}` fallback, `recurrence_prevention:'Review procedures'`, `product_disposition:'assess'`, `management_verification_required:true`. ✅
- Monthly: `invertFail ? result==='YES' : result==='NO'`, `'Monthly HACCP review — '`, `(${monthYear})` fallback, `'Review procedures and update HACCP plan'` fallback. ✅
- `further_notes?.trim() || null`, `date: today`, validation strings exact order (weekly 2 / monthly 4). ✅

R-B2 annual:
- Aliased `signer:`/`approver:`/`creator:` join copied verbatim into `ANNUAL_LIST_COLS`, returned with bare `as` cast — adapter does NOT normalise (`HaccpAnnualReviewRepository.ts:45-52,74`). Row type models `{name} | {name}[] | null`.
- **Open ANVIL task:** confirm the real Supabase join cardinality (`{name}` vs `{name}[]`) against a seeded read with populated signed_off_by/approved_by/created_by, and pin it before PR6. Not coverable at unit layer.
- `validateCreate` defaults period from/to to `""`; `isValidReviewPeriod` falsy-rejects → `undefined` ≡ `""`, no divergence.
- `findCurrent` returns null on `error || !data`, preserving route's 404 decision at PR6 edge.

R-B4 naming: existing `MonthlyReviewRow`/`MonthlyReviewPersist` (allergen) untouched; new hexagon exports `ReviewMonthlyRow`/`ReviewMonthlyPersist`; `ReviewUserRef`/`AnnualReviewUserRef`/CA insert type module-local. No clash/shadowing. ✅

## Wiring-test extension (implementer deviation) — legitimate
`haccpService.test.ts` + `haccpAssessments.test.ts` extended to add the two new singletons to the `vi.mock` enumeration; `haccpService.test.ts` adds the two method-surface lists + tightened exact-export-set. Same pattern as PR3/PR4; the export-set assertion is tightened, not loosened. Not masking an issue.

## Findings
- 🔴 Blockers: none.
- 🟡 Should-fix: none.
- 🔵 Architecture notes: none new.
- 🟢 Test-quality: service suites strong (behaviour-through-public-interface, Fake-driven, deterministic injected TODAY/NOW, CA rows asserted field-exact incl. both fallbacks + invertFail flip, best-effort swallow pinned). R-B2 not coverable at unit layer → ANVIL must confirm the join shape against a seeded read.

## Results
- `HaccpReviewsService` + `HaccpAnnualReviewService` + `haccpService` + `haccpAssessments` + `no-adapter-imports`: 105/105 passing.
- `npx tsc --noEmit`: clean (exit 0).
- Hexagonal boundary grep: clean.

**Loop-back: none. Advance to ANVIL.**
