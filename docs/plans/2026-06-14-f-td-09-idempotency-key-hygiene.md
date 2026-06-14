# F-TD-09 — Idempotency-key hygiene (purge cron + W1/N1/N3)

**Unit:** F-TD-09
**Date:** 2026-06-14
**Phase:** FORGE Order (Phase 2) — execution plan
**Spec source:** locked at Gate 1; BACKLOG `docs/plans/BACKLOG.md` §F-TD-09 (lines 94–106)
**Plan author:** forge-planner

🗣 **In plain English:** This unit does four small, independent things to the
"have I already placed this order?" ledger. (1) Add a nightly broom that sweeps
out ledger rows that have already expired so the table never grows forever.
(2) Close a one-in-a-million timing hole where two identical order requests
arriving at the exact 24-hour expiry instant could each get a separate order.
(3) Stop a rare error log from printing the customer's raw dedupe fingerprint.
(4) Fix two stale code comments that point at a file we deleted. No database
change, no new libraries.

---

## 0. Goal & non-goals

**Goal:** Add a scheduled purge for expired `order_idempotency_keys` rows and
land the three non-blocking code-critic findings (W1, N1, N3) that were deferred
alongside it during F-08.

🗣 **In plain English:** `order_idempotency_keys` is the table that remembers
every "place order" fingerprint so a double-tap or a flaky-wifi retry returns the
SAME order instead of creating a duplicate. Rows expire after 24h but only get
deleted if that exact fingerprint is reused. This unit adds the missing broom plus
three tidy-ups.

**Explicitly NOT in scope (hard guardrails):**
- **No schema change.** This is a row-level DELETE of already-expired rows only.
  The `order_idempotency_keys` table and its columns are untouched.
  **Non-destructive — no migration file, no destructive migration, no PITR.**
  🗣 We are only sweeping out rows that have already passed their use-by date. We
  are not changing the shape of the table, so there is nothing to migrate and
  nothing that could lose live data.
- **No new dependencies.** Uses only `@supabase/supabase-js` (already in
  `package.json`) and Node's built-in `node:crypto` (already imported elsewhere in
  the repo — `lib/auth/session.ts:65`, `lib/observability/withRequestContext.ts:42`).
- **N2 is intentionally NOT changed.** `rollbackOwnOrder` being log-only is a
  documented, correct trade-off. No code change. (See §8.)
  🗣 One of the four findings was reviewed and deliberately left alone because the
  current behaviour is right — we just note it so nobody "fixes" it later by mistake.

---

## 1. Domain terms (plain-English glossary for this unit)

- **`order_idempotency_keys`** — the dedupe ledger table. One row per accepted
  order fingerprint. 🗣 The guest book at the door: "this fingerprint already has
  an order, here it is" so a retry doesn't book a second table.
- **Idempotency key** — the client-supplied fingerprint for one "place order"
  action. 🗣 A wristband for one order attempt; the same wristband always points
  at the same order.
- **TTL / `expires_at`** — rows die 24h after creation. 🗣 The wristband fades
  after a day; after that the fingerprint can be reused for a brand-new order.
- **Purge / sweep** — `DELETE FROM order_idempotency_keys WHERE expires_at < now()`.
  🗣 Bin the faded wristbands nobody came back for.
- **TOCTOU (Time-Of-Check-To-Time-Of-Use)** — a bug where the world changes
  between the moment you check a condition and the moment you act on it. 🗣 You
  look in the fridge, see milk, walk to the kettle — meanwhile someone took the
  milk. W1 is exactly this at the 24h boundary.
- **Port** (`lib/ports/OrdersRepository.ts`) — the business-shaped interface the
  app owns. 🗣 The socket shape the core logic insists on.
- **Adapter** (`lib/adapters/supabase/OrdersRepository.ts`) — the Supabase
  implementation; the only place the Supabase SDK is imported for Orders. 🗣 The
  actual plug for the Supabase vendor.
- **Service** (`lib/services/OrdersService.ts`) — business orchestration the route
  talks to. 🗣 The front desk the UI/route calls; it never reaches into the vendor.
- **Wiring** (`lib/wiring/orders.ts`) — the one composition root that bolts the
  adapter to the service. 🗣 The single patch-panel where the plug meets the socket.
- **Vercel cron** — a scheduled HTTP GET that Vercel fires on a cron schedule
  declared in `vercel.json`. 🗣 Vercel's alarm clock that pokes one of our URLs on
  a timetable.
- **`CRON_SECRET`** — shared secret in the `Authorization: Bearer …` header that
  proves the caller is the real scheduler, not a random internet visitor. 🗣 The
  password on the alarm clock so only it can ring the bell.

---

## 2. Compliance / architecture flags

- **CLAUDE.md Lego rules — fully respected.** The route under `app/**` imports
  ONLY the `ordersService` singleton from `lib/wiring/orders.ts`. It never touches
  `lib/adapters/**`. The DELETE SQL lives in the Supabase adapter behind a new port
  method. (See §3 rip-out check.)
