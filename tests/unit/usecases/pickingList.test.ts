/**
 * tests/unit/usecases/pickingList.test.ts
 *
 * F-08 — picking-list assembly use-case against Fake adapters. The
 * use-case composes the orders engine + product catalogue + staff
 * list for one render: preview (GET, no state change) and print
 * (POST, state transition via OrdersService.printOrder).
 */
import { describe, it, expect } from "vitest";
import { createPickingListUsecase } from "@/lib/usecases/pickingList";
import { createOrdersService } from "@/lib/services";
import {
  createFakeOrdersRepository,
  createFakeCustomersRepository,
  createFakeProductsRepository,
  createFakeUsersRepository,
} from "@/lib/adapters/fake";
import { NotFoundError, ConflictError } from "@/lib/errors";

const CUSTOMER_ID = "00000000-0000-0000-0000-000000000c01";
const USER_ID = "00000000-0000-0000-0000-000000000a01";
const BUTCHER_ID = "00000000-0000-0000-0000-000000000b01";
const PRODUCT_ID = "00000000-0000-0000-0000-000000000d01";
const UNKNOWN_ID = "00000000-0000-0000-0000-000000000fff";
const T = new Date("2026-06-11T10:00:00Z");

function make() {
  const orders = createFakeOrdersRepository();
  const customers = createFakeCustomersRepository([
    { id: CUSTOMER_ID, name: "Acme", postcode: "AB1 2CD", active: true },
  ]);
  const products = createFakeProductsRepository([
    { id: PRODUCT_ID, code: "LMB-LEG", name: "Lamb leg", boxSize: "10 kg" },
  ]);
  const users = createFakeUsersRepository([
    { id: USER_ID, name: "Olly Office", role: "office", active: true },
  ]);
  const ordersService = createOrdersService({ orders, customers, products });
  const usecase = createPickingListUsecase({ ordersService, products, users });
  return { usecase, ordersService };
}

async function placeOrder(service: ReturnType<typeof make>["ordersService"]) {
  return service.placeOrder(
    {
      customerId: CUSTOMER_ID,
      deliveryDate: "2026-12-31",
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
        {
          productId: null,
          adHocDescription: "mutton trim",
          quantity: 1,
          uom: "unit",
          notes: null,
        },
      ],
    },
    USER_ID,
  );
}

describe("previewPickingList", () => {
  it("throws NotFoundError('Order not found') on a missing order", async () => {
    const { usecase } = make();
    await expect(
      usecase.previewPickingList(UNKNOWN_ID, USER_ID),
    ).rejects.toThrowError(NotFoundError);
    await expect(
      usecase.previewPickingList(UNKNOWN_ID, USER_ID),
    ).rejects.toThrowError("Order not found");
  });

  it("assembles order + product map + printer name without changing state", async () => {
    const { usecase, ordersService } = make();
    const placed = await placeOrder(ordersService);
    const before = Date.now();
    const assembly = await usecase.previewPickingList(placed.id, USER_ID);
    expect(assembly.order.id).toBe(placed.id);
    expect(assembly.order.state).toBe("placed"); // preview never transitions
    expect(assembly.productsById.get(PRODUCT_ID)?.name).toBe("Lamb leg");
    expect(assembly.productsById.size).toBe(1); // ad-hoc line fetches nothing
    expect(assembly.printedByName).toBe("Olly Office");
    // printedAt = "now" for a preview render.
    expect(new Date(assembly.printedAt).getTime()).toBeGreaterThanOrEqual(
      before - 1_000,
    );
    const fresh = await ordersService.findOrderById(placed.id);
    expect(fresh?.state).toBe("placed");
  });

  it("falls back to 'unknown' when the printing user is missing (legacy parity)", async () => {
    const { usecase, ordersService } = make();
    const placed = await placeOrder(ordersService);
    const assembly = await usecase.previewPickingList(placed.id, UNKNOWN_ID);
    expect(assembly.printedByName).toBe("unknown");
  });
});

describe("printPickingList", () => {
  it("transitions placed → printed and supplies the recorded printedAt", async () => {
    const { usecase, ordersService } = make();
    const placed = await placeOrder(ordersService);
    const assembly = await usecase.printPickingList(placed.id, USER_ID, T);
    expect(assembly.order.state).toBe("printed");
    expect(assembly.printedAt).toBe(T.toISOString());
    expect(assembly.printedByName).toBe("Olly Office");
    const fresh = await ordersService.findOrderById(placed.id);
    expect(fresh?.state).toBe("printed");
    expect(fresh?.printedBy).toBe(USER_ID);
  });

  it("throws NotFoundError on a missing order", async () => {
    const { usecase } = make();
    await expect(
      usecase.printPickingList(UNKNOWN_ID, USER_ID, T),
    ).rejects.toThrowError(NotFoundError);
  });

  it("throws ConflictError when the order is completed (route surfaces 409)", async () => {
    const { usecase, ordersService } = make();
    const placed = await placeOrder(ordersService);
    await ordersService.printOrder(placed.id, USER_ID, T);
    await ordersService.completeLineDone(placed.lines[0]!.id, BUTCHER_ID, T);
    await ordersService.completeLineDone(placed.lines[1]!.id, BUTCHER_ID, T);
    await expect(
      usecase.printPickingList(placed.id, USER_ID, T),
    ).rejects.toThrowError(ConflictError);
  });
});
