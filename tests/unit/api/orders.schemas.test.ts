/**
 * tests/unit/api/orders.schemas.test.ts
 *
 * F-08 — zod schemas for the Orders route boundary. Ports every case
 * from the retired tests/unit/orders/validation.test.ts (the
 * hand-rolled validator this replaces) and adds the transform-output
 * assertions the old validator covered via normaliseCreateOrder.
 */
import { describe, it, expect } from "vitest";
import {
  listOrdersQuerySchema,
  createOrderBodySchema,
  updateOrderBodySchema,
  orderIdParamSchema,
  idempotencyKeyFromHeader,
} from "@/lib/api/orders/schemas";
import { parseOrThrow } from "@/lib/api/validate";
import { ValidationError } from "@/lib/errors";

const VALID_UUID = "11111111-2222-3333-4444-555555555555";
const ANOTHER_UUID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

const validCataloguedLine = {
  product_id: VALID_UUID,
  quantity: 10.5,
  uom: "kg" as const,
};

const validAdHocLine = {
  ad_hoc_description: "Mutton trim",
  quantity: 4,
  uom: "kg" as const,
};

function fieldsOf(fn: () => unknown): Record<string, string[]> {
  try {
    fn();
  } catch (e) {
    if (e instanceof ValidationError) return e.fields;
    throw e;
  }
  throw new Error("expected ValidationError, nothing thrown");
}

// ── listOrdersQuerySchema ────────────────────────────────────

describe("listOrdersQuerySchema", () => {
  const empty = {
    state: null,
    delivery_date: null,
    customer_id: null,
    created_by: null,
    limit: null,
  };

  it("transforms an empty query to the default filter (limit 50)", () => {
    const filter = parseOrThrow(listOrdersQuerySchema, empty);
    expect(filter).toEqual({
      state: undefined,
      deliveryDate: undefined,
      customerId: undefined,
      createdBy: undefined,
      limit: 50,
    });
  });

  it("transforms snake_case params to the camelCase OrderFilter", () => {
    const filter = parseOrThrow(listOrdersQuerySchema, {
      ...empty,
      state: "placed",
      delivery_date: "2026-12-31",
      customer_id: VALID_UUID,
      created_by: ANOTHER_UUID,
      limit: "10",
    });
    expect(filter).toEqual({
      state: "placed",
      deliveryDate: "2026-12-31",
      customerId: VALID_UUID,
      createdBy: ANOTHER_UUID,
      limit: 10,
    });
  });

  it("clamps limit to [1, 200] and silently defaults invalid limit to 50 (legacy clamp, NOT a 400)", () => {
    expect(
      parseOrThrow(listOrdersQuerySchema, { ...empty, limit: "1000" }).limit,
    ).toBe(200);
    expect(
      parseOrThrow(listOrdersQuerySchema, { ...empty, limit: "0" }).limit,
    ).toBe(50);
    expect(
      parseOrThrow(listOrdersQuerySchema, { ...empty, limit: "-5" }).limit,
    ).toBe(1);
    expect(
      parseOrThrow(listOrdersQuerySchema, { ...empty, limit: "abc" }).limit,
    ).toBe(50);
  });

  it("rejects an invalid state filter (400)", () => {
    expect(() =>
      parseOrThrow(listOrdersQuerySchema, { ...empty, state: "bogus" }),
    ).toThrowError(ValidationError);
  });

  it("rejects a malformed delivery_date filter (400)", () => {
    expect(() =>
      parseOrThrow(listOrdersQuerySchema, {
        ...empty,
        delivery_date: "31/12/2026",
      }),
    ).toThrowError(ValidationError);
    expect(() =>
      parseOrThrow(listOrdersQuerySchema, {
        ...empty,
        delivery_date: "2026-02-30",
      }),
    ).toThrowError(ValidationError);
  });

  it("rejects malformed customer_id / created_by filters (400)", () => {
    expect(() =>
      parseOrThrow(listOrdersQuerySchema, { ...empty, customer_id: "nope" }),
    ).toThrowError(ValidationError);
    expect(() =>
      parseOrThrow(listOrdersQuerySchema, { ...empty, created_by: "nope" }),
    ).toThrowError(ValidationError);
  });
});

