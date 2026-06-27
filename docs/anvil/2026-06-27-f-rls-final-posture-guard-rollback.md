# Rollback — F-RLS-final (RLS posture seal)

- **Date:** 2026-06-27
- **PR:** #89 (squash `7e07545` on main)
- **Type:** **code-only.** NO migration, NO schema change, NO data change, NO runtime change.
- **PITR:** N/A (nothing in the database was altered).

## What shipped
3 files, +887/-0, all config/test/docs — byte-identical production bundle:
- `tests/unit/lint/no-service-role-in-user-routes.test.ts` (3-door service-role regression guard)
- `supabase/tests/017-empty-guc-fails-closed.test.sql` (empty-GUC fail-closed pgTAP pin)
- `docs/adr/0008-rls-final-service-role-allowlist-and-posture-seal.md` (posture register)

## How to roll back
Revert the squash commit on main:

```
git revert 7e07545
git push origin main
```

That's the entire rollback. Because the shipped bundle is byte-identical (`next build` ignores
ESLint; `tests/**` + `supabase/tests/**` never ship), reverting changes NOTHING a user or the
runtime touches — it only removes a CI guard test, a DB-only pgTAP test, and a doc. No Vercel
rollback, no `vercel rollback`, no PITR, no DB action required.

## What reverting costs
Removing the guard re-opens the silent-regression risk it seals (a future route could grab the
service-role master key undetected). There is no functional/runtime downside to keeping it.
Prefer FIXING forward over reverting unless the guard itself is producing a false-RED that blocks
an unrelated unit (in which case, correct the allow-list rather than revert).
