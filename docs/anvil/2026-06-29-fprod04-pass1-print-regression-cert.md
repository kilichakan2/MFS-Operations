# ANVIL Clearance Certificate — F-PROD-04 Pass 1 (print-regression hardening)

**Verdict:** ✅ CLEARED FOR PRODUCTION
**Date:** 2026-06-29
Branch: fprod04-pass1-print-regression-hardening
**HEAD:** 9f7b6a3
**PR:** #98

## Scope under test
Client-side print-path robustness fix. The HACCP delivery + mince print buttons
previously printed the LOGIN PAGE silently when the session was dead (the client
checked only `res.ok`, but a dead session 307-redirects `/api/labels` to `/login`
which returns 200 HTML). The fix extracts a shared helper `lib/printing/labelFetch.ts`
with a pure `classifyLabelResponse` that detects an auth-bounce and refuses to print,
surfacing a "session expired — log in again" message via each page's existing
`submitErr`. NO change to `/api/labels`, `middleware.ts`, session/auth, the Sunmi
bridge, the DB, or any migration. Happy path byte-identical.

## Per-layer results

| Layer | Result | Detail |
| --- | --- | --- |
| Unit — `tests/unit/printing/labelFetch.test.ts` | ✅ 8/8 | classifier: label · auth-bounce · 401/404/500 · malformed-url guard · `?from=/login` not misclassified |
| TypeScript (`tsc --noEmit`) | ✅ clean | exit 0 |
| E2E @critical — `29-haccp-print-dead-session.spec.ts` | ✅ 3/3 | #76 delivery bounce (re-login shown, no iframe, no print) · #77 happy-path (valid session prints — print iframe created) · #78 mince bounce (re-login shown, suppressed) |
| E2E @critical — full regression | ✅ 78/78 | whole suite green on a clean preview DB; no HACCP/other regressions; 0 flaky |
| Integration / pgTAP / PITR / Edge | n/a | no API/DB/migration/policy/edge change |

**Evidence:** GitHub Actions preview-smoke run `28384015855` (78 passed, 4.6m) against
Vercel preview + Supabase preview branch `373ca93f-5c11-4909-9889-57496dff221e`
(ref `qaiwdrxjntbivylfozkb`), commit `9f7b6a3`. No physical device required — the
Sunmi V3 APK is a remote-URL shell loading the live web app, so the browser/iframe
path proves the device path; the native bridge is untouched this pass.

## Run history / notes
- Initial ANVIL run SUSPENDED (local Docker/Supabase down, anvil-runner sandbox-denied
  from starting it). Per standing rule, the CONDUCTOR finished the E2E via CI preview
  smoke. SUSPEND record: `docs/anvil/2026-06-29-fprod04-pass1-print-regression-SUSPENDED.md`.
- The mince dead-session test self-skip (code-critic 🟡 #2) was fixed to build its own
  mince run — no coverage gap.
- Two test-instrumentation bugs surfaced on the first preview run and were fixed
  (commit `9f7b6a3`): (1) happy-path now proves the print path positively via the
  created print iframe instead of a main-frame `window.print()` spy that cannot observe
  a print fired inside the iframe's contentWindow; (2) the dead-session visibility
  checks use `.first()` because the shared `submitErr` can mount in multiple tab
  sections (Playwright strict mode). Neither was a code fault.
- Pre-existing HACCP "submit-once-per-period" specs (cold-storage deviation,
  process-room, reviews-weekly) false-RED on the first runs due to the known F-INFRA-07
  preview-DB non-idempotency (a later push to the same PR reuses an already-written DB).
  Cleared by MCP `reset_branch` on the preview branch → ACTIVE_HEALTHY → smoke rerun on
  the same HEAD. Clean 78/78. No gate bypass.

## Migration / PITR
None. No migration, no schema, no RLS, no destructive op → no PITR required.

## Rollback
Code-only, client-side change. Rollback = revert PR #98 / redeploy the previous Vercel
build. No rollback SQL, no PITR.

## Optional on-device sanity check (Hakan, physical Sunmi V3 — not required to ship)
The fix deploys to the web; the device picks it up on next app launch.
1. Operational fix for the current live break: log out + PIN-log back in on the device
   (mints a fresh signed `mfs_session`); printing should resume.
2. To confirm the hardening: log in, delete the `mfs_session` cookie in DevTools, tap a
   print button → it should show "log in again", NOT print a login page.
