/**
 * lib/domain/Order.ts
 *
 * Domain types for the Orders bounded context. These types describe the
 * shape of an order as the app business logic sees it — never the
 * shape any vendor row arrives in. The mapping from a Supabase row
 * (or whatever future adapter wraps) into these shapes lives inside
 * the corresponding adapter file (F-06+), never in business code.
 *
 * ADR-0002 § "Vendor types never cross the port boundary" (line 27)
 * is the reason this file exists. Every field below is plain
 * TypeScript; there is no PostgrestResponse-shaped wrapper, no
 * `Database['public']['Tables']['orders']['Row']` import, no nullable-
 * default-undefined Postgres weirdness. Just the domain.
 *
 * The Orders ports in `lib/ports/` consume only these types. The 5
 * Orders routes (today calling Supabase directly) will be rewritten
 * in F-08 to call OrdersService — which depends on the ports — which
 * depend on these types. The mapping cascades inward; the vendor
 * stops at the adapter.
 *
 * Forward-looking deprecation notes:
 *   - `lib/orders/types.ts` (the existing OrderRow / OrderLineRow /
 *     OrderState / OrderUom file) is retained today because the 5
 *     Orders routes still import from it. F-08 will retire those
 *     imports route by route. When the last route stops importing
 *     from `lib/orders/types.ts`, that file's `OrderRow` /
 *     `OrderLineRow` definitions can be deleted (the `OrderState` /
 *     `OrderUom` literal-set declarations are duplicated below — same
 *     string values, just owned by the domain layer instead of the
 *     route layer). Until then, two definitions co-exist; the domain
 *     definition below is canonical.
 */

// ─── State machine ────────────────────────────────────────────

/**
 * Forward-only state machine for an Order. Three states; two
 * transitions; no backtracking.
 *
 * What this hides from callers: nothing — it is a literal union. The
 * point of declaring it as a domain type rather than scattering string
 * literals through the codebase is to make state-machine queries
 * (`if (order.state === 'placed') ...`) compiler-checked against typos.
 *
 * The transition table is enforced at two layers:
 *   1. Database CHECK constraints on the `orders` row (out of F-05
 *      scope — predates the migration).
 *   2. `OrdersRepository.recordPrint` / `markOrderCompleted` apply
 *      optimistic-lock guards (see those methods' JSDoc).
 *
 * Mirrors `lib/orders/types.ts:15`. Re-declared rather than re-exported
 * because importing from `lib/orders/types.ts` from this file would
 * create a reverse dependency F-08 would have to unwind.
 */
export type OrderState = "placed" | "printed" | "completed";

/**
 * Per-line unit of measure on an order. Distinct from products.box_size
 * (which is a pack-size like "10 kg" — a string, not an enum). UOM is
 * the unit the *quantity* on the line is denominated in.
 *
 * Two literal values today: 'kg' for weighed items, 'unit' for whole
 * pieces. Mirrors `lib/orders/types.ts:18` verbatim — re-declared (not
 * re-exported) to keep the domain layer independent of the
 * soon-to-be-retired `lib/orders/types.ts`.
 */
export type OrderUom = "kg" | "unit";

// ─── Aggregate root ──────────────────────────────────────────

/**
 * A single order line.
 *
 * Exactly one of `productId` or `adHocDescription` is populated; never
 * both, never neither. The DB enforces this with a CHECK constraint;
 * the port contract documents it so the service layer can trust it
 * after a `findOrderById` / `listOrders` return.
 *
 * Why fields are `readonly`: domain values are passed around by
 * value-shape. Code that "edits" an order line constructs a new one
 * — there is no mutate-in-place path. This matches APOSD § "deep
 * immutability" (sect. 4) — surface area for accidental mutation is
 * driven to zero. The same convention used by `Caller`
 * (`lib/observability/Caller.ts:70-74`).
 *
 * Design-it-twice for the productId XOR adHocDescription shape:
 *   (A) Two optional fields with a documented invariant (this).
 *   (B) A discriminated union:
 *         type OrderLineItem =
 *           | { kind: 'catalogue'; productId: string }
 *           | { kind: 'adHoc';     description: string }
 *       with the rest of the line fields siblings.
 *   Chosen: (A). Rationale: the DB schema is two columns, the picking-
 *   list renderer already treats them as two optional fields with a
 *   fallback ("(unknown product)" — `app/api/orders/[id]/picking-list/
 *   route.ts:120`), and the discriminated union forces every consumer
 *   to write a switch — even those that just want to read the
 *   description for display. (B) is *deeper* in the APOSD sense
 *   (impossible states made unrepresentable) but introduces meaningful
 *   ceremony at every read site; for a two-field XOR, the cost outweighs
 *   the safety gain. Re-evaluate at F-15 if a new product-kind appears.
 */
