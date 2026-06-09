/**
 * lib/services/index.ts
 *
 * Barrel re-export for the services package. Import surface:
 *   import { ordersService, createOrdersService, type OrdersService }
 *     from '@/lib/services'
 *
 * Both the factory and the pre-wired singleton are exported. F-08
 * routes import the singleton. Tests import the factory.
 *
 * This file mirrors `lib/adapters/supabase/index.ts` and
 * `lib/adapters/fake/index.ts` for symmetry — services have the same
 * "factory + singleton" surface that adapters do (one place the
 * default wiring lives, easy to override in tests / future
 * per-request scenarios).
 */
export {
  createOrdersService,
  ordersService,
  type OrdersService,
  type OrdersServiceRepos,
} from "./OrdersService";
