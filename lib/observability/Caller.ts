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
  | 'warehouse'
  | 'office'
  | 'sales'
  | 'admin'
  | 'driver'
  | 'butcher'

export interface Caller {
  readonly userId:        string | null
  readonly role:          Role   | null
  readonly correlationId: string
}

/**
 * Pure factory for a `Caller`. No side effects. Defaults `userId` and
 * `role` to `null` when not supplied — observability must work for
 * unauthenticated requests (public paths, kiosk traffic, cron).
 */
export function makeCaller(input: {
  userId?:        string | null
  role?:          Role   | null
  correlationId:  string
}): Caller {
  return {
    userId:        input.userId        ?? null,
    role:          input.role          ?? null,
    correlationId: input.correlationId,
  }
}
