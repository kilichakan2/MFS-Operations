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
export type { AuditLogRepository } from "./AuditLogRepository";
export type { InsertOneResult } from "./InsertOneResult";
// F-20 PR3 — re-export the two Map View presentation types through the ports
// barrel. They physically live in lib/services/mapScene.ts (the route's locked
// re-export line is preserved); the ports already type-import them at the
// boundary. Re-exporting here lets lib/services/MapDataService.ts depend on the
// PORT for these types instead of importing another service file directly (the
// F-TD-05 services-fence forbids a service→service import; "depend on the other
// domain's PORT" is exactly what the lint rule instructs). Type-only, no runtime.
export type { MapCustomer, MapVisit } from "@/lib/services/mapScene";
export type { Geocoder } from "./Geocoder";
// GeocoderError is a runtime value (a class), not a type — value export.
export { GeocoderError } from "./Geocoder";
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
// F-21 — Discrepancies port (dashboard Zone 2/3 + detail/discrepancy).
export type {
  DiscrepanciesRepository,
  DiscrepancyWindow,
} from "./DiscrepanciesRepository";
export type { HaccpDailyChecksRepository } from "./HaccpDailyChecksRepository";
export type { HaccpCorrectiveActionsRepository } from "./HaccpCorrectiveActionsRepository";
export type { HaccpAssessmentsRepository } from "./HaccpAssessmentsRepository";
export type { HaccpTrainingRepository } from "./HaccpTrainingRepository";
export type { HaccpPeopleRepository } from "./HaccpPeopleRepository";
export type { HaccpReviewsRepository } from "./HaccpReviewsRepository";
export type { HaccpAnnualReviewRepository } from "./HaccpAnnualReviewRepository";
// F-19 PR7 — Cluster E reporting hexagon.
export type { HaccpReportingRepository } from "./HaccpReportingRepository";
export type {
  SpreadsheetExporter,
  SheetSpec,
  SheetCell,
} from "./SpreadsheetExporter";
// F-19 PR9a — Cluster F "docs & lookups" ports (handbook + suppliers + lookups).
export type { HaccpHandbookRepository } from "./HaccpHandbookRepository";
export type { HaccpSuppliersRepository } from "./HaccpSuppliersRepository";
export type { HaccpLookupsRepository } from "./HaccpLookupsRepository";
// F-25 — HACCP overdue-alarm cron hexagon: the push-sender + the two table
// sockets (push_subscriptions + alarm_sessions). Pure interfaces; their owned
// types travel with them.
export type {
  PushSender,
  PushPayload,
  PushSubscription,
} from "./PushSender";
export type {
  PushSubscriptionsRepository,
  PushSubscriptionRow,
} from "./PushSubscriptionsRepository";
export type {
  AlarmSessionsRepository,
  ActiveAlarmSession,
} from "./AlarmSessionsRepository";
// F-26 — LocalCache port: the client-side offline store socket (IndexedDB).
// The four owned offline types travel with it. Pure interfaces; no vendor.
export type {
  LocalCache,
  QueuedRecord,
  LocalCustomer,
  LocalProduct,
  SyncMeta,
} from "./LocalCache";
// F-PROD-04 Pass 2a — Printer transport port: the client-side "get a label onto
// paper" socket. Owned types travel with it. Pure interfaces; no vendor.
export type {
  Printer,
  DeliveryLabelInput,
  MinceLabelInput,
  LabelWidth,
  PrintErrorKind,
} from "./Printer";
