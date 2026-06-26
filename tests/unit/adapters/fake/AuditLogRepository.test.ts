/**
 * tests/unit/adapters/fake/AuditLogRepository.test.ts
 *
 * F-20 PR3 — runs the shared AuditLogRepository contract against the Fake
 * in-memory adapter, PLUS a Fake-specific assertion that `record` persists every
 * field verbatim (the shared contract can't read back — the port is write-only).
 * No DB. No network.
 */
import { describe, it, expect } from "vitest";
import { auditLogRepositoryContract } from "@/lib/ports/__contracts__/AuditLogRepository.contract";
import { createFakeAuditLogRepository } from "@/lib/adapters/fake";
import type { AuditLogEntry } from "@/lib/domain";

let seq = 0;
function makeEntry(): AuditLogEntry {
  seq += 1;
  return {
    user_id: "u-1",
    screen: "screen5",
    action: "imported",
    record_id: null,
    summary: `contract entry ${seq}`,
  };
}

auditLogRepositoryContract(async () => {
  const repo = createFakeAuditLogRepository();
  return { repo, makeEntry, cleanup: async () => {} };
});

describe("FakeAuditLogRepository — inspection", () => {
  it("record persists every field verbatim, in order", async () => {
    const repo = createFakeAuditLogRepository();
    const a: AuditLogEntry = {
      user_id: "u-a",
      screen: "screen5",
      action: "imported",
      record_id: null,
      summary: "3 customers imported via manual column mapper by Admin",
    };
    const b: AuditLogEntry = {
      user_id: "u-b",
      screen: "screen5",
      action: "imported",
      record_id: "r-1",
      summary: "1 product imported via AI import by Bob",
    };
    await repo.record(a);
    await repo.record(b);
    expect(repo.entries).toEqual([a, b]);
  });
});
