/**
 * tests/integration/adapters/supabase/HaccpReportingAlarmInputs.test.ts
 *
 * F-25 — fetchAlarmOverdueInputs(today) against the REAL Supabase adapter on the
 * local stack (F-INFRA-01). Proves the 4-read shape: the method runs the four
 * verbatim selects (cold sessions, room sessions, diary phases for `today`, +
 * the unresolved-CA count) and returns the owned AlarmOverdueInputs shape
 * (three string arrays + a numeric count) without throwing.
 *
 * Shape-parity test — it does not seed overdue rows (that's the usecase's job to
 * interpret); it confirms the adapter reads + maps correctly against the live
 * schema. unresolvedCas reflects whatever the seed leaves; we only assert it is
 * a non-negative number.
 *
 * Prerequisites:
 *   npm run db:up
 *   npm run test:integration -- adapters/supabase
 */
import { describe, it, expect } from "vitest";
import { createSupabaseHaccpReportingRepository } from "@/lib/adapters/supabase";
import { getServiceClient } from "../../_setup";

describe("HaccpReportingRepository.fetchAlarmOverdueInputs (live Supabase)", () => {
  it("returns the AlarmOverdueInputs shape (3 string arrays + numeric count)", async () => {
    const repo = createSupabaseHaccpReportingRepository(getServiceClient());
    const today = new Date().toLocaleDateString("en-CA", {
      timeZone: "Europe/London",
    });

    const inputs = await repo.fetchAlarmOverdueInputs(today);

    expect(Array.isArray(inputs.coldSessions)).toBe(true);
    expect(Array.isArray(inputs.roomSessions)).toBe(true);
    expect(Array.isArray(inputs.diaryPhases)).toBe(true);
    expect(typeof inputs.unresolvedCas).toBe("number");
    expect(inputs.unresolvedCas).toBeGreaterThanOrEqual(0);
    // Every session/phase entry is a string (the verbatim column maps).
    for (const s of inputs.coldSessions) expect(typeof s).toBe("string");
    for (const s of inputs.roomSessions) expect(typeof s).toBe("string");
    for (const p of inputs.diaryPhases) expect(typeof p).toBe("string");
  });
});