- **ADR-0002** (hexagonal shape + naming): new port method is a business operation
  ("purge expired idempotency keys"), takes/returns only primitives/domain types
  (`Date` in, `number` out), vendor shapes stay inside the adapter. No conflict.
- **ADR-0003** (Supabase SDK freeze / allow-list): the new DELETE is added inside
  the already-allow-listed adapter file. No new vendor import site. No conflict.
- **ADR-0004** (deny-all RLS on orders tables): the purge runs through
  `supabaseService` (service-role client, bypasses RLS) exactly like every other
  write in this adapter. No RLS change. No conflict.
- **No ADR conflicts found.**

🗣 **In plain English:** Every architecture rule this project cares about is
satisfied without bending anything. The vendor SQL stays in the one allowed room,
and the route talks only to the front desk.

---

## 3. Hexagonal / rip-out check (Gate 2 verdict inputs)

```
        ┌─ DOMAIN (Orders core) ─┐
        └──────────┬─────────────┘
            OrdersRepository (port)        ← + purgeExpiredIdempotencyKeys(now)
                    │
        [supabase/OrdersRepository]        ← DELETE … WHERE expires_at < now()
                    │
            OrdersService (front desk)     ← + thin delegate purgeExpiredIdempotencyKeys
                    │
        lib/wiring/orders.ts (patch-panel) ← ordersService already exported
                    │
   app/api/cron/purge-idempotency-keys     ← GET, imports ordersService ONLY
   🗣 route → service → port → adapter; route never sees the vendor
```

- **Port used / added:** `OrdersRepository` (`lib/ports/OrdersRepository.ts`) —
  **adds** one method `purgeExpiredIdempotencyKeys(now: Date): Promise<number>`.
- **Adapter implementing it:** `lib/adapters/supabase/OrdersRepository.ts` (the
  existing Supabase Orders adapter — no new adapter folder).
- **New dependencies:** **NONE.** (`@supabase/supabase-js` and `node:crypto` are
  both already present.)
- **Route → adapter direct touch?** **NO.** The route imports `ordersService` from
  `lib/wiring/orders.ts` (the only import it needs for business logic), plus
  `next/server` for the HTTP shell. It does not import `@/lib/adapters/**`.
- **Rip-out test result:** **PASS.** Swapping the DB vendor for the purge =
  one new adapter method in `lib/adapters/<vendor>/OrdersRepository.ts` + the
  existing one wiring line in `lib/wiring/orders.ts`. The route, service interface,
  and port are vendor-agnostic.

🗣 **In plain English:** If we ripped out Supabase tomorrow, the nightly broom
moves with one new plug and the existing patch-panel line — the route and the
business layer don't notice. That is the pass condition.

---

## 4. Composition decision — service method, NOT a use-case

**Chosen: a thin delegating method on `OrdersService`** (mirroring the existing
pass-throughs `listOrders` / `findOrderById` / `listKdsQueue`).

**Why (matching existing Orders code):**
- Use-cases in this codebase exist ONLY to compose *multiple* ports/services for
  one business operation: `pickingList` composes `ordersService` + `products` +
  `users`; `kdsQueue` composes `ordersService` + `products`; `kdsLineDone` composes
  `ordersService` + `users` (see `lib/wiring/orders.ts:48-62`).
- The purge composes **nothing** — it is a single call into a single port
  (Orders). That is precisely the shape of the three existing thin pass-throughs on
  `OrdersService` (`lib/services/OrdersService.ts:392-394`), which the file's own
  docstring calls out as "explicit thin delegates … so the route layer has a single
  point of contact for Orders" (lines 36-38).
- A use-case here would be an empty wrapper around one port call — shallower than a
  pass-through and against the depth rule.

🗣 **In plain English:** Use-cases are for jobs that stitch several systems
together. The broom only talks to one system, so it belongs as a simple forwarding
method on the existing front desk — exactly like the read-only pass-throughs
already there. No new file, no ceremony.

---

## 5. Cron-registration reconciliation (the IMPORTANT spec task)

**The question:** the `haccp-alarm` route's header comment claims a `vercel.json`
entry that is NOT in `vercel.json`. So *will our new cron actually fire* if we just
add a line? Investigated before finalising.

**What I found (evidence, not assumption):**
1. `vercel.json` currently registers exactly one cron:
   `/api/routes/compute-road-times`, schedule `0 2 * * 0`. That route exists
   (`app/api/routes/compute-road-times/route.ts`). This proves **Vercel crons
   declared in `vercel.json` are the live mechanism for this project.**
