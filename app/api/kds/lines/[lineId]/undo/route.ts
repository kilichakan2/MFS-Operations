/**
 * app/api/kds/lines/[lineId]/undo/route.ts
 *
 *   POST /api/kds/lines/{lineId}/undo — butcher undoes a done line.
 *
 * F-PROD-02 thin handler, mirror of the sibling `done` route: NO
 * requireRole — the KDS terminal is a shared kiosk (middleware lists
 * /api/kds under PUBLIC_PATHS); the butcher's identity comes from the
 * body and is validated through the Users port inside
 * lib/usecases/kdsLineUndone.ts. Inbound shapes via zod
 * (lib/api/kds/schemas.ts). If the undone line belonged to a completed
 * order, the use-case atomically re-opens the order (completed →
 * printed) inside the OrdersRepository port.
 *
 *   POST body:  { butcher_id: <uuid> }
 *   Success:    200 {ok:true} | {ok:true, reopened:true}
 *                   | {ok:true, already_pending:true}
 *   Failures:   400/403/404 — same statuses as the line-done route.
 *
 * Plan: docs/plans/2026-06-17-f-prod-02-kds-line-undo.md §9
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { withErrors } from "@/lib/errors";
import { withRequestContext } from "@/lib/observability";
import { kdsLineUndoneUsecase } from "@/lib/wiring/orders";
import { parseOrThrow } from "@/lib/api/validate";
import {
  kdsLineIdParamSchema,
  kdsLineUndoneBodySchema,
} from "@/lib/api/kds/schemas";

type Params = { params: Promise<{ lineId: string }> };

export const POST = withRequestContext(
  withErrors(async (req: NextRequest, { params }: Params) => {
    const lineId = parseOrThrow(kdsLineIdParamSchema, (await params).lineId);
    const { butcherId } = parseOrThrow(
      kdsLineUndoneBodySchema,
      await req.json().catch(() => null),
    );
    const result = await kdsLineUndoneUsecase.undoKdsLineDone(
      lineId,
      butcherId,
      new Date(),
    );
    if (result.alreadyPending) {
      return NextResponse.json({ ok: true, already_pending: true });
    }
    if (result.orderReopened) {
      return NextResponse.json({ ok: true, reopened: true });
    }
    return NextResponse.json({ ok: true });
  }),
);
