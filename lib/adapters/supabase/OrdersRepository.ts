/**
 * lib/adapters/supabase/OrdersRepository.ts
 *
 * Supabase implementation of `OrdersRepository`
 * (lib/ports/OrdersRepository.ts). This is the ONLY place in the
 * Orders bounded context where `@supabase/supabase-js` may be imported
 * (alongside the sibling Customers and Products adapters). ADR-0003
 * FREEZE rule + `.eslintrc.json:18` allow-list.
 *
 * Boundary discipline (ADR-0002 line 27 — mandatory):
 *   Vendor shapes (SupabaseClient, PostgrestResponse, the row shapes
 *   PostgREST returns) live INSIDE this file. They never cross the
 *   port boundary. Every method:
 *     1. Queries Supabase using vendor shapes.
 *     2. Maps the row→domain inside the function body via private
 *        helpers (rowToOrder, rowToOrderLine).
 *     3. Returns ONLY domain types (`Order`, `OrderLine`, etc. from
 *        `@/lib/domain`).
 *
 * Construction (hybrid factory + singleton — F-06 template):
 *   - `createSupabaseOrdersRepository(client)` factory — tests pass
 *     `getServiceClient()` to get a fresh adapter against a
 *     test-scoped client.
 *   - `supabaseOrdersRepository` singleton — pre-wired against
 *     `supabaseService` from `@/lib/adapters/supabase/client`. App code (F-07
 *     OrdersService, F-08 routes) imports this.
 *
 * Error contract (per F-05 OrdersRepository JSDoc, verbatim):
 *   listOrders         → ServiceError only
 *   findOrderById      → ServiceError only (returns null on miss)
 *   createOrder        → ServiceError (rollback attempted)
 *   updateOrder        → NotFoundError / ConflictError / ServiceError
 *   recordPrint        → NotFoundError / ConflictError / ServiceError
 *   markLineDone       → NotFoundError / ConflictError / ServiceError
 *   markOrderCompleted → NotFoundError / ConflictError / ServiceError
 *   listKdsQueue       → ServiceError only
 *
 * `markLineDone` ordering (ADOPTED at Gate 2 — idempotency-first):
 *   The adapter checks `done_at IS NULL` FIRST (idempotency), then
 *   checks parent order state. Matches today's route at
 *   `app/api/kds/lines/[lineId]/done/route.ts:92-94` exactly so the
 *   F-08 route rewrite sees zero semantic change. A second tap on an
 *   already-done line returns `alreadyDone: true` even if the parent
 *   order has since completed — this is the documented, intentional
 *   behaviour.
 *
 * Audit user-attribution (SET LOCAL) deferred:
 *   The audit triggers (supabase/migrations/20260530000000:170-218) read
 *   `current_setting('app.current_user_id', true)`. The supabase-js
 *   client doesn't expose SET LOCAL through `.from()`. F-06 inherits
 *   today's route behaviour: the trigger writes NULL user_id to the
 *   audit row. F-07's service or a later unit (F-19 HACCP /
 *   F-RLS-03) revisits via a Postgres helper RPC or a per-request
 *   authenticated client.
 *   See `app/api/orders/route.ts:136-148` for the original deferral.
 *
 * Round-trip costs (documented for the F-08 / F-07 planners):
 *   listOrders          → 1 round-trip.
 *   findOrderById       → 1 round-trip.
 *   createOrder         → 3 (insert order, insert lines, read-back).
 *   updateOrder         → up to 5 (state read, patch, delete lines,
 *                                  insert lines, read-back).
 *   recordPrint         → 3 (state read, update, read-back).
 *   markLineDone        → 4 happy / 2 idempotent.
 *   markOrderCompleted  → 2-3 (update, [state-read on miss], read-back).
 *   listKdsQueue        → 2 (orders + audit flashes).
 *
 * On every DB failure path: `log.warn` or `log.error` is called with
 * the structured payload (method, args summary, error.message), then
 * the appropriate typed error is thrown.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseService } from "@/lib/adapters/supabase/client";
import { NotFoundError, ConflictError, ServiceError } from "@/lib/errors";
import { log } from "@/lib/observability/log";
import type {
  Order,
  OrderLine,
  OrderFilter,
  OrderPatch,
  CreateOrderInput,
  CreateOrderLineInput,
} from "@/lib/domain";
import type {
  OrdersRepository,
  KdsOrderQueueSnapshot,
  KdsFlashEvent,
} from "@/lib/ports";

// ─── Internal row shapes ─────────────────────────────────────
// These are VENDOR-shaped and NEVER leave this file. Each method's
// mapping function converts to the domain shape before returning.

type OrderRow = {
  id: string;
  reference: string;
  customer_id: string;
  delivery_date: string;
  delivery_notes: string | null;
  order_notes: string | null;
  state: "placed" | "printed" | "completed";
  created_by: string;
  created_at: string;
  printed_by: string | null;
  printed_at: string | null;
  completed_at: string | null;
  customer: { id: string; name: string; postcode: string | null } | null;
  creator: { id: string; name: string } | null;
  printer: { id: string; name: string } | null;
  lines: OrderLineRow[] | null;
};

type OrderLineRow = {
  id: string;
  line_number: number;
  product_id: string | null;
  ad_hoc_description: string | null;
  quantity: number;
  uom: "kg" | "unit";
  notes: string | null;
  done_at: string | null;
  done_by: string | null;
};

type AuditLogRow = {
  order_id: string;
  action: string;
  created_at: string;
};

// ─── Canonical SELECT clause (one definition, six callers) ───
const ORDER_SELECT = `
  id, reference, customer_id, delivery_date, delivery_notes, order_notes,
  state, created_by, created_at, printed_by, printed_at, completed_at,
  customer:customer_id ( id, name, postcode ),
  creator:created_by   ( id, name ),
  printer:printed_by   ( id, name ),
  lines:order_lines ( id, line_number, product_id, ad_hoc_description, quantity, uom, notes, done_at, done_by )
`;

// ─── Pure mapping functions (row → domain) ───────────────────

function rowToOrderLine(r: OrderLineRow, orderId: string): OrderLine {
  return {
    id: r.id,
    orderId,
    lineNumber: r.line_number,
    productId: r.product_id,
    adHocDescription: r.ad_hoc_description,
    quantity: r.quantity,
    uom: r.uom,
    notes: r.notes,
    doneAt: r.done_at,
    doneBy: r.done_by,
  };
}

function rowToOrder(r: OrderRow): Order {
  const lines = (r.lines ?? [])
    .slice()
    .sort((a, b) => a.line_number - b.line_number)
    .map((l) => rowToOrderLine(l, r.id));
  return {
    id: r.id,
    reference: r.reference,
    customerId: r.customer_id,
    deliveryDate: r.delivery_date,
    deliveryNotes: r.delivery_notes,
    orderNotes: r.order_notes,
    state: r.state,
    createdBy: r.created_by,
    createdAt: r.created_at,
    printedBy: r.printed_by,
    printedAt: r.printed_at,
    completedAt: r.completed_at,
    customer: r.customer
      ? {
          id: r.customer.id,
          name: r.customer.name,
          postcode: r.customer.postcode,
        }
      : null,
    creator: r.creator ? { id: r.creator.id, name: r.creator.name } : null,
    printer: r.printer ? { id: r.printer.id, name: r.printer.name } : null,
    lines,
  };
}

// ─── Idempotency-key helpers (F-08) ──────────────────────────
// Internal to this adapter. The `order_idempotency_keys` table
// (migration 20260611000000) is the storage half of the createOrder
// idempotency contract; the PK on `key` is the race arbiter.

type IdempotencyKeyRow = {
  key: string;
  order_id: string;
  created_by: string;
  expires_at: string;
};

function isExpired(row: IdempotencyKeyRow): boolean {
  return new Date(row.expires_at).getTime() <= Date.now();
}

async function readIdempotencyKey(
  client: SupabaseClient,
  key: string,
): Promise<IdempotencyKeyRow | null> {
  const { data, error } = await client
    .from("order_idempotency_keys")
    .select("key, order_id, created_by, expires_at")
    .eq("key", key)
    .maybeSingle();
  if (error) {
    log.error("OrdersRepository idempotency-key read DB error", {
      error: error.message,
    });
    throw new ServiceError("Idempotency-key lookup failed", { cause: error });
  }
  return (data as IdempotencyKeyRow | null) ?? null;
}

/**
 * Narrowing guard for `deleteIdempotencyKey` (F-TD-09 W1). The two
 * reclaim arms in `createOrder` step 0 delete by `key`, but at the
 * exact 24h expiry tick a concurrent same-key request can plant a
 * FRESH valid row that the unguarded delete would clobber — letting
 * one key resolve to two orders (a TOCTOU bug). Each arm passes its
 * own guard so the delete only fires if the row it read is still the
 * one it intends to reclaim:
 *   - `expiredAt`: only delete if the row is STILL expired at `now`.
 *   - `orderId`:   only delete the row pointing at this specific
 *                  stale order_id.
 */
