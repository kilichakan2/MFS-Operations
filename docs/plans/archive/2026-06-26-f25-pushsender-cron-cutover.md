# F-25 — PushSender port + full hexagonal cutover of the HACCP-alarm cron

**Date:** 2026-06-26
**Unit:** F-25 (Day 15 of the 16-day sprint; sibling of the F-20/F-21 re-point series)
**Status:** Plan — locked spec approved at FORGE Gate 1; Gate 2 decisions LOCKED (below)
**Author:** forge-planner

---

## Gate 2 — LOCKED DECISIONS (these OVERRIDE the discussion in the R-section)

Hakan decided at Gate 2. Implementer: follow THESE, ignore any "decide/recommend/
TBD" hedging later in this doc.

- **R7 = RE-POINT (option a1).** Add `upsert(input)` to `PushSubscriptionsRepository`
  and re-point `app/api/notifications/subscribe/route.ts` onto it. After F-25 ALL
  THREE routes import zero adapters; acceptance criterion 1 stands in full; rip-out
  test PASSES across the board. (Adds 1 port method + 1 supabase/fake impl + 1
  contract case + a ~4-line route edit.)
- **R8 = BACKLOG, do NOT touch.** F-25 stays strictly behaviour-preserving — do NOT
  add `/api/cron/haccp-alarm` to `vercel.json`. Logged as a separate backlog item
  (the alarm may not be firing in prod; that's a separate decision after confirming
  intended behaviour).
- **R4 = log line MOVES INTO the usecase.** `console.log('[haccp-alarm] Overdue: N,
  Sent: sent/total')` lives in `runHaccpAlarmCheck` (it has N, sent, and total). The
  string is byte-identical; the route no longer logs.
- **R1, R3, R5, R6, R9 = as written in the plan** (preserve the count:0-then-update
  quirk; delete dead `getMonthStart`; add the `web-push` eslint fence BEFORE the
  route re-point; delete `lib/webpush.ts` after re-pointing; use `.single()` mapping
  only the no-row code).

🗣 Two of the three open questions are now settled: give the device-sign-up save its
own socket too (so we can honestly say no route touches a vendor), and leave the
"is the alarm even scheduled?" question for later — we don't change whether it fires.

---

## Goal

Behaviour-preserving hexagonal re-point of the HACCP-alarm push pipeline. After
this unit the alarm cron route and the two notification routes import **ZERO**
`lib/adapters/*` and **ZERO** vendor SDK. The one remaining vendor-outside-adapter
breach in the whole codebase (`web-push` imported in `lib/webpush.ts`) is closed.
Three brand-new owned seams (`PushSender`, `PushSubscriptionsRepository`,
`AlarmSessionsRepository`) + one additive method on the existing HACCP reporting
seam + one orchestration usecase that holds the escalation/cleanup logic
**BYTE-IDENTICALLY**.

🗣 The "nag staff when a HACCP check is overdue" job currently reaches straight
into the push-notification vendor and the database from inside a web route. We're
moving the vendor behind a labelled socket, giving the two database tables their
own sockets, and lifting the every-5-minutes escalation logic into one in-house
"alarm desk" — so the alarm behaves identically but nothing in the route is wired
to a vendor any more.

**Explicitly OUT OF SCOPE (locked):** no DB migration, no RLS change, no new
package dependency (`web-push` + `@types/web-push` already in `package.json`), no
UI change, no change to any wire response / status code / log line, no change to
`lib/haccp-alarm-status.ts` (pure logic — reused as-is), no touching
`app/api/notifications/unsubscribe` (it never imported webpush).

🗣 We are only re-routing pipes and moving arithmetic. We are not changing the
vendor, adding packages, touching the database schema, the locks on the doors, or
what the user sees.

---

## Mini-map

```
DOMAIN (HACCP-alarm core)
  ├─ runHaccpAlarmCheck (NEW usecase) → composes the 4 seams below, owns escalation/cleanup
  ├─ PushSender (NEW port) → [web-push] (NEW adapter) + [Fake]
  ├─ PushSubscriptionsRepository (NEW port) → [Supabase] + [Fake]
  ├─ AlarmSessionsRepository (NEW port) → [Supabase] + [Fake]
  └─ HaccpReportingRepository (EXISTING port, +1 read method) → [Supabase] + [Fake]
🗣 cron route stops touching the vendor + DB; it calls one desk that does identical work
```

---

## Domain terms (plain-English)

- **PushSender** — a NEW port (`lib/ports/PushSender.ts`) + a NEW vendor adapter
  (`lib/adapters/web-push/`). The app's own socket for "deliver this push to this
  device." 🗣 The socket the push vendor plugs into; the rest of the app never
  sees `web-push` again. Closes the last vendor-outside-adapter breach.
- **PushSubscriptionsRepository** — NEW port + Supabase adapter + Fake. The
  labelled socket for the `push_subscriptions` table. 🗣 The registered-devices
  list finally gets its own socket instead of a raw cable.
- **AlarmSessionsRepository** — NEW port + Supabase adapter + Fake. The labelled
  socket for the `alarm_sessions` table (the escalation bookkeeping). 🗣 The
  "how many times have we nagged this device about this overdue set" ledger gets
  its own socket.
- **HaccpReportingRepository** — EXISTING read-only HACCP reporting port (F-19
  PR7). We add ONE additive method `fetchAlarmOverdueInputs(today)`. 🗣 The HACCP
  reading desk already exists; we add one new question it can answer.
- **`runHaccpAlarmCheck`** — a NEW usecase (`lib/usecases/`). Orchestration that
  composes the overdue read + subscriptions + alarm-sessions + push-sender and
  holds the per-subscriber escalation loop + dead-subscription cleanup. 🗣 The
  alarm desk: it gathers the overdue items, decides who to nag and how loudly,
  sends the pushes, and tidies up expired devices.
- **Port / Adapter / Fake / Contract / Wiring** — same glossary as F-21: socket /
  plug / pretend plug for the bench / shared exam / the fuse box (the only
  business-layer file allowed to import an adapter).
- **Service-role singleton** — the adapters wired with the master DB key (the
  `alarm_sessions` + `push_subscriptions` tables are `service_role`-only by RLS),
  matching exactly what the cron does today. 🗣 The master key — same one the
  route already holds.
- **`now` injection** — the usecase takes the current time as an argument instead
  of calling `new Date()` itself. 🗣 Hand the desk the clock once so a test can
  freeze it and check every decision to the digit.

---

## Compliance / architecture flags

- **Hexagonal layering (CLAUDE.md + ADR-0002):** UI → usecase → adapter. After
  this unit, all 3 routes import ZERO adapters and ZERO vendor SDKs. ✅ target.
