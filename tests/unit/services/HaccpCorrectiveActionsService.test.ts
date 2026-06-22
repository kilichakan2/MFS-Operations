/**
 * tests/unit/services/HaccpCorrectiveActionsService.test.ts
 *
 * F-19 PR1 — the standalone Corrective-Actions service. Three pins against the
 * Fake CA repo:
 *   - insertCorrectiveActions passes the rows through UNMODIFIED (incl. the
 *     per-writer `resolved`/`null` nuances from §7) — no normalisation;
 *   - listVerificationQueue delegates (seeded queue echoed);
 *   - signOff delegates with (id, verifiedBy) intact.
 */
import { describe, it, expect } from "vitest";
import { createHaccpCorrectiveActionsService } from "@/lib/services";
import { createFakeHaccpCorrectiveActionsRepository } from "@/lib/adapters/fake";
import type { CorrectiveActionInsert } from "@/lib/domain";

describe("HaccpCorrectiveActionsService", () => {
  it("insertCorrectiveActions passes rows through unmodified (resolved:false + null nuances)", async () => {
    const repo = createFakeHaccpCorrectiveActionsRepository();
    const svc = createHaccpCorrectiveActionsService({
      correctiveActions: repo,
    });

    const rows: CorrectiveActionInsert[] = [
      {
        actioned_by: "u1",
        source_table: "haccp_deliveries",
        source_id: "d1",
        ccp_ref: "CCP1",
        deviation_description: "Temperature: 9°C (fail) on beef. Cause: Other",
        action_taken: "REJECT delivery",
        product_disposition: "reject",
        recurrence_prevention: "Review supplier",
        management_verification_required: true,
        resolved: false, // delivery sets this explicitly
      },
      {
        actioned_by: "u1",
        source_table: "haccp_daily_diary",
        source_id: "x1",
        ccp_ref: "SOP1-opening",
        deviation_description: "Diary (opening) — failed check: doors",
        action_taken: "See diary entry",
        product_disposition: null, // diary writes null
        recurrence_prevention: null, // diary writes null
        management_verification_required: false,
        // resolved omitted — DB default applies
      },
    ];

    await svc.insertCorrectiveActions(rows);

    expect(repo.inserted).toHaveLength(2);
    expect(repo.inserted[0]).toEqual(rows[0]);
    expect(repo.inserted[1]).toEqual(rows[1]);
    // The diary row must NOT carry `resolved` (undefined preserved).
    expect("resolved" in repo.inserted[1]).toBe(false);
  });

  it("insertCorrectiveActions is a no-op for an empty batch", async () => {
    const repo = createFakeHaccpCorrectiveActionsRepository();
    const svc = createHaccpCorrectiveActionsService({
      correctiveActions: repo,
    });
    await svc.insertCorrectiveActions([]);
    expect(repo.inserted).toHaveLength(0);
    expect(repo.insertBatches).toHaveLength(0);
  });

  it("listVerificationQueue delegates to the port", async () => {
    const repo = createFakeHaccpCorrectiveActionsRepository({
      unresolved: [
        {
          id: "c1",
          submitted_at: "2026-06-22T10:00:00Z",
          ccp_ref: "CCP1",
          deviation_description: "x",
          action_taken: "y",
          product_disposition: "reject",
          recurrence_prevention: "z",
          source_table: "haccp_deliveries",
          management_verification_required: true,
          users: { name: "Hakan" },
        },
      ],
      resolved: [],
    });
    const svc = createHaccpCorrectiveActionsService({
      correctiveActions: repo,
    });
    const queue = await svc.listVerificationQueue();
    expect(queue.unresolved).toHaveLength(1);
    expect(queue.unresolved[0].id).toBe("c1");
    expect(queue.resolved).toHaveLength(0);
  });

  it("signOff delegates (id, verifiedBy) to the port", async () => {
    const repo = createFakeHaccpCorrectiveActionsRepository();
    const svc = createHaccpCorrectiveActionsService({
      correctiveActions: repo,
    });
    await svc.signOff("c9", "admin1");
    expect(repo.signOffs).toEqual([{ id: "c9", verifiedBy: "admin1" }]);
  });
});
