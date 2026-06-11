/**
 * app/api/orders/[id]/picking-list/route.ts
 *
 *   GET  /api/orders/[id]/picking-list  — fetch + render only
 *   POST /api/orders/[id]/picking-list  — print: render + transition
 *                                         state to 'printed'
 *
 * F-08 thin handlers: auth via requireRole, param validation via zod,
 * data assembly in lib/usecases/pickingList.ts (orders engine +
 * product catalogue + staff list), wire translation via
 * toPickingListData, HTML via renderPickingListHtml (pure
 * presentation — allowed at the route layer per the locked spec).
 * No vendor imports, no try/catch.
 *
 * Status note: printing a completed order is now 409 CONFLICT (the
 * order's state collides), not the legacy 403. Plan §10.5.
 *
 * Plan: docs/plans/2026-06-11-f-08-orders-route-rewrites.md
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { withErrors } from "@/lib/errors";
import { withRequestContext } from "@/lib/observability";
import { pickingListUsecase } from "@/lib/usecases/pickingList";
import { parseOrThrow } from "@/lib/api/validate";
import { orderIdParamSchema } from "@/lib/api/orders/schemas";
import { toPickingListData } from "@/lib/api/orders/dto";
import { renderPickingListHtml } from "@/lib/orders/pickingList";

type Params = { params: Promise<{ id: string }> };

function htmlResponse(html: string): NextResponse {
  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

// ─── GET /api/orders/[id]/picking-list ────────────────────────

export const GET = withRequestContext(
  withErrors(async (req: NextRequest, { params }: Params) => {
    const caller = requireRole(req, [
      "admin",
      "sales",
      "office",
      "warehouse",
      "butcher",
    ]);
    const id = parseOrThrow(orderIdParamSchema, (await params).id);
    const assembly = await pickingListUsecase.previewPickingList(
      id,
      caller.userId!,
    );
    return htmlResponse(renderPickingListHtml(toPickingListData(assembly)));
  }),
);

// ─── POST /api/orders/[id]/picking-list ───────────────────────

export const POST = withRequestContext(
  withErrors(async (req: NextRequest, { params }: Params) => {
    const caller = requireRole(req, ["admin", "office", "warehouse"]);
    const id = parseOrThrow(orderIdParamSchema, (await params).id);
    const assembly = await pickingListUsecase.printPickingList(
      id,
      caller.userId!,
      new Date(),
    );
    return htmlResponse(renderPickingListHtml(toPickingListData(assembly)));
  }),
);
