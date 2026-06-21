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
export {
  createFakeRoutesRepository,
  fakeRoutesRepository,
  type FakeRoutesSeed,
} from "./RoutesRepository";
export {
  createFakePricingRepository,
  fakePricingRepository,
  type FakePricingSeed,
  type FakeCustomerRef,
  type FakePersonRef,
  type FakeProductRef,
} from "./PricingRepository";
export { createFakeLLMExtractor, fakeLLMExtractor } from "./LLMExtractor";
export { createFakeMailer, fakeMailer, type FakeMailerSeed } from "./Mailer";
export {
  createFakeCashRepository,
  fakeCashRepository,
  type FakeCashSeed,
  type FakeCashPersonRef,
  type FakeCashCustomerRef,
} from "./CashRepository";
export {
  createFakeAttachmentStorage,
  fakeAttachmentStorage,
  type FakeAttachmentStorage,
  type FakeUpload,
} from "./AttachmentStorage";
export {
  createFakeComplaintsRepository,
  fakeComplaintsRepository,
  type FakeComplaintsSeed,
  type FakeComplaintsPersonRef,
  type FakeComplaintsCustomerRef,
} from "./ComplaintsRepository";
export {
  createFakeComplimentsRepository,
  fakeComplimentsRepository,
  type FakeComplimentsSeed,
  type FakeComplimentsUserRef,
} from "./ComplimentsRepository";
export {
  createFakeVisitsRepository,
  fakeVisitsRepository,
  type FakeVisitsSeed,
  type FakeVisitsPersonRef,
  type FakeVisitsCustomerRef,
} from "./VisitsRepository";
