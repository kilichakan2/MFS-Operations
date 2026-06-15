# Code-critic review — F-RLS-04a (Orders RLS cutover)

- **Date:** 2026-06-15
- **Branch:** feat/f-rls-04a-orders-rls-cutover
- **PR:** #42
- **Reviewer:** code-critic subagent (FORGE Guard phase)
- **Plan:** docs/plans/2026-06-15-f-rls-04a-orders-rls-cutover.md
- **VERDICT: FIX-THEN-SHIP** — one correctness blocker (loop back to Order → Render)

## Suite results (run by code-critic, local Supabase available)

- `npm run typecheck` → clean
- `npm run lint` → 0 warnings/0 errors
- Unit (`vitest run tests/unit`) → **1661/1661** (incl. updated `DbTokenMinter.test.ts`, `no-adapter-imports.test.ts` 24/24)
- `npm run db:reset` (apply migration `20260615173901`) → clean
- Integration RLS (`orders-rls.test.ts`, local Supabase) → **10/10** — but none cover warehouse first-print (see test-quality finding)
- **Adversarial psql probe** (warehouse + sales placed→printed as `authenticated`) → 🔴 warehouse `UPDATE 0` (denied); confirms the blocker. Service-role bypass works today.
- E2E preview smokes not run (need a deployed preview) — noted, not a review failure.

## 🔴 Blocker

### 1. Warehouse first-print (placed→printed) is denied by RLS → spurious ConflictError
- **Where:** `app/api/orders/[id]/picking-list/route.ts:69` (POST allows admin/office/warehouse) → `lib/usecases/pickingList.ts:101` → `OrdersService.printOrder` → `lib/adapters/supabase/OrdersRepository.ts:638` `recordPrint` first-print branch (`update(...).eq("state","placed")`).
- **Root cause:** an UPDATE policy's `USING` is evaluated against the **pre-update** row. A first-print row is `state='placed'`, so the governing policy is `orders_update_placed` — role set **admin/sales/office, no warehouse**. The only warehouse-inclusive policy is `orders_update_printed` (state in printed/completed), which doesn't apply to a placed row.
- **Proven (psql, authenticated role, warehouse GUC):** warehouse first-print → `UPDATE 0` (RLS filters the row), order stays `placed`; `recordPrint` sees `updated.length===0` → throws `ConflictError("Order {id} state changed during print transition")` → 409 to a legitimate warehouse user. Under service-role today this print succeeds.
- **Why blocker:** the cutover (service-role → authenticated client) is what newly exposes the gap; it's a behaviour regression for the most common picking-list flow, and violates the plan §6 invariant "RLS must never be MORE restrictive than the service's own gating."
- **Fix options:** (a) add a dedicated additive policy for the print transition — `orders_print_placed FOR UPDATE USING (state='placed' AND role IN admin/office/warehouse) WITH CHECK (state='printed' ...)` — narrowly scoped so warehouse can ONLY flip placed→printed, not gain full edit on placed orders; or (b) defer the picking-list POST cutover (flip only GET/PUT now, keep POST on the singleton). Either way add a warehouse-first-print test.

## 🟢 Test-quality finding (elevates the blocker — regression fully uncovered)

- `tests/integration/adapters/supabase/orders-rls.test.ts:203-242` — UPDATE gate tests only **admin** (in-role both policies) and **driver** (out-of-role everything); never a **warehouse first-print**, the broken case. Suite green while the regression ships.
- `tests/e2e/02-picking-list-print.spec.ts:25-26` — @critical print smoke logs in as **office** (in `orders_update_placed`), so the live preview proof also stays green and won't catch it.
- **Fix:** add an integration assertion (warehouse keycard, placed order, attempt placed→printed → denied today / succeeds after policy fix). Optionally a warehouse e2e print variant.

## ✅ Verified correct (not waved through)

- **Token-bleed / cross-request contamination — CLOSED both layers:** `lib/wiring/orders.ts:80-118` mints fresh token + builds fresh client every call (no memoization); `lib/adapters/supabase/authenticatedClient.ts:38-50` `createClient` per call, `persistSession:false`, `autoRefreshToken:false`, caller Bearer in `global.headers`; `db_pre_request` GUC `set_config(...,true)` is transaction-scoped (`20260614210221_...:72`), wiped per request, fails closed (`EXCEPTION WHEN OTHERS → NULL`).
- **Fail-closed identity:** `lib/auth/session.ts:79-86` `requireRole` derives `userId` from `x-mfs-user-id`, 401 if absent; routes call `ordersServiceForCaller(caller.userId!)` only after `requireRole` returns. No service-role fallback / empty user_id path.
- **Secret/token safety:** minted JWT + `SUPABASE_JWT_SECRET` never logged; minter error names the env var not its value; secret read in one lazy getter; no console/log of token/secret in minter, wiring, client adapter, or route error paths.
- **DELETE-policy migration `20260615173901`:** additive, correct. `orders_delete`/`order_lines_delete` mirror existing update policies (admin/sales/office, same GUC cast); no FORCE, no data DROP/ALTER; `DROP POLICY IF EXISTS` guards + real `-- ROLLBACK`. PUT edit genuinely exercises it (`OrdersRepository.ts:590-593` `order_lines.delete().eq("order_id",id)`).
- **Clock-skew fix `DbTokenMinter.ts:82-89`:** `iat=now−30`, `exp=now+120`, 150s span; test assertions non-flaky. Sound.
- **T2 anon-leak invariant** (`orders-rls.test.ts:188-199`): asserting "0 rows" not "no error" is the stronger denial (empty-GUC `::uuid` cast → `22P02`, nothing returned). Good judgement.
- **Hexagonal/depth:** `ordersServiceForCaller`/`pickingListUsecaseForCaller` → DEEP (compose mint→client→repos→service behind a one-arg interface; real composition). No `lib/adapters/**` import in any `app/api/orders/**` route; `SupabaseClient` never crosses into routes; no new `package.json` dep.
- **Rollback honesty:** as disclosed — `[id]`/`picking-list` per-route manual rollback ~2 lines (call-site + re-add import, removed for `no-unused-vars`); `orders/route.ts` keeps both. Whole-PR `git revert` is one command. Acceptable.
- **Intentional scope confirmed (not flagged):** create stays service-role (`app/api/orders/route.ts:64-72`, `// reason:` + F-RLS-04a-create follow-up); KDS routes + `order_idempotency_keys` untouched; expand-contract steps 5-6 deferred.

