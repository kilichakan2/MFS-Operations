# Code-critic Guard review — F-TD-09 idempotency-key hygiene (PR #34)

- **Date:** 2026-06-14
- **Branch:** f-td-09-idempotency-key-hygiene
- **PR:** #34
- **Reviewer:** code-critic (FORGE Guard)
- **Verdict:** FIX-THEN-SHIP — no 🔴 blockers; one 🟡 (test-coverage gap, ANVIL-owned)

## Gate results
- `npx tsc --noEmit` — PASS, 0 errors
- `npm run lint` (next lint) — PASS, 0 problems
- `npx vitest run` (unit) — PASS, 76 files / 1533 tests green (incl. 5 new)
- Integration / e2e — not run (ANVIL's job; needs Docker + live Supabase + CRON_SECRET)

## Findings

### W1 — TOCTOU fix (heart of the PR)
- 🟢 `lib/adapters/supabase/OrdersRepository.ts:240-258, 394-425` — guarded delete correct; closes the race in the safe direction. `expiredAt` guard adds `.lte("expires_at", now)`; `orderId` guard adds `.eq("order_id", existing.order_id)`. A concurrent fresh row planted at the expiry tick is never clobbered.
- 🟢 `<=` semantics consistent across all three sites: `isExpired` (line 203), W1 guard (line 247 `.lte`), purge (line 948 `.lte`). No `<` vs `<=` mismatch.
- 🔵 `OrdersRepository.ts:395-398` — the `now` comment slightly oversells ("same instant the row was read at"): `now` is captured BEFORE `readIdempotencyKey`, while `isExpired` calls `Date.now()` AFTER. In the window `now < expires_at <= Date.now()`, `isExpired` says expired but the guard refuses (0 rows) — control falls through to the plain INSERT at step 3, the surviving row triggers a 23505, loser re-reads and replays the original order. Correct behaviour; reword comment to "captured before the read so the guard's clock is conservative."

### Purge adapter
- 🟢 `OrdersRepository.ts:944-955` — DELETE scoped `.lte("expires_at", now)`; count via `.select("key")` then `(data ?? []).length`; error path throws `ServiceError` per file convention.

### Cron route security
- 🟢 `app/api/cron/purge-idempotency-keys/route.ts:15-18, 28` — Bearer check matches shipped haccp-alarm; missing/blank header → 401 fail-closed; try/catch → 500; imports only `@/lib/wiring/orders` (no adapter import, Lego-clean).
- 🔵 `route.ts:17` — if `CRON_SECRET` unset, expected string is literal `"Bearer undefined"` (a caller could send it). Identical to shipped `haccp-alarm/route.ts:66`; Vercel injects the secret in all envs. Pre-existing pattern, not introduced here. Optional hardening: early-return 500 if `!process.env.CRON_SECRET` (apply to both routes, separate backlog item).

### Hexagonal / Lego
- 🟢 Depth verdict on `purgeExpiredIdempotencyKeys(now): Promise<number>` (`lib/ports/OrdersRepository.ts:508`): DEEP ENOUGH, not a pass-through. Hides table name, `.lte` predicate, `.select`-to-count trick, `ServiceError` mapping. Deletion test: remove it → cron must import the Supabase client and write the DELETE (Lego breach) → complexity concentrates in the adapter. Same depth class as `findOrderById`/`listKdsQueue`. No new deps; rip-out stays 1 adapter + 1 wiring line.
- 🟢 Service delegate (`lib/services/OrdersService.ts:406-407`) — documented thin pass-through, consistent with `listOrders`/`findOrderById`/`listKdsQueue`.

### Test quality
- 🟡 **SHOULD-FIX (coverage gap, ANVIL-owned)** — W1 guards and the purge DELETE have NO executable coverage in this PR. The fake no-op comment (`lib/adapters/fake/OrdersRepository.ts:331-333`) and the unit test header (`tests/unit/adapters/supabase/purgeIdempotencyKeys.test.ts:21-24`) defer W1 + purge to "the integration suite (F-TD-09 §7 I2/I3/I4)" — but `git diff main...branch -- tests/integration/` is empty; those specs don't exist on this branch. Existing `tests/integration/orders-idempotency.test.ts` covers replay/concurrent/cross-user/length-cap, but no expired-reclaim-guard, no stale-orderId-guard, no purge test. **Binding condition: ANVIL must write I2/I3/I4 before ship; if the integration layer returns without them, this becomes a blocker at ship.**
- 🟢 Purge unit tests behaviour-based, not tautological — drive the real adapter factory against a PostgREST stub; assert the chain (`delete → lte → select`), exact predicate args, count, null→0, error→`ServiceError`. The structural assertion pins `.select()` presence, so a dropped-`.select()` regression (silent 0 count) would fail.
- 🟢 Service pass-through test (`tests/unit/services/OrdersService.test.ts:674-696`) spies the port, proves the delegate forwards exact `now` + returns count untransformed, plus architecture-pin that the method exists.
- 🔵 Unit stub can't prove PostgREST semantics (returns canned data regardless) — inherent mock limit; exactly why the deferred integration test is load-bearing.

### Conventions
- 🟢 Per-file style correct: cron route single-quote/no-semi (matches haccp-alarm); port/adapter/service double-quote/semi.
- 🟢 N1 log scrub (`OrdersRepository.ts:503-513`) — raw `idempotencyKey` removed from race-winner-unreadable error log; `winnerOrderId` retained.
- 🟢 N3 comment repointing (`lib/domain/Order.ts:230-237, 260-266`) — verified: `lib/orders/validation.ts` deleted; new targets exist (`lib/api/orders/schemas.ts` `createOrderBodySchema` line 164; line-number assignment in the adapter).
- 🟢 `vercel.json` — `0 3 * * *` daily, well-separated from `0 2 * * 0`.

## Loop-back instruction
No 🔴 → hand to ANVIL (no loop back to Frame/Order/Render). Binding condition: ANVIL must write the deferred integration specs (I2 expiry-tick reclaim, I3 stale-order reclaim, I4 purge count against live DB). The 🟡 must NOT close silently — missing I2/I3/I4 at the integration layer = blocker at ship. Optional non-blocking follow-ups: reword W1 `now` comment (lines 395-398); `CRON_SECRET`-unset hardening across both cron routes (backlog).
