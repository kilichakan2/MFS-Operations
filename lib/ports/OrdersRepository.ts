/**
 * lib/ports/OrdersRepository.ts
 *
 * The Orders port. This is the interface the Orders service (F-07)
 * depends on. The Supabase implementation arrives in F-06
 * (`lib/adapters/supabase/OrdersRepository.ts`); a `FakeInMemoryOrdersRepository`
 * (also F-06) lets service-layer unit tests run without a DB.
 *
 * ADR-0002 contract this port honours:
 *   - Line 17: "A port is an interface that the app owns, defined in
 *     terms of business operations." Every method below is a business
 *     operation, not a vendor call.
 *   - Line 19: "Ports live in lib/ports/." Yes.
 *   - Line 21: "Vendor SDK imports are permitted inside lib/adapters/**
 *     and nowhere else." This file imports zero vendor SDKs.
 *   - Line 25 (depth rule): "Every port method must hide at least one
 *     non-trivial decision — a join, a filter set, a rollback, a
 *     mapping, a guard." Each method's JSDoc names what it hides.
 *   - Line 27: "Vendor types never cross the port boundary." Every
 *     method below takes/returns only domain types from `lib/domain/`.
 *
 * Method identity convention (locked at Gate 1):
 *   Methods take primitive `string` IDs for the actor (`createdBy`,
 *   `printedBy`, `doneBy`), NOT the `Caller` object. The `Caller`
 *   bundle (`lib/observability/Caller.ts`) is a request-scoped
 *   identity + correlation bundle that lives at the route/service
 *   boundary. Ports are pure of framework coupling — they have no
 *   notion of a request, no notion of a correlation id, no notion of
 *   a role. The service layer (F-07) bridges:
 *     ordersRepo.createOrder(input, caller.userId)
 *   This keeps the port testable with primitive arguments and avoids
 *   coupling F-13's eventual Caller move into `lib/domain/` to F-06's
 *   adapter shape.
 *
 * Error contract (locked at Gate 1):
 *   Read methods return `Promise<X | null>` / `Promise<X[]>` on miss.
 *   They NEVER throw NotFoundError on a not-found read — that is
 *   APOSD § "define errors out of existence" (principle 11) applied
 *   verbatim. Write methods throw typed errors from `lib/errors/`:
 *     - NotFoundError (404) if the target id does not exist.
 *     - ConflictError (409) if a state-transition guard rejects.
 *     - ServiceError (500) for unexpected DB / adapter failure.
 *   Write methods do NOT throw ValidationError — input validation is
 *   the service's job. They do NOT throw UnauthorizedError or
 *   ForbiddenError — auth lives at the route/service boundary.
 */

import type {
  Order,
  CreateOrderInput,
  CreateOrderLineInput,
  OrderFilter,
  OrderPatch,
} from "@/lib/domain";

// ─── KDS queue composite shape ──────────────────────────────

/**
 * Single audit-log "flash" event surfaced by `listKdsQueue`. Maps to
 * one row in `order_audit_log` filtered to the actions that the KDS
 * UI flashes orange for: `edited`, `line_edited`, `reprinted`,
 * `line_added`. See `app/api/kds/orders/route.ts:71`.
 *
 * Why this is a small domain shape rather than the full
 * `OrderAuditLogRow`: the KDS only needs three fields to render the
 * flash. The full audit row (with payload, full action enum) is a
 * Compliance/F-19 concern, not a KDS concern.
 */
export interface KdsFlashEvent {
  readonly orderId: string;
  readonly action: "edited" | "line_edited" | "reprinted" | "line_added";
  readonly createdAt: string;
}

/**
 * Composite snapshot returned by `OrdersRepository.listKdsQueue`. The
 * KDS frontend renders all three fields atomically — fetching orders
 * + flashes in two round-trips guarantees neither a flash for a
 * not-yet-loaded order nor a stale flash for an order whose state
 * has just changed.
 *
 * `serverTime` is captured by the adapter at the moment the snapshot
 * is taken. The frontend uses it as the reference clock for the
 * 60-second flash window and the 90-second "just completed" fade-out
 * (`app/api/kds/orders/route.ts:30, 36`).
 */