- **F-04 / F-27 vendor-SDK fence:** `web-push` is imported ONLY inside the new
  `lib/adapters/web-push/`. ⚠ **The eslint `no-restricted-imports` allowlist does
  NOT currently list `web-push`** (verified — only supabase/bcrypt/anthropic/
  resend/leaflet/jspdf/xlsx are fenced). So the existing `lib/webpush.ts` breach
  is not even lint-caught today. **This unit MUST add a `web-push` entry to the
  `.eslintrc.json` `no-restricted-imports` paths + the `lib/adapters/web-push/**`
  override**, exactly as F-11 did for `resend`. See **R5** — without this the new
  fence isn't enforced and the closure is cosmetic. (This is the F-27 "extend to
  all vendors" pattern applied to one vendor.)
- **F-TD-11 wiring fence:** the usecase + adapters export factories only;
  singletons live in `lib/wiring/`. Pinned by
  `tests/unit/lint/no-adapter-imports.test.ts`. ✅ followed.
- **F-TD-05 services-fence:** a service may not import another service file. This
  unit adds NO new service-to-service import; the orchestration is a USECASE (the
  correct place to compose multiple ports — ADR-0002). The reporting READ extends
  the existing `HaccpReportingService` (one new method on the existing service +
  port), and the usecase calls that service — usecase→service is allowed. ✅.
- **Ports purity:** `lib/ports/PushSender.ts`, `PushSubscriptionsRepository.ts`,
  `AlarmSessionsRepository.ts` are pure TS — no `web-push` import, no
  `@supabase/*` import, no framework import. The `PushSubscription` / `PushPayload`
  owned types move INTO the port (they are app-owned shapes today, not vendor
  shapes). ✅.
- **Dependency justification:** NO new `package.json` entry. `web-push@^3.6.7` +
  `@types/web-push@^3.6.4` already present (justification: "VAPID web-push delivery
  for HACCP overdue alarms" — the existing, sufficient reason; this unit only
  relocates the import). ✅ nothing to justify.
- **No migration:** filename-convention test is irrelevant here. ✅.

🗣 Every house rule is satisfied, with ONE active to-do the spec demands: we must
add `web-push` to the lint blocklist so the new socket is actually enforced — today
it isn't, which is exactly the breach we're closing.

## ADR conflicts

**None.** ADR-0002 (hexagonal shape & naming) is the governing ADR and this unit
follows it exactly — same pattern as F-11 (Mailer/Resend, the single-use-vendor
wrapper template) and the F-20/F-21 repo re-points. No ADR is contradicted or
amended.

---

## VERIFIED current-state analysis (the load-bearing part)

I read all five source files fully. Confirmed facts that anchor byte-identity:

### `lib/webpush.ts` (the vendor breach)
- Exports `sendPushNotification(subscription, payload): Promise<boolean>`,
  `getVapidPublicKey(): string`, and types `PushPayload` / `PushSubscription`.
- Imports `web-push` directly. Lazy `initWebPush()` reads `VAPID_PUBLIC_KEY` /
  `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` (subject defaults to
  `'mailto:hakan@mfsglobal.co.uk'`); throws if public/private absent.
- `send` JSON-stringifies `{ title, body, url ?? '/haccp', tag ?? 'haccp-alarm',
  requireInteraction ?? true }`, calls `webpush.sendNotification(sub, data, { TTL:
  300, urgency: 'high' })`. Returns `true` on success; on 404/410 it
  `console.warn('[webpush] Subscription expired:', endpoint.slice(-20))` and
  returns `false`; on any other error it `console.error('[webpush] Send failed:',
  err.message)` and returns `false`.
- **Callers (verified by grep):** exactly the 3 routes below. NO other importer.
  → **DELETE `lib/webpush.ts` entirely** once the 3 routes are re-pointed (R6 —
  preferred over a shim; the deletion is provably safe because the importer set is
  closed).

### `app/api/cron/haccp-alarm/route.ts` (the busy caller — exact flow to preserve)
1. **Auth:** `authorization !== 'Bearer ' + CRON_SECRET` → 401 `{error:'Unauthorised'}`.
2. **`getOverdueStatus()`** (route-local): `today = todayUK()` (en-CA / Europe/London),
   `nowHour = new Date().getHours()`, then `Promise.all` of 4 raw `supabaseService`
   reads:
   - `haccp_cold_storage_temps` select `session` where `date=today`
   - `haccp_processing_temps` select `session` where `date=today`
   - `haccp_daily_diary` select `phase` where `date=today`
   - `haccp_corrective_actions` select `id` where `resolved=false`
   then builds the `{ cold_storage:{am_overdue,pm_overdue}, processing_room:{…},
   daily_diary:{opening_overdue,closing_overdue}, unresolved_cas }` shape with the
   nowHour thresholds (cold/room AM ≥10, PM ≥14; diary opening ≥10, closing ≥17).
3. `getOverdueItems(status)` + `getOverdueKey(overdueItems)` (from
   `lib/haccp-alarm-status.ts`, reused verbatim).
4. Read all `push_subscriptions` select `id, endpoint, p256dh, auth`.
5. **Empty-subscriptions short-circuit:** if none → `{ok:true, sent:0,
   overdue: overdueItems.length}` (NOTE: `overdue` is the count here, even though
   nothing was sent — preserve this exact value).
6. **Nothing-overdue branch:** if `overdueItems.length===0` → `alarm_sessions`
   update `resolved_at = now` where `resolved_at is null` → `{ok:true, sent:0,
   overdue:0}`.
7. **Per-subscription loop:** find active `alarm_sessions` by
   `subscription_id + overdue_key + resolved_at is null` (`.single()`). If found:
   `count = (notification_count ?? 0) + 1`, reuse its id. Else: INSERT
   `{subscription_id, overdue_key, notification_count: 0}` returning `id`,
   `count` stays `1`. Then for EACH overdue item, `getNotificationText([item],
   count)` → `sendPushNotification(sub, {title, body, url:'/haccp',
   tag:'haccp-'+item.key, requireInteraction:true})`. On `true` → `sent++`. On
   `false` → set `subFailed`, **break** the item loop. After the item loop: if
   `subFailed`, push endpoint to `expiredEndpoints`; else, if `sessionId` truthy,
   update that session `{notification_count: count, last_sent_at: now}`.
8. **Cleanup:** if `expiredEndpoints.length>0`, delete `push_subscriptions` where
   `endpoint in expiredEndpoints`.
9. `console.log('[haccp-alarm] Overdue: N, Sent: sent/total')`.
10. Return `{ok:true, sent, overdue: overdueItems.length}`.
11. Outer catch → `console.error('[GET /api/cron/haccp-alarm]', err)` →
    500 `{error:'Server error'}`.
- **`getMonthStart()` is defined and UNUSED** (verified — never called). See **R3**.
- **`new Date()` is called inline 3×** (`todayUK`, `nowHour`, and the two
  `resolved_at`/`last_sent_at` `toISOString()` sites). The usecase MUST take `now`
  injected and derive ALL of these from it (F-21 determinism lesson). See **R2**.