2. Git history explains the `haccp-alarm` discrepancy exactly:
   - Commit `35f1e41` ADDED `/api/cron/haccp-alarm` with schedule `*/5 8-16 * * *`
     (every 5 min, sub-daily).
   - Commit **`ac6983a` REMOVED it** with the message:
     *"fix(build): remove sub-daily cron — Hobby plan only allows daily crons.
     */5 8-16 was blocking every build since the alarm commit. Cron will be
     replaced with external cron service (cron-job.org) calling
     /api/cron/haccp-alarm every 5 minutes."*
   - So `haccp-alarm` is driven by an **external scheduler (cron-job.org)**, which
     is why its header comment (which still claims a `vercel.json` entry) is stale.

**Conclusion — our new cron WILL fire:**
- Our schedule is `0 3 * * *` — **exactly daily**, which the Hobby plan permits
  (the *only* reason `haccp-alarm` was evicted was its *sub-daily* `*/5` frequency).
- Appending our entry to the existing `crons` array in `vercel.json`, alongside the
  proven-live `compute-road-times` daily-frequency cron, registers it with Vercel's
  scheduler. It is NOT a silently-dead append.

🗣 **In plain English:** I checked the git history instead of trusting the stale
comment. The HACCP alarm was kicked out of Vercel ONLY because it wanted to run
every 5 minutes, which the cheap (Hobby) plan forbids. Ours runs once a day — which
that plan allows — and there's already a once-a-week cron in the same file proving
the mechanism works. So our line genuinely rings.

**Two residual confirmations that need Hakan / the Vercel dashboard (Gate-2 notes,
not blockers — see Risk R1):**
- `CRON_SECRET` must already be set in Vercel project env (it is referenced by the
  existing `haccp-alarm` route and was listed as setup in `35f1e41`). Confirm it is
  present in prod env so the new route's 401 guard doesn't reject the scheduler.
- Vercel Hobby allows a limited number of cron jobs (historically: daily-only, and
  a small per-project cap). We will hold **two** vercel.json crons after this
  (`compute-road-times` + purge). Confirm the project is within the plan's cron
  count after deploy (the deploy itself will fail loudly if over the cap — that is
  the belt-and-braces signal).

---

## 6. Ordered, file-by-file steps (TDD-friendly)

Order chosen so each piece is independently testable; the port/adapter/service
chain is built bottom-up before the route consumes it.

### Step 1 — Port: add the method
**File:** `lib/ports/OrdersRepository.ts`
**Change:** add one method to the `OrdersRepository` interface, with JSDoc matching
the file's conventions (every method names what it hides; double-quotes + semicolons).

```ts
  /**
   * Purge expired idempotency-key rows from the ledger.
   *
   * What this hides:
   *   - The single DELETE on `order_idempotency_keys` filtered to rows
   *     whose `expires_at` is at or before `now`. Callers (the daily
   *     purge cron) never write the table name or the predicate.
   *   - The vendor's "rows affected" count extraction; the method
   *     returns a plain `number` of rows deleted.
   *
   * Hygiene-only: TTL is already enforced at read time and reclaimed
   * opportunistically on key reuse (createOrder step 0). This sweeps the
   * rows whose key is never reused so the table cannot grow unbounded.
   *
   * @param now  The cutoff. Rows with `expires_at <= now` are deleted.
   *             Passed in (not `now()` inside) so tests are deterministic.
   * @returns The number of rows deleted (>= 0).
   * @throws  ServiceError on DB failure.
   */
  purgeExpiredIdempotencyKeys(now: Date): Promise<number>;
```

🗣 **In plain English:** First we declare, on the official socket, "there is a way
to sweep expired rows; you give it a cutoff time, you get back how many it binned."
Declaring the contract before the implementation is the house rule.

**Proven by:** the adapter test in Step 2 type-checks against this signature; the
service delegate in Step 4 satisfies the same method on `OrdersService`.

> **Predicate note (`<=` vs `<`):** the existing read-time expiry check
> `isExpired` (`lib/adapters/supabase/OrdersRepository.ts:202-204`) uses
> `getTime() <= Date.now()` (expired *at or before* now). To stay consistent with
> the read path, the purge predicate is `.lte('expires_at', now)`. The BACKLOG
> sketch said `< now()`; `<=` is the consistent choice and deletes the same rows
> in practice (a row expiring at the exact tick is already treated as expired
> everywhere else). State this in the PR.

### Step 2 — Adapter: implement the DELETE + return the count
**File:** `lib/adapters/supabase/OrdersRepository.ts`
**Change:** add `purgeExpiredIdempotencyKeys` to the object returned by
`createSupabaseOrdersRepository`. Place it alongside the other methods. Use the
existing log + `ServiceError` patterns and the file's double-quote/semicolon style.

```ts
    async purgeExpiredIdempotencyKeys(now: Date): Promise<number> {
      const { data, error } = await client
        .from("order_idempotency_keys")
        .delete()
        .lte("expires_at", now.toISOString())
        .select("key");
      if (error) {
        log.error("OrdersRepository.purgeExpiredIdempotencyKeys DB error", {
          error: error.message,
        });
        throw new ServiceError("Idempotency-key purge failed", { cause: error });
      }
      return (data ?? []).length;
    },
```

