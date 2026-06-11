/**
 * lib/adapters/fake/UsersRepository.ts
 *
 * In-memory implementation of `UsersRepository`
 * (lib/ports/UsersRepository.ts). No Supabase SDK import — pure
 * JavaScript Map storage of DOMAIN types.
 *
 * Boundary discipline (ADR-0002 line 27):
 *   Same as the Fake Customers adapter. The store is
 *   `Map<string, UserSummary>` — no row shape, no vendor imports.
 *
 * Construction:
 *   - `createFakeUsersRepository(seed?)` factory — tests pass an
 *     optional array of pre-seeded users.
 *   - `fakeUsersRepository` singleton — starts empty; exists only for
 *     symmetry with the Supabase barrel.
 */

import type { UserSummary } from "@/lib/domain";
import type { UsersRepository } from "@/lib/ports";

export function createFakeUsersRepository(
  seed?: readonly UserSummary[],
): UsersRepository {
  const store = new Map<string, UserSummary>();
  for (const u of seed ?? []) store.set(u.id, u);
  return {
    async findUserById(id: string): Promise<UserSummary | null> {
      return store.get(id) ?? null;
    },
  };
}

export const fakeUsersRepository: UsersRepository = createFakeUsersRepository();
