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
} from "@/lib/adapters/supabase";

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
