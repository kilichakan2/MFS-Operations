/**
 * tests/unit/services/haccpReportingAlarmStatus.test.ts
 *
 * F-25 — HaccpReportingService.getAlarmOverdueStatus(now): the nowHour-threshold
 * mapping lifted VERBATIM from the cron route's getOverdueStatus. Fake reporting
 * repo + a FROZEN `now`; asserts the threshold table the route used:
 *   cold/room AM ≥ 10, PM ≥ 14; diary opening ≥ 10, closing ≥ 17.
 *
 * `now` is built with the LOCAL-time Date constructor `new Date(y, m, d, hour…)`
 * so `now.getHours()` === `hour` regardless of the CI timezone — matching the
 * route, which used the local `new Date().getHours()`.
 */
import { describe, it, expect } from "vitest";
import { createHaccpReportingService } from "@/lib/services";
import { createFakeHaccpReportingRepository } from "@/lib/adapters/fake";
import type { AlarmOverdueInputs } from "@/lib/domain";
import type { SpreadsheetExporter } from "@/lib/ports";

const noopSpreadsheet: SpreadsheetExporter = {
  toXlsxBuffer() {
    return Buffer.from("");
  },
};

function serviceWith(inputs: AlarmOverdueInputs) {
  return createHaccpReportingService({
    reporting: createFakeHaccpReportingRepository({ alarmOverdueInputs: inputs }),
    spreadsheet: noopSpreadsheet,
  });
}

/** `now` at a given local hour (so getHours() === hour). */
function at(hour: number): Date {
  return new Date(2026, 5, 26, hour, 0, 0);
}

const NOTHING_DONE: AlarmOverdueInputs = {
  coldSessions: [],
  roomSessions: [],
  diaryPhases: [],
  unresolvedCas: 0,
};

describe("HaccpReportingService.getAlarmOverdueStatus — threshold table", () => {
  it("hour 9: nothing overdue yet (all below their cutoffs)", async () => {
    const status = await serviceWith(NOTHING_DONE).getAlarmOverdueStatus(at(9));
    expect(status).toEqual({
      cold_storage: { am_overdue: false, pm_overdue: false },
      processing_room: { am_overdue: false, pm_overdue: false },
      daily_diary: { opening_overdue: false, closing_overdue: false },
      unresolved_cas: 0,
    });
  });

  it("hour 10: AM (cold/room) + diary opening flip overdue; PM + closing still not", async () => {
    const status = await serviceWith(NOTHING_DONE).getAlarmOverdueStatus(at(10));
    expect(status.cold_storage).toEqual({ am_overdue: true, pm_overdue: false });
    expect(status.processing_room).toEqual({ am_overdue: true, pm_overdue: false });
    expect(status.daily_diary).toEqual({
      opening_overdue: true,
      closing_overdue: false,
    });
  });

  it("hour 14: PM (cold/room) flips overdue; closing still not (cutoff 17)", async () => {
    const status = await serviceWith(NOTHING_DONE).getAlarmOverdueStatus(at(14));
    expect(status.cold_storage).toEqual({ am_overdue: true, pm_overdue: true });
    expect(status.processing_room).toEqual({ am_overdue: true, pm_overdue: true });
    expect(status.daily_diary.closing_overdue).toBe(false);
  });

  it("hour 17: diary closing flips overdue", async () => {
    const status = await serviceWith(NOTHING_DONE).getAlarmOverdueStatus(at(17));
    expect(status.daily_diary.closing_overdue).toBe(true);
  });

  it("a completed session is never overdue even past its cutoff", async () => {
    const status = await serviceWith({
      coldSessions: ["AM", "PM"],
      roomSessions: ["AM"],
      diaryPhases: ["opening", "closing"],
      unresolvedCas: 0,
    }).getAlarmOverdueStatus(at(18));
    expect(status.cold_storage).toEqual({ am_overdue: false, pm_overdue: false });
    expect(status.processing_room).toEqual({ am_overdue: false, pm_overdue: true });
    expect(status.daily_diary).toEqual({
      opening_overdue: false,
      closing_overdue: false,
    });
  });

  it("unresolved_cas passes through verbatim", async () => {
    const status = await serviceWith({
      ...NOTHING_DONE,
      unresolvedCas: 4,
    }).getAlarmOverdueStatus(at(9));
    expect(status.unresolved_cas).toBe(4);
  });
});
