# ANVIL Clearance Certificate — ✅ CLEARED FOR PRODUCTION

Date: 2026-07-02 (run started 2026-07-01 23:42, crossed midnight)
App: MFS-Operations
Branch: feat/colour-pairing-unit2
PR: #111 — colour-pairing system Unit 2 (Tailwind un-inerting fix + pairing tokens/surface contexts + kit recipes + /haccp hub repaint)
Head commit tested: `96c4c44` (identical local tree and Vercel preview build)
Status: **CLEARED — conductor Lock 2026-07-02.** Three test failures were recorded and every
one is evidence-proven environmental / pre-existing (details below); none is attributable to
this diff. Conductor ACCEPTED the three reds with two new BACKLOG tickets: (1) local map specs
05/06 red on `main` (harness/main-drift, control-proven); (2) pre-existing green sign-off
buttons on untouched `/haccp/admin` violate green-caging (repaint on that screen's overhaul
turn). No PITR required (no destructive migration — presentation-only diff). Pre-ship preview
smoke = the E2E-preview layer above, run against head `96c4c44`, the exact build to be promoted.

## Scope — what this certificate actually covers

| Change / path                                        | Risk tier | Layers required                     | Layers run |
| ---------------------------------------------------- | --------- | ----------------------------------- | ---------- |
| `app/tokens.css` + `tailwind.config.ts` (pairing tokens, surface contexts, namespace guard) | High (global visual system) | Unit + full E2E local + full E2E preview + visual | All run |
| `components/ui/*` (14 kit files — recipes, ScreenHeader surface prop, ghost-inverse) | High | Unit/component + E2E + visual | All run |
| `app/haccp/page.tsx` (hub repaint, alarm surface, admin ghost-inverse) | Critical (HACCP) | Full ladder + upgraded browser-tap depth | All run |
| Tests (2 new suites + pins + E2E spec 31)            | —         | Executed as part of the layers      | Run        |

**Not run under the efficiency dial:** pgTAP / RLS, Edge Functions, migration testing, PITR —
all **n/a, not skipped**: the PR contains no migrations, no DB objects, no edge functions
(presentation-only diff, verified via `git diff --name-only main...HEAD`).
**Architecture rung:** n/a — the diff does not cross a domain/port seam (no `lib/domain`,
`lib/ports`, `lib/adapters` files touched; no new packages).
**Baseline characterisation pass?** No — diff-driven matrix.

## Test Results