### `app/api/notifications/vapid-key/route.ts`
- `getVapidPublicKey()` → 200 `{publicKey:key}`; on throw → 503
  `{error:'VAPID not configured'}`. Re-point to `pushSender.getPublicKey()`.

### `app/api/notifications/subscribe/route.ts`
- Auth via `x-mfs-user-role` + `x-mfs-user-id` → 401 if missing. Validates the
  subscription shape, then **upserts `push_subscriptions` directly via
  `supabaseService`**. Calls `getVapidPublicKey`? **NO — re-read confirms it
  imports `getVapidPublicKey` but does NOT call it** (dead import). It only uses
  `supabaseService.upsert`. See **R7**: the spec said "both call
  `getVapidPublicKey()`" — the subscribe route imports it but never invokes it, so
  re-pointing here is just removing the now-dead `@/lib/webpush` import (the upsert
  is OUT OF SCOPE — this route's `supabaseService` write is a pre-existing breach
  the locked scope does NOT include; closing it would need a
  `PushSubscriptionsRepository.upsert` method, which the spec did not ask for).
  **Decision needed at Gate 2 (R7).**

### `lib/haccp-alarm-status.ts`
- Pure helper: `getOverdueItems`, `getAlarmLevel`, `getNotificationText`,
  `getOverdueKey`, types `OverdueItem` / `AlarmLevel`. **Unchanged — reused by the
  usecase.** It is already a clean pure module in the correct shape; no port needed.

### Tables (from baseline migration — confirmed columns)
- `alarm_sessions(id, subscription_id, overdue_key, notification_count default 0,
  first_sent_at default now, last_sent_at default now, resolved_at)`. RLS:
  `service_role` only.
- `push_subscriptions(id, user_id, endpoint, p256dh, auth, device_label,
  created_at, last_used)`. RLS via policy; cron reads via service-role today.

### Cron registration (IMPORTANT finding — R8)
- **`/api/cron/haccp-alarm` is NOT in `vercel.json`** (only `compute-road-times`
  and `purge-idempotency-keys` are). The route's header comment claims an
  every-5-min schedule, but no cron is registered. This is a pre-existing
  observation, NOT something F-25 changes — but the implementer must NOT assume the
  cron fires in production. The re-point is still correct; flagged so nobody adds a
  cron entry thinking it's missing (out of scope).

---

## Files to change

### NEW files (16)

**PushSender hexagon (vendor wrapper — mirrors F-11 Mailer/Resend exactly):**
1. `lib/ports/PushSender.ts` — port interface + owned `PushSubscription` /
   `PushPayload` types (moved from `lib/webpush.ts`). Pure TS, no `web-push`.
2. `lib/ports/__contracts__/PushSender.contract.ts` — shared contract suite.
3. `lib/adapters/web-push/index.ts` — barrel: `export { createWebPushSender }`.
4. `lib/adapters/web-push/PushSender.ts` — the ONLY file importing `web-push`.
   Lazy VAPID init + the verbatim send. Maps the vendor `statusCode` to the
   boolean. (Factory only.)
5. `lib/adapters/fake/PushSender.ts` — in-memory Fake (records sends; scriptable
   per-endpoint success/expiry to exercise the cleanup path).
6. `lib/wiring/pushSender.ts` — composition root: `pushSender` singleton.

**PushSubscriptionsRepository hexagon:**
7. `lib/ports/PushSubscriptionsRepository.ts` — port + owned `PushSubscriptionRow`.
8. `lib/ports/__contracts__/PushSubscriptionsRepository.contract.ts`.
9. `lib/adapters/supabase/PushSubscriptionsRepository.ts` — Supabase adapter +
   `supabasePushSubscriptionsRepository` service-role singleton.
10. `lib/adapters/fake/PushSubscriptionsRepository.ts`.

**AlarmSessionsRepository hexagon:**
11. `lib/ports/AlarmSessionsRepository.ts` — port + owned types.
12. `lib/ports/__contracts__/AlarmSessionsRepository.contract.ts`.
13. `lib/adapters/supabase/AlarmSessionsRepository.ts` — adapter + service-role
    singleton.
14. `lib/adapters/fake/AlarmSessionsRepository.ts`.

**Orchestration + its wiring:**
15. `lib/usecases/runHaccpAlarmCheck.ts` — the factory + the byte-identical
    escalation/cleanup loop.
16. `lib/wiring/haccpAlarm.ts` — composition root: `runHaccpAlarmCheck` singleton
    (wires the push-subscriptions repo + alarm-sessions repo + push-sender +
    `haccpReportingService` service-role singleton).

### MODIFIED files (9)
17. `lib/ports/index.ts` — re-export `PushSender`, `PushSubscriptionsRepository`,
    `AlarmSessionsRepository` (+ their owned types).
18. `lib/adapters/supabase/index.ts` — export the 2 new Supabase repos
    (factory + singleton each).
19. `lib/adapters/fake/index.ts` — export the 3 new Fakes.
20. `lib/ports/HaccpReportingRepository.ts` — add `fetchAlarmOverdueInputs(today)`.
21. `lib/adapters/supabase/HaccpReportingRepository.ts` — implement it (verbatim
    selects — the same 4 reads the route does today).
22. `lib/adapters/fake/HaccpReportingRepository.ts` — implement the Fake side.
23. `lib/services/HaccpReportingService.ts` — add `getAlarmOverdueStatus(now)` (the
    pure nowHour-threshold mapping, lifted verbatim from the route's
    `getOverdueStatus`; `now` injected).
24. `.eslintrc.json` — add `web-push` to `no-restricted-imports` paths + add
    `lib/adapters/web-push/**/*.ts` to the adapter override (R5).
25. `app/api/cron/haccp-alarm/route.ts` — re-point to the usecase singleton.
    `app/api/notifications/vapid-key/route.ts` — re-point to `pushSender`.
    `app/api/notifications/subscribe/route.ts` — remove the dead `@/lib/webpush`
    import (R7 decides whether to also re-point the upsert — recommend NO).

### DELETED file (1)
26. `lib/webpush.ts` — deleted; all 3 importers re-pointed (R6).

🗣 Three brand-new sockets with their plugs, exams and fuse boxes; one extra
question added to the existing HACCP reading desk; the alarm desk usecase; the
lint blocklist updated; the three routes flipped; and the old vendor-coupled file
deleted. No file outside `lib/`, the 3 routes, and `.eslintrc.json` is touched.

---

## Port / method signatures (exact)

