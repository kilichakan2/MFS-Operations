# ANVIL Clearance Certificate

Date: 2026-06-23
App: MFS-Operations
Branch: feat/f19-pr2-cluster-a-route-repoint
PR: #69 (base main @ e357657)
FORGE unit: F-19 PR2 — Cluster A HACCP route re-point (9 routes onto the PR1 hexagon, byte-identical)

## Scope — what this certificate actually covers

| Change / path | Risk tier | Layers required | Layers run |
| --- | --- | --- | --- |
| 9 HACCP route files re-pointed off inline `supabaseService` onto the PR1 service-role singletons (`haccpDailyChecksService`, `haccpCorrectiveActionsService`, `submitHaccpDailyCheck`) from `@/lib/wiring/haccp`. +329/−1880. No migration, no lib/ edit, no package.json. | High (first live HACCP behaviour change; food-safety audit data; but byte-identical intent) | Unit regression + Build/Typecheck/Lint + Integration (NEW, all 9 routes) + pgTAP regression + E2E @critical (NEW live loop) | Unit, Build, Typecheck, Lint, Integration, pgTAP, E2E @critical — all run |

**Not run under the efficiency dial:** None on the in-scope HACCP paths — the full ladder ran. The full E2E `@critical` suite was run (high-risk double-run); 14 passed. Two FAILED specs (05/06) are the F-24 Leaflet map renderer — entirely outside this PR's diff (the branch touches only the 9 HACCP route files) and a documented react-leaflet dev-server double-mount artefact (CLAUDE.md: StrictMode double-invoke under `next dev`; ANVIL local rung mandates a production build to avoid it). Flagged 🔵 below — NOT a F-19 regression, NOT a blocker for this PR.
**Baseline characterisation pass?** No.

🗣 **In plain English:** This PR rewires the 9 HACCP screens to talk to the database through PR1's tested "machine" instead of reaching in directly. The promise was byte-identical behaviour — every saved row and every JSON reply unchanged. The whole test ladder ran against a real database to prove that. The only red lights were two unrelated map tests that don't work under a dev server (a known quirk), not anything this PR touched.

## Test Results

| Layer | Status | Notes |
| --- | --- | --- |
| Unit (Vitest) | ✅ 2167/2167 passed (134 files) | Regression — PR1 service/use-case pins (W2 gate, soft-fail, heterogeneity) all still hold |
| Production build (next build) | ✅ Compiled successfully | exit 0; full app |
| Typecheck (tsc --noEmit) | ✅ clean | exit 0 |
| Lint (next lint) | ✅ clean | (project script is `next lint`; there is no `npm run test:unit` — `npm test` is the unit suite) |
| Integration (Vitest, NEW) | ✅ 32/32 passed (tests/integration/haccp.test.ts) | Local Supabase, fresh `db:reset` seed; localhost only; first live coverage of all 9 routes. Each REQUIRED pin confirmed (see below). |
| Database (pgTAP, regression) | ✅ 161/161 (14 real test files, 0 failed) | No migration this PR → schema + RLS untouched. Overall runner exit-1 is the documented `_helpers.sql` "no plan" artefact (same as PR1 cert); all 14 real `.test.sql` reported `ok`. |
| Local full-stack rung | ✅ Supabase CLI adapter (db:up → db:reset → run → down) | localhost only |
| E2E (Playwright @critical) | ✅ NEW HACCP loop passed; 14/16 @critical passed | NEW `10-haccp-corrective-action.spec.ts` (warehouse logs food-safety return → admin queue → sign-off) ✅. 2 failures = F-24 Leaflet map specs (05/06), out of diff scope, dev-server mount artefact — see 🔵. |
| Populated UI smoke | ✅ populated (admin corrective-action queue rendered the logged deviation card; sign-off interaction confirmed) | The HACCP `@critical` spec is itself the populated smoke for the corrective-action queue (≥1 row + sign-off click). |
| Breadth crawl | 🔵 not run | No automated route-manifest crawl in this repo; HACCP admin queue + product-return form proven via the @critical depth spec. Named as a gap, not implied coverage. |

### REQUIRED integration pins — each confirmed against the real DB

