/**
 * tests/unit/api/kds.schemas.test.ts
 *
 * F-08 — zod schemas for the KDS route boundary (public kiosk).
 * Mirrors the legacy inline checks at
 * app/api/kds/lines/[lineId]/done/route.ts:47-55.
 */
import { describe, it, expect } from "vitest";
import {
  kdsLineIdParamSchema,
  kdsLineDoneBodySchema,
} from "@/lib/api/kds/schemas";
import { parseOrThrow } from "@/lib/api/validate";
import { ValidationError } from "@/lib/errors";

const VALID_UUID = "11111111-2222-3333-4444-555555555555";

describe("kdsLineIdParamSchema", () => {
  it("accepts a uuid (case-insensitive, like the legacy regex)", () => {
    expect(parseOrThrow(kdsLineIdParamSchema, VALID_UUID)).toBe(VALID_UUID);
    expect(parseOrThrow(kdsLineIdParamSchema, VALID_UUID.toUpperCase())).toBe(
      VALID_UUID.toUpperCase(),
    );
  });

  it("rejects a malformed lineId (400)", () => {
    expect(() => parseOrThrow(kdsLineIdParamSchema, "nope")).toThrowError(
      ValidationError,
    );
  });
});

describe("kdsLineDoneBodySchema", () => {
  it("accepts and trims a uuid butcher_id, transforming to camelCase", () => {
    const out = parseOrThrow(kdsLineDoneBodySchema, {
      butcher_id: `  ${VALID_UUID}  `,
    });
    expect(out).toEqual({ butcherId: VALID_UUID });
  });

  it("rejects a missing / blank / malformed butcher_id (400)", () => {
    for (const body of [
      null,
      {},
      { butcher_id: "" },
      { butcher_id: "   " },
      { butcher_id: "not-a-uuid" },
      { butcher_id: 42 },
    ]) {
      expect(() => parseOrThrow(kdsLineDoneBodySchema, body)).toThrowError(
        ValidationError,
      );
    }
  });
});
