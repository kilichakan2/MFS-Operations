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
export type { UsersRepository } from "./UsersRepository";
export type { SessionTokens } from "./SessionTokens";
