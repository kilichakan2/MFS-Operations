/**
 * lib/observability/withRequestContext.ts
 *
 * Higher-Order-Function for Next.js App Router route handlers. Reads
 * (or generates) the correlation ID, builds the `Caller`, and runs
 * the wrapped handler inside the ALS context so every nested await
 * sees `getCaller()` non-undefined.
 *
 * What this hides:
 *   Correlation-ID derivation, caller construction from middleware
 *   headers, ALS binding, and response-header echoing — all packaged
 *   behind a single identifier. Route authors write a normal handler;
 *   the HOF does the plumbing.
 *
 * When to use it: every route handler from F-08 onward, wrapped as
 * the OUTERMOST composition layer:
 *
 *   export const POST = withRequestContext(withErrors(async (req) => {
 *     return NextResponse.json({ ... })
 *   }))
 *
 * withRequestContext is OUTSIDE withErrors so the caller is bound
 * before withErrors logs anything via the structured logger.
 *
 * Caller derivation: reads the `x-mfs-user-id` and `x-mfs-user-role`
 * headers set by middleware.ts. If absent (public paths, kiosk
 * requests, cron), the caller has null userId+role and the correlation
 * ID still flows. This is deliberate — observability should not require
 * authentication.
 *
 * Correlation ID:
 *   - reads `x-request-id` (case-insensitive) if present, length 1..128
 *   - else generates `crypto.randomBytes(8).toString('hex')` (16 chars)
 *   - echoes the chosen ID back on the response as `x-request-id`
 *     (idempotent — only sets if the inner handler didn't already)
 *
 * Runtime: Node only. See context.ts header. Do NOT mark a wrapped
 * route `export const runtime = 'edge'`.
 */

import { NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { makeCaller, isKnownRole } from "./Caller";
import { runWithCaller } from "./context";

export type RouteHandler<Args extends unknown[] = []> = (
  req: NextRequest,
  ...rest: Args
) => Promise<Response>;

function deriveCorrelationId(req: NextRequest): string {
  const hdr = req.headers.get("x-request-id")?.trim();
  if (hdr && hdr.length > 0 && hdr.length <= 128) return hdr;
  return randomBytes(8).toString("hex");
}

export function withRequestContext<Args extends unknown[]>(
  handler: RouteHandler<Args>,
): RouteHandler<Args> {
  return async (req: NextRequest, ...rest: Args): Promise<Response> => {
    const correlationId = deriveCorrelationId(req);
    const userId = req.headers.get("x-mfs-user-id") || null;
    const roleHdr = req.headers.get("x-mfs-user-role");
    const role = isKnownRole(roleHdr) ? roleHdr : null;

    const caller = makeCaller({ userId, role, correlationId });

    const res = await runWithCaller(caller, () => handler(req, ...rest));
    // Echo correlation ID on outgoing response (idempotent: only set if absent).
    if (!res.headers.has("x-request-id")) {
      res.headers.set("x-request-id", correlationId);
    }
    return res;
  };
}
