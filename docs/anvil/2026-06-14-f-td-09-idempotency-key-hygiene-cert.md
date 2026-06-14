# ANVIL Clearance Certificate

> Drafted by the ANVIL runner (Nail → Verify → Iterate); **finalised by the conductor at
> the Lock gate 2026-06-14** (tsc 0 re-confirmed on the working tree; non-destructive →
> no PITR). The preview `@critical` smoke runs at the conductor's pre-ship step before
> Gate 4. The runner does not ship.

Date: 2026-06-14
App: MFS-Operations (Mangal Food Services — operations app)
Branch: f-td-09-idempotency-key-hygiene
PR: #34

## Scope — what this certificate actually covers

| Change / path | Risk tier | Layers required | Layers run |
| --- | --- | --- | --- |
| `lib/adapters/supabase/OrdersRepository.ts` — W1 TOCTOU guard on the two `createOrder` reclaim arms; N1 log no longer emits raw `idempotencyKey` | **High** (concurrency-correctness on order creation) | Unit + Integration (adapter, real DB) + E2E regression | Unit ✓ · Integration ✓ (I2/I3) · E2E ✓ |
| `app/api/cron/purge-idempotency-keys/route.ts` — new GET cron route (Bearer auth → delegate → `{ ok, deleted }`); `vercel.json` `0 3 * * *` | Medium (auth + DB delete) | Unit + Integration (HTTP, real DB) + E2E 401 sentinel | Unit ✓ · Integration ✓ (I4) · E2E ✓ |
| `lib/ports/OrdersRepository.ts` + `lib/adapters/fake/OrdersRepository.ts` + `lib/services/OrdersService.ts` — `purgeExpiredIdempotencyKeys` port method, fake no-op, service delegate | Low–Med | Unit | Unit ✓ |
| `lib/domain/Order.ts` — N3 two stale comments repointed (comment-only) | Low | none (comment-only) | n/a |

**Not run under the efficiency dial:** None of substance. The high-risk W1 concurrency
fix got the full ladder (unit + adapter-direct integration against the real local DB +
critical E2E regression). The Vercel-preview `@critical` smoke is **deferred to the
conductor's pre-ship step** (no preview URL was available to the runner); the conductor
runs it before the ship gate as standard.
**Baseline characterisation pass?** No — this is a diff-driven pass on PR #34.

🗣 In plain English: the cert spells out that the riskiest thing here (the race-condition
fix on order creation) was tested hardest, the new nightly cleanup job was proven end-to-end
against a real database, and the only thing left is re-confirming the three must-not-break
flows on the actual Vercel preview — which the conductor does just before shipping.

## Guard homework — the binding item this run existed to close

The code-critic Guard passed PR #34 with **no 🔴 blockers** but **one 🟡**: the W1 TOCTOU
guard and the purge DELETE had **zero executable coverage** — deferred to integration specs
that did not yet exist. This run wrote and ran them. **The 🟡 is cleared.**

| Test (new) | File | Asserts | Result |
| --- | --- | --- | --- |
| I2 — expired-key reclaim under the expiry guard | `tests/integration/adapters/supabase/OrdersRepository.test.ts` | A genuinely-expired key, replayed same-caller, reclaims via the `expiredAt`-guarded delete → a brand-new order wins, the key maps to the NEW order, exactly one order survives. Proves the guard didn't break the normal expired-reclaim path. | ✅ |
| I2 — expiry guard refuses to clobber a FRESH row | `tests/integration/adapters/supabase/OrdersRepository.test.ts` | The exact guarded delete (`expires_at <= staleReadInstant`) pinned to a past instant is a NO-OP against a fresh (`now + 24h`) row → fresh key + order survive, same-key replay returns that same order, one order survives. Proves the TOCTOU guard. | ✅ |
| I3 — stale-order reclaim is surgical | `tests/integration/adapters/supabase/OrdersRepository.test.ts` | The `order_id = <stale>`-guarded delete removes only the row it read; a fresh same-key row pointing at a different live order survives → replay resolves to the fresh order, one order survives. | ✅ |
| I4 — purge route, no Bearer → 401, deletes nothing | `tests/integration/orders-idempotency.test.ts` | Unauthenticated GET → 401 over real HTTP; a seeded expired row is untouched. | ✅ |
| I4 — purge route, wrong Bearer → 401 | `tests/integration/orders-idempotency.test.ts` | Wrong token → 401. | ✅ |
| I4 — purge route, correct Bearer → 200 | `tests/integration/orders-idempotency.test.ts` | Authenticated GET → 200 `{ ok:true, deleted }`; rows with `expires_at <= now` removed, rows with `expires_at > now` left intact, `deleted` count accurate (≥ the seeded expired rows; per-row gone/kept assertions pin the specific fixtures). | ✅ |
| I4 — second purge is a clean no-op | `tests/integration/orders-idempotency.test.ts` | Immediate re-run → 200, numeric `deleted`. | ✅ |

