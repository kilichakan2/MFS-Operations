/**
 * app/api/orders/route.ts
 *
 *   GET  /api/orders   — list orders (filtered by query params)
 *   POST /api/orders   — create a new order (optional Idempotency-Key)
 *
 * F-08 thin handlers: auth via requireRole, inbound zod validation
 * (lib/api/orders/schemas.ts), business logic in OrdersService, wire
 * translation in lib/api/orders/dto.ts. No vendor imports, no
 * try/catch — withRequestContext(withErrors(…)) owns the error path.
 *
 * Plan: docs/plans/2026-06-11-f-08-orders-route-rewrites.md
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { withErrors } from "@/lib/errors";
import { withRequestContext } from "@/lib/observability";
import { ordersService, ordersServiceForCaller } from "@/lib/wiring/orders";
import { parseOrThrow } from "@/lib/api/validate";
import {
  listOrdersQuerySchema,
  createOrderBodySchema,
  idempotencyKeyFromHeader,
} from "@/lib/api/orders/schemas";
import { toOrderListDto } from "@/lib/api/orders/dto";

// ─── GET /api/orders ──────────────────────────────────────────

export const GET = withRequestContext(
  withErrors(async (req: NextRequest) => {
    const caller = requireRole(req, [
      "admin",
      "sales",
      "office",
      "warehouse",
      "butcher",
    ]);
    const q = req.nextUrl.searchParams;
    const filter = parseOrThrow(listOrdersQuerySchema, {
      state: q.get("state"),
      delivery_date: q.get("delivery_date"),
      customer_id: q.get("customer_id"),
      created_by: q.get("created_by"),
      limit: q.get("limit"),
    });
    // F-RLS-04a: read under the per-caller authenticated client (RLS fires).
    // Rollback = swap `ordersServiceForCaller(caller.userId!)` → `ordersService`.
    const ordersService = await ordersServiceForCaller(caller.userId!);
    const orders = await ordersService.listOrders(filter);
    return NextResponse.json({ orders: orders.map(toOrderListDto) });
  }),
);

// ─── POST /api/orders ─────────────────────────────────────────

export const POST = withRequestContext(
  withErrors(async (req: NextRequest) => {
    const caller = requireRole(req, ["admin", "sales", "office"]);
    const key = idempotencyKeyFromHeader(req.headers.get("idempotency-key"));
    const input = parseOrThrow(
      createOrderBodySchema,
      await req.json().catch(() => null),
    );
    // reason: create STAYS on the service-role singleton this unit (F-RLS-04a).
    // createOrder's order/line inserts are atomically coupled to its
    // idempotency-key bookkeeping on `order_idempotency_keys`, which is
    // RLS-deny-all (no policy) — running it under the authenticated client
    // would silently break idempotency. The route-level requireRole already
    // gates create to admin/sales/office. Flipping create is deferred to the
    // F-RLS-04a-create follow-up (plan §4.5).
    const order = await ordersService.placeOrder(input, caller.userId!, key);
    return NextResponse.json(
      { id: order.id, reference: order.reference },
      { status: 201 },
    );
  }),
);
