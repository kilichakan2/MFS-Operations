/**
 * lib/api/orders/dto.ts
 *
 * DTO translators: domain `Order` (camelCase) → the EXACT legacy
 * snake_case wire shapes the Orders screens read today (plan §5.4).
 * Pure functions, no I/O, unit-tested key-for-key — these are the
 * wire-compat tripwire for the F-08 rewrite.
 *
 * The one easy-to-miss detail: the legacy LIST select omits the
 * printer embed, so `toOrderListDto` has NO `printer` key; only
 * `toOrderDetailDto` carries it.
 */
import type { Order, OrderLine, Product } from "@/lib/domain";
import type { PickingListData } from "@/lib/orders/pickingList";

// ─── Wire shapes (what the screens were built to read) ───────

export interface OrderLineDto {
  id: string;
  line_number: number;
  product_id: string | null;
  ad_hoc_description: string | null;
  quantity: number;
  uom: "kg" | "unit";
  notes: string | null;
  done_at: string | null;
  done_by: string | null;
}

export interface OrderListDto {
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
  lines: OrderLineDto[];
}

export interface OrderDetailDto extends OrderListDto {
  printer: { id: string; name: string } | null;
}

// ─── Translators ─────────────────────────────────────────────

function toLineDto(line: OrderLine): OrderLineDto {
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
  };
}

/** GET /api/orders item shape — NO `printer` key (legacy list SELECT). */
export function toOrderListDto(order: Order): OrderListDto {
  return {
    id: order.id,
    reference: order.reference,
    customer_id: order.customerId,
    delivery_date: order.deliveryDate,
    delivery_notes: order.deliveryNotes,
    order_notes: order.orderNotes,
    state: order.state,
    created_by: order.createdBy,
    created_at: order.createdAt,
    printed_by: order.printedBy,
    printed_at: order.printedAt,
    completed_at: order.completedAt,
    customer: order.customer
      ? {
          id: order.customer.id,
          name: order.customer.name,
          postcode: order.customer.postcode,
        }
      : null,
    creator: order.creator
      ? { id: order.creator.id, name: order.creator.name }
      : null,
    lines: order.lines.map(toLineDto),
  };
}

/** GET /api/orders/[id] shape — list shape PLUS `printer`. */
export function toOrderDetailDto(order: Order): OrderDetailDto {
  return {
    ...toOrderListDto(order),
    printer: order.printer
      ? { id: order.printer.id, name: order.printer.name }
      : null,
  };
}

// ─── Picking-list assembly → render shape ────────────────────

/**
 * What the picking-list use-case (lib/usecases/pickingList.ts)
 * assembles for one render: the order, the catalogue rows its lines
 * reference, the printing user's display name, and the timestamp the
 * sheet should carry.
 */
export interface PickingListAssembly {
  readonly order: Order;
  readonly productsById: ReadonlyMap<string, Product>;
  readonly printedByName: string;
  readonly printedAt: string;
}

/**
 * Map the assembly to `PickingListData` (lib/orders/pickingList.ts:36)
 * with the legacy fallbacks: '—' customer/sales rep, '' product code,
 * `ad_hoc ?? product name ?? '(unknown product)'` description,
 * `boxSize` as pack, `createdAt.slice(0, 10)` as order_date.
 */
export function toPickingListData(
  assembly: PickingListAssembly,
): PickingListData {
  const { order, productsById, printedByName, printedAt } = assembly;
  return {
    reference: order.reference,
    customer_name: order.customer?.name ?? "—",
    customer_postcode: order.customer?.postcode ?? null,
    order_date: order.createdAt.slice(0, 10),
    delivery_date: order.deliveryDate,
    sales_rep: order.creator?.name ?? "—",
    printed_at: printedAt,
    printed_by: printedByName,
    delivery_notes: order.deliveryNotes,
    order_notes: order.orderNotes,
    lines: order.lines.map((l) => {
      const prod = l.productId ? productsById.get(l.productId) : undefined;
      return {
        line_number: l.lineNumber,
        product_code: prod?.code ?? "",
        description: l.adHocDescription ?? prod?.name ?? "(unknown product)",
        quantity: l.quantity,
        uom: l.uom,
        pack: prod?.boxSize ?? null,
        notes: l.notes,
      };
    }),
  };
}
