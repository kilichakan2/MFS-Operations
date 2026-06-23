/**
 * lib/ports/index.ts
 *
 * Barrel re-export for the ports layer. Import surface for callers:
 *   import { OrdersRepository, CustomersRepository, ProductsRepository } from '@/lib/ports'
 *
 * Re-exports interfaces only — no runtime values. Ports are pure
 * descriptions of how the app talks to the outside world.
 */
export type {
  OrdersRepository,
  KdsOrderQueueSnapshot,
  KdsFlashEvent,
} from "./OrdersRepository";
export type { CustomersRepository } from "./CustomersRepository";
export type { ProductsRepository } from "./ProductsRepository";
export type {
  UsersRepository,
  ListUsersByRolesOptions,
  ListCredentialsByRolesOptions,
} from "./UsersRepository";
export type { RoutesRepository, ListRoutesFilter } from "./RoutesRepository";
export type {
  PricingRepository,
  ListAgreementsFilter,
} from "./PricingRepository";
export type { SessionTokens } from "./SessionTokens";
export type { DbTokenMinter } from "./DbTokenMinter";
export type { PasswordHasher } from "./PasswordHasher";
export type { LLMExtractor } from "./LLMExtractor";
// LLMExtractionError is a runtime value (a class), not a type — value export.
export { LLMExtractionError } from "./LLMExtractor";
export type { Mailer, EmailMessage, SendResult } from "./Mailer";
export type {
  PdfRenderer,
  PriceAgreementPdfData,
  PriceAgreementPdfLine,
} from "./PdfRenderer";
export type {
  LatLng,
  MapPin,
  MapPinKind,
  MapPopup,
  MapLine,
  MapViewport,
  MapScene,
  MapCanvasProps,
} from "./MapProvider";
export type { CashRepository } from "./CashRepository";
export type { AttachmentStorage } from "./AttachmentStorage";
export type { ComplaintsRepository } from "./ComplaintsRepository";
export type { ComplimentsRepository } from "./ComplimentsRepository";
export type { VisitsRepository } from "./VisitsRepository";
export type { HaccpDailyChecksRepository } from "./HaccpDailyChecksRepository";
export type { HaccpCorrectiveActionsRepository } from "./HaccpCorrectiveActionsRepository";
export type { HaccpAssessmentsRepository } from "./HaccpAssessmentsRepository";
export type { HaccpTrainingRepository } from "./HaccpTrainingRepository";
export type { HaccpPeopleRepository } from "./HaccpPeopleRepository";