## Loop-back

FIX-THEN-SHIP → **Order** (decide policy-widen vs defer-print), then **Render** (implement + add warehouse-first-print test), then back to Guard. Everything else is clean and ships once finding #1 is resolved.

---

## Guard delta re-review (commit 989da40) — VERDICT: FIX-THEN-SHIP (new over-grant)

The approved blocker (warehouse first-print) is **CLOSED** and verified load-bearing; migration hygiene clean; commit touches only the 2 expected files; suites green (unit 1661, orders-rls 12/12, tsc/lint 0). BUT the adversarial policy-scope check surfaced a **newly-introduced** DB-layer over-grant:

### 🔴 New blocker — warehouse can skip-print straight to `completed`
- **Where:** `20260615173901_..._delete_and_print_policies.sql` `orders_print_placed` × pre-existing `orders_update_printed` (`20260530000000_order_pipeline_schema.sql:327`).
- **Mechanism (proven live):** Postgres OR's permissive UPDATE policies on BOTH the USING (row visibility) and WITH CHECK (new row) sides, **independently**. `orders_print_placed` USING newly makes a `placed` row visible to a warehouse caller; the new row then only needs to satisfy ANY policy's WITH CHECK, and `orders_update_printed`'s WITH CHECK accepts `state='completed'` for warehouse. → warehouse can UPDATE a placed order straight to `completed` in one statement (skip print). Proven: pre-diff DENIED, post-diff ALLOWED.
- **Scope:** NEW for warehouse (pre-diff warehouse couldn't touch a placed row at all). The same placed→completed latitude is **pre-existing** for office/admin (already in `orders_update_placed` + the loose `orders_update_printed` WITH CHECK) — a latent looseness this unit didn't create.
- **Not reachable through app code** (recordPrint only ever does placed→printed), but RLS is the defense that must hold when app code is bypassed → graded blocker.

### 🟢 Test-gap to close
- The driver-deny case only covers the out-of-role axis; it would NOT have caught this (warehouse IS in role). Add an in-role-out-of-transition assertion: **warehouse keycard CANNOT move placed→completed (skip-print)**.

### Conductor decision (2026-06-15): DEFER the print-route cutover (reverses the earlier Option A)
Closing the skip-print hole *properly* requires pinning transitions (e.g. split `orders_update_printed` so `completed` requires a pre-image of `printed`) — which restructures a pre-existing policy and touches office/admin behaviour = scope creep + regression risk. Cleaner: **defer the picking-list POST (print) cutover** to a focused follow-up (the option set aside at the first loop-back). Then `orders_print_placed` is dropped (no new grant, no hole), F-RLS-04a ships the view + edit cutover only, and print + transition-integrity hardening land together later.
- Keep: `orders_delete`/`order_lines_delete` (the PUT edit path needs them), the clock-skew fix, the wiring factories, GET/PUT route flips, GET picking-list flip.
- Revert: the picking-list **POST** flip (back to the service-role singleton) + drop `orders_print_placed`.
- Log: (a) **F-RLS-04a-print** follow-up (print cutover); (b) **pre-existing transition-integrity looseness** (office/admin placed→completed skip-print at the DB layer) as a hardening item.

---

## FINAL RESOLUTION (2026-06-15) — Option A: accept skip-print looseness, ship print (SUPERSEDES the "DEFER" note above)

After Hakan's domain review, the conductor + Hakan **consciously accept** the delta-review 🔴 (warehouse placed→completed skip-print) as a **low-severity, documented limitation** rather than blocking on it. Justification:
- **Workflow guard, not authorization/exposure:** warehouse marking orders complete is legitimate and already allowed (`printed→completed`); the only thing at stake is the order of steps (don't complete before printing). It does not change which orders / whose data a role can touch.
- **Not app-reachable:** the app only ever does placed→printed→completed; the shortcut needs a hand-crafted authenticated DB call with a valid warehouse session.
- **Pre-existing parity:** office/admin already have the same placed→completed latitude (predates this unit); warehouse reaches parity, not a unique new door.

**Decision: ship F-RLS-04a as built at `989da40`** (view + edit + **print**), warehouse-print fix kept. The build is unchanged; the warehouse-print-success + driver-deny tests stay; no "warehouse-cannot-skip-print" assertion is added (that guard is deferred).

**Logged follow-up:** **transition-integrity hardening** — enforce print-before-complete (and the full placed→printed→completed sequence) **uniformly for all roles** (closes the skip-print looseness for warehouse, office AND admin at once). Logged in BACKLOG (RLS track follow-ups) + roadmap. This is the correct home to fix it — a state-machine guard done once for everyone, not bolted onto one role here.

**Guard status: RESOLVED (blocker consciously accepted + logged).** Everything else in the delta was clean. → advance to ANVIL.
