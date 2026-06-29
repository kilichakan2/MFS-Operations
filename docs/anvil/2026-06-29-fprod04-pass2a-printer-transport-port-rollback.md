# Rollback note — F-PROD-04 Pass 2a (Printer transport port)

Date: 2026-06-29
Branch: fprod04-pass2a-printer-port
PR: #99

## DB rollback

**None required.** This unit has ZERO database surface:
- No migration files in the diff.
- No RLS policy change.
- No API/route schema change.
- No PITR concern.

🗣 In plain English: nothing in the database was touched, so there is nothing in the
database to undo. The only thing that changed is where some client-side printing code
lives — pure code relocation behind a new interface.

## Code rollback

Revert the merge commit on `main`:

```
git revert -m 1 <merge-commit-sha>
```

Or, if not yet merged, simply close PR #99 without merging.

Because the change is a behaviour-preserving refactor (printing behaviour is
byte-identical — proven by the R1 URL byte-identity tests), reverting restores the
prior per-screen print code with no data migration, no schema step, and no ordering
constraint. Vercel redeploys the reverted code automatically on merge of the revert.

🗣 In plain English: if anything looks wrong after shipping, undo the one merge and the
old printing code comes straight back — no database steps, no special order, just a
normal code revert.
