/**
 * lib/ports/InsertOneResult.ts
 *
 * Outcome of a single-row insert that must NOT abort a batch (import/manual).
 *
 * Shared by CustomersRepository.insertOne and ProductsRepository.insertOne so
 * neither port has to import the other (one table = one repository; the result
 * type lives on its own).
 *
 * 'inserted'  → counted as inserted.
 * 'duplicate' → Postgres 23505 (unique_violation); skipped SILENTLY — defines
 *               the duplicate error out of existence (never throws on 23505).
 * 'error'     → any OTHER DB error; the adapter has ALREADY logged it, and
 *               passes the message string (NOT the vendor error object) so the
 *               route can reproduce today's `console.error(..., error.message)`
 *               + skip behaviour without the vendor shape leaking past the
 *               adapter boundary.
 */
export type InsertOneResult =
  | { outcome: "inserted" }
  | { outcome: "duplicate" }
  | { outcome: "error"; message: string };
