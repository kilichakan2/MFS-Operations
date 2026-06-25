/**
 * lib/ports/HaccpLookupsRepository.ts
 *
 * The F-19 PR9a Cluster F "lookups" persistence port — the interface the app owns
 * over the two read-only HACCP-form selectors: active users (filtered to 3 roles)
 * and active customers. Pure TypeScript: imports domain types only, never an
 * adapter or a vendor SDK.
 *
 * Deliberately NOT the F-13 auth-context `UsersRepository` (credentials/lockout)
 * nor the Orders `CustomersRepository` (read-by-id) — this is a HACCP-form
 * selector that owns its own narrow read (cross-domain coupling avoided, R-F-D1).
 *
 * Boundary discipline (ADR-0002): the adapter runs the `.select()` chains and
 * maps rows → domain types. The users read is a FAITHFUL DB read (name-ordered);
 * the admins-first re-sort is a presentation rule the SERVICE owns (R-F-B4).
 */

import type { HaccpUserOption, HaccpCustomerOption } from "@/lib/domain";

export interface HaccpLookupsRepository {
  /**
   * Active users in roles [admin, warehouse, butcher], ordered by name. The
   * admins-first re-sort lives in the SERVICE — this stays a faithful DB read.
   */
  listSelectableUsers(): Promise<readonly HaccpUserOption[]>;
  /** Active customers, id+name only, ordered by name. */
  listActiveCustomers(): Promise<readonly HaccpCustomerOption[]>;
}