type IdempotencyDeleteGuard =
  | { kind: "expiredAt"; now: Date }
  | { kind: "orderId"; orderId: string };

async function deleteIdempotencyKey(
  client: SupabaseClient,
  key: string,
  guard?: IdempotencyDeleteGuard,
): Promise<void> {
  let query = client.from("order_idempotency_keys").delete().eq("key", key);
  if (guard?.kind === "expiredAt") {
    query = query.lte("expires_at", guard.now.toISOString());
  } else if (guard?.kind === "orderId") {
    query = query.eq("order_id", guard.orderId);
  }
  const { error } = await query;
  if (error) {
    log.error("OrdersRepository idempotency-key delete DB error", {
      error: error.message,
    });
    throw new ServiceError("Idempotency-key reclaim failed", { cause: error });
  }
}

/**
 * Record `key → orderId` after a successful create. Returns the order
 * id the key finally resolved to:
 *   - our `orderId` when the insert wins (the common case);
 *   - the WINNER's order id when a concurrent duplicate won the PK
 *     race first (the loser path: our just-created order is deleted —
 *     CASCADE removes its lines — and the caller returns the winner's
 *     order, so both concurrent calls resolve to the same id).
 *
 * Loser-path ordering note (refines plan §5 D1 step 3 a/b): the
 * winner's row is re-read BEFORE our own order is deleted, because the
 * pathological retry arm (winner's row vanished mid-flight) re-inserts
 * with our order_id — which must still exist for the FK. Outcomes are
 * identical to the plan's; only the delete is deferred to the arms
 * that resolve away from our order.
 *
 * @throws ConflictError if the winning key row belongs to a different
 *   caller (never reveal another user's order).
 * @throws ServiceError on any other failure (our order is rolled back
 *   first so a client retry cannot leave duplicates behind).
 */