export interface OrderLine {
  readonly id: string;
  readonly orderId: string;
  readonly lineNumber: number;
  readonly productId: string | null;
  readonly adHocDescription: string | null;
  readonly quantity: number;
  readonly uom: OrderUom;
  readonly notes: string | null;
  /** ISO timestamp when the line was marked done; null until then. */
  readonly doneAt: string | null;
  /** User id of the butcher who marked the line done; null until done. */
  readonly doneBy: string | null;
}

/**
 * The Orders aggregate root.
 *
 * Carries enough denormalised data that the typical reader (a list
 * view, a detail page, a picking-list renderer) gets the joins
 * pre-resolved without a second round-trip. The deep decision hidden
 * here is *which joins to inline*: customer, creator, lines. Audit
 * log is NOT inlined (it is a separate concern, queried only by the
 * KDS queue snapshot — see `listKdsQueue`).
 *
 * Why `customer` is a small embedded object rather than a join id +
 * lookup: every existing read path (`app/api/orders/route.ts:55`,
 * `app/api/orders/[id]/route.ts:53`, `app/api/orders/[id]/picking-list/
 * route.ts:67`, `app/api/kds/orders/route.ts:43`) already requests
 * customer.{id, name, postcode} embedded. Mirroring that at the
 * domain level keeps callers from doing a second N+1 lookup.
 *
 * Why `creator` and `printer` are optional embedded objects: the route
 * GET endpoints today inline `creator:created_by(id, name)` and
 * `printer:printed_by(id, name)`. The picking-list endpoint additionally
 * resolves the printer's name. Carrying these on the domain shape
 * preserves the existing read ergonomics without forcing the service
 * layer to do a per-order user lookup.
 *
 * Why ISO strings for timestamps: ADR-0002 line 27 forbids vendor
 * shape on the port. JavaScript `Date` is *not* vendor — but using
 * ISO strings everywhere matches how the routes currently serialise
 * to JSON (`createdAt.slice(0, 10)` at `pickingList/route.ts:108`,
 * `Date.now().toISOString()` at `kds/lines/.../route.ts:119`) and
 * avoids the "is this UTC or local?" Date-object trap. Adapters
 * convert from Postgres timestamps to ISO strings; service code
 * receives ISO strings; UI parses with `new Date(iso)`.
 */
export interface Order {
  readonly id: string;
  /** MFS-YYYY-NNNN reference, e.g. "MFS-2026-0001". */
  readonly reference: string;
  readonly customerId: string;
  /** YYYY-MM-DD, customer's requested delivery date. */
  readonly deliveryDate: string;
  readonly deliveryNotes: string | null;
  readonly orderNotes: string | null;
  readonly state: OrderState;
  readonly createdBy: string;
  /** ISO timestamp. */
  readonly createdAt: string;
  readonly printedBy: string | null;
  readonly printedAt: string | null;
  readonly completedAt: string | null;
  /** Embedded customer projection — minimal shape for list/detail rendering. */
  readonly customer: {
    readonly id: string;
    readonly name: string;
    readonly postcode: string | null;
  } | null;
  /** Embedded creator user projection — name only, for read views. */
  readonly creator: { readonly id: string; readonly name: string } | null;
  /** Embedded printer user projection — populated once the order has been printed. */
  readonly printer: { readonly id: string; readonly name: string } | null;
  /** All lines on the order, ordered by lineNumber. */
  readonly lines: readonly OrderLine[];
}

