# Code-critic review — F-INFRA-03 (preview smoke in GitHub Actions CI)

- **Date:** 2026-06-27
- **PR:** #91 — `feat/f-infra-03-preview-smoke-ci` → `main`
- **Reviewer:** code-critic (FORGE Guard phase)
- **Verdict (round 1):** **BLOCK** — 1 correctness blocker → loop back to Render

## Files reviewed
- `.github/workflows/preview-smoke.yml` — NEW (+206)
- `tests/unit/ci/preview-smoke-workflow.test.ts` — NEW (+109)
- `docs/runbooks/preview-smoke.md` — EDIT (+26)
- `docs/plans/BACKLOG.md` — EDIT

## 🔴 Blockers

### B1 — Discover step crashes on Node 20 (`ERR_AMBIGUOUS_MODULE_SYNTAX`) → gate permanently RED
`.github/workflows/preview-smoke.yml:83-140` (esp. line 122 + line 139).

The inline `node <<'NODE'` heredoc in the "Discover cred-wired preview URL" step mixes **top-level `await`** (line 122, `await findReadyPreview()`) with **`require('node:fs')`** (line 139). Node's automatic module-syntax detection (on by default since 20.19.0, all 22/24+) cannot decide CJS vs ESM when both are present and throws `ERR_AMBIGUOUS_MODULE_SYNTAX` (exit 1) **before executing any code**. `actions/setup-node` with `node-version: 20` (line 60) resolves to the latest 20.x (≫ 20.19), so it fires in CI.

Reproduced directly:
```
$ printf '%s\n' 'const x = await Promise.resolve(7); require("node:fs").appendFileSync("/dev/null","x"); console.log("done");' | node
ReferenceError: Cannot determine intended module format because both require() and top-level await are present.
  code: 'ERR_AMBIGUOUS_MODULE_SYNTAX'  EXIT:1
```

**Severity rationale:** correctness blocker, NOT a security/false-green breach. The crash exits non-zero (RED) → fail-closed integrity intact; nothing dangerous slips through. But the gate can **never pass**, so no PR could ever merge through it.

**Fix (local, one line):** replace `require('node:fs')` at line 139 with `(await import('node:fs')).appendFileSync(...)` OR add `import { appendFileSync } from 'node:fs'` at the top of the heredoc. The readiness step (146-183) already avoids `require` and is fine.

**Ship gate:** the plan's own TDD step 3 ("the F-INFRA-03 PR is its own first guinea pig — observe discovery resolve live") has NOT been executed; it would have caught this. Must run a live PR observation and paste it into the cert before making the check required on `main`.

## 🟡 Should-fix

### S1 — Pin test cannot catch this defect class
`tests/unit/ci/preview-smoke-workflow.test.ts`. The 8 assertions are textual (triggers, `--unprotected`, `/api/auth/team`, no `|| true`, permissions, `actions/*`, job key) but never assert the inline Node steps are *runnable* on the pinned Node version. The `require`+top-level-`await` mix passes all 8 while the workflow is 100% broken.

**Suggestion:** add a guard asserting the inline `node <<` heredocs don't mix `require(` with top-level `await`; OR (stronger, larger) extract discover/readiness scripts to `scripts/*.mjs` that can be unit/lint-tested. At minimum the live-PR observation must be a hard ship gate.

## 🔵 Notes (follow-up, non-blocking)
- Workflow is CI orchestration, not an app module — depth rubric N/A. No `lib/**`, no port/adapter, no `package.json` change. Rip-out vacuous PASS. No architecture leak.
- Inline-Node-in-yaml vs extracted `.mjs`: the heredoc logic is untypecheckable/unlintable/untestable in isolation — precisely why B1 slipped through. `preview-cred-sync.yml` avoids this via `scripts/preview-cred-sync.mjs`. Extracting these two steps would match house style + make them testable. Follow-up.

