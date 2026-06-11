/**
 * lib/services/OrdersService.ts
 *
 * The Orders service. The first service file in the codebase, and the
 * worked example for every future service (UsersService, RoutesService,
 * PricingService, CashService, ComplaintsService, VisitsService,
 * HACCPService, AdminService).
 *
 * What this file is.
 *   - The orchestration layer between F-08's Orders routes and F-06's
 *     three Orders-domain adapters (Orders, Customers, Products). It
 *     composes those adapters via the F-05 ports — never via the
 *     adapters directly, never via other services.
 *   - The home of business decisions that span more than one port call:
 *     "is the customer active?", "are all the products in the catalogue?",
 *     "is this role allowed to edit this order in this state?", "did
 *     this tap auto-complete the order, and if a race lost, swallow
 *     the conflict".
 *   - The single layer the F-08 route handlers will call. Routes do
 *     auth + schema validation; services do business orchestration.
 *
 * Hexagonal posture (ADR-0002).
 *   - Line 19 — "Services live in `lib/services/`." Yes.
 *   - Line 23 — "Services do not import other services directly."
 *     This service composes THREE PORT INTERFACES:
 *       OrdersRepository (8 methods)
 *       CustomersRepository (1 method)
 *       ProductsRepository (1 method)
 *     It does NOT import any *Service file. When UsersService /
 *     CustomersService / ProductsService exist in future units, this
 *     service still talks to their PORTS, not their services. This
 *     keeps the service graph acyclic and the dependency direction
 *     inward-pointing.
 *   - Line 25 (depth rule) — business methods (placeOrder, editOrder,
 *     printOrder, completeLineDone) each hide 2+ port calls plus a
 *     business decision. Pass-throughs (listOrders, findOrderById,
 *     listKdsQueue) are explicit thin delegates; they exist so the
 *     F-08 route layer has a single point of contact for Orders.
 *   - Line 27 — only domain types cross the function boundary; the
 *     service receives only domain types from ports and returns only
 *     domain types to callers.
 *   - Line 43 (APOSD) — "pull complexity downward" (§10): the
 *     business orchestration that today is inline in each Orders route
 *     lives here in F-07 so F-08 routes can be ~30 lines each.
 *     "Define errors out of existence" (§11): pass-throughs return
 *     null/empty on miss; only WRITE methods that need the row throw
 *     NotFoundError on miss. "Information hiding" (§4): the
 *     state×role gating constants are module-local; the
 *     extract-product-ids + missing-products computation is inlined
 *     at the two call sites.
 *
 * Construction (factory + composition root — ADR-0002, F-TD-11).
 *   - `createOrdersService(repos)` factory — tests pass Fake repos
 *     for unit testing; alternative production wirings (e.g. a
 *     per-request authenticated client under F-RLS-03) pass adapters
 *     constructed against that client.
 *   - Production wiring lives in `lib/wiring/orders.ts` (the
 *     composition root) — NEVER as a pre-wired singleton in this
 *     file. Service files import ports only, never
 *     `@/lib/adapters/*` (ESLint-enforced, pinned by
 *     tests/unit/lint/no-adapter-imports.test.ts). F-13+ services
 *     copy this pattern: factory here, wiring in
 *     `lib/wiring/<domain>.ts`.
 *
 * Auth posture (Gate 1 locked).
 *   - Service methods take primitives: `callerRole: Role` and
 *     `callerUserId: string`. Never `Caller`. Never `request`. Never
 *     a cookie / header read.
 *   - The route layer (F-08) does `requireRole(req, [allowed])` from
 *     `@/lib/auth/session`, gets back a `Caller`, then passes
 *     `caller.role!` and `caller.userId!` to the service. The `!`
 *     non-null assertion is the route's responsibility — `requireRole`
 *     throws `UnauthorizedError` if either is missing, so by the time
 *     the service is called both are populated.
 *   - Why primitives, not `Caller`. The `Caller` is a request-scoped
 *     identity + correlation bundle. It belongs at the framework /
 *     observability boundary, not at the service. Coupling
 *     OrdersService to `Caller` would mean every test has to
 *     construct a `Caller`, every future cron / worker entry point
 *     has to construct a `Caller`, and the service's signature
 *     bleeds with F-FND-03's observability shape. Primitives are
 *     simpler and have the same expressive power.
 *
 * `Role` import forward path (F-13).
 *   - Today: `import type { Role } from '@/lib/observability'`. The
 *     `Role` union currently lives at `lib/observability/Caller.ts:26-32`
 *     because that file's docstring (lines 11-16) records that "When
 *     the Users + Auth migration lands (F-13), this canonical type
 *     moves to a domain module (`lib/domain/Role.ts`)."
 *   - F-13: this import becomes `import type { Role } from '@/lib/domain'`.
 *     One line change, no behavioural impact. The TYPE-ONLY import
 *     today is erased at compile time, so the service file's compiled
 *     JavaScript has zero references to `@/lib/observability` —
 *     no runtime coupling to break.
 *
 * Error contract per method (cited verbatim from F-05's port JSDoc
 * + the locked Gate 1 spec).
 *   listOrders       → ServiceError only (propagated from port)
 *   findOrderById    → ServiceError only (returns null on miss)
 *   listKdsQueue     → ServiceError only (propagated from port)
 *   placeOrder       → NotFoundError | ConflictError | ValidationError | ServiceError
 *   editOrder        → NotFoundError | ConflictError | ForbiddenError | ValidationError | ServiceError
 *   printOrder       → NotFoundError | ConflictError | ServiceError
 *   completeLineDone → NotFoundError | ConflictError | ServiceError
 *                      (`markOrderCompleted` ConflictError swallowed for race-safety)
 *
 * Scope discipline.
 *   - Schema validation (input shape) stays at the route layer (F-08).
 *     The service trusts that `CreateOrderInput` / `OrderPatch` are
 *     well-formed.
 *   - The service surfaces VALIDATION errors only for business-rule
 *     validation (unknown product IDs). Routes surface validation
 *     errors for shape/type/missing-field issues.
 *   - Logging stays at the adapter layer (F-06). The service throws
 *     typed errors; no `log.warn` / `log.error` here.
 *   - Picking-list HTML rendering stays at the route layer (F-08).
 *     `printOrder` does only the state transition.
 *   - `SET LOCAL app.current_user_id` audit wiring stays deferred (per
 *     F-06's documented deferral). The `callerUserId` reaches
 *     `orders.created_by` / `orders.printed_by` / `order_lines.done_by`
 *     directly; the audit log still gets NULL user_id until F-13 or
 *     F-19 revisits.
 */