async function claimIdempotencyKey(
  client: SupabaseClient,
  key: string,
  orderId: string,
  createdBy: string,
): Promise<string> {
  const rollbackOwnOrder = async (): Promise<void> => {
    const { error } = await client.from("orders").delete().eq("id", orderId);
    if (error) {
      // Non-fatal for the caller's control flow, but loud: an orphan
      // order survived a losing race / failed claim.
      log.error("OrdersRepository idempotency loser rollback failed", {
        orderId,
        error: error.message,
      });
    }
  };

  const MAX_ATTEMPTS = 2; // initial insert + one pathological retry
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const { error: insertErr } = await client
      .from("order_idempotency_keys")
      .insert({ key, order_id: orderId, created_by: createdBy });
    if (!insertErr) return orderId; // we won (or were unopposed)

    if (insertErr.code !== "23505") {
      // Real failure (not the unique-violation race). Roll back our
      // order so a client retry cannot create duplicates.
      await rollbackOwnOrder();
      log.error("OrdersRepository idempotency-key insert DB error", {
        error: insertErr.message,
      });
      throw new ServiceError("Idempotency-key record failed", {
        cause: insertErr,
      });
    }

    // 23505 — the concurrent race, loser path. Re-read the winner.
    const winner = await readIdempotencyKey(client, key);
    if (winner !== null) {
      await rollbackOwnOrder();
      if (winner.created_by !== createdBy) {
        throw new ConflictError("Idempotency-Key already used");
      }
      return winner.order_id;
    }
    // Winner's row vanished mid-flight (expired/rolled back —
    // pathological). Loop retries the insert once.
  }

  await rollbackOwnOrder();
  log.error("OrdersRepository idempotency claim unresolved after retry", {
    orderId,
  });
  throw new ServiceError("Idempotency-key claim failed");
}