### `lib/ports/PushSender.ts`
```ts
/** Owned push-payload shape (moved from lib/webpush.ts — app-owned, not vendor). */
export interface PushPayload {
  title: string;
  body: string;
  url?: string;                 // default '/haccp' applied in the adapter
  tag?: string;                 // default 'haccp-alarm'
  requireInteraction?: boolean; // default true
}
/** Owned subscription shape (moved from lib/webpush.ts). */
export interface PushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}
export interface PushSender {
  /** Deliver one push. Returns true on success; false on expiry (404/410) OR any
   *  other send failure (byte-identical to today's boolean). NEVER throws for a
   *  send error — only the VAPID-not-configured init can throw. Adapter applies
   *  the url/tag/requireInteraction defaults + {TTL:300, urgency:'high'} + the
   *  404/410 warn vs error logging VERBATIM. */
  send(subscription: PushSubscription, payload: PushPayload): Promise<boolean>;
  /** The VAPID public key (throws if VAPID_PUBLIC_KEY unset — today's behaviour,
   *  the vapid-key route maps the throw → 503). */
  getPublicKey(): string;
}
```

### `lib/ports/PushSubscriptionsRepository.ts`
```ts
export interface PushSubscriptionRow {
  readonly id: string;
  readonly endpoint: string;
  readonly p256dh: string;
  readonly auth: string;
}
export interface PushSubscriptionsRepository {
  /** All push subscriptions (id, endpoint, p256dh, auth), no filter — exactly
   *  today's `.select('id, endpoint, p256dh, auth')`. @throws ServiceError. */
  listAll(): Promise<readonly PushSubscriptionRow[]>;
  /** Delete subscriptions whose endpoint is in `endpoints`. No-op on empty array
   *  (mirrors the route's `if (expiredEndpoints.length>0)` guard).
   *  @throws ServiceError. */
  deleteByEndpoints(endpoints: readonly string[]): Promise<void>;
  /** Upsert one subscription (R7 — re-points the subscribe route). Byte-identical to
   *  today's `.upsert({ user_id, endpoint, p256dh, auth, device_label, last_used },
   *  { onConflict: 'user_id,endpoint' })`. `lastUsedIso` injected (no new Date() in
   *  the adapter). @throws ServiceError (the route maps a thrown error → 500
   *  {error:'Failed to save subscription'}). */
  upsert(input: {
    userId: string;
    endpoint: string;
    p256dh: string;
    auth: string;
    deviceLabel: string | null;
    lastUsedIso: string;
  }): Promise<void>;
}
```

### `lib/ports/AlarmSessionsRepository.ts`
```ts
export interface ActiveAlarmSession {
  readonly id: string;
  readonly notificationCount: number;  // maps notification_count (?? 0 applied here)
}
export interface AlarmSessionsRepository {
  /** Resolve every active session: set resolved_at = nowIso where resolved_at is
   *  null. (nothing-overdue branch). @throws ServiceError. */
  resolveAllActive(nowIso: string): Promise<void>;
  /** The active (resolved_at is null) session for this subscription + overdue_key,
   *  or null if none. Maps today's `.single()` no-row → null (NOT an error — the
   *  route's `if (existing)` treats no-row as "create one"). @throws ServiceError
   *  ONLY on a real DB failure. */
  findActiveBySubscriptionAndKey(
    subscriptionId: string,
    overdueKey: string,
  ): Promise<ActiveAlarmSession | null>;
  /** Insert a new active session with notification_count: 0 (PRESERVE — the route
   *  inserts 0 then later updates to the real count). Returns its id, or null if
   *  the insert returned no row (mirrors `newSession?.id ?? ''` → the route uses
   *  '' to skip the later update). @throws ServiceError. */
  insert(subscriptionId: string, overdueKey: string): Promise<{ id: string } | null>;
  /** Update a session's notification_count + last_sent_at. @throws ServiceError. */
  updateCount(sessionId: string, count: number, lastSentIso: string): Promise<void>;
}
```