- **W2 (the trap):** allergen-only delivery (poultry, temp 4 pass, contamination `no`, `allergens_identified:true`) → delivery row `corrective_action_required:true`, **ZERO rows in haccp_corrective_actions** (`caCountFor(id) === 0`), `ca_write_failed:false`. ✅ — no real bug; the gate inside `buildDeliveryCorrectiveActions` holds end-to-end.
- delivery temp deviation (poultry 12°C fail + temp CA payload) → exactly 1 CA row. ✅
- delivery 23505 → 409 `Another delivery was logged at the same moment. Please retry.` ✅ (forced by pre-occupying the computed delivery_number slot)
- **product-return → ALWAYS 1 CA row** on every post; food-safety RC01 → `management_verification_required:true`, non-food-safety RC03 → false. ✅
- **process-room diary → CA rows with null disposition + null recurrence.** ✅ (asserted directly on the CA row columns)
- **timesep → NO CA row** (`{ok:true}`, `caCountFor(id) === 0`). ✅
- **meatprep → `has_deviation:true` (allergen-inclusive) in the response, but CA write gates on temperature only → ZERO CA rows** when both temps pass. ✅
- **cold-storage POST status-code precedence:** missing-fields 400 → today-only 400 → unit-unknown 400 → CA. Each rung pinned. ✅ (units-empty 500 documented as a seeded-units precondition, not exercised destructively)
- cold-storage critical reading → 1 CA row; 23505 → 409 `This session has already been submitted for one or more units.` ✅
- **mince kill-date hard-fail 400** returns extra keys `kill_date_hard_fail:true` + `days_from_kill:10`. ✅
- process-room temps both-breach → 2 CA rows; 23505 → 409 `This PM check has already been submitted for today.` (session-interpolated). ✅
- process-room diary 23505 → 409 `Opening checks have already been submitted for today.` (phase-interpolated). ✅
- calibration certified `{ok:true}`; manual pass `any_fail:false`/0 CA; manual fail `any_fail:true`/1 CA. ✅
- cleaning no-issues 0 CA; issues+CA 1 CA; `issues && !corrective_action` → 400. ✅
- **corrective-actions GET** admin queue `{unresolved, resolved}` shape + key SET/ORDER + `users`/`verifier` joins + 401 non-admin. ✅
- **corrective-actions [id] PATCH sign-off** stamps `verified_by`/`verified_at`/`resolved:true` (management_verification_required filter) + 401 non-admin. ✅
- **soft-fail:** every POST inserts the daily-check row first, then files CA via `fileCorrectiveActions(rows, label)`; `ca_write_failed` echoed. ✅

## Real code bug found

**None — byte-identity confirmed at the DB layer.** All four iterate-loop reds were broken TESTS, not code:
1. product-return integration test used `disposition:'reject'` — invalid for the `haccp_returns.disposition` CHECK (`restock|reprocess|quarantine|dispose`) → 500. Fixed to `dispose` (valid in both the returns table AND the CA ledger CHECK).
2. delivery 409 integration test had an off-by-one in the pre-occupier slot math (the occupier insert raises the count). Fixed to occupy `count+2`.
3. E2E used `Quarantine` disposition — valid for `haccp_returns` but the CA ledger's `product_disposition` CHECK rejects `quarantine`, so the soft-fail swallowed the CA write and the queue stayed empty (correct byte-identical behaviour). Fixed to `Dispose as ABP` so the CA persists and reaches the queue.
4. integration suite is not idempotent on a same-day re-run — the HACCP daily-check tables are APPEND-ONLY (`no_delete_haccp_*` DELETE rules), so cleanup cannot remove rows and the date-scoped unique indexes 409. Documented as the run contract (fresh `db:reset` per run — exactly the project + ANVIL local-rung requirement); not a regression.

The W2 case and the cold-storage precedence chain — the two places a real bug was most likely — both proved correct end-to-end.

## Warnings (non-blocking)

- 🔵 E2E specs `05-routes-planner-map.spec.ts` + `06-map-view-markers.spec.ts` (F-24 Leaflet MapProvider) fail under the local `next dev` webServer ("Leaflet map container should mount once data loads" — the documented react-leaflet StrictMode double-mount). Out of this PR's diff scope (branch touches only the 9 HACCP routes). The ANVIL local rung specifies E2E against a production build to avoid this; the repo's local `webServer` uses `npm run dev`. Pre-existing environment artefact, not a F-19 regression.
- 🔵 Breadth crawl not run (no route-manifest crawler in repo) — named, not implied.
- 🔵 (carried from Guard, non-blocking) `mince-prep/route.ts` passes literal table-name strings into `countMinceRuns` — candidate for a future F-TD tidy.

