/**
 * app/api/kds/lines/[lineId]/done/route.ts
 *
 *   POST /api/kds/lines/{lineId}/done — butcher marks a line done.
 *
 * F-08 thin handler: NO requireRole — the KDS terminal is a shared
 * kiosk (middleware lists /api/kds under PUBLIC_PATHS); the butcher's
 * identity comes from the body and is validated through the Users
 * port inside lib/usecases/kdsLineDone.ts. Inbound shapes via zod
 * (lib/api/kds/schemas.ts). When all lines are done the use-case
 * auto-completes the order (race-safe inside OrdersService).
 *
 *   POST body:  { butcher_id: <uuid> }
 *   Success:    200 {ok:true} | {ok:true, completed:true}
 *                   | {ok:true, already_done:true}
 *   Failures:   400/403/404/409 — same statuses as the legacy route.
 *
 * One deliberate change (plan §10.6): if the final auto-complete
 * write fails at the DB, the legacy route replied
 * `{ok:true, completion_failed:true}`; the ServiceError now surfaces
 * as an honest 500 the operator can investigate. (The line tap
 * itself is still recorded first; the next poll reconciles the tile.)
 *
 * Plan: docs/plans/2026-06-11-f-08-orders-route-rewrites.md
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { withErrors } from "@/lib/errors";
import { withRequestContext } from "@/lib/observability";
import { kdsLineDoneUsecase } from "@/lib/usecases/kdsLineDone";
import { parseOrThrow } from "@/lib/api/validate";
import {
  kdsLineIdParamSchema,
  kdsLineDoneBodySchema,
} from "@/lib/api/kds/schemas";

type Params = { params: Promise<{ lineId: string }> };

export const POST = withRequestContext(
  withErrors(async (req: NextRequest, { params }: Params) => {
    const lineId = parseOrThrow(kdsLineIdParamSchema, (await params).lineId);
    const { butcherId } = parseOrThrow(
      kdsLineDoneBodySchema,
      await req.json().catch(() => null),
    );
    const result = await kdsLineDoneUsecase.completeKdsLineDone(
      lineId,
      butcherId,
      new Date(),
    );
    if (result.alreadyDone) {
      return NextResponse.json({ ok: true, already_done: true });
    }
    if (result.completed) {
      return NextResponse.json({ ok: true, completed: true });
    }
    return NextResponse.json({ ok: true });
  }),
);
