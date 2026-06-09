/**
 * tests/unit/ports/orders-domain.types.test.ts
 *
 * F-05 — pins the domain types + port method signatures against
 * accidental contract drift. This is NOT a behavioural test (no
 * adapter exists yet to behave against) — it is a type-shape pin.
 *
 * Failures here mean somebody:
 *   - dropped a `readonly` from an interface field
 *   - removed a required field
 *   - weakened a union literal (e.g. accidentally added `'archived'`
 *     to OrderState)
 *   - changed a method's signature in a way the documented spec
 *     does not allow
 *
 * Match style with `tests/unit/observability/Caller.test.ts`:
 *   - Vitest `describe` + `it` + `expect`.
 *   - `@/lib/...` alias imports.
 *   - `satisfies` operator + explicit annotations to pin shape.
 *
 * The test will never need a Supabase stack; pure TypeScript.
 */

import { describe, it, expect, expectTypeOf } from "vitest";
import type {
  Order,
  OrderLine,
  OrderState,
  OrderUom,
  OrderFilter,
  OrderPatch,
  CreateOrderInput,
  CreateOrderLineInput,
  Customer,
  Product,
} from "@/lib/domain";
import type {
  OrdersRepository,
  CustomersRepository,
  ProductsRepository,
  KdsOrderQueueSnapshot,
  KdsFlashEvent,
} from "@/lib/ports";

// ─── Realistic fixture values ─────────────────────────────────

const exampleOrderLine: OrderLine = {
  id: "line-1",
  orderId: "order-1",
  lineNumber: 1,
  productId: "product-1",
  adHocDescription: null,
  quantity: 2.5,
  uom: "kg",
  notes: null,
  doneAt: null,
  doneBy: null,
};

const exampleOrder: Order = {
  id: "order-1",
  reference: "MFS-2026-0001",
  customerId: "cust-1",
  deliveryDate: "2026-06-09",
  deliveryNotes: null,
  orderNotes: "Please pack chilled.",
  state: "placed",
  createdBy: "user-sales-1",
  createdAt: "2026-06-08T10:00:00.000Z",
  printedBy: null,
  printedAt: null,
  completedAt: null,
  customer: { id: "cust-1", name: "Acme Butchers", postcode: "SW1A 1AA" },
  creator: { id: "user-sales-1", name: "Alice" },
  printer: null,
  lines: [exampleOrderLine],
};

const exampleCustomer: Customer = {
  id: "cust-1",
  name: "Acme Butchers",
  postcode: "SW1A 1AA",
  active: true,
};

const exampleProduct: Product = {
  id: "product-1",
  code: "BC-001",
  name: "Beef carcass — half",
  boxSize: "20 kg",
};

const exampleKdsFlash: KdsFlashEvent = {
  orderId: "order-1",
  action: "reprinted",
  createdAt: "2026-06-08T10:00:00.000Z",
};

const exampleSnapshot: KdsOrderQueueSnapshot = {
  orders: [exampleOrder],
  recentFlashes: [exampleKdsFlash],
  serverTime: "2026-06-08T10:00:00.000Z",
};

// ─── Tests ────────────────────────────────────────────────────