export interface KdsOrderQueueSnapshot {
  readonly orders: readonly Order[];
  readonly recentFlashes: readonly KdsFlashEvent[];
  /** ISO timestamp captured at snapshot time. */
  readonly serverTime: string;
}

// ─── The port ────────────────────────────────────────────────

export interface OrdersRepository {
  /**
   * Read a filtered list of orders.
   *
   * What this hides:
   *   - The four-axis filter set (state, deliveryDate, customerId,
   *     createdBy) translates to four optional `.eq()` clauses on the
   *     adapter side. Callers do not write those clauses.
   *   - The multi-table embed (orders + customer + creator + lines)
   *     is resolved server-side in one round-trip via the existing
   *     PostgREST embed syntax. Callers see a flat `Order[]` with
   *     embedded sub-shapes.
   *   - The default sort (`delivery_date ASC, created_at ASC`) and
   *     the limit clamp (`min(200, max(1, limit ?? 50))`) are adapter
   *     responsibilities.
   *
   * Design-it-twice:
   *   (A) Single method with `OrderFilter` (this).
   *   (B) Named methods per filter axis: `listOrdersByState`,
   *       `listOrdersByDeliveryDate`, etc.
   *   Chosen (A). (B) explodes to 2^4 combinations or forces callers
   *   to do their own intersection — both lose on the depth rule.
   *
   * @returns The matched orders. Empty array on no match (never null,
   *   never throws on empty). APOSD § "define errors out of existence".
   * @throws  ServiceError if the underlying DB call fails.
   */
  listOrders(filter: OrderFilter): Promise<readonly Order[]>;

  /**
   * Read a single order by id.
   *
   * What this hides:
   *   - Same multi-table embed as `listOrders` (customer + creator +
   *     printer + lines).
   *   - The `.single()` semantics on the underlying client (returns
   *     domain `null` on no row).
   *
   * Design-it-twice:
   *   (A) Returns `Order | null` on miss (this).
   *   (B) Throws NotFoundError on miss.
   *   Chosen (A). APOSD principle 11 — defines the error out of
   *   existence. Most callers (GET /api/orders/[id], the picking-list
   *   loader, the edit page loader) handle the not-found case as
   *   normal control flow (returning a 404 response), not as an
   *   exception. (B) would force every caller into try/catch.
   *
   * @returns The order if found; `null` if no row matches `id`.
   * @throws  ServiceError if the underlying DB call fails. Does NOT
   *   throw NotFoundError on missing row — null is the documented
   *   not-found signal.
   */
  findOrderById(id: string): Promise<Order | null>;

