# Code-critic review — F-RLS-final (RLS posture seal)

- **Date:** 2026-06-27
- **Branch:** feat/f-rls-final-posture-guard (4 commits vs main)
- **Reviewer:** code-critic (FORGE Guard phase)
- **Verdict:** **SHIP — no blockers.** Hand to ANVIL (right-sized UNIT + pgTAP).
- **Diff:** 3 files, +887/-0 — `tests/unit/lint/no-service-role-in-user-routes.test.ts`,
  `supabase/tests/017-empty-guc-fails-closed.test.sql`,
  `docs/adr/0008-rls-final-service-role-allowlist-and-posture-seal.md`.
  ZERO runtime/migration/dep/eslintrc changes. Byte-identical shipped bundle.

## Context
Last Day-16 sealing security unit. Not a cutover — a regression GUARD (3-door master-key
tripwire) + posture ADR (the master-key register) + a pgTAP safety-pin. The prior Guard pass
found a 🔴 blocker (a third, raw-env master-key door unwatched, 3 live un-registered routes:
screen2/note·resolve·sync). This pass confirms that fix (Rule C) is real and complete.

## False-GREEN analysis (the core property) — per rule
- **Rule A (direct import)** — CANNOT false-green. Regex anchors on `^\s*import` + adapter path
  `adapters/supabase/(client|authenticatedClient)` + `supabaseService|getSupabaseService|requireServiceRole`
  (test:217-218). Probed evasions vs live tree: alias form caught (test:309); `import * as`,
  `createClient`, `require()`, direct `@supabase/*` — none in tree (vendor fence F-27 holds);
  blessed `requireServiceRole` now matched, 0 current users → no false-red (test:315-319).
- **Rule B (wiring singleton)** — CANNOT false-green. Any non-`…ForCaller` symbol from
  `@/lib/wiring/**` presumed master-key-carrying (test:270-287). New singleton import at
  non-allow-listed path → RED (test:370-377); mixed imports flag only the singleton (test:385-389).
- **Rule C (raw-env key)** — CANNOT false-green. Regex matches `process.env.SUPABASE_SERVICE_ROLE_KEY`
  and bracket form `process.env['…']` (test:226-227, 435-447). Closes the prior blocker.

## False-RED analysis (accuracy vs live tree) — every seed grep re-run
| Rule | Live count | Allow-list | Match |
|---|---|---|---|
| A direct import | 9 real + 1 comment-only | 9 | ✓ exact |
| B wiring singleton (via live matcher) | 31 | 31 | ✓ exact, no stale/ghost |
| C raw env | 5 | 5 | ✓ exact |
- Rule A 10th hit `app/api/notifications/subscribe/route.ts:12` is comment-only → anchored regex
  correctly does NOT match (test:327-332).
- Live Rule B matcher node-run: `inLiveNotAllow=[]`, `inAllowNotLive=[]`.
- All 4 matcher-referenced exports exist (authenticatedClient.ts:37,54; client.ts:21,36).

## Allow-list ↔ ADR parity — EXACT (A 9/9, B 31/31, C 5/5, zero divergence)
Multi-rule registrations verified in source: `screen3/sync` on B (visitsService line 16) + C
(raw key line 23); `routes/optimise` on A (supabaseService line 39) + C (raw key line 27).
ADR multi-rule note honest (0008:96-176).

## pgTAP 017 correctness — all 8 assertions empirically reproduced against live local DB
1 customers empty GUC → 0 rows no error (is_empty) ✓ · 2 products → is_empty ✓ ·
3 users empty GUC → 22P02 throw (throws_ok) ✓ · 4 visits → same policy shape, 22P02 ✓ ·
5 is_admin() empty GUC → 22P02 ✓ · 6 valid GUC customers → 1 row (isnt_empty) ✓ ·
7 valid GUC is_admin() → true ✓ · 8 valid GUC visits → 1 row ✓.
Positive sanity (#6/7/8) proves the denial is the GUC's doing, not a broken fixture.
Harness self-contained (BEGIN/ROLLBACK, re-asserted GRANTs, `\ir _helpers.sql`, role switch)
mirroring 016. Live `pg_policy` confirms Fold-in #4 comment correction accurate
(customers_select pure presence; users/visits_select carry bare `''::uuid` left-operand cast
as first-evaluated co-cause + is_admin()).

## Scope honesty — byte-identical confirmed
`git diff --stat`: 3 files, +887/-0. No supabase/migrations, no package.json/lockfile, no
app/lib/components, no next.config, no .eslintrc. NO migration → NO PITR gate.

## Test / lint (verified, not reported)
- Full unit suite: **2733 passed / 186 files** ✓ · new guard test **18/18** ✓
- tsc --noEmit: **clean** ✓ · next lint: **"No ESLint warnings or errors"** ✓
- pgTAP 017: **8/8 logic empirically reproduced green** (project-wide `_helpers.sql` 0-tests
  `Result: FAIL` artifact is NOT 017 — 017's own assertions all pass).

## Findings
- **🔵 (follow-up, NOT a blocker) — Rule B over-flags non-DB ports.** Convention flags every
  non-`…ForCaller` wiring import regardless of master-key use, so `geocoder`/`pushSender` (non-DB,
  no key) sit in a security allow-list. Disclosed honestly in ADR (0008:148-155) as the deliberate
  security-correct bias (require a written reason for any non-badge-checked wiring import).
  Pre-existing-posture shading, not introduced by this diff. No loop-back. Per-route tightening
  is the documented follow-on.
- **🟢 (note) — multi-line-split residual honestly scoped.** All 3 matchers single-line
  (test:46-53, ADR residual #2). Formatter-split `process.env\n.SUPABASE_…` or split import brace
  would evade — none exist in live tree, disclosed in test header + ADR. Matches
  no-disable-arch-rules.test.ts precedent. Same treatment for the 3-hop residual (ADR residual #1).
  Appropriately scoped; no action this unit.
- **Architecture depth:** N/A — no ports/adapters/modules added. Guard + register + pin that
  PROTECTS the existing `…ForCaller` vs service-role seam. Rip-out posture unchanged; no
  PASS-THROUGH / SPECULATIVE SEAM. No depth blocker.

## Outcome
No blockers. Advance to ANVIL (UNIT + pgTAP, no integration/E2E/preview — byte-identical bundle;
post-deploy prod non-5xx smoke; no PITR).
