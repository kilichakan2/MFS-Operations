/**
 * Guard for delta #4: surfacing the diary "operational" (mid-day) overdue in
 * the UI must NOT add it to the audio-alarm trigger set. `getOverdueItems`
 * (read by the cron push + the in-app useHACCPAlarm beeps) only fires on
 * cold/room AM+PM, diary opening/closing, and unresolved CAs. This pins that
 * operational_overdue NEVER produces an alarm item.
 */
import { describe, it, expect } from "vitest";
import { getOverdueItems } from "@/lib/haccp-alarm-status";

describe("alarm overdue set excludes the operational (mid-day) diary", () => {
  it("operational_overdue alone produces NO alarm item", () => {
    const items = getOverdueItems({
      cold_storage: { am_overdue: false, pm_overdue: false },
      processing_room: { am_overdue: false, pm_overdue: false },
      // operational_overdue present but not part of the alarm shape
      daily_diary: { opening_overdue: false, closing_overdue: false },
      unresolved_cas: 0,
    });
    expect(items).toEqual([]);
  });

  it("never emits a key referencing operational, even alongside real triggers", () => {
    const items = getOverdueItems({
      cold_storage: { am_overdue: true, pm_overdue: false },
      processing_room: { am_overdue: false, pm_overdue: false },
      daily_diary: { opening_overdue: true, closing_overdue: false },
      unresolved_cas: 0,
    });
    expect(items.map((i) => i.key)).toEqual(["cold_am", "diary_open"]);
    expect(items.some((i) => /operational/i.test(i.key))).toBe(false);
    expect(items.some((i) => /operational/i.test(i.label))).toBe(false);
  });
});
