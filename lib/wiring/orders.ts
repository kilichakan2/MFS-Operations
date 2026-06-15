/**
 * lib/wiring/orders.ts — composition root for the Orders domain (F-TD-11)
 *
 * The ONE file where the Orders domain's abstract ports are bolted to
 * concrete vendor adapters. This is deliberately the only business-layer
 * file allowed to import from `@/lib/adapters/*` — everything in
 * `lib/services/**` and `lib/usecases/**` depends on ports alone
 * (ADR-0002), enforced by the `no-restricted-imports` override in
 * `.eslintrc.json` and pinned by
 * `tests/unit/lint/no-adapter-imports.test.ts`.
 *
 * Rip-out contract (CLAUDE.md acceptance test): swapping the database
 * vendor for Orders = one new adapter folder (`lib/adapters/<vendor>/`)
 * + edits to THIS file. Nothing else changes.
 *
 * This file is a parts list, not logic: no decisions, no I/O at module
 * load beyond what the adapter singletons already do. The three
 * use-cases share the single `ordersService` instance (same object
 * graph as the pre-F-TD-11 per-file singletons). It is deliberately
 * shallow — do not deepen it.
 */
import { createOrdersService, type OrdersService } from "@/lib/services";
import {
  createPickingListUsecase,
  type PickingListUsecase,
} from "@/lib/usecases/pickingList";
import {
  createKdsQueueUsecase,
  type KdsQueueUsecase,
} from "@/lib/usecases/kdsQueue";
import {
  createKdsLineDoneUsecase,
  type KdsLineDoneUsecase,
} from "@/lib/usecases/kdsLineDone";
import {
  supabaseOrdersRepository,
  supabaseCustomersRepository,
  supabaseProductsRepository,
  supabaseUsersRepository,
  createSupabaseOrdersRepository,
  createSupabaseCustomersRepository,
  createSupabaseProductsRepository,
  createSupabaseUsersRepository,
  authenticatedClientForCaller,
} from "@/lib/adapters/supabase";
import { dbTokenMinter } from "@/lib/wiring/dbToken";

export const ordersService: OrdersService = createOrdersService({
  orders: supabaseOrdersRepository,
  customers: supabaseCustomersRepository,
  products: supabaseProductsRepository,
});

export const pickingListUsecase: PickingListUsecase = createPickingListUsecase({
  ordersService,
  products: supabaseProductsRepository,
  users: supabaseUsersRepository,
});

export const kdsQueueUsecase: KdsQueueUsecase = createKdsQueueUsecase({
  ordersService,
  products: supabaseProductsRepository,
});

export const kdsLineDoneUsecase: KdsLineDoneUsecase = createKdsLineDoneUsecase({
  ordersService,
  users: supabaseUsersRepository,
});

// ─── Per-request authenticated composition (F-RLS-04a) ──────────
//
// The pre-wired singletons above use the SERVICE-ROLE client (master key —
// bypasses RLS) and STAY: they remain the one-line rollback parachute and are
// still used by the KDS use-cases and the cron. The factories below build a
// fresh Orders graph bound to ONE caller, reaching the DB as the Postgres
// `authenticated` role so the GUC-based RLS policies (F-RLS-03 bridge) fire.
//
// Per-request — NEVER memoize: the minted token is per-caller, and a memoized
// client would leak one caller's identity to another (Risk R4). Each call
// mints a fresh token and builds a fresh client.
//
// Hexagonal (ADR-0002): the vendor `SupabaseClient` is constructed and
// consumed entirely inside this wiring file; the route never sees it — it
// receives a ready OrdersService / PickingListUsecase built from ports.

/** Build an OrdersService bound to ONE caller, reaching the DB as the
 *  Postgres `authenticated` role so RLS fires. Per-request — never memoize. */
export async function ordersServiceForCaller(
  callerUserId: string,
): Promise<OrdersService> {
  const token = await dbTokenMinter.mint({ userId: callerUserId });
  const client = authenticatedClientForCaller({ token });
  return createOrdersService({
    orders: createSupabaseOrdersRepository(client),
    customers: createSupabaseCustomersRepository(client),
    products: createSupabaseProductsRepository(client),
  });
}

/** Picking-list use-case bound to ONE caller (composes the authed
 *  OrdersService). Per-request — never memoize. */
export async function pickingListUsecaseForCaller(
  callerUserId: string,
): Promise<PickingListUsecase> {
  const token = await dbTokenMinter.mint({ userId: callerUserId });
  const client = authenticatedClientForCaller({ token });
  const callerOrdersService = createOrdersService({
    orders: createSupabaseOrdersRepository(client),
    customers: createSupabaseCustomersRepository(client),
    products: createSupabaseProductsRepository(client),
  });
  return createPickingListUsecase({
    ordersService: callerOrdersService,
    products: createSupabaseProductsRepository(client),
    users: createSupabaseUsersRepository(client),
  });
}
