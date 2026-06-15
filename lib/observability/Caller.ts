/**
 * lib/observability/Caller.ts
 *
 * The `Caller` is the small bundle of identity + correlation data that
 * threads through a single request, from the HTTP boundary into every
 * service/adapter call and onto every log line. It is intentionally
 * minimal — three fields, all immutable, all serialisable.
 *
 * Where `Role` lives now (history):
 *   `Role`, its runtime mirror `KNOWN_ROLES`, and the `isKnownRole`
 *   predicate were DEFINED here from F-03. F-13 PR1 (ARCH-FU-01)
 *   completed the move this file's old docstring promised: the trio
 *   now lives in the domain layer at `lib/domain/Role.ts`, and this
 *   file re-imports + re-exports them so existing
 *   `@/lib/observability/Caller` and `@/lib/observability` consumers
 *   keep working unchanged.
 *
 * APOSD lenses applied:
 *   - Information hiding (§4): the correlation-ID propagation rule is
 *     ONE decision encapsulated here + in context.ts + in
 *     withRequestContext.ts. Routes never deal with it.
 *   - Deep module (§3): `Caller` is one short type that the entire
 *     observability surface depends on. Small interface, large effect.
 */

import { isKnownRole, KNOWN_ROLES, type Role } from "@/lib/domain";

// Re-export the role vocabulary from its new domain home so importers
// of `@/lib/observability/Caller` (and the observability barrel) need
// not change (ARCH-FU-01).
export { isKnownRole, KNOWN_ROLES, type Role };

export interface Caller {
  readonly userId: string | null;
  readonly role: Role | null;
  readonly correlationId: string;
}

/**
 * Pure factory for a `Caller`. No side effects. Defaults `userId` and
 * `role` to `null` when not supplied — observability must work for
 * unauthenticated requests (public paths, kiosk traffic, cron).
 */
export function makeCaller(input: {
  userId?: string | null;
  role?: Role | null;
  correlationId: string;
}): Caller {
  return {
    userId: input.userId ?? null,
    role: input.role ?? null,
    correlationId: input.correlationId,
  };
}
