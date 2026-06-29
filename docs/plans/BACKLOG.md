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
- **Status:** done (PR #35 / squash `e0c5fcd`, shipped + prod-verified 2026-06-14). Full close: new lazy `lib/adapters/supabase/client.ts` (`getSupabaseService()` memoized + back-compat `supabaseService` lazy Proxy → zero `createClient` at module-load), codemod of 88 import paths, deleted old `lib/supabase.ts` + the `tests/setup.ts` env-stub shim, synced 4 lint mirrors. Acceptance proof: unit 1533→1536 green with the shim gone (`setup 0ms`); integration 122; preview 8/8; prod smoke 5/5 non-500 (`kds/orders` 200 through the proxy). No migration. Cert `docs/anvil/2026-06-14-f-td-04-lazy-supabase-client-cert.md`. Residual 🟡 → F-TD-17 (WebKit E2E flake, harness not app).

### F-TD-05 — Architecture-pin test only covers `OrdersService.ts`

- **Deferred:** 2026-06-09 (during F-07, loop 1 — code-critic TS-03)
- **What:** `tests/unit/services/OrdersService.test.ts` test #28 reads ONLY `lib/services/OrdersService.ts` and asserts no cross-service / observability / auth / log imports. When `UsersService.ts` ships, this test will still pass even if UsersService imports OrdersService directly.
- **Why deferred:** F-07 is the first service; pin trivially passes today.
- **Fix shape:** convert the test to read every file in `lib/services/`, OR convert to an ESLint `no-restricted-imports` rule (cleaner — fails at lint not at test time).
- **Detail:** F-07 cert + code-critic Guard report (when cert written)
- **Owner unit:** F-13 (UsersService) — must tighten BEFORE second service ships
- **Progress (2026-06-12, F-TD-11):** adapter-import dimension now ESLint-enforced for `lib/services/**` + `lib/usecases/**` (`.eslintrc.json` override, pinned by `tests/unit/lint/no-adapter-imports.test.ts` against the real config); cross-service-import dimension still open — owner F-13 unchanged.
- **Status:** done (F-13 PR1, `7d482c6`) — cross-service-import ban added to the services/usecases ESLint override (`no-restricted-imports` patterns `@/lib/services/*` + `**/services/*`, catching the alias form the codebase universally uses; same-dir `./Other` relative deliberately left legal so the `lib/services/index.ts` barrel re-export passes — documented 🔵 gap), pinned by load-from-disk test `tests/unit/lint/no-cross-service-imports.test.ts` (verified it bites on a real cross-service import).

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
- **Owner unit:** Day 4 of the 16-day sprint
- **Status:** done (2026-06-15 — read-only prod audit, **0 fixture rows** found across `users`/`customers`/`products` + linked orders; exact `ANVIL-TEST-%` + widened `anvil/e2e/fixture/test/sentinel` sweep, live-data sanity counts confirm real reads. No delete needed. Record `docs/anvil/2026-06-15-f-td-07-anvil-test-row-audit.md`)

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
- **Owner unit:** Day-16 sealing unit 3/6
- **Status:** done (PR #90 / squash `2c6ee1f`, ship-record `4b59a64`, 2026-06-27 — FULL retirement: 4 pure helpers + `ORDER_REFERENCE_REGEX` relocated verbatim into NEW `lib/domain/orderReference.ts`; 9 imports re-pointed to `@/lib/domain/Order` (5 UI pages + `EditLockBanner` + 3 `lib/orders/*` modules `dashboardFilters`/`kdsLogic`/`pickingList`); `tests/unit/orders/types.test.ts` re-pointed (assertions unchanged = byte-equivalence oracle); `OrderState`/`OrderUom` now declared exactly ONCE; `lib/orders/types.ts` DELETED. Pure type-rename + dead-file deletion, byte-identical runtime bundle. Guard SHIP 0 blockers; ANVIL tsc 0 · unit 2733 · @critical 75/75; prod smoke non-5xx. Cert `docs/anvil/2026-06-27-f-td-12-retire-legacy-orders-types-cert.md`.)

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
- **Detail:** `docs/plans/2026-06-12-t1-sign-session-cookie.md` §11 R6 + `docs/reference/security/rls-audit-2026-06-12.md`
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
- **Status:** done (F-13 PR1, `7d482c6`) — `lib/domain/Role.ts` created (Role union + `KNOWN_ROLES` + `isKnownRole`), re-exported from `lib/domain/index.ts`, every importer re-pointed, observability export deleted, `UserSummary.role` tightened from `string` to the `Role` union. tsc 0 proves no orphaned import.
- **F-13 note (added 2026-06-11, F-08):** F-08 shipped a minimal read-only `UsersRepository` port (`lib/ports/UsersRepository.ts`, `findUserById` only) with Supabase + Fake adapters and a shared contract suite. **F-13 absorbs and expands this port** — it is the Users domain's absorption seed; `UserSummary.role` (plain `string`) tightens to the `Role` union when Role moves to `lib/domain/`.

### ARCH-FU-02 — Raw `fetch()` sites awaiting port extractions (F-01 narrowing)

- **Deferred:** 2026-06-08 (during F-01)
- **What:** 13 raw `fetch()` call sites identified in F-01's grill were NOT migrated in F-01 because they need port extractions that don't exist yet. Each is assigned to a future migration unit.
- **Why deferred:** narrowing F-01 to one rule kept the unit shippable.
- **Detail:** `docs/adr/0005-f01-narrowed-raw-fetch-deferred-to-port-extractions.md` (Per-Site Map of 13 sites with owners)
- **Owner units:** F-11, F-15, F-16, F-17, F-18, F-20 (distributed)
- **Status:** open (owner-tracked, not a single unit). **F-15 progress (2026-06-19):** F-15 PR1 shipped the Pricing-domain foundation (port + adapters, dark) but did NOT touch `lib/pricing-email.ts` — its raw `fetch()` against the PostgREST `users` endpoint is queued for **F-15 PR2**, where the recipient read routes through the **F-13 UsersRepository** (extend with a "notifiable users by role" method, NOT a new pricing method — Hakan-decided 2026-06-19). PR1's port exposes `getAgreementForEmail` so PR2 composes the activation email through the service. The `pricing-email.ts` site stays OPEN until PR2 merges.

### ARCH-FU-03 — `editOrder` unused `callerUserId` parameter

- **Deferred:** 2026-06-09 (during F-07, loop 1 — code-critic CV-01)
- **What:** `OrdersService.editOrder(id, patch, lineReplacement, callerRole, callerUserId)` takes `callerUserId` but doesn't use it. Documented as forward-compat for F-13 (audit) / F-19 (edit history). Implementation destructures it as `_callerUserId`.
- **Why deferred:** F-07 plan §1 included it as forward-compat; harmless dead arg today.
- **Decision needed:** when F-13/F-19 lands — either (a) wire it through to a new audit hook, or (b) remove it from the interface and add fresh fields when actually needed (YAGNI argument).
- **Detail:** F-07 source `lib/services/OrdersService.ts:417` + plan §1 lines 268-272
- **Owner unit:** F-13 or F-19 (whichever ships first and adopts the audit shape)
- **Status:** done (F-13 PR1, `7d482c6`) — chose **(b) YAGNI-remove** (Hakan-approved at Frame): F-13 is a pure extraction with no audit-trail feature, so the dead `callerUserId` was removed from `editOrder`'s signature/impl/JSDoc + the single route call site + 8 test call sites. When F-19 (edit history) needs audit it adds fresh, used fields then.

### ARCH-FU-04 — Improve unit-test happy-path coverage with round-trip reads

- **Deferred:** 2026-06-09 (during F-07, loop 1 — code-critic SU-02)
- **What:** F-07's `placeOrder` happy-path test asserts the return value's shape but doesn't round-trip through `findOrderById` to confirm persistence. A bug where `createOrder` returns a well-shaped Order without persisting would pass.
- **Why deferred:** non-blocker; F-07's other tests catch the persistence path indirectly.
- **Fix shape:** one-line `const fresh = await service.findOrderById(result.id); expect(fresh?.reference).toBe(result.reference);` after happy-path assertions, in every service's unit test.
- **Detail:** F-07 cert (when written) + code-critic Guard report
- **Owner unit:** F-13 (template for service unit tests) — apply pattern, retrofit OrdersService.test.ts
- **Status:** done (F-13 PR1, `7d482c6`) — round-trip read-back adopted in the UsersRepository shared contract (write then re-read via the finder, assert persistence) + retrofitted into OrdersService.test.ts happy-paths. It is now the documented template for service unit tests.

### ARCH-FU-05 — Test forbidden-role exclusion paths in `editOrder`

- **Deferred:** 2026-06-09 (during F-07, loop 1 — code-critic SU-03)
- **What:** F-07's `editOrder` tests cover roles that ARE allowed but not roles that AREN'T. No test asserts `warehouse`/`butcher`/`driver` are blocked from editing a placed order. Today's behaviour blocks them; if `ROLES_EDIT_PLACED` is accidentally edited to include one of them, no test catches it.
- **Fix shape:** parametrised `it.each(['warehouse', 'butcher', 'driver'])` case in editOrder describe block.
- **Detail:** F-07 cert (when written) + code-critic Guard report
- **Owner unit:** unscheduled — pickup at F-08 when routes go live (good time to harden), or F-13 (template).
- **Status:** done (F-08 PR — `it.each(['warehouse','butcher','driver'])` placed-state ForbiddenError cases in `tests/unit/services/OrdersService.test.ts`)

---

### ARCH-FU-06 — Geocoder port (postcodes.io) + RouteOptimizer port (Google Routes v2)

- **Deferred:** 2026-06-17 (F-14 — out of scope, routing brain untouched this pass)
- **What:** the `optimise` and `compute-road-times` endpoints (`app/api/routes/optimise/route.ts`, `app/api/routes/compute-road-times/route.ts`) still call external services via raw `fetch` outside any port — postcodes.io (geocoding) and Google Routes v2 (drive-time matrix). F-14 deliberately left the routing brain alone; these are the next sockets to build.
- **Fix shape:** extract as their own unit — a `Geocoder` port (postcodes.io adapter) and a `RouteOptimizer` port (Google Routes v2 adapter), wired in `lib/wiring/routes.ts` beside `routesService`.
- **Owner unit:** unscheduled.

---

### ARCH-FU-07 — Lint-enforce the components→adapters render-only carve-out

- **Deferred:** 2026-06-18 (F-24 PR1 — flagged 🔵 by code-critic at Guard)
- **What:** the CLAUDE.md blocker "anything in `app/**`/`components/**` importing from `lib/adapters/**` directly" is NOT lint-enforced — the F-TD-11 `no-restricted-imports` adapter-path ban (`@/lib/adapters/**`) is scoped to `lib/services/**` + `lib/usecases/**` only. F-24 PR1 introduced a deliberate, code-critic-approved exception: `components/RouteMap.tsx` imports the render-only `MapCanvas` adapter directly (a render-only React component carries no vendor type across the port, so it is NOT the UI→DB coupling the rule guards against). That carve-out currently rests on human judgement + the plan, not a rule — so a *future* component could import a **data** adapter (e.g. a Supabase adapter) directly and lint would stay green.
- **Fix shape:** a narrow ESLint rule banning `components/**` + `app/**` from importing `@/lib/adapters/**` EXCEPT a small render-only allow-list (the `leaflet` map adapter, and any future pure-render adapter). Turns the carve-out from "trusted" into "enforced", and closes the pre-existing data-adapter gap.
- **Priority:** Low (pre-existing gap, not introduced by F-24; the specific F-24 import was ruled acceptable).
- **Owner unit:** unscheduled.

---

### ARCH-FU-08 — Discrepancies domain extraction (retire `app/api/detail/discrepancy` raw fetch) — ✅ RESOLVED 2026-06-26 (F-21, PR #84 `1e721d7`)

- **✅ RESOLVED by F-21 (Dashboard split):** built the owned Discrepancies seam exactly as the fix shape below describes — `lib/domain/Discrepancy.ts` (`DiscrepancyDetail` + the today/week-rollup types), `lib/ports/DiscrepanciesRepository.ts` (`findDetailById` + `listToday` + `listWeekRollup`), `lib/adapters/supabase/DiscrepanciesRepository.ts` + Fake + shared `__contracts__`, wired in `lib/wiring/discrepancies.ts`. `app/api/detail/discrepancy/route.ts` re-pointed off the raw `fetch` + inline service-role key onto `discrepanciesRepository.findDetailById` → 12-key wire shape byte-identical (only the 500 error-body string `'DB error'`→`'Server error'` changed — R4, no client reads it). The raw fetch + inline key are GONE. Residual follow-up (R3, low priority): `DashboardService` reuses `OrdersRepository.listOrders`/`PricingRepository.listAgreements` which over-fetch full rows where the dashboard reads only a couple of fields — byte-identical output, marginally heavier on a low-frequency admin read; lean dashboard-specific read methods are an optional future perf nicety, not required.
- **Deferred:** 2026-06-20 (F-16 PR2 — dropped from scope at Gate 2 by Hakan's ruling).
- **What:** `app/api/detail/discrepancy/route.ts` does a raw `fetch()` to `${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/discrepancies?...` with the Supabase service-role key inlined in the request headers (the privileged env-var key, not the singleton client). It reads the **`discrepancies`** table (with `customers`/`products`/`users` joins) and maps to a camelCase detail shape `{ id, createdAt, status, reason, orderedQty, sentQty, unit, note, customer, product, category, loggedBy }`. F-16 PR2 was briefed to "absorb" this onto `cashService`, but the route has **nothing to do with the Cash domain** — `cashService`/`CashRepository` cover only `cash_months`/`cash_entries`/`cheque_records`. Forcing a `discrepancies` read onto the Cash port would violate ADR-0002 cohesion and the frozen-foundation rule, so it was dropped from PR2 (the 8 genuine cash routes shipped clean).
- **Why it matters:** it is the last raw-fetch vendor leak + inline service-role-key usage on the detail surface — a direct breach of the hexagonal rule (vendor SDK/REST only inside `lib/adapters/<vendor>/`). The inline key in a route header is also a small security smell vs the singleton client.
- **Fix shape:** extract a small **Discrepancies domain** — `lib/domain/Discrepancy.ts` (the detail model), `lib/ports/DiscrepancyRepository.ts` (a `findById(id)` read port), `lib/adapters/supabase/DiscrepancyRepository.ts` + a fake, a `DiscrepancyService` (or fold into an existing detail/orders service if cohesive), wired in `lib/wiring/`. Then re-point the route through the service + a `lib/api/<domain>/dto.ts` translator so the wire shape stays byte-identical. Same strangler-fig pattern as F-13/F-15/F-16. Retires the raw fetch and the inline key in one go.
- **Priority:** Low–medium (pre-existing leak, not introduced by F-16; isolated single route).
- **Owner unit:** unscheduled (its own future F- extraction).

---

### ARCH-FU-09 — Make the legitimate service-role routes use the explicit `requireServiceRole()` (🔵)

- **Deferred:** 2026-06-27 (F-RLS-final — "Default to ZERO route edits" scope).
- **What:** the routes that legitimately hold the master key reach it via a wiring singleton (`ordersService`, `visitsService`, `cashService`) or a raw `process.env.SUPABASE_SERVICE_ROLE_KEY` read, NOT via the ADR-0004-blessed `requireServiceRole()` (which exists at `lib/adapters/supabase/authenticatedClient.ts:54` but has zero callers). They are correctly allow-listed by the F-RLS-final guard, but the master-key intent is implicit, not grep-obvious at the call site.
- **Why it matters:** a behaviour-neutral refactor would make every deliberate master-key use read `requireServiceRole()` — self-documenting + a single grep-able audit surface. Pure clarity, no functional change.
- **Fix shape:** swap the singleton/raw-key usage in the allow-listed routes for `requireServiceRole()` where the route genuinely needs raw master-key access (NOT where it should be cut to `…ForCaller` — those are the F-RLS-04a-create / F-RLS-04g / cash-storage follow-ons). Update the guard's Rule-A/C allow-lists accordingly.
- **Priority:** Low (clarity, not security — the F-RLS-final guard already seals the posture).
- **Owner unit:** unscheduled.

---

### ARCH-FU-10 — F-RLS-final Rule B over-flags non-DB wiring ports (🔵)

- **Deferred:** 2026-06-27 (F-RLS-final — Guard 🔵 note, disclosed in ADR-0008).
- **What:** the F-RLS-final guard's Rule B presumes ANY non-`…ForCaller` symbol imported from `lib/wiring/**` carries the service-role master key, so non-DB ports (`geocoder`, `pushSender` — no master key behind them) sit in the security allow-list of 31. This is the deliberate security-correct bias (require a written reason for any non-badge-checked wiring import), not a defect — but it means the allow-list mixes "real master-key" with "harmless non-DB" entries.
- **Why it matters:** a future per-route tightening could narrow Rule B to only the wiring exports that actually wire a service-role client, shrinking the allow-list to the genuine master-key surface and making the register sharper.
- **Fix shape:** classify wiring exports (service-role-backed vs not) and have Rule B flag only the former; drop the non-DB ports from the allow-list. Needs a robust, non-brittle way to detect "service-role-backed" (the reason it was deferred — the convention rule was chosen to avoid a hand-maintained singleton list).
- **Priority:** Low (the guard is correct and complete as-is; this is precision, not coverage). The broader `F-RLS-wiring-guard` idea is CLOSED — Rule B + Rule C already cover both real vectors.
- **Owner unit:** unscheduled.

---

### F-TD-23 — Map View E2E click→modal proof relies on `role="dialog"` the DetailModal lacks

- **Deferred:** 2026-06-18 (F-24 PR2 — surfaced during the post-ship local populated-data verification)
- **What:** `tests/e2e/06-map-view-markers.spec.ts` detects the visit-click→DetailModal behaviour via `page.getByRole('dialog')`. The DetailModal opened by `app/map/page.tsx` on a visit-pin click carries no `role="dialog"`, so the wait times out and the spec logs `modal=no-visit-pin` **even when the modal demonstrably opened** (confirmed by screenshot in the F-24 PR2 cert's populated-data verification: "VISIT DETAIL — MAP-SMOKE Nottingham"). The hard gate (map mounts + markers conditional) still passes; only the behaviour *detection* is a false-negative.
- **Fix shape:** assert on the DetailModal's actual content (e.g. the "VISIT DETAIL" panel heading / a stable test id) instead of `role="dialog"`, so `modal=opened` is recorded when the click genuinely opens the panel. Optionally add `role="dialog"` to the DetailModal for accessibility (separate a11y consideration).
- **Priority:** Low (test-observability only — the behaviour is correct and proven; this just makes the automated proof self-reporting instead of screenshot-confirmed).
- **Owner unit:** unscheduled.

### F-TD-24 — Pricing RBAC owner-read swallows a DB error into a 403 (should be 500)

- **Deferred:** 2026-06-19 (F-15 PR2 planning — Gate 2 decision R6, accepted to preserve byte-identity)
- **What:** in the pricing routes' ownership pre-check ("is this your deal?"), a database error during the owner read is silently treated as "not found" → **403 Forbidden** instead of **500**. Pre-F-15-PR2 the route did `const { data: own } = await supabase.…` and ignored the error object, so `own` came back `undefined` and fell through to the 403 branch. F-15 PR2 deliberately **reproduces** this (catching the service's `ServiceError` and returning 403) so the re-point stays byte-identical.
- **Why it's wrong:** a DB hiccup is a server fault, not an authorization decision — it should surface as a 500, not masquerade as "access denied." Masking it also hides real outages behind a misleading status code.
- **Fix shape:** in the PATCH/DELETE/line-RBAC owner pre-checks (`app/api/pricing/[id]/route.ts`, `app/api/pricing/lines/[lineId]/route.ts`), let `getAgreementOwner`/`getLineOwner`'s `ServiceError` propagate to a 500 (only a genuine `null`/no-row result → 403). Pair with a route test asserting DB-error → 500.
- **Priority:** Low (latent pre-existing quirk; not customer-data-affecting — wrong status code on a rare DB-failure path only).
- **Owner unit:** F-RLS-04d (the pricing RLS cutover re-touches these routes) — or unscheduled.
- **Status:** open

### F-TD-25 — `seed.sql` plants no pricing fixture → preview pricing smoke can't auto-verify

- **Deferred:** 2026-06-19 (F-15 PR2 — surfaced during the deep preview browser verify)
- **What:** `supabase/seed.sql` seeds no `price_agreements`/`price_agreement_lines`, and preview branches are `with_data:false` — so a preview's `GET /api/pricing` returns `{agreements: []}`. The F-15 PR2 deep verify had to **create** an agreement via the deployed `POST /api/pricing` route before it could exercise list/detail/edit/activate (stronger proof, but it means there's no standing fixture for an automated pricing preview smoke).
- **Fix shape:** add one `ANVIL-TEST-` price agreement with 2 lines (one catalogue product, one free-text) to `supabase/seed.sql`, so preview branches carry a pricing fixture and a future `@critical` (or smoke) pricing spec can assert "list card shows N products" without self-seeding. Pairs naturally with writing a pricing `@critical` E2E spec (none exists today).
- **Priority:** Low (coverage/observability — pricing correctness is already proven by the contract + integration tests on real Postgres; this just enables an automated *preview* assertion).
- **Owner unit:** unscheduled (or rides with F-RLS-04d / a future pricing E2E unit).
- **Status:** open

### F-TD-26 — `PdfRenderer` port owns the browser download → no headless unit test of PDF output

- **Deferred:** 2026-06-19 (F-22 planning — Gate 1 design choice, accepted to preserve byte-identity)
- **What:** F-22 moves the price-agreement PDF routine behind a `PdfRenderer` port + jsPDF adapter, but the adapter keeps jsPDF's `doc.save(filename)` (the browser download) **inside** it — the port is "render+deliver this agreement as a PDF," not a pure "give me the bytes" function. Chosen because moving the 170-line routine verbatim (download line included) guarantees byte-identical output with zero new code; the alternative (port returns a `Blob`/bytes, the page triggers the download itself) would re-implement jsPDF's download in our own code = new behaviour surface on a "byte-identical" PR. Mirrors the F-24 Leaflet adapter's same call.
- **Why it's worth revisiting:** because the port produces a side-effect (a browser download) rather than a return value, the PDF can't be exercised in a headless Node unit test — coverage of the renderer stays at "it's called" + manual/E2E, not "the bytes are correct." A future split (port returns bytes; a thin presentation helper does the download) would make the renderer unit-testable AND keep the rip-out test at one adapter + one wiring line.
- **Fix shape:** change the port to `renderPriceAgreement(data): Promise<Blob>` (or `Uint8Array`); keep the jsPDF drawing verbatim in the adapter but `return doc.output('blob')` instead of `doc.save()`; add a tiny owned download helper (blob URL → anchor click) called by `app/pricing/page.tsx`. Pair with a unit test asserting the Blob is a non-empty `application/pdf`.
- **Priority:** Low (testability/purity improvement; the PDF is already proven by E2E + manual verify — this is about *unit*-level confidence, not a correctness bug).
- **Owner unit:** unscheduled (or rides with a future pricing E2E / a second PdfRenderer adapter if one is ever added).
- **Status:** open

### F-TD-27 — Pricing edits write no "who edited" entry to `audit_log`

- **Deferred:** 2026-06-19 (surfaced during F-RLS-04d prod verification of THE MARAKKESH YORK / `MFS-2026-0008`).
- **What:** the generic `audit_log` table (`user_id`, `screen`, `action`, `record_id`, `summary`) records order/screen actions (and there's a dedicated `order_audit_log`), but **pricing create/edit/delete and line changes write NO row to it**. During the F-RLS-04d cutover proof, the edit was confirmed via `price_agreements.updated_at` + a direct RLS probe (authenticated role sees the rows, no-user sees zero) — but there was no stored "edited by X at Y" record, unlike the F-RLS-04a order test which read its identity straight from the audit trail.
- **Why it's worth fixing:** pricing agreements are commercial commitments (prices a customer is quoted/charged); a tamper-evident "who changed what, when" trail is valuable for disputes, accountability, and confirming RLS-cutover behaviour in future. Today the only trace of an edit is `updated_at` (overwritten on every save, no actor, no history).
- **Fix shape:** write an `audit_log` row on each pricing mutation, capturing the actor. Two options to weigh: (a) **app-layer** — `PricingService`/the routes append an `audit_log` entry (actor = the authenticated caller's `userId`, already threaded in post-04d), mirroring how the order/screen actions log today; or (b) **DB-layer trigger** — an `AFTER INSERT/UPDATE/DELETE` trigger on `price_agreements` + `price_agreement_lines` that reads the actor from the `app.current_user_id` GUC (set per request by the F-RLS-03 bridge) and inserts the row, so it can't be bypassed. Prefer (b) for tamper-evidence (works regardless of which route mutates), but (b) needs care for the `replace`/email paths that run as **service-role** (the GUC may be unset → log actor as NULL/'system', same shape as the order create=NULL boundary). Pick a `screen` enum value for pricing (or extend the enum). Pair with an integration test asserting an edit produces an `audit_log` row with the correct `user_id`/`record_id`.
- **Priority:** Low–Medium (accountability/observability gap, not a correctness or security bug — RLS already enforces access; this is about *recording* who exercised it).
- **Owner unit:** unscheduled — **strong candidate to pair with F-TD-30** (cash audit trail) **and F-TD-31** (owned `AuditLog` port): identical mechanism (write an `audit_log` row per mutation, actor from the threaded `userId` or the `app.current_user_id` GUC), shared `screen`-enum / trigger / port work. Doing all three in one "audit-trail standardisation" unit avoids designing the enum/trigger/port twice. **→ the audit-trail trio: F-TD-27 (pricing) · F-TD-30 (cash, URGENT) · F-TD-31 (owned port).**
- **Status:** open

### F-TD-28 — Cash entry "current month" check uses local-server time, not London time

- **Deferred:** 2026-06-22 (F-16 PR1 planning — Gate 2 design choice, accepted to preserve byte-identity).
- **What:** the cash-entry permission rule "office users can only add entries to the current calendar month" compares the entry's month against `new Date()` (the server's **local** clock), not the app's `londonToday()` helper. F-16 PR1 extracted this logic into `CashService` verbatim (the `now: Date` is injected so tests can pin it) rather than silently switching it to London time — changing the clock would be an unannounced behaviour change on a "byte-identical" extraction PR. The original route (`app/api/cash/entry/route.ts`) has always used local server time.
- **Why it's worth revisiting:** the business operates in the UK (London). Near a month boundary, server-local time and London time can disagree (e.g. a server running UTC in the last/first hour of a month, or any DST edge), so an office user could be wrongly blocked from — or wrongly allowed — adding an entry to "the current month" depending on the server's timezone rather than the user's. Every other date-sensitive rule in the app that's been hardened uses `londonToday()`.
- **Fix shape:** in `CashService` (or at the F-16 PR2 wiring/route layer), pass `londonToday()` as the `now` input to the entry-validation path instead of the raw server `new Date()`. The service already takes `now` as an injected parameter, so this is a one-line change at the call site plus a test pinning a month-boundary case across the London/UTC offset. Do it as its own small change (or fold into F-16 PR2) so it's a *named* behaviour change, not a silent one.
- **Priority:** Low (edge-only: bites only near a month boundary AND only if the server clock ≠ London; office-role-only; admins are unaffected by the current-month rule).
- **Owner unit:** F-16 PR2 (opportunistic) or a future cash-domain pass.
- **Status:** open

### F-TD-31 — General `audit_log` has no owned port (written by raw fetch in screen2 + others)

- **Deferred:** 2026-06-23 (F-17 PR1 planning — Decision 2: audit write left out of the Complaints port).
- **What:** the general-purpose `audit_log` table is written by raw `fetch` POSTs scattered across routes — the three complaint routes (`screen2/sync`, `screen2/resolve`, `screen2/note`) and others (the `audit_screen` enum spans `screen1`/`screen2`/`screen3`/`screen5`). There is **no owned `AuditLog` port, service, or adapter**. The only audit code in the hexagonal layers is Orders-specific (`order_audit_log`, read inside `OrdersRepository`, which itself documents deliberately NOT building a shared audit port until a second consumer exists — `OrdersRepository.ts:541–556`). F-17 PR1 followed that precedent: the Complaints port owns the customer-name read (Decision 1) but NOT the cross-cutting audit write, so PR2 keeps logging via the same raw call it uses today.
- **Why it's worth fixing:** `audit_log` is a genuinely cross-cutting, whole-company concern; baking it into each feature port would make a per-feature copy of a shared concern. Once a second real consumer makes the abstraction non-premature, a shared `AuditLog` port + Supabase/Fake adapters give a single tamper-evident "who did what" surface that any feature can append to without re-importing the vendor SDK.
- **Fix shape:** build a shared `AuditLog` port (`record(entry)`) + Supabase adapter (mapping to the `audit_log` columns `user_id`/`screen`/`action`/`record_id`/`summary`) + Fake adapter, wired master-key (or per-caller once RLS lands). Re-point the screen2 + other raw-fetch audit writes through it. Pairs naturally with **F-TD-27 / F-TD-30** (the pricing + cash audit-trail gaps) — same mechanism, do the enum/adapter design once.
- **Status: PARTIAL** (still open). The `AuditLog` port + Supabase/Fake adapters + `lib/wiring/auditLog.ts` were built in **F-20 PR3** (the first owned audit writer — the import routes). **F-RLS-04i (2026-06-27)** then added the **per-caller `auditLogForCaller(userId)`** wiring (so the import audit write runs as the authenticated caller, `user_id=GUC`, passing the `audit_log_insert WITH CHECK` policy). So the port AND both master-key + per-caller wirings now exist. **Remaining work = purely re-pointing the still-raw-fetch audit writers** off direct POSTs onto the existing port: `screen2/sync` · `screen2/resolve` · `screen2/note` · `screen3/sync`. The abstraction is no longer premature (3+ consumers). Still pairs with F-TD-27 (pricing) / F-TD-30 (cash) for the shared `screen`-enum work.
- **Priority:** 🟢 Low (no correctness/security bug — the writes are fire-and-forget today and don't affect responses; this is a hexagonal-cleanliness + future-standardisation item).
- **Owner unit:** unscheduled — strong candidate to fold into the F-TD-27 / F-TD-30 "audit-trail standardisation" unit.
- **Post-F-RLS-04f note (2026-06-21):** the complaints RLS cutover did NOT touch these raw audit writes — they keep their own `SUPABASE_SERVICE_ROLE_KEY` fetch and so still bypass RLS (the service swap only re-bound the table repos). When the shared `AuditLog` port is eventually built and these routes run `authenticated`, the audit insert must EITHER stay master-key OR satisfy the existing baseline `audit_log_insert` policy (`WITH CHECK user_id = app.current_user_id`) — i.e. it would already pass under the per-caller client since the actor is the caller, but only if routed through the authenticated client. Decide master-key-vs-authenticated for the audit port at that time.
- **PARTIALLY CLOSED — F-20 PR3 (2026-06-26, PR #83 `0eed901`):** the shared port now EXISTS — `lib/ports/AuditLogRepository.ts` (`record(entry)`) + Supabase + Fake adapters + shared contract + `lib/wiring/auditLog.ts` (bare service-role singleton) + `AuditLogEntry` domain type. The second real consumer arrived (the two import routes `import/manual` + `import/confirm`), so the abstraction is no longer premature — it was pulled forward to fully detach those routes from the adapter. **Master-key decided** for now (matches today's fire-and-forget service-role writes; routes call `await record(...).catch(log)` so an audit failure never fails the operation). **Remaining work:** re-point the OTHER raw-fetch audit writers onto this port — `screen2/sync` · `screen2/resolve` · `screen2/note` (complaints) · `screen3/sync` · any other `audit_log` raw inserts. Still pairs with **F-TD-27 / F-TD-30** for the enum/trigger standardisation.
- **Status:** PARTIALLY CLOSED (port built F-20 PR3) — remaining: re-point the screen2/screen3 raw audit writers onto it

### F-TD-32 — complaint-email.ts / compliment-email.ts still read users via raw Supabase fetch
- **Deferred:** 2026-06-21 (F-17 PR2 — email helpers left as-is; they read the
  users domain, not complaint/compliment data).
- **What:** `lib/complaint-email.ts` and `lib/compliment-email.ts` fetch their
  staff recipient list with a raw `fetch` POST to `/rest/v1/users` (active,
  non-driver / active). This is a USERS-domain read living outside the owned
  layer — it should go through `usersService` (the Users port shipped F-13).
- **Fix shape:** add a recipient-list read to the Users port/service (e.g.
  `listNotificationRecipients({ includeDrivers })`) + map in the adapter; re-point
  both email helpers onto `usersService`, dropping their direct Supabase users read.
- **Owner unit:** unscheduled. Pairs with any Users-domain follow-up.

### F-TD-33 — 🟡 Flaky `@critical` preview E2E specs (`04-kds-line-undo`, `08-complaints-board`)
- **Raised:** 2026-06-22 (F-18 PR1 pre-ship preview smoke). **MUST verify before F-18 PR2 merges** (Hakan's explicit ask — confirm these genuinely work, not just flake).
- **What:** the pre-ship `@critical` preview smoke failed 1/15 on two consecutive
  runs against the PR #65 preview, but the failing spec ALTERNATED — run 1 failed
  `tests/e2e/04-kds-line-undo.spec.ts:94` ("Cancel on the undo modal leaves the line
  done"); run 2 failed `tests/e2e/08-complaints-board.spec.ts:55` ("log → board renders
  → note → resolve") while `04` then passed. Non-deterministic + unrelated domains =
  flaky, almost certainly shared-preview-data contention (write-flow specs mutate the
  shared Supabase preview branch and trip each other when run back-to-back).
- **Why it matters:** F-18 PR1 shipped over this red because the change was dead code
  (provably can't touch KDS/Complaints) and the unit layer was green — but a flaky
  `@critical` gate is a real reliability hole: it will cry wolf on every future preview
  smoke, including PR2's (which is NOT dead code and DOES touch behaviour).
- **Fix shape (investigate, then pick):** (a) confirm green on `main` / local Docker
  in isolation to prove it's environment-not-code; (b) make the two write-flow specs
  self-cleaning / data-isolated (unique fixture per run, or reset-then-act) so re-runs
  don't collide; (c) consider a Supabase-preview-branch reset before the smoke.
  Do NOT just add retries to paper over it.
- **Owner unit:** **gate before F-18 PR2** — verify + (if real-but-flaky) stabilise the
  two specs first, so PR2's preview smoke is a trustworthy signal.
- **Status: RESOLVED 2026-06-22** (verified + stabilised; test-only, no app code touched).
  - **Reproduced on demand:** ran the full `--grep @critical` chromium relay against
    local Docker Supabase. On a **freshly seeded** DB both specs pass; on a **dirty
    re-run** (no `db:reset`) `04` + `08` fail — proving environment/shared-data, not code.
  - **Root cause (both):** the seed creates **zero** orders/complaints — the
    order-pipeline specs CREATE them and never clean up, and `04`'s 3rd test COMPLETES
    orders. So the board ACCUMULATES completed orders / multiple open complaints across
    specs-in-a-run and across runs, and the specs used **non-isolated selectors**:
    - `04` tapped "first green line on the whole board" → on a dirty board that's a line
      on a COMPLETED order → app correctly shows the louder "Reopen the completed order?"
      modal, but the test asserted the plain "Undo this line?" → timeout.
    - `08` scoped its card as `page.locator('div').filter({has: MARKER}).first()` → the
      OUTERMOST div containing the marker = the whole board → with >1 open complaint the
      card-scoped `Add note`/`Resolve` lookups matched multiple cards → Playwright
      strict-mode violation.
  - **Fix (data-isolation, NOT retries):**
    - `08`: anchor the card to its own root `div.bg-white.rounded-2xl` filtered by the
      unique per-run `MARKER` → the spec only ever touches its own row.
    - `04`: every interaction scoped to a single order CARD (`div.bg-slate-800.rounded-xl`);
      the plain-undo flow only taps a green line inside an IN-PROGRESS card (anchored by
      order reference so the undo can't move the locator); the reopen test waits for the
      card's "✓ Completed" marker before tapping. Cancel test no longer does a bogus
      "restore" (Cancel is a no-op).
  - **Verified:** full `@critical` relay run **4×** (1 fresh + 3 dirty re-runs, data
    accumulating to 3 orders / 3 complaints) — `04` + `08` green every time, retries=0.
    `04`'s reopen test now ACTUALLY runs the reopen path (no longer self-skips).
  - **Out of scope / separate finding:** `05` + `06` (Leaflet map specs) fail **locally
    every run** — the `/map` page throws in `next dev` (dev-mode-only); they **passed on
    the PR1 preview**. Deterministic local fail + preview pass = a local-dev-env issue, NOT
    this flake. Re-confirm on PR2's actual preview; log a separate unit if it ever reds on
    preview.

### F-TD-37 — 🟡 HACCP "submit-once-per-period" `@critical` E2E specs aren't idempotent on a shared preview branch
- **Raised:** 2026-06-24 (F-19 PR8 ANVIL). Same CLASS as F-TD-33 (which fixed `04`/`08`
  only via data-isolation) — this is the HACCP write-flow generalisation, still open.
- **What:** the every-button extend run on the PR-75 shared Supabase preview branch showed
  4 `@critical` specs wobbling red↔green across back-to-back runs — `13-haccp-cold-storage`,
  `16-haccp-process-room`, `25-haccp-reviews` (weekly-review submit), and `04-kds-line-undo`
  (the F-TD-33 fix didn't fully hold). **None touch the F-19 PR8 routes.** They are
  "submit-once-per-period" mutation specs: the weekly/period slot is single-occupancy, so a
  rerun on a branch an earlier run already wrote to fails (slot taken → 409/locked) — a false
  red, not a regression. Proven environmental: a `reset_branch` + single re-run came back
  **67/67 @critical, 0 flaky, 0 retries**.
- **Why it matters:** this has now forced a manual Supabase preview-branch **reset before the
  clean sweep on PR3, PR4, PR6, PR8 AND PR9b** (same 4 specs `13`/`16`/`25` + `04`; reset →
  clean 73/73, 0 flaky on PR9b — the predicted recurrence landed). It cries wolf on every
  HACCP PR's preview smoke and costs a ~2.5-min branch re-provision each time. **PR10a
  (Cluster G foundation, 2026-06-25) did NOT bite — it is introduce-only/inert and added NO
  new E2E, so the @critical run was pure regression (clean 73/73, 0 flaky, no reset needed).**
  **PR10b (Cluster G route cutover, 2026-06-26 — the predicted last natural home, HACCP-heavy
  exhaustive every-screen browser-tap) did NOT bite either: clean 73/73 @critical on the FIRST
  run, 0 flaky, no `reset_branch` needed.** The fresh per-PR preview branch happened to be clean
  enough this run. So the flake never recurred on its final HACCP trigger — but the underlying
  non-idempotency is STILL unfixed (latent), and any FUTURE HACCP-heavy E2E PR could re-trip it.
  **CORRECTION (2026-06-26, F-20 Admin PR1 ANVIL):** it DID re-trip — on a NON-HACCP PR.
  F-20 PR1 (Geocoder + Customers, touches ZERO HACCP code) hit it on `17-haccp-mince-prep`
  during its `@critical` run; recovered as always via `reset_branch` + a single re-run → clean
  73/73. **Key correction to the "dormant" claim: F-TD-37 is NOT HACCP-PR-bound.** The shared
  preview runs the WHOLE `@critical` suite (which includes the HACCP submit-once specs) on EVERY
  PR regardless of what it touches — so ANY PR whose ANVIL runs `@critical` is exposed, not just
  HACCP-heavy ones. The trigger is "a reused/dirty preview branch + the period slot already
  written", independent of the PR's own diff.
- **Fix shape (investigate, then pick — NOT retries):** (a) make each period-bound spec
  self-isolating — assert/act on a UNIQUE per-run period or fixture rather than "the current
  week", OR upsert-then-act so a second run is a no-op-safe overwrite; (b) a teardown that
  clears the row it created; (c) failing both, codify the pre-smoke `reset_branch` as an
  explicit ANVIL step for HACCP so it's deliberate, not a surprise. Mirror F-TD-33's
  data-isolation approach.
- **Owner unit:** unscheduled. Its named last home (Cluster G PR10b) shipped clean without
  recurrence, so the reset dance did NOT repeat — but the structural fix (self-isolating
  period-bound specs per fix-shape (a)/(b)) was never done. Re-home onto the next HACCP-heavy
  E2E PR if one arises, or fold into a test-hardening sweep. Pairs with re-confirming F-TD-33 `04`.
- **Status:** open (latent — NOT dormant; recurs on ANY PR whose ANVIL runs the `@critical`
  suite, incl. non-HACCP PRs, because the shared preview runs the full suite. Recovery is the
  standard `reset_branch` + single re-run. Real fix = self-isolating period-bound specs per
  fix-shape (a)/(b); still unscheduled — fold into a test-hardening sweep).

---

### F-TD-38 — 🔵 HACCP domain types keep raw snake_case + `as unknown as` casts instead of mapping to owned camelCase
- **Raised:** 2026-06-25 (F-19 PR9a Guard — code-critic 🔵 ×2). Deliberate, **pre-existing
  pattern across every HACCP cluster** (`HaccpAssessment.ts`, `HaccpAnnualReview.ts`,
  `HaccpReporting.ts`, and now the PR9a `HaccpHandbook`/`HaccpSuppliers`/`HaccpLookups`).
  Not a PR9a defect — logged so the accumulated debt is tracked in one place.
- **What:** the HACCP `lib/domain/Haccp*.ts` types carry the database's raw column names
  (`contact_name`, `created_at`, the nested `updater:{name}` join shape) rather than the
  app's own tidy camelCase, and the Supabase adapters `return (data ?? []) as unknown as T[]`
  (double-cast) instead of explicit snake→camel field mapping. This **technically diverges**
  from CLAUDE.md's "map vendor snake_case to owned camelCase INSIDE the adapter."
- **Why it's deliberate (don't fix mid-migration):** the raw-shape pass-through is precisely
  the **byte-identity mechanism** that lets each F-19 re-point PR (PR9b included) flip routes
  onto the hexagon with ZERO wire-shape change. Mapping now would break parity and force every
  re-point to also restructure JSON — exactly what the two-step rhythm avoids.
- **Why it matters (the cost):** (1) the `as unknown as` double-cast **bypasses `tsc` at the
  adapter boundary** — a future column rename wouldn't be caught here at compile time; (2) the
  HACCP domain reads differently from the rest of the app (Orders/Cash use owned camelCase),
  so it's a cohesion wart for anyone learning the codebase.
- **Fix shape:** AFTER F-19 is fully shipped (all clusters re-pointed, byte-identity constraint
  relaxed), do ONE "deepen the HACCP domain" pass: introduce owned camelCase domain types +
  explicit field-mapping in each Supabase adapter, drop the `as unknown as` casts, and add a
  lightweight **runtime row-validator** at the adapter boundary so a column drift fails loudly.
  Touch the UI shapes in the same pass (they currently consume the raw keys).
- **Owner unit:** unscheduled — **gate NOW LIFTED: F-19 completed 2026-06-26 (Cluster G / F-RLS-04h
  PR10b shipped, all 10 PRs done).** The byte-identity constraint that kept this deliberate is
  relaxed; this whole-HACCP "deepen the domain" pass (owned camelCase + explicit field-mapping +
  drop the `as unknown as` casts + runtime row-validator + UI shape touch) is now schedulable as
  its own unit. Not per-cluster — one sweep across all HACCP domain types/adapters/UI.
- **Status:** open — **unblocked** (F-19 done; ready to schedule).

---

## Migration hygiene (F-TD-)

### F-TD-15 — Migration filename convention collides for same-day migrations

- **Deferred:** 2026-06-13 (during T3)
- **What:** The repo's `YYYYMMDD_NNN_name.sql` naming is latent-broken — the Supabase CLI derives a migration's `version` from the digits **before the first underscore**, so `20260613_001_…` and `20260613_002_…` both register as version `20260613` and collide (`schema_migrations_pkey` 23505) on `db:reset`. Never surfaced because every prior date had exactly one migration; T3 was the first second-same-day migration and hit it.
- **Fix applied for T3:** T3 uses a full 14-digit timestamp `20260613020000_harden_security_definer_fns.sql` (unique version, sorts after T2). Going forward all migrations should use full 14-digit timestamps (`YYYYMMDDHHMMSS_name.sql`, like `20260101000000_baseline.sql`), not `YYYYMMDD_NNN`.
- **Escalation 2026-06-15:** the drift had a second, worse consequence than the same-day collision — it broke **Supabase preview-branch resync**. On a PR's 2nd+ push the CLI diffs the branch's recorded 8-digit versions against the local files and fails (`Remote migration versions not found in local migrations directory` → branch `status=MIGRATIONS_FAILED`), which fail-closes any health-gated workflow (preview smoke, F-INFRA-05 cred-sync) and blocked F-RLS-04a. Discovered live on PR #39.
- **Residual work — now done (F-TD-15 residual (a) + (b), 2026-06-15):**
  - **(b) files renamed:** the 4 short-named files renamed to full 14-digit (`git mv`, byte-identical): `20260530_001_…`→`20260530000000_…`, `20260601_001_…`→`20260601000000_…`, `20260611_001_…`→`20260611000000_…`, `20260613_001_…`→`20260613000000_…`. Order preserved (`…613000000` < existing `…613020000`). Live references repointed (ADR-0007, the 16-day roadmap, `lib/adapters/supabase/OrdersRepository.ts`, `lib/orders/types.ts`).
  - **(a) convention codified:** the full-14-digit rule is written into CLAUDE.md ("Local test infrastructure") and **pinned by `tests/unit/migrations/filename-convention.test.ts`** (asserts every migration filename matches `/^\d{14}_[a-z0-9_]+\.sql$/`, rejects a known-bad name, and bars duplicate version prefixes).
- **Descoped → moved to F-TD-18:** the originally-proposed reconciliation of **prod** `schema_migrations` was **dropped from this unit** — proven inert (preview branches build from the repo's migration FILES, not prod's recorded history; prod is append-only via `apply_migration`). Logged as optional future hygiene under **F-TD-18**.
- **Detail:** `docs/plans/archive/2026-06-15-f-td-15-migration-filename-reconciliation.md`; original collision context in `docs/plans/2026-06-13-t3-harden-security-definer-fns.md` §"Exact file to change".
- **Priority:** Medium → resolved.
- **Owner unit:** F-TD-15 residual (b) (2026-06-15).
- **Status:** done (F-TD-15 residual (a) + (b) — files renamed to 14-digit, convention codified in CLAUDE.md and pinned by `tests/unit/migrations/filename-convention.test.ts`; prod-history reconciliation descoped to F-TD-18).

### F-TD-18 — Prod migration-history reconciliation (optional hygiene)

- **Logged:** 2026-06-15 (split out of F-TD-15 residual (b))
- **What:** Prod `schema_migrations` (project uqgecljspgtevoylwkep) holds ~100 real historical records with full-14-digit timestamps and NO baseline row, whereas the repo ships 7 squashed migration files. The two histories diverge.
- **Why INERT for our workflow:** Supabase preview branches are built from the repo's migration FILES (verified on branch htinhqorvyhajcsvnqgz — it recorded exactly the 7 repo-file versions, not prod's ~100). Prod itself is only ever mutated via `apply_migration` (append-only); we never run `supabase db push` or `supabase db pull` against prod. So the divergence touches no live path — it is NOT on the RLS critical path and does not affect preview-branch health.
- **Optional future fix:** if we ever adopt `db push`/`db pull` against prod, reconcile prod's recorded history with the repo (mechanism TBD: `supabase migration repair` vs direct `schema_migrations` edit). Own FORGE/ANVIL pass, prod-touching.
- **⚠️ HARD GATE:** this MUST land **before** any switch to a diff-based prod migration workflow (`supabase db push`/`db pull`). Under that workflow the renamed 14-digit files would be seen as NEW (prod recorded the old short versions) and re-applied → failure/double-apply. Inert only while prod stays append-only via `apply_migration`. Confirmed live 2026-06-15: F-TD-15 shipped (`b3f3901`) with prod untouched; preview branches build fresh from files (proven on `uiiubqaxnjvjaoqicvau`).
- **Priority:** LOW — optional hygiene, off the critical path (but a blocking prereq for any diff-based prod sync, per the gate above).
- **Status:** open (no scheduled owner).

### F-TD-19 — `findUserByName` literal-vs-wildcard twin divergence (🔵 from F-13 PR1 Guard)

- **Logged:** 2026-06-15 (F-13 PR1 code-critic review, 🔵)
- **What:** the two `UsersRepository` adapters match names differently: Supabase `findUserByName` uses `ilike` (`lib/adapters/supabase/UsersRepository.ts:126`), which treats `%`/`_` as SQL wildcards; the Fake uses exact lowercase equality (`lib/adapters/fake/UsersRepository.ts:152-158`), which doesn't. For every committed consumer (literal staff names, no wildcards) the twins behave identically; they'd diverge silently ONLY if a caller passed a name containing a SQL wildcard char.
- **Fix shape:** one-line port-doc note that names are treated as literals, OR make the Supabase adapter escape `%`/`_` before the `ilike` so the twins match for wildcard-bearing input. No consumer sends such input today → not a bug, hygiene only.
- **Priority:** LOW (theoretical edge; no live path).
- **Status:** open.

### F-TD-20 — `PATCH /api/admin/users/[id]` returns 500 (not 404) for a missing id

- **Logged:** 2026-06-15 (F-13 PR2, R-MF-1 — latent bug deliberately preserved)
- **What:** editing a non-existent user id returns `500 { error: 'User not found' }`, not a `404`. Historically the route used `.update(...).select(...).single()`, and PostgREST's `.single()` errors (`PGRST116`) on a zero-row UPDATE → the route's `if (error)` path emitted 500. PR1's `updateUser` adapter uses `.maybeSingle()` and returns `null` on no-row. To keep PR2 a pure no-behaviour-change re-point, the re-pointed route maps that `null` to the SAME 500 (`app/api/admin/users/[id]/route.ts` PATCH handler). Pinned by `tests/integration/admin-users.test.ts` ("PATCH missing-id returns 500").
- **Fix shape:** change the `null` branch to `404 { error: 'User not found' }` (semantically correct) — a deliberate status-code change (500→404) that belongs in its own small unit, not a re-pointing PR. Update the integration pin from 500 to 404 at the same time, and check the admin UI handles a 404 from the toggle/reset/secondary-role flows.
- **Priority:** LOW (error path only; missing-id PATCH is not a live happy path).
- **Status:** open. **See F-TD-29** — F-16 PR2 made the *opposite* call for the cash PATCH routes (fixed them to 404 inline); F-TD-29 tracks the resulting app-wide inconsistency and recommends finishing this one as part of a uniform sweep.

### F-TD-29 — App-wide consistency sweep: PATCH-by-id missing-id should return 404, not 500

- **Logged:** 2026-06-20 (F-16 PR2, D2 ruling). **Hakan asked for this to be tracked + fixed app-wide.**
- **What:** the `.single()`→`.maybeSingle()` re-point pattern surfaced a status-code question on every "edit/lock a record by id" PATCH route: when the id doesn't exist, the historical `.single()` code errored (PostgREST `PGRST116`) and the route's `if (error)` path returned **500**, when the semantically-correct answer is **404 (not found)**. This only fires on a missing id (concurrent delete / stale tab / a hand-made API call) — never on the normal UI happy path, since the id always comes from a list the screen just loaded.
- **Current inconsistency (the reason to sweep):**
  - **Cash PATCH routes — FIXED to 404 in F-16 PR2** (`app/api/cash/month/[id]` lock, `app/api/cash/entry/[id]` edit, `app/api/cash/cheques/[id]` edit): missing id now returns `404 { error: '<resource> not found' }`. Pinned by the F-16 PR2 integration suite.
  - **Users PATCH route — STILL 500** (`app/api/admin/users/[id]`, **F-TD-20**): deliberately kept at 500 to stay byte-identical in the F-13 PR2 re-point; pinned at 500 by `tests/integration/admin-users.test.ts`.
  - **Others unaudited:** any remaining `PATCH /[id]` route across orders/pricing/haccp/etc. that still uses the old `.single()`-error→500 shape.
- **Fix shape:** one small sweep unit — grep every `app/api/**/[id]/route.ts` PATCH handler for the missing-id branch, make them all return 404, update the pinned tests (incl. flipping F-TD-20's users pin from 500→404 and **closing F-TD-20** as part of this), and spot-check each consuming UI handles a 404 gracefully. Pure error-path status alignment, no happy-path change.
- **Priority:** LOW (error path only; never a live happy path) — but Hakan wants the app uniform, so schedule it as its own small unit rather than someday-maybe.
- **Status:** open (supersedes/absorbs F-TD-20).

### F-TD-30 — 🔴 URGENT: Cash + cheque operations write NO audit-trail entry (no who-changed-what on money)

- **Logged:** 2026-06-20 (surfaced during F-16 PR2 prod manual smoke; **Hakan flagged URGENT**).
- **What:** create / edit / delete of a **cash entry**, plus **cheque** bank/edit/delete and **month lock/unlock**, write **nothing** to `public.audit_log`. Confirmed by read-only prod query (ref `uqgecljspgtevoylwkep`) on 2026-06-20: `audit_log` only ever records the `screen` enum values `screen1` / `screen2` / `screen3` (none of them cash; most-recent row 2026-06-16). Hakan's own smoke (create £0.01 → edit £0.02 → delete) left **zero** trace — the delete was clean (good), but there is no who/when/what history of any of it. Same accountability theme as **F-TD-27** (pricing edits write no audit entry) — cash has the identical hole.
- **Why URGENT:** this is the **money-handling** surface (cash book + cheque register). With no audit trail, an entry can be created, altered, or deleted with no record of who did it or when — no accountability on financial data. (Orders DO log — the gap is cash/cheque/pricing specifically.)
- **NOT introduced by F-16 PR2:** pre-existing — the original raw-Supabase cash routes never logged either, and PR2 was byte-identical, so it changed nothing here. PR2 only made it *visible*.
- **Fix shape:** append to `audit_log` on every cash mutation — cash entry create/edit/delete, cheque create/bank/edit/delete, month create/lock/unlock. The routes already resolve `{ userId, role }` (PR1/PR2 design) so the app-layer append is cheap and has the actor in hand; alternatively a DB trigger reading the `app.current_user_id` GUC (the orders pattern). Needs a new `screen` enum value (e.g. `cash`) or a documented mapping — check how `screen3` (the live one) is written and mirror it. Write a `summary` per action (e.g. `"+£0.01 expense"`, `"edited £0.01→£0.02"`, `"deleted entry"`). Pin with integration tests asserting an `audit_log` row per mutation. **Consider doing F-TD-27 (pricing) in the same unit** — identical mechanism, shared enum/trigger work.
- **Priority:** **HIGH / urgent** (financial accountability gap on live money data; Hakan's explicit flag).
- **Status:** open — schedule near-term (own unit, or paired as the **audit-trail trio: F-TD-27 (pricing) · F-TD-30 (cash, this) · F-TD-31 (owned `AuditLog` port)** — same enum/trigger/port mechanism, design once).

### F-TD-22 — `users.name` uniqueness guard (case-insensitive) — ✅ SHIPPED 2026-06-16 (PR #46, `1f46857`)

- **Logged:** 2026-06-16 (F-13 PR3 Guard, 🟡 W1). **Hakan explicitly wants this enforced** — not a someday-maybe.
- **What:** there is no uniqueness constraint on `users.name` and no app-level guard on user creation, while the login lookup is case-insensitive (`.ilike("name", …)`). So `"Hakan"` and `"hakan"` (or two identical names) can coexist. PR3 surfaced this as a behaviour delta: the old `.single()` returned `401 Invalid credentials` (+ `recordFailure`) on a duplicate-name lookup; the new adapter `.maybeSingle()` errors on >1 row → route returns `500 'Database error'` and `recordFailure` does NOT fire. Operator-error edge, accepted for PR3.
- **Fix shape (own small FORGE unit, needs a migration):**
  1. **Dedup FIRST** — a unique index FAILS to create if duplicate names already exist in prod, so pre-flight: query prod for any case-insensitive name collisions and resolve them before applying.
  2. Add a **`UNIQUE` index on `lower(name)`** (catches case variants, matching the `.ilike` lookup) — NOT a plain unique on `name`.
  3. Add an app-level guard (clear error) on user create/rename so the DB error surfaces as a friendly 4xx, not a 500.
  4. Decide whether the login duplicate-name 500 path is then unreachable (it should be) and simplify if so.
- **Priority:** MEDIUM (data-integrity + closes the PR3 W1 edge). **Owner unit:** dedicated, scheduled after F-13 (alongside / before F-RLS-04b).
- **Shipped as:** UNIQUE index on `lower(name)` (migration `20260616120000_unique_username_lower_index`, covers all rows active+inactive); both adapters trim name on write + map Postgres `23505` → app-owned `ConflictError`; `POST /api/admin/users` → 409 "A user with that name already exists." Verify-first prod dedup found **0** collisions (11 users, 11 distinct). The login duplicate-name 500/W1 path is now unreachable (names are unique) — login adapter/route needed NO change. Cert `docs/anvil/2026-06-16-f-td-22-unique-usernames-cert.md`; review `docs/reviews/2026-06-16-f-td-22-unique-usernames-review.md`; plan archived. Renames are not possible via the API, so create was the only entry point guarded.
- **Status:** ✅ DONE — shipped 2026-06-16, prod-healthy (preview 8/8 @critical · prod smoke 5/5 non-500 · ANVIL CLEARED unit 1722 / int 175 / pgTAP 66/66).

### F-TD-21 — `/api/auth/login` discloses an inactive account before checking the credential

- **Logged:** 2026-06-16 (F-13 PR3 plan §8.6 / Guard — pre-existing, byte-identical preserved).
- **What:** login returns `403 Account is inactive` *before* verifying the password/PIN, so a wrong credential against a known-inactive account still reveals that the account exists and is disabled — a mild account-enumeration signal. Not introduced by PR3 (the re-point preserved it exactly).
- **Fix shape:** move the active-check to AFTER credential verification (or return a uniform `401` for inactive+wrong-credential) so an attacker can't distinguish "inactive" from "wrong credential". Small, route-local; pair it with a test asserting the timing/response is indistinguishable.
- **Priority:** LOW (mild enumeration; requires knowing a real inactive username).
- **Status:** open.

### F-TD-16 — Two 🔵 residuals from the F-TD-09 Guard review (cron auth + comment accuracy)

- **Deferred:** 2026-06-14 (F-TD-09 Guard, both non-blocking 🔵)
- **What:** (a) **CRON_SECRET-unset hardening** — both cron routes (`app/api/cron/purge-idempotency-keys/route.ts:17` and the pre-existing `app/api/cron/haccp-alarm/route.ts:66`) compare `Authorization` to `Bearer ${process.env.CRON_SECRET}`; if `CRON_SECRET` were ever unset, the literal `"Bearer undefined"` would authenticate. Vercel injects the secret in all envs so it's latent, not live — but an early-return 500 on `!process.env.CRON_SECRET` would fail closed regardless. (b) **W1 comment accuracy** — `lib/adapters/supabase/OrdersRepository.ts:395-398` comment says the guard deletes "against the same instant the row was read at"; the captured `now` is actually taken *before* the read (conservative clock — behaviour is correct, the wording oversells). Reword.
- **Why deferred:** both non-blocking nits surfaced at F-TD-09 Guard; not worth re-opening the shipped PR.
- **Detail:** `docs/reviews/2026-06-14-f-td-09-idempotency-key-hygiene-review.md` (🔵 findings)
- **Owner unit:** unscheduled (tiny — fold into any future Orders/cron touch)
- **Status:** open

### F-TD-17 — WebKit E2E flakiness on 2 `@critical` specs (harness, not app)

- **Deferred:** 2026-06-14 (F-TD-04 ANVIL, 🟡 non-blocking)
- **What:** On the **Mobile Safari / WebKit** Playwright project only, `01-order-place.spec.ts:38` and `02-picking-list-print.spec.ts:25` flake/fail (timing/locator), while passing clean on chromium. Error-context snapshots show the app fully rendered — a WebKit navigation/timing wobble, not a server error.
- **Why deferred:** provably pre-existing and unrelated to F-TD-04 (that PR touched no spec/config/env; same flows green on chromium). Not worth gating a clean refactor.
- **Fix idea:** add `retries` for the WebKit project in the Playwright config, or `test.fixme('@flaky …')`/`@flaky`-tag the two assertions. Also: the WebKit binary was missing locally and installed mid-run — cold dev-server + WebKit timing likely contributes.
- **Detail:** `docs/anvil/2026-06-14-f-td-04-lazy-supabase-client-cert.md` (Warnings section)
- **Owner unit:** unscheduled (E2E-harness hygiene)
- **Status:** open

---

## Infrastructure follow-ups (F-INFRA-)

### F-INFRA-03 — Run the preview smoke in CI (GitHub Actions)  ✅ SHIPPED (2026-06-27)

- **Deferred:** 2026-06-10 (during F-INFRA-02)
- **What:** The Gate-4 preview smoke was conductor-run from a local machine (`npm run test:e2e:preview -- <preview-url>`). Now runs in CI (GitHub Actions) on every PR automatically. The 13 `E2E_*` test-login secrets moved to repo secrets; `.github/workflows/` was previously near-empty (only `preview-cred-sync.yml`).
- **Why deferred:** Gate-1 lock for F-INFRA-02 explicitly scoped the smoke as FORGE-run with no CI.
- **Detail:** `docs/plans/2026-06-10-f-infra-02-preview-smoke-plumbing.md` + ADR-0006
- **Shipped:** new `.github/workflows/preview-smoke.yml` — a fail-closed BLOCKING required check on `main` (the `smoke` job). Discovers the PR's READY preview via the Vercel API (reusing `VERCEL_API_TOKEN` + the public project/team ids from `preview-cred-sync.mjs`), builds the `git-<branch>` alias, polls `/api/auth/team`=200 on a finite 12-min budget (the cred-wired second deploy is the only one that 200s there), then runs `npm run test:e2e:preview -- <url> --unprotected`. Pinned by `tests/unit/ci/preview-smoke-workflow.test.ts` (8 invariants, raw-text — no yaml-parser dep). Mirrors `preview-cred-sync.yml` house style; CI/config/test/docs only — no app code, no new runtime dep, no migration, no RLS. 13 `E2E_*` repo secrets provisioned; `VERCEL_API_TOKEN` reused. Plan `docs/plans/2026-06-27-f-infra-03-preview-smoke-ci.md`.
- **Owner unit:** F-INFRA-03
- **Status:** ✅ **SHIPPED 2026-06-27** (PR #91 / `65f3970`) — BLOCKING required check `smoke` on `main` (branch protection created fresh, admin-override retained). FORGE caught + fixed 2 bugs (Node ESM-syntax + 82-char constructed host); live @critical 75/75. 12 `E2E_*` secrets provisioned (`E2E_PIN_ADMIN` n/a by design — uses USER+PASSWORD). Note: shipped invariant count is 10 (not 8 — +2 from the bug fixes); discover reads Vercel `branchAlias`, does not construct the alias.

### F-INFRA-04 — Re-enable Vercel Deployment Protection (+ automation bypass) after the re-architecture

- **Deferred:** 2026-06-10 (during F-INFRA-02)
- **What:** Deployment Protection is disabled entirely on the Vercel project because Hakan's plan exposed no usable Protection Bypass for Automation; previews are publicly URL-reachable (low risk: post-F-INFRA-02 previews hold only ANVIL-TEST dummy data). The preview smoke runs with the `--unprotected` flag in the meantime.
- **Goal:** when the migration completes (or if previews ever carry sensitive data), re-enable protection, generate the bypass secret into `.env.e2e.local` as `VERCEL_AUTOMATION_BYPASS_SECRET`, and drop the `--unprotected` flag from the Gate-4 runbook invocation.
- **Precise change when this lands (post F-INFRA-03):** drop `--unprotected` from the single run line in `.github/workflows/preview-smoke.yml` (the "Run @critical preview smoke" step) AND provision the `VERCEL_AUTOMATION_BYPASS_SECRET` repo secret + add it to that step's `env:` block. Also drop `--unprotected` from the manual command in `docs/runbooks/preview-smoke.md`. Note: `tests/unit/ci/preview-smoke-workflow.test.ts` asserts `--unprotected` is PRESENT, so that test must be updated in the same change.
- **Detail:** `docs/runbooks/preview-smoke.md` "Two modes" + ADR-0006 addendum
- **Owner unit:** unscheduled (post-migration ops)
- **Status:** **DEFERRED by Hakan 2026-06-27 at sprint close** — protection STAYS OFF until he resumes coding (~late July 2026, ~1 month out). No change this sprint: `--unprotected` remains everywhere, the `tests/unit/ci/preview-smoke-workflow.test.ts` assertion stays asserting PRESENT, and the standing "[[project_vercel_protection_disabled]]" reminder persists. Re-open and execute the precise change above when coding resumes / if previews ever carry sensitive data.

### F-INFRA-05 — Supabase→Vercel preview-branch credential sync  ✅ SHIPPED (2026-06-15, PR #41 / `472d3f5`)

- **Surfaced:** 2026-06-14 (during F-RLS-03 ANVIL Lock, PR #38)
- **What:** The Supabase↔Vercel integration shows **connected on both sides** but injects **no** Supabase credentials into the Vercel **Preview** scope. A preview deploy therefore has zero DB creds (all prod Supabase vars are correctly Production-only per ADR-0006), so `createClient` throws and every route 500s; the Gate-4 preview smoke fails closed at the DB-identity probe. **Ruled out:** the timing race (deploy built before the Supabase branch existed) — a clean redeploy *after* the branch was healthy still 500'd. So the integration's preview env-var sync is genuinely not running/writing.
- **Stopgap used on F-RLS-03:** manual env bridge — added the PR branch's own keys (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) to Vercel Preview scope, restricted to the git branch (branch keys, never prod). Smoke then went 8/8. This is a **per-PR manual chore** — not sustainable.
- **Why it must be fixed before F-RLS-04a:** F-RLS-04a flips real Orders routes onto the authenticated client (NOT inert) and genuinely needs a working preview smoke to prove RLS doesn't break Orders. Also: F-RLS-04a needs `SUPABASE_JWT_SECRET` on preview, which a working integration would sync automatically (the prod set includes it).
- **Investigate:** Supabase dashboard → Integrations → Vercel sync config (only Preview + `NEXT_PUBLIC_` prefix was observed enabled — confirm which vars/scopes actually sync, incl. the server-only `SUPABASE_SERVICE_ROLE_KEY`); consider re-install/re-authorize of the integration; confirm whether it writes project-level Preview env vars or per-deployment injection.
- **Detail:** ADR-0006 (per-PR preview branches), `docs/runbooks/preview-smoke.md`, cert `docs/anvil/2026-06-14-f-rls-03-authenticated-db-client-cert.md` (E2E section)
- **Owner unit:** F-INFRA-05 — **schedule before F-RLS-04a (Day 4)**
- **Fix shipping:** an owned GitHub Action now does the sync automatically — `.github/workflows/preview-cred-sync.yml` + `scripts/preview-cred-sync*` (pure core + injected Supabase/Vercel I/O clients), runbook `docs/runbooks/preview-cred-sync.md`, plan `docs/plans/2026-06-15-f-infra-05-preview-cred-sync.md`. Writes the 4 branch-scoped Preview vars idempotently on PR open/sync/reopen + conditional redeploy, deletes them on PR close. Manual env bridge retired. Zero new deps.
- **Status:** ✅ **SHIPPED 2026-06-15** (PR #41 / `472d3f5`; supersedes closed #39). Live acceptance proven on PR #41's fresh 14-digit preview branch (`imrobmcrjicmrgxawlza`, run `27555331185`): branch-health poll → 3 Preview-scoped branch-scoped creds synced (redacted) → JWT warn-and-continue → redeploy fired → Vercel `dpl_G1g6…` came up `READY` as **Preview** (not prod). Took 3 live runs (HTTP-400 redeploy bug → fixed; eu-west-2 outage timeout → external; green on #41 after rebasing onto F-TD-15's 14-digit migrations + fresh-provisioning). Cert `docs/anvil/2026-06-15-f-infra-05-preview-cred-sync-cert.md`; review `docs/reviews/2026-06-15-f-infra-05-preview-cred-sync-review.md`. CI tooling only — no app code, no deps, no migration.
  - **⚠️ Residual → F-RLS-04a (NOT solved here):** the Supabase **Management API does NOT return `SUPABASE_JWT_SECRET`** for a branch (asymmetric-key migration), so F-RLS-04a's preview-JWT need must be sourced another way (mechanism undecided). The 3-key path + loud warning is the defined fallback.
  - **🔵 follow-up:** confirm the `closed`-event cleanup fully deletes the branch-scoped Preview vars (run #41 showed `created:0, updated:3` → the #39-close cleanup left vars that #41 overwrote; benign, idempotent).

### F-INFRA-06 — `test:e2e:preview` fails closed on missing bypass secret even though protection is OFF

- **Surfaced:** 2026-06-26 (F-20 PR2 Gate-4 ship)
- **What:** `npm run test:e2e:preview -- <preview-url>` (`scripts/e2e-preview.mjs`) aborts immediately with `bypass secret missing — set VERCEL_AUTOMATION_BYPASS_SECRET in .env.e2e.local; the smoke fails closed without it` and **exits 0** (silent skip — no `@critical` spec runs). But Deployment Protection has been OFF since F-INFRA-02 (see [[F-INFRA-04]]), so the preview is publicly URL-reachable with no secret needed — the `--unprotected` mode the runbook documents (`docs/runbooks/preview-smoke.md` "Two modes") is NOT wired into the npm script, so the Gate-4 scripted smoke cannot run locally until either the secret is set (F-INFRA-04) or `--unprotected` is plumbed through.
- **✅ STANDING WORKAROUND (use every time until this is fixed): always run `npm run test:e2e:preview -- <preview-url> --unprotected`.** The `--unprotected` flag IS honoured and works — it skips the bypass-secret check (correct, since protection is OFF since F-INFRA-02) and runs the full suite. The bug is only that the flag is not the DEFAULT, so the bare invocation in muscle-memory/CI fails closed. Do NOT substitute a curl smoke; do NOT set a bypass secret. This is in CLAUDE.md "Local test infrastructure" + the runbook §1a/§3.
- **Two real defects to fix:** (1) `--unprotected` should be the default behaviour when Deployment Protection is off (auto-detect, or invert the flag), so omitting it can't silently skip the gate; (2) the fail-closed branch **exits 0** — a false green that reads as a pass in CI/automation (must exit non-zero).
- **Also document/fix the readiness race (bit F-20 PR2):** the first preview deploy goes green BEFORE F-INFRA-05's cred-sync redeploy wires the Supabase creds → the DB-identity probe (check 2) 500s on `/api/auth/team`. Poll `/api/auth/team` until 200 (NOT `/login`, which 200s on the pre-cred-sync deploy) before running. Now in the runbook §1 + Troubleshooting.
- **Stopgap used on F-20 PR2 (and how it was closed):** conductor wrongly substituted a curl reachability+guard smoke at ship (`/login` 200, 5 routes 307, no 5xx); ANVIL had already proven the authenticated paths + 404 + shapes on a real local DB (integration 14/14). **Gate closed post-ship 2026-06-26:** throwaway verify branch/PR #82 (never merged, identical to shipped `1bb447d`) → isolated preview + Supabase branch → `--unprotected` → **75/75 @critical PASSED**. NOT a substitute on UI/RLS PRs — run `--unprotected` at ship, don't substitute curl.
- **Fix shape:** make `--unprotected` auto-engage when protection is off (the script can check, or read a project flag), make the fail-closed branch exit non-zero, and surface the readiness wait. Interacts with [[F-INFRA-03]] (CI smoke) and [[F-INFRA-04]] (re-enable protection + bypass — when that lands, this whole gap closes the other way).
- **Owner unit:** F-INFRA-06 (unscheduled — bites every FORGE Gate-4 preview smoke until fixed; workaround above neutralises it in the meantime)
- **Status:** open

### F-INFRA-07 — CI `@critical` smoke is non-idempotent across a 2nd push to the same PR

- **Surfaced:** 2026-06-27 (closing-audit seal, PR #92)
- **What:** The `smoke` workflow re-runs on every push to a PR, but a PR has ONE Supabase preview branch shared across all its commits (per F-INFRA-05). The branch only re-seeds when migrations change. So a 2nd (or later) push that does NOT change migrations runs `@critical` against a DB **already written to by the first run** — and the HACCP once-per-period submit flows fail because today's daily checks / this week's review are already submitted. **Observed live:** run 1 on PR #92 (fresh branch) = **75/75**; run 2 on the next push (same branch, dirty DB, byte-identical bundle) = **70 passed / 4 failed / 1 flaky** — the 4 failures all HACCP "submit successfully" specs (`13-haccp-cold-storage` deviation, `16-haccp-process-room` temps + diary, `25-haccp-reviews` weekly). NOT a code regression.
- **Workaround used to seal PR #92:** reset the PR's Supabase preview branch (MCP `reset_branch` on the branch id from `list_branches`) → wait `ACTIVE_HEALTHY` → `gh run rerun <smoke-run-id>` → clean **75/75** on the same head commit. No gate-bypass.
- **Impact:** ANY real feature PR with ≥2 pushes and no migration change will hit a red `smoke` on the later push(es) → blocks merge with a false-red until someone resets the branch. Latent landmine for the parallel UI branch and all future multi-push PRs.
- **Fix shape (pick one):** (a) workflow resets/reseeds the preview branch before each smoke run (cleanest — every run starts fresh); or (b) make the HACCP @critical specs idempotent / data-scoped per run (e.g. unique-per-run dates so once-per-period never collides); or (c) tear down + recreate the preview branch on each push. Option (a) is the smallest blast radius. Interacts with [[F-INFRA-03]] (the CI smoke itself) and [[F-INFRA-06]].
- **Owner unit:** unscheduled (bites every multi-push PR until fixed; the reset-branch workaround neutralises it manually in the meantime)
- **Status:** open

---

## RLS track follow-ups (F-RLS-)

### F-RLS-04a-print-guard — Enforce order-stage transition integrity (print-before-complete) for ALL roles

- **Logged:** 2026-06-15 (F-RLS-04a Guard delta re-review; conductor+Hakan accepted the gap as low-severity)
- **What:** the Orders UPDATE policies gate by role + pre-image state, but Postgres OR's permissive policies independently on USING (row visibility) and WITH CHECK (new row). Result: a role that can *see* a `placed` row for UPDATE can drive it straight to `completed` (skip print), because `orders_update_printed`'s WITH CHECK accepts `completed`. Confirmed live for **warehouse** (newly, via F-RLS-04a's `orders_print_placed`) AND pre-existing for **office/admin** (already in `orders_update_placed` + the loose printed WITH CHECK).
- **Severity:** LOW — workflow/state-machine looseness, NOT authorization or data exposure. Not reachable through app code (the app only does placed→printed→completed); requires a hand-crafted authenticated DB call with a valid session. Warehouse completing orders is legitimate; only the *skip-print* shortcut is at issue.
- **Fix:** restructure the order-stage UPDATE policies so each transition pins its pre-image — e.g. split `orders_update_printed` into an explicit `printed→completed` policy with `USING state='printed'` so a `placed` row can never satisfy the completed path. Do it **uniformly for all roles** (warehouse, office, admin) in one migration — NOT bolted onto one role. Add regression tests: each role can only advance one stage at a time.
- **Why deferred from F-RLS-04a:** doing it there meant restructuring a pre-existing policy + retesting office/admin completion flows = scope creep on a clean cutover. Better as a focused state-machine-integrity unit.

### F-RLS-04b-is-admin-guard — Harden `is_admin()` against an empty-string GUC (project-wide)

- **Logged:** 2026-06-17 (F-RLS-04b Render; implementer discovery, conductor ruling Option 1)
- **What:** `is_admin()` (baseline `20260101000000_baseline.sql` lines ~177-187) casts `current_setting('app.current_user_id', true)::uuid` with a COALESCE *around the subquery* but **no `nullif(...,'')` guard on the cast itself**. On a blank-identity request — which the GUC bridge (`20260614210221_db_pre_request_guc_bridge.sql` line 72) deliberately produces as the empty string `''` on its fail-closed/anon path — the cast throws `22P02 invalid input syntax for type uuid: ""` instead of returning `false`. So any `is_admin()`-gated policy **errors (→ 500)** on a blank keycard rather than cleanly denying (`42501`).
- **Severity:** LOW-MED — fail-*to-500*, not fail-open. No data exposure (the write still doesn't happen), but it contradicts the bridge's stated "empty GUC = deny" invariant and turns a clean 403/deny into a 500.
- **CORRECTION (verified at F-RLS-04b Guard, 2026-06-17):** the inline `nullif(...)::uuid` predicate F-RLS-04b's write policies use does **NOT** actually dodge the 22P02 on an empty GUC. Its `EXISTS (SELECT 1 FROM public.users …)` admin-check subquery scans `public.users`, which invokes the pre-existing `users_select` read policy whose own `::uuid` cast is unguarded — so an empty-GUC write still throws 22P02 (via `users_select`, not the inline predicate). `is_admin()` (SECURITY DEFINER) bypasses `users_select` but has its own unguarded cast, so it throws too. Both forms are **fail-closed** (no row written) — neither is "cleaner" for the empty-GUC edge. F-RLS-04b chose the inline form for **consistency with the shipped Orders policies**, not to avoid 22P02. The real clean-deny fix = guard `users_select`'s cast (and `is_admin()`'s), which is what this item covers. The edge is unreachable on the 4 authenticated admin routes (always a valid token) so nothing ships broken.
- **Fix:** add the `nullif(current_setting('app.current_user_id', true), '')::uuid` guard in BOTH places that cast the GUC: inside `is_admin()` itself AND in the `users_select` policy's inline `id = (...)::uuid` branch (the latter is what makes F-RLS-04b's write policies throw, since their admin-check subquery scans `users`). One migration redefining the function + replacing `users_select`; add a pgTAP regression: empty GUC → `is_admin()` returns `false` and a users write denies with `42501` (not `22P02`).
- **Why deferred from F-RLS-04b:** `is_admin()` is shared across users/customers/products read policies — changing it there is a broader blast radius than a clean Users write cutover. F-RLS-04b stayed in-scope by mirroring the F-RLS-04a inline predicate (proven correct) instead. This item fixes the shared helper once, separately.
- **UPDATE 2026-06-18 (F-RLS-04c):** the edge now also affects the **Routes reads**. The new `routes_select` / `route_stops_select` policies (`20260618120000_routes_authenticated_rls_policies.sql`) use the same inline `EXISTS(SELECT 1 FROM users …)` predicate, whose subquery scans `users` → invokes `users_select` (unguarded cast) → throws 22P02 on an empty GUC. Same fail-closed, same unreachable-on-real-routes (always a valid token). **Useful new asset:** F-RLS-04c introduced `public.current_user_is_valid()` (migration `20260618130000`) — a `STABLE SECURITY DEFINER` helper with the `nullif(...,'')::uuid` guard already in place and a pinned `search_path`. It cleanly returns `false` on an empty GUC. **The eventual fix should standardize the whole family on this helper:** guard `users_select`'s cast (the throwing culprit) AND optionally re-point the inline route/order/users predicates at `current_user_is_valid()` so there's ONE guarded definer check instead of N unguarded inline casts. That collapses this item's scope to "fix `users_select` + adopt the existing helper."
- **UPDATE 2026-06-27 (F-RLS-04i):** the **admin context** (customers/products/import/map/insights routes) is now ALSO on the authenticated client, so an empty-GUC request to any `is_admin()`-gated write or any `visits_select`/`users_select` cast on these routes hits the same 22P02 edge. **Still unreachable on every real route** — all are behind middleware + `requireRole(['admin'])`, so a valid token (non-empty GUC) is guaranteed before the DB is touched; F-RLS-04i's pgTAP 016 explicitly proved the empty-GUC path fail-closes (deny, no row written) and the `customers_select`/`products_select` reads use a string `<> ''` comparison (no cast) so they deny cleanly. Net: blast radius widened again but nothing ships broken. **Strong candidate to fold into Day-16 F-RLS-final** (which already touches the service-role retirement + the shared admin helpers) — do the `users_select`-cast guard + `current_user_is_valid()` standardization there in one migration.

### F-RLS-04a-create — Cut `POST /api/orders` (create) onto RLS (deferred from F-RLS-04a)

- **Logged:** 2026-06-15 (F-RLS-04a Gate 2)
- **What:** order creation stays on the service-role client in F-RLS-04a because it's atomically coupled to `order_idempotency_keys` (RLS-on, deny-all, no policy — kept service-role). You can't split one transaction across the authenticated + service-role clients.
- **Fix options:** give `order_idempotency_keys` a policy so the whole create flow can run on the authenticated client, OR redesign the idempotency write so the order insert (authenticated) and the key write (service-role) aren't in one transaction. Needs design.
- **Note:** until done, Orders expand-contract steps 5–6 (remove the service-role fallback) cannot fully complete (create + KDS still need it).

### F-RLS-04a-kds — Cut the KDS routes onto RLS (carved out of F-RLS-04a)

- **Carved:** 2026-06-15 (F-RLS-04a FORGE Frame / grill)
- **What:** F-RLS-04a flips only the **front-door** Orders routes (`/api/orders`, `/api/orders/[id]`, `/api/orders/[id]/picking-list`) onto the authenticated DB client. The **KDS routes** — `/api/kds/orders` (public kiosk read) and `/api/kds/lines/[lineId]/done` (line-done write) — were carved out: they use a **side-door identity** (public at middleware; the worker's `butcher_id` arrives in the request body and is validated via the Users port, NOT the standard `mfs_session` / `x-mfs-user-*` headers). The session-minted authenticated client can't feed them without a different identity bridge.
- **Work needed:** thread the validated `butcher_id` into `app.current_user_id` for the KDS path (set the GUC on the request, or mint a token from the validated butcher) so KDS reads/writes can run on the authenticated client under the existing `orders`/`order_lines` policies. Decide the KDS read model too (a public kiosk read with no user → the GUC policy would deny; may need to keep the read on service-role or define a kiosk policy).
- **Also closes — KDS audit-attribution gap:** because KDS line-done stays service-role with no session GUC, KDS "done" taps currently record a **NULL user** in `order_audit_log` (the busiest Orders mutation). Cutting KDS over fixes attribution.
- **⚠️ Blocks Orders cleanup:** until this lands, F-RLS-04a expand-contract **steps 5–6 (remove the Orders service-role fallback)** cannot fully complete — the KDS path still needs service-role.
- **Schedule:** after F-RLS-04a proves out in prod. Tracked in the roadmap under Day-4's F-RLS-04a block.

### F-RLS-04g-create — Cut `POST /api/screen3/sync` (create-visit) onto RLS (deferred from F-RLS-04g)

- **Logged:** 2026-06-22 (F-RLS-04g Gate 2)
- **What:** the create-visit path stays on the service-role (master-key) client in F-RLS-04g — exactly as Orders' create stayed master-key in F-RLS-04a. `POST /api/screen3/sync` creates the `visits` row AND writes `audit_log` AND touches `customers` via raw REST in one flow, so it was left on the master key this copy. The 7 read + own-mutate handlers were flipped; create was not.
- **Fix:** flip the create flow to `visitsServiceForCaller` (the `visits_insert` baseline policy `WITH CHECK (user_id = GUC)` already encodes "create only as yourself"), and decide master-key-vs-authenticated for the raw `audit_log` write — likely paired with the **audit-trail trio** (F-TD-27 / F-TD-30 / F-TD-31), since the raw audit write is the same mechanism deferred in F-RLS-04f (see the Post-F-RLS-04f note under F-TD-31). Needs design alongside the audit-log master-key cleanup.
- **Note:** until done, Visits cannot fully complete expand-contract step "remove the service-role fallback" — create still needs the singleton parachute (`visitsService`).

### F-RLS-04g-thin-route-filters — Thin/remove the route-level visit owner filters now RLS enforces ownership (debt from F-RLS-04g)

- **Logged:** 2026-06-22 (F-RLS-04g Gate 2)
- **What:** the flipped visit routes still filter by owner in the route layer (`verifyVisitOwnership`) even though the DB now enforces owner-scoping via RLS. Kept as belt-and-braces (two locks on the same door) this copy. (W1, shipped in `b47d212`, already removed the `office`-as-manager branch on the notes route — `isManager = role === 'admin'` only — so office now gets a clean 404 there; this item is about thinning the remaining `verifyVisitOwnership` checks.)
- **Fix:** thin or remove the route-level owner filtering once RLS is proven in prod, so ownership has a single source of truth (the DB). Low risk, no migration. Pair with a route-test sweep to confirm the 404/empty behaviour is preserved by RLS alone.

### F-RLS-04g-empty-guard — Align the `visits` baseline RLS policies to the `nullif(...)::uuid` empty-guard (🔵 from F-RLS-04g Guard)

- **Logged:** 2026-06-22 (F-RLS-04g Guard review)
- **What:** the `visits` (and the new `visit_notes`) policies are the only RLS in the repo that cast `current_setting('app.current_user_id', true)::uuid` WITHOUT the `nullif(..., '')` empty-guard every other policy uses (cf. `20260618130000`, `20260618120000`, `20260617130001`). So an empty GUC THROWS `22P02` (fail-closed-by-throw) instead of returning empty. Safe today — the live path never sends an empty GUC (routes 401 without a userId) — but it is a latent inconsistency: a future route flipped onto these policies without a 401 guard, or a GUC-bridge bug, would surface as a 22P02 → 500 instead of a clean empty result.
- **Fix:** when the dormant `visits` baseline policies are next legitimately touched, wrap the cast in `nullif(current_setting('app.current_user_id', true), '')::uuid` to match the rest of the repo (clean-deny on empty GUC). NOT done in F-RLS-04g by design (guardrail #5: don't rewrite the live `visits` policies during the cutover). Low risk, additive.

---

## Product features (F-PROD-)

### F-PROD-01 — HACCP Allergen Assessment version history UI

- **Deferred:** before 2026-06-09
- **What:** `haccp_allergen_assessment` table stores each save as a new row (audit trail exists in DB) but `/haccp/allergens` page only shows the latest. No UI to view past versions.
- **Fix shape:** same pattern as Food Fraud assessment.
- **Priority:** Medium — SALSA auditor may ask to see previous assessments.
- **F-19 Frame finding (2026-06-22):** confirmed the table is ALREADY append-only — every
  POST inserts a fresh row, full history kept, "latest" = newest by `assessed_at desc`. So the
  history feature is mostly a **display** job (read all rows, show the timeline) and needs NO
  schema change. ONE open product question: do you want an explicit **draft/published** state
  (would need `version` int + `status` enum added to the table)? If drafts aren't required this
  is pure read-side UI. Decision belongs to Cluster B Frame. Same append-only shape on
  food-defence/food-fraud.
- **Owner unit:** **F-19 Cluster B (PR3)** — rides the allergen/registers re-point. See roadmap
  Days 13–14 F-19 plan.
- **PR3 Frame decision (2026-06-23):** Hakan chose **display-only** — NO draft/published state, NO
  schema change. The version-history UI already exists on `/haccp/allergens` (clickable older
  assessments + "Update based on this" read-only detail), so the display job is effectively already
  shipped. Any future draft/publish workflow is its own separate PR if ever wanted.
- **Status:** done — resolved display-only (no schema change) at F-19 PR3 Frame; PR #70. Draft/publish
  deferred to its own future PR if requested.

### F-TD-35 — HACCP allergens empty-state create path is dead (same bug F-19 PR3 fixed on food-defence/food-fraud)

- **Deferred:** 2026-06-23 (found during F-19 PR3 ANVIL exhaustive browser-tap E2E)
- **What:** On `/haccp/allergens` with NO assessment yet, there is no in-UI way to create the first one
  — the edit form is only reachable via the "Update" button, which only renders once an assessment
  exists (`app/haccp/allergens/page.tsx:292`). Same class of bug as the food-defence/food-fraud
  empty-state "+ New version" dead button that F-19 PR3 fixed (PR #70, commit `96a6b33`).
- **Why NOT fixed in PR3:** Hakan scoped PR3's in-PR bug fix to food-defence + food-fraud only.
  Allergens' fix is heavier than those two: the food-defence/food-fraud EditForms were already
  null-safe (`useState(base?.field ?? …)`) so a blank `creating` path dropped in cleanly, but the
  allergens edit detail reads `editBase.assessed_at` without null-guards, so a create path needs
  null-safety work first. Spec 18 is green because the E2E seeds the first assessment via the
  admin-gated POST, so this is not blocking.
- **Fix shape:** add a `creating` flag + null-safe blank-base path on `/haccp/allergens` (mirror the
  product-specs `adding` pattern and the F-19 PR3 food-defence/food-fraud fix), then drop the
  seed-first workaround in `tests/e2e/18-haccp-allergens.spec.ts` for a real empty-create tap.
- **Priority:** Medium — only bites a brand-new/empty site; once one assessment exists the Update
  path works. Real for first-run UX.
- **Owner unit:** unscheduled (small standalone UI PR)
- **Status:** open

### F-TD-36 — 🔵 The public visitor kiosk and the staff "Visitor Log" tab diverge in 3 small ways (preserved byte-identical in F-19 PR4)

- **Deferred:** 2026-06-23 (surfaced by F-19 PR4 Cluster C planning/Guard — R2/R3/R4)
- **What:** `app/api/haccp/visitor/route.ts` (public kiosk, no-auth) and the `record_type:'visitor'`
  path of `app/api/haccp/people/route.ts` (staff "Visitor Log" tab) write the SAME
  `haccp_health_records` table but differ in three ways that exist in prod today:
  (1) **manager sign-off validation** — people uses `!manager_signed_by` (a whitespace-only name
  PASSES), kiosk uses `!manager_signed_by?.trim()` (whitespace FAILS → 400);
  (2) **`fit_for_work` source** — people derives it from `visitor_declaration_confirmed ?? false`,
  kiosk reads a separate `fit_for_work` body field;
  (3) **two distinct `todayUK()` bodies** — people uses `en-CA`, kiosk uses an `en-GB` split/reverse
  (same output normally; could differ on a TZ/locale edge).
- **Why NOT changed in PR4:** PR4 was a byte-identical hexagonal re-point. The shared
  `validateVisitor`/`buildVisitorHealthRecord` in `HaccpPeopleService` deliberately covers ONLY the 3
  truly-shared fields (visitor_name/company/reason); the divergences were kept at each route edge so
  no route's behaviour changed. Harmonising them is a PRODUCT decision (should the kiosk and the staff
  tab behave identically?), not a refactor.
- **Fix shape:** decide the intended single behaviour for each of the 3, then converge both routes
  (likely: trim the manager name everywhere; unify the `todayUK()` helper; pick one `fit_for_work`
  source). Small once the product call is made.
- **Priority:** Low — both paths work correctly today; the differences are edge-case only.
- **Owner unit:** unscheduled (small standalone PR; needs a product nod first)
- **Status:** open

### F-PROD-02 — KDS line-done undo with confirmation

- **Deferred:** 2026-06-09 (during F-06 session)
- **What:** Today if a kitchen operator taps "done" by accident, second tap is idempotent (no-op) — no way to UNDO. Hakan flagged: should the second tap show a confirmation modal "Are you sure you want to undo?" and revert the line?
- **Why deferred:** would re-litigate F-05's port shape (`markLineUndone` method) + new `audit_log` type + service rules ("can you undo a line on a completed order? No."). Not a migration concern; needs its own product+plan cycle.
- **Detail:** memory `project_hexagonal_migration_progress.md` "Tracked product features"
- **Priority:** Low-Medium — annoyance not a safety issue
- **Owner unit:** Day 7 (sprint roadmap)
- **Status:** ✅ SHIPPED 2026-06-17 (PR #49, squash `1a2ca3f`). Product session reversed the old "No undo on a completed order" lean — Hakan chose the **cascade**: undo IS allowed on a `completed` order and reverts it `completed→printed` atomically. Built hexagonal (`markLineUndone` port + `kds_undo_line` RPC), two additive migrations, prod smoke 0×5xx. The `line_undone` audit row carries **NULL user** (KDS service-role) — real attribution tracked in **F-RLS-04a-kds** (below), which now also covers the undo event. Cert `docs/anvil/2026-06-17-f-prod-02-kds-line-undo-cert.md`.

### F-PROD-03 — `/api/cron/haccp-alarm` is NOT registered in `vercel.json` (HACCP overdue alarm may never fire in prod)

- **Deferred:** 2026-06-26 (during F-25 Frame/Order — surfaced as risk R8).
- **What:** The HACCP overdue-alarm cron route (`app/api/cron/haccp-alarm/route.ts`) carries a header comment claiming an every-5-min schedule ("every-5-mins 8-16 every-day"), but `vercel.json` `crons` contains only `compute-road-times` + `purge-idempotency-keys`. The alarm job is **not scheduled** — so the push notifications that nag staff about overdue cold-storage / processing / diary / corrective-action checks likely never fire in production.
- **Why deferred:** OUTSIDE F-25's behaviour-preserving scope — F-25 re-points the route behind ports byte-identically and explicitly does NOT change whether the cron fires. Registering it is a real behaviour change (alarms would START firing to staff devices) needing its own verification + a Hakan confirm of intended live behaviour.
- **Decision needed:** confirm whether the HACCP alarm is *meant* to fire in prod. If yes → add the cron to `vercel.json` (one-line) + verify the VAPID env vars are set in prod + smoke that a real overdue state pushes. If no/deprecated → delete the route + its comment. Also note R8's sibling: `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT` must be present in prod env for any of this to work.
- **Priority:** Medium — a silent food-safety-nag gap if alarms are supposed to fire; harmless if the feature was shelved. Worth a quick confirm.
- **Owner unit:** unscheduled (F-PROD-03).

---

### F-PROD-04 — HACCP label printing (Sunmi V3 Android) regression + re-architecture — FIRST FEATURE after Day-16 sealing

- **Logged:** 2026-06-27 (Hakan, during F-RLS-final session — the priority feature once the re-architecture is sealed).
- **🟢 NOW ACTIVE — 2026-06-29:** all prerequisites cleared (sprint sealed; UI Phase 0 — 0a foundation + 0b component library — COMPLETE; repo/docs cleanup DONE, repo fully clean). **Framed this session** (no work started yet — Hakan deferred the direction decision to a fresh session after a checkpoint+clear). Frame findings: implementation is a Capacitor app whose Sunmi V3 native printing lives in `android/app/src/main/java/com/mfsglobal/ops/SunmiPrintBridge.java` (the `window.MFSSunmiPrint` bridge) + `MainActivity.java`; web side = `lib/printing/*` → `app/api/labels/route.ts` → `app/haccp/delivery/page.tsx` + `components/PrintLabelStrip.tsx`. **The work splits two ways (separable):** ① diagnose+fix the regression (leading suspect = auth-sprint collateral on the `/api/labels` x-mfs-user-role/service-role/session path — TRACE before blaming the printer; on-device confirm needs Hakan's physical Sunmi V3), ② re-architect behind a `Printer` port (the last Lego breach) as a fast-follow. **Direction (diagnose-first vs port-first vs both) = Hakan's call NEXT session.**
- **What (the breakage):** the HACCP label-printing flow on the Sunmi V3 Android device **worked** — Hakan installed the APK and printed labels — then **stopped working ~1 week later**. This is a REGRESSION to diagnose, NOT a greenfield build: most of the feature is already coded (Phase 1 complete per `docs/LABEL_PRINTING_PLAN.md`).
- **What already exists (don't rebuild):** Capacitor Android shell (`capacitor.config.ts` + real `android/` Gradle project); Sunmi V3 native printing via bridge `window.MFSSunmiPrint` (ADR-0001, added 2026-05-14); Phase-1 AirPrint in-app iframe print COMPLETE; ZPL templates ready for Phase-3 Zebra. Code: `lib/printing/{html,zpl,sunmi,types,index}.ts`; API `app/api/labels/route.ts`; UI `app/haccp/delivery/page.tsx` + `components/PrintLabelStrip.tsx`. Plan: `docs/LABEL_PRINTING_PLAN.md` (Phase 1 done; Phase 2 = buy TSC TE310 WiFi, ZERO code; Phase 3 = Zebra ZD421d + DS2278 scanner).
- **Leading hypothesis — collateral from the 16-day auth/RLS sprint.** Over 2026-06-12→27 auth changed hard: signed session cookies (T1, forced a one-time mass re-login), `x-mfs-user-role` header guards, tightened admin gates (F-RLS-04i added gates to routes that had none), RLS flips. `/api/labels` auths off `x-mfs-user-role` (roles warehouse|butcher|admin) and is a service-role route (Rule-A allow-listed in F-RLS-final's guard — it reads cross-entity data with the master key). "After a week" also fits a Capacitor/PWA stale-cached build, a session/token expiry, or APK signing. **DIAGNOSE on-device + trace the `/api/labels` auth path BEFORE assuming the printer bridge broke.**
- **Architecture gap (re-architect candidate):** `lib/printing/` is the **ONLY functional module NOT behind a port** — there is no `Printer` port (`lib/ports/` has only `PdfRenderer.ts`), and a UI page (`app/haccp/delivery/page.tsx`) imports the printing code DIRECTLY (the last UI→implementation breach of the Lego rule). If labels get expanded across devices (Sunmi + AirPrint + Zebra), wrap behind one owned `Printer` port + per-device adapters. If just fixing the regression, the port can be a fast-follow.
- **Sequence:** Hakan's call 2026-06-27 = SEAL FIRST (finish Day-16's F-TD-12 · F-INFRA-03 · F-INFRA-04 · closing audit), THEN this. This is the #1 feature target after sprint close. See memory `project_label_printing_next`.
- **Priority:** HIGH (Hakan wants the system operational ASAP) — but sequenced AFTER Day-16 sealing.
- **Owner unit:** unscheduled (its own FORGE pass after sprint close).
- **🔬 ROOT CAUSE FOUND — 2026-06-29 (3-trace read-only diagnosis: web/auth, native/Capacitor, business-logic):**
  - **The APK is a thin remote-URL shell** (`capacitor.config.ts:8` → `server.url: 'https://mfsops.com'`; `webDir: 'public'` holds no app). It loads the LIVE site every launch; native code unchanged since 2026-05-14. So "worked then broke ~1wk later" = the **website changed under the unchanged app**, NOT the printer bridge (which is wrapped in a catch-all that can't crash the app — `SunmiPrintBridge.java:104-106`).
  - **The regression = T1 signed-cookie cutover.** Commit `88af11d` (2026-06-12) made `middleware.ts:121-134` HMAC-verify `mfs_session` and **fail closed on legacy unsigned cookies**. The device's pre-T1 cookie (minted ~2026-05-12, 30-day) was killed by the 12-Jun deploy → every `/api/labels` + `/api/haccp/supplier-code` call 307-redirects to `/login`. `printLabelInApp` (`app/haccp/delivery/page.tsx:32-65`) checks only `res.ok` — the login page returns 200 HTML → it prints the login page / nothing, **silently, no error**. That IS the "button does nothing." The `/api/labels` route's own auth is unchanged since T1 (only an import path moved) — the break is entirely upstream in middleware.
  - **#2 fallback suspect:** missing/rotated `SESSION_SECRET` in prod (would log everyone out app-wide, not just printing) — `SessionTokens.ts:135-138` fails closed if unset. Check Vercel prod env if re-login doesn't fix it.
  - **On-device test (Hakan, physical Sunmi V3):** log out + PIN-log-in → if printing returns, confirmed #1 (stale cookie). This is the band-aid; the durable fix is hardening `printLabelInApp` so a 307→login (or any non-label response) shows a clear "log in again" instead of silently printing it.
- **📋 SEQUENCED PLAN (Hakan, 2026-06-29 — "fix completely"):** (1) **Regression hardening** — dead/unverified session must surface a clear re-login prompt, never silently print the login page; + Hakan runs the re-login band-aid on-device in parallel. (2) **`Printer` port** — re-architect the last no-port module; the 3 transports (Sunmi native / AirPrint-HTML / Zebra-ZPL) become 3 adapters behind one owned port. **+ build a proper RELEASE-SIGNED APK** (folded into Pass 2 — Hakan 2026-06-29). The current install is a fragile DEBUG build (debug-signed, `versionCode 1`, `setWebContentsDebuggingEnabled(true)` left on, no signingConfig in `android/app/build.gradle`). **Distribution decision (Hakan 2026-06-29):** keep MANUAL APK sideload for now (test by plugging the Sunmi V3 into USB), and ALSO publish to Google Play if it's easy (Play Console account already exists). Rationale: the app is a remote-URL shell so the APK is near-static (web deploys auto-reach the device); Play auto-update only earns its keep at fleet scale, but the account exists so low-cost to add. (3) **Real allergens on the delivery label** — stop hardcoding "Allergens: None" (`lib/printing/html.ts:211`); read the actual `allergens_identified` + `allergen_notes` captured at intake on `haccp_deliveries`. **This is label-render-only (server-side print HTML, not the design-system UI) → zero app-screen change, safe anytime.** Each step its own gated FORGE→ANVIL pass.
- **📝 DEFERRED business-logic (noted 2026-06-29, after the fix):**
  - **🔴 BEEF-LABELLING REGULATORY REVIEW — its own job (Hakan flagged).** Audit UK/FSA beef-labelling law (BLS traceability block, allergen rules, mandatory fields) against what the labels currently show; the delivery label already carries born/reared/slaughtered/cut/further-cut + a hardcoded plant code `UK2946`. **UI impact rule (Hakan's question, answered):** a regulatory field already captured in the DB = **label-only change, safe anytime**; a field needing NEW staff entry = an **app-screen change** → add capture with existing components (no bespoke styling), let UI-rebuild Phase 1 restyle it in the normal sweep (governing decision #17: change once, no style leaking). Surface this fork when scoping. Do AFTER the regression+port+allergen fix.
  - **Quantity / copies picker** — engine supports `copies=1–50` (`route.ts:59-62`) but every screen hardcodes `copies=1`. No batch-print UI exists.
  - **Reprint tracking / print log** — no "already printed" state; any label reprints unlimited times with zero record. Plan proposes a `labels_printed` counter (`LABEL_PRINTING_PLAN.md:182-184`), unbuilt.
  - **Operator + time on labels** — `submitted_by` (operator name) + `time_of_delivery`/`time_of_production` captured but only the date prints.
- **✅ Pass 1 SHIPPED 2026-06-29 (PR #98 `4a5d046`):** regression hardening — the print client now refuses to print the login page on a dead/unverified session and surfaces "Session expired — please log in again to print" via each screen's existing `submitErr`. Shared `lib/printing/labelFetch.ts` (pure `classifyLabelResponse` + `printLabelInApp`) dedupes the two identical buggy copies the delivery + mince pages each carried. Client-only, NO migration/RLS/API/auth/bridge change; happy path byte-identical. ANVIL CLEARED (`docs/anvil/2026-06-29-fprod04-pass1-print-regression-cert.md`): unit 8/8 · tsc clean · E2E @critical **78/78** on a clean preview DB (incl. 3 new print specs) · prod smoke all 200. NO device needed (remote-URL shell ⇒ browser/iframe path proves the device path; native bridge untouched). **Ops notes (reusable):** (1) the new spec found 2 TEST-instrumentation bugs on the first preview run — a main-frame `window.print()` spy can't see a print fired inside the iframe's `contentWindow` (assert the print iframe is created instead); and the shared `submitErr` mounts in multiple tab sections so visibility checks need `.first()` (Playwright strict mode). (2) F-INFRA-07 dirty-preview-DB flake recurred on a 2nd+ push (once-per-period HACCP specs false-RED) — cleared by MCP `reset_branch` on preview branch `373ca93f…` → ACTIVE_HEALTHY → `gh run rerun` SAME head → clean 78/78, no gate bypass. (3) anvil-runner SUSPENDED (local Docker down, sandbox-denied) → CONDUCTOR finished the E2E via CI per standing rule. **→ NEXT = Pass 2 (Printer port + release-signed APK), then Pass 3 (real allergens on delivery label).**
- **✅ Pass 2 SPLIT into 2a + 2b (Hakan, 2026-06-29):** the Printer port (code, CI-testable) and the release-signed APK (build artifact, physical-device-tested) have different verification paths and risk profiles, so they ship as separate FORGE passes. 2a = Printer port (done below); 2b = release-signed APK (next).
- **✅ Pass 2a SHIPPED 2026-06-29 (PR #99 `9e765ac`):** `Printer` transport port re-architecture, REFACTOR-ONLY (byte-identical printing behaviour). The two client-side transports relocated (git-rename, verbatim) behind one owned port: `lib/printing/sunmi.ts` → `lib/adapters/sunmi/Printer.ts` (native bridge, 58mm delivery only) and `lib/printing/labelFetch.ts` → `lib/adapters/browser/Printer.ts` (iframe/AirPrint, all types/widths + universal fallback); new `lib/ports/Printer.ts` + shared contract + Fake; client-side wiring `lib/wiring/printer.ts` `getPrinter()` selects the adapter by device AT CALL TIME (SSR-safe, mirrors the F-26 Dexie/LocalCache precedent), injecting Browser as Sunmi's fallback (no adapter reaches into another). Both HACCP screens (`delivery`, `mince`) re-pointed to the wired printer only — the screens no longer import a native device SDK directly (the hexagonal breach is closed). **Scope decisions (grill):** transport seam ONLY — the renderer (`generateLabel`/`html.ts`/`zpl.ts`/`types.ts`) deliberately left PORT-LESS (pure, no vendor to swap; wrapping it would fail the deletion test); Zebra-ZPL = named future slot, NOT built; no native mince added (needs Java bridge work = 2b territory). NO new deps, NO DB/RLS/API/migration. ADR-0010 (`docs/adr/0010-printer-transport-port.md`, Accepted). code-critic SHIP no-blockers (all new modules DEEP, rip-out PASS); ANVIL CLEARED (`docs/anvil/2026-06-29-fprod04-pass2a-printer-transport-port-cert.md`): unit **2973/2973** (R1 URL byte-identity 11/11 — mince `usebydays` fidelity, the food-safety risk · R2 native-jam→iframe fallback 6/6) · tsc clean · `next lint` clean · E2E @critical **78/78** on preview (CI smoke `28400850484`, head `c66d1d1`) · focused browser-tap of both print screens · prod smoke 4/4 200. **NOT tested here (deferred to 2b):** the PHYSICAL Sunmi V3 native print — needs the device; 2a's native code was MOVED not changed and the selection→fallback is unit-tested with a faked bridge (correct 2a proof). **Ops note:** `next lint` was sandbox-denied for the anvil-runner → conductor ran it at Lock (established "sandbox-denied rung → conductor runs it" pattern); cert finalized clean. Rip-out test PASS: a future Zebra = one new `lib/adapters/zebra/` + one wiring line. **🔵 follow-up (code-critic, non-blocking):** `lib/ports/Printer.ts` `copies` is plumbed but always 1 (kept for URL byte-fidelity) — drop in 2b/3 if never varied.
- **✅ Pass 2b SHIPPED 2026-06-30 (PR #100 `40f446d`):** release-signed APK + MFS launcher icon. Build/release engineering (NOT app code, hex N/A). FRESH release keystore generated by Hakan (`~/keys/mfs-ops-release.jks`, gitignored, password in his pw manager); `android/app/build.gradle` reads a gitignored `android/keystore.properties` via a CONDITIONAL `if (keystorePropsFile.exists())` signingConfig (keystore-less clone still builds debug); `versionCode 1→2` / `versionName 1.0→1.1`; `buildFeatures { buildConfig = true }` ADDED (AGP 8.13.0 has BuildConfig OFF by default — without it the next line won't compile); `MainActivity.java` gates `setWebContentsDebuggingEnabled` behind `if (BuildConfig.DEBUG)` (off in release). **MFS launcher icon** folded in (Hakan asked mid-loop): generic Capacitor placeholder → MFS icon (navy+orange) from `public/icons/icon-512.png`, regenerated legacy mipmaps + FULL-BLEED adaptive layers (no-inset XML, navy reaches every edge under the API-33 mask) via PIL — `@capacitor/assets`' default 16.7% inset was overridden because it left the navy background short of the edges. NO new deps (icon tool used via `npx`), NO web/DB change. ADR-0011 (`docs/adr/0011-android-release-signing.md`, Accepted). code-critic SHIP no-blockers (headline: zero secrets in git). ANVIL CLEARED (`docs/anvil/2026-06-30-fprod04-pass2b-release-signed-apk-cert.md`): `assembleRelease` BUILD SUCCESSFUL → `app-release.apk` 3.2MB signed with the release key (`CN=Hakan Kilic`, SHA-256 `c6bf8e…`, NOT debug), versionCode 2, NOT debuggable; on the physical V3 — uninstall old (debug-signed) + install signed (prev APK backed up to `~/mfs-apk-backups/`), staff re-login, label prints, **MFS icon confirmed on home screen**. **Accepted risk (Hakan):** the signing password was exposed in the session transcript and KEPT — bounded (the `.jks` never left his machine; password alone can't sign); rotate via `keytool -storepasswd`/`-keypasswd` if the `.jks` is ever shared. **Reusable ops:** `keytool`'s hidden password prompt needs a REAL terminal (the `!` chat prompt fails instantly with "too many failures"); the V3 runs **API 33** so it uses ADAPTIVE icons (legacy-only regen would NOT have fixed it); `rm -rf` is deny-floored (remove files individually).
- **▶ Owner unit (NEXT) — F-PROD-04 die-cut label sizing (Sunmi label mode):** the physical V3 stock is **52mm×38mm die-cut labels** (gaps between), but the silent native print uses Sunmi **receipt mode** (`SunmiPrintBridge.java` `printText`/`lineWrap`), not **label mode** (gap-sensor feed) — so content overflows across label boundaries. PRE-EXISTING (debug build did the same), surfaced at Pass 2b's on-device test. Scope (Hakan): fit **BOTH delivery + mince** to 52×38mm. Needs native label-mode in `SunmiPrintBridge.java` (Sunmi SDK `labelLocate`/`labelOutput`/gap-learning) + layout constrained to 38mm + **on-device calibration with the real roll** (device + roll in hand now = ideal). Its own gated FORGE→ANVIL pass. NOTE the 100mm HTML path (`html.ts` `@page 100mm 75mm`) targets a DIFFERENT future external printer (TSC/Zebra), not the V3 die-cut roll.
- **Then Pass 3 = real allergens on the delivery label** (stop hardcoding "Allergens: None" at `lib/printing/html.ts:211` + the native bridge's `'None'`; read `allergens_identified`/`allergen_notes`). Then deferred = beef-labelling regulatory review. Each its own gated FORGE→ANVIL pass.
- **🔵 Pass 1 follow-up (deferred to UI Phase 1 — code-critic 🟡 #1, PR #98):** on the delivery COLLAPSED-LIST print strip (`app/haccp/delivery/page.tsx:1642`), a dead-session print error routes to the page-level `submitErr` (line ~1527, up in the entry-form area) — so on a long list the "Session expired — log in again" message renders off-screen above the tapped row. NOT silent (message renders, `window.print()` suppressed, login page never prints — the safety goal is met); only the modal path and the mince history path put the message next to the buttons. A proper fix needs per-row error state, which is bespoke screen logic best handled cohesively in the Phase 1 screen migration (decision #17: no style/logic leaking into screens now). Defer.

---

## F-08 hard prerequisites (carried forward from memory)

Not new entries — pointers. F-08 cannot ship until these are green:

1. **F-TD-03** (above) fixed — 23 broken Orders integration tests pass
2. **Playwright `@critical` suite must PASS at Gate 3** — not skipped, not deferred
3. **F-INFRA-02 shipped** — the per-PR preview smoke is live (`npm run test:e2e:preview`, `docs/runbooks/preview-smoke.md`); the manual click-through compensating control is no longer required

Owner unit for F-INFRA-02 itself: separate infra ticket, pre-F-08.

---

### F-TD-34 — 🔵 Local full-suite E2E has pre-existing failures on non-`@critical` specs
- **Raised:** 2026-06-22 (F-18 PR2 ANVIL Docker rung).
- **What:** Running the FULL chromium Playwright suite locally (against a production build)
  yields **10 stable failures** that are NOT `@critical`: `route-manager.spec.ts` (the
  `/routes` planner, 6 cases — all fail at the `loginAsAdmin` helper waiting for an
  `admin` button), `desktop-chrome.spec.ts` (2 layout), `mobile-chrome.spec.ts` (2 layout).
  A few others (`dashboard-admin-restyle`, `url-filter-init` `/complaints`+`/pricing`)
  flake under full-suite load but pass in isolation.
- **Proven pre-existing, NOT a regression:** rebuilt `main` (7a8ae0d) and ran the same spec
  files on a production build → the **identical 10** fail. F-18 PR2's diff is clean.
- **Why it matters (low):** the routine gate is the `@critical` relay + preview smoke, which
  greps `@critical` only, so these never block. But the broader local suite isn't a
  trustworthy "all green" signal: `loginAsAdmin` doesn't complete locally (likely a
  PIN/seed/admin-login-flow env gap), and the url-filter / dashboard specs are load-sensitive.
- **Fix shape (investigate, then pick):** (a) fix the local `loginAsAdmin` env so
  `route-manager` runs locally; (b) data-isolate / de-flake the load-sensitive specs; (c) or
  formally scope these as preview/CI-only and skip them in the local full run so the local
  suite is honestly green. Do NOT add blanket retries.
- **Owner unit:** unassigned (pick up alongside the next routes/planner or chrome-layout work).

### F-27-bare-disable-hardening — 🔵 `no-disable-arch-rules` guard doesn't cover a bare `/* eslint-disable */`
- **Raised:** 2026-06-27 (F-27 Guard, PR #88).
- **What:** `tests/unit/lint/no-disable-arch-rules.test.ts` fails the build only on
  `eslint-disable*` directives that NAME `no-restricted-imports`/`no-restricted-syntax`. A bare
  `/* eslint-disable */` block (or bare `// eslint-disable-line`) with NO rule named silences
  EVERYTHING in that file/line, including the architecture rules — and is out of this guard's
  scope by design. The test's header docstring states this explicitly. One such bare line exists
  today and is unrelated to the arch rules: `app/cash/page.tsx:732`.
- **Why it matters (low):** the residual gap in the "the Lego rule can't be silently disabled"
  claim. To bypass the fence via a bare disable you'd still have to ADD the offending vendor
  import in the same file. Theoretical; no live occurrence.
- **Fix shape (pick one):** (a) extend the guard to also flag bare `eslint-disable`/
  `eslint-disable-line`/`eslint-disable-next-line` with no rule list inside `lib/**` source (would
  require grandfathering or removing the `cash/page.tsx:732` bare line first); (b) add an ESLint
  plugin (`eslint-comments/no-unlimited-disable`) that bans bare disables natively; (c) leave as
  documented residual gap. Pairs with the F-27 disable-guard.
- **Owner unit:** unassigned (pick up alongside any future lint-hardening work).

### F-18 PR2 — SHIPPED 2026-06-22 (PR #66, squash `66ed279`)
Re-pointed the 6 Visits routes onto `visitsService` + new pure `lib/api/visits/dto.ts`
wire-translator (5 fns, key-order tripwires). W1 fix: note-edit on missing id → 404 (was 500).
F-TD-31 audit-raw-REST + postcodes.io geocode stay in `screen3/sync` (documented). No migration,
no new dep. ANVIL: unit 2125 · integration 336 · build 114pp · preview `@critical` 15/15 + identity
probe 4/4 · prod smoke 0×5xx. Guard CLEAN (2 🟡 accepted). RLS deferred to **F-RLS-04g** (Visits).

### F-UI-GALLERY-01 — make /dev/ui component gallery reachable on Vercel PREVIEW deploys

- **Deferred:** 2026-06-29 (during UI Phase 0b · Wave 1)
- **What:** the dev-only component gallery `app/dev/ui/` is currently unreachable anywhere: it 404s in production by design (`notFound()` when `NODE_ENV=production`), AND the pre-existing `middleware.ts` auth gate blocks `/dev/ui` for every role (it's in no role's permission list), so it can't be viewed on a Vercel preview deploy or even a local dev server without a temporary bypass.
- **Why it matters:** the gallery is meant to be the visual-review surface for each 0b/Phase-1 wave. Hakan reviews from his phone via preview links, so it needs to be viewable on a PREVIEW deploy (while still 404-ing in real production).
- **Fix shape:** gate the gallery to be reachable when `VERCEL_ENV === 'preview'` (still 404 in production) + add a `/dev` allowance in `middleware.ts` scoped to preview. Its own small FORGE follow-up (touches middleware → not an additive-only change).
- **Workaround used for Wave 1:** captured local screenshots via a temporary, uncommitted middleware bypass (reverted) and sent them to Hakan for review.
- **Detail:** `docs/anvil/2026-06-29-ui-phase-0b-wave1-forms-cert.md` (visual-smoke row + follow-ups).
- **Owner unit:** unscheduled (do before/with Phase-1 visual reviews, or alongside Wave 2/3 if a live preview gallery is wanted sooner).
- **Status:** open
