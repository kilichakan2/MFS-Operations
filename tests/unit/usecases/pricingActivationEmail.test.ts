/**
 * tests/unit/usecases/pricingActivationEmail.test.ts
 *
 * F-15 PR2 — the activation-email use-case against Fake pricing + Fake users
 * repos. The use-case composes TWO domains (pricing + users) for one job:
 * resolve the full agreement for the email body + the recipient list. It
 * owns the recipient filter (`email` contains '@'), reproducing the old raw
 * query `users?active=eq.true&role=in.(admin,sales,office)&select=name,email`
 * plus pricing-email.ts's `email?.includes('@')` filter.
 */
import { describe, it, expect } from "vitest";
import { createPricingActivationEmail } from "@/lib/usecases/pricingActivationEmail";
import { createPricingService } from "@/lib/services";
import {
  createFakePricingRepository,
  createFakeUsersRepository,
} from "@/lib/adapters/fake";
import type { FakeUserSeed } from "@/lib/adapters/fake/UsersRepository";

const REP_ID = "00000000-0000-0000-0000-000000000a01";
const CUSTOMER_ID = "00000000-0000-0000-0000-000000000c01";
const PRODUCT_ID = "00000000-0000-0000-0000-000000000d01";
const UNKNOWN_ID = "00000000-0000-0000-0000-000000000fff";

const USERS: readonly FakeUserSeed[] = [
  {
    id: "00000000-0000-0000-0000-000000000001",
    name: "Adam Admin",
    role: "admin",
    active: true,
    email: "adam@mfs.com",
  },
  {
    id: "00000000-0000-0000-0000-000000000002",
    name: "Sally Sales",
    role: "sales",
    active: true,
    email: "sally@mfs.com",
  },
  {
    id: "00000000-0000-0000-0000-000000000003",
    name: "Olly Office",
    role: "office",
    active: true,
    email: "olly@mfs.com",
  },
  {
    // active office user with NO email — filtered out
    id: "00000000-0000-0000-0000-000000000004",
    name: "Nomail Office",
    role: "office",
    active: true,
    email: null,
  },
  {
    // inactive sales user — filtered out (activeOnly)
    id: "00000000-0000-0000-0000-000000000005",
    name: "Gone Sales",
    role: "sales",
    active: false,
    email: "gone@mfs.com",
  },
  {
    // warehouse role — not in [admin, sales, office] — filtered out
    id: "00000000-0000-0000-0000-000000000006",
    name: "Wally Warehouse",
    role: "warehouse",
    active: true,
    email: "wally@mfs.com",
  },
  {
    // active admin with an email lacking '@' — filtered out
    id: "00000000-0000-0000-0000-000000000007",
    name: "Bad Admin",
    role: "admin",
    active: true,
    email: "not-an-email",
  },
];

function make() {
  const pricing = createPricingService({
    pricing: createFakePricingRepository({
      people: { [REP_ID]: { id: REP_ID, name: "Sally Sales" } },
      customers: { [CUSTOMER_ID]: { id: CUSTOMER_ID, name: "Acme" } },
      products: {
        [PRODUCT_ID]: {
          id: PRODUCT_ID,
          name: "Lamb",
          boxSize: "10kg",
          code: "LMB",
        },
      },
    }),
  });
  const users = createFakeUsersRepository(USERS);
  const usecase = createPricingActivationEmail({ pricing, users });
  return { usecase, pricing };
}

async function seedAgreement(
  pricing: ReturnType<typeof make>["pricing"],
): Promise<string> {
  const created = await pricing.createAgreement({
    customerId: CUSTOMER_ID,
    prospectName: null,
    agreedBy: REP_ID,
    validFrom: "2026-06-01",
    validUntil: null,
    notes: null,
    lines: [
      {
        productId: PRODUCT_ID,
        productNameOverride: null,
        price: 12.5,
        unit: "per_kg",
        notes: null,
        position: null,
      },
    ],
  });
  return created.id;
}

describe("resolveActivationEmail", () => {
  it("returns null when the agreement does not exist (route skips email)", async () => {
    const { usecase } = make();
    expect(await usecase.resolveActivationEmail(UNKNOWN_ID)).toBeNull();
  });

  it("returns the full agreement + filtered recipients for an existing agreement", async () => {
    const { usecase, pricing } = make();
    const id = await seedAgreement(pricing);
    const result = await usecase.resolveActivationEmail(id);
    expect(result).not.toBeNull();
    expect(result!.agreement.id).toBe(id);
    expect(result!.agreement.customerName).toBe("Acme");
    expect(result!.agreement.lines).toHaveLength(1);
  });

  it("recipient list = active admin/sales/office users with an '@' email only", async () => {
    const { usecase, pricing } = make();
    const id = await seedAgreement(pricing);
    const result = await usecase.resolveActivationEmail(id);
    // Keeps: adam, sally, olly. Drops: null-email office, inactive sales,
    // warehouse role, '@'-less admin.
    expect([...result!.recipients].sort()).toEqual([
      "adam@mfs.com",
      "olly@mfs.com",
      "sally@mfs.com",
    ]);
  });

  it("recipients is a string[] (no nulls leak through the filter)", async () => {
    const { usecase, pricing } = make();
    const id = await seedAgreement(pricing);
    const result = await usecase.resolveActivationEmail(id);
    for (const r of result!.recipients) {
      expect(typeof r).toBe("string");
      expect(r).toContain("@");
    }
  });
});
