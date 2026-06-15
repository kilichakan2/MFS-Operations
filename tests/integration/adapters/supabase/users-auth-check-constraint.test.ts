/**
 * tests/integration/adapters/supabase/users-auth-check-constraint.test.ts
 *
 * ANVIL F-13 PR1 — proves the `users_auth_check` DB CHECK constraint
 * actually FIRES at the Postgres layer, not just in app code.
 *
 * The matrix for F-13 PR1 requires that a wrong-credential-column write is
 * rejected by Postgres itself:
 *   - admin   ⇒ password_hash NOT NULL  (a pin-only admin must be rejected)
 *   - non-admin ⇒ pin_hash    NOT NULL  (a password-only PIN user rejected)
 *
 * The shared UsersRepository contract proves the adapter *clears the other
 * column on a VALID write* (R5). It does NOT attempt an INVALID write — so
 * the DB-level guarantee is unproven by the contract. This file closes that
 * gap with two negative writes performed DIRECTLY through the service client
 * (the typed adapter input cannot construct an illegal combination, so we go
 * around it to exercise the constraint). A successful control write confirms
 * the row shape is otherwise valid, isolating the rejection to the
 * credential-column rule.
 *
 * Hygiene: every fabricated row uses the ANVIL-TEST- prefix and a unique
 * suffix; afterEach deletes exactly those names. Rejected inserts leave no
 * row (Postgres rolls the failed statement back), but the control row and any
 * accidental survivors are cleaned regardless. LOCAL Supabase only — the
 * shared _setup identity probe + .env.test.local invariant guarantee the
 * target is local Postgres, never prod.
 */
import { describe, it, expect, afterEach } from "vitest";
import { getServiceClient, TEST_PREFIX } from "../../_setup";

const CONSTRAINT = "users_auth_check";
const PLACEHOLDER_HASH =
  "$2a$10$ANVILTESTCONSTRAINTHASHXXXXXXXXXXXXXXXXXXXXXXXXXXX";

describe("users_auth_check DB constraint (F-13 PR1)", () => {
  const client = getServiceClient();
  const createdNames: string[] = [];

  function freshName(label: string): string {
    const name = `${TEST_PREFIX}authchk-${label}-${Date.now()}-${createdNames.length}`;
    createdNames.push(name);
    return name;
  }

  afterEach(async () => {
    if (createdNames.length === 0) return;
    await client.from("users").delete().in("name", createdNames);
    createdNames.length = 0;
  });

  it("REJECTS an admin row whose password_hash is NULL (pin only)", async () => {
    const name = freshName("admin-pinonly");
    const { error } = await client.from("users").insert({
      name,
      role: "admin",
      active: true,
      password_hash: null, // ← illegal for an admin
      pin_hash: PLACEHOLDER_HASH,
    });
    expect(error).not.toBeNull();
    // Postgres surfaces a CHECK violation as code 23514 and names the
    // constraint — assert it is THIS constraint that fired, not some other.
    expect(error?.code).toBe("23514");
    expect(error?.message).toContain(CONSTRAINT);
  });

  it("REJECTS a non-admin row whose pin_hash is NULL (password only)", async () => {
    const name = freshName("warehouse-pwonly");
    const { error } = await client.from("users").insert({
      name,
      role: "warehouse",
      active: true,
      password_hash: PLACEHOLDER_HASH,
      pin_hash: null, // ← illegal for a non-admin
    });
    expect(error).not.toBeNull();
    expect(error?.code).toBe("23514");
    expect(error?.message).toContain(CONSTRAINT);
  });

  it("ACCEPTS a correctly-credentialed non-admin row (control)", async () => {
    // Proves the two rejections above are the credential rule firing, not a
    // generally-broken insert: the same row with the role-matching column set
    // is accepted.
    const name = freshName("warehouse-ok");
    const { data, error } = await client
      .from("users")
      .insert({
        name,
        role: "warehouse",
        active: true,
        password_hash: null,
        pin_hash: PLACEHOLDER_HASH, // ← legal for a non-admin
      })
      .select("id, name")
      .single();
    expect(error).toBeNull();
    expect(data?.name).toBe(name);
  });
});
