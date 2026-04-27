# MFS Global — HACCP Alarm & Notification Plan
**Created:** 2026-04-27
**Status:** In build
**Owner:** Hakan Kilic

---

## Overview

Two-layer alarm system for overdue HACCP checks:

| Layer | Trigger | How | Escalates? |
|---|---|---|---|
| In-app | Screen on, app open | Web Audio API — escalating beeps | ✅ Volume + count |
| Background | Screen locked / app closed | Web Push (APNs) — notification sound | ✅ Text urgency |

Both layers activate when the same overdue conditions are met.
Both stop automatically the moment overdue items are resolved.
No snooze, no acknowledge — only cleared by completing the check.

---

## Overdue Items That Trigger Alarms

From existing HACCP status API — all currently tracked:

| Check | Overdue when |
|---|---|
| Cold storage AM temp | Not logged by ~9:00am |
| Cold storage PM temp | Not logged by ~3:00pm |
| Process room AM temp | Not logged by ~9:00am |
| Process room PM temp | Not logged by ~3:00pm |
| Daily diary — opening | Not logged by ~9:00am |
| Daily diary — closing | Not logged by ~5:00pm |
| Unresolved corrective action | Any CA not signed off (any age) |

**Not alarmed** (visual only — tiles stay red):
- Weekly review overdue
- Monthly review overdue
- Training refresh overdue

**All roles receive alarms** — warehouse, butcher, admin.

---

## Layer 1 — In-App Alarm (Web Audio API)

Runs while the HACCP homepage is open and in the foreground.

### Behaviour
- Checks overdue status every 60 seconds (reuses existing tile status poll)
- When first overdue item detected: starts alarm clock
- Plays a beep pattern every **5 minutes**
- Each 5-minute interval **escalates**:

| Alarm # | Beeps | Volume | Tone |
|---|---|---|---|
| 1 (0 min) | 1 short beep | 30% | 880Hz |
| 2 (5 min) | 2 beeps | 50% | 880Hz |
| 3 (10 min) | 3 beeps | 70% | 1100Hz (higher) |
| 4 (15 min) | 4 beeps | 90% | 1100Hz |
| 5+ (20+ min) | 5 beeps | 100% | 1320Hz (urgent) |

- Stops immediately when all overdue items are resolved
- Restarts if a new overdue item appears later in the day

### Visual alarm
- HACCP homepage header turns red with pulsing animation
- Count badge: "3 overdue checks" 
- Each overdue tile pulses red border

### Implementation
`hooks/useHACCPAlarm.ts` — custom hook used in HACCP homepage
- Reads overdue state from existing status data (no extra API calls)
- Manages Web Audio context and alarm interval
- Returns `{ isAlarming, overdueCount, alarmLevel }` for UI

---

## Layer 2 — Background/Locked Screen (Web Push)

Sends iOS push notifications while the app is backgrounded or iPad is locked.

### iOS Web Push requirements
- iOS 16.4+ required (released March 2023 — most current iPads)
- PWA must be **added to Home Screen** (not just Safari — standalone mode)
- User must grant **notification permission** once per device
- If iPad is on silent/vibrate: vibration only (no sound) — iOS limitation

### How it works
```
Vercel cron (every 5 min)
  → Check HACCP status for overdue items
  → If overdue: send Web Push to all active subscriptions
  → iOS delivers to locked iPad with notification sound
  → Tapping opens app → /haccp
```

### Notification escalation (text urgency)

The server tracks how many consecutive notifications have been sent per
overdue session. Text escalates:

| Count | Icon | Text |
|---|---|---|
| 1 | ⚠️ | "Overdue: Cold storage AM temp not logged" |
| 2 | 🚨 | "URGENT: Still overdue 10 min — Cold storage AM temp" |
| 3 | 🔴 | "ACTION REQUIRED: 15 min overdue — Cold storage AM temp" |
| 4+ | 🆘 | "CRITICAL: [X] min overdue — Cold storage AM temp" |

If multiple items are overdue:
- "🚨 3 overdue checks — Cold storage AM, Process room AM, Diary opening"

Notification stops sending when all overdue items are resolved. The cron
re-checks status on each run and only sends if still overdue.

---

## Architecture

### New files
```
public/
  sw.js                         — replace cleanup SW with push handler

app/
  api/
    notifications/
      subscribe/route.ts        — POST: store push subscription
      unsubscribe/route.ts      — DELETE: remove subscription
    cron/
      haccp-alarm/route.ts      — GET: Vercel cron endpoint (every 5 min)

hooks/
  useHACCPAlarm.ts              — in-app Web Audio alarm hook
  usePushNotifications.ts       — push subscription management

lib/
  webpush.ts                    — send push via web-push library (VAPID)
  haccp-alarm-status.ts         — shared logic: what counts as overdue
```

### Modified files
```
app/haccp/page.tsx              — add useHACCPAlarm hook, visual alarm UI,
                                   permission request banner
```

