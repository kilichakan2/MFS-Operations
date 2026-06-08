/**
 * lib/ports/CustomersRepository.ts
 *
 * The Customers port — minimal, Orders-scoped. F-13 (Users + Auth)
 * may extend; F-20 Admin will own the full Customers CRUD when the
 * admin domain gets rewritten.
 *
 * Why only one method:
 *   Orders' use of Customers is read-only and lookup-by-id only. The
 *   route at `app/api/orders/route.ts:104-115` does exactly one
 *   thing: fetch a customer by id, then check `customer.active`.
 *   That is the entire port surface F-05 needs to define. Adding
 *   more methods now (e.g. `listCustomers`, `searchCustomers`) would
 *   be speculative generality (APOSD § "general-purpose by
 *   accident") — F-20 Admin will add them when the admin CRUD over
 *   Customers gets rewritten.
 *
 * ADR-0002 contract honoured: same as OrdersRepository (depth rule,
 * vendor-types-never-cross, define-errors-out-of-existence on reads).
 */

import type { Customer } from "@/lib/domain";

export interface CustomersRepository {
  /**
   * Read a customer by id.
   *
   * What this hides:
   *   - The column projection (id, name, postcode, active) — callers
   *     do not write a SELECT.
   *   - The `.single()` semantics — adapter returns domain `null` on
   *     no match.
   *
   * Caller responsibility:
   *   The caller (today: `app/api/orders/route.ts:113-115`; tomorrow:
   *   `OrdersService.createOrder`) checks `customer.active === false`
   *   and surfaces a `ValidationError` (or domain-specific
   *   `CustomerInactiveError` if F-17 / F-20 ever introduces one).
   *   The port does not pre-filter on `active` because the routes
   *   that *display* a customer (without creating an order) need to
   *   see inactive customers in the list.
   *
   * @returns The customer if found; `null` on no match. APOSD § 11.
   * @throws  ServiceError on DB failure.
   */
  findCustomerById(id: string): Promise<Customer | null>;
}