Test-infra changes made to run I4 (test-only, gitignored / shared test config — no app code):
- `tests/integration/_config.ts` — added `INTEGRATION_CRON_SECRET` (single source of truth;
  prefers a real `CRON_SECRET` in env, else a throwaway local value).
- `tests/integration/_globalSetup.ts` — injects `CRON_SECRET` into the spawned dev server's
  env so the I4 200-path authenticates.
- **`.env.test.local` was NOT modified** — the harness shields that file; the shared-config
  approach above supersedes it and keeps the test and server in lock-step (no real secret involved).

## Test Results

| Layer | Status | Notes |
| --- | --- | --- |
| Type check (`tsc --noEmit`) | ✅ 0 errors | strict baseline held with new test files |
| Lint (`next lint`) | ✅ 0 warnings/errors | strict baseline held |
| Unit (Vitest) | ✅ 1533/1533 (76 files) | matches baseline; includes the 5 new F-TD-09 unit tests + `OrdersService` delegate test |
| Integration (Vitest, real local Supabase) | ✅ 122/122 (12 files) | includes I2/I3/I4 + all pre-existing idempotency tests (replay / concurrent / cross-user / length-cap / F-TD-10 form-shape) still green |
| Database (pgTAP) | n/a — not required | No schema change. RLS on `order_idempotency_keys` re-confirmed by direct DB inspection: `relrowsecurity = t`, **0 policies** (deny-all, service-role bypass only), columns unchanged. No drift → no new pgTAP file. |
| Edge Functions (Deno) | n/a — not required | No edge functions touched. |
| E2E (Playwright, local dev server) | ✅ 8/8 `@critical` + 1 purge-401 sentinel | order placement, picking-list print/lock/reprint, KDS butcher PIN flow all green; new `api`-project sentinel: `GET /api/cron/purge-idempotency-keys` no-Bearer → 401 |

## Warnings (non-blocking)

None. (The I4 no-Bearer test took 192ms on first hit — that is the new route's first
dev-mode compilation, not flakiness; subsequent calls were single-digit ms.)

## Migration

None — additive code only, no `supabase/migrations/` change. **Non-destructive.**
Rollback script: not applicable (no schema/data change).
PITR confirmed: N/A (no destructive migration; PITR not required).

**Rollback note:** revert PR #34. There is no data or schema to undo — the only persistent
side effect of this code is rows being *deleted* from `order_idempotency_keys` by the nightly
cron, which is the intended TTL hygiene and is itself idempotent/recoverable (keys are
short-lived, 24h TTL). The `vercel.json` cron entry deactivates automatically on revert.

## Merge Sequence (no migration → code-only)

1. No `supabase db push` needed — there is no migration in this PR.
2. Merge PR #34 → Vercel auto-deploys.
3. Conductor's pre-ship `@critical` smoke on the current Vercel preview (the deferred E2E
   preview run), then post-deploy 3-path smoke on prod.

## Verdict

✅ CLEARED FOR PRODUCTION — Lock gate passed 2026-06-14; **SHIPPED + prod-verified 2026-06-14**.

## Production ship record

- **Merged:** PR #34 squashed to `main` as `29987df` (2026-06-14).
- **Preview `@critical` smoke (pre-ship):** 8/8 green on `mfs-operations-7bba015u1-…vercel.app`
  (commit `189d305`, the exact ship build); previewProbe confirmed a seed-born preview DB.
- **Production deploy:** `dpl_HRL9oorx5StM3ueTVwAKv62HkgEz` (target=production) READY on www.mfsops.com.
- **Deploy-time checks (both passed):** the 2nd cron did NOT exceed the Vercel Hobby cap
  (deploy succeeded, not rejected); the new cron route is live and fails closed (401 unauth),
  confirming `CRON_SECRET` auth is wired.
- **Post-deploy production smoke (all green):**
  - `GET /login` → **200**
  - `GET /api/kds/orders` → **200**
  - forged `mfs_session` cookie on `/` → **307** (fail-closed redirect)
  - `GET /api/cron/purge-idempotency-keys` unauth → **401** (new route live + locked)
- **Migration / PITR:** none — code-only, non-destructive.
- **Rollback (unused):** `vercel rollback` to the prior production deployment; no data/schema to undo.
- **First daily purge** fires at the next `0 3 * * *` (03:00 UTC).
