# ANVIL Clearance Certificate — CLEARED (conductor Lock complete 2026-06-26)

Date: 2026-06-26
App: MFS-Operations
Branch: feat/f25-pushsender-cron-cutover
PR: #85 — https://github.com/kilichakan2/MFS-Operations/pull/85
Head SHA: 9894bf450b8251ee3126bcb655f44da9ec5ab4a2

## Scope — what this certificate actually covers

F-25 is a behaviour-preserving hexagonal re-point: the `web-push` SDK + two
raw-Supabase tables (`push_subscriptions`, `alarm_sessions`) moved behind 3 new owned
ports (`PushSender`, `PushSubscriptionsRepository`, `AlarmSessionsRepository`); the
existing `HaccpReportingRepository`/Service gained one additive overdue-read
(`fetchAlarmOverdueInputs` / `getAlarmOverdueStatus`); the cron's escalation/cleanup
logic lifted into a `runHaccpAlarmCheck` usecase with `now` injected; `lib/webpush.ts`
deleted. All 3 routes (`app/api/cron/haccp-alarm`, `app/api/notifications/{vapid-key,
subscribe}`) now import ZERO adapters and ZERO vendor SDKs. **NO migration, NO RLS
change, NO new dependency, NO UI change.**

| Change / path                                                              | Risk tier               | Layers required                                            | Layers run                                              |
| -------------------------------------------------------------------------- | ----------------------- | --------------------------------------------------------- | ------------------------------------------------------- |
| `app/api/cron/haccp-alarm/route.ts` → `runHaccpAlarmCheck` usecase         | Medium (UI-adjacent backend / cron) | Unit + Integration + E2E(@critical)                       | Unit + Integration (live cron smoke) + E2E (75/75)      |
| `app/api/notifications/{vapid-key,subscribe}/route.ts` → ports/wiring      | Medium                  | Unit + Integration                                        | Unit (route tests) + Integration (live adapter contracts) |
| New seams: `PushSender`, `PushSubscriptionsRepository`, `AlarmSessionsRepository` (port/adapter/fake/contract/wiring) | Medium (crosses a seam) | Unit (fake + contract) + Integration (real adapter contract) | Run — fake unit 15/15 + live Supabase contracts 8/8     |
| Additive read on `HaccpReportingRepository`/Service (overdue inputs)       | Medium                  | Unit (frozen-clock service) + Integration (live shape parity) | Run — service unit + live `fetchAlarmOverdueInputs` 1/1 |
| `runHaccpAlarmCheck` usecase (escalation/cleanup loop, `now` injected)     | Medium                  | Unit (frozen-clock fakes, every branch) + 🟡-1 throw-propagation | Run — 13/13 (8 byte-identity branches + 5 new throw-propagation) |

**Not run under the efficiency dial:** None — full ladder run (unit + live-Supabase
integration + @critical preview smoke). NO exhaustive every-button browser sweep:
this is a backend-only re-point with byte-identical response shapes and ZERO UI change,
so the standard @critical smoke is the right depth (per the right-sizing rule for a
no-UI, no-RLS behaviour-preserving re-point — same call as F-20 PR3 / F-21).
**Baseline characterisation pass?** No — diff-driven, behaviour-preserving re-point.

**Architecture rung (seam crossed):** PASS. Each of the 3 new ports has a
domain-agnostic `__contracts__` suite run against BOTH the in-memory Fake (unit) and
the real Supabase / web-push adapter. The `no-adapter-imports` fence test is green —
the 3 routes import ZERO adapters/vendor SDKs; only `lib/wiring/**` bolts concrete
adapters to factories. Verified scan: NO vendor SDK (`web-push`, `@supabase/supabase-js`)
imported anywhere under `lib/domain`, `lib/ports`, `lib/services`, `lib/usecases`, or
their tests.

🗣 In plain English: the new "swap points" are real — the cron logic runs on pretend
push/DB stand-ins in the fast tests and on the real web-push + Supabase in the slow
tests, and the same behaviour checklist passes on both. The app's core never reaches
for the vendor directly; swapping push provider or DB later = one new adapter + one
wiring line.

## Test Results

