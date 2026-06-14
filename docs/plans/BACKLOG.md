# MFS-Operations — Backlog

Single living index for everything deferred. If we said "we'll do it later"
and didn't have a roadmap slot, it lands here. If it's in here, we won't
forget it. Each entry points to where the detail lives.

**Conventions:**

- **F-TD-** prefix = tech debt (numbered, claimable as its own PR)
- **F-PROD-** prefix = product feature (not part of hexagonal migration)
- **ARCH-FU-** prefix = architecture follow-up (deferred from an ADR or plan)
- **F-INFRA-** prefix = test/deploy infrastructure unit (numbered, claimable as its own PR)
- Date on each entry = when it was deferred (so age is visible)
- Owner-unit = the migration unit that will absorb the fix, or `unscheduled`
- Status: `open` / `in-progress (<unit>)` / `done (<PR>)` / `obsolete`

When closing an item, leave the entry in place and change status to
`done (<PR>)` so the history stays readable. Don't delete entries —
the trail matters.

---

## Tech debt (F-TD-)

### F-TD-01 — Clear pre-existing tsc + ESLint nits

- **Deferred:** 2026-06-07 (during F-FND-02)
- **What:** ~60 pre-existing `tsc --noEmit` errors + ESLint nits across `app/admin/**`, `app/haccp/**`, `app/pricing/**`, `components/**`.
- **Why deferred:** out of scope for the foundation unit that surfaced them.
- **Goal:** `npm run lint` and `npx tsc --noEmit` both exit 0 on main. Once landed, ANVIL drops the calibrated-pass criteria on layers 3+4 — strict exit-0 becomes default.
- **Detail:** `docs/architecture-review-2026-06-06.md` line 383
- **Owner unit:** F-TD-01 (dedicated PR — may be multiple commits)
- **Status:** open

### F-TD-03 — Fix 23 broken Orders HTTP integration tests