🗣 **In plain English:** This is the only place the real "DELETE … WHERE expired"
sentence is written. `.select("key")` makes Supabase hand back the rows it deleted
so we can count them (PostgREST doesn't return a count on a bare DELETE). The
returned number is the audit line in the cron log.

**Implementation notes:**
- `.lte('expires_at', now.toISOString())` — the table column is `timestamptz`;
  pass an ISO string (matches how this adapter formats timestamps everywhere).
- `.select('key')` is required to get rows back to count. Selecting one column keeps
  the payload minimal. If row volume were ever large this would be revisited, but at
  this system's "handful of rows a day" (BACKLOG §F-TD-09) it is negligible.

**Proven by:** unit test against a Fake/seeded client (purge returns the count of
expired rows; leaves unexpired rows). See test matrix §7.

### Step 3 — Fake repository: implement the new method
**File:** `lib/adapters/fake/OrdersRepository.ts` (the Fake in-memory
`OrdersRepository`, F-06).
**Confirmed fact:** the Fake's idempotency store is
`idempotencyKeys: Map<string, { orderId: string; createdBy: string }>` (line 61)
and its docstring (lines 57-59) states it **"does NOT model TTL (the 24h expiry is
a storage-layer concern)."** There is no `expires_at` to filter on.
**Change:** add `purgeExpiredIdempotencyKeys(now: Date): Promise<number>` so the
Fake still satisfies the port interface (otherwise `tsc` STRICT fails — every
implementer of `OrdersRepository` must implement the new method, and the contract
test at `lib/ports/__contracts__/OrdersRepository.contract.ts` runs the suite
against the Fake). Because the Fake models no expiry, this is a **documented
no-op returning `0`**, with a one-line comment pointing at the docstring:
```ts
    // The Fake does not model TTL (see store docstring, lines 57-59), so
    // there are no expired rows to sweep. Real purge behaviour is proven
    // against the live DB in integration tests (F-TD-09 §7 I2/I3).
    async purgeExpiredIdempotencyKeys(_now: Date): Promise<number> {
      return 0;
    },
```

🗣 **In plain English:** The pretend database used in fast unit tests must also know
how to "sweep," or the type-checker rejects it for not honouring the full contract.
This pretend DB deliberately doesn't track expiry, so its sweep is an honest no-op
that returns zero — the real sweeping is proven against the real database in the
integration tests.

**Proven by:** existing service + Fake unit tests still compile + pass; the port
contract test still passes; no behaviour change to other methods.

### Step 4 — Service: thin delegate
**File:** `lib/services/OrdersService.ts`
**Change (two edits):**
1. Add to the `OrdersService` interface, in the pass-through block, with JSDoc in
   the file's style:
```ts
  /**
   * Purge expired idempotency-key rows. Pass-through to
   * `OrdersRepository.purgeExpiredIdempotencyKeys`. Called by the daily
   * purge cron (`app/api/cron/purge-idempotency-keys`). Hygiene only —
   * no business decision, single port, so a thin delegate (matches
   * listOrders / findOrderById / listKdsQueue).
   *
   * Throws: ServiceError (propagated from port).
   */
  purgeExpiredIdempotencyKeys(now: Date): Promise<number>;
```
2. Add to the factory return object next to the other pass-throughs
   (`lib/services/OrdersService.ts:392-394`):
```ts
    purgeExpiredIdempotencyKeys: (now) => orders.purgeExpiredIdempotencyKeys(now),
```

🗣 **In plain English:** The front desk simply forwards the broom request to the
vendor plug — no thinking, just like the existing "list orders / find order" desk
calls. This is what lets the route stay vendor-blind.

**Proven by:** service unit test (Fake repo) asserting the delegate forwards `now`
and returns the count unchanged.

### Step 5 — Wiring: no change needed
**File:** `lib/wiring/orders.ts` — **untouched.** `ordersService` is already
constructed and exported there (lines 42-46). The new method rides on the same
singleton.

🗣 **In plain English:** The patch-panel already has the front desk wired up; the
new method appears on it for free. Zero edits — which is the rip-out test working.