// ─── Factory ─────────────────────────────────────────────────

export function createSupabaseOrdersRepository(
  client: SupabaseClient,
): OrdersRepository {
  return {
    async listOrders(filter: OrderFilter): Promise<readonly Order[]> {
      const limit = Math.min(200, Math.max(1, filter.limit ?? 50));
      let query = client
        .from("orders")
        .select(ORDER_SELECT)
        .order("delivery_date", { ascending: true })
        .order("created_at", { ascending: true })
        .limit(limit);

      if (filter.state) query = query.eq("state", filter.state);
      if (filter.deliveryDate)
        query = query.eq("delivery_date", filter.deliveryDate);
      if (filter.customerId) query = query.eq("customer_id", filter.customerId);
      if (filter.createdBy) query = query.eq("created_by", filter.createdBy);

      const { data, error } = await query;
      if (error) {
        log.error("OrdersRepository.listOrders DB error", {
          error: error.message,
        });
        throw new ServiceError("List orders failed", { cause: error });
      }
      return ((data as unknown as OrderRow[] | null) ?? []).map(rowToOrder);
    },

    async findOrderById(id: string): Promise<Order | null> {
      const { data, error } = await client
        .from("orders")
        .select(ORDER_SELECT)
        .eq("id", id)
        .maybeSingle();
      if (error) {
        log.error("OrdersRepository.findOrderById DB error", {
          id,
          error: error.message,
        });
        throw new ServiceError("Order lookup failed", { cause: error });
      }
      if (data === null) return null;
      return rowToOrder(data as unknown as OrderRow);
    },

    async createOrder(
      input: CreateOrderInput,
      createdBy: string,
      idempotencyKey?: string,
    ): Promise<Order> {
      // 0. Idempotency claim/replay check (F-08 port contract).
      //    Plan §5 D1: SELECT the key row first; expired → reclaim,
      //    cross-user → Conflict, same-caller live → replay.
      if (idempotencyKey !== undefined) {
        // F-TD-09 W1: capture ONE `now` so the expiry guard below deletes
        // against the same instant the row was read at (no second TOCTOU
        // between the `isExpired` read and the guarded delete).
        const now = new Date();
        const existing = await readIdempotencyKey(client, idempotencyKey);
        if (existing !== null) {
          if (isExpired(existing)) {
            // Expired — reclaim opportunistically, fall through to create.
            // W1: guard the delete so a concurrent FRESH row (planted at
            // the expiry tick) is not clobbered — only delete if STILL
            // expired at `now`.
            await deleteIdempotencyKey(client, idempotencyKey, {
              kind: "expiredAt",
              now,
            });
          } else if (existing.created_by !== createdBy) {
            // Never reveal the other user's order.
            throw new ConflictError("Idempotency-Key already used");
          } else {
            const original = await this.findOrderById(existing.order_id);
            if (original !== null) return original; // replay, no-op
            // Order vanished (deleted meanwhile) — reclaim stale key.
            // W1: guard the delete to the SPECIFIC stale order_id we read,
            // so a concurrent fresh row pointing at a live order survives.
            await deleteIdempotencyKey(client, idempotencyKey, {
              kind: "orderId",
              orderId: existing.order_id,
            });
          }
        }
      }

      // 1. Insert the orders row; reference is DB-generated.
      const { data: created, error: insertErr } = await client
        .from("orders")
        .insert({
          customer_id: input.customerId,
          delivery_date: input.deliveryDate,
          delivery_notes: input.deliveryNotes,
          order_notes: input.orderNotes,
          created_by: createdBy,
        })
        .select("id")
        .single();
      if (insertErr || !created) {
        log.error("OrdersRepository.createOrder order insert failed", {
          error: insertErr?.message,
        });
        throw new ServiceError("Failed to create order", {
          cause: insertErr ?? new Error("no row returned"),
        });
      }
      const newId = created.id as string;

      // 2. Insert the lines.
      const linesPayload = input.lines.map((l, i) => ({
        order_id: newId,
        line_number: i + 1,
        product_id: l.productId,
        ad_hoc_description: l.adHocDescription,
        quantity: l.quantity,
        uom: l.uom,
        notes: l.notes,
      }));
      const { error: linesErr } = await client
        .from("order_lines")
        .insert(linesPayload);
      if (linesErr) {
        // Rollback the orders row. ON DELETE CASCADE handles any
        // lines that may have landed before the failure.
        const { error: rollbackErr } = await client
          .from("orders")
          .delete()
          .eq("id", newId);
        if (rollbackErr) {
          log.error(
            "OrdersRepository.createOrder lines insert failed AND rollback failed",
            {
              orderId: newId,
              linesError: linesErr.message,
              rollbackError: rollbackErr.message,
            },
          );
        } else {
          log.error(
            "OrdersRepository.createOrder lines insert failed; rolled back",
            {
              orderId: newId,
              linesError: linesErr.message,
            },
          );
        }
        throw new ServiceError("Failed to insert order lines", {
          cause: linesErr,
        });
      }

      // 3. Record the idempotency key. The PK on `key` is the race
      //    arbiter: on unique-violation we are the LOSER — delete our
      //    own order (CASCADE removes its lines) and resolve to the
      //    winner's order (plan §5 D1 step 3).
      if (idempotencyKey !== undefined) {
        const winnerOrderId = await claimIdempotencyKey(
          client,
          idempotencyKey,
          newId,
          createdBy,
        );
        if (winnerOrderId !== newId) {
          const readBackWinner = await this.findOrderById(winnerOrderId);
          if (readBackWinner === null) {
            // F-TD-09 N1: do not log the raw client idempotencyKey.
            // winnerOrderId alone uniquely identifies the situation for
            // debugging; the raw key adds nothing but a leak.
            log.error(
              "OrdersRepository.createOrder race winner order unreadable",
              { winnerOrderId },
            );
            throw new ServiceError("Order created but could not be read back");
          }
          return readBackWinner;
        }
      }

      // 4. Read back the full Order with embeds.
      const readBack = await this.findOrderById(newId);
      if (readBack === null) {
        // Should not happen — the row was just inserted in this
        // transaction. If it does, something raced unsafely.
        log.error(
          "OrdersRepository.createOrder readBack returned null after insert",
          { orderId: newId },
        );
        throw new ServiceError("Order created but could not be read back");
      }
      return readBack;
    },

    async updateOrder(
      id: string,
      patch: OrderPatch,
      lineReplacement?: readonly CreateOrderLineInput[],
    ): Promise<Order> {
      // 1. Confirm the order exists.
      const { data: existing, error: stateErr } = await client
        .from("orders")
        .select("id, state")
        .eq("id", id)
        .maybeSingle();
      if (stateErr) {
        log.error("OrdersRepository.updateOrder state read DB error", {
          id,
          error: stateErr.message,
        });
        throw new ServiceError("Order state lookup failed", {
          cause: stateErr,
        });
      }
      if (existing === null) {
        throw new NotFoundError(`Order ${id} not found`);
      }

      // 2. Apply the orders-row patch if non-empty.
      const orderPatch: Record<string, unknown> = {};
      if (patch.deliveryDate !== undefined)
        orderPatch.delivery_date = patch.deliveryDate;
      if (patch.deliveryNotes !== undefined)
        orderPatch.delivery_notes = patch.deliveryNotes;
      if (patch.orderNotes !== undefined)
        orderPatch.order_notes = patch.orderNotes;

      if (Object.keys(orderPatch).length > 0) {
        const { error: patchErr } = await client
          .from("orders")
          .update(orderPatch)
          .eq("id", id);
        if (patchErr) {
          // A CHECK-constraint violation surfaces as a Conflict.
          // Other failures surface as ServiceError.
          const isCheck = /check constraint/i.test(patchErr.message ?? "");
          if (isCheck) {
            throw new ConflictError(
              `Order ${id} patch rejected by DB constraint`,
              { cause: patchErr },
            );
          }
          log.error("OrdersRepository.updateOrder patch DB error", {
            id,
            error: patchErr.message,
          });
          throw new ServiceError("Order patch failed", { cause: patchErr });
        }
      }

      // 3. Replace lines if provided.
      if (lineReplacement !== undefined) {
        const { error: delErr } = await client
          .from("order_lines")
          .delete()
          .eq("order_id", id);
        if (delErr) {
          log.error("OrdersRepository.updateOrder line delete DB error", {
            id,
            error: delErr.message,
          });
          throw new ServiceError("Order line delete failed", {
            cause: delErr,
          });
        }
        const payload = lineReplacement.map((l, i) => ({
          order_id: id,
          line_number: i + 1,
          product_id: l.productId,
          ad_hoc_description: l.adHocDescription,
          quantity: l.quantity,
          uom: l.uom,
          notes: l.notes,
        }));
        if (payload.length > 0) {
          const { error: insErr } = await client
            .from("order_lines")
            .insert(payload);
          if (insErr) {
            log.error("OrdersRepository.updateOrder line insert DB error", {
              id,
              error: insErr.message,
            });
            throw new ServiceError("Order line insert failed", {
              cause: insErr,
            });
          }
        }
      }

      // 4. Read back the updated Order.
      const readBack = await this.findOrderById(id);
      if (readBack === null) {
        // Raced delete between step 1 and now.
        throw new NotFoundError(`Order ${id} not found`);
      }
      return readBack;
    },

    async recordPrint(
      id: string,
      printedBy: string,
      when: Date,
    ): Promise<Order> {
      // 1. Read current state.
      const { data: existing, error: stateErr } = await client
        .from("orders")
        .select("id, state")
        .eq("id", id)
        .maybeSingle();
      if (stateErr) {
        log.error("OrdersRepository.recordPrint state read DB error", {
          id,
          error: stateErr.message,
        });
        throw new ServiceError("Order state lookup failed", {
          cause: stateErr,
        });
      }
      if (existing === null) {
        throw new NotFoundError(`Order ${id} not found`);
      }
      if (existing.state === "completed") {
        throw new ConflictError(`Order ${id} is completed; cannot reprint`);
      }

      const whenIso = when.toISOString();

      // 2. Transition by state.
      if (existing.state === "placed") {
        // First print — optimistic lock against concurrent transition.
        const { data: updated, error: updErr } = await client
          .from("orders")
          .update({
            state: "printed",
            printed_at: whenIso,
            printed_by: printedBy,
          })
          .eq("id", id)
          .eq("state", "placed")
          .select("id");
        if (updErr) {
          log.error("OrdersRepository.recordPrint first-print DB error", {
            id,
            error: updErr.message,
          });
          throw new ServiceError("Record print failed", { cause: updErr });
        }
        if (!updated || updated.length === 0) {
          // The optimistic lock missed — another writer raced ahead.
          throw new ConflictError(
            `Order ${id} state changed during print transition`,
          );
        }
      } else {
        // Reprint — no state change; audit trigger fires 'reprinted'.
        const { error: updErr } = await client
          .from("orders")
          .update({ printed_at: whenIso, printed_by: printedBy })
          .eq("id", id);
        if (updErr) {
          log.error("OrdersRepository.recordPrint reprint DB error", {
            id,
            error: updErr.message,
          });
          throw new ServiceError("Reprint failed", { cause: updErr });
        }
      }

      // 3. Read back the updated Order.
      const readBack = await this.findOrderById(id);
      if (readBack === null) {
        throw new NotFoundError(`Order ${id} not found`);
      }
      return readBack;
    },

    async markLineDone(
      lineId: string,
      doneBy: string,
      when: Date,
    ): Promise<{
      readonly alreadyDone: boolean;
      readonly orderId: string;
      readonly allLinesDone: boolean;
    }> {
      // 1. Read the line.
      const { data: line, error: lineErr } = await client
        .from("order_lines")
        .select("id, order_id, done_at")
        .eq("id", lineId)
        .maybeSingle();
      if (lineErr) {
        log.error("OrdersRepository.markLineDone line read DB error", {
          lineId,
          error: lineErr.message,
        });
        throw new ServiceError("Line lookup failed", { cause: lineErr });
      }
      if (line === null) {
        throw new NotFoundError(`Order line ${lineId} not found`);
      }

      const orderId = line.order_id as string;

      // 2. Idempotency check FIRST — matches today's route line 92-94
      //    AND the Gate-2 ADOPTED decision (idempotency wins over
      //    state check). A second tap on an already-done line returns
      //    alreadyDone:true even if the parent has since completed.
      if (line.done_at !== null) {
        const { count: remainingIdem, error: countErrIdem } = await client
          .from("order_lines")
          .select("id", { count: "exact", head: true })
          .eq("order_id", orderId)
          .is("done_at", null);
        if (countErrIdem) {
          log.warn(
            "OrdersRepository.markLineDone idempotent-path count failed",
            { orderId, error: countErrIdem.message },
          );
          return {
            alreadyDone: true,
            orderId,
            allLinesDone: false,
          };
        }
        return {
          alreadyDone: true,
          orderId,
          allLinesDone: (remainingIdem ?? 0) === 0,
        };
      }

      // 3. Check parent order state.
      const { data: order, error: orderErr } = await client
        .from("orders")
        .select("id, state")
        .eq("id", orderId)
        .maybeSingle();
      if (orderErr) {
        log.error("OrdersRepository.markLineDone parent-state read DB error", {
          orderId,
          error: orderErr.message,
        });
        throw new ServiceError("Parent order lookup failed", {
          cause: orderErr,
        });
      }
      if (order === null) {
        throw new NotFoundError(`Order ${orderId} not found`);
      }
      if (order.state === "placed") {
        throw new ConflictError(`Order ${orderId} has not been printed yet`);
      }
      if (order.state === "completed") {
        throw new ConflictError(`Order ${orderId} is already completed`);
      }

      // 4. Update the line with a TOCTOU guard on done_at.
      const whenIso = when.toISOString();
      const { error: updateErr } = await client
        .from("order_lines")
        .update({ done_at: whenIso, done_by: doneBy })
        .eq("id", lineId)
        .is("done_at", null);
      if (updateErr) {
        log.error("OrdersRepository.markLineDone line update DB error", {
          lineId,
          error: updateErr.message,
        });
        throw new ServiceError("Line update failed", { cause: updateErr });
      }

      // 5. Count remaining un-done lines.
      const { count: remaining, error: countErr } = await client
        .from("order_lines")
        .select("id", { count: "exact", head: true })
        .eq("order_id", orderId)
        .is("done_at", null);
      if (countErr) {
        // Non-fatal — the line was marked, the count is best-effort.
        log.warn("OrdersRepository.markLineDone remaining-lines count failed", {
          orderId,
          error: countErr.message,
        });
        return {
          alreadyDone: false,
          orderId,
          allLinesDone: false,
        };
      }

      return {
        alreadyDone: false,
        orderId,
        allLinesDone: (remaining ?? 0) === 0,
      };
    },

    async markOrderCompleted(id: string, when: Date): Promise<Order> {
      // 1. Optimistic-lock update.
      const whenIso = when.toISOString();
      const { data: updated, error: updErr } = await client
        .from("orders")
        .update({ state: "completed", completed_at: whenIso })
        .eq("id", id)
        .eq("state", "printed")
        .select("id");
      if (updErr) {
        log.error("OrdersRepository.markOrderCompleted DB error", {
          id,
          error: updErr.message,
        });
        throw new ServiceError("Mark completed failed", { cause: updErr });
      }
      if (!updated || updated.length === 0) {
        // The lock missed — distinguish missing vs wrong-state.
        const { data: existing, error: stateErr } = await client
          .from("orders")
          .select("id, state")
          .eq("id", id)
          .maybeSingle();
        if (stateErr) {
          log.error(
            "OrdersRepository.markOrderCompleted miss-classification DB error",
            { id, error: stateErr.message },
          );
          throw new ServiceError("State lookup failed", { cause: stateErr });
        }
        if (existing === null) {
          throw new NotFoundError(`Order ${id} not found`);
        }
        throw new ConflictError(
          `Order ${id} state is ${existing.state}; expected 'printed'`,
        );
      }

      // 2. Read back the updated Order.
      const readBack = await this.findOrderById(id);
      if (readBack === null) {
        throw new NotFoundError(`Order ${id} not found`);
      }
      return readBack;
    },

    async listKdsQueue(since: Date): Promise<KdsOrderQueueSnapshot> {
      const serverTime = new Date();
      const sinceIso = since.toISOString();

      // 1. Orders: printed OR (completed AND completed_at >= since).
      //    Exact PostgREST .or() form from app/api/kds/orders/route.ts:50.
      const { data: ordersData, error: ordersErr } = await client
        .from("orders")
        .select(ORDER_SELECT)
        .or(
          `state.eq.printed,and(state.eq.completed,completed_at.gte.${sinceIso})`,
        )
        .order("delivery_date", { ascending: true })
        .order("printed_at", { ascending: true })
        .limit(100);
      if (ordersErr) {
        log.error("OrdersRepository.listKdsQueue orders DB error", {
          error: ordersErr.message,
        });
        throw new ServiceError("KDS queue read failed", { cause: ordersErr });
      }
      const orders = ((ordersData as unknown as OrderRow[] | null) ?? []).map(
        rowToOrder,
      );

      // 2. Recent audit flashes — last 60s, filtered to flash actions.
      let recentFlashes: readonly KdsFlashEvent[] = [];
      if (orders.length > 0) {
        const flashSince = new Date(
          serverTime.getTime() - 60_000,
        ).toISOString();
        const ids = orders.map((o) => o.id);
        const { data: auditRows, error: auditErr } = await client
          .from("order_audit_log")
          .select("order_id, action, created_at")
          .in("order_id", ids)
          .in("action", ["edited", "line_edited", "reprinted", "line_added"])
          .gte("created_at", flashSince);
        if (auditErr) {
          // Non-fatal — orders still surface; flashes degrade to empty.
          log.warn(
            "OrdersRepository.listKdsQueue audit-log read failed; flashes empty",
            { error: auditErr.message },
          );
        } else {
          recentFlashes = ((auditRows ?? []) as AuditLogRow[]).map((r) => ({
            orderId: r.order_id,
            action: r.action as KdsFlashEvent["action"],
            createdAt: r.created_at,
          }));
        }
      }

      return {
        orders,
        recentFlashes,
        serverTime: serverTime.toISOString(),
      };
    },

    async purgeExpiredIdempotencyKeys(now: Date): Promise<number> {
      const { data, error } = await client
        .from("order_idempotency_keys")
        .delete()
        .lte("expires_at", now.toISOString())
        .select("key");
      if (error) {
        log.error("OrdersRepository.purgeExpiredIdempotencyKeys DB error", {
          error: error.message,
        });
        throw new ServiceError("Idempotency-key purge failed", { cause: error });
      }
      return (data ?? []).length;
    },
  };
}

export const supabaseOrdersRepository: OrdersRepository =
  createSupabaseOrdersRepository(supabaseService);
