/**
 * lib/services/HaccpLookupsService.ts
 *
 * The F-19 PR9a Cluster F "lookups" service — the two read-only HACCP-form
 * selectors (users, customers). Factory here, wiring in `lib/wiring/haccp.ts`;
 * depends on the `lookups` port alone (lint-enforced, ADR-0002 / F-TD-11).
 *
 * The pure logic the 2 routes do today is LIFTED here verbatim:
 *   - getUsers: the admins-first re-sort then `localeCompare` comparator
 *     (users/route.ts:31-35) — a PRESENTATION rule that lives in the service so
 *     the port stays a faithful name-ordered DB read (R-F-B4). Returns { users }.
 *   - getCustomers: the `{ customers }` wrap (customers/route.ts:30).
 */

import type {
  HaccpUserOption,
  HaccpUsersResponse,
  HaccpCustomersResponse,
} from "@/lib/domain";
import type { HaccpLookupsRepository } from "@/lib/ports";

export interface HaccpLookupsServiceDeps {
  readonly lookups: HaccpLookupsRepository;
}

export interface HaccpLookupsService {
  /** GET /api/haccp/users — admins-first then name-sorted; { users }. */
  getUsers(): Promise<HaccpUsersResponse>;
  /** GET /api/haccp/customers — { customers } in name order. */
  getCustomers(): Promise<HaccpCustomersResponse>;
}

export function createHaccpLookupsService(
  deps: HaccpLookupsServiceDeps,
): HaccpLookupsService {
  const { lookups } = deps;

  return {
    async getUsers(): Promise<HaccpUsersResponse> {
      const rows: readonly HaccpUserOption[] = await lookups.listSelectableUsers();
      // users/route.ts:31-35 — admins first, then localeCompare. VERBATIM.
      const users = [...rows].sort((a, b) => {
        if (a.role === "admin" && b.role !== "admin") return -1;
        if (b.role === "admin" && a.role !== "admin") return 1;
        return a.name.localeCompare(b.name);
      });
      return { users };
    },

    async getCustomers(): Promise<HaccpCustomersResponse> {
      const customers = await lookups.listActiveCustomers();
      return { customers };
    },
  };
}