### New DB tables
```sql
-- Push subscriptions — one row per device/user pair
CREATE TABLE push_subscriptions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid REFERENCES users(id) ON DELETE CASCADE,
  endpoint     text NOT NULL,
  p256dh       text NOT NULL,
  auth         text NOT NULL,
  device_label text,              -- e.g. "Hakan's iPad"
  created_at   timestamptz DEFAULT now(),
  last_used    timestamptz DEFAULT now(),
  UNIQUE(user_id, endpoint)
);

-- Alarm state — tracks escalation per device per session
CREATE TABLE alarm_sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid REFERENCES push_subscriptions(id) ON DELETE CASCADE,
  overdue_key     text NOT NULL,   -- hash of overdue items
  notification_count integer DEFAULT 0,
  first_sent_at   timestamptz DEFAULT now(),
  last_sent_at    timestamptz DEFAULT now(),
  resolved_at     timestamptz      -- null = still active
);
```

### VAPID keys
Generate once, store in Vercel environment variables:
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT` = mailto:hakan@mfsglobal.co.uk

---

## Service Worker (sw.js)

Replace the current cleanup SW with a real push handler:

```javascript
// Handles push events (notifications from server)
self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {}
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body:    data.body,
      icon:    '/icons/icon-192.png',
      badge:   '/icons/badge-72.png',
      tag:     'haccp-alarm',        // replaces previous notification
      renotify: true,                // always makes sound even if replacing
      data:    { url: '/haccp' },
    })
  )
})

// Tap notification → open app at HACCP page
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    clients.openWindow(event.notification.data.url)
  )
})
```

`tag: 'haccp-alarm'` + `renotify: true` means:
- Only one notification visible at a time (not a pile of 20)
- Each new push replaces the previous one AND plays sound again

---

## Vercel Cron

```json
// vercel.json
{
  "crons": [{
    "path": "/api/cron/haccp-alarm",
    "schedule": "*/5 * * * *"
  }]
}
```

Cron endpoint logic:
1. Run HACCP overdue check (same logic as status API)
2. If nothing overdue: clear any active alarm sessions, stop
3. If overdue: fetch all active push subscriptions
4. For each subscription: find or create alarm session, increment count
5. Send push notification with escalated text
6. Log result

---

## Permission Request UI

First time staff open the HACCP homepage:

```
┌─────────────────────────────────────────────────────┐
│ 🔔 Enable overdue alarms                             │
│ Get notified on this device when HACCP checks are   │
│ overdue — even when the iPad is locked.              │
│                              [Enable]  [Not now]     │
└─────────────────────────────────────────────────────┘
```

- "Enable" → calls `Notification.requestPermission()` → if granted, subscribes
- "Not now" → dismissed, shown again next session
- Once enabled: banner replaced with green "🔔 Alarms active on this device"
- Subscription stored against the logged-in user

---

## In-App Alarm UI (when app is open)

On the HACCP homepage when overdue items exist:

```
┌─────────────────────────────────────────────────────────────────┐
│ 🔴 HACCP · Sheffield                    🚨 3 OVERDUE CHECKS     │
└─────────────────────────────────────────────────────────────────┘
```

- Header turns red, "X OVERDUE CHECKS" badge pulses
- Each overdue tile has a pulsing red border animation
- Beep sounds every 5 minutes (escalating per table above)
- No dismiss button — only clears when checks are done

---

## Key Constraints & Caveats

1. **iOS silent mode** — if iPad is muted, push notification vibrates only.
   Staff must ensure iPads used for HACCP monitoring are NOT on silent.

2. **PWA must be installed** — Web Push only works when app is added to
   Home Screen. Opening mfsops.com in Safari browser tab does NOT receive
   push notifications. All HACCP iPads must have it installed.

3. **iOS 16.4+ required** — older iPads running iOS < 16.4 will not receive
   push notifications. In-app alarm still works on all versions.

4. **One notification at a time** — `tag: 'haccp-alarm'` ensures only the
   most recent overdue notification is visible in notification centre.
   Previous ones are replaced.

5. **No custom alarm sounds** — iOS plays the device notification sound.
   We cannot play a custom alarm tone via Web Push. In-app Web Audio gives
   us tone control when the app is open.

---

## Self-audit Log

| Date | Issue | Fix |
|---|---|---|
| 2026-04-27 | Web Audio cannot play when screen locked | Two-layer approach: Web Audio (foreground) + Web Push (background) |
| 2026-04-27 | Current sw.js is a cleanup/deregister script | Replace with real push handler |
| 2026-04-27 | Cannot control notification volume on iOS | Document: staff must not use silent mode on HACCP iPads |
| 2026-04-27 | Custom alarm sounds not possible via Web Push | Web Audio handles in-app sound; system sound for locked screen |

---

## Build Order

1. VAPID keys → Vercel env vars
2. DB migration: `push_subscriptions` + `alarm_sessions`
3. New `sw.js` — push handler
4. `lib/webpush.ts` — send push utility
5. `lib/haccp-alarm-status.ts` — shared overdue logic
6. `POST /api/notifications/subscribe` + `DELETE /api/notifications/unsubscribe`
7. `GET /api/cron/haccp-alarm` + vercel.json cron entry
8. `hooks/useHACCPAlarm.ts` — Web Audio in-app alarm
9. `hooks/usePushNotifications.ts` — push subscription management
10. `app/haccp/page.tsx` — permission banner + alarm UI + hook integration
11. Tests

---

*Stack: Next.js 15, Supabase (uqgecljspgtevoylwkep), Vercel (prj_84NlryZjHcGlA6R2O6zQ57aWkOFZ)*
