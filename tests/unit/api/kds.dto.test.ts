/**
 * tests/unit/api/kds.dto.test.ts
 *
 * F-08 — KDS DTO translators. Pins the legacy wire shape from plan
 * §5.4, including the two easy-to-miss details:
 *   - the KDS customer embed has NO postcode ({id, name} only);
 *   - every line carries a `product: {id, name} | null` embed (the
 *     D3 gap — the domain Order does not carry product names; the
 *     kdsQueue use-case supplies the map and this DTO restores the
 *     embed).
 */
import { describe, it, expect } from "vitest";
import { toKdsOrderDto, toKdsQueueResponse } from "@/lib/api/kds/dto";
import type { Order, Product } from "@/lib/domain";
import type { KdsOrderQueueSnapshot } from "@/lib/ports";

const ORDER: Order = {
  id: "00000000-0000-0000-0000-00000000aa01",
  reference: "MFS-2026-0042",
  customerId: "00000000-0000-0000-0000-000000000c01",
  deliveryDate: "2026-12-31",
  deliveryNotes: "before 11am",
  orderNotes: null,
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

const productsById = new Map<string, Product>([[PRODUCT.id, PRODUCT]]);

describe("toKdsOrderDto", () => {
  it("emits the exact legacy KDS order key set — customer has NO postcode", () => {
    const dto = toKdsOrderDto(ORDER, productsById);
    expect(Object.keys(dto).sort()).toEqual([
      "completed_at",
      "customer",
      "delivery_date",
      "delivery_notes",
      "id",
      "lines",
      "order_notes",
      "printed_at",
      "reference",
      "state",
    ]);
    expect(dto.customer).toEqual({
      id: ORDER.customer!.id,
      name: "Acme Foods",
    });
    expect(dto.customer && "postcode" in dto.customer).toBe(false);
  });

  it("embeds product {id, name} on catalogued lines and null on ad-hoc lines", () => {
    const dto = toKdsOrderDto(ORDER, productsById);
    expect(dto.lines.length).toBe(2);
    for (const line of dto.lines) {
      expect(Object.keys(line).sort()).toEqual([
        "ad_hoc_description",
        "done_at",
        "done_by",
        "id",
        "line_number",
        "notes",
        "product",
        "product_id",
        "quantity",
        "uom",
      ]);
    }
    expect(dto.lines[0]!.product).toEqual({
      id: PRODUCT.id,
      name: "Lamb leg",
    });
    expect(dto.lines[1]!.product).toBeNull();
    expect(dto.lines[1]!.done_at).toBe("2026-12-30T11:00:00.000Z");
    expect(dto.lines[1]!.done_by).toBe(ORDER.lines[1]!.doneBy);
  });

  it("product is null when the catalogued product is missing from the map", () => {
    const dto = toKdsOrderDto(ORDER, new Map());
    expect(dto.lines[0]!.product).toBeNull();
    expect(dto.lines[0]!.product_id).toBe(PRODUCT.id);
  });
});

describe("toKdsQueueResponse", () => {
  it("emits {orders, recent_flashes, server_time} with snake_case flash events", () => {
    const snapshot: KdsOrderQueueSnapshot = {
      orders: [ORDER],
      recentFlashes: [
        {
          orderId: ORDER.id,
          action: "reprinted",
          createdAt: "2026-12-30T10:05:00.000Z",
        },
      ],
      serverTime: "2026-12-30T10:06:00.000Z",
    };
    const res = toKdsQueueResponse({ snapshot, productsById });
    expect(Object.keys(res).sort()).toEqual([
      "orders",
      "recent_flashes",
      "server_time",
    ]);
    expect(res.orders.length).toBe(1);
    expect(res.orders[0]!.id).toBe(ORDER.id);
    expect(res.recent_flashes).toEqual([
      {
        order_id: ORDER.id,
        action: "reprinted",
        created_at: "2026-12-30T10:05:00.000Z",
      },
    ]);
    expect(res.server_time).toBe("2026-12-30T10:06:00.000Z");
  });
});
