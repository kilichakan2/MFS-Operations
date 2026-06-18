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