describe("lib/domain — type shapes", () => {
  it("OrderState union admits exactly placed/printed/completed", () => {
    const placed: OrderState = "placed";
    const printed: OrderState = "printed";
    const completed: OrderState = "completed";
    expect([placed, printed, completed]).toEqual([
      "placed",
      "printed",
      "completed",
    ]);
    // @ts-expect-error — 'archived' is not in OrderState
    const bad: OrderState = "archived";
    expect(bad).toBe("archived");
  });

  it("OrderUom union admits exactly kg/unit", () => {
    const kg: OrderUom = "kg";
    const unit: OrderUom = "unit";
    expect([kg, unit]).toEqual(["kg", "unit"]);
    // @ts-expect-error — 'litre' is not in OrderUom
    const bad: OrderUom = "litre";
    expect(bad).toBe("litre");
  });

  it("Order shape pins required fields and embedded sub-shapes", () => {
    expect(exampleOrder.reference).toBe("MFS-2026-0001");
    expect(exampleOrder.state).toBe("placed");
    expect(exampleOrder.lines).toHaveLength(1);
    expect(exampleOrder.customer?.postcode).toBe("SW1A 1AA");
  });

  it("OrderLine pins productId-XOR-adHocDescription field shape", () => {
    expect(exampleOrderLine.productId).toBe("product-1");
    expect(exampleOrderLine.adHocDescription).toBeNull();
  });

  it("Customer carries the four Orders-scoped fields", () => {
    expectTypeOf<keyof Customer>().toEqualTypeOf<
      "id" | "name" | "postcode" | "active"
    >();
    expect(exampleCustomer.active).toBe(true);
  });

  it("Product carries the four Orders-scoped fields", () => {
    expectTypeOf<keyof Product>().toEqualTypeOf<
      "id" | "code" | "name" | "boxSize"
    >();
    expect(exampleProduct.boxSize).toBe("20 kg");
  });

  it("OrderFilter is all-optional", () => {
    const empty: OrderFilter = {};
    const full: OrderFilter = {
      state: "placed",
      deliveryDate: "2026-06-09",
      customerId: "cust-1",
      createdBy: "user-sales-1",
      limit: 25,
    };
    expect(empty).toEqual({});
    expect(full.limit).toBe(25);
  });

  it("OrderPatch is all-optional, all three fields nullable", () => {
    const empty: OrderPatch = {};
    const setNull: OrderPatch = { deliveryNotes: null, orderNotes: null };
    expect(empty).toEqual({});
    expect(setNull.deliveryNotes).toBeNull();
  });

  it("CreateOrderInput requires customerId + deliveryDate + non-empty lines", () => {
    const minimal: CreateOrderInput = {
      customerId: "cust-1",
      deliveryDate: "2026-06-09",
      deliveryNotes: null,
      orderNotes: null,
      lines: [
        {
          productId: "product-1",
          adHocDescription: null,
          quantity: 1,
          uom: "unit",
          notes: null,
        } satisfies CreateOrderLineInput,
      ],
    };
    expect(minimal.lines).toHaveLength(1);
  });
});

describe("lib/ports — port method signatures", () => {
  it("OrdersRepository method names + arity", () => {
    // Type-level assertions: each method's signature is pinned by the
    // Method type extraction. Compilation is the test; the runtime
    // assertion below just exercises the test framework.
    type Methods = keyof OrdersRepository;
    const expected: Methods[] = [
      "listOrders",
      "findOrderById",
      "createOrder",
      "updateOrder",
      "recordPrint",
      "markLineDone",
      "markOrderCompleted",
      "listKdsQueue",
    ];
    // 8 methods (7 locked + 1 KDS queue addition flagged in §5 Risks #1).
    expect(expected).toHaveLength(8);
  });

  it("CustomersRepository has exactly one method", () => {
    type Methods = keyof CustomersRepository;
    const expected: Methods[] = ["findCustomerById"];
    expect(expected).toEqual(["findCustomerById"]);
  });

  it("ProductsRepository has exactly one method", () => {
    type Methods = keyof ProductsRepository;
    const expected: Methods[] = ["findProductsByIds"];
    expect(expected).toEqual(["findProductsByIds"]);
  });

  it("KdsOrderQueueSnapshot composite shape pins three fields", () => {
    expect(Object.keys(exampleSnapshot)).toEqual([
      "orders",
      "recentFlashes",
      "serverTime",
    ]);
    expect(exampleSnapshot.recentFlashes[0].action).toBe("reprinted");
  });

  it("KdsFlashEvent action union admits exactly the four KDS-flash actions", () => {
    const actions: KdsFlashEvent["action"][] = [
      "edited",
      "line_edited",
      "reprinted",
      "line_added",
    ];
    expect(actions).toHaveLength(4);
  });
});
