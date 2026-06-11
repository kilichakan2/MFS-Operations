/**
 * lib/usecases/kdsQueue.ts
 *
 * KDS queue assembly use-case (F-08, plan §5 D3.2). One business
 * operation — "everything the kitchen screen needs per poll" — that
 * composes the orders engine snapshot with one batched product
 * lookup.
 *
 * Why this exists: the legacy KDS wire shape embeds
 * `product: {id, name}` on every catalogued line, but the domain
 * `Order` carries only `productId`. This use-case closes that gap by
 * batch-fetching the catalogue rows for every catalogued line in the
 * snapshot (one round-trip, never N+1); the route's DTO
 * (lib/api/kds/dto.ts) restores the embed.
 *
 * Construction: factory (F-07 template); production wiring in
 * `lib/wiring/orders.ts` (F-TD-11).
 */
import type { Product } from "@/lib/domain";
import type { KdsOrderQueueSnapshot, ProductsRepository } from "@/lib/ports";
import type { OrdersService } from "@/lib/services";

export interface KdsQueueBundle {
  readonly snapshot: KdsOrderQueueSnapshot;
  readonly productsById: ReadonlyMap<string, Product>;
}

export interface KdsQueueUsecase {
  /**
   * Read the live KDS queue snapshot plus the product map covering
   * every catalogued line in it.
   *
   * @param since  Completed-orders window cutoff (the route passes
   *               `now - 90s`, matching the legacy poll).
   * Throws: ServiceError.
   */
  getKdsQueue(since: Date): Promise<KdsQueueBundle>;
}

export interface KdsQueueUsecaseDeps {
  readonly ordersService: OrdersService;
  readonly products: ProductsRepository;
}

export function createKdsQueueUsecase(
  deps: KdsQueueUsecaseDeps,
): KdsQueueUsecase {
  const { ordersService: orders, products } = deps;
  return {
    async getKdsQueue(since) {
      const snapshot = await orders.listKdsQueue(since);
      const productIds = [
        ...new Set(
          snapshot.orders
            .flatMap((o) => o.lines)
            .map((l) => l.productId)
            .filter((id): id is string => id !== null),
        ),
      ];
      const found = await products.findProductsByIds(productIds);
      return {
        snapshot,
        productsById: new Map(found.map((p) => [p.id, p])),
      };
    },
  };
}
