# F-26 Rollback — LocalCache port + Dexie adapter (client-side offline-store cutover)

Date: 2026-06-27
Branch: feat/f26-localcache-dexie-cutover
PR: #86

## Type: CODE-ONLY — no migration, no schema change, no PITR

F-26 is a behaviour-preserving, client-side hexagonal re-point. It touches NO
database: no SQL migration, no RLS/policy change, no Supabase schema change, no new
runtime dependency (`fake-indexeddb` is a TEST-ONLY devDependency). The only persistent
store it touches is the **browser's own IndexedDB** (`mfs-ops`, schema verno 2), and the
schema strings were copied byte-for-byte from the deleted `lib/localDb.ts` — so the
on-device DB shape is unchanged across the cutover. There is therefore NO data to
recover and NO PITR path involved.

🗣 In plain English: nothing about the company database changed — only how the app's
code talks to the phone's own offline drawer. Undoing this is purely a code revert;
there is no data anywhere that a rollback could damage.

## Rollback procedure (if a regression appears post-merge)

Because there is no migration, rollback is a pure code operation. Two equivalent paths:

### Option A — Vercel instant rollback (fastest, recommended first response)
1. In Vercel, promote the previous production deployment (the F-25 prod build,
   `dpl_E9LMGeFcKDvSSm2p8K9DfZmPuTDn`, commit `4c12982`) back to production, OR run
   `vercel rollback` to the immediately-preceding production deployment.
2. No DB step. No PITR. The browser IndexedDB schema (verno 2) is identical before and
   after the cutover, so a reverted client opens the same on-device DB with no migration.

### Option B — git revert the merge commit
1. `git revert -m 1 <merge-commit-sha-of-PR-#86>`
2. Open the revert PR, let it pass CI, merge — Vercel auto-deploys the reverted code.
3. No DB step. No PITR.

## What a revert restores
- Re-introduces `lib/localDb.ts` (the Dexie singleton + sync helpers).
- Removes `lib/ports/LocalCache.ts`, `lib/adapters/dexie/{LocalCache,react,index}.ts`,
  `lib/adapters/fake/LocalCache.ts`, `lib/usecases/refreshReferenceData.ts`,
  `lib/wiring/localCache.ts`, and the `.eslintrc.json` fence lines for
  `dexie` / `dexie-react-hooks`.
- Re-points the 9 consumers back to `lib/localDb`.
- Removes `fake-indexeddb` from devDependencies.

The on-device IndexedDB (`mfs-ops`, verno 2) is untouched by either the cutover or its
revert — both code versions open the same browser database. No user re-sync is forced;
the reference cache simply refreshes on its normal 30-minute cooldown.

## NOT applicable
- `supabase db push` — N/A (no migration)
- Reverse migration SQL — N/A (no schema change)
- PITR (Point-in-Time Recovery) — N/A (no destructive operation, no DB data touched)
