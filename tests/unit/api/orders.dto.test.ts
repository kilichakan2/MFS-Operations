/**
 * tests/unit/api/orders.dto.test.ts
 *
 * F-08 — DTO translators: domain Order (camelCase) → the EXACT legacy
 * snake_case wire shapes the five screens read today. These tests pin
 * the key sets from plan §5.4 — they are the wire-compat tripwire.
 * The two easy-to-miss details guarded here:
 *   - the LIST shape has NO `printer` key (only the detail shape does);
 *   - the picking-list fallbacks ('—', '', '(unknown product)').
 */
import { describe, it, expect } from "vitest";
import {
  toOrderListDto,
  toOrderDetailDto,
  toPickingListData,
} from "@/lib/api/orders/dto";
import type { Order, Product } from "@/lib/domain";

const ORDER: Order = {
  id: "00000000-0000-0000-0000-00000000aa01",
  reference: "MFS-2026-0042",
  customerId: "00000000-0000-0000-0000-000000000c01",
  deliveryDate: "2026-12-31",
  deliveryNotes: "before 11am",
  orderNotes: "test order",
  state: "printed",
  createdBy: "00000000-0000-0000-0000-000000000a01",
  createdAt: "2026-12-30T09:15:00.000Z",
  printedBy: "00000000-0000-0000-0000-000000000a02",
  printedAt: "2026-12-30T10:00:00.000Z",
  completedAt: null,
  customer: {
    id: "00000000-0000-0000-0000-000000000c01",
    name: "Acme Foods",
    postcode: "AB1 2CD",
  },
  creator: { id: "00000000-0000-0000-0000-000000000a01", name: "Sally Sales" },
  printer: { id: "00000000-0000-0000-0000-000000000a02", name: "Olly Office" },
  lines: [
    {
      id: "00000000-0000-0000-0000-00000000bb01",
      orderId: "00000000-0000-0000-0000-00000000aa01",
      lineNumber: 1,
      productId: "00000000-0000-0000-0000-000000000d01",
      adHocDescription: null,
      quantity: 10.5,
      uom: "kg",
      notes: "extra fine",
      doneAt: null,
      doneBy: null,
    },
    {
      id: "00000000-0000-0000-0000-00000000bb02",
      orderId: "00000000-0000-0000-0000-00000000aa01",
      lineNumber: 2,
      productId: null,
      adHocDescription: "mutton trim",
      quantity: 4,
      uom: "unit",
      notes: null,
      doneAt: "2026-12-30T11:00:00.000Z",
      doneBy: "00000000-0000-0000-0000-000000000b01",
    },
  ],
};

const PRODUCT: Product = {
  id: "00000000-0000-0000-0000-000000000d01",
  code: "LMB-LEG",
  name: "Lamb leg",
  boxSize: "10 kg",
};

const LIST_KEYS = [
  "completed_at",
  "created_at",
  "created_by",
  "customer",
  "customer_id",
  "delivery_date",
  "delivery_notes",
  "id",
  "lines",
  "order_notes",
  "printed_at",
  "printed_by",
  "reference",
  "state",
];

const LINE_KEYS = [
  "ad_hoc_description",
  "done_at",
  "done_by",
  "id",
  "line_number",
  "notes",
  "product_id",
  "quantity",
  "uom",
];