| Layer | Status | Notes |
| ----- | ------ | ----- |
| Unit + component (Vitest) | ✅ 3214/3214 (239 files) | Includes new contrast-matrix suite (WCAG maths pinned to live tokens.css), namespace-collision guard incl. `extend.colors` side door, kit recipe pins |
| Integration (Vitest, real local Supabase) | ✅ 554/554 (44 files) | First attempt 552/554 — 409s from stale rows left by a previous agent's run; `npm run db:reset` → clean pass, zero code changes (Iterate loop 1, environmental) |
| DB (pgTAP) | n/a — not required | No migrations / DB changes in diff |
| Edge Functions (Deno) | n/a — not required | None in diff |
| E2E local (full `@critical`, 97 specs) | ⚠️ 95/97 | First attempt 78/97: integration fixtures (`ANVIL-TEST-product-f20pr2`) polluted the DB → strict-mode locator collisions; reseed → 95/97 (Iterate loop 2). Remaining 2 fails: **05-routes-planner-map + 06-map-view-markers — CONTROL-PROVEN PRE-EXISTING: the identical specs fail identically on `main` on the same machine/harness.** Not attributable to this diff. See "Environmental failures" below |
| E2E preview (full `@critical` vs Vercel preview + Supabase preview branch) | ⚠️ 94/97 (1 fail, 2 flaky-passed-on-retry) | Fail: 25-haccp-reviews weekly — **DB-proven environmental (F-INFRA-08)**: shared preview DB already holds this ISO week's `haccp_weekly_review` row (`week_ending 2026-07-05`, submitted 2026-07-01 22:21 UTC by a previous agent run — confirmed by SQL query). Flaky-passed: 04-kds-line-undo (documented F-INFRA-08 flake), 16-haccp-process-room (temp-session race, passed retry) |
| E2E spec 31 (this PR's computed-pixel proof) | ✅ 2/2 local + ✅ 2/2 preview | Real red-600 alarm fill, real white title, measured ≥4.5 contrast, OVERDUE pill; calm navy-700 — asserted on rendered pixels in both environments |
| Populated UI smoke | ✅ populated | KDS board rendered 2 orders w/ line interactions; /orders listed 2 rows; hub tiles data-driven; admin CA queue 14 rows. Not mount-only |
| Browser-tap screenshots (upgraded HACCP depth) | ✅ 17 shots | Manifest below; captured on the PREVIEW build except the dev-only gallery (local, bypass reverted) |

## Environmental failures — evidence trail (the 3 reds)

1. **Local maps (05 + 06):** fail on `feat/colour-pairing-unit2` AND on `main` (control
   experiment, same machine, same harness, fresh seed, isolated run). On the preview build,
   `/routes` renders its picker fine and `/api/map/data` returns 200 with a geocoded customer;
   zero console/page errors anywhere. Root-cause hypothesis: the Leaflet pages' data-gated
   mount no longer resolves inside the spec timeout under the local dev-server harness —
   main-drift/harness issue, NOT this diff. **Needs its own BACKLOG ticket; specs are red on
   main today.**
2. **Preview weekly review (25):** once-per-ISO-week submission; slot consumed 2026-07-01
   22:21 UTC in the never-reset shared preview DB (SQL-verified). Documented gremlin F-INFRA-08.
3. **Integration first-pass 409s / E2E first-pass fixture pollution:** both cured by
   `db:reset` alone — zero code or test changes. Note for the runbook: run E2E only from a
   fresh seed; the integration suite leaves fixtures behind.

## Visual verification (judgment calls routed from Guard §Routing)

Screenshots: `/private/tmp/claude-501/-Users-hakankilic-MFS-Operations/d31ce3ff-9a14-4598-b31d-181f4e625fb7/scratchpad/anvil-shots/`

| File | What it proves |
| ---- | -------------- |
| 01-haccp-login-door.png | Kiosk door: navy header, staff cards, orange visitor CTA |
| 02-haccp-hub-calm-bold-navy.png | Calm hub: bold-navy header, white title, no OVERDUE pill |
| 03-haccp-hub-forced-alarm.png · 03b closeup | Forced alarm (route-intercepted today-status): full red-600 header, white title, OVERDUE pill in actions slot |
| 03c/03d (admin variants) | **Guard #1 fix proven on pixels: Admin panel button = ghost-inverse white outline on the red alarm surface** |
| 04 / 05 (cold-storage, process-room) | Kit inheritance on the two CCP screens, navy headers |
| 06-haccp-admin.png | Admin queue renders. ⚠️ pre-existing green sign-off buttons + dark header — NOT in this diff (file untouched); green-caging BACKLOG candidate |
| 07-login-main-app.png | Main login unchanged |
| 08-dev-ui-gallery.png | Full kit gallery (light + dark KDS sections); GalleryFrame text sizing (Guard #9) captured for eyeball |
| 09 / 10 closeups | StatusTile neutral = white card + grey dormant dot; calm header WITHOUT MFS logo (Hakan's pending decision — Guard #3) |
| control-kds.png / control-orders.png | Controls: KDS dark kiosk theme and /orders navy/white intact — no visual leakage (neither file in diff) |
| 11 / 12 (routes/map probes) | Evidence shots for the environmental-failure trail |

Green/amber caging check: green appears only on status tiles/dots/rings and temperature-state
surfaces; no green/amber on any NEW chrome in the diff. (Pre-existing breaches on the
untouched /haccp/admin screen noted above.)

## Warnings (non-blocking)

- 2 flaky-passed-on-retry preview specs (04, 16) — documented, not new.
- Pre-existing on `main`: local map specs 05/06 red (see evidence trail) — file BACKLOG.
- Pre-existing green sign-off buttons on /haccp/admin (untouched by this PR) — BACKLOG green-caging candidate.

## Migration

None. No pgTAP, no rollback SQL, no PITR requirement.
Rollback = `vercel rollback` (code-only change; no data touched).

## Merge Sequence

1. No DB step — presentation-only.
2. Merge PR #111 → Vercel auto-deploys.
3. Post-deploy smoke: 3 `@critical` paths against production URL; on failure → `vercel rollback`.

## Manual smoke at merge

**Advised for the visual judgment calls only** — automated coverage is complete, but four
eyeball decisions were explicitly reserved for Hakan (Guard §Routing): logo absence in the
kit header, dormant-dot-on-white neutral tile, OVERDUE pill position, GalleryFrame text
sizing. The screenshots above stand in for hand-clicking; nothing functional is unproven.
Named gaps: breadth-crawl not run as a distinct rung this cycle (the 97-spec suite +
17-screenshot tap pass is the coverage that ran); local map specs unprovable until the
main-drift issue is fixed.

## Verdict

⏳ **DRAFT — pending conductor Lock.** All layers attributable to this diff are green,
including the computed-pixel alarm-surface proof in both environments. The three recorded
reds are evidence-proven environmental / pre-existing-on-main. Conductor decision required:
accept the environmental reds (with BACKLOG tickets for the map-spec main-drift and the
preview weekly-review gremlin) and proceed to Lock/ship gates with Hakan, or eject.
