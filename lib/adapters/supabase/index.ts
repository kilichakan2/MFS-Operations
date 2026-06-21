/**
 * lib/adapters/supabase/index.ts
 *
 * Barrel re-export for the Supabase adapter package. Import surface:
 *   import {
 *     supabaseOrdersRepository,
 *     supabaseCustomersRepository,
 *     supabaseProductsRepository,
 *     createSupabaseOrdersRepository,
 *     createSupabaseCustomersRepository,
 *     createSupabaseProductsRepository,
 *   } from '@/lib/adapters/supabase'
 *
 * Both factories and pre-wired singletons are exported. App code
 * (F-07 service, F-08 routes) imports the singletons. Tests import
 * the factories with a test-scoped client.
 *
 * This file does NOT re-export `@supabase/supabase-js` types — vendor
 * types stop at each adapter file per ADR-0002 line 27.
 */

export {
  createSupabaseOrdersRepository,
  supabaseOrdersRepository,
} from "./OrdersRepository";
export {
  createSupabaseCustomersRepository,
  supabaseCustomersRepository,
} from "./CustomersRepository";
export {
  createSupabaseProductsRepository,
  supabaseProductsRepository,
} from "./ProductsRepository";
export {
  createSupabaseUsersRepository,
  supabaseUsersRepository,
} from "./UsersRepository";
export {
  createSupabaseRoutesRepository,
  supabaseRoutesRepository,
} from "./RoutesRepository";
export {
  createSupabasePricingRepository,
  supabasePricingRepository,
} from "./PricingRepository";
export {
  createSupabaseCashRepository,
  supabaseCashRepository,
} from "./CashRepository";
export {
  createSupabaseAttachmentStorage,
  supabaseAttachmentStorage,
} from "./AttachmentStorage";
export {
  createSupabaseComplaintsRepository,
  supabaseComplaintsRepository,
} from "./ComplaintsRepository";
export {
  createSupabaseComplimentsRepository,
  supabaseComplimentsRepository,
} from "./ComplimentsRepository";
export {
  createSupabaseVisitsRepository,
  supabaseVisitsRepository,
} from "./VisitsRepository";
export {
  authenticatedClientForCaller,
  requireServiceRole,
} from "./authenticatedClient";
