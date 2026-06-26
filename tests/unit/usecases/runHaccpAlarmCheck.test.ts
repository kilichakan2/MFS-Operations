/**
 * tests/unit/usecases/runHaccpAlarmCheck.test.ts
 *
 * F-25 — the headline suite. Fakes + a FROZEN `now`. Pins every branch of the
 * alarm cron's escalation/cleanup loop BYTE-IDENTICALLY (the plan's checklist):
 *   - empty subscriptions → { ok:true, sent:0, overdue:N } (overdue is the count
 *     even though nothing was sent)
 *   - nothing overdue → resolveAllActive(nowIso) + { ok:true, sent:0, overdue:0 }
 *   - new-session path inserts count 0 then updates to 1
 *   - escalation increments count on a found session
 *   - first-item-false → break, NO updateCount, endpoint queued, deleteByEndpoints
 *   - multi-item success → sent = items × subs
 *   - exact { ok, sent, overdue } per branch
 *   - the `[haccp-alarm] Overdue: N, Sent: sent/total` log moved into the usecase
 *
 * `reporting` is a hand-written stub exposing only getAlarmOverdueStatus (the one
 * method the usecase calls), seeded with the overdue status shape directly so the
 * tests don't depend on the nowHour thresholds (those are covered separately in
 * the reporting-service test).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRunHaccpAlarmCheck } from "@/lib/usecases/runHaccpAlarmCheck";
import {
  createFakePushSender,
  createFakePushSubscriptionsRepository,
  createFakeAlarmSessionsRepository,
} from "@/lib/adapters/fake";
import type {
  PushSubscriptionsRepository,
  AlarmSessionsRepository,
} from "@/lib/ports";
import type { HaccpReportingService } from "@/lib/services";
import { ServiceError } from "@/lib/errors/ServiceError";

type OverdueStatus = Awaited<
  ReturnType<HaccpReportingService["getAlarmOverdueStatus"]>
>;

const NOTHING_OVERDUE: OverdueStatus = {
  cold_storage: { am_overdue: false, pm_overdue: false },
  processing_room: { am_overdue: false, pm_overdue: false },
  daily_diary: { opening_overdue: false, closing_overdue: false },
  unresolved_cas: 0,
};

// Two overdue items → cold_am + cold_pm (overdueKey sorts to 'cold_am|cold_pm').
const TWO_OVERDUE: OverdueStatus = {
  cold_storage: { am_overdue: true, pm_overdue: true },
  processing_room: { am_overdue: false, pm_overdue: false },
  daily_diary: { opening_overdue: false, closing_overdue: false },
  unresolved_cas: 0,
};

// One overdue item → cold_am only.
const ONE_OVERDUE: OverdueStatus = {
  cold_storage: { am_overdue: true, pm_overdue: false },
  processing_room: { am_overdue: false, pm_overdue: false },
  daily_diary: { opening_overdue: false, closing_overdue: false },
  unresolved_cas: 0,
};

function reportingStub(status: OverdueStatus): HaccpReportingService {
  return {
    async getAlarmOverdueStatus() {
      return status;
    },
  } as unknown as HaccpReportingService;
}

const NOW = new Date("2026-06-26T10:05:00.000Z");
const NOW_ISO = NOW.toISOString();

let logSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => {
  logSpy.mockRestore();
});

describe("runHaccpAlarmCheck — empty subscriptions short-circuit", () => {
  it("returns overdue = overdueItems.length with sent 0, and never resolves/sends", async () => {
    const alarmSessions = createFakeAlarmSessionsRepository();
    const resolveSpy = vi.spyOn(alarmSessions, "resolveAllActive");
    const pushSender = createFakePushSender({ publicKey: "k" });
    const usecase = createRunHaccpAlarmCheck({
      reporting: reportingStub(TWO_OVERDUE),
      subscriptions: createFakePushSubscriptionsRepository(), // no rows
      alarmSessions,
      pushSender,
    });

    const result = await usecase.run(NOW);
    expect(result).toEqual({ ok: true, sent: 0, overdue: 2 });
    expect(resolveSpy).not.toHaveBeenCalled();
    expect(pushSender.sent).toHaveLength(0);
  });
});

describe("runHaccpAlarmCheck — nothing overdue", () => {
  it("resolves all active sessions with nowIso and returns { sent:0, overdue:0 }", async () => {
    const alarmSessions = createFakeAlarmSessionsRepository();
    const resolveSpy = vi.spyOn(alarmSessions, "resolveAllActive");
    const usecase = createRunHaccpAlarmCheck({
      reporting: reportingStub(NOTHING_OVERDUE),
      subscriptions: createFakePushSubscriptionsRepository({
        rows: [
          { id: "s1", userId: "u1", endpoint: "e1", p256dh: "p", auth: "a" },
        ],
      }),
      alarmSessions,
      pushSender: createFakePushSender({ publicKey: "k" }),
    });

    const result = await usecase.run(NOW);
    expect(result).toEqual({ ok: true, sent: 0, overdue: 0 });
    expect(resolveSpy).toHaveBeenCalledWith(NOW_ISO);
  });
});

describe("runHaccpAlarmCheck — new-session insert-0-then-update quirk", () => {
  it("inserts a session at count 0 then updates it to count 1 after a full successful send", async () => {
    const alarmSessions = createFakeAlarmSessionsRepository();
    const subscriptions = createFakePushSubscriptionsRepository({
      rows: [{ id: "s1", userId: "u1", endpoint: "e1", p256dh: "p", auth: "a" }],
    });
    const usecase = createRunHaccpAlarmCheck({
      reporting: reportingStub(ONE_OVERDUE),
      subscriptions,
      alarmSessions,
      pushSender: createFakePushSender({ publicKey: "k" }), // default true
    });

    const result = await usecase.run(NOW);
    expect(result).toEqual({ ok: true, sent: 1, overdue: 1 });
    // After the full successful send, the inserted session is bumped 0 → 1.
    expect(alarmSessions.sessions).toHaveLength(1);
    expect(alarmSessions.sessions[0].notificationCount).toBe(1);
  });
});

describe("runHaccpAlarmCheck — escalation on a found session", () => {
  it("increments a found session's count by 1", async () => {
    // Pre-seed an active session at count 2 for (s1, cold_am).
    const alarmSessions = createFakeAlarmSessionsRepository({
      sessions: [
        {
          id: "sess-1",
          subscriptionId: "s1",
          overdueKey: "cold_am",
          notificationCount: 2,
        },
      ],
    });
    const usecase = createRunHaccpAlarmCheck({
      reporting: reportingStub(ONE_OVERDUE), // overdueKey === 'cold_am'
      subscriptions: createFakePushSubscriptionsRepository({
        rows: [{ id: "s1", userId: "u1", endpoint: "e1", p256dh: "p", auth: "a" }],
      }),
      alarmSessions,
      pushSender: createFakePushSender({ publicKey: "k" }),
    });

    await usecase.run(NOW);
    expect(alarmSessions.sessions[0].notificationCount).toBe(3);
  });
});

describe("runHaccpAlarmCheck — first-item-false break + cleanup", () => {
  it("breaks the item loop on the first failure, never updates the session, queues the endpoint, and deletes it", async () => {
    const alarmSessions = createFakeAlarmSessionsRepository();
    const updateSpy = vi.spyOn(alarmSessions, "updateCount");
    const subscriptions = createFakePushSubscriptionsRepository({
      rows: [
        { id: "s1", userId: "u1", endpoint: "dead-endpoint", p256dh: "p", auth: "a" },
      ],
    });
    const deleteSpy = vi.spyOn(subscriptions, "deleteByEndpoints");
    const pushSender = createFakePushSender({
      publicKey: "k",
      results: { "dead-endpoint": false }, // fails on first item
    });

    const usecase = createRunHaccpAlarmCheck({
      reporting: reportingStub(TWO_OVERDUE), // two items
      subscriptions,
      alarmSessions,
      pushSender,
    });

    const result = await usecase.run(NOW);
    // Only the first item was attempted before the break.
    expect(pushSender.sent).toHaveLength(1);
    expect(result).toEqual({ ok: true, sent: 0, overdue: 2 });
    // Session inserted at 0, NEVER updated (stays 0).
    expect(updateSpy).not.toHaveBeenCalled();
    expect(alarmSessions.sessions[0].notificationCount).toBe(0);
    // Dead endpoint queued + deleted.
    expect(deleteSpy).toHaveBeenCalledWith(["dead-endpoint"]);
  });
});

describe("runHaccpAlarmCheck — multi-item × multi-sub tally", () => {
  it("sends one push per overdue item per subscription and tallies sent correctly", async () => {
    const subscriptions = createFakePushSubscriptionsRepository({
      rows: [
        { id: "s1", userId: "u1", endpoint: "e1", p256dh: "p", auth: "a" },
        { id: "s2", userId: "u2", endpoint: "e2", p256dh: "p", auth: "a" },
      ],
    });
    const pushSender = createFakePushSender({ publicKey: "k" }); // all true
    const usecase = createRunHaccpAlarmCheck({
      reporting: reportingStub(TWO_OVERDUE), // 2 items
      subscriptions,
      alarmSessions: createFakeAlarmSessionsRepository(),
      pushSender,
    });

    const result = await usecase.run(NOW);
    // 2 items × 2 subs = 4 sends.
    expect(pushSender.sent).toHaveLength(4);
    expect(result).toEqual({ ok: true, sent: 4, overdue: 2 });
  });

  it("uses tag `haccp-${item.key}`, url '/haccp', requireInteraction true per item", async () => {
    const pushSender = createFakePushSender({ publicKey: "k" });
    const usecase = createRunHaccpAlarmCheck({
      reporting: reportingStub(TWO_OVERDUE),
      subscriptions: createFakePushSubscriptionsRepository({
        rows: [{ id: "s1", userId: "u1", endpoint: "e1", p256dh: "p", auth: "a" }],
      }),
      alarmSessions: createFakeAlarmSessionsRepository(),
      pushSender,
    });

    await usecase.run(NOW);
    const tags = pushSender.sent.map((s) => s.payload.tag);
    expect(tags).toEqual(["haccp-cold_am", "haccp-cold_pm"]);
    for (const s of pushSender.sent) {
      expect(s.payload.url).toBe("/haccp");
      expect(s.payload.requireInteraction).toBe(true);
    }
  });
});

describe("runHaccpAlarmCheck — log line (R4, moved into the usecase)", () => {
  it("logs `[haccp-alarm] Overdue: N, Sent: sent/total` with the subscription count as total", async () => {
    const usecase = createRunHaccpAlarmCheck({
      reporting: reportingStub(TWO_OVERDUE), // 2 overdue
      subscriptions: createFakePushSubscriptionsRepository({
        rows: [
          { id: "s1", userId: "u1", endpoint: "e1", p256dh: "p", auth: "a" },
          { id: "s2", userId: "u2", endpoint: "e2", p256dh: "p", auth: "a" },
        ],
      }),
      alarmSessions: createFakeAlarmSessionsRepository(),
      pushSender: createFakePushSender({ publicKey: "k" }),
    });

    await usecase.run(NOW);
    // 2 items × 2 subs = 4 sent; total = 2 subscriptions.
    expect(logSpy).toHaveBeenCalledWith("[haccp-alarm] Overdue: 2, Sent: 4/2");
  });
});

/**
 * F-25 🟡-1 (Guard accepted-hardening, decision LOCKED by Hakan).
 *
 * The OLD route swallowed any repo failure and still returned 200. The re-point
 * deliberately changed that: when a subscription/alarm-session repo operation
 * THROWS a ServiceError, the usecase must PROPAGATE the throw (so the route's
 * outer catch returns 500) — NOT swallow-and-continue, NOT return { ok:true }.
 *
 * Each test wraps the real in-memory fake and overrides exactly ONE method to
 * reject with a ServiceError, then asserts `run(now)` rejects with that same
 * error — behaviour-based, through the public interface only. The reporting read
 * is already pinned by the reporting-service test; this suite pins the four
 * repo seams the cron loop touches: listAll, findActiveBySubscriptionAndKey,
 * insert, updateCount, and resolveAllActive.
 */
