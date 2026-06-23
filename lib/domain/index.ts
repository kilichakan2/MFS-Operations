/**
 * lib/domain/index.ts
 *
 * Barrel re-export for the domain layer. Import surface for callers:
 *   import { Order, Customer, Product } from '@/lib/domain'
 *
 * Re-exports types only — no runtime values, no factories. The domain
 * layer is pure description.
 */
export type {
  Order,
  OrderLine,
  OrderState,
  OrderUom,
  OrderFilter,
  OrderPatch,
  CreateOrderInput,
  CreateOrderLineInput,
} from "./Order";
export type { Customer } from "./Customer";
export type { Product } from "./Product";
export type {
  Route,
  RouteStop,
  RouteWithStops,
  RouteSummary,
  RoutePerson,
  StopCustomer,
  StopInput,
  CreateRouteInput,
  SaveRouteInput,
  CreateRoutePersist,
  SaveRoutePersist,
  CreatedRoute,
  RouteStatusRow,
  RouteStatus,
  RouteEndPoint,
  StopPriority,
} from "./Route";
export type {
  AgreementStatus,
  PriceUnit,
  PriceLine,
  PriceAgreement,
  PriceAgreementWithLines,
  CreateLineInput,
  CreateAgreementInput,
  UpdateAgreementInput,
  UpdateLineInput,
  CreatedAgreement,
  PatchedAgreement,
} from "./Pricing";
export type {
  UserSummary,
  UserCredential,
  AuthType,
  CreateUserInput,
  UpdateUserInput,
  CreateUserPersist,
  UpdateUserPersist,
} from "./User";
// Role: the canonical staff-role union (ARCH-FU-01 moved it here from
// lib/observability/Caller.ts). The type is re-exported here; the runtime
// mirror + predicate are value exports below.
export type { Role } from "./Role";
export { KNOWN_ROLES, isKnownRole } from "./Role";
export type { SessionClaims } from "./Session";
export type {
  CustomerCleanRow,
  ProductCleanRow,
  FlaggedRow,
  CustomerExtraction,
  ProductExtraction,
} from "./Import";
export type {
  CashEntryType,
  ChequeStatusFilter,
  NamedRef,
  CashMonth,
  CashEntry,
  ChequeRecord,
  CashMonthSummary,
  CreateMonthInput,
  CreateEntryInput,
  UpdateEntryInput,
  CreateChequeInput,
  UpdateChequeInput,
  ChequeListFilter,
  MonthExistsProbe,
} from "./Cash";
export type {
  ComplaintCategory,
  ComplaintReceivedVia,
  ComplaintStatus,
  ComplaintNote,
  Complaint,
  ComplaintDetail,
  CreateComplaintInput,
  CreatedComplaint,
  ResolveComplaintInput,
  ComplaintEmailContext,
  CreateNoteInput,
  CreatedNote,
} from "./Complaint";
export type {
  Compliment,
  ComplimentRecipient,
  CreateComplimentInput,
} from "./Compliment";
export type {
  VisitType,
  VisitOutcome,
  PipelineStatus,
  VisitNote,
  Visit,
  VisitDetail,
  CreateVisitInput,
  CreatedVisit,
  ProspectLocation,
  UpdatePipelineStatusInput,
  CreateVisitNoteInput,
  UpdateVisitNoteInput,
  AdminVisitFilter,
} from "./Visit";
export { VALID_PIPELINE_STATUSES } from "./Visit";
export type {
  // shared
  HaccpUserRef,
  CAPayload,
  // delivery
  DeliveryRow,
  DeliverySupplierRow,
  DeliveryListResult,
  DeliveryRange,
  CreateDeliveryInput,
  DeliverySupplier,
  DeliveryPersist,
  // cold-storage
  ColdStorageUnit,
  ColdStorageReading,
  ColdStorageListResult,
  ColdStorageReadingInput,
  CreateColdStorageReadingsInput,
  ColdStoragePersist,
  ColdStorageInsertedRow,
  // calibration
  CalibrationRecord,
  CreateCalibrationCertifiedInput,
  CreateCalibrationManualInput,
  CalibrationCertifiedPersist,
  CalibrationManualPersist,
  // cleaning
  CleaningEntry,
  CreateCleaningInput,
  CleaningPersist,
  // process-room
  ProcessingTempRow,
  DailyDiaryRow,
  ProcessRoomListResult,
  CreateProcessingTempInput,
  CreateDailyDiaryInput,
  ProcessingTempPersist,
  DailyDiaryPersist,
  // mince-prep
  MinceLogRow,
  MeatPrepLogRow,
  TimeSeparationRow,
  MincePrepDeliveryRow,
  MinceBatchSummary,
  MincePrepListResult,
  CreateMinceInput,
  CreateMeatPrepInput,
  CreateTimeSeparationInput,
  MincePersist,
  MeatPrepPersist,
  TimeSeparationPersist,
  // product-return
  ReturnRow,
  CreateReturnInput,
  ReturnPersist,
} from "./HaccpDailyCheck";
export type {
  HaccpCASourceTable,
  CorrectiveActionInsert,
  CANameRef,
  CorrectiveActionQueueRow,
  CorrectiveActionResolvedRow,
  CorrectiveActionQueue,
} from "./HaccpCorrectiveAction";
export type {
  // allergen-assessment
  AllergenAssessmentRow,
  AllergenAssessmentListResult,
  CreateAllergenAssessmentInput,
  AllergenAssessmentPersist,
  // allergen monthly-reviews
  MonthlyReviewRow,
  MonthlyReviewDeliveryRow,
  RunMonthlyReviewInput,
  MonthlyReviewPersist,
  MonthlyReviewResult,
  // food-defence
  FoodDefenceRow,
  FoodDefenceListResult,
  CreateFoodDefenceInput,
  FoodDefencePersist,
  // food-fraud
  FoodFraudRow,
  FoodFraudListResult,
  CreateFoodFraudInput,
  FoodFraudPersist,
  // product-specs
  ProductSpecRow,
  ProductSpecWithReviewDue,
  ProductSpecListResult,
  CreateProductSpecInput,
  ProductSpecPersist,
} from "./HaccpAssessment";
// F-19 PR4 — Cluster C training hexagon (staff + allergen training).
export type {
  StaffTrainingRow,
  CreateStaffTrainingInput,
  StaffTrainingPersist,
  AllergenTrainingRow,
  CreateAllergenTrainingInput,
  AllergenTrainingPersist,
  TrainingListResult,
} from "./HaccpTraining";
// F-19 PR4 — Cluster C people / fitness-to-work hexagon (haccp_health_records,
// shared by people + the public visitor kiosk). NOTE: `HealthRecordUserRef` is
// kept module-local in HaccpPeople.ts (NOT re-exported) to avoid colliding with
// `HaccpUserRef` from HaccpDailyCheck.ts above (R11).
export type {
  HealthRecordRow,
  HealthRecordsListResult,
  CreateNewStaffDeclarationInput,
  CreateReturnToWorkInput,
  CreateVisitorInput,
  HealthRecordPersist,
} from "./HaccpPeople";
// F-19 PR5 — Cluster D reviews hexagon (weekly + monthly reviews + the
// corrective-action side-effect). NOTE: `ReviewUserRef` is kept module-local in
// HaccpReviews.ts (NOT re-exported) to avoid colliding with `HaccpUserRef` /
// `HealthRecordUserRef` above. The `Review*` prefix avoids the existing
// `MonthlyReviewRow` / `MonthlyReviewPersist` (the Cluster B allergen monthly
// review — a DIFFERENT table) in this barrel.
export type {
  ReviewWeeklyRow,
  WeeklyAssessmentItem,
  CreateReviewWeeklyInput,
  ReviewWeeklyPersist,
  ReviewMonthlyRow,
  MonthlySystemItem,
  CreateReviewMonthlyInput,
  ReviewMonthlyPersist,
  ReviewCorrectiveActionInsert,
  ReviewsListResult,
} from "./HaccpReviews";
// F-19 PR5 — Cluster D annual-review hexagon (haccp_annual_reviews — the SALSA
// 3.1 draft/lock/sign-off lifecycle). `AnnualReviewUserRef` is kept module-local
// in HaccpAnnualReview.ts (NOT re-exported) for the same collision reason.
export type {
  AnnualReviewJoin,
  AnnualReviewRow,
  CreateAnnualReviewInput,
  AnnualReviewCreatePersist,
  UpdateAnnualReviewInput,
  AnnualReviewCurrent,
  AnnualReviewSignOffPersist,
  AnnualReviewUpdatePersist,
  AnnualReviewListResult,
} from "./HaccpAnnualReview";
