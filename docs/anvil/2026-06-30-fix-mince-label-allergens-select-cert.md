# ANVIL Clearance Certificate — fast-lane fix

Date: 2026-06-30
App: MFS-Operations (Next.js + Supabase + Capacitor)
Branch: fprod04-fix-mince-label-allergens-select
PR: #103 — fix(fprod04): mince label 404 — drop non-existent column from mince select

## Scope

One-line correctness fix to `app/api/labels/route.ts`: the mince branch selected
`allergens_present` from `haccp_mince_log`, but that column exists ONLY on
`haccp_meatprep_log`. PostgREST rejected the malformed select → the route returned
404 → the V3 native mince path threw on the non-200 → fell back to the iframe path
(which cannot print on the device) → "Could not print label." Pre-existing latent
bug surfaced by the new native mince path (PR #102).

Fix: drop `allergens_present` from the mince select; render mince allergens as empty
("None") until Pass 3 wires real mince allergens. Prep is unaffected.

🗣 The label code asked the mince table for a field only the prep table has; the
database refused the whole query and the route read that as "not found." Stop asking
for the field that isn't there — the code already treats "no allergens" as "None".

## Risk tier

Low — server-side select fix, no schema change, no new dependency, behaviour-preserving
for everything except the broken mince path it repairs. Fast lane (no human matrix gate);
cert still issued.

## Test Results

| Layer | Status | Notes |
| --- | --- | --- |
| Type check (tsc) | ✅ clean (exit 0) | `data.allergens_present` reference replaced with `[]`. |
| Unit (Vitest) | ✅ 122/122 | `labelPrinting` + `adapters/sunmi/Printer` + `wiring/printer` — label content + native payload + native-vs-fallback all green. |
| Live prod DB verification (Supabase MCP) | ✅ | The CORRECTED mince select returns `MINCE-3006-BEEF-1` (id `955059ce…`, 3 source deliveries, GB+AU origins). The prep select's 11 columns all confirmed present on `haccp_meatprep_log`. |
| E2E @critical (CI smoke) | ✅ 78/78 | Run `28444284971`, conclusion success, 6m22s, fresh preview branch (no F-INFRA-07 flake). |
| Migration / RLS / PITR | n/a | No schema change; no migration; no destructive op. |

## Root-cause evidence

- Vercel production logs (prod deployment, commit `e45517f`): every `/api/labels`
  request at the failing time returned **404** (not 401) — the route's
  "Mince/prep record not found" branch, not an auth wall.
- Supabase prod schema (`uqgecljspgtevoylwkep`): `haccp_mince_log` has NO
  `allergens_present` column; `haccp_meatprep_log` does (line 881 of baseline).
- Use-by date confirmed already rendered on the native mince + prep stickers
  (`SunmiPrintBridge.java:263`/`:319`) and the HTML renderers — no change needed.

## Secondary findings (logged as follow-ups, not fixed here)

1. Web mince printing hit the same broken select → was ALSO 404ing in prod before
   today (pre-existing). The native path surfaced it.
2. The vitest integration suite (which would have caught this) is NOT in the CI
   `smoke` check, and could not run locally (Docker down). Gap → backlog.
3. The native bridge `printLabel` catch SWALLOWS exceptions (logs, no rethrow), so a
   native RENDER error fails silently (label just doesn't emit). Robustness gap → backlog.

## Verdict

CLEARED FOR PRODUCTION

Server-side one-line fix, verified against the live production database, type-check,
122 unit tests, and the green @critical preview smoke. No schema/RLS/PITR. The
installed V3 app needs NO reinstall — it loads the live site, so the deploy fixes the
device. Reprint the 58mm mince label after deploy to confirm.