  /**
   * Create a new order with its lines atomically.
   *
   * What this hides:
   *   - The two-step insert (orders row first to get the generated id,
   *     then `order_lines` rows referencing it).
   *   - The rollback: if line insertion fails, the orders row that
   *     was just created is deleted before the error is thrown. The
   *     caller never sees a half-created order. Today's route does
   *     this manually at `app/api/orders/route.ts:177-183`; the port
   *     contract guarantees it.
   *   - The reference generation (`MFS-YYYY-NNNN`) is a DB trigger
   *     concern; the returned `Order.reference` reflects what the DB
   *     allocated.
   *
   * Customer-existence and product-existence verification are NOT
   * the port's responsibility — those checks live in
   * `OrdersService.createOrder` (F-07), which queries
   * `CustomersRepository` and `ProductsRepository` BEFORE calling
   * this method. The port assumes a valid input and either persists
   * or throws `ServiceError`. (Gate 1 Q2.5 — locked.)
   *
   * Design-it-twice:
   *   (A) One atomic create method (this).
   *   (B) Two methods: `createOrderRow` + `appendOrderLines`, with
   *       the caller orchestrating the rollback.
   *   Chosen (A). (B) duplicates the rollback logic in every caller
   *   and exposes the two-step internal — the depth rule says hide
   *   it.
   *
   * Idempotency contract (F-08 — claim/replay/race):
   *   When `idempotencyKey` is provided, the adapter guarantees
   *   "one key = at most one order", durable across retries and
   *   concurrent duplicates:
   *     - CLAIM: the first successful create records the key against
   *       the created order (24h TTL at the storage layer; the Fake
   *       does not model TTL).
   *     - REPLAY: a later call with the same live key by the SAME
   *       caller creates nothing and returns the original order. If
   *       the original order has meanwhile been deleted (or the key
   *       expired), the stale key is reclaimed and a fresh order is
   *       created.
   *     - CROSS-USER: a live key recorded by a DIFFERENT caller
   *       throws ConflictError("Idempotency-Key already used") and
   *       never reveals the other user's order.
   *     - RACE: two concurrent creates with the same key both briefly
   *       create an order; the storage-level uniqueness on the key is
   *       the arbiter. The loser deletes its own order and returns
   *       the winner's, so both calls resolve to the same order id
   *       and exactly one order survives.
   *   When `idempotencyKey` is absent, the code path is identical to
   *   the pre-F-08 behaviour: every call creates a new order.
   *
   * @param input           The validated order shape.
   * @param createdBy       User id of the creator. The service layer
   *                        passes `caller.userId`.
   * @param idempotencyKey  Optional client-supplied dedupe fingerprint
   *                        (1–200 chars; length is validated at the
   *                        route boundary, uniqueness at the adapter).
   * @returns The persisted Order with its generated id, reference,
   *   created_at, and the inserted lines (read back from the DB so
   *   the caller sees the assigned line numbers). On replay/race,
   *   the ORIGINAL (winner's) order.
   * @throws ConflictError if `idempotencyKey` is live and owned by a
   *   different caller.
   * @throws ServiceError if the order or any line insertion fails
   *   (rollback already attempted by the adapter).
   */
  createOrder(
    input: CreateOrderInput,
    createdBy: string,
    idempotencyKey?: string,
  ): Promise<Order>;

  /**
   * Update an existing order — orders-row patch plus optional full
   * line-replacement.
   *
   * What this hides:
   *   - If `patch` is empty and `lineReplacement` is undefined: no-op,
   *     returns the current Order.
   *   - If `patch` has fields: apply via `.update(patch).eq('id', id)`.
   *   - If `lineReplacement` is provided: delete all existing
   *     `order_lines` rows for this order, then insert the new ones.
   *     The two operations happen within the same adapter call so
   *     they appear atomic to outside readers (today's route at
   *     `app/api/orders/[id]/route.ts:148-175` does the same
   *     two-step but exposes it; the port hides it).
   *
   * State-permission gating (placed → sales/office allowed; printed
   * → office only; completed → 403) is NOT the port's responsibility
   * — that is role-shaped and lives at the route/service boundary.
   * The port does check that the order EXISTS (`NotFoundError`) and
   * that the DB CHECK constraint accepts the patch (`ConflictError`
   * if not — e.g. attempting to edit a completed order at the DB
   * level should rarely happen if the service did its job, but the
   * port surfaces it as Conflict for safety).
   *
   * Design-it-twice:
   *   (A) One method with optional `lineReplacement` (this).
   *   (B) Two methods: `patchOrder` + `replaceOrderLines`.
   *   Chosen (A) per the pre-grilled pick. The two operations are
   *   most naturally atomic-ish for the caller (an edit is one user
   *   action), and splitting them would mean the caller has to
   *   choose the right order and handle partial-success. (A) is
   *   deeper.
   *
   * @param id               The order id to patch.
   * @param patch            Field-level patch (`undefined` means
   *                         "leave field alone"; `null` means "set to
   *                         NULL"; a value means "set to value").
   * @param lineReplacement  If provided, the new full set of lines.
   *                         All existing lines are deleted and replaced.
   *                         Pass `undefined` to leave lines alone.
   * @returns The updated Order with the latest line numbers.
   * @throws NotFoundError if `id` does not exist.
   * @throws ConflictError if the DB CHECK constraint rejects (e.g.
   *   line replacement on a `completed` order).
   * @throws ServiceError on any other DB failure.
   */
  updateOrder(
    id: string,
    patch: OrderPatch,
    lineReplacement?: readonly CreateOrderLineInput[],
  ): Promise<Order>;