import type { Role } from "@/lib/observability";
import {
  NotFoundError,
  ConflictError,
  ForbiddenError,
  ValidationError,
} from "@/lib/errors";
import type {
  Order,
  OrderFilter,
  OrderPatch,
  CreateOrderInput,
  CreateOrderLineInput,
} from "@/lib/domain";
import type {
  OrdersRepository,
  CustomersRepository,
  ProductsRepository,
  KdsOrderQueueSnapshot,
} from "@/lib/ports";

// ─── State×role gating constants (module scope) ──────────────

/**
 * Roles permitted to EDIT an order while it is still in state='placed'.
 * Matches `app/api/orders/[id]/route.ts:31` verbatim — sales reps can
 * still edit unprinted orders. Office and admin always can.
 */
const ROLES_EDIT_PLACED: readonly Role[] = ["admin", "sales", "office"];

/**
 * Roles permitted to EDIT an order while it is in state='printed'.
 * Matches `app/api/orders/[id]/route.ts:32` verbatim — sales reps
 * are locked out after print; only office and admin can amend a
 * printed order. The picking list is already on the shop floor at
 * this point and the warehouse needs a single source of truth.
 */
const ROLES_EDIT_PRINTED: readonly Role[] = ["admin", "office"];

// ─── Repository bundle ──────────────────────────────────────

/**
 * Repository bundle accepted by `createOrdersService`. The factory takes
 * the three ports as a single object so the call site is named:
 *
 *   createOrdersService({ orders, customers, products })
 *
 * vs positional arguments (`createOrdersService(orders, customers,
 * products)`), which would invite swap bugs when a fourth port joins
 * (none are planned, but the named-object shape is the safer default).
 */
export interface OrdersServiceRepos {
  readonly orders: OrdersRepository;
  readonly customers: CustomersRepository;
  readonly products: ProductsRepository;
}

