# ANVIL Clearance Certificate

Date: 2026-06-21
App: MFS-Operations
Branch: f-17-pr2-complaints-compliments-route-repoint
PR: #63 — feat(complaints): re-point complaint + compliment routes onto services (F-17 PR2)

## Scope — what this certificate actually covers

| Change / path | Risk tier | Layers required | Layers run |
|---|---|---|---|
| `app/api/compliments/route.ts` (GET/POST), `app/api/compliments/users/route.ts` (GET) | Medium (API route, wire-shape) | Unit + Integration + E2E | Unit ✓ Integration ✓ E2E ✓ |
| `app/api/screen2/{all,open}/route.ts` (GET) | Medium | Unit + Integration + E2E | Unit ✓ Integration ✓ E2E ✓ |
| `app/api/screen2/{sync,resolve,note}/route.ts` (POST) | Medium–High (W1 till offline-queue replay) | Unit + Integration + E2E | Unit ✓ Integration ✓ E2E ✓ |
| `app/api/detail/complaint/route.ts` (GET — G1 double-prettify) | Medium | Unit + Integration | Unit ✓ Integration ✓ (no UI consumer — API-only surface, see below) |
| `lib/api/complaints/dto.ts`, `lib/api/compliments/dto.ts` (pure translators) | Low | Unit | Unit ✓ |

**Not run under the efficiency dial:** None withheld for PR2's own surface. The full ladder
(unit → integration on local Docker → pgTAP non-regression → NET-NEW E2E in real Chromium on the
local Docker stack) was run. Preview rung (Vercel) is **pending conductor** (see Migration / Notes).
**Baseline characterisation pass?** No — this is a diff-driven pass on the 8 re-pointed routes.

🗣 In plain English: this certificate covers the eight complaint/compliment routes and the two new
translator files. Everything that has a screen was clicked in a real browser; the one route with no
screen (`detail/complaint`) was proven through the API tests instead, and that gap is named, not hidden.

## Test Results

| Layer | Status | Notes |
|---|---|---|
| Unit (Vitest) | ✅ 2040/2040 passed | 120 files; incl. `tests/unit/api/complaints.dto.test.ts` + `compliments.dto.test.ts` (key SET + ORDER, camelCase→snake_case mapping, RAW category/receivedVia preserved) |
| Integration (Vitest, real local Docker DB) | ✅ 19/19 passed | All 8 routes end-to-end. **W1** duplicate-replay → 200 `{id, duplicate:true}` (NOT 500) ✓. **G1** `detail/complaint` prettifies BOTH `category` and `received_via` + key order ✓. Bare-array shape for `screen2/all`+`open` ✓. 404/400/307 branches ✓. |
| Database (pgTAP) | ✅ 12 suites / 130 assertions, no regression | PR touches **zero** `supabase/` files. (`_helpers.sql` "No plan" is a pre-existing harness artifact — not a test, not a PR2 regression.) |
| Edge Functions (Deno) | n/a — not required | No edge function touched by PR2 |
| E2E (Playwright, real Chromium, local Docker) — **NET-NEW** | ✅ 2/2 passed | `08-complaints-board.spec.ts` + `09-compliments.spec.ts` (both `@critical`). See below. |
| E2E non-regression (existing numbered specs) | 🟡 12/14 passed | 2 fails in `05-routes-planner-map` + `06-map-view-markers` (Leaflet) — react-leaflet dev-server double-mount artifact, documented in the ANVIL skill; PR2 touches no map files. Out of scope, non-blocking. |

### NET-NEW E2E detail (the headline ask — real browser clicks on the live screens)

- **`tests/e2e/08-complaints-board.spec.ts`** (`@critical`) — drives `/complaints` (`/screen2`
  redirects here). Flow: log a complaint through the UI form (writes Dexie queue → `triggerSync()`
  → POST `/api/screen2/sync`, the re-pointed create path) → poll the board until the row surfaces
  from the re-pointed GET `/api/screen2/all` → **asserts on screen that `category` renders as
  "missing item" (raw `missing_item` prettified, and the raw underscore form is absent) — G1's
  category half proven through the real UI** → add a note via POST `/api/screen2/note` (note text
  appears) → resolve via Dexie queue → POST `/api/screen2/resolve` (card flips to Resolved).
- **`tests/e2e/09-compliments.spec.ts`** (`@critical`) — drives `/compliments` ("Kudos"). Flow:
  recipient dropdown loads users from GET `/api/compliments/users` (asserts >1 option = real users
  loaded) → post a compliment via POST `/api/compliments` → **asserts the posted compliment body
  appears in the recent feed** (the snake_case wire the card reads) → asserts the empty "No kudos
  yet" state is absent (ANVIL empty-smoke guard).

🗣 In plain English: a real Chrome browser logged a complaint, watched it appear on the board with
the category shown in human words not database words, added a note, and resolved it; and posted a
compliment to a teammate and watched it land in the feed. That is the 100%-confidence proof asked for.

