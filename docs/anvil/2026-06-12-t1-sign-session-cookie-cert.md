# ANVIL Clearance Certificate

Date: 2026-06-12
App: MFS-Operations (Next.js 15 App Router + Supabase + Vercel)
Branch: `fix/t1-sign-session-cookie` | PR: #30 (head `40c82c7`)
Unit: T1 — HMAC-SHA256-sign the `mfs_session` cookie (Critical #1, F-RLS-01 audit)

## Test results

| Layer                                                    | Status                              | Notes                                                                                                                              |
| -------------------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Unit (Vitest)                                            | PASS 1528/1528                      | 18 adapter specs incl. 3 ANVIL gap specs (cross-token sig swap, reordered claims, oversized cookie)                                |
| Integration (Vitest, real local Supabase)                | PASS 115/115                        | 5 new session-signing specs (forged role-escalation, legacy unsigned, garbage, cookie-clearing assertion); DB identity probe green |
| Database (pgTAP/RLS)                                     | SKIPPED                             | Approved at Gate 3 — T1 touches no schema, no RLS, no migration                                                                    |
| E2E local (Playwright)                                   | PASS api 2/2, ui 1/1, @critical 8/8 | KDS PIN-residue reds confirmed pre-existing on main; cleared via the one sanctioned local `db:reset`                               |
| Preview smoke (Vercel preview + Supabase preview branch) | PASS 8/8 @critical                  | Deployment `mfs-operations-2iexnnwsj…` (redeployed after SESSION_SECRET set); previewProbe 4/4 DB identity checks                  |

## Baselines

tsc 60/60, lint 58/58 — zero new findings. Zero new npm dependencies (Web Crypto is platform built-in).

## Guard verdict

code-critic: no blockers. Constant-time verify confirmed; edge-safe import chain confirmed; fail-closed on missing secret confirmed; no unverified `mfs_session` reads anywhere; hexagonal rip-out test PASS (swap crypto = 1 adapter + 1 wiring line).

## Pre-merge preconditions (R1) — SATISFIED

- [x] `SESSION_SECRET` set in Vercel **Production** (encrypted, distinct value) — 2026-06-12
- [x] `SESSION_SECRET` set in Vercel **Preview** (encrypted, distinct value) — 2026-06-12
- [x] Preview smoke re-run green after the above (8/8 @critical)
- [ ] Team told: "everyone logs in again once" — deploy at a low-usage moment (Hakan, at /ship)
- [ ] Post-merge: confirm PR #30's Supabase preview branch auto-deleted

## Known pre-existing issues (not T1)

- 2 @critical KDS butcher-PIN specs fail on any branch when the local DB carries PIN residue from old runs; fixed by `db:reset`, tracked behaviour.
- F-TD-14 (logged in this PR): 32 `/api/haccp/*` routes authorize off unsigned `mfs_role`/`mfs_user_id` cookies — separate unit, rides T4/`requireRole`.

## Migration / rollback

No migration. PITR: N/A. Destructive-migration check: N/A.
Rollback: `git revert` the merge commit on main → Vercel auto-deploys; users re-login once more. No DB component; safe in both directions.

## Verdict

**CLEARED FOR SHIP.** Deploy impact: one-time logout for all signed-in users (no grace window, by approved spec).
