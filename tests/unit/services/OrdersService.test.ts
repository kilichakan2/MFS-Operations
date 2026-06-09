/**
 * tests/unit/services/OrdersService.test.ts
 *
 * F-07 — unit tests for OrdersService composed against the F-06 Fake
 * adapters. No DB. No HTTP. No Supabase SDK. Pure-JS Maps under the
 * hood; the adapters land in <2ms per test.
 *
 * Coverage shape (28 cases):
 *   - placeOrder: 6 cases (customer not found, customer inactive,
 *     products missing 1, products missing many, happy with all
 *     catalogued lines, happy with all ad-hoc lines)
 *   - editOrder: 6 cases (order not found, state=completed, sales
 *     forbidden on printed, sales allowed on placed, office allowed
 *     on printed, products missing on lineReplacement)
 *   - printOrder: 4 cases (order not found, state=completed conflict,
 *     placed→printed happy, reprint on printed)
 *   - completeLineDone: 5 cases (line not found, idempotency, middle
 *     line no-cascade, last line cascade, race swallow)
 *   - Pass-throughs: 3 cases (listOrders, findOrderById null,
 *     listKdsQueue)
 *   - Architecture pin: 4 cases (service composes ports not services
 *     — proven by the fact that the test imports only port factories;
 *     instanceof checks on each thrown error type; pass-through
 *     wiring; default singleton type identity; static-text grep
 *     forbidding cross-service / runtime-observability / auth /
 *     log imports)
 *
 * Construction pattern (template for all future *Service unit tests):
 *
 *   const make = (opts) => {
 *     const customers = createFakeCustomersRepository(opts.customers ?? [])
 *     const products  = createFakeProductsRepository(opts.products ?? [])
 *     const orders    = createFakeOrdersRepository()
 *     const service   = createOrdersService({ orders, customers, products })
 *     return { service, orders, customers, products }
 *   }
 *
 * Each test gets a fresh trio via `make()` so cases are independent.
 *
 * Determinism:
 *   - `when` arguments are fixed Date instances.
 *   - Customer / product IDs are stable strings.
 *   - The Fake's reference generator increments inside the factory's
 *     closure, so the first order from a fresh adapter is FAKE-YYYY-0001;
 *     tests do not assert the exact reference.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createOrdersService, ordersService } from "@/lib/services";
import {
  createFakeOrdersRepository,
  createFakeCustomersRepository,
  createFakeProductsRepository,
} from "@/lib/adapters/fake";
import {
  NotFoundError,
  ConflictError,
  ForbiddenError,
  ValidationError,
} from "@/lib/errors";
import type { Customer, Product, CreateOrderInput } from "@/lib/domain";

// ─── Stable fixture IDs ──────────────────────────────────────

const CUSTOMER_ID = "00000000-0000-0000-0000-000000000c01";
const INACTIVE_ID = "00000000-0000-0000-0000-000000000c02";
const USER_ID = "00000000-0000-0000-0000-000000000a01";
const BUTCHER_ID = "00000000-0000-0000-0000-000000000b01";
const PRODUCT_ID = "00000000-0000-0000-0000-000000000d01";
const PRODUCT_ID_2 = "00000000-0000-0000-0000-000000000d02";
const UNKNOWN_ID = "00000000-0000-0000-0000-000000000fff";
const UNKNOWN_ID_2 = "00000000-0000-0000-0000-000000000ffe";
const T = new Date("2026-06-09T10:00:00Z");

// ─── make() helper ───────────────────────────────────────────

function make(
  opts: {
    customers?: readonly Customer[];
    products?: readonly Product[];
  } = {},
) {
  const customers = createFakeCustomersRepository(
    opts.customers ?? [
      { id: CUSTOMER_ID, name: "Acme", postcode: "AB1 2CD", active: true },
    ],
  );
  const products = createFakeProductsRepository(
    opts.products ?? [
      { id: PRODUCT_ID, code: "LMB-LEG", name: "Lamb leg", boxSize: "10 kg" },
      {
        id: PRODUCT_ID_2,
        code: "LMB-SHL",
        name: "Lamb shoulder",
        boxSize: "10 kg",
      },
    ],
  );
  const orders = createFakeOrdersRepository();
  const service = createOrdersService({ orders, customers, products });
  return { service, orders, customers, products };
}

function buildInput(
  overrides: Partial<CreateOrderInput> = {},
): CreateOrderInput {
  return {
    customerId: CUSTOMER_ID,
    deliveryDate: "2026-06-10",
    deliveryNotes: null,
    orderNotes: null,
    lines: [
      {
        productId: PRODUCT_ID,
        adHocDescription: null,
        quantity: 2,
        uom: "kg",
        notes: null,
      },
    ],
    ...overrides,
  };
}

// ─── placeOrder ──────────────────────────────────────────────

describe("OrdersService.placeOrder", () => {
  it("throws NotFoundError when the customer does not exist", async () => {
    const { service } = make();
    await expect(
      service.placeOrder(buildInput({ customerId: UNKNOWN_ID }), USER_ID),
    ).rejects.toThrowError(NotFoundError);
    await expect(
      service.placeOrder(buildInput({ customerId: UNKNOWN_ID }), USER_ID),
    ).rejects.toThrowError("Customer not found");
  });

  it("throws ConflictError when the customer is inactive", async () => {
    const { service } = make({
      customers: [
        { id: INACTIVE_ID, name: "Old Co", postcode: null, active: false },
      ],
    });
    await expect(
      service.placeOrder(buildInput({ customerId: INACTIVE_ID }), USER_ID),
    ).rejects.toThrowError(ConflictError);
    await expect(
      service.placeOrder(buildInput({ customerId: INACTIVE_ID }), USER_ID),
    ).rejects.toThrowError("Customer is inactive");
  });

  it("throws ValidationError listing one missing product id", async () => {
    const { service } = make();
    const input = buildInput({
      lines: [
        {
          productId: UNKNOWN_ID,
          adHocDescription: null,
          quantity: 1,
          uom: "kg",
          notes: null,
        },
      ],
    });
    let caught: unknown = null;
    try {
      await service.placeOrder(input, USER_ID);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ValidationError);
    const err = caught as ValidationError;
    expect(err.message).toBe("Unknown product_id(s)");
    expect(err.fields).toEqual({ "lines.products": [UNKNOWN_ID] });
  });

  it("throws ValidationError listing all missing product ids", async () => {
    const { service } = make();
    const input = buildInput({
      lines: [
        {
          productId: UNKNOWN_ID,
          adHocDescription: null,
          quantity: 1,
          uom: "kg",
          notes: null,
        },
        {
          productId: UNKNOWN_ID_2,
          adHocDescription: null,
          quantity: 2,
          uom: "kg",
          notes: null,
        },
      ],
    });
    let caught: unknown = null;
    try {
      await service.placeOrder(input, USER_ID);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ValidationError);
    const err = caught as ValidationError;
    expect(err.fields["lines.products"][0]).toContain(UNKNOWN_ID);
    expect(err.fields["lines.products"][0]).toContain(UNKNOWN_ID_2);
    expect(err.fields["lines.products"][0]).toContain(", ");
  });

  it("persists an order with all catalogued lines and returns the full Order", async () => {
    const { service } = make();
    const result = await service.placeOrder(buildInput(), USER_ID);
    expect(typeof result.id).toBe("string");
    expect(result.id.length).toBeGreaterThan(0);
    expect(typeof result.reference).toBe("string");
    expect(result.reference.length).toBeGreaterThan(0);
    expect(result.customerId).toBe(CUSTOMER_ID);
    expect(result.state).toBe("placed");
    expect(result.createdBy).toBe(USER_ID);
    expect(result.lines.length).toBe(1);
    expect(result.lines[0].productId).toBe(PRODUCT_ID);
    expect(result.lines[0].lineNumber).toBe(1);
  });

  it("persists an order with all ad-hoc lines (no product lookup)", async () => {
    const { service } = make({ products: [] });
    const input = buildInput({
      lines: [
        {
          productId: null,
          adHocDescription: "Special cut",
          quantity: 1,
          uom: "unit",
          notes: null,
        },
      ],
    });
    const result = await service.placeOrder(input, USER_ID);
    expect(result.lines[0].adHocDescription).toBe("Special cut");
    expect(result.lines[0].productId).toBeNull();
  });
});

// ─── editOrder ───────────────────────────────────────────────

describe("OrdersService.editOrder", () => {
  it("throws NotFoundError when the order does not exist", async () => {
    const { service } = make();
    await expect(
      service.editOrder(UNKNOWN_ID, {}, undefined, "admin", USER_ID),
    ).rejects.toThrowError(NotFoundError);
  });

  it("throws ConflictError when the order is completed", async () => {
    const { service, orders } = make();
    const placed = await service.placeOrder(buildInput(), USER_ID);
    await service.printOrder(placed.id, USER_ID, T);
    // Cascade to completed via the single line.
    await service.completeLineDone(placed.lines[0].id, BUTCHER_ID, T);
    // Sanity: parent is now completed.
    const reread = await orders.findOrderById(placed.id);
    expect(reread?.state).toBe("completed");

    let caught: unknown = null;
    try {
      await service.editOrder(
        placed.id,
        { deliveryNotes: "x" },
        undefined,
        "admin",
        USER_ID,
      );
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ConflictError);
    expect((caught as ConflictError).message).toBe(
      "Order is completed and cannot be edited",
    );
  });

  it("throws ForbiddenError when sales tries to edit a printed order", async () => {
    const { service } = make();
    const placed = await service.placeOrder(buildInput(), USER_ID);
    await service.printOrder(placed.id, USER_ID, T);

    let caught: unknown = null;
    try {
      await service.editOrder(
        placed.id,
        { deliveryNotes: "x" },
        undefined,
        "sales",
        USER_ID,
      );
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ForbiddenError);
    expect((caught as ForbiddenError).message).toBe(
      "This order is locked. Only office can amend it after printing.",
    );
  });

  it("allows sales to edit a placed order", async () => {
    const { service } = make();
    const placed = await service.placeOrder(buildInput(), USER_ID);
    const updated = await service.editOrder(
      placed.id,
      { deliveryNotes: "urgent" },
      undefined,
      "sales",
      USER_ID,
    );
    expect(updated.deliveryNotes).toBe("urgent");
  });

  it("allows office to edit a printed order", async () => {
    const { service } = make();
    const placed = await service.placeOrder(buildInput(), USER_ID);
    await service.printOrder(placed.id, USER_ID, T);
    const updated = await service.editOrder(
      placed.id,
      { deliveryNotes: "fast track" },
      undefined,
      "office",
      USER_ID,
    );
    expect(updated.deliveryNotes).toBe("fast track");
  });

  it("throws ValidationError when lineReplacement references an unknown product", async () => {
    const { service } = make();
    const placed = await service.placeOrder(buildInput(), USER_ID);
    await expect(
      service.editOrder(
        placed.id,
        {},
        [
          {
            productId: UNKNOWN_ID,
            adHocDescription: null,
            quantity: 1,
            uom: "kg",
            notes: null,
          },
        ],
        "admin",
        USER_ID,
      ),
    ).rejects.toThrowError(ValidationError);
  });
});

// ─── printOrder ──────────────────────────────────────────────

describe("OrdersService.printOrder", () => {
  it("throws NotFoundError when the order does not exist", async () => {
    const { service } = make();
    await expect(
      service.printOrder(UNKNOWN_ID, USER_ID, T),
    ).rejects.toThrowError(NotFoundError);
  });

  it("throws ConflictError when the order is completed", async () => {
    const { service } = make();
    const placed = await service.placeOrder(buildInput(), USER_ID);
    await service.printOrder(placed.id, USER_ID, T);
    await service.completeLineDone(placed.lines[0].id, BUTCHER_ID, T);

    let caught: unknown = null;
    try {
      await service.printOrder(placed.id, USER_ID, T);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ConflictError);
    expect((caught as ConflictError).message).toBe(
      "Order is completed — cannot reprint a completed order",
    );
  });

  it("transitions placed → printed and records printedAt + printedBy", async () => {
    const { service } = make();
    const placed = await service.placeOrder(buildInput(), USER_ID);
    const printed = await service.printOrder(placed.id, USER_ID, T);
    expect(printed.state).toBe("printed");
    expect(printed.printedBy).toBe(USER_ID);
    expect(printed.printedAt).toBe(T.toISOString());
  });

  it("reprint on printed bumps printedAt without changing state", async () => {
    const { service } = make();
    const placed = await service.placeOrder(buildInput(), USER_ID);
    await service.printOrder(placed.id, USER_ID, T);
    const T2 = new Date("2026-06-09T11:00:00Z");
    const result = await service.printOrder(placed.id, "another-user", T2);
    expect(result.state).toBe("printed");
    expect(result.printedAt).toBe(T2.toISOString());
    expect(result.printedBy).toBe("another-user");
  });
});

// ─── completeLineDone ────────────────────────────────────────

describe("OrdersService.completeLineDone", () => {
  it("throws NotFoundError when the line does not exist", async () => {
    const { service } = make();
    await expect(
      service.completeLineDone(UNKNOWN_ID, BUTCHER_ID, T),
    ).rejects.toThrowError(NotFoundError);
  });

  it("returns alreadyDone:true on a second call against the same line", async () => {
    const { service } = make();
    const placed = await service.placeOrder(
      buildInput({
        lines: [
          {
            productId: PRODUCT_ID,
            adHocDescription: null,
            quantity: 1,
            uom: "kg",
            notes: null,
          },
          {
            productId: PRODUCT_ID_2,
            adHocDescription: null,
            quantity: 1,
            uom: "kg",
            notes: null,
          },
        ],
      }),
      USER_ID,
    );
    await service.printOrder(placed.id, USER_ID, T);
    // First call: marks the line done.
    await service.completeLineDone(placed.lines[0].id, BUTCHER_ID, T);
    // Second call: idempotent.
    const second = await service.completeLineDone(
      placed.lines[0].id,
      BUTCHER_ID,
      T,
    );
    expect(second).toEqual({
      alreadyDone: true,
      orderId: placed.id,
      completed: false,
    });
  });

  it("middle line done does not cascade to completed", async () => {
    const { service } = make();
    const placed = await service.placeOrder(
      buildInput({
        lines: [
          {
            productId: PRODUCT_ID,
            adHocDescription: null,
            quantity: 1,
            uom: "kg",
            notes: null,
          },
          {
            productId: PRODUCT_ID_2,
            adHocDescription: null,
            quantity: 2,
            uom: "kg",
            notes: null,
          },
          {
            productId: PRODUCT_ID,
            adHocDescription: null,
            quantity: 3,
            uom: "kg",
            notes: null,
          },
        ],
      }),
      USER_ID,
    );
    await service.printOrder(placed.id, USER_ID, T);
    const result = await service.completeLineDone(
      placed.lines[0].id,
      BUTCHER_ID,
      T,
    );
    expect(result).toEqual({
      alreadyDone: false,
      orderId: placed.id,
      completed: false,
    });
    const fresh = await service.findOrderById(placed.id);
    expect(fresh?.state).toBe("printed");
  });

  it("last line done cascades to completed", async () => {
    const { service } = make();
    const placed = await service.placeOrder(buildInput(), USER_ID);
    await service.printOrder(placed.id, USER_ID, T);
    const result = await service.completeLineDone(
      placed.lines[0].id,
      BUTCHER_ID,
      T,
    );
    expect(result).toEqual({
      alreadyDone: false,
      orderId: placed.id,
      completed: true,
    });
    const fresh = await service.findOrderById(placed.id);
    expect(fresh?.state).toBe("completed");
    expect(fresh?.completedAt).toBe(T.toISOString());
  });

  it("swallows ConflictError from markOrderCompleted (race-safe)", async () => {
    // Race-swallow test: replace the orders adapter's markOrderCompleted
    // with one that throws ConflictError, simulating a concurrent
    // completion that won the optimistic lock. This is the only place
    // in the F-07 test suite where we step outside the pure Fake
    // substrate — documented in plan §5 Risk #8.
    const orders = createFakeOrdersRepository();
    const customers = createFakeCustomersRepository([
      { id: CUSTOMER_ID, name: "Acme", postcode: null, active: true },
    ]);
    const products = createFakeProductsRepository([
      { id: PRODUCT_ID, code: "X", name: "X", boxSize: null },
    ]);
    const service = createOrdersService({ orders, customers, products });

    const placed = await service.placeOrder(buildInput(), USER_ID);
    await service.printOrder(placed.id, USER_ID, T);

    // Monkey-patch markOrderCompleted so the cascade attempt throws
    // ConflictError. The service should swallow and report completed.
    orders.markOrderCompleted = async () => {
      throw new ConflictError("Order state is completed; expected 'printed'");
    };

    const result = await service.completeLineDone(
      placed.lines[0].id,
      BUTCHER_ID,
      T,
    );
    expect(result).toEqual({
      alreadyDone: false,
      orderId: placed.id,
      completed: true,
    });
  });
});

// ─── Pass-throughs ───────────────────────────────────────────

describe("OrdersService pass-throughs", () => {
  it("listOrders returns whatever the port returns", async () => {
    const { service } = make();
    await service.placeOrder(buildInput(), USER_ID);
    await service.placeOrder(buildInput(), USER_ID);
    await service.placeOrder(buildInput(), USER_ID);
    const all = await service.listOrders({});
    expect(all.length).toBe(3);
    for (const o of all) {
      expect(typeof o.id).toBe("string");
      expect(typeof o.reference).toBe("string");
      expect(o.state).toBe("placed");
    }
  });

  it("findOrderById returns null on miss (does NOT throw)", async () => {
    const { service } = make();
    const result = await service.findOrderById(UNKNOWN_ID);
    expect(result).toBeNull();
  });

  it("listKdsQueue forwards the since cutoff", async () => {
    const { service } = make();
    const placed = await service.placeOrder(buildInput(), USER_ID);
    await service.printOrder(placed.id, USER_ID, T);
    const snap = await service.listKdsQueue(new Date(0));
    expect(snap.orders.length).toBe(1);
    expect(snap.recentFlashes.length).toBe(0);
    expect(typeof snap.serverTime).toBe("string");
  });
});

// ─── Architecture pins ──────────────────────────────────────

describe("OrdersService architecture pins", () => {
  it("service composes ports, not services", () => {
    // This test cannot fail at runtime — it pins the public signature
    // at compile time. If F-07's interface ever grows to accept a
    // `*Service` parameter, the test file's `import` statement at
    // the top would need a new import; that diff would surface in
    // code review. The body asserts the factory is callable with
    // three port instances.
    const customers = createFakeCustomersRepository([]);
    const products = createFakeProductsRepository([]);
    const orders = createFakeOrdersRepository();
    const service = createOrdersService({ orders, customers, products });
    expect(service).toBeDefined();
    expect(typeof service.placeOrder).toBe("function");
    expect(typeof service.editOrder).toBe("function");
    expect(typeof service.printOrder).toBe("function");
    expect(typeof service.completeLineDone).toBe("function");
    expect(typeof service.listOrders).toBe("function");
    expect(typeof service.findOrderById).toBe("function");
    expect(typeof service.listKdsQueue).toBe("function");
  });

  it("every typed error thrown by the service is instanceof its class", async () => {
    const { service } = make();

    // NotFoundError — customer missing.
    await expect(
      service.placeOrder(buildInput({ customerId: UNKNOWN_ID }), USER_ID),
    ).rejects.toBeInstanceOf(NotFoundError);

    // ConflictError — inactive customer.
    const inactiveTrio = make({
      customers: [
        { id: INACTIVE_ID, name: "Old Co", postcode: null, active: false },
      ],
    });
    await expect(
      inactiveTrio.service.placeOrder(
        buildInput({ customerId: INACTIVE_ID }),
        USER_ID,
      ),
    ).rejects.toBeInstanceOf(ConflictError);

    // ValidationError — unknown product.
    await expect(
      service.placeOrder(
        buildInput({
          lines: [
            {
              productId: UNKNOWN_ID,
              adHocDescription: null,
              quantity: 1,
              uom: "kg",
              notes: null,
            },
          ],
        }),
        USER_ID,
      ),
    ).rejects.toBeInstanceOf(ValidationError);

    // ForbiddenError — sales editing a printed order.
    const placed = await service.placeOrder(buildInput(), USER_ID);
    await service.printOrder(placed.id, USER_ID, T);
    await expect(
      service.editOrder(
        placed.id,
        { deliveryNotes: "x" },
        undefined,
        "sales",
        USER_ID,
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("default singleton is the expected OrdersService shape", () => {
    expect(typeof ordersService.placeOrder).toBe("function");
    expect(typeof ordersService.editOrder).toBe("function");
    expect(typeof ordersService.printOrder).toBe("function");
    expect(typeof ordersService.completeLineDone).toBe("function");
    expect(typeof ordersService.listOrders).toBe("function");
    expect(typeof ordersService.findOrderById).toBe("function");
    expect(typeof ordersService.listKdsQueue).toBe("function");
  });

  it("the service does not import any sibling service file", () => {
    const src = readFileSync(
      resolve(__dirname, "../../../lib/services/OrdersService.ts"),
      "utf8",
    );
    // No relative or absolute imports of any other *Service file.
    // F-07 is the first service; today this is trivially true, but
    // the assertion catches drift when F-13 / F-14 / etc. land.
    expect(src).not.toMatch(/from ['"][^'"]*Service['"]/);
    // Also forbid runtime observability coupling — only the type-only
    // `Role` import is allowed. The value-import form `import { … }`
    // is the one that couples runtime; the type-only form
    // `import type { Role } from "@/lib/observability"` does not
    // match because the regex requires braces around runtime exports.
    expect(src).not.toMatch(
      /import \{ [^}]* \} from ['"]@\/lib\/observability/,
    );
    // No auth coupling.
    expect(src).not.toMatch(/from ['"]@\/lib\/auth/);
    // No log coupling.
    expect(src).not.toMatch(/from ['"]@\/lib\/observability\/log/);
  });
});
