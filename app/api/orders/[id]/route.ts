/**
 * app/api/orders/[id]/route.ts
 *
 *   GET /api/orders/[id]   — read a single order with its lines
 *   PUT /api/orders/[id]   — edit (patch + optional full line replace)
 *
 * F-08 thin handlers: auth via requireRole, inbound zod validation,
 * business logic (incl. the state×role edit gating) in OrdersService,
 * wire translation in lib/api/orders/dto.ts. No vendor imports, no
 * try/catch — withRequestContext(withErrors(…)) owns the error path.
 *
 * PUT role note: ['admin','sales','office'] is the union of every
 * role that can edit in ANY state; the service still enforces the
 * per-state rules (placed → admin/sales/office; printed →
 * admin/office; completed → 409). Net statuses are identical to the
 * legacy route for every caller.
 *
 * Plan: docs/plans/2026-06-11-f-08-orders-route-rewrites.md
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { NotFoundError, withErrors } from "@/lib/errors";
import { withRequestContext } from "@/lib/observability";
import { ordersService } from "@/lib/wiring/orders";
import { parseOrThrow } from "@/lib/api/validate";
import {
  orderIdParamSchema,
  updateOrderBodySchema,
} from "@/lib/api/orders/schemas";
import { toOrderDetailDto } from "@/lib/api/orders/dto";

type Params = { params: Promise<{ id: string }> };

// ─── GET /api/orders/[id] ─────────────────────────────────────

export const GET = withRequestContext(
  withErrors(async (req: NextRequest, { params }: Params) => {
    requireRole(req, ["admin", "sales", "office", "warehouse", "butcher"]);
    const id = parseOrThrow(orderIdParamSchema, (await params).id);
    const order = await ordersService.findOrderById(id);
    if (order === null) throw new NotFoundError("Order not found");
    return NextResponse.json({ order: toOrderDetailDto(order) });
  }),
);

// ─── PUT /api/orders/[id] ─────────────────────────────────────

export const PUT = withRequestContext(
  withErrors(async (req: NextRequest, { params }: Params) => {
    const caller = requireRole(req, ["admin", "sales", "office"]);
    const id = parseOrThrow(orderIdParamSchema, (await params).id);
    const { patch, lineReplacement } = parseOrThrow(
      updateOrderBodySchema,
      await req.json().catch(() => null),
    );
    await ordersService.editOrder(
      id,
      patch,
      lineReplacement,
      caller.role!,
      caller.userId!,
    );
    return NextResponse.json({ ok: true }); // service result discarded — wire compat
  }),
);