  /**
   * Record a picking-list print event. Handles both the first-print
   * transition (placed → printed) and a reprint (printed → printed,
   * with a new `printedAt`).
   *
   * What this hides:
   *   - The state-branching: the method internally inspects the
   *     current state and applies the right SQL.
   *     - From `placed`: update `state` to `printed`, set `printedAt`
   *       and `printedBy`, with an optimistic-lock guard
   *       `.eq('state', 'placed')` so a concurrent transition does
   *       not double-fire.
   *     - From `printed`: bump `printedAt` and `printedBy`, no state
   *       change. The DB audit trigger emits a `reprinted` log row.
   *     - From `completed`: throw `ConflictError` — cannot reprint
   *       a completed order (today's route surfaces this at
   *       `app/api/orders/[id]/picking-list/route.ts:195-196`; the
   *       port surfaces the same as Conflict).
   *
   * Design-it-twice:
   *   (A) One method that internally branches (this).
   *   (B) Two methods: `markFirstPrint` + `markReprint`, with the
   *       caller picking based on state.
   *   Chosen (A) per the pre-grilled pick. The caller's state-machine
   *   knowledge is the thing the port is supposed to hide — exposing
   *   two methods recreates it at every call site. (A) is deeper.
   *
   * @param id          The order id to record the print for.
   * @param printedBy   User id of the office staff doing the print.
   * @param when        The print time. Adapters use ISO-string at
   *                    the storage layer; passing a `Date` here keeps
   *                    callers honest about timezones.
   * @returns The updated Order reflecting the new `printedAt` /
   *   `printedBy` and (if first print) `state='printed'`.
   * @throws NotFoundError if `id` does not exist.
   * @throws ConflictError if current state is `completed`.
   * @throws ServiceError on DB failure.
   */
  recordPrint(id: string, printedBy: string, when: Date): Promise<Order>;

