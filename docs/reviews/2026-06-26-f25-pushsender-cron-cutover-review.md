# FORGE Guard review — F-25 PushSender port + HACCP-alarm cron cutover

**Date:** 2026-06-26
**PR:** #85 · branch `feat/f25-pushsender-cron-cutover` · base `main` @ `7211aad`
**Reviewer:** code-critic (FORGE Guard, sole review authority for this pass)
**Verdict:** **NO BLOCKERS — hand to ANVIL.** One conscious Gate decision (🟡-1) + one follow-up test (🟢) recorded.

---

## Toolchain results
- `tsc --noEmit`: clean.
- `eslint` (changed routes + lib): clean.
- Unit suite: 177 files, **2606/2606 pass** (incl. 5 new F-25 suites: usecase, reporting-alarm-status, web-push adapter, fakes, routes, + 5 new `no-adapter-imports` F-25 cases).
- Integration suites (Supabase contract for both new repos + `fetchAlarmOverdueInputs`) present in the diff but require live local Supabase — not run at Guard; ANVIL runs them on the live DB.

## Depth verdicts (new/touched modules) — all DEEP, no pass-through / speculative seam
- `lib/usecases/runHaccpAlarmCheck.ts` → **DEEP** — `run(now)` hides the full escalation/cleanup loop, insert-0 quirk, first-false break, cleanup. Deletion test: removing it pushes all that back into the route.
- `lib/ports/PushSender.ts` + `lib/adapters/web-push/PushSender.ts` → **DEEP, real seam** — two-method socket hiding VAPID init + vendor send/error mapping; genuinely substitutable (swap vendor = one adapter + one wiring line).
- `lib/ports/AlarmSessionsRepository.ts` + Supabase/Fake → **DEEP** — five named ops hide `.single()`/PGRST116 mapping + insert-0 semantics.
- `lib/ports/PushSubscriptionsRepository.ts` + Supabase/Fake → **DEEP** — listAll/deleteByEndpoints/upsert; real table behind it.
- `HaccpReportingService.getAlarmOverdueStatus` + repo `fetchAlarmOverdueInputs` → **DEEP** — threshold inference is real behaviour; adapter does the 4 raw reads, service maps to the overdue shape.

## Hexagonal boundary — all clean
- `web-push` imported in **exactly one file** (`lib/adapters/web-push/PushSender.ts`); `lib/webpush.ts` deleted; no stale `@/lib/webpush` runtime import (only doc-comments).
- `.eslintrc.json` fences `web-push` in base `paths` + services/usecases override + adds `lib/adapters/web-push/**` to the adapter override — pinned by 5 new `no-adapter-imports` cases (R5 honoured).
- All **3 routes import zero adapters / zero vendor SDKs**: cron→`@/lib/wiring/haccpAlarm`, vapid-key→`@/lib/wiring/pushSender`, subscribe→`@/lib/wiring/pushSubscriptions` (R7 honoured — subscribe upsert genuinely re-pointed).
- `lib/ports/**` + `lib/domain/**` pure TS. Singletons only in `lib/wiring/`; factories elsewhere. `lib/wiring/pushSubscriptions.ts` is a correct minimal composition root (R7 consequence), not a smell. **Rip-out test PASSES.**

## Byte-identity verdict
**Holds on every happy path and every normal-business path.** One narrow divergence on the infra-error path (🟡-1). Confirmed identical: cron 401 + outer-catch 500 + console.error; empty-subscriptions short-circuit (`overdue: count` while `sent:0`); nothing-overdue resolve; insert-0-then-update quirk (R1, pinned both paths); per-item send (`tag:'haccp-'+item.key`, url:'/haccp', requireInteraction:true, `{TTL:300, urgency:'high'}`, 404/410-warn vs other-error logging); R4 log line byte-identical (now in usecase); R9 `.single()` only-PGRST116→null; `fetchAlarmOverdueInputs` preserves the route's `.data ?? []` no-error-inspection read; determinism (R2) `now` injected, `nowIso` once, zero `new Date()` in usecase/service/adapters.

## 🟡 Warnings (non-blocking)

**🟡-1 · DB-error path no longer byte-identical (conscious Gate decision).**
The original cron route **silently swallowed** DB errors (destructured only `data`, never `error`):
- subscriptions `listAll` error → old route got `null` → returned **200 `{ok:true,sent:0,overdue:N}`**.
- `alarm_sessions` resolve/find/insert/updateCount + `push_subscriptions` delete errors swallowed; loop degraded but still **200**.

The new repo adapters **throw ServiceError** on any DB error; no try/catch in the usecase → propagates to the route's outer catch → **500 `{error:'Server error'}`**. So on a DB failure the wire response flips 200→500.
Assessment: almost certainly an **improvement** (old behaviour = silent-failure latent bug; 500 + console.error is more observable on a service-role infra fault) and affects only the exceptional infra-error path, never a happy/normal path. But the locked contract is strict byte-identity on "any wire response/status code," so it changes one.
**Disposition (F-21 precedent — DB-error string drift, accepted):** accept the hardening and document as an intentional error-path-only deviation, OR wrap the usecase calls to swallow-and-continue. **Recommend accept + document** — do not silently swallow real DB errors again.

**🟡-2 · subscribe/route.ts:53 log-string drift (cosmetic, no action).**
Original logged raw PostgREST `error.message`; new path logs the ServiceError message `"Failed to save subscription"` (underlying PG error on `.cause`). Wire response (`500 {error:'Failed to save subscription'}`) identical; only the server log line differs. Note only.

## 🟢 Test-quality
- New suites are behaviour-based through public interfaces, frozen-clock, pinning every byte-identity branch (empty-subs, nothing-overdue, insert-0-then-update, escalation increment, first-false break + cleanup, multi-item tally, exact log string, `overdueKey` sort). web-push adapter tested against a mocked vendor (no real network). Shared contracts run against both fake and live Supabase adapter. Pocock standard.
- **Gap (ties to 🟡-1):** no test pins the cron's behaviour when a subscription/alarm-session DB op throws. Whichever way 🟡-1 is decided, add one usecase test asserting the chosen behaviour (throw→500, or swallow→continue) so it's locked against drift.

## Verdict summary
| Dimension | Result |
|---|---|
| Security | ✓ no findings (service-role posture unchanged, Bearer auth verbatim) |
| Correctness | 🟡 1 error-path byte-identity divergence (DB error → 500 vs old 200) |
| Conventions | ✓ hexagonal boundary clean · web-push fenced · routes adapter-free |
| Depth | ✓ all new modules DEEP, no pass-through/speculative seam |
| Tests/tsc/lint | ✓ 2606/2606 · tsc clean · eslint clean |

**NO BLOCKERS — hand to ANVIL.** Two items to the ship record: (1) 🟡-1 conscious accept-the-hardening decision; (2) add the one usecase test pinning it.
