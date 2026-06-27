# ANVIL Clearance Certificate — F-INFRA-03 (preview smoke in GitHub Actions CI)

Branch: feat/f-infra-03-preview-smoke-ci

- **Date:** 2026-06-27
- **PR:** #91 — `feat/f-infra-03-preview-smoke-ci` → `main`
- **Final commit:** `9c7c364`
- **Change class:** CI/infra + test + docs only. NO app code, NO `lib/**`, NO migration, NO RLS, NO new runtime dependency. Byte-identical application bundle.
- **Status:** **CLEARED FOR PRODUCTION**

## What shipped
A new GitHub Actions workflow (`.github/workflows/preview-smoke.yml`) that runs the 75-spec `@critical` Playwright preview smoke automatically on every PR, against the PR's cred-wired Vercel preview deploy. BLOCKING + fail-closed. Invokes `npm run test:e2e:preview -- <url> --unprotected` (protection OFF this sprint; F-INFRA-04 drops the flag). Plus a unit test pinning 10 workflow invariants, and runbook/BACKLOG doc edits.

## FORGE loop summary
- **Guard round 1:** BLOCK — discover heredoc mixed `require()` + top-level `await` → `ERR_AMBIGUOUS_MODULE_SYNTAX` on Node ≥20.19 → gate permanently RED (fail-closed, not false-green). Fix #1 (`1956dbe`): ESM-only heredoc + invariant 9.
- **Guard round 2:** SHIP — blocker resolved, no regression.
- **ANVIL live run #1 (`1956dbe`):** FAILED — readiness poll timed out 12m (`status -1`). Root cause: discover step CONSTRUCTED an 82-char DNS-illegal host from the long branch name. Confirmed via `host`/`nslookup` + Vercel API. Real bug → Render fix #2.
- **Fix #2 (`9c7c364`):** read `ready.meta.branchAlias` (fallback `ready.url`) instead of constructing; invariant 10.
- **Guard round 3:** SHIP — root cause resolved, fail-closed strengthened (empty-host guard), `branchAlias`-over-`url` reasoning sound.
- **ANVIL live run #2 (`9c7c364`, pre-secrets):** discover ✓ → readiness ✓ (50s) → smoke fail = EXPECTED (13 `E2E_*` secrets not yet provisioned; probe correctly fail-closed).
- **Wire-up:** 12 `E2E_*` secrets provisioned (E2E_PIN_ADMIN absent from `.env.e2e.local` by design — admin uses USER+PASSWORD; manual smoke passes 75/75 without it). `VERCEL_API_TOKEN` reused.
- **ANVIL live run #2 rerun (with secrets):** **GREEN** end-to-end.

## Per-layer results
| Layer | Result |
| --- | --- |
| Unit (workflow pin test `tests/unit/ci/preview-smoke-workflow.test.ts`) | ✓ 10/10 |
| Full unit suite | ✓ 2743/2743 (187 files) |
| `tsc --noEmit` | ✓ clean (exit 0) |
| Integration | — N/A (no app code / DB) |
| pgTAP / RLS | — N/A (no migration / no RLS) |
| **Live CI run on PR #91 (run `28303505449`, job `83856198320`)** | ✓ discover ✓ · readiness ✓ · DB-identity probe 4/4 · **@critical 75/75 (4.3m)** · total 5m16s |

## Code review
code-critic: SHIP (3 rounds). Full findings: `docs/reviews/2026-06-27-f-infra-03-preview-smoke-ci-review.md`. One 🟢 non-blocking nit (invariant 10's negative assertion keyed to the exact reverted literal).

## Pre-merge checklist
- [x] Live `@critical` smoke green on the real preview (75/75).
- [x] Exact required-check context name confirmed = `smoke` (matches job key + pinned by unit test).
- [x] No destructive migration → no PITR gate.
- [x] No new runtime dependency; byte-identical bundle.
- [ ] Ship sequence (Gate 4): merge PR #91 → register `smoke` as a required status check on `main` (admin-override retained, strict=false) → verify protection lists it.

## Notes for follow-up
- **F-INFRA-04** (next sprint unit): drop `--unprotected` from the single run line + add `VERCEL_AUTOMATION_BYPASS_SECRET` to the smoke job env + update the invariant asserting `--unprotected` present. Pinned in BACKLOG + marked by the unit test.
- **New backlog (tiny):** GitHub notice "Node.js 20 deprecated; actions forced to Node.js 24" — about the `actions/*` wrappers, not our scripts. Future-hardening only, non-blocking.
- **`E2E_PIN_ADMIN`** intentionally not provisioned (not in `.env.e2e.local`; unused by the running `@critical` set).
