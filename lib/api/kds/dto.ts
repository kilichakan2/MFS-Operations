/**
 * lib/api/kds/dto.ts
 *
 * DTO translators for the KDS queue wire shape (plan §5.4). Two
 * easy-to-miss legacy details are pinned here (and in the unit tests):
 *   - the KDS customer embed is `{id, name}` — NO postcode;
 *   - every line carries `product: {id, name} | null`. The domain
 *     `Order` does not carry product names, so the kdsQueue use-case
 *     batch-fetches the products and this DTO restores the embed.
 */
import type { Order, OrderLine, Product } from "@/lib/domain";
import type { KdsOrderQueueSnapshot } from "@/lib/ports";

// ─── Wire shapes ─────────────────────────────────────────────

export interface KdsLineDto {
  id: string;
  line_number: number;
  product_id: string | null;
  ad_hoc_description: string | null;
  quantity: number;
  uom: "kg" | "unit";
  notes: string | null;
  done_at: string | null;
  done_by: string | null;
  product: { id: string; name: string } | null;
}

export interface KdsOrderDto {
  id: string;
  reference: string;
  state: "placed" | "printed" | "completed";
  delivery_date: string;
  delivery_notes: string | null;
  order_notes: string | null;
  printed_at: string | null;
  completed_at: string | null;
  customer: { id: string; name: string } | null;
  lines: KdsLineDto[];
}

export interface KdsQueueResponse {
  orders: KdsOrderDto[];
  recent_flashes: Array<{
    order_id: string;
    action: string;
    created_at: string;
  }>;
  server_time: string;
}

// ─── Translators ─────────────────────────────────────────────

function toKdsLineDto(
  line: OrderLine,
  productsById: ReadonlyMap<string, Product>,
): KdsLineDto {
  const prod = line.productId ? productsById.get(line.productId) : undefined;
  return {
    id: line.id,
    line_number: line.lineNumber,
    product_id: line.productId,
    ad_hoc_description: line.adHocDescription,
    quantity: line.quantity,
    uom: line.uom,
    notes: line.notes,
    done_at: line.doneAt,
    done_by: line.doneBy,
    product: prod ? { id: prod.id, name: prod.name } : null,
  };
}

/** One order card on the KDS queue (legacy embed shape). */
export function toKdsOrderDto(
  order: Order,
  productsById: ReadonlyMap<string, Product>,
): KdsOrderDto {
  return {
    id: order.id,
    reference: order.reference,
    state: order.state,
    delivery_date: order.deliveryDate,
    delivery_notes: order.deliveryNotes,
    order_notes: order.orderNotes,
    printed_at: order.printedAt,
    completed_at: order.completedAt,
    customer: order.customer
      ? { id: order.customer.id, name: order.customer.name }
      : null,
    lines: order.lines.map((l) => toKdsLineDto(l, productsById)),
  };
}

/** The full GET /api/kds/orders response body. */
export function toKdsQueueResponse(bundle: {
  snapshot: KdsOrderQueueSnapshot;
  productsById: ReadonlyMap<string, Product>;
}): KdsQueueResponse {
  const { snapshot, productsById } = bundle;
  return {
    orders: snapshot.orders.map((o) => toKdsOrderDto(o, productsById)),
    recent_flashes: snapshot.recentFlashes.map((f) => ({
      order_id: f.orderId,
      action: f.action,
      created_at: f.createdAt,
    })),
    server_time: snapshot.serverTime,
  };
}
