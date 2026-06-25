/**
 * tests/unit/services/HaccpLookupsService.test.ts
 *
 * F-19 PR9a — the Cluster F "lookups" service against the Fake repo.
 *
 * Pins:
 *   - getUsers: admins-first then localeCompare (the route comparator) — R-F-B4;
 *     shape { users: [{ id, name, role }] }.
 *   - getCustomers: { customers: [{ id, name }] } in repo order; empty → [].
 */
import { describe, it, expect } from "vitest";
import { createHaccpLookupsService } from "@/lib/services";
import { createFakeHaccpLookupsRepository } from "@/lib/adapters/fake";
import type { HaccpUserOption, HaccpCustomerOption } from "@/lib/domain";

describe("HaccpLookupsService — getUsers", () => {
  it("admins first, then name-sorted (localeCompare) — R-F-B4", async () => {
    // Repo returns name-ordered (DB order): Ada(wh), Bob(admin), Zoe(admin).
    const users: HaccpUserOption[] = [
      { id: "1", name: "Ada", role: "warehouse" },
      { id: "2", name: "Bob", role: "admin" },
      { id: "3", name: "Zoe", role: "admin" },
    ];
    const repo = createFakeHaccpLookupsRepository({ users });
    const svc = createHaccpLookupsService({ lookups: repo });

    const res = await svc.getUsers();
    expect(res.users.map((u) => u.name)).toEqual(["Bob", "Zoe", "Ada"]);
    expect(Object.keys(res.users[0])).toEqual(["id", "name", "role"]);
  });

  it("empty → { users: [] }", async () => {
    const repo = createFakeHaccpLookupsRepository({});
    const svc = createHaccpLookupsService({ lookups: repo });
    expect(await svc.getUsers()).toEqual({ users: [] });
  });
});

describe("HaccpLookupsService — getCustomers", () => {
  it("{ customers } in repo order", async () => {
    const customers: HaccpCustomerOption[] = [
      { id: "1", name: "Alpha" },
      { id: "2", name: "Beta" },
    ];
    const repo = createFakeHaccpLookupsRepository({ customers });
    const svc = createHaccpLookupsService({ lookups: repo });
    expect(await svc.getCustomers()).toEqual({ customers });
  });

  it("empty → { customers: [] }", async () => {
    const repo = createFakeHaccpLookupsRepository({});
    const svc = createHaccpLookupsService({ lookups: repo });
    expect(await svc.getCustomers()).toEqual({ customers: [] });
  });
});
