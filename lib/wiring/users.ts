/**
 * lib/wiring/users.ts — composition root for the Users domain (F-13 PR1)
 *
 * The ONE file where the Users domain's abstract ports are bolted to
 * concrete vendor adapters. Like `lib/wiring/orders.ts`, this is one of
 * the only business-layer files allowed to import from `@/lib/adapters/*`
 * — everything in `lib/services/**` and `lib/usecases/**` depends on
 * ports alone (ADR-0002), enforced by the `no-restricted-imports`
 * override in `.eslintrc.json` and pinned by
 * `tests/unit/lint/no-adapter-imports.test.ts`.
 *
 * Rip-out contract (CLAUDE.md acceptance test): swapping the database
 * vendor for Users = one new adapter folder (`lib/adapters/<vendor>/`)
 * + edits to THIS file. `UsersService` and `lib/domain` are untouched.
 *
 * This file is a parts list, not logic: no decisions, no I/O at module
 * load beyond what the adapter singletons already do. It composes the
 * SERVICE-ROLE singleton — the same security posture the seven
 * user-touching routes use today (service-role key, RLS bypassed). PR1
 * is introduce-only: nothing imports `usersService` in production yet
 * (PR2/PR3 re-point the routes).
 */
import { createUsersService, type UsersService } from "@/lib/services";
import { supabaseUsersRepository } from "@/lib/adapters/supabase";
import { passwordHasher } from "@/lib/wiring/password";

export const usersService: UsersService = createUsersService({
  users: supabaseUsersRepository,
  passwordHasher,
});

// ─── Per-request authenticated composition (F-RLS-04b — NOT YET) ────
//
// SEAM (do not build in PR1). When F-RLS-04b flips Users onto RLS, this
// is where the per-caller authenticated factory lands — exactly the
// shape `lib/wiring/orders.ts` already carries for Orders (F-RLS-04a):
//
//   export async function usersServiceForCaller(
//     callerUserId: string,
//   ): Promise<UsersService> {
//     const token  = await dbTokenMinter.mint({ userId: callerUserId })
//     const client = authenticatedClientForCaller({ token })
//     return createUsersService({
//       users:          createSupabaseUsersRepository(client),
//       passwordHasher,
//     })
//   }
//
// Per-request — NEVER memoize: the minted token is per-caller, and a
// memoized client would leak one caller's identity to another. The
// service-role singleton above STAYS as the one-line rollback parachute
// and for paths that must bypass RLS (e.g. login/kds-pin reading another
// user's credential, admin user management). Until F-RLS-04b lands,
// `usersService` (service-role) is the only wiring, matching today's
// routes byte-for-byte.
