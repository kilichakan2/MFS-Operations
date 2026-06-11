/**
 * tests/unit/usecases/kdsQueue.test.ts
 *
 * F-08 — KDS queue assembly use-case against Fake adapters. Closes
 * the verified D3 gap: the domain Order does not carry per-line
 * product names, but the legacy KDS wire shape embeds
 * `product: {id, name}` on every catalogued line — so the use-case
 * batch-fetches the product map alongside the snapshot.
 */
import { describe, it, expect } from "vitest";
import { createKdsQueueUsecase } from "@/lib/usecases/kdsQueue";
import { createOrdersService } from "@/lib/services";
import {
  createFakeOrdersRepository,
  createFakeCustomersRepository,
  createFakeProductsRepository,
} from "@/lib/adapters/fake";

const CUSTOMER_ID = "00000000-0000-0000-0000-000000000c01";
const USER_ID = "00000000-0000-0000-0000-000000000a01";
const PRODUCT_ID = "00000000-0000-0000-0000-000000000d01";
const PRODUCT_ID_2 = "00000000-0000-0000-0000-000000000d02";
const T = new Date("2026-06-11T10:00:00Z");

function make() {
  const orders = createFakeOrdersRepository();
  const customers = createFakeCustomersRepository([
    { id: CUSTOMER_ID, name: "Acme", postcode: null, active: true },
  ]);
  const products = createFakeProductsRepository([
    { id: PRODUCT_ID, code: "LMB-LEG", name: "Lamb leg", boxSize: null },
    { id: PRODUCT_ID_2, code: "LMB-SHL", name: "Lamb shoulder", boxSize: null },
  ]);
  const ordersService = createOrdersService({ orders, customers, products });
  const usecase = createKdsQueueUsecase({ ordersService, products });
  return { usecase, ordersService };
}

function line(productId: string | null, adHoc: string | null) {
  return {
    productId,
    adHocDescription: adHoc,
    quantity: 1,
    uom: "kg" as const,
    notes: null,
  };
}

describe("getKdsQueue", () => {
  it("returns the snapshot plus a product map covering every catalogued line", async () => {
    const { usecase, ordersService } = make();
    const a = await ordersService.placeOrder(
      {
        customerId: CUSTOMER_ID,
        deliveryDate: "2026-12-31",
        deliveryNotes: null,
        orderNotes: null,
        lines: [line(PRODUCT_ID, null), line(null, "mutton trim")],
      },
      USER_ID,
    );
    const b = await ordersService.placeOrder(
      {
        customerId: CUSTOMER_ID,
        deliveryDate: "2026-12-31",
        deliveryNotes: null,
        orderNotes: null,
        lines: [line(PRODUCT_ID_2, null)],
      },
      USER_ID,
    );
    await ordersService.printOrder(a.id, USER_ID, T);
    await ordersService.printOrder(b.id, USER_ID, T);

    const bundle = await usecase.getKdsQueue(new Date(0));
    expect(bundle.snapshot.orders.length).toBe(2);
    // One batched fetch covers every catalogued line across all orders.
    expect(bundle.productsById.get(PRODUCT_ID)?.name).toBe("Lamb leg");
    expect(bundle.productsById.get(PRODUCT_ID_2)?.name).toBe("Lamb shoulder");
    expect(bundle.productsById.size).toBe(2); // ad-hoc lines fetch nothing
    expect(typeof bundle.snapshot.serverTime).toBe("string");
  });

  it("returns an empty product map when the queue is empty", async () => {
    const { usecase } = make();
    const bundle = await usecase.getKdsQueue(new Date(0));
    expect(bundle.snapshot.orders.length).toBe(0);
    expect(bundle.productsById.size).toBe(0);
  });

  it("forwards the since cutoff to the snapshot read", async () => {
    const { usecase, ordersService } = make();
    const placed = await ordersService.placeOrder(
      {
        customerId: CUSTOMER_ID,
        deliveryDate: "2026-12-31",
        deliveryNotes: null,
        orderNotes: null,
        lines: [line(PRODUCT_ID, null)],
      },
      USER_ID,
    );
    await ordersService.printOrder(placed.id, USER_ID, T);
    await ordersService.completeLineDone(
      placed.lines[0]!.id,
      "00000000-0000-0000-0000-000000000b01",
      T,
    );
    // since far in the future → completed order excluded.
    const future = new Date(Date.now() + 60 * 60_000);
    const bundle = await usecase.getKdsQueue(future);
    expect(bundle.snapshot.orders.length).toBe(0);
  });
});