  /**
   * Mark a single order line as done.
   *
   * What this hides:
   *   - The idempotency check: if the line is already `done_at != null`,
   *     return `{ alreadyDone: true, orderId, allLinesDone: <bool> }`
   *     without writing. Today's route handles this manually at
   *     `app/api/kds/lines/[lineId]/done/route.ts:92-94`; the port
   *     contract guarantees it. A second tap from a butcher (or a
   *     network retry) is not an error.
   *   - The TOCTOU guard: the update statement guards on
   *     `.is('done_at', null)` so two concurrent taps from two
   *     butchers cannot both succeed (today at
   *     `app/api/kds/lines/[lineId]/done/route.ts:124`).
   *   - The remaining-lines count: after marking the line, query the
   *     count of `done_at IS NULL` lines for the parent order
   *     (today's route does this via `count: 'exact', head: true` at
   *     `app/api/kds/lines/[lineId]/done/route.ts:142-146`; the
   *     adapter does the same, surfaced as the `allLinesDone` flag).
   *   - The parent order id lookup: the line row carries `order_id`;
   *     the adapter reads it; the method returns it so the caller
   *     does not need a second round-trip to know which order to
   *     auto-complete.
   *
   * What this DOES NOT hide:
   *   - The auto-complete state transition itself is a separate
   *     method (`markOrderCompleted`). The caller (a use-case in
   *     `lib/usecases/` or the F-07 service) calls
   *     `markLineDone` first, then conditionally `markOrderCompleted`
   *     based on the `allLinesDone` flag. Pre-grilled pick (A) chose
   *     this split so that mark-line-done and order-completion are
   *     two clean concerns rather than one mega-method.
   *
   * Design-it-twice (reaffirms pre-grilled pick):
   *   (A) Returns `{ alreadyDone, orderId, allLinesDone }`; caller
   *       composes (this).
   *   (B) `markLineDoneAndCompleteIfReady` auto-completes internally.
   *   Chosen (A). (B) puts two state transitions inside one method
   *   (per-line + per-order), which is the kind of compound effect
   *   the depth rule encourages but APOSD § "modules should be small
   *   and deep" cautions against when the two operations are
   *   logically distinct. The use-case is the right composition
   *   point.
   *
   * Parent-order state guard:
   *   The port checks that the parent order is in state `printed`
   *   before marking the line. If the parent is `placed` (not yet
   *   printed) or `completed`, throw `ConflictError`. This mirrors
   *   today's route logic at `app/api/kds/lines/[lineId]/done/
   *   route.ts:108-116`.
   *
   * @param lineId  The order_lines row id to mark done.
   * @param doneBy  User id of the butcher.
   * @param when    The done time.
   * @returns       `{ alreadyDone: true, orderId, allLinesDone:
   *                   <still-applies-from-prior-state> }` if the
   *                   line was already done; `{ alreadyDone: false,
   *                   orderId, allLinesDone: <true if this tap was
   *                   the last remaining line> }` otherwise.
   * @throws NotFoundError if `lineId` does not exist.
   * @throws ConflictError if the parent order is `placed` or
   *   `completed` (line cannot be marked done in those states).
   * @throws ServiceError on DB failure.
   */
  markLineDone(
    lineId: string,
    doneBy: string,
    when: Date,
  ): Promise<{
    readonly alreadyDone: boolean;
    readonly orderId: string;
    readonly allLinesDone: boolean;
  }>;

  /**
   * Transition an order to `completed`.
   *
   * What this hides:
   *   - The optimistic-lock guard: the update statement requires
   *     `.eq('state', 'printed')`, so an attempt to complete an order
   *     that is not in `printed` state is rejected at the DB level
   *     and surfaced as `ConflictError`. (Today's route does this at
   *     `app/api/kds/lines/[lineId]/done/route.ts:159`.)
   *   - The `completedAt` timestamp write.
   *
   * Composition note:
   *   This method is typically called by the use-case after
   *   `markLineDone` returns `allLinesDone: true`. Calling it when
   *   `allLinesDone` is false will succeed at the DB level but is a
   *   logic bug at the use-case layer — the port does not enforce a
   *   "lines must be done" precondition (the DB schema does not
   *   require it).
   *
   * Design-it-twice:
   *   (A) Separate method (this), composed by the use-case.
   *   (B) Inline this transition inside `markLineDone` when
   *       `allLinesDone` becomes true.
   *   Chosen (A) per the pre-grilled pick for `markLineDone`. The
   *   complement of that decision is having `markOrderCompleted` as
   *   its own port method, callable directly if a future path
   *   (admin override?) needs to force-complete.
   *
   * @param id    The order id to mark completed.
   * @param when  The completion time.
   * @returns     The updated Order with `state='completed'` and
   *              `completedAt` set.
   * @throws NotFoundError if `id` does not exist.
   * @throws ConflictError if current state is not `printed`.
   * @throws ServiceError on DB failure.
   */
  markOrderCompleted(id: string, when: Date): Promise<Order>;

