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