// ─── The OrdersService interface ────────────────────────────

export interface OrdersService {
  // ─── Pass-throughs ───────────────────────────────────────────

  /**
   * Read a filtered list of orders. Pass-through to `OrdersRepository.listOrders`.
   * The route layer (F-08 GET /api/orders) translates query params into
   * the filter object and forwards.
   *
   * Throws: ServiceError (propagated from port).
   */
  listOrders(filter: OrderFilter): Promise<readonly Order[]>;

  /**
   * Read a single order by id. Pass-through. Returns null on miss
   * (APOSD §11 — define errors out of existence).
   *
   * The route layer (F-08 GET /api/orders/[id]) wraps null → 404.
   * The service does NOT throw NotFoundError here because most callers
   * (GET endpoints) handle not-found as normal control flow.
   *
   * Throws: ServiceError (propagated from port).
   */
  findOrderById(id: string): Promise<Order | null>;

  /**
   * Read the live KDS queue snapshot. Pass-through.
   *
   * The route layer (F-08 GET /api/kds/orders) supplies the `since`
   * cutoff (today's route uses `now - 90s` for the completed-orders
   * window). The flash window is fixed at 60s inside the port.
   *
   * Throws: ServiceError (propagated from port).
   */
  listKdsQueue(since: Date): Promise<KdsOrderQueueSnapshot>;

  // ─── Business orchestration ──────────────────────────────────

  /**
   * Create a new order on behalf of `callerUserId`. Verifies the
   * customer exists + is active, verifies every catalogued product
   * exists, then persists the order with its lines atomically.
   *
   * Orchestration:
   *   1. customers.findCustomerById(input.customerId).
   *      - null → NotFoundError("Customer not found").
   *   2. If customer.active === false → ConflictError("Customer is inactive").
   *      Today's route returns 400; F-07 normalises to 409 (the
   *      customer exists, the state collides with creating a new order).
   *   3. Extract non-null productIds from input.lines.
   *      If non-empty:
   *        products.findProductsByIds(productIds).
   *        Compute missing = requested - returned.
   *        If missing.length > 0 → ValidationError("Unknown product_id(s)",
   *          { "lines.products": ["Unknown product id: <id>", …] })
   *        — one entry per missing id (F-TD-06).
   *   4. orders.createOrder(input, callerUserId, idempotencyKey). The
   *      port handles the atomic two-step insert + rollback AND the
   *      idempotency claim/replay/race dance (see the port JSDoc).
   *      Returns the persisted Order.
   *
   * `idempotencyKey` (F-08): optional pure pass-through to the port.
   * Requests without it take literally the same code path as before.
   * The route layer reads the `Idempotency-Key` header and validates
   * its length BEFORE calling this method.
   *
   * Throws: NotFoundError | ConflictError | ValidationError | ServiceError.
   */
  placeOrder(
    input: CreateOrderInput,
    callerUserId: string,
    idempotencyKey?: string,
  ): Promise<Order>;

  /**
   * Edit an existing order. Patches the orders row (delivery date /
   * notes / order notes) and optionally replaces all lines. Enforces
   * the state×role rules that govern who may edit at each state.
   *
   * Orchestration:
   *   1. orders.findOrderById(id).
   *      - null → NotFoundError("Order not found").
   *   2. State×role gating (matches `app/api/orders/[id]/route.ts:104-113`):
   *      - state === 'completed' → ConflictError (order is finalised;
   *        a state collision, not a permission failure).
   *      - state === 'placed' AND callerRole NOT IN ROLES_EDIT_PLACED →
   *        ForbiddenError.
   *      - state === 'printed' AND callerRole NOT IN ROLES_EDIT_PRINTED →
   *        ForbiddenError.
   *   3. If lineReplacement provided: extract productIds, verify, throw
   *      ValidationError on missing — same pattern as placeOrder step 3.
   *   4. orders.updateOrder(id, patch, lineReplacement). Returns the
   *      updated Order.
   *
   * Note: `callerUserId` is currently unused by the service body — the
   * port's updateOrder does not record who edited an order (only the
   * audit log does). The parameter is on the signature for forward
   * compatibility (F-13 / F-19 may persist an `edited_by` per audit
   * row) and for symmetry with the other write methods.
   *
   * Throws: NotFoundError | ConflictError | ForbiddenError | ValidationError | ServiceError.
   */
  editOrder(
    id: string,
    patch: OrderPatch,
    lineReplacement: readonly CreateOrderLineInput[] | undefined,
    callerRole: Role,
    callerUserId: string,
  ): Promise<Order>;

