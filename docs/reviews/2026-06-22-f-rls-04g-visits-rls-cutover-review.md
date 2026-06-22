# Code review — F-RLS-04g Visits RLS cutover

- **Date:** 2026-06-22
- **Branch:** `f-rls-04g-visits-rls-cutover` (vs `main`, not yet pushed at review time)
- **Reviewer:** code-critic (FORGE Guard phase)
- **Plan:** `docs/plans/2026-06-22-f-rls-04g-visits-rls-cutover.md`
- **Verdict:** **NO BLOCKERS — hand to ANVIL.** One 🟡 to weigh before ship; two 🟢 test gaps + two 🔵 follow-ups.

## What the change is
7th copy of the established RLS-cutover pattern. Moves the Visits READ + own-mutate
routes off the service-role (master-key) client onto a per-request authenticated client
carrying the caller's JWT, so existing RLS policies fire. Owner-scoping enforced at the DB
(admin sees all; sales+drivers see own; office sees nothing). `visits` baseline policies
untouched; only `visit_notes` gets new policies. Create path (`screen3/sync`) deferred,
stays service-role.

## Security (Layer 1) — sound
- **Caller-id not spoofable.** `middleware.ts:150-154` sets `x-mfs-user-id` from the
  HMAC-verified `mfs_session` cookie (`sessionTokens.verify`, line 121); `.set()` overwrites
  any inbound client value. Identity flows session → header → minted token → `app.current_user_id`
  GUC → RLS with no spoofable link.
- **`visit_notes` parent-visit isolation correct** (`20260622120000_…sql:66-86`): a rep can
  SELECT/INSERT a note only if the parent visit is own-or-admin; INSERT pins
  `visit_notes.user_id = caller` (anti-author-spoof). pgTAP #4/#8/#9 prove cross-rep + spoof deny.
- **No service-role leak-back.** 4 flipped routes import `visitsServiceForCaller`; only
  `screen3/sync` keeps the master-key singleton (confirmed untouched, intended). Tables stay
  `ENABLE` (not `FORCE`) → master-key rollback parachute intact.
- **Item A (empty-GUC 22P02 throw) = genuinely fail-closed + unreachable on live path.** Cast
  throws before any row returned/written; every flipped route is 401-guarded + mints a real
  userId token; `DbTokenMinter` structurally requires `{userId}` so a claimless token can't be
  minted. Not a finding (see 🔵 note 1 on the inconsistency it leaves).

## Correctness (Layer 2)
- **🟡 W1 — Office bypasses route-level ownership on notes; POST-note surfaces a 500, not a clean 4xx.**
  `app/api/screen3/visit/notes/route.ts:45,87,132` set `isManager = role==='admin' || role==='office'`,
  so office skips `verifyVisitOwnership`. RLS still contains office on all 3 verbs, but failure shapes differ:
  - GET (line 48): RLS → empty → `{notes: []}`. Clean.
  - PATCH (line 132): manager skips owner filter; RLS denies → 0 rows → null → 404. Clean.
  - **POST (line 87): office skips ownership → `createNote` → RLS INSERT WITH CHECK denies (42501)
    → adapter throws `ServiceError` (`VisitsRepository.ts:367-374`) → route returns 500 "Failed to add note" (line 105).**
  A 500 on an authorization denial is a UX/correctness wart (implies server fault, real cause is
  "not allowed"), and it's the one office path with no integration test. Not a leak, wrong shape.
  Fix: stop treating `office` as a manager on the notes write path (fall through to the same 404
  as a non-owning sales rep), or map RLS-deny INSERT → 403/404.
- **Item B (office integration assertions) — faithful.** `visits.test.ts:210-219` proves office is
  307'd by the admin-prefix middleware before the all-reps list; `:221-233` proves 404 on a
  per-visit read office can reach (RLS hides row). "200 empty" was never reachable (office gated
  pre-handler). No finding.
- Error-body preservation (400/404/500), enum prettify, DTO key-order asserted byte-for-byte
  (`visits.test.ts:147-394`). Detail route maps RLS-hidden→null→404 (`detail/visit/route.ts:43`).

## Conventions (Layer 3) & Hexagonal (3b) — clean
No boundary breaches: routes import `lib/wiring/`, not adapters; `lib/wiring/visits.ts` is the
sole port→adapter bind; `@supabase/supabase-js` stays in `lib/adapters/supabase/authenticatedClient.ts`.
`no-adapter-imports` lint passes (57/57). No new deps, no dead code/debug logs. Rip-out test holds.

## Architecture depth
- `lib/wiring/visits.ts :: visitsServiceForCaller` → **DEEP ✅** — mints token, builds fresh
  per-caller client, binds adapter, composes service (real identity-binding behaviour behind a
  one-arg interface). Single-port shape correct for the domain. 7th copy of proven pattern, not a
  speculative seam. PASS.

## Test quality (Layer 4) — strong
Behavior-based through the HTTP interface; cross-rep DENY is the headline proof in pgTAP
(#3/#4/#8/#9/#11) + integration; R-CONC-1 (never-memoize) pinned by the wiring unit test.
- 🟢 No test for office POST-note path (the W1 500). Add one to pin the behaviour (current 500,
  or the clean refusal after a W1 fix).
- 🟢 No integration assertion for admin-edits-another-rep's-note (pgTAP #12 covers it at the DB;
  HTTP-level would close the admin-write matrix). Optional.

## Architecture follow-ups — 🔵
- 🔵 **`visits` + `visit_notes` policies are the only RLS in the repo not using the
  `nullif(current_setting('app.current_user_id', true), '')::uuid` empty-guard** (cf.
  `20260618130000`, `20260618120000`, `20260617130001`). Deliberate (guardrail #5 — don't touch
  dormant `visits` baseline) and safe today (live path never sends empty GUC), but a latent
  inconsistency: a future route flipped without a 401 guard, or a GUC-bridge bug, would surface
  22P02→500 instead of clean-empty. BACKLOG: align `visits` baseline to `nullif` when next
  legitimately touched. Not blocking — pre-existing baseline shape, out of diff scope.
- 🔵 Route-level owner filtering kept alongside RLS (belt-and-braces) — intended, plan-deferred
  redundancy (thinning on BACKLOG). Designed, not a defect.

## Test / lint observed
- Unit (full): **2128/2128** (128 files). Targeted (wiring+notes+lint guard): **57/57**.
- Typecheck `tsc --noEmit`: **clean**. ESLint (4 routes + wiring): **clean**.
- Integration + pgTAP: not run by reviewer (need live local Supabase/Docker); test code reviewed
  in full, behavior-correct. Conductor reported branch built green locally (2128 unit / 350
  integration / pgTAP 014 17/17).
