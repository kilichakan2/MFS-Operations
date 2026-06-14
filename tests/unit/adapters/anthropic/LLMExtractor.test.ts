/**
 * tests/unit/adapters/anthropic/LLMExtractor.test.ts
 *
 * F-12 — battle-tests the Anthropic LLMExtractor adapter on the bench. This is
 * a PURE RELOCATION of the AI integration that used to live inline in
 * app/api/admin/import/route.ts, so the tests pin every value the AI sees and
 * every value it returns, proving byte-identical behaviour:
 *
 *   - per entity: model='claude-sonnet-4-6', max_tokens=4096, the correct
 *     system prompt + tool schema + forced tool_choice, and the exact
 *     user-message template;
 *   - tool_use block → mapped domain types;
 *   - no tool_use block → LLMExtractionError + the two console.error lines;
 *   - array-guarding: a missing clean_rows/flagged_rows → [] + the warn line.
 *
 * `@anthropic-ai/sdk` is mocked (vi.mock) — no network, no key, no cost.
 * Modelled on tests/unit/adapters/bcrypt/PasswordHasher.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock the SDK before importing the adapter ────────────────────────────────
// The mock Anthropic class records the args it was constructed with and the
// args passed to messages.create; the create return value is set per-test.
const createMock = vi.fn();
const constructedWith: Array<Record<string, unknown>> = [];

vi.mock("@anthropic-ai/sdk", () => {
  class MockAnthropic {
    messages = { create: createMock };
    constructor(opts: Record<string, unknown>) {
      constructedWith.push(opts);
    }
  }
  return { default: MockAnthropic };
});

// Import AFTER the mock is registered. The adapter exports its prompts/tools so
// the test can assert they are passed through verbatim (no retyping ~250 lines).
import {
  createAnthropicLLMExtractor,
  CUSTOMER_TOOL,
  PRODUCT_TOOL,
  CUSTOMER_SYSTEM,
  PRODUCT_SYSTEM,
} from "@/lib/adapters/anthropic/LLMExtractor";
import { LLMExtractionError } from "@/lib/ports";

/** Build a fake Anthropic message whose content has a tool_use block. */
function toolUseMessage(input: unknown) {
  return {
    stop_reason: "tool_use",
    content: [{ type: "tool_use", id: "toolu_1", name: "x", input }],
  };
}

/** Build a fake Anthropic message with NO tool_use block (e.g. end_turn text). */
function noToolMessage() {
  return {
    stop_reason: "end_turn",
    content: [{ type: "text", text: "I cannot do that." }],
  };
}

function makeExtractor() {
  return createAnthropicLLMExtractor({ getApiKey: () => "test-key" });
}

beforeEach(() => {
  createMock.mockReset();
  constructedWith.length = 0;
});

describe("createAnthropicLLMExtractor — call parameters (frozen invariants)", () => {
  it("extractCustomers sends model, max_tokens, customer prompt, customer tool, forced tool_choice, user template", async () => {
    createMock.mockResolvedValue(
      toolUseMessage({ clean_rows: [], flagged_rows: [] }),
    );
    const extractor = makeExtractor();
    await extractor.extractCustomers("  Acme Foods\n");

    expect(createMock).toHaveBeenCalledTimes(1);
    const args = createMock.mock.calls[0][0];
    expect(args.model).toBe("claude-sonnet-4-6");
    expect(args.max_tokens).toBe(4096);
    expect(args.system).toBe(CUSTOMER_SYSTEM);
    expect(args.tools).toEqual([CUSTOMER_TOOL]);
    expect(args.tool_choice).toEqual({
      type: "tool",
      name: "return_mapped_customers",
    });
    expect(args.messages).toEqual([
      {
        role: "user",
        // raw_text.trim() applied: leading/trailing whitespace gone
        content: "Map the following customer data:\n\nAcme Foods",
      },
    ]);
  });

  it("extractProducts sends the product prompt, product tool, its forced tool_choice, and the product user template", async () => {
    createMock.mockResolvedValue(
      toolUseMessage({ clean_rows: [], flagged_rows: [] }),
    );
    const extractor = makeExtractor();
    await extractor.extractProducts("Lamb Shoulder");

    const args = createMock.mock.calls[0][0];
    expect(args.model).toBe("claude-sonnet-4-6");
    expect(args.max_tokens).toBe(4096);
    expect(args.system).toBe(PRODUCT_SYSTEM);
    expect(args.tools).toEqual([PRODUCT_TOOL]);
    expect(args.tool_choice).toEqual({
      type: "tool",
      name: "return_mapped_products",
    });
    expect(args.messages[0].content).toBe(
      "Map the following product data:\n\nLamb Shoulder",
    );
  });

  it("reads the API key lazily (not at construction) and builds the client on first call", async () => {
    createMock.mockResolvedValue(
      toolUseMessage({ clean_rows: [], flagged_rows: [] }),
    );
    let reads = 0;
    const extractor = createAnthropicLLMExtractor({
      getApiKey: () => {
        reads += 1;
        return "lazy-key";
      },
    });
    // No client constructed, no key read at factory time.
    expect(constructedWith).toHaveLength(0);
    expect(reads).toBe(0);

    await extractor.extractCustomers("x");
    expect(reads).toBeGreaterThan(0);
    expect(constructedWith).toHaveLength(1);
    expect(constructedWith[0].apiKey).toBe("lazy-key");

    // Second call reuses the memoized client — no second construction.
    await extractor.extractCustomers("y");
    expect(constructedWith).toHaveLength(1);
  });
});