  /**
   * Record a picking-list print event. Handles both first-print
   * (placed → printed) and reprint (printed → printed). Throws if
   * the order is completed (cannot reprint a completed order).
   *
   * Orchestration:
   *   1. orders.findOrderById(id).
   *      - null → NotFoundError("Order not found").
   *   2. state === 'completed' → ConflictError("Order is completed —
   *      cannot reprint a completed order"). Today's route returns 403;
   *      F-07 normalises to 409 (state collision).
   *   3. orders.recordPrint(id, callerUserId, when). The port wraps
   *      both first-print and reprint via state-branching. Returns
   *      the updated Order.
   *
   * Role gating (admin / office / warehouse only) is NOT done here —
   * it is the route's responsibility (F-08 calls
   * `requireRole(req, ['admin', 'office', 'warehouse'])` BEFORE
   * calling `printOrder`).
   *
   * `when` is the print timestamp. F-08 routes use `new Date()` at
   * the request boundary. Tests use a fixed Date for determinism.
   *
   * Throws: NotFoundError | ConflictError | ServiceError.
   */
  printOrder(id: string, callerUserId: string, when: Date): Promise<Order>;

  /**
   * Mark a single order line as done. If this tap clears the last
   * un-done line, transitions the parent order to 'completed'
   * (race-safe).
   *
   * Orchestration:
   *   1. orders.markLineDone(lineId, doneBy, when). The port handles:
   *      - line-existence check (throws NotFoundError on miss).
   *      - idempotency (returns { alreadyDone: true } if the line is
   *        already done; the parent-state guard does NOT run in the
   *        idempotent path, by design — matches the locked spec).
   *      - parent-state guard (throws ConflictError if parent state is
   *        placed or completed, in the non-idempotent path).
   *      - TOCTOU guard (.is('done_at', null) on the UPDATE).
   *      - count of remaining un-done lines, exposed as allLinesDone.
   *   2. If alreadyDone → return { alreadyDone: true, orderId,
   *      completed: false }. (The route returns 200 to the KDS device;
   *      the device displays "done".)
   *   3. If allLinesDone:
   *      try {
   *        orders.markOrderCompleted(orderId, when).
   *      } catch (err) {
   *        if (err instanceof ConflictError) {
   *          // race: another tap completed it first. Idempotent.
   *          // Return completed: true regardless.
   *        } else { throw err }
   *      }
   *      return { alreadyDone: false, orderId, completed: true }.
   *   4. Else return { alreadyDone: false, orderId, completed: false }.
   *
   * The race swallow in step 3 is the only ConflictError the service
   * catches. Every other ConflictError (from markLineDone) flows
   * through as-is. The race here is benign: two butchers tap the last
   * two lines at the same moment; both `markLineDone` return
   * allLinesDone=true; both call markOrderCompleted; the second one's
   * `.eq('state', 'printed')` optimistic lock fails because state is
   * now 'completed'; the port throws ConflictError. The order IS
   * effectively completed — telling the second caller "no it isn't"
   * would be wrong. So we swallow.
   *
   * What we do NOT swallow:
   *   - NotFoundError from `markOrderCompleted`. If the order was
   *     deleted between markLineDone and markOrderCompleted, that's
   *     a real bug; propagate.
   *   - ServiceError from `markOrderCompleted`. If the auto-complete
   *     update failed due to a DB error, the order is in an
   *     inconsistent state (lines all done, state still 'printed').
   *     Today's route swallowed this as `completion_failed: true`;
   *     F-07 surfaces the ServiceError so F-08's HOF turns it into
   *     a 500 the operator can investigate. Documented in §5 Risk #5.
   *
   * Throws: NotFoundError | ConflictError | ServiceError.
   */
  completeLineDone(
    lineId: string,
    doneBy: string,
    when: Date,
  ): Promise<{
    readonly alreadyDone: boolean;
    readonly orderId: string;
    readonly completed: boolean;
  }>;
}

