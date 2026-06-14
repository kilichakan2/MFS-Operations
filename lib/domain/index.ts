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
export type { UserSummary } from "./User";
export type { SessionClaims } from "./Session";
export type {
  CustomerCleanRow,
  ProductCleanRow,
  FlaggedRow,
  CustomerExtraction,
  ProductExtraction,
} from "./Import";
