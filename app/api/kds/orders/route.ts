/**
 * app/api/kds/orders/route.ts
 *
 *   GET /api/kds/orders — the live KDS queue (kitchen screen poll).
 *
 * F-08 thin handler: NO requireRole — the KDS device is a shared
 * kiosk in a physical-access-controlled room; middleware lists
 * /api/kds under PUBLIC_PATHS (unchanged access model, plan §5 D4).
 * Data assembly in lib/usecases/kdsQueue.ts (snapshot + batched
 * product map), wire translation in lib/api/kds/dto.ts — including
 * the per-line `product: {id, name}` embed and the orange-flash
 * events the screen was built to read.
 *
 * Plan: docs/plans/2026-06-11-f-08-orders-route-rewrites.md
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { withErrors } from "@/lib/errors";
import { withRequestContext } from "@/lib/observability";
import { kdsQueueUsecase } from "@/lib/wiring/orders";
import { toKdsQueueResponse } from "@/lib/api/kds/dto";

export const GET = withRequestContext(
  withErrors(async (_req: NextRequest) => {
    // Completed orders stay visible for 90s (the "just finished"
    // fade-out); the 60s flash window lives inside the port.
    const since = new Date(Date.now() - 90_000);
    const bundle = await kdsQueueUsecase.getKdsQueue(since);
    return NextResponse.json(toKdsQueueResponse(bundle));
  }),
);