// ── createOrderBodySchema ────────────────────────────────────

describe("createOrderBodySchema", () => {
  const validBody = {
    customer_id: VALID_UUID,
    delivery_date: "2026-05-31",
    lines: [validCataloguedLine],
  };

  it("accepts a minimal valid order and transforms to CreateOrderInput", () => {
    const input = parseOrThrow(createOrderBodySchema, validBody);
    expect(input).toEqual({
      customerId: VALID_UUID,
      deliveryDate: "2026-05-31",
      deliveryNotes: null,
      orderNotes: null,
      lines: [
        {
          productId: VALID_UUID,
          adHocDescription: null,
          quantity: 10.5,
          uom: "kg",
          notes: null,
        },
      ],
    });
  });

  it("accepts an order with multiple lines (mix of catalogued + ad-hoc)", () => {
    const input = parseOrThrow(createOrderBodySchema, {
      ...validBody,
      lines: [validCataloguedLine, validAdHocLine, validCataloguedLine],
    });
    expect(input.lines.length).toBe(3);
    expect(input.lines[1]).toEqual({
      productId: null,
      adHocDescription: "Mutton trim",
      quantity: 4,
      uom: "kg",
      notes: null,
    });
  });

  it("trims notes and converts empty strings to null (legacy normalisation)", () => {
    const input = parseOrThrow(createOrderBodySchema, {
      ...validBody,
      delivery_notes: "  needs to arrive before 11am  ",
      order_notes: "",
      lines: [{ ...validCataloguedLine, notes: "  extra trim  " }],
    });
    expect(input.deliveryNotes).toBe("needs to arrive before 11am");
    expect(input.orderNotes).toBeNull();
    expect(input.lines[0]!.notes).toBe("extra trim");
  });

  it("rejects missing/malformed customer_id", () => {
    const { customer_id: _ignored, ...withoutCustomer } = validBody;
    expect(() =>
      parseOrThrow(createOrderBodySchema, withoutCustomer),
    ).toThrowError(ValidationError);
    expect(() =>
      parseOrThrow(createOrderBodySchema, {
        ...validBody,
        customer_id: "not-uuid",
      }),
    ).toThrowError(ValidationError);
    expect(() =>
      parseOrThrow(createOrderBodySchema, { ...validBody, customer_id: 123 }),
    ).toThrowError(ValidationError);
  });

  it("rejects missing delivery_date", () => {
    const { delivery_date: _ignored, ...withoutDate } = validBody;
    expect(() => parseOrThrow(createOrderBodySchema, withoutDate)).toThrowError(
      ValidationError,
    );
  });

  it("rejects malformed delivery_date (format + impossible calendar dates)", () => {
    for (const bad of ["31/05/2026", "2026-13-01", "2026-02-30", ""]) {
      expect(() =>
        parseOrThrow(createOrderBodySchema, {
          ...validBody,
          delivery_date: bad,
        }),
      ).toThrowError(ValidationError);
    }
  });

  it("rejects empty or missing lines", () => {
    expect(() =>
      parseOrThrow(createOrderBodySchema, { ...validBody, lines: [] }),
    ).toThrowError(/at least one line|Invalid request/);
    const { lines: _ignored, ...withoutLines } = validBody;
    expect(() =>
      parseOrThrow(createOrderBodySchema, withoutLines),
    ).toThrowError(ValidationError);
  });

  it("rejects null and primitive bodies", () => {
    for (const bad of [null, undefined, "a string", 42]) {
      expect(() => parseOrThrow(createOrderBodySchema, bad)).toThrowError(
        ValidationError,
      );
    }
  });

  it("rejects a line with both product_id and ad_hoc_description (legacy message text)", () => {
    const fields = fieldsOf(() =>
      parseOrThrow(createOrderBodySchema, {
        ...validBody,
        lines: [
          {
            product_id: VALID_UUID,
            ad_hoc_description: "shouldnt have both",
            quantity: 1,
            uom: "kg",
          },
        ],
      }),
    );
    expect(fields["lines.0"]![0]).toMatch(/^Line 1: cannot have both/);
  });

  it("rejects a line with neither product_id nor ad_hoc_description", () => {
    const fields = fieldsOf(() =>
      parseOrThrow(createOrderBodySchema, {
        ...validBody,
        lines: [{ quantity: 1, uom: "kg" }],
      }),
    );
    expect(fields["lines.0"]![0]).toMatch(/^Line 1: must have either/);
  });

  it("treats blank ad_hoc_description as absent (legacy semantics)", () => {
    const fields = fieldsOf(() =>
      parseOrThrow(createOrderBodySchema, {
        ...validBody,
        lines: [{ ad_hoc_description: "   ", quantity: 1, uom: "kg" }],
      }),
    );
    expect(fields["lines.0"]![0]).toMatch(/must have either/);
  });

  it("treats a non-UUID product_id as absent (falls to the must-have-either branch, legacy semantics)", () => {
    const fields = fieldsOf(() =>
      parseOrThrow(createOrderBodySchema, {
        ...validBody,
        lines: [{ product_id: "not-a-uuid", quantity: 1, uom: "kg" }],
      }),
    );
    expect(fields["lines.0"]![0]).toMatch(/must have either/);
  });

  it("rejects zero, negative and non-numeric quantity (legacy message text)", () => {
    for (const qty of [0, -5, "10", NaN, Infinity]) {
      const fields = fieldsOf(() =>
        parseOrThrow(createOrderBodySchema, {
          ...validBody,
          lines: [{ ...validCataloguedLine, quantity: qty }],
        }),
      );
      expect(fields["lines.0"]![0]).toMatch(
        /^Line 1: quantity must be a positive number/,
      );
    }
  });

  it("rejects invalid uom (legacy message text)", () => {
    for (const uom of ["pcs", ""]) {
      const fields = fieldsOf(() =>
        parseOrThrow(createOrderBodySchema, {
          ...validBody,
          lines: [{ ...validCataloguedLine, uom }],
        }),
      );
      expect(fields["lines.0"]![0]).toMatch(
        /^Line 1: uom must be 'kg' or 'unit'/,
      );
    }
  });

  it("rejects null and primitive line values (legacy message text)", () => {
    for (const line of [null, "string", 42]) {
      const fields = fieldsOf(() =>
        parseOrThrow(createOrderBodySchema, {
          ...validBody,
          lines: [line],
        }),
      );
      expect(fields["lines.0"]![0]).toMatch(/^Line 1: not an object/);
    }
  });

  it("includes the 1-indexed line number in error messages", () => {
    const fields = fieldsOf(() =>
      parseOrThrow(createOrderBodySchema, {
        ...validBody,
        lines: [
          validCataloguedLine,
          validAdHocLine,
          validCataloguedLine,
          validAdHocLine,
          { quantity: 1, uom: "kg" },
        ],
      }),
    );
    expect(fields["lines.4"]![0]).toMatch(/^Line 5:/);
  });

  it("surfaces line-level errors alongside valid lines", () => {
    const fields = fieldsOf(() =>
      parseOrThrow(createOrderBodySchema, {
        ...validBody,
        lines: [validCataloguedLine, { quantity: -1, uom: "kg" }],
      }),
    );
    expect(Object.keys(fields)).toEqual(["lines.1"]);
    expect(fields["lines.1"]!.join(" ")).toMatch(/Line 2/);
  });

  it("assigns line order by array index (lineNumber is the adapter's job)", () => {
    const input = parseOrThrow(createOrderBodySchema, {
      ...validBody,
      lines: [validCataloguedLine, validAdHocLine],
    });
    // No line_number on the domain input — order is positional.
    expect(input.lines.map((l) => l.productId ?? l.adHocDescription)).toEqual([
      VALID_UUID,
      "Mutton trim",
    ]);
  });
});

