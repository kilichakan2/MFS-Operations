/**
 * tests/unit/services/ComplimentsService.test.ts
 *
 * F-17 PR1 — unit tests for the Compliments business rules, run against the
 * Fake adapter. Introduce-only: the lifted logic must be byte-identical to the
 * two compliments routes (the `body required` 400, the join resolution, the
 * newest-first/limit-100 list, and the active-only recipient dropdown).
 */
import { describe, it, expect } from "vitest";
import { createComplimentsService } from "@/lib/services";
import { createFakeComplimentsRepository } from "@/lib/adapters/fake";
import type { CreateComplimentInput } from "@/lib/domain";

const SEED = {
  users: {
    u1: { id: "u1", name: "Hakan", role: "admin", active: true },
    u2: { id: "u2", name: "Mert", role: "office", active: true },
    u3: { id: "u3", name: "Ada", role: "driver", active: false },
  },
} as const;

function makeService(
  seed?: Parameters<typeof createFakeComplimentsRepository>[0],
) {
  const compliments = createFakeComplimentsRepository(seed);
  const service = createComplimentsService({ compliments });
  return { service, compliments };
}

function createInput(
  overrides: Partial<CreateComplimentInput> = {},
): CreateComplimentInput {
  return {
    body: "Great job today",
    postedBy: "u1",
    recipientId: "u2",
    ...overrides,
  };
}

// ── validateCreate ─────────────────────────────────────────────

describe("ComplimentsService.validateCreate", () => {
  const { service } = makeService();

  it("accepts a non-empty body", () => {
    expect(service.validateCreate(createInput())).toEqual({ ok: true });
  });

  it("rejects an empty body", () => {
    expect(service.validateCreate(createInput({ body: "" }))).toEqual({
      ok: false,
      status: 400,
      message: "body required",
    });
  });

  it("rejects a whitespace-only body", () => {
    expect(service.validateCreate(createInput({ body: "   " }))).toEqual({
      ok: false,
      status: 400,
      message: "body required",
    });
  });
});

// ── createCompliment ───────────────────────────────────────────

describe("ComplimentsService.createCompliment", () => {
  it("persists with poster + recipient names resolved", async () => {
    const { service } = makeService(SEED);
    const c = await service.createCompliment(createInput());
    expect(c.body).toBe("Great job today");
    expect(c.postedById).toBe("u1");
    expect(c.postedByName).toBe("Hakan");
    expect(c.recipientId).toBe("u2");
    expect(c.recipientName).toBe("Mert");
  });

  it("handles a null recipient", async () => {
    const { service } = makeService(SEED);
    const c = await service.createCompliment(createInput({ recipientId: null }));
    expect(c.recipientId).toBeNull();
    expect(c.recipientName).toBeNull();
  });

  it("falls back to 'Unknown' poster when unseeded", async () => {
    const { service } = makeService(); // no seed
    const c = await service.createCompliment(createInput());
    expect(c.postedByName).toBe("Unknown");
  });

  it("trims the body and rejects a blank one (CHECK parity)", async () => {
    const { service } = makeService(SEED);
    const c = await service.createCompliment(createInput({ body: "  Nice  " }));
    expect(c.body).toBe("Nice");
    await expect(
      service.createCompliment(createInput({ body: "   " })),
    ).rejects.toThrow(/compliments_body_check/);
  });
});

// ── listRecent ─────────────────────────────────────────────────

describe("ComplimentsService.listRecent", () => {
  it("returns newest-first", async () => {
    const { service } = makeService(SEED);
    const a = await service.createCompliment(createInput({ body: "first one" }));
    const b = await service.createCompliment(createInput({ body: "second one" }));
    const list = await service.listRecent();
    expect(list.map((c) => c.id)).toEqual([b.id, a.id]);
  });

  it("caps the list at 100", async () => {
    const { service } = makeService(SEED);
    for (let i = 0; i < 105; i++) {
      await service.createCompliment(createInput({ body: `compliment ${i}` }));
    }
    const list = await service.listRecent();
    expect(list).toHaveLength(100);
  });
});

// ── listActiveRecipients ───────────────────────────────────────

describe("ComplimentsService.listActiveRecipients", () => {
  it("returns active users only, ordered by name", async () => {
    const { service } = makeService(SEED);
    const recipients = await service.listActiveRecipients();
    expect(recipients.map((r) => r.name)).toEqual(["Hakan", "Mert"]); // Ada inactive
    expect(recipients[0]).toEqual({ id: "u1", name: "Hakan", role: "admin" });
  });

  it("returns an empty list with no seed", async () => {
    const { service } = makeService();
    expect(await service.listActiveRecipients()).toEqual([]);
  });
});
