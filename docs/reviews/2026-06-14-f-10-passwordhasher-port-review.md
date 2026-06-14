# Code-Critic Review — F-10 PasswordHasher Port (PR #36)

**Date:** 2026-06-14
**Branch:** f-10-passwordhasher-port
**Head:** 6c62cf8
**Reviewer:** code-critic subagent (sole review authority inside FORGE)
**Verdict:** ✅ NO BLOCKERS — hand to ANVIL.

## Gate results (re-run on PR head)
| Check | Result | Baseline | Status |
|---|---|---|---|
| `tsc --noEmit` | 0 errors | 0 | PASS |
| ESLint | 0 / 0 | 0 | PASS |
| unit (`vitest run tests/unit`) | 1552 / 1552 (78 files) | 1536 → +16 | PASS |

## 🔴 Blockers — NONE

## 🟡 Should-fix — NONE blocking
- **`app/api/auth/login/route.ts:150-159` — login on a CORRUPT stored hash: 500 → 401 (+ rate-limit tick). INTENDED, documented improvement, not a defect.** Pre-F-10 a malformed `password_hash`/`pin_hash` could make `bcrypt.compare` throw → route returned 500 `Authentication error`. Now `compare` is TOTAL → corrupt hash returns `false` → falls into the existing `if (!valid)` 401 `Invalid credentials` branch, and now also calls `recordFailure(name)` (counts toward lockout), which the old 500 path did not. Safer behaviour. Record in ship record as a deliberate response-code change.

## 🔵 Architecture / depth follow-ups — NONE

## 🟢 Test-quality green flags
- `tests/unit/adapters/bcrypt/PasswordHasher.test.ts:71-87` — TOTAL-ness proof is genuine: uses an object with a throwing `toString()` (the only input that actually reaches the catch), asserts `false` + `console.error` fired. Not tautological.
- `:61-69` — cross-cost compatibility proven: a cost-10 raw-bcryptjs hash still verifies through the adapter (the "existing stored credentials keep working" guarantee).
- `:55-59` — cost-12 pin asserts `^\$2[aby]\$12\$`, locking algorithm strength against silent weakening.
- Round-trip, wrong-plaintext, garbage-hash→false, empty-hash→false, non-string casting on both methods — all behaviour-based through the public factory.

## Six sharp checks
1. **Hexagonal — PASS.** Port pure TS; adapter (line 23) sole `bcryptjs` import in non-test code; all 4 routes import `passwordHasher` from `@/lib/wiring/password`, none import the adapter. Rip-out = 1 adapter folder + 1 wiring line.
2. **TOTAL contract — PASS.** Both `String()` casts inside the `try` (adapter line 38) → throwing `toString()` caught → logs → false. `hash` may throw only on genuine internal failure (documented, intended).
3. **Behaviour preservation — PASS** (+ documented 401/500 change). Cost factor still 12. kds-pin per-user loop intact (`route.ts:59-69`), only inner compare swapped, skip + empty-guard preserved. Admin routes: outer try/catch still returns 500 on hash failure (same external result); `[id]` is a clean one-line swap.
4. **Security — PASS.** No plaintext credential logged; adapter `console.error` logs only the error object, never `plain`/`hash`. Timing safety unchanged (still `bcrypt.compare`). No change to what gets hashed.
5. **Lint mirror integrity — PASS.** Forbidden message byte-identical across all 3 sites (verified programmatically). `lib/adapters/bcrypt/**` exemption present; services override RESTATES base paths (avoids the legacy "override replaces not merges" trap). Tests confirm ban in `app/api` + `lib/services`, allow in `lib/adapters/bcrypt`.
6. **Test quality — PASS** (see green flags).

## Depth verdict (touched modules)
- `lib/ports/PasswordHasher.ts` → DEEP / real seam ✅ (2-method interface, real in-use adapter, genuinely substitutable; not speculative).
- `lib/adapters/bcrypt/PasswordHasher.ts` → DEEP ✅ (owns String() casting + TOTAL guard + cost-12 policy; deletion pushes 3 chores back into 4 callers). Not a pass-through.
- `lib/wiring/password.ts` → composition root, correctly thin (F-TD-11 role).
No PASS-THROUGH, no SPECULATIVE SEAM introduced.

## Doc-comment staleness — CLEAN
All 4 new files' header paths match their real locations (unlike F-TD-04's 3 stale 🔵s).
