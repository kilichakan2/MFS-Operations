/**
 * lib/domain/HaccpLookups.ts
 *
 * Domain types for the F-19 PR9a Cluster F "lookups" hexagon — the two read-only
 * selectors HACCP forms feed their drop-downs from: active users
 * (id, name, role, filtered to 3 roles) and active customers (id, name).
 *
 * Pure TypeScript: no framework imports, no vendor imports.
 *
 * ⚠ NAMING (Step 1 collision guard): the domain barrel already exports
 * `HaccpUserRef` (from HaccpPeople). These selector options are prefixed
 * `Haccp…Option` to avoid any clash — they are a HACCP-FORM selector, distinct
 * from the F-13 auth-context `UserSummary` and the Orders `Customer`.
 *
 * Boundary discipline (ADR-0002): the row types mirror each route's `.select`
 * columns (snake_case for `role`; the rest are already camelCase-safe). The
 * `…Response` types pin the EXACT route response objects.
 */

// ─── users selector ──────────────────────────────────────────────────────────

/**
 * A selectable HACCP user — verbatim `.select` columns (users/route.ts:23):
 * 'id, name, role'. `.in('role', ['admin','warehouse','butcher'])`, active=true,
 * ordered by name; the SERVICE re-sorts admins-first (a presentation rule).
 */
export interface HaccpUserOption {
  readonly id: string;
  readonly name: string;
  readonly role: string;
}

/**
 * The EXACT GET /api/haccp/users response shape (users/route.ts:37). Key: users.
 * The list is admins-first then name-sorted (the service applies the comparator).
 */
export interface HaccpUsersResponse {
  readonly users: readonly HaccpUserOption[];
}

// ─── customers selector ──────────────────────────────────────────────────────

/**
 * A selectable HACCP customer — verbatim `.select` columns
 * (customers/route.ts:21): 'id, name'. active=true, ordered by name.
 */
export interface HaccpCustomerOption {
  readonly id: string;
  readonly name: string;
}

/**
 * The EXACT GET /api/haccp/customers response shape (customers/route.ts:30).
 * Key: customers.
 */
export interface HaccpCustomersResponse {
  readonly customers: readonly HaccpCustomerOption[];
}
