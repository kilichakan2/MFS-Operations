/**
 * tests/unit/adapters/fake/LLMExtractor.test.ts
 *
 * F-12 — the Fake LLMExtractor adapter: a no-network, no-SDK stand-in that
 * returns deterministic, well-shaped domain data so route/use-case tests run
 * fast, free, and identically every time. A `throwOnExtract` seed makes both
 * methods throw LLMExtractionError so the 502 path can be exercised.
 *
 * Modelled on the other fake adapters in lib/adapters/fake/.
 */
import { describe, it, expect } from "vitest";
import { createFakeLLMExtractor } from "@/lib/adapters/fake";
import { LLMExtractionError } from "@/lib/ports";

describe("createFakeLLMExtractor — deterministic, well-shaped output", () => {
  it("returns a valid CustomerExtraction shape", async () => {
    const extractor = createFakeLLMExtractor();
    const result = await extractor.extractCustomers("Acme Foods");
    expect(Array.isArray(result.clean_rows)).toBe(true);
    expect(Array.isArray(result.flagged_rows)).toBe(true);
    for (const row of result.clean_rows) {
      expect(typeof row.name).toBe("string");
    }
  });

  it("returns a valid ProductExtraction shape (all four fields present)", async () => {
    const extractor = createFakeLLMExtractor();
    const result = await extractor.extractProducts("Lamb Shoulder");
    expect(Array.isArray(result.clean_rows)).toBe(true);
    expect(Array.isArray(result.flagged_rows)).toBe(true);
    for (const row of result.clean_rows) {
      expect(typeof row.name).toBe("string");
      expect(typeof row.category).toBe("string");
      expect(typeof row.code).toBe("string");
      expect(typeof row.box_size).toBe("string");
    }
  });

  it("is deterministic — same input yields the same output", async () => {
    const extractor = createFakeLLMExtractor();
    const a = await extractor.extractCustomers("Acme Foods");
    const b = await extractor.extractCustomers("Acme Foods");
    expect(a).toEqual(b);
  });
});

describe("createFakeLLMExtractor — forced error seed", () => {
  it("throws LLMExtractionError from extractCustomers when seeded to fail", async () => {
    const extractor = createFakeLLMExtractor({ throwOnExtract: true });
    await expect(extractor.extractCustomers("x")).rejects.toBeInstanceOf(
      LLMExtractionError,
    );
  });

  it("throws LLMExtractionError from extractProducts when seeded to fail", async () => {
    const extractor = createFakeLLMExtractor({ throwOnExtract: true });
    await expect(extractor.extractProducts("x")).rejects.toBeInstanceOf(
      LLMExtractionError,
    );
  });
});