// ── updateOrderBodySchema ────────────────────────────────────

describe("updateOrderBodySchema", () => {
  it("accepts empty body (no-op update) — empty patch, no lineReplacement", () => {
    const out = parseOrThrow(updateOrderBodySchema, {});
    expect(out.patch).toEqual({});
    expect(out.lineReplacement).toBeUndefined();
  });

  it("accepts a delivery_date only update", () => {
    const out = parseOrThrow(updateOrderBodySchema, {
      delivery_date: "2026-06-01",
    });
    expect(out.patch).toEqual({ deliveryDate: "2026-06-01" });
  });

  it("preserves the undefined-vs-null distinction on notes", () => {
    const out = parseOrThrow(updateOrderBodySchema, {
      delivery_notes: null,
      order_notes: "new note",
    });
    expect(out.patch.deliveryNotes).toBeNull();
    expect(out.patch.orderNotes).toBe("new note");
    expect("deliveryDate" in out.patch).toBe(false);
  });

  it("accepts a lines only update and transforms to CreateOrderLineInput[]", () => {
    const out = parseOrThrow(updateOrderBodySchema, {
      lines: [validCataloguedLine],
    });
    expect(out.patch).toEqual({});
    expect(out.lineReplacement).toEqual([
      {
        productId: VALID_UUID,
        adHocDescription: null,
        quantity: 10.5,
        uom: "kg",
        notes: null,
      },
    ]);
  });

  it("rejects malformed delivery_date when provided", () => {
    expect(() =>
      parseOrThrow(updateOrderBodySchema, { delivery_date: "bad" }),
    ).toThrowError(ValidationError);
  });

  it("rejects empty lines array when provided", () => {
    expect(() =>
      parseOrThrow(updateOrderBodySchema, { lines: [] }),
    ).toThrowError(ValidationError);
  });

  it("applies the same per-line rules as create (1-indexed messages)", () => {
    const fields = fieldsOf(() =>
      parseOrThrow(updateOrderBodySchema, {
        lines: [validCataloguedLine, { quantity: 0, uom: "kg" }],
      }),
    );
    expect(fields["lines.1"]![0]).toMatch(/^Line 2:/);
  });

  it("rejects null body", () => {
    expect(() => parseOrThrow(updateOrderBodySchema, null)).toThrowError(
      ValidationError,
    );
  });
});