## Migration

None. No schema / SQL / RLS change (`supabase/migrations/` untouched).
Rollback script: n/a — no schema/data change. Rollback = revert the merge commit (`git revert <merge-sha>`). See `docs/anvil/2026-06-23-f19-pr2-cluster-a-route-repoint-rollback.md`.
PITR confirmed: N/A — no migration → no destructive operation → no PITR needed.

## Merge Sequence

1. No migration to apply — skip `supabase db push`.
2. Merge PR #69 → Vercel auto-deploys.
3. Gate-4 preview smoke: `npm run test:e2e:preview -- <preview-url>` (@critical against the PR's Supabase preview branch), then prod post-deploy smoke with rollback armed.

## Manual smoke at merge

**Still advised (one named gap).** What IS proven: all 9 routes byte-identical at the DB layer (32/32 integration on a real DB), the live deviation→queue→sign-off loop through the real UI (@critical E2E), unit + build + typecheck + lint + pgTAP regression all green. The named gap: the broad breadth crawl was not run (no route-manifest crawler), and the two unrelated Leaflet map @critical specs need a production build to pass (dev-server artefact). A quick manual click of one HACCP form + the admin queue on the preview is advised to close the breadth gap; the F-19 paths themselves are proven.

## Verdict

CLEARED FOR PRODUCTION — byte-identical re-point proven at the DB layer (32/32 new integration, all required pins incl. W2 zero-CA), live corrective-action loop proven through the UI (@critical E2E), unit/build/typecheck/lint/pgTAP regression all green. No real code bug; no migration (revert-only rollback). The two E2E reds are out-of-scope F-24 map specs failing on a known dev-server Leaflet artefact, not a F-19 regression.

---

## ADDENDUM (2026-06-23) — exhaustive HACCP browser coverage, breadth gap CLOSED

At Hakan's instruction (HACCP is the most critical section → 100% tap/button confidence
required before ship), the named breadth gap above was closed with a full browser E2E pass
over every screen behind the 9 re-pointed routes.

**New specs (commit `531c169`):** `tests/e2e/11-haccp-home-nav` · `12-haccp-delivery` ·
`13-haccp-cold-storage` · `14-haccp-calibration` · `15-haccp-cleaning` ·
`16-haccp-process-room` · `17-haccp-mince-prep` (all `@critical`, chromium).

**Local Docker (clean db:reset):** 18/18 green — every form's happy path + deviation→CCAPopup
→admin-queue loop + the W2 allergen-only-no-CA pin (verified at browser AND DB level) + home
tile routing. No real bug; every iteration red was a test-selector fix, never a misbehaving
screen.

**Production-build PREVIEW (`--unprotected`, branch-alias, 4/4 DB-identity probes passed):**
**34/34 @critical green** — the full suite (01–17), incl. all 8 HACCP specs and, on a real
production build, the two F-24 Leaflet map specs (05/06) that only fail under local `next dev`.

**Per-screen browser-tap coverage now proven:** delivery (happy + reject-temp deviation→queue +
W2 zero-CA) · cold-storage (5 units + critical→queue) · calibration (manual pass/fail→queue +
certified probe) · cleaning (happy + issue) · process-room (temps + diary phase + critical-room
→queue) · mince/meat-prep/time-sep (+ mince temp deviation→queue) · home-tile nav.

**Infra change (test/preview only, never production):** `supabase/seed.sql` gained 5 HACCP
cold-storage units (4 chillers + 1 freezer, idempotent `ON CONFLICT DO NOTHING`) — the local/
preview seed had zero, so the data-dependent cold-storage screen could not render. The PR #69
Supabase preview branch was reset to re-seed before the preview smoke.

**Could not test (out of scope for tap-through):** OS/native print dialogs (delivery/mince
labels) — unobservable by Playwright; seeded supplier-picker chips (local seed has 0 suppliers)
— the UI's documented "Other" free-text path was used instead and covers submission end-to-end.

**Breadth gap from the original "Manual smoke at merge" note is now CLOSED** — a manual click is
no longer advised; every HACCP screen tap is proven green on the production-build preview.
