# Rollback — F-15 PR1: Pricing domain hexagonal extraction

**Date:** 2026-06-21
**Branch:** feat/f-15-pr1-pricing-domain
**Migration in this PR:** NONE.

## There is no database rollback to perform

This PR is a **pure, introduce-only hexagonal extraction**. It adds new code only:

- `lib/domain/Pricing.ts`
- `lib/ports/PricingRepository.ts`
- `lib/ports/__contracts__/PricingRepository.contract.ts`
- `lib/services/PricingService.ts`
- `lib/adapters/supabase/PricingRepository.ts`
- `lib/adapters/fake/PricingRepository.ts`
- `lib/wiring/pricing.ts`
- 3 test files (unit fake, unit service, integration supabase)
- 5 append-only barrel edits (`lib/domain/index.ts`, `lib/ports/index.ts`,
  `lib/services/index.ts`, `lib/adapters/fake/index.ts`, `lib/adapters/supabase/index.ts`)

It contains:

- **0 migrations** — no schema, no RLS, no policy, no function change. The `price_agreements` /
  `price_agreement_lines` tables and the `replace_agreement_lines` RPC already exist in
  production; this PR only adds an adapter that *reads/writes* them. It creates no DB objects.
- **0 routes edited** — nothing under `app/` or `components/` changed.
- **Service is DARK** — nothing in `app/` or `components/` imports the new Pricing module
  (confirmed by grep). No live code path can reach it, so removing it cannot break anything.

## The entire rollback

Because the new code is dark and depends on no new DB object, reverting is code-only and clean:

- **Before merge:** close the PR unmerged. Nothing to undo.
- **After merge:** `git revert` the merge commit (or revert the 15 files). All 15 files drop
  cleanly — no other file depends on them, so there are no dangling imports.

**No `.sql` rollback script is required** — there is no migration to undo, and no production
data was touched.