## 🟢 Good
- **Fail-closed integrity genuinely sound** (#1 target): every failure path exits non-zero → RED — missing token/branch (86-87), Vercel API non-200 (113), no READY preview (123), alias regex mismatch (131), readiness missing URL (148), readiness timeout (182). The only `process.exit(0)` is gated strictly on `status === 200` (171) from `/api/auth/team` with `redirect: 'manual'`. No `|| true`, no `continue-on-error`, no `set +e`, no skip-as-success. F-INFRA-06 anti-pattern correctly avoided.
- **Required-check-name coherence correct.** One job, key `smoke` (53); test pins `^ {2}smoke:$` as the only top-level job (#8). Required context = `smoke`, matches what the conductor registers.
- **Secret hygiene clean.** 13 `E2E_*` + `VERCEL_API_TOKEN` via `env:` from `secrets.*` (80, 193-205); none interpolated into `run:`, echoed, or `set -x`'d. GitHub auto-masks.
- **Supply chain / house style** matches `preview-cred-sync.yml`: only `actions/checkout@v4` + `actions/setup-node@v4`, no third-party actions, `permissions: contents: read` only, per-job concurrency + `cancel-in-progress`, `--unprotected` present (206), chromium-only install.
- **BACKLOG/runbook edits accurate** — F-INFRA-04's future change documented to the exact line + the test that must change in lockstep.

## Tests / typecheck
- New test: 8/8 passing.
- Full unit suite: `npx vitest run` — 2741/2741 across 187 files.
- `npx tsc --noEmit` — clean (exit 0).
- Integration/preview/E2E not run (ANVIL's job).

## Disposition (round 1)
Loop back to **Render** (fix in place — one-line `require`→`await import` + strengthen S1 guard), re-run Guard, then ANVIL. Live-PR observation of the discover+readiness steps is a hard ship gate before the check is made required on `main`.

---

## Round 2 — re-review of fix `1956dbe` — verdict: **SHIP**

The implementer applied both fixes on the branch (commit `1956dbe`); conductor pushed; code-critic re-reviewed.

- **B1 RESOLVED (yes).** `grep "require(" preview-smoke.yml` → nothing. Both `node <<'NODE'` heredocs (lines 83, 152) are `require`-free. The `import { appendFileSync } from 'node:fs'` sits inside the discover heredoc body (line 89), valid top-level ESM. Happy path traced 89→145: parses as unambiguous ESM → reaches `appendFileSync(GITHUB_OUTPUT, 'preview_url=…')` → `steps.discover.outputs.preview_url` populated → consumed by readiness step. The original crash was *before* any code ran; now reachable.
- **S1 fixed — 9th invariant sound, NO false-negative path.** Extracts every heredoc, asserts `(hasRequire && hasAwait) === false` per block; asserts `heredocs.length > 0` first (extraction-regex breakage fails loud, not vacuously). The documented limitation (`\brequire\(` matches inside a comment) can only *over*-flag, never under-flag — the only failure mode that would matter (a real `require(` slipping past) cannot occur. Within round-1's endorsed raw-text-proxy ruling.
- **No regression / no new finding.** Readiness heredoc untouched (already require-free). Fail-closed integrity, secret hygiene, `smoke` job-key/required-check coherence, house style all intact. Fix touched only the import + call site + a comment + the test.
- **Tests:** pin suite 9/9; `tsc --noEmit` clean; full unit suite 2742/2742 across 187 files.

**Round-2 disposition:** SHIP → hand to ANVIL. The live-PR observation (does the `smoke` workflow actually fire + discover + poll + run on PR #91) remains a hard ship gate before making the check required on `main`.

---

## ANVIL live run #1 (commit `1956dbe`) — FAILED → root cause = constructed host

Run `28303011732` on PR #91. Steps: discover ✓ → **readiness poll FAILED at 12m54s** (`status -1` every attempt) → specs never ran → gate RED (fail-closed worked). Root cause: the discover step CONSTRUCTED the preview host by gluing the branch name → `mfs-operations-git-feat-f-infra-03-preview-smoke-ci-…` whose first DNS label is **82 chars (>63 limit)** → not a legal hostname → every fetch threw. Confirmed via `host`/`nslookup` ("label too long") and the Vercel API (real alias is the truncated `mfs-operations-git-feat-f-aab410-…`). **Real code bug → eject to Render (fix #2).**

## Round 3 — re-review of fix `9c7c364` (read branchAlias, don't construct) — verdict: **SHIP**

- **Root cause resolved (yes).** `chosenHost = stripScheme(ready.meta?.branchAlias) || stripScheme(ready.url)`; constructed `aliasHost`/`SCOPE`/`sanitised` fully removed (zero code refs). Illegal-host failure mode cannot recur — the workflow no longer constructs a host.
- **Fail-closed preserved/strengthened:** API non-OK → exit 1; no READY preview → exit 1; NEW empty-host guard → exit 1; regex mismatch → exit 1. No exit-0-without-valid-host path.
- **branchAlias-over-url sound:** the alias auto-follows to the cred-wired redeploy (lets the readiness poll absorb the two-deploy race); unique url would pin to one possibly-credential-less deploy. `PREVIEW_HOST_RE` accepts both forms.
- **No regression to invariant 9** (no `require(`+await). **Invariant 10 added** pins the fix (branchAlias referenced; `-git-${` template + `aliasHost` absent).
- 🟢 nit: invariant 10's negative assertion is keyed to the exact reverted literal — a renamed reconstruction could theoretically evade it; positive `branchAlias` assertion carries the guard. Non-blocking.
- Tests: pin suite 10/10; `tsc` clean; full suite 2743/2743 (187 files).

## ANVIL live run #2 (commit `9c7c364`) — discover ✓ readiness ✓ (50s) → smoke step fail = EXPECTED (secrets not yet provisioned)

Run `28303505449`. Steps: discover ✓ → **readiness ✓ in 50s** (fix #2 confirmed live) → **smoke step failed at the DB-identity probe preconditions: `E2E_PIN_SALES and/or E2E_PIN_BUTCHER are not set` / `injected env (0) from .env.e2e.local`**. NOT a code bug, NOT an app regression (F-INFRA-03 changed zero app code) — the 13 `E2E_*` login secrets are not yet in GitHub Actions (the deferred wire-up step). The probe correctly fail-closed. Next: provision the 13 secrets (conductor's `.env.e2e.local`, sandbox-blocked → Hakan runs via `!`), then re-run.

**Round-3 disposition:** code SHIP-clean. Remaining to green the live run = provision secrets (wire-up), then a clean live pass, then the required-check registration.
