/**
 * tests/unit/api/validate.test.ts
 *
 * F-08 — parseOrThrow: the one tiny helper that converts a ZodError
 * into the documented ValidationError shape
 * (`fields: Record<'<path.joined>', string[]>`), so every route
 * boundary surfaces the same wire contract.
 */
import { describe, it, expect } from "vitest";
import { z } from "zod";
import { parseOrThrow } from "@/lib/api/validate";
import { ValidationError } from "@/lib/errors";

describe("parseOrThrow", () => {
  const schema = z.object({
    name: z.string(),
    nested: z.object({ qty: z.number() }),
  });

  it("returns the parsed (transformed) value on success", () => {
    const upper = z.string().transform((s) => s.toUpperCase());
    expect(parseOrThrow(upper, "abc")).toBe("ABC");
  });

  it("throws ValidationError with dot-joined field paths on failure", () => {
    let caught: unknown = null;
    try {
      parseOrThrow(schema, { name: 42, nested: { qty: "x" } });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ValidationError);
    const err = caught as ValidationError;
    expect(err.httpStatus).toBe(400);
    expect(err.message).toBe("Invalid request");
    expect(Object.keys(err.fields).sort()).toEqual(["name", "nested.qty"]);
    expect(Array.isArray(err.fields["name"])).toBe(true);
    expect(err.fields["name"]!.length).toBeGreaterThan(0);
  });

  it("collects multiple messages under the same path", () => {
    const multi = z.object({
      v: z.string().min(5, "too short").regex(/^\d+$/, "digits only"),
    });
    let caught: unknown = null;
    try {
      parseOrThrow(multi, { v: "ab" });
    } catch (e) {
      caught = e;
    }
    const err = caught as ValidationError;
    expect(err.fields["v"]).toEqual(["too short", "digits only"]);
  });

  it("uses 'body' as the path for root-level failures", () => {
    let caught: unknown = null;
    try {
      parseOrThrow(schema, null);
    } catch (e) {
      caught = e;
    }
    const err = caught as ValidationError;
    expect(Object.keys(err.fields)).toEqual(["body"]);
  });
});
