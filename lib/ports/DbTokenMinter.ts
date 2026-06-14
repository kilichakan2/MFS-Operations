/**
 * lib/ports/DbTokenMinter.ts
 *
 * The DbTokenMinter port (F-RLS-03, ADR-0007) — mint a short-lived DB
 * identity token for a logged-in user, so a per-request authenticated
 * database client can run as the Postgres `authenticated` role and RLS
 * policies fire.
 *
 * Vendor-free by design: the port speaks only of "a token for this user".
 * It does NOT hand out a SupabaseClient or expose any vendor type — that
 * would leak the vendor across the port boundary (ADR-0002). The concrete
 * crypto (HS256 over a shared secret) lives in the adapter; swapping it is
 * one new adapter + one wiring line.
 *
 * Depth rule (ADR-0002): `mint` hides claim assembly, the standard JWT
 * header/payload shape, base64url encoding, HMAC signing and the fail-closed
 * secret check. Callers see "a string token for this user", nothing else.
 */

export interface DbTokenMinter {
  /**
   * Mint a short-lived HS256 JWT carrying
   * `{ role: 'authenticated', sub, user_id }` for the given user.
   *
   * @returns A standard 3-segment compact JWT
   *   (`header.payload.signature`) PostgREST can verify.
   * @throws  If the signing secret is unavailable (fail closed — never
   *   mint an unsigned identity token).
   */
  mint(claims: { userId: string }): Promise<string>;
}
