# ANVIL Clearance Certificate

Date: 2026-06-27
App: MFS-Operations
Branch: feat/f-td-12-retire-legacy-orders-types
PR: #90 — https://github.com/kilichakan2/MFS-Operations/pull/90
Commit: 06fc7d6

## Scope — what this certificate actually covers

F-TD-12 — full retirement of the legacy `lib/orders/types.ts` module. PURE
type-rename + dead-file deletion: `OrderState` / `OrderUom` now live in exactly
one place (`lib/domain/Order.ts`); the 4 runtime helpers + `ORDER_REFERENCE_REGEX`
moved verbatim into a new pure-domain file `lib/domain/orderReference.ts`; 6 UI/
component imports + 3 `lib/orders` modules + the helper test re-pointed; the legacy
file deleted. TypeScript types are erased at compile time, so the shipped UI bundle
is byte-identical — ZERO intended runtime change.

🗣 In plain English: this PR moves and renames type labels and shuffles four small
helper functions into a cleaner home, then deletes the old box they lived in. The
compiler throws type labels away before the app ships, so nothing the user touches
changes. The tests below exist to prove that "nothing changed" claim.

| Change / path                                  | Risk tier | Layers required        | Layers run                         |
| ---------------------------------------------- | --------- | ---------------------- | ---------------------------------- |
| NEW `lib/domain/orderReference.ts` (pure)      | Low       | tsc + unit + lint      | tsc ✓ · unit ✓ · lint ✓            |
| Type re-point (6 UI + 3 lib/orders) + delete   | Low       | tsc + unit + build     | tsc ✓ · unit ✓ · build ✓           |
| Orders + KDS App Router pages (consumers)      | Low–Med   | build + @critical smoke| build ✓ · @critical 75/75 ✓        |

**Not run under the efficiency dial:** Integration suite — NOT run (no route/
service/adapter/data-flow change; type-erased re-point has no runtime surface to
integration-test). pgTAP / RLS — NOT run (no SQL, no policy, no migration). PITR
gate — NOT run (no DB change at all). Bespoke new browser button-click specs — NOT
written (type-erased ⇒ byte-identical runtime; the existing `@critical` boot smoke
is the runtime check). Full E2E re-run on preview (high-risk double-run) — NOT run
(Low risk tier; `@critical` smoke is sufficient). All deliberate, justified in the
approved matrix.

**Baseline characterisation pass?** No — diff-driven, full coverage for this change's
actual blast radius.

## Test Results

| Layer                       | Status            | Notes                                                              |
| --------------------------- | ----------------- | ----------------------------------------------------------------- |
| tsc --noEmit (type net)     | ✅ 0 errors        | PRIMARY net for a type-only change                                 |
| Unit (Vitest)               | ✅ 2733/2733 passed| 186 files; oracle `tests/unit/orders/types.test.ts` 13/13 green    |
| Lint (next lint)            | ✅ clean           | new `lib/domain/orderReference.ts` trips no arch/vendor-fence rule |
| Production build            | ✅ assembled       | all pages built incl. /orders, /orders/[id], /orders/new, /kds    |
| Integration (Vitest)        | n/a — not required | no route/service/adapter/data-flow change                         |
| Database (pgTAP)            | n/a — not required | no SQL, no policy, no migration                                    |
| Edge Functions (Deno)       | n/a — not required | none touched                                                       |
| Local full-stack rung       | n/a — not required | Low-risk type-erased re-point; preview smoke carries runtime proof |
| E2E (Playwright @critical)  | ✅ 75/75 passed    | preview smoke, `--unprotected`, no flaky retries                  |
| Populated UI smoke          | ✅ covered          | @critical specs render seeded data (KDS lines, map markers, lists) |
| Breadth crawl               | n/a — not required | byte-identical runtime; no new UI surface to crawl                 |

Architecture rung: change touches `lib/domain/**` only (a seam-adjacent move), but
adds NO new port/adapter and imports NO vendor SDK — lint's `no-adapter-import` /
vendor-fence rules confirm `lib/domain/orderReference.ts` stays pure. No domain-only
fake-adapter suite required (no port introduced); the helper functions are pure and
unit-tested directly via the oracle.

## Warnings (non-blocking)

None.

## Migration

None. Code-only change.
Rollback script: n/a — no DB migration.
PITR confirmed: N/A — no destructive (or any) migration.

## Verify environment

Preview URL: https://mfs-operations-6wzs2j5vg-hakan-kilics-projects-2c54f03f.vercel.app
Deployment: dpl_GUhXZB7DqXiM62Snc6S6tosdKNty (READY, target=preview, SHA 06fc7d6)
Readiness gate: GET /api/auth/team → 200 with seeded ANVIL-TEST team list (DB-identity
probe satisfied — preview wired to its Supabase preview branch).

## Merge Sequence

No migration → no `supabase db push` step.

1. Merge PR #90 → Vercel auto-deploys
2. Post-deploy smoke: 3 `@critical` paths against the production URL (www.mfsops.com)
3. If smoke fails → `vercel rollback` (code only; no data path to recover)

## Manual smoke at merge

**Not required** — critical flows proven on the real preview environment with real
seeded data (75/75 @critical, including Orders + KDS), tsc clean, production build
assembled, oracle byte-equivalence test green. This is a type-erased change with a
byte-identical runtime bundle, so the existing @critical depth specs are the complete
runtime check; no per-button hand-clicking adds coverage.

🗣 In plain English: you can merge this without hand-clicking. The only thing this
change could break is "does the app still compile and assemble and pass its journeys"
— and all three are green on the real deployed copy.

## Rollback note (code-only)

This PR introduces no database, schema, or migration change. To revert: `git revert`
the merge commit (or close PR #90 and delete branch `feat/f-td-12-retire-legacy-orders-types`).
A Vercel code rollback to the prior production deployment fully restores prior behaviour;
there is no data-recovery path to consider because no data was touched.

## Verdict

CLEARED FOR PRODUCTION
