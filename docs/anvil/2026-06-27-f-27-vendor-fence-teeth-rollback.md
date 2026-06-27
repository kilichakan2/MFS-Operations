# Rollback — F-27 "the Lego principle gets teeth"

**Change class:** CONFIG + TEST-ONLY. No data, no schema, no env, no runtime code. Rollback is a pure code revert — zero data risk, no PITR.

## To roll back

```bash
# revert the squash-merge commit on main (replace <sha> with the merge sha)
git revert <merge-sha>
git push origin main
# Vercel auto-redeploys main; bundle is byte-identical either way (ESLint not in build)
```

Or revert the PR via GitHub UI ("Revert" button on PR #88).

## What reverting does
- Removes `@capacitor/core` + `@capacitor/android` from the two ESLint ban blocks (back to 14 fenced vendors).
- Deletes the two new pin tests (`vendor-fence-complete.test.ts`, `no-disable-arch-rules.test.ts`).
- **No runtime effect** — the shipped app bundle never contained any of this (ESLint config and `tests/**` do not ship). The live site is unaffected by either applying or reverting F-27.

## Risk
None beyond losing the future-regression guard. No customer-facing surface, no data, no auth/RLS.
