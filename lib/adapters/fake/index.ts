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
  createFakeAuditLogRepository,
  fakeAuditLogRepository,
  type FakeAuditLogRepository,
} from "./AuditLogRepository";
export {
  createFakeGeocoder,
  fakeGeocoder,
  type FakeGeocoderSeed,
} from "./Geocoder";
export {
  createFakeProductsRepository,
  fakeProductsRepository,
  type FakeProductSeed,
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
export {
  createFakeHaccpDailyChecksRepository,
  fakeHaccpDailyChecksRepository,
  type FakeHaccpDailyChecksRepository,
  type FakeHaccpDailyChecksSeed,
  type HaccpConflictMethod,
} from "./HaccpDailyChecksRepository";
export {
  createFakeHaccpCorrectiveActionsRepository,
  fakeHaccpCorrectiveActionsRepository,
  type FakeHaccpCorrectiveActionsRepository,
  type FakeHaccpCASeed,
} from "./HaccpCorrectiveActionsRepository";
export {
  createFakeHaccpAssessmentsRepository,
  fakeHaccpAssessmentsRepository,
  type FakeHaccpAssessmentsRepository,
  type FakeHaccpAssessmentsSeed,
} from "./HaccpAssessmentsRepository";
export {
  createFakeHaccpTrainingRepository,
  fakeHaccpTrainingRepository,
  type FakeHaccpTrainingRepository,
  type FakeHaccpTrainingSeed,
} from "./HaccpTrainingRepository";
export {
  createFakeHaccpPeopleRepository,
  fakeHaccpPeopleRepository,
  type FakeHaccpPeopleRepository,
  type FakeHaccpPeopleSeed,
} from "./HaccpPeopleRepository";
export {
  createFakeHaccpReviewsRepository,
  fakeHaccpReviewsRepository,
  type FakeHaccpReviewsRepository,
  type FakeHaccpReviewsSeed,
} from "./HaccpReviewsRepository";
export {
  createFakeHaccpAnnualReviewRepository,
  fakeHaccpAnnualReviewRepository,
  type FakeHaccpAnnualReviewRepository,
  type FakeHaccpAnnualReviewSeed,
} from "./HaccpAnnualReviewRepository";
export {
  createFakeHaccpReportingRepository,
  fakeHaccpReportingRepository,
  type FakeHaccpReportingSeed,
} from "./HaccpReportingRepository";
// F-19 PR9a — Cluster F "docs & lookups" fakes (handbook, suppliers, lookups).
// The suppliers fake is test-inspectable (records writes — R-F-B2).
export {
  createFakeHaccpHandbookRepository,
  fakeHaccpHandbookRepository,
  type FakeHaccpHandbookSeed,
} from "./HaccpHandbookRepository";
export {
  createFakeHaccpSuppliersRepository,
  fakeHaccpSuppliersRepository,
  type FakeHaccpSuppliersRepository,
  type FakeHaccpSuppliersSeed,
} from "./HaccpSuppliersRepository";
export {
  createFakeHaccpLookupsRepository,
  fakeHaccpLookupsRepository,
  type FakeHaccpLookupsSeed,
} from "./HaccpLookupsRepository";
