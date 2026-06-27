# ANVIL Clearance Certificate — F-RLS-04i Admin-context RLS

Date: 2026-06-27
App: MFS-Operations (Next.js App Router + Supabase, hexagonal)
Branch: feat/f-rls-04i-admin-context-rls
PR: #87
Tier: EXHAUSTIVE
Preview: https://mfs-operations-dtzxmozzc-hakan-kilics-projects-2c54f03f.vercel.app
Preview deploy id: dpl_GcP6S89U8UTHaxQfAaADtMyeFW8e (READY)
Verdict: ✅ CLEARED FOR PRODUCTION (conductor-confirmed at Lock)

## Scope
15 admin routes flipped service-role → `…ForCaller(userId)` (GUC RLS fires) + every admin guard standardized onto `requireRole(req,['admin'])`. 4 new wiring factories (customers/products/auditLog/mapData `…ForCaller`). NEW pgTAP `supabase/tests/016-rls-admin-context.test.sql` + NEW integration `tests/integration/admin-context-rls.test.ts`. NO migration (policies pre-existed). NO new dep. Rip-out: PASS.

## Test Results (all layers — convergent: runner + conductor independent runs)
| Layer | Status | Notes |
| --- | --- | --- |
| Unit (Vitest) | ✅ 2711/2711 | per-route guard matrix (401 absent / 403 non-admin / 200 admin), forged-header refusal, ghost-admin secondary-role filter, 4 ForCaller factory tests, byte-identical shapes |
| Lint (ESLint) | ✅ clean | `no-restricted-imports` + `no-adapter-imports` pass |
| Types (tsc --noEmit) | ✅ clean | exit 0 |
| Database (pgTAP) | ✅ 237 tests; file 016 `ok` (18/18) | customers/products presence-SELECT, is_admin()-only INSERT/UPDATE (42501 non-admin), empty-GUC fail-closed; audit_log WITH CHECK user_id=GUC anti-spoof (#13/#14) + is_admin() SELECT; **#17 admin sees another rep's visit · #18 non-admin denied.** (`_helpers.sql` "No plan" is a benign harness include, not a failure.) |
| Integration (LIVE booted server → middleware → token → GUC → live RLS) | ✅ 11/11 | NEW admin-context-rls.test.ts: per-route guards, R-VIS cross-rep on /api/admin/customers + /api/admin/products + /api/map/data, R-AUDIT import audit-row-lands (user_id=caller), R-SEC non-admin path-gated 307 |
| E2E @critical (Playwright, 75 specs) | ✅ 75/75 first-run (4.9m) on preview | incl. admin customers list + postcode edit round-trip (customers ForCaller, live) + geocode-all admin 200; dashboard/map admin reads populate |
| Admin browser sweep (live R-VIS) | ✅ via authenticated E2E walk | signs in as admin, walks customers + dashboard + map; populated against real preview data |

## The three risks — live verdicts
- **R-VIS (HIGH) — admin sees ALL reps, not narrowed to own → empty:** ✅ PROVEN 3× (pgTAP #17/#18, integration cross-rep on customers + map/data, live E2E admin list+dashboard+map populate).
- **R-AUDIT (MED) — import lands audit_log row authored as caller; failed audit never 500s a succeeded import; geocode fire-and-forget:** ✅ PROVEN (integration import-confirm → 201 + real audit_log row user_id=admin caller; pgTAP #13/#14 anti-spoof).
- **R-SEC (MED) — forged role header / ghost-admin refused:** ✅ PROVEN (unit forged-header + ghost-admin filter; integration non-admin path-gated 307 off every admin surface, no cross-rep leak).

## Code bugs found
None. No eject. One test-only fix during Iterate (seeded the cross-rep map customer WITH lat/lng so it is plottable — map reads correctly exclude un-geocoded rows; test bug, no source touched).

## Migration / PITR
None. RLS policies pre-existed; this PR only changes which Postgres role the routes connect as. PITR: N/A (no destructive op, no data at risk). Rollback: docs/anvil/2026-06-27-f-rls-04i-admin-context-rls-rollback.sql — code-only (revert the merge; per-route parachute = swap each `…ForCaller(userId)` back to its retained service-role singleton).

## Known artifact (NOT a blocker)
`tests/integration/haccp.test.ts` 8/8 fail LOCALLY (`expected 409 to be 200` — HACCP daily-session idempotency from stale local seed). NOT in PR #87 diff (HACCP untouched); fails identically in isolation; documented sprint pattern (green on preview). Does not gate F-RLS-04i.

## Merge sequence (Lock gate — conductor owns)
1. No migration to push — skip `supabase db push`.
2. Merge PR #87 (squash) while ON the feature branch → Vercel auto-deploys. ANVIL test (13bbb93) already pushed to the branch so it lands in the squash.
3. Post-deploy smoke: @critical paths against prod URL (www.mfsops.com); rollback = vercel revert (code-only, no data).

## Honest gap named
The populated-admin-screen proof is via the signed-in E2E walk, not a free-hand human click of every admin screen (no link-crawl rung in this repo; an unauthenticated MCP probe can't carry the admin session). The E2E walk already proves the cutover screens populate as admin against real preview data — a manual walk would add confidence, not coverage.