### Step 6 — Route: the cron handler
**File (new):** `app/api/cron/purge-idempotency-keys/route.ts`
**Modelled EXACTLY on** `app/api/cron/haccp-alarm/route.ts` — single-quotes, NO
semicolons (match that file's local style per CLAUDE.md "code that reads like the
surrounding code").

```ts
/*
 * app/api/cron/purge-idempotency-keys/route.ts
 *
 * Vercel cron: runs daily at 03:00 UTC.
 * Cron schedule in vercel.json: "0 3 * * *".
 *
 * Sweeps expired rows from order_idempotency_keys (TTL hygiene, F-TD-09).
 * The DELETE lives in the Supabase adapter behind OrdersRepository
 * .purgeExpiredIdempotencyKeys — this route only does auth + delegation
 * (CLAUDE.md: app/** imports services via lib/wiring, never adapters).
 */

import { NextRequest, NextResponse } from 'next/server'
import { ordersService }             from '@/lib/wiring/orders'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  try {
    const deleted = await ordersService.purgeExpiredIdempotencyKeys(new Date())
    console.log(`[purge-idempotency-keys] Deleted: ${deleted}`)
    return NextResponse.json({ ok: true, deleted })
  } catch (err) {
    console.error('[GET /api/cron/purge-idempotency-keys]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
```

🗣 **In plain English:** This is the doorbell the alarm clock rings. It checks the
password, asks the front desk to sweep, logs how many rows it binned, and returns
`{ ok: true, deleted: N }`. If anything blows up it returns a 500 — same shape as
the existing HACCP cron so it reads like a sibling.

**Proven by:** integration test — 401 without the Bearer secret; 200 + correct
`deleted` count with it; expired rows gone, unexpired rows untouched. See §7.

### Step 7 — Register the cron in `vercel.json`
**File:** `vercel.json`
**Change:** append to the existing `crons` array (do NOT replace it):
```json
{
  "crons": [
    {
      "path": "/api/routes/compute-road-times",
      "schedule": "0 2 * * 0"
    },
    {
      "path": "/api/cron/purge-idempotency-keys",
      "schedule": "0 3 * * *"
    }
  ]
}
```

🗣 **In plain English:** This is the line on Vercel's timetable that makes the alarm
clock ring our doorbell at 03:00 UTC daily. We add it next to the existing weekly
road-times cron — both are daily-or-rarer, which the plan allows.

### Step 8 — W1: make the two reclaim deletes conditional (TOCTOU fix)
**File:** `lib/adapters/supabase/OrdersRepository.ts`
**Context:** in `createOrder` step 0 (lines 374-390), both reclaim arms call
`deleteIdempotencyKey(client, idempotencyKey)` which deletes **by `key` alone**
(helper at lines 224-238, only two callers — lines 379 and 387). At the exact 24h
boundary a concurrent same-key request can have its FRESH row deleted by the other
request's reclaim, letting one key resolve to two orders.

**Chosen shape (minimal, correct):** give `deleteIdempotencyKey` an **optional guard
predicate** parameter; each arm passes its own narrowing guard. Two callers, both in
this function — one helper with a guard is cleaner than two near-duplicate helpers.

New helper signature + body:
```ts
type IdempotencyDeleteGuard =
  | { kind: "expiredAt"; now: Date }          // only delete if still expired
  | { kind: "orderId"; orderId: string };     // only delete this specific stale row

async function deleteIdempotencyKey(
  client: SupabaseClient,
  key: string,
  guard?: IdempotencyDeleteGuard,
): Promise<void> {
  let query = client.from("order_idempotency_keys").delete().eq("key", key);
  if (guard?.kind === "expiredAt") {
    query = query.lte("expires_at", guard.now.toISOString());
  } else if (guard?.kind === "orderId") {
    query = query.eq("order_id", guard.orderId);
  }
  const { error } = await query;
  if (error) {
    log.error("OrdersRepository idempotency-key delete DB error", {
      error: error.message,
    });
    throw new ServiceError("Idempotency-key reclaim failed", { cause: error });
  }
}
```

Update the two call sites in `createOrder` step 0:
- **Expiry-reclaim arm** (currently line 379): the arm runs after `isExpired(existing)`
  is true. Capture a single `now` at the top of the idempotency block and pass it:
```ts
  // existing was read; reclaim only if STILL expired at this instant
  await deleteIdempotencyKey(client, idempotencyKey, { kind: "expiredAt", now });
```
- **Stale-order arm** (currently line 387): the arm runs after `findOrderById`
  returns null for `existing.order_id`. Delete only that specific stale row:
```ts
  await deleteIdempotencyKey(client, idempotencyKey, {
    kind: "orderId",
    orderId: existing.order_id,
  });
```

**Where `now` comes from:** add `const now = new Date();` at the top of the
`if (idempotencyKey !== undefined)` block so the expiry guard and the `isExpired`
read use the same instant (avoids a second TOCTOU between the check and the guard).
`isExpired` may stay as-is (it reads `Date.now()` internally) — the guard's `now`
just needs to be at-or-after the read, which it is. Optionally pass `now` to a
guard-consistent `isExpired(existing, now)`; **keep it minimal** — only change what
W1 requires. Decide at implementation time, but do NOT widen scope.

🗣 **In plain English:** Today both "reclaim" deletes say "delete the row with this
fingerprint" — full stop. The fix makes them say "delete it ONLY IF it's still the
expired one I read" / "ONLY IF it's still pointing at the dead order I read." So if
a fresh, valid row sneaked in during the same millisecond, the delete misses it and
the fresh order survives. One key, one order — always.

**Idempotency contract preserved:** the port's claim/replay/race contract
(`lib/ports/OrdersRepository.ts:180-201`) is unchanged in the common case — the
guards only NARROW the deletes so they can't clobber a concurrent fresh row. The
non-raced paths (the overwhelming majority) delete exactly the same rows as before.

**Proven by:** unit tests for the conditional-delete behaviour incl. the boundary
race; integration test proving two same-key requests at expiry don't yield two
orders. See §7.

### Step 9 — N1: stop leaking the raw key in the error log
**File:** `lib/adapters/supabase/OrdersRepository.ts`
**Context:** the pathological-arm error log at lines 471-474 logs
`{ idempotencyKey, winnerOrderId }`. `idempotencyKey` is the raw client fingerprint.

**Chosen fix (cheapest, already-available):** **drop `idempotencyKey`, keep
`winnerOrderId`.** The `winnerOrderId` already uniquely identifies the situation for
debugging; the raw key adds nothing but a leak. No hashing needed.
```ts
    log.error("OrdersRepository.createOrder race winner order unreadable", {
      winnerOrderId,
    });
```

🗣 **In plain English:** That rare error line currently prints the customer's raw
dedupe wristband number. The order id alone tells us everything we need to chase the
bug, so we just remove the wristband from the log. No extra code, no library.

**Alternative considered (NOT chosen):** a short sha256 hex of the key via
`node:crypto` `createHash`. Rejected as unnecessary work — `winnerOrderId` is a
sufficient correlation handle, and "log nothing sensitive" beats "log a hash of
something sensitive." If review prefers a key handle, the one-liner is:
`keyHash: createHash('sha256').update(idempotencyKey).digest('hex').slice(0, 12)`
with `import { createHash } from 'node:crypto'` — still zero new deps. Default: drop it.

**Proven by:** unit test asserting the error-log payload contains `winnerOrderId`
and NOT `idempotencyKey` (and not the raw key value).

### Step 10 — N3: fix two stale comments in `lib/domain/Order.ts`
**File:** `lib/domain/Order.ts`
**Context:** two comments reference the deleted file `lib/orders/validation.ts`:
- **Line 234** (inside `CreateOrderInput` JSDoc): *"today: ad-hoc validation at
  `lib/orders/validation.ts`; F-08: zod"*. F-08 shipped; validation.ts is gone.
  Repoint to the current validation home (the zod schema used by the orders route)
  or generalise to "the route layer validates the request body (F-08: zod)".
- **Lines 263-264** (inside `CreateOrderLineInput` JSDoc): *"matches existing route
  behaviour at `lib/orders/validation.ts:175` — `lines: body.lines.map(...)`"*.
  Repoint to where line-number assignment now lives — the adapter's `createOrder`
  (`lib/adapters/supabase/OrdersRepository.ts:415-423`, `line_number: i + 1`) — or
  remove the file:line citation and keep the behavioural statement.

**Action:** verify the correct current location before editing (grep for the zod
order schema and confirm the adapter line numbers), then repoint or remove so the
comments are accurate. **Comments only — no behaviour change.**

🗣 **In plain English:** Two code comments still point at a file we deleted, like a
map marking a shop that's closed. We update them to point at where that logic
actually lives now (the request validator and the adapter), so the next reader isn't
sent to a dead address.

**Proven by:** N/A (comment-only); covered by the clean `tsc`/lint baseline staying
clean. A grep for `lib/orders/validation` in `lib/domain/Order.ts` must return zero
hits after the edit.

---

## 7. Test matrix (proposal for ANVIL)

```
ANVIL · F-TD-09
  Unit         ○  purge count · W1 conditional deletes · W1 boundary race · N1 log shape
  Integration  ○  cron 401 / 200+delete / leaves-unexpired · W1 same-key race
  DB / RLS     ○  none (no schema/RLS change)
  E2E/preview  ○  smoke: route 401 without secret (optional)
  🗣 every rung green before the cert prints
```

### Unit (vitest, Fake/seeded client — fast, no DB)
| # | Proves | Assertion |
|---|--------|-----------|
| U1 | purge returns count | Seed N expired + M unexpired key rows; `purgeExpiredIdempotencyKeys(now)` returns N. |
| U2 | purge leaves unexpired | After U1, the M unexpired rows still readable. |
| U3 | purge DB error → ServiceError | Force the client to error; expect `ServiceError("Idempotency-key purge failed")`. |
| U4 | service delegate forwards | Spy on the Fake repo; `ordersService.purgeExpiredIdempotencyKeys(now)` calls the port once with `now` and returns its number unchanged. |
| U5 | W1 expiry-guard narrows | Expiry-reclaim arm issues a delete carrying `expires_at <= now`; a row that is no longer expired is NOT deleted. |
| U6 | W1 order-guard narrows | Stale-order arm issues a delete carrying `order_id = existing.order_id`; a row pointing at a different order is NOT deleted. |
| U7 | W1 boundary race | Two same-key createOrder flows interleaved at the expiry tick: the fresh row survives; exactly one order resolves (assert via the guarded-delete behaviour at the adapter seam). |
| U8 | N1 log shape | The pathological-arm error log payload contains `winnerOrderId` and does NOT contain `idempotencyKey` / the raw key value. |

🗣 **In plain English:** Fast tests against a pretend database prove the broom
counts right, the two narrowed deletes refuse to bin a fresh row, and the error log
no longer prints the wristband.

### Integration (vitest against local Supabase — real DB)
| # | Proves | Assertion |
|---|--------|-----------|
| I1 | cron auth guard | `GET /api/cron/purge-idempotency-keys` with no / wrong Bearer → 401, deletes nothing. |
| I2 | cron happy path | Seed expired + unexpired rows; `GET` with `Bearer ${CRON_SECRET}` → 200 `{ ok: true, deleted: N }`; expired rows gone in the DB. |
| I3 | cron leaves unexpired | After I2, the unexpired rows remain in the DB. |
| I4 | W1 real same-key race | Fire two `createOrder` with the SAME key timed at/near the 24h boundary against the real DB; assert the DB ends with exactly ONE order for that key (not two) and one surviving key row. |

🗣 **In plain English:** Real-database tests prove the doorbell rejects strangers,
sweeps for the real scheduler, and that two identical requests at the boundary can
never produce two orders.

### E2E / preview
- **Optional smoke only:** a single `@critical`-style check that the route returns
  401 without the secret on a deployed preview (proves the env guard is wired). The
  full purge behaviour is already covered at the integration layer against a real
  DB, so a heavy preview test is not required.
- **No new E2E user journey** — this is a backend hygiene job with no UI surface.

🗣 **In plain English:** One light check on a live preview that the door is locked is
plenty; there's no screen for a user to click, so no full browser test is needed.

### CRON_SECRET in the test runner
The integration runner must have `CRON_SECRET` available to the booted dev server
(via `.env.test.local`, matching how the HACCP cron tests authenticate, if any
exist). Confirm/seed this in the test env so I1/I2 can construct the Bearer header.
🗣 The test needs to know the doorbell password to ring it.

---

## 8. N2 — documented, no code change

`rollbackOwnOrder` (`lib/adapters/supabase/OrdersRepository.ts:267-277`) logs on
failure rather than throwing. Per BACKLOG §F-TD-09 N2: **correct trade-off, no code
change.** That `[…loser rollback failed]` log line is the single alarm for a
surviving duplicate order; it is intentionally loud-but-non-fatal so a failed
rollback never breaks the caller's control flow. **Action: none.** Noted here so a
future reader does not "fix" it.

🗣 **In plain English:** One finding was reviewed and deliberately left as-is — its
current behaviour (shout in the logs but don't crash) is the right call. We write it
down so nobody changes it later thinking it was an oversight.

---

## 9. Risk assessment (Gate-2 inputs)

Severity scale: 🔴 must-fix (blocks Gate 2) · 🟠 address-in-unit · 🟢 note.

### Concurrency / race conditions
- **R-W1 (the W1 fix itself) — 🟠 address-in-unit.** The whole point of Step 8 is to
  close a TOCTOU. The fix must capture a single `now` and use the narrowed guards
  exactly as specified; a sloppy implementation (e.g. re-reading `now` per arm, or
  guarding on the wrong column) could re-open the hole or break normal reclaim.
  **Mitigation:** unit U5–U7 + integration I4 pin the exact behaviour; the guard
  predicates are spelled out in Step 8. **Must-fix:** no (the risk is mitigated by
  the specified tests; only a wrong implementation would fail them, which Guard
  catches).
- **Purge vs live reclaim — 🟢 note.** The daily purge and the read-time reclaim both
  DELETE expired rows; concurrent overlap is harmless (deleting an
  already-expired/already-deleted row is a no-op; PK is the arbiter). No locking
  needed. **Mitigation:** none required.

### Security
- **Cron auth — 🟠 address-in-unit.** The route is a public URL; only the
  `Bearer ${CRON_SECRET}` check stands between the internet and a DELETE. Identical
  posture to the existing HACCP cron. **Mitigation:** the 401 guard is the first
  statement; integration I1 proves it. **Must-fix:** no (matches an accepted
  existing pattern, tested).
- **N1 key leak — 🟠 address-in-unit (this IS the fix).** Resolved by Step 9.
  **Mitigation:** U8 asserts the raw key is gone from the log.
- **Purge runs as service-role — 🟢 note.** Bypasses RLS by design (ADR-0004), same
  as every other write in this adapter. No new exposure.

### Data migration / data loss
- **🟢 None.** No schema change, no migration, no PITR. The only DELETE targets rows
  that are ALREADY expired (past their 24h TTL) and already treated as dead at read
  time. Deleting them changes no live behaviour. **This is the headline safety
  property of the unit.**

### Business-logic flaws
- **Predicate `<=` vs `<` — 🟢 note.** Plan uses `.lte` to match the existing
  `isExpired` read-time semantics (`<=`). A row expiring at the exact tick is
  already treated as expired everywhere; deleting it is correct. Called out so it's
  a conscious choice, not a drift. **Mitigation:** documented in Step 1/2 + PR.
- **`.select('key')` to count — 🟢 note.** At this system's row volume (a handful/day)
  reading back deleted keys to count them is negligible. If volume ever grew, switch
  to a count strategy. **Mitigation:** none needed now; noted for future.

### Launch blockers
- **R1 — cron actually firing in prod — 🟠 address-in-unit, needs Hakan/Vercel
  confirmation (NOT a code blocker).** Code-side it is correct: daily schedule (Hobby
  allows it), proven mechanism (`compute-road-times` already fires), appended not
  replaced. **Two external confirmations** (NOT blockers to writing/merging code, but
  ship-checklist items): (a) `CRON_SECRET` is set in Vercel prod env; (b) the project
  is within the Hobby cron-count cap after adding a second cron (the deploy fails
  loudly if not). **Mitigation:** §5 records the evidence; ship-checklist verifies
  both in the Vercel dashboard. **Must-fix:** no — code is correct; these are deploy
  verifications.
- **STRICT typecheck/lint — 🟠 address-in-unit.** ANVIL runs `tsc --noEmit` and
  `next lint` STRICT (0 tolerated). Adding a method to the port means EVERY
  implementer (Supabase adapter + the Fake) must implement it or `tsc` fails — Step 3
  exists precisely for this. **Mitigation:** Steps 2+3 implement both; style matched
  per file (double-quote/semicolon in lib, single-quote/no-semicolon in the route).

**Must-fix risks (Gate-2 blockers): NONE.** No 🔴 items. All risks are mitigated
within the unit or are deploy-time verifications that don't block the plan.

🗣 **In plain English:** Nothing here is a hard blocker. The biggest "watch this" is
making sure Vercel's env actually has the cron password set and that we're under the
plan's cron limit — both are dashboard checks at ship time, not code problems. The
fix itself is safe because it only ever deletes rows that were already dead.

---

## 10. Rollback note

**Revert the PR.** Single-PR revert restores every file. **No data migration to
undo, no schema to roll back** — nothing in this unit altered the table or any live
row's meaning. Removing the `vercel.json` cron entry on revert simply stops the
nightly sweep (the table reverts to growing slowly, exactly as it did before this
unit). The W1/N1 reverts restore the prior (functionally-equivalent-in-practice)
behaviour. No PITR, no backfill.

🗣 **In plain English:** If anything's wrong, undo the one PR and we're exactly back
to today — no database surgery, no data to restore. Worst case the table just goes
back to slowly accumulating expired rows like before.

---

## 11. Acceptance criteria

- [ ] `app/api/cron/purge-idempotency-keys/route.ts` exists, modelled on
      `haccp-alarm` (401 on bad/absent Bearer; 200 `{ ok: true, deleted: N }`; logs a
      count; 500 in try/catch); imports `ordersService` from `lib/wiring/orders.ts`
      and NO adapter.
- [ ] `OrdersRepository` port has `purgeExpiredIdempotencyKeys(now: Date): Promise<number>`.
- [ ] Supabase adapter implements it as a guarded DELETE returning the count.
- [ ] The Fake repository implements it (so `tsc` STRICT passes).
- [ ] `OrdersService` exposes the thin delegate.
- [ ] `vercel.json` has the purge cron appended (`0 3 * * *`), `compute-road-times`
      preserved.
- [ ] W1: both reclaim deletes in `createOrder` step 0 are conditional
      (`expires_at <= now` / `order_id = existing.order_id`).
- [ ] N1: the pathological-arm error log no longer contains the raw `idempotencyKey`.
- [ ] N3: zero references to `lib/orders/validation.ts` remain in `lib/domain/Order.ts`.
- [ ] N2: unchanged (documented).
- [ ] Baselines stay clean: `tsc --noEmit` = 0, `next lint` = 0; existing unit +
      integration suites still green; new tests (§7) added and green.
- [ ] Cron-firing evidence (§5) recorded in the PR; ship-checklist items for
      `CRON_SECRET` + Hobby cron cap noted.

🗣 **In plain English:** The done-list: the nightly broom exists and is locked, the
sweep logic lives in the right vendor room behind the right socket, the timing hole
and the log leak are closed, the dead-file comments are fixed, nothing else broke,
and we've written down the two Vercel-dashboard checks for ship day.
