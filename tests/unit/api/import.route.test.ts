/**
 * tests/unit/api/import.route.test.ts
 *
 * F-12 — proves the thinned POST /api/admin/import route is a thin doorman over
 * the LLMExtractor port: the 401/400 guards are unchanged, it dispatches on
 * `type` to the right port method, returns the port's
 * { clean_rows, flagged_rows } verbatim, maps LLMExtractionError → the SAME 502
 * message users see today, and falls through other errors to 500.
 *
 * The wiring singleton is mocked to inject the Fake adapter — the route never
 * touches the real Anthropic API (the deliberate no-real-AI test boundary).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { LLMExtractionError } from "@/lib/ports";

// Spies stand in for the wired llmExtractor's two methods.
const extractCustomers = vi.fn();
const extractProducts = vi.fn();

vi.mock("@/lib/wiring/llm", () => ({
  llmExtractor: {
    extractCustomers: (...args: unknown[]) => extractCustomers(...args),
    extractProducts: (...args: unknown[]) => extractProducts(...args),
  },
}));

import { POST } from "@/app/api/admin/import/route";

const ADMIN = { "x-mfs-user-id": "u-1", "x-mfs-user-role": "admin" };

function makeReq(
  body: unknown,
  headers: Record<string, string> = ADMIN,
  rawBody?: string,
): NextRequest {
  return new NextRequest("http://localhost/api/admin/import", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: rawBody ?? JSON.stringify(body),
  });
}

beforeEach(() => {
  extractCustomers.mockReset();
  extractProducts.mockReset();
});

describe("POST /api/admin/import — guards", () => {
  it("returns 401 when x-mfs-user-id is absent", async () => {
    const res = await POST(
      makeReq({ raw_text: "x", type: "customers" }, { "x-mfs-user-role": "admin" }),
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthenticated" });
  });

  it("returns 403 'Admin only' for a non-admin (NEW — import now role-gated)", async () => {
    const res = await POST(
      makeReq({ raw_text: "x", type: "customers" }, {
        "x-mfs-user-id": "o1",
        "x-mfs-user-role": "office",
      }),
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Admin only" });
    expect(extractCustomers).not.toHaveBeenCalled();
  });

  it("returns 400 on invalid JSON body", async () => {
    const res = await POST(makeReq(undefined, undefined, "{not json"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid JSON body" });
  });

  it("returns 400 when raw_text is missing/blank", async () => {
    const res = await POST(makeReq({ raw_text: "   ", type: "customers" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "raw_text is required" });
  });

  it("returns 400 when type is invalid", async () => {
    const res = await POST(makeReq({ raw_text: "x", type: "widgets" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: 'type must be "customers" or "products"',
    });
  });
});

describe("POST /api/admin/import — dispatch on type", () => {
  it("type:'customers' calls extractCustomers and returns 200 with its result", async () => {
    const payload = {
      clean_rows: [{ name: "Acme" }],
      flagged_rows: [{ row: 1, raw: "x", reason: "y" }],
    };
    extractCustomers.mockResolvedValue(payload);
    const res = await POST(makeReq({ raw_text: "Acme", type: "customers" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(payload);
    expect(extractCustomers).toHaveBeenCalledWith("Acme");
    expect(extractProducts).not.toHaveBeenCalled();
  });

  it("type:'products' calls extractProducts and returns 200 with its result", async () => {
    const payload = {
      clean_rows: [
        { name: "Lamb", category: "Meat", code: "none", box_size: "none" },
      ],
      flagged_rows: [],
    };
    extractProducts.mockResolvedValue(payload);
    const res = await POST(makeReq({ raw_text: "Lamb", type: "products" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(payload);
    expect(extractProducts).toHaveBeenCalledWith("Lamb");
    expect(extractCustomers).not.toHaveBeenCalled();
  });
});

describe("POST /api/admin/import — error mapping", () => {
  it("maps LLMExtractionError to 502 with the exact today message", async () => {
    extractCustomers.mockRejectedValue(new LLMExtractionError());
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST(makeReq({ raw_text: "x", type: "customers" }));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({
      error: "AI did not return structured data — please try again",
    });
    errSpy.mockRestore();
  });

  it("falls through any other error to 500 'Server error'", async () => {
    extractProducts.mockRejectedValue(new Error("boom"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST(makeReq({ raw_text: "x", type: "products" }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Server error" });
    errSpy.mockRestore();
  });
});