describe("createAnthropicLLMExtractor — tool_use parse → domain types", () => {
  it("maps a customer tool_use block's input arrays to CustomerExtraction", async () => {
    const input = {
      clean_rows: [{ name: "Acme Foods" }],
      flagged_rows: [{ row: 2, raw: "TOTAL: 5", reason: "total row" }],
    };
    createMock.mockResolvedValue(toolUseMessage(input));
    const extractor = makeExtractor();
    const result = await extractor.extractCustomers("Acme Foods");
    expect(result).toEqual({
      clean_rows: [{ name: "Acme Foods" }],
      flagged_rows: [{ row: 2, raw: "TOTAL: 5", reason: "total row" }],
    });
  });

  it("maps a product tool_use block's input arrays to ProductExtraction", async () => {
    const input = {
      clean_rows: [
        { name: "Lamb Shoulder", category: "Meat", code: "none", box_size: "none" },
      ],
      flagged_rows: [],
    };
    createMock.mockResolvedValue(toolUseMessage(input));
    const extractor = makeExtractor();
    const result = await extractor.extractProducts("Lamb Shoulder");
    expect(result).toEqual({
      clean_rows: [
        { name: "Lamb Shoulder", category: "Meat", code: "none", box_size: "none" },
      ],
      flagged_rows: [],
    });
  });
});

describe("createAnthropicLLMExtractor — no tool_use block → typed 502 path", () => {
  it("throws LLMExtractionError and logs stop_reason + content when no tool_use block is returned (customers)", async () => {
    createMock.mockResolvedValue(noToolMessage());
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const extractor = makeExtractor();

    await expect(extractor.extractCustomers("x")).rejects.toMatchObject({
      name: "LLMExtractionError",
    });
    await expect(extractor.extractCustomers("x")).rejects.toBeInstanceOf(
      LLMExtractionError,
    );

    // The two verbatim console.error lines fire.
    expect(errSpy).toHaveBeenCalledWith(
      "[import] No tool_use block. stop_reason:",
      "end_turn",
    );
    expect(errSpy).toHaveBeenCalledWith(
      "[import] Content:",
      JSON.stringify(noToolMessage().content),
    );
    errSpy.mockRestore();
  });

  it("throws LLMExtractionError for the product path too", async () => {
    createMock.mockResolvedValue(noToolMessage());
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const extractor = makeExtractor();
    await expect(extractor.extractProducts("x")).rejects.toBeInstanceOf(
      LLMExtractionError,
    );
    errSpy.mockRestore();
  });
});

describe("createAnthropicLLMExtractor — array-guarding", () => {
  it("defaults clean_rows to [] and warns when it is missing", async () => {
    createMock.mockResolvedValue(
      toolUseMessage({ flagged_rows: [{ row: 1, raw: "x", reason: "y" }] }),
    );
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const extractor = makeExtractor();
    const result = await extractor.extractCustomers("x");
    expect(result.clean_rows).toEqual([]);
    expect(result.flagged_rows).toEqual([{ row: 1, raw: "x", reason: "y" }]);
    expect(warnSpy).toHaveBeenCalledWith(
      "[import] clean_rows missing, defaulted to []",
    );
    warnSpy.mockRestore();
  });

  it("defaults flagged_rows to [] and warns when it is missing", async () => {
    createMock.mockResolvedValue(
      toolUseMessage({ clean_rows: [{ name: "Acme" }] }),
    );
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const extractor = makeExtractor();
    const result = await extractor.extractCustomers("x");
    expect(result.flagged_rows).toEqual([]);
    expect(result.clean_rows).toEqual([{ name: "Acme" }]);
    expect(warnSpy).toHaveBeenCalledWith(
      "[import] flagged_rows missing, defaulted to []",
    );
    warnSpy.mockRestore();
  });
});
