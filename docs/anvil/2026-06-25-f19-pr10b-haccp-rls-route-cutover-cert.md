# ANVIL Clearance Certificate

Date: 2026-06-25
App: MFS-Operations (HACCP food-safety module)
Branch: feat/f19-pr10b-haccp-rls-route-cutover
PR: #79

## Scope — what this certificate actually covers

| Change / path | Risk tier | Layers required | Layers run |
|---|---|---|---|
| 32 HACCP routes flipped service-role → `…ForCaller(userId)` (`app/api/haccp/**`) | Critical (RLS + auth) | Unit + Integration + pgTAP + full E2E | Unit + Integration + pgTAP + full @critical E2E |
| `lib/wiring/haccp.ts` (doc-comment only) | Low | none beyond unit | Unit |
| `app/api/haccp/visitor/route.ts` (NOT flipped — public kiosk) | High (must-not-flip) | E2E | E2E (kiosk submit green on service-role) |

**Not run under the efficiency dial:** None — full ladder run (RLS/auth = high-risk tier; full E2E re-run on the preview, not just smoke).
**Baseline characterisation pass?** No — diff-driven, full coverage of the cutover.

## Test Results

| Layer | Status | Notes |
|---|---|---|
| Unit (Vitest) | ✅ 2379/2379 | Incl. 28 PR10b route-guard tests + haccp wiring tests |
| Integration (Vitest) | ✅ 464/464 | HACCP routes exercised as authenticated active user through real middleware → header → `authenticated` role → live RLS, with read-back |
| Database (pgTAP) | ✅ 015 58/58 (suite 219/219) | 3 new PR10b assertions (active-user round-trip + absent-identity 42501) green; `_helpers.sql` "no plan" line is a pre-existing harness quirk, not a test |
| Edge Functions (Deno) | n/a — not required | No edge function in diff |
| Local full-stack rung | ✅ Supabase CLI adapter | `db:up` + `db:reset` → integration + pgTAP locally; `db:down` after |
| E2E (Playwright @critical) | ✅ 73/73 | Exhaustive HACCP browser-tap on prod-build preview under RLS; no regression on non-HACCP paths |
| Populated UI smoke | ✅ populated | HACCP screens rendered + submitted real records (daily checks, CAs, reviews, exports) as a logged-in user; interactions confirmed |
| Breadth crawl | ✅ via @critical taps | The 73 @critical specs tap every HACCP screen + button (home nav, all tiles, audit sections/presets, export, drawers) |

**Targets tested:**
- Vercel preview: `https://mfs-operations-git-feat-f-a8c830-hakan-kilics-projects-2c54f03f.vercel.app` (PR #79, commit `787f096`, deployment `dpl_6Dj3Nhy9JnF8qZx1yukGwjiLUGiZ`, READY). `--unprotected` (Deployment Protection OFF since F-INFRA-02 / BACKLOG F-INFRA-04).
- Supabase preview branch: `feat/f19-pr10b-haccp-rls-route-cutover` · branch id `a8a25f05-e8f1-4ca5-a9db-fa68d84e00f5` · project_ref `pdlfmomhejimyesomjpe` · `ACTIVE_HEALTHY` · parent (prod) `uqgecljspgtevoylwkep`.

**F-TD-37 preview flake:** did NOT bite — clean first E2E run, no `reset_branch` needed.

## Warnings (non-blocking)
None.

## Migration
None. PR10a shipped the policies (additive); service-role bypasses them.
Rollback script: docs/anvil/2026-06-25-f19-pr10b-haccp-rls-route-cutover-rollback.md (code-only — revert import swap; service-role singletons retained as parachutes)
PITR confirmed: N/A — no migration, no destructive op

## Pre-ship gate R-LB-1 — VERIFIED ✅ (conductor, 2026-06-25, prod read)
`SELECT id,name,role,active FROM users` on prod (`uqgecljspgtevoylwkep`):
- Admin-kiosk user `e5320cb8-8977-4f86-80d7-6bbc595ce183` (Hakan, admin) → **active = true** ✅
- Daz (warehouse) → active = true ✅ · Adeel (butcher) → active = true ✅ (real kiosk-login staff)
- "Visitor Kiosk" pseudo-user `190d6c79-…` (warehouse) → active = **false** — HARMLESS: visitor route stays
  service-role (RLS-bypassed) and the user is excluded from the `activeOnly:true` login lists, so it never
  reaches a `…ForCaller` mint. Consistent with "visitors excluded automatically".
→ Admin tablet will NOT lock itself out under RLS. Gate cleared.

## Merge Sequence
1. No migration to apply — skip `supabase db push`.
2. Merge PR #79 → Vercel auto-deploys.
3. Post-deploy smoke: 3 @critical HACCP paths against https://www.mfsops.com (rollback = revert PR; no data touched).

## Manual smoke at merge
Not required. Critical HACCP flows green on the real preview under RLS with real data, every screen +
button tapped, R-LB-1 verified `active = true` in prod, post-deploy smoke armed with a code-only rollback.

## Verdict
✅ CLEARED FOR PRODUCTION. All four rungs green first loop; no eject; no migration; R-LB-1 verified.
