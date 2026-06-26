/**
 * lib/usecases/runHaccpAlarmCheck.ts
 *
 * The HACCP overdue-alarm "desk" use-case (F-25). One business operation — "the
 * every-5-minute cron checks what's overdue and nags the registered devices" —
 * that composes FOUR seams: the reporting read (overdue status), the
 * registered-devices list, the escalation-ledger, and the push sender. It holds
 * the per-subscriber escalation loop + dead-subscription cleanup BYTE-IDENTICALLY
 * (lifted from app/api/cron/haccp-alarm/route.ts).
 *
 * Composition lives in a USECASE, not a service — ADR-0002: a use-case is the
 * correct home to compose multiple ports/services; the services-fence (F-TD-05)
 * forbids a service→service import. `usecase → service` is allowed (mirrors
 * kdsLineDone → OrdersService).
 *
 * DETERMINISM: `run(now)` takes the clock INJECTED (the route calls `new Date()`
 * and passes it). `nowIso = now.toISOString()` is derived ONCE and reused for the
 * resolve + every updateCount, so a frozen-clock test pins every timestamp + the
 * escalation count to the digit. The same `now` flows into
 * `reporting.getAlarmOverdueStatus(now)` so the overdue read + the timestamps
 * agree on "now".
 *
 * Byte-identity preserved (see the plan's checklist):
 *   - empty-subscriptions short-circuit returns overdue = overdueItems.length
 *     even though sent = 0
 *   - nothing-overdue resolves all active sessions and returns { sent:0, overdue:0 }
 *   - found session → count = (notificationCount) + 1; missing → insert (count 0)
 *     and count = 1 (the insert-0-then-update quirk — R1)
 *   - one push per overdue item, tag `haccp-${item.key}`, url '/haccp',
 *     requireInteraction true, text from getNotificationText([item], count)
 *   - first send → false: break the item loop, queue the endpoint, do NOT update
 *     the session (so a first-item failure leaves its session at count 0)
 *   - cleanup deletes the queued endpoints (no-op when none)
 *   - the `[haccp-alarm] Overdue: N, Sent: sent/total` log moves HERE (R4 —
 *     byte-identical string; the route no longer logs)
 */
import {
  getOverdueItems,
  getNotificationText,
  getOverdueKey,
} from "@/lib/haccp-alarm-status";
import type {
  PushSubscriptionsRepository,
  AlarmSessionsRepository,
  PushSender,
} from "@/lib/ports";
import type { HaccpReportingService } from "@/lib/services";

export interface RunHaccpAlarmCheckDeps {
  readonly reporting: HaccpReportingService;
  readonly subscriptions: PushSubscriptionsRepository;
  readonly alarmSessions: AlarmSessionsRepository;
  readonly pushSender: PushSender;
}

export interface HaccpAlarmResult {
  readonly ok: true;
  readonly sent: number;
  readonly overdue: number;
}

export interface RunHaccpAlarmCheck {
  /**
   * Runs the full overdue-check + escalation + cleanup. `now` INJECTED. Returns
   * the EXACT { ok, sent, overdue } shapes the route returns today (including the
   * empty-subscriptions short-circuit where overdue = overdueItems.length while
   * sent = 0). Holds the per-subscriber loop, the insert-0-then-update-count
   * quirk, the first-false break, and the expired-endpoint cleanup
   * BYTE-IDENTICALLY. @throws ServiceError (the route's outer catch → 500).
   */
  run(now: Date): Promise<HaccpAlarmResult>;
}

export function createRunHaccpAlarmCheck(
  deps: RunHaccpAlarmCheckDeps,
): RunHaccpAlarmCheck {
  const { reporting, subscriptions, alarmSessions, pushSender } = deps;

  return {
    async run(now: Date): Promise<HaccpAlarmResult> {
      const nowIso = now.toISOString();

      const status = await reporting.getAlarmOverdueStatus(now);
      const overdueItems = getOverdueItems(status);
      const overdueKey = getOverdueKey(overdueItems);

      // Fetch all active push subscriptions
      const subscriptionsList = await subscriptions.listAll();

      if (subscriptionsList.length === 0) {
        return { ok: true, sent: 0, overdue: overdueItems.length };
      }

      if (overdueItems.length === 0) {
        // Nothing overdue — resolve all active alarm sessions
        await alarmSessions.resolveAllActive(nowIso);
        return { ok: true, sent: 0, overdue: 0 };
      }

      // Process each subscription
      let sent = 0;
      const expiredEndpoints: string[] = [];

      for (const sub of subscriptionsList) {
        // Find or create alarm session for this subscription + overdue key
        const existing = await alarmSessions.findActiveBySubscriptionAndKey(
          sub.id,
          overdueKey,
        );

        let count = 1;
        let sessionId: string;

        if (existing) {
          count = existing.notificationCount + 1;
          sessionId = existing.id;
        } else {
          // New overdue session for this subscription (inserted with count 0).
          const newSession = await alarmSessions.insert(sub.id, overdueKey);
          sessionId = newSession?.id ?? "";
        }

        // Send one notification per overdue item — each fires a separate alert.
        let subFailed = false;
        for (const item of overdueItems) {
          const { title, body } = getNotificationText([item], count);
          const success = await pushSender.send(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            {
              title,
              body,
              url: "/haccp",
              tag: `haccp-${item.key}`,
              requireInteraction: true,
            },
          );
          if (success) {
            sent++;
          } else {
            subFailed = true;
            break; // subscription dead — no point sending more to it
          }
        }

        if (subFailed) {
          expiredEndpoints.push(sub.endpoint);
        } else {
          // Update alarm session count after all items sent
          if (sessionId) {
            await alarmSessions.updateCount(sessionId, count, nowIso);
          }
        }
      }

      // Clean up expired subscriptions
      if (expiredEndpoints.length > 0) {
        await subscriptions.deleteByEndpoints(expiredEndpoints);
      }

      console.log(
        `[haccp-alarm] Overdue: ${overdueItems.length}, Sent: ${sent}/${subscriptionsList.length}`,
      );
      return { ok: true, sent, overdue: overdueItems.length };
    },
  };
}
