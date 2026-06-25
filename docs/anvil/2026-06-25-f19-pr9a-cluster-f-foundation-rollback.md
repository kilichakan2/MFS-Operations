# ANVIL Rollback — F-19 Cluster F, PR9a (introduce-only hexagonal foundation)

Date: 2026-06-25
Branch: feat/f19-pr9a-cluster-f-foundation
PR: #76

## Rollback is trivial: revert the merge commit. Nothing else.

This PR is **introduce-only**. It adds 3 hexagons (ports + services +
Supabase/Fake adapters + wiring + domain types) for 8 HACCP "docs & lookups"
surfaces. It edits **no `app/api/**` route, no migration, no `package.json`, no
eslint config**, and **wires nothing into a live screen**.

🗣 In plain English: this PR only added new parts to the engine room and left
them on the shelf — nothing in the running app calls them yet. So undoing it is
just "take the new parts back off the shelf." No data was touched, no schema
changed, no live behaviour changed.

### What changed (all additive code, no runtime callers)

- `lib/domain/HaccpHandbook.ts`, `lib/domain/HaccpLookups.ts`, `lib/domain/HaccpSuppliers.ts` (+ `lib/domain/index.ts`)
- `lib/ports/HaccpHandbookRepository.ts`, `lib/ports/HaccpLookupsRepository.ts`, `lib/ports/HaccpSuppliersRepository.ts` (+ `lib/ports/index.ts`)
- `lib/services/HaccpHandbookService.ts`, `lib/services/HaccpLookupsService.ts`, `lib/services/HaccpSuppliersService.ts` (+ `lib/services/index.ts`)
- `lib/adapters/supabase/Haccp*Repository.ts` + `lib/adapters/fake/Haccp*Repository.ts` (+ both `index.ts`)
- `lib/wiring/haccp.ts`
- `tests/unit/services/Haccp*Service.test.ts` + `tests/unit/wiring/haccp*.test.ts`

### Rollback procedure

```bash
# After merge, if the foundation must come out:
git revert -m 1 <merge-commit-sha>      # reverse the squash/merge commit
# OR, before merge: simply close PR #76 without merging.
```

- **Migration to undo:** NONE. No `supabase/migrations/**` file in this PR.
- **Data recovery / PITR:** NOT APPLICABLE. No data was written or altered.
- **Vercel rollback:** not required — no route/behaviour shipped. Reverting the
  code commit is sufficient and complete.

### Post-revert sanity

`npm run test && npm run typecheck && npm run lint` should be green on the
reverted tree exactly as they are today — the removed code has no live callers,
so nothing downstream breaks when it is removed.
