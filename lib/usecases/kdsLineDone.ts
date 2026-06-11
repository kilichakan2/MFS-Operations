/**
 * lib/usecases/kdsLineDone.ts
 *
 * KDS line-done use-case (F-08, plan §5 D3.3). One business operation
 * — "a butcher taps Done on a line" — that composes the staff list
 * (UsersRepository: is this tap really from an active butcher?) with
 * the orders engine (OrdersService.completeLineDone: idempotent tap +
 * race-safe auto-complete).
 *
 * The KDS kiosk has no session, so this per-tap identity check is the
 * mutation's only guard (unchanged access model — physical-room
 * control; broader hardening belongs to F-13). Statuses are identical
 * to the legacy inline checks at
 * app/api/kds/lines/[lineId]/done/route.ts:59-73:
 *   - unknown butcher  → NotFoundError  → 404
 *   - inactive account → ForbiddenError → 403
 *   - wrong role       → ForbiddenError → 403
 *
 * Construction: factory (F-07 template); production wiring in
 * `lib/wiring/orders.ts` (F-TD-11).
 */
import { NotFoundError, ForbiddenError } from "@/lib/errors";
import type { UsersRepository } from "@/lib/ports";
import type { OrdersService } from "@/lib/services";

/** Roles whose taps the KDS accepts (legacy allow-list verbatim). */
const KDS_ALLOWED_ROLES: readonly string[] = ["butcher", "warehouse"];

export interface KdsLineDoneUsecase {
  /**
   * Validate the tapping butcher, then mark the line done (and
   * auto-complete the parent order when it was the last line).
   *
   * Throws: NotFoundError (butcher or line missing) | ForbiddenError
   * (inactive / wrong role) | ConflictError (parent order placed or
   * completed) | ServiceError.
   */
  completeKdsLineDone(
    lineId: string,
    butcherId: string,
    when: Date,
  ): Promise<{
    readonly alreadyDone: boolean;
    readonly orderId: string;
    readonly completed: boolean;
  }>;
}

export interface KdsLineDoneUsecaseDeps {
  readonly ordersService: OrdersService;
  readonly users: UsersRepository;
}

export function createKdsLineDoneUsecase(
  deps: KdsLineDoneUsecaseDeps,
): KdsLineDoneUsecase {
  const { ordersService: orders, users } = deps;
  return {
    async completeKdsLineDone(lineId, butcherId, when) {
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
      return orders.completeLineDone(lineId, butcherId, when);
    },
  };
}