// ─── Query / filter shapes ───────────────────────────────────

/**
 * Filter shape for `OrdersRepository.listOrders`.
 *
 * Why an object with optional fields rather than a positional argument
 * list: the existing route at `app/api/orders/route.ts:43-49` accepts
 * 4 filter axes (state, deliveryDate, customerId, createdBy) plus a
 * limit. Adding a fifth axis later (e.g. a date range) is a non-breaking
 * additive change with the object shape. With positional arguments the
 * port signature would churn every time a UI filter is added.
 *
 * `limit` defaults to 50 inside the adapter (matches the existing
 * route default — `app/api/orders/route.ts:48`). Maximum 200. The
 * port contract documents the defaults so the service layer is free
 * to omit the field; the adapter clamps.
 */
export interface OrderFilter {
  readonly state?: OrderState;
  readonly deliveryDate?: string;
  readonly customerId?: string;
  readonly createdBy?: string;
  /** Default 50; clamped to [1, 200] inside the adapter. */
  readonly limit?: number;
}

/**
 * Patch shape for `OrdersRepository.updateOrder`. Only the three
 * editable fields are exposed — `customerId`, `state`, `createdBy`,
 * timestamps, and the reference are intentionally not patchable
 * through this method (they are read-only post-creation, or only
 * mutated through state-transition methods).
 *
 * Why `undefined` distinguishes from `null`: `undefined` means "don't
 * touch this field"; `null` means "set this field to NULL". This
 * matches the existing route's discrimination at
 * `app/api/orders/[id]/route.ts:117-119` (`if (update.delivery_date
 * !== undefined) orderPatch.delivery_date = update.delivery_date`).
 */
export interface OrderPatch {
  readonly deliveryDate?: string;
  readonly deliveryNotes?: string | null;
  readonly orderNotes?: string | null;
}

// ─── Create-order inputs ─────────────────────────────────────

/**
 * Input shape for `OrdersRepository.createOrder`.
 *
 * Domain-shape input, NOT the wire-shape request body. The route layer
 * is responsible for parsing the HTTP request (the zod
 * `createOrderBodySchema` at `lib/api/orders/schemas.ts` validates and
 * transforms the body into this shape). The service layer (F-07) then
 * constructs a `CreateOrderInput` from the validated/normalised data
 * and calls the port.
 *
 * `lines` is required and must have at least one entry — the port
 * contract documents this; the service enforces it via
 * `ValidationError` BEFORE calling the port. The port itself does not
 * re-validate (`ValidationError` is a service-layer concern per the
 * spec lock); a zero-length lines array hitting the port would result
 * in a `ServiceError` from the underlying DB CHECK on `order_lines`.
 */
export interface CreateOrderInput {
  readonly customerId: string;
  readonly deliveryDate: string;
  readonly deliveryNotes: string | null;
  readonly orderNotes: string | null;
  readonly lines: readonly CreateOrderLineInput[];
}

/**
 * Input shape for a single line on `CreateOrderInput`.
 *
 * Exactly one of `productId` or `adHocDescription` must be set (XOR).
 * The same documented invariant as `OrderLine` — see `OrderLine`'s
 * JSDoc for the design-it-twice analysis of why this is two optional
 * fields rather than a discriminated union.
 *
 * `lineNumber` is intentionally NOT on the input — the adapter
 * assigns it based on input array order (the Supabase adapter's
 * `createOrder` maps `line_number: i + 1` over the input lines —
 * `lib/adapters/supabase/OrdersRepository.ts`). Pulls complexity
 * downward (APOSD §10) — the caller does not need to know about
 * line-number assignment.
 */
export interface CreateOrderLineInput {
  readonly productId: string | null;
  readonly adHocDescription: string | null;
  readonly quantity: number;
  readonly uom: OrderUom;
  readonly notes: string | null;
}
