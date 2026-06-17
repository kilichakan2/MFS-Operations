/**
 * tests/unit/usecases/kdsLineUndone.test.ts
 *
 * F-PROD-02 — KDS line-undo use-case against Fake adapters. The kiosk
 * endpoint has no session; the per-tap butcher check via the Users
 * port is the mutation's identity guard (statuses identical to the
 * line-done use-case: missing 404, inactive 403, wrong role 403).
 */
import { describe, it, expect } from "vitest";
import { createKdsLineUndoneUsecase } from "@/lib/usecases/kdsLineUndone";
import { createOrdersService } from "@/lib/services";
import {
  createFakeOrdersRepository,
  createFakeCustomersRepository,
  createFakeProductsRepository,
  createFakeUsersRepository,
} from "@/lib/adapters/fake";
import { NotFoundError, ForbiddenError } from "@/lib/errors";

const CUSTOMER_ID = "00000000-0000-0000-0000-000000000c01";
const USER_ID = "00000000-0000-0000-0000-000000000a01";
const BUTCHER_ID = "00000000-0000-0000-0000-000000000b01";
const WAREHOUSE_ID = "00000000-0000-0000-0000-000000000b02";
const INACTIVE_ID = "00000000-0000-0000-0000-000000000b03";
const SALES_ID = "00000000-0000-0000-0000-000000000b04";
const PRODUCT_ID = "00000000-0000-0000-0000-000000000d01";
const UNKNOWN_ID = "00000000-0000-0000-0000-000000000fff";
const T = new Date("2026-06-17T10:00:00Z");

function make() {
  const orders = createFakeOrdersRepository();
  const customers = createFakeCustomersRepository([
    { id: CUSTOMER_ID, name: "Acme", postcode: null, active: true },
  ]);
  const products = createFakeProductsRepository([
    { id: PRODUCT_ID, code: "X", name: "X", boxSize: null },
  ]);
  const users = createFakeUsersRepository([
    { id: BUTCHER_ID, name: "Bob Butcher", role: "butcher", active: true },
    { id: WAREHOUSE_ID, name: "Wendy", role: "warehouse", active: true },
    { id: INACTIVE_ID, name: "Gone Greg", role: "butcher", active: false },
    { id: SALES_ID, name: "Sally Sales", role: "sales", active: true },
  ]);
  const ordersService = createOrdersService({ orders, customers, products });
  const usecase = createKdsLineUndoneUsecase({ ordersService, users });
  return { usecase, ordersService };
}

async function printedDoneLine(
  service: ReturnType<typeof make>["ordersService"],
) {
  const order = await service.placeOrder(
    {
      customerId: CUSTOMER_ID,
      deliveryDate: "2026-12-31",
      deliveryNotes: null,
      orderNotes: null,
      lines: [
        {
          productId: PRODUCT_ID,
          adHocDescription: null,
          quantity: 1,
          uom: "kg" as const,
          notes: null,
        },
        {
          productId: PRODUCT_ID,
          adHocDescription: null,
          quantity: 1,
          uom: "kg" as const,
          notes: null,
        },
      ],
    },
    USER_ID,
  );
  await service.printOrder(order.id, USER_ID, T);
  await service.completeLineDone(order.lines[0]!.id, BUTCHER_ID, T);
  return order;
}

describe("undoKdsLineDone — butcher validation (Users port)", () => {
  it("throws NotFoundError('Butcher not found') for an unknown butcher (404)", async () => {
    const { usecase, ordersService } = make();
    const order = await printedDoneLine(ordersService);
    await expect(
      usecase.undoKdsLineDone(order.lines[0]!.id, UNKNOWN_ID, T),
    ).rejects.toThrowError(NotFoundError);
    await expect(
      usecase.undoKdsLineDone(order.lines[0]!.id, UNKNOWN_ID, T),
    ).rejects.toThrowError("Butcher not found");
  });

  it("throws ForbiddenError('Butcher account inactive') for an inactive butcher (403)", async () => {
    const { usecase, ordersService } = make();
    const order = await printedDoneLine(ordersService);
    await expect(
      usecase.undoKdsLineDone(order.lines[0]!.id, INACTIVE_ID, T),
    ).rejects.toThrowError(ForbiddenError);
    await expect(
      usecase.undoKdsLineDone(order.lines[0]!.id, INACTIVE_ID, T),
    ).rejects.toThrowError("Butcher account inactive");
  });

  it("throws ForbiddenError('User cannot mark lines done') for a non-butcher role (403)", async () => {
    const { usecase, ordersService } = make();
    const order = await printedDoneLine(ordersService);
    await expect(
      usecase.undoKdsLineDone(order.lines[0]!.id, SALES_ID, T),
    ).rejects.toThrowError(ForbiddenError);
  });

  it("allows the warehouse role as well as butcher (legacy allow-list)", async () => {
    const { usecase, ordersService } = make();
    const order = await printedDoneLine(ordersService);
    const result = await usecase.undoKdsLineDone(
      order.lines[0]!.id,
      WAREHOUSE_ID,
      T,
    );
    expect(result).toEqual({
      alreadyPending: false,
      orderId: order.id,
      orderReopened: false,
    });
  });
});

describe("undoKdsLineDone — delegation to OrdersService", () => {
  it("happy path delegates to ordersService.undoLineDone (plain undo)", async () => {
    const { usecase, ordersService } = make();
    const order = await printedDoneLine(ordersService);
    const result = await usecase.undoKdsLineDone(
      order.lines[0]!.id,
      BUTCHER_ID,
      T,
    );
    expect(result).toEqual({
      alreadyPending: false,
      orderId: order.id,
      orderReopened: false,
    });
    const fresh = await ordersService.findOrderById(order.id);
    expect(fresh?.lines.find((l) => l.id === order.lines[0]!.id)?.doneAt).toBe(
      null,
    );
  });

  it("propagates NotFoundError for a missing line (404)", async () => {
    const { usecase } = make();
    await expect(
      usecase.undoKdsLineDone(UNKNOWN_ID, BUTCHER_ID, T),
    ).rejects.toThrowError(NotFoundError);
  });
});
