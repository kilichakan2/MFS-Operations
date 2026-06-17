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
import {
  supabaseUsersRepository,
  createSupabaseUsersRepository,
  authenticatedClientForCaller,
} from "@/lib/adapters/supabase";
import { dbTokenMinter } from "@/lib/wiring/dbToken";
import { passwordHasher } from "@/lib/wiring/password";

export const usersService: UsersService = createUsersService({
  users: supabaseUsersRepository,
  passwordHasher,
});

// ─── Per-request authenticated composition (F-RLS-04b) ──────────────
//
// The pre-wired `usersService` singleton above uses the SERVICE-ROLE client
// (master key — bypasses RLS) and STAYS: it is the one-line rollback
// parachute and the engine for the 5 public/pre-auth routes (login, kds-pin,
// team, haccp-team, auth-type) that run before any session exists.
//
// The factory below builds a fresh Users graph bound to ONE caller, reaching
// the DB as the Postgres `authenticated` role so the GUC-based RLS policies
// (F-RLS-03 bridge + the users_insert/update/delete policies) fire. It mirrors
// `ordersServiceForCaller` in `lib/wiring/orders.ts` (F-RLS-04a) exactly.
//
// Per-request — NEVER memoize: the minted token is per-caller, and a memoized
// client would leak one admin's identity to another. Each call mints a fresh
// token and builds a fresh client.
//
// Hexagonal (ADR-0002): the vendor `SupabaseClient` is constructed and
// consumed entirely inside this wiring file; the route never sees it — it
// receives a ready UsersService built from ports.

/** Build a UsersService bound to ONE caller, reaching the DB as the Postgres
 *  `authenticated` role so RLS fires. Per-request — never memoize. */
export async function usersServiceForCaller(
  callerUserId: string,
): Promise<UsersService> {
  const token = await dbTokenMinter.mint({ userId: callerUserId });
  const client = authenticatedClientForCaller({ token });
  return createUsersService({
    users: createSupabaseUsersRepository(client),
    passwordHasher,
  });
}
