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
- **Owner unit:** unscheduled — pick up after Phase 1 closes (F-09)
- **Status:** open

### F-TD-05 — Architecture-pin test only covers `OrdersService.ts`

- **Deferred:** 2026-06-09 (during F-07, loop 1 — code-critic TS-03)
- **What:** `tests/unit/services/OrdersService.test.ts` test #28 reads ONLY `lib/services/OrdersService.ts` and asserts no cross-service / observability / auth / log imports. When `UsersService.ts` ships, this test will still pass even if UsersService imports OrdersService directly.
- **Why deferred:** F-07 is the first service; pin trivially passes today.
- **Fix shape:** convert the test to read every file in `lib/services/`, OR convert to an ESLint `no-restricted-imports` rule (cleaner — fails at lint not at test time).
- **Detail:** F-07 cert + code-critic Guard report (when cert written)
- **Owner unit:** F-13 (UsersService) — must tighten BEFORE second service ships
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
- **Owner unit:** unscheduled (small standalone PR)
- **Status:** open

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
