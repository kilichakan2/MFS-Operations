/**
 * lib/auth/session.ts
 *
 * Procedural role-check helper for Next.js App Router route handlers.
 *
 * What this hides:
 *   - Reading the four x-mfs-* request headers middleware.ts sets at
 *     :142-145 (x-mfs-user-id, x-mfs-user-role, x-mfs-secondary-roles).
 *   - Filtering unknown role strings via the shared `isKnownRole`
 *     type-predicate.
 *   - Enforcing the multi-role permission check verbatim from
 *     middleware.ts:128, 152-154 — union of primary + secondaries
 *     (with the secondary-admin literal filtered out), intersection
 *     with the route's `allowedRoles`.
 *   - Throwing typed AppError subclasses (UnauthorizedError 401,
 *     ForbiddenError 403) so the framework HOF translates them to
 *     HTTP responses automatically.
 *   - Constructing the F-FND-03 `Caller` shape from the request
 *     headers, so the caller is bound for any downstream
 *     `withRequestContext`-aware log line on the same request.
 *
 * When to use it: every route handler that needs role-based
 * authorisation. Wrap the call as the FIRST step inside the handler:
 *
 *   export const POST = withRequestContext(withErrors(async (req) => {
 *     const caller = requireRole(req, ['admin', 'office'])
 *     // ... business logic ...
 *     return NextResponse.json({ ok: true })
 *   }))
 *
 * The helper does NOT verify JWTs, does NOT touch the DB, and does
 * NOT replace `withRequestContext`'s caller binding (the two
 * mechanisms coexist — withRequestContext binds the caller into ALS;
 * requireRole returns a freshly-constructed Caller for the
 * handler's local use).
 *
 * Secondary-roles posture (preserved verbatim from middleware.ts:128):
 *   - The PRIMARY role is checked as-is.
 *   - The SECONDARY role list has `'admin'` filtered out before union.
 *     A secondary-admin is a "ghost" elevation that middleware
 *     explicitly ignores; this helper preserves that safety rule.
 *   - The primary `'admin'` is NOT filtered out — only the secondary
 *     `'admin'` literal is stripped.
 *
 * Throws:
 *   - UnauthorizedError (401, code 'UNAUTHORIZED') if no identity is
 *     present (missing/empty x-mfs-user-id, OR missing/unknown
 *     x-mfs-user-role).
 *   - ForbiddenError (403, code 'FORBIDDEN') if identity is present
 *     but no role in [primary, ...filteredSecondaries] is in
 *     allowedRoles.
 *
 * Returns (success): the existing F-FND-03 `Caller` shape — three
 * fields: { userId, role, correlationId }. Secondary roles are used
 * internally for the permission check ONLY and are deliberately NOT
 * exposed on the returned Caller (Gate 1 Q5 decision: keep the Caller
 * surface stable; secondaryRoles are a header-layer concern, not a
 * domain-identity concern).
 *
 * F-03 ships this helper unused. Adopter PRs migrate the 80+/104
 * existing role-check sites incrementally inside their owning
 * domain's PR.
 */
import { NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { makeCaller, type Caller } from "@/lib/observability/Caller";
import { isKnownRole, type Role } from "@/lib/domain";
import { UnauthorizedError, ForbiddenError } from "@/lib/errors";

export function requireRole(
  req: NextRequest,
  allowedRoles: readonly Role[],
): Caller {
  // 1) Identity headers (set by middleware.ts:142-145).
  const userId = req.headers.get("x-mfs-user-id")?.trim() || null;
  const roleHdr = req.headers.get("x-mfs-user-role");
  const role = isKnownRole(roleHdr) ? roleHdr : null;

  // 2) No identity? 401 UNAUTHORIZED.
  if (userId === null || role === null) {
    throw new UnauthorizedError("Authentication required.");
  }

  // 3) Build the role union, mirroring middleware.ts:128.
  //    Primary role: kept as-is.
  //    Secondary roles: each filtered through isKnownRole, then the
  //    'admin' literal stripped (the "ghost admin" safety rule).
  const secondariesRaw = (req.headers.get("x-mfs-secondary-roles") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const secondaries: Role[] = secondariesRaw
    .filter(isKnownRole)
    .filter((r): r is Role => r !== "admin");
  const union: readonly Role[] = [role, ...secondaries];

  // 4) Intersect with allowedRoles. 403 FORBIDDEN if no overlap.
  const allowed = union.some((r) => allowedRoles.includes(r));
  if (!allowed) {
    throw new ForbiddenError("Role does not permit this action.");
  }

  // 5) Construct + return the Caller.
  //    correlationId: same logic as withRequestContext.ts:59-63 —
  //    reuse `x-request-id` if present and 1..128 chars, otherwise
  //    generate a fresh 16-char hex id. If `withRequestContext` has
  //    already run on this request, the header has been left intact
  //    and we read the same id it bound to ALS; if it hasn't run,
  //    the freshly-generated id is still valid for this Caller.
  const cidHdr = req.headers.get("x-request-id")?.trim();
  const correlationId =
    cidHdr && cidHdr.length > 0 && cidHdr.length <= 128
      ? cidHdr
      : randomBytes(8).toString("hex");

  return makeCaller({ userId, role, correlationId });
}
