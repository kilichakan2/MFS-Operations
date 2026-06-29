# FORGE Guard review — F-PROD-04 Pass 1 (print-regression hardening)

- **PR:** #98 — `fprod04-pass1-print-regression-hardening`
- **Base:** `main` @ 8d36e58
- **Reviewer:** code-critic (FORGE Guard)
- **Date:** 2026-06-29
- **Verdict:** **NO BLOCKERS — hand to ANVIL**

## Checks
- `npx vitest run tests/unit/printing/` → 8/8 passing
- `npx tsc --noEmit` → clean (exit 0)
- Scope (`git diff --name-only`): only the 2 HACCP pages, new helper, 2 test files, 2 docs (plan + BACKLOG). No touch to `/api/labels`, `middleware.ts`, `lib/printing/sunmi.ts`, session/cookie/auth, the Sunmi bridge, `package.json`/lockfile, or any migration.
- No AI references in diff or commit messages (only match is the rule text in the plan doc, which states the prohibition — not a violation).

## Depth & architecture
- `lib/printing/labelFetch.ts` → **DEEP**. Genuine dedupe of two identical ~30-line copies that each carried the same bug; deletion test passes (complexity concentrates here). Not a pass-through, not a speculative seam.
- **Hexagonal: PASS.** Imports no vendor SDK and nothing from `lib/adapters/**`; owned presentation-layer code calling the app's own `/api/labels`. Rip-out test N/A (no vendor).

## Findings

### 🔴 Blockers
None.

### 🟡 Should-fix (non-blocking)
1. **`app/haccp/delivery/page.tsx:1642` (collapsed-list print strip) — error renders far from the button.** List-row print errors route to the page-level `submitErr` at line ~1527 (entry-form area), so on a dead session a row deep in a long list shows the "Session expired" message off-screen at the top. NOT silent (message renders, `window.print()` suppressed) — but the user may miss it. The modal path (line ~741) and the mince history path place the message next to the buttons; only this collapsed-list path doesn't.
2. **`tests/e2e/29-haccp-print-dead-session.spec.ts:201` — mince dead-session test self-skips when no seeded mince run exists (`test.skip(!hasPrintable)`).** On the default seed there may be no mince run for "today", so the mince-path assertion silently skips and produces a green run with zero mince coverage. The delivery test correctly builds its own data (`logBeefDelivery`); the mince test should log a mince run first so the path is always exercised.

### 🔵 Notes (follow-up)
- `lib/printing/labelFetch.ts:46` — `pathname.startsWith('/login')` would false-positive on a hypothetical `/loginhelp`. No such route exists today; harmless. `=== '/login'` would be marginally tighter.
- Classifier correctness depends on `/api/labels` staying in `SHARED_API_PATHS` (`middleware.ts:80`). Every reachable outcome today is covered (no/invalid session → `/login` bounce caught; valid session any role → `next()` before the permission check). The permission-denied branch redirects to a role-home page (NOT `/login`) and the classifier would wrongly accept that as a label — but that branch is **unreachable** for `/api/labels` today. If the route is ever moved to role-gating, the wrong-page-print class of bug returns silently. Worth a one-line comment pinning the assumption.

### 🟢 Good
- Behavioural parity verified: the iframe/print block (style, `contentDocument ?? contentWindow?.document` guard, `open/write/close`, `onload → setTimeout(300) → print() → setTimeout(2000) cleanup`) is byte-identical to both deleted copies; mince's terse one-liners collapsed to the verbatim form with identical semantics.
- `classifyLabelResponse` ordering correct: `/login` pathname check BEFORE `!res.ok` (a 200-HTML login bounce has `ok: true`, so order is load-bearing). URL-parse try/catch maps malformed url → `error`. `?from=/login` look-alike kept as a real label via pathname (not substring) matching.
- Unit tests meaningful (test public behaviour incl. the two traps), not tautological.
- E2E delivery + happy-path are real proofs: dead-session asserts re-login message AND iframe count 0 AND spied `window.print()` fired 0 times; happy path proves `window.print()` fires on a valid session; builds its own data.

## Hand-off
No blockers — hand to ANVIL. Conductor decision on the two 🟡s before ANVIL.