  /**
   * Undo a single order line that was marked done — and, if that line
   * belonged to a `completed` order, atomically re-open the order.
   *
   * The mirror of `markLineDone`, with one crucial asymmetry: where
   * mark-done splits the per-line tick and the per-order completion
   * into two methods (two distinct actors/moments, a benign race to
   * swallow), undo FOLDS the cascade into this single method because
   * the two effects are one atomic operation. A half-done undo — line
   * pending but parent still `completed` — is a state the DB CHECK
   * constraint (orders: `completed` ⇒ `completed_at IS NOT NULL`)
   * actively forbids and no reader may observe. See the plan §6.1
   * "design it twice": alternative (B) = split into
   * `markLineUndone` + `revertOrderToPrinted`, rejected because it
   * exposes that illegal intermediate and forces the caller to
   * re-assemble the cascade rule the port should hide (depth rule,
   * ADR-0002 line 25).
   *
   * What this hides:
   *   - The parent-state read that decides plain-undo vs cascade.
   *   - The cascade UPDATE: line `done_at`/`done_by` → NULL AND, iff
   *     the parent is `completed`, order `state → 'printed'` +
   *     `completed_at → NULL`, done atomically (one DB function call
   *     in the Supabase adapter) so no illegal intermediate is
   *     observable.
   *   - The TOCTOU guards (mirror of `markLineDone`'s `.is('done_at',
   *     null)`): the line UPDATE guards `.not('done_at','is',null)`
   *     and the order revert guards `.eq('state','completed')`, so two
   *     simultaneous undos cannot both win and a concurrent re-complete
   *     cannot corrupt state.
   *   - The audit row: the `order_lines` UPDATE fires the DB audit
   *     trigger, which (post-F-PROD-02) emits `line_undone` on the
   *     reverse `done_at` transition. The adapter writes NO manual
   *     audit row — consistent with every other order event.
   *
   * Idempotency contract:
   *   If the line is already pending (`done_at IS NULL`), return
   *   `{ alreadyPending: true, orderId, orderReopened: false }` WITHOUT
   *   writing — mirrors `markLineDone`'s `alreadyDone` no-op so a
   *   double-confirm / network retry is not an error.
   *
   * Parent-state handling:
   *   - `printed`   → plain line revert, `orderReopened: false`.
   *   - `completed` → cascade revert, `orderReopened: true`. This is
   *     the DELIBERATE exception to the `markLineDone` /
   *     `markOrderCompleted` `completed`-guard: undo is the one path
   *     allowed to re-open a completed order. It does NOT throw
   *     `ConflictError` here.
   *   - `placed`    → cannot occur (a done line cannot exist on an
   *     unprinted order). If somehow encountered, the not-done line is
   *     treated as `alreadyPending` and NEVER cascades a placed order.
   *
   * No `undoneBy` parameter. Audit attribution is NULL-user (KDS runs
   * service-role) and the audit row is written by the DB trigger, not
   * the adapter — so the port takes no actor id. This is symmetric to
   * `markLineDone` taking `doneBy` ONLY because it writes `done_by` to
   * the column; undo CLEARS `done_by`, so there is no id to record.
   * (Real attribution is deferred to BACKLOG F-RLS-04a-kds.)
   *
   * @param lineId  The order_lines row id to revert.
   * @param when    The undo time. Passed for symmetry / determinism;
   *                undo clears timestamps rather than writing `when` to
   *                a column, but adapters may use it for any audit
   *                metadata.
   * @returns `{ alreadyPending, orderId, orderReopened }` —
   *   `alreadyPending` true iff the line was already not-done (no
   *   write); `orderReopened` true iff a `completed` parent was
   *   reverted to `printed`.
   * @throws NotFoundError if `lineId` does not exist.
   * @throws ServiceError on DB failure. Does NOT throw `ConflictError`
   *   for the `completed` parent (that is the allowed cascade path);
   *   no `ForbiddenError`/role logic (route/use-case concern).
   */
  markLineUndone(
    lineId: string,
    when: Date,
  ): Promise<{
    readonly alreadyPending: boolean;
    readonly orderId: string;
    readonly orderReopened: boolean;
  }>;