// ── orderIdParamSchema ───────────────────────────────────────

describe("orderIdParamSchema", () => {
  it("accepts a uuid", () => {
    expect(parseOrThrow(orderIdParamSchema, VALID_UUID)).toBe(VALID_UUID);
  });

  it("rejects a malformed id (400)", () => {
    expect(() => parseOrThrow(orderIdParamSchema, "nope")).toThrowError(
      ValidationError,
    );
  });
});

// ── idempotencyKeyFromHeader ─────────────────────────────────

describe("idempotencyKeyFromHeader", () => {
  it("returns undefined for absent or blank header", () => {
    expect(idempotencyKeyFromHeader(null)).toBeUndefined();
    expect(idempotencyKeyFromHeader("")).toBeUndefined();
    expect(idempotencyKeyFromHeader("   ")).toBeUndefined();
  });

  it("trims and returns the key", () => {
    expect(idempotencyKeyFromHeader("  abc-123  ")).toBe("abc-123");
  });

  it("accepts exactly 200 chars; rejects 201 with ValidationError (400)", () => {
    expect(idempotencyKeyFromHeader("x".repeat(200))).toBe("x".repeat(200));
    expect(() => idempotencyKeyFromHeader("x".repeat(201))).toThrowError(
      ValidationError,
    );
  });
});
