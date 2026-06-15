/**
 * lib/domain/Role.ts
 *
 * The canonical `Role` union — the set of staff roles the whole app
 * recognises — plus its runtime allow-list mirror (`KNOWN_ROLES`) and
 * the boundary type-predicate (`isKnownRole`).
 *
 * History: this trio lived at `lib/observability/Caller.ts` from F-03,
 * where that file's docstring recorded the plan that "when the Users +
 * Auth migration lands (F-13), this canonical type moves to a domain
 * module (`lib/domain/Role.ts`)." F-13 PR1 (ARCH-FU-01) is that move.
 * `Caller.ts` now re-imports the union from here, so observability
 * consumers keep working unchanged.
 *
 * Why it belongs in the domain layer: `Role` is a description of the
 * business (who works here, what they may do), not an observability
 * concern. The logging module borrowed it only because it was the
 * first file that needed a typed role. Now that the Users domain owns
 * staff, the role vocabulary lives with the rest of the owned domain
 * types (`Order`, `Customer`, `Product`, `UserSummary`).
 *
 * Single source of truth: if a role is added to the union, it MUST be
 * added to `KNOWN_ROLES` too (and vice versa) — `Role.test.ts` asserts
 * both surfaces enumerate the same literals.
 *
 * Pure TypeScript: no framework import, no vendor import. Primitives only.
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