### `lib/ports/HaccpReportingRepository.ts` (+1 additive method)
```ts
/** The 4 raw reads the alarm cron does today (cold sessions, room sessions, diary
 *  phases for `today`, + the unresolved-CA count). The adapter runs the Promise.all
 *  and returns the raw arrays; ALL nowHour-threshold logic stays in the SERVICE
 *  (pure). @throws ServiceError. */
fetchAlarmOverdueInputs(today: string): Promise<AlarmOverdueInputs>;
```
With owned domain type (in `lib/domain/`, e.g. `lib/domain/HaccpAlarm.ts`):
```ts
export interface AlarmOverdueInputs {
  readonly coldSessions: readonly string[];  // 'AM' | 'PM' values
  readonly roomSessions: readonly string[];
  readonly diaryPhases: readonly string[];   // 'opening' | 'closing' | …
  readonly unresolvedCas: number;
}
```
Adapter selects (copied VERBATIM from the route's `getOverdueStatus`):
- `haccp_cold_storage_temps` `.select('session').eq('date', today)` → map `r.session`
- `haccp_processing_temps` `.select('session').eq('date', today)` → map `r.session`
- `haccp_daily_diary` `.select('phase').eq('date', today)` → map `r.phase`
- `haccp_corrective_actions` `.select('id').eq('resolved', false)` → `.length`

### `lib/services/HaccpReportingService.ts` (+1 method)
```ts
/** Today's overdue status for the alarm cron. `now` INJECTED (no `new Date()`):
 *  derives `today = todayUKFrom(now)` (already a helper here) + `nowHour =
 *  now.getHours()`, reads via reporting.fetchAlarmOverdueInputs(today), and
 *  applies the EXACT thresholds the route used (cold/room AM≥10 PM≥14, diary
 *  opening≥10 closing≥17). Returns the SAME shape getOverdueItems consumes. */
getAlarmOverdueStatus(now: Date): Promise<{
  cold_storage: { am_overdue: boolean; pm_overdue: boolean };
  processing_room: { am_overdue: boolean; pm_overdue: boolean };
  daily_diary: { opening_overdue: boolean; closing_overdue: boolean };
  unresolved_cas: number;
}>;
```
(`todayUKFrom(now)` already exists in `HaccpReportingService.ts` — reuse it; it is
byte-identical to the route's `todayUK()`.)

### `lib/usecases/runHaccpAlarmCheck.ts`
```ts
export interface RunHaccpAlarmCheckDeps {
  readonly reporting: HaccpReportingService;       // getAlarmOverdueStatus(now)
  readonly subscriptions: PushSubscriptionsRepository;
  readonly alarmSessions: AlarmSessionsRepository;
  readonly pushSender: PushSender;
}
export interface HaccpAlarmResult { ok: true; sent: number; overdue: number; }
export interface RunHaccpAlarmCheck {
  /** Runs the full overdue-check + escalation + cleanup. `now` INJECTED. Returns
   *  the EXACT { ok, sent, overdue } shapes the route returns today (including the
   *  empty-subscriptions short-circuit where overdue = overdueItems.length while
   *  sent = 0). Holds the per-subscriber loop, the insert-0-then-update-count
   *  quirk, the first-false break, and the expired-endpoint cleanup BYTE-IDENTICALLY. */
  run(now: Date): Promise<HaccpAlarmResult>;
}
export function createRunHaccpAlarmCheck(deps: RunHaccpAlarmCheckDeps): RunHaccpAlarmCheck { … }
```
The usecase imports `getOverdueItems`, `getNotificationText`, `getOverdueKey` from
`lib/haccp-alarm-status.ts` (pure helper — a usecase may import a pure lib). It
derives `nowIso = now.toISOString()` ONCE and uses it for both `resolveAllActive`
and every `updateCount`. The per-item `tag` is `` `haccp-${item.key}` ``; payload
`url:'/haccp'`, `requireInteraction:true` — verbatim.

🗣 The desk takes the clock as an input, asks the HACCP desk what's overdue, gets
the device list and the nag-ledger, and reproduces the exact every-5-minute
escalation + tidy-up — just with sockets instead of raw cables.

---

## Byte-identical-behaviour checklist (the safety net)

The implementer MUST preserve every item below; the parity unit tests pin them:

1. **Auth:** cron 401 `{error:'Unauthorised'}` when Bearer ≠ `CRON_SECRET`
   (STAYS IN THE ROUTE — verbatim, before the usecase is called).
2. **Empty subscriptions:** `{ok:true, sent:0, overdue: overdueItems.length}` —
   note `overdue` is the count even though `sent:0`.
3. **Nothing overdue:** `alarm_sessions` resolved (resolved_at=now where null) →
   `{ok:true, sent:0, overdue:0}`.
4. **Session find/create:** found → `count = (notification_count ?? 0) + 1`;
   missing → INSERT `notification_count: 0`, `count = 1`.
5. **insert-0-then-update-count quirk:** a brand-new session is created with
   `notification_count: 0` and only updated to the real `count` AFTER all items
   send successfully. A subscription that fails on its FIRST item is NEVER updated,
   so its session stays at 0 (today's behaviour — preserve). See **R1**.
6. **Per-item send:** one push per overdue item, `tag:'haccp-'+item.key`,
   `url:'/haccp'`, `requireInteraction:true`, title/body from
   `getNotificationText([item], count)`.
7. **First-false break:** on the first `send`→false, set subFailed, break the item
   loop, push endpoint to `expiredEndpoints`, do NOT update the session.
8. **Cleanup:** delete `push_subscriptions` where `endpoint in expiredEndpoints`
   (only when non-empty).
9. **`sent` tally:** incremented once per successful item send.
10. **Log line:** `[haccp-alarm] Overdue: N, Sent: sent/total` (STAYS — decide
    route vs usecase; recommend keep in the route after the usecase returns, OR
    move into the usecase — either is fine as long as the string is identical).
    See **R4**.
11. **Adapter send internals:** `{TTL:300, urgency:'high'}`, the url/tag/
    requireInteraction defaults, the `console.warn('[webpush] Subscription
    expired:', endpoint.slice(-20))` on 404/410, the
    `console.error('[webpush] Send failed:', err.message)` otherwise — VERBATIM in
    `lib/adapters/web-push/PushSender.ts`.
12. **VAPID:** `getPublicKey()` throws when `VAPID_PUBLIC_KEY` unset → vapid-key
    route maps to 503 `{error:'VAPID not configured'}`.
13. **Outer catch:** cron 500 `{error:'Server error'}` + `console.error('[GET
    /api/cron/haccp-alarm]', err)`.

---

## Determinism / injection note

- The usecase `run(now: Date)` takes `now` injected; the route passes `new Date()`.
- `HaccpReportingService.getAlarmOverdueStatus(now)` takes the same `now`.
- The usecase derives `nowIso = now.toISOString()` ONCE and reuses it for the
  resolve + every updateCount — so a test with a frozen clock asserts the exact
  `resolved_at` / `last_sent_at` strings.
- The adapters never call `new Date()` (they receive `nowIso` already-computed).
- The web-push adapter has no clock dependency.

🗣 Read the clock once, hand it down. A frozen-clock test then nails every
timestamp and every escalation count to the digit.

---

## Numbered implementation steps (TDD order — contract-first)

> Proven F-20/F-21 sequence: contract → fake → supabase adapter → wiring →
> service/usecase → routes → lint. Write the failing test before each impl.

1. **Domain type** — `lib/domain/HaccpAlarm.ts` (`AlarmOverdueInputs`); re-export
   from `lib/domain/index.ts`. (Pure types — tsc gate covers them.)
2. **PushSender port** — `lib/ports/PushSender.ts` (port + moved `PushPayload` /
   `PushSubscription`); re-export from `lib/ports/index.ts`.
3. **PushSender contract** — `__contracts__/PushSender.contract.ts` (send returns
   true on a scripted-OK endpoint; false on a scripted-expiry endpoint; false on a
   scripted-other-error endpoint; getPublicKey returns the configured key).
4. **PushSender Fake** — `lib/adapters/fake/PushSender.ts`
   (`createFakePushSender({ publicKey, results })`); run the contract against it.
5. **PushSender web-push adapter** — `lib/adapters/web-push/PushSender.ts` +
   `index.ts`. Lazy VAPID init, verbatim send + logging. (The contract here is the
   integration test in step 14 — unit-mock `web-push` if a unit pass is wanted.)
6. **PushSender wiring** — `lib/wiring/pushSender.ts` exporting `pushSender`.
7. **eslint fence** — add `web-push` to `no-restricted-imports` paths +
   `lib/adapters/web-push/**/*.ts` to the override. Run lint to confirm the new
   adapter passes and an import elsewhere would fail. **(R5 — do this NOW so the
   fence is live before the route re-point.)**
8. **PushSubscriptionsRepository** — port + contract + Fake + Supabase adapter
   (+ service-role singleton) + barrels. Selects verbatim (`id, endpoint, p256dh,
   auth`; `.in('endpoint', endpoints)` delete with the empty-array no-op).
9. **AlarmSessionsRepository** — port + contract + Fake + Supabase adapter
   (+ singleton) + barrels. Preserve the `.single()`→null mapping, the
   `notification_count: 0` insert, the `?? ''`/null insert-miss semantics.
10. **Extend HaccpReportingRepository** — add `fetchAlarmOverdueInputs(today)` to
    the port + Supabase adapter (verbatim 4 selects) + Fake. Add a contract case
    OR (consistent with R5/F-19 pattern) a focused fake-unit + integration test —
    note `HaccpReportingRepository` has NO shared contract file today (it shipped
    with route-parity tests). Recommend focused tests for the one new method.
11. **Extend HaccpReportingService** — add `getAlarmOverdueStatus(now)` (lift the
    nowHour-threshold mapping verbatim; reuse `todayUKFrom(now)`). Unit-test with a
    fake reporting repo + frozen `now` against the route's exact threshold table.
12. **runHaccpAlarmCheck usecase** — write `lib/usecases/runHaccpAlarmCheck.ts`
    (factory; injected `now`; the full escalation/cleanup loop). Unit-test with all
    fakes + frozen `now`: empty-subs short-circuit, nothing-overdue resolve,
    new-session insert-0-then-update, escalation count increment, first-false break
    + no-update + cleanup, multi-item `sent` tally, exact `{ok,sent,overdue}`.
13. **haccpAlarm wiring** — `lib/wiring/haccpAlarm.ts` exporting
    `runHaccpAlarmCheck` (service-role singletons for the 2 repos + the
    `haccpReportingService` singleton + `pushSender`).
14. **Re-point cron route** — rewrite `app/api/cron/haccp-alarm/route.ts`: keep the
    Bearer/CRON_SECRET 401 VERBATIM; `const now = new Date()`; call
    `runHaccpAlarmCheck.run(now)`; `NextResponse.json(result)`; keep the outer
    catch → 500 `{error:'Server error'}` + the console.error. Delete the route's
    `getOverdueStatus` / `todayUK` / `getMonthStart` (R3) and the
    `@/lib/adapters/supabase/client` + `@/lib/webpush` imports.
15. **Re-point vapid-key route** — `pushSender.getPublicKey()` (singleton from
    `lib/wiring/pushSender`); preserve 200/503 shapes.
16. **Re-point subscribe route (R7 = re-point, LOCKED)** — remove the dead
    `@/lib/webpush` import AND the `@/lib/adapters/supabase/client` import; re-point
    the upsert onto `PushSubscriptionsRepository.upsert` (singleton from
    `lib/wiring/`). Compute `lastUsedIso = new Date().toISOString()` in the route and
    pass it in. Preserve every status/shape: 401 missing headers, 400 invalid sub,
    500 `{error:'Failed to save subscription'}` on a thrown upsert, 200 `{ok:true}`.
    Route ends with ZERO adapter imports. (Add the `upsert` contract case + fake/
    supabase impl in step 8.)
17. **Delete `lib/webpush.ts`** (R6) — all importers re-pointed.
18. **Lint/fence check** — run `tests/unit/lint/no-adapter-imports.test.ts` +
    eslint: all 3 routes import zero adapters + zero `web-push`; the only
    `web-push` import is in `lib/adapters/web-push/`.

🗣 Build each socket and prove it on the bench, turn on the lint guard early, lift
the escalation logic into the desk with a frozen-clock test, flip the routes, then
delete the old vendor file — each step has a test that fails until it's right.

---

## TDD test plan (ANVIL executes this)

### Unit (`tests/unit/…`, no DB)
- **runHaccpAlarmCheck** (`usecases/runHaccpAlarmCheck.test.ts`) — the headline
  suite. Fakes + FROZEN `now`. Assert: empty-subscriptions → `{ok:true,sent:0,
  overdue:N}`; nothing-overdue → resolveAllActive called with `now.toISOString()` +
  `{ok:true,sent:0,overdue:0}`; new-session path inserts count 0 then updates to 1;
  escalation increments count on a found session; **first-item-false → break, no
  updateCount, endpoint queued, deleteByEndpoints called**; multi-item success →
  `sent` = items × subs; exact `{ok,sent,overdue}` per branch.
- **HaccpReportingService.getAlarmOverdueStatus** — fake reporting repo + frozen
  `now`: assert the threshold table at hour 9 (nothing overdue), hour 10
  (AM/opening flip), hour 14 (PM flip), hour 17 (closing flip), with/without each
  session present; `unresolved_cas` passthrough.
- **PushSender Fake + contract** (`adapters/fake/PushSender.test.ts`).
- **PushSubscriptions / AlarmSessions Fake + contract** tests.
- **Routes** (`tests/unit/routes/…`, deps mocked):
  - cron: 401 on bad/missing Bearer; happy path calls `runHaccpAlarmCheck.run` and
    returns its result; 500 `{error:'Server error'}` when the usecase throws.
  - vapid-key: 200 `{publicKey}` from a mocked `pushSender.getPublicKey`; 503 when
    it throws.
  - subscribe: unchanged behaviour (401 missing headers; 400 invalid; 200 ok) —
    a regression guard that the dead-import removal changed nothing.

### Integration (LIVE Supabase, `tests/integration/adapters/supabase/…`)
- `PushSubscriptionsRepository.test.ts` — contract against the REAL adapter on
  local Supabase (`listAll`; `deleteByEndpoints` removes the right rows + empty
  no-op). Seed a `push_subscriptions` row (`npm run db:reset`; add a seed row if
  absent).
- `AlarmSessionsRepository.test.ts` — contract against the real adapter:
  insert→find→updateCount round-trip; `resolveAllActive` sets resolved_at;
  find returns null for a resolved/absent session.
- `HaccpReportingRepository.fetchAlarmOverdueInputs` against real Supabase
  (4-read shape parity).
- **web-push adapter** — NO live network in CI; unit-mock the `web-push` module
  (vitest `vi.mock('web-push')`) to assert it's called with `{TTL:300,
  urgency:'high'}` + the right data, and the 404/410→false / other→false mapping +
  the two console outputs.
- Booted-server smoke of the cron route (Bearer auth + `{ok,sent,overdue}` shape)
  via the integration runner's DB-identity-probe harness.

### E2E (`@critical` preview smoke)
- Standard `npm run test:e2e:preview -- <preview-url> --unprotected`,
  readiness-gated on `/api/auth/team`=200. **NO exhaustive every-button browser
  sweep** — this is backend-only, no UI change, no RLS change; right-sized depth
  per the established rule (`[[anvil-full-browser-taps]]`).

🗣 The bench checks every escalation decision with a frozen clock and a mocked
vendor; the live-DB tests confirm the two new table sockets read/write correctly;
and the standard preview smoke confirms nothing user-facing regressed. The push
vendor is exercised with a mock, never a real device, in CI.

---

## Acceptance criteria

1. `app/api/cron/haccp-alarm/route.ts`, `app/api/notifications/vapid-key/route.ts`,
   `app/api/notifications/subscribe/route.ts` import **zero** `lib/adapters/**` and
   **zero** vendor SDKs (`web-push`, `@supabase/*`).
2. `web-push` is imported in EXACTLY one file: `lib/adapters/web-push/PushSender.ts`.
   `.eslintrc.json` fences it (a `web-push` import elsewhere fails lint).
3. `lib/webpush.ts` no longer exists.
4. All wire responses / status codes / log lines / send semantics are byte-identical
   to pre-F-25 (the checklist above; parity unit tests green).
5. `runHaccpAlarmCheck.run` + `getAlarmOverdueStatus` take `now` injected and call
   `new Date()` zero times.
6. `PushSender`, `PushSubscriptionsRepository`, `AlarmSessionsRepository` each pass
   one shared contract (real + fake).
7. No new `package.json` entry; no migration; no RLS change; no UI change.
8. Rip-out test holds: swapping the push vendor = one new
   `lib/adapters/<vendor>/` + one edit to `lib/wiring/pushSender.ts`. Swapping the
   DB for these two tables = one new adapter each + their wiring lines. Nothing in
   routes / usecase / service / domain / ports changes.
9. `no-adapter-imports` lint test + eslint + tsc + full unit/integration suites
   green; `@critical` preview smoke green.

---

## Risk Assessment

### R1 — insert-0-then-update-count quirk (business-logic / byte-identity) — **MUST-FIX (preserve)**
**Severity: MEDIUM.** Today a brand-new alarm session is INSERTed with
`notification_count: 0`, and only updated to the real `count` AFTER all items send
successfully. A subscription that fails on its FIRST item is queued for deletion
and its session is NEVER updated — so it stays at `notification_count: 0` (and is
about to be deleted anyway, cascade-removing the session). The tempting "clean"
refactor — insert with `notification_count: count` directly — would change the DB
state on the failure path and on any partial-send race, breaking byte-identity.
**Mitigation:** `AlarmSessionsRepository.insert` MUST hard-code
`notification_count: 0` (documented in the port JSDoc), and the usecase MUST keep
the insert→(send loop)→conditional-updateCount ordering exactly. The
runHaccpAlarmCheck unit test pins both the new-session-success (0→count) and the
first-false (stays 0, no update) paths. **Flag: must-fix** — a silent "tidy" here
changes persisted state.
🗣 The original code writes a zero first and only bumps it after everything sends.
A device that fails immediately keeps its zero. We must copy that exactly, not
"improve" it, or the nag-counter drifts.

### R2 — `now` injection vs inline `new Date()` (determinism) — LOW
**Severity: LOW.** The route calls `new Date()` 3× inline (today, nowHour, the two
timestamps). If the usecase/service captured their own clocks, the `today` used for
the overdue read and the `resolved_at`/`last_sent_at` written could straddle a
midnight/hour boundary — a determinism smell and a (tiny) correctness edge at
boundaries.
**Mitigation:** `run(now)` + `getAlarmOverdueStatus(now)` take the SAME injected
`now`; `nowIso` computed once. Already in the signatures. Frozen-clock tests pin
it. No race (read-mostly, single cron invocation). **Not a blocker.**
🗣 Read the clock once and pass it down, so the overdue check and the timestamps
all agree on "now." Already designed in.

### R3 — unused `getMonthStart()` (dead code) — LOW
**Severity: LOW.** The route defines `getMonthStart()` and never calls it (verified
by reading the whole file). The cron re-point deletes the route's helper block
wholesale, so `getMonthStart` disappears with it — which is correct ONLY because
it's genuinely unused.
**Mitigation:** confirm via grep that `getMonthStart` is referenced nowhere else
(it's a file-local function — it cannot be) and delete it with the rest of the
route's now-redundant helpers. Do NOT port it into the usecase. **Not a blocker** —
flagged so the implementer deletes confidently rather than "preserving" dead code.
🗣 There's a leftover helper nobody calls. We bin it with the rest of the old route
plumbing — confirmed safe because nothing references it.

### R4 — where the `[haccp-alarm]` log line lives (byte-identity) — LOW (decision)
**Severity: LOW.** Today the route logs `[haccp-alarm] Overdue: N, Sent: sent/total`
right before returning. After the re-point, the totals come back inside the
usecase result. The log can stay in the route (log after `run` returns, using
`result.overdue` + `result.sent` + the sub count) OR move into the usecase. The
STRING must be byte-identical either way; the `total` is the subscription count.
**Mitigation:** recommend keeping it in the route for minimal surface, but the
route no longer knows `total` (sub count) unless the usecase returns it. **Simplest
byte-identical option: move the `console.log` INTO the usecase** (it already has N,
sent, and total). Decide at Gate 2. **Not a blocker** — a placement decision, the
string is fixed.
🗣 One log line moves house. Wherever it lands, the words and numbers are identical;
easiest is to let the desk print it since the desk has all three numbers.

### R5 — `web-push` NOT in the eslint fence today (security / enforcement) — **MUST-FIX**
**Severity: MEDIUM.** Verified: `.eslintrc.json`'s `no-restricted-imports` list
fences supabase/bcrypt/anthropic/resend/leaflet/jspdf/xlsx — but NOT `web-push`. So
the current `lib/webpush.ts` breach is not even lint-caught, and if we build the new
adapter WITHOUT adding the fence, nothing stops a future import of `web-push` from
re-opening the breach. The whole point of the unit (closing the last
vendor-outside-adapter breach) is only real if the fence is added.
**Mitigation:** add a `web-push` entry to `no-restricted-imports.paths` (with the
F-11-style message pointing to `@/lib/wiring/pushSender`) AND add
`lib/adapters/web-push/**/*.ts` to the adapter override that turns the rule off.
Do this in step 7, BEFORE the route re-point, and prove it with a lint run.
**Flag: must-fix** — without it the closure is cosmetic and code-critic should
reject. (This is the F-27 "extend the fence to all vendors" pattern for one vendor.)
🗣 Right now there's no guard stopping anyone from grabbing the push vendor directly
— that's literally the hole we're plugging. We must add the guard, or we've only
moved the leak, not sealed it.

### R6 — deleting `lib/webpush.ts` (blast radius) — LOW (PASS)
**Severity: LOW — verdict PASS.** Deletion is safe because the importer set is
closed: exactly the 3 routes import it (vapid-key + subscribe + cron), all
re-pointed in this unit. `getAlarmLevel`/the client beep logic lives in
`lib/haccp-alarm-status.ts` + `hooks/useHACCPAlarm.ts`, which do NOT import
`lib/webpush.ts`.
**Mitigation:** grep `@/lib/webpush` returns zero hits after steps 14–16, THEN
delete. **Not a blocker.**
🗣 Pull the old file out — confirmed only the three routes ever used it, and they're
all re-wired, so nothing sags.

### R7 — subscribe route's `supabaseService` upsert (scope boundary) — **MUST-FIX (decision)**
**Severity: MEDIUM.** The spec said vapid-key + subscribe "both call
`getVapidPublicKey()`." Re-reading `subscribe/route.ts`: it IMPORTS
`getVapidPublicKey` but NEVER calls it (dead import) — AND it writes
`push_subscriptions` directly via `supabaseService.upsert`. So removing the dead
webpush import does NOT make this route adapter-free: its `@/lib/adapters/supabase/
client` import remains. Acceptance criterion 1 ("subscribe imports zero adapters")
therefore requires EITHER re-pointing the upsert onto a new
`PushSubscriptionsRepository.upsert(...)` method, OR explicitly scoping it out.
**Mitigation (decide at Gate 2, AskUserQuestion):**
(a) **Recommended for the locked scope:** the spec's `PushSubscriptionsRepository`
only specified `listAll` + `deleteByEndpoints`. The subscribe upsert is a separate
write breach. Either (a1) **add `upsert(input)` to the repo and re-point** so the
route is genuinely adapter-free (cleanest, satisfies criterion 1 fully), or (a2)
**scope it out** and amend criterion 1 to "the cron route + vapid-key route import
zero adapters; the subscribe route's write upsert is tracked as a follow-up
(F-25-FU)." **Recommend (a1)** — it's one small additive method and a 4-line route
edit, and it makes the "rip-out test PASSES" claim true for all three routes.
**Flag: must-fix decision** — criterion 1's scope depends on it.
🗣 The sign-up-a-device route still talks to the database directly to save the
device, and it never actually used the push vendor. To honestly say "no route
touches an adapter," we should give that save its own socket too — it's tiny. Or we
consciously park it. Either way, decide on purpose.

### R8 — cron not registered in `vercel.json` (operational observation) — LOW (no-op)
**Severity: LOW — informational.** `/api/cron/haccp-alarm` is NOT in `vercel.json`
(only `compute-road-times` + `purge-idempotency-keys` are). The route's comment
claims an every-5-min schedule that isn't wired. F-25 does NOT change cron
registration (out of scope) and the re-point is correct regardless.
**Mitigation:** do NOT add a cron entry (scope). Flag to Hakan as a separate
observation (possible BACKLOG: "haccp-alarm cron unregistered — alarms may not fire
in prod"). **Not a blocker for F-25.**
🗣 Heads-up unrelated to this job: the alarm job may not actually be scheduled in
production. We're not fixing that here — just noting it so it can be checked later.

### R9 — `.single()` on alarm-session find throws on multiple rows (edge) — LOW
**Severity: LOW.** Today's route uses `.single()` to find the active session — which
errors if MORE than one active row exists for the same (subscription_id,
overdue_key). In practice the insert path keeps it to one, but the new adapter must
reproduce the SAME behaviour: `findActiveBySubscriptionAndKey` maps no-row → null,
and a real multi-row/DB error → ServiceError (matching `.single()`'s error, which
the route's outer catch turns into a 500). Using `.maybeSingle()` instead would
SWALLOW the multi-row error — a behaviour change.
**Mitigation:** the Supabase adapter uses `.single()` (NOT `.maybeSingle()`) and
maps PostgREST's no-row code (`PGRST116`) → null while letting other errors throw
ServiceError. Document this in the port JSDoc + pin with an integration test.
**Not a blocker** — just a "use `.single()`, map only the no-row code" instruction.
🗣 The original code uses a strict "exactly one" lookup that errors if it ever finds
two. The new socket must keep that strictness, not quietly tolerate duplicates.

### Categories with no material risk
- **Concurrency / races:** the cron is a single invocation; no concurrent writers
  introduced. The insert-then-update is not transactional today and stays
  non-transactional (byte-identical). No new race surface.
- **Data migration:** none — no schema change.
- **Security:** service-role posture identical to today (both tables are
  service-role-only by RLS); cron Bearer auth preserved verbatim; no new attack
  surface. The web-push adapter reads the SAME VAPID env vars.
- **Launch blockers:** R1, R5, R7 below (all resolvable at Gate 2 — R1 is a
  preserve-instruction, R5 is a config edit, R7 is a scope decision).

### MUST-FIX summary (Gate 2 blockers)
- **R1** — preserve the `notification_count: 0` insert-then-conditional-update
  quirk exactly (do NOT "tidy" it to insert-with-count).
- **R5** — add `web-push` to `.eslintrc.json` `no-restricted-imports` + the adapter
  override; without it the breach-closure is cosmetic.
- **R7** — decide the subscribe route's upsert: re-point it (recommended — add
  `PushSubscriptionsRepository.upsert`) or explicitly scope it out and amend
  acceptance criterion 1.

All three are decisions/instructions, not deep unknowns — they do NOT loop back to
Order, but MUST be resolved in the plan / at Gate 2 before Render proceeds.

---

## Biggest risk + mitigation (headline)

**The biggest risk is R7 — the subscribe route's direct `supabaseService` upsert.**
It's the one place where the headline claim ("after F-25 the notification routes
import zero adapters") is NOT automatically true: that route never used the push
vendor and instead writes the DB directly, so removing the dead webpush import
leaves a live adapter import behind. The plan mitigates it by surfacing the choice
explicitly at Gate 2 and recommending the small, clean fix — add
`PushSubscriptionsRepository.upsert(...)` and re-point the write — so all three
routes are genuinely adapter-free and the rip-out test PASSES across the board.
🗣 The trap is quietly declaring victory: one of the two notification routes still
talks to the database directly and never touched the push vendor at all. We either
give that save its own socket (recommended, it's tiny) or consciously park it — but
we must not pretend it's done.

---

## Hexagonal verdict (populates Gate 2)

- **Ports used/added:** 3 NEW — `PushSender`, `PushSubscriptionsRepository`,
  `AlarmSessionsRepository`; 1 EXISTING extended — `HaccpReportingRepository`
  (+`fetchAlarmOverdueInputs`).
- **Adapters:** `lib/adapters/web-push/PushSender.ts` (NEW vendor wrapper),
  `lib/adapters/supabase/PushSubscriptionsRepository.ts` (NEW),
  `lib/adapters/supabase/AlarmSessionsRepository.ts` (NEW),
  `lib/adapters/supabase/HaccpReportingRepository.ts` (extended). Plus 3 Fakes.
  Wiring: `lib/wiring/pushSender.ts`, `lib/wiring/haccpAlarm.ts`.
- **New dependencies:** NONE. `web-push@^3.6.7` + `@types/web-push@^3.6.4` already
  in `package.json`; this unit only RELOCATES the import behind the adapter. The
  vendor is single-use (imported in exactly one file) and IS wrapped
  (`lib/adapters/web-push/`) per the single-use-vendor rule. ✅
- **Rip-out test:** **PASS** — swapping the push vendor = one new
  `lib/adapters/<vendor>/` + one line in `lib/wiring/pushSender.ts`; swapping the DB
  for `push_subscriptions` / `alarm_sessions` = one new adapter each + their wiring
  lines. Routes, usecase, service, domain, ports unchanged. **CONDITIONAL on R7:**
  PASS for all three routes only if the subscribe upsert is re-pointed (R7 option
  a1); if R7 is scoped out (a2), the subscribe route retains one adapter import and
  the rip-out claim is "PASS for cron + vapid-key; subscribe tracked as F-25-FU."
