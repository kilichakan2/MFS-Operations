# F-TD-12 — Rollback note (code-only)

**Date:** 2026-06-27
**Shipped:** PR #90, squash merge `2c6ee1f` on `main`. Prod deploy `dpl_BwUsuxwe4ebV2HUxWZdFzbCeSHjj`.

## Nature of the change
Pure type-rename + dead-file deletion. NO database, NO migration, NO RLS, NO new dependency, NO data-flow change. TypeScript types are erased at runtime, so the compiled bundle is byte-identical — there is no runtime state, schema, or data to unwind.

## How to roll back
Code-only — pick either:
1. **Git revert:** `git revert 2c6ee1f` on `main`, push → Vercel auto-deploys the revert. Restores `lib/orders/types.ts` and all original imports atomically.
2. **Vercel rollback:** promote the prior production deploy `dpl_6Zzmx643CPDNgm4QE2YP8hLMj9SK` (commit `5ad524b`, the last pre-F-TD-12 prod deploy, `isRollbackCandidate: true`).

No PITR, no data recovery, no migration reversal required.

## Trigger
Roll back only if production shows a 5xx or a broken Orders/KDS render attributable to this deploy. Prod smoke at ship was all non-5xx (`/api/auth/team` 200 · `/orders` 200 · `/kds` 200 · `/login` 200), so no rollback was needed at ship time.
