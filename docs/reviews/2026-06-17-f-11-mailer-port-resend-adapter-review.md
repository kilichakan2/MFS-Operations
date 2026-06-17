# Code review — F-11 Mailer port + Resend adapter (PR #48)

**Date:** 2026-06-17
**Branch:** feat/f-11-mailer-port
**Reviewer:** FORGE Guard (code-critic subagent — sole review authority for this pass)
**Verdict:** NO BLOCKERS — hand to ANVIL

## Summary

Puts the Resend email SDK behind an app-owned `Mailer` port (structural twin of
F-12 LLMExtractor). Clears the "vendor SDK outside lib/adapters/" breach the 3
email helpers carried. Scope locked at Gate 1 to SEND-ONLY; raw recipient-fetch +
email HTML left byte-for-byte for F-15/F-17 to absorb later.

## Test / lint / typecheck

- Unit (`npm test`): **1758 / 1758 passed**, 99 files (incl. all new F-11 tests).
- Lint (`npm run lint`): clean.
- Typecheck (`npm run typecheck`, `tsc --noEmit`): clean (NOT sandbox-denied this run).

## Locked-invariant verification

| # | Invariant | Result |
|---|-----------|--------|
| 1 | `resend` imported in exactly one file | ✅ Only `lib/adapters/resend/Mailer.ts:25`; helpers no longer `await import('resend')`/`new Resend(` |
| 2 | Vendor types never leak past adapter | ✅ `lib/ports/Mailer.ts` has zero Resend types; adapter maps `{data,error}` → owned `SendResult` |
| 3 | Dependency rule (ports↛adapters; only wiring imports adapters) | ✅ Helpers import `@/lib/wiring/mailer`; only `lib/wiring/mailer.ts:19` imports the adapter |
| 4 | Behaviour byte-identical | ✅ FROM/recipients/html/skip-guard/skip-log intact; only approved D3 log change (`result.id` vs `result?.data?.id`, same value) |
| 5 | No-key skip = lazy guard INSIDE adapter, per-send | ✅ `lib/adapters/resend/Mailer.ts:46-52` reads key per call, returns `{skipped:true,reason:'no-api-key'}`, no client/network |
| 6 | OUT OF SCOPE (recipient-fetch, HTML/buildEmail/esc) untouched | ✅ Diff hunks touch only import line + send-call region; builders + fetch byte-for-byte unchanged |
| 7 | No new package.json dependency | ✅ `resend@^6.9.4` already present |
| 8 | ESLint ban both paths blocks + allow-list + pin extended | ✅ `.eslintrc.json:21` (top-level), `:61` (services/usecases), `:34` (adapter allow-list); pin tests 19–22 verbatim |

## Depth verdicts (new/touched modules)

- `lib/ports/Mailer.ts` → **DEEP** — tiny interface, hides whole Resend surface + no-key policy.
- `lib/adapters/resend/Mailer.ts` → **DEEP** — lazy client, key guard, vendor→owned mapping; not a pass-through.
- `lib/adapters/fake/Mailer.ts` → **DEEP-enough** — legitimate test seam, records messages, matches existing fake pattern.
- `lib/wiring/mailer.ts` → composition root, correct.

Not a speculative seam: one production adapter, but wraps a genuinely substitutable
external vendor; Fake is a second real implementation already in use.

## Rip-out test

**PASS** — swap email vendor = 1 new `lib/adapters/<vendor>/Mailer.ts` + change
`lib/wiring/mailer.ts:22`. Helpers/port/domain/routes/UI untouched. Lint ban makes a
regression a build failure.

## Byte-identical verdict

**Confirmed**, including the error path. Old helpers never inspected `.error` and
never threw on a send-result error — logged `result?.data?.id` (→ `undefined` on
failure). Adapter preserves exactly (`res.data?.id`, no error inspection; transport
throw propagates unchanged). Sole intended delta: D3 log shape.

## 🟢 Positives

- `lib/adapters/resend/Mailer.ts:50-52` — empty-string key treated as no-key, matching helper `?? ''`; pinned.
- `tests/unit/adapters/resend/Mailer.test.ts` — Resend `vi.mock`-ed; no network/live-key/cost ever; asserts send args, mapping, lazy/memoized construction, both no-key skips.
- `tests/unit/compliment-email.test.ts` (+ complaint/pricing twins) — assert exact from/to + verbatim skip logs; `mailer.send` never called on skip paths.
- `lib/ports/Mailer.ts:24-31` — `SendResult` carries `skipped`/`reason` in app vocabulary.

## 🟡 Should-fix

None.

## 🔵 Notes (non-blocking, no action this PR)

- **Client lifetime changed (invisible to output).** Old helpers built `new Resend(key)` per send; adapter memoizes one client per process (`lib/adapters/resend/Mailer.ts:36-42`). Output identical; Resend client stateless w.r.t. key. Benign efficiency gain.
- **`RESEND_KEY` const retained in helpers** — still used by the skip guard (D2 belt-and-braces: key read by helper to skip early + by adapter as safety net). Intentional, documented.

## Security

- No secret leak: `RESEND_API_KEY` never logged; only `result.id` (provider message id) logged, as before.
- No new injection surface: recipients/subject/html from unchanged helper code; adapter forwards verbatim.
- No network at import: key read lazy/per-send; pinned by `tests/unit/wiring/mailer.test.ts`.

## Loop-back

None. No blockers → ANVIL.