| Layer                                      | Status                  | Notes                                                                                                  |
| ------------------------------------------ | ----------------------- | ------------------------------------------------------------------------------------------------------ |
| Unit (Vitest)                              | ✅ 2611/2611             | Full suite (177 files). F-25-specific incl. the NEW 🟡-1 throw-propagation suite (5 cases) on `runHaccpAlarmCheck` |
| `tsc --noEmit`                             | ✅ clean                 | Whole project typechecks                                                                                |
| Integration (Vitest, live local Supabase)  | ✅ 12/12                 | 3 adapter contracts on real Postgres (PushSubscriptions 4/4 · AlarmSessions 4/4 · HaccpReporting overdue-inputs 1/1) + booted-server cron route smoke 3/3 |
| Database (pgTAP)                           | n/a — not required      | No migration, no RLS/policy change in this PR                                                           |
| Edge Functions (Deno)                      | n/a — not required      | None touched                                                                                            |
| Local full-stack rung                      | ✅ Supabase CLI adapter  | Local stack already up + healthy; integration ran against it; E2E ran against the preview              |
| E2E (@critical preview smoke)              | ✅ 75/75 first run       | Against PR #85 Vercel preview `mfs-operations-i48m60lcc-…vercel.app`; readiness-gated on `/api/auth/team`=200; NO F-TD-37 flake, NO branch reset needed (5.4m) |
| Populated UI smoke                         | n/a — no UI change      | F-25 changes zero UI; the @critical suite's HACCP/data-dependent specs (delivery, cold-storage, reviews data-row, audit dashboard) all rendered + passed |
| Breadth crawl                              | covered by @critical 75/75 | The standard @critical suite walks every major screen incl. all HACCP surfaces                       |

🗣 In plain English: every layer green. Fast logic tests (2611), real-database tests
(12, including actually starting the app and calling the cron URL), and 75 real-browser
journeys on the live preview — all passed on the first run.

### The new 🟡-1 throw-propagation test (Guard follow-up, decision LOCKED by Hakan)

`tests/unit/usecases/runHaccpAlarmCheck.test.ts` gained a 5-case suite pinning the
**deliberate hardening** over the old route's silent 200-swallow: when a
subscription/alarm-session repo operation **throws** a `ServiceError`, the usecase
**propagates the throw** (so the route's outer catch returns 500) rather than
swallowing it and returning `{ ok:true }`. Covers all four repo seams the cron loop
touches plus the nothing-overdue path:

- `subscriptions.listAll` throws → propagates
- `alarmSessions.findActiveBySubscriptionAndKey` throws → propagates
- `alarmSessions.insert` throws (new-session path) → propagates
- `alarmSessions.updateCount` throws (after a successful send) → propagates
- `alarmSessions.resolveAllActive` throws (nothing-overdue path) → propagates

Behaviour-based through the public `run(now)` interface — each test wraps the real
in-memory fake and overrides exactly ONE method to reject (the shared fakes are
unchanged, so the contract tests are untouched).

🗣 In plain English: the old cron quietly said "all good" even when the database
failed under it. The new code lets the failure surface as a 500 — and these 5 tests
prove it surfaces from every place the failure could start, instead of being swallowed.

## Iterate log (2 loops max — used 0)

No failures. Every layer passed on its first run. No re-run loops needed.

## Real-code bugs requiring a FORGE eject

**NONE.** No `/reorder`, `/reframe`, or `/rerender` needed. (Guard / code-critic had
already passed with NO BLOCKERS; ANVIL confirms green across all layers.)

## Known out-of-scope note (NOT an F-25 issue)

The `haccp-alarm` cron is **not registered in `vercel.json` crons** — tracked as
BACKLOG **F-PROD-03**. F-25 is behaviour-preserving and explicitly does NOT change
whether the cron fires in production; registering it is out of this PR's scope.

🗣 In plain English: separate from this change, the overdue-alarm job isn't actually
scheduled to run in production yet. That's a known, pre-existing gap logged for later —
this PR only re-wired the job's internals, it didn't (and wasn't meant to) turn it on.

## Migration

None. Rollback note: `docs/anvil/2026-06-26-f25-pushsender-cron-cutover-rollback.md`
(code-only — revert the merge / promote the previous Vercel build; no `db push`, no
schema change, no PITR). PITR confirmed: N/A (no migration, no destructive operation).

## Merge Sequence

1. (No migration — skip `supabase db push`.)
2. Merge PR #85 → Vercel auto-deploys.
3. Post-deploy smoke: 3 @critical paths against the production URL.
4. If smoke fails → `vercel rollback` / promote previous prod build (code only; no data
   to recover).

Supabase preview branch (PR #85's Branching DB) auto-deletes on merge.

## Manual smoke at merge

**Not required** — critical flows proven on the real preview with real data
(@critical 75/75 first-run), the re-pointed cron route proven end-to-end on live
Postgres (booted-server smoke + 3 adapter contracts), and the post-deploy smoke is
armed with a code rollback. No UI changed, so no populated-UI or breadth-crawl gap to
name. The only out-of-scope item (cron not in `vercel.json`, F-PROD-03) is named above
and is pre-existing, not introduced by this PR.

## Verdict

✅ CLEARED FOR PRODUCTION — Lock gate complete (no destructive migration → PITR N/A; pre-ship @critical preview smoke 75/75 first-run; rollback armed). Conductor approved 2026-06-26.
