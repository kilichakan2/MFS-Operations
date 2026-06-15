/**
 * lib/adapters/fake/index.ts
 *
 * Barrel re-export for the Fake adapter package. Import surface:
 *   import {
 *     fakeOrdersRepository,
 *     fakeCustomersRepository,
 *     fakeProductsRepository,
 *     createFakeOrdersRepository,
 *     createFakeCustomersRepository,
 *     createFakeProductsRepository,
 *   } from '@/lib/adapters/fake'
 *
 * Both factories and pre-wired singletons are exported. F-07's
 * unit tests will use the factories (one per test for isolation).
 * The singletons exist only for symmetry with the Supabase barrel.
 */

export {
  createFakeOrdersRepository,
  fakeOrdersRepository,
} from "./OrdersRepository";
export {
  createFakeCustomersRepository,
  fakeCustomersRepository,
} from "./CustomersRepository";
export {
  createFakeProductsRepository,
  fakeProductsRepository,
} from "./ProductsRepository";
export {
  createFakeUsersRepository,
  fakeUsersRepository,
  type FakeUserRow,
  type FakeUserSeed,
} from "./UsersRepository";
export { createFakeLLMExtractor, fakeLLMExtractor } from "./LLMExtractor";