  /**
   * Read the live KDS queue snapshot.
   *
   * What this hides:
   *   - The disjunctive filter: returns orders where `state='printed'`
   *     OR (`state='completed' AND completedAt >= since`). Today's
   *     route encodes this in a PostgREST `.or()` call at
   *     `app/api/kds/orders/route.ts:50`; the adapter hides it.
   *   - The recent-flash join: after fetching the orders, the adapter
   *     queries `order_audit_log` for rows with `action IN ('edited',
   *     'line_edited', 'reprinted', 'line_added')` and `created_at >=
   *     <60 seconds ago>` matching one of the returned order ids.
   *     The KDS UI uses these to flash cards orange for 60s. Today's
   *     route does this manually at `app/api/kds/orders/route.ts:67-79`;
   *     the adapter wraps it.
   *   - The default sort (`delivery_date ASC, printed_at ASC`) and
   *     the limit (100 orders) are adapter responsibilities.
   *
   * Design-it-twice:
   *   (A) Single composite method returning `KdsOrderQueueSnapshot`
   *       (this).
   *   (B) Two methods: `listPrintedOrCompletedSince(since)` returning
   *       `Order[]`, and `listRecentAuditFlashes(orderIds, since)`
   *       returning `KdsFlashEvent[]`, with the use-case composing.
   *   Chosen (A). The two reads always run together on the KDS page;
   *   splitting them forces the caller to do the composition with no
   *   business value (and risks two round-trips when one would
   *   suffice — the adapter can pipeline them). The composite shape
   *   is a *snapshot* — taking the orders and flashes against the
   *   same clock matters for UI consistency.
   *
   * **Note on the audit-log dependency.** This method reads from the
   * `order_audit_log` table, which is conceptually a Compliance / F-19
   * concern, not a pure Orders concern. Two architectural choices
   * were considered:
   *   (i)  This method on `OrdersRepository` (this) — accepting that
   *        the Orders adapter touches one table outside the strict
   *        Orders bounded context.
   *   (ii) A separate `OrdersAuditRepository` port + adapter, with
   *        the use-case composing two ports.
   *   Chosen (i). Rationale: the `order_audit_log` table is named
   *   for orders and exists only for order events; it has no
   *   independent business meaning outside the orders bounded
   *   context. Treating it as a sibling concern adds a port-and-
   *   adapter overhead for a one-method read that no other domain
   *   uses. Flag for F-19 review: if HACCP or Admin ever needs to
   *   query the audit log for non-order purposes, revisit.
   *
   * @param since  The earliest `completedAt` to include for completed
   *               orders. Today's route uses `now - 90 seconds` for
   *               the queue fetch and `now - 60 seconds` for the
   *               flash lookback (`app/api/kds/orders/route.ts:30,
   *               36`); the adapter applies both windows internally
   *               relative to its own `Date.now()` snapshot. The
   *               `since` parameter sets the queue's completed-orders
   *               window; the flash window is fixed at 60 seconds
   *               (matching today's behaviour).
   * @returns The snapshot — orders + recent flashes + the server time
   *   the snapshot was taken at.
   * @throws ServiceError on DB failure.
   */
  listKdsQueue(since: Date): Promise<KdsOrderQueueSnapshot>;

  /**
   * Purge expired idempotency-key rows from the ledger.
   *
   * What this hides:
   *   - The single DELETE on `order_idempotency_keys` filtered to rows
   *     whose `expires_at` is at or before `now`. Callers (the daily
   *     purge cron) never write the table name or the predicate.
   *   - The vendor's "rows affected" count extraction; the method
   *     returns a plain `number` of rows deleted.
   *
   * Hygiene-only: TTL is already enforced at read time and reclaimed
   * opportunistically on key reuse (createOrder step 0). This sweeps the
   * rows whose key is never reused so the table cannot grow unbounded.
   *
   * @param now  The cutoff. Rows with `expires_at <= now` are deleted.
   *             Passed in (not `now()` inside) so tests are deterministic.
   * @returns The number of rows deleted (>= 0).
   * @throws  ServiceError on DB failure.
   */
  purgeExpiredIdempotencyKeys(now: Date): Promise<number>;
}