### On-screen coverage boundary (named, not hidden)

- **`/api/detail/complaint` has no UI consumer.** The complaints board renders cards from
  `/api/screen2/all` and prettifies `category` client-side; no screen displays the `detail/complaint`
  output. So **G1's `receivedVia` prettify is proven in the integration suite only** (route emits
  `received_via` as "in person"); it cannot be browser-proven because nothing renders it. G1's
  `category` prettify IS browser-proven via the board. This is a coverage boundary of the existing
  UI, not a PR2 defect.

## Warnings (non-blocking)

- 🟡 `05-routes-planner-map` + `06-map-view-markers` E2E — Leaflet dev-server double-mount artifact
  (react-leaflet "Map container is already initialized" under `next dev`, documented in the ANVIL
  skill). Unrelated to PR2 (no map files in the diff). Recommend running these two via a production
  build if direct map coverage is wanted; not a PR2 blocker.
- 🔵 `app/api/compliments/route.ts` — `postedByName==='Unknown' ? 'Someone'` email remap (cosmetic,
  email-only, faithful preservation). Note only (from Guard).
- 🔵 audit_log raw Supabase REST `fetch` remains in `screen2/{sync,resolve,note}` — tracked F-TD-31,
  pre-existing, not lint-gated, explicitly out of PR2 scope. Backlog F-TD-32 (email-helper users
  read) added.

## Architecture / rip-out

- No re-pointed data route imports `@supabase/*` after PR2 (grep clean). The two new `lib/api/*/dto.ts`
  import `@/lib/domain` types only. PR2 touched zero files under `lib/{adapters,services,ports,domain,wiring}`.
- **Rip-out test (F-17 data surface): PASS** — swapping the DB vendor for Complaints/Compliments = one
  new adapter under `lib/adapters/<vendor>/` + one wiring line; routes/services/ports/DTOs untouched.
  (Caveat: the audit_log raw fetch wouldn't follow a swap — F-TD-31, pre-existing, out of scope.)

## Migration

None. PR2 changes no schema, no policy, no data.
Rollback script: n/a — **revert-only**. If a regression appears post-merge, `git revert` the PR
commit; routes return to talking to Supabase directly, the PR1 owned layer remains in place (safe).
PITR confirmed: **N/A — no destructive migration, no migration at all.**

## Merge Sequence

1. No migration step — skip `supabase db push`.
2. Merge PR #63 → Vercel auto-deploys.
3. Post-deploy smoke: manual prod smoke of both screens (log a complaint, resolve it, add a note,
   post a compliment) per the plan's manual-smoke posture, OR run the preview `@critical` smoke
   (`npm run test:e2e:preview -- <preview-url> --unprotected`) which now includes specs 08 + 09.

## Conductor-run rungs (completed at ship)

- **Preview rung — DONE ✅.** `npm run test:e2e:preview -- https://mfs-operations-nzzpku390-…vercel.app --unprotected`
  → **15/15 @critical passed** (the existing 13 + the new 08 + 09). The map specs 05/06 that flake on
  the local dev-server PASSED on the preview, confirming those locals were the react-leaflet
  double-mount artifact, not a regression. previewProbe: all 4 DB identity checks passed (seed-born
  preview DB).
- **Production deploy — `dpl_8NaNwZn68GHmtkuKrf7jRYendENi`** (commit `968035b`) READY on www.mfsops.com.
- **Post-deploy prod smoke (read-only) — DONE ✅.** `/`, `/api/screen2/{all,open}`, `/api/compliments`,
  `/api/compliments/users`, `/api/detail/complaint` all return 307 (auth redirect) — **all non-5xx**.
- **Manual write-smoke (Hakan) — COMPLAINT path DONE ✅ 2026-06-21.** Raised a complaint for
  BATCH BURGERS LTD ("TEST HAKAN") → added note "TEST NOTE" → resolved with "TEST RESOLVE" on
  www.mfsops.com. Verified live via Supabase MCP read-only: complaint
  `6a36eba9-7bde-499e-a8df-acdc2b2de5ca`, status=resolved, note_count=1, logged_by+resolved_by=Hakan
  — full create→note→resolve chain coherent through the re-pointed services.
- **Manual write-smoke — COMPLIMENT path DONE ✅ 2026-06-21.** Posted "TEST COMPLIMENT" (team-wide)
  on www.mfsops.com. Verified live via Supabase MCP read-only: compliment
  `cc45d290-d7fa-45c5-bf2a-e80824b081ff`, body intact, posted_by=Hakan, recipient_id=null
  (valid "whole team" case) — wrote cleanly through the re-pointed complimentsService.
- **F-17 PR2 manual prod write-smoke COMPLETE — both write paths hand-verified live.**

## Verdict

✅ CLEARED FOR PRODUCTION — SHIPPED 2026-06-21 (merge `968035b`, PR #63). Full local Docker ladder
green; preview 15/15 @critical; prod deploy READY + read-only smoke all non-5xx.
