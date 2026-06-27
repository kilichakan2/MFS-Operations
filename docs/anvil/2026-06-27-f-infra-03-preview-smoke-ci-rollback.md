# Rollback — F-INFRA-03 (preview smoke in GitHub Actions CI)

- **Date:** 2026-06-27
- **PR:** #91 — squash `65f3970`
- **Class:** CI/test/docs only — NO migration, NO data, NO app code. Fully reversible, no PITR.

## What was added
- `.github/workflows/preview-smoke.yml` (new blocking CI workflow)
- `tests/unit/ci/preview-smoke-workflow.test.ts` (new pin test)
- runbook + BACKLOG doc edits
- Branch protection on `main` requiring the `smoke` status check (created fresh — main had none before)
- 12 `E2E_*` repo secrets + reuse of `VERCEL_API_TOKEN`

## To roll back

### Fastest (disable the gate without touching code)
Remove the required check so merges aren't blocked, leaving the workflow in place (it still runs, just non-blocking):
```
gh api -X PUT repos/kilichakan2/MFS-Operations/branches/main/protection --input - <<'JSON'
{ "required_status_checks": null, "enforce_admins": false, "required_pull_request_reviews": null, "restrictions": null }
JSON
```
Or remove branch protection entirely (restores the pre-F-INFRA-03 state of main):
```
gh api -X DELETE repos/kilichakan2/MFS-Operations/branches/main/protection
```

### Full revert (remove the workflow too)
```
git revert 65f3970        # removes the workflow, test, doc edits
# then drop the required check as above (the context will otherwise sit "expected")
```

### Secrets (optional cleanup — harmless to leave)
```
for k in E2E_PIN_SALES E2E_PIN_OFFICE E2E_PIN_WAREHOUSE E2E_PIN_BUTCHER E2E_PIN_DRIVER E2E_USER_ADMIN E2E_USER_SALES E2E_USER_OFFICE E2E_USER_WAREHOUSE E2E_USER_BUTCHER E2E_USER_DRIVER E2E_PASSWORD_ADMIN; do gh secret delete "$k" --repo kilichakan2/MFS-Operations; done
```
(Leave `VERCEL_API_TOKEN` — it predates F-INFRA-03 and is used by `preview-cred-sync`.)

## Note
No production impact to undo — the app bundle was byte-identical. Rollback only affects CI behaviour and the merge gate.
