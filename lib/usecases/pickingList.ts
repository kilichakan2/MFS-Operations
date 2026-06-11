/**
 * lib/usecases/pickingList.ts
 *
 * Picking-list assembly use-case (F-08, plan §5 D3.1). One business
 * operation — "build everything one A4 picking sheet needs" — that
 * spans three departments: the orders engine (OrdersService), the
 * product catalogue (ProductsRepository, for codes/names/pack sizes)
 * and the staff list (UsersRepository, for the printer's name).
 *
 * ADR-0002: services never import services; composition of a service
 * plus extra ports lives in lib/usecases/. This is exactly that
 * composition point — extending OrdersService instead was rejected
 * (design-it-twice, plan §5 D3): the service would need the Users
 * port (F-13's territory) and display-only product data.
 *
 * The route maps the returned assembly through
 * `toPickingListData` (lib/api/orders/dto.ts) and renders with
 * `renderPickingListHtml` — HTML stays at the presentation layer.
 *
 * Construction: factory + pre-wired singleton (F-07 template).
 */
import { NotFoundError } from "@/lib/errors";
import type { Order, Product } from "@/lib/domain";
import type { ProductsRepository, UsersRepository } from "@/lib/ports";
import type { OrdersService } from "@/lib/services";
import { ordersService } from "@/lib/services";
import {
  supabaseProductsRepository,
  supabaseUsersRepository,
} from "@/lib/adapters/supabase";

/** Everything one picking-sheet render needs, pre-joined. */
export interface PickingListAssembly {
  readonly order: Order;
  readonly productsById: ReadonlyMap<string, Product>;
  readonly printedByName: string;
  readonly printedAt: string;
}

export interface PickingListUsecase {
  /**
   * GET preview / re-render: read-only, never transitions state.
   * `printedAt` is "now" — the sheet shows when it was rendered.
   *
   * Throws: NotFoundError("Order not found") | ServiceError.
   */
  previewPickingList(
    orderId: string,
    callerUserId: string,
  ): Promise<PickingListAssembly>;

  /**
   * POST print: `ordersService.printOrder` performs the placed →
   * printed transition (or reprint) and supplies the recorded
   * `printedAt`, so the sheet shows exactly what was written.
   *
   * Throws: NotFoundError | ConflictError (completed order) | ServiceError.
   */
  printPickingList(
    orderId: string,
    callerUserId: string,
    when: Date,
  ): Promise<PickingListAssembly>;
}

export interface PickingListUsecaseDeps {
  readonly ordersService: OrdersService;
  readonly products: ProductsRepository;
  readonly users: UsersRepository;
}

export function createPickingListUsecase(
  deps: PickingListUsecaseDeps,
): PickingListUsecase {
  const { ordersService: orders, products, users } = deps;

  /** Batch-fetch the catalogue rows + printer display name. */
  async function assemble(
    order: Order,
    callerUserId: string,
    printedAt: string,
  ): Promise<PickingListAssembly> {
    const productIds = order.lines
      .map((l) => l.productId)
      .filter((id): id is string => id !== null);
    const [found, printer] = await Promise.all([
      products.findProductsByIds(productIds),
      users.findUserById(callerUserId),
    ]);
    return {
      order,
      productsById: new Map(found.map((p) => [p.id, p])),
      printedByName: printer?.name ?? "unknown", // legacy fallback
      printedAt,
    };
  }

  return {
    async previewPickingList(orderId, callerUserId) {
      const order = await orders.findOrderById(orderId);
      if (order === null) throw new NotFoundError("Order not found");
      return assemble(order, callerUserId, new Date().toISOString());
    },

    async printPickingList(orderId, callerUserId, when) {
      const order = await orders.printOrder(orderId, callerUserId, when);
      // printOrder's returned Order carries the freshly-written
      // printedAt; null is impossible post-transition, but fall back
      // to `when` rather than crash the render.
      return assemble(
        order,
        callerUserId,
        order.printedAt ?? when.toISOString(),
      );
    },
  };
}

/** Pre-wired singleton against the production service + adapters. */
export const pickingListUsecase: PickingListUsecase = createPickingListUsecase({
  ordersService,
  products: supabaseProductsRepository,
  users: supabaseUsersRepository,
});
