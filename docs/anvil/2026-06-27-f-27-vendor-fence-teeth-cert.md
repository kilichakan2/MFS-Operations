# ANVIL Clearance Certificate — F-27 "the Lego principle gets teeth"

**Status: CLEARED FOR PRODUCTION**

Branch: feat/f-27-vendor-fence-teeth

- **Date:** 2026-06-27
- **Unit:** F-27 — vendor-fence regression guard + no-disable-arch-rules
- **PR:** #88 · branch `feat/f-27-vendor-fence-teeth`
- **Base:** main @ `28b9c9e`
- **Commits:** `d08863a` (eslintrc fence) · `d06e727` (2 pin tests)
- **Change class:** CONFIG + TEST-ONLY — no app runtime code, no migration, no RLS, no new dependency
- **Right-sizing:** UNIT-ONLY (matrix approved at ANVIL Gate 3). Bundle is byte-identical (`next build` ignores ESLint; `tests/**` don't ship) → no integration / pgTAP / E2E / browser / preview coverage earned.

## What shipped
1. `.eslintrc.json` — `@capacitor/core` + `@capacitor/android` fenced in BOTH `no-restricted-imports` ban blocks (top-level + `lib/services`/`lib/usecases` override, kept in sync at 16 entries each); `lib/adapters/capacitor/**/*.{ts,tsx}` pre-permitted in the adapter allow-list override. `@capacitor/cli` deliberately NOT fenced (build CLI).
2. `tests/unit/lint/vendor-fence-complete.test.ts` — asserts every non-allow-listed runtime dependency is fenced and the two ban blocks stay in sync. Future `npm install <vendor-sdk>` → RED until fenced or justified on the ALLOWLIST.
3. `tests/unit/lint/no-disable-arch-rules.test.ts` — asserts no source file `eslint-disable`s `no-restricted-imports`/`no-restricted-syntax`. Future bypass attempt → RED.

## Test ladder (authoritative conductor run — main session)

| Layer | Result |
|---|---|
| Full unit suite (`npx vitest run`) | **2715 passed / 185 files** (+4 new F-27 pins) |
| Lint pin dir (`tests/unit/lint`) | **100 passed / 5 files** (2 new + 3 existing pins) |
| ESLint (`npm run lint`) | **clean** — No ESLint warnings or errors |
| Typecheck (`tsc --noEmit`) | **clean** — exit 0 |
| Integration / pgTAP / RLS | n/a — no DB access, no migration |
| E2E / browser / preview smoke | n/a — byte-identical bundle |

Convergence: implementer's run, code-critic's Guard run, and this conductor run all report the same counts (2715 unit / 100 lint pins / lint clean / tsc clean).

## Guard (code-critic, PR #88)
**SHIP — no blockers.** The blocking question — *can either guard FALSE-GREEN (a fence hole)?* — answered NO via mental reverts (dropped `web-push` → RED; sync drift → RED; new unfenced `stripe` → RED; disable-regex matches all real arch-rule disables while ignoring the 11 hook-deps disables + the bare `cash/page.tsx:732` line + prose). Two non-blocking 🟡 (both err *too strict*, can never make a hole) — one logged to BACKLOG (`F-27-bare-disable-hardening`). Review: `docs/reviews/2026-06-27-f-27-vendor-fence-teeth-review.md`.

## Destructive-migration / PITR
NONE. No migration of any kind → no PITR gate required.

## Rollback
Code-only — revert the merge commit (no data, no schema, no env touched). See `docs/anvil/2026-06-27-f-27-vendor-fence-teeth-rollback.md`.

## Clearance
All earned rungs green; Guard clean; no destructive ops. **CLEARED FOR PRODUCTION.**
