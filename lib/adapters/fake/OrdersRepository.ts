/**
 * lib/adapters/fake/OrdersRepository.ts
 *
 * In-memory implementation of `OrdersRepository`
 * (lib/ports/OrdersRepository.ts). No Supabase SDK import — pure
 * JavaScript Maps storing DOMAIN types.
 *
 * Boundary discipline (ADR-0002 line 27 — inverted form):
 *   Where the Supabase adapter holds vendor row shapes inside its
 *   file and maps them out at the boundary, the Fake adapter never
 *   has a row shape at all. The store is `Map<string, Order>` of
 *   full domain Order values. Mutations copy-and-replace rather than
 *   patching in place (matching the readonly discipline on
 *   `lib/domain/Order.ts`).
 *
 * Construction:
 *   - `createFakeOrdersRepository()` factory — each call returns a
 *     fresh in-memory state. Tests get isolation by calling the
 *     factory in beforeEach.
 *   - `fakeOrdersRepository` singleton — pre-wired for symmetry with
 *     the Supabase adapter barrel; app code never imports this.
 *
 * Reference generation:
 *   The Fake uses `FAKE-YYYY-NNNN` (FAKE prefix to distinguish from
 *   the DB-generated `MFS-YYYY-NNNN`). The contract suite asserts the
 *   reference is a non-empty string but never the exact prefix —
 *   keeping the suite adapter-agnostic.
 *
 * Audit log model:
 *   The Fake does NOT model `order_audit_log`. `listKdsQueue` always
 *   returns `recentFlashes: []`. The contract suite gates the
 *   audit-driven cases on `supportsAuditLog`, which the Fake wrapper
 *   sets to false.
 *
 * Error model:
 *   The Fake throws the same typed errors as the Supabase adapter
 *   (`NotFoundError`, `ConflictError` from `@/lib/errors`). Identity
 *   is preserved so `instanceof` checks at the service layer behave
 *   identically against both adapters.
 */

import { NotFoundError, ConflictError } from "@/lib/errors";
import type {
  Order,
  OrderLine,
  OrderFilter,
  OrderPatch,
  CreateOrderInput,
  CreateOrderLineInput,
} from "@/lib/domain";
import type { OrdersRepository, KdsOrderQueueSnapshot } from "@/lib/ports";

interface FakeState {
  orders: Map<string, Order>;
  nextOrderSeq: number;
}

function nextFakeReference(state: FakeState): string {
  const year = new Date().getUTCFullYear();
  const seq = String(state.nextOrderSeq++).padStart(4, "0");
  return `FAKE-${year}-${seq}`;
}

