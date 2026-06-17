/**
 * lib/usecases/kdsLineUndone.ts
 *
 * KDS line-undo use-case (F-PROD-02). One business operation — "a
 * butcher taps Undo on a done line" — that composes the staff list
 * (UsersRepository: is this tap really from an active butcher?) with
 * the orders engine (OrdersService.undoLineDone: idempotent revert +
 * atomic completed→printed cascade).
 *
 * Exact mirror of lib/usecases/kdsLineDone.ts: the kiosk has no
 * session, so this per-tap identity check is the mutation's only guard
 * (same allow-list, same error codes):
 *   - unknown butcher  → NotFoundError  → 404
 *   - inactive account → ForbiddenError → 403
 *   - wrong role       → ForbiddenError → 403
 *
 * Construction: factory (F-07 template); production wiring in
 * `lib/wiring/orders.ts`.
 */
import { NotFoundError, ForbiddenError } from "@/lib/errors";
import type { UsersRepository } from "@/lib/ports";
import type { OrdersService } from "@/lib/services";

/** Roles whose taps the KDS accepts (legacy allow-list verbatim). */
const KDS_ALLOWED_ROLES: readonly string[] = ["butcher", "warehouse"];

export interface KdsLineUndoneUsecase {
  /**
   * Validate the tapping butcher, then undo the line (and, if it
   * belonged to a completed order, atomically re-open the order).
   *
   * Throws: NotFoundError (butcher or line missing) | ForbiddenError
   * (inactive / wrong role) | ServiceError.
   */
  undoKdsLineDone(
    lineId: string,
    butcherId: string,
    when: Date,
  ): Promise<{
    readonly alreadyPending: boolean;
    readonly orderId: string;
    readonly orderReopened: boolean;
  }>;
}

export interface KdsLineUndoneUsecaseDeps {
  readonly ordersService: OrdersService;
  readonly users: UsersRepository;
}

export function createKdsLineUndoneUsecase(
  deps: KdsLineUndoneUsecaseDeps,
): KdsLineUndoneUsecase {
  const { ordersService: orders, users } = deps;
  return {
    async undoKdsLineDone(lineId, butcherId, when) {
      const butcher = await users.findUserById(butcherId);
      if (butcher === null) {
        throw new NotFoundError("Butcher not found");
      }
      if (!butcher.active) {
        throw new ForbiddenError("Butcher account inactive");
      }
      if (!KDS_ALLOWED_ROLES.includes(butcher.role)) {
        throw new ForbiddenError("User cannot mark lines done");
      }
      return orders.undoLineDone(lineId, when);
    },
  };
}
