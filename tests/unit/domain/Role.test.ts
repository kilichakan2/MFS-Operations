/**
 * tests/unit/domain/Role.test.ts
 *
 * Pins the `Role` union ↔ `KNOWN_ROLES` runtime-mirror parity and the
 * `isKnownRole` boundary predicate, after ARCH-FU-01 moved the trio
 * from `lib/observability/Caller.ts` into the domain layer
 * (`lib/domain/Role.ts`).
 *
 * The role-set assertions that used to live in
 * `tests/unit/observability/Caller.test.ts` are ported here; Caller.test
 * keeps only the `makeCaller` factory-shape cases (plus the type-level
 * Role acceptance/rejection cases that exercise `Caller.role`).
 *
 * This is also the documented template the UsersService suite follows
 * for the domain-type parity style.
 */

import { describe, it, expect } from "vitest";
import { KNOWN_ROLES, isKnownRole, type Role } from "@/lib/domain";

const ALL_ROLES: readonly Role[] = [
  "warehouse",
  "office",
  "sales",
  "admin",
  "driver",
  "butcher",
];

describe("Role union ↔ KNOWN_ROLES mirror", () => {
  it("KNOWN_ROLES enumerates exactly the six known literals", () => {
    expect([...KNOWN_ROLES].sort()).toEqual([...ALL_ROLES].sort());
  });

  it("accepts all six known roles at the type level", () => {
    // Compile-time + runtime: each literal is assignable to Role and
    // recognised by KNOWN_ROLES.
    for (const r of ALL_ROLES) {
      expect(KNOWN_ROLES).toContain(r);
    }
  });

  it("has no duplicate entries", () => {
    expect(new Set(KNOWN_ROLES).size).toBe(KNOWN_ROLES.length);
  });
});

describe("isKnownRole", () => {
  it("returns true for every known role", () => {
    for (const r of ALL_ROLES) {
      expect(isKnownRole(r)).toBe(true);
    }
  });

  it("returns false for an unknown role string", () => {
    expect(isKnownRole("superuser")).toBe(false);
    expect(isKnownRole("ADMIN")).toBe(false); // case-sensitive
  });

  it("returns false for null / undefined", () => {
    expect(isKnownRole(null)).toBe(false);
    expect(isKnownRole(undefined)).toBe(false);
  });

  it("narrows the type when used as a guard", () => {
    const raw: string | null = "butcher";
    if (isKnownRole(raw)) {
      // Inside this branch `raw` is narrowed to Role.
      const role: Role = raw;
      expect(role).toBe("butcher");
    } else {
      throw new Error("expected butcher to be a known role");
    }
  });
});
