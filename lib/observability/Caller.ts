/**
 * lib/observability/Caller.ts
 *
 * The `Caller` is the small bundle of identity + correlation data that
 * threads through a single request, from the HTTP boundary into every
 * service/adapter call and onto every log line. It is intentionally
 * minimal — three fields, all immutable, all serialisable.
 *
 * Why `Role` is defined here (and not imported):
 *   The project doesn't yet have a canonical `Role` type — roles live
 *   as string literals in `middleware.ts` (ROLE_PERMISSIONS keys) and
 *   in route handlers (`req.headers.get('x-mfs-user-role')`). A minimal
 *   union is defined here so `Caller` is well-typed today. Mirror of
 *   the roles currently parsed by `middleware.ts`. When the Users +
 *   Auth migration lands (F-13), this canonical type moves to a domain
 *   module (`lib/domain/Role.ts`) and this file will re-import.
 *
 * APOSD lenses applied:
 *   - Information hiding (§4): the correlation-ID propagation rule is
 *     ONE decision encapsulated here + in context.ts + in
 *     withRequestContext.ts. Routes never deal with it.
 *   - Deep module (§3): `Caller` is one short type that the entire
 *     observability surface depends on. Small interface, large effect.
 */

export type Role =
  | "warehouse"
  | "office"
  | "sales"
  | "admin"
  | "driver"
  | "butcher";

/**
 * Runtime allow-list mirror of the `Role` union. Used by `isKnownRole`
 * to filter unsafe `string | null` inputs (e.g. request headers) into
 * the `Role` union.
 *
 * Single source of truth: if a role is added to the union above, it
 * MUST be added here too (and vice versa) — see
 * `tests/unit/observability/Caller.test.ts` which asserts both
 * surfaces enumerate the six known literals.
 *
 * Moved to this file in F-03 from `withRequestContext.ts` to keep the
 * union and its runtime filter together (see header doc above re. the
 * F-13 forward path).
 */
export const KNOWN_ROLES: readonly Role[] = [
  "warehouse",
  "office",
  "sales",
  "admin",
  "driver",
  "butcher",
];

/**
 * Type-predicate: returns `true` iff `v` is a known `Role` literal.
 * Use it at any boundary where untrusted strings (request headers,
 * URL params, cookies) need narrowing into the `Role` union.
 */
export function isKnownRole(v: string | null | undefined): v is Role {
  return (
    v !== null &&
    v !== undefined &&
    (KNOWN_ROLES as readonly string[]).includes(v)
  );
}

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