- **Deferred:** 2026-06-09 (during F-06)
- **What:** 23 integration tests in `tests/integration/orders/**` fail because they require `npm run dev` running separately to hit the Next.js dev server via the `api()` helper. F-INFRA-01 didn't auto-boot the dev server for integration runs.
- **Why deferred:** F-06's contract tests use the direct-adapter pattern and bypass the broken HTTP layer entirely. F-07 doesn't touch routes.
- **Detail:** `docs/anvil/2026-06-09-f-06-cert.md` §F-TD-03 + F-06 plan §10. Root cause confirmed 2026-06-09: no auto-booted dev server (every failure is connection-refused on port 3000); the documented manual `npm run dev` procedure would wire the server to PRODUCTION Supabase — live-data hazard. Failure count now 30/92 (suite grew since the 23/49 snapshot).
- **Owner unit:** **F-08 hard prerequisite** — F-08 cannot ship until these pass
- **Status:** done (PR #25 / `58b1168` — self-contained runner, 92/92 green; cert `docs/anvil/2026-06-10-f-td-03-cert.md`)

### F-TD-04 — `lib/supabase.ts` eager `createClient` at module load

- **Deferred:** 2026-06-09 (during F-07, loop 2)
- **What:** `lib/supabase.ts:15` calls `createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, ...)` at module-load time. Every file that transitively imports it (every supabase adapter, every service that wires a singleton) forces env-var validation on import — INCLUDING unit tests that use Fake adapters and never touch the real client.
- **Why deferred:** F-07 hit this when its singleton import broke `npm test` on a clean clone. We patched it with Option C (vitest setupFiles stubs the env vars before test load); the root cause is still there. Option B — refactor `lib/supabase.ts` to a lazy `getSupabaseService()` getter — is the architecturally correct fix but touches every supabase adapter file (6 files).
- **Goal:** `lib/supabase.ts` exports `getSupabaseService()` lazy factory. All adapters call the getter inside method bodies. Module-load is env-clean.
- **Detail:** F-07 plan §5 Risk #7 (updated) + F-07 cert (when written)
- **Also (from F-09 audit, 2026-06-11):** when the lazy-getter fix lands, ALSO move `lib/supabase.ts` → `lib/adapters/supabase/client.ts` so all Supabase code lives inside the one adapter folder (today the shared client is Supabase code living outside the box labelled Supabase).
- **Owner unit:** unscheduled — pick up after Phase 1 closes (F-09)
- **Status:** open

### F-TD-05 — Architecture-pin test only covers `OrdersService.ts`

- **Deferred:** 2026-06-09 (during F-07, loop 1 — code-critic TS-03)
- **What:** `tests/unit/services/OrdersService.test.ts` test #28 reads ONLY `lib/services/OrdersService.ts` and asserts no cross-service / observability / auth / log imports. When `UsersService.ts` ships, this test will still pass even if UsersService imports OrdersService directly.
- **Why deferred:** F-07 is the first service; pin trivially passes today.
- **Fix shape:** convert the test to read every file in `lib/services/`, OR convert to an ESLint `no-restricted-imports` rule (cleaner — fails at lint not at test time).
- **Detail:** F-07 cert + code-critic Guard report (when cert written)
- **Owner unit:** F-13 (UsersService) — must tighten BEFORE second service ships
- **Progress (2026-06-12, F-TD-11):** adapter-import dimension now ESLint-enforced for `lib/services/**` + `lib/usecases/**` (`.eslintrc.json` override, pinned by `tests/unit/lint/no-adapter-imports.test.ts` against the real config); cross-service-import dimension still open — owner F-13 unchanged.
- **Status:** open

### F-TD-06 — `ValidationError` comma-joined string shape (`{ "lines.products": ["a, b, c"] }`)

- **Deferred:** 2026-06-09 (during F-07, loop 1 — code-critic CV-02)
- **What:** Service emits N missing product IDs as a SINGLE comma-joined string inside a single-element array. The `ValidationError.fields` contract says `Record<string, string[]>` — the array is supposed to be a LIST of error messages, not a list of IDs masquerading as one string. Routes/UI can't easily render "first ID X, second Y" from `["X, Y, Z"]`; splitting on `, ` is fragile.
- **Why deferred:** F-07 plan §1 locked the comma-join shape at Gate 2; changing it needs a plan amendment.
- **Fix shape:** emit one entry per missing ID: `{ "lines.products": missing.map(id => `Unknown product id: ${id}`) }` — array length matches count.
- **Detail:** F-07 plan §1 + code-critic Guard report
- **Owner unit:** F-08 — natural to fix when routes adopt the service (routes can rely on cleaner array shape)
- **Status:** done (F-08 PR — `placeOrder`/`editOrder` emit one `Unknown product id: <id>` entry per missing id; unit + integration tests pin the shape)

### F-TD-07 — Production hygiene check for leftover `ANVIL-TEST-*` rows

- **Deferred:** 2026-06-09 (during F-TD-03 planning)
- **What:** Before F-TD-03, the documented integration-test procedure booted the dev server against `.env.local` (production Supabase). Any past run that followed it may have written `ANVIL-TEST-*` fixture rows (users, customer, orders) into the PRODUCTION database via the dev server. One-off audit: query production for `name LIKE 'ANVIL-TEST-%'` across `users`, `customers`, `products` and orders referencing them; review findings with Hakan before deleting anything.
- **Why deferred:** F-TD-03 is forbidden from touching production (scope boundary locked at Gate 1).
- **Detail:** `docs/plans/2026-06-09-f-td-03-integration-test-runner.md` (Risks)
- **Owner unit:** unscheduled — small, read-first, needs Hakan present for the delete decision
- **Status:** open

### F-TD-08 — `kds.test.ts` clobbers ANVIL-TEST-butcher's `pin_hash` (breaks subsequent local `@critical` runs)

- **Deferred:** 2026-06-10 (during F-INFRA-02 Guard)
- **What:** `tests/integration/kds.test.ts:22,36-37` overwrites ANVIL-TEST-butcher's `pin_hash` with a bcrypt of its own committed plaintext PIN (`'8129'`) and never restores it (`cleanupTestData` only deletes orders). Pre-existing on main; impact activated by F-INFRA-02's freshly-minted `E2E_PIN_BUTCHER`: any local `@critical` Playwright run AFTER `npm run test:integration` fails at spec 03 until `npm run db:reset`.
- **Fix shape:** derive the test's PIN from `E2E_PIN_BUTCHER`, or restore the original `pin_hash` in `afterAll`.
- **Detail:** code-critic Guard report for PR #26 (W3) + `docs/plans/2026-06-10-f-infra-02-preview-smoke-plumbing.md`
- **Owner unit:** Day 1 of the 16-day sprint
- **Status:** done (`tests/integration/kds.test.ts` captures the butcher's original `pin_hash` in `beforeAll` and restores it in `afterAll`; verified from a clean baseline — post-run hash restored to sentinel, no `bcrypt('8129')` residue)

### F-TD-09 — Scheduled purge of expired `order_idempotency_keys` rows

- **Deferred:** 2026-06-11 (during F-08)
- **What:** the `order_idempotency_keys` ledger (migration `20260611_001`) expires rows after 24h at READ time and reclaims them opportunistically when an expired key is reused — but nothing sweeps rows whose key is never reused. At this system's order volume the table grows by a handful of rows a day, so this is hygiene, not a hazard.
- **Fix shape:** a tiny scheduled job (pg_cron or a `/api/cron` route) running `DELETE FROM order_idempotency_keys WHERE expires_at < now()` daily.
- **Also absorbs (code-critic Guard findings on PR #27, all non-blocking):**
  - **W1 (TOCTOU at the expiry boundary):** `lib/adapters/supabase/OrdersRepository.ts` `createOrder` step 0 — the expired-key and stale-order reclaim arms delete by `key` alone; a concurrent same-key request can have its fresh row deleted, letting one key resolve to two orders. Only reachable when the same key races itself at the exact 24h boundary — impossible for real double-taps. Fix: make the deletes conditional (`.lte('expires_at', now)` for the expiry arm, `.eq('order_id', existing.order_id)` for the stale-order arm).
  - **N1:** same file, pathological-arm error log includes the raw `idempotencyKey` — log a hash or the order id instead.
  - **N2:** `rollbackOwnOrder` failure is log-only (`[rollbackOwnOrder]` line) — correct trade-off, but that log line is the only alarm for a surviving duplicate; check for it when reviewing logs.
  - **N3:** two comments in `lib/domain/Order.ts` (~234, ~263) still reference the deleted `lib/orders/validation.ts`.
- **Detail:** `docs/plans/2026-06-11-f-08-orders-route-rewrites.md` §5 D1 (TTL / cleanup decision) + code-critic Guard report for PR #27
- **Owner unit:** unscheduled (tiny)
- **Status:** done (PR #34 / squash `29987df`, shipped + prod-verified 2026-06-14). Daily Vercel cron `/api/cron/purge-idempotency-keys` (`0 3 * * *`) → port `purgeExpiredIdempotencyKeys` → adapter `DELETE … WHERE expires_at <= now`. W1 TOCTOU closed (conditional reclaim deletes, one captured `now`); N1 (key dropped from error log) + N3 (stale comments) done; N2 unchanged by design. ANVIL wrote the deferred I2/I3/I4 integration specs (integration 115→122). Cert `docs/anvil/2026-06-14-f-td-09-idempotency-key-hygiene-cert.md`. Residual 🔵 follow-ups → F-TD-16.

### F-TD-10 — Wire `Idempotency-Key` into the order form (activate the F-08 duplicate guard)

- **Deferred:** 2026-06-11 (at F-08 Gate 4, decided by Hakan — ship API-side first)
- **What:** F-08 shipped full server-side idempotent order placement, but no screen sends the header yet — the guard is dormant. `app/orders/new/page.tsx` `handleSubmit` (~line 175) must generate a fingerprint (`crypto.randomUUID()`) when an order submission starts and REUSE it across retries of that same order (the "Network error — please try again" path is the exact duplicate-creating case), resetting only after success or when the user edits the order content.
- **Why deferred:** F-08's locked scope kept screens untouched (wire-format decision); the API contract is complete and tested (replay, race, cross-user, expiry). No regression vs today — only delayed benefit.
- **Fix shape:** ~15 lines in the form + one integration/E2E test proving a retried submit with the same key returns the original order.
- **Detail:** `docs/anvil/2026-06-11-f-08-cert.md` + F-08 plan §10 (optional header)
- **Owner unit:** unscheduled — **next small PR after F-08 merges** (Hakan's call at Gate 4)
- **Status:** done (PR #28 — `lib/orders/idempotencyKey.ts` key source + form wiring; reset on success/edit, reused across retries; unit tests + form-shaped replay integration test)

### F-TD-11 — Single composition root for Orders wiring (F-09 BLOCKER fix)

- **Deferred:** 2026-06-11 (F-09 rip-out audit, BLOCKER-1 — picked up immediately by Hakan's decision)
- **What:** the rip-out test fails 1+4 vs the mandated 1+1: `@/lib/adapters/supabase` is imported by name in four business-logic files — `lib/services/OrdersService.ts:143-147,538-542`, `lib/usecases/pickingList.ts:27-30,120-124`, `lib/usecases/kdsLineDone.ts:25,77-80`, `lib/usecases/kdsQueue.ts:22,71-74` — because the F-07 "factory + pre-wired singleton" template embeds vendor wiring in every service/use-case file. The template is the worked example for every future service; left as-is the wiring-site count grows to ~30 by Phase 5.
- **Fix shape:** one composition-root file (e.g. `lib/wiring/orders.ts`) imports the adapter singletons once and constructs `ordersService` + the three use-case singletons; service/use-case files keep their factories, lose their adapter imports; routes import singletons from the composition root. Same PR: tighten the architecture pin (or an ESLint `no-restricted-imports` rule) to forbid `lib/adapters` imports from `lib/services/**` and `lib/usecases/**` — the current pin codifies rather than catches this pattern (interacts with F-TD-05). ~5 files, zero behaviour change, covered by existing unit suite.
- **Detail:** `docs/anvil/2026-06-11-f-09-rip-out-audit.md` (BLOCKER-1)
- **Owner unit:** F-TD-11 (dedicated PR) — **must land before F-13 clones the template**; F-09 re-gates after it merges
- **Status:** done (PR #29 / `43f5049` — `lib/wiring/orders.ts` composition root + ESLint guard pinned by `tests/unit/lint/no-adapter-imports.test.ts`; rip-out re-enumeration on shipped main = 1 adapter folder + 1 wiring file; F-09 re-gated PASS 2026-06-12 → Phase 1 closed; cert `docs/anvil/2026-06-12-f-td-11-cert.md`)

### F-TD-12 — Retire legacy `lib/orders/types.ts` wire shapes from the UI

- **Deferred:** 2026-06-11 (F-09 rip-out audit, informational note)
- **What:** `lib/orders/types.ts` (legacy DB-mirror wire shapes — app-owned, no SDK content, NOT a Lego violation) is still imported by all 5 Orders/KDS UI pages + `components/EditLockBanner.tsx`. Routes no longer import it; `lib/domain/Order.ts:25-27` records the intent to retire it once nothing does.
- **Fix shape:** move the UI pages to DTO-derived types, then delete `lib/orders/types.ts`.
- **Detail:** `docs/anvil/2026-06-11-f-09-rip-out-audit.md` (item 7 notes)
- **Owner unit:** unscheduled — low priority, fold into the UI phase
- **Status:** open

### F-TD-13 — `annualReview.test.ts` date-boundary flake (00:00–01:00 local)

- **Deferred:** 2026-06-12 (found during F-TD-11 Render; pre-existing on main, unrelated to the diff)
- **What:** 2 `trainingRefreshStatus` tests in `tests/unit/annualReview.test.ts` fail when the suite runs between 00:00 and 01:00 local (BST): the test helper derives "today" via `toISOString()` (UTC) while the implementation (`lib/annualReview/sections.ts`) uses the local date — for one hour a day the two disagree. Verified failing on untouched main at 00:36 and green at 01:00+.
- **Fix shape:** make the test helper derive "today" the same way the implementation does (local date), or freeze the clock in the test with vitest fake timers.
- **Detail:** PR #29 description (implementer note) + `docs/anvil/2026-06-12-f-td-11-cert.md` (known gaps §1)
- **Owner unit:** Day 1 of the 16-day sprint
- **Status:** done (`daysFromToday` helper now derives the date via `toLocaleDateString('en-CA')` — local, matching the implementation and the rest of the file — instead of `toISOString()` UTC; 182/182 unit tests green)

### F-TD-14 — 32 `/api/haccp/*` routes authorize off UNSIGNED `mfs_role`/`mfs_user_id` cookies (T1 residual)

- **Deferred:** 2026-06-12 (during T1 — sign the `mfs_session` cookie; plan §11 risk R6)
- **What:** all 32 route files under `app/api/haccp/**` read the client-writable, unsigned `mfs_role` / `mfs_user_id` cookies directly for authorization (e.g. `app/api/haccp/customers/route.ts:14`), and `/api/haccp` is a PUBLIC path in `middleware.ts` — so these routes never see the now-signed `mfs_session` at all. Signing `mfs_session` (T1) does NOT close this hole: anyone can set `mfs_role=admin` in devtools and call these endpoints. Forgeable independently of the session cookie.
- **Why deferred:** out of T1's locked scope (Gate 1: no change to the unsigned display cookies or the HACCP route authorization model); too big to sneak into the signing PR.
- **Fix shape:** auth-track follow-up unit — move `/api/haccp/*` authorization onto the verified session (middleware `x-mfs-*` headers or a shared `requireRole` helper reading the signed cookie); rides the T4/`requireRole` migration from the F-RLS-01 audit.
- **Detail:** `docs/plans/2026-06-12-t1-sign-session-cookie.md` §11 R6 + `docs/rls-audit-2026-06-12.md`
- **Owner unit:** T4 (auth track) — needs its own unit, not unscheduled hygiene
- **Status:** open

---

## Architecture follow-ups (ARCH-FU-)

### ARCH-FU-01 — Move `Role` from `lib/observability/` to `lib/domain/`

- **Deferred:** 2026-06-09 (during F-05)
- **What:** `Role` union (`'admin' | 'sales' | 'office' | 'warehouse' | 'butcher' | 'driver'`) currently lives at `lib/observability/Caller.ts:26`. It's a pure domain concept but ended up in the observability layer because F-03 (caller context) needed it first. F-07's OrdersService imports it as a type-only from `@/lib/observability` — small architectural quirk.
- **Why deferred:** moving it now would touch every file that imports it for one symbol's sake; F-13 is where the auth/user domain naturally lands.
- **Fix shape:** create `lib/domain/Role.ts`, re-export from `lib/domain/index.ts`, change every importer's path (one-line each), delete the export from observability.
- **Detail:** `lib/observability/Caller.ts:11-16` + F-07 plan §1.5
- **Owner unit:** F-13 (UsersService — naturally touches Role anyway)
- **Status:** open
- **F-13 note (added 2026-06-11, F-08):** F-08 shipped a minimal read-only `UsersRepository` port (`lib/ports/UsersRepository.ts`, `findUserById` only) with Supabase + Fake adapters and a shared contract suite. **F-13 absorbs and expands this port** — it is the Users domain's absorption seed; `UserSummary.role` (plain `string`) tightens to the `Role` union when Role moves to `lib/domain/`.

### ARCH-FU-02 — Raw `fetch()` sites awaiting port extractions (F-01 narrowing)

- **Deferred:** 2026-06-08 (during F-01)
- **What:** 13 raw `fetch()` call sites identified in F-01's grill were NOT migrated in F-01 because they need port extractions that don't exist yet. Each is assigned to a future migration unit.
- **Why deferred:** narrowing F-01 to one rule kept the unit shippable.
- **Detail:** `docs/adr/0005-f01-narrowed-raw-fetch-deferred-to-port-extractions.md` (Per-Site Map of 13 sites with owners)
- **Owner units:** F-11, F-15, F-16, F-17, F-18, F-20 (distributed)
- **Status:** open (owner-tracked, not a single unit)

### ARCH-FU-03 — `editOrder` unused `callerUserId` parameter

- **Deferred:** 2026-06-09 (during F-07, loop 1 — code-critic CV-01)
- **What:** `OrdersService.editOrder(id, patch, lineReplacement, callerRole, callerUserId)` takes `callerUserId` but doesn't use it. Documented as forward-compat for F-13 (audit) / F-19 (edit history). Implementation destructures it as `_callerUserId`.
- **Why deferred:** F-07 plan §1 included it as forward-compat; harmless dead arg today.
- **Decision needed:** when F-13/F-19 lands — either (a) wire it through to a new audit hook, or (b) remove it from the interface and add fresh fields when actually needed (YAGNI argument).
- **Detail:** F-07 source `lib/services/OrdersService.ts:417` + plan §1 lines 268-272
- **Owner unit:** F-13 or F-19 (whichever ships first and adopts the audit shape)
- **Status:** open

### ARCH-FU-04 — Improve unit-test happy-path coverage with round-trip reads

- **Deferred:** 2026-06-09 (during F-07, loop 1 — code-critic SU-02)
- **What:** F-07's `placeOrder` happy-path test asserts the return value's shape but doesn't round-trip through `findOrderById` to confirm persistence. A bug where `createOrder` returns a well-shaped Order without persisting would pass.
- **Why deferred:** non-blocker; F-07's other tests catch the persistence path indirectly.
- **Fix shape:** one-line `const fresh = await service.findOrderById(result.id); expect(fresh?.reference).toBe(result.reference);` after happy-path assertions, in every service's unit test.
- **Detail:** F-07 cert (when written) + code-critic Guard report
- **Owner unit:** F-13 (template for service unit tests) — apply pattern, retrofit OrdersService.test.ts
- **Status:** open

### ARCH-FU-05 — Test forbidden-role exclusion paths in `editOrder`

- **Deferred:** 2026-06-09 (during F-07, loop 1 — code-critic SU-03)
- **What:** F-07's `editOrder` tests cover roles that ARE allowed but not roles that AREN'T. No test asserts `warehouse`/`butcher`/`driver` are blocked from editing a placed order. Today's behaviour blocks them; if `ROLES_EDIT_PLACED` is accidentally edited to include one of them, no test catches it.
- **Fix shape:** parametrised `it.each(['warehouse', 'butcher', 'driver'])` case in editOrder describe block.
- **Detail:** F-07 cert (when written) + code-critic Guard report
- **Owner unit:** unscheduled — pickup at F-08 when routes go live (good time to harden), or F-13 (template).
- **Status:** done (F-08 PR — `it.each(['warehouse','butcher','driver'])` placed-state ForbiddenError cases in `tests/unit/services/OrdersService.test.ts`)

---

## Migration hygiene (F-TD-)

### F-TD-15 — Migration filename convention collides for same-day migrations

- **Deferred:** 2026-06-13 (during T3)
- **What:** The repo's `YYYYMMDD_NNN_name.sql` naming is latent-broken — the Supabase CLI derives a migration's `version` from the digits **before the first underscore**, so `20260613_001_…` and `20260613_002_…` both register as version `20260613` and collide (`schema_migrations_pkey` 23505) on `db:reset`. Never surfaced because every prior date had exactly one migration; T3 was the first second-same-day migration and hit it.
- **Fix applied for T3:** T3 uses a full 14-digit timestamp `20260613020000_harden_security_definer_fns.sql` (unique version, sorts after T2). Going forward all migrations should use full 14-digit timestamps (`YYYYMMDDHHMMSS_name.sql`, like `20260101000000_baseline.sql`), not `YYYYMMDD_NNN`.
- **Why deferred (residual):** already-shipped `YYYYMMDD_NNN` files (incl. T2 `20260613_001`) are grandfathered — each is the sole migration for its date, so no live collision; renaming files already recorded in prod `schema_migrations` is risky and unnecessary. Deferred work: (a) codify the full-timestamp convention in CLAUDE.md / a lint check; (b) optionally backfill-rename historical files in a migration-hygiene pass.
- **Detail:** `docs/plans/2026-06-13-t3-harden-security-definer-fns.md` §"Exact file to change".
- **Priority:** Medium — a footgun that silently rolls back a same-day migration; cheap to codify.
- **Owner unit:** unscheduled (migration-hygiene)
- **Status:** open

### F-TD-16 — Two 🔵 residuals from the F-TD-09 Guard review (cron auth + comment accuracy)

- **Deferred:** 2026-06-14 (F-TD-09 Guard, both non-blocking 🔵)
- **What:** (a) **CRON_SECRET-unset hardening** — both cron routes (`app/api/cron/purge-idempotency-keys/route.ts:17` and the pre-existing `app/api/cron/haccp-alarm/route.ts:66`) compare `Authorization` to `Bearer ${process.env.CRON_SECRET}`; if `CRON_SECRET` were ever unset, the literal `"Bearer undefined"` would authenticate. Vercel injects the secret in all envs so it's latent, not live — but an early-return 500 on `!process.env.CRON_SECRET` would fail closed regardless. (b) **W1 comment accuracy** — `lib/adapters/supabase/OrdersRepository.ts:395-398` comment says the guard deletes "against the same instant the row was read at"; the captured `now` is actually taken *before* the read (conservative clock — behaviour is correct, the wording oversells). Reword.
- **Why deferred:** both non-blocking nits surfaced at F-TD-09 Guard; not worth re-opening the shipped PR.
- **Detail:** `docs/reviews/2026-06-14-f-td-09-idempotency-key-hygiene-review.md` (🔵 findings)
- **Owner unit:** unscheduled (tiny — fold into any future Orders/cron touch)
- **Status:** open

---

## Infrastructure follow-ups (F-INFRA-)

### F-INFRA-03 — Run the preview smoke in CI (GitHub Actions)

- **Deferred:** 2026-06-10 (during F-INFRA-02)
- **What:** The Gate-4 preview smoke is conductor-run from a local machine (`npm run test:e2e:preview -- <preview-url>`). Future unit: run it in CI (GitHub Actions) instead of / in addition to conductor-run, so every PR gets the smoke automatically. The Vercel Protection Bypass secret moves from `.env.e2e.local` to repo secrets; `.github/workflows/` is currently intentionally empty.
- **Why deferred:** Gate-1 lock for F-INFRA-02 explicitly scoped the smoke as FORGE-run with no CI.
- **Detail:** `docs/plans/2026-06-10-f-infra-02-preview-smoke-plumbing.md` + ADR-0006
- **Owner unit:** F-INFRA-03 (unscheduled)
- **Status:** open

### F-INFRA-04 — Re-enable Vercel Deployment Protection (+ automation bypass) after the re-architecture

- **Deferred:** 2026-06-10 (during F-INFRA-02)
- **What:** Deployment Protection is disabled entirely on the Vercel project because Hakan's plan exposed no usable Protection Bypass for Automation; previews are publicly URL-reachable (low risk: post-F-INFRA-02 previews hold only ANVIL-TEST dummy data). The preview smoke runs with the `--unprotected` flag in the meantime.
- **Goal:** when the migration completes (or if previews ever carry sensitive data), re-enable protection, generate the bypass secret into `.env.e2e.local` as `VERCEL_AUTOMATION_BYPASS_SECRET`, and drop the `--unprotected` flag from the Gate-4 runbook invocation.
- **Detail:** `docs/runbooks/preview-smoke.md` "Two modes" + ADR-0006 addendum
- **Owner unit:** unscheduled (post-migration ops)
- **Status:** open

---

## Product features (F-PROD-)

### F-PROD-01 — HACCP Allergen Assessment version history UI

- **Deferred:** before 2026-06-09
- **What:** `haccp_allergen_assessment` table stores each save as a new row (audit trail exists in DB) but `/haccp/allergens` page only shows the latest. No UI to view past versions.
- **Fix shape:** same pattern as Food Fraud assessment.
- **Priority:** Medium — SALSA auditor may ask to see previous assessments.
- **Owner unit:** unscheduled
- **Status:** open

### F-PROD-02 — KDS line-done undo with confirmation

- **Deferred:** 2026-06-09 (during F-06 session)
- **What:** Today if a kitchen operator taps "done" by accident, second tap is idempotent (no-op) — no way to UNDO. Hakan flagged: should the second tap show a confirmation modal "Are you sure you want to undo?" and revert the line?
- **Why deferred:** would re-litigate F-05's port shape (`markLineUndone` method) + new `audit_log` type + service rules ("can you undo a line on a completed order? No."). Not a migration concern; needs its own product+plan cycle.
- **Detail:** memory `project_hexagonal_migration_progress.md` "Tracked product features"
- **Priority:** Low-Medium — annoyance not a safety issue
- **Owner unit:** unscheduled (product feature, post-Phase-1)
- **Status:** open

---

## F-08 hard prerequisites (carried forward from memory)

Not new entries — pointers. F-08 cannot ship until these are green:

1. **F-TD-03** (above) fixed — 23 broken Orders integration tests pass
2. **Playwright `@critical` suite must PASS at Gate 3** — not skipped, not deferred
3. **F-INFRA-02 shipped** — the per-PR preview smoke is live (`npm run test:e2e:preview`, `docs/runbooks/preview-smoke.md`); the manual click-through compensating control is no longer required

Owner unit for F-INFRA-02 itself: separate infra ticket, pre-F-08.