function newId(): string {
  // Prefer `crypto.randomUUID()` (Node 18+, modern browsers). Fall
  // back to a counter-based pseudo-UUID for older runtimes — the
  // contract suite never asserts UUID shape, only that ids are
  // unique non-empty strings.
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  // Extremely rare in this codebase; surfaced for visibility.
  return `fake-id-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

export function createFakeOrdersRepository(): OrdersRepository {
  const state: FakeState = { orders: new Map(), nextOrderSeq: 1 };

  return {
    async listOrders(filter: OrderFilter): Promise<readonly Order[]> {
      let out = Array.from(state.orders.values());
      if (filter.state) out = out.filter((o) => o.state === filter.state);
      if (filter.deliveryDate)
        out = out.filter((o) => o.deliveryDate === filter.deliveryDate);
      if (filter.customerId)
        out = out.filter((o) => o.customerId === filter.customerId);
      if (filter.createdBy)
        out = out.filter((o) => o.createdBy === filter.createdBy);
      out.sort((a, b) => {
        if (a.deliveryDate !== b.deliveryDate)
          return a.deliveryDate < b.deliveryDate ? -1 : 1;
        return a.createdAt < b.createdAt ? -1 : 1;
      });
      const limit = Math.min(200, Math.max(1, filter.limit ?? 50));
      return out.slice(0, limit);
    },

    async findOrderById(id: string): Promise<Order | null> {
      return state.orders.get(id) ?? null;
    },

    async createOrder(
      input: CreateOrderInput,
      createdBy: string,
    ): Promise<Order> {
      const id = newId();
      const reference = nextFakeReference(state);
      const createdAt = new Date().toISOString();
      const lines: OrderLine[] = input.lines.map((l, i) => ({
        id: newId(),
        orderId: id,
        lineNumber: i + 1,
        productId: l.productId,
        adHocDescription: l.adHocDescription,
        quantity: l.quantity,
        uom: l.uom,
        notes: l.notes,
        doneAt: null,
        doneBy: null,
      }));
      const order: Order = {
        id,
        reference,
        customerId: input.customerId,
        deliveryDate: input.deliveryDate,
        deliveryNotes: input.deliveryNotes,
        orderNotes: input.orderNotes,
        state: "placed",
        createdBy,
        createdAt,
        printedBy: null,
        printedAt: null,
        completedAt: null,
        customer: null,
        creator: null,
        printer: null,
        lines,
      };
      state.orders.set(id, order);
      return order;
    },

    async updateOrder(
      id: string,
      patch: OrderPatch,
      lineReplacement?: readonly CreateOrderLineInput[],
    ): Promise<Order> {
      const existing = state.orders.get(id);
      if (!existing) throw new NotFoundError(`Order ${id} not found`);

      const lines: readonly OrderLine[] = lineReplacement
        ? lineReplacement.map((l, i) => ({
            id: newId(),
            orderId: id,
            lineNumber: i + 1,
            productId: l.productId,
            adHocDescription: l.adHocDescription,
            quantity: l.quantity,
            uom: l.uom,
            notes: l.notes,
            doneAt: null,
            doneBy: null,
          }))
        : existing.lines;

      const next: Order = {
        ...existing,
        deliveryDate:
          patch.deliveryDate !== undefined
            ? patch.deliveryDate
            : existing.deliveryDate,
        deliveryNotes:
          patch.deliveryNotes !== undefined
            ? patch.deliveryNotes
            : existing.deliveryNotes,
        orderNotes:
          patch.orderNotes !== undefined
            ? patch.orderNotes
            : existing.orderNotes,
        lines,
      };
      state.orders.set(id, next);
      return next;
    },

    async recordPrint(
      id: string,
      printedBy: string,
      when: Date,
    ): Promise<Order> {
      const existing = state.orders.get(id);
      if (!existing) throw new NotFoundError(`Order ${id} not found`);
      if (existing.state === "completed") {
        throw new ConflictError(`Order ${id} is completed; cannot reprint`);
      }
      const whenIso = when.toISOString();
      const next: Order = {
        ...existing,
        state: "printed",
        printedAt: whenIso,
        printedBy,
      };
      state.orders.set(id, next);
      return next;
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
      // Walk the orders Map to find the parent order + line. The
      // Fake doesn't index lines independently — fine at this scale.
      for (const order of state.orders.values()) {
        const line = order.lines.find((l) => l.id === lineId);
        if (!line) continue;

        // Idempotency check FIRST — matches today's route at
        // app/api/kds/lines/[lineId]/done/route.ts:92-94 and the
        // Gate-2 ADOPTED decision (idempotency wins over state check).
        if (line.doneAt !== null) {
          const remaining = order.lines.filter((l) => l.doneAt === null).length;
          return {
            alreadyDone: true,
            orderId: order.id,
            allLinesDone: remaining === 0,
          };
        }

        if (order.state === "placed") {
          throw new ConflictError(`Order ${order.id} has not been printed yet`);
        }
        if (order.state === "completed") {
          throw new ConflictError(`Order ${order.id} is already completed`);
        }

        const whenIso = when.toISOString();
        const nextLines = order.lines.map((l) =>
          l.id === lineId ? { ...l, doneAt: whenIso, doneBy } : l,
        );
        const remaining = nextLines.filter((l) => l.doneAt === null).length;
        state.orders.set(order.id, { ...order, lines: nextLines });
        return {
          alreadyDone: false,
          orderId: order.id,
          allLinesDone: remaining === 0,
        };
      }

      throw new NotFoundError(`Order line ${lineId} not found`);
    },

    async markOrderCompleted(id: string, when: Date): Promise<Order> {
      const existing = state.orders.get(id);
      if (!existing) throw new NotFoundError(`Order ${id} not found`);
      if (existing.state !== "printed") {
        throw new ConflictError(
          `Order ${id} state is ${existing.state}; expected 'printed'`,
        );
      }
      const whenIso = when.toISOString();
      const next: Order = {
        ...existing,
        state: "completed",
        completedAt: whenIso,
      };
      state.orders.set(id, next);
      return next;
    },

    async listKdsQueue(since: Date): Promise<KdsOrderQueueSnapshot> {
      const serverTime = new Date();
      const sinceIso = since.toISOString();
      const orders = Array.from(state.orders.values())
        .filter(
          (o) =>
            o.state === "printed" ||
            (o.state === "completed" &&
              o.completedAt !== null &&
              o.completedAt >= sinceIso),
        )
        .sort((a, b) => {
          if (a.deliveryDate !== b.deliveryDate)
            return a.deliveryDate < b.deliveryDate ? -1 : 1;
          const aPrint = a.printedAt ?? "";
          const bPrint = b.printedAt ?? "";
          return aPrint < bPrint ? -1 : 1;
        })
        .slice(0, 100);
      // Fake does not model audit log — recentFlashes is always empty.
      return {
        orders,
        recentFlashes: [],
        serverTime: serverTime.toISOString(),
      };
    },
  };
}

export const fakeOrdersRepository: OrdersRepository =
  createFakeOrdersRepository();