describe("toOrderListDto", () => {
  it("emits the exact legacy list key set — and NO printer key", () => {
    const dto = toOrderListDto(ORDER);
    expect(Object.keys(dto).sort()).toEqual([...LIST_KEYS, "creator"].sort());
    expect("printer" in dto).toBe(false);
  });

  it("maps values to snake_case verbatim", () => {
    const dto = toOrderListDto(ORDER);
    expect(dto.id).toBe(ORDER.id);
    expect(dto.reference).toBe("MFS-2026-0042");
    expect(dto.customer_id).toBe(ORDER.customerId);
    expect(dto.delivery_date).toBe("2026-12-31");
    expect(dto.delivery_notes).toBe("before 11am");
    expect(dto.order_notes).toBe("test order");
    expect(dto.state).toBe("printed");
    expect(dto.created_by).toBe(ORDER.createdBy);
    expect(dto.created_at).toBe(ORDER.createdAt);
    expect(dto.printed_by).toBe(ORDER.printedBy);
    expect(dto.printed_at).toBe(ORDER.printedAt);
    expect(dto.completed_at).toBeNull();
    expect(dto.customer).toEqual({
      id: ORDER.customer!.id,
      name: "Acme Foods",
      postcode: "AB1 2CD",
    });
    expect(dto.creator).toEqual({ id: ORDER.creator!.id, name: "Sally Sales" });
  });

  it("emits the exact legacy line key set, sorted by line_number", () => {
    const dto = toOrderListDto(ORDER);
    expect(dto.lines.length).toBe(2);
    for (const line of dto.lines) {
      expect(Object.keys(line).sort()).toEqual(LINE_KEYS);
    }
    expect(dto.lines.map((l) => l.line_number)).toEqual([1, 2]);
    expect(dto.lines[0]).toEqual({
      id: ORDER.lines[0]!.id,
      line_number: 1,
      product_id: ORDER.lines[0]!.productId,
      ad_hoc_description: null,
      quantity: 10.5,
      uom: "kg",
      notes: "extra fine",
      done_at: null,
      done_by: null,
    });
  });

  it("passes null embeds through (customer/creator null)", () => {
    const bare: Order = { ...ORDER, customer: null, creator: null };
    const dto = toOrderListDto(bare);
    expect(dto.customer).toBeNull();
    expect(dto.creator).toBeNull();
  });
});

describe("toOrderDetailDto", () => {
  it("emits the list shape PLUS the printer key", () => {
    const dto = toOrderDetailDto(ORDER);
    expect(Object.keys(dto).sort()).toEqual(
      [...LIST_KEYS, "creator", "printer"].sort(),
    );
    expect(dto.printer).toEqual({
      id: ORDER.printer!.id,
      name: "Olly Office",
    });
  });

  it("printer is null on an unprinted order", () => {
    const placed: Order = { ...ORDER, state: "placed", printer: null };
    expect(toOrderDetailDto(placed).printer).toBeNull();
  });
});

describe("toPickingListData", () => {
  const productsById = new Map<string, Product>([[PRODUCT.id, PRODUCT]]);

  it("maps the assembly to the exact PickingListData shape", () => {
    const data = toPickingListData({
      order: ORDER,
      productsById,
      printedByName: "Olly Office",
      printedAt: "2026-12-30T10:00:00.000Z",
    });
    expect(data).toEqual({
      reference: "MFS-2026-0042",
      customer_name: "Acme Foods",
      customer_postcode: "AB1 2CD",
      order_date: "2026-12-30",
      delivery_date: "2026-12-31",
      sales_rep: "Sally Sales",
      printed_at: "2026-12-30T10:00:00.000Z",
      printed_by: "Olly Office",
      delivery_notes: "before 11am",
      order_notes: "test order",
      lines: [
        {
          line_number: 1,
          product_code: "LMB-LEG",
          description: "Lamb leg",
          quantity: 10.5,
          uom: "kg",
          pack: "10 kg",
          notes: "extra fine",
        },
        {
          line_number: 2,
          product_code: "",
          description: "mutton trim",
          quantity: 4,
          uom: "unit",
          pack: null,
          notes: null,
        },
      ],
    });
  });

  it("applies the legacy fallbacks: '—' for customer/sales rep, '' code, '(unknown product)' description", () => {
    const bare: Order = {
      ...ORDER,
      customer: null,
      creator: null,
      lines: [
        {
          ...ORDER.lines[0]!,
          productId: "00000000-0000-0000-0000-00000000dead",
          adHocDescription: null,
          notes: null,
        },
      ],
    };
    const data = toPickingListData({
      order: bare,
      productsById: new Map(),
      printedByName: "unknown",
      printedAt: "2026-12-30T10:00:00.000Z",
    });
    expect(data.customer_name).toBe("—");
    expect(data.customer_postcode).toBeNull();
    expect(data.sales_rep).toBe("—");
    expect(data.printed_by).toBe("unknown");
    expect(data.lines[0]!.product_code).toBe("");
    expect(data.lines[0]!.description).toBe("(unknown product)");
    expect(data.lines[0]!.pack).toBeNull();
  });
});