describe("runHaccpAlarmCheck — repo throw propagates (🟡-1, no silent 200-swallow)", () => {
  const ONE_SUB = [
    { id: "s1", userId: "u1", endpoint: "e1", p256dh: "p", auth: "a" },
  ];

  function rejectingSubscriptions(
    over: Partial<PushSubscriptionsRepository>,
    seedRows = ONE_SUB,
  ): PushSubscriptionsRepository {
    return {
      ...createFakePushSubscriptionsRepository({ rows: seedRows }),
      ...over,
    };
  }

  function rejectingAlarmSessions(
    over: Partial<AlarmSessionsRepository>,
  ): AlarmSessionsRepository {
    return { ...createFakeAlarmSessionsRepository(), ...over };
  }

  it("propagates when subscriptions.listAll throws", async () => {
    const boom = new ServiceError("listAll failed");
    const usecase = createRunHaccpAlarmCheck({
      reporting: reportingStub(TWO_OVERDUE),
      subscriptions: rejectingSubscriptions({
        async listAll() {
          throw boom;
        },
      }),
      alarmSessions: createFakeAlarmSessionsRepository(),
      pushSender: createFakePushSender({ publicKey: "k" }),
    });

    await expect(usecase.run(NOW)).rejects.toBe(boom);
  });

  it("propagates when alarmSessions.findActiveBySubscriptionAndKey throws", async () => {
    const boom = new ServiceError("find failed");
    const usecase = createRunHaccpAlarmCheck({
      reporting: reportingStub(TWO_OVERDUE),
      subscriptions: createFakePushSubscriptionsRepository({ rows: ONE_SUB }),
      alarmSessions: rejectingAlarmSessions({
        async findActiveBySubscriptionAndKey() {
          throw boom;
        },
      }),
      pushSender: createFakePushSender({ publicKey: "k" }),
    });

    await expect(usecase.run(NOW)).rejects.toBe(boom);
  });

  it("propagates when alarmSessions.insert throws (new-session path)", async () => {
    const boom = new ServiceError("insert failed");
    const usecase = createRunHaccpAlarmCheck({
      reporting: reportingStub(TWO_OVERDUE),
      subscriptions: createFakePushSubscriptionsRepository({ rows: ONE_SUB }),
      alarmSessions: rejectingAlarmSessions({
        async insert() {
          throw boom;
        },
      }),
      pushSender: createFakePushSender({ publicKey: "k" }),
    });

    await expect(usecase.run(NOW)).rejects.toBe(boom);
  });

  it("propagates when alarmSessions.updateCount throws (after a successful send)", async () => {
    const boom = new ServiceError("updateCount failed");
    const usecase = createRunHaccpAlarmCheck({
      reporting: reportingStub(ONE_OVERDUE),
      subscriptions: createFakePushSubscriptionsRepository({ rows: ONE_SUB }),
      alarmSessions: rejectingAlarmSessions({
        async updateCount() {
          throw boom;
        },
      }),
      pushSender: createFakePushSender({ publicKey: "k" }), // sends succeed
    });

    await expect(usecase.run(NOW)).rejects.toBe(boom);
  });

  it("propagates when alarmSessions.resolveAllActive throws (nothing-overdue path)", async () => {
    const boom = new ServiceError("resolveAllActive failed");
    const usecase = createRunHaccpAlarmCheck({
      reporting: reportingStub(NOTHING_OVERDUE),
      subscriptions: createFakePushSubscriptionsRepository({ rows: ONE_SUB }),
      alarmSessions: rejectingAlarmSessions({
        async resolveAllActive() {
          throw boom;
        },
      }),
      pushSender: createFakePushSender({ publicKey: "k" }),
    });

    await expect(usecase.run(NOW)).rejects.toBe(boom);
  });
});
