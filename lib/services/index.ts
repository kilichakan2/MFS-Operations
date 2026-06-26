/**
 * lib/services/index.ts
 *
 * Barrel re-export for the services package. Import surface:
 *   import { createOrdersService, type OrdersService }
 *     from '@/lib/services'
 *
 * Factory + types only. Production singletons live in the composition
 * root `lib/wiring/orders.ts` (F-TD-11) — routes import them from
 * there. Tests import the factory and pass Fake adapters.
 */
export {
  createOrdersService,
  type OrdersService,
  type OrdersServiceRepos,
} from "./OrdersService";
export {
  createUsersService,
  type UsersService,
  type UsersServiceDeps,
} from "./UsersService";
export {
  createCustomersService,
  type CustomersService,
  type CustomersServiceDeps,
} from "./CustomersService";
export {
  createProductsService,
  type ProductsService,
  type ProductsServiceDeps,
} from "./ProductsService";
export {
  createRoutesService,
  type RoutesService,
  type RoutesServiceDeps,
  type WeekRuns,
} from "./RoutesService";
export {
  createPricingService,
  type PricingService,
  type PricingServiceDeps,
} from "./PricingService";
export {
  createCashService,
  type CashService,
  type CashServiceDeps,
} from "./CashService";
export {
  createComplaintsService,
  type ComplaintsService,
  type ComplaintsServiceDeps,
} from "./ComplaintsService";
export {
  createComplimentsService,
  type ComplimentsService,
  type ComplimentsServiceDeps,
} from "./ComplimentsService";
export {
  createVisitsService,
  type VisitsService,
  type VisitsServiceDeps,
} from "./VisitsService";
export {
  createHaccpDailyChecksService,
  DISPOSITION_MAP,
  type HaccpDailyChecksService,
  type HaccpDailyChecksServiceDeps,
  type DeliveryBuildResult,
  type ColdStorageBuildResult,
} from "./HaccpDailyChecksService";
export {
  createHaccpCorrectiveActionsService,
  type HaccpCorrectiveActionsService,
  type HaccpCorrectiveActionsServiceDeps,
} from "./HaccpCorrectiveActionsService";
export {
  createHaccpAssessmentsService,
  type HaccpAssessmentsService,
  type HaccpAssessmentsServiceDeps,
  type RunMonthlyReviewResult,
} from "./HaccpAssessmentsService";
export {
  createHaccpTrainingService,
  type HaccpTrainingService,
  type HaccpTrainingServiceDeps,
} from "./HaccpTrainingService";
export {
  createHaccpPeopleService,
  type HaccpPeopleService,
  type HaccpPeopleServiceDeps,
} from "./HaccpPeopleService";
export {
  createHaccpReviewsService,
  type HaccpReviewsService,
  type HaccpReviewsServiceDeps,
} from "./HaccpReviewsService";
export {
  createHaccpAnnualReviewService,
  type HaccpAnnualReviewService,
  type HaccpAnnualReviewServiceDeps,
} from "./HaccpAnnualReviewService";
export {
  createHaccpReportingService,
  type HaccpReportingService,
  type HaccpReportingServiceDeps,
} from "./HaccpReportingService";
// F-19 PR9a — Cluster F "docs & lookups" service factories (handbook, suppliers,
// lookups). Factories only — singletons live in lib/wiring/haccp.ts.
export {
  createHaccpHandbookService,
  type HaccpHandbookService,
  type HaccpHandbookServiceDeps,
  type HandbookReject,
} from "./HaccpHandbookService";
export {
  createHaccpSuppliersService,
  type HaccpSuppliersService,
  type HaccpSuppliersServiceDeps,
  type SuppliersReject,
} from "./HaccpSuppliersService";
export {
  createHaccpLookupsService,
  type HaccpLookupsService,
  type HaccpLookupsServiceDeps,
} from "./HaccpLookupsService";
