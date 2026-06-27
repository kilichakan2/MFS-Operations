# Code-critic review — F-27 "the Lego principle gets teeth"

- **Date:** 2026-06-27
- **PR:** #88 · branch `feat/f-27-vendor-fence-teeth` (base `main`)
- **Reviewer:** code-critic subagent (FORGE Guard phase)
- **Diff:** 243 insertions / 0 deletions, 3 files (config + 2 new pin tests)
- **Verdict:** **SHIP — no blockers**

## Scope
CONFIG + TEST-ONLY. Makes the existing hexagonal vendor-fence (ESLint `no-restricted-imports`) self-enforcing against FUTURE regressions. No app runtime code, no migration, no RLS, no new dependency.

Files:
- `.eslintrc.json` (edit, +17 additive) — fence `@capacitor/core` + `@capacitor/android` in BOTH ban blocks (top-level + `lib/services`/`lib/usecases` override); add `lib/adapters/capacitor/**/*.{ts,tsx}` to the adapter allow-list override. `@capacitor/cli` deliberately NOT fenced (build CLI).
- `tests/unit/lint/vendor-fence-complete.test.ts` (new) — regression guard.
- `tests/unit/lint/no-disable-arch-rules.test.ts` (new) — disable guard.

## The blocking question: can either guard FALSE-GREEN (a fence hole)? — NO
Proven via mental reverts:
- Drop `web-push` from the top ban block → completeness test RED.
- Drop `web-push` from the override block only → sync test RED.
- Add a new unfenced runtime dep (`stripe`) → completeness test RED.
- The disable-guard regex matches every real `eslint-disable` / `-line` / `-next-line` / block form naming `no-restricted-imports`/`no-restricted-syntax` (incl. multi-rule lists), while ignoring the 11 `react-hooks/exhaustive-deps` disables, the bare `// eslint-disable` at `app/cash/page.tsx:732`, and rule names in prose/strings.

## Test / lint results
- `npx vitest run tests/unit/lint` → **5 files, 100/100 passing** (2 new files contribute 4/4).
- `npm run lint` → clean ("No ESLint warnings or errors").
- `.eslintrc.json` diff purely additive (17 ins / 0 del), JSON valid, no reformatting of untouched lines.

## Findings

### 🔴 Blockers
None.

### 🟡 Warnings (non-blocking — both err toward *too strict*, can never create a hole)
- `tests/unit/lint/no-disable-arch-rules.test.ts:41` — regex anchors on the directive token then scans the rest of the line for the rule name. A line like `// eslint-disable-line react-hooks/exhaustive-deps -- see no-restricted-imports note` would FALSE-RED on trailing prose. Over-match → safe for a fence (can only over-complain, never wave through a bypass). No such line exists today.
- Scope: a bare `/* eslint-disable */` block with NO rule named silences everything (incl. arch rules) and is out of this guard's scope by design (same class as the documented `cash/page.tsx:732` bare line). The file's header docstring states this explicitly and points to a separate BACKLOG hardening. The one residual gap in the "can't be disabled" claim → **logged to BACKLOG (F-27-bare-disable-hardening)**.

### 🔵 Architecture notes
- Depth rubric **N/A by design** — diff is two leaf test files (no public interface to grade) + three JSON entries. No port to demand here; flagging its absence would be the inverse error the rubric warns against.

### 🟢 Test-quality notes
- Both tests assert behaviour through the REAL artifacts (read actual `package.json` + `.eslintrc.json`, scan actual source tree) — no mocks; matches the existing pin style. Only `vitest` + node `fs`/`path` — no new dependency.
- `vendor-fence-complete.test.ts:80` locates the override block by its `files` glob, not a hard-coded `overrides[1]` index, so reordering overrides can't false-red. `[1].paths` access correctly reads the vendor list and ignores the block-specific `patterns` (cross-service rules) — sync check scoped to vendor `paths` only. ALLOWLIST (react/react-dom/next/zod/recharts/react-markdown/lucide-react/@capacitor/cli) complete and justified — all framework/validation/presentation libs or the Capacitor build CLI, none external-service SDKs.

## Verdict line
No blockers — hand to ANVIL. Neither new test can false-green; both go red on real regressions; full lint suite clean; `.eslintrc.json` additive and valid; the two new Capacitor runtime deps correctly fenced in both blocks, `@capacitor/cli` correctly allow-listed.