// ─── The factory ────────────────────────────────────────────

export function createOrdersService(repos: OrdersServiceRepos): OrdersService {
  const { orders, customers, products } = repos;

  return {
    // ─── Pass-throughs ─────────────────────────────────────────

    listOrders: (filter) => orders.listOrders(filter),
    findOrderById: (id) => orders.findOrderById(id),
    listKdsQueue: (since) => orders.listKdsQueue(since),

    // ─── placeOrder ────────────────────────────────────────────

    async placeOrder(input, callerUserId, idempotencyKey) {
      const customer = await customers.findCustomerById(input.customerId);
      if (customer === null) {
        throw new NotFoundError("Customer not found");
      }
      if (customer.active === false) {
        throw new ConflictError("Customer is inactive");
      }

      const productIds = input.lines
        .map((l) => l.productId)
        .filter((id): id is string => id !== null);
      if (productIds.length > 0) {
        const found = await products.findProductsByIds(productIds);
        const foundSet = new Set(found.map((p) => p.id));
        const missing = productIds.filter((id) => !foundSet.has(id));
        if (missing.length > 0) {
          // F-TD-06: one entry per missing id so clients can render
          // each unknown product separately.
          throw new ValidationError("Unknown product_id(s)", {
            "lines.products": missing.map((id) => `Unknown product id: ${id}`),
          });
        }
      }

      return orders.createOrder(input, callerUserId, idempotencyKey);
    },

    // ─── editOrder ─────────────────────────────────────────────

    async editOrder(id, patch, lineReplacement, callerRole, _callerUserId) {
      const order = await orders.findOrderById(id);
      if (order === null) {
        throw new NotFoundError("Order not found");
      }

      if (order.state === "completed") {
        throw new ConflictError("Order is completed and cannot be edited");
      }
      if (order.state === "placed" && !ROLES_EDIT_PLACED.includes(callerRole)) {
        throw new ForbiddenError(
          "You do not have permission to edit this order",
        );
      }
      if (
        order.state === "printed" &&
        !ROLES_EDIT_PRINTED.includes(callerRole)
      ) {
        throw new ForbiddenError(
          "This order is locked. Only office can amend it after printing.",
        );
      }

      if (lineReplacement !== undefined) {
        const productIds = lineReplacement
          .map((l) => l.productId)
          .filter((id): id is string => id !== null);
        if (productIds.length > 0) {
          const found = await products.findProductsByIds(productIds);
          const foundSet = new Set(found.map((p) => p.id));
          const missing = productIds.filter((id) => !foundSet.has(id));
          if (missing.length > 0) {
            // F-TD-06: one entry per missing id (see placeOrder).
            throw new ValidationError("Unknown product_id(s)", {
              "lines.products": missing.map(
                (id) => `Unknown product id: ${id}`,
              ),
            });
          }
        }
      }

      return orders.updateOrder(id, patch, lineReplacement);
    },

    // ─── printOrder ────────────────────────────────────────────

    async printOrder(id, callerUserId, when) {
      const order = await orders.findOrderById(id);
      if (order === null) {
        throw new NotFoundError("Order not found");
      }
      if (order.state === "completed") {
        throw new ConflictError(
          "Order is completed — cannot reprint a completed order",
        );
      }
      return orders.recordPrint(id, callerUserId, when);
    },

    // ─── completeLineDone ──────────────────────────────────────

    async completeLineDone(lineId, doneBy, when) {
      const result = await orders.markLineDone(lineId, doneBy, when);
      if (result.alreadyDone) {
        return {
          alreadyDone: true,
          orderId: result.orderId,
          completed: false,
        };
      }
      if (result.allLinesDone) {
        try {
          await orders.markOrderCompleted(result.orderId, when);
        } catch (err) {
          if (err instanceof ConflictError) {
            // Race: another concurrent tap completed the order between
            // our markLineDone and our markOrderCompleted. The order
            // IS completed; report it as such.
          } else {
            throw err;
          }
        }
        return {
          alreadyDone: false,
          orderId: result.orderId,
          completed: true,
        };
      }
      return {
        alreadyDone: false,
        orderId: result.orderId,
        completed: false,
      };
    },
  };
}
